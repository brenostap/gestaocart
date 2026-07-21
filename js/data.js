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
// -- TABELA DE PRECOS ------------------------------------------------------
// Fonte unica: public.tabela_precos no Supabase (espelha a planilha oficial).
// Cada linha: {id, categoria, modelo, capacidade, cores, cor, condicao,
//              preco_upgrade, preco_varejo, sujeito_disponibilidade, ativo}
// `cores` e a lista informativa; `cor` so vem preenchida quando o preco
// depende da cor (ex.: 17 Pro Lacrado). Antes havia 3 fontes concorrentes
// (array fixo no codigo, cache local e a tabela) — agora e so esta.
let _precos = [];

function getTabelaPrecos(){ return _precos; }

// Nome completo p/ casar com o titulo do estoque ("iPhone 13 Pro").
function precoNomeCompleto(p){
  const cat = (p.categoria||'').trim(), mod = (p.modelo||'').trim();
  return _normPreco(mod).startsWith(_normPreco(cat)) ? mod : (cat+' '+mod).trim();
}

async function loadTabelaFromSB(){
  try {
    const rows = await sbGet('tabela_precos', 'ativo=is.true&order=categoria.asc,modelo.asc', 1000);
    _precos = (rows||[]).map(p => {
      const nome = precoNomeCompleto(p);
      return Object.assign({}, p, {
        preco_upgrade: p.preco_upgrade==null ? null : parseFloat(p.preco_upgrade),
        preco_varejo:  p.preco_varejo ==null ? null : parseFloat(p.preco_varejo),
        nome_completo: nome,
        modelo_norm: _normPreco(nome),
        cor_norm: p.cor ? _normPreco(p.cor) : null
      });
    });
    _precosCache = _precos;              // usado por getPrecoVendaSync()
    await carregarUltimaSync();
    console.log('[tabela] '+_precos.length+' preços carregados');
  } catch(e){
    console.error('[tabela] erro ao carregar:', e);
    _precos = []; _precosCache = [];
  }
  return _precos;
}

// A planilha do Google e a fonte oficial dos precos: o app so le, nunca edita.
let _ultimaSyncPrecos = null;

async function carregarUltimaSync(){
  try {
    const r = await sbGet('sync_log', 'tabela=eq.tabela_precos', 1);
    _ultimaSyncPrecos = (r && r[0]) || null;
  } catch(e){ _ultimaSyncPrecos = null; }
  return _ultimaSyncPrecos;
}

function textoUltimaSync(){
  if(!_ultimaSyncPrecos || !_ultimaSyncPrecos.last_sync) return 'nunca sincronizado';
  const d = new Date(_ultimaSyncPrecos.last_sync);
  const txt = d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
  return _ultimaSyncPrecos.status==='erro'
    ? 'falhou em '+txt
    : 'atualizado em '+txt;
}

// Dispara a Edge Function que le a planilha oficial e aplica sobre a tabela.
async function sincronizarPrecos(){
  const btn = document.getElementById('btn-sync-precos');
  if(btn){ btn.disabled = true; btn.textContent = 'Atualizando…'; }
  try {
    const token = await sbAuthToken();
    const r = await fetch(SB_URL+'/functions/v1/sync-precos', {
      method:'POST',
      headers:{'apikey':SB_KEY,'Authorization':'Bearer '+token,'Content-Type':'application/json'}
    });
    const out = await r.json().catch(()=>({}));
    if(r.status===401){ sessaoExpirou(); return; }
    if(!r.ok || out.ok===false) throw new Error(out.error || ('HTTP '+r.status));
    _precosCache = null;
    await loadTabelaFromSB();
    await carregarUltimaSync();
    if(currentTab==='tabela') renderContent();
    alert(`Preços atualizados da planilha.\n\n${out.total} linhas · ${out.novos} nova(s) · ${out.desativados} removida(s)`);
  } catch(e){
    alert('Não foi possível atualizar da planilha:\n\n'+e.message);
  } finally {
    if(btn){ btn.disabled = false; btn.textContent = '↻ Atualizar da planilha'; }
  }
}

// Preco de varejo a partir do titulo do item de estoque (usado no cruzamento).
function getPrecoTabela(titulo){
  const r = getPrecoVenda({ titulo }, _precos);
  return r && r.varejo != null ? r.varejo : null;
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

