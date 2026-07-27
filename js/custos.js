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

  // Gerar IDs unicos baseados em ano+mes+funcionario
  const anoMesNum = parseInt(anoMes.replace('-',''));
  const novos = SALARIOS_CONFIG
    .filter(s => !salariosMes.find(m => m.funcionario === s.func))
    .map((s, i) => ({
      id: anoMesNum * 100 + i + 1,
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
        'Prefer': 'resolution=ignore-duplicates'
      },
      body: JSON.stringify(novos)
    });
    if(res.ok){
      // Adicionar ao cache local
      novos.forEach(n => _custosCache.unshift({
        id: n.id, desc: n.descricao, valor: n.valor,
        data: n.data, area: n.area, loja: n.loja,
        obs: n.obs, fixo: true, funcionario: n.funcionario
      }));
      console.log('[salarios] Gerados', novos.length, 'salários de', anoMes);
    }
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
      funcionario: null
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
function abrirModalCusto(id){
  const c = id != null ? (_custosCache||[]).find(x=>x.id===id) : null;
  const hoje = new Date().toISOString().slice(0,10);
  const editando = !!c;
  const areaOpts = AREAS.map(a => ({v:a.id, t:a.label}));
  const lojaOpts = [{v:'cart',t:'📱 Phone Cart'},{v:'urban',t:'🏙 Urban'},{v:'ambas',t:'🔀 Ambas (rateio)'}];

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
  if(!desc || !valor || !data) return alert('Preencha descrição, valor e data.');

  const btn = document.getElementById('mc-salvar');
  if(btn){ btn.textContent='Salvando...'; btn.disabled=true; }

  try{
    if(id != null){
      // Edicao -> PATCH
      const r = await fetch(SB_URL+'/rest/v1/custos?id=eq.'+id, {
        method:'PATCH',
        headers:{'apikey':SB_KEY,'Authorization':'Bearer '+SB_TOKEN,'Content-Type':'application/json'},
        body: JSON.stringify({ descricao:desc, valor, loja, area, data, obs })
      });
      if(!r.ok) throw new Error('patch');
      const idx = (_custosCache||[]).findIndex(x=>x.id===id);
      if(idx>=0) _custosCache[idx] = {..._custosCache[idx], desc, descricao:desc, valor, loja, area, data, obs};
    } else {
      // Novo -> POST
      const novo = {id:Date.now(), desc, valor, data, area, loja, obs, fixo:false, funcionario:null};
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

// Filtro de area da tabela (a loja e o periodo vivem na sidebar, brief §7.2)
let custoAreaFiltro = 'todas';
function setCustoArea(a){
  custoAreaFiltro = a;
  document.getElementById('content').innerHTML = renderCustos();
}

function renderCustos(){
  const todos=getCustos();
  const custos=filterCustoPeriod(todos);

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
  // Ambas distribuidos proporcionalmente por produtos vendidos
  const totalCartEfetivo  = totalCart  + totalAmbas * pctCart;
  const totalUrbanEfetivo = totalUrban + totalAmbas * pctUrban;
  const totalGeral = totalCart + totalUrban + totalAmbas;

  // Lucro real por loja: soma do lucro das vendas de cada loja
  const m=calc();
  const lucroCart  = vMesFilt.filter(v=>v.loja==='cart').reduce((a,v)=>a+parseFloat(v.lucro||0),0);
  const lucroUrban = vMesFilt.filter(v=>v.loja==='urban').reduce((a,v)=>a+parseFloat(v.lucro||0),0);
  const lucroCartEst=lucroCart;
  const lucroUrbanEst=lucroUrban;
  const liqCart=lucroCartEst-totalCartEfetivo-m.voTot*pctCart-m.atTot*pctCart;
  const liqUrban=lucroUrbanEst-totalUrbanEfetivo-m.voTot*pctUrban-m.atTot*pctUrban;

  const lojaTag=l=>{
    if(l==='cart')return'<span class="cloja-cart">Cart</span>';
    if(l==='urban')return'<span class="cloja-urban">Urban</span>';
    return`<span class="cloja-ambas">Ambas (${Math.round(pctCart*100)}/${Math.round(pctUrban*100)})</span>`;
  };
  const fmtData=d=>{ if(!d) return '—'; const [y,mo,dia]=d.slice(0,10).split('-'); return `${dia}/${mo}`; };

  // -- CABECALHO DA PAGINA + acao primaria (abre o modal) -------------------
  const headHTML=`
    <div class="pg-head">
      <div>
        <div class="pg-kicker">Custos operacionais</div>
        <div class="pg-title">Custos</div>
        <div class="pg-desc">Aluguel, salários, marketing e afins. Custos “ambas” são rateados entre as lojas na proporção de aparelhos vendidos no período.</div>
      </div>
      <div class="pg-acoes">
        ${UI.btn('➕ Lançar custo', {onclick:'abrirModalCusto()', variante:'primario'})}
      </div>
    </div>`;

  // -- KPIs -----------------------------------------------------------------
  const kpisHTML=UI.kpis([
    {rotulo:'Total geral', valor:brl(totalGeral), sub:`${custos.length} lançamentos no período`},
    {rotulo:'Cart · efetivo', valor:brl(totalCartEfetivo), sub:`inclui ${Math.round(pctCart*100)}% das compartilhadas`, tom:'marca'},
    {rotulo:'Urban · efetivo', valor:brl(totalUrbanEfetivo), sub:`inclui ${Math.round(pctUrban*100)}% das compartilhadas`},
    {rotulo:'Compartilhados', valor:brl(totalAmbas), sub:`${brl(totalAmbas*pctCart)} Cart · ${brl(totalAmbas*pctUrban)} Urban`, tom:'processo'},
  ]);

  // -- Resultado apos custos ------------------------------------------------
  const liqReal=m.lucro-m.voTot-m.atTot-totalGeral;
  const resultHTML=UI.card({
    titulo:'Resultado após custos operacionais',
    corpo:`
      <div class="result-row"><div class="r-lbl">Lucro bruto (FoneNinja)</div><div class="r-pos">${brl(m.lucro)}</div></div>
      <div class="result-row"><div class="r-lbl">− Comissões online</div><div class="r-neg">− ${brl(m.voTot)}</div></div>
      <div class="result-row"><div class="r-lbl">− Comissões atendentes</div><div class="r-neg">− ${brl(m.atTot)}</div></div>
      <div class="result-row"><div class="r-lbl">− Custos operacionais</div><div class="r-neg">− ${brl(totalGeral)}</div></div>
      <div class="result-row"><div class="r-lbl">Resultado líquido real</div><div class="${liqReal>=0?'r-pos':'r-neg'}">${brl(liqReal)}</div></div>`,
  });

  // -- Filtrar por loja (sidebar) -------------------------------------------
  let filtrados=custos;
  if(currentStore!=='ambas') filtrados=custos.filter(c=>c.loja===currentStore||c.loja==='ambas');

  // -- Chips de area (contador por area, no espirito da referencia) ---------
  const porArea={};
  filtrados.forEach(c=>{ const a=c.area||'outro'; (porArea[a]=porArea[a]||[]).push(c); });
  const areasPresentes=Object.keys(porArea).sort((a,b)=> areaOrdem(a)-areaOrdem(b) || areaLabel(a).localeCompare(areaLabel(b),'pt-BR'));
  const chipsHTML=UI.toolbar(
    UI.chip(`Todas <span class="c-grupo-cnt">${filtrados.length}</span>`, custoAreaFiltro==='todas', `setCustoArea('todas')`),
    ...areasPresentes.map(a=>UI.chip(`${areaLabel(a)} <span class="c-grupo-cnt">${porArea[a].length}</span>`, custoAreaFiltro===a, `setCustoArea('${a}')`))
  );

  // -- Tabela agrupada por area (faixa sticky por grupo) --------------------
  const areasMostrar = custoAreaFiltro==='todas' ? areasPresentes : areasPresentes.filter(a=>a===custoAreaFiltro);

  let corpoTabela='';
  if(filtrados.length===0){
    corpoTabela=`<tr class="crow-vazia"><td colspan="6">${UI.vazio({
      ico:'🧾', titulo:'Nenhum custo neste período',
      texto:'Assim que você lançar aluguel, salários ou marketing, eles aparecem aqui agrupados por área.',
      acao:UI.btn('➕ Lançar o primeiro custo', {onclick:'abrirModalCusto()', variante:'primario', sm:true})
    })}</td></tr>`;
  } else {
    corpoTabela=areasMostrar.map(a=>{
      const itens=porArea[a].slice().sort((x,y)=>String(y.data||'').localeCompare(String(x.data||'')));
      const subtotal=itens.reduce((s,c)=>s+parseFloat(c.valor||0),0);
      const faixa=`<tr class="c-grupo"><td colspan="6">
        <span class="${areaClass(a)}">${areaLabel(a)}</span>
        <span class="c-grupo-cnt">${itens.length} ${itens.length===1?'lançamento':'lançamentos'}</span>
        <span class="c-grupo-sub">${brl(subtotal)}</span>
      </td></tr>`;
      const linhas=itens.map(c=>{
        const mostraEfetivo = c.loja==='ambas' && currentStore!=='ambas';
        const efetivo = custoParaLoja(c, currentStore, pctCart, pctUrban);
        return `<tr>
          <td data-rot="Data" class="mono">${fmtData(c.data)}</td>
          <td data-rot="Descrição">
            <div class="forte">${escapeHtml(c.desc||'')}</div>
            ${c.obs?`<div style="font-size:11px;color:var(--text4);margin-top:1px">${escapeHtml(c.obs)}</div>`:''}
            ${c.fixo?'<span class="c-badge" style="margin-top:3px">fixo mensal</span>':''}
          </td>
          <td data-rot="Loja">${lojaTag(c.loja)}</td>
          <td data-rot="Valor" class="num forte">${brl(parseFloat(c.valor||0))}</td>
          <td ${mostraEfetivo?'data-rot="Efetivo"':''} class="num" style="color:var(--text3)">${mostraEfetivo?brl(efetivo):''}</td>
          <td data-rot="" style="text-align:right;white-space:nowrap">
            ${UI.btn('✏️', {onclick:`abrirModalCusto(${c.id})`, variante:'sutil', sm:true, titulo:'Editar'})}
            ${UI.btn('🗑', {onclick:`deleteCusto(${c.id})`, variante:'sutil', sm:true, titulo:'Remover'})}
          </td>
        </tr>`;
      }).join('');
      return faixa+linhas;
    }).join('');
  }

  const tabelaHTML=UI.card({
    titulo:'Lançamentos', sub:`${filtrados.length} no período`, flush:true,
    corpo:`<div class="c-tabela-wrap"><table class="c-tabela">
      <thead><tr>
        <th style="width:64px">Data</th>
        <th>Descrição</th>
        <th style="width:120px">Loja</th>
        <th class="num" style="width:110px">Valor</th>
        <th class="num" style="width:110px">Efetivo</th>
        <th style="width:88px"></th>
      </tr></thead>
      <tbody>${corpoTabela}</tbody>
    </table></div>`,
  });

  return `${headHTML}${kpisHTML}
    <div style="height:14px"></div>${resultHTML}
    <div style="height:14px"></div>${chipsHTML}${tabelaHTML}`;
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
