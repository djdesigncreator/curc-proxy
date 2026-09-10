/* ============================================================
   CURC — container proxy
   versao: curc-4
   Plataforma EAD marketplace para o mercado mocambicano.

   Novidades desta versao:
     - POST /progress   grava os segundos vistos de uma aula e
                        recalcula a percentagem da inscricao
     - POST /lesson     devolve uma aula com o conteudo, ja com
                        a verificacao de quem tem direito a ver
     - POST /review     avaliar o curso com estrelas, uma por aluno
     - POST /my-reviews  o que este aluno ja avaliou

   Da versao curc-3:
     - variaveis de ambiente limpas ao arrancar (espacos, aspas,
       https:// a mais, barras no fim)
     - todos os fetch passam por buscar(), que mostra a causa real
       em vez do inutil "fetch failed"
     - rota POST /diag-storage que testa mesmo o Bunny Storage
       e o Bunny Stream, e diz onde e que parte

   Nota sobre o CDN_HOST: o caminho publico da Bunny inclui o nome
   da zona de storage. Para a zona curc, CDN_HOST = curc.b-cdn.net/curc

   Sem dependencias externas. Corre com node >= 18.
   ============================================================ */

const http = require('http');
const crypto = require('crypto');
const dns = require('dns').promises;

const VERSAO = 'curc-4';
const PORTA = process.env.PORT || 3000;

/* ============================================================
   0. LIMPEZA DAS VARIAVEIS DE AMBIENTE
   ============================================================ */

/* Tira espacos, quebras de linha e aspas que ficam agarradas
   quando se cola o valor no painel da Bunny. */

function limparValor(valor) {
  return String(valor === undefined || valor === null ? '' : valor)
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .trim();
}

/* Para nomes de maquina: tira o esquema e a barra do fim.
   storage.bunnycdn.com  ·  nao  https://storage.bunnycdn.com/ */

function limparHost(valor) {
  return limparValor(valor)
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');
}

/* Para enderecos completos: mantem o esquema, tira a barra do fim. */

function limparUrl(valor) {
  return limparValor(valor).replace(/\/+$/, '');
}

/* ---------- variaveis de ambiente ---------- */

const BUBBLE_BASE = limparUrl(process.env.BUBBLE_BASE);
const BUBBLE_TOKEN = limparValor(process.env.BUBBLE_TOKEN);

const MOZ_WALLET = limparValor(process.env.MOZ_WALLET);
const MOPAY_BASE = limparUrl(process.env.MOPAY_BASE) || 'https://mozpayment.co.mz/api/1.1/wf';

const COMISSAO_PCT = Number(limparValor(process.env.COMISSAO_PCT) || 15);

const RESEND_KEY = limparValor(process.env.RESEND_KEY);
const MAIL_FROM = limparValor(process.env.MAIL_FROM) || 'CURC <noreply@curc.co.mz>';

const APP_URL = limparUrl(process.env.APP_URL);
const UPLOAD_SECRET = limparValor(process.env.UPLOAD_SECRET);

/* Bunny Storage — capas dos cursos, fotos e anexos */
const STORAGE_ZONE = limparValor(process.env.STORAGE_ZONE);
const STORAGE_PASSWORD = limparValor(process.env.STORAGE_PASSWORD);
const STORAGE_HOST = limparHost(process.env.STORAGE_HOST) || 'storage.bunnycdn.com';
const CDN_HOST = limparHost(process.env.CDN_HOST);

/* Bunny Stream — videos das aulas e de introducao */
const STREAM_LIBRARY = limparValor(process.env.STREAM_LIBRARY);
const STREAM_KEY = limparValor(process.env.STREAM_KEY);
const STREAM_CDN = limparHost(process.env.STREAM_CDN);

/* ---------- nomes dos data types no Bubble ---------- */
/* O Bubble aceita o nome do tipo em minusculas, sem espacos. */

const T = {
  user: 'user',
  categoria: 'category',
  curso: 'course',
  modulo: 'module',
  aula: 'lesson',
  inscricao: 'enrollment',
  progresso: 'progress',
  live: 'live',
  pagamento: 'payment',
  cartaoPendente: 'card_payment_pending',
  levantamento: 'payout',
  avaliacao: 'review',
  duvida: 'question',
  cupao: 'coupon',
  certificado: 'certificate'
};

/* ============================================================
   1. UTILITARIOS
   ============================================================ */

function agora() {
  return new Date().toISOString();
}

function log(...args) {
  console.log('[' + agora() + ']', ...args);
}

function responder(res, codigo, corpo) {
  const texto = JSON.stringify(corpo);
  res.writeHead(codigo, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(texto),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Cache-Control': 'no-store'
  });
  res.end(texto);
}

function ok(res, dados) {
  responder(res, 200, Object.assign({ ok: true }, dados || {}));
}

function erro(res, mensagem, codigo) {
  responder(res, codigo || 400, { ok: false, erro: mensagem });
}

function lerCorpo(req, limiteMB) {
  const limite = (limiteMB || 2) * 1024 * 1024;
  return new Promise((resolve, reject) => {
    let bruto = '';
    let tamanho = 0;
    req.on('data', function (pedaco) {
      tamanho += pedaco.length;
      if (tamanho > limite) {
        reject(new Error('corpo demasiado grande'));
        req.destroy();
        return;
      }
      bruto += pedaco;
    });
    req.on('end', function () {
      if (!bruto) { resolve({}); return; }
      try { resolve(JSON.parse(bruto)); }
      catch (e) { reject(new Error('JSON invalido')); }
    });
    req.on('error', reject);
  });
}

function texto(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor).trim();
}

function numero(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

function slugificar(valor) {
  return texto(valor)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function codigoAleatorio(tamanho) {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let saida = '';
  const bytes = crypto.randomBytes(tamanho);
  for (let i = 0; i < tamanho; i++) saida += alfabeto[bytes[i] % alfabeto.length];
  return saida;
}

function referencia(prefixo) {
  return prefixo + '-' + Date.now() + '-' + codigoAleatorio(5);
}

/* ---------- causa real de um erro de rede ---------- */

/* O fetch do Node atira sempre "fetch failed" e esconde o motivo
   dentro de error.cause. Isto desenterra-o. */

function causaDe(e) {
  if (!e) return 'desconhecida';
  const causa = e.cause;
  if (!causa) return e.message || String(e);
  const codigo = causa.code ? String(causa.code) : '';
  const msg = causa.message ? String(causa.message) : '';
  if (codigo && msg) return codigo + ' — ' + msg;
  return codigo || msg || String(causa);
}

/* Envolve o fetch para que qualquer falha de rede diga
   quem falhou, porque falhou e para onde ia. */

async function buscar(url, opcoes, quem) {
  try {
    return await fetch(url, opcoes);
  } catch (e) {
    const limpo = String(url).split('?')[0];
    throw new Error(
      (quem || 'ligacao') + ' falhou: ' + causaDe(e) + ' · destino: ' + limpo
    );
  }
}

/* ============================================================
   2. DATA API DO BUBBLE
   ============================================================ */

function cabecalhosBubble() {
  return {
    'Authorization': 'Bearer ' + BUBBLE_TOKEN,
    'Content-Type': 'application/json'
  };
}

async function bubbleListar(tipo, restricoes, opcoes) {
  const cfg = opcoes || {};
  const params = new URLSearchParams();
  if (restricoes && restricoes.length) {
    params.set('constraints', JSON.stringify(restricoes));
  }
  params.set('limit', String(cfg.limite || 100));
  params.set('cursor', String(cfg.cursor || 0));
  if (cfg.ordenarPor) {
    params.set('sort_field', cfg.ordenarPor);
    params.set('descending', cfg.descendente ? 'true' : 'false');
  }

  const url = BUBBLE_BASE + '/' + tipo + '?' + params.toString();
  const resposta = await buscar(url, { headers: cabecalhosBubble() }, 'Bubble listar ' + tipo);

  if (!resposta.ok) {
    const detalhe = await resposta.text();
    throw new Error('Bubble listar ' + tipo + ' falhou (' + resposta.status + '): ' + detalhe.slice(0, 300));
  }

  const dados = await resposta.json();
  const corpo = (dados && dados.response) || {};
  return {
    itens: corpo.results || [],
    restantes: numero(corpo.remaining),
    cursor: numero(corpo.cursor) + numero(corpo.count)
  };
}

async function bubbleTodos(tipo, restricoes, opcoes) {
  const cfg = opcoes || {};
  const maximo = cfg.maximo || 1000;
  let cursor = 0;
  let juntos = [];
  while (juntos.length < maximo) {
    const pagina = await bubbleListar(tipo, restricoes, {
      limite: 100,
      cursor: cursor,
      ordenarPor: cfg.ordenarPor,
      descendente: cfg.descendente
    });
    juntos = juntos.concat(pagina.itens);
    if (!pagina.restantes || !pagina.itens.length) break;
    cursor = pagina.cursor;
  }
  return juntos.slice(0, maximo);
}

async function bubblePorId(tipo, id) {
  if (!texto(id)) return null;
  const resposta = await buscar(
    BUBBLE_BASE + '/' + tipo + '/' + encodeURIComponent(id),
    { headers: cabecalhosBubble() },
    'Bubble ler ' + tipo
  );
  if (resposta.status === 404) return null;
  if (!resposta.ok) {
    const detalhe = await resposta.text();
    throw new Error('Bubble ler ' + tipo + ' falhou (' + resposta.status + '): ' + detalhe.slice(0, 300));
  }
  const dados = await resposta.json();
  return (dados && dados.response) || null;
}

async function bubbleCriar(tipo, objecto) {
  const resposta = await buscar(BUBBLE_BASE + '/' + tipo, {
    method: 'POST',
    headers: cabecalhosBubble(),
    body: JSON.stringify(objecto)
  }, 'Bubble criar ' + tipo);
  if (!resposta.ok) {
    const detalhe = await resposta.text();
    throw new Error('Bubble criar ' + tipo + ' falhou (' + resposta.status + '): ' + detalhe.slice(0, 300));
  }
  const dados = await resposta.json();
  return (dados && dados.id) || null;
}

async function bubbleActualizar(tipo, id, objecto) {
  const resposta = await buscar(BUBBLE_BASE + '/' + tipo + '/' + encodeURIComponent(id), {
    method: 'PATCH',
    headers: cabecalhosBubble(),
    body: JSON.stringify(objecto)
  }, 'Bubble actualizar ' + tipo);
  if (!resposta.ok) {
    const detalhe = await resposta.text();
    throw new Error('Bubble actualizar ' + tipo + ' falhou (' + resposta.status + '): ' + detalhe.slice(0, 300));
  }
  return true;
}

function restricao(campo, condicao, valor) {
  return { key: campo, constraint_type: condicao, value: valor };
}

/* ============================================================
   3. EMAIL (RESEND)
   ============================================================ */

async function enviarEmail(para, assunto, html) {
  if (!RESEND_KEY) {
    log('Resend sem chave — email nao enviado para', para);
    return false;
  }
  try {
    const resposta = await buscar('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + RESEND_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from: MAIL_FROM, to: [para], subject: assunto, html: html })
    }, 'Resend');
    if (!resposta.ok) {
      log('Resend recusou:', await resposta.text());
      return false;
    }
    return true;
  } catch (e) {
    log('Resend rebentou:', e.message);
    return false;
  }
}

function moldeCodigo(nome, codigo) {
  return `
<div style="font-family:Arial,Helvetica,sans-serif;background:#0A0E27;padding:32px">
  <div style="max-width:520px;margin:0 auto;background:#111633;border-radius:16px;padding:32px;color:#fff">
    <div style="font-size:26px;font-weight:800;letter-spacing:2px;color:#A855F7">CURC</div>
    <div style="font-size:12px;letter-spacing:3px;color:#7C8DB5;margin-top:4px">APRENDA SEM LIMITES</div>
    <h1 style="font-size:20px;margin:28px 0 8px">Ola ${nome || 'de novo'},</h1>
    <p style="color:#B9C3DE;line-height:1.6;margin:0 0 24px">
      Este e o seu codigo de confirmacao. Escreva-o na pagina para activar a conta.
    </p>
    <div style="background:#0A0E27;border:1px solid #2A3560;border-radius:12px;padding:20px;text-align:center">
      <div style="font-family:monospace;font-size:30px;letter-spacing:8px;color:#C084FC;font-weight:700">${codigo}</div>
    </div>
    <p style="color:#7C8DB5;font-size:13px;margin-top:24px">
      O codigo expira dentro de 30 minutos. Se nao foi voce que pediu, ignore este email.
    </p>
  </div>
</div>`;
}

/* ============================================================
   4. MOPAYMENT — M-PESA E E-MOLA
   ============================================================ */

/* A MoPayment devolve sempre HTTP 200. O resultado real esta no cod
   dentro do JSON — e nem sempre no mesmo sitio. Esta funcao procura
   em todos os campos onde ja o vimos aparecer. */

function lerRespostaMoPayment(dados) {
  if (!dados || typeof dados !== 'object') {
    return { sucesso: false, codigo: 0, mensagem: 'resposta vazia da MoPayment' };
  }

  const aninhado = (dados.response && typeof dados.response === 'object') ? dados.response : {};

  const candidatos = [
    dados.cod, dados.code, dados.codigo, dados.status_code,
    aninhado.cod, aninhado.code, aninhado.codigo, aninhado.status_code
  ];

  let codigo = 0;
  for (const valor of candidatos) {
    const n = Number(valor);
    if (Number.isFinite(n) && n > 0) { codigo = n; break; }
  }

  const estado = texto(dados.status || aninhado.status).toLowerCase();
  const sucesso = codigo === 200 || (codigo === 0 && estado === 'success');

  const mensagem = texto(
    dados.mensagem || dados.message || dados.detalhe ||
    aninhado.mensagem || aninhado.message || aninhado.detalhe ||
    (sucesso ? 'Pagamento processado' : 'Pagamento rejeitado')
  );

  const transacao = texto(
    dados.transacao || dados.transaction || dados.transaction_id ||
    aninhado.transacao || aninhado.transaction || ''
  );

  return { sucesso: sucesso, codigo: codigo || (sucesso ? 200 : 409), mensagem: mensagem, transacao: transacao };
}

function normalizarNumero(valor) {
  const so = texto(valor).replace(/\D/g, '');
  if (so.length === 12 && so.startsWith('258')) return so.slice(3);
  if (so.length === 9) return so;
  return so;
}

function operadoraDoNumero(numeroLimpo) {
  const prefixo = numeroLimpo.slice(0, 2);
  if (prefixo === '84' || prefixo === '85') return 'mpesa';
  if (prefixo === '86' || prefixo === '87') return 'emola';
  return '';
}

async function cobrarCarteira(metodo, numeroCliente, nomeCliente, valorMZN) {
  const caminho = metodo === 'emola'
    ? '/pagamentorotativoemola'
    : '/pagamentorotativompesa';

  const corpo = {
    carteira: MOZ_WALLET,
    numero: numeroCliente,
    cliente: nomeCliente || 'Cliente CURC',
    valor: String(Math.round(valorMZN))
  };

  let dados = null;
  let bruto = '';

  try {
    const resposta = await buscar(MOPAY_BASE + caminho, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo)
    }, 'MoPayment');
    bruto = await resposta.text();
    try { dados = JSON.parse(bruto); } catch (e) { dados = null; }
  } catch (e) {
    return {
      sucesso: false, codigo: 0,
      mensagem: 'Nao foi possivel falar com a MoPayment: ' + e.message,
      transacao: '', bruto: ''
    };
  }

  const resultado = lerRespostaMoPayment(dados);
  resultado.bruto = bruto.slice(0, 2000);
  return resultado;
}

/* ============================================================
   4B. BUNNY — STREAM E STORAGE
   ============================================================ */

/* Cria o registo do video no Bunny Stream e devolve o guid.
   O ficheiro em si sobe depois, do browser, por TUS. */

async function streamCriarVideo(titulo) {
  if (!STREAM_LIBRARY || !STREAM_KEY) {
    throw new Error('Bunny Stream nao esta configurado no container');
  }
  const resposta = await buscar('https://video.bunnycdn.com/library/' + STREAM_LIBRARY + '/videos', {
    method: 'POST',
    headers: { 'AccessKey': STREAM_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: texto(titulo).slice(0, 200) || 'Sem titulo' })
  }, 'Bunny Stream criar video');
  if (!resposta.ok) {
    throw new Error('Bunny Stream recusou criar o video (' + resposta.status + '): ' + (await resposta.text()).slice(0, 300));
  }
  const dados = await resposta.json();
  return texto(dados.guid);
}

/* Assinatura que o browser usa para subir por TUS.
   sha256(biblioteca + chave + validade + id do video) */

function streamAssinatura(idVideo, validade) {
  return crypto
    .createHash('sha256')
    .update(STREAM_LIBRARY + STREAM_KEY + validade + idVideo)
    .digest('hex');
}

async function streamEstado(idVideo) {
  const resposta = await buscar(
    'https://video.bunnycdn.com/library/' + STREAM_LIBRARY + '/videos/' + encodeURIComponent(idVideo),
    { headers: { 'AccessKey': STREAM_KEY } },
    'Bunny Stream estado'
  );
  if (!resposta.ok) return null;
  return await resposta.json();
}

async function streamApagarVideo(idVideo) {
  if (!idVideo || !STREAM_LIBRARY || !STREAM_KEY) return false;
  try {
    const resposta = await buscar(
      'https://video.bunnycdn.com/library/' + STREAM_LIBRARY + '/videos/' + encodeURIComponent(idVideo),
      { method: 'DELETE', headers: { 'AccessKey': STREAM_KEY } },
      'Bunny Stream apagar'
    );
    return resposta.ok;
  } catch (e) {
    log('Falhou apagar video', idVideo, e.message);
    return false;
  }
}

function urlPlayback(idVideo) {
  if (!idVideo || !STREAM_CDN) return '';
  return 'https://' + STREAM_CDN + '/' + idVideo + '/playlist.m3u8';
}

function urlMiniatura(idVideo) {
  if (!idVideo || !STREAM_CDN) return '';
  return 'https://' + STREAM_CDN + '/' + idVideo + '/thumbnail.jpg';
}

/* Envia bytes para o Bunny Storage e devolve o endereco publico. */

async function storageGuardar(caminho, bytes, tipoMime) {
  if (!STORAGE_ZONE) throw new Error('STORAGE_ZONE em falta no container');
  if (!STORAGE_PASSWORD) throw new Error('STORAGE_PASSWORD em falta no container');
  if (!CDN_HOST) throw new Error('CDN_HOST em falta no container');

  const url = 'https://' + STORAGE_HOST + '/' + STORAGE_ZONE + '/' + caminho;

  const resposta = await buscar(url, {
    method: 'PUT',
    headers: {
      'AccessKey': STORAGE_PASSWORD,
      'Content-Type': tipoMime || 'application/octet-stream'
    },
    body: bytes
  }, 'Bunny Storage guardar');

  if (!resposta.ok) {
    const detalhe = (await resposta.text()).slice(0, 200);
    if (resposta.status === 401) {
      throw new Error('Bunny Storage recusou a chave (401). Confirme a STORAGE_PASSWORD — tem de ser a password da zona curc, nao a chave da conta.');
    }
    throw new Error('Bunny Storage recusou (' + resposta.status + '): ' + detalhe);
  }

  return 'https://' + CDN_HOST + '/' + caminho;
}

async function storageApagar(caminho) {
  if (!caminho || !STORAGE_ZONE) return false;
  try {
    const resposta = await buscar('https://' + STORAGE_HOST + '/' + STORAGE_ZONE + '/' + caminho, {
      method: 'DELETE',
      headers: { 'AccessKey': STORAGE_PASSWORD }
    }, 'Bunny Storage apagar');
    return resposta.ok;
  } catch (e) {
    return false;
  }
}

const IMAGENS_ACEITES = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

/* ============================================================
   5. REGRAS DE NEGOCIO
   ============================================================ */

function precoEfectivo(curso) {
  if (curso['E Gratis']) return 0;
  const promo = numero(curso['Preco Promo MZN']);
  const base = numero(curso['Preco MZN']);
  if (promo > 0 && promo < base) return promo;
  return base;
}

function repartir(valorMZN) {
  const comissao = Math.round(valorMZN * (COMISSAO_PCT / 100));
  return { comissao: comissao, liquido: valorMZN - comissao };
}

async function inscricaoDe(idAluno, idCurso) {
  const encontradas = await bubbleTodos(T.inscricao, [
    restricao('Aluno', 'equals', idAluno),
    restricao('Curso', 'equals', idCurso)
  ], { maximo: 1 });
  return encontradas[0] || null;
}

async function criarInscricao(aluno, curso, origem, precoPago) {
  const jaTem = await inscricaoDe(aluno._id, curso._id);
  if (jaTem) return jaTem._id;

  const id = await bubbleCriar(T.inscricao, {
    'Aluno': aluno._id,
    'Curso': curso._id,
    'Formador': curso['Formador'],
    'Origem': origem,
    'Preco Pago MZN': precoPago,
    'Progresso Pct': 0,
    'Aulas Concluidas': 0,
    'Concluido': false,
    'Is Active': true
  });

  await bubbleActualizar(T.curso, curso._id, {
    'Total Alunos': numero(curso['Total Alunos']) + 1
  });

  return id;
}

async function creditarFormador(idFormador, liquido) {
  if (!idFormador || liquido <= 0) return;
  const formador = await bubblePorId(T.user, idFormador);
  if (!formador) return;
  await bubbleActualizar(T.user, idFormador, {
    'Saldo MZN': numero(formador['Saldo MZN']) + liquido,
    'Total Ganho MZN': numero(formador['Total Ganho MZN']) + liquido
  });
}

/* Confirma que o curso existe e que quem pede e mesmo o dono.
   Devolve o curso, ou lanca um erro com o motivo. */

async function cursoDoFormador(idDono, idCurso) {
  if (!idDono) throw new Error('owner em falta');
  if (!idCurso) throw new Error('curso em falta');

  const curso = await bubblePorId(T.curso, idCurso);
  if (!curso || curso['Is Deleted']) throw new Error('curso nao encontrado');
  if (texto(curso['Formador']) !== idDono) throw new Error('este curso nao e seu');

  return curso;
}

async function formadorActivo(idDono) {
  const utilizador = await bubblePorId(T.user, idDono);
  if (!utilizador) throw new Error('utilizador nao encontrado');
  if (!utilizador['Formador Aprovado']) throw new Error('a sua conta ainda nao e de formador');
  return utilizador;
}

/* Recalcula o total de aulas e a duracao a partir das aulas vivas. */

async function recontarCurso(idCurso) {
  const aulas = await bubbleTodos(T.aula, [
    restricao('Curso', 'equals', idCurso)
  ], { maximo: 1000 });

  const vivas = aulas.filter(function (a) { return !a['Is Deleted']; });
  const duracao = vivas.reduce(function (soma, a) { return soma + numero(a['Duracao Segundos']); }, 0);

  await bubbleActualizar(T.curso, idCurso, {
    'Total Aulas': vivas.length,
    'Duracao Segundos': duracao
  });

  return { aulas: vivas.length, duracao: duracao };
}

/* Conta as aulas vivas e as que este aluno ja concluiu.
   Nao grava nada — so devolve os numeros. */

async function contarProgresso(idAluno, idCurso) {
  const aulas = (await bubbleTodos(T.aula, [
    restricao('Curso', 'equals', idCurso)
  ], { maximo: 1000 })).filter(function (a) { return !a['Is Deleted']; });

  const vivas = {};
  aulas.forEach(function (a) { vivas[a._id] = true; });

  const progressos = await bubbleTodos(T.progresso, [
    restricao('Aluno', 'equals', idAluno),
    restricao('Curso', 'equals', idCurso)
  ], { maximo: 1000 });

  /* So contam as aulas que ainda existem. Se o formador apagar uma
     aula ja vista, a percentagem tem de descer, nao passar dos 100. */
  const concluidas = progressos.filter(function (p) {
    return p['Concluida'] && vivas[texto(p['Aula'])];
  }).length;

  const total = aulas.length;

  return {
    total: total,
    concluidas: concluidas,
    pct: total ? Math.round((concluidas / total) * 100) : 0
  };
}

/* Recalcula a media de estrelas de um curso a partir das avaliacoes vivas. */

async function recalcularEstrelas(idCurso) {
  const todas = (await bubbleTodos(T.avaliacao, [
    restricao('Curso', 'equals', idCurso)
  ], { maximo: 2000 })).filter(function (a) { return !a['Is Deleted']; });

  const soma = todas.reduce(function (s, a) { return s + numero(a['Estrelas']); }, 0);
  const media = todas.length ? Math.round((soma / todas.length) * 10) / 10 : 0;

  await bubbleActualizar(T.curso, idCurso, {
    'Media Estrelas': media,
    'Total Avaliacoes': todas.length
  });

  return { media: media, total: todas.length };
}

/* Confirma que este aluno pode mesmo ver o conteudo do curso.
   Devolve a inscricao, ou null se for o proprio formador. */

async function acessoAoCurso(idAluno, curso) {
  if (texto(curso['Formador']) === idAluno) return { dono: true, inscricao: null };

  const inscricao = await inscricaoDe(idAluno, curso._id);
  if (!inscricao || !inscricao['Is Active']) {
    throw new Error('nao esta inscrito neste curso');
  }
  return { dono: false, inscricao: inscricao };
}

function cursoPublico(curso) {
  return {
    id: curso._id,
    titulo: texto(curso['Titulo']),
    slug: texto(curso['Slug']),
    subtitulo: texto(curso['Subtitulo']),
    capa: texto(curso['Capa URL']),
    intro_playback: texto(curso['Intro Playback URL']),
    intro_thumb: texto(curso['Intro Thumbnail URL']),
    intro_duracao: numero(curso['Intro Duracao']),
    categoria: texto(curso['Categoria']),
    nivel: texto(curso['Nivel']),
    preco: numero(curso['Preco MZN']),
    preco_promo: numero(curso['Preco Promo MZN']),
    preco_final: precoEfectivo(curso),
    gratis: !!curso['E Gratis'],
    total_aulas: numero(curso['Total Aulas']),
    duracao: numero(curso['Duracao Segundos']),
    total_alunos: numero(curso['Total Alunos']),
    estrelas: numero(curso['Media Estrelas']),
    avaliacoes: numero(curso['Total Avaliacoes']),
    certificado: !!curso['Tem Certificado'],
    formador_id: texto(curso['Formador'])
  };
}

function formadorPublico(utilizador) {
  if (!utilizador) return null;
  return {
    id: utilizador._id,
    nome: texto(utilizador['Nome Completo']),
    foto: texto(utilizador['Foto URL']),
    bio: texto(utilizador['Bio']),
    total_cursos: numero(utilizador['Total Cursos']),
    total_alunos: numero(utilizador['Total Alunos'])
  };
}

/* ============================================================
   6. ROTAS
   ============================================================ */

const rotas = {};

/* ---------- estado ---------- */

rotas['GET /'] = async function (req, res) {
  ok(res, {
    servico: 'curc-proxy',
    versao: VERSAO,
    hora: agora(),
    bubble: BUBBLE_BASE ? 'configurado' : 'em falta',
    carteira: MOZ_WALLET ? 'configurada' : 'em falta',
    storage: (STORAGE_ZONE && STORAGE_PASSWORD && CDN_HOST) ? 'configurado' : 'em falta',
    stream: (STREAM_LIBRARY && STREAM_KEY && STREAM_CDN) ? 'configurado' : 'em falta',
    comissao_pct: COMISSAO_PCT
  });
};

/* ---------- diagnostico da ligacao ao Bubble ---------- */

rotas['POST /diag'] = async function (req, res, corpo) {
  if (texto(corpo.key) !== UPLOAD_SECRET || !UPLOAD_SECRET) {
    return erro(res, 'chave invalida', 403);
  }
  const relatorio = {};
  for (const nome of ['user', 'category', 'course', 'lesson', 'enrollment', 'payment']) {
    try {
      const pagina = await bubbleListar(nome, [], { limite: 1 });
      relatorio[nome] = 'ok (' + (pagina.itens.length + pagina.restantes) + ' registos)';
    } catch (e) {
      relatorio[nome] = 'FALHOU — ' + e.message;
    }
  }
  ok(res, { versao: VERSAO, tipos: relatorio });
};

/* ---------- diagnostico do Bunny Storage e Stream ---------- */

/* Nunca devolve a password. So o tamanho, o principio e o fim,
   que chega para perceber se foi cortada ou colada torta. */

function retrato(nome, valorBruto, valorLimpo) {
  const bruto = valorBruto === undefined || valorBruto === null ? '' : String(valorBruto);
  return {
    variavel: nome,
    definida: bruto.length > 0,
    tamanho_bruto: bruto.length,
    tamanho_limpo: valorLimpo.length,
    foi_limpo: bruto !== valorLimpo,
    tinha_espacos: /^\s|\s$/.test(bruto),
    tinha_aspas: /^["']|["']$/.test(bruto.trim()),
    tinha_esquema: /^https?:\/\//i.test(bruto.trim()),
    inicio: valorLimpo.slice(0, 4),
    fim: valorLimpo.length > 8 ? valorLimpo.slice(-4) : ''
  };
}

rotas['POST /diag-storage'] = async function (req, res, corpo) {
  if (texto(corpo.key) !== UPLOAD_SECRET || !UPLOAD_SECRET) {
    return erro(res, 'chave invalida', 403);
  }

  const relatorio = {
    versao: VERSAO,
    variaveis: [
      retrato('STORAGE_ZONE', process.env.STORAGE_ZONE, STORAGE_ZONE),
      retrato('STORAGE_PASSWORD', process.env.STORAGE_PASSWORD, STORAGE_PASSWORD),
      retrato('STORAGE_HOST', process.env.STORAGE_HOST, STORAGE_HOST),
      retrato('CDN_HOST', process.env.CDN_HOST, CDN_HOST),
      retrato('STREAM_LIBRARY', process.env.STREAM_LIBRARY, STREAM_LIBRARY),
      retrato('STREAM_KEY', process.env.STREAM_KEY, STREAM_KEY),
      retrato('STREAM_CDN', process.env.STREAM_CDN, STREAM_CDN)
    ],
    url_que_vai_ser_usado: 'https://' + STORAGE_HOST + '/' + STORAGE_ZONE + '/<ficheiro>',
    passos: {}
  };

  /* 1. o nome resolve? */
  try {
    const achado = await dns.lookup(STORAGE_HOST);
    relatorio.passos['1_dns'] = 'ok — ' + STORAGE_HOST + ' = ' + achado.address;
  } catch (e) {
    relatorio.passos['1_dns'] = 'FALHOU — ' + (e.code || e.message) +
      '. O container nao consegue resolver este nome. Confirme a STORAGE_HOST.';
    return ok(res, relatorio);
  }

  /* 2. escrever mesmo um ficheiro */
  const caminhoTeste = 'diagnostico/teste-' + Date.now() + '.txt';
  const urlTeste = 'https://' + STORAGE_HOST + '/' + STORAGE_ZONE + '/' + caminhoTeste;

  try {
    const resposta = await fetch(urlTeste, {
      method: 'PUT',
      headers: { 'AccessKey': STORAGE_PASSWORD, 'Content-Type': 'text/plain' },
      body: Buffer.from('curc diagnostico ' + agora())
    });
    const detalhe = (await resposta.text()).slice(0, 300);
    relatorio.passos['2_escrita'] = resposta.status + ' — ' + (detalhe || '(sem corpo)');

    if (resposta.status === 401) {
      relatorio.passos['2_leitura'] = 'a chave nao serve — use a Password da zona curc (FTP & API Access), nao a API Key da conta';
    }
    if (resposta.status === 404) {
      relatorio.passos['2_leitura'] = 'a zona "' + STORAGE_ZONE + '" nao existe neste host — confirme o nome e a regiao';
    }
  } catch (e) {
    relatorio.passos['2_escrita'] = 'REBENTOU — ' + causaDe(e);
    return ok(res, relatorio);
  }

  /* 3. ler de volta pelo CDN */
  if (CDN_HOST) {
    try {
      const resposta = await fetch('https://' + CDN_HOST + '/' + caminhoTeste);
      relatorio.passos['3_cdn'] = resposta.status + ' — https://' + CDN_HOST + '/' + caminhoTeste;
    } catch (e) {
      relatorio.passos['3_cdn'] = 'REBENTOU — ' + causaDe(e);
    }
  } else {
    relatorio.passos['3_cdn'] = 'CDN_HOST em falta — o upload ate podia funcionar, mas o URL devolvido ficava partido';
  }

  /* 4. limpar */
  try {
    await fetch(urlTeste, { method: 'DELETE', headers: { 'AccessKey': STORAGE_PASSWORD } });
    relatorio.passos['4_limpeza'] = 'ficheiro de teste apagado';
  } catch (e) {
    relatorio.passos['4_limpeza'] = 'ficou la o ficheiro de teste: ' + caminhoTeste;
  }

  /* 5. o Stream tambem */
  if (STREAM_LIBRARY && STREAM_KEY) {
    try {
      const resposta = await fetch(
        'https://video.bunnycdn.com/library/' + STREAM_LIBRARY + '/videos?page=1&itemsPerPage=1',
        { headers: { 'AccessKey': STREAM_KEY } }
      );
      relatorio.passos['5_stream'] = resposta.status === 200
        ? 'ok — biblioteca ' + STREAM_LIBRARY + ' responde'
        : resposta.status + ' — ' + (await resposta.text()).slice(0, 200);
    } catch (e) {
      relatorio.passos['5_stream'] = 'REBENTOU — ' + causaDe(e);
    }
  } else {
    relatorio.passos['5_stream'] = 'STREAM_LIBRARY ou STREAM_KEY em falta';
  }

  ok(res, relatorio);
};

/* ---------- contas ---------- */

rotas['POST /signup-code'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  if (!idDono) return erro(res, 'owner em falta');

  const utilizador = await bubblePorId(T.user, idDono);
  if (!utilizador) return erro(res, 'utilizador nao encontrado', 404);

  const email = texto(utilizador.authentication &&
    utilizador.authentication.email &&
    utilizador.authentication.email.email) || texto(utilizador.email);

  if (!email) return erro(res, 'este utilizador nao tem email');

  const codigo = codigoAleatorio(8);
  const expira = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  await bubbleActualizar(T.user, idDono, {
    'Token': codigo,
    'Token Confirmado': false,
    'Token Expires': expira
  });

  const enviado = await enviarEmail(
    email,
    'O seu codigo CURC: ' + codigo,
    moldeCodigo(texto(utilizador['Nome Completo']), codigo)
  );

  ok(res, { enviado: enviado, email: email });
};

rotas['POST /verify-code'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  const codigo = texto(corpo.code).toUpperCase();
  if (!idDono || !codigo) return erro(res, 'owner ou code em falta');

  const utilizador = await bubblePorId(T.user, idDono);
  if (!utilizador) return erro(res, 'utilizador nao encontrado', 404);

  if (utilizador['Token Confirmado']) return ok(res, { confirmado: true, ja: true });

  const guardado = texto(utilizador['Token']).toUpperCase();
  if (!guardado || guardado !== codigo) return erro(res, 'codigo errado');

  const expira = utilizador['Token Expires'];
  if (expira && new Date(expira).getTime() < Date.now()) {
    return erro(res, 'codigo expirado');
  }

  await bubbleActualizar(T.user, idDono, {
    'Token Confirmado': true,
    'Is Active': true,
    'Token': ''
  });

  ok(res, { confirmado: true });
};

rotas['POST /account'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  if (!idDono) return erro(res, 'owner em falta');

  const utilizador = await bubblePorId(T.user, idDono);
  if (!utilizador) return erro(res, 'utilizador nao encontrado', 404);

  const inscricoes = await bubbleTodos(T.inscricao, [
    restricao('Aluno', 'equals', idDono),
    restricao('Is Active', 'equals', true)
  ], { maximo: 500 });

  ok(res, {
    id: utilizador._id,
    nome: texto(utilizador['Nome Completo']),
    foto: texto(utilizador['Foto URL']),
    bio: texto(utilizador['Bio']),
    telefone: texto(utilizador['Telefone']),
    papel: texto(utilizador['Papel']) || 'Aluno',
    formador_aprovado: !!utilizador['Formador Aprovado'],
    confirmado: !!utilizador['Token Confirmado'],
    saldo: numero(utilizador['Saldo MZN']),
    total_ganho: numero(utilizador['Total Ganho MZN']),
    total_cursos: numero(utilizador['Total Cursos']),
    inscricoes: inscricoes.length,
    comissao_pct: COMISSAO_PCT
  });
};

/* ---------- catalogo ---------- */

rotas['POST /categories'] = async function (req, res) {
  const lista = await bubbleTodos(T.categoria, [
    restricao('Is Active', 'equals', true)
  ], { ordenarPor: 'Ordem', maximo: 100 });

  ok(res, {
    categorias: lista.map(function (c) {
      return {
        id: c._id,
        nome: texto(c['Nome']),
        slug: texto(c['Slug']),
        icone: texto(c['Icone'])
      };
    })
  });
};

rotas['POST /courses'] = async function (req, res, corpo) {
  const procura = texto(corpo.q).toLowerCase();
  const categoria = texto(corpo.categoria);
  const nivel = texto(corpo.nivel);
  const soGratis = corpo.gratis === true;
  const idFormador = texto(corpo.formador);
  const ordem = texto(corpo.ordem) || 'recentes';
  const pagina = Math.max(1, numero(corpo.pagina) || 1);
  const porPagina = Math.min(48, numero(corpo.por_pagina) || 12);

  const restricoes = [restricao('Estado', 'equals', 'Publicado')];
  if (categoria) restricoes.push(restricao('Categoria', 'equals', categoria));
  if (nivel) restricoes.push(restricao('Nivel', 'equals', nivel));
  if (soGratis) restricoes.push(restricao('E Gratis', 'equals', true));
  if (idFormador) restricoes.push(restricao('Formador', 'equals', idFormador));

  let lista = await bubbleTodos(T.curso, restricoes, { maximo: 500 });

  lista = lista.filter(function (c) { return !c['Is Deleted']; });

  if (procura) {
    lista = lista.filter(function (c) {
      const alvo = (texto(c['Titulo']) + ' ' + texto(c['Subtitulo']) + ' ' + texto(c['Descricao'])).toLowerCase();
      return alvo.indexOf(procura) !== -1;
    });
  }

  const ordenadores = {
    recentes: function (a, b) {
      return new Date(b['Publicado Data'] || b['Created Date'] || 0) -
             new Date(a['Publicado Data'] || a['Created Date'] || 0);
    },
    populares: function (a, b) { return numero(b['Total Alunos']) - numero(a['Total Alunos']); },
    estrelas: function (a, b) { return numero(b['Media Estrelas']) - numero(a['Media Estrelas']); },
    barato: function (a, b) { return precoEfectivo(a) - precoEfectivo(b); },
    caro: function (a, b) { return precoEfectivo(b) - precoEfectivo(a); }
  };
  lista.sort(ordenadores[ordem] || ordenadores.recentes);

  const total = lista.length;
  const inicio = (pagina - 1) * porPagina;
  const fatia = lista.slice(inicio, inicio + porPagina);

  const idsFormadores = Array.from(new Set(fatia.map(function (c) { return texto(c['Formador']); }).filter(Boolean)));
  const formadores = {};
  for (const id of idsFormadores) {
    const u = await bubblePorId(T.user, id);
    if (u) formadores[id] = formadorPublico(u);
  }

  ok(res, {
    total: total,
    pagina: pagina,
    paginas: Math.ceil(total / porPagina) || 1,
    cursos: fatia.map(function (c) {
      const publico = cursoPublico(c);
      publico.formador = formadores[publico.formador_id] || null;
      return publico;
    })
  });
};

rotas['POST /course'] = async function (req, res, corpo) {
  const idCurso = texto(corpo.curso);
  const idDono = texto(corpo.owner);
  if (!idCurso) return erro(res, 'curso em falta');

  const curso = await bubblePorId(T.curso, idCurso);
  if (!curso || curso['Is Deleted']) return erro(res, 'curso nao encontrado', 404);

  const eDono = idDono && texto(curso['Formador']) === idDono;
  if (texto(curso['Estado']) !== 'Publicado' && !eDono) {
    return erro(res, 'curso nao disponivel', 403);
  }

  let inscrito = false;
  if (idDono) {
    const inscricao = await inscricaoDe(idDono, idCurso);
    inscrito = !!(inscricao && inscricao['Is Active']);
  }
  const acessoTotal = inscrito || eDono;

  const modulos = await bubbleTodos(T.modulo, [
    restricao('Curso', 'equals', idCurso)
  ], { ordenarPor: 'Ordem', maximo: 200 });

  const aulas = await bubbleTodos(T.aula, [
    restricao('Curso', 'equals', idCurso)
  ], { ordenarPor: 'Ordem', maximo: 1000 });

  const vivas = aulas.filter(function (a) { return !a['Is Deleted']; });

  let vistas = {};
  if (acessoTotal && idDono) {
    const progressos = await bubbleTodos(T.progresso, [
      restricao('Aluno', 'equals', idDono),
      restricao('Curso', 'equals', idCurso)
    ], { maximo: 1000 });
    progressos.forEach(function (p) {
      vistas[texto(p['Aula'])] = {
        segundos: numero(p['Segundos Vistos']),
        concluida: !!p['Concluida']
      };
    });
  }

  const programa = modulos
    .filter(function (m) { return !m['Is Deleted']; })
    .map(function (m) {
      const doModulo = vivas
        .filter(function (a) { return texto(a['Modulo']) === m._id; })
        .sort(function (a, b) { return numero(a['Ordem']) - numero(b['Ordem']); })
        .map(function (a) {
          const aberta = acessoTotal || !!a['E Livre'];
          const linha = {
            id: a._id,
            titulo: texto(a['Titulo']),
            tipo: texto(a['Tipo']),
            duracao: numero(a['Duracao Segundos']),
            livre: !!a['E Livre'],
            aberta: aberta,
            visto: vistas[a._id] || null
          };
          /* O conteudo so sai daqui se houver direito a ele. */
          if (aberta) {
            linha.playback = texto(a['Playback URL']);
            linha.thumb = texto(a['Thumbnail URL']);
          }
          return linha;
        });
      return { id: m._id, nome: texto(m['Nome']), ordem: numero(m['Ordem']), aulas: doModulo };
    });

  const formador = await bubblePorId(T.user, texto(curso['Formador']));

  const avaliacoes = await bubbleTodos(T.avaliacao, [
    restricao('Curso', 'equals', idCurso)
  ], { maximo: 200 });

  ok(res, {
    curso: Object.assign(cursoPublico(curso), {
      descricao: texto(curso['Descricao']),
      aprende: curso['O Que Vai Aprender'] || [],
      requisitos: curso['Requisitos'] || [],
      estado: texto(curso['Estado'])
    }),
    formador: formadorPublico(formador),
    programa: programa,
    inscrito: inscrito,
    e_dono: !!eDono,
    avaliacoes: avaliacoes
      .filter(function (a) { return !a['Is Deleted']; })
      .slice(0, 30)
      .map(function (a) {
        return {
          estrelas: numero(a['Estrelas']),
          texto: texto(a['Texto']),
          data: a['Created Date'] || null
        };
      })
  });
};

/* ---------- inscricao gratis ---------- */

rotas['POST /enroll'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  const idCurso = texto(corpo.curso);
  if (!idDono || !idCurso) return erro(res, 'owner ou curso em falta');

  const aluno = await bubblePorId(T.user, idDono);
  if (!aluno) return erro(res, 'utilizador nao encontrado', 404);

  const curso = await bubblePorId(T.curso, idCurso);
  if (!curso || curso['Is Deleted']) return erro(res, 'curso nao encontrado', 404);
  if (texto(curso['Estado']) !== 'Publicado') return erro(res, 'curso nao disponivel', 403);

  if (precoEfectivo(curso) > 0) {
    return erro(res, 'este curso e pago — use /pay');
  }

  const jaTem = await inscricaoDe(idDono, idCurso);
  if (jaTem) return ok(res, { inscricao: jaTem._id, ja: true });

  const id = await criarInscricao(aluno, curso, 'gratis', 0);
  ok(res, { inscricao: id, ja: false });
};

/* ---------- pagamento por carteira movel ---------- */

rotas['POST /pay'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  const idItem = texto(corpo.item_id);
  const tipoItem = texto(corpo.item_type) || 'curso';
  const numeroBruto = texto(corpo.numero);
  let metodo = texto(corpo.metodo).toLowerCase();

  if (!idDono || !idItem || !numeroBruto) {
    return erro(res, 'owner, item_id ou numero em falta');
  }
  if (tipoItem !== 'curso') {
    return erro(res, 'so cursos por agora');
  }

  const numeroLimpo = normalizarNumero(numeroBruto);
  if (numeroLimpo.length !== 9) {
    return erro(res, 'numero invalido — devem ser 9 digitos, por exemplo 841234567');
  }

  if (!metodo) metodo = operadoraDoNumero(numeroLimpo);
  if (metodo !== 'mpesa' && metodo !== 'emola') {
    return erro(res, 'nao reconheci a operadora deste numero — escolha M-Pesa ou e-Mola');
  }

  const aluno = await bubblePorId(T.user, idDono);
  if (!aluno) return erro(res, 'utilizador nao encontrado', 404);

  const curso = await bubblePorId(T.curso, idItem);
  if (!curso || curso['Is Deleted']) return erro(res, 'curso nao encontrado', 404);
  if (texto(curso['Estado']) !== 'Publicado') return erro(res, 'curso nao disponivel', 403);
  if (texto(curso['Formador']) === idDono) return erro(res, 'este curso e seu');

  const jaTem = await inscricaoDe(idDono, idItem);
  if (jaTem && jaTem['Is Active']) return erro(res, 'ja tem acesso a este curso');

  let valor = precoEfectivo(curso);
  if (valor <= 0) return erro(res, 'este curso e gratis — use /enroll');

  /* cupao, se vier */
  let cupaoUsado = null;
  const codigoCupao = texto(corpo.cupao).toUpperCase();
  if (codigoCupao) {
    const achados = await bubbleTodos(T.cupao, [
      restricao('Codigo', 'equals', codigoCupao),
      restricao('Is Active', 'equals', true)
    ], { maximo: 1 });
    const cupao = achados[0];
    if (cupao) {
      const doCurso = !texto(cupao['Curso']) || texto(cupao['Curso']) === idItem;
      const dentroDoPrazo = !cupao['Validade'] || new Date(cupao['Validade']).getTime() > Date.now();
      const temUsos = !numero(cupao['Max Usos']) || numero(cupao['Usos']) < numero(cupao['Max Usos']);
      if (doCurso && dentroDoPrazo && temUsos) {
        const desconto = Math.round(valor * (numero(cupao['Desconto Pct']) / 100));
        valor = Math.max(0, valor - desconto);
        cupaoUsado = cupao;
      }
    }
  }

  if (valor <= 0) {
    const id = await criarInscricao(aluno, curso, 'cupao', 0);
    if (cupaoUsado) {
      await bubbleActualizar(T.cupao, cupaoUsado._id, { 'Usos': numero(cupaoUsado['Usos']) + 1 });
    }
    return ok(res, { pago: true, gratis_por_cupao: true, inscricao: id });
  }

  const nomeCliente = texto(aluno['Nome Completo']) || 'Cliente CURC';
  const resultado = await cobrarCarteira(metodo, numeroLimpo, nomeCliente, valor);
  const reparticao = repartir(valor);

  const idPagamento = await bubbleCriar(T.pagamento, {
    'User': idDono,
    'Metodo': metodo,
    'Telefone': numeroLimpo,
    'Valor MZN': valor,
    'Item Type': 'curso',
    'Item Name': texto(curso['Titulo']),
    'Item ID': idItem,
    'Estado': resultado.sucesso ? 'Pago' : 'Falhou',
    'Transaction': resultado.transacao,
    'Message': resultado.mensagem,
    'Raw': resultado.bruto,
    'Formador': texto(curso['Formador']),
    'Comissao MZN': resultado.sucesso ? reparticao.comissao : 0,
    'Liquido MZN': resultado.sucesso ? reparticao.liquido : 0
  });

  if (!resultado.sucesso) {
    return responder(res, 200, {
      ok: false,
      pago: false,
      erro: resultado.mensagem,
      codigo: resultado.codigo,
      pagamento: idPagamento
    });
  }

  const idInscricao = await criarInscricao(aluno, curso, 'compra', valor);
  await creditarFormador(texto(curso['Formador']), reparticao.liquido);

  if (cupaoUsado) {
    await bubbleActualizar(T.cupao, cupaoUsado._id, { 'Usos': numero(cupaoUsado['Usos']) + 1 });
  }

  log('Pagamento aceite', metodo, valor, 'MZN — curso', idItem);

  ok(res, {
    pago: true,
    valor: valor,
    transacao: resultado.transacao,
    pagamento: idPagamento,
    inscricao: idInscricao
  });
};

/* ---------- os meus cursos ---------- */

rotas['POST /my-courses'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  if (!idDono) return erro(res, 'owner em falta');

  const inscricoes = await bubbleTodos(T.inscricao, [
    restricao('Aluno', 'equals', idDono),
    restricao('Is Active', 'equals', true)
  ], { maximo: 500 });

  const saida = [];
  for (const inscricao of inscricoes) {
    const curso = await bubblePorId(T.curso, texto(inscricao['Curso']));
    if (!curso || curso['Is Deleted']) continue;
    const publico = cursoPublico(curso);
    publico.progresso = numero(inscricao['Progresso Pct']);
    publico.aulas_concluidas = numero(inscricao['Aulas Concluidas']);
    publico.ultima_aula = texto(inscricao['Ultima Aula']);
    publico.concluido = !!inscricao['Concluido'];
    saida.push(publico);
  }

  ok(res, { cursos: saida });
};

/* ============================================================
   6A. LEITOR DO ALUNO
   ============================================================ */

/* Uma aula com o conteudo. O direito a ver e verificado aqui,
   nao no browser. Uma aula marcada como livre abre a qualquer um. */

rotas['POST /lesson'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  const idAula = texto(corpo.aula);
  if (!idAula) return erro(res, 'aula em falta');

  const aula = await bubblePorId(T.aula, idAula);
  if (!aula || aula['Is Deleted']) return erro(res, 'aula nao encontrada', 404);

  const curso = await bubblePorId(T.curso, texto(aula['Curso']));
  if (!curso || curso['Is Deleted']) return erro(res, 'curso nao encontrado', 404);

  const eDono = idDono && texto(curso['Formador']) === idDono;
  let inscricao = null;

  if (!eDono && !aula['E Livre']) {
    if (!idDono) return erro(res, 'entre na sua conta para ver esta aula', 403);
    inscricao = await inscricaoDe(idDono, curso._id);
    if (!inscricao || !inscricao['Is Active']) {
      return erro(res, 'precisa de se inscrever para ver esta aula', 403);
    }
  }

  let visto = null;
  if (idDono) {
    const achados = await bubbleTodos(T.progresso, [
      restricao('Aluno', 'equals', idDono),
      restricao('Aula', 'equals', idAula)
    ], { maximo: 1 });
    if (achados[0]) {
      visto = {
        segundos: numero(achados[0]['Segundos Vistos']),
        concluida: !!achados[0]['Concluida']
      };
    }
  }

  ok(res, {
    aula: {
      id: aula._id,
      curso: texto(aula['Curso']),
      modulo: texto(aula['Modulo']),
      titulo: texto(aula['Titulo']),
      descricao: texto(aula['Descricao']),
      tipo: texto(aula['Tipo']),
      texto: texto(aula['Texto']),
      duracao: numero(aula['Duracao Segundos']),
      livre: !!aula['E Livre'],
      playback: texto(aula['Playback URL']),
      thumb: texto(aula['Thumbnail URL']),
      estado_video: texto(aula['Estado Video'])
    },
    visto: visto,
    e_dono: !!eDono
  });
};

/* Grava onde o aluno vai na aula e recalcula a inscricao.
   Chamado de tempos a tempos pelo leitor, e ao marcar como concluida. */

rotas['POST /progress'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  const idAula = texto(corpo.aula);
  const segundos = Math.max(0, Math.round(numero(corpo.segundos)));
  const marcar = Object.prototype.hasOwnProperty.call(corpo, 'concluida');

  if (!idDono || !idAula) return erro(res, 'owner ou aula em falta');

  const aula = await bubblePorId(T.aula, idAula);
  if (!aula || aula['Is Deleted']) return erro(res, 'aula nao encontrada', 404);

  const idCurso = texto(aula['Curso']);
  const curso = await bubblePorId(T.curso, idCurso);
  if (!curso || curso['Is Deleted']) return erro(res, 'curso nao encontrado', 404);

  let direito;
  try {
    direito = await acessoAoCurso(idDono, curso);
  } catch (e) {
    return erro(res, e.message, 403);
  }

  /* O formador ve as suas proprias aulas mas nao acumula progresso. */
  if (direito.dono) {
    return ok(res, { gravado: false, motivo: 'e o formador deste curso' });
  }

  const achados = await bubbleTodos(T.progresso, [
    restricao('Aluno', 'equals', idDono),
    restricao('Aula', 'equals', idAula)
  ], { maximo: 1 });

  const anterior = achados[0] || null;
  const duracao = numero(aula['Duracao Segundos']);

  /* A aula da-se por vista aos 90 por cento, ou se o leitor disser
     explicitamente que acabou. Nunca desmarca sozinha. */
  let concluida = anterior ? !!anterior['Concluida'] : false;
  if (marcar) concluida = corpo.concluida === true;
  else if (duracao > 0 && segundos >= duracao * 0.9) concluida = true;

  /* O contador nunca anda para tras — se a pessoa voltar ao inicio,
     o ponto de retoma mais adiantado mantem-se. */
  const guardados = anterior
    ? Math.max(numero(anterior['Segundos Vistos']), segundos)
    : segundos;

  if (anterior) {
    await bubbleActualizar(T.progresso, anterior._id, {
      'Segundos Vistos': guardados,
      'Concluida': concluida
    });
  } else {
    await bubbleCriar(T.progresso, {
      'Aluno': idDono,
      'Curso': idCurso,
      'Aula': idAula,
      'Segundos Vistos': guardados,
      'Concluida': concluida
    });
  }

  const contagem = await contarProgresso(idDono, idCurso);
  const acabou = contagem.total > 0 && contagem.concluidas >= contagem.total;

  const campos = {
    'Progresso Pct': contagem.pct,
    'Aulas Concluidas': contagem.concluidas,
    'Ultima Aula': idAula,
    'Concluido': acabou
  };
  if (acabou && !direito.inscricao['Concluido']) {
    campos['Concluido Data'] = agora();
  }

  await bubbleActualizar(T.inscricao, direito.inscricao._id, campos);

  ok(res, {
    gravado: true,
    segundos: guardados,
    concluida: concluida,
    pct: contagem.pct,
    aulas_concluidas: contagem.concluidas,
    total_aulas: contagem.total,
    curso_concluido: acabou
  });
};

/* Avaliar o curso. Uma avaliacao por aluno — a segunda substitui a primeira. */

rotas['POST /review'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  const idCurso = texto(corpo.curso);
  const estrelas = Math.round(numero(corpo.estrelas));
  const comentario = texto(corpo.texto).slice(0, 1500);

  if (!idDono || !idCurso) return erro(res, 'owner ou curso em falta');
  if (estrelas < 1 || estrelas > 5) return erro(res, 'as estrelas vao de 1 a 5');

  const curso = await bubblePorId(T.curso, idCurso);
  if (!curso || curso['Is Deleted']) return erro(res, 'curso nao encontrado', 404);
  if (texto(curso['Formador']) === idDono) return erro(res, 'nao pode avaliar o seu proprio curso');

  const inscricao = await inscricaoDe(idDono, idCurso);
  if (!inscricao || !inscricao['Is Active']) {
    return erro(res, 'so quem esta inscrito pode avaliar', 403);
  }

  const achadas = await bubbleTodos(T.avaliacao, [
    restricao('Aluno', 'equals', idDono),
    restricao('Curso', 'equals', idCurso)
  ], { maximo: 1 });

  if (achadas[0]) {
    await bubbleActualizar(T.avaliacao, achadas[0]._id, {
      'Estrelas': estrelas,
      'Texto': comentario,
      'Is Deleted': false
    });
  } else {
    await bubbleCriar(T.avaliacao, {
      'Aluno': idDono,
      'Curso': idCurso,
      'Formador': texto(curso['Formador']),
      'Estrelas': estrelas,
      'Texto': comentario,
      'Is Deleted': false
    });
  }

  const media = await recalcularEstrelas(idCurso);

  ok(res, {
    avaliado: true,
    substituiu: !!achadas[0],
    media: media.media,
    total: media.total
  });
};

/* O que este aluno ja avaliou, para o leitor mostrar as estrelas dele. */

rotas['POST /my-reviews'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  if (!idDono) return erro(res, 'owner em falta');

  const minhas = (await bubbleTodos(T.avaliacao, [
    restricao('Aluno', 'equals', idDono)
  ], { maximo: 500 })).filter(function (a) { return !a['Is Deleted']; });

  const saida = {};
  minhas.forEach(function (a) {
    saida[texto(a['Curso'])] = {
      estrelas: numero(a['Estrelas']),
      texto: texto(a['Texto'])
    };
  });

  ok(res, { avaliacoes: saida });
};

/* ============================================================
   6B. ESTUDIO DO FORMADOR
   ============================================================ */

rotas['POST /become-instructor'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  if (!idDono) return erro(res, 'owner em falta');

  const utilizador = await bubblePorId(T.user, idDono);
  if (!utilizador) return erro(res, 'utilizador nao encontrado', 404);
  if (!utilizador['Token Confirmado']) return erro(res, 'confirme primeiro o seu email');

  if (utilizador['Formador Aprovado']) {
    return ok(res, { formador: true, ja: true });
  }

  await bubbleActualizar(T.user, idDono, {
    'Papel': 'Formador',
    'Formador Aprovado': true,
    'Bio': texto(corpo.bio) || texto(utilizador['Bio']),
    'Telefone': texto(corpo.telefone) || texto(utilizador['Telefone'])
  });

  ok(res, { formador: true, ja: false });
};

rotas['POST /studio-courses'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  if (!idDono) return erro(res, 'owner em falta');

  const cursos = await bubbleTodos(T.curso, [
    restricao('Formador', 'equals', idDono)
  ], { maximo: 500 });

  const vivos = cursos.filter(function (c) { return !c['Is Deleted']; });

  ok(res, {
    cursos: vivos.map(function (c) {
      const publico = cursoPublico(c);
      publico.estado = texto(c['Estado']) || 'Rascunho';
      publico.tem_intro = !!texto(c['Intro Video ID']);
      publico.criado = c['Created Date'] || null;
      return publico;
    })
  });
};

rotas['POST /studio-stats'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  if (!idDono) return erro(res, 'owner em falta');

  const utilizador = await bubblePorId(T.user, idDono);
  if (!utilizador) return erro(res, 'utilizador nao encontrado', 404);

  const cursos = (await bubbleTodos(T.curso, [
    restricao('Formador', 'equals', idDono)
  ], { maximo: 500 })).filter(function (c) { return !c['Is Deleted']; });

  const inscricoes = await bubbleTodos(T.inscricao, [
    restricao('Formador', 'equals', idDono)
  ], { maximo: 2000 });

  const alunosUnicos = new Set(inscricoes.map(function (i) { return texto(i['Aluno']); }));

  const publicados = cursos.filter(function (c) { return texto(c['Estado']) === 'Publicado'; });

  ok(res, {
    saldo: numero(utilizador['Saldo MZN']),
    total_ganho: numero(utilizador['Total Ganho MZN']),
    cursos_total: cursos.length,
    cursos_publicados: publicados.length,
    alunos: alunosUnicos.size,
    inscricoes: inscricoes.length,
    comissao_pct: COMISSAO_PCT
  });
};

rotas['POST /course-save'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  const idCurso = texto(corpo.curso);

  await formadorActivo(idDono);

  /* Ao editar, quem nao vem no pedido fica como estava.
     Sem isto, gravar so o titulo apagava a descricao. */
  const anterior = idCurso ? await cursoDoFormador(idDono, idCurso) : {};

  function veio(chave) {
    return Object.prototype.hasOwnProperty.call(corpo, chave);
  }

  const titulo = veio('titulo') ? texto(corpo.titulo) : texto(anterior['Titulo']);
  if (!titulo) return erro(res, 'o curso precisa de um titulo');

  const gratis = veio('gratis') ? corpo.gratis === true : !!anterior['E Gratis'];
  const preco = gratis ? 0
    : (veio('preco') ? Math.max(0, Math.round(numero(corpo.preco))) : numero(anterior['Preco MZN']));
  const promo = gratis ? 0
    : (veio('preco_promo') ? Math.max(0, Math.round(numero(corpo.preco_promo))) : numero(anterior['Preco Promo MZN']));

  if (!gratis && preco <= 0) {
    return erro(res, 'defina um preco, ou marque o curso como gratuito');
  }
  if (promo > 0 && promo >= preco) {
    return erro(res, 'o preco promocional tem de ser inferior ao normal');
  }

  const campos = {
    'Titulo': titulo,
    'Preco MZN': preco,
    'Preco Promo MZN': promo,
    'E Gratis': gratis
  };

  if (veio('subtitulo')) campos['Subtitulo'] = texto(corpo.subtitulo).slice(0, 200);
  if (veio('descricao')) campos['Descricao'] = texto(corpo.descricao);
  if (veio('categoria')) campos['Categoria'] = texto(corpo.categoria);
  if (veio('nivel')) campos['Nivel'] = texto(corpo.nivel) || 'Iniciante';
  if (veio('certificado')) campos['Tem Certificado'] = corpo.certificado === true;

  if (Array.isArray(corpo.aprende)) {
    campos['O Que Vai Aprender'] = corpo.aprende.map(texto).filter(Boolean).slice(0, 12);
  }
  if (Array.isArray(corpo.requisitos)) {
    campos['Requisitos'] = corpo.requisitos.map(texto).filter(Boolean).slice(0, 12);
  }

  if (idCurso) {
    await bubbleActualizar(T.curso, idCurso, campos);
    return ok(res, { curso: idCurso, novo: false });
  }

  if (!campos['Nivel']) campos['Nivel'] = 'Iniciante';
  campos['Formador'] = idDono;
  campos['Slug'] = slugificar(titulo) + '-' + codigoAleatorio(4).toLowerCase();
  campos['Estado'] = 'Rascunho';
  campos['Total Aulas'] = 0;
  campos['Total Alunos'] = 0;
  campos['Duracao Segundos'] = 0;
  campos['Media Estrelas'] = 0;
  campos['Total Avaliacoes'] = 0;
  campos['Is Deleted'] = false;

  const novo = await bubbleCriar(T.curso, campos);
  ok(res, { curso: novo, novo: true, slug: campos['Slug'] });
};

rotas['POST /course-publish'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  const idCurso = texto(corpo.curso);

  const curso = await cursoDoFormador(idDono, idCurso);

  /* Validacoes antes de deixar publicar. */
  const faltas = [];
  if (!texto(curso['Titulo'])) faltas.push('titulo');
  if (!texto(curso['Descricao'])) faltas.push('descricao');
  if (!texto(curso['Categoria'])) faltas.push('categoria');
  if (!texto(curso['Capa URL'])) faltas.push('imagem de capa');
  if (!texto(curso['Intro Video ID'])) faltas.push('video de introducao');

  const contagem = await recontarCurso(idCurso);
  if (contagem.aulas < 1) faltas.push('pelo menos uma aula');

  if (faltas.length) {
    return erro(res, 'falta: ' + faltas.join(', '));
  }

  await bubbleActualizar(T.curso, idCurso, {
    'Estado': 'Publicado',
    'Publicado Data': agora()
  });

  const formador = await bubblePorId(T.user, idDono);
  const publicados = (await bubbleTodos(T.curso, [
    restricao('Formador', 'equals', idDono),
    restricao('Estado', 'equals', 'Publicado')
  ], { maximo: 500 })).filter(function (c) { return !c['Is Deleted']; });

  if (formador) {
    await bubbleActualizar(T.user, idDono, { 'Total Cursos': publicados.length });
  }

  ok(res, { publicado: true, aulas: contagem.aulas, duracao: contagem.duracao });
};

rotas['POST /course-unpublish'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  const idCurso = texto(corpo.curso);
  await cursoDoFormador(idDono, idCurso);

  await bubbleActualizar(T.curso, idCurso, { 'Estado': 'Rascunho' });
  ok(res, { publicado: false });
};

rotas['POST /course-delete'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  const idCurso = texto(corpo.curso);
  const curso = await cursoDoFormador(idDono, idCurso);

  if (numero(curso['Total Alunos']) > 0) {
    return erro(res, 'este curso ja tem alunos inscritos e nao pode ser apagado');
  }

  await bubbleActualizar(T.curso, idCurso, {
    'Is Deleted': true,
    'Estado': 'Suspenso'
  });

  ok(res, { apagado: true });
};

/* ---------- modulos ---------- */

rotas['POST /module-save'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  const idCurso = texto(corpo.curso);
  const idModulo = texto(corpo.modulo);

  await cursoDoFormador(idDono, idCurso);

  const nome = texto(corpo.nome);
  if (!nome) return erro(res, 'o modulo precisa de um nome');

  if (idModulo) {
    const modulo = await bubblePorId(T.modulo, idModulo);
    if (!modulo || texto(modulo['Curso']) !== idCurso) return erro(res, 'modulo nao encontrado', 404);
    await bubbleActualizar(T.modulo, idModulo, { 'Nome': nome });
    return ok(res, { modulo: idModulo, novo: false });
  }

  const existentes = await bubbleTodos(T.modulo, [
    restricao('Curso', 'equals', idCurso)
  ], { maximo: 200 });

  const novo = await bubbleCriar(T.modulo, {
    'Curso': idCurso,
    'Nome': nome,
    'Ordem': existentes.filter(function (m) { return !m['Is Deleted']; }).length + 1,
    'Is Deleted': false
  });

  ok(res, { modulo: novo, novo: true });
};

rotas['POST /module-delete'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  const idCurso = texto(corpo.curso);
  const idModulo = texto(corpo.modulo);

  await cursoDoFormador(idDono, idCurso);

  const aulas = (await bubbleTodos(T.aula, [
    restricao('Modulo', 'equals', idModulo)
  ], { maximo: 500 })).filter(function (a) { return !a['Is Deleted']; });

  if (aulas.length) {
    return erro(res, 'apague primeiro as ' + aulas.length + ' aulas deste modulo');
  }

  await bubbleActualizar(T.modulo, idModulo, { 'Is Deleted': true });
  ok(res, { apagado: true });
};

/* ---------- aulas ---------- */

rotas['POST /lesson-save'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  const idCurso = texto(corpo.curso);
  const idAula = texto(corpo.aula);

  await cursoDoFormador(idDono, idCurso);

  const titulo = texto(corpo.titulo);
  if (!titulo) return erro(res, 'a aula precisa de um titulo');

  const tipo = texto(corpo.tipo) || 'Video';
  if (['Video', 'Texto', 'Ficheiro', 'Live'].indexOf(tipo) === -1) {
    return erro(res, 'tipo de aula desconhecido');
  }

  const campos = { 'Titulo': titulo };

  function veioAula(chave) {
    return Object.prototype.hasOwnProperty.call(corpo, chave);
  }

  if (veioAula('descricao')) campos['Descricao'] = texto(corpo.descricao);
  if (veioAula('tipo')) campos['Tipo'] = tipo;
  if (veioAula('texto')) campos['Texto'] = texto(corpo.texto);
  if (veioAula('livre')) campos['E Livre'] = corpo.livre === true;

  if (idAula) {
    const aula = await bubblePorId(T.aula, idAula);
    if (!aula || texto(aula['Curso']) !== idCurso) return erro(res, 'aula nao encontrada', 404);
    if (texto(corpo.modulo)) campos['Modulo'] = texto(corpo.modulo);
    await bubbleActualizar(T.aula, idAula, campos);
    await recontarCurso(idCurso);
    return ok(res, { aula: idAula, novo: false });
  }

  const idModulo = texto(corpo.modulo);
  if (!idModulo) return erro(res, 'escolha o modulo da aula');

  const irmas = (await bubbleTodos(T.aula, [
    restricao('Modulo', 'equals', idModulo)
  ], { maximo: 500 })).filter(function (a) { return !a['Is Deleted']; });

  campos['Curso'] = idCurso;
  campos['Modulo'] = idModulo;
  campos['Tipo'] = tipo;
  campos['Ordem'] = irmas.length + 1;
  campos['Duracao Segundos'] = 0;
  campos['Is Deleted'] = false;
  if (!veioAula('livre')) campos['E Livre'] = false;

  const novo = await bubbleCriar(T.aula, campos);
  await recontarCurso(idCurso);

  ok(res, { aula: novo, novo: true });
};

rotas['POST /lesson-delete'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  const idCurso = texto(corpo.curso);
  const idAula = texto(corpo.aula);

  await cursoDoFormador(idDono, idCurso);

  const aula = await bubblePorId(T.aula, idAula);
  if (!aula || texto(aula['Curso']) !== idCurso) return erro(res, 'aula nao encontrada', 404);

  await streamApagarVideo(texto(aula['Bunny Video ID']));
  await bubbleActualizar(T.aula, idAula, { 'Is Deleted': true });
  const contagem = await recontarCurso(idCurso);

  ok(res, { apagado: true, aulas: contagem.aulas });
};

rotas['POST /reorder'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  const idCurso = texto(corpo.curso);
  const alvo = texto(corpo.tipo);
  const ids = Array.isArray(corpo.ids) ? corpo.ids.map(texto).filter(Boolean) : [];

  await cursoDoFormador(idDono, idCurso);

  if (alvo !== 'modulo' && alvo !== 'aula') return erro(res, 'tipo deve ser modulo ou aula');
  if (!ids.length) return erro(res, 'lista de ids vazia');

  const tabela = alvo === 'modulo' ? T.modulo : T.aula;

  for (let i = 0; i < ids.length; i++) {
    const registo = await bubblePorId(tabela, ids[i]);
    if (!registo || texto(registo['Curso']) !== idCurso) continue;
    await bubbleActualizar(tabela, ids[i], { 'Ordem': i + 1 });
  }

  ok(res, { ordenados: ids.length });
};

/* ---------- video: autorizacao para o TUS ---------- */

rotas['POST /video-token'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  const idCurso = texto(corpo.curso);
  const alvo = texto(corpo.alvo) || 'aula';

  await cursoDoFormador(idDono, idCurso);

  if (alvo !== 'aula' && alvo !== 'intro') return erro(res, 'alvo deve ser aula ou intro');

  let idAula = '';
  if (alvo === 'aula') {
    idAula = texto(corpo.aula);
    if (!idAula) return erro(res, 'aula em falta');
    const aula = await bubblePorId(T.aula, idAula);
    if (!aula || texto(aula['Curso']) !== idCurso) return erro(res, 'aula nao encontrada', 404);
    /* Se ja tinha video, apaga o antigo para nao deixar lixo a pagar. */
    await streamApagarVideo(texto(aula['Bunny Video ID']));
  } else {
    const curso = await bubblePorId(T.curso, idCurso);
    await streamApagarVideo(texto(curso['Intro Video ID']));
  }

  const titulo = texto(corpo.titulo) || (alvo === 'intro' ? 'Introducao' : 'Aula');
  const idVideo = await streamCriarVideo(titulo);

  /* Duas horas chega para qualquer envio, mesmo com rede fraca. */
  const validade = Math.floor(Date.now() / 1000) + 2 * 60 * 60;

  ok(res, {
    video_id: idVideo,
    biblioteca: STREAM_LIBRARY,
    assinatura: streamAssinatura(idVideo, validade),
    validade: validade,
    endpoint: 'https://video.bunnycdn.com/tusupload',
    alvo: alvo,
    aula: idAula
  });
};

rotas['POST /video-done'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  const idCurso = texto(corpo.curso);
  const alvo = texto(corpo.alvo) || 'aula';
  const idVideo = texto(corpo.video_id);

  await cursoDoFormador(idDono, idCurso);
  if (!idVideo) return erro(res, 'video_id em falta');

  const info = await streamEstado(idVideo);
  const duracao = info ? numero(info.length) : 0;

  if (alvo === 'intro') {
    await bubbleActualizar(T.curso, idCurso, {
      'Intro Video ID': idVideo,
      'Intro Playback URL': urlPlayback(idVideo),
      'Intro Thumbnail URL': urlMiniatura(idVideo),
      'Intro Duracao': duracao
    });
    return ok(res, { guardado: 'intro', duracao: duracao });
  }

  const idAula = texto(corpo.aula);
  const aula = await bubblePorId(T.aula, idAula);
  if (!aula || texto(aula['Curso']) !== idCurso) return erro(res, 'aula nao encontrada', 404);

  await bubbleActualizar(T.aula, idAula, {
    'Bunny Video ID': idVideo,
    'Playback URL': urlPlayback(idVideo),
    'Thumbnail URL': urlMiniatura(idVideo),
    'Duracao Segundos': duracao,
    'Estado Video': 'processing',
    'Tipo': 'Video'
  });

  await recontarCurso(idCurso);
  ok(res, { guardado: 'aula', duracao: duracao });
};

rotas['POST /video-status'] = async function (req, res, corpo) {
  const idVideo = texto(corpo.video_id);
  if (!idVideo) return erro(res, 'video_id em falta');

  const info = await streamEstado(idVideo);
  if (!info) return erro(res, 'video nao encontrado', 404);

  /* Estados do Bunny: 0 em fila, 1 a processar, 2 a codificar,
     3 terminado, 4 resolucoes prontas, 5 falhou. */
  const codigo = numero(info.status);
  const pronto = codigo >= 3 && codigo !== 5;

  /* Assim que ficar pronto, guarda a duracao real na aula. */
  const idAula = texto(corpo.aula);
  if (pronto && idAula) {
    const aula = await bubblePorId(T.aula, idAula);
    if (aula && texto(aula['Bunny Video ID']) === idVideo) {
      await bubbleActualizar(T.aula, idAula, {
        'Estado Video': 'ready',
        'Duracao Segundos': numero(info.length)
      });
      await recontarCurso(texto(aula['Curso']));
    }
  }

  ok(res, {
    estado: codigo,
    pronto: pronto,
    falhou: codigo === 5,
    progresso: numero(info.encodeProgress),
    duracao: numero(info.length)
  });
};

/* ---------- imagens ---------- */

rotas['POST /upload-image'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  const alvo = texto(corpo.alvo) || 'capa';
  const tipoMime = texto(corpo.mime).toLowerCase();
  const base64 = texto(corpo.dados);

  if (!idDono) return erro(res, 'owner em falta');
  if (!base64) return erro(res, 'imagem em falta');

  const extensao = IMAGENS_ACEITES[tipoMime];
  if (!extensao) return erro(res, 'so aceito imagens jpg, png ou webp');

  const bytes = Buffer.from(base64.replace(/^data:[^,]+,/, ''), 'base64');
  if (!bytes.length) return erro(res, 'imagem vazia');
  if (bytes.length > 5 * 1024 * 1024) return erro(res, 'imagem acima de 5 MB');

  let caminho;

  if (alvo === 'capa') {
    const idCurso = texto(corpo.curso);
    await cursoDoFormador(idDono, idCurso);
    caminho = 'capas/' + idCurso + '-' + Date.now() + '.' + extensao;
    const url = await storageGuardar(caminho, bytes, tipoMime);
    await bubbleActualizar(T.curso, idCurso, { 'Capa URL': url });
    return ok(res, { url: url });
  }

  if (alvo === 'perfil') {
    caminho = 'perfis/' + idDono + '-' + Date.now() + '.' + extensao;
    const url = await storageGuardar(caminho, bytes, tipoMime);
    await bubbleActualizar(T.user, idDono, { 'Foto URL': url });
    return ok(res, { url: url });
  }

  erro(res, 'alvo deve ser capa ou perfil');
};

/* ---------- ver o curso como dono, com tudo a descoberto ---------- */

rotas['POST /studio-course'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  const idCurso = texto(corpo.curso);

  const curso = await cursoDoFormador(idDono, idCurso);

  const modulos = (await bubbleTodos(T.modulo, [
    restricao('Curso', 'equals', idCurso)
  ], { ordenarPor: 'Ordem', maximo: 200 })).filter(function (m) { return !m['Is Deleted']; });

  const aulas = (await bubbleTodos(T.aula, [
    restricao('Curso', 'equals', idCurso)
  ], { ordenarPor: 'Ordem', maximo: 1000 })).filter(function (a) { return !a['Is Deleted']; });

  ok(res, {
    curso: Object.assign(cursoPublico(curso), {
      descricao: texto(curso['Descricao']),
      aprende: curso['O Que Vai Aprender'] || [],
      requisitos: curso['Requisitos'] || [],
      estado: texto(curso['Estado']) || 'Rascunho',
      intro_video_id: texto(curso['Intro Video ID'])
    }),
    modulos: modulos.map(function (m) {
      return {
        id: m._id,
        nome: texto(m['Nome']),
        ordem: numero(m['Ordem']),
        aulas: aulas
          .filter(function (a) { return texto(a['Modulo']) === m._id; })
          .map(function (a) {
            return {
              id: a._id,
              titulo: texto(a['Titulo']),
              descricao: texto(a['Descricao']),
              tipo: texto(a['Tipo']),
              texto: texto(a['Texto']),
              ordem: numero(a['Ordem']),
              livre: !!a['E Livre'],
              video_id: texto(a['Bunny Video ID']),
              playback: texto(a['Playback URL']),
              thumb: texto(a['Thumbnail URL']),
              duracao: numero(a['Duracao Segundos']),
              estado_video: texto(a['Estado Video'])
            };
          })
      };
    })
  });
};

/* ============================================================
   7. SERVIDOR
   ============================================================ */

const servidor = http.createServer(async function (req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Max-Age': '86400'
    });
    res.end();
    return;
  }

  const caminho = (req.url || '/').split('?')[0].replace(/\/+$/, '') || '/';
  const chave = req.method + ' ' + caminho;
  const rota = rotas[chave];

  if (!rota) {
    return erro(res, 'rota desconhecida: ' + chave, 404);
  }

  let corpo = {};
  if (req.method === 'POST') {
    try {
      corpo = await lerCorpo(req, caminho === '/upload-image' ? 10 : 2);
    } catch (e) {
      return erro(res, e.message);
    }
  }

  try {
    await rota(req, res, corpo);
  } catch (e) {
    log('ERRO em', chave, '—', e.message);
    if (!res.headersSent) erro(res, e.message, 500);
  }
});

servidor.listen(PORTA, function () {
  log('curc-proxy', VERSAO, 'a ouvir na porta', PORTA);
  log('Bubble:', BUBBLE_BASE || '(nao configurado)');
  log('Storage:', STORAGE_ZONE ? (STORAGE_HOST + '/' + STORAGE_ZONE) : '(nao configurado)');
  log('CDN:', CDN_HOST || '(nao configurado)');
  log('Stream:', STREAM_LIBRARY || '(nao configurado)');
  log('Comissao:', COMISSAO_PCT + '%');
});
