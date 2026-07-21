// -- EQUIPE Supabase helpers ------------------------------------------------
let _funcConfigCache = {};
let _dividasCache = {};

function getEquipeExtra(id){
  return _funcConfigCache[id] || {};
}
function setEquipeExtra(id, data){
  _funcConfigCache[id] = data;
  fetch(SB_URL+'/rest/v1/funcionarios_config', {
    method: 'POST',
    headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer '+SB_TOKEN,
      'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify({ id, ...data, updated_at: new Date().toISOString() })
  }).catch(e => console.error('setEquipeExtra erro:', e));
}
function getDividas(id){
  return _dividasCache[id] || [];
}
function setDividas(id, arr){
  _dividasCache[id] = arr;
  fetch(SB_URL+'/rest/v1/dividas?funcionario_id=eq.'+id, {
    method: 'DELETE',
    headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer '+SB_TOKEN }
  }).then(() => {
    if(!arr.length) return;
    return fetch(SB_URL+'/rest/v1/dividas', {
      method: 'POST',
      headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer '+SB_TOKEN,
        'Content-Type': 'application/json', 'Prefer': 'resolution=ignore-duplicates' },
      body: JSON.stringify(arr.map(d => ({
        id: d.id,
        funcionario_id: id,
        descricao: d.desc || d.descricao || '',
        total: parseFloat(d.total || 0),
        data: d.data || new Date().toISOString().slice(0,10),
        parcelas: d.parcelas || []
      })))
    });
  }).catch(e => console.error('setDividas erro:', e));
}
async function loadEquipeFromSB(){
  try {
    const r1 = await fetch(SB_URL+'/rest/v1/funcionarios_config?limit=100', {
      headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer '+SB_TOKEN }
    });
    const configs = await r1.json();
    if(Array.isArray(configs)) configs.forEach(c => { _funcConfigCache[c.id] = c; });
    const r2 = await fetch(SB_URL+'/rest/v1/dividas?limit=500&order=created_at.desc', {
      headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer '+SB_TOKEN }
    });
    const dividas = await r2.json();
    if(Array.isArray(dividas)){
      dividas.forEach(d => {
        if(!_dividasCache[d.funcionario_id]) _dividasCache[d.funcionario_id] = [];
        _dividasCache[d.funcionario_id].push({
          id: d.id, desc: d.descricao,
          total: parseFloat(d.total||0),
          data: d.data, parcelas: d.parcelas||[]
        });
      });
    }
  } catch(e){ console.error('loadEquipeFromSB erro:', e); }
}

// Estado da equipe
let equipeOpenId=null, equipeOpenTab='info', equipeEditMode=false;

function calcComissaoFunc(f, vendas, movs, lAcessTotal){
  const movsMap={};
  movs.forEach(m=>{ if(!movsMap[m.parent_id])movsMap[m.parent_id]=[]; movsMap[m.parent_id].push(m); });
  const v=filterByPeriod(vendas);

  // Helper: contar iPhones de uma venda usando _produtos se disponivel
  function contarIphones(x){
    if(x._produtos!=null) return x._produtos.filter(p=>isPrincipal(p)).length;
    return 0; // sem _produtos -- nao conta como device
  }

  // Helper: pegar acessorios de uma venda
  // Usa _produtos (Supabase) se disponivel, fallback para movsMap (FoneNinja direto)
  function getAcess(x){
    if(x._produtos&&x._produtos.length>0){
      // isAcess: sem imei, sem apple_id, custo < 200
      return x._produtos.filter(p=>isAcess(p)).map(p=>({...p,parent_id:x.id}));
    }
    return (movsMap[x.id]||[]).filter(m=>isAcess(m));
  }

  if(f.tipo==='socio') return { vendCount:0, units:0, comm:0, rate:0, metaBatida:false, tipo:'socio' };
  if(f.tipo==='online'){
    const k=f.voKey;
    if(!k) return { vendCount:0, units:0, comm:0, rate:25, metaBatida:false, tipo:'online' };
    let vendCount=0,units=0;
    v.forEach(x=>{ const {vendedor}=getVendaInfo(x); const m=matchNome(vendedor,[k]); if(m){vendCount++;units+=contarIphones(x);} });
    // Meta: acima de 80 unidades -> R$35/un (R$10 bonus por unidade extra)
    const rateBase=25, rateBonus=35, metaUnits=80;
    const comm = units<=metaUnits ? units*rateBase : metaUnits*rateBase+(units-metaUnits)*rateBonus;
    const rate = units>metaUnits ? rateBonus : rateBase;
    const metaBatida = units>metaUnits;
    return { vendCount, units, comm, rate, metaBatida, tipo:'online' };
  } else if(f.voKey){
    // presencial que tambem vende online (ex: Pietra)
    const k=f.voKey;
    let vendCount=0,unitsVo=0;
    v.forEach(x=>{ const {vendedor}=getVendaInfo(x); const m=matchNome(vendedor,[k]); if(m){vendCount++;unitsVo+=contarIphones(x);} });
    const kAt=f.atKey;
    let la=0,qt=0,bruto=0;
    const vAtend={};
    v.forEach(x=>{ const {atendente}=getVendaInfo(x); const m=matchNome(atendente,[kAt]); if(m)vAtend[x.id]=true; });
    v.filter(x=>vAtend[x.id]).forEach(x=>{
      getAcess(x).forEach(p=>{
        const l=parseFloat(p.preco||0)-parseFloat(p.valor_estoque||0);
        la+=l; bruto+=parseFloat(p.preco||0); qt++;
      });
    });
    const bonus=f.bonus?lAcessTotal*0.05:0;
    const commVo=unitsVo*25;
    const commAt=la*0.25+bonus;
    return { vendCount, unitsVo, commVo, qt, brutoAcess:bruto, lucroAcess:la, comm:commVo+commAt, bonus, tipo:'ambos' };
  } else {
    const k=f.atKey;
    let la=0,qt=0,bruto=0;
    const vAtend={};
    v.forEach(x=>{ const {atendente}=getVendaInfo(x); const m=matchNome(atendente,[k]); if(m)vAtend[x.id]=true; });
    v.filter(x=>vAtend[x.id]).forEach(x=>{
      getAcess(x).forEach(p=>{
        const l=parseFloat(p.preco||0)-parseFloat(p.valor_estoque||0);
        la+=l; bruto+=parseFloat(p.preco||0); qt++;
      });
    });
    // Atendente que vende device ganha R$25/un (flat -- sem curva de meta de 80un)
    let vendCount=0, unitsVo=0;
    v.forEach(x=>{ const {vendedor}=getVendaInfo(x); const m=matchNome(vendedor,[k]); if(m){vendCount++;unitsVo+=contarIphones(x);} });
    const commVo = unitsVo * 25;
    const bonus=f.bonus?lAcessTotal*0.05:0;
    return { vendCount, unitsVo, commVo, qt, brutoAcess:bruto, lucroAcess:la, comm:la*0.25+bonus+commVo, bonus, tipo:'presencial' };
  }
}

function renderEquipe(){
  const movsMap={};
  allMovs.forEach(function(m){ if(!movsMap[m.parent_id])movsMap[m.parent_id]=[]; movsMap[m.parent_id].push(m); });
  const v=filterByPeriod(allVendas);
  const ids=new Set(v.map(function(x){return x.id;}));
  const acAll=allMovs.filter(function(m){return ids.has(m.parent_id)&&isAcess(m);});
  const lAcessTotal=acAll.reduce(function(a,m){return a+parseFloat(m.preco||0)-parseFloat(m.valor_estoque||0);},0);

  if(equipeOpenId){ return renderFuncCard(equipeOpenId, lAcessTotal); }

  const SOCIOS_IDS=['gustavo','marcella'];

  const metricas={};
  FUNC.forEach(function(f){ metricas[f.id]=calcComissaoFunc(f,allVendas,allMovs,lAcessTotal); });

  const socios=FUNC.filter(function(f){return SOCIOS_IDS.includes(f.id);});
  const online=FUNC.filter(function(f){return !SOCIOS_IDS.includes(f.id)&&f.tipo==='online'&&!f.atKey;});
  const presencial=FUNC.filter(function(f){return !SOCIOS_IDS.includes(f.id)&&(f.tipo==='presencial'||(f.atKey&&!f.voKey));});
  const ambos=FUNC.filter(function(f){return !SOCIOS_IDS.includes(f.id)&&f.voKey&&f.atKey;});

  online.sort(function(a,b){return (metricas[b.id]&&metricas[b.id].units||0)-(metricas[a.id]&&metricas[a.id].units||0);});
  presencial.sort(function(a,b){return (metricas[b.id]&&metricas[b.id].brutoAcess||0)-(metricas[a.id]&&metricas[a.id].brutoAcess||0);});

  let html = '<div style="display:flex;gap:8px;margin-bottom:18px;align-items:center;flex-wrap:wrap">'
    + '<select class="period-select" id="psel" onchange="setPeriod()" style="border-radius:20px">'+gerarOpcoesMeses()+'</select>'
    + '</div>';

  // -- Socios ------------------------------------------------
  const sociosParaMostrar = socios.slice();
  if(!FUNC.find(function(f){return f.id==='marcella';})){
    sociosParaMostrar.push({id:'marcella',ap:'Marcella',nome:'Marcella',cargo:'Sócia',tipo:'socio'});
  }
  if(sociosParaMostrar.length > 0){
    html += '<div style="margin-bottom:20px">'
      + '<div style="font-size:10px;color:var(--text3);font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:10px;display:flex;align-items:center;gap:8px">'
      + '<span style="display:inline-block;width:20px;height:1px;background:var(--gold);opacity:.5"></span>'
      + 'Sócios'
      + '<span style="display:inline-block;flex:1;height:1px;background:var(--border)"></span>'
      + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">';

    sociosParaMostrar.forEach(function(f){
      const comm=metricas[f.id]||{vendCount:0,units:0,comm:0};
      const unidades=comm.units||comm.vendCount||0;
      html += '<div class="func-card socio" onclick="openFunc(\''+f.id+'\')">'
        + '<div class="func-top">'
        + '<div class="func-avatar socio-avatar">'+ini(f.nome)+'</div>'
        + '<div style="flex:1">'
        + '<div style="display:flex;align-items:center;gap:8px">'
        + '<span style="font-size:15px;font-weight:700;color:var(--gold)">'+f.ap+'</span>'
        + '<span class="badge-socio">SÓCIO</span>'
        + '</div>'
        + '<div style="font-size:11px;color:var(--text3);margin-top:2px">'+(f.cargo||'Sócio(a)')+'</div>'
        + '</div>'
        + '</div>'
        + (unidades>0 ? '<div style="font-size:12px;color:var(--text3);margin-top:10px;padding-top:8px;border-top:1px solid rgba(245,200,66,.15)"><span style="color:var(--gold);font-weight:600">'+unidades+'</span> produtos no período</div>' : '')
        + '</div>';
    });
    html += '</div></div>';
  }

  // -- Vendedores Online -------------------------------------
  const todosVo = online.concat(ambos);
  if(todosVo.length > 0){
    html += '<div style="margin-bottom:20px">'
      + '<div style="font-size:10px;color:var(--text3);font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:10px;display:flex;align-items:center;gap:8px">'
      + '<span style="display:inline-block;width:20px;height:1px;background:var(--cart);opacity:.5"></span>'
      + 'Vendedores Online'
      + '<span style="display:inline-block;flex:1;height:1px;background:var(--border)"></span>'
      + '</div>';

    const maxUnits = Math.max.apply(null, todosVo.map(function(x){return metricas[x.id]&&metricas[x.id].units||0;}).concat([1]));
    todosVo.forEach(function(f, rank){
      const cl=COLORS[FUNC.indexOf(f)%COLORS.length];
      const comm=metricas[f.id]||{vendCount:0,units:0,comm:0};
      const extra=getEquipeExtra(f.id);
      const dividas=getDividas(f.id);
      const saldoDiv=dividas.reduce(function(a,d){const pago=d.parcelas.filter(function(p){return p.paga;}).reduce(function(s,p){return s+p.valor;},0);return a+(d.total-pago);},0);
      const metaBatida=comm.units>80;
      const rankMedal=rank===0?'🥇':rank===1?'🥈':rank===2?'🥉':'';
      const pctBar=Math.round((comm.units||0)/maxUnits*100);

      html += '<div class="func-card" onclick="openFunc(\''+f.id+'\')">'
        + '<div class="func-top">'
        + '<div style="position:relative">'
        + '<div class="func-avatar" style="background:'+cl+'20;color:'+cl+';border-color:'+cl+'40">'+ini(f.nome)+'</div>'
        + (rankMedal ? '<span style="position:absolute;bottom:-4px;right:-4px;font-size:12px">'+rankMedal+'</span>' : '')
        + '</div>'
        + '<div style="flex:1;min-width:0">'
        + '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">'
        + '<span class="func-nome">'+f.ap+'</span>'
        + '<span style="font-size:10px;color:var(--text4)">'+f.nome+'</span>'
        + '<span class="badge-online">online</span>'
        + (metaBatida ? '<span style="font-size:10px;background:rgba(48,209,88,.1);color:var(--green);padding:1px 6px;border-radius:4px;font-weight:700">🔥 R$35/un</span>' : '')
        + '</div>'
        + '<div class="func-cargo">'+f.cargo+'</div>'
        + '<div style="font-size:12px;margin-top:4px">'
        + '<span style="color:var(--cart);font-weight:600">'+comm.vendCount+'</span><span style="color:var(--text3)"> pedidos · </span>'
        + '<span style="color:var(--text);font-weight:600">'+(comm.units||comm.unitsVo||0)+'</span><span style="color:var(--text3)"> produtos · </span>'
        + '<span style="color:var(--green);font-weight:600">'+brl(comm.comm)+'</span>'
        + (saldoDiv>0 ? ' · <span style="color:var(--red)">dívida '+brl(saldoDiv)+'</span>' : '')
        + '</div>'
        + '<div style="margin-top:6px;height:2px;background:var(--border);border-radius:1px;overflow:hidden">'
        + '<div style="height:100%;width:'+pctBar+'%;background:linear-gradient(90deg,var(--cart),var(--cart2));border-radius:1px"></div>'
        + '</div>'
        + '</div>'
        + '<div style="font-size:18px;color:var(--border)">›</div>'
        + '</div>'
        + '</div>';
    });
    html += '</div>';
  }

  // -- Atendentes Presenciais --------------------------------
  if(presencial.length > 0){
    html += '<div>'
      + '<div style="font-size:10px;color:var(--text3);font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:10px;display:flex;align-items:center;gap:8px">'
      + '<span style="display:inline-block;width:20px;height:1px;background:var(--urban);opacity:.5"></span>'
      + 'Atendentes Presenciais'
      + '<span style="display:inline-block;flex:1;height:1px;background:var(--border)"></span>'
      + '</div>';

    const maxBruto = Math.max.apply(null, presencial.map(function(x){return metricas[x.id]&&metricas[x.id].brutoAcess||0;}).concat([1]));
    presencial.forEach(function(f, rank){
      const cl=COLORS[FUNC.indexOf(f)%COLORS.length];
      const comm=metricas[f.id]||{qt:0,brutoAcess:0,comm:0};
      const dividas=getDividas(f.id);
      const saldoDiv=dividas.reduce(function(a,d){const pago=d.parcelas.filter(function(p){return p.paga;}).reduce(function(s,p){return s+p.valor;},0);return a+(d.total-pago);},0);
      const rankMedal=rank===0?'🥇':rank===1?'🥈':rank===2?'🥉':'';
      const pctBar=Math.round((comm.brutoAcess||0)/maxBruto*100);
      const metaNivel=comm.brutoAcess>=10000?3:comm.brutoAcess>=6000?2:comm.brutoAcess>=4000?1:0;
      const metaBadge=metaNivel===3?'🏆 R$10k':metaNivel===2?'✅ R$6k':metaNivel===1?'✅ R$4k':'';
      const metaColor=metaNivel>=2?'var(--green)':'var(--cart)';

      html += '<div class="func-card" onclick="openFunc(\''+f.id+'\')">'
        + '<div class="func-top">'
        + '<div style="position:relative">'
        + '<div class="func-avatar" style="background:'+cl+'20;color:'+cl+';border-color:'+cl+'40">'+ini(f.nome)+'</div>'
        + (rankMedal ? '<span style="position:absolute;bottom:-4px;right:-4px;font-size:12px">'+rankMedal+'</span>' : '')
        + '</div>'
        + '<div style="flex:1;min-width:0">'
        + '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">'
        + '<span class="func-nome">'+f.ap+'</span>'
        + '<span style="font-size:10px;color:var(--text4)">'+f.nome+'</span>'
        + '<span class="badge-presencial">presencial</span>'
        + (metaBadge ? '<span style="font-size:10px;background:rgba(48,209,88,.1);color:'+metaColor+';padding:1px 6px;border-radius:4px;font-weight:700">'+metaBadge+'</span>' : '')
        + '</div>'
        + '<div class="func-cargo">'+f.cargo+'</div>'
        + '<div style="font-size:12px;margin-top:4px">'
        + '<span style="color:var(--urban);font-weight:600">'+brl(comm.brutoAcess||0)+'</span><span style="color:var(--text3)"> bruto acess. · </span>'
        + '<span style="color:var(--green);font-weight:600">'+brl(comm.comm)+'</span>'
        + (saldoDiv>0 ? ' · <span style="color:var(--red)">dívida '+brl(saldoDiv)+'</span>' : '')
        + '</div>'
        + '<div style="margin-top:6px;height:2px;background:var(--border);border-radius:1px;overflow:hidden">'
        + '<div style="height:100%;width:'+pctBar+'%;background:linear-gradient(90deg,var(--urban),var(--cart2));border-radius:1px"></div>'
        + '</div>'
        + '</div>'
        + '<div style="font-size:18px;color:var(--border)">›</div>'
        + '</div>'
        + '</div>';
    });
    html += '</div>';
  }



  // -- Tabela de fechamento do mes -----------------------------------------------
  const m2=calc();
  const custosMesFech=filterCustoPeriod(_custosCache).reduce((a,c)=>a+parseFloat(c.valor||0),0);
  const sal={pietra:4500,anne:2250,denilson:2250,davi:2250,mel:1500,isa:1500,david:1500,vitinho:2250,leo:2250,luana:2250,maria:3000};
  function calcCommVoF(k){const u=m2.voMap[k]?.units||0;return u<=80?u*25:80*25+(u-80)*35;}
  function calcCommAtF(k){return Math.round((m2.atMap[k]?.la||0)*0.25)+(k==='anne'?Math.round(m2.lAcess*0.05):0);}
  function calcBonusAtF(b){return b>=10000?1000:b>=6000?300:b>=4000?100:0;}
  const metasDevL=_periodoNovoRegime()?[{qt:350,bonus:500},{qt:400,bonus:750},{qt:450,bonus:1000}]:[{qt:300,bonus:200},{qt:350,bonus:400},{qt:400,bonus:550}];
  const metasAcL=_periodoNovoRegime()?[{val:25000,bonus:200},{val:30000,bonus:500},{val:40000,bonus:750}]:[{val:20000,bonus:150},{val:25000,bonus:200},{val:30000,bonus:500}];
  const metaDevF=metasDevL.filter(x=>m2.unPrincipal>=x.qt).pop()||null;
  const metaAcF=metasAcL.filter(x=>m2.vendaAcess>=x.val).pop()||null;
  const bonusColF=(metaDevF?.bonus||0)+(metaAcF?.bonus||0);

  const pessoas=[
    {id:'david',  nome:'David',   sal:sal.david,   comm:calcCommVoF('david'),   bonus5:0, bonusMeta:0},
    {id:'isa',    nome:'Isa',     sal:sal.isa,     comm:calcCommVoF('isa'),     bonus5:0, bonusMeta:0},
    {id:'mel',    nome:'Mel',     sal:sal.mel,     comm:calcCommVoF('mel'),     bonus5:0, bonusMeta:0},
    {id:'pietra', nome:'Pietra',  sal:sal.pietra,  comm:calcCommVoF('pietra')+calcCommAtF('pietra'), bonus5:0, bonusMeta:calcBonusAtF(m2.atMap['pietra']?.brutoAcess||0)},
    {id:'anne',   nome:'Anne',    sal:sal.anne,    comm:Math.round((m2.atMap['anne']?.la||0)*0.25),  bonus5:Math.round(m2.lAcess*0.05), bonusMeta:calcBonusAtF(m2.atMap['anne']?.brutoAcess||0)},
    {id:'davi',   nome:'Davi',    sal:sal.davi,    comm:calcCommAtF('davi'),    bonus5:0, bonusMeta:calcBonusAtF(m2.atMap['davi']?.brutoAcess||0)},
    {id:'vitinho',nome:'Vitinho', sal:sal.vitinho, comm:calcCommAtF('vitinho'), bonus5:0, bonusMeta:calcBonusAtF(m2.atMap['vitinho']?.brutoAcess||0)},
    {id:'denilson',nome:'Denilson',sal:sal.denilson,comm:calcCommAtF('denilson'),bonus5:0,bonusMeta:calcBonusAtF(m2.atMap['denilson']?.brutoAcess||0)},
    {id:'leo',    nome:'Leo',     sal:sal.leo,     comm:calcCommAtF('leo'),     bonus5:0, bonusMeta:calcBonusAtF(m2.atMap['leo']?.brutoAcess||0)},
    {id:'maria',  nome:'Maria',   sal:sal.maria,   comm:calcCommVoF('maria')+calcCommAtF('maria'), bonus5:0, bonusMeta:calcBonusAtF(m2.atMap['maria']?.brutoAcess||0)},
    {id:'luana',  nome:'Luana',   sal:sal.luana,   comm:calcCommAtF('luana'),   bonus5:0, bonusMeta:calcBonusAtF(m2.atMap['luana']?.brutoAcess||0)},
  ].map(p=>({...p, total:p.sal+p.comm+p.bonus5+p.bonusMeta}));

  const totalColF=pessoas.reduce((a,p)=>a+p.total,0);
  const totalBonusMetasF=bonusColF+pessoas.reduce((a,p)=>a+p.bonusMeta,0);
  const voTotF=['david','isa','mel','pietra','maria'].reduce((a,k)=>a+calcCommVoF(k),0);
  const atTotF=['anne','davi','vitinho','denilson','pietra','leo','luana','maria'].reduce((a,k)=>a+calcCommAtF(k),0);
  const liqFinal=m2.lucro-voTotF-atTotF-Math.round(m2.lAcess*0.05)-custosMesFech-totalBonusMetasF;

  const mesAtual=new Date().toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
  const tabelaFechamento=`
    <div class="card" style="margin-top:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div class="card-title" style="margin:0">📋 Fechamento — ${mesAtual}</div>
        <button onclick="gerarResumoEquipe()" style="padding:6px 14px;background:rgba(91,139,245,.12);border:1px solid rgba(91,139,245,.3);border-radius:8px;color:var(--cart);font-size:12px;font-weight:600;cursor:pointer">📋 Gerar resumos</button>
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead>
            <tr style="border-bottom:1px solid var(--border2)">
              <th style="text-align:left;padding:6px 8px;color:var(--text4);font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:.05em">Pessoa</th>
              <th style="text-align:right;padding:6px 8px;color:var(--text4);font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:.05em">Salário</th>
              <th style="text-align:right;padding:6px 8px;color:var(--text4);font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:.05em">Comissão</th>
              <th style="text-align:right;padding:6px 8px;color:var(--text4);font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:.05em">5% Acess</th>
              <th style="text-align:right;padding:6px 8px;color:var(--text4);font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:.05em">Bônus meta</th>
              <th style="text-align:right;padding:6px 8px;color:var(--cart);font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.05em">Total</th>
            </tr>
          </thead>
          <tbody>
            ${pessoas.map(p=>`
              <tr style="border-bottom:1px solid var(--border)">
                <td style="padding:8px 8px;font-weight:600;color:var(--text)">${p.nome}</td>
                <td style="padding:8px 8px;text-align:right;color:var(--text3)">${p.sal>0?brl(p.sal):'—'}</td>
                <td style="padding:8px 8px;text-align:right;color:var(--text2)">${p.comm>0?brl(p.comm):'—'}</td>
                <td style="padding:8px 8px;text-align:right;color:var(--green)">${p.bonus5>0?brl(p.bonus5):'—'}</td>
                <td style="padding:8px 8px;text-align:right;color:var(--yellow)">${p.bonusMeta>0?'+'+brl(p.bonusMeta):'—'}</td>
                <td style="padding:8px 8px;text-align:right;font-weight:700;color:var(--cart)">${brl(p.total)}</td>
              </tr>`).join('')}
          </tbody>
          <tfoot>
            <tr style="border-top:2px solid var(--border2)">
              <td style="padding:8px 8px;font-weight:700;color:var(--text)">Total folha</td>
              <td colspan="4" style="padding:8px 8px;text-align:right;font-size:10px;color:var(--text4)">
                ${bonusColF>0?`+ bônus coletivo ${brl(bonusColF)} (devices+acess)`:''}
              </td>
              <td style="padding:8px 8px;text-align:right;font-weight:700;font-size:14px;color:var(--cart)">${brl(totalColF+bonusColF)}</td>
            </tr>
            <tr>
              <td colspan="5" style="padding:6px 8px;font-size:11px;color:var(--text3)">Lucro líquido após folha completa</td>
              <td style="padding:6px 8px;text-align:right;font-weight:700;font-size:13px;color:${liqFinal>0?'var(--green)':'var(--red)'}">${brl(liqFinal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>`;

  html += tabelaFechamento;

    return html;
}

function gerarResumoEquipe(){
  const m=calc();
  const mesAtual=new Date().toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
  const mesLabel=mesAtual.charAt(0).toUpperCase()+mesAtual.slice(1);
  const sal={pietra:4500,anne:2250,denilson:2250,davi:2250,mel:1500,isa:1500,david:1500,vitinho:2250,leo:2250,luana:2250,maria:3000};
  function cvF(k){const u=m.voMap[k]?.units||0;return u<=80?u*25:80*25+(u-80)*35;}
  function caF(k){return Math.round((m.atMap[k]?.la||0)*0.25)+(k==='anne'?Math.round(m.lAcess*0.05):0);}
  function bmF(b){return b>=10000?1000:b>=6000?300:b>=4000?100:0;}
  const metasDevL=_periodoNovoRegime()?[{qt:350,bonus:500},{qt:400,bonus:750},{qt:450,bonus:1000}]:[{qt:300,bonus:200},{qt:350,bonus:400},{qt:400,bonus:550}];
  const metasAcL=_periodoNovoRegime()?[{val:25000,bonus:200},{val:30000,bonus:500},{val:40000,bonus:750}]:[{val:20000,bonus:150},{val:25000,bonus:200},{val:30000,bonus:500}];
  const metaDevF=metasDevL.filter(x=>m.unPrincipal>=x.qt).pop()||null;
  const metaAcF=metasAcL.filter(x=>m.vendaAcess>=x.val).pop()||null;
  const bonusColF=(metaDevF?.bonus||0)+(metaAcF?.bonus||0);
  const bonusColPorPessoa=Math.round(bonusColF); // valor ja e individual por pessoa

  const pessoas=[
    {id:'david',  nome:'David',   sal:sal.david,   comm:cvF('david'),   bonus5:0,                         bonusMeta:0,                                        tipo:'online'},
    {id:'isa',    nome:'Isa',     sal:sal.isa,     comm:cvF('isa'),     bonus5:0,                         bonusMeta:0,                                        tipo:'online'},
    {id:'mel',    nome:'Mel',     sal:sal.mel,     comm:cvF('mel'),     bonus5:0,                         bonusMeta:0,                                        tipo:'online'},
    {id:'pietra', nome:'Pietra',  sal:sal.pietra,  comm:cvF('pietra')+caF('pietra'), bonus5:0,            bonusMeta:bmF(m.atMap['pietra']?.brutoAcess||0),    tipo:'ambos'},
    {id:'anne',   nome:'Anne',    sal:sal.anne,    comm:Math.round((m.atMap['anne']?.la||0)*0.25), bonus5:Math.round(m.lAcess*0.05), bonusMeta:bmF(m.atMap['anne']?.brutoAcess||0), tipo:'presencial'},
    {id:'davi',   nome:'Davi',    sal:sal.davi,    comm:caF('davi'),    bonus5:0,                         bonusMeta:bmF(m.atMap['davi']?.brutoAcess||0),      tipo:'presencial'},
    {id:'vitinho',nome:'Vitinho', sal:sal.vitinho, comm:caF('vitinho'), bonus5:0,                         bonusMeta:bmF(m.atMap['vitinho']?.brutoAcess||0),   tipo:'presencial'},
    {id:'denilson',nome:'Denilson',sal:sal.denilson,comm:caF('denilson'),bonus5:0,                        bonusMeta:bmF(m.atMap['denilson']?.brutoAcess||0),  tipo:'presencial'},
    {id:'leo',    nome:'Leo',     sal:sal.leo,     comm:caF('leo'),     bonus5:0,                         bonusMeta:bmF(m.atMap['leo']?.brutoAcess||0),       tipo:'presencial'},
    {id:'maria',  nome:'Maria',   sal:sal.maria,   comm:cvF('maria')+caF('maria'), bonus5:0,             bonusMeta:bmF(m.atMap['maria']?.brutoAcess||0),     tipo:'ambos'},
    {id:'luana',  nome:'Luana',   sal:sal.luana,   comm:caF('luana'),   bonus5:0,                         bonusMeta:bmF(m.atMap['luana']?.brutoAcess||0),     tipo:'presencial'},
  ].map(p=>({...p, total:p.sal+p.comm+p.bonus5+p.bonusMeta+bonusColPorPessoa}));

  // Montar mensagem de cada pessoa
  function montarMsg(p){
    const lines=[];
    lines.push('📊 *Fechamento '+mesLabel+'*');
    lines.push('');
    lines.push('Olá, '+p.nome+'! Segue seu resumo:');
    lines.push('');
    if(p.sal>0) lines.push('💼 Salário fixo: *'+brl(p.sal)+'*');
    if(p.comm>0) lines.push('🏆 Comissões: *'+brl(p.comm)+'*');
    if(p.bonus5>0) lines.push('🎧 Bônus 5% acessórios: *'+brl(p.bonus5)+'*');
    if(p.bonusMeta>0) lines.push('🎯 Bônus meta individual: *'+brl(p.bonusMeta)+'*');
    if(bonusColPorPessoa>0) lines.push('🏅 Bônus meta coletiva: *'+brl(bonusColPorPessoa)+'*');
    lines.push('');
    lines.push('✅ *Total a receber: '+brl(p.total)+'*');
    return lines.join('\n');
  }

  // Criar modal com os resumos
  const existing=document.getElementById('modal-fechamento');
  if(existing) existing.remove();

  const modal=document.createElement('div');
  modal.id='modal-fechamento';
  modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px)';
  modal.innerHTML=`
    <div style="background:var(--bg2);border:1px solid var(--border2);border-radius:16px;max-width:600px;width:100%;max-height:85vh;overflow-y:auto;padding:24px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div style="font-size:15px;font-weight:700">📋 Resumos — ${mesLabel}</div>
        <button onclick="document.getElementById('modal-fechamento').remove()" style="background:none;border:none;color:var(--text3);font-size:20px;cursor:pointer;line-height:1">×</button>
      </div>
      <div style="font-size:11px;color:var(--text4);margin-bottom:16px">Clique em "Copiar" para copiar a mensagem de cada pessoa e enviar quando quiser.</div>
      ${pessoas.map(p=>`
        <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <div style="font-weight:700;color:var(--text)">${p.nome} <span style="font-size:11px;color:var(--cart)">${brl(p.total)}</span></div>
            <button onclick="navigator.clipboard.writeText(decodeURIComponent('${encodeURIComponent(montarMsg(p))}'));this.textContent='✅ Copiado!';setTimeout(()=>this.textContent='📋 Copiar',2000)" style="padding:4px 12px;background:rgba(91,139,245,.12);border:1px solid rgba(91,139,245,.3);border-radius:6px;color:var(--cart);font-size:11px;font-weight:600;cursor:pointer">📋 Copiar</button>
          </div>
          <pre style="font-size:11px;color:var(--text3);white-space:pre-wrap;margin:0;font-family:inherit;line-height:1.5">${montarMsg(p)}</pre>
        </div>`).join('')}
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e=>{ if(e.target===modal) modal.remove(); });
}

function openFunc(id){
  equipeOpenId=id;
  equipeOpenTab='info';
  equipeEditMode=false;
  document.getElementById('content').innerHTML=renderEquipe();
}

function renderFuncCard(id, lAcessTotal){
  const f = FUNC.find(x => x.id === id);
  if(!f) return '';
  const cl = COLORS[FUNC.indexOf(f) % COLORS.length];
  const meses = ['2026-01','2026-02','2026-03'];
  const mesLabels = {'2026-01':'Jan','2026-02':'Fev','2026-03':'Mar'};
  const mesesNomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  // -- Calcular dados por mes --------------------------------------------------
  function calcMes(mesStr){
    const [y,m] = mesStr.split('-').map(Number);
    const v = allVendas.filter(v => {
      const d = toBRT(v.data_saida);
      return d.getUTCFullYear()===y && d.getUTCMonth()===m-1 && v.status==='completed';
    });
    const lAcessMes = v.reduce((a,x) => a+(x._produtos?x._produtos.filter(p=>acessParaComissao(p,mesStr)).reduce((b,p)=>b+parseFloat(p.lucro||0),0):0),0);

    if(f.voKey && f.atKey){
      // Pietra -- ambos
      let units=0, pedidos=0, brutoAcess=0, lucroAcess=0, qtAcess=0;
      v.forEach(x => {
        if(matchNome((getVendaInfo(x).vendedor||'').toLowerCase(),[f.voKey])){
          units += x._produtos&&x._produtos.length>0?x._produtos.filter(p=>isPrincipal(p)).length:0;
          pedidos++;
        }
        if(matchNome((getVendaInfo(x).atendente||'').toLowerCase(),[f.atKey])){
          if(x._produtos) x._produtos.filter(p=>acessParaComissao(p,mesStr)).forEach(p=>{
            brutoAcess+=parseFloat(p.preco||0); lucroAcess+=parseFloat(p.lucro||0); qtAcess++;
          });
        }
      });
      const commVo = units<=80?units*25:80*25+(units-80)*35;
      const commAt = lucroAcess*0.25;
      const metaAt = brutoAcess>=10000?1000:brutoAcess>=6000?300:brutoAcess>=4000?100:0;
      const bonusCol = Math.round(lAcessMes*0); // bonus coletivo calculado separado
      return { units, pedidos, brutoAcess:Math.round(brutoAcess), lucroAcess:Math.round(lucroAcess), qtAcess, comm:Math.round(commVo+commAt), commVo:Math.round(commVo), commAt:Math.round(commAt), metaAt, tipo:'ambos' };

    } else if(f.tipo==='online'){
      let units=0, pedidos=0;
      v.forEach(x => {
        if(matchNome((getVendaInfo(x).vendedor||'').toLowerCase(),[f.voKey||f.id])){
          units += x._produtos&&x._produtos.length>0?x._produtos.filter(p=>isPrincipal(p)).length:0;
          pedidos++;
        }
      });
      const comm = units<=80?units*25:80*25+(units-80)*35;
      const rate = units>80?35:25;
      const metaBatida = units>80;
      return { units, pedidos, comm, rate, metaBatida, tipo:'online' };

    } else {
      let brutoAcess=0, lucroAcess=0, qtAcess=0;
      v.forEach(x => {
        if(matchNome((getVendaInfo(x).atendente||'').toLowerCase(),[f.atKey||f.id])){
          if(x._produtos) x._produtos.filter(p=>acessParaComissao(p,mesStr)).forEach(p=>{
            brutoAcess+=parseFloat(p.preco||0); lucroAcess+=parseFloat(p.lucro||0); qtAcess++;
          });
        }
      });
      const bonus5 = f.bonus ? lAcessMes*0.05 : 0;
      const comm = Math.round(lucroAcess*0.25 + bonus5);
      const meta = brutoAcess>=10000?{nivel:3,val:1000,label:'R$10k'}:brutoAcess>=6000?{nivel:2,val:300,label:'R$6k'}:brutoAcess>=4000?{nivel:1,val:100,label:'R$4k'}:{nivel:0,val:0,label:''};
      return { brutoAcess:Math.round(brutoAcess), lucroAcess:Math.round(lucroAcess), qtAcess, comm, bonus5:Math.round(bonus5), meta, tipo:'presencial' };
    }
  }

  const dadosMeses = {};
  meses.forEach(m => dadosMeses[m] = calcMes(m));
  const mesAtualStr = new Date().toISOString().slice(0,7);
  const dadosAtual = dadosMeses[mesAtualStr] || calcMes(mesAtualStr);

  // -- Mes atual via calc() para consistencia com dashboard -------------------
  const mCalc = calc();
  const lAcessCalc = mCalc.lAcess || 0;

  // -- Salario fixo ------------------------------------------------------------
  const salarios = {pietra:4500,anne:2250,denilson:2250,davi:2250,mel:1500,isa:1500,david:1500,vitinho:2250};
  const sal = salarios[f.id] || 0;

  // -- Bonus coletivo por pessoa -----------------------------------------------
  const metasDevL=_periodoNovoRegime()?[{qt:350,v:500},{qt:400,v:750},{qt:450,v:1000}]:[{qt:300,v:200},{qt:350,v:400},{qt:400,v:550}];
  const metasAcL=_periodoNovoRegime()?[{val:25000,v:200},{val:30000,v:500},{val:40000,v:750}]:[{val:20000,v:150},{val:25000,v:200},{val:30000,v:500}];
  const metaDevF=metasDevL.filter(x=>mCalc.unPrincipal>=x.qt).pop()||null;
  const metaAcF=metasAcL.filter(x=>mCalc.vendaAcess>=x.val).pop()||null;
  const bonusColTotal=(metaDevF?.v||0)+(metaAcF?.v||0);
  const bonusColPP=Math.round(bonusColTotal); // valor ja e individual por pessoa

  // -- Dados do mes atual (via calc() = consistente com dashboard) -------------
  let commAtual=0, bonusMetaAtual=0, bonus5Atual=0;
  if(f.tipo==='online'){
    const u=mCalc.voMap[f.voKey||f.id]?.units||0;
    commAtual=u<=80?u*25:80*25+(u-80)*35;
  } else if(f.voKey && f.atKey){
    const u=mCalc.voMap[f.voKey]?.units||0;
    const la=mCalc.atMap[f.atKey]?.la||0;
    const ba=mCalc.atMap[f.atKey]?.brutoAcess||0;
    commAtual=Math.round(u*25+la*0.25);
    bonusMetaAtual=ba>=10000?1000:ba>=6000?300:ba>=4000?100:0;
  } else {
    const la=mCalc.atMap[f.atKey||f.id]?.la||0;
    const ba=mCalc.atMap[f.atKey||f.id]?.brutoAcess||0;
    bonus5Atual=f.bonus?Math.round(lAcessCalc*0.05):0;
    commAtual=Math.round(la*0.25);
    bonusMetaAtual=ba>=10000?1000:ba>=6000?300:ba>=4000?100:0;
  }
  const totalReceber=sal+commAtual+bonus5Atual+bonusMetaAtual+bonusColPP;

  // -- Header ------------------------------------------------------------------
  const tipoLabel = f.tipo==='online'?'Vendedor Online':'Atendente Presencial';
  const lojaColor = f.id==='vitinho'||f.id==='davi'||f.id==='anne'||f.id==='denilson'?'var(--cart)':
                    f.id==='david'||f.id==='mel'||f.id==='isa'?'var(--cart)':'var(--cart)';

  // -- Historico -- barra de progresso visual -----------------------------------
  function barHistorico(){
    const isVO = f.tipo==='online';
    const isAmbos = f.voKey && f.atKey;

    const vals = meses.map(m => {
      const d = dadosMeses[m];
      if(!d) return 0;
      if(isVO) return d.units||0;
      if(isAmbos) return d.brutoAcess||0;
      return d.brutoAcess||0;
    });
    const maxVal = Math.max(...vals, 1);

    return meses.map((m,i) => {
      const v = vals[i];
      const pct = Math.round((v/maxVal)*100);
      const isAtual = m === mesAtualStr;
      const label = isVO ? v+' un' : brl(v);
      const trend = i>0 ? (vals[i]>vals[i-1]?'↑':'↓') : '';
      const trendColor = i>0 ? (vals[i]>vals[i-1]?'var(--green)':'var(--red)') : '';
      return `
        <div style="flex:1;text-align:center">
          <div style="font-size:10px;font-weight:700;color:${isAtual?'var(--cart)':'var(--text4)'};margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em">
            ${mesLabels[m]}${isAtual?' ●':''}
          </div>
          <div style="height:60px;background:var(--bg3);border-radius:8px;overflow:hidden;position:relative;margin-bottom:6px">
            <div style="position:absolute;bottom:0;left:0;right:0;height:${pct}%;background:${isAtual?'var(--cart)':'rgba(91,139,245,.25)'};border-radius:8px;transition:height .3s"></div>
          </div>
          <div style="font-size:11px;font-weight:700;color:${isAtual?'var(--text)':'var(--text3)'}">
            ${label}
          </div>
          <div style="font-size:10px;color:${trendColor};font-weight:700">${trend}</div>
        </div>`;
    }).join('');
  }

  // -- Bloco KPIs mes atual ----------------------------------------------------
  function kpisMesAtual(){
    const mesLabel = mesesNomes[new Date().getMonth()];

    if(f.tipo==='online'){
      const u=mCalc.voMap[f.voKey||f.id]?.units||0;
      const p=mCalc.voMap[f.voKey||f.id]?.vendas||0;
      const metaBatida=u>80;
      const rate=metaBatida?'R$35/un':'R$25/un';
      return `
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
          <div class="metric" style="padding:14px">
            <div class="metric-label">Devices</div>
            <div class="metric-value blue" style="font-size:26px">${u}</div>
            <div class="metric-sub">${p} pedidos · ${rate}</div>
          </div>
          <div class="metric" style="padding:14px">
            <div class="metric-label">Comissão</div>
            <div class="metric-value" style="font-size:22px;color:var(--green)">${brl(commAtual)}</div>
            <div class="metric-sub">${metaBatida?'<span style="color:var(--yellow)">⭐ Meta +R$35/un</span>':'faltam '+(80-u+1)+' para R$35/un'}</div>
          </div>
          <div class="metric" style="padding:14px">
            <div class="metric-label">Total a receber</div>
            <div class="metric-value" style="font-size:22px;color:var(--cart)">${brl(totalReceber)}</div>
            <div class="metric-sub">sal ${brl(sal)} + comissão</div>
          </div>
        </div>`;
    } else if(f.voKey && f.atKey){
      const u=mCalc.voMap[f.voKey]?.units||0;
      const ba=mCalc.atMap[f.atKey]?.brutoAcess||0;
      return `
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px">
          <div class="metric" style="padding:14px">
            <div class="metric-label">Devices vendidos</div>
            <div class="metric-value blue" style="font-size:24px">${u}</div>
            <div class="metric-sub">${brl(commAtual>0?u*25:0)} comissão VO</div>
          </div>
          <div class="metric" style="padding:14px">
            <div class="metric-label">Acessórios atendidos</div>
            <div class="metric-value" style="font-size:22px;color:var(--orange)">${brl(ba)}</div>
            <div class="metric-sub">${bonusMetaAtual>0?'🎯 Meta +'+brl(bonusMetaAtual):'sem meta de acess. ainda'}</div>
          </div>
          <div class="metric" style="padding:14px">
            <div class="metric-label">Comissão total</div>
            <div class="metric-value" style="font-size:22px;color:var(--green)">${brl(commAtual+bonusMetaAtual)}</div>
            <div class="metric-sub">VO + AT</div>
          </div>
          <div class="metric" style="padding:14px">
            <div class="metric-label">Total a receber</div>
            <div class="metric-value" style="font-size:22px;color:var(--cart)">${brl(totalReceber)}</div>
            <div class="metric-sub">sal ${brl(sal)} + comissões</div>
          </div>
        </div>`;
    } else {
      const ba=mCalc.atMap[f.atKey||f.id]?.brutoAcess||0;
      const la=mCalc.atMap[f.atKey||f.id]?.la||0;
      const qt=mCalc.atMap[f.atKey||f.id]?.qt||0;
      const metaNivel=ba>=10000?3:ba>=6000?2:ba>=4000?1:0;
      const metaLabels=['—','R$4k → +R$100','R$6k → +R$300','R$10k → +R$1.000'];
      const metaProxVal=[4000,6000,10000,null];
      const proxMeta=metaProxVal[metaNivel];
      const faltaMeta=proxMeta?Math.max(0,proxMeta-ba):0;
      const metaBar=proxMeta?Math.min(100,Math.round((ba/proxMeta)*100)):100;
      return `
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:10px">
          <div class="metric" style="padding:14px">
            <div class="metric-label">Bruto acessórios</div>
            <div class="metric-value" style="font-size:22px;color:var(--orange)">${brl(ba)}</div>
            <div class="metric-sub">${qt} itens atendidos</div>
          </div>
          <div class="metric" style="padding:14px">
            <div class="metric-label">Comissão</div>
            <div class="metric-value" style="font-size:22px;color:var(--green)">${brl(commAtual + (f.bonus ? bonus5Atual : 0))}</div>
            <div class="metric-sub">${f.bonus?'25% + 5% geral ('+brl(bonus5Atual)+')':'25% do lucro'}</div>
          </div>
          <div class="metric" style="padding:14px">
            <div class="metric-label">Total a receber</div>
            <div class="metric-value" style="font-size:22px;color:var(--cart)">${brl(totalReceber)}</div>
            <div class="metric-sub">sal ${brl(sal)} + comissão</div>
          </div>
        </div>
        <div style="background:var(--bg3);border-radius:10px;padding:12px 14px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <div style="font-size:11px;font-weight:700;color:var(--text4);text-transform:uppercase;letter-spacing:.06em">Meta individual</div>
            ${metaNivel>0?`<div style="font-size:11px;font-weight:700;color:var(--yellow)">🎯 Nível ${metaNivel} batida · +${brl(bonusMetaAtual)}</div>`:faltaMeta>0?`<div style="font-size:11px;color:var(--text4)">faltam ${brl(faltaMeta)} para próxima</div>`:''}
          </div>
          <div style="height:6px;background:var(--bg2);border-radius:3px;overflow:hidden">
            <div style="height:100%;width:${metaBar}%;background:${metaNivel>=2?'var(--green)':'var(--yellow)'};border-radius:3px;transition:width .5s"></div>
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:10px;color:var(--text4)">
            <span>R$0</span>
            ${metaNivel<3&&proxMeta?`<span>R$${proxMeta/1000}k</span>`:'<span style="color:var(--green)">✅ máxima</span>'}
          </div>
        </div>`;
    }
  }

  // -- PIX / Contato ------------------------------------------------------------
  const pixHtml = f.pix ? `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--bg3);border-radius:10px;margin-bottom:8px">
      <div>
        <div style="font-size:10px;color:var(--text4);font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-bottom:2px">PIX</div>
        <div style="font-size:13px;font-weight:600;color:var(--text)">${f.pix}</div>
      </div>
      <button onclick="navigator.clipboard.writeText('${f.pix}');this.textContent='✅';setTimeout(()=>this.textContent='Copiar',2000)"
        style="padding:5px 12px;background:rgba(91,139,245,.1);border:1px solid rgba(91,139,245,.25);border-radius:7px;color:var(--cart);font-size:11px;font-weight:600;cursor:pointer">Copiar</button>
    </div>` : '';

  const telHtml = f.telefone ? `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--bg3);border-radius:10px;margin-bottom:8px">
      <div>
        <div style="font-size:10px;color:var(--text4);font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-bottom:2px">Telefone</div>
        <div style="font-size:13px;font-weight:600;color:var(--text)">${f.telefone}</div>
      </div>
    </div>` : '';

  // -- Fechamento --------------------------------------------------------------
  const mesNomeAtual = mesesNomes[new Date().getMonth()]+' '+new Date().getFullYear();
  const linhasFechamento = [
    sal>0 ? ['Salário fixo', brl(sal)] : null,
    commAtual>0 ? ['Comissão', brl(commAtual)] : null,
    bonus5Atual>0 ? ['Bônus 5% acessórios', brl(bonus5Atual)] : null,
    bonusMetaAtual>0 ? ['Bônus meta individual', brl(bonusMetaAtual)] : null,
    bonusColPP>0 ? ['Bônus meta coletiva', brl(bonusColPP)] : null,
  ].filter(Boolean);

  const fechamentoHtml = `
    <div style="background:var(--bg3);border-radius:10px;overflow:hidden">
      ${linhasFechamento.map(([k,v]) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid var(--border)">
          <div style="font-size:12px;color:var(--text3)">${k}</div>
          <div style="font-size:13px;font-weight:600;color:var(--text2)">${v}</div>
        </div>`).join('')}
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:rgba(91,139,245,.06)">
        <div style="font-size:13px;font-weight:700;color:var(--text)">Total ${mesNomeAtual}</div>
        <div style="font-size:16px;font-weight:800;color:var(--cart)">${brl(totalReceber)}</div>
      </div>
    </div>`;

  // -- Mensagem de resumo ------------------------------------------------------
  function montarMsgPerfil(){
    const lines = ['📊 *'+mesNomeAtual+'*','','Olá, '+f.ap+'! Segue seu resumo:',''];
    if(sal>0) lines.push('💼 Salário: *'+brl(sal)+'*');
    if(commAtual>0) lines.push('🏆 Comissão: *'+brl(commAtual)+'*');
    if(bonus5Atual>0) lines.push('🎧 Bônus 5% acess.: *'+brl(bonus5Atual)+'*');
    if(bonusMetaAtual>0) lines.push('🎯 Bônus meta: *'+brl(bonusMetaAtual)+'*');
    if(bonusColPP>0) lines.push('🏅 Bônus coletivo: *'+brl(bonusColPP)+'*');
    lines.push('','✅ *Total: '+brl(totalReceber)+'*');
    return lines.join('\n');
  }

  return `
    <div style="max-width:680px;margin:0 auto">

      <!-- HEADER -->
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px">
        <button onclick="equipeOpenId=null;renderContent()"
          style="padding:6px 12px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;color:var(--text3);font-size:12px;cursor:pointer;flex-shrink:0">← Voltar</button>
        <div style="width:46px;height:46px;border-radius:14px;background:${cl};display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:800;color:#fff;flex-shrink:0">${f.ap.slice(0,2).toUpperCase()}</div>
        <div style="flex:1">
          <div style="font-size:17px;font-weight:800;color:var(--text)">${f.ap} <span style="font-size:12px;font-weight:400;color:var(--text4)">· ${f.nome}</span></div>
          <div style="font-size:12px;color:var(--text4);margin-top:2px">${tipoLabel}${sal>0?' · sal. '+brl(sal):'· sem salário fixo'}</div>
        </div>
        <button onclick="navigator.clipboard.writeText(decodeURIComponent('${encodeURIComponent(montarMsgPerfil())}'));this.textContent='✅ Copiado!';setTimeout(()=>this.textContent='📋 Resumo',2000)"
          style="padding:7px 14px;background:rgba(91,139,245,.1);border:1px solid rgba(91,139,245,.25);border-radius:9px;color:var(--cart);font-size:12px;font-weight:600;cursor:pointer;flex-shrink:0">📋 Resumo</button>
      </div>

      <!-- KPIs MÊS ATUAL -->
      <div style="margin-bottom:20px">
        <div style="font-size:11px;font-weight:700;color:var(--text4);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px">
          ${mesesNomes[new Date().getMonth()]} ${new Date().getFullYear()}
        </div>
        ${kpisMesAtual()}
      </div>

      <!-- HISTÓRICO -->
      <div style="margin-bottom:20px">
        <div style="font-size:11px;font-weight:700;color:var(--text4);text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px">Histórico</div>
        <div style="display:flex;gap:8px">
          ${barHistorico()}
        </div>
      </div>

      <!-- FECHAMENTO -->
      <div style="margin-bottom:20px">
        <div style="font-size:11px;font-weight:700;color:var(--text4);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px">Fechamento</div>
        ${fechamentoHtml}
      </div>

      <!-- CONTATO -->
      <div>
        <div style="font-size:11px;font-weight:700;color:var(--text4);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px">Contato</div>
        ${pixHtml}${telHtml}
        ${f.email?`<div style="padding:10px 14px;background:var(--bg3);border-radius:10px;font-size:12px;color:var(--text3)">${f.email}</div>`:''}
      </div>

    </div>`;
}


function editField(label, id, val, type='text'){
  if(type==='textarea') return `<div><div style="font-size:11px;color:var(--text3);margin-bottom:4px">${label}</div><textarea id="${id}" style="width:100%;padding:8px 12px;background:var(--bg3);border:1px solid var(--border2);border-radius:8px;color:var(--text);font-size:13px;outline:none;resize:vertical;min-height:80px;font-family:inherit">${val}</textarea></div>`;
  return `<div><div style="font-size:11px;color:var(--text3);margin-bottom:4px">${label}</div><input id="${id}" type="${type}" value="${val}" style="width:100%;padding:8px 12px;background:var(--bg3);border:1px solid var(--border2);border-radius:8px;color:var(--text);font-size:13px;outline:none"></div>`;
}

function saveEquipeExtra(id){
  const f=FUNC.find(x=>x.id===id);
  const cur=getEquipeExtra(id);
  cur.tel=document.getElementById('tel_'+id)?.value||cur.tel||'';
  cur.email=document.getElementById('email_'+id)?.value||cur.email||f.email||'';
  cur.dataInicio=document.getElementById('inicio_'+id)?.value||cur.dataInicio||'';
  cur.obs=document.getElementById('obs_'+id)?.value||cur.obs||'';
  setEquipeExtra(id,cur);
  equipeEditMode=false;
  document.getElementById('content').innerHTML=renderEquipe();
}

function addDivida(id){
  document.getElementById('form-divida-'+id).style.display='block';
}

function confirmDivida(id){
  const prod=document.getElementById('div-prod-'+id)?.value?.trim();
  const total=parseFloat(document.getElementById('div-total-'+id)?.value||0);
  const nparc=parseInt(document.getElementById('div-nparc-'+id)?.value||1);
  if(!prod||!total||!nparc)return;
  const valorParc=Math.round(total/nparc*100)/100;
  const parcelas=Array.from({length:nparc},(_,i)=>({valor:valorParc,paga:false,data:''}));
  const dividas=getDividas(id);
  dividas.push({produto:prod,total,parcelas});
  setDividas(id,dividas);
  document.getElementById('content').innerHTML=renderEquipe();
}

function removeDivida(id,di){
  const dividas=getDividas(id);
  dividas.splice(di,1);
  setDividas(id,dividas);
  document.getElementById('content').innerHTML=renderEquipe();
}

function toggleParcela(id,di,pi){
  const dividas=getDividas(id);
  dividas[di].parcelas[pi].paga=!dividas[di].parcelas[pi].paga;
  if(dividas[di].parcelas[pi].paga&&!dividas[di].parcelas[pi].data){
    dividas[di].parcelas[pi].data=new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});
  }
  setDividas(id,dividas);
  document.getElementById('content').innerHTML=renderEquipe();
}

const brl=n=>'R$'+Math.round(n).toLocaleString('pt-BR');
const ini=n=>n.split(' ').filter((_,i,a)=>i===0||i===a.length-1).map(w=>w[0]?.toUpperCase()||'').join('');

function parseObs(obs){
  if(!obs||!obs.trim()) return{};
  // Normalizar: lowercase, corrigir typos comuns, tratar ponto como separador de campo
  let raw=obs.toLowerCase().trim();
  raw=raw.replace(/\.\s+(?=(?:loja|vend|atend))/g, ', ');  // "cart. vendedor" -> "cart, vendedor"
  raw=raw.replace(/\.$/,'');                                 // remover ponto final
  raw=raw.replace(/venb?d[aeiou]?d[aeiou]?r[ao]?/g,'vendedor'); // corrigir "venbdedora" etc
  const lines=[];
  raw.split('\n').forEach(seg=>{
    seg=seg.trim();
    if(!seg) return;
    // Separar campos inline por virgula/ponto OU por espaco seguido de outra keyword
    // Ex.: "Loja cart vendedor anne atendente anne" -> ['loja cart', 'vendedor anne', 'atendente anne']
    seg.split(/(?:[,.]+\s*|\s+)(?=(?:loja|vend|atend))/).forEach(s=>{ s=s.trim(); if(s) lines.push(s); });
  });
  let loja=null,vendedor=null,atendente=null;
  lines.forEach(l=>{
    const isVend=l.includes('vend');
    const isAtend=l.includes('atend');
    if(!isVend&&!isAtend){ if(l.includes('urban'))loja='urban'; else if(l.includes('cart'))loja='cart'; }
    if(l.includes('loja')||l.startsWith('venda ')){ if(l.includes('urban'))loja='urban'; else if(l.includes('cart'))loja='cart'; }
    if(isVend&&!isAtend){
      // Aceita: vendedor, vendedora, vendendo, vendeu, vendi, vende, venda
      // Separadores: espaco, hifen, dois-pontos, ponto, virgula (qualquer combinacao)
      const mv=l.match(/vend(?:edor[ao]?|endo|eu|i\w*|e|a)?[\s\-:.,]+(.+)/);
      if(mv){
        const tokens=mv[1].trim().split(/[\s,]+/);
        const nome=tokens.map(t=>t.replace(/[-:,.]/g,'').trim()).find(t=>t.length>1);
        if(nome) vendedor=nome;
      }
    }
    if(isAtend){
      // Aceita: atendente, atendentes, atendeu, atendi, atendendo
      const ma=l.match(/atend(?:ente[s]?|eu|i\w*|endo)?[\s\-:.,]+(.+)/);
      if(ma){
        const tokens=ma[1].trim().split(/[\s,]+/);
        const nome=tokens.map(t=>t.replace(/[-:,.]/g,'').trim()).find(t=>t.length>1);
        if(nome) atendente=nome;
      }
    }
  });
  return{loja,vendedor,atendente};
}
// Helper que usa campos diretos (atendente_obs/vendedor_obs) quando disponiveis
// Fallback para parseObs(observacoes) para compatibilidade com FoneNinja
function getVendaInfo(venda){
  if(!venda) return {loja:null,vendedor:null,atendente:null};
  // Se tem campos diretos do sync (Supabase), usa eles
  if(venda.atendente_obs || venda.vendedor_obs){
    const parsed = parseObs(venda.observacoes||'');
    return {
      loja: parsed.loja,
      vendedor: venda.vendedor_obs || parsed.vendedor,
      atendente: venda.atendente_obs || parsed.atendente
    };
  }
  return parseObs(venda.observacoes||'');
}
function isAcess(m){return !m.imei_1&&!m.apple_id&&parseFloat(m.valor_estoque||0)<200;}
// Helper para normalizar ultimo_fornecedor (string no Supabase, objeto no FoneNinja)
function getFornNome(item){ return (typeof item.ultimo_fornecedor==='string' ? item.ultimo_fornecedor : item.ultimo_fornecedor?.nome) || null; }

// Item cancelado/devolvido dentro de uma venda: valor_estoque zerado mas tem imei_1.
// Importante: SEMPRE checar isCancelado() antes de classificar como principal/acessorio.
function isCancelado(m){
  return parseFloat(m.valor_estoque||0)===0 && !!m.imei_1;
}
function isPrincipal(m){
  if(isCancelado(m)) return false;
  return !!(m.apple_id)||(!!m.imei_1)||(parseFloat(m.valor_estoque||0)>=250);
}

