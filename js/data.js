// ---------------------------------------------------------------------------
// BUSCA POR LOTES, EM PARALELO.
//
// ⚠️ ISTO E O QUE FAZ O PAINEL ABRIR. Ate 02/set/2026 eram CINCO lacos
// sequenciais de 100 em 100 ids (produtos, pagamentos, contas, trocas, origem).
// Com os 6 meses que a tela carrega -- 1.992 vendas em set/2026 -- davam
// ~100 requisicoes EM SERIE antes de qualquer coisa aparecer. A ~200ms cada,
// 20 segundos de tela branca. O dono reclamou de "lento pra abrir" e era isto.
//
// ⚠️ A concorrencia e LIMITADA de proposito. Disparar as 100 de uma vez derruba
// o rate limit do PostgREST e a carga falha inteira -- trocar 20s de espera por
// uma tela de erro nao e conserto.
// ---------------------------------------------------------------------------
async function sbEmLotes(ids, buscaLote, opts = {}){
  const tam = opts.tam || 100, paralelo = opts.paralelo || 8;
  const lotes = [];
  for(let i = 0; i < ids.length; i += tam) lotes.push(ids.slice(i, i + tam));
  const saida = [];
  let feitos = 0;
  for(let i = 0; i < lotes.length; i += paralelo){
    const grupo = lotes.slice(i, i + paralelo);
    const res = await Promise.all(grupo.map(l => buscaLote(l)));
    res.forEach(r => { if(Array.isArray(r)) saida.push(...r); });
    feitos += grupo.length;
    if(opts.aoAvancar) opts.aoAvancar(Math.min(feitos * tam, ids.length), ids.length);
  }
  return saida;
}

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
  const venda_produtos = await sbEmLotes(vendasIds,
    lote => sbGet('venda_produtos', `venda_id=in.(${lote.join(',')})&order=venda_id.asc`),
    { aoAvancar: (feito, total) =>
        setProgress(25 + Math.round(feito/total*35), 'Produtos: '+feito+'/'+total+'...') });

  // Pagamentos por venda -- forma (badge) + agregados (taxa/liquido/parcelas)
  // para as colunas da tabela. Ignora cancelados. NAO altera o lucro.
  setProgress(62,'Carregando pagamentos...');
  const pagamentos = await sbEmLotes(vendasIds, lote => sbGet('pagamentos',
    `select=venda_id,forma_pagamento,conta_bancaria,valor,taxa,taxa_extra,liquido,numero_parcelas,status,data_pagamento,data_compensacao&venda_id=in.(${lote.join(',')})`));
  const pagsMap={};
  (pagamentos||[]).forEach(p=>{ if(p.status!=='canceled'){ (pagsMap[p.venda_id]=pagsMap[p.venda_id]||[]).push(p); } });
  // taxa = custo real da maquininha (Σ taxa; liquido ja e valor-taxa). liquido =
  // o que caiu de fato. parcelas = maior parcelamento entre os pagamentos.
  const pagInfoMap={};
  Object.keys(pagsMap).forEach(vid=>{
    const arr = pagsMap[vid];
    pagInfoMap[vid] = {
      formas: [...new Set(arr.map(p=>p.forma_pagamento).filter(Boolean))],
      taxa: arr.reduce((a,p)=>a+parseFloat(p.taxa||0),0),
      liquido: arr.reduce((a,p)=>a+parseFloat(p.liquido||0),0),
      parcelas: arr.reduce((m,p)=>Math.max(m, parseInt(p.numero_parcelas||1)||1),1),
    };
  });

  // Cadastrador (quem estava LOGADO na FoneNinja na hora do lancamento). Nao
  // existe coluna propria: a FoneNinja so manda esse campo junto das contas a
  // receber, e o sync guarda o JSON cru. Pedimos so o pedaco do cadastrador --
  // o `raw` inteiro sao 14 MB, o recorte sao 146 kB.
  // Serve pra CONFERENCIA (ver conferenciaFontes em vendas-extra.js), nao pra
  // comissao: quem trabalha na maquina logada do colega sai com o nome errado.
  setProgress(63,'Carregando cadastradores...');
  // Tabela de usuarios da FoneNinja (10 linhas): traduz vendedor_id/cadastrador
  // em nome. Sem ela a conferencia nao tem como comparar com a obs.
  funcionariosFN = await sbGet('funcionarios', 'select=id,nome,ativo') || [];
  // Catalogo de origens de cliente (9 linhas): id -> loja. Desde ago/2026 e como
  // o time marca cart/urban. Se falhar, ORIGEM_LOJA fica vazio e a loja continua
  // saindo so da obs -- degrada, nao quebra.
  try {
    const origens = await sbGet('origens_cliente', 'select=id,loja') || [];
    ORIGEM_LOJA = {};
    origens.forEach(o => { if(o.loja) ORIGEM_LOJA[o.id] = o.loja; });
  } catch(e){ console.warn('[origens]', e); }
  const contasCad = await sbEmLotes(vendasIds, lote => sbGet('contas',
    `select=venda_id,cad_id:raw->cadastrador->>id,cad_nome:raw->cadastrador->>nome&venda_id=in.(${lote.join(',')})`));
  const cadMap={};
  (contasCad||[]).forEach(c=>{
    if(c.venda_id && c.cad_nome && !cadMap[c.venda_id]){
      cadMap[c.venda_id] = { id: parseInt(c.cad_id)||null, nome: c.cad_nome };
    }
  });

  // Trocas (aparelhos de ENTRADA do upgrade) por venda -- detalhe modelo/IMEI/valor
  // que a ficha da venda mostra. So existe pras vendas ja capturadas/backfilladas.
  const trocas = await sbEmLotes(vendasIds, lote => sbGet('venda_trocas',
    `select=venda_id,titulo,imei_1,serial,valor&venda_id=in.(${lote.join(',')})`));
  const trocasMap={};
  (trocas||[]).forEach(t=>{ (trocasMap[t.venda_id]=trocasMap[t.venda_id]||[]).push(t); });

  // De qual lead veio cada venda. Tabela do PAINEL (`venda_origem`), populada a
  // mao por scripts/atribuicao/ -- nao vem do sync. A cobertura e parcial de
  // proposito: so tem linha pro periodo ja processado, e o dashboard diz isso na
  // tela em vez de fingir que o resto e zero.
  //   sem linha            = venda nunca avaliada
  //   confianca=sem_origem = avaliada e nenhum lead encontrado
  // Nao sao a mesma coisa, e a diferenca e o que permite medir cobertura.
  // Detalhe e medicoes em docs/ATRIBUICAO-LEADS-VENDAS.md.
  const origemMap={};
  try {
    const origensVenda = await sbEmLotes(vendasIds, lote => sbGet('venda_origem',
      `select=venda_id,canal,origem,nivel,confianca&venda_id=in.(${lote.join(',')})`));
    (origensVenda||[]).forEach(o=>{ origemMap[o.venda_id]=o; });
  } catch(e){ console.warn('[venda_origem]', e); } // degrada: a secao some, o resto abre

  setProgress(65,'Carregando estoque...');
  const estoque = await sbGet('estoque', 'status=eq.available&order=titulo.asc');
  // Dias parado e reparo por aparelho -- as duas parcelas da margem real que so
  // o banco sabe. Degrada sozinho: sem isso a tela mostra a margem bruta e diz
  // o que esta faltando, em vez de inventar zero.
  try{
    if(typeof setMargemExtra === 'function')
      setMargemExtra(await sbGet('v_estoque_margem', 'order=apple_id.asc', 3000));
  }catch(e){ console.warn('[margem] nao carregou dias/reparo:', e.message); }
  const ajustes = await sbGet('ajustes_acessorios', 'order=id.asc', 500);
  
  setProgress(80,'Finalizando...');
  
  // Montar allVendas com _produtos embutidos
  const prodsMap={};
  venda_produtos.forEach(p=>{ if(!prodsMap[p.venda_id]) prodsMap[p.venda_id]=[]; prodsMap[p.venda_id].push(p); });
  
  allVendas = vendas.map(v=>({
    ...v,
    formas_pagamento: (pagInfoMap[v.id]||{}).formas || [],
    taxa_venda: (pagInfoMap[v.id]||{}).taxa || 0,
    liquido_venda: (pagInfoMap[v.id]||{}).liquido || 0,
    parcelas: (pagInfoMap[v.id]||{}).parcelas || 1,
    // Campos que o codigo espera
    data_saida: v.data_saida,
    valor_total: v.valor_total,
    lucro: v.lucro,
    observacoes: v.observacoes,
    qtd_produtos: v.qtd_produtos,
    cliente: { nome: v.cliente_nome, telefone: v.cliente_tel, instagram: v.cliente_insta, cidade: v.cliente_cidade },
    // Pagamentos crus por forma (nao-cancelados) -- a ficha da venda mostra
    // valor/parcelas/taxa/liquido/conta de cada forma. NAO altera o lucro.
    _pagamentos: pagsMap[v.id] || [],
    // Aparelhos de entrada da troca (modelo/IMEI/valor). Vazio ate o sync capturar.
    _trocas: trocasMap[v.id] || [],
    // {id, nome} de quem estava logado ao lancar. Null quando a venda nao gerou
    // conta a receber -- ai a conferencia simplesmente nao opina sobre ela.
    _cadastrador: cadMap[v.id] || null,
    // Linha de `venda_origem`, ou null se a venda nunca foi avaliada.
    _origem: origemMap[v.id] || null,
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
// Carga enxuta do papel `bancada`: so estoque + bancada. Nao e otimizacao, e
// consequencia -- o RLS por papel devolve zero linha em vendas/custos/folha, e
// a carga cheia gastaria a franquia do celular do Vitinho pra montar array
// vazio. Tambem evita o fetch do estoque "fresco" da FoneNinja, que traz
// valor_estoque pelo proxy.
// ESTOQUE "FRESCO" DA FONENINJA -- fora do caminho critico (18/ago/2026).
//
// ⚠️ MERGE, nao substituicao. Antes era `if(ae.length>0) estoqueItens=ae;`: a
// lista inteira era trocada pelo payload do ERP. Dois problemas nisso:
//   1. campo que o payload nao traz (valor_estoque, ultimo_fornecedor) sumia --
//      e com a regra de "ausente NAO e zero" da margem real, o custo virava
//      null e a margem desaparecia da tela do socio;
//   2. se o ERP devolvesse menos itens, o estoque encolhia sem aviso.
// Agora ele so PREENCHE campo por campo, por id, e nunca remove ninguem.
async function atualizarEstoqueFresco(hd){
  const dp = encodeURIComponent(JSON.stringify({first:0,rows:1000,sortField:'id',sortOrder:-1,
    filters:{global:{value:null,matchMode:'contains'},status:{value:'available',matchMode:'equals'}}}));
  try{
    const re = await fetch(BASE+'/apples?dt_params='+dp, {headers:hd});
    if(!re.ok){
      console.warn('[estoque fresco] HTTP '+re.status+' — mantendo o do Supabase');
      return;
    }
    const de = await re.json();
    const frescos = de.payload?.data || de.data || [];
    if(!frescos.length) return;

    const porId = {};
    (estoqueItens||[]).forEach(i => { porId[i.id] = i; });
    let atualizados = 0, novos = 0;
    frescos.forEach(f => {
      const atual = porId[f.id];
      if(!atual){ estoqueItens.push({ ...f, produto:{ titulo:f.titulo } }); novos++; return; }
      // Só sobrescreve o que o ERP realmente mandou. undefined/null não apaga.
      Object.keys(f).forEach(k => { if(f[k] !== undefined && f[k] !== null) atual[k] = f[k]; });
      atualizados++;
    });
    console.log(`[estoque fresco] ${atualizados} atualizados, ${novos} novos (total ${estoqueItens.length})`);
    if(currentTab === 'estoque') renderContent();
  }catch(e){
    console.warn('[estoque fresco] indisponivel — mantendo o do Supabase:', e.message);
  }
}

async function loadBancadaData(){
  const ov=document.getElementById('loading-overlay');
  if(ov) ov.style.display='flex';
  allVendas=[];allMovs=[];ajustesAcessorios=[];
  try{
    setProgress(30,'Carregando estoque...');
    // VIEW, nao tabela: `v_estoque_vitrine` nao tem `valor_estoque` nem
    // `ultimo_fornecedor`. Desde 17/ago a tabela `estoque` e so do socio -- RLS
    // e por linha, nao por coluna, entao esconder custo exigia trocar a fonte.
    const estoque = await sbGet('v_estoque_vitrine', 'order=titulo.asc');
    estoqueItens = (estoque||[]).map(i=>({ ...i, produto:{ titulo:i.titulo } }));
    setProgress(70,'Carregando bancada...');
    if(typeof carregarBancada === 'function') await carregarBancada();
    // O Vitinho e `bancada` E atende no balcao. Se ele tem chave, a tela "Meu
    // dia" existe pra ele -- e ela le VIEW, nao tabela: o RLS devolve zero em
    // `vendas` pra ele, e e assim que tem que ser.
    if(typeof temChaveComercial === 'function' && temChaveComercial()){
      setProgress(85,'Carregando seus números...');
      if(typeof carregarMeuDia === 'function') await carregarMeuDia();
    }
    setProgress(100,'Pronto!');
  }catch(e){
    console.error('[bancada] carga falhou:', e);
  }
  if(ov) ov.style.display='none';
  const app=document.getElementById('app');
  if(app) app.style.display='grid';
  updateStatusBar();
  renderContent();
}

// Carga do papel `comercial`: SO as views. Nao e otimizacao, e consequencia --
// o RLS devolve zero linha em vendas/produtos/pagamentos pra ele, entao a carga
// cheia seriam 40+ requisicoes na franquia do celular dele pra montar array
// vazio. Ver docs/PLANO-UPGRADE-2026-08.md §2.3.
async function loadComercialData(){
  const ov=document.getElementById('loading-overlay');
  if(ov) ov.style.display='flex';
  allVendas=[];allMovs=[];ajustesAcessorios=[];estoqueItens=[];
  try{
    setProgress(35,'Carregando seus números...');
    if(typeof carregarMeuDia === 'function') await carregarMeuDia();
    setProgress(70,'Carregando o estoque...');
    if(typeof carregarVitrine === 'function') await carregarVitrine();
    // Quem esta esperando aparelho volta na PRIMEIRA tela do pos-venda, antes
    // de qualquer busca -- por isso vem na carga e nao sob demanda.
    setProgress(90,'Carregando o pós-venda...');
    if(typeof carregarPosVenda === 'function') await carregarPosVenda();
    setProgress(100,'Pronto!');
  }catch(e){
    console.error('[comercial] carga falhou:', e);
  }
  if(ov) ov.style.display='none';
  const app=document.getElementById('app');
  if(app) app.style.display='grid';
  updateStatusBar();
  renderContent();
}

// Carga do papel `rh`: SO folha_mensal, custos da area Funcionarios e o PIX.
// ⚠️ Mesma logica do `comercial`, e pelo mesmo motivo: o RLS devolve ZERO linha
// em vendas/venda_produtos/estoque pra ela. Chamar loadFromSupabase() aqui
// gastaria ~100 requisicoes pra montar array vazio -- e, pior, esconderia o
// fato de que ela nao tem acesso atras de uma tela lenta e vazia.
async function loadRhData(){
  const ov=document.getElementById('loading-overlay');
  if(ov) ov.style.display='flex';
  allVendas=[];allMovs=[];estoqueItens=[];
  try{
    setProgress(40,'Carregando a folha...');
    if(typeof carregarRh === 'function') await carregarRh();
    setProgress(100,'Pronto!');
  }catch(e){
    console.error('[rh] carga falhou:', e);
  }
  if(ov) ov.style.display='none';
  const app=document.getElementById('app');
  if(app) app.style.display='grid';
  updateStatusBar();
  renderContent();
}

async function loadAllData(){
  if(typeof papelReal === 'function' && papelReal() === 'rh') return loadRhData();
  if(typeof papelReal === 'function' && papelReal() === 'comercial') return loadComercialData();
  if(typeof perfilSoBancada === 'function' && perfilSoBancada()) return loadBancadaData();
  document.getElementById('loading-overlay').style.display='flex';
  allVendas=[];allMovs=[];estoqueItens=[];
  // Kick off carregamento da tabela de precos em paralelo (cache global)
  carregarTabelaPrecos();
  // Carregar dados persistidos do Supabase (loadCustosFromSB ja garante os
  // salarios do mes via garantirSalariosDoMes; recarrega para pegar os novos)
  await loadCustosFromSB();
  await loadCustosFromSB();
  await loadEquipeFromSB();
  const hd={'apikey':SB_KEY,'Authorization':'Bearer '+(await sbAuthToken()),'Accept':'application/json'};
  try{
    // Tentar Supabase primeiro (muito mais rapido)
    if(USE_SUPABASE){
      try{
        const result = await loadFromSupabase();
        // ⚠️ O estoque "fresco" da FoneNinja NAO bloqueia mais o boot (18/ago/2026).
        // Era um await no meio da carga: 300-900ms de Edge Function MAIS a
        // latencia da FoneNinja atras, e ja deu 504 duas vezes. O dono via a
        // tela do admin travar enquanto a do Vitinho -- que nao faz essa
        // chamada -- abria na hora. Agora ela sai depois do primeiro desenho.
        setProgress(100,'Pronto!');
        await carregarTabelaPrecos();
        document.getElementById('loading-overlay').style.display='none';
        updateStatusBar();
        renderContent();
        atualizarEstoqueFresco(hd);   // sem await: chega depois, se chegar
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
      if(!r.ok) throw new Error('Falha ao carregar vendas (HTTP '+r.status+')');
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

// btn e ignorado: o estado ativo vem de currentTab, entao a navegacao funciona
// tanto da sidebar quanto do bottom-tab ou de um link dentro de uma tela.
function setTab(t,btn){
  currentTab=t;
  marcarAtivoShell();
  renderContent();
  updateStatusBar();
  document.querySelector('.main')?.scrollTo({top:0});
}

function setStore(s,btn){
  currentStore=s;
  marcarAtivoShell();
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
    name.textContent='Cart System';
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
    // VIEW e nao tabela: `tabela_precos` e fechada em eh_socio(), e quem vende
    // precisa do preco pra cotar. A view devolve as mesmas linhas ativas pra
    // qualquer perfil -- sem custo, que ali nem existe. O casamento do preco
    // segue no mesmo getPrecoVenda(); so mudou de onde o cache foi preenchido.
    const rows = await sbGet('v_tabela_precos', 'order=categoria.asc,modelo.asc', 1000);
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
  // Papel `bancada` nao carrega venda nem periodo -- "0 vendas" ali seria uma
  // afirmacao falsa sobre o dia, nao um dado.
  if(typeof perfilSoBancada === 'function' && perfilSoBancada()){
    const fora = typeof bncAbertas === 'function' ? bncAbertas().length : 0;
    sb.textContent = estoqueItens.length+' em estoque · '+fora+' na assistência';
    sb.style.color = '';
    return;
  }
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

