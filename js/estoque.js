function getCorStyle(titulo){
  const t=titulo.toLowerCase();
  for(const [key,val] of Object.entries(COR_MAP)){
    if(t.includes(key)) return val;
  }
  return null;
}
function corNomeHtml(cl){
  const cs=getCorStyle(cl);
  if(!cs) return cl;
  return '<span style="background:'+cs.bg+';color:'+cs.fg+';padding:1px 6px;border-radius:5px;font-size:11px">'+cl+'</span>';
}
function estNomeHtml(curto, completo){
  const cs=getCorStyle(completo);
  if(!cs) return curto;
  const corMatch=completo.match(/(?:tit[aâ]nio [a-z]+|preto|branco|rosa|roxo|azul|verde|dourado|grafite|estelar|prateado|meia noite|lavanda|laranja|amarelo|chumbo)/i);
  const corLabel=corMatch?corMatch[0]:'';
  return curto+'<span style="background:'+cs.bg+';color:'+cs.fg+';padding:0 5px;border-radius:4px;font-size:10px;margin-left:5px">'+corLabel+'</span>';
}
// ===================================================================
// ESTOQUE V3 -- Vista Agrupada + Lista Expansivel + WhatsApp
// ===================================================================

// CORES_HEX / corHex viviam aqui, mas COLIDIAM com as declaracoes globais de
// mesmo nome no config.js \u2014 em <script> classicos e o mesmo escopo global, e
// "const CORES_HEX" duas vezes vira SyntaxError que derrubava este arquivo
// inteiro (e, por tabela, Vendas/Estoque/Tabela paravam de abrir). Aqui estavam
// SEM USO (nenhuma chamada). A versao canonica fica em config.js (bolinhas da
// aba Tabela de precos). Ver corHex()/CORES_HEX la.

function corPrecisaBorda(corNome){
  const claras = ['branco','estelar','natural','titanio natural','titanio branco','prata','prateado','lavanda','salvia','rosa'];
  const key = (corNome||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  return claras.some(c => key.includes(c));
}

function batClassEst(bat){
  if(!bat || bat === 0) return '';
  if(bat < 80) return 'ruim';
  if(bat < 85) return 'medio';
  return 'bom';
}

function dataEntradaFmt(item){
  const mov = item.movimentacoes && item.movimentacoes.length > 0 ? item.movimentacoes[0] : null;
  const data = mov ? (mov.created_at||'').slice(0,10) : (item.created_at||'').slice(0,10);
  if(!data) return '—';
  const [y,m,d] = data.split('-');
  const meses = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  return `${d}/${meses[parseInt(m)-1]}`;
}

function fornCompacto(item){
  const mov = item.movimentacoes && item.movimentacoes.length > 0 ? item.movimentacoes[0] : null;
  const isUpgrade = mov && mov.parent_type === 'upgrade';
  if(isUpgrade) return 'Upgrade';
  return (getFornNome(item) || '—').slice(0, 12);
}

function escapeKey(k){ return String(k).replace(/'/g, "\\'"); }
function escapeHtml(s){ return String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

function bolinhaEmoji(cor){
  const k = (cor||'').toLowerCase();
  if(k.includes('branco') || k.includes('natural') || k.includes('estelar')) return '⚪';
  if(k.includes('preto') || k.includes('meia noite') || k.includes('grafite')) return '⚫';
  if(k.includes('azul')) return '🔵';
  if(k.includes('vermelho')) return '🔴';
  if(k.includes('amarelo') || k.includes('dourado')) return '🟡';
  if(k.includes('verde')) return '🟢';
  if(k.includes('rosa') || k.includes('lavanda') || k.includes('roxo')) return '🟣';
  if(k.includes('laranja') || k.includes('desert')) return '🟠';
  return '⚪';
}

// Constroi arvore Modelo > Capacidade > Cor > [items]
function construirTreeEstoque(items, search){
  const q = (search||'').toLowerCase().trim();
  const tree = {};
  items.forEach(item => {
    const titulo = item.produto?.titulo || item.titulo || '';
    const { modelo, capacidade, cor } = parseTitulo(titulo);
    if(q){
      const matchTitulo = titulo.toLowerCase().includes(q);
      const matchImei = (item.imei_1||'').toLowerCase().includes(q);
      const matchSerial = (item.serial||'').toLowerCase().includes(q);
      const matchForn = (getFornNome(item)||'').toLowerCase().includes(q);
      if(!matchTitulo && !matchImei && !matchSerial && !matchForn) return;
    }
    if(!tree[modelo]) tree[modelo] = { caps:{}, total:0, custoTotal:0 };
    if(!tree[modelo].caps[capacidade]) tree[modelo].caps[capacidade] = { cores:{}, total:0, custoTotal:0 };
    if(!tree[modelo].caps[capacidade].cores[cor]) tree[modelo].caps[capacidade].cores[cor] = { items:[], custoTotal:0 };
    const custo = parseFloat(item.valor_estoque||0);
    tree[modelo].caps[capacidade].cores[cor].items.push(item);
    tree[modelo].caps[capacidade].cores[cor].custoTotal += custo;
    tree[modelo].caps[capacidade].total++;
    tree[modelo].caps[capacidade].custoTotal += custo;
    tree[modelo].total++;
    tree[modelo].custoTotal += custo;
  });
  return tree;
}

// Geracao a partir do modelo: "iPhone 15 Pro Max" -> "15". Serve para o filtro
// e para o agrupamento que o brief pede (15 / 14 / 13 / 12 e anteriores).
function geracaoDe(modelo){
  const m = String(modelo||'').match(/iPhone\s+(\d+)/i);
  return m ? m[1] : '?';
}

// ============================================================================
// MARGEM REAL — a única que serve pra decidir compra (CONTEXT.md > Margem)
//
//   margem bruta      = preço − custo de aquisição      ← é o que o painel
//                                                          mostrava sozinho
//   − carrego         = custo × dias parados × 0,1%/dia    (capital preso)
//   − taxa de cartão  = preço × taxa efetiva MEDIDA        (não uma constante)
//   − reparo          = o que já se gastou neste aparelho
//   = margem real
//
// ⚠️ Isso pesa MAIS no modelo lento, que é justamente onde a margem bruta
// engana: um aparelho de R$3.000 parado há 90 dias já comeu R$270 de carrego
// antes de qualquer desconto. Decidir compra pela bruta inverte a decisão.
//
// ⚠️ Cada parcela pode ser NULL, e null não é zero. Sem dias parados não há
// carrego — e a tela diz "não sei", em vez de fingir que foi zero.
// ============================================================================
let _margemExtra = {};   // apple_id -> {dias_parado, reparo, entrou_em}

function setMargemExtra(linhas){
  _margemExtra = {};
  (linhas || []).forEach(l => { _margemExtra[l.apple_id] = l; });
}
function margemExtraDoApple(id){ return _margemExtra[id] || null; }

function margemRealDoItem(item, custo, venda){
  const extra = margemExtraDoApple(item.id);
  const dias   = extra && extra.dias_parado != null ? Number(extra.dias_parado) : null;
  const reparo = extra && extra.reparo != null ? Number(extra.reparo) : null;
  const taxaPct = typeof taxaCartaoEfetiva === 'function' ? taxaCartaoEfetiva() : null;

  const carrego = (custo != null && dias != null)
    ? custo * dias * CUSTO_CAPITAL_DIA : null;
  const taxa = (venda != null && taxaPct != null) ? venda * taxaPct : null;

  // A margem real só existe se a bruta existe. As parcelas que faltarem entram
  // como zero NO CÁLCULO, mas ficam marcadas em `faltando` — a tela avisa que o
  // número é um teto, e não um resultado fechado.
  const bruta = (venda != null && custo != null) ? venda - custo : null;
  const faltando = [];
  if(dias == null)    faltando.push('carrego');
  if(reparo == null)  faltando.push('reparo');
  if(taxaPct == null) faltando.push('taxa');

  return {
    diasParado: dias,
    entrouEm: extra ? extra.entrou_em : null,
    carrego, reparo, taxaCartao: taxa,
    margemReal: bruta == null ? null
      : bruta - (carrego || 0) - (taxa || 0) - (reparo || 0),
    margemFaltando: faltando,
  };
}

// A conta aberta, porque um número sozinho aqui não convence ninguém a mudar
// decisão de compra — e mudar decisão de compra é o motivo desta coluna existir.
function margemRealHtml(d){
  if(d.margemReal == null) return '<span class="est-sempreco">sem preço de tabela</span>';
  const tom = d.margemReal < 0 ? 'critico' : d.margemReal < 300 ? 'alerta' : 'ok';
  const linha = (rot, v, neg) => v == null || v === 0 ? '' :
    `<span class="mr-linha"><span>${rot}</span><b>${neg ? '−' : ''}${money(Math.abs(v))}</b></span>`;
  const falta = (d.margemFaltando || []).length
    ? `<span class="mr-falta">sem ${d.margemFaltando.join(' e ')} — o número é teto, não resultado</span>` : '';
  return `<span class="mr-valor" data-tom="${tom}">${money(d.margemReal)}</span>
    <span class="mr-conta">
      ${linha('bruta', d.margem)}
      ${linha(`carrego (${d.diasParado} d)`, d.carrego, true)}
      ${linha('taxa de cartão', d.taxaCartao, true)}
      ${linha('reparo', d.reparo, true)}
    </span>${falta}`;
}

// Enriquece o item com tudo que a linha da tabela precisa, num lugar so.
function dadosDoItem(item){
  const titulo = item.produto?.titulo || item.titulo || '';
  const { modelo, capacidade, cor, condicao } = parseTitulo(titulo);
  // ⚠️ Ausente NAO e zero. Quem nao ve margem le `v_estoque_vitrine`, que nao
  // traz `valor_estoque` -- e "custo 0" viraria "margem = preco cheio", numero
  // inventado esperando alguem mostrar. Sem o dado, custo e margem sao null.
  const custo = item.valor_estoque == null ? null : parseFloat(item.valor_estoque);
  const preco = getPrecoVendaSync(item);
  const venda = preco && preco.varejo != null ? preco.varejo : null;
  const real = margemRealDoItem(item, custo, venda);
  // A correcao do time entra por cima do que a FoneNinja mandou. IMEI nao: ele
  // e a chave que liga venda, reparo e bancada, e so vale reportado.
  const corr = typeof correcoesDoApple === 'function' ? correcoesDoApple(item.id) : {};
  return {
    item, titulo, modelo, capacidade, cor, condicao, custo, venda,
    margem: (venda != null && custo != null) ? venda - custo : null,
    // A margem que decide compra. Ver margemRealDoItem() e CONTEXT.md > Margem.
    ...real,
    geracao: geracaoDe(modelo),
    origem: origemDoItem(item),
    bateria: parseInt((corr.bateria && corr.bateria.valor_novo) || item.bateria || 0),
    etiqueta: (corr.etiqueta && corr.etiqueta.valor_novo) || item.serial || '',
    imei: item.imei_1 || '',
    corrigido: Object.keys(corr).length > 0
  };
}

function setEstoqueGeracao(g){ estoqueGeracao = g; if(currentTab==='estoque') renderContent(); }
function setEstoqueOrigem(o){ estoqueOrigem = o; if(currentTab==='estoque') renderContent(); }
function setEstoqueModelo(m){ estoqueModelo = m; if(currentTab==='estoque') renderContent(); }
function setEstoqueCap(c){ estoqueCap = c; if(currentTab==='estoque') renderContent(); }
function limparFiltrosEstoque(){
  estoqueOrigem='todas'; estoqueModelo='todos'; estoqueCap='todas';
  estoqueGeracao='todas'; estoqueSearchV3='';
  if(currentTab==='estoque') renderContent();
}

// Aparelho sem fornecedor nunca passou por uma compra: e entrada de cliente
// (upgrade). Confirmado nos dados — dos 39 sem fornecedor, zero em compras.
//
// ⚠️ Essa inferencia so vale se o fornecedor PODE estar no dado. Desde 17/ago o
// papel sem margem le `v_estoque_vitrine`, que nao traz `ultimo_fornecedor` --
// e ali "sem fornecedor" significa "nao me contaram", nao "veio de cliente".
// Sem esta guarda, a tela do Vitinho carimbaria "Entrada (cliente)" em 100% do
// estoque: numero errado com cara de certo.
function temFornecedorNoDado(){
  return typeof podeVerMargem !== 'function' || podeVerMargem();
}
function origemDoItem(item){
  if(!temFornecedorNoDado()) return null;
  const f = getFornNome(item);
  return (f && String(f).trim()) ? String(f).trim() : 'Entrada (cliente)';
}

function renderEstoque(){
  if(!_precosCache) carregarTabelaPrecos().then(() => renderContent());
  // Sem isso a tela mostraria como disponivel o aparelho que esta na bancada.
  if(typeof _bancadaCache !== 'undefined' && _bancadaCache === null)
    carregarBancada().then(() => { if(currentTab==='estoque') renderContent(); });
  if(typeof _correcoesCache !== 'undefined' && _correcoesCache === null)
    carregarCorrecoes().then(() => { if(currentTab==='estoque') renderContent(); });

  // Zero item e ambiguo de proposito nao: "a loja nao tem aparelho" e "eu nao
  // consegui ler o estoque" davam a MESMA tela. Com 218 aparelhos na prateleira
  // o segundo caso e o unico realista -- e o sintoma dele e app desatualizado.
  if(!(estoqueItens || []).length){
    return UI.card({ corpo: UI.vazio({
      titulo:'Nenhum aparelho carregado',
      texto:'Se você esperava ver aparelhos aqui, quase sempre é código antigo guardado no aparelho. Atualizar resolve.',
      acao: typeof recarregarLimpo === 'function'
        ? UI.btn('Atualizar agora', {onclick:'recarregarLimpo()', variante:'primario'}) : '',
    })});
  }

  const todos = (estoqueItens || []).map(dadosDoItem);

  // busca
  const q = (estoqueSearchV3||'').toLowerCase().trim();
  const busca = d => !q || d.titulo.toLowerCase().includes(q) || d.imei.toLowerCase().includes(q)
                  || d.etiqueta.toLowerCase().includes(q) || (getFornNome(d.item)||'').toLowerCase().includes(q);

  const porGeracao = {};
  todos.forEach(d => { porGeracao[d.geracao] = (porGeracao[d.geracao]||0) + 1; });
  const geracoes = Object.keys(porGeracao).filter(g => g !== '?')
    .sort((a,b) => Number(b) - Number(a));

  const visiveis = todos.filter(d => busca(d)
    && (estoqueGeracao === 'todas' || d.geracao === estoqueGeracao)
    && (estoqueOrigem  === 'todas' || d.origem   === estoqueOrigem)
    && (estoqueModelo  === 'todos' || d.modelo   === estoqueModelo)
    && (estoqueCap     === 'todas' || d.capacidade === estoqueCap));
  _estoqueVisivel = visiveis;                       // usado pelo painel de detalhe
  if(_fotos === null) carregarFotos().then(() => { if(currentTab==='estoque') renderContent(); });

  // -- KPIs ---------------------------------------------------------------
  const capital = visiveis.reduce((a,d) => a + d.custo, 0);
  const comPreco = visiveis.filter(d => d.margem != null);
  const margemPot = comPreco.reduce((a,d) => a + d.margem, 0);

  const entradas = visiveis.filter(d => d.origem === 'Entrada (cliente)');

  // Vendedor/atendente nao ve custo nem valor de estoque (brief §2)
  const naBancada = typeof bancadaDoApple === 'function'
    ? visiveis.filter(d => bancadaDoApple(d.item.id, d.imei)) : [];

  const listaKpis = [
    { rotulo:'Aparelhos', valor: visiveis.length,
      sub: estoqueGeracao==='todas' ? 'em estoque' : 'iPhone '+estoqueGeracao },
    { rotulo:'Na assistência', valor: naBancada.length,
      tom: naBancada.length ? 'alerta' : undefined,
      sub: naBancada.length ? 'não estão na loja agora' : 'nada fora' },
  ];
  // Quanto do estoque veio de troca e leitura de compra, nao de bancada. Fora
  // isso, no celular a grade e de 2 colunas: um terceiro card deixaria um orfao
  // esticado sozinho na linha de baixo.
  // Divergencia = o time corrigiu e a FoneNinja ainda nao concorda. Some
  // sozinha no sync seguinte quando o ERP passa a dizer o mesmo.
  const divergindo = typeof corDivergencias === 'function'
    ? visiveis.filter(d => corDivergencias(d.item).length) : [];
  // Na loja e NAO pronto pra vender: o buraco entre "chegou" e "foi pra
  // assistencia". Antes disso o painel dizia que estavam todos disponiveis.
  // Antes isto era "tudo que não é `revisado`". Com o conjunto novo de estados
  // (15/ago) a pergunta ficou direta: quais tiram o aparelho da venda de hoje?
  // `saldao` NÃO entra -- ele é o contrário, é pra vender logo.
  const naoProntos = (typeof estadoDoApple === 'function' && typeof COR_ESTADOS_NAO_VENDE !== 'undefined')
    ? visiveis.filter(d => {
        const e = estadoDoApple(d.item.id);
        return e && COR_ESTADOS_NAO_VENDE.includes(e.estado)
            && !(typeof bancadaDoApple === 'function' && bancadaDoApple(d.item.id, d.imei));
      }) : [];
  if(naoProntos.length){
    listaKpis.push({ rotulo:'Não prontos', valor: naoProntos.length, tom:'alerta',
      sub:'na loja, mas não dá pra vender' });
  }
  if(divergindo.length){
    listaKpis.push({ rotulo:'A corrigir na FoneNinja', valor: divergindo.length,
      tom:'processo', sub:'o time já marcou o certo aqui' });
  }
  if(podeVerMargem()){
    listaKpis.push({ rotulo:'Entradas de cliente', valor: entradas.length,
      sub: Math.round(entradas.length / (visiveis.length||1) * 100) + '% do estoque' });
  }
  if(podeVerMargem()){
    // A margem REAL ao lado da bruta, e não no lugar dela: a diferença entre as
    // duas é o argumento. Ver as duas lado a lado é o que muda decisão de
    // compra — só a real seria um número novo sem referência.
    const comReal = visiveis.filter(d => d.margemReal != null);
    const margemRealTot = comReal.reduce((a,d) => a + d.margemReal, 0);
    const carregoTot = visiveis.reduce((a,d) => a + (d.carrego || 0), 0);
    const diasMedio = (() => {
      const ds = visiveis.map(d => d.diasParado).filter(v => v != null);
      return ds.length ? Math.round(ds.reduce((a,b)=>a+b,0) / ds.length) : null;
    })();
    listaKpis.push(
      { rotulo:'Capital', valor: money(capital), sub:'custo parado em estoque' },
      { rotulo:'Margem bruta', valor: money(margemPot),
        sub: comPreco.length + ' de ' + visiveis.length + ' com preço na tabela' },
      { rotulo:'Margem real', valor: money(margemRealTot), tom: margemRealTot > 0 ? 'ok' : 'critico',
        sub:'menos carrego, taxa e reparo' },
      { rotulo:'Carrego parado', valor: money(carregoTot), tom: carregoTot > 0 ? 'alerta' : undefined,
        sub: diasMedio != null ? diasMedio + ' dias de prateleira em média' : 'sem data de entrada' });
  }
  const kpis = UI.kpis(listaKpis);

  // -- Cabecalho da pagina ------------------------------------------------
  const cabecalho = `
    <div class="pg-head">
      <div>
        <div class="pg-kicker">Operações</div>
        <h1 class="pg-title">Estoque</h1>
        <div class="pg-desc">Aparelhos disponíveis, com custo, preço de tabela e margem por unidade.</div>
      </div>
      <div class="pg-acoes">
        ${/* exportar a lista inteira e ato comercial, nao de bancada */ ''}
        ${podeVerValor() ? UI.btn('💬 Exportar WhatsApp', {onclick:'abrirWaModal()'}) : ''}
        ${UI.btn('↻ Atualizar', {onclick:'reloadData()', variante:'primario'})}
      </div>
    </div>`;

  // -- Barra de filtros ---------------------------------------------------
  // opcoes calculadas sobre o estoque inteiro, nao sobre o filtrado,
  // senao escolher um filtro apagaria as opcoes dos outros
  const opcoes = (campo) => [...new Set(todos.map(d => d[campo]).filter(Boolean))];
  const origens = opcoes('origem').sort((a,b) =>
    a === 'Entrada (cliente)' ? -1 : b === 'Entrada (cliente)' ? 1 : a.localeCompare(b,'pt-BR'));
  const modelos = opcoes('modelo').sort((a,b) => {
    const [ga,va] = ordemModelo(a), [gb,vb] = ordemModelo(b);
    return ga - gb || va - vb;
  });
  const caps = opcoes('capacidade').sort((a,b) => capacidadeEmGB(a) - capacidadeEmGB(b));

  const sel = (id, valor, todasLabel, lista, fn, rotulo) => `
    <label class="est-sel">
      <span>${rotulo}</span>
      <select onchange="${fn}(this.value)">
        <option value="${todasLabel}"${valor===todasLabel?' selected':''}>Todos</option>
        ${lista.map(o => `<option value="${escapeHtml(o)}"${valor===o?' selected':''}>${escapeHtml(String(o).replace(/^iPhone\s*/,''))}</option>`).join('')}
      </select>
    </label>`;

  const chipsCap = [UI.chip('Todas', estoqueCap==='todas', "setEstoqueCap('todas')")]
    .concat(caps.map(c => UI.chip(c, estoqueCap===c, `setEstoqueCap('${escapeKey(c)}')`))).join('');

  const filtrosAtivos = (estoqueOrigem!=='todas') + (estoqueModelo!=='todos')
                      + (estoqueCap!=='todas') + (estoqueGeracao!=='todas') + (!!estoqueSearchV3);

  const filtros = `
    <div class="est-barra">
      <div class="est-busca">
        <span class="est-busca-ico">⌕</span>
        <input type="text" id="est-search-v3" placeholder="Buscar por modelo, IMEI, etiqueta ou fornecedor..."
               value="${escapeHtml(estoqueSearchV3)}" oninput="setEstoqueSearchV3(this.value)">
      </div>
      ${/* Origem = nome do fornecedor (STP, DESEJO, JAMES): informacao de compra */ ''}
      ${podeVerMargem() ? sel('origem', estoqueOrigem, 'todas', origens, 'setEstoqueOrigem', 'Origem') : ''}
      ${sel('modelo', estoqueModelo, 'todos', modelos, 'setEstoqueModelo', 'Modelo')}
      ${filtrosAtivos ? UI.btn('Limpar filtros', {onclick:'limparFiltrosEstoque()', variante:'sutil', sm:true}) : ''}
    </div>
    <div class="est-chips"><span class="est-chips-rot">Capacidade</span>${chipsCap}</div>`;

  // -- Conteudo -----------------------------------------------------------
  let corpo;
  if(!visiveis.length){
    corpo = UI.card({corpo: UI.vazio({
      ico:'📦',
      titulo: q || estoqueGeracao!=='todas' ? 'Nada com esses filtros' : 'Estoque vazio',
      texto: q || estoqueGeracao!=='todas'
        ? 'Tente limpar a busca ou escolher outra geração.'
        : 'Assim que um aparelho entrar na FoneNinja, ele aparece aqui na próxima sincronização.'
    })});
  } else {
    corpo = renderEstoqueTabela(visiveis);
  }

  return cabecalho + kpis + filtros + corpo;
}

// -- Ordem dos modelos: 11, 12, 13... e dentro de cada geracao
// normal -> e -> Plus -> Pro -> Pro Max, como na tabela de precos.
const ORDEM_VARIANTE = { '':0, 'e':1, 'plus':2, 'pro':3, 'pro max':4 };

function ordemModelo(modelo){
  const m = String(modelo||'').match(/iPhone\s+(\d+)\s*(e)?\s*(Pro Max|Pro|Plus)?/i);
  if(!m) return [999, 9];                                   // Air e afins vao pro fim
  const variante = (m[3] || (m[2] ? 'e' : '')).toLowerCase();
  return [parseInt(m[1]), ORDEM_VARIANTE[variante] ?? 8];
}

function capacidadeEmGB(cap){
  const m = String(cap||'').match(/(\d+)\s*(GB|TB)/i);
  if(!m) return 0;
  return parseInt(m[1]) * (/TB/i.test(m[2]) ? 1024 : 1);
}

// -- Linhas expandidas (no lugar do painel, que travava) -------------------
let estoqueAbertos = new Set();     // ids de aparelho com detalhe aberto
let _origem = {};                   // apple_id -> {tipo, docId, data, quem} | 'buscando' | null

async function buscarOrigem(appleId){
  try {
    const [compras, vendas] = await Promise.all([
      sbGet('compra_produtos', `apple_id=eq.${appleId}&select=compra_id,compras(fornecedor_nome,data_entrada)`, 1),
      sbGet('venda_produtos',  `apple_id=eq.${appleId}&select=venda_id,vendas(data_saida,cliente_nome)`, 1),
    ]);
    const c = (compras||[])[0], v = (vendas||[])[0];
    if(c) _origem[appleId] = { tipo:'compra', docId:c.compra_id,
             data:c.compras?.data_entrada, quem:c.compras?.fornecedor_nome };
    else if(v) _origem[appleId] = { tipo:'venda', docId:v.venda_id,
             data:v.vendas?.data_saida, quem:v.vendas?.cliente_nome };
    else _origem[appleId] = null;
  } catch(e){ console.warn('[origem]', e); _origem[appleId] = null; }
}

function alternarLinhaEstoque(id){
  if(estoqueAbertos.has(id)){
    estoqueAbertos.delete(id);
    // fechou a linha, fecha a edição junto: reabrir volta ao modo de leitura
    if(typeof corFecharEdicao === 'function') corFecharEdicao(id);
  }
  else {
    estoqueAbertos.add(id);
    if(_origem[id] === undefined){
      _origem[id] = 'buscando';
      buscarOrigem(id).then(() => { if(currentTab==='estoque') renderContent(); });
    }
  }
  if(currentTab==='estoque') renderContent();
}

function detalheOrigemHtml(d){
  const id = d.item.id;
  const o = _origem[id];
  if(o === 'buscando') return '<span class="est-sempreco">buscando origem…</span>';
  if(!o) return '<span class="est-sempreco">sem registro de origem</span>';
  const rotulo = o.tipo === 'compra' ? 'Compra' : 'Venda';
  const data = o.data ? new Date(o.data).toLocaleDateString('pt-BR') : '—';
  const acao = o.tipo === 'venda'
    ? `<button class="est-link" onclick="event.stopPropagation();irParaVenda(${o.docId})">abrir venda #${o.docId} →</button>`
    : `<span class="est-tag">#${o.docId}</span>`;
  return `${rotulo} · ${data}${o.quem ? ' · ' + escapeHtml(o.quem) : ''} ${acao}`;
}

// -- Vista Lista: a tabela rica -------------------------------------------
function renderEstoqueTabela(dados){
  const COLUNAS_ESTOQUE = podeVerMargem() ? 7 : 6;
  const bat = b => {
    if(!b) return '<span class="est-bat">—</span>';
    const t = b < 80 ? 'critico' : b < 85 ? 'alerta' : 'ok';
    return `<span class="est-bat" data-tom="${t}">▮ ${b}%</span>`;
  };

  // 11, 12, 13... e dentro: normal, e, Plus, Pro, Pro Max; depois capacidade
  dados.sort((a,b) => {
    const [ga,va] = ordemModelo(a.modelo), [gb,vb] = ordemModelo(b.modelo);
    return ga - gb || va - vb
        || capacidadeEmGB(a.capacidade) - capacidadeEmGB(b.capacidade)
        || String(a.cor).localeCompare(String(b.cor),'pt-BR');
  });
  _estoqueVisivel = dados;

  const linhas = [];
  dados.forEach(d => {
    const id = d.item.id;
    const aberto = estoqueAbertos.has(id);
    linhas.push({ tipo:'item', d, id, aberto });
    if(aberto) linhas.push({ tipo:'detalhe', d, id });
  });

  const corpo = linhas.map(l => {
    if(l.tipo === 'detalhe'){
      // ⚠️ Origem e Entrada só valem pra quem consegue resolvê-las: a origem sai
      // de compras/vendas pelo proxy da FoneNinja, que exige papel `socio`. Pro
      // Vitinho as duas viravam "sem registro de origem" e uma data solta no
      // topo do card — duas linhas mortas empurrando pra baixo o que ele abriu
      // o aparelho pra ver. Pedido do dono em 17/ago/2026.
      const campos = podeVerMargem()
        ? [
            ['Origem', detalheOrigemHtml(l.d)],
            ['Entrada', dataEntradaFmt(l.d.item) || '—'],
            ['Condição', UI.badge(l.d.condicao || 'Seminovo')],
            ['IMEI', `<span class="est-imei">${escapeHtml(l.d.imei || '—')}</span>`],
          ]
        : [
            ['IMEI', `<span class="est-imei">${escapeHtml(l.d.imei || '—')}</span>`],
            ['Condição', UI.badge(l.d.condicao || 'Seminovo')],
          ];
      // fornecedor e margem sao informacao de socio (brief §2)
      if(podeVerMargem()){
        campos.splice(1, 0, ['Fornecedor', escapeHtml(getFornNome(l.d.item) || '—')]);
        campos.push(['Margem bruta', l.d.margem == null ? '—' : money(l.d.margem)]);
        campos.push(['Margem real', margemRealHtml(l.d)]);
      }

      const editor = (typeof podeCorrigirEstoque === 'function' && podeCorrigirEstoque()
                      && typeof corBlocoHtml === 'function') ? corBlocoHtml(l.d) : '';

      return `<tr class="est-detalhe"><td colspan="${COLUNAS_ESTOQUE}">
        <div class="est-det-campos">
          ${campos.map(([r,v]) => `<div><i class="det-rot">${r}</i>${v}</div>`).join('')}
        </div>${editor}</td></tr>`;
    }
    const d = l.d;
    // Aparelho na assistencia continua na lista (ele e nosso e volta), mas nao
    // pode parecer pronto pra promessa de venda -- era esse o buraco.
    const fora = typeof bancadaDoApple === 'function' ? bancadaDoApple(l.id, d.imei) : null;
    const diasFora = fora ? bncDias(fora.saiu_em) : 0;
    const selo = fora
      ? `<span class="bnc-selo" data-tom="${bncTomDias(diasFora)==='critico'?'critico':''}"
           title="Saiu em ${escapeHtml(fora.saiu_em)} para ${escapeHtml(fora.fornecedor)}">🔧 <span class="bnc-selo-txt">Na assistência · </span>${diasFora}d</span>`
      : '';
    // Estado marcado a mao (na loja e nao pronto pra vender). So aparece quando
    // o aparelho NAO esta fora -- senao dois selos brigam dizendo onde ele esta.
    const est = (!fora && typeof estadoDoApple === 'function') ? estadoDoApple(l.id) : null;
    // A observação vai no title do selo: em "Outro" ela é a informação inteira,
    // e ficaria escondida dentro do editor se não aparecesse aqui.
    // Selo e observacao sao IRMAOS, sem span em volta: no cartao do celular a
    // celula do produto e um flex container, e so filho direto consegue pedir
    // linha propria. Envolvidos, a obs alargava o titulo e derrubava o custo.
    const seloEstado = est && COR_ESTADO_MAP[est.estado]
      ? UI.badge(COR_ESTADO_MAP[est.estado].ico + ' ' + COR_ESTADO_MAP[est.estado].t,
                 COR_ESTADO_MAP[est.estado].tom)
        + (est.obs ? `<span class="est-estado-obs" title="${escapeHtml(est.obs)}">${escapeHtml(est.obs)}</span>` : '')
      : '';
    const divs = typeof corDivergencias === 'function' ? corDivergencias(d.item) : [];
    return `<tr class="est-linha${l.aberto ? ' aberta' : ''}${fora ? ' na-bancada' : ''}" onclick="alternarLinhaEstoque(${l.id})">
      <td data-rot="Etiqueta" data-campo="etiqueta"><span class="est-seta">${l.aberto ? '▾' : '▸'}</span><span class="est-tag">${escapeHtml(d.etiqueta || '—')}</span>${
        divs.length ? `<span class="cor-marca" title="${escapeHtml(divs.map(c => COR_CAMPOS[c.campo].rotulo).join(', '))} corrigido aqui, ainda não na FoneNinja">✎</span>` : ''}</td>
      <td data-rot="Produto" data-campo="produto" class="forte"><span class="est-prod">${escapeHtml(d.modelo.replace(/^iPhone\s*/,''))} ${escapeHtml(d.capacidade)}</span>${selo}${seloEstado}</td>
      <td data-rot="Cor" data-campo="cor">${escapeHtml(d.cor === '?' ? '—' : d.cor)}</td>
      <td data-rot="Bateria" data-campo="bateria" class="num">${bat(d.bateria)}</td>
      <td data-rot="IMEI" data-campo="imei"><span class="est-imei">${escapeHtml(d.imei || '—')}</span><span class="est-imei-fim">…${escapeHtml(String(d.imei || '').replace(/\D/g,'').slice(-4) || '????')}</span></td>
      ${podeVerMargem() ? `<td data-rot="Custo" data-campo="custo" class="num">${money(d.custo)}</td>` : ''}
      <td data-rot="Venda" data-campo="venda" class="num">${d.venda == null ? '<span class="est-sempreco">sem tabela</span>' : `<span class="est-venda">${money(d.venda)}</span>`}</td>
    </tr>`;
  }).join('');

  return UI.card({
    titulo:'Aparelhos', sub: dados.length + ' unidades', flush:true,
    corpo: `<div class="c-tabela-wrap"><table class="c-tabela est-tabela">
      <thead><tr>
        <th>Etiqueta</th><th>Produto</th><th>Cor</th><th class="num">Bateria</th>
        <th>IMEI</th>${podeVerMargem() ? '<th class="num">Custo</th>' : ''}<th class="num">Venda</th>
      </tr></thead>
      <tbody>${corpo}</tbody></table></div>`
  });
}

function setEstoqueViewV3(v){
  estoqueViewV3 = v;
  estoqueColorOpen = null;
  estoqueSkuOpen.clear();
  renderContent();
}

function setEstoqueSearchV3(v){
  estoqueSearchV3 = v;
  if(window._estSearchTimer) clearTimeout(window._estSearchTimer);
  window._estSearchTimer = setTimeout(() => {
    renderContent();
    // re-focar e posicionar cursor no fim
    const el = document.getElementById('est-search-v3');
    if(el){
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, 150);
}

// ===================================================================
// WHATSAPP -- templates + modal
// ===================================================================


function gerarTextoWhatsAppGeral(template, scope){
  const search = scope === 'visiveis' ? estoqueSearchV3 : '';
  const tree = construirTreeEstoque(estoqueItens, search);
  if(Object.keys(tree).length === 0) return '_Sem itens no estoque._';

  const hoje = new Date();
  const meses = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  const dataStr = `${hoje.getDate()}/${meses[hoje.getMonth()]}/${hoje.getFullYear()}`;

  // Sem preco, sem emoji e sem rodape: a pedido do dono o texto virou uma lista
  // operacional, unidade por unidade, com bateria e etiqueta.
  const unidade = it => {
    const bat = parseInt(it.bateria || 0);
    const et  = it.serial ? ` #${it.serial}` : '';
    return `${bat ? bat + '%' : 'bateria n/d'}${et}`;
  };

  // ordena igual a tela: 11, 12, 13... e normal, e, Plus, Pro, Pro Max
  const modelosOrd = Object.entries(tree).sort((a,b) => {
    const [ga,va] = ordemModelo(a[0]), [gb,vb] = ordemModelo(b[0]);
    return ga - gb || va - vb || a[0].localeCompare(b[0]);
  });
  const capsOrd = caps => Object.entries(caps)
    .sort((a,b) => capacidadeEmGB(a[0]) - capacidadeEmGB(b[0]));
  const coresOrd = cores => Object.entries(cores)
    .sort((a,b) => b[1].items.length - a[1].items.length);

  if(template === 'A'){
    let txt = `*ESTOQUE PHONE CART*\n_Atualizado ${dataStr}_\n\n`;
    modelosOrd.forEach(([modelo, dm]) => {
      txt += `*${modelo}*\n`;
      capsOrd(dm.caps).forEach(([cap, dc]) => {
        txt += `${cap}\n`;
        coresOrd(dc.cores).forEach(([cor, dcor]) => {
          dcor.items.forEach(it => { txt += `  ${cor} · ${unidade(it)}\n`; });
        });
      });
      txt += `\n`;
    });
    return txt.trimEnd();
  }

  if(template === 'C'){
    let txt = `*Phone Cart* · ${dataStr}\n\n`;
    modelosOrd.forEach(([modelo, dm]) => {
      const curto = modelo.replace(/^iPhone\s+/, '');
      capsOrd(dm.caps).forEach(([cap, dc]) => {
        coresOrd(dc.cores).forEach(([cor, dcor]) => {
          dcor.items.forEach(it => { txt += `${curto} ${cap} ${cor} · ${unidade(it)}\n`; });
        });
      });
    });
    return txt.trimEnd();
  }
  return '';
}

function abrirWaModal(){
  estoqueWaModalState.open = true;
  estoqueWaModalState.template = 'A';
  estoqueWaModalState.scope = 'todos';
  renderContent();
  setTimeout(() => atualizarPreviewWa(), 50);
}

function abrirWaModalDireto(texto, titulo){
  const overlayId = 'wa-modal-direto';
  let overlay = document.getElementById(overlayId);
  if(overlay) overlay.remove();

  overlay = document.createElement('div');
  overlay.id = overlayId;
  overlay.className = 'est-wa-modal-overlay show';
  overlay.onclick = (e) => { if(e.target === overlay) overlay.remove(); };

  // Stash texto pra evitar problema de escaping no onclick
  window._waDiretoTexto = texto;

  overlay.innerHTML = `
    <div class="est-wa-modal" onclick="event.stopPropagation()">
      <div class="est-wa-modal-head">
        <div class="est-wa-modal-title">💬 ${escapeHtml(titulo)}</div>
        <button class="est-wa-modal-close" onclick="document.getElementById('${overlayId}').remove()">✕</button>
      </div>
      <div class="est-wa-modal-body">
        <div class="est-wa-preview" id="wa-direto-preview">${escapeHtml(texto)}</div>
      </div>
      <div class="est-wa-modal-foot">
        <button onclick="document.getElementById('${overlayId}').remove()">Fechar</button>
        <button class="primary" onclick="copiarTextoWa(window._waDiretoTexto)">📋 Copiar texto</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

function fecharWaModal(){
  estoqueWaModalState.open = false;
  renderContent();
}

function setWaTemplate(t){
  estoqueWaModalState.template = t;
  // re-renderiza pra atualizar a aba ativa visualmente
  const modal = document.querySelector('.est-wa-modal-overlay:not(#wa-modal-direto)');
  if(modal){
    modal.outerHTML = renderWaModalHTML();
    setTimeout(() => atualizarPreviewWa(), 30);
  }
}

function setWaScope(s){
  estoqueWaModalState.scope = s;
  atualizarPreviewWa();
}

function atualizarPreviewWa(){
  const txt = gerarTextoWhatsAppGeral(estoqueWaModalState.template, estoqueWaModalState.scope);
  const el = document.getElementById('wa-preview-area');
  if(el) el.textContent = txt;
}

function copiarTextoWa(txt){
  if(!txt){
    const el = document.getElementById('wa-preview-area') || document.getElementById('wa-direto-preview');
    txt = el ? el.textContent : '';
  }
  if(!txt) return;
  const btn = event?.target;
  navigator.clipboard.writeText(txt).then(() => {
    if(btn){
      const orig = btn.textContent;
      btn.textContent = '✓ Copiado!';
      setTimeout(() => { btn.textContent = orig; }, 1500);
    }
  }).catch(err => {
    console.error('Erro ao copiar:', err);
    alert('Não foi possível copiar. Selecione e copie manualmente.');
  });
}

function abrirWhatsApp(){
  window.open('https://wa.me/', '_blank');
}

function renderWaModalHTML(){
  if(!estoqueWaModalState.open) return '';
  return `
    <div class="est-wa-modal-overlay show" onclick="if(event.target===this)fecharWaModal()">
      <div class="est-wa-modal" onclick="event.stopPropagation()">
        <div class="est-wa-modal-head">
          <div class="est-wa-modal-title">💬 Exportar estoque · WhatsApp</div>
          <button class="est-wa-modal-close" onclick="fecharWaModal()">✕</button>
        </div>
        <div class="est-wa-modal-body">
          <div class="est-wa-modal-tabs">
            <button class="est-wa-tab ${estoqueWaModalState.template==='A'?'active':''}" onclick="setWaTemplate('A')">Catálogo completo</button>
            <button class="est-wa-tab ${estoqueWaModalState.template==='C'?'active':''}" onclick="setWaTemplate('C')">Compacto</button>
          </div>
          <div class="est-wa-scope-toggle">
            <label><input type="radio" name="wa-scope" value="todos" ${estoqueWaModalState.scope==='todos'?'checked':''} onchange="setWaScope('todos')"> Tudo</label>
            <label><input type="radio" name="wa-scope" value="visiveis" ${estoqueWaModalState.scope==='visiveis'?'checked':''} onchange="setWaScope('visiveis')"> Só visíveis na busca</label>
          </div>
          <div class="est-wa-preview" id="wa-preview-area"></div>
        </div>
        <div class="est-wa-modal-foot">
          <button onclick="fecharWaModal()">Cancelar</button>
          <button onclick="copiarTextoWa()">📋 Copiar texto</button>
          <button class="primary" onclick="copiarTextoWa();abrirWhatsApp()">💬 Copiar e abrir WhatsApp</button>
        </div>
      </div>
    </div>`;
}


// renderEquipe is defined above in the FUNC module



// ── FOTOS DOS MODELOS ────────────────────────────────────────────────────
// A tabela fotos_modelos tem 104 imagens indexadas por "modelo_cor"
// (ex.: 12_verde, 12_mini_branco). Nunca foram usadas ate agora.
let _fotos = null;

async function carregarFotos(){
  if(_fotos) return _fotos;
  try {
    const linhas = await sbGet('fotos_modelos', 'select=modelo_cor_key,url', 500);
    _fotos = {};
    (linhas||[]).forEach(f => { _fotos[f.modelo_cor_key] = f.url; });
    console.log('[fotos] '+Object.keys(_fotos).length+' modelos com foto');
  } catch(e){ console.warn('[fotos] falhou:', e); _fotos = {}; }
  return _fotos;
}

function chaveFoto(modelo, cor){
  const m = _normPreco(String(modelo||'').replace(/^iPhone\s*/i,''));
  const c = _normPreco(cor||'');
  if(!m || !c || c === '?') return null;
  return (m + '_' + c).replace(/\s+/g,'_');
}

function fotoDoItem(d){
  if(!_fotos) return null;
  const k = chaveFoto(d.modelo, d.cor);
  return k ? (_fotos[k] || null) : null;
}

// ── DETALHE ──────────────────────────────────────────────────────────────
let _estoqueVisivel = [];

