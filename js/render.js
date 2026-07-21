function calc(){
  let v=filterByPeriod(allVendas);
  if(currentStore!=='ambas')v=v.filter(x=>{const {loja}=getVendaInfo(x);return loja===currentStore;});
  // ids/mv/ac/pr already defined above

  const bruto=v.reduce((a,x)=>a+parseFloat(x.valor_total||0),0);
  const lucro=v.reduce((a,x)=>a+parseFloat(x.lucro||0),0);
  // Usar _produtos (endpoint individual) quando disponivel; fallback para movimentacoes
  const ids=new Set(v.map(x=>x.id));
  const allProdutosMap={};
  v.forEach(x=>{
    if(x._produtos&&x._produtos.length>0){
      allProdutosMap[x.id]=x._produtos;
    }
  });
  const mvPeriod=allMovs.filter(m=>ids.has(m.parent_id)&&!allProdutosMap[m.parent_id]);
  // Combinar -- injetar parent_id nos produtos de _produtos para compatibilidade com atMap
  const isCancelado=(p)=>parseFloat(p.valor_estoque||0)===0 && (p.imei_1 || parseFloat(p.preco||0)>=200);
  const acPeriod=[
    ...v.filter(x=>allProdutosMap[x.id]).flatMap(x=>
      allProdutosMap[x.id].filter(p=>!isPrincipal(p)&&!isCancelado(p)).map(p=>({...p,parent_id:x.id}))
    ),
    ...mvPeriod.filter(m=>isAcess(m))
  ];
  const prPeriod=[
    ...v.filter(x=>allProdutosMap[x.id]).flatMap(x=>
      allProdutosMap[x.id].filter(p=>isPrincipal(p)).map(p=>({...p,parent_id:x.id}))
    ),
    ...mvPeriod.filter(m=>!isAcess(m))
  ];
  const units=prPeriod.length;

  // Produtos principais e acessorios (ja calculados acima)
  const pr=prPeriod; const ac=acPeriod;
  const unPrincipal=pr.length;
  const unAcess=ac.length;
  const vendaAcess=ac.reduce((a,m)=>a+parseFloat(m.preco||0),0);
  const custoAcess=ac.reduce((a,m)=>a+parseFloat(m.valor_estoque||0),0);
  const lAcess=vendaAcess-custoAcess;

  // Socios/Loja -- vendas da casa (gustavo, marcella, breno, ou sem vendedor identificado)
  const SOCIOS_KEYS=['gustavo','marcella','breno'];
  const EQUIPE_KEYS=['isa','mel','david','pietra','vitinho','davi','anne','denilson','leo','luana','maria'];
  const isVendaLoja=(x)=>{
    const {vendedor}=getVendaInfo(x);
    if(!vendedor) return true;
    const vl=vendedor.toLowerCase().trim();
    if(SOCIOS_KEYS.some(s=>vl.includes(s))) return true;
    if(['cart','urban','loja'].includes(vl)) return true;
    if(!EQUIPE_KEYS.some(e=>vl.includes(e))&&!['isa','mel','david','pietra','maria'].some(e=>vl.includes(e))) return true;
    return false;
  };
  let lojaVendas=0,lojaUnits=0;
  v.forEach(x=>{ if(isVendaLoja(x)){lojaVendas++;if(x._produtos&&x._produtos.length>0)lojaUnits+=x._produtos.filter(p=>isPrincipal(p)).length;else lojaUnits+=prPeriod.filter(p=>p.parent_id===x.id).length;} });

  // Vendedores online -- por numero de VENDAS (nao unidades)
  const VO=VO_KEYS; // ['isa','mel','david','pietra'] -- vendedores online oficiais
  const voMap={};VO.forEach(k=>voMap[k]={vendas:0,units:0});
  v.forEach(x=>{
    const {vendedor}=getVendaInfo(x);
    const m=matchNome(vendedor,VO);
    if(m){
      voMap[m].vendas++;
      // Usar _produtos se disponivel (apple_id = iPhone), senao qtd_produtos como fallback
      if(x._produtos&&x._produtos.length>0){
        voMap[m].units+=x._produtos.filter(p=>isPrincipal(p)).length;
      } else {
        voMap[m].units+=prPeriod.filter(p=>p.parent_id===x.id).length;
      }
    }
  });

  // Atendentes -- destaque no bruto de acessorios
  const AT=AT_KEYS; // atendentes presenciais oficiais
  const atMap={};AT.forEach(k=>atMap[k]={la:0,qt:0,brutoAcess:0});
  const vAtend={};
  v.forEach(x=>{const {atendente}=getVendaInfo(x);const m=matchNome(atendente,AT);if(m)vAtend[x.id]=m;});
  ac.forEach(m=>{
    const a=vAtend[m.parent_id];if(!a)return;
    const l=parseFloat(m.preco||0)-parseFloat(m.valor_estoque||0);
    atMap[a].la+=l;
    atMap[a].brutoAcess+=parseFloat(m.preco||0);
    atMap[a].qt++;
  });

  // Aplicar ajustes manuais de acessorios (correcoes de mes)
  const mesAtual=(()=>{
    if(currentPeriod==='mes'){const n=new Date();return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`;}
    if(/^\d{4}-\d{2}$/.test(currentPeriod)) return currentPeriod;
    return null;
  })();
  if(mesAtual) ajustesAcessorios.filter(a=>a.mes===mesAtual).forEach(a=>{
    const k=a.atendente;
    if(!atMap[k]) return;
    const margem=atMap[k].brutoAcess>0 ? atMap[k].la/atMap[k].brutoAcess : 0.5;
    atMap[k].brutoAcess += parseFloat(a.valor_bruto||0);
    atMap[k].la += parseFloat(a.valor_bruto||0) * margem;
  });

  // Comissao correta: >80 unidades -> R$35/un
  function calcCommVo(units){ return units<=80 ? units*25 : 80*25+(units-80)*35; }
  const voTot=VO.reduce((a,k)=>a+calcCommVo(voMap[k].units),0);
  const lojaTot=0; // loja nao tem comissao
  const atTot=AT.reduce((a,k)=>a+atMap[k].la*0.25,0); // 25% lucro acess. por atendente
  const anneBonus=lAcess*0.05; // bonus Anne (5% geral) -- separado das comissoes de vendas

  return{bruto,lucro,units,unPrincipal,unAcess,vendaAcess,lAcess,voMap,atMap,voTot,atTot,anneBonus,liq:lucro-voTot-atTot,cnt:v.length,acCnt:ac.length,lojaVendas,lojaUnits};
}

// RENDER
function renderContent(){
  const c=document.getElementById('content');
  if(!c)return;
  if(currentTab==='dash')c.innerHTML=renderDash();
  else if(currentTab==='vendas')c.innerHTML=renderVendas();
  else if(currentTab==='estoque')c.innerHTML=renderEstoque();
  else if(currentTab==='custos')c.innerHTML=renderCustos();
  else if(currentTab==='equipe')c.innerHTML=renderEquipe();
  else if(currentTab==='movs')c.innerHTML=renderMovs();
  else if(currentTab==='tabela')c.innerHTML=renderTabela();
  else if(currentTab==='fechamento')c.innerHTML=renderFechamento();

  // Modal de WhatsApp do Estoque (renderiza por cima quando aberto)
  // Remove qualquer instância anterior do modal "geral" (sem id), preserva o modal direto (id=wa-modal-direto)
  document.querySelectorAll('.est-wa-modal-overlay').forEach(el => {
    if(!el.id) el.remove();
  });
  if(typeof estoqueWaModalState !== 'undefined' && estoqueWaModalState.open){
    document.body.insertAdjacentHTML('beforeend', renderWaModalHTML());
    setTimeout(() => atualizarPreviewWa(), 50);
  }
}

function renderDash(){
  const m=calc();
  const mg=Math.round(m.bruto>0?m.lucro/m.bruto*100:0);
  const custosMes=(()=>{
    const cc=filterCustoPeriod(getCustos());
    const vf=filterByPeriod(allVendas);
    const uc=vf.filter(v=>v.loja==='cart').reduce((a,v)=>a+(v._produtos&&v._produtos.length>0?v._produtos.filter(p=>isPrincipal(p)).length:0),0);
    const uu=vf.filter(v=>v.loja==='urban').reduce((a,v)=>a+(v._produtos&&v._produtos.length>0?v._produtos.filter(p=>isPrincipal(p)).length:0),0);
    const ut=uc+uu||1;
    return cc.reduce((a,c)=>{
      const v=parseFloat(c.valor||0);
      if(c.loja==='ambas'){
        // Rateio proporcional -- se filtro por loja especifica, so parte da loja
        if(currentStore==='cart')   return a+v*(uc/ut);
        if(currentStore==='urban')  return a+v*(uu/ut);
        return a+v; // ambas = total
      }
      if(currentStore!=='ambas' && c.loja && c.loja!==currentStore) return a; // filtrar por loja
      return a+v;
    },0);
  })();
  const liqReal=m.liq-m.anneBonus-custosMes;
  const ticket=m.cnt>0?Math.round(m.bruto/m.cnt):0;

  // Filtros
  const storeBtn=(s,label,cor)=>`<button class="pill${currentStore===s?' active':''}" onclick="setStore('${s}',this)" style="${currentStore===s&&cor?'background:'+cor+';border-color:'+cor:''}">${label}</button>`;
  // Loja e periodo agora vivem na sidebar (contexto persistente, brief §7.2)
  const filtersHTML='';

  // -- Alerta de vendas pendentes ------------------------------
  const pendentes=getPendentes();
  const pendentesHTML=pendentes.length>0?`
    <div style="background:rgba(255,212,10,.06);border:1px solid rgba(255,212,10,.25);border-radius:12px;padding:12px 16px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:12px">
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:18px">⏳</span>
        <div>
          <div style="font-size:13px;font-weight:600;color:var(--yellow)">${pendentes.length} venda${pendentes.length>1?'s':''} pendente${pendentes.length>1?'s':''} no período</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">Não contabilizadas nos totais — verifique se precisam ser finalizadas</div>
        </div>
      </div>
      <button onclick="verPendentes()" style="padding:6px 14px;background:rgba(255,212,10,.12);border:1px solid rgba(255,212,10,.3);border-radius:8px;color:var(--yellow);font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap">Ver pendentes</button>
    </div>`:'';

  // -- Alerta obs incompletas --------------------------------------------------
  const incompletas = getVendasIncompletas().filter(v => v.status === 'completed'); // so completed

  // -- Alerta vendas sem device detalhado ---------------------------------------
  const semDevice = getVendasSemDeviceDetalhado();
  const semDeviceHTML = semDevice.length > 0 ? `
    <div style="background:rgba(251,191,36,.06);border:1px solid rgba(251,191,36,.25);border-radius:12px;padding:12px 16px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:12px">
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:18px">🔍</span>
        <div>
          <div style="font-size:13px;font-weight:600;color:var(--text)">${semDevice.length} venda${semDevice.length>1?'s':''} sem device identificado</div>
          <div style="font-size:11px;color:var(--text4);margin-top:2px">Produto não vinculado no FoneNinja — device não contabilizado</div>
        </div>
      </div>
      <button onclick="abrirModalSemDevice()" style="padding:6px 14px;background:rgba(251,191,36,.12);border:1px solid rgba(251,191,36,.3);border-radius:8px;color:#fbbf24;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap">Ver detalhes</button>
    </div>` : '';
  const incompletasCriticas = incompletas.filter(v => v.severidade === 'critica');
  const incompletasLeves = incompletas.filter(v => v.severidade === 'leve');
  const incompletasHTML = incompletas.length > 0 ? `
    <div style="background:rgba(255,99,71,.06);border:1px solid rgba(255,99,71,.25);border-radius:12px;padding:12px 16px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:12px">
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:18px">⚠️</span>
        <div>
          <div style="font-size:13px;font-weight:600;color:var(--text)">
            ${incompletasCriticas.length} venda${incompletasCriticas.length===1?'':'s'} com obs incompletas
            ${incompletasLeves.length > 0 ? `<span style="margin-left:8px;padding:2px 8px;background:rgba(251,191,36,.15);border:1px solid rgba(251,191,36,.3);border-radius:6px;color:#fbbf24;font-size:11px;font-weight:500">+${incompletasLeves.length} leve${incompletasLeves.length===1?'':'s'}</span>` : ''}
          </div>
          <div style="font-size:11px;color:var(--text4);margin-top:2px">Corrija no FoneNinja — será atualizado automaticamente</div>
        </div>
      </div>
      <button onclick="abrirModalIncompletas()" style="padding:6px 14px;background:rgba(255,99,71,.12);border:1px solid rgba(255,99,71,.3);border-radius:8px;color:#ff6347;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap">Ver detalhes</button>
    </div>` : '';

  // -- KPIs linha 1 -----------------------------------------
  const kpi1=`
    <div class="metric-grid" style="margin-bottom:10px">
      <div class="metric">
        <div class="metric-label">Produtos vendidos</div>
        <div class="metric-value" style="color:var(--cart);font-size:30px">${m.unPrincipal.toLocaleString('pt-BR')}</div>
        <div class="metric-sub">${m.cnt} pedidos · ticket ${brl(ticket)}</div>
      </div>
      <div class="metric">
        <div class="metric-label">Venda bruta</div>
        <div class="metric-value">${brl(m.bruto)}</div>
        <div class="metric-sub">${mg}% margem bruta</div>
      </div>
      <div class="metric">
        <div class="metric-label">Lucro bruto</div>
        <div class="metric-value" style="color:var(--green)">${brl(m.lucro)}</div>
        <div class="metric-sub">após custo mercadoria</div>
      </div>
      <div class="metric" style="border:1px solid ${liqReal>0?'rgba(48,209,88,.2)':'rgba(255,69,58,.2)'}">
        <div class="metric-label">Lucro líquido</div>
        <div class="metric-value" style="color:${liqReal>0?'var(--green)':'var(--red)'}">${brl(liqReal)}</div>
        <div class="metric-sub" style="display:flex;justify-content:space-between">
          <span>após comissões${custosMes>0?' + custos':''}</span>
          ${custosMes>0?`<span style="color:var(--red);font-size:10px">custo: ${brl(custosMes)}</span>`:''}
        </div>
      </div>
    </div>`;

  // -- Acessorios -- area destacada --------------------------
  const mgAcess=m.vendaAcess>0?Math.round(m.lAcess/m.vendaAcess*100):0;
  const kpi2=`
    <div style="background:rgba(91,139,245,.04);border:1px solid rgba(91,139,245,.15);border-radius:14px;padding:14px 18px;margin-bottom:14px;position:relative;overflow:hidden">
      <div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,var(--cart),transparent)"></div>
      <div style="font-size:10px;color:var(--text3);font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:10px">🎧 Acessórios</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
        <div>
          <div style="font-size:10px;color:var(--text3);margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:.06em">Venda bruta</div>
          <div style="font-size:22px;font-weight:700">${brl(m.vendaAcess)}</div>
          <div style="font-size:11px;color:var(--text3)">${m.acCnt} itens vendidos</div>
        </div>
        <div>
          <div style="font-size:10px;color:var(--text3);margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:.06em">Lucro</div>
          <div style="font-size:22px;font-weight:700;color:var(--green)">${brl(m.lAcess)}</div>
          <div style="font-size:11px;color:var(--text3)">${mgAcess}% margem · base comissão</div>
        </div>
        <div>
          <div style="font-size:10px;color:var(--text3);margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:.06em">Custo lançado</div>
          <div style="font-size:22px;font-weight:700;color:${custosMes>0?'var(--red)':'var(--text4)'}">${custosMes>0?'− '+brl(custosMes):'—'}</div>
          <div style="font-size:11px;color:var(--text3)">${custosMes>0?'ver aba Custos':'nenhum custo lançado'}</div>
        </div>
      </div>
    </div>`;

  // -- Metas coletivas --------------------------------------
  const totalProdutos=m.unPrincipal;
  const metasProdutos=[{qt:300,bonus:200},{qt:350,bonus:400},{qt:400,bonus:550}];
  const metasAcess=[{val:20000,bonus:150},{val:25000,bonus:200},{val:30000,bonus:500}];
  const metaDevAtual=metasProdutos.filter(x=>totalProdutos>=x.qt).pop()||null;
  const metaDevProx=metasProdutos.find(x=>totalProdutos<x.qt)||null;
  const metaAcessAtual=metasAcess.filter(x=>m.vendaAcess>=x.val).pop()||null;
  const metaAcessProx=metasAcess.find(x=>m.vendaAcess<x.val)||null;
  const pctDev=metaDevProx?Math.min(100,Math.round((totalProdutos-(metaDevAtual?.qt||0))/(metaDevProx.qt-(metaDevAtual?.qt||0))*100)):100;
  const pctAcess=metaAcessProx?Math.min(100,Math.round((m.vendaAcess-(metaAcessAtual?.val||0))/(metaAcessProx.val-(metaAcessAtual?.val||0))*100)):100;

  const metasHTML=`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
      <div class="metric" style="border:1px solid ${metaDevAtual?.qt===400?'rgba(48,209,88,.3)':metaDevAtual?'rgba(91,139,245,.25)':'var(--border)'}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div class="metric-label" style="margin:0">🎯 Meta produtos</div>
          ${metaDevAtual?`<span style="font-size:11px;font-weight:700;color:var(--green)">+${brl(metaDevAtual.bonus)}</span>`:''}
        </div>
        <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:6px">
          <span style="font-size:26px;font-weight:700;color:${metaDevAtual?'var(--green)':'var(--text)'}">${totalProdutos}</span>
          <span style="font-size:12px;color:var(--text3)">${metaDevProx?'/ próx: '+metaDevProx.qt+' un':'todas batidas 🏆'}</span>
        </div>
        <div style="height:5px;background:var(--border2);border-radius:3px;overflow:hidden;margin-bottom:6px">
          <div style="height:100%;width:${pctDev}%;background:${metaDevAtual?.qt===400?'var(--green)':'var(--cart)'};border-radius:3px;transition:width .4s"></div>
        </div>
        <div style="display:flex;gap:5px">
          ${metasProdutos.map(mv=>`<span style="font-size:10px;padding:2px 8px;border-radius:4px;font-weight:600;background:${totalProdutos>=mv.qt?'rgba(48,209,88,.12)':'var(--bg3)'};color:${totalProdutos>=mv.qt?'var(--green)':'var(--text3)'}">${mv.qt}</span>`).join('')}
        </div>
      </div>
      <div class="metric" style="border:1px solid ${metaAcessAtual?.val===30000?'rgba(48,209,88,.3)':metaAcessAtual?'rgba(91,139,245,.25)':'var(--border)'}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div class="metric-label" style="margin:0">🎧 Meta acessórios</div>
          ${metaAcessAtual?`<span style="font-size:11px;font-weight:700;color:var(--green)">+${brl(metaAcessAtual.bonus)}</span>`:''}
        </div>
        <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:6px">
          <span style="font-size:22px;font-weight:700;color:${metaAcessAtual?'var(--green)':'var(--text)'}">${brl(m.vendaAcess)}</span>
          <span style="font-size:12px;color:var(--text3)">${metaAcessProx?'/ próx: '+brl(metaAcessProx.val):'todas batidas 🏆'}</span>
        </div>
        <div style="height:5px;background:var(--border2);border-radius:3px;overflow:hidden;margin-bottom:6px">
          <div style="height:100%;width:${pctAcess}%;background:${metaAcessAtual?.val===30000?'var(--green)':'var(--cart)'};border-radius:3px;transition:width .4s"></div>
        </div>
        <div style="display:flex;gap:5px">
          ${metasAcess.map(ma=>`<span style="font-size:10px;padding:2px 8px;border-radius:4px;font-weight:600;background:${m.vendaAcess>=ma.val?'rgba(48,209,88,.12)':'var(--bg3)'};color:${m.vendaAcess>=ma.val?'var(--green)':'var(--text3)'}">R$${ma.val>=1000?(ma.val/1000)+'k':ma.val}</span>`).join('')}
        </div>
      </div>
    </div>`;

  // -- Vendedores + Atendentes ------------------------------
  function calcCommVoDash(units){ return units<=80 ? units*25 : 80*25+(units-80)*35; }

  // Vendedores -- SEM Gustavo (vai para "Loja")
  const VO_LABELS=[['Isa','isa'],['Mel','mel'],['David','david'],['Pietra','pietra']].sort((a,b)=>(m.voMap[b[1]]?.units||0)-(m.voMap[a[1]]?.units||0));
  const voRows=VO_LABELS.map(([n,k])=>{
    const units=m.voMap[k]?.units||0;
    const comm=calcCommVoDash(units);
    const metaBatida=units>80;
    const pct=Math.min(100,Math.round(units/80*100));
    return`<div class="person-row">
      <div style="flex:1">
        <div class="person-name">${n} ${metaBatida?'<span style="font-size:10px;background:rgba(48,209,88,.1);color:var(--green);padding:1px 6px;border-radius:4px;font-weight:700">🔥 R$35/un</span>':''}</div>
        <div style="font-size:12px;margin-top:2px"><span style="color:var(--cart);font-weight:600">${units}</span><span style="color:var(--text3)"> produtos · ${m.voMap[k]?.vendas||0} pedidos</span></div>
        <div style="margin-top:5px;height:3px;background:var(--border2);border-radius:2px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${metaBatida?'var(--green)':'var(--cart)'};border-radius:2px"></div>
        </div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px">${metaBatida?units-80+' acima da meta':'faltam '+Math.max(0,80-units)+' para R$35'}</div>
      </div>
      <div class="person-val">${brl(comm)}</div>
    </div>`;
  }).join('');

  // Loja -- vendas da casa
  const lojaComm=0;
  const lojaRow=`<div class="person-row" style="border-top:1px solid rgba(91,139,245,.15);margin-top:6px;padding-top:8px">
    <div style="flex:1">
      <div class="person-name" style="color:var(--text3)">🏪 Loja <span style="font-size:10px;color:var(--text4)">(Gustavo · Marcella · Breno · sem vendedor)</span></div>
      <div style="font-size:12px;margin-top:2px"><span style="color:var(--text2);font-weight:600">${m.lojaUnits||0}</span><span style="color:var(--text3)"> produtos · ${m.lojaVendas||0} pedidos</span></div>
    </div>
    <div style="font-size:12px;color:var(--text4)">sem comissão</div>
  </div>`;

  const voTot=VO_LABELS.reduce((a,[,k])=>a+calcCommVoDash(m.voMap[k]?.units||0),0);

  // Atendentes
  function calcMetaAt(b){if(b>=10000)return{nivel:3,bonus:1000,label:'R$10k ✅'};if(b>=6000)return{nivel:2,bonus:300,label:'R$6k ✅'};if(b>=4000)return{nivel:1,bonus:100,label:'R$4k ✅'};return{nivel:0,bonus:0,label:''};}
  const AT_LABELS=[['Vitinho','vitinho'],['Davi','davi'],['Anne','anne'],['Pietra','pietra'],['Denilson','denilson']].sort((a,b)=>(m.atMap[b[1]]?.brutoAcess||0)-(m.atMap[a[1]]?.brutoAcess||0));
  const atRows=AT_LABELS.map(([n,k])=>{
    const bruto=m.atMap[k]?.brutoAcess||0;
    const comm=m.atMap[k]?.la*0.25||0;
    const meta=calcMetaAt(bruto);
    const nextVal=meta.nivel===0?4000:meta.nivel===1?6000:meta.nivel===2?10000:10000;
    const prevVal=meta.nivel===0?0:meta.nivel===1?4000:meta.nivel===2?6000:10000;
    const pct=meta.nivel<3?Math.min(100,Math.round((bruto-prevVal)/(nextVal-prevVal)*100)):100;
    const barColor=meta.nivel>=2?'var(--green)':meta.nivel===1?'var(--cart)':'var(--border3)';
    return`<div class="person-row">
      <div style="flex:1">
        <div class="person-name">${n} ${meta.label?'<span style="font-size:10px;background:rgba(48,209,88,.1);color:var(--green);padding:1px 6px;border-radius:4px;font-weight:600">'+meta.label+'</span>':''} ${meta.bonus>0?'<span style="font-size:10px;color:var(--green);font-weight:700">+'+brl(meta.bonus)+'</span>':''}</div>
        <div style="font-size:12px;margin-top:2px"><span style="color:var(--urban);font-weight:600">${brl(bruto)}</span><span style="color:var(--text3)"> bruto acess. · ${m.atMap[k]?.qt||0} itens</span></div>
        ${meta.nivel<3?`<div style="margin-top:5px;height:3px;background:var(--border2);border-radius:2px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${barColor};border-radius:2px"></div></div><div style="font-size:10px;color:var(--text3);margin-top:2px">faltam ${brl(nextVal-bruto)} para próxima meta</div>`:'<div style="font-size:10px;color:var(--green);margin-top:4px">🏆 Meta máxima atingida!</div>'}
      </div>
      <div class="person-val">${brl(comm)}</div>
    </div>`;
  }).join('');
  const atTot=AT_LABELS.reduce((a,[,k])=>a+(m.atMap[k]?.la||0)*0.25,0); // 25% lucro acess por atendente (anne5% em m.anneBonus)

  const vendedoresHTML=`
    <div class="two-col">
      <div class="card">
        <div class="card-title">Vendedores online <span>R$25→R$35 acima de 80 un</span></div>
        ${voRows}${lojaRow}
        <div class="total-row"><span style="font-size:12px;color:var(--text3)">Total comissões</span><span class="total-val">${brl(voTot)}</span></div>
      </div>
      <div class="card">
        <div class="card-title">Atendentes presenciais <span>25% lucro acess.</span></div>
        ${atRows}
        <div class="total-row"><span style="font-size:12px;color:var(--text3)">Total comissões</span><span class="total-val">${brl(atTot)}</span></div>
      </div>
    </div>`;

  // -- Metas -- bonus automaticos ------------------------------------------------
  const metasDevList=_periodoNovoRegime()?[{qt:350,bonus:500},{qt:400,bonus:750},{qt:450,bonus:1000}]:[{qt:300,bonus:200},{qt:350,bonus:400},{qt:400,bonus:550}];
  const metasAcList=_periodoNovoRegime()?[{val:25000,bonus:200},{val:30000,bonus:500},{val:40000,bonus:750}]:[{val:20000,bonus:150},{val:25000,bonus:200},{val:30000,bonus:500}];
  const metaDevBatida=metasDevList.filter(x=>m.unPrincipal>=x.qt).pop()||null;
  const metaAcBatida=metasAcList.filter(x=>m.vendaAcess>=x.val).pop()||null;
  const bonusMetaColetiva=(metaDevBatida?.bonus||0)+(metaAcBatida?.bonus||0);
  function calcBonusMetaAt(b){return b>=10000?1000:b>=6000?300:b>=4000?100:0;}
  const bonusMetaAtMap={};
  AT_LABELS.forEach(([,k])=>{bonusMetaAtMap[k]=calcBonusMetaAt(m.atMap[k]?.brutoAcess||0);});
  const totalBonusMetaAt=Object.values(bonusMetaAtMap).reduce((a,b)=>a+b,0);
  const totalBonusMetas=bonusMetaColetiva+totalBonusMetaAt;
  const liqComMetas=liqReal-totalBonusMetas;

  // -- Resultado financeiro -----------------------------------------------------
  const resultHTML=`
    <div class="card">
      <div class="card-title">Resultado financeiro</div>
      <div class="result-row"><div class="r-lbl">Venda bruta</div><div>${brl(m.bruto)}</div></div>
      <div class="result-row"><div class="r-lbl">Lucro bruto (após custo merc.)</div><div class="r-pos">${brl(m.lucro)}</div></div>
      <div class="result-row"><div class="r-lbl">Comissões vendedores</div><div class="r-neg">− ${brl(voTot)}</div></div>
      <div class="result-row"><div class="r-lbl">Comissões atendentes</div><div class="r-neg">− ${brl(atTot)}</div></div>
      <div class="result-row"><div class="r-lbl">Bônus Anne (5% acessórios)</div><div class="r-neg">− ${brl(m.anneBonus)}</div></div>
      ${custosMes>0?`<div class="result-row"><div class="r-lbl">Custos operacionais</div><div class="r-neg">− ${brl(custosMes)}</div></div>`:''}
      ${totalBonusMetas>0?`<div class="result-row"><div class="r-lbl">Bônus metas (coletiva + individuais)</div><div class="r-neg">− ${brl(totalBonusMetas)}</div></div>`:''}
      <div class="result-row" style="border-top:1px solid var(--border2);margin-top:4px;padding-top:8px">
        <div class="r-lbl" style="font-weight:600">Lucro líquido real</div>
        <div class="r-pos" style="font-size:16px;font-weight:700">${brl(liqComMetas)}</div>
      </div>
    </div>`;

  // -- Cart vs Urban ----------------------------------------
  let v=filterByPeriod(allVendas);
  if(currentStore!=='ambas') v=v.filter(x=>{const {loja}=getVendaInfo(x);return loja===currentStore||(!loja&&currentStore==='cart');});
  const cartVendas=v.filter(x=>getVendaInfo(x).loja==='cart');
  const urbanVendas=v.filter(x=>getVendaInfo(x).loja==='urban');
  const semLojaCount=v.filter(x=>!getVendaInfo(x).loja).length;
  const rLoja=(arr,nome,cor)=>{
    const bruto=arr.reduce((a,x)=>a+parseFloat(x.valor_total||0),0);
    const lucro=arr.reduce((a,x)=>a+parseFloat(x.lucro||0),0);
    const iphones=arr.reduce((a,x)=>a+(x._produtos?x._produtos.filter(p=>isPrincipal(p)).length:0),0);
    const margem=bruto>0?Math.round((lucro/bruto)*100):0;
    const ticket=arr.length>0?Math.round(bruto/arr.length):0;
    return{nome,cor,vendas:arr.length,iphones,bruto,lucro,margem,ticket};
  };
  const lC=rLoja(cartVendas,'Phone Cart','var(--cart)');
  const lU=rLoja(urbanVendas,'Urban','var(--urban)');
  const lojaHTML=`
    <div class="card" style="margin-bottom:12px">
      <div class="card-title">Cart vs Urban</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:4px">
        ${[lC,lU].map(l=>`<div style="background:var(--bg3);border-radius:10px;padding:14px 16px;border:1px solid var(--border);border-top:2px solid ${l.cor}">
          <div style="font-size:13px;font-weight:700;color:${l.cor};margin-bottom:10px">${l.nome}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px">
            <div><div style="color:var(--text3);font-size:10px;font-weight:600;letter-spacing:.04em;margin-bottom:2px">PEDIDOS</div><div style="font-weight:600">${l.vendas}</div></div>
            <div><div style="color:var(--text3);font-size:10px;font-weight:600;letter-spacing:.04em;margin-bottom:2px">PRODUTOS</div><div style="font-weight:600">${l.iphones}</div></div>
            <div><div style="color:var(--text3);font-size:10px;font-weight:600;letter-spacing:.04em;margin-bottom:2px">BRUTO</div><div style="font-weight:600">${brl(l.bruto)}</div></div>
            <div><div style="color:var(--text3);font-size:10px;font-weight:600;letter-spacing:.04em;margin-bottom:2px">LUCRO</div><div style="color:var(--green);font-weight:600">${brl(l.lucro)}</div></div>
            <div><div style="color:var(--text3);font-size:10px;font-weight:600;letter-spacing:.04em;margin-bottom:2px">MARGEM</div><div style="color:${l.margem<15?'var(--yellow)':'var(--green)'};font-weight:600">${l.margem}%</div></div>
            <div><div style="color:var(--text3);font-size:10px;font-weight:600;letter-spacing:.04em;margin-bottom:2px">TICKET</div><div style="font-weight:600">${brl(l.ticket)}</div></div>
          </div>
        </div>`).join('')}
      </div>
      ${semLojaCount>0?`<div style="margin-top:8px;font-size:11px;color:var(--text4)">⚠ ${semLojaCount} venda${semLojaCount>1?'s':''} sem loja identificada</div>`:''}
    </div>`;

  // -- Alertas de margem ------------------------------------
  const mAlerts=v.map(x=>{
    const tot=parseFloat(x.valor_total||0);
    const luc=parseFloat(x.lucro||0);
    const mg=tot>0?Math.round((luc/tot)*1000)/10:0;
    const {vendedor,loja}=getVendaInfo(x);
    const prods=x._produtos?x._produtos.filter(p=>isPrincipal(p)):[];
    const modelo=prods.length>0?(prods[0].titulo||'').replace(/^iPhone\s+/i,'').replace(/\s*Seminovo\s*$/i,' SN').trim():'';
    return{id:x.id,mg,luc,tot,vendedor,loja,data:x.data_saida,modelo};
  }).filter(x=>x.tot>500);
  const neg=mAlerts.filter(x=>x.mg<0);
  const baixas=mAlerts.filter(x=>x.mg>=0&&x.mg<10);
  const dist={neg:neg.length,ate10:baixas.length,de10a15:mAlerts.filter(x=>x.mg>=10&&x.mg<15).length,de15a20:mAlerts.filter(x=>x.mg>=15&&x.mg<20).length,acima20:mAlerts.filter(x=>x.mg>=20).length};
  const alertasHTML=(neg.length+baixas.length)>0?`
    <div class="card" style="margin-bottom:12px;border-left:3px solid ${neg.length>0?'var(--red)':'var(--yellow)'}">
      <div class="card-title">
        <span>${neg.length>0?'⚠ Alertas de margem':'Distribuição de margem'}</span>
        <span style="font-size:11px;color:var(--text4)">${neg.length+baixas.length} venda${(neg.length+baixas.length)>1?'s':''} abaixo de 10%</span>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
        ${[{l:'Negativa',c:dist.neg,cor:'var(--red)'},{l:'<10%',c:dist.ate10,cor:'var(--yellow)'},{l:'10–15%',c:dist.de10a15,cor:'var(--orange)'},{l:'15–20%',c:dist.de15a20,cor:'var(--text3)'},{l:'>20%',c:dist.acima20,cor:'var(--green)'}].map(f=>`<div style="background:var(--bg3);border-radius:8px;padding:6px 12px;font-size:12px;border:1px solid var(--border);text-align:center"><div style="color:${f.cor};font-weight:700;font-size:16px">${f.c}</div><div style="color:var(--text4);font-size:10px;margin-top:1px">${f.l}</div></div>`).join('')}
      </div>
      <div style="font-size:10px;color:var(--text4);font-weight:600;letter-spacing:.06em;text-transform:uppercase;margin-bottom:6px">Piores margens do período:</div>
      ${[...neg,...baixas].sort((a,b)=>a.mg-b.mg).slice(0,5).map(x=>{
        const dataFmt=x.data?x.data.replace(/T.*/,'').slice(5).replace('-','/'):' — ';
        return`<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-top:1px solid var(--border)">
          <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0">
            <span style="flex-shrink:0;background:${x.mg<0?'rgba(255,69,58,.15)':'rgba(255,212,10,.1)'};color:${x.mg<0?'var(--red)':'var(--yellow)'};padding:2px 8px;border-radius:6px;font-weight:700;font-size:11px">${x.mg}%</span>
            <div style="min-width:0">
              <div style="font-size:12px;font-weight:500;color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${x.modelo||'—'}</div>
              <div style="font-size:10px;color:var(--text4)">${dataFmt} · ${x.vendedor||'—'} · ${x.loja||'—'} · <span style="font-family:monospace">#${x.id}</span></div>
            </div>
          </div>
          <div style="text-align:right;flex-shrink:0;margin-left:10px">
            <div style="font-size:12px;font-weight:600">${brl(x.tot)}</div>
            <div style="font-size:11px;color:var(--red)">${brl(x.luc)}</div>
          </div>
        </div>`;
      }).join('')}
    </div>`:''

  // -- Ultimas vendas hoje ----------------------------------
  const hojeBrt=brtNow();
  const vendasHoje=filterByPeriod(allVendas)
    .filter(x=>brtSameDay(toBRT(x.data_saida), hojeBrt))
    .sort((a,b)=>(b.data_saida||'').localeCompare(a.data_saida||''))
    .slice(0,8);
  let ultimasHTML='';
  if(vendasHoje.length>0){
    const ultimasRows=vendasHoje.map(venda=>{
      const prods=venda._produtos?.filter(p=>isPrincipal(p))||[];
      const prodStr=prods.length>0?prods.map(p=>(p.titulo||'').replace(/^iPhone\s+/i,'').replace(/\s*Seminovo\s*$/i,' SN').trim()).join(' + '):'—';
      const {vendedor,loja}=getVendaInfo(venda);
      const nomeCliente=(venda.cliente_nome||venda.cliente?.nome||'').split(' ').slice(0,2).join(' ');
      const lojaTag=loja==='cart'?'<span style="font-size:10px;background:rgba(91,139,245,.15);color:var(--cart);padding:1px 6px;border-radius:4px;font-weight:600">Cart</span>':loja==='urban'?'<span style="font-size:10px;background:rgba(255,159,10,.15);color:var(--urban);padding:1px 6px;border-radius:4px;font-weight:600">Urban</span>':'';
      const dataFmt=(venda.data_saida||'').slice(5,10).replace('-','/');
      const lucro=parseFloat(venda.lucro||0);
      const bruto=parseFloat(venda.valor_total||0);
      const mgV=bruto>0?Math.round(lucro/bruto*100):0;
      const mgColor=mgV<0?'var(--red)':mgV<10?'var(--yellow)':'var(--green)';
      return '<div style="display:grid;grid-template-columns:40px 60px 1fr 80px 80px 70px;gap:8px;align-items:center;padding:8px 0;border-top:1px solid var(--border);font-size:12px">'
        +'<div style="font-size:10px;color:var(--text4)">'+dataFmt+'</div>'
        +'<div style="font-size:10px;color:var(--cart);font-family:monospace;cursor:pointer;text-decoration:underline" onclick="irParaVenda('+venda.id+')">#'+venda.id+'</div>'
        +'<div style="min-width:0"><div style="font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+prodStr+'</div><div style="font-size:10px;color:var(--text3);margin-top:1px">'+nomeCliente+' '+lojaTag+(vendedor?' · <span style="color:var(--text4)">'+vendedor+'</span>':'')+'</div></div>'
        +'<div style="font-weight:600;text-align:right">'+brl(bruto)+'</div>'
        +'<div style="text-align:right;color:'+mgColor+';font-weight:600">'+brl(lucro)+'</div>'
        +'<div style="text-align:right;font-size:11px;color:'+mgColor+'">'+mgV+'%</div>'
        +'</div>';
    }).join('');
    ultimasHTML='<div class="card" style="margin-bottom:12px">'
      +'<div class="card-title">Últimas vendas hoje <span style="color:var(--green);font-size:10px">● ao vivo</span></div>'
      +'<div style="display:grid;grid-template-columns:40px 60px 1fr 80px 80px 70px;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);font-size:10px;color:var(--text4);font-weight:600;letter-spacing:.05em;text-transform:uppercase">'
      +'<div>DATA</div><div>ID</div><div>APARELHO / CLIENTE</div><div style="text-align:right">BRUTO</div><div style="text-align:right">LUCRO</div><div style="text-align:right">MG%</div></div>'
      +ultimasRows+'</div>';
  }

  // -- Ultimas movimentacoes --------------------------------
  const todasMovs=[];
  // Saidas (vendas recentes)
  filterByPeriod(allVendas).slice(-20).reverse().slice(0,10).forEach(venda=>{
    const prods=venda._produtos?.filter(p=>isPrincipal(p))||[];
    const prodStr=prods.length>0?prods.map(p=>(p.titulo||'').replace(/^iPhone\s+/i,'').replace(/\s*Seminovo\s*$/i,' SN').trim()).join('+'):'—';
    todasMovs.push({tipo:'saida',data:(venda.data_saida||'').slice(0,10),id:venda.id,aparelho:prodStr,valor:parseFloat(venda.valor_total||0),loja:getVendaInfo(venda).loja});
  });
  // Entradas (estoque disponivel recente)
  estoqueItens.slice(0,5).forEach(item=>{
    const mov=item.movimentacoes&&item.movimentacoes.length>0?item.movimentacoes[0]:null;
    const isUpgrade=mov&&mov.parent_type==='upgrade';
    const titulo=(item.titulo||'').replace(/^iPhone\s+/i,'').replace(/\s*Seminovo\s*$/i,' SN').trim();
    todasMovs.push({
      tipo:isUpgrade?'upgrade':'compra',
      data:(mov?.created_at||item.created_at||'').slice(0,10),
      id:isUpgrade?(mov?.parent?.parent_id||mov?.parent_id):item.id,
      aparelho:titulo,
      valor:parseFloat(item.valor_estoque||0),
      loja:''
    });
  });
  todasMovs.sort((a,b)=>b.data.localeCompare(a.data));

  const movsHTML=todasMovs.length>0?`
    <div class="card">
      <div class="card-title">Últimas movimentações <span>entradas + saídas</span></div>
      <div style="display:grid;grid-template-columns:55px 60px 1fr 90px;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);font-size:10px;color:var(--text4);font-weight:600;letter-spacing:.05em;text-transform:uppercase">
        <div>TIPO</div><div>DATA</div><div>APARELHO</div><div style="text-align:right">VALOR</div>
      </div>
      ${todasMovs.slice(0,12).map(mov=>{
        const dataFmt=mov.data?mov.data.slice(5).replace('-','/'):' — ';
        const tipoConfig={
          saida:{label:'SAÍDA',bg:'rgba(48,209,88,.1)',color:'var(--green)'},
          upgrade:{label:'UPGRADE',bg:'rgba(255,159,10,.1)',color:'var(--urban)'},
          compra:{label:'COMPRA',bg:'rgba(91,139,245,.1)',color:'var(--cart)'}
        }[mov.tipo]||{label:mov.tipo,bg:'var(--bg3)',color:'var(--text3)'};
        return`<div style="display:grid;grid-template-columns:55px 60px 1fr 90px;gap:8px;align-items:center;padding:7px 0;border-top:1px solid var(--border);font-size:12px">
          <span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;background:${tipoConfig.bg};color:${tipoConfig.color}">${tipoConfig.label}</span>
          <span style="color:var(--text3);font-size:11px">${dataFmt}</span>
          <span style="color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${mov.aparelho}</span>
          <span style="text-align:right;font-weight:600">${mov.valor>0?brl(mov.valor):'—'}</span>
        </div>`;
      }).join('')}
    </div>`:''

  return filtersHTML+pendentesHTML+incompletasHTML+semDeviceHTML+kpi1+kpi2+metasHTML+vendedoresHTML+resultHTML+lojaHTML+alertasHTML+ultimasHTML+movsHTML;
}

function renderVendas(){
  // Verificar se veio do botao "ver pendentes"
  const mostrarPendentes = window._showPendentes === true;
  window._showPendentes = false;

  // Montar mapa de movimentacoes por venda
  const movsMap={};
  allMovs.forEach(m=>{
    if(!movsMap[m.parent_id])movsMap[m.parent_id]=[];
    movsMap[m.parent_id].push(m);
  });

  // Filtrar vendas por periodo e loja (sem canceled, sem pending por padrao)
  let v = mostrarPendentes ? getPendentes() : filterByPeriod(allVendas);
  
  // KPIs da aba vendas -- devem bater com o dashboard
  const kpiProdutos = v.reduce((a,x) => a+(x._produtos&&x._produtos.length>0?x._produtos.filter(p=>isPrincipal(p)).length:0),0);
  const kpiBruto = v.reduce((a,x) => a+parseFloat(x.valor_total||0),0);
  const kpiLucro = v.reduce((a,x) => a+parseFloat(x.lucro||0),0);
  const kpiAcess = v.reduce((a,x) => a+(x._produtos?x._produtos.filter(p=>!isPrincipal(p)).reduce((b,p)=>b+parseFloat(p.preco||0),0):0),0);
  if(currentStore!=='ambas')v=v.filter(x=>{const {loja}=getVendaInfo(x);return loja===currentStore;});

  // Enriquecer cada venda
  let rows=v.map(venda=>{
    const {loja,vendedor,atendente}=getVendaInfo(venda);
    const movs=movsMap[venda.id]||[];
    // Usar _produtos se disponivel, fallback para movimentacoes
    const prodList=venda._produtos&&venda._produtos.length>0?venda._produtos:movs;
    const principais=prodList.filter(m=>isPrincipal(m));
    const acesss=prodList.filter(m=>!isPrincipal(m));
    const acessBruto=acesss.reduce((a,m)=>a+parseFloat(m.preco||0),0);
    const acessLucro=acesss.reduce((a,m)=>a+parseFloat(m.preco||0)-parseFloat(m.valor_estoque||0),0);
    const acessResumo=acesss.map(m=>({titulo:m.titulo||m.produto?.titulo||'Acessório',preco:parseFloat(m.preco||0)}));
    // Todos os produtos principais com titulo e etiqueta
    const produtosLista=principais.map(p=>({
      titulo:p.titulo||p.produto?.titulo||'—',
      etiqueta:p.serial||p.apple?.serial||'—',
    }));
    const principal=produtosLista[0]||{titulo:'—',etiqueta:'—'};
    return{
      id:venda.id,
      data:venda.data_saida?.slice(0,10),
      cliente:venda.cliente?.nome||'—',
      produto:principal.titulo,
      etiqueta:principal.etiqueta,
      produtosLista,
      loja:loja||'—',
      vendedor:vendedor||'—',
      atendente:atendente||'—',
      isSocio:vendedor?['gustavo','marcella'].includes(vendedor.toLowerCase()):false,
      valor:parseFloat(venda.valor_total||0),
      acessBruto,
      acessLucro,
      acessResumo,
      lucro:parseFloat(venda.lucro||0),
      nPrincipais:principais.length,
      nAcess:acesss.length,
    };
  });

  // Filtros adicionais
  if(vendasSearch){
    const q=vendasSearch.toLowerCase();
    rows=rows.filter(r=>
      r.cliente.toLowerCase().includes(q)||
      r.produto.toLowerCase().includes(q)||
      r.vendedor.toLowerCase().includes(q)||
      r.atendente.toLowerCase().includes(q)||
      String(r.id).includes(q)||
      r.etiqueta.toLowerCase().includes(q)
    );
  }
  if(vendasLoja!=='todas')rows=rows.filter(r=>r.loja===vendasLoja);
  if(vendasVendedor!=='todos')rows=rows.filter(r=>r.vendedor===vendasVendedor);
  if(vendasAtendente!=='todos')rows=rows.filter(r=>r.atendente===vendasAtendente);
  if(vendasProduto)rows=rows.filter(r=>r.produtosLista&&r.produtosLista.some(p=>p.titulo.toLowerCase().includes(vendasProduto.toLowerCase())));
  // Sort por coluna
  if(vendasSortCol){
    rows=rows.slice().sort((a,b)=>{
      let va=a[vendasSortCol]||'', vb=b[vendasSortCol]||'';
      if(typeof va==='number') return (va-vb)*vendasSortDir;
      return va.toString().localeCompare(vb.toString())*vendasSortDir;
    });
  }

  // Vendedores unicos para o filtro
  const vends=[...new Set(v.map(x=>getVendaInfo(x).vendedor).filter(Boolean))].sort();
  const atends=[...new Set(v.map(x=>getVendaInfo(x).atendente).filter(Boolean))].sort();

  // Totais
  const totalBruto=rows.reduce((a,r)=>a+r.valor,0);
  const totalLucro=rows.reduce((a,r)=>a+r.lucro,0);
  const totalAcess=rows.reduce((a,r)=>a+r.acessBruto,0);
  const totalPrincipais=rows.reduce((a,r)=>a+r.nPrincipais,0);

  const lojaDot=l=>{
    if(l==='cart') return '<div class="loja-dot-cart"></div>';
    if(l==='urban') return '<div class="loja-dot-urban"></div>';
    return '<div class="loja-dot-none"></div>';
  };
  const lojaTag=l=>{
    if(l==='cart')return'<span class="vloja-cart">Cart</span>';
    if(l==='urban')return'<span class="vloja-urban">Urban</span>';
    return'';
  };

  // Loja e periodo agora vivem na sidebar (contexto persistente, brief §7.2)
  const filtersHTML='';

  const sumsHTML=`
    <div class="vsum">
      <div class="vsumcard"><div class="vsumcard-label">Pedidos</div><div class="vsumcard-val">${rows.length}</div></div>
      <div class="vsumcard"><div class="vsumcard-label">Produtos vendidos</div><div class="vsumcard-val" style="color:var(--cart)">${totalPrincipais}</div></div>
      <div class="vsumcard"><div class="vsumcard-label">Total bruto</div><div class="vsumcard-val">${brl(totalBruto)}</div></div>
      <div class="vsumcard"><div class="vsumcard-label">Lucro total</div><div class="vsumcard-val" style="color:var(--green)">${brl(totalLucro)}</div></div>
    </div>`;

  const vendaFiltersHTML=`
    <div class="venda-filters">
      <input class="venda-search" type="text" placeholder="Buscar cliente, produto, vendedor, etiqueta..." value="${vendasSearch}" oninput="filterVendas('search',this.value)">
      <select class="period-select" onchange="filterVendas('loja',this.value)">
        <option value="todas"${vendasLoja==='todas'?' selected':''}>Todas lojas</option>
        <option value="cart"${vendasLoja==='cart'?' selected':''}>Cart</option>
        <option value="urban"${vendasLoja==='urban'?' selected':''}>Urban</option>
      </select>
      <select class="period-select" onchange="filterVendas('vendedor',this.value)">
        <option value="todos">Todos vendedores</option>
        ${vends.map(vd=>'<option value="'+vd+'"'+(vendasVendedor===vd?' selected':'')+'>'+vd.charAt(0).toUpperCase()+vd.slice(1)+'</option>').join('')}
      </select>
      <select class="period-select" onchange="filterVendas('atendente',this.value)">
        <option value="todos">Todos atendentes</option>
        ${atends.map(at=>'<option value="'+at+'"'+(vendasAtendente===at?' selected':'')+'>'+at.charAt(0).toUpperCase()+at.slice(1)+'</option>').join('')}
      </select>
      <input class="venda-search" type="text" placeholder="Filtrar modelo..." value="${vendasProduto}" oninput="filterVendas('produto',this.value)" style="max-width:160px">
      <span style="font-size:12px;color:var(--text3);white-space:nowrap">${rows.length} vendas</span>
    </div>`;

  // Helpers de formatacao
  const shortNome=n=>{if(!n||n==='—')return'—';const p=n.trim().split(/\s+/);return p.length<=2?n:p[0]+' '+p[p.length-1];};
  const shortProd=p=>{if(!p||p==='—')return'—';return p.replace(/^iphone\s+/i,'').replace(/^ipad\s+/i,'iPad ').replace(/^macbook\s+/i,'Mac ').replace(/\s*seminovo\s*$/i,' SN').replace(/\s*lacrado\s*$/i,' LAC').trim();};
  const capNome=n=>n&&n!=='—'?n.charAt(0).toUpperCase()+n.slice(1):'—';

  // Alerta de vendas sem vendedor identificado
  const semVend=v.filter(x=>{const {vendedor}=getVendaInfo(x);return !vendedor;});
  // Alerta de pendentes na aba vendas
  const pendentesVend = getPendentes();
  const alertaPendentesVendHTML = mostrarPendentes
    ? '<div style="background:rgba(255,212,10,.08);border:1px solid rgba(255,212,10,.3);border-radius:10px;padding:10px 14px;margin-bottom:12px;font-size:12px;display:flex;align-items:center;gap:8px">'
      + '<span style="font-size:14px">⏳</span>'
      + '<span style="color:var(--yellow);font-weight:600">Mostrando ' + pendentesVend.length + ' venda' + (pendentesVend.length>1?'s':'') + ' pendente' + (pendentesVend.length>1?'s':'') + ' — não contabilizadas nos totais</span>'
      + '<button onclick="window._showPendentes=false;renderContent()" style="margin-left:auto;padding:3px 10px;background:transparent;border:1px solid rgba(255,212,10,.3);border-radius:6px;color:var(--yellow);font-size:11px;cursor:pointer">Ver todas</button>'
      + '</div>'
    : pendentesVend.length>0
    ? '<div style="background:rgba(255,212,10,.05);border:1px solid rgba(255,212,10,.2);border-radius:10px;padding:8px 14px;margin-bottom:10px;font-size:12px;display:flex;align-items:center;gap:8px">'
      + '<span>⏳</span>'
      + '<span style="color:var(--yellow)">' + pendentesVend.length + ' venda' + (pendentesVend.length>1?'s':'') + ' pendente' + (pendentesVend.length>1?'s':'') + ' no período — não contabilizadas</span>'
      + '<button onclick="verPendentes()" style="margin-left:auto;padding:3px 10px;background:transparent;border:1px solid rgba(255,212,10,.3);border-radius:6px;color:var(--yellow);font-size:11px;cursor:pointer">Ver</button>'
      + '</div>'
    : '';

  const alertaHTML=semVend.length>0?`<div class="vendas-alerta"><span>⚠ ${semVend.length} vendas sem vendedor identificado no obs — podem faltar na contagem</span><button onclick="window._showSemVend=!window._showSemVend;document.getElementById('content').innerHTML=renderVendas()" style="padding:3px 10px;background:transparent;border:1px solid rgba(251,191,36,.4);border-radius:6px;color:var(--yellow);font-size:11px;cursor:pointer">${window._showSemVend?'Ocultar':'Ver estas vendas'}</button></div>`:'';

  // Se flag ativa, mostrar so as sem vendedor
  let displayRows=rows;
  if(window._showSemVend){
    displayRows=semVend.map(venda=>{
      const {loja,vendedor,atendente}=getVendaInfo(venda);
      const movs=movsMap[venda.id]||[];
      const principais=movs.filter(m=>!isAcess(m));
      const acesss=movs.filter(m=>isAcess(m));
      const acessBruto=acesss.reduce((a,m)=>a+parseFloat(m.preco||0),0);
      const principal=principais[0];
      return{id:venda.id,data:venda.data_saida?.slice(0,10),cliente:venda.cliente?.nome||'—',produto:principais[0]?.titulo||principais[0]?.produto?.titulo||'—',etiqueta:principais[0]?.serial||principais[0]?.apple?.serial||'—',produtosLista:principais.map(p=>({titulo:p.titulo||p.produto?.titulo||'—',etiqueta:p.serial||p.apple?.serial||'—'})),loja:loja||'—',vendedor:vendedor||'SEM VENDEDOR',atendente:atendente||'—',valor:parseFloat(venda.valor_total||0),acessBruto,acessLucro:acesss.reduce((a,m)=>a+parseFloat(m.preco||0)-parseFloat(m.valor_estoque||0),0),acessResumo:acesss.map(m=>({titulo:m.titulo||'Acessório',preco:parseFloat(m.preco||0)})),lucro:parseFloat(venda.lucro||0),nPrincipais:principais.length,nAcess:acesss.length,obs:venda.observacoes||''};
    });
  }

  const tableRows=displayRows.slice(0,300).map(r=>{
    const acessTip=r.acessResumo.length>0
      ?r.acessResumo.map(a=>`${a.titulo.replace(/^/i,'').substring(0,25)}: ${brl(a.preco)}`).join(' · ')
      :'';
    const acessCell=r.acessBruto>0
      ?`<div class="vrow-acess" title="${acessTip}" style="cursor:default">
          ${brl(r.acessBruto)}
          ${r.nAcess>0?`<div style="font-size:10px;color:var(--text4)">${r.nAcess} item${r.nAcess>1?'s':''} · ${brl(r.acessLucro)} lucro</div>`:''}
        </div>`
      :'<div class="vrow-acess">—</div>';
    // Data formatada DD/MM e cor por margem
    const dataFmt2 = r.data ? r.data.slice(5).replace('-','/') : '—';
    const mgRow = r.valor>0 ? Math.round((r.lucro/r.valor)*100) : 0;
    const mgColor = mgRow<0?'var(--red)':mgRow<10?'var(--yellow)':mgRow<15?'var(--orange)':'var(--green)';
    return '<div class="vrow">'
      + '<div style="display:flex;align-items:center;justify-content:center">'+lojaDot(r.loja)+'</div>'
      + '<div class="vrow-data">'+dataFmt2+' <span style="font-size:10px;color:var(--text4)">#'+r.id+'</span></div>'
      + '<div class="vrow-cliente" title="'+r.cliente+'">'+shortNome(r.cliente)+'</div>'
      + '<div class="vrow-produto">'
        + r.produtosLista.map(function(p,i){ return '<div style="'+(i>0?'margin-top:2px;border-top:1px solid var(--border);padding-top:2px':'')+'">'+(p.titulo||'—').replace(/^iPhone\s+/i,'').replace(/\s*Seminovo\s*$/i,' SN').trim()+'</div>'; }).join('')
      + '</div>'
      + '<div style="font-size:11px">'
        + (r.vendedor ? '<span style="color:'+(r.isSocio?'var(--gold)':'var(--text2)')+';font-weight:'+(r.isSocio?'700':'500')+'">'+capNome(r.vendedor)+'</span>'+(r.isSocio?' <span style="font-size:9px;color:var(--gold);background:rgba(245,200,66,.1);padding:1px 5px;border-radius:4px">sócio</span>':'') : '')
        + (r.atendente ? '<span style="color:var(--text3)"> · '+capNome(r.atendente)+'</span>' : '')
      + '</div>'
      + acessCell
      + '<div class="vrow-total">'+brl(r.valor)+'</div>'
      + '<div class="vrow-lucro" style="color:'+mgColor+'">'+brl(r.lucro)+'</div>'
      + '</div>';
  }).join('');

  return`${filtersHTML}${alertaPendentesVendHTML}${alertaHTML}${sumsHTML}${vendaFiltersHTML}
    <div class="vtable">
      <div class="vtable-header">
        ${['','Data / ID','Cliente','Produto','Vendedor · Atendente','Acess.','Bruto','Lucro'].map((h,i)=>{
          const col=['id','data','cliente','produto','etiqueta','vendedor','atendente','acessBruto','valor','lucro'][i];
          const sortable=['data','cliente','produto','vendedor','atendente','valor','lucro'].includes(col);
          const active=vendasSortCol===col;
          const icon=active?(vendasSortDir===1?'↑':'↓'):'';
          return sortable
            ?`<div class="vth" style="cursor:pointer;user-select:none;${active?'color:var(--text2)':''}" onclick="sortVendas('${col}')">${h} ${icon}</div>`
            :`<div class="vth">${h}</div>`;
        }).join('')}
      </div>
      ${tableRows||'<div style="padding:20px;text-align:center;color:var(--text4)">Nenhuma venda encontrada</div>'}
    </div>
    ${displayRows.length>300?`<div style="margin-top:10px;font-size:12px;color:var(--text3);text-align:center">Mostrando 300 de ${displayRows.length} vendas</div>`:''}`;
}

function sortVendas(col){
  if(vendasSortCol===col) vendasSortDir*=-1;
  else { vendasSortCol=col; vendasSortDir=1; }
  document.getElementById('content').innerHTML=renderVendas();
}
function filterVendas(tipo,val){
  if(tipo==='search')vendasSearch=val;
  else if(tipo==='loja')vendasLoja=val;
  else if(tipo==='vendedor')vendasVendedor=val;
  else if(tipo==='atendente')vendasAtendente=val;
  else if(tipo==='produto')vendasProduto=val;
  document.getElementById('content').innerHTML=renderVendas();
}


