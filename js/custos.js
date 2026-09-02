// -- CUSTOS ----------------------------------------------------------------
// Cache de custos em memoria (carregado do Supabase)
let _custosCache = null;

function getCustos(){
  if(_custosCache !== null) return _custosCache;
  // Fallback para localStorage enquanto nao carregou
  try{ return JSON.parse(localStorage.getItem('pc_custos')||'[]'); }catch{ return []; }
}

function setCustos(arr){
  _custosCache = arr;
  // Nao salvar mais no localStorage
}

// (Removida a antiga gerarSalariosDoMes: era codigo morto — sempre no-op por rodar
//  depois de garantirSalariosDoMes — e usava um id que estourava MAX_SAFE_INTEGER.
//  A geracao de salarios do mes vive so em garantirSalariosDoMes, abaixo.)

async function loadCustosFromSB(){
  try{
    const r = await fetch(SB_URL+'/rest/v1/custos?order=data.desc&limit=1000', {
      headers:{'apikey':SB_KEY,'Authorization':'Bearer '+SB_TOKEN}
    });
    const data = await r.json();
    if(Array.isArray(data)){
      _custosCache = data.map(c => ({
        id: c.id,
        desc: c.descricao,
        valor: parseFloat(c.valor||0),
        data: c.data,
        area: c.area,
        loja: c.loja,
        obs: c.obs||'',
        fixo: c.fixo||false,
        funcionario: c.funcionario||null
      }));
      // Gerar salarios do mes atual se nao existirem
      await garantirSalariosDoMes();
      return _custosCache;
    }
  } catch(e){ console.error('loadCustos erro:', e); }
  return getCustos();
}

// Salarios fixos mensais -- derivados da fonte unica SALARIOS (config.js).
const SALARIOS_CONFIG = Object.entries(SALARIOS).map(([func, valor]) => ({
  func,
  desc: 'Salário ' + func.charAt(0).toUpperCase() + func.slice(1),
  valor,
}));

async function garantirSalariosDoMes(){
  const now = new Date();
  const anoMes = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
  const primeiroDoMes = anoMes + '-01';

  // Verificar se ja tem salarios deste mes no cache
  const salariosMes = (_custosCache||[]).filter(c =>
    c.fixo && c.data && c.data.startsWith(anoMes)
  );

  if(salariosMes.length >= SALARIOS_CONFIG.length) return; // ja gerados

  console.log('[salarios] Gerando salários de', anoMes, '...');

  // O ID vem do banco (sequence custos_id_seq). Ate jul/2026 era calculado aqui
  // como anoMes*100 + indice na lista JA FILTRADA -- numa segunda rodada os que
  // faltavam recebiam IDs ja ocupados, e o ignore-duplicates abaixo descartava a
  // linha sem reclamar. Leo, Maria e Gabi ficaram meses sem salario lancado por
  // causa disso. Agora quem garante que nao duplica e o indice unico
  // (funcionario, data) no banco, nao um ID adivinhado no cliente.
  const novos = SALARIOS_CONFIG
    .filter(s => !salariosMes.find(m => m.funcionario === s.func))
    .map(s => ({
      descricao: s.desc,
      valor: s.valor,
      data: primeiroDoMes,
      area: 'funcionario',
      loja: 'ambas',
      obs: 'salário fixo mensal',
      fixo: true,
      funcionario: s.func
    }));

  if(!novos.length) return;

  try {
    const res = await fetch(SB_URL+'/rest/v1/custos', {
      method: 'POST',
      headers: {
        'apikey': SB_KEY, 'Authorization': 'Bearer '+SB_TOKEN,
        'Content-Type': 'application/json',
        // return=representation: so entra no cache o que o banco REALMENTE gravou.
        // Antes o cache recebia os 3 que o banco tinha descartado, entao na tela
        // do mes parecia certo e no banco nao estava.
        'Prefer': 'resolution=ignore-duplicates,return=representation'
      },
      body: JSON.stringify(novos)
    });
    if(!res.ok){
      const txt = await res.text().catch(() => '');
      console.error('[salarios] HTTP '+res.status, txt);
      return;
    }
    const criados = await res.json().catch(() => []);
    (Array.isArray(criados) ? criados : []).forEach(n => _custosCache.unshift({
      id: n.id, desc: n.descricao, valor: n.valor,
      data: n.data, area: n.area, loja: n.loja,
      obs: n.obs, fixo: true, funcionario: n.funcionario
    }));
    console.log('[salarios] Gravados', (criados||[]).length, 'de', novos.length, 'salários de', anoMes);
  } catch(e){ console.error('[salarios] Erro:', e); }
}

async function saveCustoToSB(custo){
  return fetch(SB_URL+'/rest/v1/custos', {
    method: 'POST',
    headers:{
      'apikey':SB_KEY,'Authorization':'Bearer '+SB_TOKEN,
      'Content-Type':'application/json',
      'Prefer':'resolution=ignore-duplicates'
    },
    body: JSON.stringify({
      id: custo.id,
      descricao: custo.desc,
      valor: parseFloat(custo.valor||0),
      data: custo.data,
      area: custo.area,
      loja: custo.loja,
      obs: custo.obs||'',
      fixo: false,
      // Precisa passar adiante: e o que faz o valor chegar na folha da pessoa.
      // Ate ago/2026 era fixo em null aqui, entao um extra lancado pela tela
      // nao entrava na folha de ninguem -- e, como a area 'funcionario' fica
      // fora de custosForaFolha, tambem nao aparecia no resultado. Sumia dos
      // dois lados da conta.
      funcionario: custo.funcionario || null
    })
  });
}

async function deleteCustoFromSB(id){
  return fetch(SB_URL+'/rest/v1/custos?id=eq.'+id, {
    method: 'DELETE',
    headers:{'apikey':SB_KEY,'Authorization':'Bearer '+SB_TOKEN}
  });
}

// Fonte unica das areas do dropdown. Adicionar/renomear aqui vale pro form,
// pro modal de edicao e pro agrupamento da tabela.
const AREAS=[
  {id:'aluguel',    label:'Aluguel'},
  {id:'logistica',  label:'Logística / frete'},
  {id:'marketing',  label:'Marketing / tráfego'},
  {id:'plataforma', label:'Plataformas / sistemas'},
  {id:'funcionario',label:'Funcionários'},
  {id:'fornecedor', label:'Fornecedor / estoque'},
  {id:'outro',      label:'Outros'},
];

// Rotulos incluem ids legados que ja foram gravados no banco por versoes
// antigas do modal de edicao, pra nenhum lancamento aparecer sem nome.
const AREA_LABELS = Object.assign(
  Object.fromEntries(AREAS.map(a => [a.id, a.label])),
  {
    outros:'Outros', salario:'Salário', assistencia:'Assistência',
    financeiro:'Financeiro', ia:'IA / ferramentas', contabilidade:'Contabilidade',
    operacional:'Operacional',
  }
);
// Ids legados que reaproveitam a cor de uma area canonica (styles.css .area-*).
const AREA_CLASSE = { outros:'outro', salario:'funcionario', assistencia:'fornecedor',
  financeiro:'plataforma', ia:'plataforma', contabilidade:'plataforma', operacional:'logistica' };

function areaLabel(id){ return AREA_LABELS[id] || id || 'Outros'; }
function areaClass(id){ return 'crow-area area-'+(AREA_CLASSE[id] || (AREA_LABELS[id]?id:'outro')); }

// Ordem de exibicao dos grupos na tabela (canonicas primeiro, resto no fim).
function areaOrdem(id){ const i = AREAS.findIndex(a=>a.id===id); return i<0 ? 99 : i; }

function filterCustoPeriod(custos){
  const now = new Date();
  const nowAnoMes = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  return custos.filter(c => {
    if(!c.data) return true;
    // Usar slice direto na string para evitar bug de timezone
    // 'YYYY-MM-DD' com new Date() e interpretado como UTC, causando off-by-one no Brasil
    const dataStr = c.data.slice(0,10); // 'YYYY-MM-DD'
    const anoMes = dataStr.slice(0,7);  // 'YYYY-MM'
    const dataDate = new Date(dataStr + 'T12:00:00'); // meio-dia evita problemas de timezone

    if(currentPeriod && currentPeriod.match(/^\d{4}-\d{2}$/)){
      return anoMes === currentPeriod;
    }
    if(currentPeriod==='hoje'){
      const hj = now.toISOString().slice(0,10);
      return dataStr === hj;
    }
    if(currentPeriod==='semana'){
      const s = new Date(now);
      s.setDate(now.getDate() - now.getDay());
      s.setHours(0,0,0,0);
      return dataDate >= s;
    }
    if(currentPeriod==='mes'){
      return anoMes === nowAnoMes;
    }
    if(currentPeriod==='custom' && customDateStart){
      return dataStr >= customDateStart && dataStr <= (customDateEnd || customDateStart);
    }
    return true; // 'tudo'
  });
}

function custoParaLoja(c, loja, pctCart, pctUrban){
  // retorna o valor efetivo para uma loja especifica
  // rateio "ambas" proporcional por unidades de devices vendidas (não mais 50/50)
  if(c.loja===loja) return parseFloat(c.valor||0);
  if(c.loja==='ambas'){
    const pct = loja==='cart' ? (pctCart??0.5) : (pctUrban??0.5);
    return parseFloat(c.valor||0)*pct;
  }
  return 0;
}

// -- MODAL DE LANCAMENTO / EDICAO (novo unificado) --------------------------
// id null  -> novo lancamento
// id valido -> edita o custo existente (usado por abrirEdicaoCusto)
// preset   -> so vale quando id e null: campos ja preenchidos (usado pelo
//             "lançar" do bloco Faltando lançar, que repete o mes passado)
function abrirModalCusto(id, preset){
  const existente = id != null ? (_custosCache||[]).find(x=>x.id===id) : null;
  const c = existente || preset || null;
  const hoje = new Date().toISOString().slice(0,10);
  const editando = !!existente;
  const areaOpts = AREAS.map(a => ({v:a.id, t:a.label}));
  const lojaOpts = [{v:'cart',t:'📱 Phone Cart'},{v:'urban',t:'🏙 Urban'},{v:'ambas',t:'🔀 Ambas (rateio)'}];
  // Mesma lista da folha (fechamentoPessoas, equipe.js) -- quem sai do cadastro
  // some daqui sozinho, e nao da pra lancar extra pra quem nao esta na folha.
  const pessoaOpts = [{v:'', t:'— nenhuma (custo da loja) —'}]
    .concat(fechamentoPessoas().map(f => ({v:f.id, t:f.ap})));

  const corpo = `<div class="c-form">
    ${UI.campo({label:'Descrição', corpo:
      UI.input({id:'mc-desc', valor:c?.desc||'', placeholder:'Ex: Aluguel de março'})})}
    ${UI.linha(
      UI.campo({label:'Valor (R$)', corpo:
        UI.input({id:'mc-valor', tipo:'number', valor:c?.valor||'', placeholder:'0,00', extra:'step="0.01" min="0"'})}),
      UI.campo({label:'Data', corpo:
        UI.input({id:'mc-data', tipo:'date', valor:c?.data?.slice(0,10)||hoje})})
    )}
    ${UI.linha(
      UI.campo({label:'Área', corpo: UI.select({id:'mc-area', opcoes:areaOpts, valor:c?.area||'outro'})}),
      UI.campo({label:'Loja', corpo: UI.select({id:'mc-loja', opcoes:lojaOpts, valor:c?.loja||'ambas'})})
    )}
    ${UI.campo({label:'Pessoa (só para a área Funcionários)', corpo:
      UI.select({id:'mc-func', opcoes:pessoaOpts, valor:c?.funcionario||''})
      + `<div class="c-field-nota">Com a pessoa marcada, o valor entra na folha dela (aba Equipe,
         planilha e PDF) como linha própria. Sem pessoa, é custo da loja e não chega em ninguém.</div>`})}
    ${UI.campo({label:'Obs (opcional)', corpo:
      UI.input({id:'mc-obs', valor:c?.obs||'', placeholder:'Informação adicional...'})})}
  </div>`;

  const foot =
    UI.btn('Cancelar', {onclick:'UI.fecharModal()'}) +
    UI.btn(editando ? 'Salvar alterações' : '+ Lançar custo',
      {onclick:`salvarModalCusto(${editando ? c.id : 'null'})`, variante:'primario', id:'mc-salvar'});

  UI.abrirModal({titulo: editando ? '✏️ Editar custo' : '➕ Lançar novo custo', corpo, foot});
  setTimeout(()=>document.getElementById('mc-desc')?.focus(), 30);
}

async function salvarModalCusto(id){
  const desc  = document.getElementById('mc-desc')?.value?.trim();
  const valor = parseFloat(document.getElementById('mc-valor')?.value||0);
  const data  = document.getElementById('mc-data')?.value;
  const area  = document.getElementById('mc-area')?.value||'outro';
  const loja  = document.getElementById('mc-loja')?.value||'ambas';
  const obs   = document.getElementById('mc-obs')?.value||'';
  // '' -> null: a coluna e nullable e o fechamento testa `funcionario===id`.
  const func  = document.getElementById('mc-func')?.value || null;
  if(!desc || !valor || !data) return alert('Preencha descrição, valor e data.');
  if(func && area !== 'funcionario')
    return alert('Para marcar uma pessoa, a área precisa ser "Funcionários".\n\n'
      + 'É essa área que a folha lê para montar salário e extras de cada um.');

  const btn = document.getElementById('mc-salvar');
  if(btn){ btn.textContent='Salvando...'; btn.disabled=true; }

  try{
    if(id != null){
      // Edicao -> PATCH
      const r = await fetch(SB_URL+'/rest/v1/custos?id=eq.'+id, {
        method:'PATCH',
        headers:{'apikey':SB_KEY,'Authorization':'Bearer '+SB_TOKEN,'Content-Type':'application/json'},
        body: JSON.stringify({ descricao:desc, valor, loja, area, data, obs, funcionario:func })
      });
      if(!r.ok) throw new Error('patch');
      const idx = (_custosCache||[]).findIndex(x=>x.id===id);
      if(idx>=0) _custosCache[idx] = {..._custosCache[idx], desc, descricao:desc, valor, loja, area, data, obs, funcionario:func};
    } else {
      // Novo -> POST
      const novo = {id:Date.now(), desc, valor, data, area, loja, obs, fixo:false, funcionario:func};
      const r = await saveCustoToSB(novo);
      if(!r.ok) throw new Error('post');
      if(_custosCache) _custosCache.unshift(novo); else _custosCache=[novo];
    }
    UI.fecharModal();
    renderContent();
  }catch(e){
    console.error('salvarModalCusto:', e);
    if(btn){ btn.textContent = id!=null ? 'Salvar alterações' : '+ Lançar custo'; btn.disabled=false; }
    alert('Erro ao salvar — tente novamente.');
  }
}
async function deleteCusto(id){
  if(!confirm('Remover este custo?')) return;
  await deleteCustoFromSB(id);
  if(_custosCache) _custosCache = _custosCache.filter(c=>c.id!==id);
  else _custosCache = getCustos().filter(c=>c.id!==id);
  document.getElementById('content').innerHTML=renderCustos();
}

// ===========================================================================
// TELA DE CUSTOS — duas vistas
//   'mes'  = o mes em si: KPIs, split por loja, secoes por area com os grupos
//   'comp' = o mesmo mes contra o anterior, area por area (barra divergente)
// A loja e o periodo vivem na sidebar (brief §7.2). Aqui ficam so os filtros
// proprios da tela.
// ===========================================================================
let custoAreaFiltro = 'todas';
let custoVista = 'mes';               // 'mes' | 'comp'
let custoGruposAbertos = new Set();   // chaves de grupo expandidas
let custoFaltandoAberto = false;      // lista completa do "Faltando lançar"

function repintarCustos(){
  const el = document.getElementById('content');
  if(el) el.innerHTML = renderCustos();
}
function setCustoArea(a){ custoAreaFiltro = a; repintarCustos(); }
function setCustoVista(v){ custoVista = v; repintarCustos(); }
function alternarGrupoCusto(chave){
  if(custoGruposAbertos.has(chave)) custoGruposAbertos.delete(chave);
  else custoGruposAbertos.add(chave);
  repintarCustos();
}

// -- Mes de referencia ------------------------------------------------------
// Comparar so faz sentido quando o periodo E um mes. Em 'semana', 'hoje',
// 'custom' ou 'tudo' a tela cai na vista do mes sem a coluna de comparacao.
const CUSTO_MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const CUSTO_MESES_LONGO = ['janeiro','fevereiro','março','abril','maio','junho',
  'julho','agosto','setembro','outubro','novembro','dezembro'];

function custoAnoMesAtual(){
  if(currentPeriod === 'mes'){
    const n = new Date();
    return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0');
  }
  if(currentPeriod && /^\d{4}-\d{2}$/.test(currentPeriod)) return currentPeriod;
  return null;
}
function custoMesAnterior(anoMes){
  const [y,m] = anoMes.split('-').map(Number);
  const d = new Date(y, m-2, 1);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
}
function custoNomeMes(anoMes, longo){
  const m = Number(anoMes.split('-')[1]);
  return (longo ? CUSTO_MESES_LONGO : CUSTO_MESES)[m-1] || anoMes;
}

// -- Identidade do custo entre meses ---------------------------------------
// "Salário Leo (20 dias)" e "Salário Leo" sao o MESMO custo em meses
// diferentes: o que esta entre parenteses e circunstancia, nao identidade.
// Por isso a chave tira parenteses, acento e pontuacao. Loja entra na chave
// porque "Mighty cart" e "Mighty urban" sao contratos diferentes.
function custoNorm(s){
  return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/\([^)]*\)/g,' ')
    .replace(/[^a-z0-9 ]/g,' ')
    .replace(/\s+/g,' ').trim();
}
function custoChaveGrupo(c){ return custoNorm(c.desc) + '|' + (c.loja||'ambas'); }

// Junta os lancamentos repetidos do mes num grupo so (5 boletos do Meta Ads
// viram uma linha "Meta Ads · 5 itens"). Devolve Map chave -> grupo.
function custoAgrupar(lista){
  const map = new Map();
  (lista||[]).forEach(c => {
    const k = custoChaveGrupo(c);
    let g = map.get(k);
    if(!g){
      g = { chave:k, desc:c.desc||'', loja:c.loja||'ambas', area:c.area||'outro', itens:[], total:0 };
      map.set(k, g);
    }
    g.itens.push(c);
    g.total += parseFloat(c.valor||0);
  });
  map.forEach(g => g.itens.sort((a,b)=>String(a.data||'').localeCompare(String(b.data||''))));
  return map;
}

function custoSoma(lista){ return (lista||[]).reduce((s,c)=>s+parseFloat(c.valor||0),0); }

// Delta formatado: mais custo e vermelho, menos custo e verde (cor = significado)
function custoDeltaHTML(delta, pct){
  if(delta == null) return '';
  const cls = delta > 0 ? 'sobe' : (delta < 0 ? 'cai' : 'igual');
  const sinal = delta > 0 ? '+' : (delta < 0 ? '−' : '');
  const val = Math.abs(delta) < 1 ? 'igual' : sinal+money(Math.abs(delta));
  return `<span class="cst-delta ${cls}">${val}${
    pct != null && Math.abs(delta) >= 1 ? `<span class="cst-delta-pct">${sinal}${Math.abs(pct)}%</span>` : ''}</span>`;
}

// So marca quando o custo E de uma loja. "ambas" e o normal aqui -- marcar
// todo mundo vira ruido (o rateio ja esta no card Compartilhado).
function custoLojaTag(loja){
  if(loja === 'cart')  return '<span class="cloja-cart">cart</span>';
  if(loja === 'urban') return '<span class="cloja-urban">urban</span>';
  return '';
}

function custoFmtData(d){
  if(!d) return '—';
  const [ , mo, dia] = d.slice(0,10).split('-');
  return `${dia}/${mo}`;
}

// -- Linha de grupo (a "linha" da referencia) -------------------------------
function custoGrupoHTML(g, gAnt, mesAntCurto, pctCart, pctUrban){
  const aberto = custoGruposAbertos.has(g.chave);
  const ant    = gAnt ? gAnt.get(g.chave) : null;
  const delta  = ant ? g.total - ant.total : null;
  const pct    = ant && ant.total ? Math.round((g.total - ant.total)/ant.total*100) : null;

  const cmp = !gAnt ? ''
    : ant ? `<div class="cst-cmp">
        <span class="cst-ant">${mesAntCurto} ${money(ant.total)}</span>
        ${custoDeltaHTML(delta, pct)}
      </div>`
    : `<div class="cst-cmp">${UI.badge('novo', 'processo')}</div>`;

  const efetivo = (g.loja === 'ambas' && currentStore !== 'ambas')
    ? `<span class="cst-tag-mudo">efetivo ${money(custoParaLoja({loja:'ambas',valor:g.total}, currentStore, pctCart, pctUrban))}</span>` : '';

  const itens = aberto ? `<div class="cst-itens">${g.itens.map(c => `
    <div class="cst-item">
      <span class="cst-item-data">${custoFmtData(c.data)}</span>
      <span class="cst-item-desc">${escapeHtml(c.desc||'')}${
        c.obs ? `<span class="cst-item-obs">${escapeHtml(c.obs)}</span>` : ''}</span>
      <span class="cst-item-val">${money(parseFloat(c.valor||0))}</span>
      <span class="cst-item-acoes">
        ${UI.btn('✏️', {onclick:`event.stopPropagation();abrirModalCusto(${c.id})`, variante:'sutil', sm:true, titulo:'Editar'})}
        ${UI.btn('🗑', {onclick:`event.stopPropagation();deleteCusto(${c.id})`, variante:'sutil', sm:true, titulo:'Remover'})}
      </span>
    </div>`).join('')}</div>` : '';

  return `<div class="cst-grupo${aberto?' aberto':''}">
    <div class="cst-linha" data-loja="${g.loja}" onclick="alternarGrupoCusto('${g.chave}')">
      <div class="cst-desc">
        <span class="cst-nome">${escapeHtml(g.desc)}</span>
        ${custoLojaTag(g.loja)}
        ${g.itens.length > 1 ? `<span class="cst-tag-mudo">${g.itens.length} itens</span>` : ''}
        ${efetivo}
        <span class="cst-seta">${aberto ? '▾' : '›'}</span>
      </div>
      <div class="cst-val">${money(g.total)}</div>
      ${cmp}
    </div>
    ${itens}
  </div>`;
}

// -- Secao de area (card com barra de participacao) -------------------------
function custoAreaHTML(area, grupos, totalArea, totalGeral, gAnt, mesAntCurto, pctCart, pctUrban){
  const pct = totalGeral ? Math.round(totalArea/totalGeral*100) : 0;
  return UI.card({
    titulo: areaLabel(area),
    sub: grupos.every(g=>g.itens.length===1)
      ? `${grupos.length}&nbsp;${grupos.length===1?'item':'itens'}`
      : `${grupos.length}&nbsp;${grupos.length===1?'grupo':'grupos'}`,
    acao: `<span class="cst-area-tot">${money(totalArea)}</span><span class="cst-area-pct">${pct}%</span>`,
    flush: true,
    corpo: `<div class="cst-area-barra">${UI.barra(pct)}</div>
      ${grupos.map(g => custoGrupoHTML(g, gAnt, mesAntCurto, pctCart, pctUrban)).join('')}`,
  });
}

// -- "Faltando lançar" ------------------------------------------------------
// O mes passado e o checklist do mes atual: o que existia la e nao aparece
// aqui provavelmente ainda nao foi lancado (nao virou economia).
const CUSTO_FALTANDO_TOPO = 6;   // o resto fica atras de "ver todos"
function custoFaltandoHTML(faltando, mesAntLongo, anoMes){
  if(!faltando.length) return '';
  const total = faltando.reduce((s,g)=>s+g.total,0);
  const visiveis = custoFaltandoAberto ? faltando : faltando.slice(0, CUSTO_FALTANDO_TOPO);
  const resto = faltando.length - visiveis.length;
  const linhas = visiveis.map(g => `
    <div class="cst-linha cst-falta" data-loja="${g.loja}">
      <div class="cst-desc">
        <span class="cst-nome">${escapeHtml(g.desc)}</span>
        <span class="${areaClass(g.area)}">${areaLabel(g.area)}</span>
        ${g.loja !== 'ambas' ? `<span class="cloja-${g.loja}">${g.loja}</span>` : ''}
      </div>
      <div class="cst-val mudo">${money(g.total)}</div>
      <div class="cst-cmp">${UI.btn('lançar', {onclick:`repetirCusto('${g.chave}','${anoMes}')`, sm:true})}</div>
    </div>`).join('');

  const maisHTML = (resto > 0 || custoFaltandoAberto)
    ? `<div class="cst-falta-mais">${UI.btn(
        resto > 0 ? `ver todos (mais ${resto} · ${money(faltando.slice(CUSTO_FALTANDO_TOPO).reduce((s,g)=>s+g.total,0))})` : 'ver menos',
        {onclick:'custoFaltandoAberto=!custoFaltandoAberto;repintarCustos()', sm:true, variante:'sutil'})}</div>`
    : '';

  return UI.card({
    titulo: 'Faltando lançar',
    sub: `${faltando.length} ${faltando.length===1?'custo que existia':'custos que existiam'} em ${mesAntLongo} e ainda não apareceu neste mês · ${money(total)}`,
    flush: true,
    classe: 'cst-card-alerta',
    corpo: linhas + maisHTML,
  });
}

// Abre o modal ja preenchido com o custo do mes passado (mesmo dia do mes).
function repetirCusto(chave, anoMes){
  const anoMesAnt = custoMesAnterior(anoMes);
  const doMesAnt = getCustos().filter(c => (c.data||'').slice(0,7) === anoMesAnt);
  const g = custoAgrupar(doMesAnt).get(chave);
  if(!g) return;
  const ultimo = g.itens[g.itens.length-1];
  const dia = Math.min(Number((ultimo.data||'').slice(8,10)) || 1,
                       new Date(Number(anoMes.slice(0,4)), Number(anoMes.slice(5,7)), 0).getDate());
  abrirModalCusto(null, {
    desc: ultimo.desc, valor: g.itens.length > 1 ? '' : g.total,
    area: g.area, loja: g.loja,
    data: anoMes + '-' + String(dia).padStart(2,'0'),
  });
}

// -- Vista comparativa ------------------------------------------------------
function custoComparativoHTML(atual, anterior, anoMes, anoMesAnt){
  const totB = custoSoma(atual), totA = custoSoma(anterior);
  const delta = totB - totA;
  const pctGeral = totA ? Math.round(delta/totA*100) : null;
  const mesB = custoNomeMes(anoMes, true), mesA = custoNomeMes(anoMesAnt, true);

  const porArea = new Map();
  const soma = (lista, campo) => (lista||[]).forEach(c => {
    const a = c.area || 'outro';
    const o = porArea.get(a) || {area:a, ant:0, atu:0};
    o[campo] += parseFloat(c.valor||0);
    porArea.set(a, o);
  });
  soma(anterior, 'ant'); soma(atual, 'atu');

  const linhas = [...porArea.values()]
    .map(o => ({...o, delta:o.atu-o.ant, pct: o.ant ? Math.round((o.atu-o.ant)/o.ant*100) : null}))
    .sort((x,y)=> y.delta - x.delta);
  const maxAbs = Math.max(1, ...linhas.map(l=>Math.abs(l.delta)));

  // Quantos custos do mes passado ainda nao apareceram: enquanto houver, a
  // queda nao e economia -- a variacao perde o verde e vira alerta.
  const gA = custoAgrupar(anterior), gB = custoAgrupar(atual);
  const nFaltando = [...gA.keys()].filter(k => !gB.has(k)).length;
  const quedaSuspeita = nFaltando > 0 && delta < 0;

  const kpis = UI.kpis([
    {rotulo:`Total ${mesA}`, valor:money(totA)},
    {rotulo:`Total ${mesB}`, valor:money(totB)},
    {rotulo:'Variação', valor:(delta>=0?'+':'−')+money(Math.abs(delta)),
     sub: quedaSuspeita
       ? `${nFaltando} custos de ${mesA} ainda não lançados`
       : (pctGeral!=null ? `${delta>=0?'+':'−'}${Math.abs(pctGeral)}% vs ${mesA}` : ''),
     tom: delta > 0 ? 'critico' : (quedaSuspeita ? 'alerta' : 'ok')},
  ]);

  const legenda = `<div class="cst-legenda">
    <span><i class="cst-dot sobe"></i>aumentou (mais custo)</span>
    <span><i class="cst-dot cai"></i>caiu</span>
    <span class="cst-legenda-mudo">linha central = ${mesA}</span>
  </div>`;

  const corpo = linhas.map(l => {
    const dir = l.delta >= 0 ? 'sobe' : 'cai';
    const w = Math.abs(l.delta)/maxAbs*50;
    const suspeito = l.ant > 0 && l.pct != null && l.pct <= -80;
    return `<div class="cst-cmp-row">
      <div class="cst-cmp-lbl">
        <span class="cst-cmp-area">${areaLabel(l.area)}</span>
        <span class="cst-cmp-de-para">${money(l.ant)} → ${money(l.atu)}</span>
        ${suspeito ? UI.badge('conferir se falta lançar','alerta') : ''}
      </div>
      <div class="cst-cmp-track">
        <div class="cst-cmp-bar ${dir}" style="${dir==='sobe'?'left':'right'}:50%;width:${w}%"></div>
      </div>
      <div class="cst-cmp-delta ${dir}">
        ${(l.delta>=0?'+':'−')+money(Math.abs(l.delta))}
        ${l.pct!=null ? `<span>${l.delta>=0?'+':'−'}${Math.abs(l.pct)}%</span>` : '<span>novo</span>'}
      </div>
    </div>`;
  }).join('');

  const resumo = `<div class="cst-resumo">${
    Math.abs(delta) < 1
      ? `${mesB} fechou praticamente igual a ${mesA}.`
      : `${mesB.charAt(0).toUpperCase()+mesB.slice(1)} está <b>${money(Math.abs(delta))} ${delta>0?'mais caro':'mais barato'}</b> que ${mesA}${
          pctGeral!=null?` (${delta>0?'+':'−'}${Math.abs(pctGeral)}%)`:''}.${
          nFaltando > 0 ? ` Mas <b>${nFaltando} custos de ${mesA} ainda não apareceram</b> em ${mesB} — queda grande numa área costuma ser lançamento que falta, não economia.` : ''}`
  }</div>`;

  return kpis + '<div style="height:14px"></div>' + UI.card({
    titulo:`Por área · ${mesA} → ${mesB}`,
    sub:`${linhas.length} áreas`,
    corpo: legenda + corpo + resumo,
  });
}

// ===========================================================================
function renderCustos(){
  const todos  = getCustos();
  const custos = filterCustoPeriod(todos);
  const anoMes    = custoAnoMesAtual();
  const anoMesAnt = anoMes ? custoMesAnterior(anoMes) : null;

  // Totais por loja -- rateio proporcional por produtos vendidos
  const vMesFilt = filterByPeriod(allVendas);
  const unCart  = vMesFilt.filter(v=>v.loja==='cart').reduce((a,v)=>a+(v._produtos&&v._produtos.length>0?v._produtos.filter(p=>isPrincipal(p)).length:0),0);
  const unUrban = vMesFilt.filter(v=>v.loja==='urban').reduce((a,v)=>a+(v._produtos&&v._produtos.length>0?v._produtos.filter(p=>isPrincipal(p)).length:0),0);
  const unTotal = unCart + unUrban || 1;
  const pctCart  = unCart  / unTotal;
  const pctUrban = unUrban / unTotal;

  let totalCart=0, totalUrban=0, totalAmbas=0;
  custos.forEach(c=>{
    const v=parseFloat(c.valor||0);
    if(c.loja==='cart') totalCart+=v;
    else if(c.loja==='urban') totalUrban+=v;
    else if(c.loja==='ambas') totalAmbas+=v;
  });
  const totalCartEfetivo  = totalCart  + totalAmbas * pctCart;
  const totalUrbanEfetivo = totalUrban + totalAmbas * pctUrban;
  const totalGeral = totalCart + totalUrban + totalAmbas;

  // Lucro real por loja: soma do lucro das vendas de cada loja
  const m=calc();
  // -- Recortes por loja (o da sidebar) e o mes de referencia ---------------
  const soLoja = arr => currentStore==='ambas' ? arr : arr.filter(c=>c.loja===currentStore||c.loja==='ambas');
  const atual    = soLoja(custos);
  const anterior = anoMesAnt ? soLoja(todos.filter(c => (c.data||'').slice(0,7) === anoMesAnt)) : [];
  const temComp  = !!anoMesAnt && anterior.length > 0;

  const gAtual = custoAgrupar(atual);
  const gAnt   = temComp ? custoAgrupar(anterior) : null;
  const mesLongo = anoMes ? custoNomeMes(anoMes, true) : getPeriodoLabel().toLowerCase();
  const mesAntCurto = anoMesAnt ? custoNomeMes(anoMesAnt) : '';
  const mesAntLongo = anoMesAnt ? custoNomeMes(anoMesAnt, true) : '';

  // -- Cabecalho ------------------------------------------------------------
  const vistaHTML = temComp ? `<div class="cst-vista">
      ${UI.chip('Mês', custoVista==='mes', `setCustoVista('mes')`)}
      ${UI.chip(`vs ${mesAntLongo}`, custoVista==='comp', `setCustoVista('comp')`)}
    </div>` : '';

  const headHTML=`
    <div class="pg-head">
      <div>
        <div class="pg-kicker">Custos operacionais</div>
        <div class="pg-title">Custos</div>
        <div class="pg-desc">Aluguel, salários, marketing e afins. Custos “ambas” são rateados entre as lojas na proporção de aparelhos vendidos no período.</div>
      </div>
      <div class="pg-acoes">
        ${vistaHTML}
        ${UI.btn('➕ Lançar custo', {onclick:'abrirModalCusto()', variante:'primario'})}
      </div>
    </div>`;

  // -- Vista comparativa ----------------------------------------------------
  if(custoVista === 'comp' && temComp){
    return headHTML + custoComparativoHTML(atual, anterior, anoMes, anoMesAnt);
  }

  // -- KPIs do mes ----------------------------------------------------------
  const totalAnterior = temComp ? custoSoma(anterior) : null;
  const deltaMes = temComp ? custoSoma(atual) - totalAnterior : null;
  const pctMes   = temComp && totalAnterior ? Math.round(deltaMes/totalAnterior*100) : null;

  // O que existia no mes passado e nao aparece neste. Mes em andamento sempre
  // "cai": enquanto houver custo por lancar, a queda NAO e economia -- por isso
  // o KPI perde o verde e vira alerta.
  const faltando = temComp
    ? [...gAnt.values()].filter(g => !gAtual.has(g.chave)).sort((a,b)=>b.total-a.total)
    : [];
  const quedaSuspeita = faltando.length > 0 && deltaMes < 0;

  // area mais cara do mes (sobre o recorte de loja, que e o que esta na tela)
  const totPorArea = {};
  atual.forEach(c => { const a=c.area||'outro'; totPorArea[a]=(totPorArea[a]||0)+parseFloat(c.valor||0); });
  const totalTela = custoSoma(atual);
  const maiorArea = Object.entries(totPorArea).sort((a,b)=>b[1]-a[1])[0];

  const kpisHTML = UI.kpis([
    {rotulo:`Total ${mesLongo}`, valor:money(totalTela), sub:`${atual.length} ${atual.length===1?'lançamento':'lançamentos'}`},
    temComp
      ? {rotulo:`vs ${mesAntLongo}`, valor:(deltaMes>=0?'+':'−')+money(Math.abs(deltaMes)),
         sub: quedaSuspeita
           ? `${mesAntLongo} fechou em ${money(totalAnterior)} · ${faltando.length} custos ainda não lançados`
           : `${mesAntLongo} fechou em ${money(totalAnterior)}${pctMes!=null?` · ${deltaMes>=0?'+':'−'}${Math.abs(pctMes)}%`:''}`,
         tom: deltaMes > 0 ? 'critico' : (quedaSuspeita ? 'alerta' : 'ok')}
      : {rotulo:'Lançamentos', valor:String(custos.length), sub:'no período'},
    {rotulo:'Maior área',
     valor: maiorArea ? areaLabel(maiorArea[0]) : '—',
     sub: maiorArea && totalTela ? `${money(maiorArea[1])} · ${Math.round(maiorArea[1]/totalTela*100)}% do mês` : ''},
  ]);

  const cardsLojaHTML = UI.kpis([
    {rotulo:'Cart', valor:money(totalCart), tom:'marca',
     sub:`próprio · com rateio ${money(totalCartEfetivo)}`},
    {rotulo:'Urban', valor:money(totalUrban),
     sub:`próprio · com rateio ${money(totalUrbanEfetivo)}`},
    {rotulo:'Compartilhado', valor:money(totalAmbas), tom:'processo',
     sub:`loja = ambas · ${Math.round(pctCart*100)}% Cart / ${Math.round(pctUrban*100)}% Urban`},
  ]);

  // -- Resultado apos custos ------------------------------------------------
  const liqReal=m.lucro-m.voTot-m.atTot-totalGeral;
  const resultHTML=UI.card({
    titulo:'Resultado após custos operacionais',
    corpo:`
      <div class="result-row"><div class="r-lbl">Lucro bruto (preço − custo + juros repassados)</div><div class="r-pos">${money(m.lucro)}</div></div>
      <div class="result-row"><div class="r-lbl">− Comissões online</div><div class="r-neg">− ${money(m.voTot)}</div></div>
      <div class="result-row"><div class="r-lbl">− Comissões atendentes</div><div class="r-neg">− ${money(m.atTot)}</div></div>
      <div class="result-row"><div class="r-lbl">− Custos operacionais</div><div class="r-neg">− ${money(totalGeral)}</div></div>
      <div class="result-row"><div class="r-lbl">Resultado líquido real</div><div class="${liqReal>=0?'r-pos':'r-neg'}">${money(liqReal)}</div></div>`,
  });

  const faltandoHTML = custoFaltandoHTML(faltando, mesAntLongo, anoMes);

  // -- Secoes por area ------------------------------------------------------
  const gruposPorArea = {};
  gAtual.forEach(g => { (gruposPorArea[g.area] = gruposPorArea[g.area] || []).push(g); });
  const areasPresentes = Object.keys(gruposPorArea)
    .sort((a,b)=> custoSoma(atual.filter(c=>(c.area||'outro')===b)) - custoSoma(atual.filter(c=>(c.area||'outro')===a)));

  const chipsHTML = areasPresentes.length > 1 ? UI.toolbar(
    UI.chip(`Todas <span class="c-grupo-cnt">${gAtual.size}</span>`, custoAreaFiltro==='todas', `setCustoArea('todas')`),
    ...areasPresentes.map(a => UI.chip(
      `${areaLabel(a)} <span class="c-grupo-cnt">${gruposPorArea[a].length}</span>`,
      custoAreaFiltro===a, `setCustoArea('${a}')`))
  ) : '';

  let secoesHTML;
  if(!atual.length){
    secoesHTML = UI.card({corpo: UI.vazio({
      ico:'🧾', titulo:'Nenhum custo neste período',
      texto:'Assim que você lançar aluguel, salários ou marketing, eles aparecem aqui agrupados por área.',
      acao:UI.btn('➕ Lançar o primeiro custo', {onclick:'abrirModalCusto()', variante:'primario', sm:true})
    })});
  } else {
    const mostrar = custoAreaFiltro==='todas' ? areasPresentes : areasPresentes.filter(a=>a===custoAreaFiltro);
    secoesHTML = mostrar.map(a => {
      const grupos = gruposPorArea[a].slice().sort((x,y)=>y.total-x.total);
      const totalArea = grupos.reduce((s,g)=>s+g.total,0);
      return custoAreaHTML(a, grupos, totalArea, totalTela, gAnt, mesAntCurto, pctCart, pctUrban);
    }).join('');
  }

  return `${headHTML}${kpisHTML}
    <div style="height:10px"></div>${cardsLojaHTML}
    <div style="height:14px"></div>${resultHTML}
    ${faltando.length ? '<div style="height:14px"></div>'+faltandoHTML : ''}
    <div style="height:16px"></div>${chipsHTML}${secoesHTML}`;
}


// Mapa de cores Apple -> cor visual
const COR_MAP={
  'titânio natural':{bg:'rgba(195,185,170,.15)',fg:'#c0b4a0'},
  'titânio preto':{bg:'rgba(50,48,46,.6)',fg:'#999'},
  'titânio branco':{bg:'rgba(230,225,218,.15)',fg:'#d8d0c4'},
  'titânio azul':{bg:'rgba(120,160,200,.15)',fg:'#88b0d8'},
  'titânio deserto':{bg:'rgba(210,190,155,.15)',fg:'#c8b888'},
  'titânio':{bg:'rgba(180,175,165,.15)',fg:'#b0a898'},
  'azul sierra':{bg:'rgba(100,150,220,.15)',fg:'#7aa0e0'},
  'azul pacífico':{bg:'rgba(50,110,180,.15)',fg:'#4a8fcc'},
  'roxo profundo':{bg:'rgba(120,60,180,.15)',fg:'#9050d0'},
  'meia noite':{bg:'rgba(40,40,50,.6)',fg:'#aab'},
  'chumbo espacial':{bg:'rgba(70,75,80,.15)',fg:'#9aa'},
  'preto':{bg:'rgba(30,30,30,.6)',fg:'#ccc'},
  'branco':{bg:'rgba(245,245,245,.15)',fg:'#eee'},
  'estelar':{bg:'rgba(220,205,180,.15)',fg:'#d4c9a8'},
  'prateado':{bg:'rgba(192,192,210,.15)',fg:'#c0c0d2'},
  'dourado':{bg:'rgba(200,170,100,.15)',fg:'#c8aa64'},
  'ouro':{bg:'rgba(200,170,100,.15)',fg:'#c8aa64'},
  'rosa':{bg:'rgba(220,130,140,.15)',fg:'#dc828c'},
  'vermelho':{bg:'rgba(200,50,50,.15)',fg:'#e05050'},
  'azul':{bg:'rgba(60,130,220,.15)',fg:'#4a9ef0'},
  'verde':{bg:'rgba(60,160,80,.15)',fg:'#50c060'},
  'roxo':{bg:'rgba(150,80,200,.15)',fg:'#a060e0'},
  'lavanda':{bg:'rgba(180,160,220,.15)',fg:'#c0a8e8'},
  'amarelo':{bg:'rgba(220,200,60,.15)',fg:'#d4c840'},
  'laranja':{bg:'rgba(220,130,50,.15)',fg:'#dc8230'},
  'grafite':{bg:'rgba(80,80,80,.15)',fg:'#aaa'},
};
