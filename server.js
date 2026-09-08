/* ============================================================
   CURC — container proxy
   versao: curc-1
   Plataforma EAD marketplace para o mercado mocambicano.

   Este ficheiro contem:
     - ligacao a Data API do Bubble (token de admin)
     - contas: codigo de confirmacao por email (Resend)
     - catalogo de cursos e detalhe do curso
     - inscricao em cursos gratis
     - pagamento por M-Pesa e e-Mola (MoPayment)
     - comissao da plataforma e saldo do formador

   Sem dependencias externas. Corre com node >= 18.
   ============================================================ */

const http = require('http');
const crypto = require('crypto');

const VERSAO = 'curc-1';
const PORTA = process.env.PORT || 3000;

/* ---------- variaveis de ambiente ---------- */

const BUBBLE_BASE = (process.env.BUBBLE_BASE || '').replace(/\/+$/, '');
const BUBBLE_TOKEN = process.env.BUBBLE_TOKEN || '';

const MOZ_WALLET = process.env.MOZ_WALLET || '';
const MOPAY_BASE = (process.env.MOPAY_BASE || 'https://mozpayment.co.mz/api/1.1/wf').replace(/\/+$/, '');

const COMISSAO_PCT = Number(process.env.COMISSAO_PCT || 15);

const RESEND_KEY = process.env.RESEND_KEY || '';
const MAIL_FROM = process.env.MAIL_FROM || 'CURC <noreply@curc.co.mz>';

const APP_URL = process.env.APP_URL || '';
const UPLOAD_SECRET = process.env.UPLOAD_SECRET || '';

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

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    let bruto = '';
    let tamanho = 0;
    req.on('data', function (pedaco) {
      tamanho += pedaco.length;
      if (tamanho > 2 * 1024 * 1024) {
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
  const resposta = await fetch(url, { headers: cabecalhosBubble() });

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
  const resposta = await fetch(BUBBLE_BASE + '/' + tipo + '/' + encodeURIComponent(id), {
    headers: cabecalhosBubble()
  });
  if (resposta.status === 404) return null;
  if (!resposta.ok) {
    const detalhe = await resposta.text();
    throw new Error('Bubble ler ' + tipo + ' falhou (' + resposta.status + '): ' + detalhe.slice(0, 300));
  }
  const dados = await resposta.json();
  return (dados && dados.response) || null;
}

async function bubbleCriar(tipo, objecto) {
  const resposta = await fetch(BUBBLE_BASE + '/' + tipo, {
    method: 'POST',
    headers: cabecalhosBubble(),
    body: JSON.stringify(objecto)
  });
  if (!resposta.ok) {
    const detalhe = await resposta.text();
    throw new Error('Bubble criar ' + tipo + ' falhou (' + resposta.status + '): ' + detalhe.slice(0, 300));
  }
  const dados = await resposta.json();
  return (dados && dados.id) || null;
}

async function bubbleActualizar(tipo, id, objecto) {
  const resposta = await fetch(BUBBLE_BASE + '/' + tipo + '/' + encodeURIComponent(id), {
    method: 'PATCH',
    headers: cabecalhosBubble(),
    body: JSON.stringify(objecto)
  });
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
    const resposta = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + RESEND_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from: MAIL_FROM, to: [para], subject: assunto, html: html })
    });
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
    const resposta = await fetch(MOPAY_BASE + caminho, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo)
    });
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
      corpo = await lerCorpo(req);
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
  log('Comissao:', COMISSAO_PCT + '%');
});
