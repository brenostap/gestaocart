// ============================================================================
// dash-v2 — dashboard reconstruído (PREVIEW gated por localStorage pc_dash_v2)
//
// Não substitui renderDash. renderContent decide qual mostrar. Assim dá pra
// validar com dados reais e ao vivo sem lançar; virar padrão depois é 1 linha.
//
// Reusa o kit UI.* e as MESMAS expressões financeiras de renderDash (calc()),
// pra os números baterem. Componentes que o kit não tem (gráfico, donut, gauge)
// nascem aqui; quando promovido, o que for genérico migra para ui.js.
// Cor sempre var(--…). R$ passa por money()/gates de permissão do brief.
// ============================================================================

function dashV2Ativo(){ try{ return localStorage.getItem('pc_dash_v2')==='1'; }catch(e){ return false; } }
function toggleDashV2(){
  try{ localStorage.setItem('pc_dash_v2', dashV2Ativo()?'0':'1'); }catch(e){}
  if(typeof renderContent==='function') renderContent();
  document.querySelector('.main')?.scrollTo({top:0});
}
function d2ToggleNotif(){ document.getElementById('d2-notif')?.classList.toggle('open'); }
function d2Abrir(fn){ document.getElementById('d2-notif')?.classList.remove('open'); if(typeof window[fn]==='function') window[fn](); }

// Tooltip do gráfico (mostra os números do dia ao passar o mouse)
function d2ChartTip(e, el){
  let t=document.getElementById('d2-tip');
  if(!t){ t=document.createElement('div'); t.id='d2-tip'; t.className='d2-tip'; document.body.appendChild(t); }
  const d=el.dataset, c=+d.c, u=+d.u, a=+d.a;
  t.innerHTML=`<div class="d2-tip-h">Dia ${d.d}</div>
    <div class="d2-tip-r"><span><i style="background:var(--cart)"></i>Cart</span><b>${c}</b></div>
    <div class="d2-tip-r"><span><i style="background:var(--urban)"></i>Urban</span><b>${u}</b></div>
    <div class="d2-tip-r"><span>Aparelhos</span><b>${c+u}</b></div>
    <div class="d2-tip-r"><span>Acessórios</span><b>${brl(a)}</b></div>`;
  t.style.display='block';
  const pad=14, w=t.offsetWidth, h=t.offsetHeight;
  let x=e.clientX+pad, y=e.clientY+pad;
  if(x+w>window.innerWidth)  x=e.clientX-w-pad;
  if(y+h>window.innerHeight) y=e.clientY-h-pad;
  t.style.left=x+'px'; t.style.top=y+'px';
}
function d2ChartTipHide(){ const t=document.getElementById('d2-tip'); if(t) t.style.display='none'; }

// -- SVG: gráfico barras (Cart+Urban) + linha (acessório R$) -----------------
function _d2Chart(serie){
  if(!serie.length) return UI.vazio({titulo:'Sem vendas no período', texto:'Quando entrarem vendas, o gráfico aparece aqui.'});
  const W=900,H=250,padL=40,padR=48,padT=14,padB=32;
  const plotW=W-padL-padR, plotH=H-padT-padB, n=serie.length, slot=plotW/n, base=padT+plotH;
  const uPeak=Math.max(1,...serie.map(d=>d.cart+d.urban));
  const rPeak=Math.max(1,...serie.map(d=>d.acess));
  const uMax=Math.max(10,Math.ceil(uPeak/10)*10);
  const rMax=Math.max(1000,Math.ceil(rPeak/1000)*1000);
  const cx=i=>padL+slot*i+slot/2;
  const yR=v=>base-(v/rMax)*plotH;
  const bw=Math.min(20,slot*0.5);
  let s='';
  for(let g=0;g<=3;g++){
    const y=base-(g/3)*plotH;
    s+=`<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W-padR}" y2="${y.toFixed(1)}" stroke="var(--border)" stroke-width="1"/>`;
    s+=`<text x="${padL-8}" y="${(y+3).toFixed(1)}" fill="var(--text4)" font-size="10" text-anchor="end">${Math.round(uMax*g/3)}</text>`;
    s+=`<text x="${W-padR+8}" y="${(y+3).toFixed(1)}" fill="var(--text4)" font-size="10" text-anchor="start">${Math.round(rMax*g/3/1000)}k</text>`;
  }
  for(let i=0;i<n;i++){
    const d=serie[i], last=i===n-1;
    const cH=(d.cart/uMax)*plotH, uH=(d.urban/uMax)*plotH, x=cx(i)-bw/2;
    s+=`<rect x="${x.toFixed(1)}" y="${(base-cH).toFixed(1)}" width="${bw.toFixed(1)}" height="${cH.toFixed(1)}" rx="3" fill="var(--cart)" opacity="${last?1:0.8}"/>`;
    s+=`<rect x="${x.toFixed(1)}" y="${(base-cH-uH).toFixed(1)}" width="${bw.toFixed(1)}" height="${uH.toFixed(1)}" rx="3" fill="var(--urban)" opacity="${last?1:0.8}"/>`;
    if(n<=20||i%2===0) s+=`<text x="${cx(i).toFixed(1)}" y="${H-12}" fill="var(--text4)" font-size="10" text-anchor="middle">${(d.dia||'').slice(8)}</text>`;
  }
  let path='';
  for(let i=0;i<n;i++) path+=(i?'L':'M')+cx(i).toFixed(1)+','+yR(serie[i].acess).toFixed(1);
  s+=`<path d="${path}" fill="none" stroke="var(--text2)" stroke-width="2"/>`;
  for(let i=0;i<n;i++) s+=`<circle cx="${cx(i).toFixed(1)}" cy="${yR(serie[i].acess).toFixed(1)}" r="${i===n-1?4:2.5}" fill="var(--bg2)" stroke="var(--text2)" stroke-width="2"/>`;
  // áreas invisíveis de hover (coluna do dia) -> tooltip
  for(let i=0;i<n;i++){ const d=serie[i], x=padL+slot*i;
    s+=`<rect class="d2-hit" x="${x.toFixed(1)}" y="${padT}" width="${slot.toFixed(1)}" height="${plotH.toFixed(1)}" data-d="${(d.dia||'').slice(8)}" data-c="${d.cart}" data-u="${d.urban}" data-a="${Math.round(d.acess)}" onmousemove="d2ChartTip(event,this)" onmouseleave="d2ChartTipHide()"></rect>`;
  }
  return `<svg class="d2-chart" viewBox="0 0 ${W} ${H}">${s}</svg>`;
}

// -- SVG: donut de composição -----------------------------------------------
function _d2Donut(segs, centroV, centroL){
  const r=58, C=2*Math.PI*r;
  const tot=segs.reduce((a,x)=>a+Math.max(0,x.val),0)||1;
  let off=0, arcs=`<circle cx="75" cy="75" r="${r}" fill="none" stroke="var(--bg4)" stroke-width="18"/>`;
  segs.forEach(sg=>{
    const len=Math.max(0,sg.val)/tot*C;
    arcs+=`<circle cx="75" cy="75" r="${r}" fill="none" stroke="${sg.color}" stroke-width="18" stroke-dasharray="${len.toFixed(1)} ${(C-len).toFixed(1)}" stroke-dashoffset="${(-off).toFixed(1)}" transform="rotate(-90 75 75)"/>`;
    off+=len;
  });
  return `<div class="d2-donut"><svg width="150" height="150" viewBox="0 0 150 150">${arcs}</svg>
    <div class="d2-donut-c"><b>${centroV}</b><span>${centroL}</span></div></div>`;
}

// -- SVG: gauge meia-lua -----------------------------------------------------
function _d2Gauge(cur, max, color){
  const pct=Math.max(0,Math.min(1, max>0?cur/max:0));
  const full=298.5; // comprimento do semicírculo A95
  return `<svg width="230" height="128" viewBox="0 0 230 128">
    <path d="M20,115 A95,95 0 0 1 210,115" fill="none" stroke="var(--bg4)" stroke-width="16" stroke-linecap="round"/>
    <path d="M20,115 A95,95 0 0 1 210,115" fill="none" stroke="${color}" stroke-width="16" stroke-linecap="round" stroke-dasharray="${(full*pct).toFixed(1)} 400"/>
  </svg>`;
}

// -- Série diária p/ o gráfico ----------------------------------------------
function _d2SerieDiaria(){
  const v=filterByPeriod(allVendas);
  const map={};
  v.forEach(x=>{
    const d=(x.data_saida||'').slice(0,10); if(!d) return;
    const {loja}=getVendaInfo(x);
    if(!map[d]) map[d]={dia:d,cart:0,urban:0,acess:0};
    const prods=x._produtos||[];
    const princ=prods.filter(p=>isPrincipal(p)).length;
    if(loja==='urban') map[d].urban+=princ; else map[d].cart+=princ;
    map[d].acess += prods.filter(p=>!isPrincipal(p)&&!isCancelado(p)).reduce((a,p)=>a+parseFloat(p.preco||0),0);
  });
  return Object.keys(map).sort().map(k=>map[k]);
}

// -- Ranking: monta as linhas -----------------------------------------------
function _d2Iniciais(nome){ return (nome||'?').trim().slice(0,2).toUpperCase(); }
function _d2RankRows(items){
  return items.map((it,i)=>`<div class="d2-rank-row${it.loja?' d2-rank-loja':''}">
    <div class="d2-rank-pos">${it.loja?'🏪':(i+1)}</div>
    <div class="d2-rank-who"><div class="d2-av">${it.loja?'🏪':_d2Iniciais(it.nome)}</div><div class="d2-rank-name">${UI.esc(it.nome)}</div></div>
    <div class="d2-rank-res">${it.res}</div>
    <div class="d2-rank-com">${it.com}</div>
  </div>`).join('');
}

function _d2ModeloVenda(v){
  const prods=(v._produtos||[]);
  const princ=prods.filter(p=>isPrincipal(p));
  const arr=princ.length?princ:prods.filter(p=>!isPrincipal(p));
  return arr.map(p=>(p.titulo||'').replace(/^iPhone\s+/i,'').replace(/\s*Seminovo\s*$/i,' SN').trim())
    .filter(Boolean).slice(0,2).join(' + ') || '—';
}

// ===========================================================================
// RENDER
// ===========================================================================
function renderDashV2(){
  const m=calc();
  const verV=podeVerValor(), verM=podeVerMargem();
  const mg=Math.round(m.bruto>0?m.lucro/m.bruto*100:0);

  // -- custos operacionais do período (idêntico a renderDash) ---------------
  const custosMes=(()=>{
    const cc=filterCustoPeriod(getCustos());
    const vf=filterByPeriod(allVendas);
    const uc=vf.filter(v=>v.loja==='cart').reduce((a,v)=>a+(v._produtos&&v._produtos.length>0?v._produtos.filter(p=>isPrincipal(p)).length:0),0);
    const uu=vf.filter(v=>v.loja==='urban').reduce((a,v)=>a+(v._produtos&&v._produtos.length>0?v._produtos.filter(p=>isPrincipal(p)).length:0),0);
    const ut=uc+uu||1;
    return cc.reduce((a,c)=>{
      const val=parseFloat(c.valor||0);
      if(c.loja==='ambas'){
        if(currentStore==='cart')  return a+val*(uc/ut);
        if(currentStore==='urban') return a+val*(uu/ut);
        return a+val;
      }
      if(currentStore!=='ambas' && c.loja && c.loja!==currentStore) return a;
      return a+val;
    },0);
  })();

  // -- metas + bônus (idêntico a renderDash) --------------------------------
  const metasDevList=_periodoNovoRegime()?[{qt:350,bonus:500},{qt:400,bonus:750},{qt:450,bonus:1000}]:[{qt:300,bonus:200},{qt:350,bonus:400},{qt:400,bonus:550}];
  const metasAcList=_periodoNovoRegime()?[{val:25000,bonus:200},{val:30000,bonus:500},{val:40000,bonus:750}]:[{val:20000,bonus:150},{val:25000,bonus:200},{val:30000,bonus:500}];
  const metaDevBatida=metasDevList.filter(x=>m.unPrincipal>=x.qt).pop()||null;
  const metaAcBatida=metasAcList.filter(x=>m.vendaAcess>=x.val).pop()||null;
  const bonusMetaColetiva=(metaDevBatida?.bonus||0)+(metaAcBatida?.bonus||0);
  const calcBonusMetaAt=b=>b>=10000?1000:b>=6000?300:b>=4000?100:0;
  let totalBonusMetaAt=0;
  ['vitinho','davi','anne','pietra','denilson'].forEach(k=>{ totalBonusMetaAt+=calcBonusMetaAt(m.atMap[k]?.brutoAcess||0); });
  const totalBonusMetas=bonusMetaColetiva+totalBonusMetaAt;
  const liqReal=m.liq-m.anneBonus-custosMes;
  const liqComMetas=liqReal-totalBonusMetas;

  // -- HEADER + sino --------------------------------------------------------
  const nPend=getPendentes().length;
  const nInc=getVendasIncompletas().filter(v=>v.status==='completed').length;
  const nSem=getVendasSemDeviceDetalhado().length;
  const nTotal=nPend+nInc+nSem;
  const notifRow=(ic,fn,a,b)=>`<button class="d2-notif-item" onclick="d2Abrir('${fn}')"><span class="d2-notif-ic">${ic}</span><span class="d2-notif-tx"><span class="a">${a}</span><span class="b">${b}</span></span><span class="d2-notif-go">Ver →</span></button>`;
  const notifBody = nTotal>0 ? [
    nPend>0?notifRow('⏳','verPendentes',`${nPend} pendente${nPend>1?'s':''}`,'Não contabilizadas nos totais'):'',
    nInc>0?notifRow('⚠','abrirModalIncompletas',`${nInc} com obs incompleta${nInc>1?'s':''}`,'Corrija no FoneNinja'):'',
    nSem>0?notifRow('🔍','abrirModalSemDevice',`${nSem} sem device`,'Produto não vinculado'):''
  ].join('') : '<div class="d2-notif-empty">Tudo certo — nada faltando no período.</div>';

  const header=`<div class="d2-head">
    <div><div class="pg-kicker">Visão geral</div><h1 class="pg-title">Dashboard</h1></div>
    <div class="d2-actions">
      <button class="d2-bell" onclick="d2ToggleNotif()" aria-label="Alertas">🔔${nTotal>0?`<span class="d2-bell-dot">${nTotal>9?'9+':nTotal}</span>`:''}</button>
      ${UI.btn('↩ Antigo',{onclick:'toggleDashV2()',variante:'sutil',sm:true,titulo:'Voltar ao dashboard atual'})}
      ${UI.btn('↻ Atualizar',{onclick:'reloadData()'})}
      <div class="d2-notif" id="d2-notif">
        <div class="d2-notif-h"><b>Vendas faltando info</b><span>${nTotal} no período</span></div>
        ${notifBody}
      </div>
    </div>
  </div>`;

  // -- KPIs (UI.kpis) -------------------------------------------------------
  const ticket=m.cnt>0?Math.round(m.bruto/m.cnt):0;
  const listaKpi=[{rotulo:'Produtos vendidos', valor:m.unPrincipal.toLocaleString('pt-BR'), tom:'marca', sub:`${m.cnt} pedidos`}];
  if(verV) listaKpi.push({rotulo:'Venda bruta', valor:money(m.bruto), sub:verM?`${mg}% margem bruta`:`ticket ${money(ticket)}`});
  if(verM) listaKpi.push(
    {rotulo:'Lucro bruto', valor:brl(m.lucro), tom:'ok', sub:'após custo da mercadoria'},
    {rotulo:'Lucro líquido', valor:brl(liqComMetas), tom:liqComMetas>0?'ok':'critico', sub:'após comissões e custos'}
  );
  const kpis=UI.kpis(listaKpi);

  // -- Gráfico Vendas do período -------------------------------------------
  const serie=_d2SerieDiaria();
  const cartU=serie.reduce((a,d)=>a+d.cart,0), urbanU=serie.reduce((a,d)=>a+d.urban,0);
  const tiles=`<div class="d2-tiles">
    <div class="d2-tile"><div class="d2-tile-l">Aparelhos</div><div class="d2-tile-v">${m.unPrincipal}</div></div>
    <div class="d2-tile"><div class="d2-tile-l"><span class="d2-pin" style="background:var(--cart)"></span>Cart</div><div class="d2-tile-v">${cartU}</div></div>
    <div class="d2-tile"><div class="d2-tile-l"><span class="d2-pin" style="background:var(--urban)"></span>Urban</div><div class="d2-tile-v">${urbanU}</div></div>
    ${verV?`<div class="d2-tile"><div class="d2-tile-l">Acessórios (bruto)</div><div class="d2-tile-v">${brl(m.vendaAcess)}</div></div>`:''}
  </div>`;
  const legenda=`<div class="d2-legend"><span><span class="d2-pin" style="background:var(--cart)"></span>Cart</span><span><span class="d2-pin" style="background:var(--urban)"></span>Urban</span>${verV?'<span><span class="d2-line"></span>Acessórios R$</span>':''}</div>`;
  const chartCard=UI.card({titulo:'Vendas do período', acao:legenda, corpo:tiles+_d2Chart(serie)});

  // -- Donut acessório + Gauges de meta ------------------------------------
  const custoAcess=m.vendaAcess-m.lAcess;
  const comAcess=m.atTot+m.anneBonus;
  const liqAcess=m.lAcess-m.atTot-m.anneBonus;
  const donutCard = verM ? UI.card({titulo:'Acessórios', sub:'bruto '+brl(m.vendaAcess), corpo:`
    <div class="d2-donut-wrap">
      ${_d2Donut([{val:liqAcess,color:'var(--green)'},{val:comAcess,color:'var(--text3)'},{val:custoAcess,color:'var(--border3)'}], brl(m.vendaAcess), 'bruto')}
      <div class="d2-leg">
        <div class="d2-leg-item"><span class="d2-pin" style="background:var(--green)"></span><div class="d2-leg-tx"><div class="n">Líquido</div><div class="s">o que sobra pra loja</div></div><div class="d2-leg-v" style="color:var(--green)">${brl(liqAcess)}</div></div>
        <div class="d2-leg-item"><span class="d2-pin" style="background:var(--text3)"></span><div class="d2-leg-tx"><div class="n">Comissões</div><div class="s">atendentes + Anne</div></div><div class="d2-leg-v">${brl(comAcess)}</div></div>
        <div class="d2-leg-item"><span class="d2-pin" style="background:var(--border3)"></span><div class="d2-leg-tx"><div class="n">Custo</div><div class="s">mercadoria</div></div><div class="d2-leg-v">${brl(custoAcess)}</div></div>
      </div>
    </div>`}) : '';

  const devMax=metasDevList[metasDevList.length-1].qt;
  const devProx=metasDevList.find(x=>m.unPrincipal<x.qt);
  const gaugeDev=UI.card({titulo:'Meta de produtos', sub:'período', corpo:`
    <div class="d2-gauge-wrap">${_d2Gauge(m.unPrincipal, devMax, 'var(--cart)')}
      <div class="d2-gauge-val"><b>${m.unPrincipal}</b><span>${devProx?'de '+devProx.qt+' · faltam '+(devProx.qt-m.unPrincipal):'todas as faixas batidas'}</span></div>
    </div>
    <div class="d2-gauge-scale"><span>0</span><span>${devMax}</span></div>
    <div class="d2-gauge-bonus">${devProx?'bônus +'+brl(devProx.bonus)+' na próxima faixa':'🏆 todas batidas'}</div>`});

  const acMax=metasAcList[metasAcList.length-1].val;
  const acProx=metasAcList.find(x=>m.vendaAcess<x.val);
  const gaugeAc = verV ? UI.card({titulo:'Meta de acessórios', sub:'período', corpo:`
    <div class="d2-gauge-wrap">${_d2Gauge(m.vendaAcess, acMax, 'var(--cart)')}
      <div class="d2-gauge-val"><b>${brl(m.vendaAcess)}</b><span>${acProx?'de '+brl(acProx.val)+' · faltam '+brl(acProx.val-m.vendaAcess):'todas as faixas batidas'}</span></div>
    </div>
    <div class="d2-gauge-scale"><span>R$0</span><span>${brl(acMax)}</span></div>
    <div class="d2-gauge-bonus">${acProx?'bônus +'+brl(acProx.bonus)+' na próxima faixa':'🏆 todas batidas'}</div>`}) : '';

  const rowDonut = donutCard
    ? `<div class="d2-grid-donut">${donutCard}${gaugeDev}${gaugeAc}</div>`
    : `<div class="d2-grid-2">${gaugeDev}${gaugeAc||''}</div>`;

  // -- Ranking: Vendedores | Atendentes ------------------------------------
  const calcCommVo=u=>u<=80?u*25:80*25+(u-80)*35;
  const vends=[['Isa','isa'],['Mel','mel'],['David','david'],['Pietra','pietra']].map(([n,k])=>{
    const u=m.voMap[k]?.units||0;
    return {nome:n, u, res:`${u} un`, com: verM?brl(calcCommVo(u)):'—'};
  }).sort((a,b)=>b.u-a.u);
  const vendItems=vends.concat([{nome:'Loja (casa)', loja:true, res:`${m.lojaUnits||0} un`, com:'—'}]);
  const atends=[['Vitinho','vitinho'],['Davi','davi'],['Anne','anne'],['Pietra','pietra'],['Denilson','denilson']].map(([n,k])=>{
    const b=m.atMap[k]?.brutoAcess||0, com=(m.atMap[k]?.la||0)*0.25;
    return {nome:n, b, res: verV?brl(b):'—', com: verM?brl(com):'—'};
  }).sort((a,b)=>b.b-a.b);
  const rankRow=`<div class="d2-grid-2">
    ${UI.card({titulo:'Vendedores', sub:'produtos · comissão', corpo:_d2RankRows(vendItems)})}
    ${UI.card({titulo:'Atendentes', sub:'acessórios · comissão', corpo:_d2RankRows(atends)})}
  </div>`;

  // -- Resultado (cascata recolhível) --------------------------------------
  const resRow=(k,v,neg)=>`<div class="d2-res-row${neg?' neg':''}"><span class="k">${k}</span><span class="v">${neg?'− ':''}${v}</span></div>`;
  const resultado = verM ? UI.card({corpo:`<details class="d2-cascata">
    <summary>Resultado financeiro do período <span class="chev">▸</span></summary>
    ${resRow('Venda bruta', brl(m.bruto))}
    ${resRow('Lucro bruto (após custo merc.)', brl(m.lucro))}
    ${resRow('Comissões vendedores', brl(m.voTot), true)}
    ${resRow('Comissões atendentes', brl(m.atTot), true)}
    ${resRow('Bônus Anne (5% acessórios)', brl(m.anneBonus), true)}
    ${custosMes>0?resRow('Custos operacionais', brl(custosMes), true):''}
    ${totalBonusMetas>0?resRow('Bônus metas', brl(totalBonusMetas), true):''}
    <div class="d2-res-row total"><span class="k">Lucro líquido real</span><span class="v">${brl(liqComMetas)}</span></div>
  </details>`}) : '';

  // -- Vendas recentes (tabela) --------------------------------------------
  const recentes=filterByPeriod(allVendas).slice()
    .sort((a,b)=>(b.data_saida||'').localeCompare(a.data_saida||'')).slice(0,8);
  const linhas=recentes.map(v=>[
    (v.data_saida||'').slice(5,10).split('-').reverse().join('/'),
    {v:UI.badge('#'+v.id,null,true)},
    UI.esc(_d2ModeloVenda(v)),
    {v:money(parseFloat(v.valor_total||0)), num:true},
    {v: verM?`<span style="color:var(--green);font-weight:600">${brl(parseFloat(v.lucro||0))}</span>`:'—', num:true}
  ]);
  const salesCard=UI.card({titulo:'Vendas recentes', sub:'<span class="d2-live">● ao vivo</span>', corpo:
    UI.tabela({colunas:[{titulo:'Data'},{titulo:'Cód'},{titulo:'Aparelho'},{titulo:'Valor total',num:true},{titulo:'Lucro',num:true}], linhas,
      vazio:UI.vazio({titulo:'Sem vendas no período', texto:'As vendas do FoneNinja aparecem aqui assim que entram.'})})});

  return header+kpis+chartCard+rowDonut+rankRow+resultado+salesCard;
}
