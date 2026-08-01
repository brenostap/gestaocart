// ===========================================================================
// VERSÃO — avisa quando a tela está rodando código velho
//
// O dono abre o painel por um ÍCONE na tela de início do iPhone. Isso roda num
// WebView standalone do iOS, com cache próprio (separado do Safari), que na
// prática ignora o `must-revalidate` -- inclusive para o index.html. Resultado:
// depois de um deploy o celular continua servindo a versão antiga, calado.
// Conferido em 01/ago/2026: servidor mandando max-age=0 + ETag em tudo, código
// novo publicado, no Safari privado funcionava e pelo ícone não.
//
// Isso não é chatice: fechar a folha do mês olhando uma versão velha do painel
// é decisão de dinheiro em cima de dado velho.
//
// COMO FUNCIONA
//   1. A versão é o `?v=` dos <script>/<link> do index.html. FONTE ÚNICA:
//      não há constante duplicada aqui -- este arquivo lê a própria URL.
//   2. No boot (e ao voltar pro app) busca o index.html com cache:'no-store',
//      que é o que o WebView não consegue servir do cache, e lê o `?v=` de lá.
//   3. Diferente do nosso => estamos velhos => faixa "Nova versão".
//   4. Atualizar recarrega numa URL NOVA (?r=<timestamp>). Endereço inédito é o
//      que o WebView não tem em cache -- reload simples ele serve do disco.
//
// AO SUBIR MUDANÇA EM js/ ou css/: bumpe o `?v=` no index.html (o mesmo valor
// em todas as tags). É a única coisa a lembrar.
// ===========================================================================

// Versão desta sessão: sai da URL deste próprio <script>.
const APP_VERSAO = (function(){
  const s = document.currentScript && document.currentScript.src;
  const m = s && s.match(/[?&]v=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
})();

let _versaoDispensada = null;   // versão que o dono mandou calar
let _versaoUltimaChecagem = 0;  // throttle: alternar de app não vira enxurrada

// Lê a versão publicada AGORA, furando o cache do WebView.
async function versaoPublicada(){
  // ?_= muda a URL a cada chamada: nem WebView nem proxy têm essa em cache.
  const r = await fetch('index.html?_=' + Date.now(), {cache:'no-store'});
  if(!r.ok) throw new Error('HTTP ' + r.status);
  const html = await r.text();
  const m = html.match(/js\/config\.js\?v=([^"'&]+)/);
  return m ? m[1] : null;
}

function mostrarFaixaVersao(nova){
  if(document.getElementById('faixa-versao')) return;
  const el = document.createElement('div');
  el.id = 'faixa-versao';
  el.className = 'c-faixa-versao';
  el.innerHTML = `
    <span class="c-faixa-versao-txt">
      <b>Nova versão disponível.</b>
      Esta tela está rodando código antigo — confira o fechamento só depois de atualizar.
    </span>
    ${UI.btn('Atualizar', {onclick:'recarregarLimpo()', variante:'primario', sm:true})}
    ${UI.btn('✕', {onclick:`dispensarFaixaVersao('${nova}')`,
                   variante:'sutil', sm:true, titulo:'Dispensar'})}`;
  document.body.appendChild(el);
  console.warn('[versao] rodando', APP_VERSAO, '· publicada', nova);
}

// Dispensar cala ESTA versão. Se sair outra depois, avisa de novo -- o risco
// que isso protege (fechar a folha com dado velho) volta a cada deploy.
function dispensarFaixaVersao(nova){
  _versaoDispensada = nova;
  document.getElementById('faixa-versao')?.remove();
}

// Recarrega num endereço que o WebView nunca viu -- é o que fura o cache dele.
function recarregarLimpo(){
  const u = new URL(window.location.href);
  u.searchParams.set('r', String(Date.now()));
  window.location.replace(u.toString());
}

async function checarVersao(){
  if(!APP_VERSAO) return;            // servindo de file:// ou sem ?v= -- nada a comparar
  const agora = Date.now();
  if(agora - _versaoUltimaChecagem < 30000) return;
  _versaoUltimaChecagem = agora;
  try{
    const nova = await versaoPublicada();
    if(nova && nova !== APP_VERSAO && nova !== _versaoDispensada) mostrarFaixaVersao(nova);
  }catch(e){
    // Offline ou instável: silêncio. Não vale assustar o dono por causa de rede.
    console.debug('[versao] não deu para checar:', e.message);
  }
}

// No boot e toda vez que o app volta pro primeiro plano -- que é justamente
// quando o dono reabre o ícone depois de um deploy.
function iniciarChecagemVersao(){
  checarVersao();
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'visible') checarVersao();
  });
}
