<!-- ============================================================
     CURC — Estudio do formador
     versao v3  ·  container curc-8

     v3: separador da marca do curso (cor, logotipo e boas-vindas),
     separador de afiliados com a comissao que o dono decide,
     e o painel dos meus links de afiliado na lista.

     v2: planos do formador. Mostra o plano actual, os cursos
     gastos, o espaco ocupado, e trava a criacao quando o
     limite chega ao fim. Ecra de planos com adesao por
     M-Pesa e e-Mola. Refeito para telemovel.

     Colar numa pagina Bubble chamada "estudio" dentro de um
     elemento HTML a ocupar a pagina toda.

     Editar apenas as linhas do CFG, mais abaixo.
     ============================================================ -->

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/tus-js-client@4.1.0/dist/tus.min.js"></script>

<style>
:root{
  --noite:#070B24;
  --painel:#0F1436;
  --painel2:#151B44;
  --linha:#232B5C;
  --tinta:#F2F4FF;
  --suave:#8B96C4;
  --azul:#3B5BFF;
  --magenta:#C13BE8;
  --roxo:#A855F7;
  --verde:#22C08A;
  --ambar:#F0A02E;
  --vermelho:#E5484D;
  --grad:linear-gradient(115deg,#3B5BFF 0%,#8B3BF0 55%,#C13BE8 100%);
  --seguro-baixo:env(safe-area-inset-bottom,0px);
}

*{box-sizing:border-box}
html,body{margin:0;padding:0;overflow-x:hidden}

#curc{
  font-family:Inter,system-ui,-apple-system,sans-serif;
  background:var(--noite);
  color:var(--tinta);
  min-height:100vh;
  font-size:15px;line-height:1.55;
  -webkit-font-smoothing:antialiased;
  -webkit-tap-highlight-color:transparent;
}
#curc h1,#curc h2,#curc h3{font-family:Sora,Inter,sans-serif;letter-spacing:-.02em}

/* ---------- topo ---------- */

.topo{
  display:flex;align-items:center;gap:14px;
  padding:12px 20px;border-bottom:1px solid var(--linha);
  background:rgba(15,20,54,.82);
  position:sticky;top:0;z-index:40;backdrop-filter:blur(12px);
}
.marca{display:flex;align-items:center;gap:9px;font-family:Sora;font-weight:800;font-size:19px;flex:none;cursor:pointer}
.marca span{background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent}
.topo .direita{margin-left:auto;display:flex;align-items:center;gap:10px;flex:none}
.topo .quem{color:var(--suave);font-size:13.5px;white-space:nowrap}

/* ---------- estrutura ---------- */

.folha{max-width:1180px;margin:0 auto;padding:24px 20px 80px}
.linha-topo{display:flex;align-items:flex-end;gap:16px;flex-wrap:wrap;margin-bottom:20px}
.linha-topo h1{margin:0;font-size:27px;font-weight:700;line-height:1.2}
.linha-topo p{margin:5px 0 0;color:var(--suave);font-size:14px}
.linha-topo .direita{margin-left:auto}

/* ---------- botoes ---------- */

.btn{
  font-family:Sora;font-weight:600;font-size:14px;
  border:1px solid var(--linha);background:var(--painel2);color:var(--tinta);
  padding:11px 17px;border-radius:10px;cursor:pointer;min-height:44px;
  transition:border-color .15s,background .15s;
}
.btn:hover{border-color:#3A4585;background:#1B2255}
.btn:focus-visible{outline:2px solid var(--roxo);outline-offset:2px}
.btn:disabled{opacity:.45;cursor:not-allowed}
.btn-p{background:var(--grad);border:none;color:#fff}
.btn-p:hover{filter:brightness(1.12)}
.btn-mini{padding:8px 13px;font-size:13px;border-radius:8px;min-height:38px}
.btn-largo{width:100%;padding:13px 20px;font-size:15px;min-height:50px}
.btn-perigo{color:#FF9EA1;border-color:#4A2030}
.btn-perigo:hover{background:#3A1620;border-color:#7A2A38}

/* ---------- faixa do plano ---------- */

.faixa{
  background:var(--painel);border:1px solid var(--linha);
  border-radius:14px;padding:16px 18px;margin-bottom:18px;
  display:flex;align-items:center;gap:18px;flex-wrap:wrap;
}
.faixa .selo-plano{
  font-family:Sora;font-weight:700;font-size:13px;
  padding:5px 13px;border-radius:20px;flex:none;
  background:var(--grad);color:#fff;letter-spacing:.5px;
}
.faixa .medida{flex:1;min-width:150px}
.faixa .medida b{font-family:Sora;font-size:13.5px;display:block;margin-bottom:5px}
.faixa .medida small{color:var(--suave);font-size:12.5px}
.faixa .btn{flex:none}

.tubo{height:7px;background:#1C2352;border-radius:5px;overflow:hidden;margin-top:6px}
.tubo i{display:block;height:100%;background:var(--grad);transition:width .3s}
.tubo.cheio i{background:var(--ambar)}
.tubo.estourado i{background:var(--vermelho)}

/* ---------- numeros ---------- */

.numeros{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:22px}
.num{background:var(--painel);border:1px solid var(--linha);border-radius:13px;padding:15px 17px}
.num b{display:block;font-family:Sora;font-size:25px;font-weight:700;line-height:1.15}
.num small{color:var(--suave);font-size:12.5px}
.num.ganho b{background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent}

/* ---------- cursos ---------- */

.cursos{display:grid;grid-template-columns:repeat(auto-fill,minmax(255px,1fr));gap:16px}
.curso{
  background:var(--painel);border:1px solid var(--linha);
  border-radius:14px;overflow:hidden;cursor:pointer;
  display:flex;flex-direction:column;transition:border-color .15s,transform .15s;
}
.curso:hover{border-color:#3A4585;transform:translateY(-2px)}
.curso .capa{aspect-ratio:16/9;background:#0B1030 center/cover no-repeat;display:grid;place-items:center;flex:none}
.curso .capa em{color:#4A5490;font-style:normal;font-size:13px}
.curso .corpo{padding:13px 15px 15px;min-width:0}
.curso h3{
  margin:0 0 5px;font-size:15.5px;font-weight:600;line-height:1.35;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;
}
.curso .meta{color:var(--suave);font-size:12.5px;display:flex;gap:9px;flex-wrap:wrap}

.selo{
  display:inline-block;font-size:11.5px;font-weight:600;
  padding:3px 9px;border-radius:20px;margin-bottom:8px;font-family:Sora;
}
.selo.rascunho{background:#3A2E10;color:#F7C46A}
.selo.publicado{background:#0E3A2C;color:#4CD9A4}
.selo.suspenso{background:#3A1620;color:#FF9EA1}

/* ---------- vazio ---------- */

.vazio{border:1px dashed var(--linha);border-radius:16px;padding:48px 22px;text-align:center}
.vazio h2{margin:0 0 7px;font-size:19px;font-weight:600}
.vazio p{margin:0 0 20px;color:var(--suave);max-width:44ch;margin-inline:auto}

/* ---------- planos ---------- */

.planos{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}
.plano{
  background:var(--painel);border:1px solid var(--linha);
  border-radius:16px;padding:22px 20px;display:flex;flex-direction:column;
}
.plano.actual{border-color:var(--roxo);box-shadow:0 0 0 1px var(--roxo)}
.plano .cabeca{font-family:Sora;font-weight:700;font-size:17px;margin-bottom:3px}
.plano .frase{color:var(--suave);font-size:13px;margin-bottom:16px;min-height:38px}
.plano .preco{font-family:Sora;font-weight:700;font-size:28px;line-height:1.1}
.plano .preco small{display:block;color:var(--suave);font-size:12.5px;font-weight:400;margin-top:3px}
.plano ul{list-style:none;margin:18px 0;padding:0;flex:1}
.plano li{display:flex;gap:9px;align-items:flex-start;padding:5px 0;font-size:13.5px;color:#C4CCEC}
.plano li .v{color:var(--verde);flex:none;margin-top:2px}
.plano .agora{
  text-align:center;font-family:Sora;font-weight:600;font-size:13.5px;
  color:var(--roxo);padding:13px 0;
}

/* ---------- editor ---------- */

.voltar{
  background:none;border:none;color:var(--suave);cursor:pointer;
  font-size:14px;padding:8px 0;margin-bottom:10px;font-family:Inter;
  min-height:40px;display:flex;align-items:center;
}
.voltar:hover{color:var(--tinta)}

.split{display:grid;grid-template-columns:minmax(0,1fr) 312px;gap:24px;align-items:start}

.abas{display:flex;gap:4px;border-bottom:1px solid var(--linha);margin-bottom:20px;overflow-x:auto;scrollbar-width:none}
.abas::-webkit-scrollbar{display:none}
.aba{
  background:none;border:none;border-bottom:2px solid transparent;
  color:var(--suave);font-family:Sora;font-weight:600;font-size:14px;
  padding:11px 15px;cursor:pointer;margin-bottom:-1px;white-space:nowrap;min-height:44px;
}
.aba.on{color:var(--tinta);border-bottom-color:var(--roxo)}

.bloco{background:var(--painel);border:1px solid var(--linha);border-radius:14px;padding:19px;margin-bottom:15px}
.bloco h2{margin:0 0 3px;font-size:16px;font-weight:600}
.bloco .ajuda{margin:0 0 16px;color:var(--suave);font-size:13px;line-height:1.6}

.campo{margin-bottom:15px}
.campo label{display:block;font-size:13px;font-weight:500;margin-bottom:6px;color:#C4CCEC}
.campo .nota{color:var(--suave);font-size:12px;margin-top:6px;line-height:1.5}

input[type=text],input[type=number],input[type=tel],select,textarea{
  width:100%;background:#0A0F30;border:1px solid var(--linha);
  color:var(--tinta);border-radius:10px;padding:11px 12px;
  font-family:Inter;font-size:16px;min-height:46px;
}
textarea{resize:vertical;min-height:96px;line-height:1.6}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--roxo)}
select{
  -webkit-appearance:none;appearance:none;padding-right:32px;
  background-image:url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none' stroke='%238B96C4' stroke-width='1.6'%3E%3Cpath d='M1 1l4 4 4-4'/%3E%3C/svg%3E");
  background-repeat:no-repeat;background-position:right 12px center;
}
select option{background:#0A0F30}

.duas{display:grid;grid-template-columns:1fr 1fr;gap:14px}

.troca{display:flex;align-items:center;gap:11px;cursor:pointer;user-select:none;min-height:44px}
.troca input{width:19px;height:19px;accent-color:var(--roxo);cursor:pointer;flex:none}
.troca span{font-size:14px}

/* ---------- capa e intro ---------- */

.media{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.alvo{border:1px dashed var(--linha);border-radius:12px;padding:16px;text-align:center;background:#0A0F30}
.alvo h3{margin:0 0 3px;font-size:14px;font-weight:600}
.alvo p{margin:0 0 12px;color:var(--suave);font-size:12.5px}
.alvo img{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:9px;margin-bottom:12px;display:block}

.arco{width:78px;height:78px;margin:0 auto 10px;position:relative}
.arco svg{transform:rotate(-90deg)}
.arco circle{fill:none;stroke-width:7;stroke-linecap:round}
.arco .fundo{stroke:#1C2352}
.arco .frente{stroke:url(#gradArco);transition:stroke-dashoffset .3s}
.arco b{position:absolute;inset:0;display:grid;place-items:center;font-family:Sora;font-size:15px;font-weight:700}

/* ---------- curriculo ---------- */

.modulo{background:var(--painel);border:1px solid var(--linha);border-radius:13px;margin-bottom:13px;overflow:hidden}
.modulo-topo{display:flex;align-items:center;gap:10px;padding:13px 15px;background:var(--painel2);flex-wrap:wrap}
.modulo-topo input{background:none;border:none;font-family:Sora;font-weight:600;font-size:15px;padding:0;flex:1;min-width:120px;min-height:auto}
.modulo-topo input:focus{outline:none;border-bottom:1px solid var(--roxo)}
.modulo-acoes{display:flex;gap:6px;flex:none}

.aula{border-top:1px solid var(--linha);padding:13px 15px}
.aula-topo{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.aula-topo .ordem{color:#4A5490;font-family:Sora;font-size:13px;min-width:18px;flex:none}
.aula-topo input[type=text]{flex:1;min-width:130px}
.aula-baixo{display:flex;align-items:center;gap:14px;margin-top:10px;flex-wrap:wrap}
.estado-video{font-size:12.5px;color:var(--suave);display:flex;align-items:center;gap:7px}
.ponto{width:7px;height:7px;border-radius:50%;background:#4A5490;flex:none}
.ponto.ok{background:var(--verde)}
.ponto.espera{background:var(--ambar)}
.barra{flex:1;min-width:120px;height:5px;background:#1C2352;border-radius:4px;overflow:hidden}
.barra i{display:block;height:100%;width:0;background:var(--grad);transition:width .25s}

.sem-aulas{padding:15px;color:var(--suave);font-size:13px;border-top:1px solid var(--linha)}

/* ---------- painel de publicacao ---------- */

.lado{position:sticky;top:76px}
.lista-check{list-style:none;margin:0 0 16px;padding:0}
.lista-check li{display:flex;align-items:flex-start;gap:10px;padding:6px 0;font-size:13.5px}
.lista-check .marca-c{
  width:18px;height:18px;border-radius:50%;flex:none;margin-top:2px;
  border:1.5px solid #3A4585;display:grid;place-items:center;font-size:10px;color:var(--noite);
}
.lista-check li.feito .marca-c{background:var(--verde);border-color:var(--verde)}
.lista-check li.feito{color:var(--suave)}

/* ---------- folha de pagamento ---------- */

.cortina{
  position:fixed;inset:0;background:rgba(7,11,36,.82);
  backdrop-filter:blur(6px);z-index:80;
  display:flex;align-items:center;justify-content:center;padding:20px;
}
.caixa{
  background:var(--painel);border:1px solid var(--linha);
  border-radius:18px;padding:25px;width:100%;max-width:430px;
  max-height:88vh;overflow:auto;
}
.caixa h2{margin:0 0 4px;font-size:20px;font-weight:700}
.caixa .ajuda{margin:0 0 19px;color:var(--suave);font-size:13.5px}
.puxador{display:none;width:38px;height:4px;border-radius:3px;background:#3A4585;margin:0 auto 16px}

.metodos{display:grid;grid-template-columns:1fr 1fr;gap:11px;margin-bottom:17px}
.metodo{
  border:1px solid var(--linha);background:#0A0F30;border-radius:12px;
  padding:15px 12px;text-align:center;cursor:pointer;
  transition:border-color .15s;min-height:66px;
}
.metodo:hover{border-color:#3A4585}
.metodo.on{border-color:var(--roxo);background:#161C48}
.metodo b{display:block;font-family:Sora;font-size:14.5px}
.metodo small{color:var(--suave);font-size:12px}

.total{display:flex;justify-content:space-between;align-items:baseline;padding:14px 0;border-top:1px solid var(--linha);margin-top:6px;gap:12px}
.total b{font-family:Sora;font-size:22px;font-weight:700}

.espera{text-align:center;padding:22px 0}
.roda{
  width:44px;height:44px;margin:0 auto 16px;border-radius:50%;
  border:3px solid #1C2352;border-top-color:var(--roxo);
  animation:gira .9s linear infinite;
}
@keyframes gira{to{transform:rotate(360deg)}}

/* ---------- avisos ---------- */

.avisos{
  position:fixed;right:14px;left:14px;bottom:14px;z-index:95;
  display:flex;flex-direction:column;gap:9px;align-items:flex-end;pointer-events:none;
}
.aviso{
  background:var(--painel2);border:1px solid var(--linha);
  border-left:3px solid var(--roxo);
  padding:12px 16px;border-radius:10px;font-size:13.5px;
  max-width:340px;box-shadow:0 8px 28px rgba(0,0,0,.5);
}
.aviso.bom{border-left-color:var(--verde)}
.aviso.mau{border-left-color:var(--vermelho)}

.escondido{display:none !important}

/* ============================================================
   TELEMOVEL
   ============================================================ */

@media (max-width:900px){
  .split{grid-template-columns:1fr}
  .lado{position:static}
  .numeros{grid-template-columns:1fr 1fr}
  .media,.duas{grid-template-columns:1fr}
}

@media (max-width:640px){
  .topo{padding:11px 14px;gap:10px}
  .topo .quem{display:none}

  .folha{padding:18px 14px 80px}
  .linha-topo{gap:12px}
  .linha-topo h1{font-size:22px}
  .linha-topo .direita{margin-left:0;flex-basis:100%}
  .linha-topo .direita .btn{width:100%}

  .faixa{padding:14px;gap:13px}
  .faixa .selo-plano{order:-1}
  .faixa .btn{width:100%}

  .numeros{gap:9px}
  .num{padding:13px 14px}
  .num b{font-size:21px}

  .cursos{grid-template-columns:1fr;gap:11px}
  .curso{flex-direction:row}
  .curso .capa{width:132px;aspect-ratio:4/3;flex:none}
  .curso .corpo{padding:11px 13px}
  .curso h3{font-size:14.5px}

  .bloco{padding:16px}
  .modulo-acoes{width:100%}
  .modulo-acoes .btn{flex:1}

  .cortina{align-items:flex-end;padding:0}
  .caixa{
    max-width:none;border-radius:20px 20px 0 0;
    border-left:none;border-right:none;border-bottom:none;
    padding:16px 18px calc(20px + var(--seguro-baixo));
  }
  .puxador{display:block}

  .avisos{align-items:stretch}
  .aviso{max-width:none}
}

@media (max-width:360px){
  .curso .capa{width:108px}
  .numeros{grid-template-columns:1fr}
  .metodos{grid-template-columns:1fr}
}

@media (prefers-reduced-motion:reduce){
  *{transition:none !important}
  .roda{animation-duration:2.4s}
}
</style>

<div id="curc">

  <div class="topo">
    <div class="marca" id="b-marca">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
        <defs>
          <linearGradient id="gradMarca" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#3B5BFF"/><stop offset="100%" stop-color="#C13BE8"/>
          </linearGradient>
        </defs>
        <path d="M27 8.5A12 12 0 1 0 27 23.5" stroke="url(#gradMarca)" stroke-width="5"
              fill="none" stroke-linecap="round"/>
        <path d="M14 11.5l8 4.5-8 4.5z" fill="url(#gradMarca)"/>
      </svg>
      <span>CURC</span>
    </div>
    <div class="direita">
      <div class="quem" id="quem"></div>
    </div>
  </div>

  <!-- ================= LISTA ================= -->
  <div class="folha" id="vista-lista">
    <div class="linha-topo">
      <div>
        <h1>Os meus cursos</h1>
        <p id="sub-lista">A carregar…</p>
      </div>
      <div class="direita">
        <button class="btn btn-p" id="b-novo">Criar curso</button>
      </div>
    </div>

    <div id="faixa-plano"></div>
    <div class="numeros" id="numeros"></div>
    <div id="area-cursos"></div>
  </div>

  <!-- ================= PLANOS ================= -->
  <div class="folha escondido" id="vista-planos">
    <button class="voltar" id="b-voltar-planos">← Os meus cursos</button>
    <div class="linha-topo">
      <div>
        <h1>Planos</h1>
        <p>Sem mensalidade. Paga uma vez para aderir. A plataforma fica com <span id="pct-2">15</span>% de cada venda.</p>
      </div>
    </div>
    <div id="area-planos"></div>
  </div>

  <!-- ================= EDITOR ================= -->
  <div class="folha escondido" id="vista-editor">
    <button class="voltar" id="b-voltar">← Os meus cursos</button>

    <div class="linha-topo">
      <div>
        <h1 id="titulo-editor">Curso</h1>
        <p id="sub-editor"></p>
      </div>
    </div>

    <div class="abas">
      <button class="aba on" data-aba="detalhes">Detalhes</button>
      <button class="aba" data-aba="conteudo">Conteúdo</button>
      <button class="aba" data-aba="marca">Marca</button>
      <button class="aba" data-aba="afiliados">Afiliados</button>
    </div>

    <div class="split">
      <div>
        <div id="painel-detalhes">
          <div class="bloco">
            <h2>O essencial</h2>
            <p class="ajuda">É isto que o aluno vê antes de decidir.</p>

            <div class="campo">
              <label for="f-titulo">Título</label>
              <input type="text" id="f-titulo" maxlength="120" placeholder="Node.js do zero ao primeiro emprego">
            </div>

            <div class="campo">
              <label for="f-subtitulo">Uma linha que resume</label>
              <input type="text" id="f-subtitulo" maxlength="160" placeholder="Construa APIs reais em oito semanas">
            </div>

            <div class="campo">
              <label for="f-descricao">Descrição</label>
              <textarea id="f-descricao" placeholder="Para quem é o curso, o que se faz nele, e onde a pessoa chega no fim."></textarea>
            </div>

            <div class="duas">
              <div class="campo">
                <label for="f-categoria">Categoria</label>
                <select id="f-categoria"></select>
              </div>
              <div class="campo">
                <label for="f-nivel">Nível</label>
                <select id="f-nivel">
                  <option>Iniciante</option>
                  <option>Intermedio</option>
                  <option>Avancado</option>
                </select>
              </div>
            </div>
          </div>

          <div class="bloco">
            <h2>Preço</h2>
            <p class="ajuda">A plataforma fica com <span id="pct-comissao">15</span>% de cada venda. O resto vai para o seu saldo.</p>

            <div class="campo">
              <label class="troca">
                <input type="checkbox" id="f-gratis">
                <span>Curso gratuito</span>
              </label>
            </div>

            <div class="duas" id="caixa-precos">
              <div class="campo">
                <label for="f-preco">Preço em meticais</label>
                <input type="number" id="f-preco" min="0" step="50" placeholder="1500">
              </div>
              <div class="campo">
                <label for="f-promo">Preço promocional</label>
                <input type="number" id="f-promo" min="0" step="50" placeholder="0">
                <div class="nota">Deixe a zero se não houver promoção.</div>
              </div>
            </div>
            <div class="campo" id="nota-ganho"></div>
          </div>

          <div class="bloco">
            <h2>Capa e apresentação</h2>
            <p class="ajuda">Todos os cursos precisam de um vídeo de introdução. É o que convence.</p>

            <div class="media">
              <div class="alvo">
                <div id="pre-capa"></div>
                <h3>Imagem de capa</h3>
                <p id="txt-capa">JPG, PNG ou WebP até 5 MB</p>
                <button class="btn btn-mini" id="b-capa">Escolher imagem</button>
                <input type="file" id="in-capa" accept="image/jpeg,image/png,image/webp" class="escondido">
              </div>

              <div class="alvo">
                <div id="pre-intro"></div>
                <h3>Vídeo de introdução</h3>
                <p id="txt-intro">MP4 ou MOV</p>
                <button class="btn btn-mini" id="b-intro">Escolher vídeo</button>
                <input type="file" id="in-intro" accept="video/*" class="escondido">
              </div>
            </div>
          </div>

          <div class="bloco">
            <h2>Promessas e requisitos</h2>
            <p class="ajuda">Uma por linha.</p>

            <div class="campo">
              <label for="f-aprende">O que o aluno vai saber fazer</label>
              <textarea id="f-aprende" placeholder="Construir uma API do zero&#10;Ligar a uma base de dados&#10;Pôr o projecto no ar"></textarea>
            </div>

            <div class="campo">
              <label for="f-requisitos">O que precisa de saber antes</label>
              <textarea id="f-requisitos" placeholder="Lógica de programação básica&#10;Um computador com internet"></textarea>
            </div>

            <div class="campo">
              <label class="troca">
                <input type="checkbox" id="f-certificado">
                <span>Emitir certificado no fim</span>
              </label>
            </div>
          </div>

          <button class="btn btn-p btn-largo" id="b-guardar">Guardar alterações</button>
        </div>

        <div id="painel-marca" class="escondido"></div>
        <div id="painel-afiliados" class="escondido"></div>

        <div id="painel-conteudo" class="escondido">
          <div class="bloco">
            <h2>Programa do curso</h2>
            <p class="ajuda">Módulos agrupam aulas. Marque como livre a aula que qualquer pessoa pode ver sem comprar.</p>
            <button class="btn" id="b-modulo">Novo módulo</button>
          </div>
          <div id="area-modulos"></div>
        </div>
      </div>

      <aside class="lado">
        <div class="bloco">
          <h2>Para publicar</h2>
          <p class="ajuda" id="resumo-check"></p>
          <ul class="lista-check" id="check"></ul>
          <button class="btn btn-p btn-largo" id="b-publicar">Publicar curso</button>
          <button class="btn btn-largo escondido" id="b-despublicar" style="margin-top:9px">Voltar a rascunho</button>
        </div>
        <div class="bloco">
          <h2>Apagar</h2>
          <p class="ajuda">Só é possível enquanto não houver alunos inscritos.</p>
          <button class="btn btn-perigo btn-largo" id="b-apagar">Apagar curso</button>
        </div>
      </aside>
    </div>
  </div>

  <div class="cortina escondido" id="cortina">
    <div class="caixa" id="caixa"></div>
  </div>

  <div class="avisos" id="avisos"></div>

  <svg width="0" height="0" style="position:absolute" aria-hidden="true">
    <defs>
      <linearGradient id="gradArco" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#3B5BFF"/><stop offset="100%" stop-color="#C13BE8"/>
      </linearGradient>
    </defs>
  </svg>
</div>

<script>
(function(){
'use strict';

/* ============================================================
   CONFIGURACAO — editar apenas estas linhas
   ============================================================ */

var CFG = {
  API:      'https://mc-nrqyo9ibyg.bunny.run',
  OWNER:    'ID_DO_UTILIZADOR',
  NOME:     'NOME_DO_UTILIZADOR',
  LOGADO:   'no',
  CATALOGO: '/catalogo',
  ESPACO:   '/espaco',
  LOGIN:    '/login'
};

var SESSAO = (function(){
  var v = String(CFG.LOGADO || '').trim().toLowerCase();
  if (v === 'yes' || v === 'true' || v === 'sim') return true;
  if (v === 'no' || v === 'false' || v === 'nao' || v === '') return false;
  return !!(CFG.OWNER && CFG.OWNER.indexOf('ID_DO') !== 0);
})();

/* ============================================================
   ESTADO
   ============================================================ */

var st = {
  categorias: [],
  cursos: [],
  curso: null,
  modulos: [],
  comissao: 15,
  planos: [],
  consumo: null,
  aderir: { plano: null, metodo: '' },
  aba: 'detalhes',
  sondas: {}
};

var $ = function(id){ return document.getElementById(id); };

/* ============================================================
   UTILITARIOS
   ============================================================ */

function esc(v){
  return String(v == null ? '' : v)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function mzn(n){
  return new Intl.NumberFormat('pt-PT').format(Math.round(n || 0)) + ' MZN';
}

function duracao(seg){
  seg = Math.round(seg || 0);
  if (!seg) return '—';
  var h = Math.floor(seg/3600), m = Math.round((seg%3600)/60);
  return h ? h + 'h ' + m + 'm' : m + ' min';
}

function tamanho(bytes){
  var mb = (bytes || 0) / (1024 * 1024);
  if (mb >= 1024) return (Math.round(mb / 102.4) / 10) + ' GB';
  return Math.max(0, Math.round(mb * 10) / 10) + ' MB';
}

function aviso(texto, tipo){
  var el = document.createElement('div');
  el.className = 'aviso' + (tipo ? ' ' + tipo : '');
  el.textContent = texto;
  $('avisos').appendChild(el);
  setTimeout(function(){ el.remove(); }, 4600);
}

function api(rota, dados){
  return fetch(CFG.API + rota, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({ owner: CFG.OWNER }, dados || {}))
  }).then(function(r){ return r.json(); }).then(function(d){
    if (!d.ok) throw new Error(d.erro || 'Não deu para completar');
    return d;
  });
}

function linhas(texto){
  return String(texto || '').split('\n')
    .map(function(l){ return l.trim(); })
    .filter(Boolean);
}

function irAoTopo(){ window.scrollTo(0, 0); }

/* ============================================================
   ARRANQUE
   ============================================================ */

function arrancar(){
  if (!SESSAO) {
    aviso('Entre na sua conta para abrir o estúdio', 'mau');
    setTimeout(function(){
      window.location.href = CFG.LOGIN + '?volta=' + encodeURIComponent(window.location.href);
    }, 1300);
    return;
  }

  $('quem').textContent = CFG.NOME;

  api('/account', {}).then(function(c){
    st.comissao = c.comissao_pct;
    $('pct-comissao').textContent = c.comissao_pct;
    $('pct-2').textContent = c.comissao_pct;
    if (!c.formador_aprovado) return api('/become-instructor', {});
  }).then(function(){
    return Promise.all([ carregarCategorias(), carregarLista() ]);
  }).catch(function(e){
    aviso(e.message, 'mau');
  });
}

function carregarCategorias(){
  return api('/categories', {}).then(function(d){
    st.categorias = d.categorias || [];
    var sel = $('f-categoria');
    sel.innerHTML = '<option value="">Escolher…</option>' +
      st.categorias.map(function(c){
        return '<option value="' + esc(c.id) + '">' + esc(c.nome) + '</option>';
      }).join('');
    if (!st.categorias.length) aviso('Não há categorias criadas no Bubble', 'mau');
  });
}

function carregarLista(){
  return Promise.all([ api('/studio-courses', {}), api('/studio-stats', {}) ])
    .then(function(r){
      st.cursos = r[0].cursos || [];
      st.consumo = r[1];
      desenharFaixa(r[1]);
      desenharNumeros(r[1]);
      desenharCursos();
    });
}

/* ============================================================
   FAIXA DO PLANO
   ============================================================ */

function desenharFaixa(s){
  var plano = s.plano;
  if (!plano) {
    $('faixa-plano').innerHTML = '';
    return;
  }

  var usados = s.cursos_total || 0;
  var maxC = s.cursos_max || 0;
  var pctC = s.cursos_ilimitados ? 0 : Math.min(100, maxC ? (usados / maxC) * 100 : 0);

  var bytes = s.bytes_usados || 0;
  var maxB = s.bytes_max || 0;
  var pctB = maxB ? Math.min(100, (bytes / maxB) * 100) : 0;

  function classe(pct){
    return pct >= 100 ? 'tubo estourado' : (pct >= 80 ? 'tubo cheio' : 'tubo');
  }

  $('faixa-plano').innerHTML =
    '<div class="faixa">' +
      '<span class="selo-plano">' + esc(plano.nome) + '</span>' +

      '<div class="medida">' +
        '<b>' + (s.cursos_ilimitados
          ? usados + (usados === 1 ? ' curso' : ' cursos') + ' · sem limite'
          : usados + ' de ' + maxC + (maxC === 1 ? ' curso' : ' cursos')) + '</b>' +
        (s.cursos_ilimitados ? '' : '<div class="' + classe(pctC) + '"><i style="width:' + pctC + '%"></i></div>') +
      '</div>' +

      '<div class="medida">' +
        '<b>' + tamanho(bytes) + ' de ' + tamanho(maxB) + '</b>' +
        '<div class="' + classe(pctB) + '"><i style="width:' + pctB + '%"></i></div>' +
        '<small>capas e materiais · o vídeo não conta</small>' +
      '</div>' +

      '<button class="btn" id="b-planos">Ver planos</button>' +
    '</div>';

  $('b-planos').onclick = abrirPlanos;
}

function desenharNumeros(s){
  $('numeros').innerHTML =
    caixa(s.cursos_publicados + ' de ' + s.cursos_total, 'cursos no ar') +
    caixa(String(s.alunos), 'alunos') +
    caixa(mzn(s.saldo), 'saldo', 'ganho') +
    caixa(mzn(s.total_ganho), 'ganho até hoje');

  function caixa(valor, rotulo, extra){
    return '<div class="num ' + (extra || '') + '"><b>' + esc(valor) + '</b>' +
           '<small>' + esc(rotulo) + '</small></div>';
  }
}

/* ============================================================
   LISTA DE CURSOS
   ============================================================ */

function desenharCursos(){
  var area = $('area-cursos');

  $('sub-lista').textContent = st.cursos.length
    ? st.cursos.length + (st.cursos.length === 1 ? ' curso' : ' cursos')
    : 'Ainda nada por aqui';

  var podeCriar = !st.consumo || st.consumo.pode_criar !== false;
  $('b-novo').disabled = !podeCriar;
  $('b-novo').textContent = podeCriar ? 'Criar curso' : 'Limite do plano atingido';

  if (!st.cursos.length) {
    area.innerHTML =
      '<div class="vazio">' +
        '<h2>Comece pelo primeiro curso</h2>' +
        '<p>Dê-lhe um título e um preço. Pode gravar como rascunho e voltar depois — ' +
        'só fica visível aos alunos quando publicar.</p>' +
        '<button class="btn btn-p" id="b-novo2">Criar curso</button>' +
      '</div>';
    $('b-novo2').onclick = novoCurso;
    return;
  }

  area.innerHTML = '<div class="cursos">' + st.cursos.map(function(c){
    var selo = (c.estado || 'Rascunho').toLowerCase();
    var capa = c.capa
      ? '<div class="capa" style="background-image:url(' + esc(c.capa) + ')"></div>'
      : '<div class="capa"><em>sem capa</em></div>';
    return '<article class="curso" data-id="' + esc(c.id) + '">' + capa +
      '<div class="corpo">' +
        '<span class="selo ' + esc(selo) + '">' + esc(c.estado) + '</span>' +
        '<h3>' + esc(c.titulo) + '</h3>' +
        '<div class="meta">' +
          '<span>' + (c.gratis ? 'Grátis' : mzn(c.preco_final)) + '</span>' +
          '<span>' + c.total_aulas + ' aulas</span>' +
          '<span>' + c.total_alunos + ' alunos</span>' +
        '</div>' +
      '</div></article>';
  }).join('') + '</div>';

  Array.prototype.forEach.call(area.querySelectorAll('.curso'), function(el){
    el.onclick = function(){ abrirEditor(el.getAttribute('data-id')); };
  });
}

/* ============================================================
   PLANOS
   ============================================================ */

function abrirPlanos(){
  $('vista-lista').classList.add('escondido');
  $('vista-editor').classList.add('escondido');
  $('vista-planos').classList.remove('escondido');
  irAoTopo();

  $('area-planos').innerHTML = '<div class="vazio"><p>A carregar os planos…</p></div>';

  api('/author-plans', {}).then(function(d){
    st.planos = d.planos || [];
    desenharPlanos(d);
  }).catch(function(e){
    aviso(e.message, 'mau');
    $('area-planos').innerHTML = '<div class="vazio"><h2>Não deu para carregar</h2><p>' + esc(e.message) + '</p></div>';
  });
}

function voltarDosPlanos(){
  $('vista-planos').classList.add('escondido');
  $('vista-lista').classList.remove('escondido');
  irAoTopo();
  carregarLista().catch(function(e){ aviso(e.message, 'mau'); });
}

function desenharPlanos(d){
  if (!st.planos.length) {
    $('area-planos').innerHTML =
      '<div class="vazio"><h2>Sem planos criados</h2>' +
      '<p>Ainda não há registos no data type plano_formador do Bubble.</p></div>';
    return;
  }

  $('area-planos').innerHTML = '<div class="planos">' + st.planos.map(function(p){
    var lista = (p.beneficios && p.beneficios.length)
      ? p.beneficios
      : [
          p.ilimitado ? 'Cursos ilimitados' : (p.max_cursos + (p.max_cursos === 1 ? ' curso' : ' cursos')),
          tamanho(p.bytes) + ' para capas e materiais',
          'Vídeo sem limite',
          'Página de venda e área do aluno',
          'Gestão de alunos e certificados',
          st.comissao + '% de comissão sobre as vendas'
        ];

    return '<article class="plano' + (p.actual ? ' actual' : '') + '">' +
      '<div class="cabeca">' + esc(p.nome) + '</div>' +
      '<div class="frase">' + esc(p.descricao || '') + '</div>' +
      '<div class="preco">' + (p.preco > 0 ? mzn(p.preco) : 'Grátis') +
        '<small>' + (p.preco > 0 ? 'pagamento único de adesão' : 'sem custo de adesão') + '</small></div>' +
      '<ul>' + lista.map(function(b){
        return '<li><span class="v">✓</span><span>' + esc(b) + '</span></li>';
      }).join('') + '</ul>' +
      (p.actual
        ? '<div class="agora">O seu plano</div>'
        : '<button class="btn btn-p btn-largo" data-aderir="' + esc(p.id) + '">' +
            (p.preco > 0 ? 'Aderir' : 'Passar para este') + '</button>') +
    '</article>';
  }).join('') + '</div>';

  Array.prototype.forEach.call($('area-planos').querySelectorAll('[data-aderir]'), function(b){
    b.onclick = function(){
      var id = b.getAttribute('data-aderir');
      var plano = st.planos.filter(function(p){ return p.id === id; })[0];
      if (plano) comecarAdesao(plano);
    };
  });
}

/* ---------- adesao ---------- */

function comecarAdesao(plano){
  st.aderir.plano = plano;
  st.aderir.metodo = '';

  if (plano.preco <= 0) {
    if (!confirm('Passar para o plano ' + plano.nome + '?')) return;
    api('/pay-plan', { plano: plano.id }).then(function(){
      aviso('Plano alterado', 'bom');
      abrirPlanos();
    }).catch(function(e){ aviso(e.message, 'mau'); });
    return;
  }

  $('cortina').classList.remove('escondido');
  desenharAdesao();
}

function fecharCortina(){ $('cortina').classList.add('escondido'); }

function desenharAdesao(){
  var p = st.aderir.plano;

  $('caixa').innerHTML =
    '<div class="puxador"></div>' +
    '<h2>Aderir ao plano ' + esc(p.nome) + '</h2>' +
    '<p class="ajuda">Pagamento único. Não há mensalidade.</p>' +

    '<div class="metodos">' +
      '<div class="metodo" data-m="mpesa"><b>M-Pesa</b><small>84 · 85</small></div>' +
      '<div class="metodo" data-m="emola"><b>e-Mola</b><small>86 · 87</small></div>' +
    '</div>' +

    '<div class="campo">' +
      '<label for="a-numero">Número de telemóvel</label>' +
      '<input type="tel" id="a-numero" placeholder="84 123 4567" maxlength="15" inputmode="numeric" autocomplete="tel">' +
      '<div class="nota">Nove dígitos. Vai receber um pedido de confirmação no telemóvel.</div>' +
    '</div>' +

    '<div class="total"><span>Adesão</span><b>' + mzn(p.preco) + '</b></div>' +

    '<button class="btn btn-p btn-largo" id="a-pagar">Pagar agora</button>' +
    '<button class="btn btn-largo" id="a-fechar" style="margin-top:9px">Cancelar</button>';

  Array.prototype.forEach.call($('caixa').querySelectorAll('.metodo'), function(el){
    el.onclick = function(){
      st.aderir.metodo = el.getAttribute('data-m');
      marcarMetodo(st.aderir.metodo);
    };
  });

  $('a-numero').oninput = function(){
    var so = $('a-numero').value.replace(/\D/g, '');
    var pref = so.slice(0, 2);
    var metodo = (pref === '84' || pref === '85') ? 'mpesa'
               : (pref === '86' || pref === '87') ? 'emola' : '';
    if (metodo && metodo !== st.aderir.metodo) {
      st.aderir.metodo = metodo;
      marcarMetodo(metodo);
    }
  };

  $('a-pagar').onclick = pagarAdesao;
  $('a-fechar').onclick = fecharCortina;
}

function marcarMetodo(metodo){
  Array.prototype.forEach.call($('caixa').querySelectorAll('.metodo'), function(o){
    o.classList.toggle('on', o.getAttribute('data-m') === metodo);
  });
}

function pagarAdesao(){
  var numero = $('a-numero').value.replace(/\D/g, '');
  if (numero.length !== 9) { aviso('O número tem de ter nove dígitos', 'mau'); return; }
  if (!st.aderir.metodo) { aviso('Escolha M-Pesa ou e-Mola', 'mau'); return; }

  var p = st.aderir.plano;

  $('caixa').innerHTML =
    '<div class="puxador"></div>' +
    '<h2>A aguardar confirmação</h2>' +
    '<p class="ajuda">Confirme o pagamento no seu telemóvel. Não feche esta janela.</p>' +
    '<div class="espera"><div class="roda"></div>' +
      '<div style="color:var(--suave);font-size:13.5px">' +
        esc(st.aderir.metodo === 'emola' ? 'e-Mola' : 'M-Pesa') + ' · ' + esc(numero) +
      '</div></div>';

  api('/pay-plan', {
    plano: p.id,
    metodo: st.aderir.metodo,
    numero: numero
  }).then(function(){
    $('caixa').innerHTML =
      '<div class="puxador"></div>' +
      '<h2>Bem-vindo ao ' + esc(p.nome) + '</h2>' +
      '<p class="ajuda">O plano já está activo. Pode criar mais cursos agora mesmo.</p>' +
      '<button class="btn btn-p btn-largo" id="a-ok">Continuar</button>';

    $('a-ok').onclick = function(){
      fecharCortina();
      voltarDosPlanos();
    };
  }).catch(function(e){
    $('caixa').innerHTML =
      '<div class="puxador"></div>' +
      '<h2>O pagamento não passou</h2>' +
      '<p class="ajuda">' + esc(e.message) + '</p>' +
      '<button class="btn btn-p btn-largo" id="a-outra">Tentar outra vez</button>' +
      '<button class="btn btn-largo" id="a-sair" style="margin-top:9px">Fechar</button>';

    $('a-outra').onclick = desenharAdesao;
    $('a-sair').onclick = fecharCortina;
  });
}

/* ============================================================
   CRIAR E ABRIR
   ============================================================ */

function novoCurso(){
  if (st.consumo && st.consumo.pode_criar === false) {
    aviso('O plano ' + (st.consumo.plano ? st.consumo.plano.nome : 'actual') +
      ' já não permite mais cursos', 'mau');
    abrirPlanos();
    return;
  }

  var titulo = prompt('Que nome dá ao curso?');
  if (!titulo || !titulo.trim()) return;

  api('/course-save', { titulo: titulo.trim(), gratis: true })
    .then(function(d){
      aviso('Curso criado como rascunho', 'bom');
      return abrirEditor(d.curso);
    })
    .catch(function(e){
      aviso(e.message, 'mau');
      /* Se foi o limite do plano a travar, leva-o directamente lá. */
      if (/plano/i.test(e.message)) setTimeout(abrirPlanos, 900);
    });
}

function abrirEditor(id){
  return api('/studio-course', { curso: id }).then(function(d){
    st.curso = d.curso;
    st.modulos = d.modulos || [];
    $('vista-lista').classList.add('escondido');
    $('vista-planos').classList.add('escondido');
    $('vista-editor').classList.remove('escondido');
    irAoTopo();
    trocarAba('detalhes');
    preencherFormulario();
    desenharModulos();
    desenharCheck();
  }).catch(function(e){ aviso(e.message, 'mau'); });
}

function voltarLista(){
  pararSondas();
  st.curso = null;
  $('vista-editor').classList.add('escondido');
  $('vista-planos').classList.add('escondido');
  $('vista-lista').classList.remove('escondido');
  irAoTopo();
  carregarLista().catch(function(e){ aviso(e.message, 'mau'); });
}

function trocarAba(nome){
  st.aba = nome;
  Array.prototype.forEach.call(document.querySelectorAll('.aba'), function(b){
    b.classList.toggle('on', b.getAttribute('data-aba') === nome);
  });
  ['detalhes','conteudo','marca','afiliados'].forEach(function(v){
    $('painel-' + v).classList.toggle('escondido', v !== nome);
  });

  if (nome === 'marca') desenharMarca();
  if (nome === 'afiliados') carregarAfiliados();
}

/* ============================================================
   MARCA DO CURSO
   ============================================================ */

/* A cor e o logotipo mandam na area de membro. E o que faz o
   curso parecer do formador e nao da plataforma. */

function desenharMarca(){
  var c = st.curso;
  var cor = /^#[0-9A-Fa-f]{6}$/.test(c.cor_marca || '') ? c.cor_marca : '#A855F7';

  $('painel-marca').innerHTML =
    '<div class="bloco">' +
      '<h2>A sua cor</h2>' +
      '<p class="ajuda">Pinta os botões, as barras e os destaques da área de membro. ' +
        'Deixe como está para usar a cor do CURC.</p>' +
      '<div class="duas">' +
        '<div class="campo">' +
          '<label for="m-cor">Cor da marca</label>' +
          '<input type="color" id="m-cor" value="' + esc(cor) + '" ' +
            'style="height:48px;padding:5px;cursor:pointer">' +
        '</div>' +
        '<div class="campo">' +
          '<label for="m-cor-texto">Ou escreva o código</label>' +
          '<input type="text" id="m-cor-texto" maxlength="7" placeholder="#A855F7" ' +
            'value="' + esc(cor) + '">' +
          '<div class="nota">Seis dígitos depois do cardinal.</div>' +
        '</div>' +
      '</div>' +
      '<div id="m-amostra" style="border-radius:12px;padding:18px;background:' + esc(cor) +
        ';color:#fff;font-family:Sora;font-weight:600;text-align:center">' +
        'É assim que os botões vão ficar' +
      '</div>' +
    '</div>' +

    '<div class="bloco">' +
      '<h2>Logotipo</h2>' +
      '<p class="ajuda">Aparece no topo da área de membro, no lugar da marca CURC. ' +
        'PNG com fundo transparente fica melhor.</p>' +
      '<div class="alvo">' +
        '<div id="m-pre-logo">' +
          (c.logo ? '<img src="' + esc(c.logo) + '" alt="Logotipo" ' +
            'style="aspect-ratio:auto;max-height:80px;width:auto;margin:0 auto 12px">' : '') +
        '</div>' +
        '<h3>Imagem do logotipo</h3>' +
        '<p>PNG, JPG ou WebP até 5 MB</p>' +
        '<button class="btn btn-mini" id="m-b-logo">' +
          (c.logo ? 'Trocar logotipo' : 'Escolher logotipo') + '</button>' +
        '<input type="file" id="m-in-logo" accept="image/jpeg,image/png,image/webp" class="escondido">' +
      '</div>' +
    '</div>' +

    '<div class="bloco">' +
      '<h2>Boas-vindas</h2>' +
      '<p class="ajuda">A primeira coisa que o aluno lê ao entrar na área do curso. ' +
        'Diga-lhe por onde começar.</p>' +
      '<div class="campo">' +
        '<textarea id="m-boas" maxlength="1000" ' +
          'placeholder="Bem-vindo. Comece pelo módulo 1 e não salte os exercícios.">' +
          esc(c.boas_vindas || '') + '</textarea>' +
      '</div>' +
    '</div>' +

    '<div style="display:flex;gap:9px;flex-wrap:wrap">' +
      '<button class="btn btn-p" id="m-guardar">Guardar marca</button>' +
      '<button class="btn" id="m-ver">Ver a área de membro</button>' +
    '</div>';

  ligarMarca();
}

function ligarMarca(){
  var campoCor = $('m-cor');
  var campoTexto = $('m-cor-texto');

  function pintar(valor){
    if (!/^#[0-9A-Fa-f]{6}$/.test(valor)) return;
    $('m-amostra').style.background = valor;
    campoCor.value = valor;
    campoTexto.value = valor;
  }

  campoCor.oninput = function(){ pintar(campoCor.value); };
  campoTexto.oninput = function(){ pintar(campoTexto.value.trim()); };

  $('m-b-logo').onclick = function(){ $('m-in-logo').click(); };
  $('m-in-logo').onchange = function(){ enviarLogo($('m-in-logo').files[0]); };

  $('m-guardar').onclick = guardarMarca;
  $('m-ver').onclick = function(){
    window.open(CFG.ESPACO + '?c=' + encodeURIComponent(st.curso.id), '_blank');
  };
}

function guardarMarca(){
  var cor = $('m-cor-texto').value.trim();
  if (cor && !/^#[0-9A-Fa-f]{6}$/.test(cor)) {
    aviso('A cor tem de ser um código de seis dígitos, como #A855F7', 'mau');
    return;
  }

  var b = $('m-guardar');
  b.disabled = true;
  b.textContent = 'A guardar…';

  api('/course-save', {
    curso: st.curso.id,
    cor_marca: cor,
    boas_vindas: $('m-boas').value.trim()
  }).then(function(){
    aviso('Marca actualizada', 'bom');
    return abrirEditor(st.curso.id);
  }).then(function(){
    trocarAba('marca');
  }).catch(function(e){
    aviso(e.message, 'mau');
    b.disabled = false;
    b.textContent = 'Guardar marca';
  });
}

function enviarLogo(ficheiro){
  if (!ficheiro) return;
  if (ficheiro.size > 5 * 1024 * 1024) { aviso('A imagem passa dos 5 MB', 'mau'); return; }

  var b = $('m-b-logo');
  b.disabled = true;
  b.textContent = 'A enviar…';

  var leitor = new FileReader();
  leitor.onload = function(){
    api('/upload-image', {
      alvo: 'logo',
      curso: st.curso.id,
      mime: ficheiro.type,
      dados: String(leitor.result).split(',')[1]
    }).then(function(){
      aviso('Logotipo actualizado', 'bom');
      return abrirEditor(st.curso.id);
    }).then(function(){
      trocarAba('marca');
    }).catch(function(e){
      aviso(e.message, 'mau');
      b.disabled = false;
      b.textContent = 'Escolher logotipo';
      if (/espaco|plano/i.test(e.message)) setTimeout(abrirPlanos, 1100);
    });
  };
  leitor.readAsDataURL(ficheiro);
}

/* ============================================================
   AFILIADOS DO CURSO
   ============================================================ */

function carregarAfiliados(){
  $('painel-afiliados').innerHTML =
    '<div class="bloco"><p class="ajuda" style="margin:0">A carregar…</p></div>';

  api('/course-affiliates', { curso: st.curso.id })
    .then(desenharAfiliados)
    .catch(function(e){
      $('painel-afiliados').innerHTML =
        '<div class="vazio"><h2>Não deu para carregar</h2><p>' + esc(e.message) + '</p></div>';
    });
}

function desenharAfiliados(d){
  st.afiliados = d;

  var pct = d.comissao_pct || d.min_pct;
  var preco = st.curso.gratis ? 0 : st.curso.preco_final;

  var conta = preco > 0
    ? '<div class="nota" id="af-conta"></div>'
    : '<div class="nota">Este curso é gratuito. Os afiliados só fazem sentido em cursos pagos.</div>';

  var topo =
    '<div class="bloco">' +
      '<h2>Deixar outros venderem por si</h2>' +
      '<p class="ajuda">Quem partilhar o link recebe uma percentagem de cada venda que trouxer. ' +
        'Essa percentagem sai da sua parte, não da comissão da plataforma.</p>' +

      '<div class="campo">' +
        '<label class="troca">' +
          '<input type="checkbox" id="af-ligar"' + (d.aceita ? ' checked' : '') + '>' +
          '<span>Aceitar afiliados neste curso</span>' +
        '</label>' +
      '</div>' +

      '<div id="af-caixa" class="' + (d.aceita ? '' : 'escondido') + '">' +
        '<div class="campo">' +
          '<label for="af-pct">Quanto dá ao afiliado</label>' +
          '<input type="number" id="af-pct" min="' + d.min_pct + '" max="' + d.max_pct + '" ' +
            'step="1" value="' + pct + '">' +
          '<div class="nota">Entre ' + d.min_pct + '% e ' + d.max_pct + '%. ' +
            'Abaixo de ' + d.min_pct + '% ninguém se dá ao trabalho.</div>' +
        '</div>' +
        conta +
      '</div>' +

      '<button class="btn btn-p" id="af-guardar" style="margin-top:6px">Guardar</button>' +
    '</div>';

  var numeros =
    '<div class="numeros" style="grid-template-columns:repeat(3,1fr)">' +
      '<div class="num"><b>' + d.afiliados.length + '</b><small>a promover</small></div>' +
      '<div class="num"><b>' + d.cliques + '</b><small>cliques</small></div>' +
      '<div class="num ganho"><b>' + d.vendas + '</b><small>' +
        (d.vendas === 1 ? 'venda trazida' : 'vendas trazidas') + '</small></div>' +
    '</div>';

  var lista = d.afiliados.length
    ? '<div class="bloco">' +
        '<h2>Quem está a promover</h2>' +
        '<p class="ajuda">Já pagou ' + mzn(d.pago) + ' em comissões de afiliado.</p>' +
        d.afiliados.map(function(a){
          return '<div class="material" style="margin-bottom:9px">' +
            '<div class="icone">' + esc((a.nome || '?').charAt(0).toUpperCase()) + '</div>' +
            '<div class="info">' +
              '<b>' + esc(a.nome) + '</b>' +
              '<small>' + a.cliques + ' cliques · ' + a.vendas +
                (a.vendas === 1 ? ' venda' : ' vendas') + ' · ' + mzn(a.ganho) + '</small>' +
            '</div>' +
          '</div>';
        }).join('') +
      '</div>'
    : '<div class="vazio"><h2>Ainda ninguém promove este curso</h2>' +
      '<p>' + (d.aceita
        ? 'Partilhe o curso com quem tenha público. Qualquer pessoa com conta pode gerar o link dela.'
        : 'Ligue os afiliados aqui em cima para que possam gerar os links.') + '</p></div>';

  $('painel-afiliados').innerHTML = topo + (d.afiliados.length ? numeros : '') + lista;

  ligarAfiliados(d, preco);
}

function ligarAfiliados(d, preco){
  var ligar = $('af-ligar');
  var campo = $('af-pct');

  function contas(){
    var caixa = $('af-conta');
    if (!caixa || !preco) return;

    var p = Number(campo.value) || 0;
    var plataforma = Math.round(preco * (st.comissao / 100));
    var afiliado = Math.round(preco * (p / 100));
    var meu = preco - plataforma - afiliado;

    caixa.innerHTML =
      'Numa venda de ' + esc(mzn(preco)) + ': a plataforma leva ' + esc(mzn(plataforma)) +
      ', o afiliado leva ' + esc(mzn(afiliado)) +
      ', e <b style="color:var(--tinta)">fica para si ' + esc(mzn(meu)) + '</b>.' +
      (meu < 0 ? ' <b style="color:var(--vermelho)">Assim sai a perder.</b>' : '');
  }

  ligar.onchange = function(){
    $('af-caixa').classList.toggle('escondido', !ligar.checked);
    contas();
  };
  campo.oninput = contas;
  contas();

  $('af-guardar').onclick = function(){
    var b = $('af-guardar');
    var liga = ligar.checked;
    var p = Math.round(Number(campo.value) || 0);

    if (liga && (p < d.min_pct || p > d.max_pct)) {
      aviso('A comissão tem de ficar entre ' + d.min_pct + '% e ' + d.max_pct + '%', 'mau');
      return;
    }

    b.disabled = true;
    b.textContent = 'A guardar…';

    api('/course-save', {
      curso: st.curso.id,
      aceita_afiliados: liga,
      comissao_afiliado: p
    }).then(function(){
      aviso(liga ? 'Afiliados ligados a ' + p + '%' : 'Afiliados desligados', 'bom');
      return abrirEditor(st.curso.id);
    }).then(function(){
      trocarAba('afiliados');
    }).catch(function(e){
      aviso(e.message, 'mau');
      b.disabled = false;
      b.textContent = 'Guardar';
    });
  };
}

/* ============================================================
   DETALHES
   ============================================================ */

function preencherFormulario(){
  var c = st.curso;
  $('titulo-editor').textContent = c.titulo;
  $('sub-editor').textContent = c.estado === 'Publicado'
    ? 'No ar · ' + c.total_alunos + ' alunos'
    : 'Rascunho, ainda não visível';

  $('f-titulo').value = c.titulo || '';
  $('f-subtitulo').value = c.subtitulo || '';
  $('f-descricao').value = c.descricao || '';
  $('f-categoria').value = c.categoria || '';
  $('f-nivel').value = c.nivel || 'Iniciante';
  $('f-gratis').checked = !!c.gratis;
  $('f-preco').value = c.preco || '';
  $('f-promo').value = c.preco_promo || '';
  $('f-aprende').value = (c.aprende || []).join('\n');
  $('f-requisitos').value = (c.requisitos || []).join('\n');
  $('f-certificado').checked = !!c.certificado;

  $('b-despublicar').classList.toggle('escondido', c.estado !== 'Publicado');
  $('b-publicar').textContent = c.estado === 'Publicado' ? 'Guardar e republicar' : 'Publicar curso';

  alternarPrecos();
  desenharCapa();
  desenharIntro();
}

function alternarPrecos(){
  var gratis = $('f-gratis').checked;
  $('caixa-precos').style.display = gratis ? 'none' : '';
  if (gratis) { $('nota-ganho').textContent = ''; return; }

  var preco = Number($('f-promo').value) > 0 ? Number($('f-promo').value) : Number($('f-preco').value);
  $('nota-ganho').innerHTML = preco > 0
    ? '<div class="nota">Em cada venda recebe ' +
      esc(mzn(preco * (100 - st.comissao) / 100)) + '.</div>'
    : '';
}

function guardarDetalhes(){
  var b = $('b-guardar');
  b.disabled = true;
  b.textContent = 'A guardar…';

  api('/course-save', {
    curso: st.curso.id,
    titulo: $('f-titulo').value.trim(),
    subtitulo: $('f-subtitulo').value.trim(),
    descricao: $('f-descricao').value.trim(),
    categoria: $('f-categoria').value,
    nivel: $('f-nivel').value,
    gratis: $('f-gratis').checked,
    preco: Number($('f-preco').value) || 0,
    preco_promo: Number($('f-promo').value) || 0,
    aprende: linhas($('f-aprende').value),
    requisitos: linhas($('f-requisitos').value),
    certificado: $('f-certificado').checked
  }).then(function(){
    aviso('Guardado', 'bom');
    return abrirEditor(st.curso.id);
  }).catch(function(e){
    aviso(e.message, 'mau');
  }).finally(function(){
    b.disabled = false;
    b.textContent = 'Guardar alterações';
  });
}

/* ============================================================
   CAPA
   ============================================================ */

function desenharCapa(){
  $('pre-capa').innerHTML = st.curso.capa
    ? '<img src="' + esc(st.curso.capa) + '" alt="Capa do curso">'
    : '';
  $('b-capa').textContent = st.curso.capa ? 'Trocar imagem' : 'Escolher imagem';

  if (st.consumo && st.consumo.bytes_max) {
    var livre = Math.max(0, st.consumo.bytes_max - st.consumo.bytes_usados);
    $('txt-capa').textContent = 'JPG, PNG ou WebP · ' + tamanho(livre) + ' livres no plano';
  }
}

function enviarCapa(ficheiro){
  if (!ficheiro) return;
  if (ficheiro.size > 5 * 1024 * 1024) {
    aviso('A imagem passa dos 5 MB', 'mau');
    return;
  }

  var leitor = new FileReader();
  leitor.onload = function(){
    $('b-capa').disabled = true;
    $('b-capa').textContent = 'A enviar…';

    api('/upload-image', {
      alvo: 'capa',
      curso: st.curso.id,
      mime: ficheiro.type,
      dados: String(leitor.result).split(',')[1]
    }).then(function(d){
      st.curso.capa = d.url;
      if (st.consumo) st.consumo.bytes_usados = d.bytes_usados;
      desenharCapa();
      desenharCheck();
      aviso('Capa actualizada', 'bom');
    }).catch(function(e){
      aviso(e.message, 'mau');
      if (/espaco|plano/i.test(e.message)) setTimeout(abrirPlanos, 1100);
    }).finally(function(){
      $('b-capa').disabled = false;
      desenharCapa();
    });
  };
  leitor.readAsDataURL(ficheiro);
}

/* ============================================================
   VIDEO — envio directo para a Bunny por TUS
   ============================================================ */

function desenharIntro(){
  var c = st.curso;
  $('pre-intro').innerHTML = c.intro_thumb
    ? '<img src="' + esc(c.intro_thumb) + '" alt="Vídeo de introdução">'
    : '';
  $('txt-intro').textContent = c.intro_video_id
    ? 'Enviado · ' + duracao(c.intro_duracao)
    : 'MP4 ou MOV · sem limite de tamanho';
  $('b-intro').textContent = c.intro_video_id ? 'Trocar vídeo' : 'Escolher vídeo';
}

function arcoHTML(pct){
  var raio = 33, volta = 2 * Math.PI * raio;
  var falta = volta * (1 - pct / 100);
  return '<div class="arco"><svg width="78" height="78" viewBox="0 0 78 78">' +
    '<circle class="fundo" cx="39" cy="39" r="' + raio + '"></circle>' +
    '<circle class="frente" cx="39" cy="39" r="' + raio +
      '" stroke-dasharray="' + volta.toFixed(1) + '" stroke-dashoffset="' + falta.toFixed(1) + '"></circle>' +
    '</svg><b>' + Math.round(pct) + '%</b></div>';
}

function enviarVideo(ficheiro, alvo, idAula, aoProgresso, aoFim){
  if (!ficheiro) return;
  if (typeof tus === 'undefined') {
    aviso('A biblioteca de envio não carregou. Recarregue a página.', 'mau');
    aoFim(false);
    return;
  }

  api('/video-token', {
    curso: st.curso.id,
    alvo: alvo,
    aula: idAula || '',
    titulo: ficheiro.name
  }).then(function(t){
    var envio = new tus.Upload(ficheiro, {
      endpoint: t.endpoint,
      retryDelays: [0, 3000, 6000, 12000, 30000, 60000],
      headers: {
        AuthorizationSignature: t.assinatura,
        AuthorizationExpire: String(t.validade),
        VideoId: t.video_id,
        LibraryId: String(t.biblioteca)
      },
      metadata: { filetype: ficheiro.type, title: ficheiro.name },
      onProgress: function(feitos, total){
        aoProgresso(total ? (feitos / total) * 100 : 0);
      },
      onError: function(erro){
        aviso('O envio falhou: ' + erro.message, 'mau');
        aoFim(false);
      },
      onSuccess: function(){
        api('/video-done', {
          curso: st.curso.id,
          alvo: alvo,
          aula: idAula || '',
          video_id: t.video_id
        }).then(function(){
          aviso('Vídeo enviado. A Bunny está a processar.', 'bom');
          aoFim(true, t.video_id);
          sondarVideo(t.video_id, idAula);
        }).catch(function(e){
          aviso(e.message, 'mau');
          aoFim(false);
        });
      }
    });
    envio.start();
  }).catch(function(e){
    aviso(e.message, 'mau');
    aoFim(false);
  });
}

function sondarVideo(idVideo, idAula){
  var tentativas = 0;
  var relogio = setInterval(function(){
    tentativas++;
    if (tentativas > 100) { clearInterval(relogio); return; }

    fetch(CFG.API + '/video-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_id: idVideo, aula: idAula || '' })
    }).then(function(r){ return r.json(); }).then(function(d){
      if (!d.ok) return;
      if (d.falhou) {
        clearInterval(relogio);
        delete st.sondas[idVideo];
        aviso('A Bunny não conseguiu processar este vídeo', 'mau');
        return;
      }
      if (d.pronto) {
        clearInterval(relogio);
        delete st.sondas[idVideo];
        if (st.curso) abrirEditor(st.curso.id).then(function(){
          if (idAula) trocarAba('conteudo');
        });
      }
    }).catch(function(){});
  }, 6000);

  st.sondas[idVideo] = relogio;
}

function pararSondas(){
  Object.keys(st.sondas).forEach(function(k){ clearInterval(st.sondas[k]); });
  st.sondas = {};
}

/* ============================================================
   MODULOS E AULAS
   ============================================================ */

function desenharModulos(){
  var area = $('area-modulos');

  if (!st.modulos.length) {
    area.innerHTML =
      '<div class="vazio">' +
        '<h2>Sem módulos</h2>' +
        '<p>Um módulo é um capítulo do curso. Crie o primeiro e vá juntando aulas.</p>' +
      '</div>';
    return;
  }

  area.innerHTML = st.modulos.map(function(m){
    var aulas = m.aulas.length
      ? m.aulas.map(function(a, i){ return htmlAula(a, i + 1); }).join('')
      : '<div class="sem-aulas">Este módulo ainda não tem aulas.</div>';

    return '<section class="modulo" data-mod="' + esc(m.id) + '">' +
      '<div class="modulo-topo">' +
        '<input type="text" value="' + esc(m.nome) + '" data-nome="' + esc(m.id) + '" aria-label="Nome do módulo">' +
        '<div class="modulo-acoes">' +
          '<button class="btn btn-mini" data-nova="' + esc(m.id) + '">Nova aula</button>' +
          '<button class="btn btn-mini btn-perigo" data-apagar-mod="' + esc(m.id) + '">Apagar</button>' +
        '</div>' +
      '</div>' + aulas +
    '</section>';
  }).join('');

  ligarModulos();
}

function htmlAula(a, ordem){
  var ponto = a.video_id
    ? (a.estado_video === 'ready'
        ? '<span class="ponto ok"></span>Vídeo pronto · ' + duracao(a.duracao)
        : '<span class="ponto espera"></span>A processar na Bunny')
    : '<span class="ponto"></span>Sem vídeo';

  return '<div class="aula" data-aula="' + esc(a.id) + '">' +
    '<div class="aula-topo">' +
      '<span class="ordem">' + ordem + '</span>' +
      '<input type="text" value="' + esc(a.titulo) + '" data-tit="' + esc(a.id) + '" aria-label="Título da aula">' +
      '<button class="btn btn-mini" data-video="' + esc(a.id) + '">' +
        (a.video_id ? 'Trocar vídeo' : 'Enviar vídeo') + '</button>' +
      '<button class="btn btn-mini btn-perigo" data-apagar-aula="' + esc(a.id) + '">Apagar</button>' +
    '</div>' +
    '<div class="aula-baixo">' +
      '<label class="troca"><input type="checkbox" data-livre="' + esc(a.id) + '"' +
        (a.livre ? ' checked' : '') + '><span>Aula livre</span></label>' +
      '<span class="estado-video" data-estado="' + esc(a.id) + '">' + ponto + '</span>' +
      '<span class="barra escondido" data-barra="' + esc(a.id) + '"><i></i></span>' +
    '</div>' +
  '</div>';
}

function ligarModulos(){
  var area = $('area-modulos');

  Array.prototype.forEach.call(area.querySelectorAll('[data-nome]'), function(inp){
    inp.onchange = function(){
      api('/module-save', {
        curso: st.curso.id,
        modulo: inp.getAttribute('data-nome'),
        nome: inp.value.trim()
      }).then(function(){ aviso('Módulo renomeado', 'bom'); })
        .catch(function(e){ aviso(e.message, 'mau'); });
    };
  });

  Array.prototype.forEach.call(area.querySelectorAll('[data-nova]'), function(b){
    b.onclick = function(){ novaAula(b.getAttribute('data-nova')); };
  });

  Array.prototype.forEach.call(area.querySelectorAll('[data-apagar-mod]'), function(b){
    b.onclick = function(){
      if (!confirm('Apagar este módulo?')) return;
      api('/module-delete', { curso: st.curso.id, modulo: b.getAttribute('data-apagar-mod') })
        .then(function(){ return abrirEditor(st.curso.id); })
        .then(function(){ trocarAba('conteudo'); aviso('Módulo apagado', 'bom'); })
        .catch(function(e){ aviso(e.message, 'mau'); });
    };
  });

  Array.prototype.forEach.call(area.querySelectorAll('[data-tit]'), function(inp){
    inp.onchange = function(){
      api('/lesson-save', {
        curso: st.curso.id,
        aula: inp.getAttribute('data-tit'),
        titulo: inp.value.trim()
      }).then(function(){ aviso('Aula gravada', 'bom'); })
        .catch(function(e){ aviso(e.message, 'mau'); });
    };
  });

  Array.prototype.forEach.call(area.querySelectorAll('[data-livre]'), function(cx){
    cx.onchange = function(){
      api('/lesson-save', {
        curso: st.curso.id,
        aula: cx.getAttribute('data-livre'),
        livre: cx.checked
      }).then(function(){
        aviso(cx.checked ? 'Aula aberta a todos' : 'Aula só para inscritos', 'bom');
      }).catch(function(e){
        aviso(e.message, 'mau');
        cx.checked = !cx.checked;
      });
    };
  });

  Array.prototype.forEach.call(area.querySelectorAll('[data-apagar-aula]'), function(b){
    b.onclick = function(){
      if (!confirm('Apagar esta aula? O vídeo também é apagado.')) return;
      api('/lesson-delete', { curso: st.curso.id, aula: b.getAttribute('data-apagar-aula') })
        .then(function(){ return abrirEditor(st.curso.id); })
        .then(function(){ trocarAba('conteudo'); aviso('Aula apagada', 'bom'); })
        .catch(function(e){ aviso(e.message, 'mau'); });
    };
  });

  Array.prototype.forEach.call(area.querySelectorAll('[data-video]'), function(b){
    b.onclick = function(){
      var id = b.getAttribute('data-video');
      var escolha = document.createElement('input');
      escolha.type = 'file';
      escolha.accept = 'video/*';
      escolha.onchange = function(){
        var f = escolha.files[0];
        if (!f) return;

        var barra = area.querySelector('[data-barra="' + id + '"]');
        var estado = area.querySelector('[data-estado="' + id + '"]');
        barra.classList.remove('escondido');
        b.disabled = true;

        enviarVideo(f, 'aula', id, function(pct){
          barra.querySelector('i').style.width = pct.toFixed(1) + '%';
          estado.innerHTML = '<span class="ponto espera"></span>A enviar ' + Math.round(pct) + '%';
        }, function(bom){
          b.disabled = false;
          barra.classList.add('escondido');
          if (bom) estado.innerHTML = '<span class="ponto espera"></span>A processar na Bunny';
        });
      };
      escolha.click();
    };
  });
}

function novoModulo(){
  var nome = prompt('Nome do módulo');
  if (!nome || !nome.trim()) return;

  api('/module-save', { curso: st.curso.id, nome: nome.trim() })
    .then(function(){ return abrirEditor(st.curso.id); })
    .then(function(){ trocarAba('conteudo'); aviso('Módulo criado', 'bom'); })
    .catch(function(e){ aviso(e.message, 'mau'); });
}

function novaAula(idModulo){
  var titulo = prompt('Título da aula');
  if (!titulo || !titulo.trim()) return;

  api('/lesson-save', {
    curso: st.curso.id,
    modulo: idModulo,
    titulo: titulo.trim(),
    tipo: 'Video'
  }).then(function(){ return abrirEditor(st.curso.id); })
    .then(function(){ trocarAba('conteudo'); aviso('Aula criada', 'bom'); })
    .catch(function(e){ aviso(e.message, 'mau'); });
}

/* ============================================================
   PUBLICACAO
   ============================================================ */

function desenharCheck(){
  var c = st.curso;
  var totalAulas = st.modulos.reduce(function(s, m){ return s + m.aulas.length; }, 0);

  var itens = [
    ['Título', !!c.titulo],
    ['Descrição', !!c.descricao],
    ['Categoria', !!c.categoria],
    ['Imagem de capa', !!c.capa],
    ['Vídeo de introdução', !!c.intro_video_id],
    ['Pelo menos uma aula', totalAulas > 0]
  ];

  var feitos = itens.filter(function(i){ return i[1]; }).length;

  $('resumo-check').textContent = feitos === itens.length
    ? (c.estado === 'Publicado' ? 'Está tudo no sítio.' : 'Está pronto a publicar.')
    : feitos + ' de ' + itens.length + ' condições cumpridas.';

  $('check').innerHTML = itens.map(function(i){
    return '<li class="' + (i[1] ? 'feito' : '') + '">' +
      '<span class="marca-c">' + (i[1] ? '✓' : '') + '</span>' + esc(i[0]) + '</li>';
  }).join('');

  $('b-publicar').disabled = feitos !== itens.length;
}

function publicar(){
  var b = $('b-publicar');
  b.disabled = true;
  b.textContent = 'A publicar…';

  api('/course-publish', { curso: st.curso.id }).then(function(d){
    aviso('Publicado · ' + d.aulas + ' aulas · ' + duracao(d.duracao), 'bom');
    return abrirEditor(st.curso.id);
  }).catch(function(e){
    aviso(e.message, 'mau');
    b.disabled = false;
    b.textContent = 'Publicar curso';
  });
}

function despublicar(){
  if (!confirm('Tirar o curso do catálogo? Quem já comprou continua a ter acesso.')) return;

  api('/course-unpublish', { curso: st.curso.id })
    .then(function(){ aviso('Voltou a rascunho', 'bom'); return abrirEditor(st.curso.id); })
    .catch(function(e){ aviso(e.message, 'mau'); });
}

function apagarCurso(){
  if (!confirm('Apagar este curso? Não há volta atrás.')) return;

  api('/course-delete', { curso: st.curso.id })
    .then(function(d){
      aviso('Curso apagado' + (d.libertou ? ' · ' + d.libertou + ' libertos' : ''), 'bom');
      voltarLista();
    })
    .catch(function(e){ aviso(e.message, 'mau'); });
}

/* ============================================================
   LIGACOES
   ============================================================ */

$('b-marca').onclick = voltarLista;
$('b-novo').onclick = novoCurso;
$('b-voltar').onclick = voltarLista;
$('b-voltar-planos').onclick = voltarDosPlanos;
$('b-guardar').onclick = guardarDetalhes;
$('b-modulo').onclick = novoModulo;
$('b-publicar').onclick = publicar;
$('b-despublicar').onclick = despublicar;
$('b-apagar').onclick = apagarCurso;

$('f-gratis').onchange = alternarPrecos;
$('f-preco').oninput = alternarPrecos;
$('f-promo').oninput = alternarPrecos;

$('b-capa').onclick = function(){ $('in-capa').click(); };
$('in-capa').onchange = function(){ enviarCapa($('in-capa').files[0]); };

$('b-intro').onclick = function(){ $('in-intro').click(); };
$('in-intro').onchange = function(){
  var f = $('in-intro').files[0];
  if (!f) return;

  var caixa = $('pre-intro');
  $('b-intro').disabled = true;

  enviarVideo(f, 'intro', '', function(pct){
    caixa.innerHTML = arcoHTML(pct);
    $('txt-intro').textContent = 'A enviar para a Bunny';
  }, function(bom){
    $('b-intro').disabled = false;
    if (bom) {
      caixa.innerHTML = arcoHTML(100);
      $('txt-intro').textContent = 'Enviado. A processar.';
    } else {
      desenharIntro();
    }
  });
};

$('cortina').onclick = function(ev){
  if (ev.target === $('cortina')) fecharCortina();
};

document.addEventListener('keydown', function(ev){
  if (ev.key === 'Escape' && !$('cortina').classList.contains('escondido')) fecharCortina();
});

Array.prototype.forEach.call(document.querySelectorAll('.aba'), function(b){
  b.onclick = function(){ trocarAba(b.getAttribute('data-aba')); };
});

window.addEventListener('beforeunload', pararSondas);

arrancar();

})();
</script>
