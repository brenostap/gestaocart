// ============================================================================
// COMPRAS — entradas de estoque por compra (espelho da tela de Vendas).
//
// Uma compra por linha (ordem de registro = data_entrada desc). Clicar EXPANDE
// a linha inline, listando os itens da compra um por linha (modelo/serie/IMEI/
// custo). A coluna Fornecedor mostra tambem a quantidade de itens. KPIs no topo,
// filtros por fornecedor + busca (fornecedor/modelo/IMEI); periodo do contexto.
//
// So-socio (todo valor aqui e CUSTO). Estoque unico: a tabela `compras` nao tem
// loja, entao o filtro Cart/Urban da barra lateral NAO se aplica aqui.
//
// Carga SOB DEMANDA: nada disso entra no load global. Na 1a vez que a aba abre,
// carregarCompras() busca os cabecalhos dos ultimos 6 meses + uma contagem leve
// de itens capturados por compra (pro selo "parcial"/"sem detalhe"). Os itens
// completos so vem ao expandir a linha (buscarItensCompra). Reusa o padrao de
// linha expansivel do Estoque (.est-detalhe/.est-linha.aberta) e os blocos de
// item da ficha de Vendas (.vf-item) -> zero CSS novo.
// ============================================================================

let comprasCache = null;        // {rows:[...cabecalhos 6m...], countMap:{compra_id:qtdCapturada}}
let comprasLoading = false;
let comprasErro = null;
let comprasAbertas = new Set(); // ids das compras com a linha expandida (multiplas)
let comprasSearch = '';
let comprasFornecedor = 'todas';
let comprasSortCol = '';        // '' = ordem de registro (data desc)
let comprasSortDir = -1;
let comprasItens = {};          // compra_id -> 'buscando' | [itens]  (lazy, ao expandir)
let comprasBuscaIds = null;     // Set de compra_id que casam a busca por modelo/IMEI (servidor)
let _comprasBuscaSeq = 0;       // descarta respostas de busca obsoletas

// -- Carga sob demanda ------------------------------------------------------
async function carregarCompras(){
  if(comprasLoading) return;
  comprasLoading = true; comprasErro = null;
  try{
    // Mesma janela de 6 meses das vendas; o periodo do contexto filtra no cliente.
    const now = new Date();
    const cutoff = new Date(now.getFullYear(), now.getMonth()-5, 1).toISOString();
    const rows = await sbGet('compras', `data_entrada=gte.${cutoff}&order=data_entrada.desc`, 3000);

    // Contagem de itens capturados por compra -- so 2 colunas, barato. Serve pro
    // selo "parcial" (capturado < qtd do cabecalho) sem abrir cada linha.
    const ids = rows.map(c => c.id);
    const countMap = {};
    for(let i=0;i<ids.length;i+=100){
      const lote = ids.slice(i,i+100);
      const its = await sbGet('compra_produtos',
        `select=compra_id,quantidade&compra_id=in.(${lote.join(',')})`, 5000);
      (its||[]).forEach(it => {
        countMap[it.compra_id] = (countMap[it.compra_id]||0) + (parseInt(it.quantidade||1)||1);
      });
    }
    comprasCache = { rows, countMap };
  }catch(e){
    console.warn('[compras] carga', e);
    comprasErro = e?.message || 'Erro ao carregar compras';
  }finally{
    comprasLoading = false;
    if(currentTab==='compras') renderContent();
  }
}

function recarregarCompras(){
  comprasCache = null; comprasErro = null;
  comprasItens = {}; comprasBuscaIds = null; comprasAbertas = new Set();
  if(currentTab==='compras') renderContent();
}

// -- Cabecalho (reusado no estado de carga e no carregado) ------------------
function comprasCabecalho(){
  return `
    <div class="pg-head">
      <div>
        <div class="pg-kicker">Operações</div>
        <h1 class="pg-title">Compras</h1>
        <div class="pg-desc">Entradas de estoque por compra — fornecedor, itens e custo. Estoque único (sem separação por loja).</div>
      </div>
      <div class="pg-acoes">
        ${UI.btn('↻ Atualizar', {onclick:'recarregarCompras()', variante:'primario'})}
      </div>
    </div>`;
}

// -- Tela -------------------------------------------------------------------
function renderCompras(){
  // 1a abertura: dispara a carga e mostra o estado de carregando.
  if(!comprasCache && !comprasErro){
    if(!comprasLoading) carregarCompras();
    return comprasCabecalho() + UI.card({ corpo: UI.vazio({
      ico:'⏳', titulo:'Carregando compras…',
      texto:'Buscando as compras dos últimos meses. Os itens de cada compra abrem ao clicar na linha.' }) });
  }
  if(comprasErro){
    return comprasCabecalho() + UI.card({ corpo: UI.vazio({
      ico:'⚠️', titulo:'Não deu para carregar as compras', texto: comprasErro,
      acao: UI.btn('Tentar de novo', {onclick:'recarregarCompras()', variante:'primario'}) }) });
  }

  // Periodo do contexto (reusa a logica das vendas -- descarta canceled/pending
  // via data_saida aliasado para data_entrada).
  const base = filterByPeriod(comprasCache.rows.map(c => ({ ...c, data_saida:c.data_entrada })));

  let rows = base.map(c => {
    const capt = comprasCache.countMap[c.id] || 0;
    const qtd  = parseInt(c.qtd_produtos||0) || 0;
    return {
      id: c.id,
      data: (c.data_entrada||'').slice(0,10),
      dataTs: c.data_entrada || '',
      fornecedor: c.fornecedor_nome || '—',
      status: c.status,
      valor: parseFloat(c.valor_total||0),
      qtd,
      capturado: capt,
      semDetalhe: capt === 0,
      parcial: capt > 0 && capt < qtd,
      obs: c.observacoes || '',
    };
  });

  // Fornecedores do periodo (pro select).
  const forns = [...new Set(base.map(c => c.fornecedor_nome).filter(Boolean))].sort();

  // Filtros. A busca casa fornecedor/#id localmente; modelo/IMEI vem de uma
  // consulta leve ao servidor (comprasBuscaServidor -> comprasBuscaIds).
  if(comprasFornecedor !== 'todas') rows = rows.filter(r => r.fornecedor === comprasFornecedor);
  if(comprasSearch){
    const q = comprasSearch.toLowerCase();
    rows = rows.filter(r =>
      r.fornecedor.toLowerCase().includes(q) ||
      String(r.id).includes(q) ||
      (comprasBuscaIds && comprasBuscaIds.has(r.id))
    );
  }

  // Sort por coluna (padrao = ordem de registro, ja vem data desc do servidor).
  if(comprasSortCol){
    rows = rows.slice().sort((a,b) => {
      let va = comprasSortCol==='data' ? a.dataTs : a[comprasSortCol];
      let vb = comprasSortCol==='data' ? b.dataTs : b[comprasSortCol];
      if(typeof va === 'number' && typeof vb === 'number') return (va-vb)*comprasSortDir;
      return String(va||'').localeCompare(String(vb||''))*comprasSortDir;
    });
  }

  // KPIs (so-socio: money sempre mostra).
  const nCompras = rows.length;
  const nItens   = rows.reduce((a,r) => a+r.qtd, 0);
  const valTotal = rows.reduce((a,r) => a+r.valor, 0);
  const kpis = UI.kpis([
    { rotulo:'Compras',     valor: nCompras,        sub:'no período' },
    { rotulo:'Itens',       valor: nItens,          sub:'unidades compradas' },
    { rotulo:'Valor total', valor: money(valTotal), sub:'custo de entrada' },
  ]);

  // Aviso das compras ainda sem detalhe completo (backfill do sync em andamento).
  const nParciais = rows.filter(r => r.semDetalhe || r.parcial).length;
  const alertas = nParciais
    ? `<div class="v-alerta" data-tom="alerta">
        <span>${nParciais} compra(s) ainda sem o detalhe completo dos itens — o backfill do sync preenche aos poucos.</span>
      </div>`
    : '';

  // Barra de filtros.
  const opt = (val, atual, txt) =>
    `<option value="${escapeHtml(val)}"${atual===val?' selected':''}>${escapeHtml(txt)}</option>`;
  const ativos = (comprasSearch?1:0) + (comprasFornecedor!=='todas'?1:0);
  const filtros = `
    <div class="est-barra">
      <div class="est-busca">
        <span class="est-busca-ico">⌕</span>
        <input type="text" placeholder="Buscar fornecedor, modelo ou IMEI..."
               value="${escapeHtml(comprasSearch)}" oninput="filtrarCompras('search',this.value)">
      </div>
      <label class="est-sel"><span>Fornecedor</span>
        <select onchange="filtrarCompras('fornecedor',this.value)">
          ${opt('todas',comprasFornecedor,'Todos')}${forns.map(f => opt(f,comprasFornecedor,f)).join('')}
        </select></label>
      ${ativos ? UI.btn('Limpar filtros', {onclick:"filtrarCompras('limpar')", variante:'sutil', sm:true}) : ''}
    </div>`;

  // Tabela: uma compra por linha; clicar expande inline (linha .est-detalhe).
  const seta = col => comprasSortCol===col ? (comprasSortDir>0 ? ' ▲' : ' ▼') : '';
  const th = (col, txt, num) =>
    `<th class="${num?'num ':''}ord" onclick="sortCompras('${col}')">${txt}${seta(col)}</th>`;

  const linhaCompra = r => {
    const aberta = comprasAbertas.has(r.id);
    const selo = r.semDetalhe ? UI.badge('sem detalhe','alerta')
               : r.parcial    ? UI.badge('parcial','alerta') : '';
    return `<tr class="est-linha${aberta?' aberta':''}" onclick="alternarCompra(${r.id})">
      <td data-rot="Compra"><span class="est-seta">${aberta?'▾':'▸'}</span><span class="est-tag">#${r.id}</span></td>
      <td data-rot="Data"><span class="est-imei">${r.data ? r.data.split('-').reverse().slice(0,2).join('/') : '—'}</span></td>
      <td data-rot="Fornecedor" class="forte">
        <span class="est-prod">${escapeHtml(r.fornecedor)}</span> ${selo}
        <div class="vf-meta">${r.qtd} ${r.qtd===1?'item':'itens'}</div>
      </td>
      <td data-rot="Valor" class="num forte">${money(r.valor)}</td>
    </tr>`;
  };

  // Interleave: cada compra e, quando aberta, a linha de detalhe logo abaixo.
  const corpo = rows.map(r =>
    linhaCompra(r) + (comprasAbertas.has(r.id) ? comprasDetalheHTML(r) : '')
  ).join('');

  const tabela = rows.length
    ? UI.card({ titulo:'Compras', sub: rows.length + (rows.length===1?' compra':' compras'), flush:true,
        corpo:`<div class="c-tabela-wrap"><table class="c-tabela est-tabela">
          <thead><tr>
            ${th('id','Compra')}${th('data','Data')}${th('fornecedor','Fornecedor')}${th('valor','Valor',true)}
          </tr></thead><tbody>${corpo}</tbody></table></div>` })
    : UI.card({ corpo: UI.vazio({ ico:'📦', titulo:'Nenhuma compra encontrada',
        texto: ativos ? 'Tente limpar os filtros ou trocar o período na barra lateral.'
                      : 'As compras registradas na FoneNinja aparecem aqui após o sync.' }) });

  return comprasCabecalho() + kpis + alertas + filtros + tabela;
}

// -- Linha de detalhe (itens da compra, um por linha) -----------------------
function comprasDetalheHTML(r){
  const its = comprasItens[r.id];
  let corpo;
  if(its === undefined || its === 'buscando'){
    corpo = '<div class="vf-soon">carregando itens…</div>';
  } else if(Array.isArray(its) && its.length){
    const itemCompra = p => {
      const meta = [];
      if(p.serial) meta.push('Série ' + escapeHtml(p.serial));
      if(p.imei_1) meta.push('IMEI ' + escapeHtml(p.imei_1));
      const custo = parseFloat(p.valor_estoque||0);
      return `<div class="vf-item">
        <div>
          <div class="vf-nm">${escapeHtml(nomeCurtoProduto(p.titulo) || '—')}</div>
          ${meta.length ? `<div class="vf-meta">${meta.join(' · ')}</div>` : ''}
          ${p.quantidade>1 ? `<div class="vf-meta">${p.quantidade} unidades</div>` : ''}
        </div>
        <div class="vf-v num">${money(custo)}</div>
      </div>`;
    };
    const nota = r.parcial
      ? `<div class="vf-soon">${r.capturado} de ${r.qtd} itens capturados — detalhe parcial (backfill em andamento).</div>`
      : '';
    corpo = its.map(itemCompra).join('') + nota;
  } else {
    corpo = '<div class="vf-soon">Sem detalhe dos itens desta compra — o sync ainda não capturou (backfill em andamento).</div>';
  }
  return `<tr class="est-detalhe"><td colspan="4">${corpo}</td></tr>`;
}

// -- Expandir/recolher + itens sob demanda ----------------------------------
function alternarCompra(id){
  if(comprasAbertas.has(id)) comprasAbertas.delete(id);
  else { comprasAbertas.add(id); buscarItensCompra(id); }
  if(currentTab==='compras') renderContent();
}

async function buscarItensCompra(id){
  if(comprasItens[id] !== undefined) return; // ja buscado ou buscando
  comprasItens[id] = 'buscando';
  try{
    const its = await sbGet('compra_produtos',
      `compra_id=eq.${id}&select=titulo,serial,imei_1,valor_estoque,preco,quantidade&order=id.asc`, 500);
    comprasItens[id] = its || [];
  }catch(e){
    console.warn('[compras] itens', e);
    comprasItens[id] = [];
  }
  if(currentTab==='compras') renderContent();
}

// -- Busca por modelo/IMEI no servidor (nao carrega todos os itens) ----------
async function comprasBuscaServidor(q){
  const term = String(q||'').replace(/[%,()*]/g,'').trim();
  if(term.length < 2){ comprasBuscaIds = null; return; }
  const seq = ++_comprasBuscaSeq;
  try{
    const like = `*${term}*`;
    const hits = await sbGet('compra_produtos',
      `select=compra_id&or=(titulo.ilike.${like},imei_1.ilike.${like},serial.ilike.${like})`, 3000);
    if(seq !== _comprasBuscaSeq) return; // resposta obsoleta, chegou depois de outra busca
    comprasBuscaIds = new Set((hits||[]).map(h => h.compra_id));
    if(currentTab==='compras') renderContent();
  }catch(e){ console.warn('[compras] busca', e); }
}

// -- Filtros / sort ---------------------------------------------------------
function filtrarCompras(tipo, val){
  if(tipo === 'limpar'){
    comprasSearch = ''; comprasFornecedor = 'todas'; comprasBuscaIds = null;
    if(currentTab==='compras') renderContent(); return;
  }
  if(tipo === 'search'){ comprasSearch = val; comprasBuscaServidor(val); }
  else if(tipo === 'fornecedor'){ comprasFornecedor = val; }
  if(currentTab==='compras') renderContent();
}

function sortCompras(col){
  if(comprasSortCol === col) comprasSortDir *= -1;
  else { comprasSortCol = col; comprasSortDir = 1; }
  if(currentTab==='compras') renderContent();
}
