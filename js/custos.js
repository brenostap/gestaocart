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

async function gerarSalariosDoMes(){
  // Verificar se ja existem salarios fixos para o mes atual
  const now = new Date();
  const anoMes = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
  
  const salarios = [
    { id_base: 9000000000001, desc: 'Salário Pietra',    valor: 4500, funcionario: 'pietra'   },
    { id_base: 9000000000002, desc: 'Salário Anne',      valor: 2250, funcionario: 'anne'     },
    { id_base: 9000000000003, desc: 'Salário Denilson',  valor: 2250, funcionario: 'denilson' },
    { id_base: 9000000000004, desc: 'Salário Davi',      valor: 2250, funcionario: 'davi'     },
    { id_base: 9000000000005, desc: 'Salário Mel',       valor: 1500, funcionario: 'mel'      },
    { id_base: 9000000000006, desc: 'Salário Isa',       valor: 1500, funcionario: 'isa'      },
    { id_base: 9000000000007, desc: 'Salário David',     valor: 1500, funcionario: 'david'    },
    { id_base: 9000000000008, desc: 'Salário Vitinho',   valor: 2250, funcionario: 'vitinho'  },
  ];

  // ID unico por mes: base + YYYYMM (ex: 90000000000012604 para abril/2026)
  const mesNum = now.getFullYear() * 100 + (now.getMonth()+1);
  const dataHoje = now.toISOString().slice(0,10);

  // Verificar se ja existem salarios deste mes no cache
  const jaExistem = _custosCache && _custosCache.some(c => 
    c.fixo && c.data && c.data.startsWith(anoMes)
  );
  if(jaExistem) return; // ja foram gerados

  // Inserir no Supabase
  const rows = salarios.map(s => ({
    id: s.id_base * 10000 + mesNum,
    descricao: s.desc,
    valor: s.valor,
    data: dataHoje,
    area: 'funcionario',
    loja: 'ambas',
    obs: 'salário fixo mensal ' + anoMes,
    fixo: true,
    funcionario: s.funcionario
  }));

  try {
    await fetch(SB_URL+'/rest/v1/custos', {
      method: 'POST',
      headers: {
        'apikey': SB_KEY, 'Authorization': 'Bearer '+SB_TOKEN,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=ignore-duplicates'
      },
      body: JSON.stringify(rows)
    });
    console.log('[salários] gerados para', anoMes);
  } catch(e) { console.error('[salários] erro:', e); }
}

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

// Salarios fixos mensais -- configuracao central
const SALARIOS_CONFIG = [
  {func:'pietra',   desc:'Salário Pietra',   valor:4500},
  {func:'anne',     desc:'Salário Anne',      valor:2250},
  {func:'denilson', desc:'Salário Denilson',  valor:2250},
  {func:'davi',     desc:'Salário Davi',      valor:2250},
  {func:'mel',      desc:'Salário Mel',       valor:1500},
  {func:'isa',      desc:'Salário Isa',       valor:1500},
  {func:'david',    desc:'Salário David',     valor:1500},
  {func:'vitinho',  desc:'Salário Vitinho',   valor:2250},
];

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

const AREAS=[
  {id:'aluguel',    label:'Aluguel'},
  {id:'logistica',  label:'Logística / frete'},
  {id:'marketing',  label:'Marketing / tráfego'},
  {id:'plataforma', label:'Plataformas / sistemas'},
  {id:'funcionario',label:'Funcionários'},
  {id:'fornecedor', label:'Fornecedor / estoque'},
  {id:'outro',      label:'Outros'},
];

function areaLabel(id){ return AREAS.find(a=>a.id===id)?.label||id; }
function areaClass(id){ return 'crow-area area-'+id; }

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

async function addCusto(){
  const desc=document.getElementById('c-desc')?.value?.trim();
  const valor=parseFloat(document.getElementById('c-valor')?.value||0);
  const data=document.getElementById('c-data')?.value;
  const area=document.getElementById('c-area')?.value||'outro';
  const loja=document.getElementById('c-loja')?.value||'ambas';
  const obs=document.getElementById('c-obs')?.value||'';
  if(!desc||!valor||!data) return alert('Preencha descrição, valor e data.');
  const novo={id:Date.now(),desc,valor,data,area,loja,obs,fixo:false,funcionario:null};
  await saveCustoToSB(novo);
  if(_custosCache) _custosCache.unshift(novo);
  else _custosCache = [novo];
  renderContent();
}
async function deleteCusto(id){
  if(!confirm('Remover este custo?')) return;
  await deleteCustoFromSB(id);
  if(_custosCache) _custosCache = _custosCache.filter(c=>c.id!==id);
  else _custosCache = getCustos().filter(c=>c.id!==id);
  document.getElementById('content').innerHTML=renderCustos();
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

  // Form de lancamento
  const today=new Date().toISOString().slice(0,10);
  const formHTML=`
    <div class="custo-form">
      <div style="font-size:12px;font-weight:500;color:var(--text2);margin-bottom:12px">Lançar novo custo</div>
      <div class="custo-form-grid4">
        <div>
          <span class="clabel">Descrição</span>
          <input id="c-desc" class="cinput" type="text" placeholder="Ex: Aluguel março">
        </div>
        <div>
          <span class="clabel">Valor (R$)</span>
          <input id="c-valor" class="cinput" type="number" placeholder="0,00" step="0.01" min="0">
        </div>
        <div>
          <span class="clabel">Data</span>
          <input id="c-data" class="cinput" type="date" value="${today}">
        </div>
        <div>
          <span class="clabel">Área</span>
          <select id="c-area" class="cselect">
            ${AREAS.map(a=>`<option value="${a.id}">${a.label}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="custo-form-grid">
        <div>
          <span class="clabel">Loja</span>
          <select id="c-loja" class="cselect">
            <option value="cart">Phone Cart</option>
            <option value="urban">Urban</option>
            <option value="ambas">Ambas (rateio proporcional)</option>
          </select>
        </div>
        <div>
          <span class="clabel">Obs (opcional)</span>
          <input id="c-obs" class="cinput" type="text" placeholder="Informação adicional...">
        </div>
      </div>
      <button class="cadd-btn" onclick="addCusto()">+ Lançar custo</button>
    </div>`;

  // Sumario
  const sumsHTML=`
    <div class="csum-grid">
      <div class="csum-card">
        <div class="csum-label">Total geral</div>
        <div class="csum-val">${brl(totalGeral)}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:3px">${custos.length} lançamentos</div>
      </div>
      <div class="csum-card">
        <div class="csum-label">Cart (efetivo)</div>
        <div class="csum-val" style="color:#60a5fa">${brl(totalCartEfetivo)}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:3px">incl. ${Math.round(pctCart*100)}% das ambas</div>
      </div>
      <div class="csum-card">
        <div class="csum-label">Urban (efetivo)</div>
        <div class="csum-val" style="color:#fb923c">${brl(totalUrbanEfetivo)}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:3px">incl. ${Math.round(pctUrban*100)}% das ambas</div>
      </div>
      <div class="csum-card">
        <div class="csum-label">Custos compartilhados</div>
        <div class="csum-val" style="color:var(--purple)">${brl(totalAmbas)}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:3px">${brl(totalAmbas*pctCart)} Cart / ${brl(totalAmbas*pctUrban)} Urban</div>
      </div>
    </div>`;

  // Resultado com custos
  const resultHTML=`
    <div class="card" style="margin-bottom:14px">
      <div class="card-title">Resultado após custos operacionais</div>
      <div class="cresult-row"><div class="r-lbl">Lucro bruto (FoneNinja)</div><div class="r-pos">${brl(m.lucro)}</div></div>
      <div class="cresult-row"><div class="r-lbl">− Comissões online</div><div class="r-neg">− ${brl(m.voTot)}</div></div>
      <div class="cresult-row"><div class="r-lbl">− Comissões atendentes</div><div class="r-neg">− ${brl(m.atTot)}</div></div>
      <div class="cresult-row"><div class="r-lbl">− Custos operacionais (total)</div><div class="r-neg">− ${brl(totalGeral)}</div></div>
      <div class="cresult-row"><div class="r-lbl">Resultado líquido real</div><div class="r-pos">${brl(m.lucro-m.voTot-m.atTot-totalGeral)}</div></div>
    </div>`;

  // Filtros da tabela
  const filtersHTML=`
    <div class="filters-bar" style="margin-bottom:10px">
      <button class="pill${currentStore==='ambas'?' active':''}" onclick="setStore('ambas',this)">Ambas</button>
      <button class="pill${currentStore==='cart'?' active':''}" onclick="setStore('cart',this)">Phone Cart</button>
      <button class="pill${currentStore==='urban'?' active':''}" onclick="setStore('urban',this)">Urban</button>
      <div class="filters-sep"></div>
      <select class="period-select" id="psel" onchange="setPeriod()" style="border-radius:20px">${gerarOpcoesMeses()}</select>
    </div>`;

  // Filtrar por loja selecionada
  let filtrados=custos;
  if(currentStore!=='ambas') filtrados=custos.filter(c=>c.loja===currentStore||c.loja==='ambas');

  // Tabela de custos
  const tableRows=filtrados.length===0
    ?'<div style="padding:20px;text-align:center;color:var(--text4);font-size:13px">Nenhum custo lançado para este período.</div>'
    :filtrados.map(c=>{
      const efetivo=currentStore!=='ambas'?custoParaLoja(c,currentStore,pctCart,pctUrban):parseFloat(c.valor||0);
      return`<div class="crow" id="crow-${c.id}">
        <div>${c.data||'—'}</div>
        <div>
          <div style="color:#ddd;font-size:12px">${c.desc}</div>
          ${c.obs?`<div style="font-size:11px;color:var(--text4);margin-top:1px">${c.obs}</div>`:''}
        </div>
        <div><span class="${areaClass(c.area)}">${areaLabel(c.area)}</span></div>
        <div>${lojaTag(c.loja)}</div>
        <div style="font-size:12px;color:var(--text2)">${brl(parseFloat(c.valor||0))}</div>
        <div style="font-size:12px;${c.loja==='ambas'?'color:var(--text3)':''}">${c.loja==='ambas'?brl(efetivo)+' efetivo':''}</div>
        <div style="display:flex;gap:4px">
          <button class="cdel-btn" style="background:rgba(91,139,245,.1);color:var(--cart);border-color:rgba(91,139,245,.2)" onclick="abrirEdicaoCusto(${c.id})">✏️</button>
          <button class="cdel-btn" onclick="deleteCusto(${c.id})">×</button>
        </div>
      </div>`;
    }).join('');

  return`${filtersHTML}${sumsHTML}${resultHTML}${formHTML}
    <div style="font-size:10px;color:var(--text4);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">${filtrados.length} lançamentos no período</div>
    <div class="ctable">
      <div class="cth-row">
        <div class="cth">Data</div>
        <div class="cth">Descrição</div>
        <div class="cth">Área</div>
        <div class="cth">Loja</div>
        <div class="cth">Valor</div>
        <div class="cth">Efetivo</div>
        <div class="cth"></div>
      </div>
      ${tableRows}
    </div>`;
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
