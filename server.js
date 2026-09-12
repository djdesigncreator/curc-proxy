/* ============================================================
   CURC — container proxy
   versao: curc-13
   Plataforma EAD marketplace, com o mercado mocambicano por
   base e aberta a quem vem de fora.

   Novidades desta versao:
     - pacotes de espaco extra, comprados a parte. Quem enche o
       espaco do plano compra mais sem ter de mudar de plano.
       O espaco comprado nao expira e soma-se ao do plano.
     - POST /packs      lista os pacotes e o extra que ja tem
     - POST /pay-pack   compra por M-Pesa ou e-Mola
     - /pay-card aceita item_type "pacote"

   Da versao curc-13:
     - GET /i18n.js — ficheiro unico de traducoes, servido pelo
       container. Portugues, Ingles, Frances e Espanhol.
       As paginas carregam-no e marcam o texto com data-t.

   Da versao curc-12:
     - pagamento por Visa e Mastercard pela MoPayment
     - a MoPayment passou a exigir login: email e senha trocados
       por um token Bearer, que fica em cache ate expirar
     - o webhook_url vai no corpo do pedido — deixou de ser
       preciso adivinhar se eles chamam o endereco
     - POST /pay-card       gera o link de checkout
     - POST /payment-status consulta pela referencia
     - POST /<CARD_HOOK>    recebe o webhook e aplica a compra

   Da versao curc-11:
     - POST /live-hand   o aluno pede a palavra
     - POST /live-state  o estado da sala: maos no ar, quem tem
       voz, e se a aula ainda decorre

   Da versao curc-10:
     - aulas ao vivo pelo Agora, em modo de transmissao:
       o formador publica, os alunos veem, e ele pode dar
       voz a um aluno de cada vez
     - construtor de tokens AccessToken2 escrito a mao, para o
       container continuar sem dependencias
     - POST /live-save /live-delete /lives
     - POST /live-start /live-end /live-join /live-voz
     - POST /diag-agora  descodifica um token para conferencia

   Da versao curc-9:
     - levantamentos. O formador e o afiliado pedem o dinheiro,
       o valor sai do saldo na hora, e volta se for recusado.
     - POST /payout-request  pedir o levantamento
     - POST /my-payouts      os meus pedidos
     - POST /payouts-admin   fila de pedidos (protegida)
     - POST /payout-settle   marcar como pago ou recusado

   Da versao curc-8:
     - area de membro de cada curso, com tres partes:
         avisos do formador, duvidas dos alunos, e materiais
     - marca propria do curso: cor, logotipo e mensagem de
       boas-vindas, definidos pelo formador
     - POST /space            tudo o que a area de membro precisa
     - POST /announce         criar ou editar um aviso (dono)
     - POST /announce-delete
     - POST /ask              o aluno pergunta
     - POST /answer           formador ou aluno responde
     - POST /question-delete
     - POST /material-upload  PDF ou ficheiro de apoio
     - POST /material-delete
     - os materiais contam para o espaco do plano; o video nao

   Da versao curc-7:
     - programa de afiliados. O dono do curso decide quanto da,
       entre AFILIADO_MIN_PCT e AFILIADO_MAX_PCT. A parte do
       afiliado sai do bolo do formador, nunca do da plataforma.
     - POST /affiliate-link    gera ou devolve o link do afiliado
     - POST /affiliate-hit     conta um clique (publica)
     - POST /my-affiliates     os meus links e o que renderam
     - POST /course-affiliates quem promove este curso (dono)
     - /pay aceita ref e reparte a venda por tres

   Da versao curc-6:
     - /signup-code atribui o plano gratuito, o nome e o papel
       logo no registo, para ninguem chegar ao estudio sem plano

   Da versao curc-5:
     - planos do formador: limite de cursos e de espaco de materiais
     - POST /author-plans  lista os planos e o consumo actual
     - POST /pay-plan      cobra a adesao por M-Pesa ou e-Mola
     - /course-save trava a criacao acima do limite de cursos
     - /upload-image trava acima do limite de espaco, apaga o
       ficheiro antigo e desconta os bytes que ele ocupava
     - o video nao entra em nenhuma contagem, por decisao de produto

   Da versao curc-4:
     - POST /progress, /lesson, /review, /my-reviews

   Da versao curc-3:
     - variaveis de ambiente limpas ao arrancar
     - buscar() mostra a causa real em vez de "fetch failed"
     - POST /diag-storage

   Nota sobre o CDN_HOST: o caminho publico da Bunny inclui o nome
   da zona de storage. Para a zona curc, CDN_HOST = curc.b-cdn.net/curc

   Sem dependencias externas. Corre com node >= 18.
   ============================================================ */

const http = require('http');
const crypto = require('crypto');
const dns = require('dns').promises;

const VERSAO = 'curc-14';
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

/* Quanto o formador pode dar ao afiliado. O minimo e obrigatorio:
   quem liga os afiliados no seu curso tem de dar pelo menos isto. */
const AFILIADO_MIN_PCT = Number(limparValor(process.env.AFILIADO_MIN_PCT) || 10);
const AFILIADO_MAX_PCT = Number(limparValor(process.env.AFILIADO_MAX_PCT) || 50);

/* Levantamentos. Abaixo do minimo nao compensa a nenhuma das
   partes — a taxa da carteira come a transferencia. */
const LEVANTAMENTO_MIN = Number(limparValor(process.env.LEVANTAMENTO_MIN) || 500);

/* Agora — aulas ao vivo. O certificado nunca sai do container. */
const AGORA_APP_ID = limparValor(process.env.AGORA_APP_ID);
const AGORA_APP_CERT = limparValor(process.env.AGORA_APP_CERT);
const AGORA_HORAS = Number(limparValor(process.env.AGORA_HORAS) || 4);

/* Cartao pela MoPayment. O login devolve um token Bearer que
   e preciso para o checkout. Sem assinatura no webhook, a
   proteccao e o endereco secreto mais a conferencia da
   referencia e do valor. */
const MOPAY_EMAIL = limparValor(process.env.MOPAY_EMAIL);
const MOPAY_SENHA = limparValor(process.env.MOPAY_SENHA);
const CARD_HOOK = limparValor(process.env.CARD_HOOK) || 'wh-card-x9k2mq7p';
const SELF_URL = limparUrl(process.env.SELF_URL);

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
  planoFormador: 'plano_formador',
  pacote: 'pacote_espaco',
  afiliado: 'afiliado',
  anuncio: 'anuncio',
  resposta: 'resposta',
  material: 'material',
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

function moldeLevantamento(nome, pedido, estado, nota) {
  const pago = estado === 'Pago';
  const valor = numero(pedido['Valor MZN']);
  const cor = pago ? '#4CD9A4' : '#FF9EA1';

  return `
<div style="font-family:Arial,Helvetica,sans-serif;background:#0A0E27;padding:32px">
  <div style="max-width:520px;margin:0 auto;background:#111633;border-radius:16px;padding:32px;color:#fff">
    <div style="font-size:26px;font-weight:800;letter-spacing:2px;color:#A855F7">CURC</div>
    <h1 style="font-size:20px;margin:26px 0 8px">Ola ${nome || ''},</h1>
    <p style="color:#B9C3DE;line-height:1.6;margin:0 0 22px">
      ${pago
        ? 'O seu levantamento foi processado. O dinheiro segue para o numero que indicou.'
        : 'Nao conseguimos processar o seu levantamento. O valor voltou para o seu saldo.'}
    </p>
    <div style="background:#0A0E27;border:1px solid #2A3560;border-radius:12px;padding:20px">
      <div style="font-size:28px;font-weight:700;color:${cor}">${valor} MZN</div>
      <div style="color:#7C8DB5;font-size:13px;margin-top:6px">
        ${texto(pedido['Metodo']) === 'emola' ? 'e-Mola' : 'M-Pesa'} ·
        ${texto(pedido['Telefone'])}
      </div>
      <div style="color:#7C8DB5;font-size:12px;margin-top:10px">
        Referencia ${texto(pedido['Referencia'])}
      </div>
    </div>
    ${nota ? `<p style="color:#B9C3DE;font-size:13.5px;margin-top:20px">${nota}</p>` : ''}
    <p style="color:#7C8DB5;font-size:13px;margin-top:24px">
      Qualquer duvida, responda a este email.
    </p>
  </div>
</div>`;
}

/* ============================================================
   4A. MOPAYMENT — CARTAO (VISA E MASTERCARD)
   ============================================================ */

/* A MoPayment passou a exigir login. O token vive em memoria
   ate faltar pouco para expirar — nao vale a pena pedir um
   novo a cada compra. */

let cartaoSessao = { token: '', expira: 0 };

function lerTokenLogin(dados) {
  if (!dados || typeof dados !== 'object') return '';
  const dentro = (dados.response && typeof dados.response === 'object') ? dados.response : {};

  const candidatos = [
    dados.token, dados.access_token, dados.jwt, dados.bearer,
    dentro.token, dentro.access_token, dentro.jwt, dentro.bearer
  ];

  for (const v of candidatos) {
    const t = texto(v);
    if (t) return t;
  }
  return '';
}

async function cartaoEntrar(forcar) {
  if (!MOPAY_EMAIL || !MOPAY_SENHA) {
    throw new Error('MOPAY_EMAIL ou MOPAY_SENHA em falta no container');
  }

  /* Meio minuto de folga, para nao apanhar o token a expirar
     no meio de um checkout. */
  if (!forcar && cartaoSessao.token && cartaoSessao.expira > Date.now() + 30000) {
    return cartaoSessao.token;
  }

  const resposta = await buscar(MOPAY_BASE + '/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: MOPAY_EMAIL, senha: MOPAY_SENHA })
  }, 'MoPayment login');

  const bruto = await resposta.text();
  let dados = null;
  try { dados = JSON.parse(bruto); } catch (e) { dados = null; }

  const token = lerTokenLogin(dados);
  if (!token) {
    throw new Error('a MoPayment nao devolveu token no login: ' + bruto.slice(0, 200));
  }

  /* Eles nao dizem a validade. Uma hora e conservador. */
  cartaoSessao = { token: token, expira: Date.now() + 60 * 60 * 1000 };
  log('MoPayment: token de login renovado');

  return token;
}

/* Pede o link de checkout. Se o token tiver morrido entretanto,
   volta a entrar uma vez e tenta de novo. */

async function cartaoCheckout(pedido, segundaTentativa) {
  const token = await cartaoEntrar(!!segundaTentativa);

  const resposta = await buscar(MOPAY_BASE + '/bankpayment', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify(pedido)
  }, 'MoPayment cartao');

  const bruto = await resposta.text();
  let dados = null;
  try { dados = JSON.parse(bruto); } catch (e) { dados = null; }

  const dentro = (dados && dados.response && typeof dados.response === 'object') ? dados.response : {};

  const link = texto(
    (dados && (dados.url || dados.link || dados.checkout_url || dados.redirect_url)) ||
    dentro.url || dentro.link || dentro.checkout_url || dentro.redirect_url
  );

  if (link) return { link: link, bruto: bruto.slice(0, 1500) };

  /* Token recusado: uma segunda tentativa com login novo. */
  const pareceAuth = resposta.status === 401 || resposta.status === 403 ||
    /token|autoriza|unauthor/i.test(bruto);

  if (pareceAuth && !segundaTentativa) {
    cartaoSessao = { token: '', expira: 0 };
    return cartaoCheckout(pedido, true);
  }

  throw new Error('a MoPayment nao devolveu link de checkout: ' + bruto.slice(0, 250));
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
   4C. AGORA — TOKENS DE AULA AO VIVO
   ============================================================ */

/* O Agora exige um token assinado com o App Certificate, que nunca
   pode chegar ao browser. O formato AccessToken2 e uma estrutura
   binaria empacotada em little-endian, comprimida com zlib e
   passada a base64, com "007" a frente.

   Implementado a mao para o container nao ganhar dependencias.
   A rota /diag-agora descodifica um token de volta, para se
   confirmar que o empacotamento esta certo. */

const zlib = require('zlib');

const AGORA_VERSAO = '007';
const AGORA_SERVICO_RTC = 1;

/* Privilegios do servico RTC. */
const AGORA_ENTRAR = 1;
const AGORA_PUBLICAR_AUDIO = 2;
const AGORA_PUBLICAR_VIDEO = 3;
const AGORA_PUBLICAR_DADOS = 4;

function agoraUint16(valor) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(valor >>> 0, 0);
  return b;
}

function agoraUint32(valor) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(valor >>> 0, 0);
  return b;
}

/* Aceita texto ou bytes. A assinatura vem em Buffer, e passa-la
   por String() corrompia-a — 32 bytes binarios viravam 52 de
   UTF-8. Foi o descodificador que apanhou isto. */

function agoraString(valor) {
  const bytes = Buffer.isBuffer(valor)
    ? valor
    : Buffer.from(valor === null || valor === undefined ? '' : String(valor), 'utf8');
  return Buffer.concat([agoraUint16(bytes.length), bytes]);
}

function agoraMapa(privilegios) {
  const chaves = Object.keys(privilegios).map(Number).sort(function (a, b) { return a - b; });
  let saida = agoraUint16(chaves.length);
  chaves.forEach(function (k) {
    saida = Buffer.concat([saida, agoraUint16(k), agoraUint32(privilegios[k])]);
  });
  return saida;
}

/* Empacota o servico RTC: tipo, privilegios, canal e utilizador. */

function agoraServicoRtc(canal, uid, privilegios) {
  return Buffer.concat([
    agoraUint16(AGORA_SERVICO_RTC),
    agoraMapa(privilegios),
    agoraString(canal),
    agoraString(uid)
  ]);
}

/* A assinatura e feita em dois passos: primeiro sobre o certificado
   com a hora de emissao, depois sobre o resultado com o sal. */

function agoraAssinar(certificado, emissao, sal) {
  const passo1 = crypto.createHmac('sha256', agoraUint32(emissao))
    .update(Buffer.from(certificado, 'utf8')).digest();
  return crypto.createHmac('sha256', agoraUint32(sal)).update(passo1).digest();
}

function agoraToken(appId, certificado, canal, uid, privilegios, segundos) {
  if (!appId || !certificado) {
    throw new Error('Agora nao esta configurado no container');
  }

  const emissao = Math.floor(Date.now() / 1000);
  const validade = emissao + Math.max(60, segundos || 3600);
  const sal = crypto.randomBytes(4).readUInt32LE(0) % 99999999 + 1;

  /* Cada privilegio expira na sua hora — aqui todos ao mesmo tempo. */
  const mapa = {};
  privilegios.forEach(function (p) { mapa[p] = validade; });

  const corpo = Buffer.concat([
    agoraString(appId),
    agoraUint32(emissao),
    agoraUint32(validade),
    agoraUint32(sal),
    agoraUint16(1),
    agoraServicoRtc(canal, uid, mapa)
  ]);

  const assinatura = crypto.createHmac('sha256', agoraAssinar(certificado, emissao, sal))
    .update(corpo).digest();

  const conteudo = Buffer.concat([agoraString(assinatura), corpo]);

  return {
    token: AGORA_VERSAO + zlib.deflateSync(conteudo).toString('base64'),
    emissao: emissao,
    validade: validade
  };
}

/* Le um token de volta. So serve para diagnostico — confirma que
   o que empacotamos e o que julgamos ter empacotado. */

function agoraLerToken(token) {
  const versao = token.slice(0, 3);
  const cru = zlib.inflateSync(Buffer.from(token.slice(3), 'base64'));

  let i = 0;
  function lerString() {
    const n = cru.readUInt16LE(i); i += 2;
    const s = cru.slice(i, i + n); i += n;
    return s;
  }
  function lerUint32() { const v = cru.readUInt32LE(i); i += 4; return v; }
  function lerUint16() { const v = cru.readUInt16LE(i); i += 2; return v; }

  const assinatura = lerString();
  const appId = lerString().toString('utf8');
  const emissao = lerUint32();
  const validade = lerUint32();
  const sal = lerUint32();
  const quantos = lerUint16();

  const servicos = [];
  for (let s = 0; s < quantos; s++) {
    const tipo = lerUint16();
    const nPriv = lerUint16();
    const privs = {};
    for (let p = 0; p < nPriv; p++) {
      const chave = lerUint16();
      privs[chave] = lerUint32();
    }
    servicos.push({
      tipo: tipo,
      privilegios: privs,
      canal: lerString().toString('utf8'),
      uid: lerString().toString('utf8')
    });
  }

  return {
    versao: versao,
    app_id: appId,
    emissao: emissao,
    validade: validade,
    sal: sal,
    assinatura_bytes: assinatura.length,
    servicos: servicos,
    sobrou: cru.length - i
  };
}

/* O Agora precisa de um numero para identificar quem entra.
   O id do Bubble e texto, por isso derivamos um numero estavel
   dele — a mesma pessoa entra sempre com o mesmo uid. */

function agoraUid(idPessoa) {
  const soma = crypto.createHash('sha256').update(String(idPessoa)).digest();
  const n = soma.readUInt32BE(0) % 2147483646;
  return n + 1;
}

/* Resume o estado do Agora sem revelar o certificado.
   Fica na rota principal para se poder conferir num browser,
   sem consola e sem chave nenhuma. */

function estadoAgora() {
  if (!AGORA_APP_ID && !AGORA_APP_CERT) return 'em falta (App ID e Certificate)';
  if (!AGORA_APP_ID) return 'falta o AGORA_APP_ID';
  if (!AGORA_APP_CERT) return 'falta o AGORA_APP_CERT';

  if (AGORA_APP_ID.length !== 32) {
    return 'AGORA_APP_ID com ' + AGORA_APP_ID.length + ' caracteres — devem ser 32';
  }
  if (AGORA_APP_CERT.length !== 32) {
    return 'AGORA_APP_CERT com ' + AGORA_APP_CERT.length + ' caracteres — devem ser 32';
  }
  if (AGORA_APP_ID === AGORA_APP_CERT) {
    return 'o App ID e o Certificate estao iguais — copiou duas vezes o mesmo';
  }
  if (!/^[0-9a-fA-F]{32}$/.test(AGORA_APP_ID) || !/^[0-9a-fA-F]{32}$/.test(AGORA_APP_CERT)) {
    return 'valores fora do formato hexadecimal esperado';
  }

  /* Emite um token de teste e le-o de volta. Se o empacotamento
     estiver torto, aparece aqui e nao so quando alguem tentar
     entrar numa aula. */
  try {
    const emitido = agoraToken(AGORA_APP_ID, AGORA_APP_CERT, 'curc-teste', '1', [1], 600);
    const lido = agoraLerToken(emitido.token);
    const fecha = lido.versao === '007' &&
      lido.app_id === AGORA_APP_ID &&
      lido.assinatura_bytes === 32 &&
      lido.sobrou === 0 &&
      lido.servicos.length === 1 &&
      lido.servicos[0].canal === 'curc-teste';
    return fecha ? 'configurado e a emitir tokens' : 'o token nao fecha certo';
  } catch (e) {
    return 'rebentou a emitir: ' + e.message;
  }
}

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

/* A parte do afiliado sai do que sobra para o formador.
   A plataforma leva sempre a mesma percentagem. */

function repartir(valorMZN, pctAfiliado) {
  const comissao = Math.round(valorMZN * (COMISSAO_PCT / 100));
  const pct = Math.max(0, Math.min(AFILIADO_MAX_PCT, numero(pctAfiliado)));
  const afiliado = pct > 0 ? Math.round(valorMZN * (pct / 100)) : 0;
  const liquido = valorMZN - comissao - afiliado;

  /* Rede de seguranca: se as contas nao fecharem, o formador
     nunca sai a dever — o afiliado e que e cortado. */
  if (liquido < 0) {
    return { comissao: comissao, afiliado: Math.max(0, valorMZN - comissao), liquido: 0 };
  }
  return { comissao: comissao, afiliado: afiliado, liquido: liquido };
}

/* ---------- afiliados ---------- */

function comissaoAfiliadoDe(curso) {
  if (!curso['Aceita Afiliados']) return 0;
  const pct = numero(curso['Comissao Afiliado Pct']);
  if (pct <= 0) return 0;
  return Math.max(AFILIADO_MIN_PCT, Math.min(AFILIADO_MAX_PCT, pct));
}

async function codigoLivre() {
  for (let tentativa = 0; tentativa < 8; tentativa++) {
    const codigo = codigoAleatorio(6);
    const achados = await bubbleTodos(T.afiliado, [
      restricao('Codigo', 'equals', codigo)
    ], { maximo: 1 });
    if (!achados.length) return codigo;
  }
  /* Oito colisoes seguidas nao acontecem, mas se acontecer
     vale mais um codigo comprido do que um erro. */
  return codigoAleatorio(10);
}

async function afiliadoPorCodigo(codigo) {
  if (!texto(codigo)) return null;
  const achados = await bubbleTodos(T.afiliado, [
    restricao('Codigo', 'equals', texto(codigo).toUpperCase()),
    restricao('Is Active', 'equals', true)
  ], { maximo: 1 });
  return achados[0] || null;
}

/* Confirma que este afiliado pode mesmo receber por esta venda. */

function afiliadoVale(afiliado, curso, idComprador) {
  if (!afiliado) return false;
  if (texto(afiliado['Curso']) !== curso._id) return false;
  if (texto(afiliado['Utilizador']) === idComprador) return false;   /* nao se auto-indica */
  if (texto(afiliado['Utilizador']) === texto(curso['Formador'])) return false;
  if (comissaoAfiliadoDe(curso) <= 0) return false;
  return true;
}

async function creditarAfiliado(afiliado, valor) {
  if (!afiliado || valor <= 0) return;

  await bubbleActualizar(T.afiliado, afiliado._id, {
    'Vendas': numero(afiliado['Vendas']) + 1,
    'Ganho MZN': numero(afiliado['Ganho MZN']) + valor
  });

  const pessoa = await bubblePorId(T.user, texto(afiliado['Utilizador']));
  if (!pessoa) return;

  await bubbleActualizar(T.user, texto(afiliado['Utilizador']), {
    'Saldo Afiliado MZN': numero(pessoa['Saldo Afiliado MZN']) + valor,
    'Total Afiliado MZN': numero(pessoa['Total Afiliado MZN']) + valor
  });
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

/* ============================================================
   5B. PLANOS DO FORMADOR
   ============================================================ */

/* Regras:
     Max Cursos = 0  significa ilimitado
     Bytes Materiais conta capas, fotos e anexos
     O video nao entra em contagem nenhuma — decisao de produto */

function planoPublico(plano, extras) {
  if (!plano) return null;
  return Object.assign({
    id: plano._id,
    nome: texto(plano['Nome']),
    slug: texto(plano['Slug']),
    descricao: texto(plano['Descricao']),
    max_cursos: numero(plano['Max Cursos']),
    ilimitado: numero(plano['Max Cursos']) <= 0,
    bytes: numero(plano['Bytes Materiais']),
    preco: numero(plano['Preco MZN']),
    beneficios: plano['Beneficios'] || [],
    cor: texto(plano['Cor']),
    ordem: numero(plano['Ordem'])
  }, extras || {});
}

async function planosActivos() {
  const lista = await bubbleTodos(T.planoFormador, [
    restricao('Is Active', 'equals', true)
  ], { maximo: 50 });
  return lista.sort(function (a, b) { return numero(a['Ordem']) - numero(b['Ordem']); });
}

/* O plano de quem ainda nao escolheu nenhum e o mais barato
   dos activos — na pratica, o gratuito. */

async function planoDoFormador(utilizador) {
  const id = texto(utilizador && utilizador['Plano Formador']);
  if (id) {
    const escolhido = await bubblePorId(T.planoFormador, id);
    if (escolhido) return escolhido;
  }
  const activos = await planosActivos();
  if (!activos.length) return null;

  const gratis = activos.filter(function (p) { return numero(p['Preco MZN']) <= 0; });
  return gratis[0] || activos[0];
}

async function cursosVivosDe(idDono) {
  const cursos = await bubbleTodos(T.curso, [
    restricao('Formador', 'equals', idDono)
  ], { maximo: 500 });
  return cursos.filter(function (c) { return !c['Is Deleted']; });
}

/* Devolve o retrato do plano e do consumo, tudo de uma vez. */

async function consumoDe(idDono) {
  const utilizador = await bubblePorId(T.user, idDono);
  if (!utilizador) throw new Error('utilizador nao encontrado');

  const plano = await planoDoFormador(utilizador);
  const cursos = await cursosVivosDe(idDono);
  const bytes = numero(utilizador['Bytes Usados']);

  const maxCursos = plano ? numero(plano['Max Cursos']) : 1;

  /* O espaco do plano mais o que tenha comprado a parte.
     O comprado nao expira nem se perde ao mudar de plano. */
  const doPlano = plano ? numero(plano['Bytes Materiais']) : 0;
  const comprado = numero(utilizador['Bytes Extra']);
  const maxBytes = doPlano + comprado;

  return {
    utilizador: utilizador,
    plano: plano,
    cursos_usados: cursos.length,
    cursos_max: maxCursos,
    cursos_ilimitados: maxCursos <= 0,
    bytes_usados: bytes,
    bytes_plano: doPlano,
    bytes_extra: comprado,
    bytes_max: maxBytes,
    bytes_livres: Math.max(0, maxBytes - bytes)
  };
}

/* Trava a criacao de mais um curso quando o plano nao chega. */

async function podeCriarCurso(idDono) {
  const c = await consumoDe(idDono);
  if (c.cursos_ilimitados) return { pode: true, consumo: c };

  if (c.cursos_usados >= c.cursos_max) {
    const nome = c.plano ? texto(c.plano['Nome']) : 'actual';
    return {
      pode: false,
      consumo: c,
      motivo: 'o plano ' + nome + ' permite ' +
        c.cursos_max + (c.cursos_max === 1 ? ' curso' : ' cursos') +
        ' e ja tem ' + c.cursos_usados + '. Mude de plano para criar mais.'
    };
  }
  return { pode: true, consumo: c };
}

/* Trava o envio de ficheiros quando o espaco nao chega.
   O tamanho do ficheiro que vai ser substituido nao conta,
   senao trocar uma capa gastava espaco duas vezes. */

async function podeGuardarBytes(idDono, bytes, bytesQueSaem) {
  const c = await consumoDe(idDono);
  const usados = Math.max(0, c.bytes_usados - numero(bytesQueSaem));

  if (c.bytes_max > 0 && usados + bytes > c.bytes_max) {
    return {
      pode: false,
      consumo: c,
      motivo: 'nao ha espaco no seu plano: ' + emMB(c.bytes_max - usados) +
        ' livres e este ficheiro tem ' + emMB(bytes) + '. Apague materiais ou mude de plano.'
    };
  }
  return { pode: true, consumo: c, usados: usados };
}

function emMB(bytes) {
  const mb = numero(bytes) / (1024 * 1024);
  if (mb >= 1024) return (Math.round(mb / 102.4) / 10) + ' GB';
  return Math.max(0, Math.round(mb * 10) / 10) + ' MB';
}

async function somarBytes(idDono, novoTotal) {
  await bubbleActualizar(T.user, idDono, { 'Bytes Usados': Math.max(0, Math.round(novoTotal)) });
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
    aceita_afiliados: !!curso['Aceita Afiliados'],
    comissao_afiliado: comissaoAfiliadoDe(curso),
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
    comissao_pct: COMISSAO_PCT,
    afiliado_min_pct: AFILIADO_MIN_PCT,
    afiliado_max_pct: AFILIADO_MAX_PCT,
    levantamento_min: LEVANTAMENTO_MIN,
    agora: estadoAgora(),
    idiomas: Object.keys(IDIOMAS).join(', ') + ' · /i18n.js',
    cartao: (MOPAY_EMAIL && MOPAY_SENHA)
      ? (SELF_URL ? 'configurado · webhook em /' + CARD_HOOK : 'falta o SELF_URL')
      : 'em falta (MOPAY_EMAIL e MOPAY_SENHA)'
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

  const campos = {
    'Token': codigo,
    'Token Confirmado': false,
    'Token Expires': expira
  };

  /* Conta nova: nome, papel e plano gratuito ficam logo aqui.
     Assim ninguem chega ao estudio sem plano atribuido. */

  if (!texto(utilizador['Nome Completo']) && texto(corpo.nome)) {
    campos['Nome Completo'] = texto(corpo.nome).slice(0, 120);
  }
  if (!texto(utilizador['Papel'])) {
    campos['Papel'] = 'Aluno';
  }
  if (!texto(utilizador['Plano Formador'])) {
    const gratuito = await planoDoFormador(null);
    if (gratuito) {
      campos['Plano Formador'] = gratuito._id;
      campos['Plano Desde'] = agora();
    }
    campos['Bytes Usados'] = numero(utilizador['Bytes Usados']);
  }

  await bubbleActualizar(T.user, idDono, campos);

  const enviado = await enviarEmail(
    email,
    'O seu codigo CURC: ' + codigo,
    moldeCodigo(texto(campos['Nome Completo'] || utilizador['Nome Completo']), codigo)
  );

  ok(res, { enviado: enviado, email: email, plano: texto(campos['Plano Formador']) || '' });
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
    saldo_afiliado: numero(utilizador['Saldo Afiliado MZN']),
    total_afiliado: numero(utilizador['Total Afiliado MZN']),
    levantamento_min: LEVANTAMENTO_MIN,
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

  /* Quem indicou esta venda, se alguem indicou. */
  let afiliado = await afiliadoPorCodigo(corpo.ref);
  if (afiliado && !afiliadoVale(afiliado, curso, idDono)) afiliado = null;

  const pctAfiliado = afiliado ? comissaoAfiliadoDe(curso) : 0;

  const resultado = await cobrarCarteira(metodo, numeroLimpo, nomeCliente, valor);
  const reparticao = repartir(valor, pctAfiliado);

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
    'Liquido MZN': resultado.sucesso ? reparticao.liquido : 0,
    'Afiliado': afiliado ? texto(afiliado['Utilizador']) : '',
    'Afiliado MZN': resultado.sucesso ? reparticao.afiliado : 0,
    'Ref Codigo': afiliado ? texto(afiliado['Codigo']) : ''
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
  if (afiliado) await creditarAfiliado(afiliado, reparticao.afiliado);

  if (cupaoUsado) {
    await bubbleActualizar(T.cupao, cupaoUsado._id, { 'Usos': numero(cupaoUsado['Usos']) + 1 });
  }

  log('Pagamento aceite', metodo, valor, 'MZN — curso', idItem,
      afiliado ? '(afiliado ' + texto(afiliado['Codigo']) + ')' : '');

  ok(res, {
    pago: true,
    valor: valor,
    transacao: resultado.transacao,
    pagamento: idPagamento,
    inscricao: idInscricao,
    afiliado: !!afiliado
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
   6I. PACOTES DE ESPACO
   ============================================================ */

/* Espaco comprado a parte. Nao expira, nao se perde ao mudar
   de plano, e soma-se ao que o plano ja da. Quem enche o
   espaco nao tem de saltar de plano so por causa disso. */

function pacotePublico(p) {
  return {
    id: p._id,
    nome: texto(p['Nome']),
    bytes: numero(p['Bytes']),
    legivel: emMB(numero(p['Bytes'])),
    preco: numero(p['Preco MZN']),
    ordem: numero(p['Ordem'])
  };
}

async function pacotesActivos() {
  const lista = await bubbleTodos(T.pacote, [
    restricao('Is Active', 'equals', true)
  ], { maximo: 50 });
  return lista.sort(function (a, b) { return numero(a['Ordem']) - numero(b['Ordem']); });
}

async function aplicarCompraPacote(idUtilizador, idPacote, valor, transacao, metodo, telefone) {
  const pacote = await bubblePorId(T.pacote, idPacote);
  if (!pacote) throw new Error('pacote desapareceu');

  const utilizador = await bubblePorId(T.user, idUtilizador);
  if (!utilizador) throw new Error('utilizador desapareceu');

  const bytes = numero(pacote['Bytes']);

  const idPagamento = await bubbleCriar(T.pagamento, {
    'User': idUtilizador,
    'Metodo': metodo || 'cartao',
    'Telefone': texto(telefone),
    'Valor MZN': valor,
    'Item Type': 'pacote',
    'Item Name': texto(pacote['Nome']),
    'Item ID': idPacote,
    'Estado': 'Pago',
    'Transaction': texto(transacao),
    'Message': 'Pacote de espaco',
    'Comissao MZN': valor,
    'Liquido MZN': 0
  });

  await bubbleActualizar(T.user, idUtilizador, {
    'Bytes Extra': numero(utilizador['Bytes Extra']) + bytes
  });

  return { pagamento: idPagamento, bytes: bytes };
}

rotas['POST /packs'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  const activos = await pacotesActivos();

  if (!idDono) {
    return ok(res, { pacotes: activos.map(pacotePublico) });
  }

  const c = await consumoDe(idDono);

  ok(res, {
    pacotes: activos.map(pacotePublico),
    bytes_usados: c.bytes_usados,
    bytes_plano: c.bytes_plano,
    bytes_extra: c.bytes_extra,
    bytes_max: c.bytes_max,
    bytes_livres: c.bytes_livres,
    espaco_legivel: emMB(c.bytes_usados) + ' de ' + emMB(c.bytes_max),
    extra_legivel: emMB(c.bytes_extra),
    plano: planoPublico(c.plano)
  });
};

rotas['POST /pay-pack'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  const idPacote = texto(corpo.pacote);
  const numeroBruto = texto(corpo.numero);
  let metodo = texto(corpo.metodo).toLowerCase();

  if (!idDono || !idPacote) return erro(res, 'owner ou pacote em falta');

  const utilizador = await bubblePorId(T.user, idDono);
  if (!utilizador) return erro(res, 'utilizador nao encontrado', 404);

  const pacote = await bubblePorId(T.pacote, idPacote);
  if (!pacote || !pacote['Is Active']) return erro(res, 'pacote nao disponivel', 404);

  const valor = numero(pacote['Preco MZN']);
  if (valor <= 0) return erro(res, 'este pacote nao tem preco definido');

  const numeroLimpo = normalizarNumero(numeroBruto);
  if (numeroLimpo.length !== 9) {
    return erro(res, 'numero invalido — devem ser 9 digitos, por exemplo 841234567');
  }

  if (!metodo) metodo = operadoraDoNumero(numeroLimpo);
  if (metodo !== 'mpesa' && metodo !== 'emola') {
    return erro(res, 'nao reconheci a operadora deste numero — escolha M-Pesa ou e-Mola');
  }

  const nomeCliente = texto(utilizador['Nome Completo']) || 'Cliente CURC';
  const resultado = await cobrarCarteira(metodo, numeroLimpo, nomeCliente, valor);

  if (!resultado.sucesso) {
    const idFalhado = await bubbleCriar(T.pagamento, {
      'User': idDono,
      'Metodo': metodo,
      'Telefone': numeroLimpo,
      'Valor MZN': valor,
      'Item Type': 'pacote',
      'Item Name': texto(pacote['Nome']),
      'Item ID': idPacote,
      'Estado': 'Falhou',
      'Message': resultado.mensagem,
      'Raw': resultado.bruto
    });
    return responder(res, 200, {
      ok: false,
      pago: false,
      erro: resultado.mensagem,
      codigo: resultado.codigo,
      pagamento: idFalhado
    });
  }

  const aplicado = await aplicarCompraPacote(
    idDono, idPacote, valor, resultado.transacao, metodo, numeroLimpo
  );

  const c = await consumoDe(idDono);

  log('Pacote de espaco vendido', metodo, valor, 'MZN —', texto(pacote['Nome']));

  ok(res, {
    pago: true,
    valor: valor,
    bytes: aplicado.bytes,
    pagamento: aplicado.pagamento,
    bytes_max: c.bytes_max,
    espaco_legivel: emMB(c.bytes_usados) + ' de ' + emMB(c.bytes_max)
  });
};

/* ============================================================
   6H. IDIOMAS
   ============================================================ */

/* As traducoes vivem aqui, num sitio so. As paginas carregam
   /i18n.js e marcam o texto com data-t. Assim nao ha oito
   copias das mesmas frases a divergir com o tempo.

   Bandeiras: a de Mocambique para portugues, porque e o
   mercado de casa. Nao e rigoroso — lingua nao e pais — mas
   e o que as pessoas reconhecem. */

const IDIOMAS = {
  pt: { nome: 'Português', bandeira: '🇲🇿', curto: 'PT' },
  en: { nome: 'English', bandeira: '🇬🇧', curto: 'EN' },
  fr: { nome: 'Français', bandeira: '🇫🇷', curto: 'FR' },
  es: { nome: 'Español', bandeira: '🇪🇸', curto: 'ES' }
};

const TRADUCOES = {
  /* ---------- comum ---------- */
  'comum.entrar':        ['Entrar', 'Sign in', 'Se connecter', 'Entrar'],
  'comum.criar_conta':   ['Criar conta', 'Create account', 'Créer un compte', 'Criar cuenta'],
  'comum.gratis':        ['Grátis', 'Free', 'Gratuit', 'Gratis'],
  'comum.cursos':        ['Cursos', 'Courses', 'Cours', 'Cursos'],
  'comum.aulas':         ['aulas', 'lessons', 'leçons', 'lecciones'],
  'comum.alunos':        ['alunos', 'students', 'étudiants', 'estudiantes'],
  'comum.voltar':        ['Voltar', 'Back', 'Retour', 'Volver'],
  'comum.cancelar':      ['Cancelar', 'Cancel', 'Annuler', 'Cancelar'],
  'comum.guardar':       ['Guardar', 'Save', 'Enregistrer', 'Guardar'],
  'comum.continuar':     ['Continuar', 'Continue', 'Continuer', 'Continuar'],
  'comum.procurar':      ['Procurar cursos…', 'Search courses…', 'Rechercher…', 'Buscar cursos…'],
  'comum.carregar':      ['A carregar…', 'Loading…', 'Chargement…', 'Cargando…'],
  'comum.meus_cursos':   ['Os meus cursos', 'My courses', 'Mes cours', 'Mis cursos'],
  'comum.catalogo':      ['Catálogo', 'Catalogue', 'Catalogue', 'Catálogo'],
  'comum.estudio':       ['Estúdio', 'Studio', 'Studio', 'Estudio'],
  'comum.sem_avaliacoes':['Ainda sem avaliações', 'No reviews yet', 'Pas encore d\'avis', 'Sin valoraciones'],

  /* ---------- landing ---------- */
  'lp.titulo1':   ['Aprenda o que precisa.', 'Learn what you need.', 'Apprenez ce dont vous avez besoin.', 'Aprenda lo que necesita.'],
  'lp.titulo2':   ['Ensine o que sabe.', 'Teach what you know.', 'Enseignez ce que vous savez.', 'Enseñe lo que sabe.'],
  'lp.entrada':   ['A plataforma moçambicana de cursos online. Pague por M-Pesa, e-Mola ou cartão, aprenda no telemóvel, e receba pelo que ensina.',
                   'The Mozambican online course platform. Pay by mobile wallet or card, learn on your phone, and earn from what you teach.',
                   'La plateforme mozambicaine de cours en ligne. Payez par portefeuille mobile ou carte, apprenez sur votre téléphone, et gagnez de ce que vous enseignez.',
                   'La plataforma mozambiqueña de cursos online. Pague con billetera móvil o tarjeta, aprenda en el móvil, y gane con lo que enseña.'],
  'lp.ver_cursos':['Ver os cursos', 'Browse courses', 'Voir les cours', 'Ver los cursos'],
  'lp.ensinar':   ['Quero ensinar', 'I want to teach', 'Je veux enseigner', 'Quiero enseñar'],
  'lp.destaque':  ['Cursos em destaque', 'Featured courses', 'Cours à la une', 'Cursos destacados'],
  'lp.destaque_sub':['Feitos por formadores moçambicanos. Veja a introdução antes de decidir.',
                     'Made by Mozambican instructors. Watch the intro before you decide.',
                     'Créés par des formateurs mozambicains. Regardez l\'introduction avant de décider.',
                     'Creados por formadores mozambiqueños. Vea la introducción antes de decidir.'],
  'lp.todos':     ['Ver o catálogo completo', 'See the full catalogue', 'Voir tout le catalogue', 'Ver el catálogo completo'],
  'lp.passos':    ['Três passos e está a aprender', 'Three steps and you are learning', 'Trois étapes et vous apprenez', 'Tres pasos y está aprendiendo'],
  'lp.passo1':    ['Escolha o curso', 'Choose a course', 'Choisissez un cours', 'Elija el curso'],
  'lp.passo1_t':  ['Veja o vídeo de introdução e as aulas livres antes de gastar um metical.',
                   'Watch the intro video and the free lessons before spending anything.',
                   'Regardez la vidéo d\'introduction et les leçons gratuites avant de payer.',
                   'Vea el vídeo de introducción y las clases libres antes de gastar nada.'],
  'lp.passo2':    ['Pague como puder', 'Pay how you can', 'Payez comme vous pouvez', 'Pague como pueda'],
  'lp.passo2_t':  ['M-Pesa, e-Mola, Visa ou Mastercard. O acesso abre na hora.',
                   'Mobile wallet, Visa or Mastercard. Access opens right away.',
                   'Portefeuille mobile, Visa ou Mastercard. L\'accès s\'ouvre aussitôt.',
                   'Billetera móvil, Visa o Mastercard. El acceso abre al momento.'],
  'lp.passo3':    ['Aprenda ao seu ritmo', 'Learn at your own pace', 'Apprenez à votre rythme', 'Aprenda a su ritmo'],
  'lp.passo3_t':  ['Sem prazo. O curso guarda onde ficou e retoma na aula seguinte.',
                   'No deadline. The course remembers where you stopped.',
                   'Sans délai. Le cours retient où vous vous êtes arrêté.',
                   'Sin plazo. El curso recuerda dónde se quedó.'],
  'lp.ensinar_t': ['O que sabe vale dinheiro', 'What you know is worth money', 'Ce que vous savez vaut de l\'argent', 'Lo que sabe vale dinero'],
  'lp.ensinar_s': ['Grave as aulas, defina o preço, e receba por cada venda. Nós tratamos do pagamento, do alojamento do vídeo e da área do aluno.',
                   'Record the lessons, set the price, get paid per sale. We handle payments, video hosting and the student area.',
                   'Enregistrez les leçons, fixez le prix, soyez payé à chaque vente. Nous gérons les paiements, l\'hébergement vidéo et l\'espace étudiant.',
                   'Grabe las clases, fije el precio, y cobre por cada venta. Nosotros cuidamos del pago, del alojamiento del vídeo y del área del alumno.'],
  'lp.comecar':   ['Começar a ensinar', 'Start teaching', 'Commencer à enseigner', 'Empezar a enseñar'],
  'lp.quanto':    ['Quanto fica para si', 'What you keep', 'Ce qui vous reste', 'Cuánto le queda'],
  'lp.planos':    ['Pague uma vez. Sem mensalidade.', 'Pay once. No monthly fee.', 'Payez une fois. Sans abonnement.', 'Pague una vez. Sin mensualidad.'],
  'lp.perguntas': ['O que costumam perguntar', 'Frequently asked', 'Questions fréquentes', 'Preguntas frecuentes'],
  'lp.hoje':      ['Comece hoje', 'Start today', 'Commencez aujourd\'hui', 'Empiece hoy'],

  /* ---------- catalogo e compra ---------- */
  'cat.disponiveis':  ['cursos disponíveis', 'courses available', 'cours disponibles', 'cursos disponibles'],
  'cat.nada':         ['Nenhum curso por aqui', 'No courses here', 'Aucun cours ici', 'Ningún curso aquí'],
  'cat.nada_t':       ['Experimente outra categoria, ou apague o que escreveu na procura.',
                       'Try another category, or clear your search.',
                       'Essayez une autre catégorie, ou effacez votre recherche.',
                       'Pruebe otra categoría, o borre la búsqueda.'],
  'cat.tudo':         ['Tudo', 'All', 'Tout', 'Todo'],
  'cat.niveis':       ['Todos os níveis', 'All levels', 'Tous niveaux', 'Todos los niveles'],
  'cat.recentes':     ['Mais recentes', 'Newest', 'Plus récents', 'Más recientes'],
  'cat.populares':    ['Mais procurados', 'Most popular', 'Plus populaires', 'Más buscados'],
  'cat.estrelas':     ['Melhor avaliados', 'Top rated', 'Mieux notés', 'Mejor valorados'],
  'cat.barato':       ['Preço mais baixo', 'Lowest price', 'Prix le plus bas', 'Precio más bajo'],
  'cat.caro':         ['Preço mais alto', 'Highest price', 'Prix le plus élevé', 'Precio más alto'],
  'cat.comprar':      ['Comprar curso', 'Buy course', 'Acheter le cours', 'Comprar curso'],
  'cat.inscrever':    ['Inscrever-me', 'Enrol', 'S\'inscrire', 'Inscribirme'],
  'cat.comecar':      ['Começar agora', 'Start now', 'Commencer', 'Empezar ahora'],
  'cat.continuar':    ['Continuar a aprender', 'Keep learning', 'Continuer', 'Seguir aprendiendo'],
  'cat.aprende':      ['O que vai saber fazer', 'What you will learn', 'Ce que vous allez apprendre', 'Lo que va a aprender'],
  'cat.sobre':        ['Sobre este curso', 'About this course', 'À propos du cours', 'Sobre este curso'],
  'cat.requisitos':   ['O que precisa de saber antes', 'What you need first', 'Prérequis', 'Lo que necesita saber antes'],
  'cat.programa':     ['Programa', 'Curriculum', 'Programme', 'Programa'],
  'cat.formador':     ['Quem ensina', 'Your instructor', 'Votre formateur', 'Quién enseña'],
  'cat.dizem':        ['O que dizem os alunos', 'What students say', 'Ce que disent les étudiants', 'Lo que dicen los alumnos'],
  'cat.acesso':       ['Acesso sem prazo', 'Lifetime access', 'Accès à vie', 'Acceso sin plazo'],
  'cat.telemovel':    ['Ver no telemóvel ou no computador', 'Watch on phone or computer', 'Sur téléphone ou ordinateur', 'Ver en móvil u ordenador'],
  'cat.certificado':  ['Certificado no fim', 'Certificate at the end', 'Certificat à la fin', 'Certificado al final'],

  /* ---------- pagamento ---------- */
  'pag.titulo':    ['Comprar curso', 'Buy course', 'Acheter le cours', 'Comprar curso'],
  'pag.cartao':    ['Cartão', 'Card', 'Carte', 'Tarjeta'],
  'pag.numero':    ['Número de telemóvel', 'Mobile number', 'Numéro de téléphone', 'Número de móvil'],
  'pag.numero_t':  ['Nove dígitos. Vai receber um pedido de confirmação no telemóvel.',
                    'Nine digits. You will get a confirmation prompt on your phone.',
                    'Neuf chiffres. Vous recevrez une demande de confirmation.',
                    'Nueve dígitos. Recibirá una solicitud de confirmación en el móvil.'],
  'pag.cartao_t':  ['Vai ser levado à página segura do banco para escrever os dados do cartão.',
                    'You will be taken to the bank\'s secure page to enter your card details.',
                    'Vous serez dirigé vers la page sécurisée de la banque.',
                    'Será llevado a la página segura del banco para escribir los datos de la tarjeta.'],
  'pag.cupao':     ['Cupão de desconto', 'Discount code', 'Code de réduction', 'Cupón de descuento'],
  'pag.total':     ['Total a pagar', 'Total', 'Total à payer', 'Total a pagar'],
  'pag.pagar':     ['Pagar agora', 'Pay now', 'Payer', 'Pagar ahora'],
  'pag.banco':     ['Continuar para o banco', 'Continue to the bank', 'Continuer vers la banque', 'Continuar al banco'],
  'pag.espera':    ['A aguardar confirmação', 'Waiting for confirmation', 'En attente de confirmation', 'Esperando confirmación'],
  'pag.espera_t':  ['Confirme o pagamento no seu telemóvel. Não feche esta janela.',
                    'Confirm the payment on your phone. Do not close this window.',
                    'Confirmez le paiement sur votre téléphone. Ne fermez pas cette fenêtre.',
                    'Confirme el pago en su móvil. No cierre esta ventana.'],
  'pag.aceite':    ['Pagamento aceite', 'Payment confirmed', 'Paiement confirmé', 'Pago aceptado'],
  'pag.aceite_t':  ['O curso já é seu. Pode começar quando quiser.',
                    'The course is yours. Start whenever you like.',
                    'Le cours est à vous. Commencez quand vous voulez.',
                    'El curso ya es suyo. Puede empezar cuando quiera.'],
  'pag.falhou':    ['O pagamento não passou', 'Payment did not go through', 'Le paiement a échoué', 'El pago no pasó'],
  'pag.outra':     ['Tentar outra vez', 'Try again', 'Réessayer', 'Intentar otra vez']
};

/* Monta o ficheiro JavaScript que as paginas carregam. */

function ficheiroIdiomas() {
  const codigos = Object.keys(IDIOMAS);
  const mapa = {};

  codigos.forEach(function (codigo, i) {
    mapa[codigo] = {};
    Object.keys(TRADUCOES).forEach(function (chave) {
      const linha = TRADUCOES[chave];
      /* Sem traducao, cai no portugues. Melhor uma palavra em
         portugues do que um espaco vazio no ecra. */
      mapa[codigo][chave] = linha[i] || linha[0];
    });
  });

  return `/* CURC — idiomas · ${VERSAO} · gerado pelo container */
(function(){
'use strict';

var IDIOMAS = ${JSON.stringify(IDIOMAS)};
var TEXTOS = ${JSON.stringify(mapa)};
var GUARDA = 'curc_lingua';

function suportado(codigo){
  codigo = String(codigo || '').toLowerCase().slice(0, 2);
  return TEXTOS[codigo] ? codigo : '';
}

/* A escolha da pessoa manda. Depois o browser. Depois portugues. */
function escolhida(){
  var guardada = '';
  try { guardada = window.localStorage.getItem(GUARDA) || ''; } catch (e) {}
  return suportado(guardada) ||
         suportado(navigator.language) ||
         suportado((navigator.languages || [])[0]) ||
         'pt';
}

var actual = escolhida();

function t(chave, substituicoes){
  var texto = (TEXTOS[actual] && TEXTOS[actual][chave]) ||
              (TEXTOS.pt && TEXTOS.pt[chave]) || chave;
  if (substituicoes) {
    Object.keys(substituicoes).forEach(function(k){
      texto = texto.split('{' + k + '}').join(substituicoes[k]);
    });
  }
  return texto;
}

/* Percorre o que estiver marcado e troca o texto.
   data-t         → o conteudo
   data-t-ph      → o placeholder
   data-t-titulo  → o title */
function aplicar(raiz){
  var zona = raiz || document;

  Array.prototype.forEach.call(zona.querySelectorAll('[data-t]'), function(el){
    el.textContent = t(el.getAttribute('data-t'));
  });
  Array.prototype.forEach.call(zona.querySelectorAll('[data-t-ph]'), function(el){
    el.setAttribute('placeholder', t(el.getAttribute('data-t-ph')));
  });
  Array.prototype.forEach.call(zona.querySelectorAll('[data-t-titulo]'), function(el){
    el.setAttribute('title', t(el.getAttribute('data-t-titulo')));
  });

  document.documentElement.setAttribute('lang', actual);
}

function trocar(codigo){
  var novo = suportado(codigo);
  if (!novo || novo === actual) return;
  actual = novo;
  try { window.localStorage.setItem(GUARDA, novo); } catch (e) {}
  aplicar();
  window.dispatchEvent(new CustomEvent('curc-lingua', { detail: novo }));
}

/* O selector de bandeiras, pronto a colar em qualquer topo. */
function selector(){
  var cx = document.createElement('div');
  cx.className = 'curc-linguas';
  cx.innerHTML = Object.keys(IDIOMAS).map(function(c){
    return '<button type="button" class="curc-lingua' + (c === actual ? ' on' : '') +
      '" data-lingua="' + c + '" title="' + IDIOMAS[c].nome + '" aria-label="' +
      IDIOMAS[c].nome + '">' + IDIOMAS[c].bandeira + '</button>';
  }).join('');

  Array.prototype.forEach.call(cx.querySelectorAll('[data-lingua]'), function(b){
    b.onclick = function(){
      trocar(b.getAttribute('data-lingua'));
      Array.prototype.forEach.call(cx.querySelectorAll('[data-lingua]'), function(o){
        o.classList.toggle('on', o.getAttribute('data-lingua') === actual);
      });
    };
  });

  return cx;
}

/* Estilo do selector, para as paginas nao terem de o repetir. */
var estilo = document.createElement('style');
estilo.textContent =
  '.curc-linguas{display:flex;gap:4px;align-items:center;flex:none}' +
  '.curc-lingua{background:none;border:1px solid transparent;border-radius:8px;' +
  'font-size:17px;line-height:1;padding:6px 7px;cursor:pointer;opacity:.45;' +
  'min-height:36px;transition:opacity .15s,border-color .15s}' +
  '.curc-lingua:hover{opacity:.85}' +
  '.curc-lingua.on{opacity:1;border-color:currentColor}' +
  '@media (max-width:640px){.curc-lingua{font-size:16px;padding:5px 5px}}';
document.head.appendChild(estilo);

window.curcT = {
  t: t,
  aplicar: aplicar,
  trocar: trocar,
  selector: selector,
  lingua: function(){ return actual; },
  idiomas: IDIOMAS
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function(){ aplicar(); });
} else {
  aplicar();
}

})();`;
}

/* ============================================================
   6G. PAGAMENTO POR CARTAO
   ============================================================ */

/* Aplica uma compra que ja foi paga. Serve o webhook do cartao
   e mantem a mesma reparticao do M-Pesa: plataforma, afiliado
   e formador. */

async function aplicarCompraCurso(idUtilizador, idCurso, valor, codigoRef, metodo, transacao, telefone) {
  const aluno = await bubblePorId(T.user, idUtilizador);
  const curso = await bubblePorId(T.curso, idCurso);
  if (!aluno || !curso) throw new Error('utilizador ou curso desapareceu');

  let afiliado = await afiliadoPorCodigo(codigoRef);
  if (afiliado && !afiliadoVale(afiliado, curso, idUtilizador)) afiliado = null;

  const pctAfiliado = afiliado ? comissaoAfiliadoDe(curso) : 0;
  const reparticao = repartir(valor, pctAfiliado);

  const idPagamento = await bubbleCriar(T.pagamento, {
    'User': idUtilizador,
    'Metodo': metodo || 'cartao',
    'Telefone': texto(telefone),
    'Valor MZN': valor,
    'Item Type': 'curso',
    'Item Name': texto(curso['Titulo']),
    'Item ID': idCurso,
    'Estado': 'Pago',
    'Transaction': texto(transacao),
    'Message': 'Pagamento por cartao',
    'Formador': texto(curso['Formador']),
    'Comissao MZN': reparticao.comissao,
    'Liquido MZN': reparticao.liquido,
    'Afiliado': afiliado ? texto(afiliado['Utilizador']) : '',
    'Afiliado MZN': reparticao.afiliado,
    'Ref Codigo': afiliado ? texto(afiliado['Codigo']) : ''
  });

  const idInscricao = await criarInscricao(aluno, curso, 'compra', valor);
  await creditarFormador(texto(curso['Formador']), reparticao.liquido);
  if (afiliado) await creditarAfiliado(afiliado, reparticao.afiliado);

  return { pagamento: idPagamento, inscricao: idInscricao };
}

async function aplicarCompraPlano(idUtilizador, idPlano, valor, transacao, metodo, telefone) {
  const plano = await bubblePorId(T.planoFormador, idPlano);
  if (!plano) throw new Error('plano desapareceu');

  const idPagamento = await bubbleCriar(T.pagamento, {
    'User': idUtilizador,
    'Metodo': metodo || 'cartao',
    'Telefone': texto(telefone),
    'Valor MZN': valor,
    'Item Type': 'plano',
    'Item Name': texto(plano['Nome']),
    'Item ID': idPlano,
    'Estado': 'Pago',
    'Transaction': texto(transacao),
    'Message': 'Adesao por cartao',
    'Comissao MZN': valor,
    'Liquido MZN': 0
  });

  await bubbleActualizar(T.user, idUtilizador, {
    'Plano Formador': idPlano,
    'Plano Desde': agora()
  });

  return { pagamento: idPagamento };
}

/* ---------- iniciar ---------- */

rotas['POST /pay-card'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  const tipo = texto(corpo.item_type) || 'curso';
  const idItem = texto(corpo.item_id);

  if (!idDono || !idItem) return erro(res, 'owner ou item_id em falta');
  if (['curso', 'plano', 'pacote'].indexOf(tipo) === -1) {
    return erro(res, 'item_type deve ser curso, plano ou pacote');
  }
  if (!SELF_URL) return erro(res, 'SELF_URL em falta no container');
  if (!APP_URL) return erro(res, 'APP_URL em falta no container');

  const utilizador = await bubblePorId(T.user, idDono);
  if (!utilizador) return erro(res, 'utilizador nao encontrado', 404);

  let valor = 0;
  let nomeItem = '';

  if (tipo === 'curso') {
    const curso = await bubblePorId(T.curso, idItem);
    if (!curso || curso['Is Deleted']) return erro(res, 'curso nao encontrado', 404);
    if (texto(curso['Estado']) !== 'Publicado') return erro(res, 'curso nao disponivel', 403);
    if (texto(curso['Formador']) === idDono) return erro(res, 'este curso e seu');

    const jaTem = await inscricaoDe(idDono, idItem);
    if (jaTem && jaTem['Is Active']) return erro(res, 'ja tem acesso a este curso');

    valor = precoEfectivo(curso);
    if (valor <= 0) return erro(res, 'este curso e gratis — use /enroll');
    nomeItem = texto(curso['Titulo']);
  }

  if (tipo === 'plano') {
    const plano = await bubblePorId(T.planoFormador, idItem);
    if (!plano || !plano['Is Active']) return erro(res, 'plano nao disponivel', 404);
    if (texto(utilizador['Plano Formador']) === idItem) return erro(res, 'ja esta neste plano');

    const cursos = await cursosVivosDe(idDono);
    const maxNovo = numero(plano['Max Cursos']);
    if (maxNovo > 0 && cursos.length > maxNovo) {
      return erro(res, 'tem ' + cursos.length + ' cursos e este plano so permite ' + maxNovo);
    }

    valor = numero(plano['Preco MZN']);
    if (valor <= 0) return erro(res, 'este plano e gratuito — use /pay-plan');
    nomeItem = 'Plano ' + texto(plano['Nome']);
  }

  if (tipo === 'pacote') {
    const pacote = await bubblePorId(T.pacote, idItem);
    if (!pacote || !pacote['Is Active']) return erro(res, 'pacote nao disponivel', 404);

    valor = numero(pacote['Preco MZN']);
    if (valor <= 0) return erro(res, 'este pacote nao tem preco definido');
    nomeItem = texto(pacote['Nome']);
  }

  const ref = referencia('CURC');

  /* A referencia e criada por nos antes de falar com a MoPayment.
     O webhook so aceita referencias que nos proprios criamos. */
  const idPendente = await bubbleCriar(T.cartaoPendente, {
    'Utilizador': idDono,
    'Item Type': tipo,
    'Item ID': idItem,
    'Item Nome': nomeItem,
    'Valor MZN': valor,
    'Referencia': ref,
    'Estado': 'Pendente',
    'Ref Afiliado': texto(corpo.ref).toUpperCase()
  });

  const voltar = APP_URL + '?ref=' + encodeURIComponent(ref);

  let saida;
  try {
    saida = await cartaoCheckout({
      valor: String(Math.round(valor)),
      nome_cliente: texto(utilizador['Nome Completo']) || 'Cliente CURC',
      carteira: MOZ_WALLET,
      return_url: voltar,
      nome_producto: nomeItem,
      webhook_url: SELF_URL + '/' + CARD_HOOK
    });
  } catch (e) {
    await bubbleActualizar(T.cartaoPendente, idPendente, {
      'Estado': 'Falhou',
      'Nota': e.message.slice(0, 400)
    });
    return erro(res, e.message);
  }

  log('Checkout de cartao criado', ref, valor, 'MZN');

  ok(res, {
    referencia: ref,
    valor: valor,
    item: nomeItem,
    checkout: saida.link,
    voltar: voltar
  });
};

/* A pagina de regresso pergunta por aqui se ja chegou o webhook. */

rotas['POST /payment-status'] = async function (req, res, corpo) {
  const ref = texto(corpo.referencia);
  if (!ref) return erro(res, 'referencia em falta');

  const achados = await bubbleTodos(T.cartaoPendente, [
    restricao('Referencia', 'equals', ref)
  ], { maximo: 1 });

  const p = achados[0];
  if (!p) return erro(res, 'referencia nao encontrada', 404);

  ok(res, {
    referencia: ref,
    estado: texto(p['Estado']) || 'Pendente',
    pago: texto(p['Estado']) === 'Pago',
    valor: numero(p['Valor MZN']),
    item: texto(p['Item Nome']),
    item_type: texto(p['Item Type']),
    item_id: texto(p['Item ID']),
    forma: texto(p['Forma']),
    nota: texto(p['Nota'])
  });
};

/* ---------- webhook ---------- */

/* A MoPayment nao assina o webhook. A proteccao e tripla: o
   endereco e secreto, a referencia tem de ser uma que nos
   criamos, e o valor tem de bater certo. Uma referencia ja
   aplicada nunca e aplicada outra vez. */

rotas['POST /' + CARD_HOOK] = async function (req, res, corpo) {
  const ref = texto(corpo.reference || corpo.referencia);
  const evento = texto(corpo.event || corpo.evento).toLowerCase();
  const estado = texto(corpo.status || corpo.estado).toUpperCase();
  const valorDito = numero(corpo.amount || corpo.valor);
  const transacao = texto(corpo.transaction_id || corpo.payment_id);

  /* A MoPayment manda mais coisas que valem a pena guardar:
     o motivo da recusa, o tipo de cartao e o telefone. */
  const motivo = texto(corpo.reason).slice(0, 300);
  const forma = texto(corpo.payment_method);
  const telefone = texto(corpo.phone);

  log('Webhook de cartao', ref || '(sem ref)',
      estado || '(sem estado)', valorDito, forma || '');

  /* A MoPayment manda o resultado em dois sitios: o evento
     (payment.completed) e o estado (PAID). Nem sempre vem os
     dois — basta um deles dizer que esta pago. */

  const pagou =
    /completed|succeeded|success|paid/.test(evento) ||
    ['PAID', 'COMPLETED', 'SUCCESS', 'SUCCEEDED'].indexOf(estado) !== -1;

  const falhou =
    /failed|cancel|expired|declin/.test(evento) ||
    ['FAILED', 'EXPIRED', 'CANCELLED', 'CANCELED', 'DECLINED'].indexOf(estado) !== -1;

  /* Responder sempre 200: um webhook que falha e repetido
     para sempre, e nao queremos isso por uma referencia velha. */
  if (!ref) return ok(res, { recebido: true, aplicado: false, motivo: 'sem referencia' });

  const achados = await bubbleTodos(T.cartaoPendente, [
    restricao('Referencia', 'equals', ref)
  ], { maximo: 1 });

  const p = achados[0];
  if (!p) {
    log('Webhook com referencia desconhecida:', ref);
    return ok(res, { recebido: true, aplicado: false, motivo: 'referencia desconhecida' });
  }

  if (texto(p['Estado']) === 'Pago') {
    return ok(res, { recebido: true, aplicado: false, motivo: 'ja tinha sido aplicado' });
  }

  if (!pagou) {
    /* So marca como falhado quando a MoPayment diz mesmo que
       falhou. Um webhook que nao percebemos deixa a referencia
       pendente — assim um aviso correcto que venha a seguir
       ainda consegue aplicar a compra. */
    if (falhou) {
      await bubbleActualizar(T.cartaoPendente, p._id, {
        'Estado': /expired/.test(evento) || estado === 'EXPIRED' ? 'Expirou' : 'Falhou',
        'Nota': (estado || evento || 'sem indicacao') + (motivo ? ' — ' + motivo : ''),
        'Forma': forma
      });
      return ok(res, { recebido: true, aplicado: false, motivo: motivo || 'pagamento nao concluido' });
    }

    log('Webhook nao reconhecido para', ref, '— fica pendente:', JSON.stringify(corpo).slice(0, 300));
    await bubbleActualizar(T.cartaoPendente, p._id, {
      'Nota': 'Aviso nao reconhecido: ' + (evento || estado || '?')
    });
    return ok(res, { recebido: true, aplicado: false, motivo: 'aviso nao reconhecido' });
  }

  const esperado = numero(p['Valor MZN']);
  if (valorDito > 0 && Math.abs(valorDito - esperado) > 1) {
    log('Webhook com valor errado:', ref, 'dito', valorDito, 'esperado', esperado);
    await bubbleActualizar(T.cartaoPendente, p._id, {
      'Estado': 'Suspeito',
      'Nota': 'Valor recebido ' + valorDito + ', esperado ' + esperado
    });
    return ok(res, { recebido: true, aplicado: false, motivo: 'valor nao bate certo' });
  }

  try {
    const idUtilizador = texto(p['Utilizador']);
    let resultado;

    const comoPagou = forma ? 'cartao · ' + forma : 'cartao';

    if (texto(p['Item Type']) === 'pacote') {
      resultado = await aplicarCompraPacote(
        idUtilizador, texto(p['Item ID']), esperado, transacao, comoPagou, telefone
      );
    } else if (texto(p['Item Type']) === 'plano') {
      resultado = await aplicarCompraPlano(
        idUtilizador, texto(p['Item ID']), esperado, transacao, comoPagou, telefone
      );
    } else {
      resultado = await aplicarCompraCurso(
        idUtilizador, texto(p['Item ID']), esperado,
        texto(p['Ref Afiliado']), comoPagou, transacao, telefone
      );
    }

    await bubbleActualizar(T.cartaoPendente, p._id, {
      'Estado': 'Pago',
      'Transaction': transacao,
      'Forma': forma,
      'Telefone': telefone,
      'Aplicado Data': agora()
    });

    log('Cartao aplicado', ref, esperado, 'MZN —', texto(p['Item Nome']));

    ok(res, { recebido: true, aplicado: true, pagamento: resultado.pagamento });
  } catch (e) {
    log('Falhou aplicar o cartao', ref, '—', e.message);
    await bubbleActualizar(T.cartaoPendente, p._id, {
      'Estado': 'Erro',
      'Nota': e.message.slice(0, 400)
    });
    ok(res, { recebido: true, aplicado: false, motivo: e.message });
  }
};

/* ============================================================
   6F. AULAS AO VIVO
   ============================================================ */

/* Modo de transmissao: so o formador publica. Um aluno de cada
   vez pode receber voz, e nessa altura ganha o privilegio de
   publicar. O token dele e refeito — nao se pode dar voz
   apenas no browser, senao qualquer um se promovia sozinho. */

function livePublica(l, agora_) {
  return {
    id: l._id,
    titulo: texto(l['Titulo']),
    canal: texto(l['Canal']),
    estado: texto(l['Estado']) || 'Agendada',
    inicio: l['Inicio'] || null,
    fim: l['Fim'] || null,
    duracao: numero(l['Duracao Segundos']),
    espectadores: numero(l['Total Espectadores']),
    ao_vivo: texto(l['Estado']) === 'Ao Vivo',
    passou: !!(l['Inicio'] && new Date(l['Inicio']).getTime() < (agora_ || Date.now()))
  };
}

rotas['POST /lives'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  const idCurso = texto(corpo.curso);
  if (!idCurso) return erro(res, 'curso em falta');

  const curso = await bubblePorId(T.curso, idCurso);
  if (!curso || curso['Is Deleted']) return erro(res, 'curso nao encontrado', 404);

  const eDono = idDono && texto(curso['Formador']) === idDono;

  if (!eDono) {
    try {
      await acessoAoCurso(idDono, curso);
    } catch (e) {
      return erro(res, e.message, 403);
    }
  }

  const lista = (await bubbleTodos(T.live, [
    restricao('Curso', 'equals', idCurso)
  ], { maximo: 200 })).filter(function (l) { return !l['Is Deleted']; });

  lista.sort(function (a, b) {
    return new Date(b['Inicio'] || 0) - new Date(a['Inicio'] || 0);
  });

  ok(res, {
    e_dono: !!eDono,
    agora_configurado: !!(AGORA_APP_ID && AGORA_APP_CERT),
    lives: lista.map(function (l) { return livePublica(l); })
  });
};

rotas['POST /live-save'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  const idCurso = texto(corpo.curso);
  const idLive = texto(corpo.live);

  await cursoDoFormador(idDono, idCurso);

  const titulo = texto(corpo.titulo).slice(0, 140);
  if (!titulo) return erro(res, 'a aula ao vivo precisa de um titulo');

  const campos = { 'Titulo': titulo };
  if (texto(corpo.inicio)) campos['Inicio'] = texto(corpo.inicio);

  if (idLive) {
    const live = await bubblePorId(T.live, idLive);
    if (!live || texto(live['Curso']) !== idCurso) return erro(res, 'aula nao encontrada', 404);
    if (texto(live['Estado']) === 'Ao Vivo') {
      return erro(res, 'nao pode editar uma aula que esta a decorrer');
    }
    await bubbleActualizar(T.live, idLive, campos);
    return ok(res, { live: idLive, novo: false });
  }

  campos['Curso'] = idCurso;
  campos['Formador'] = idDono;
  campos['Estado'] = 'Agendada';
  campos['Total Espectadores'] = 0;
  campos['Duracao Segundos'] = 0;
  campos['Is Deleted'] = false;

  const novo = await bubbleCriar(T.live, campos);

  /* O canal leva o id da aula. Fica unico sem esforco e nao
     revela nada sobre o curso. */
  const canal = 'curc-' + novo;
  await bubbleActualizar(T.live, novo, { 'Canal': canal });

  ok(res, { live: novo, novo: true, canal: canal });
};

rotas['POST /live-delete'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  const idCurso = texto(corpo.curso);
  const idLive = texto(corpo.live);

  await cursoDoFormador(idDono, idCurso);

  const live = await bubblePorId(T.live, idLive);
  if (!live || texto(live['Curso']) !== idCurso) return erro(res, 'aula nao encontrada', 404);
  if (texto(live['Estado']) === 'Ao Vivo') return erro(res, 'termine a aula antes de a apagar');

  await bubbleActualizar(T.live, idLive, { 'Is Deleted': true });
  ok(res, { apagado: true });
};

/* ---------- entrar ---------- */

/* O formador abre a sala e recebe o token de quem publica. */

rotas['POST /live-start'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  const idLive = texto(corpo.live);
  if (!idLive) return erro(res, 'live em falta');

  const live = await bubblePorId(T.live, idLive);
  if (!live || live['Is Deleted']) return erro(res, 'aula nao encontrada', 404);

  await cursoDoFormador(idDono, texto(live['Curso']));

  const canal = texto(live['Canal']) || ('curc-' + idLive);

  await bubbleActualizar(T.live, idLive, {
    'Estado': 'Ao Vivo',
    'Canal': canal,
    'Inicio Real': agora(),
    'Com Voz': '',
    'Maos': [],
    'Total Espectadores': 0
  });

  const uid = agoraUid(idDono);
  const emitido = agoraToken(
    AGORA_APP_ID, AGORA_APP_CERT, canal, String(uid),
    [AGORA_ENTRAR, AGORA_PUBLICAR_AUDIO, AGORA_PUBLICAR_VIDEO, AGORA_PUBLICAR_DADOS],
    AGORA_HORAS * 3600
  );

  log('Aula ao vivo aberta', canal);

  ok(res, {
    app_id: AGORA_APP_ID,
    canal: canal,
    uid: uid,
    token: emitido.token,
    validade: emitido.validade,
    papel: 'formador',
    titulo: texto(live['Titulo'])
  });
};

rotas['POST /live-end'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  const idLive = texto(corpo.live);

  const live = await bubblePorId(T.live, idLive);
  if (!live || live['Is Deleted']) return erro(res, 'aula nao encontrada', 404);

  await cursoDoFormador(idDono, texto(live['Curso']));

  const comecou = live['Inicio Real'] ? new Date(live['Inicio Real']).getTime() : 0;
  const duracao = comecou ? Math.round((Date.now() - comecou) / 1000) : 0;

  await bubbleActualizar(T.live, idLive, {
    'Estado': 'Terminada',
    'Fim': agora(),
    'Duracao Segundos': duracao,
    'Com Voz': '',
    'Maos': []
  });

  ok(res, { terminada: true, duracao: duracao });
};

/* O aluno entra a ver. Sem privilegio de publicar — o token
   dele nao lhe permite ligar a camara mesmo que tente. */

rotas['POST /live-join'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  const idLive = texto(corpo.live);
  if (!idDono || !idLive) return erro(res, 'owner ou live em falta');

  const live = await bubblePorId(T.live, idLive);
  if (!live || live['Is Deleted']) return erro(res, 'aula nao encontrada', 404);
  if (texto(live['Estado']) !== 'Ao Vivo') return erro(res, 'esta aula nao esta a decorrer');

  const curso = await bubblePorId(T.curso, texto(live['Curso']));
  if (!curso || curso['Is Deleted']) return erro(res, 'curso nao encontrado', 404);

  let direito;
  try {
    direito = await acessoAoCurso(idDono, curso);
  } catch (e) {
    return erro(res, e.message, 403);
  }

  const canal = texto(live['Canal']);
  const uid = agoraUid(idDono);

  /* Se o formador lhe deu voz, ganha os privilegios de publicar. */
  const comVoz = texto(live['Com Voz']) === idDono;

  const privilegios = direito.dono || comVoz
    ? [AGORA_ENTRAR, AGORA_PUBLICAR_AUDIO, AGORA_PUBLICAR_VIDEO, AGORA_PUBLICAR_DADOS]
    : [AGORA_ENTRAR];

  const emitido = agoraToken(
    AGORA_APP_ID, AGORA_APP_CERT, canal, String(uid),
    privilegios, AGORA_HORAS * 3600
  );

  await bubbleActualizar(T.live, idLive, {
    'Total Espectadores': numero(live['Total Espectadores']) + 1
  });

  ok(res, {
    app_id: AGORA_APP_ID,
    canal: canal,
    uid: uid,
    token: emitido.token,
    validade: emitido.validade,
    papel: (direito.dono || comVoz) ? 'orador' : 'espectador',
    titulo: texto(live['Titulo'])
  });
};

/* Dar ou tirar voz a um aluno. So o formador pode, e o aluno
   tem de voltar a pedir o token para a voz valer. */

rotas['POST /live-voz'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  const idLive = texto(corpo.live);
  const idAluno = texto(corpo.aluno);

  const live = await bubblePorId(T.live, idLive);
  if (!live || live['Is Deleted']) return erro(res, 'aula nao encontrada', 404);

  await cursoDoFormador(idDono, texto(live['Curso']));

  /* Aluno vazio tira a voz a quem a tinha.
     Quem recebe voz deixa de ter a mao no ar — ja foi atendido. */
  const maos = Array.isArray(live['Maos']) ? live['Maos'].map(texto).filter(Boolean) : [];
  const campos = { 'Com Voz': idAluno };
  if (idAluno) campos['Maos'] = maos.filter(function (m) { return m !== idAluno; });

  await bubbleActualizar(T.live, idLive, campos);

  ok(res, { com_voz: idAluno, uid: idAluno ? agoraUid(idAluno) : 0 });
};

/* ---------- pedir a palavra ---------- */

/* O aluno levanta a mao; o formador ve a lista e da voz a um.
   So o formador consulta em ciclo, por isso nao ha cinquenta
   pessoas a bater no Bubble ao mesmo tempo. */

rotas['POST /live-hand'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  const idLive = texto(corpo.live);
  const levantar = corpo.levantar !== false;

  if (!idDono || !idLive) return erro(res, 'owner ou live em falta');

  const live = await bubblePorId(T.live, idLive);
  if (!live || live['Is Deleted']) return erro(res, 'aula nao encontrada', 404);
  if (texto(live['Estado']) !== 'Ao Vivo') return erro(res, 'esta aula nao esta a decorrer');

  const curso = await bubblePorId(T.curso, texto(live['Curso']));
  if (!curso || curso['Is Deleted']) return erro(res, 'curso nao encontrado', 404);

  try {
    await acessoAoCurso(idDono, curso);
  } catch (e) {
    return erro(res, e.message, 403);
  }

  const maos = Array.isArray(live['Maos']) ? live['Maos'].map(texto).filter(Boolean) : [];
  const jaEsta = maos.indexOf(idDono) !== -1;

  let novas = maos;
  if (levantar && !jaEsta) novas = maos.concat([idDono]);
  if (!levantar && jaEsta) novas = maos.filter(function (m) { return m !== idDono; });

  if (novas !== maos) {
    await bubbleActualizar(T.live, idLive, { 'Maos': novas });
  }

  ok(res, { no_ar: levantar && novas.indexOf(idDono) !== -1, quantas: novas.length });
};

/* O estado da sala. O formador recebe a lista de quem pediu a
   palavra; o aluno recebe apenas o que lhe diz respeito. */

rotas['POST /live-state'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  const idLive = texto(corpo.live);
  if (!idLive) return erro(res, 'live em falta');

  const live = await bubblePorId(T.live, idLive);
  if (!live || live['Is Deleted']) return erro(res, 'aula nao encontrada', 404);

  const curso = await bubblePorId(T.curso, texto(live['Curso']));
  if (!curso || curso['Is Deleted']) return erro(res, 'curso nao encontrado', 404);

  const eDono = texto(curso['Formador']) === idDono;

  if (!eDono) {
    try {
      await acessoAoCurso(idDono, curso);
    } catch (e) {
      return erro(res, e.message, 403);
    }
  }

  const comVoz = texto(live['Com Voz']);
  const maos = Array.isArray(live['Maos']) ? live['Maos'].map(texto).filter(Boolean) : [];

  const base = {
    estado: texto(live['Estado']) || 'Agendada',
    ao_vivo: texto(live['Estado']) === 'Ao Vivo',
    espectadores: numero(live['Total Espectadores']),
    tenho_voz: !!(comVoz && comVoz === idDono),
    minha_mao: maos.indexOf(idDono) !== -1,
    voz_uid: comVoz ? agoraUid(comVoz) : 0
  };

  if (!eDono) return ok(res, base);

  /* Nomes so para o formador — o aluno nao precisa de saber
     quem mais esta na sala. */
  const pedidos = [];
  for (const id of maos.slice(0, 30)) {
    const p = await bubblePorId(T.user, id);
    pedidos.push({
      id: id,
      nome: p ? texto(p['Nome Completo']) : 'Alguém',
      foto: p ? texto(p['Foto URL']) : '',
      uid: agoraUid(id)
    });
  }

  const quemFala = comVoz ? await bubblePorId(T.user, comVoz) : null;

  ok(res, Object.assign(base, {
    e_dono: true,
    maos: pedidos,
    com_voz: comVoz ? {
      id: comVoz,
      nome: quemFala ? texto(quemFala['Nome Completo']) : 'Alguém',
      uid: agoraUid(comVoz)
    } : null
  }));
};

/* ---------- diagnostico ---------- */

rotas['POST /diag-agora'] = async function (req, res, corpo) {
  if (!UPLOAD_SECRET || texto(corpo.key) !== UPLOAD_SECRET) {
    return erro(res, 'chave invalida', 403);
  }

  const relatorio = {
    versao: VERSAO,
    app_id: AGORA_APP_ID ? (AGORA_APP_ID.slice(0, 6) + '…' + AGORA_APP_ID.slice(-4)) : '(em falta)',
    app_id_tamanho: AGORA_APP_ID.length,
    certificado: AGORA_APP_CERT ? 'definido (' + AGORA_APP_CERT.length + ' caracteres)' : '(em falta)',
    horas: AGORA_HORAS
  };

  if (!AGORA_APP_ID || !AGORA_APP_CERT) {
    relatorio.aviso = 'Sem App ID ou App Certificate nao ha aulas ao vivo. ' +
      'Ambos se obtem em console.agora.io, no projecto, com App Certificate activado.';
    return ok(res, relatorio);
  }

  try {
    const emitido = agoraToken(
      AGORA_APP_ID, AGORA_APP_CERT, 'curc-teste', '12345',
      [AGORA_ENTRAR, AGORA_PUBLICAR_AUDIO, AGORA_PUBLICAR_VIDEO], 3600
    );

    const lido = agoraLerToken(emitido.token);

    relatorio.token_tamanho = emitido.token.length;
    relatorio.comeca_por = emitido.token.slice(0, 3);
    relatorio.descodificado = lido;
    relatorio.conferido =
      lido.versao === '007' &&
      lido.app_id === AGORA_APP_ID &&
      lido.assinatura_bytes === 32 &&
      lido.sobrou === 0 &&
      lido.servicos.length === 1 &&
      lido.servicos[0].tipo === 1 &&
      lido.servicos[0].canal === 'curc-teste' &&
      lido.servicos[0].uid === '12345'
        ? 'ok — o empacotamento fecha certo'
        : 'ATENCAO — o token nao descodifica como esperado';
  } catch (e) {
    relatorio.erro = e.message;
  }

  ok(res, relatorio);
};

/* ============================================================
   6E. LEVANTAMENTOS
   ============================================================ */

/* Ha dois saldos separados: o que o formador ganhou a vender
   os cursos dele, e o que ganhou a indicar cursos de outros.
   Cada um levanta-se por si. */

const CARTEIRAS = {
  formador: { saldo: 'Saldo MZN', rotulo: 'vendas' },
  afiliado: { saldo: 'Saldo Afiliado MZN', rotulo: 'afiliado' }
};

function levantamentoPublico(l) {
  return {
    id: l._id,
    tipo: texto(l['Tipo']),
    valor: numero(l['Valor MZN']),
    metodo: texto(l['Metodo']),
    telefone: texto(l['Telefone']),
    estado: texto(l['Estado']) || 'Pedido',
    nota: texto(l['Nota']),
    referencia: texto(l['Referencia']),
    pedido: l['Created Date'] || null,
    processado: l['Processado Data'] || null
  };
}

rotas['POST /payout-request'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  const tipo = texto(corpo.tipo) || 'formador';
  const numeroBruto = texto(corpo.numero);
  let metodo = texto(corpo.metodo).toLowerCase();

  if (!idDono) return erro(res, 'owner em falta');

  const carteira = CARTEIRAS[tipo];
  if (!carteira) return erro(res, 'tipo deve ser formador ou afiliado');

  const utilizador = await bubblePorId(T.user, idDono);
  if (!utilizador) return erro(res, 'utilizador nao encontrado', 404);
  if (!utilizador['Token Confirmado']) return erro(res, 'confirme primeiro o seu email');

  const numeroLimpo = normalizarNumero(numeroBruto);
  if (numeroLimpo.length !== 9) {
    return erro(res, 'numero invalido — devem ser 9 digitos, por exemplo 841234567');
  }

  if (!metodo) metodo = operadoraDoNumero(numeroLimpo);
  if (metodo !== 'mpesa' && metodo !== 'emola') {
    return erro(res, 'nao reconheci a operadora deste numero — escolha M-Pesa ou e-Mola');
  }

  const saldo = numero(utilizador[carteira.saldo]);
  const pedido = Math.round(numero(corpo.valor)) || saldo;

  if (pedido < LEVANTAMENTO_MIN) {
    return erro(res, 'o levantamento minimo e de ' + LEVANTAMENTO_MIN + ' MZN');
  }
  if (pedido > saldo) {
    return erro(res, 'so tem ' + saldo + ' MZN disponiveis neste saldo');
  }

  /* Um pedido de cada vez por carteira. Dois pedidos ao mesmo
     tempo davam para levantar o mesmo dinheiro duas vezes. */
  const abertos = (await bubbleTodos(T.levantamento, [
    restricao('Utilizador', 'equals', idDono),
    restricao('Tipo', 'equals', tipo)
  ], { maximo: 50 })).filter(function (l) { return texto(l['Estado']) === 'Pedido'; });

  if (abertos.length) {
    return erro(res, 'ja tem um pedido a espera de ser processado');
  }

  /* O valor sai do saldo agora. Se for recusado, volta. */
  await bubbleActualizar(T.user, idDono, {
    [carteira.saldo]: saldo - pedido
  });

  const id = await bubbleCriar(T.levantamento, {
    'Utilizador': idDono,
    'Tipo': tipo,
    'Valor MZN': pedido,
    'Metodo': metodo,
    'Telefone': numeroLimpo,
    'Nome': texto(utilizador['Nome Completo']),
    'Estado': 'Pedido',
    'Referencia': referencia('LEV')
  });

  log('Levantamento pedido', pedido, 'MZN —', tipo, '—', numeroLimpo);

  ok(res, {
    levantamento: id,
    valor: pedido,
    saldo: saldo - pedido,
    metodo: metodo
  });
};

rotas['POST /my-payouts'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  if (!idDono) return erro(res, 'owner em falta');

  const utilizador = await bubblePorId(T.user, idDono);
  if (!utilizador) return erro(res, 'utilizador nao encontrado', 404);

  const meus = await bubbleTodos(T.levantamento, [
    restricao('Utilizador', 'equals', idDono)
  ], { maximo: 200 });

  meus.sort(function (a, b) {
    return new Date(b['Created Date'] || 0) - new Date(a['Created Date'] || 0);
  });

  const pagos = meus.filter(function (l) { return texto(l['Estado']) === 'Pago'; });

  ok(res, {
    pedidos: meus.map(levantamentoPublico),
    saldo_formador: numero(utilizador['Saldo MZN']),
    saldo_afiliado: numero(utilizador['Saldo Afiliado MZN']),
    total_ganho: numero(utilizador['Total Ganho MZN']),
    total_afiliado: numero(utilizador['Total Afiliado MZN']),
    ja_levantado: pagos.reduce(function (s, l) { return s + numero(l['Valor MZN']); }, 0),
    minimo: LEVANTAMENTO_MIN,
    a_espera: meus.some(function (l) { return texto(l['Estado']) === 'Pedido'; })
  });
};

/* ---------- lado de quem paga ---------- */

/* Protegidas pelo UPLOAD_SECRET. Nao ha painel de administracao
   no Bubble por agora: estas duas chamam-se a mao ou por um
   backend workflow. */

rotas['POST /payouts-admin'] = async function (req, res, corpo) {
  if (!UPLOAD_SECRET || texto(corpo.key) !== UPLOAD_SECRET) {
    return erro(res, 'chave invalida', 403);
  }

  const estado = texto(corpo.estado) || 'Pedido';
  const lista = (await bubbleTodos(T.levantamento, [], { maximo: 500 }))
    .filter(function (l) { return texto(l['Estado']) === estado; });

  lista.sort(function (a, b) {
    return new Date(a['Created Date'] || 0) - new Date(b['Created Date'] || 0);
  });

  const saida = [];
  for (const l of lista) {
    const pessoa = await bubblePorId(T.user, texto(l['Utilizador']));
    saida.push(Object.assign(levantamentoPublico(l), {
      nome: pessoa ? texto(pessoa['Nome Completo']) : texto(l['Nome']),
      email: pessoa && pessoa.authentication && pessoa.authentication.email
        ? texto(pessoa.authentication.email.email) : ''
    }));
  }

  ok(res, {
    estado: estado,
    total: saida.length,
    soma: saida.reduce(function (s, l) { return s + l.valor; }, 0),
    pedidos: saida
  });
};

rotas['POST /payout-settle'] = async function (req, res, corpo) {
  if (!UPLOAD_SECRET || texto(corpo.key) !== UPLOAD_SECRET) {
    return erro(res, 'chave invalida', 403);
  }

  const id = texto(corpo.levantamento);
  const estado = texto(corpo.estado);
  if (!id) return erro(res, 'levantamento em falta');
  if (estado !== 'Pago' && estado !== 'Recusado') {
    return erro(res, 'estado deve ser Pago ou Recusado');
  }

  const l = await bubblePorId(T.levantamento, id);
  if (!l) return erro(res, 'levantamento nao encontrado', 404);
  if (texto(l['Estado']) !== 'Pedido') {
    return erro(res, 'este pedido ja foi processado (' + texto(l['Estado']) + ')');
  }

  await bubbleActualizar(T.levantamento, id, {
    'Estado': estado,
    'Nota': texto(corpo.nota).slice(0, 500),
    'Referencia': texto(corpo.referencia) || texto(l['Referencia']),
    'Processado Data': agora()
  });

  /* Recusado: o dinheiro volta ao saldo de onde saiu. */
  if (estado === 'Recusado') {
    const carteira = CARTEIRAS[texto(l['Tipo'])] || CARTEIRAS.formador;
    const pessoa = await bubblePorId(T.user, texto(l['Utilizador']));
    if (pessoa) {
      await bubbleActualizar(T.user, texto(l['Utilizador']), {
        [carteira.saldo]: numero(pessoa[carteira.saldo]) + numero(l['Valor MZN'])
      });
    }
  }

  /* Avisar por email, se houver como. */
  const pessoa = await bubblePorId(T.user, texto(l['Utilizador']));
  const email = pessoa && pessoa.authentication && pessoa.authentication.email
    ? texto(pessoa.authentication.email.email) : '';

  if (email) {
    const pago = estado === 'Pago';
    await enviarEmail(
      email,
      pago ? 'O seu levantamento foi pago' : 'O seu levantamento nao foi processado',
      moldeLevantamento(texto(pessoa['Nome Completo']), l, estado, texto(corpo.nota))
    );
  }

  log('Levantamento', estado, id, numero(l['Valor MZN']), 'MZN');

  ok(res, { estado: estado, valor: numero(l['Valor MZN']) });
};

/* ============================================================
   6C. AFILIADOS
   ============================================================ */

/* Gera, ou devolve, o link desta pessoa para este curso.
   Qualquer pessoa com conta pode ser afiliada de qualquer
   curso que aceite afiliados. */

rotas['POST /affiliate-link'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  const idCurso = texto(corpo.curso);
  if (!idDono || !idCurso) return erro(res, 'owner ou curso em falta');

  const pessoa = await bubblePorId(T.user, idDono);
  if (!pessoa) return erro(res, 'utilizador nao encontrado', 404);
  if (!pessoa['Token Confirmado']) return erro(res, 'confirme primeiro o seu email');

  const curso = await bubblePorId(T.curso, idCurso);
  if (!curso || curso['Is Deleted']) return erro(res, 'curso nao encontrado', 404);
  if (texto(curso['Estado']) !== 'Publicado') return erro(res, 'curso nao disponivel', 403);

  const pct = comissaoAfiliadoDe(curso);
  if (pct <= 0) return erro(res, 'este curso nao aceita afiliados');
  if (texto(curso['Formador']) === idDono) return erro(res, 'este curso e seu');

  const jaTem = await bubbleTodos(T.afiliado, [
    restricao('Utilizador', 'equals', idDono),
    restricao('Curso', 'equals', idCurso)
  ], { maximo: 1 });

  let registo = jaTem[0];

  if (registo) {
    /* Reactiva em silencio se tinha sido desligado. */
    if (!registo['Is Active']) {
      await bubbleActualizar(T.afiliado, registo._id, { 'Is Active': true });
    }
  } else {
    const codigo = await codigoLivre();
    const idNovo = await bubbleCriar(T.afiliado, {
      'Utilizador': idDono,
      'Curso': idCurso,
      'Formador': texto(curso['Formador']),
      'Codigo': codigo,
      'Cliques': 0,
      'Vendas': 0,
      'Ganho MZN': 0,
      'Is Active': true
    });
    registo = { _id: idNovo, 'Codigo': codigo, 'Cliques': 0, 'Vendas': 0, 'Ganho MZN': 0 };
  }

  const codigo = texto(registo['Codigo']);
  const preco = precoEfectivo(curso);

  ok(res, {
    codigo: codigo,
    curso: idCurso,
    titulo: texto(curso['Titulo']),
    comissao_pct: pct,
    por_venda: Math.round(preco * (pct / 100)),
    preco: preco,
    cliques: numero(registo['Cliques']),
    vendas: numero(registo['Vendas']),
    ganho: numero(registo['Ganho MZN']),
    caminho: '?curso=' + encodeURIComponent(idCurso) + '&ref=' + encodeURIComponent(codigo)
  });
};

/* Conta um clique. Publica de proposito — quem visita o link
   ainda nao tem sessao nenhuma. */

rotas['POST /affiliate-hit'] = async function (req, res, corpo) {
  const codigo = texto(corpo.ref).toUpperCase();
  if (!codigo) return erro(res, 'ref em falta');

  const afiliado = await afiliadoPorCodigo(codigo);
  if (!afiliado) return ok(res, { contado: false });

  await bubbleActualizar(T.afiliado, afiliado._id, {
    'Cliques': numero(afiliado['Cliques']) + 1
  });

  ok(res, { contado: true, curso: texto(afiliado['Curso']) });
};

/* O painel de quem promove. */

rotas['POST /my-affiliates'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  if (!idDono) return erro(res, 'owner em falta');

  const pessoa = await bubblePorId(T.user, idDono);
  if (!pessoa) return erro(res, 'utilizador nao encontrado', 404);

  const meus = await bubbleTodos(T.afiliado, [
    restricao('Utilizador', 'equals', idDono)
  ], { maximo: 300 });

  const linhas = [];
  for (const a of meus) {
    const curso = await bubblePorId(T.curso, texto(a['Curso']));
    if (!curso || curso['Is Deleted']) continue;

    const pct = comissaoAfiliadoDe(curso);
    const preco = precoEfectivo(curso);

    linhas.push({
      id: a._id,
      codigo: texto(a['Codigo']),
      curso: curso._id,
      titulo: texto(curso['Titulo']),
      capa: texto(curso['Capa URL']),
      publicado: texto(curso['Estado']) === 'Publicado',
      aceita: pct > 0,
      comissao_pct: pct,
      preco: preco,
      por_venda: Math.round(preco * (pct / 100)),
      cliques: numero(a['Cliques']),
      vendas: numero(a['Vendas']),
      ganho: numero(a['Ganho MZN']),
      activo: !!a['Is Active'],
      caminho: '?curso=' + encodeURIComponent(curso._id) + '&ref=' + encodeURIComponent(texto(a['Codigo']))
    });
  }

  linhas.sort(function (a, b) { return b.ganho - a.ganho || b.cliques - a.cliques; });

  ok(res, {
    links: linhas,
    saldo: numero(pessoa['Saldo Afiliado MZN']),
    total_ganho: numero(pessoa['Total Afiliado MZN']),
    cliques: linhas.reduce(function (s, l) { return s + l.cliques; }, 0),
    vendas: linhas.reduce(function (s, l) { return s + l.vendas; }, 0),
    min_pct: AFILIADO_MIN_PCT,
    max_pct: AFILIADO_MAX_PCT
  });
};

/* Quem promove um curso meu, visto do lado do formador. */

rotas['POST /course-affiliates'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  const idCurso = texto(corpo.curso);

  const curso = await cursoDoFormador(idDono, idCurso);

  const lista = await bubbleTodos(T.afiliado, [
    restricao('Curso', 'equals', idCurso)
  ], { maximo: 500 });

  const linhas = [];
  for (const a of lista) {
    const pessoa = await bubblePorId(T.user, texto(a['Utilizador']));
    linhas.push({
      nome: pessoa ? texto(pessoa['Nome Completo']) : 'Sem nome',
      foto: pessoa ? texto(pessoa['Foto URL']) : '',
      codigo: texto(a['Codigo']),
      cliques: numero(a['Cliques']),
      vendas: numero(a['Vendas']),
      ganho: numero(a['Ganho MZN']),
      activo: !!a['Is Active']
    });
  }

  linhas.sort(function (a, b) { return b.vendas - a.vendas || b.cliques - a.cliques; });

  ok(res, {
    aceita: !!curso['Aceita Afiliados'],
    comissao_pct: comissaoAfiliadoDe(curso),
    min_pct: AFILIADO_MIN_PCT,
    max_pct: AFILIADO_MAX_PCT,
    afiliados: linhas,
    cliques: linhas.reduce(function (s, l) { return s + l.cliques; }, 0),
    vendas: linhas.reduce(function (s, l) { return s + l.vendas; }, 0),
    pago: linhas.reduce(function (s, l) { return s + l.ganho; }, 0)
  });
};

/* ============================================================
   6D. AREA DE MEMBRO DO CURSO
   ============================================================ */

/* Ficheiros de apoio. Nao aceito executaveis nem arquivos —
   nao ha razao para um curso precisar deles e sao um risco. */

const MATERIAIS_ACEITES = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a'
};

/* Um nome de ficheiro que sobreviva ao caminho do Bunny. */

function nomeSeguro(valor, extensao) {
  const limpo = texto(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._ -]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/\.{2,}/g, '.')      /* .. nunca chega ao caminho */
    .replace(/^[.-]+/, '')        /* nem nomes escondidos */
    .slice(0, 70);
  const semExtensao = limpo.replace(/\.[^.]*$/, '').replace(/[.-]+$/, '') || 'ficheiro';
  return semExtensao + '.' + extensao;
}

function anuncioPublico(a) {
  return {
    id: a._id,
    titulo: texto(a['Titulo']),
    texto: texto(a['Texto']),
    fixado: !!a['Fixado'],
    data: a['Created Date'] || null
  };
}

function materialPublico(m) {
  return {
    id: m._id,
    nome: texto(m['Nome']),
    tipo: texto(m['Tipo']),
    url: texto(m['URL']),
    bytes: numero(m['Bytes']),
    aula: texto(m['Aula']),
    data: m['Created Date'] || null
  };
}

/* Tudo o que a area de membro precisa, numa chamada so.
   Com rede fraca, cinco pedidos separados sao cinco hipoteses
   de falhar. */

rotas['POST /space'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  const idCurso = texto(corpo.curso);
  if (!idDono || !idCurso) return erro(res, 'owner ou curso em falta');

  const curso = await bubblePorId(T.curso, idCurso);
  if (!curso || curso['Is Deleted']) return erro(res, 'curso nao encontrado', 404);

  let direito;
  try {
    direito = await acessoAoCurso(idDono, curso);
  } catch (e) {
    return erro(res, e.message, 403);
  }

  const avisos = (await bubbleTodos(T.anuncio, [
    restricao('Curso', 'equals', idCurso)
  ], { maximo: 200 })).filter(function (a) { return !a['Is Deleted']; });

  avisos.sort(function (a, b) {
    if (!!b['Fixado'] !== !!a['Fixado']) return b['Fixado'] ? 1 : -1;
    return new Date(b['Created Date'] || 0) - new Date(a['Created Date'] || 0);
  });

  const materiais = (await bubbleTodos(T.material, [
    restricao('Curso', 'equals', idCurso)
  ], { maximo: 300 })).filter(function (m) { return !m['Is Deleted']; });

  const duvidas = (await bubbleTodos(T.duvida, [
    restricao('Curso', 'equals', idCurso)
  ], { maximo: 300 })).filter(function (d) { return !d['Is Deleted']; });

  duvidas.sort(function (a, b) {
    return new Date(b['Created Date'] || 0) - new Date(a['Created Date'] || 0);
  });

  /* As respostas vem todas de uma vez e agrupam-se aqui,
     em vez de uma chamada por duvida. */
  const respostas = (await bubbleTodos(T.resposta, [
    restricao('Curso', 'equals', idCurso)
  ], { maximo: 1000 })).filter(function (r) { return !r['Is Deleted']; });

  const nomes = {};
  const porPessoa = Array.from(new Set(
    duvidas.map(function (d) { return texto(d['Aluno']); })
      .concat(respostas.map(function (r) { return texto(r['Autor']); }))
      .filter(Boolean)
  ));
  for (const id of porPessoa) {
    const p = await bubblePorId(T.user, id);
    nomes[id] = p ? { nome: texto(p['Nome Completo']), foto: texto(p['Foto URL']) } : null;
  }

  const agrupadas = {};
  respostas.forEach(function (r) {
    const chave = texto(r['Duvida']);
    if (!agrupadas[chave]) agrupadas[chave] = [];
    const quem = nomes[texto(r['Autor'])] || {};
    agrupadas[chave].push({
      id: r._id,
      texto: texto(r['Texto']),
      autor: quem.nome || 'Alguém',
      foto: quem.foto || '',
      do_formador: !!r['E Formador'],
      meu: texto(r['Autor']) === idDono,
      data: r['Created Date'] || null
    });
  });

  Object.keys(agrupadas).forEach(function (k) {
    agrupadas[k].sort(function (a, b) {
      return new Date(a.data || 0) - new Date(b.data || 0);
    });
  });

  const formador = await bubblePorId(T.user, texto(curso['Formador']));

  ok(res, {
    curso: {
      id: curso._id,
      titulo: texto(curso['Titulo']),
      capa: texto(curso['Capa URL']),
      cor: texto(curso['Cor Marca']),
      logo: texto(curso['Logo URL']),
      boas_vindas: texto(curso['Boas Vindas']),
      total_aulas: numero(curso['Total Aulas']),
      duracao: numero(curso['Duracao Segundos'])
    },
    formador: formadorPublico(formador),
    e_dono: !!direito.dono,
    inscricao: direito.inscricao ? {
      progresso: numero(direito.inscricao['Progresso Pct']),
      aulas_concluidas: numero(direito.inscricao['Aulas Concluidas']),
      concluido: !!direito.inscricao['Concluido'],
      ultima_aula: texto(direito.inscricao['Ultima Aula'])
    } : null,
    avisos: avisos.map(anuncioPublico),
    materiais: materiais.map(materialPublico),
    duvidas: duvidas.map(function (d) {
      const quem = nomes[texto(d['Aluno'])] || {};
      return {
        id: d._id,
        texto: texto(d['Texto']),
        aula: texto(d['Aula']),
        autor: quem.nome || 'Alguém',
        foto: quem.foto || '',
        meu: texto(d['Aluno']) === idDono,
        respondida: !!d['Respondida'],
        data: d['Created Date'] || null,
        respostas: agrupadas[d._id] || []
      };
    })
  });
};

/* ---------- avisos do formador ---------- */

rotas['POST /announce'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  const idCurso = texto(corpo.curso);
  const idAviso = texto(corpo.aviso);

  await cursoDoFormador(idDono, idCurso);

  const titulo = texto(corpo.titulo).slice(0, 140);
  const conteudo = texto(corpo.texto).slice(0, 4000);
  if (!titulo && !conteudo) return erro(res, 'o aviso precisa de titulo ou texto');

  const campos = {
    'Titulo': titulo,
    'Texto': conteudo,
    'Fixado': corpo.fixado === true
  };

  if (idAviso) {
    const aviso = await bubblePorId(T.anuncio, idAviso);
    if (!aviso || texto(aviso['Curso']) !== idCurso) return erro(res, 'aviso nao encontrado', 404);
    await bubbleActualizar(T.anuncio, idAviso, campos);
    return ok(res, { aviso: idAviso, novo: false });
  }

  campos['Curso'] = idCurso;
  campos['Formador'] = idDono;
  campos['Is Deleted'] = false;

  const novo = await bubbleCriar(T.anuncio, campos);
  ok(res, { aviso: novo, novo: true });
};

rotas['POST /announce-delete'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  const idCurso = texto(corpo.curso);
  const idAviso = texto(corpo.aviso);

  await cursoDoFormador(idDono, idCurso);

  const aviso = await bubblePorId(T.anuncio, idAviso);
  if (!aviso || texto(aviso['Curso']) !== idCurso) return erro(res, 'aviso nao encontrado', 404);

  await bubbleActualizar(T.anuncio, idAviso, { 'Is Deleted': true });
  ok(res, { apagado: true });
};

/* ---------- duvidas ---------- */

rotas['POST /ask'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  const idCurso = texto(corpo.curso);
  const conteudo = texto(corpo.texto).slice(0, 2000);

  if (!idDono || !idCurso) return erro(res, 'owner ou curso em falta');
  if (conteudo.length < 3) return erro(res, 'escreva a sua duvida');

  const curso = await bubblePorId(T.curso, idCurso);
  if (!curso || curso['Is Deleted']) return erro(res, 'curso nao encontrado', 404);

  try {
    await acessoAoCurso(idDono, curso);
  } catch (e) {
    return erro(res, e.message, 403);
  }

  const id = await bubbleCriar(T.duvida, {
    'Curso': idCurso,
    'Aluno': idDono,
    'Aula': texto(corpo.aula),
    'Formador': texto(curso['Formador']),
    'Texto': conteudo,
    'Respondida': false,
    'Is Deleted': false
  });

  ok(res, { duvida: id });
};

rotas['POST /answer'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  const idDuvida = texto(corpo.duvida);
  const conteudo = texto(corpo.texto).slice(0, 2000);

  if (!idDono || !idDuvida) return erro(res, 'owner ou duvida em falta');
  if (conteudo.length < 2) return erro(res, 'escreva a resposta');

  const duvida = await bubblePorId(T.duvida, idDuvida);
  if (!duvida || duvida['Is Deleted']) return erro(res, 'duvida nao encontrada', 404);

  const curso = await bubblePorId(T.curso, texto(duvida['Curso']));
  if (!curso || curso['Is Deleted']) return erro(res, 'curso nao encontrado', 404);

  let direito;
  try {
    direito = await acessoAoCurso(idDono, curso);
  } catch (e) {
    return erro(res, e.message, 403);
  }

  const id = await bubbleCriar(T.resposta, {
    'Duvida': idDuvida,
    'Curso': curso._id,
    'Autor': idDono,
    'Texto': conteudo,
    'E Formador': !!direito.dono,
    'Is Deleted': false
  });

  /* So a resposta do formador fecha a duvida. */
  if (direito.dono && !duvida['Respondida']) {
    await bubbleActualizar(T.duvida, idDuvida, { 'Respondida': true });
  }

  ok(res, { resposta: id, do_formador: !!direito.dono });
};

/* Cada um apaga o que escreveu. O formador apaga o que quiser
   no curso dele — e ele que responde por aquele espaco. */

rotas['POST /question-delete'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  const idDuvida = texto(corpo.duvida);
  const idResposta = texto(corpo.resposta);

  if (!idDono) return erro(res, 'owner em falta');

  if (idResposta) {
    const resposta = await bubblePorId(T.resposta, idResposta);
    if (!resposta || resposta['Is Deleted']) return erro(res, 'resposta nao encontrada', 404);

    const curso = await bubblePorId(T.curso, texto(resposta['Curso']));
    const eDono = curso && texto(curso['Formador']) === idDono;
    if (texto(resposta['Autor']) !== idDono && !eDono) {
      return erro(res, 'nao pode apagar isto', 403);
    }

    await bubbleActualizar(T.resposta, idResposta, { 'Is Deleted': true });
    return ok(res, { apagado: 'resposta' });
  }

  const duvida = await bubblePorId(T.duvida, idDuvida);
  if (!duvida || duvida['Is Deleted']) return erro(res, 'duvida nao encontrada', 404);

  const curso = await bubblePorId(T.curso, texto(duvida['Curso']));
  const eDono = curso && texto(curso['Formador']) === idDono;
  if (texto(duvida['Aluno']) !== idDono && !eDono) {
    return erro(res, 'nao pode apagar isto', 403);
  }

  await bubbleActualizar(T.duvida, idDuvida, { 'Is Deleted': true });
  ok(res, { apagado: 'duvida' });
};

/* ---------- materiais ---------- */

rotas['POST /material-upload'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  const idCurso = texto(corpo.curso);
  const tipoMime = texto(corpo.mime).toLowerCase();
  const base64 = texto(corpo.dados);

  await cursoDoFormador(idDono, idCurso);

  if (!base64) return erro(res, 'ficheiro em falta');

  const extensao = MATERIAIS_ACEITES[tipoMime];
  if (!extensao) {
    return erro(res, 'tipo de ficheiro nao aceite. Use PDF, Word, Excel, PowerPoint, texto, imagem ou audio');
  }

  const bytes = Buffer.from(base64.replace(/^data:[^,]+,/, ''), 'base64');
  if (!bytes.length) return erro(res, 'ficheiro vazio');
  if (bytes.length > 25 * 1024 * 1024) return erro(res, 'o ficheiro passa dos 25 MB');

  const cabe = await podeGuardarBytes(idDono, bytes.length, 0);
  if (!cabe.pode) return erro(res, cabe.motivo);

  const nome = nomeSeguro(corpo.nome, extensao);
  const caminho = 'materiais/' + idCurso + '/' + Date.now() + '-' + nome;

  const url = await storageGuardar(caminho, bytes, tipoMime);

  const id = await bubbleCriar(T.material, {
    'Curso': idCurso,
    'Formador': idDono,
    'Aula': texto(corpo.aula),
    'Nome': texto(corpo.nome).slice(0, 140) || nome,
    'Tipo': extensao,
    'URL': url,
    'Path': caminho,
    'Bytes': bytes.length,
    'Is Deleted': false
  });

  await somarBytes(idDono, cabe.usados + bytes.length);

  ok(res, {
    material: id,
    url: url,
    nome: texto(corpo.nome) || nome,
    tipo: extensao,
    bytes: bytes.length,
    bytes_usados: cabe.usados + bytes.length
  });
};

rotas['POST /material-delete'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  const idCurso = texto(corpo.curso);
  const idMaterial = texto(corpo.material);

  await cursoDoFormador(idDono, idCurso);

  const material = await bubblePorId(T.material, idMaterial);
  if (!material || texto(material['Curso']) !== idCurso) {
    return erro(res, 'material nao encontrado', 404);
  }

  const caminho = texto(material['Path']);
  const bytes = numero(material['Bytes']);

  if (caminho) await storageApagar(caminho);
  await bubbleActualizar(T.material, idMaterial, { 'Is Deleted': true });

  const utilizador = await bubblePorId(T.user, idDono);
  if (utilizador && bytes > 0) {
    await somarBytes(idDono, numero(utilizador['Bytes Usados']) - bytes);
  }

  ok(res, { apagado: true, libertou: emMB(bytes) });
};

/* O formador ve tudo do lado dele, mesmo o que ainda nao publicou. */

rotas['POST /studio-space'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  const idCurso = texto(corpo.curso);

  const curso = await cursoDoFormador(idDono, idCurso);

  const avisos = (await bubbleTodos(T.anuncio, [
    restricao('Curso', 'equals', idCurso)
  ], { maximo: 200 })).filter(function (a) { return !a['Is Deleted']; });

  const materiais = (await bubbleTodos(T.material, [
    restricao('Curso', 'equals', idCurso)
  ], { maximo: 300 })).filter(function (m) { return !m['Is Deleted']; });

  const duvidas = (await bubbleTodos(T.duvida, [
    restricao('Curso', 'equals', idCurso)
  ], { maximo: 300 })).filter(function (d) { return !d['Is Deleted']; });

  const porResponder = duvidas.filter(function (d) { return !d['Respondida']; }).length;

  ok(res, {
    marca: {
      cor: texto(curso['Cor Marca']),
      logo: texto(curso['Logo URL']),
      boas_vindas: texto(curso['Boas Vindas'])
    },
    avisos: avisos.map(anuncioPublico),
    materiais: materiais.map(materialPublico),
    duvidas_total: duvidas.length,
    duvidas_por_responder: porResponder,
    bytes_materiais: materiais.reduce(function (s, m) { return s + numero(m['Bytes']); }, 0)
  });
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

  const gratuito = await planoDoFormador(null);

  await bubbleActualizar(T.user, idDono, {
    'Papel': 'Formador',
    'Formador Aprovado': true,
    'Bio': texto(corpo.bio) || texto(utilizador['Bio']),
    'Telefone': texto(corpo.telefone) || texto(utilizador['Telefone']),
    'Plano Formador': gratuito ? gratuito._id : '',
    'Plano Desde': agora(),
    'Bytes Usados': numero(utilizador['Bytes Usados'])
  });

  ok(res, { formador: true, ja: false, plano: planoPublico(gratuito) });
};

/* ---------- planos do formador ---------- */

rotas['POST /author-plans'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  const activos = await planosActivos();

  if (!idDono) {
    return ok(res, {
      planos: activos.map(function (p) { return planoPublico(p); }),
      comissao_pct: COMISSAO_PCT
    });
  }

  const c = await consumoDe(idDono);

  ok(res, {
    planos: activos.map(function (p) {
      return planoPublico(p, { actual: !!(c.plano && c.plano._id === p._id) });
    }),
    meu: planoPublico(c.plano),
    cursos_usados: c.cursos_usados,
    cursos_max: c.cursos_max,
    cursos_ilimitados: c.cursos_ilimitados,
    bytes_usados: c.bytes_usados,
    bytes_max: c.bytes_max,
    bytes_plano: c.bytes_plano,
    bytes_extra: c.bytes_extra,
    bytes_livres: c.bytes_livres,
    espaco_legivel: emMB(c.bytes_usados) + ' de ' + emMB(c.bytes_max),
    plano_desde: (c.utilizador && c.utilizador['Plano Desde']) || null,
    comissao_pct: COMISSAO_PCT
  });
};

/* Adesao ao plano — pagamento unico, sem mensalidade.
   Nao ha comissao a repartir: a adesao e toda da plataforma. */

rotas['POST /pay-plan'] = async function (req, res, corpo) {
  const idDono = texto(corpo.owner);
  const idPlano = texto(corpo.plano);
  const numeroBruto = texto(corpo.numero);
  let metodo = texto(corpo.metodo).toLowerCase();

  if (!idDono || !idPlano) return erro(res, 'owner ou plano em falta');

  const utilizador = await bubblePorId(T.user, idDono);
  if (!utilizador) return erro(res, 'utilizador nao encontrado', 404);

  const plano = await bubblePorId(T.planoFormador, idPlano);
  if (!plano || !plano['Is Active']) return erro(res, 'plano nao disponivel', 404);

  if (texto(utilizador['Plano Formador']) === idPlano) {
    return erro(res, 'ja esta neste plano');
  }

  const valor = numero(plano['Preco MZN']);

  /* O plano gratuito nao passa pela MoPayment. */
  if (valor <= 0) {
    await bubbleActualizar(T.user, idDono, {
      'Plano Formador': idPlano,
      'Plano Desde': agora()
    });
    return ok(res, { pago: true, gratis: true, plano: planoPublico(plano) });
  }

  /* O espaco comprado a parte nao se perde ao mudar de plano.
     Descer de plano nao pode deixar o formador acima do limite novo. */
  const cursos = await cursosVivosDe(idDono);
  const maxNovo = numero(plano['Max Cursos']);
  if (maxNovo > 0 && cursos.length > maxNovo) {
    return erro(res, 'tem ' + cursos.length + ' cursos e este plano so permite ' +
      maxNovo + '. Apague os que sobram antes de mudar.');
  }

  const numeroLimpo = normalizarNumero(numeroBruto);
  if (numeroLimpo.length !== 9) {
    return erro(res, 'numero invalido — devem ser 9 digitos, por exemplo 841234567');
  }

  if (!metodo) metodo = operadoraDoNumero(numeroLimpo);
  if (metodo !== 'mpesa' && metodo !== 'emola') {
    return erro(res, 'nao reconheci a operadora deste numero — escolha M-Pesa ou e-Mola');
  }

  const nomeCliente = texto(utilizador['Nome Completo']) || 'Formador CURC';
  const resultado = await cobrarCarteira(metodo, numeroLimpo, nomeCliente, valor);

  const idPagamento = await bubbleCriar(T.pagamento, {
    'User': idDono,
    'Metodo': metodo,
    'Telefone': numeroLimpo,
    'Valor MZN': valor,
    'Item Type': 'plano',
    'Item Name': texto(plano['Nome']),
    'Item ID': idPlano,
    'Estado': resultado.sucesso ? 'Pago' : 'Falhou',
    'Transaction': resultado.transacao,
    'Message': resultado.mensagem,
    'Raw': resultado.bruto,
    'Comissao MZN': resultado.sucesso ? valor : 0,
    'Liquido MZN': 0
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

  await bubbleActualizar(T.user, idDono, {
    'Plano Formador': idPlano,
    'Plano Desde': agora()
  });

  log('Adesao aceite', metodo, valor, 'MZN — plano', texto(plano['Nome']));

  ok(res, {
    pago: true,
    valor: valor,
    transacao: resultado.transacao,
    pagamento: idPagamento,
    plano: planoPublico(plano)
  });
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

  const c = await consumoDe(idDono);

  ok(res, {
    saldo: numero(utilizador['Saldo MZN']),
    total_ganho: numero(utilizador['Total Ganho MZN']),
    cursos_total: cursos.length,
    cursos_publicados: publicados.length,
    alunos: alunosUnicos.size,
    inscricoes: inscricoes.length,
    comissao_pct: COMISSAO_PCT,
    plano: planoPublico(c.plano),
    cursos_max: c.cursos_max,
    cursos_ilimitados: c.cursos_ilimitados,
    pode_criar: c.cursos_ilimitados || c.cursos_usados < c.cursos_max,
    bytes_usados: c.bytes_usados,
    bytes_max: c.bytes_max,
    bytes_plano: c.bytes_plano,
    bytes_extra: c.bytes_extra,
    espaco_legivel: emMB(c.bytes_usados) + ' de ' + emMB(c.bytes_max),
    levantamento_min: LEVANTAMENTO_MIN
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

  /* Marca propria da area de membro. */
  if (veio('cor_marca')) {
    const cor = texto(corpo.cor_marca);
    campos['Cor Marca'] = /^#[0-9A-Fa-f]{6}$/.test(cor) ? cor : '';
  }
  if (veio('boas_vindas')) campos['Boas Vindas'] = texto(corpo.boas_vindas).slice(0, 1000);

  /* Afiliados. O minimo e obrigatorio: quem liga tem de dar
     pelo menos AFILIADO_MIN_PCT, senao nao vale a pena a ninguem. */
  if (veio('aceita_afiliados')) {
    const liga = corpo.aceita_afiliados === true;
    campos['Aceita Afiliados'] = liga;
    if (!liga) campos['Comissao Afiliado Pct'] = 0;
  }
  if (veio('comissao_afiliado')) {
    const pct = Math.round(numero(corpo.comissao_afiliado));
    const liga = veio('aceita_afiliados')
      ? corpo.aceita_afiliados === true
      : !!anterior['Aceita Afiliados'];

    if (liga) {
      if (pct < AFILIADO_MIN_PCT) {
        return erro(res, 'a comissao do afiliado nao pode ser menor que ' + AFILIADO_MIN_PCT + '%');
      }
      if (pct > AFILIADO_MAX_PCT) {
        return erro(res, 'a comissao do afiliado nao pode passar dos ' + AFILIADO_MAX_PCT + '%');
      }
      campos['Comissao Afiliado Pct'] = pct;
    }
  }

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

  /* So aqui, na criacao. Editar um curso que ja existe nunca
     e travado, mesmo que o formador tenha descido de plano. */
  const cabe = await podeCriarCurso(idDono);
  if (!cabe.pode) return erro(res, cabe.motivo);

  campos['Formador'] = idDono;
  campos['Slug'] = slugificar(titulo) + '-' + codigoAleatorio(4).toLowerCase();
  campos['Estado'] = 'Rascunho';
  campos['Total Aulas'] = 0;
  campos['Total Alunos'] = 0;
  campos['Duracao Segundos'] = 0;
  campos['Media Estrelas'] = 0;
  campos['Total Avaliacoes'] = 0;
  campos['Is Deleted'] = false;
  if (!veio('aceita_afiliados')) campos['Aceita Afiliados'] = false;
  if (!veio('comissao_afiliado')) campos['Comissao Afiliado Pct'] = 0;

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

  /* A capa sai do disco e da conta de espaco. */
  const caminhoCapa = texto(curso['Capa Path']);
  const bytesCapa = numero(curso['Capa Bytes']);
  if (caminhoCapa) await storageApagar(caminhoCapa);
  if (bytesCapa > 0) {
    const utilizador = await bubblePorId(T.user, idDono);
    if (utilizador) {
      await somarBytes(idDono, numero(utilizador['Bytes Usados']) - bytesCapa);
    }
  }

  await bubbleActualizar(T.curso, idCurso, {
    'Is Deleted': true,
    'Estado': 'Suspenso',
    'Capa Path': '',
    'Capa Bytes': 0
  });

  ok(res, { apagado: true, libertou: emMB(bytesCapa) });
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
    const curso = await cursoDoFormador(idDono, idCurso);

    /* O que la estava sai da conta e do disco. */
    const caminhoAntigo = texto(curso['Capa Path']);
    const bytesAntigos = numero(curso['Capa Bytes']);

    const cabe = await podeGuardarBytes(idDono, bytes.length, bytesAntigos);
    if (!cabe.pode) return erro(res, cabe.motivo);

    caminho = 'capas/' + idCurso + '-' + Date.now() + '.' + extensao;
    const url = await storageGuardar(caminho, bytes, tipoMime);

    if (caminhoAntigo) await storageApagar(caminhoAntigo);

    await bubbleActualizar(T.curso, idCurso, {
      'Capa URL': url,
      'Capa Path': caminho,
      'Capa Bytes': bytes.length
    });
    await somarBytes(idDono, cabe.usados + bytes.length);

    return ok(res, { url: url, bytes_usados: cabe.usados + bytes.length });
  }

  if (alvo === 'logo') {
    const idCurso = texto(corpo.curso);
    const curso = await cursoDoFormador(idDono, idCurso);

    const caminhoAntigo = texto(curso['Logo Path']);
    const bytesAntigos = numero(curso['Logo Bytes']);

    const cabe = await podeGuardarBytes(idDono, bytes.length, bytesAntigos);
    if (!cabe.pode) return erro(res, cabe.motivo);

    caminho = 'logos/' + idCurso + '-' + Date.now() + '.' + extensao;
    const url = await storageGuardar(caminho, bytes, tipoMime);

    if (caminhoAntigo) await storageApagar(caminhoAntigo);

    await bubbleActualizar(T.curso, idCurso, {
      'Logo URL': url,
      'Logo Path': caminho,
      'Logo Bytes': bytes.length
    });
    await somarBytes(idDono, cabe.usados + bytes.length);

    return ok(res, { url: url, bytes_usados: cabe.usados + bytes.length });
  }

  if (alvo === 'perfil') {
    const utilizador = await bubblePorId(T.user, idDono);
    if (!utilizador) return erro(res, 'utilizador nao encontrado', 404);

    const caminhoAntigo = texto(utilizador['Foto Path']);
    const bytesAntigos = numero(utilizador['Foto Bytes']);

    const cabe = await podeGuardarBytes(idDono, bytes.length, bytesAntigos);
    if (!cabe.pode) return erro(res, cabe.motivo);

    caminho = 'perfis/' + idDono + '-' + Date.now() + '.' + extensao;
    const url = await storageGuardar(caminho, bytes, tipoMime);

    if (caminhoAntigo) await storageApagar(caminhoAntigo);

    await bubbleActualizar(T.user, idDono, {
      'Foto URL': url,
      'Foto Path': caminho,
      'Foto Bytes': bytes.length,
      'Bytes Usados': Math.max(0, Math.round(cabe.usados + bytes.length))
    });

    return ok(res, { url: url, bytes_usados: cabe.usados + bytes.length });
  }

  erro(res, 'alvo deve ser capa, logo ou perfil');
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
      intro_video_id: texto(curso['Intro Video ID']),
      cor_marca: texto(curso['Cor Marca']),
      logo: texto(curso['Logo URL']),
      boas_vindas: texto(curso['Boas Vindas'])
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

  /* O ficheiro de idiomas sai como JavaScript, nao como JSON.
     Uma hora de cache no browser: muda pouco e e pedido em
     todas as paginas. */
  if (req.method === 'GET' && caminho === '/i18n.js') {
    const corpoJs = ficheiroIdiomas();
    res.writeHead(200, {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Content-Length': Buffer.byteLength(corpoJs),
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600'
    });
    res.end(corpoJs);
    return;
  }

  const chave = req.method + ' ' + caminho;
  const rota = rotas[chave];

  if (!rota) {
    return erro(res, 'rota desconhecida: ' + chave, 404);
  }

  let corpo = {};
  if (req.method === 'POST') {
    try {
      const limite = caminho === '/material-upload' ? 40
                   : (caminho === '/upload-image' ? 10 : 2);
      corpo = await lerCorpo(req, limite);
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
  log('Agora:', estadoAgora());
});
