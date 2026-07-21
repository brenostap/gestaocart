// -- MOVIMENTACOES -------------------------------------------------------------
function renderMovs(){
  // Usar cache se disponivel
  const cacheKey = movsView + '_' + currentPeriod + '_' + currentStore;
  if(movsCache[cacheKey]) return movsCache[cacheKey];

  const toggleHTML=`
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap">
      <div class="estoque-toggle">
        <button class="etoggle${movsView==='compras'?' active':''}" onclick="setMovsView('compras')">Saídas</button>
        <button class="etoggle${movsView==='entradas'?' active':''}" onclick="setMovsView('entradas')">Entradas</button>
        <button class="etoggle${movsView==='clientes'?' active':''}" onclick="setMovsView('clientes')">Clientes</button>
      </div>
      <input class="venda-search" type="text" placeholder="Buscar modelo, fornecedor, etiqueta..." 
        value="${movsSearchStr}" oninput="movsSearchStr=this.value;renderMovsLive()" 
        style="flex:1;min-width:200px;max-width:280px">
      ${movsView==='compras'?'<select class="period-select" onchange="movsFilterTipo=this.value;renderMovsLive()" style="border-radius:8px"><option value="todos">Todos</option><option value="principal">Produtos</option><option value="acessorio">Acessórios</option></select>':''}
    </div>`;

  if(movsView==='entradas') return toggleHTML + renderMovsEntradas();
  if(movsView==='clientes') return toggleHTML + renderMovsClientes();
  return toggleHTML + renderMovsCompras();
}

function renderMovsLive(){
  const el = document.getElementById('content');
  if(el) el.innerHTML = renderMovs();
}

function setMovsView(v){
  movsView=v;
  movsCache={};
  document.getElementById('content').innerHTML=renderMovs();
}


function renderMovsClientes(){
  const q=movsSearchStr.toLowerCase();
  const v=filterByPeriod(allVendas);

  const clientesMap={};
  v.forEach(x=>{
    const cli=x.cliente||{};
    const cliId=x.cliente_id||cli.id;
    const cliNome=x.cliente_nome||cli.nome||'—';
    const cliTel=x.cliente_tel||cli.telefone||'—';
    const cliInsta=x.cliente_insta||cli.instagram||'—';
    const cliCidade=x.cliente_cidade||cli.cidade||'—';
    if(!cliId) return;
    if(!clientesMap[cliId]) clientesMap[cliId]={
      id:cliId, nome:cliNome, telefone:cliTel,
      instagram:cliInsta, cidade:cliCidade,
      compras:0, iphones:0, bruto:0, lucro:0, ultimaCompra:'',
      vendas:[]
    };
    const c=clientesMap[cliId];
    c.compras++;
    if(x._produtos) c.iphones+=x._produtos.filter(p=>isPrincipal(p)).length;
    c.bruto+=parseFloat(x.valor_total||0);
    c.lucro+=parseFloat(x.lucro||0);
    if(!c.ultimaCompra||x.data_saida>c.ultimaCompra) c.ultimaCompra=x.data_saida?.slice(0,10)||'';
    c.vendas.push({
      id:x.id,
      data:x.data_saida?.slice(0,10)||'',
      valor:parseFloat(x.valor_total||0),
      produtos:x._produtos?.filter(p=>isPrincipal(p)).map(p=>(p.titulo||'').replace(/^iPhone\s+/i,'').replace(/\s*Seminovo\s*$/i,' SN').trim())||[]
    });
  });

  const clientes=Object.values(clientesMap)
    .filter(c=>!q||(c.nome||'').toLowerCase().includes(q)||(c.cidade||'').toLowerCase().includes(q)||(c.instagram||'').toLowerCase().includes(q))
    .sort((a,b)=>b.bruto-a.bruto);

  const totalClientes=clientes.length;
  const recorrentes=clientes.filter(c=>c.compras>1);
  const totalBruto=clientes.reduce((a,c)=>a+c.bruto,0);
  const porCidade=Object.entries(clientes.reduce((a,c)=>{if(c.cidade&&c.cidade!=='—'){a[c.cidade]=(a[c.cidade]||0)+1;}return a;},{})).sort((a,b)=>b[1]-a[1]).slice(0,4);

  const kpis='<div class="metric-grid" style="margin-bottom:14px">'
    +'<div class="metric"><div class="metric-label">Clientes no período</div><div class="metric-value" style="color:var(--cart)">'+totalClientes+'</div><div class="metric-sub">'+v.length+' vendas</div></div>'
    +'<div class="metric"><div class="metric-label">Recorrentes</div><div class="metric-value">'+recorrentes.length+'</div><div class="metric-sub">'+(totalClientes>0?Math.round(recorrentes.length/totalClientes*100):0)+'% do total</div></div>'
    +'<div class="metric"><div class="metric-label">Ticket médio</div><div class="metric-value">'+brl(totalClientes>0?Math.round(totalBruto/totalClientes):0)+'</div><div class="metric-sub">por cliente</div></div>'
    +'<div class="metric"><div class="metric-label">Top cidade</div><div class="metric-value" style="font-size:16px">'+(porCidade[0]?porCidade[0][0]:'—')+'</div><div class="metric-sub">'+(porCidade[0]?porCidade[0][1]+' clientes':'')+'</div></div>'
    +'</div>';

  // Header da tabela
  const header='<div style="display:grid;grid-template-columns:1fr 100px 110px 60px 80px 90px;gap:0;padding:9px 16px;background:rgba(91,139,245,.06);border-bottom:1px solid var(--border);font-size:10px;color:var(--text3);font-weight:700;letter-spacing:.07em;text-transform:uppercase">'
    +'<div>CLIENTE</div>'
    +'<div style="text-align:left">CIDADE</div>'
    +'<div style="text-align:right">BRUTO</div>'
    +'<div style="text-align:center">COMPRAS</div>'
    +'<div style="text-align:center">PRODUTOS</div>'
    +'<div style="text-align:right">ÚLTIMA</div>'
    +'</div>';

  const rows=clientes.map(function(c){
    const tel=c.telefone&&c.telefone!=='—'?c.telefone.replace(/\D/g,''):'';
    const insta=c.instagram&&c.instagram!=='—'?c.instagram.replace('@',''):'';
    const waLink=tel?'https://wa.me/55'+tel:'';
    const instaLink=insta?'https://instagram.com/'+insta:'';
    const expandId='cli-expand-'+c.id;
    const dataFmt=c.ultimaCompra?c.ultimaCompra.slice(5).replace('-','/'):'—';
    const nomeCurto=c.nome.split(' ').slice(0,2).join(' ');

    const linksHtml=(waLink?'<a href="'+waLink+'" target="_blank" onclick="event.stopPropagation()" style="font-size:11px;color:#25d366;text-decoration:none;display:inline-flex;align-items:center;gap:3px">📱 WA</a>':'')
      +(instaLink?' <a href="'+instaLink+'" target="_blank" onclick="event.stopPropagation()" style="font-size:11px;color:#c13584;text-decoration:none;margin-left:4px">📷</a>':'');

    const rowHtml='<div style="display:grid;grid-template-columns:1fr 100px 110px 60px 80px 90px;gap:0;padding:10px 16px;border-bottom:1px solid var(--border);font-size:12px;align-items:center;cursor:pointer;transition:background .15s" onmouseover="this.style.background=\'rgba(91,139,245,.04)\'" onmouseout="this.style.background=\'\'" onclick="toggleClienteExpand(this.getAttribute(\'data-cid\'))" data-cid="'+expandId+'">'
      +'<div style="min-width:0">'
        +'<div style="display:flex;align-items:center;gap:6px;overflow:hidden">'
          +'<span style="font-size:13px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+nomeCurto+'</span>'
          +(c.compras>1?'<span style="flex-shrink:0;font-size:10px;background:rgba(91,139,245,.15);color:var(--cart);padding:1px 6px;border-radius:4px;font-weight:700">'+c.compras+'x</span>':'')
        +'</div>'
        +(linksHtml?'<div style="margin-top:3px">'+linksHtml+'</div>':'')
      +'</div>'
      +'<div style="font-size:12px;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+(c.cidade!=='—'?c.cidade:'—')+'</div>'
      +'<div style="font-size:13px;font-weight:600;text-align:right">'+brl(c.bruto)+'</div>'
      +'<div style="font-size:12px;color:var(--text3);text-align:center">'+c.compras+'</div>'
      +'<div style="font-size:12px;font-weight:600;text-align:center;color:var(--cart)">'+c.iphones+'</div>'
      +'<div style="font-size:11px;color:var(--text3);text-align:right">'+dataFmt+'</div>'
      +'</div>';
    const expandHtml='<div id="'+expandId+'" style="display:none;padding:12px 16px 14px;background:rgba(91,139,245,.03);border-bottom:1px solid var(--border)">'
      +'<div style="font-size:10px;color:var(--text3);font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin-bottom:10px">Histórico de compras</div>'
      +c.vendas.sort(function(a,b){return b.data.localeCompare(a.data);}).map(function(vd){
        return '<div style="display:flex;align-items:center;gap:12px;padding:6px 0;border-top:1px solid var(--border)">'
          +'<span style="font-size:11px;color:var(--text3);min-width:40px">'+vd.data.slice(5).replace('-','/')+'</span>'
          +'<span style="font-size:11px;color:var(--cart);cursor:pointer;font-weight:600;text-decoration:underline" onclick="event.stopPropagation();irParaVenda('+vd.id+')">#'+vd.id+'</span>'
          +'<span style="font-size:12px;color:var(--text2);flex:1">'+( vd.produtos.join(' + ')||'—')+'</span>'
          +'<span style="font-size:12px;font-weight:600">'+brl(vd.valor)+'</span>'
          +'</div>';
      }).join('')
      +'</div>';

    return rowHtml+expandHtml;
  }).join('');

  return kpis
    +'<div style="background:var(--glass);border-radius:12px;overflow:hidden;border:1px solid var(--border)">'
    +header
    +(rows||'<div style="padding:20px;text-align:center;color:var(--text4)">Nenhum cliente encontrado</div>')
    +'</div>';
}

function toggleClienteExpand(id){
  const el=document.getElementById('cli-expand-'+id);
  if(el) el.style.display=el.style.display==='none'?'block':'none';
}

function verPendentes(){
  currentTab='vendas';
  vendasSearch='';
  vendasLoja='todas';
  vendasVendedor='todos';
  vendasAtendente='todos';
  vendasProduto='';
  // Usar flag especial para mostrar pendentes
  window._showPendentes=true;
  document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(b=>{ if(b.textContent.trim().startsWith('Vendas')) b.classList.add('active'); });
  renderContent();
}

function irParaVenda(id){
  vendasSearch=String(id);
  currentTab='vendas';
  document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(b=>{ if(b.textContent.includes('Vendas')) b.classList.add('active'); });
  renderContent();
}


function renderMovsCompras(){
  const v = filterByPeriod(allVendas);
  const q = movsSearchStr.toLowerCase();

  // Extrair todos os produtos vendidos (usando _produtos se disponivel, fallback allMovs)
  const movsMap={};
  allMovs.forEach(m=>{ if(!movsMap[m.parent_id])movsMap[m.parent_id]=[]; movsMap[m.parent_id].push(m); });

  const saidas = [];
  v.forEach(x => {
    let prods = [];
    if(x._produtos && x._produtos.length > 0){
      prods = x._produtos.map(p=>({...p, parent_id:x.id, data_saida:x.data_saida,
        atendente: getVendaInfo(x).atendente, vendedor: getVendaInfo(x).vendedor, loja: getVendaInfo(x).loja}));
    } else {
      prods = (movsMap[x.id]||[]).map(m=>({...m, data_saida:x.data_saida,
        atendente: getVendaInfo(x).atendente, vendedor: getVendaInfo(x).vendedor, loja: getVendaInfo(x).loja}));
    }
    saidas.push(...prods);
  });

  const filtradas = saidas.filter(p => {
    const passaQ = !q || (p.titulo||'').toLowerCase().includes(q) || (p.serial||'').toLowerCase().includes(q) || (p.imei_1||'').toLowerCase().includes(q);
    const passaTipo = movsFilterTipo==='todos' || (movsFilterTipo==='principal'&&isPrincipal(p)) || (movsFilterTipo==='acessorio'&&isAcess(p));
    return passaQ && passaTipo;
  });

  // KPIs
  const iphones = filtradas.filter(p => isPrincipal(p));
  const acess   = filtradas.filter(p => isAcess(p));
  const brutoIphone = iphones.reduce((a,p)=>a+parseFloat(p.preco||0),0);
  const brutoAcess  = acess.reduce((a,p)=>a+parseFloat(p.preco||0),0);
  const lucroIphone = iphones.reduce((a,p)=>a+parseFloat(p.preco||0)-parseFloat(p.valor_estoque||0),0);
  const lucroAcess  = acess.reduce((a,p)=>a+parseFloat(p.preco||0)-parseFloat(p.valor_estoque||0),0);

  const rows = filtradas.slice(0,300).map(p => {
    const titulo = p.titulo||p.produto?.titulo||'—';
    const tituloShort = titulo.replace(/^iPhone\s+/i,'').replace(/\s*Seminovo\s*$/i,' SN').replace(/\s*Lacrado\s*$/i,' LAC').trim();
    const preco = parseFloat(p.preco||0);
    const custo = parseFloat(p.valor_estoque||0);
    const lucro = preco - custo;
    const mg = preco>0 ? Math.round(lucro/preco*100) : 0;
    const mgCls = mg<10?'bat-red':mg<20?'bat-yellow':'bat-green';
    const data = (p.data_saida||'').slice(5,10).replace('-','/');
    const serial = p.serial||'—';
    const tipo = isPrincipal(p) ? '' : '<span style="font-size:10px;color:var(--blue);font-weight:600">ACESS</span>';
    return `<div class="vrow" style="display:grid;grid-template-columns:45px 1fr 60px 80px 70px 60px;gap:0;padding:8px 12px;border-bottom:1px solid var(--border)">
      <div style="font-size:11px;color:var(--text4)">${data}</div>
      <div style="font-size:12px;color:var(--text)">${tituloShort} ${tipo} <span style="color:var(--text4)">${serial}</span></div>
      <div style="font-size:11px;color:var(--text3);text-align:right">${custo>0?brl(custo):'—'}</div>
      <div style="font-size:12px;font-weight:600;text-align:right">${brl(preco)}</div>
      <div style="font-size:12px;font-weight:600;text-align:right;color:var(--green)">${brl(lucro)}</div>
      <div class="${mgCls}" style="font-size:11px;text-align:right">${mg}%</div>
    </div>`;
  }).join('');

  return `
    <div class="metric-grid" style="margin-bottom:14px">
      <div class="metric"><div class="metric-label">iPhones / Produtos</div><div class="metric-value blue">${iphones.length}</div><div class="metric-sub">${brl(brutoIphone)} bruto</div></div>
      <div class="metric"><div class="metric-label">Acessórios</div><div class="metric-value">${acess.length}</div><div class="metric-sub">${brl(brutoAcess)} bruto</div></div>
      <div class="metric"><div class="metric-label">Lucro Produtos</div><div class="metric-value green">${brl(lucroIphone)}</div><div class="metric-sub">margem ${brutoIphone>0?Math.round(lucroIphone/brutoIphone*100):0}%</div></div>
      <div class="metric"><div class="metric-label">Lucro Acessórios</div><div class="metric-value green">${brl(lucroAcess)}</div><div class="metric-sub">margem ${brutoAcess>0?Math.round(lucroAcess/brutoAcess*100):0}%</div></div>
    </div>
    <div style="background:var(--card);border-radius:10px;overflow:hidden;border:1px solid var(--border)">
      <div style="display:grid;grid-template-columns:45px 1fr 60px 80px 70px 60px;gap:0;padding:8px 12px;border-bottom:1px solid var(--border2);font-size:11px;color:var(--text4);font-weight:600;letter-spacing:.04em">
        <div>DATA</div><div>PRODUTO</div><div style="text-align:right">CUSTO</div><div style="text-align:right">VENDA</div><div style="text-align:right">LUCRO</div><div style="text-align:right">MG</div>
      </div>
      ${rows||'<div style="padding:20px;text-align:center;color:var(--text4)">Nenhum produto encontrado</div>'}
    </div>
    ${filtradas.length>300?`<div style="margin-top:8px;font-size:12px;color:var(--text3);text-align:center">Mostrando 300 de ${filtradas.length}</div>`:''}
  `;
}


function renderMovsEntradas(){
  const q = movsSearchStr.toLowerCase();
  const items = estoqueItens || [];

  const entradas = [];
  items.forEach(function(item){
    const movs = item.movimentacoes || [];
    const titulo = item.titulo || (item.produto && item.produto.titulo) || '—';
    const tituloShort = titulo.replace(/^iPhone\s+/i,'').replace(/\s*Seminovo\s*$/i,' SN').replace(/\s*Lacrado\s*$/i,' LAC').trim();
    if(movs.length > 0){
      movs.forEach(function(mov){
        const isUpgrade = mov.parent_type === 'upgrade';
        const vendaId = isUpgrade ? (mov.parent && mov.parent.parent_id ? mov.parent.parent_id : null) : null;
        const forn = isUpgrade
          ? ('Upgrade #' + (vendaId || mov.parent_id))
          : (getFornNome(item) || 'Sem fornecedor');
        entradas.push({
          titulo: titulo, tituloShort: tituloShort,
          serial: item.serial || '—',
          imei: item.imei_1 || '—',
          bateria: parseInt(item.bateria || 0),
          custo: parseFloat(mov.preco || item.valor_estoque || 0),
          fornecedor: forn,
          isUpgrade: isUpgrade,
          vendaId: vendaId,
          data: (mov.created_at || '').slice(0,10),
          status: item.status
        });
      });
    } else {
      entradas.push({
        titulo: titulo, tituloShort: tituloShort,
        serial: item.serial || '—',
        imei: item.imei_1 || '—',
        bateria: parseInt(item.bateria || 0),
        custo: parseFloat(item.valor_estoque || 0),
        fornecedor: getFornNome(item) || 'Sem fornecedor',
        isUpgrade: false, vendaId: null,
        data: (item.created_at || '').slice(0,10),
        status: item.status
      });
    }
  });

  const filtradas = entradas.filter(function(e){
    if(!q) return true;
    return e.tituloShort.toLowerCase().includes(q) ||
           e.serial.toLowerCase().includes(q) ||
           (getFornNome({ultimo_fornecedor: e.fornecedor}) || e.fornecedor).toLowerCase().includes(q) ||
           (e.imei || '').includes(q);
  }).sort(function(a,b){ return b.data.localeCompare(a.data); });

  const totalCusto = filtradas.reduce(function(a,e){ return a+e.custo; }, 0);
  const upgrades = filtradas.filter(function(e){ return e.isUpgrade; }).length;
  const compras = filtradas.length - upgrades;
  const disponiveis = filtradas.filter(function(e){ return e.status === 'available'; }).length;

  const kpis = '<div class="metric-grid" style="margin-bottom:14px">'
    + '<div class="metric"><div class="metric-label">Total entradas</div><div class="metric-value" style="color:var(--cart)">' + filtradas.length + '</div><div class="metric-sub">' + disponiveis + ' disponíveis</div></div>'
    + '<div class="metric"><div class="metric-label">De compras</div><div class="metric-value">' + compras + '</div><div class="metric-sub">fornecedores</div></div>'
    + '<div class="metric"><div class="metric-label">De upgrades</div><div class="metric-value" style="color:var(--orange)">' + upgrades + '</div><div class="metric-sub">trocas clientes</div></div>'
    + '<div class="metric"><div class="metric-label">Custo total</div><div class="metric-value">' + brl(totalCusto) + '</div><div class="metric-sub">valor entrada</div></div>'
    + '</div>';

  const rows = filtradas.slice(0,300).map(function(e){
    const bat = e.bateria;
    const batTxt = bat > 0 ? bat + '%' : '—';
    const batCls = bat === 0 ? 'bat-dash' : bat < 80 ? 'bat-red' : bat < 85 ? 'bat-yellow' : 'bat-green';
    const dot = e.status === 'available'
      ? '<span style="width:6px;height:6px;border-radius:50%;background:var(--green);display:inline-block;margin-right:4px"></span>'
      : '<span style="width:6px;height:6px;border-radius:50%;background:var(--text4);display:inline-block;margin-right:4px"></span>';
    const fornSpan = e.isUpgrade
      ? '<span style="color:var(--orange);font-size:11px">⬆ ' + e.fornecedor + (e.vendaId ? ' <span style="color:var(--cart);cursor:pointer;text-decoration:underline" onclick="irParaVenda(' + e.vendaId + ')">ver venda</span>' : '') + '</span>'
      : '<span style="color:var(--text3);font-size:11px">' + e.fornecedor + '</span>';
    const imeiShort = e.imei !== '—' ? e.imei.slice(-6) : '—';
    return '<div style="display:grid;grid-template-columns:50px 1fr 55px 70px 1fr 80px;gap:0;padding:8px 14px;border-bottom:1px solid var(--border);font-size:12px;align-items:center">'
      + '<div style="color:var(--text4);font-size:11px">' + e.data.slice(5).replace('-','/') + '</div>'
      + '<div>' + dot + '<span style="color:var(--text);font-weight:500">' + e.tituloShort + '</span> <span style="color:var(--text4);font-size:11px">' + e.serial + '</span></div>'
      + '<div class="' + batCls + '">' + batTxt + '</div>'
      + '<div style="color:var(--text3);font-size:11px">' + imeiShort + '</div>'
      + '<div>' + fornSpan + '</div>'
      + '<div style="text-align:right;font-weight:600">' + (e.custo > 0 ? brl(e.custo) : '—') + '</div>'
      + '</div>';
  }).join('');

  return kpis
    + '<div style="background:var(--card);border-radius:12px;overflow:hidden;border:1px solid var(--border)">'
    + '<div style="display:grid;grid-template-columns:50px 1fr 55px 70px 1fr 80px;gap:0;padding:8px 14px;border-bottom:1px solid var(--border2);font-size:10px;color:var(--text3);font-weight:600;letter-spacing:.06em;text-transform:uppercase;align-items:center">'
    + '<div>DATA</div><div>PRODUTO</div><div>BAT</div><div>IMEI</div><div>ORIGEM</div><div style="text-align:right">CUSTO</div>'
    + '</div>'
    + (rows || '<div style="padding:20px;text-align:center;color:var(--text4)">Nenhuma entrada encontrada</div>')
    + (filtradas.length > 300 ? '<div style="padding:10px;text-align:center;font-size:11px;color:var(--text3)">Mostrando 300 de ' + filtradas.length + '</div>' : '')
    + '</div>';
}


function renderMovsEstoque(){
  const q = movsSearchStr.toLowerCase();
  const disponiveis = estoqueItens || [];

  // Filtrar e mostrar cada aparelho com sua origem
  const filtrados = disponiveis.filter(i=>{
    const titulo=(i.produto?.titulo||'').toLowerCase();
    const serial=(i.serial||'').toLowerCase();
    const forn=(getFornNome(i)||'').toLowerCase();
    return !q || titulo.includes(q) || serial.includes(q) || forn.includes(q);
  });

  // Agrupar por fornecedor
  const porFornecedor = {};
  filtrados.forEach(i=>{
    const forn = getFornNome(i) || 'Sem fornecedor';
    if(!porFornecedor[forn]) porFornecedor[forn]={count:0,custo:0,itens:[]};
    porFornecedor[forn].count++;
    porFornecedor[forn].custo += parseFloat(i.valor_estoque||0);
    porFornecedor[forn].itens.push(i);
  });

  // KPI resumo
  const totalEstoque = filtrados.reduce((a,i)=>a+parseFloat(i.valor_estoque||0),0);
  const fornCount = Object.keys(porFornecedor).length;

  const kpis=`
    <div class="metric-grid-3" style="margin-bottom:16px">
      <div class="metric">
        <div class="metric-label">Em estoque</div>
        <div class="metric-value blue">${filtrados.length}</div>
        <div class="metric-sub">unidades disponíveis</div>
      </div>
      <div class="metric">
        <div class="metric-label">Custo total em estoque</div>
        <div class="metric-value">${brl(totalEstoque)}</div>
        <div class="metric-sub">valor de aquisição</div>
      </div>
      <div class="metric">
        <div class="metric-label">Fornecedores ativos</div>
        <div class="metric-value">${fornCount}</div>
        <div class="metric-sub">no estoque atual</div>
      </div>
    </div>`;

  // Tabela individual
  const rows = filtrados.slice(0,500).map(i=>{
    const titulo=(i.produto?.titulo||'').replace(/^iPhone\s+/i,'').replace(/\s*Seminovo\s*$/i,' SN').replace(/\s*Lacrado\s*$/i,' LAC').trim();
    const serial=i.serial||'—';
    const bat=parseInt(i.bateria||0);
    const batTxt=bat>0?bat+'%':'—';
    const batCls=bat===0?'bat-dash':bat<80?'bat-red':bat<85?'bat-yellow':'bat-green';
    const forn=getFornNome(i)||'—';
    const custo=parseFloat(i.valor_estoque||0);
    const tituloShort=(i.produto?.titulo||'').replace(/^iPhone\s+/i,'').replace(/\s*Seminovo\s*$/i,' SN').replace(/\s*Lacrado\s*$/i,' LAC').trim();
    const corLabel=estNomeHtml(tituloShort, i.produto?.titulo||'');

    return `<div style="display:grid;grid-template-columns:70px 2.5fr 70px 60px 1fr 100px;gap:0;padding:8px 12px;border-bottom:1px solid var(--border);font-size:12px;align-items:center">
      <div class="est-etiq">${serial}</div>
      <div style="color:var(--text2)">${corLabel}</div>
      <div class="est-bat ${batCls}">${batTxt}</div>
      <div style="color:var(--text3)">${i.imei_1?i.imei_1.slice(-6):'—'}</div>
      <div style="color:var(--text3)">${forn}</div>
      <div style="text-align:right;color:var(--text2)">${custo>0?brl(custo):'—'}</div>
    </div>`;
  }).join('');

  // Resumo por fornecedor
  const fornRows = Object.entries(porFornecedor)
    .sort((a,b)=>b[1].count-a[1].count)
    .map(([nome,d])=>`
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px">
        <span style="color:var(--text2);font-weight:500">${nome}</span>
        <span style="display:flex;gap:20px;color:var(--text3)">
          <span>${d.count} un</span>
          <span style="color:var(--text2)">${brl(d.custo)}</span>
        </span>
      </div>`).join('');

  return kpis + `
    <div style="display:grid;grid-template-columns:1fr 280px;gap:16px;align-items:start">
      <div>
        <div style="font-size:11px;color:var(--text4);font-weight:600;letter-spacing:.05em;margin-bottom:8px">ITENS EM ESTOQUE (${filtrados.length})</div>
        <div style="background:var(--card);border-radius:10px;overflow:hidden;border:1px solid var(--border)">
          <div style="display:grid;grid-template-columns:70px 2.5fr 70px 60px 1fr 100px;gap:0;padding:8px 12px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text4);font-weight:600;letter-spacing:.04em">
            <div>ETIQUETA</div><div>PRODUTO</div><div>BATERIA</div><div>IMEI</div><div>FORNECEDOR</div><div style="text-align:right">CUSTO</div>
          </div>
          ${rows||'<div style="padding:20px;text-align:center;color:var(--text4)">Nenhum item</div>'}
        </div>
      </div>
      <div>
        <div style="font-size:11px;color:var(--text4);font-weight:600;letter-spacing:.05em;margin-bottom:8px">POR FORNECEDOR</div>
        <div style="background:var(--card);border-radius:10px;padding:12px 16px;border:1px solid var(--border)">
          ${fornRows}
        </div>
      </div>
    </div>`;
}

