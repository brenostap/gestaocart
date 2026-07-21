async function loadFromSupabase(){
  setProgress(10,'Carregando vendas...');
  // Vendas dos ultimos 6 meses (filtro de periodo feito no dashboard)
  const now=new Date();
  const cutoff=new Date(now.getFullYear(),now.getMonth()-5,1).toISOString();
  
  // Buscar vendas
  const vendas = await sbGet('vendas', `data_saida=gte.${cutoff}&order=data_saida.desc`);
  
  setProgress(25,'Carregando produtos...');
  // Buscar TODOS os produtos (iPhones + acessorios) sem filtro de is_principal
  const vendasIds = vendas.map(v=>v.id);
  let venda_produtos = [];
  for(let i=0;i<vendasIds.length;i+=100){
    const lote = vendasIds.slice(i,i+100);
    const prods = await sbGet('venda_produtos', `venda_id=in.(${lote.join(',')})&order=venda_id.asc`);
    venda_produtos = venda_produtos.concat(prods);
    setProgress(25+Math.round(i/vendasIds.length*35), 'Produtos: '+(i+lote.length)+'/'+vendasIds.length+'...');
  }

  setProgress(65,'Carregando estoque...');
  const estoque = await sbGet('estoque', 'status=eq.available&order=titulo.asc');
  const ajustes = await sbGet('ajustes_acessorios', 'order=id.asc', 500);
  
  setProgress(80,'Finalizando...');
  
  // Montar allVendas com _produtos embutidos
  const prodsMap={};
  venda_produtos.forEach(p=>{ if(!prodsMap[p.venda_id]) prodsMap[p.venda_id]=[]; prodsMap[p.venda_id].push(p); });
  
  allVendas = vendas.map(v=>({
    ...v,
    // Campos que o codigo espera
    data_saida: v.data_saida,
    valor_total: v.valor_total,
    lucro: v.lucro,
    observacoes: v.observacoes,
    qtd_produtos: v.qtd_produtos,
    cliente: { nome: v.cliente_nome, telefone: v.cliente_tel, instagram: v.cliente_insta, cidade: v.cliente_cidade },
    _produtos: (prodsMap[v.id]||[]).map(p=>({
      ...p,
      apple_id: p.apple_id,
      titulo: p.titulo,
      serial: p.serial,
      imei_1: p.imei_1,
      preco: p.preco,
      valor_estoque: p.valor_estoque,
    }))
  }));

  estoqueItens = estoque.map(i=>({
    ...i,
    produto: { titulo: i.titulo },
    // ultimo_fornecedor ja e string no Supabase -- getFornNome() resolve os dois formatos
  }));

  // Sem movimentacoes -- usamos _produtos diretamente
  allMovs = [];
  ajustesAcessorios = ajustes || [];
  
  return { vendas: allVendas.length, estoque: estoqueItens.length };
}
async function loadAllData(){
  document.getElementById('loading-overlay').style.display='flex';
  allVendas=[];allMovs=[];estoqueItens=[];
  // Kick off carregamento da tabela de precos em paralelo (cache global)
  carregarTabelaPrecos();
  // Carregar dados persistidos do Supabase
  await loadCustosFromSB();
  await gerarSalariosDoMes();
  await loadCustosFromSB(); // recarregar com os novos salarios
  await loadEquipeFromSB();
  const hd={'apikey':SB_KEY,'Authorization':'Bearer '+(await sbAuthToken()),'Accept':'application/json'};
  try{
    // Tentar Supabase primeiro (muito mais rapido)
    if(USE_SUPABASE){
      try{
        const result = await loadFromSupabase();
        setProgress(95,'Carregando estoque FoneNinja...');
        // Buscar estoque atualizado do FoneNinja (dados mais frescos)
        const dp=encodeURIComponent(JSON.stringify({first:0,rows:1000,sortField:'id',sortOrder:-1,filters:{global:{value:null,matchMode:'contains'},status:{value:'available',matchMode:'equals'}}}));
        const re=await fetch(BASE+'/apples?dt_params='+dp,{headers:hd});
        const de=await re.json();
        const ae=de.payload?.data||de.data||[];
        if(ae.length>0) estoqueItens=ae;
        setProgress(100,'Pronto!');
        await carregarTabelaPrecos();
        document.getElementById('loading-overlay').style.display='none';
        updateStatusBar();
        renderContent();
        iniciarPolling();
        return;
      }catch(sbErr){
        console.warn('Supabase falhou, usando FoneNinja:', sbErr.message);
        USE_SUPABASE=false;
        allVendas=[];allMovs=[];estoqueItens=[];
      }
    }
    setProgress(5,'Carregando vendas...');
    for(let p=1;p<=8;p++){
      const r=await fetch(BASE+'/vendas?sort=data_saida:desc&page='+p+'&perPage=100&filters[status]=completed',{headers:hd});
      const d=await r.json();const a=d.data||[];
      allVendas=allVendas.concat(a);
      setProgress(5+p*4,'Vendas: '+allVendas.length+'...');
      if(a.length<100)break;
    }
    // Buscar detalhes (produtos) das vendas do periodo atual em paralelo
    setProgress(42,'Carregando produtos das vendas...');
    const vendasPeriodo=filterByPeriodStatic(allVendas,'mes');
    const BATCH=20;
    let done=0;
    for(let i=0;i<vendasPeriodo.length;i+=BATCH){
      const lote=vendasPeriodo.slice(i,i+BATCH);
      const results=await Promise.all(lote.map(v=>
        fetch(BASE+'/vendas/'+v.id,{headers:hd}).then(r=>r.json()).catch(()=>null)
      ));
      results.forEach((res,j)=>{
        if(!res) return;
        const detail=res.data||res;
        const idx=allVendas.findIndex(v=>v.id===lote[j].id);
        if(idx>=0) allVendas[idx]._produtos=detail.produtos||[];
      });
      done+=lote.length;
      setProgress(42+Math.round(done/vendasPeriodo.length*30),'Produtos: '+done+'/'+vendasPeriodo.length+'...');
    }
    setProgress(74,'Carregando movimentações (acessórios)...');
    for(let p=1;p<=8;p++){
      const r=await fetch(BASE+'/movimentacoes?filters[parent_type]=venda&sort=created_at:desc&page='+p+'&perPage=100',{headers:hd});
      const d=await r.json();const a=d.payload?.data||d.data||[];
      allMovs=allMovs.concat(a);
      setProgress(74+p*1,'Movs: '+allMovs.length+'...');
      if(a.length<100)break;
    }
    setProgress(82,'Carregando estoque...');
    const dp=encodeURIComponent(JSON.stringify({first:0,rows:1000,sortField:'id',sortOrder:-1,filters:{global:{value:null,matchMode:'contains'},status:{value:['available'],matchMode:'in'}}}));
    const dc=encodeURIComponent(JSON.stringify(['produto.titulo','status','imei_1','bateria','serial','valor_estoque']));
    const re=await fetch(BASE+'/apples?dt_params='+dp+'&searchable_columns='+dc,{headers:hd});
    const de=await re.json();
    estoqueItens=(de.data||[]).filter(i=>i.status==='available');
    setProgress(100,'Pronto!');
    await carregarTabelaPrecos();
    await new Promise(r=>setTimeout(r,300));
    document.getElementById('loading-overlay').style.display='none';
    document.getElementById('app').style.display='block';
    updateHeaderLogo();
    updateStatusBar();
    iniciarPolling();
    renderContent();
  }catch(e){
    document.getElementById('loading-text').textContent='Erro: '+e.message;
    setTimeout(()=>{document.getElementById('loading-overlay').style.display='none';doLogout();},3000);
  }
}

async function reloadData(){await loadAllData();}

function setTab(t,btn){
  currentTab=t;
  document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderContent();
  updateStatusBar();
}

function setStore(s,btn){
  currentStore=s;
  document.querySelectorAll('.pill').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  updateHeaderLogo();
  renderContent();

  updateStatusBar();
}

// Atualiza logo + nome + subtítulo do header conforme loja selecionada
function updateHeaderLogo(){
  const img=document.getElementById('header-logo');
  const name=document.getElementById('header-logo-name');
  const sub=document.getElementById('header-logo-sub');
  if(!img||!name) return;
  if(currentStore==='urban'){
    img.src=LOGO_URBAN_ICON;
    name.textContent='Urban Phone';
    name.style.color='var(--urban-text)';
    if(sub) sub.textContent='Dashboard';
  } else if(currentStore==='cart'){
    img.src=LOGO_PHONECART_ICON;
    name.textContent='Phone Cart';
    name.style.color='var(--text)';
    if(sub) sub.textContent='Dashboard';
  } else {
    img.src=LOGO_PHONECART_ICON;
    name.textContent='Phone Cart · Urban';
    name.style.color='var(--text)';
    if(sub) sub.textContent='Visão consolidada';
  }
}
function setPeriod(){
  const val=document.getElementById('psel')?.value||'mes';
  if(val==='custom'){
    currentPeriod='custom';
    const s=document.getElementById('date-start')?.value;
    const e=document.getElementById('date-end')?.value;
    if(s){customDateStart=s;customDateEnd=e||s;
  updateStatusBar();
}
  
  updateStatusBar();
} else {
    currentPeriod=val;
    customDateStart='';customDateEnd='';
  
  updateStatusBar();
}
  renderContent();

  updateStatusBar();
}
function setCustomDate(){
  const s=document.getElementById('date-start')?.value;
  const e=document.getElementById('date-end')?.value;
  if(!s) return;
  currentPeriod='custom';
  customDateStart=s;
  customDateEnd=e||s;
  document.getElementById('psel').value='custom';
  renderContent();
}

// CALC
const TABELA_PRECOS = [{"modelo": "iPhone 12", "cap": "64GB", "preco": 1450}, {"modelo": "iPhone 12", "cap": "128GB", "preco": 1650}, {"modelo": "iPhone 12", "cap": "256GB", "preco": 1750}, {"modelo": "iPhone 12 Pro", "cap": "128GB", "preco": 1950}, {"modelo": "iPhone 12 Pro", "cap": "256GB", "preco": 2150}, {"modelo": "iPhone 12 Pro Max", "cap": "128GB", "preco": 2150}, {"modelo": "iPhone 12 Pro Max", "cap": "256GB", "preco": 2290}, {"modelo": "iPhone 13", "cap": "128GB", "preco": 1950}, {"modelo": "iPhone 13", "cap": "256GB", "preco": 2050}, {"modelo": "iPhone 13 Pro", "cap": "128GB", "preco": 2390}, {"modelo": "iPhone 13 Pro", "cap": "256GB", "preco": 2690}, {"modelo": "iPhone 13 Pro Max", "cap": "128GB", "preco": 2850}, {"modelo": "iPhone 13 Pro Max", "cap": "256GB", "preco": 3050}, {"modelo": "iPhone 14", "cap": "128GB", "preco": 2190}, {"modelo": "iPhone 14", "cap": "256GB", "preco": 2290}, {"modelo": "iPhone 14 Plus", "cap": "128GB", "preco": 2390}, {"modelo": "iPhone 14 Plus", "cap": "256GB", "preco": 2550}, {"modelo": "iPhone 14 Pro", "cap": "128GB", "preco": 2890}, {"modelo": "iPhone 14 Pro", "cap": "256GB", "preco": 3090}, {"modelo": "iPhone 14 Pro Max", "cap": "128GB", "preco": 3390}, {"modelo": "iPhone 14 Pro Max", "cap": "256GB", "preco": 3590}, {"modelo": "iPhone 14 Pro Max", "cap": "512GB", "preco": 3650}, {"modelo": "iPhone 15", "cap": "128GB", "preco": 2850}, {"modelo": "iPhone 15", "cap": "256GB", "preco": 2950}, {"modelo": "iPhone 15 Plus", "cap": "128GB", "preco": 3090}, {"modelo": "iPhone 15 Plus", "cap": "256GB", "preco": 3290}, {"modelo": "iPhone 15 Pro", "cap": "128GB", "preco": 3650}, {"modelo": "iPhone 15 Pro", "cap": "256GB", "preco": 3850}, {"modelo": "iPhone 15 Pro", "cap": "512GB", "preco": 3990}, {"modelo": "iPhone 15 Pro Max", "cap": "256GB", "preco": 4350}, {"modelo": "iPhone 15 Pro Max", "cap": "512GB", "preco": 4590}, {"modelo": "iPhone 16", "cap": "128GB", "preco": 3850}, {"modelo": "iPhone 16", "cap": "256GB", "preco": 3990}, {"modelo": "iPhone 16e", "cap": "128GB", "preco": 2790}, {"modelo": "iPhone 16 Plus", "cap": "128GB", "preco": 4190}, {"modelo": "iPhone 16 Plus", "cap": "256GB", "preco": 4390}, {"modelo": "iPhone 16 Pro", "cap": "128GB", "preco": 4750}, {"modelo": "iPhone 16 Pro", "cap": "256GB", "preco": 5050}, {"modelo": "iPhone 16 Pro Max", "cap": "256GB", "preco": 5550}, {"modelo": "iPhone 16 Pro Max", "cap": "512GB", "preco": 5850}];

// Cache editavel da tabela (comeca com os valores padrao, sobrescreve com Supabase)
let _tabelaCache = JSON.parse(JSON.stringify(TABELA_PRECOS));

function getTabelaPrecos(){ return _tabelaCache || TABELA_PRECOS; }

async function loadTabelaFromSB(){
  try {
    const r = await fetch(SB_URL+'/rest/v1/tabela_precos?order=modelo.asc&limit=500', {
      headers:{'apikey':SB_KEY,'Authorization':'Bearer '+SB_TOKEN}
    });
    const data = await r.json();
    if(Array.isArray(data) && data.length > 0){
      // Garantir que o cache esta inicializado
      if(!_tabelaCache) _tabelaCache = JSON.parse(JSON.stringify(TABELA_PRECOS));
      // Sobrescrever o cache com os valores do banco
      data.forEach(row => {
        const idx = _tabelaCache.findIndex(p => p.modelo===row.modelo && p.cap===row.cap);
        if(idx >= 0) _tabelaCache[idx].preco = row.preco;
        else _tabelaCache.push({ modelo: row.modelo, cap: row.cap, preco: row.preco });
      });
      console.log('[tabela] Carregada do Supabase:', data.length, 'preços');
    }
  } catch(e){ console.error('[tabela] Erro ao carregar:', e); }
}

async function savePrecoTabela(modelo, cap, preco){
  // Atualizar cache local
  const idx = _tabelaCache.findIndex(p => p.modelo===modelo && p.cap===cap);
  if(idx >= 0) _tabelaCache[idx].preco = preco;

  // Salvar no Supabase
  try {
    const res = await fetch(SB_URL+'/rest/v1/tabela_precos', {
      method: 'POST',
      headers:{
        'apikey':SB_KEY,'Authorization':'Bearer '+SB_TOKEN,
        'Content-Type':'application/json',
        'Prefer':'resolution=merge-duplicates'
      },
      body: JSON.stringify({ modelo, cap, preco, updated_at: new Date().toISOString() })
    });
    if(res.ok){
      console.log('[tabela] Salvo:', modelo, cap, '→ R$'+preco);
      // Re-renderizar a tabela
      if(currentTab==='tabela') renderContent();
    }
  } catch(e){ console.error('[tabela] Erro ao salvar:', e); }
}

function editarPrecoTabela(modelo, cap, precoAtual, el){
  // Criar input inline
  const input = document.createElement('input');
  input.type = 'number';
  input.value = precoAtual;
  input.style.cssText = 'width:80px;background:rgba(91,139,245,.15);border:1px solid var(--cart);border-radius:6px;color:var(--text);font-size:13px;font-weight:700;padding:4px 6px;text-align:center;outline:none';
  
  const parent = el.parentNode;
  parent.replaceChild(input, el);
  input.focus();
  input.select();

  function confirmar(){
    const novo = parseInt(input.value);
    if(novo > 0 && novo !== precoAtual){
      savePrecoTabela(modelo, cap, novo);
    } else {
      if(currentTab==='tabela') renderContent();
    }
  }

  input.addEventListener('blur', confirmar);
  input.addEventListener('keydown', e => {
    if(e.key === 'Enter') { input.blur(); }
    if(e.key === 'Escape') { 
      input.removeEventListener('blur', confirmar);
      if(currentTab==='tabela') renderContent();
    }
  });
}

// Cache da tabela de precos (pode ser sobrescrito pelo Supabase)





async function savePrecoBD(modelo, capacidade, preco_sn){
  const id = (modelo + '_' + capacidade).toLowerCase().replace(/\s+/g,'_');
  try {
    const r = await fetch(SB_URL+'/rest/v1/tabela_precos', {
      method: 'POST',
      headers: {
        'apikey': SB_KEY, 'Authorization': 'Bearer '+SB_TOKEN,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({ id, modelo, capacidade, preco_sn, updated_at: new Date().toISOString() })
    });
    if(r.ok){
      // Atualizar cache local
      if(!_tabelaCache) _tabelaCache = [...TABELA_PRECOS];
      const idx = _tabelaCache.findIndex(p => p.modelo === modelo && p.cap === capacidade);
      if(idx >= 0) _tabelaCache[idx].preco = preco_sn;
      console.log('[tabela] salvo:', modelo, capacidade, preco_sn);
      return true;
    }
  } catch(e){ console.error('[tabela] erro save:', e); }
  return false;
}

// Lookup de preco de tabela por titulo do produto
function getPrecoTabela(titulo) {
  if(!titulo) return null;
  const t = titulo.toLowerCase().replace(/seminovo|lacrado|sn|lac/gi,'').trim();
  
  // Extrair capacidade
  const capMatch = t.match(/(\d+)\s*gb/i);
  if(!capMatch) return null;
  const cap = capMatch[1] + 'GB';
  
  // Extrair modelo -- normalizar titulo
  let modelo = titulo
    .replace(/\s*\d+GB.*$/i,'')    // remover capacidade em diante
    .replace(/Seminovo|Lacrado|SN|LAC/gi,'')
    .replace(/\s+/g,' ').trim();
  
  // Normalizar variacoes de escrita
  modelo = modelo.replace(/Iphone/i,'iPhone');
  if(!/^iPhone/i.test(modelo)) modelo = 'iPhone ' + modelo;
  
  // Buscar na tabela
  const entry = getTabelaPrecos().find(p => {
    const pCap = p.cap.toLowerCase();
    const pMod = p.modelo.toLowerCase();
    const mLow = modelo.toLowerCase();
    const capLow = cap.toLowerCase();
    return pMod === mLow && pCap === capLow;
  });
  return entry ? entry.preco : null;
}

function getPeriodoLabel(){
  const meses=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const now = new Date();
  if(currentPeriod==='mes') return meses[now.getMonth()]+' '+now.getFullYear();
  if(currentPeriod==='hoje') return 'Hoje · '+now.toLocaleDateString('pt-BR');
  if(currentPeriod==='semana') return 'Esta semana';
  if(currentPeriod==='tudo') return 'Todo histórico';
  if(currentPeriod==='custom') return 'Personalizado';
  if(currentPeriod && currentPeriod.match(/^\d{4}-\d{2}$/)){
    const [y,m] = currentPeriod.split('-').map(Number);
    return meses[m-1]+' '+y;
  }
  return currentPeriod;
}

function getLojaLabel(){
  if(currentStore==='ambas') return null;
  if(currentStore==='cart') return '📱 Phone Cart';
  if(currentStore==='urban') return '🏙 Urban';
  return currentStore;
}

function updateStatusBar(){
  const sb = document.getElementById('status-bar');
  if(!sb) return;
  const periodo = getPeriodoLabel();
  const loja = getLojaLabel();
  const lojaStr = loja ? ' · '+loja : '';
  const diasRestantes = (()=>{
    if(currentPeriod !== 'mes') return '';
    const now = new Date();
    const ultimoDia = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
    const hoje = now.getDate();
    if(hoje === ultimoDia) return ' · ⚠️ Último dia do mês';
    return ' · Dia '+hoje+'/'+ultimoDia;
  })();
  sb.textContent = allVendas.length+' vendas · '+estoqueItens.length+' em estoque · '+periodo+lojaStr+diasRestantes;
  sb.style.color = currentPeriod==='mes' && new Date().getDate()===new Date(new Date().getFullYear(),new Date().getMonth()+1,0).getDate() 
    ? 'var(--yellow)' : '';
}

