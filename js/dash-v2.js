// ============================================================================
// dash-v2 — dashboard reconstruído (PREVIEW gated por localStorage pc_dash_v2)
//
// Desde 20/ago/2026 é O dashboard: o legado (renderDash) foi aposentado e as
// validar com dados reais e ao vivo sem lançar; virar padrão depois é 1 linha.
//
// três seções que só existiam nele vieram pra cá. Reusa o kit UI.* e as MESMAS
// pra os números baterem. Componentes que o kit não tem (gráfico, donut, gauge)
// nascem aqui; quando promovido, o que for genérico migra para ui.js.
// Cor sempre var(--…). R$ passa por money()/gates de permissão do brief.
// ============================================================================

// v2 agora e o padrao (inclusive no celular). So volta ao antigo se o usuario
// pediu explicitamente ('0' via botao "↩ Antigo"). Reverter e trocar '!==0' por '===1'.
// O toggle "dashboard antigo" morreu junto com o legado (20/ago/2026): nao ha
// mais duas telas pra alternar. `dashV2Ativo` ficou como `true` fixo porque o
// localStorage de quem clicou uma vez em 'antigo' nao pode deixar a pessoa com
// uma tela que nao existe mais.
function dashV2Ativo(){ return true; }
function d2ToggleNotif(){ document.getElementById('d2-notif')?.classList.toggle('open'); }
function d2Abrir(fn){ document.getElementById('d2-notif')?.classList.remove('open'); if(typeof window[fn]==='function') window[fn](); }

// Tooltip compartilhado (gráfico + donut)
function _d2ShowTip(e, html){
  let t=document.getElementById('d2-tip');
  if(!t){ t=document.createElement('div'); t.id='d2-tip'; t.className='d2-tip'; document.body.appendChild(t); }
  t.innerHTML=html; t.style.display='block';
  const pad=14, w=t.offsetWidth, h=t.offsetHeight;
  let x=e.clientX+pad, y=e.clientY+pad;
  if(x+w>window.innerWidth)  x=e.clientX-w-pad;
  if(y+h>window.innerHeight) y=e.clientY-h-pad;
  t.style.left=x+'px'; t.style.top=y+'px';
}
function d2ChartTipHide(){ const t=document.getElementById('d2-tip'); if(t) t.style.display='none'; }
function d2ChartTip(e, el){
  const d=el.dataset, c=+d.c, u=+d.u, a=+d.a;
  _d2ShowTip(e, `<div class="d2-tip-h">Dia ${d.d}</div>
    <div class="d2-tip-r"><span><i style="background:var(--cart)"></i>Cart</span><b>${c}</b></div>
    <div class="d2-tip-r"><span><i style="background:var(--urban)"></i>Urban</span><b>${u}</b></div>
    <div class="d2-tip-r"><span>Aparelhos</span><b>${c+u}</b></div>
    <div class="d2-tip-r"><span>Acessórios</span><b>${brl(a)}</b></div>`);
}
function d2SliceTip(e, el){
  const d=el.dataset;
  _d2ShowTip(e, `<div class="d2-tip-h"><i style="background:${d.color};width:8px;height:8px;border-radius:2px;display:inline-block;margin-right:6px"></i>${d.l}</div>
    <div class="d2-tip-r"><span>Valor</span><b>${brl(+d.v)}</b></div>
    <div class="d2-tip-r"><span>Fatia</span><b>${d.p}%</b></div>`);
}

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
    const val=Math.max(0,sg.val), len=val/tot*C, pct=Math.round(val/tot*100);
    arcs+=`<circle class="d2-slice" cx="75" cy="75" r="${r}" fill="none" stroke="${sg.color}" stroke-width="18" stroke-dasharray="${len.toFixed(1)} ${(C-len).toFixed(1)}" stroke-dashoffset="${(-off).toFixed(1)}" transform="rotate(-90 75 75)" data-l="${sg.label||''}" data-v="${Math.round(val)}" data-p="${pct}" data-color="${sg.color}" onmousemove="d2SliceTip(event,this)" onmouseleave="d2ChartTipHide()"/>`;
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
// A IA tem nome proprio na tela: "Maju (IA)" diz de qual loja veio a venda --
// Maju atende pela Cart, Duda pela Urban.
function _d2NomeIA(k){
  return ({maju:'Maju (IA · Cart)', duda:'Duda (IA · Urban)'})[k] || (k+' (IA)');
}

function _d2RankRows(items){
  return items.map((it,i)=>`<div class="d2-rank-row${(it.loja||it.ia)?' d2-rank-loja':''}">
    <div class="d2-rank-pos">${it.loja?'🏪':it.ia?'🤖':(i+1)}</div>
    <div class="d2-rank-who"><div class="d2-av">${it.loja?'🏪':it.ia?'🤖':_d2Iniciais(it.nome)}</div><div class="d2-rank-name">${UI.esc(it.nome)}</div></div>
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

// -- Ranking de modelos vendidos (período + loja do contexto) ---------------
// Estado local do card. Nomes com prefixo _d2Mod pra não colidir no escopo
// global (scripts clássicos — ver CLAUDE.md).
let _d2ModCond='todos', _d2ModOrd='vol';

// Quebra o titulo do FoneNinja ("iPhone 15 128GB Rosa Seminovo") em condição
// (seminovo/lacrado) + nome de exibição (modelo+GB+cor, sem prefixo/sufixo).
function _d2ModParse(titulo){
  const t=String(titulo||'');
  // Sem marca de lacrado -> tratamos como seminovo (regra do dono).
  const cond = /lacrad/i.test(t) ? 'lacrado' : 'seminovo';
  const nome = t.replace(/^\s*iphone\s+/i,'').replace(/\s*(seminovo|lacrado)\s*$/i,'')
                .replace(/\s+/g,' ').trim() || t.trim() || '—';
  return {cond, nome};
}

function _d2ModelosData(){
  let vs=filterByPeriod(allVendas);
  if(currentStore!=='ambas') vs=vs.filter(v=>getVendaInfo(v).loja===currentStore);
  const map={};
  vs.forEach(v=>{
    if(v.status==='canceled') return;
    (v._produtos||[]).filter(p=>isPrincipal(p)).forEach(p=>{
      const {cond,nome}=_d2ModParse(p.titulo);
      if(_d2ModCond!=='todos' && cond!==_d2ModCond) return;
      const key=nome+'|'+cond;
      if(!map[key]) map[key]={nome, cond, un:0, bruto:0, lucro:0};
      const q=parseInt(p.quantidade||1)||1;
      const valor=parseFloat(p.preco||0), custo=parseFloat(p.valor_estoque||0);
      map[key].un+=q; map[key].bruto+=valor; map[key].lucro+=(valor-custo);
    });
  });
  const arr=Object.values(map);
  arr.sort((a,b)=> _d2ModOrd==='lucro' ? b.lucro-a.lucro : b.un-a.un);
  return arr;
}

function _d2ModelosBody(){
  const verV=podeVerValor(), verM=podeVerMargem();
  const chip=(txt,val,cur,fn)=>UI.chip(txt, val===cur, `${fn}('${val}')`);
  const tools=`<div class="d2-mod-tools">
    ${chip('Todos','todos',_d2ModCond,'d2ModCond')}
    ${chip('Seminovo','seminovo',_d2ModCond,'d2ModCond')}
    ${chip('Lacrado','lacrado',_d2ModCond,'d2ModCond')}
    <span class="d2-mod-spacer"></span>
    ${verM?`<span class="d2-mod-ord">ordenar</span>`+chip('Volume','vol',_d2ModOrd,'d2ModOrd')+chip('Lucro','lucro',_d2ModOrd,'d2ModOrd'):''}
  </div>`;
  const arr=_d2ModelosData();
  if(!arr.length) return tools+UI.vazio({titulo:'Sem aparelhos no período', texto:'Quando entrarem vendas de aparelhos, o ranking aparece aqui.'});
  const top=arr.slice(0,12);
  // Só o lacrado leva selo; sem selo = seminovo (regra do dono).
  const rows=top.map((x,i)=>{
    const tag = x.cond==='lacrado' ? '<span class="d2-mod-tag">Lacrado</span>' : '';
    const val = verM ? `<span class="d2-ok">${brl(x.lucro)}</span>` : (verV?money(x.bruto):'');
    return `<div class="d2-mod-row">
      <div class="d2-mod-pos">${i+1}</div>
      <div class="d2-mod-name">${UI.esc(x.nome)}${tag}</div>
      <div class="d2-mod-un">${x.un} un</div>
      <div class="d2-mod-val">${val}</div>
    </div>`;
  }).join('');
  return tools+rows;
}

function d2ModCond(c){ _d2ModCond=c; _d2ModRefresh(); }
function d2ModOrd(o){ _d2ModOrd=o; _d2ModRefresh(); }
function _d2ModRefresh(){ const el=document.getElementById('d2-mod-box'); if(el) el.innerHTML=_d2ModelosBody(); }

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

  // Faixas da meta -- aqui SO para os medidores (gaugeDev/gaugeAc mais abaixo).
  const metasDevList=metasColetivas().dev, metasAcList=metasColetivas().acess;
  // ⚠️ OS BONUS JA ESTAO DENTRO DE `custosMes` -- NAO SUBTRAIA DE NOVO.
  // Ate 01/set/2026 esta linha era `m.liq - m.anneBonus - custosMes` e a de baixo
  // tirava `totalBonusMetas` outra vez. Mas a pratica da casa (jul/2026 e ago/2026)
  // e lancar os bonus como custo da area Funcionarios -- em 31/07 sao tres linhas:
  // "Bonus meta coletiva", "Bonus meta individual" e "Bonus 5% acessorios Anne".
  // Resultado: o lucro liquido de julho aparecia ~R$4.000 MENOR do que e.
  //
  // A conciliacao do fechamento (equipe.js) ja cobra esses lancamentos em Custos --
  // ela e quem manda. Aqui so somamos o que esta lancado.
  //
  // ⚠️ E tinha um segundo erro junto: o coletivo era descontado pelo valor da FAIXA
  // (R$400) -- mas ele e pago CHEIO PRA CADA PESSOA. Em ago/2026 eram R$400 x 9 =
  // R$3.600. Descontar a faixa uma vez subestimava o custo em R$3.200. Os dois erros
  // andavam em direcoes opostas e se escondiam parcialmente. Quem paga e a folha
  // (equipe.js); o dashboard so soma o que esta lancado em `custos`.
  const liqReal=m.liq-custosMes;

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
    {rotulo:'Lucro líquido', valor:brl(liqReal), tom:liqReal>0?'ok':'critico', sub:'após comissões e custos'}
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
      ${_d2Donut([{val:liqAcess,color:'var(--green)',label:'Líquido'},{val:comAcess,color:'var(--text3)',label:'Comissões'},{val:custoAcess,color:'var(--border3)',label:'Custo'}], brl(m.vendaAcess), 'bruto')}
      <div class="d2-leg">
        <div class="d2-leg-item"><span class="d2-pin" style="background:var(--green)"></span><div class="d2-leg-tx"><div class="n">Líquido</div><div class="s">o que sobra pra loja</div></div><div class="d2-leg-v d2-ok">${brl(liqAcess)}</div></div>
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
  // Quem vendeu APARELHO no periodo -- as duas regras juntas, porque as duas
  // pagam: vendedor online segue a curva de 80 un, atendente que vendeu leva
  // R$25/un flat. Quem decide qual e comissaoDeAparelho() (core.js), fonte
  // unica; aqui a tela so pergunta.
  //
  // ⚠️ O atendente ficava FORA deste card. Em ago/2026 os 3 aparelhos do
  // Vitinho e 1 do Davi nao apareciam em linha nenhuma: nao caem em "Loja
  // (casa)" porque sao gente da equipe, e o ranking listava so VO. O card
  // somava 370 num mes de 373. Ele so entra se vendeu (u > 0) -- atendente
  // zerado aqui e ruido, o lugar dele e o card ao lado.
  const jaNoRank = new Set(voLabelsAll().map(([,k]) => k));
  const vends = voLabelsAll()
    .concat(atLabelsAll().filter(([,k]) => !jaNoRank.has(k) && (m.voMap[k]?.units||0) > 0))
    .map(([n,k]) => {
      const u = m.voMap[k]?.units || 0;
      return {nome:n, u, res:`${u} un`, com: verM ? brl(comissaoDeAparelho(k, u)) : '—'};
    }).sort((a,b) => b.u - a.u);
  // A IA entra como linha propria, nao dentro de "Loja (casa)": ela nao recebe
  // comissao, mas quantas vendas o atendimento automatico fechou e o numero que
  // cruza com o lead depois (Maju = Cart, Duda = Urban). Ver ehIA em core.js.
  // So aparece quem vendeu no periodo -- linha zerada so polui.
  const ias=IA_KEYS.map(k=>({k, u:m.iaMap?.[k]?.units||0}))
                   .filter(x=>x.u>0)
                   .sort((a,b)=>b.u-a.u)
                   .map(x=>({nome:_d2NomeIA(x.k), ia:true, res:`${x.u} un`, com:'—'}));
  const vendItems=vends.concat(ias, [{nome:'Loja (casa)', loja:true, res:`${m.lojaUnits||0} un`, com:'—'}]);
  const atends=atLabelsAll().map(([n,k])=>{
    const b=m.atMap[k]?.brutoAcess||0, com=(m.atMap[k]?.la||0)*0.25;
    return {nome:n, b, res: verV?brl(b):'—', com: verM?brl(com):'—'};
  }).sort((a,b)=>b.b-a.b);
  const rankRow=`<div class="d2-grid-2">
    ${UI.card({titulo:'Vendedores', sub:'produtos · comissão', corpo:_d2RankRows(vendItems)})}
    ${UI.card({titulo:'Atendentes', sub:'acessórios · comissão', corpo:_d2RankRows(atends)})}
  </div>`;

  // -- Modelos mais vendidos (ranking) -------------------------------------
  const modelosCard=UI.card({titulo:'Modelos mais vendidos', sub:'no período', corpo:
    `<div id="d2-mod-box">${_d2ModelosBody()}</div>`});

  // -- Resultado (cascata recolhível) --------------------------------------
  const resRow=(k,v,neg)=>`<div class="d2-res-row${neg?' neg':''}"><span class="k">${k}</span><span class="v">${neg?'− ':''}${v}</span></div>`;
  const resultado = verM ? UI.card({corpo:`<details class="d2-cascata">
    <summary>Resultado financeiro do período <span class="chev">▸</span></summary>
    ${resRow('Venda bruta', brl(m.bruto))}
    ${resRow('Lucro bruto (após custo merc.)', brl(m.lucro))}
    ${resRow('Comissões vendedores', brl(m.voTot), true)}
    ${resRow('Comissões atendentes', brl(m.atTot), true)}
    ${custosMes>0?resRow('Custos operacionais (inclui salários e bônus)', brl(custosMes), true):''}
    <div class="d2-res-row total"><span class="k">Lucro líquido real</span><span class="v">${brl(liqReal)}</span></div>
  </details>`}) : '';

  // -- Vendas recentes (tabela) --------------------------------------------
  const recentes=filterByPeriod(allVendas).slice()
    .sort((a,b)=>(b.data_saida||'').localeCompare(a.data_saida||'')).slice(0,8);
  const linhas=recentes.map(v=>[
    (v.data_saida||'').slice(5,10).split('-').reverse().join('/'),
    {v:UI.badge('#'+v.id,null,true)},
    UI.esc(_d2ModeloVenda(v)),
    {v:money(parseFloat(v.valor_total||0)), num:true},
    {v: verM?`<span class="d2-ok">${brl(lucroVenda(v))}</span>`:'—', num:true}
  ]);
  const salesCard=UI.card({titulo:'Vendas recentes', sub:'<span class="d2-live">● ao vivo</span>', corpo:
    UI.tabela({colunas:[{titulo:'Data'},{titulo:'Cód'},{titulo:'Aparelho'},{titulo:'Valor total',num:true},{titulo:'Lucro',num:true}], linhas,
      vazio:UI.vazio({titulo:'Sem vendas no período', texto:'As vendas do FoneNinja aparecem aqui assim que entram.'})})});

  // As tres secoes que estavam presas no dashboard legado (ver o fim do arquivo).
  const vPeriodo = _d2VendasDoPeriodo();
  const origem  = d2CardOrigem(vPeriodo);
  const lojas   = (currentStore === 'ambas') ? d2CardLojas(vPeriodo) : '';
  const margem  = d2CardMargem(vPeriodo);

  return header+kpis+chartCard+rowDonut+rankRow+modelosCard+resultado
       + lojas + origem + margem + salesCard;
}

// ===========================================================================
// AS TRES SECOES QUE SO EXISTIAM NO DASHBOARD LEGADO (20/ago/2026)
//
// O `renderDash` de render.js era o dashboard "antigo": ficava atras de um
// toggle que ninguem liga (o V2 e o padrao desde que nasceu). Com isso, TRES
// secoes estavam invisiveis pro dono na pratica -- inclusive "De onde vieram
// as vendas", que tem doc, script de atribuicao manual e teste proprio.
//
// Migradas pra ca no kit (UI.*, tokens), o legado foi aposentado, e com ele
// foram 92 estilos literais escritos na mao.
// ===========================================================================

// As vendas do periodo JA filtradas por loja -- mesma regra que o legado usava.
function _d2VendasDoPeriodo(){
  let v = filterByPeriod(allVendas);
  if(currentStore !== 'ambas')
    v = v.filter(x => { const {loja} = getVendaInfo(x); return loja === currentStore || (!loja && currentStore === 'cart'); });
  return v;
}

// -- De onde vieram as vendas ----------------------------------------------
// Le `_origem` (tabela venda_origem, populada por scripts/atribuicao/). Tres
// decisoes que a tela materializa:
//   1. So `confirmado` entra na conta de dinheiro. O nivel 5 erra 1 em cada 5
//      (medido); somar junto inflaria o Instagram e ninguem veria.
//   2. A cobertura aparece SEMPRE, porque isso aqui e piso e nao total -- a
//      falta pesa mais no Instagram, entao comparar canais e legitimo mas
//      afirmar "o Meta Ads deu X" nao e.
//   3. Venda nao avaliada e venda sem lead sao contadas separado.
// Sem nenhuma venda avaliada no periodo a secao nao aparece.
function d2CardOrigem(v){
  const vOrig = v.filter(x => x._origem);
  if(!vOrig.length) return '';

  const oConf = vOrig.filter(x => x._origem.confianca === 'confirmado');
  const oProv = vOrig.filter(x => x._origem.confianca === 'provavel').length;
  const oSem  = vOrig.filter(x => x._origem.confianca === 'sem_origem').length;

  const porOrigem = {};
  oConf.forEach(x => {
    const k = x._origem.origem || 'Sem origem gravada no lead';
    const o = porOrigem[k] || (porOrigem[k] = {vendas:0, bruto:0, lucro:0});
    o.vendas++; o.bruto += parseFloat(x.valor_total||0); o.lucro += lucroVenda(x);
  });

  const comMargem = podeVerMargem();
  const colunas = [{titulo:'Origem'},{titulo:'Vendas',num:true},{titulo:'Receita',num:true}];
  if(comMargem) colunas.push({titulo:'Lucro',num:true},{titulo:'Margem',num:true});
  const linhas = Object.entries(porOrigem).sort((a,b) => b[1].bruto - a[1].bruto).map(([nome,o]) => {
    const mg = o.bruto > 0 ? Math.round(o.lucro/o.bruto*100) : 0;
    const cel = [UI.esc(nome), {v:o.vendas, num:true}, {v:money(o.bruto), num:true}];
    if(comMargem) cel.push({v:brl(o.lucro), num:true, classe:'ok'}, {v:mg+'%', num:true});
    return cel;
  });

  const naoAval = v.length - vOrig.length;
  const pctCob = v.length > 0 ? Math.round((oConf.length + oProv)/v.length*100) : 0;
  const notas = [
    `${oConf.length + oProv} de ${v.length} vendas do período com origem identificada (${pctCob}%)`,
    oProv > 0 ? `${oProv} provável${oProv>1?'is':''} fora da tabela — o nível 5 aponta a pessoa errada 1 vez em 5` : '',
    oSem > 0 ? `${oSem} avaliada${oSem>1?'s':''} sem lead encontrado` : '',
    naoAval > 0 ? `${naoAval} ainda não avaliada${naoAval>1?'s':''}` : '',
  ].filter(Boolean);

  return UI.card({
    titulo:'De onde vieram as vendas',
    sub:'só o que foi confirmado',
    corpo: UI.tabela({colunas, linhas, vazio: UI.vazio({ico:'🔗',
        titulo:'Nenhuma venda confirmada no período',
        texto:'As vendas do período foram avaliadas, mas nenhuma teve lead confirmado.'})})
      + `<div class="d2-rodape">${notas.join(' · ')}</div>`
  });
}

// -- Cart vs Urban -----------------------------------------------------------
// Duas lojas, dois donos, dois resultados (ver [[societario-cart-urban]]): o
// consolidado nao e o resultado de ninguem.
function d2CardLojas(v){
  const verM = podeVerMargem();
  const resumo = (arr, nome, tom) => {
    const bruto = arr.reduce((a,x) => a + parseFloat(x.valor_total||0), 0);
    const lucro = somaLucro(arr);
    const un = arr.reduce((a,x) => a + (x._produtos ? x._produtos.filter(p => isPrincipal(p)).length : 0), 0);
    return { nome, tom, vendas:arr.length, un, bruto, lucro,
             margem: bruto > 0 ? Math.round(lucro/bruto*100) : 0,
             ticket: arr.length > 0 ? Math.round(bruto/arr.length) : 0 };
  };
  const lojas = [
    resumo(v.filter(x => getVendaInfo(x).loja === 'cart'),  'Phone Cart', 'cart'),
    resumo(v.filter(x => getVendaInfo(x).loja === 'urban'), 'Urban',      'urban'),
  ];
  const semLoja = v.filter(x => !getVendaInfo(x).loja).length;

  const bloco = l => `
    <div class="d2-loja" data-tom="${l.tom}">
      <div class="d2-loja-nome">${l.nome}</div>
      <div class="d2-loja-grid">
        <span><i>pedidos</i><b>${l.vendas}</b></span>
        <span><i>produtos</i><b>${l.un}</b></span>
        <span><i>bruto</i><b>${money(l.bruto)}</b></span>
        ${verM ? `<span><i>lucro</i><b class="ok">${brl(l.lucro)}</b></span>
        <span><i>margem</i><b class="${l.margem < 15 ? 'alerta' : 'ok'}">${l.margem}%</b></span>` : ''}
        <span><i>ticket</i><b>${money(l.ticket)}</b></span>
      </div>
    </div>`;

  return UI.card({
    titulo:'Cart vs Urban',
    sub:'o consolidado não é o resultado de ninguém',
    corpo: `<div class="d2-lojas">${lojas.map(bloco).join('')}</div>`
      + (semLoja ? `<div class="d2-rodape">⚠ ${semLoja} venda${semLoja>1?'s':''} sem loja identificada na observação</div>` : '')
  });
}

// -- Margem: a distribuicao e as piores do periodo ---------------------------
// So pra quem ve margem, e so quando ha o que mostrar.
function d2CardMargem(v){
  if(!podeVerMargem()) return '';
  const linhas = v.map(x => {
    const tot = parseFloat(x.valor_total||0), luc = lucroVenda(x);
    const prods = x._produtos ? x._produtos.filter(p => isPrincipal(p)) : [];
    const {vendedor, loja} = getVendaInfo(x);
    return { id:x.id, tot, luc, mg: tot > 0 ? Math.round(luc/tot*1000)/10 : 0,
             vendedor, loja, data:x.data_saida,
             modelo: prods.length ? (prods[0].titulo||'').replace(/^iPhone\s+/i,'').replace(/\s*Seminovo\s*$/i,' SN').trim() : '' };
  }).filter(x => x.tot > 500);

  const faixas = [
    { l:'negativa', tom:'critico', n: linhas.filter(x => x.mg < 0).length },
    { l:'até 10%',  tom:'alerta',  n: linhas.filter(x => x.mg >= 0  && x.mg < 10).length },
    { l:'10–15%',   tom:'alerta',  n: linhas.filter(x => x.mg >= 10 && x.mg < 15).length },
    { l:'15–20%',   tom:'',        n: linhas.filter(x => x.mg >= 15 && x.mg < 20).length },
    { l:'acima de 20%', tom:'ok',  n: linhas.filter(x => x.mg >= 20).length },
  ];
  const ruins = linhas.filter(x => x.mg < 10).sort((a,b) => a.mg - b.mg);
  if(!ruins.length && !linhas.length) return '';

  const piores = ruins.slice(0,5).map(x => {
    const dia = x.data ? x.data.slice(5,10).split('-').reverse().join('/') : '—';
    return [
      {v: UI.badge(x.mg+'%', x.mg < 0 ? 'critico' : 'alerta')},
      UI.esc(x.modelo || '—'),
      `<span class="d2-sub">${dia} · ${UI.esc(x.vendedor||'—')} · ${UI.esc(x.loja||'—')}</span>`,
      {v: money(x.tot), num:true},
      {v: `<span class="${x.luc < 0 ? 'ruim' : ''}">${brl(x.luc)}</span>`, num:true},
    ];
  });

  return UI.card({
    titulo: ruins.length ? 'Margem — e as piores do período' : 'Distribuição de margem',
    sub: ruins.length ? ruins.length + ' venda' + (ruins.length>1?'s':'') + ' abaixo de 10%' : 'nenhuma abaixo de 10%',
    corpo: `<div class="d2-faixas">${faixas.map(f =>
        `<span class="d2-faixa" data-tom="${f.tom}"><b>${f.n}</b><i>${f.l}</i></span>`).join('')}</div>`
      + (piores.length ? UI.tabela({
          colunas:[{titulo:'Margem'},{titulo:'Aparelho'},{titulo:'Quando'},{titulo:'Valor',num:true},{titulo:'Lucro',num:true}],
          linhas: piores }) : '')
  });
}
