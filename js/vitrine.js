// ============================================================================
// VITRINE — o estoque na mão de quem vende
//
// É a tela que o vendedor online abre pra responder o cliente na hora. Hoje ele
// pergunta no grupo do WhatsApp e espera alguém olhar o painel.
//
// ⚠️ TRÊS COISAS QUE PRECISAM VIR JUNTAS, e nenhuma vem da tabela `estoque`:
//
//   preço          `estoque.preco_varejo` está VAZIO em 100% dos itens (medido
//                  em 17/ago/2026). O preço oficial é a planilha do Google, que
//                  chega em `tabela_precos` — fechada em eh_socio(). Por isso a
//                  view `v_tabela_precos`: mesma linha, mesmo getPrecoVenda(),
//                  só muda de onde o cache foi preenchido.
//   assistência    35 dos 218 aparelhos (16%) estão fora da loja marcados como
//                  disponíveis. Prometer um deles é o problema que a tabela
//                  `bancada` nasceu pra resolver — e ela é fechada em
//                  pode_operar(). O selo chega pronto pela view.
//   estado         saldão · reservado · bloqueado, de `estoque_estado`.
//
// O papel `comercial` NÃO ganhou permissão em nenhuma dessas tabelas. A
// informação vem mastigada por `v_estoque_vitrine`. Ver docs/PERFIS-E-ACESSO.md.
// ============================================================================

let vitItens = [];
let vitCarregado = false;
let vitErro = '';
let vitBusca = '';
let vitEsconderAssistencia = false;

async function carregarVitrine(){
  vitErro = '';
  try{
    // O preço vem junto: sem ele a tela vira uma lista de aparelhos sem
    // resposta pra pergunta que o cliente fez ("quanto custa?").
    if(typeof carregarTabelaPrecos === 'function') await carregarTabelaPrecos();
    vitItens = await sbGet('v_estoque_vitrine', 'order=titulo.asc', 2000);
  }catch(e){
    console.warn('[vitrine] carga falhou:', e.message);
    vitErro = e.message || 'falha ao carregar';
    vitItens = [];
  }
  vitCarregado = true;
}

function setVitBusca(v){
  vitBusca = v;
  const el = document.getElementById('vit-lista');
  if(el) el.innerHTML = vitListaHTML();
  const c = document.getElementById('vit-contador');
  if(c) c.textContent = vitContadorTxt();
}
function toggleVitAssistencia(){
  vitEsconderAssistencia = !vitEsconderAssistencia;
  if(currentTab === 'vitrine') renderContent();
}

// Enriquece o item da view com o que a linha precisa. NÃO usa dadosDoItem()
// (estoque.js) de propósito: aquele fala de custo, margem e fornecedor, que não
// existem aqui — e um null a mais em cada campo só esconderia a intenção.
function vitDados(item){
  const titulo = item.titulo || '';
  const { modelo, capacidade, cor, condicao } = parseTitulo(titulo);
  const preco = typeof getPrecoVendaSync === 'function' ? getPrecoVendaSync(item) : null;
  return {
    item, titulo, modelo, capacidade, cor,
    condicao: condicao || 'Seminovo',
    bateria: item.bateria == null ? null : Number(item.bateria),
    varejo: preco && preco.varejo != null ? preco.varejo : null,
    upgrade: preco && preco.upgrade != null ? preco.upgrade : null,
    naAssistencia: !!item.na_assistencia,
    estado: item.estado || null,
    imei4: String(item.imei_1 || '').slice(-4),
  };
}

function vitFiltrados(){
  const q = (vitBusca || '').toLowerCase().trim();
  return (vitItens || []).map(vitDados).filter(d => {
    if(vitEsconderAssistencia && d.naAssistencia) return false;
    if(!q) return true;
    return d.titulo.toLowerCase().includes(q)
        || String(d.item.serial || '').toLowerCase().includes(q)
        || String(d.item.imei_1 || '').includes(q);
  });
}

function vitContadorTxt(){
  const n = vitFiltrados().length;
  const fora = (vitItens || []).filter(i => i.na_assistencia).length;
  return `${n} aparelho${n === 1 ? '' : 's'}` + (fora ? ` · ${fora} na assistência` : '');
}

function renderVitrine(){
  if(!vitCarregado){
    return UI.card({ corpo: UI.vazio({ titulo:'Carregando…', texto:'Buscando o estoque disponível.' }) });
  }
  if(vitErro){
    return UI.card({ corpo: UI.vazio({
      titulo:'Não consegui carregar o estoque',
      texto:'Tente atualizar. ('+UI.esc(vitErro)+')',
      acao: UI.btn('Tentar de novo', {onclick:'recarregarVitrine()', variante:'primario'}) }) });
  }

  return `<div class="vit-tela">
    <div class="vit-busca-wrap">
      <input class="c-input vit-busca" id="vit-busca" type="search"
             placeholder="Modelo, cor, etiqueta ou IMEI"
             value="${UI.esc(vitBusca)}" oninput="setVitBusca(this.value)"
             autocapitalize="none" autocorrect="off" spellcheck="false">
      <div class="vit-barra">
        <span class="vit-contador" id="vit-contador">${vitContadorTxt()}</span>
        ${UI.chip(vitEsconderAssistencia ? 'Mostrando só o que está na loja' : 'Esconder o que está na assistência',
                  vitEsconderAssistencia, 'toggleVitAssistencia()')}
      </div>
    </div>
    <div id="vit-lista">${vitListaHTML()}</div>
  </div>`;
}

function vitListaHTML(){
  const dados = vitFiltrados();
  if(!dados.length){
    // Sem busca e sem item nao e "estoque vazio": e leitura que nao veio.
    // Dizer "vazio" faz o vendedor acreditar que a loja nao tem aparelho.
    return UI.vazio({
      titulo: vitBusca ? 'Nenhum aparelho com esse termo' : 'Nenhum aparelho carregado',
      texto: vitBusca ? 'Tente o modelo ("13 Pro"), a cor, a etiqueta ou os últimos dígitos do IMEI.'
                      : 'Se você esperava ver aparelhos aqui, quase sempre é código antigo guardado no aparelho. Atualizar resolve.',
      acao: (!vitBusca && typeof recarregarLimpo === 'function')
        ? UI.btn('Atualizar agora', {onclick:'recarregarLimpo()', variante:'primario'}) : '',
    });
  }
  return `<div class="vit-lista">${dados.map(vitCartao).join('')}</div>`;
}

// Cartão desenhado, não tabela genérica: o vendedor lê isso em pé, no celular,
// com o cliente esperando. Rótulo some — a forma explica (88% é bateria,
// ⋯3324 é final de IMEI). Regra do docs/DESIGN-SYSTEM.md.
function vitCartao(d){
  const selos = [];
  if(d.naAssistencia) selos.push(UI.badge('Na assistência', 'alerta'));
  if(d.estado === 'saldao')    selos.push(UI.badge('Saldão', 'ok'));
  if(d.estado === 'reservado') selos.push(UI.badge('Reservado', 'processo'));
  if(d.estado === 'bloqueado') selos.push(UI.badge('Bloqueado', 'critico'));
  if(d.condicao === 'Lacrado') selos.push(UI.badge('Lacrado', 'marca'));

  const meta = [
    d.bateria != null ? `${d.bateria}%` : null,
    d.item.serial ? UI.esc(d.item.serial) : null,
    d.imei4 ? '⋯' + d.imei4 : null,
  ].filter(Boolean).join(' · ');

  return `<div class="vit-card${d.naAssistencia ? ' fora' : ''}">
    <div class="vit-card-topo">
      <div class="vit-nome">${UI.esc(d.modelo)} <span class="vit-cap">${UI.esc(d.capacidade)}</span></div>
      <div class="vit-preco">${d.varejo != null ? brl(d.varejo) : '<span class="vit-sempreco">sem preço na tabela</span>'}</div>
    </div>
    <div class="vit-card-meta">
      <span class="vit-cor">${UI.esc(d.cor)}</span>
      ${meta ? `<span class="vit-mono">${meta}</span>` : ''}
    </div>
    ${selos.length ? `<div class="vit-selos">${selos.join('')}</div>` : ''}
    <div class="vit-acoes">
      ${UI.btn('Copiar pro cliente', {onclick:`vitCopiar(${d.item.id})`, sm:true, variante:'sutil'})}
      ${d.upgrade != null ? `<span class="vit-upgrade">Troca: ${brl(d.upgrade)}</span>` : ''}
    </div>
  </div>`;
}

// O texto que ele manda no WhatsApp. Sem IMEI e sem etiqueta: é mensagem pra
// cliente, não controle interno. Aparelho na assistência NÃO vira mensagem --
// prometer o que não está na prateleira é o problema que essa tela resolve.
function vitTextoCliente(d){
  const linhas = [
    `${d.modelo} ${d.capacidade} ${d.cor}`.replace(/\s+/g,' ').trim(),
    d.condicao === 'Lacrado' ? 'Lacrado' : `Seminovo${d.bateria != null ? ` · bateria ${d.bateria}%` : ''}`,
    d.varejo != null ? brl(d.varejo) : null,
  ].filter(Boolean);
  return linhas.join('\n');
}

function vitCopiar(id){
  const item = (vitItens || []).find(i => i.id === id);
  if(!item) return;
  const d = vitDados(item);
  if(d.naAssistencia){
    alert('Esse aparelho está na assistência — não dá pra prometer entrega hoje.');
    return;
  }
  const txt = vitTextoCliente(d);
  const ok = () => vitAviso('Copiado: ' + d.modelo + ' ' + d.capacidade);
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(txt).then(ok).catch(() => vitCopiarFallback(txt, ok));
  } else vitCopiarFallback(txt, ok);
}

// O WebView do iOS nega clipboard fora de gesto direto em alguns casos; sem
// este caminho o botao falharia calado justamente no aparelho onde ele e usado.
function vitCopiarFallback(txt, ok){
  const ta = document.createElement('textarea');
  ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try{ document.execCommand('copy'); ok(); }catch(e){ alert(txt); }
  ta.remove();
}

// Confirmacao discreta. Nao usa alert(): copiar e um gesto de repeticao, e um
// modal a cada toque atrapalha justamente quem esta com o cliente na frente.
function vitAviso(txt){
  const el = document.getElementById('status-bar');
  if(!el) return;
  el.textContent = txt;
  clearTimeout(vitAviso._t);
  vitAviso._t = setTimeout(() => {
    if(typeof updateStatusBar === 'function') updateStatusBar();
  }, 2500);
}

async function recarregarVitrine(){
  vitCarregado = false;
  if(currentTab === 'vitrine') renderContent();
  await carregarVitrine();
  if(currentTab === 'vitrine') renderContent();
}
