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
let vitSoParados = false;      // >= VIT_PARADO_DIAS na prateleira
let vitModelo = 'todos';   // "iPhone 13 Pro Max"
let vitCap    = 'todas';   // "256GB"

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
function toggleVitParados(){
  vitSoParados = !vitSoParados;
  if(currentTab === 'vitrine') renderContent();
}
function toggleVitAssistencia(){
  vitEsconderAssistencia = !vitEsconderAssistencia;
  if(currentTab === 'vitrine') renderContent();
}

// Enriquece o item da view com o que a linha precisa. NÃO usa dadosDoItem()
// (estoque.js) de propósito: aquele fala de custo, margem e fornecedor, que não
// existem aqui — e um null a mais em cada campo só esconderia a intenção.
// Dia de prateleira: 60 dias e onde o carrego (0,1%/dia, CUSTO_CAPITAL_MES)
// ja comeu ~6% do custo do aparelho. Nao e alarme, e ordem de prioridade pra
// quem grava conteudo e pra quem esta com o cliente na frente.
const VIT_PARADO_DIAS = 60;

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
    // null quando a entrada nao foi achada (nem compra nem troca) -- e nesse
    // caso a tela NAO mostra nada, em vez de fingir "0 dias".
    dias: item.dias_parado == null ? null : Number(item.dias_parado),
    imei4: String(item.imei_1 || '').slice(-4),
  };
}

function setVitModelo(m){ vitModelo = m; if(currentTab==='vitrine') renderContent(); }
function setVitCap(c){    vitCap    = c; if(currentTab==='vitrine') renderContent(); }

function vitFiltrados(){
  const q = (vitBusca || '').toLowerCase().trim();
  return (vitItens || []).map(vitDados).filter(d => {
    if(vitEsconderAssistencia && d.naAssistencia) return false;
    if(vitSoParados && !(d.dias != null && d.dias >= VIT_PARADO_DIAS)) return false;
    if(vitModelo !== 'todos' && d.modelo !== vitModelo) return false;
    if(vitCap    !== 'todas' && d.capacidade !== vitCap) return false;
    if(!q) return true;
    return d.titulo.toLowerCase().includes(q)
        || String(d.item.serial || '').toLowerCase().includes(q)
        || String(d.item.imei_1 || '').includes(q);
  });
}

// As opcoes saem do proprio estoque: modelo novo aparece sozinho, e modelo que
// acabou some. Lista fixa no codigo envelheceria a cada lancamento da Apple.
function vitOpcoes(){
  const dados = (vitItens || []).map(vitDados);
  const modelos = [...new Set(dados.map(d => d.modelo).filter(m => m && m !== 'iPhone ?'))]
    // "iPhone 13 Pro Max" -> ordena por geracao desc, depois alfabetico
    .sort((a,b) => {
      const g = s => Number((String(s).match(/iPhone\s+(\d+)/i)||[])[1] || 0);
      return g(b) - g(a) || a.localeCompare(b);
    });
  const caps = [...new Set(dados.map(d => d.capacidade).filter(c => c && c !== '?'))]
    .sort((a,b) => (parseInt(a) || 0) - (parseInt(b) || 0));
  return { modelos, caps };
}

// Quantos estao parados na operacao INTEIRA -- nao no filtro. Mesma regra do
// contador de assistencia logo abaixo: o chip precisa dizer quanto tem pra
// achar, senao ninguem toca nele.
function vitQtdParados(){
  return (vitItens || []).filter(i => i.dias_parado != null && Number(i.dias_parado) >= VIT_PARADO_DIAS).length;
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

  const { modelos, caps } = vitOpcoes();
  return `<div class="vit-tela">
    <div class="vit-busca-wrap">
      <input class="c-input vit-busca" id="vit-busca" type="search"
             placeholder="Modelo, cor, etiqueta ou IMEI"
             value="${UI.esc(vitBusca)}" oninput="setVitBusca(this.value)"
             autocapitalize="none" autocorrect="off" spellcheck="false">
      <div class="vit-filtros">
        ${UI.select({ id:'vit-modelo', valor:vitModelo, extra:'onchange="setVitModelo(this.value)"',
          opcoes:[{v:'todos', t:'Todos os modelos'}, ...modelos.map(m => ({v:m, t:m}))] })}
        ${UI.select({ id:'vit-cap', valor:vitCap, extra:'onchange="setVitCap(this.value)"',
          opcoes:[{v:'todas', t:'Todas as capacidades'}, ...caps.map(c => ({v:c, t:c}))] })}
      </div>
      <div class="vit-barra">
        <span class="vit-contador" id="vit-contador">${vitContadorTxt()}</span>
        ${UI.chip(vitEsconderAssistencia ? 'Mostrando só o que está na loja' : 'Esconder o que está na assistência',
                  vitEsconderAssistencia, 'toggleVitAssistencia()')}
        ${vitQtdParados() ? UI.chip(`Parados há ${VIT_PARADO_DIAS}+ dias (${vitQtdParados()})`,
                  vitSoParados, 'toggleVitParados()') : ''}
      </div>
    </div>
    <div id="vit-lista">${vitListaHTML()}</div>
  </div>`;
}

function vitListaHTML(){
  const dados = vitFiltrados();
  if(!dados.length){
    // Tres vazios diferentes, e mandar atualizar o app nos tres seria mentira:
    //   filtro/busca sem resultado -> a loja tem aparelho, esse recorte nao tem
    //   nada carregado             -> leitura que nao veio (o caso do app velho)
    const filtrando = !!vitBusca || vitModelo !== 'todos' || vitCap !== 'todas' || vitEsconderAssistencia;
    if(filtrando) return UI.vazio({
      titulo:'Nenhum aparelho com esse filtro',
      texto:'Tente o modelo ("13 Pro"), a cor, a etiqueta ou os últimos dígitos do IMEI — ou limpe os filtros.',
      acao: UI.btn('Limpar filtros', {onclick:'limparFiltrosVitrine()', variante:'sutil'}),
    });
    return UI.vazio({
      titulo:'Nenhum aparelho carregado',
      texto:'Se você esperava ver aparelhos aqui, quase sempre é código antigo guardado no aparelho. Atualizar resolve.',
      acao: typeof recarregarLimpo === 'function'
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

  // Dia de prateleira entra como SELO, nao no meta: ele muda a decisao ("mostra
  // esse primeiro"), e meta e identificacao (bateria, etiqueta, IMEI).
  if(d.dias != null && d.dias >= VIT_PARADO_DIAS)
    selos.push(UI.badge(`${d.dias} dias parado`, d.dias >= 90 ? 'critico' : 'alerta'));

  const meta = [
    d.bateria != null ? `${d.bateria}%` : null,
    d.item.serial ? UI.esc(d.item.serial) : null,
    d.imei4 ? '⋯' + d.imei4 : null,
    d.dias != null && d.dias < VIT_PARADO_DIAS ? `${d.dias}d na loja` : null,
  ].filter(Boolean).join(' · ');

  return `<div class="vit-card${d.naAssistencia ? ' fora' : ''}">
    <div class="vit-card-topo">
      <div class="vit-nome">${UI.esc(d.modelo)} <span class="vit-cap">${UI.esc(d.capacidade)}</span></div>
      <div class="vit-precos">
        <span class="vit-preco">${d.varejo != null ? brl(d.varejo) : '<span class="vit-sempreco">sem preço na tabela</span>'}</span>
        ${d.upgrade != null ? `<span class="vit-upgrade">upgrade ${brl(d.upgrade)}</span>` : ''}
      </div>
    </div>
    <div class="vit-card-meta">
      <span class="vit-cor">${UI.esc(d.cor)}</span>
      ${meta ? `<span class="vit-mono">${meta}</span>` : ''}
    </div>
    ${selos.length ? `<div class="vit-selos">${selos.join('')}</div>` : ''}
  </div>`;
}

function limparFiltrosVitrine(){
  vitBusca = ''; vitModelo = 'todos'; vitCap = 'todas'; vitEsconderAssistencia = false;
  vitSoParados = false;
  if(currentTab === 'vitrine') renderContent();
}

async function recarregarVitrine(){
  vitCarregado = false;
  if(currentTab === 'vitrine') renderContent();
  await carregarVitrine();
  if(currentTab === 'vitrine') renderContent();
}
