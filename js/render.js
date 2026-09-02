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
  // Combinar -- injetar parent_id nos produtos de _produtos para compatibilidade com atMap.
  // isCancelado: usa a definicao canonica (equipe.js) -- custo 0 && imei. Antes havia uma
  // copia local com "|| preco>=200" que escondia acessorios sem custo (venda real) do
  // dashboard, divergindo da folha que os contava. Removida para unificar.
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
  // Dois lucros de acessorio, de proposito:
  //   lAcess     -> o da LOJA. O brinde custa, e o resultado do mes conta ele.
  //   lAcessCom  -> o que forma COMISSAO. Brinde nao desconta de quem entregou
  //                 (decisao do dono, 20/ago/2026; ver ehBrinde em core.js).
  const lAcessCom=ac.reduce((a,m)=>a+lucroAcessComissao(m),0);

  // Socios/Loja -- vendas da casa (gustavo, marcella, breno, ou sem vendedor identificado)
  const SOCIOS_KEYS=['gustavo','marcella','breno'];
  // Derivado das chaves oficiais (core.js), nunca escrito a mao -- em jul/2026 uma
  // lista a mao deixou Leo e Gabi de fora do dashboard. Inclui QUEM SAIU de proposito:
  // venda antiga da Pietra continua sendo dela, nao "venda da loja".
  const EQUIPE_KEYS=[...new Set([...VO_KEYS, ...AT_KEYS])];
  const isVendaLoja=(x)=>{
    const {vendedor}=getVendaInfo(x);
    if(!vendedor) return true;
    const vl=vendedor.toLowerCase().trim();
    // ⚠️ A IA sai daqui ANTES de tudo: ela nao recebe comissao (igual a loja),
    // mas contar as duas juntas apaga quantas vendas o atendimento automatico
    // fechou -- que e o numero que cruza com o lead. Ver ehIA em core.js.
    if(ehIA(vl)) return false;
    if(SOCIOS_KEYS.some(s=>vl.includes(s))) return true;
    if(['cart','urban','loja'].includes(vl)) return true;
    if(!EQUIPE_KEYS.some(e=>vl.includes(e))) return true;   // VO_KEYS ja esta dentro de EQUIPE_KEYS
    return false;
  };
  // Unidades principais da venda -- mesma conta dos dois baldes (loja e IA).
  const unDaVenda=(x)=> (x._produtos&&x._produtos.length>0)
    ? x._produtos.filter(p=>isPrincipal(p)).length
    : prPeriod.filter(p=>p.parent_id===x.id).length;
  // `iaMap` e por chave, nao um total: a Maju e da Cart e a Duda e da Urban, e
  // e essa separacao que serve pro cruzamento com os leads de cada projeto.
  const iaMap={}; IA_KEYS.forEach(k=>iaMap[k]={vendas:0,units:0,bruto:0,linhas:[]});
  let iaVendas=0,iaUnits=0,lojaVendas=0,lojaUnits=0;
  v.forEach(x=>{
    const un=unDaVenda(x);
    const k=ehIA(getVendaInfo(x).vendedor);
    if(k){
      iaVendas++; iaUnits+=un;
      iaMap[k].vendas++; iaMap[k].units+=un;
      iaMap[k].bruto+=parseFloat(x.valor_total||0);
      iaMap[k].linhas.push({id:x.id, data:x.data_saida, units:un});
      return;
    }
    if(isVendaLoja(x)){ lojaVendas++; lojaUnits+=un; }
  });

  // -- Detalhe por venda ----------------------------------------------------
  // voMap[k].linhas / atMap[k].linhas guardam a MESMA soma que o agregado, venda
  // a venda. Sao preenchidos DENTRO do laco que soma -- e o que garante que a
  // exportacao do fechamento (documento de prova) nunca divirja da tela: nao ha
  // segunda conta, so a mesma conta guardada em detalhe. Ver js/fechamento.js.
  const dadosVenda = x => ({
    id: x.id,
    data: x.data_saida,
    cliente: (x.cliente && x.cliente.nome) || '',
  });

  // Vendedores online -- por numero de VENDAS (nao unidades)
  const VO=VO_KEYS; // ['isa','mel','david','pietra'] -- vendedores online oficiais
  // ⚠️ O mapa cobre TAMBEM os atendentes, porque atendente tambem vende aparelho
  // (R$25/un flat, ver comissaoDeAparelho em core.js). Sem a chave dele aqui o
  // fechamento nao tinha de onde tirar o numero e pagava R$0 enquanto a tela de
  // Equipe mostrava a comissao -- divergencia calada, achada em 31/ago/2026.
  const VO_MAPA=[...new Set([...VO, ...atKeysVigentes()])];
  const voMap={};VO_MAPA.forEach(k=>voMap[k]={vendas:0,units:0,linhas:[]});
  v.forEach(x=>{
    const {vendedor}=getVendaInfo(x);
    const m=matchNome(vendedor,VO_MAPA);
    if(m){
      voMap[m].vendas++;
      // Usar _produtos se disponivel (apple_id = iPhone), senao qtd_produtos como fallback
      const un = (x._produtos&&x._produtos.length>0)
        ? x._produtos.filter(p=>isPrincipal(p)).length
        : prPeriod.filter(p=>p.parent_id===x.id).length;
      voMap[m].units+=un;
      voMap[m].linhas.push({...dadosVenda(x), units:un});
    }
  });

  // Atendentes -- destaque no bruto de acessorios
  const AT=atKeysVigentes(); // atendentes do periodo (inclui VO que atende direto, ago/2026+)
  const atMap={};AT.forEach(k=>atMap[k]={la:0,qt:0,brutoAcess:0,linhas:[]});
  const vAtend={},vendaPorId={};
  v.forEach(x=>{vendaPorId[x.id]=x;const {atendente}=getVendaInfo(x);const m=matchNome(atendente,AT);if(m)vAtend[x.id]=m;});
  // Uma linha por VENDA (nao por acessorio): ~700 itens/mes viram ~250 linhas.
  const atLinha={};
  ac.forEach(m=>{
    const a=vAtend[m.parent_id];if(!a)return;
    const l=lucroAcessComissao(m);
    atMap[a].la+=l;
    atMap[a].brutoAcess+=parseFloat(m.preco||0);
    atMap[a].qt++;
    const chave=a+'#'+m.parent_id;
    let linha=atLinha[chave];
    if(!linha){
      linha={...dadosVenda(vendaPorId[m.parent_id]||{id:m.parent_id}), bruto:0, lucro:0, qt:0};
      atLinha[chave]=linha;
      atMap[a].linhas.push(linha); // por referencia: somar abaixo ja atualiza a lista
    }
    linha.bruto+=parseFloat(m.preco||0);
    linha.lucro+=l;
    linha.qt++;
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
    const bruto=parseFloat(a.valor_bruto||0);
    const lucro=bruto*margem;
    atMap[k].brutoAcess += bruto;
    atMap[k].la += lucro;
    // Entra como linha propria: sem isso a coluna do fechamento nao fecharia com
    // o total nos meses que tem ajuste manual (ex.: mar/2026).
    atMap[k].linhas.push({id:null, ajuste:true, desc:a.descricao||'ajuste manual',
      data:null, cliente:'—', bruto, lucro, qt:0});
  });

  // Comissao do vendedor: fonte unica em core.js (curva de 80 un -> R$35)
  const voTot=VO_MAPA.reduce((a,k)=>a+comissaoDeAparelho(k,voMap[k].units),0);
  const lojaTot=0; // loja nao tem comissao
  const atTot=AT.reduce((a,k)=>a+atMap[k].la*0.25,0); // 25% lucro acess. por atendente
  // 5% da Anne incide sobre o lucro de acessorio DA REDE -- e tambem e comissao,
  // entao tambem ignora brinde.
  const anneBonus=lAcessCom*0.05;

  return{bruto,lucro,units,unPrincipal,unAcess,vendaAcess,lAcess,lAcessCom,voMap,atMap,voTot,atTot,anneBonus,liq:lucro-voTot-atTot,cnt:v.length,acCnt:ac.length,lojaVendas,lojaUnits,iaVendas,iaUnits,iaMap};
}

// RENDER
function renderContent(){
  const c=document.getElementById('content');
  if(!c)return;
  // ⚠️ ISTO E UMA CADEIA if/else if QUE TERMINA EM renderSemAcesso(). Aba nova
  // TEM que entrar com `else if` -- um `if` solto renderiza e depois a cadeia
  // segue do zero ate o `else` final, que SOBRESCREVE com "Atualize o app".
  // Foi o que aconteceu com o rhfolha em 02/set/2026: a aba aparecia na barra,
  // a tela certa era montada, e o else final apagava tudo por cima.
  if(currentTab==='rhfolha')c.innerHTML=renderRhFolha();
  else if(currentTab==='meudia')c.innerHTML=renderMeuDia();
  else if(currentTab==='vitrine')c.innerHTML=renderVitrine();
  else if(currentTab==='consulta')c.innerHTML=renderConsulta();
  else if(currentTab==='dash')c.innerHTML=renderDashV2();
  else if(currentTab==='vendas')c.innerHTML=renderVendas();
  else if(currentTab==='compras')c.innerHTML=renderCompras();
  else if(currentTab==='estoque')c.innerHTML=renderEstoque();
  else if(currentTab==='bancada')c.innerHTML=renderBancada();
  else if(currentTab==='custos')c.innerHTML=renderCustos();
  else if(currentTab==='equipe')c.innerHTML=renderEquipe();
  else if(currentTab==='movs')c.innerHTML=renderMovs();
  else if(currentTab==='tabela')c.innerHTML=renderTabela();
  else if(currentTab==='contas')c.innerHTML=renderContas();
  else if(currentTab==='fechamento')c.innerHTML=renderFechamento();
  else if(currentTab==='diario')c.innerHTML=renderDiario();
  // Qualquer aba que este JS nao conhece cai aqui -- inclusive 'semacesso',
  // que e como um papel novo aterrissa num app desatualizado.
  else c.innerHTML=renderSemAcesso();

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

// ⚠️ O DASHBOARD LEGADO FOI APOSENTADO EM 20/ago/2026.
//
// `renderDash()` vivia aqui: 466 linhas com 92 estilos escritos na mao (cor
// literal, gradiente, `rgba(48,209,88,.12)` repetido linha a linha). Ele so
// aparecia se alguem desligasse o V2 no localStorage -- coisa que ninguem fez,
// porque o V2 e o padrao desde que nasceu.
//
// O efeito colateral era pior que a divida de estilo: TRES secoes existiam so
// nele e estavam invisiveis na pratica -- "De onde vieram as vendas" (que tem
// doc, script de atribuicao e teste proprio), "Cart vs Urban" e os alertas de
// margem. As tres foram pro `js/dash-v2.js`, no kit.
//
// "Ultimas movimentacoes" nao foi junto de proposito: a aba Movimentacoes
// inteira existe, e repetir as 8 ultimas no dashboard era ocupar a tela com o
// que ja tem lugar.


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
  const completo = vendasModo === 'completo';

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
    // cada item carrega o proprio valor, custo e lucro — o dado existe em
    // 100% das linhas de venda_produtos e nunca havia sido exposto
    const detalharItem = p => {
      const valor = parseFloat(p.preco||0), custo = parseFloat(p.valor_estoque||0);
      return { titulo:p.titulo||p.produto?.titulo||'—',
               etiqueta:p.serial||p.apple?.serial||'',
               imei:p.imei_1||'', appleId:p.apple_id||null,
               qtd:parseInt(p.quantidade||1)||1,
               valor, custo, lucro: valor - custo };
    };
    const produtosLista=principais.map(detalharItem);
    const acessLista=acesss.map(detalharItem);
    const principal=produtosLista[0]||{titulo:'—',etiqueta:'—'};
    // Pagamentos por forma para a ficha (valor/parcelas/taxa/liquido/conta)
    const pagamentos=(venda._pagamentos||[]).map(p=>({
      forma:p.forma_pagamento||'—',
      conta:p.conta_bancaria||'',
      valor:parseFloat(p.valor||0),
      taxa:parseFloat(p.taxa||0),
      liquido:parseFloat(p.liquido||0),
      parcelas:parseInt(p.numero_parcelas||1)||1,
    }));
    return{
      id:venda.id,
      data:venda.data_saida?.slice(0,10),
      status:venda.status,
      cliente:venda.cliente?.nome||'—',
      cidade:venda.cliente?.cidade||'',
      instagram:venda.cliente?.instagram||'',
      produto:principal.titulo,
      etiqueta:principal.etiqueta,
      produtosLista,
      itens:{principais:produtosLista, acessorios:acessLista},
      loja:loja||'—',
      formas:venda.formas_pagamento||[],
      pagamentos,
      upgradeValor:parseFloat(venda.upgrade_valor||0),
      upgradeQtd:parseInt(venda.upgrade_qtd||0)||0,
      trocas:venda._trocas||[],
      vendedor:vendedor||'—',
      atendente:atendente||'—',
      isSocio:vendedor?['gustavo','marcella'].includes(vendedor.toLowerCase()):false,
      valor:parseFloat(venda.valor_total||0),
      custo:parseFloat(venda.custo_total ?? (parseFloat(venda.valor_total||0)-parseFloat(venda.lucro||0))),
      qtd:principais.length+acesss.length,
      telefone:venda.cliente?.telefone||venda.cliente_tel||'',
      acessBruto,
      acessLucro,
      acessResumo,
      lucro:parseFloat(venda.lucro||0),
      parcelas:parseInt(venda.parcelas||1)||1,
      taxa:parseFloat(venda.taxa_venda||0),
      liquido:parseFloat(venda.liquido_venda||0),
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
  // Contas que aparecem no periodo -- lista montada do proprio dado, entao conta
  // nova cadastrada na FoneNinja aparece aqui sozinha, sem mexer no codigo.
  // ⚠️ Calculada ANTES do filtro de conta, senao o select desaba pra uma opcao so.
  const contasLista = [...new Set(rows.flatMap(r =>
    (r.pagamentos||[]).map(p => p.conta || '(sem conta)')))].sort((a,b)=>a.localeCompare(b));
  // Conta bancaria: a venda entra se QUALQUER pagamento dela caiu naquela conta
  // (venda dividida em duas formas aparece nas duas contas, de proposito).
  if(vendasConta!=='todas')rows=rows.filter(r=>(r.pagamentos||[]).some(p=>(p.conta||'(sem conta)')===vendasConta));
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

  const shortNome = n => { if(!n||n==='—') return '—';
    const p = n.trim().split(/\s+/); return p.length<=2 ? n : p[0]+' '+p[p.length-1]; };
  const shortProd = p => { if(!p||p==='—') return '—';
    return p.replace(/^iphone\s+/i,'').replace(/^ipad\s+/i,'iPad ').replace(/^macbook\s+/i,'Mac ')
            .replace(/\s*seminovo\s*$/i,' SN').replace(/\s*lacrado\s*$/i,' LAC').trim(); };
  const capNome = n => n && n!=='—' ? n.charAt(0).toUpperCase()+n.slice(1) : '—';
  const lojaTag = l => l==='cart' ? UI.badge('Cart','processo')
                     : l==='urban' ? UI.badge('Urban','alerta') : '';

  // -- Cabecalho ----------------------------------------------------------
  const cabecalho = `
    <div class="pg-head">
      <div>
        <div class="pg-kicker">Operações</div>
        <h1 class="pg-title">Vendas</h1>
        <div class="pg-desc">Pedidos do período, com os aparelhos e acessórios de cada venda.</div>
      </div>
      <div class="pg-acoes">
        ${UI.btn('Resumo do dia', {onclick:'resumoDoDia()'})}
        ${UI.btn('↻ Atualizar', {onclick:'reloadData()', variante:'primario'})}
      </div>
    </div>`;

  // -- KPIs (dinheiro so para quem pode ver) ------------------------------
  const listaKpis = [
    { rotulo:'Pedidos', valor: rows.length, sub: mostrarPendentes ? 'pendentes' : 'no período' },
    { rotulo:'Produtos vendidos', valor: totalPrincipais, sub:'aparelhos, sem acessórios' },
  ];
  if(podeVerValor())  listaKpis.push({ rotulo:'Bruto', valor: money(totalBruto), sub:'receita do período' });
  if(podeVerMargem()) listaKpis.push({ rotulo:'Lucro', valor: money(totalLucro), tom:'ok',
        sub: totalBruto ? 'margem ' + Math.round(totalLucro/totalBruto*100) + '%' : '—' });
  const kpis = UI.kpis(listaKpis);

  // -- Alertas ------------------------------------------------------------
  const semVend = v.filter(x => !getVendaInfo(x).vendedor);
  const pendentesVend = getPendentes();
  let alertas = '';
  if(mostrarPendentes){
    alertas += `<div class="v-alerta" data-tom="alerta">
      <span>Mostrando ${pendentesVend.length} venda(s) pendente(s) — não entram nos totais</span>
      ${UI.btn('Ver todas', {onclick:'window._showPendentes=false;renderContent()', sm:true})}
    </div>`;
  } else if(pendentesVend.length){
    alertas += `<div class="v-alerta" data-tom="alerta">
      <span>${pendentesVend.length} venda(s) pendente(s) fora dos totais</span>
      ${UI.btn('Ver', {onclick:'verPendentes()', sm:true})}
    </div>`;
  }
  if(semVend.length){
    alertas += `<div class="v-alerta" data-tom="critico">
      <span>${semVend.length} venda(s) sem vendedor identificado — ficam fora da comissão</span>
    </div>`;
  }
  // Conferencia das 3 fontes de "quem atendeu" (obs x campo vendedor x cadastrador).
  // Medicao, nao erro: serve pra decidir se da pra trocar a regra de registro.
  const conf = typeof conferenciaFontes === 'function' ? conferenciaFontes() : null;
  const nDiv = conf ? (conf.divVendedor?.length || 0) + (conf.divAtendente?.length || 0) : 0;
  if(nDiv){
    alertas += `<div class="v-alerta" data-tom="alerta">
      <span>${nDiv} venda(s) em que a obs e os campos da FoneNinja não concordam sobre
        quem vendeu ou quem atendeu</span>
      ${UI.btn('Conferir', {onclick:'abrirConferencia()', sm:true})}
    </div>`;
  }

  // -- Filtros ------------------------------------------------------------
  const opt = (val, atual, texto) =>
    `<option value="${escapeHtml(val)}"${atual===val?' selected':''}>${escapeHtml(texto)}</option>`;
  const ativos = (vendasSearch?1:0)+(vendasLoja!=='todas')+(vendasVendedor!=='todos')
               +(vendasAtendente!=='todos')+(vendasProduto?1:0)+(vendasConta!=='todas');

  const filtros = `
    <div class="est-barra">
      <div class="est-busca">
        <span class="est-busca-ico">⌕</span>
        <input type="text" placeholder="Buscar cliente, produto, vendedor ou etiqueta..."
               value="${escapeHtml(vendasSearch)}" oninput="filterVendas('search',this.value)">
      </div>
      <label class="est-sel"><span>Loja</span>
        <select onchange="filterVendas('loja',this.value)">
          ${opt('todas',vendasLoja,'Todas')}${opt('cart',vendasLoja,'Phone Cart')}${opt('urban',vendasLoja,'Urban')}
        </select></label>
      <label class="est-sel"><span>Vendedor</span>
        <select onchange="filterVendas('vendedor',this.value)">
          ${opt('todos',vendasVendedor,'Todos')}${vends.map(x=>opt(x,vendasVendedor,capNome(x))).join('')}
        </select></label>
      <label class="est-sel"><span>Atendente</span>
        <select onchange="filterVendas('atendente',this.value)">
          ${opt('todos',vendasAtendente,'Todos')}${atends.map(x=>opt(x,vendasAtendente,capNome(x))).join('')}
        </select></label>
      ${contasLista.length>1 ? `<label class="est-sel"><span>Conta</span>
        <select onchange="filterVendas('conta',this.value)">
          ${opt('todas',vendasConta,'Todas')}${contasLista.map(x=>opt(x,vendasConta,x)).join('')}
        </select></label>` : ''}
      ${ativos ? UI.btn('Limpar filtros', {onclick:"filterVendas('limpar')", variante:'sutil', sm:true}) : ''}
      ${UI.btn(completo?'− Menos colunas':'+ Mais colunas', {onclick:'toggleVendasModo()', variante:'sutil', sm:true})}
    </div>`;

  // -- Linha enxuta + ficha da venda (master-detail) ----------------------
  // A linha so mostra o essencial pra achar a venda. Acessorios, pagamento e
  // detalhe moram NA FICHA (painel do lado). Clicar seleciona; toca de novo fecha.
  _vendasVisiveis = rows;

  const seta = col => vendasSortCol===col ? (vendasSortDir>0 ? ' ▲' : ' ▼') : '';
  const th = (col, texto, num) =>
    `<th class="${num?'num ':''}ord" onclick="sortVendas('${col}')">${texto}${seta(col)}</th>`;

  // colunas visiveis (pra colspan da faixa-resumo do dia)
  const COLS = 7 + (completo?1:0) + (podeVerValor()?1:0)
             + (completo&&podeVerMargem()?1:0) + (podeVerMargem()?1:0)
             + (completo&&podeVerMargem()?1:0);

  // Detalhe da venda ABAIXO da linha clicada, dentro da propria tabela. Nao e
  // painel do lado nem card flutuante: a venda se abre no lugar onde ela esta.
  const linhaExpandida = r =>
    `<tr class="v-expand"><td colspan="${COLS}">${fichaVendaHTML(r)}</td></tr>`;

  const linhaVenda = r => {
    const sel = r.id === vendasSelecionada;
    const mg = r.valor>0 ? Math.round(r.lucro/r.valor*100) : 0;
    return `<tr class="est-linha${sel?' sel':''}" onclick="selecionarVenda(${r.id})">
      <td data-rot="Venda"><span class="est-seta">▸</span><span class="est-tag">#${r.id}</span></td>
      <td data-rot="Data"><span class="est-imei">${r.data ? r.data.split('-').reverse().slice(0,2).join('/') : '—'}</span></td>
      <td data-rot="Cliente" class="forte">${escapeHtml(shortNome(r.cliente))}</td>
      <td data-rot="Loja">${lojaTag(r.loja)}</td>
      <td data-rot="Produto">${escapeHtml(shortProd(r.produto))}${r.nPrincipais>1?` <span class="v-mais">+${r.nPrincipais-1}</span>`:''}</td>
      <td data-rot="Vendedor">${escapeHtml(capNome(r.vendedor))}</td>
      <td data-rot="Atendente">${escapeHtml(capNome(r.atendente))}</td>
      ${completo ? `<td data-rot="Parc." class="num"><span class="est-imei">${r.parcelas>1?r.parcelas+'x':'à vista'}</span></td>` : ''}
      ${podeVerValor()  ? `<td data-rot="Valor" class="num forte">${money(r.valor)}</td>` : ''}
      ${completo && podeVerMargem() ? `<td data-rot="Taxa" class="num">${r.taxa>0?money(r.taxa):'—'}</td>` : ''}
      ${podeVerMargem() ? `<td data-rot="Lucro" class="num"><span class="est-venda ok">${money(r.lucro)}</span></td>` : ''}
      ${completo && podeVerMargem() ? `<td data-rot="Margem" class="num">${r.valor>0?mg+'%':'—'}</td>` : ''}
    </tr>${sel ? linhaExpandida(r) : ''}`;
  };

  // Ordenado por coluna = lista plana. Ordem cronologica (padrao) = agrupa por
  // dia com a faixa-resumo do dia (recolhivel) entre os dias.
  let corpo;
  if(vendasSortCol){
    corpo = rows.map(linhaVenda).join('');
  } else {
    const grupos = [];
    let atual = null;
    rows.forEach(r => {
      if(!atual || atual.dia !== r.data){ atual = {dia:r.data, rows:[]}; grupos.push(atual); }
      atual.rows.push(r);
    });
    corpo = grupos.map(g =>
      resumoDiaHTML(g.dia, g.rows, COLS) + g.rows.map(linhaVenda).join('')
    ).join('');
  }

  const tabela = rows.length
    ? UI.card({ titulo:'Pedidos', sub: rows.length + (rows.length===1?' venda':' vendas'), flush:true,
        corpo:`<div class="c-tabela-wrap"><table class="c-tabela est-tabela">
          <thead><tr>
            ${th('id','Venda')}${th('data','Data')}${th('cliente','Cliente')}<th>Loja</th>${th('produto','Produto')}
            ${th('vendedor','Vendedor')}${th('atendente','Atendente')}${completo?'<th class="num">Parc.</th>':''}${podeVerValor() ? th('valor','Valor',true) : ''}${completo&&podeVerMargem()?'<th class="num">Taxa</th>':''}${podeVerMargem() ? th('lucro','Lucro',true) : ''}${completo&&podeVerMargem()?'<th class="num">Margem</th>':''}
          </tr></thead><tbody>${corpo}</tbody></table></div>` })
    : UI.card({ corpo: UI.vazio({ ico:'🧾', titulo:'Nenhuma venda encontrada',
        texto: ativos ? 'Tente limpar os filtros ou trocar o período na barra lateral.'
                      : 'Assim que uma venda for concluída na FoneNinja, ela aparece aqui em até 2 minutos.' }) });

  // O detalhe ja saiu embutido na tabela (linhaExpandida), logo abaixo da linha
  // clicada. Sem painel docado e sem sheet: a venda abre onde ela esta.
  return cabecalho + kpis + alertas + filtros + `<div class="v-stage">${tabela}</div>`;
}

// ── FICHA DA VENDA (painel master-detail) ────────────────────────────────
// Texto limpo, sem arco-iris: cor so na loja e no lucro. Custo/lucro/taxa/margem
// so aparecem para quem pode ver (podeVerMargem); valor da venda para podeVerValor.
function fichaVendaHTML(r){
  const dataBR = r.data ? r.data.split('-').reverse().join('/') : '—';
  const verM = podeVerMargem();
  const verV = podeVerValor();
  const lojaBadge = r.loja==='cart' ? UI.badge('Cart','processo')
                  : r.loja==='urban' ? UI.badge('Urban','alerta') : '';
  const chipStatus = r.status==='completed'
    ? '<span class="vf-chip" data-tom="ok">✓ Concluída</span>'
    : `<span class="vf-chip" data-tom="alerta">⏳ ${escapeHtml(r.status||'pendente')}</span>`;

  // -- Cliente --
  const digits = (r.telefone||'').replace(/\D/g,'');
  const waNum  = digits ? (digits.length<=11 ? '55'+digits : digits) : '';
  const insta  = (r.instagram||'').replace(/^@/,'').trim();
  const contatos = [
    waNum ? `<a class="vf-cbtn" href="https://wa.me/${waNum}" target="_blank" rel="noopener">WhatsApp</a>` : '',
    insta ? `<a class="vf-cbtn" href="https://instagram.com/${encodeURIComponent(insta)}" target="_blank" rel="noopener">Instagram</a>` : '',
    UI.btn('Resumo da venda', {sm:true, variante:'sutil', onclick:`compartilharVenda(${r.id})`}),
  ].filter(Boolean).join('');
  const blocoCliente = `
    <div class="vf-blk">
      <div class="vf-blk-t">Cliente</div>
      <div class="vf-item"><div>
        <div class="vf-nm">${escapeHtml(r.cliente)}</div>
        ${r.cidade ? `<div class="vf-meta">${escapeHtml(r.cidade)}</div>` : ''}
      </div></div>
      <div class="vf-contatos">${contatos}</div>
    </div>`;

  // -- Aparelhos --
  const itemAparelho = i => {
    const bits = [];
    if(i.imei) bits.push('IMEI '+escapeHtml(i.imei));
    if(verM)   bits.push('custo '+money(i.custo));
    // Origem so aparece quando ha algo util (fornecedor/"buscando"); "—" seco fica de fora.
    const origem = i.appleId ? origemItemTxt(i.appleId, r.data) : '';
    const mostraOrigem = origem && !/>—</.test(origem);
    return `<div class="vf-item">
      <div>
        <div class="vf-nm">${escapeHtml(nomeCurtoProduto(i.titulo))}</div>
        ${bits.length ? `<div class="vf-meta">${bits.join(' · ')}</div>` : ''}
        ${mostraOrigem ? `<div class="vf-meta">${origem}</div>` : ''}
      </div>
      ${verV ? `<div class="vf-v num">${money(i.valor)}${verM?`<small>lucro ${money(i.lucro)}</small>`:''}</div>` : ''}
    </div>`;
  };
  const blocoAparelhos = r.itens.principais.length ? `
    <div class="vf-blk">
      <div class="vf-blk-t">Aparelhos <span class="vf-cnt">${r.itens.principais.length}</span></div>
      ${r.itens.principais.map(itemAparelho).join('')}
    </div>` : '';

  // -- Acessórios --
  const itemAcess = i => `<div class="vf-item">
      <div><div class="vf-nm">${escapeHtml(nomeCurtoProduto(i.titulo))}</div>
        ${i.qtd>1?`<div class="vf-meta">${i.qtd} unidades</div>`:''}</div>
      ${verV ? `<div class="vf-v num">${money(i.valor)}</div>` : ''}
    </div>`;
  const blocoAcess = r.itens.acessorios.length ? `
    <div class="vf-blk">
      <div class="vf-blk-t">Acessórios <span class="vf-cnt">${r.itens.acessorios.length}</span></div>
      ${r.itens.acessorios.map(itemAcess).join('')}
    </div>` : '';

  // -- Pagamento (por forma) --
  const pagLinha = p => {
    const parc = p.parcelas>1 ? ' '+p.parcelas+'×' : '';
    const brk = [];
    if(verM && p.taxa>0)    brk.push('taxa '+money(p.taxa));
    if(verM && p.liquido>0) brk.push('líquido '+money(p.liquido));
    if(p.conta)             brk.push(escapeHtml(p.conta));
    return `<div class="vf-pay">
      <div class="vf-pay-top">
        <span class="vf-nm">${escapeHtml(cap1(p.forma))}${parc}</span>
        ${verV?`<span class="vf-v num">${money(p.valor)}</span>`:''}
      </div>
      ${brk.length?`<div class="vf-meta">${brk.join(' · ')}</div>`:''}
    </div>`;
  };
  const blocoPagto = r.pagamentos.length ? `
    <div class="vf-blk">
      <div class="vf-blk-t">Pagamento</div>
      ${r.pagamentos.map(pagLinha).join('')}
    </div>` : '';

  // -- Upgrade (aparelhos de troca — termo do sistema) --
  // Se o sync ja capturou os aparelhos de entrada (r.trocas), lista modelo/IMEI/valor;
  // senao, mantem so o total + aviso de "em breve".
  const itemTroca = t => {
    const nm = t.titulo ? nomeCurtoProduto(t.titulo) : 'Aparelho usado';
    const meta = t.imei_1 ? `IMEI ${escapeHtml(t.imei_1)}` : '';
    return `<div class="vf-item">
      <div>
        <div class="vf-nm">${escapeHtml(nm)}</div>
        ${meta?`<div class="vf-meta">${meta}</div>`:''}
      </div>
      ${verV&&parseFloat(t.valor||0)>0?`<div class="vf-v num">${money(t.valor)}</div>`:''}
    </div>`;
  };
  const temTrocas = Array.isArray(r.trocas) && r.trocas.length;
  const blocoUpgrade = (r.upgradeValor>0 || r.upgradeQtd>0) ? `
    <div class="vf-blk">
      <div class="vf-blk-t">Upgrade ${r.upgradeQtd>0?`<span class="vf-cnt">${r.upgradeQtd} ${r.upgradeQtd>1?'aparelhos':'aparelho'}</span>`:''}</div>
      ${temTrocas ? r.trocas.map(itemTroca).join('') : ''}
      <div class="vf-item">
        <div><div class="vf-nm">Abatimento em aparelhos usados</div></div>
        ${verV?`<div class="vf-v num">${money(r.upgradeValor)}</div>`:''}
      </div>
      ${temTrocas ? '' : '<div class="vf-soon">Modelo e IMEI dos aparelhos de troca — em breve (assim que o sync passar a capturar).</div>'}
    </div>` : '';

  // -- Resumo --
  const mg = r.valor>0 ? Math.round(r.lucro/r.valor*100) : 0;
  const blocoResumo = `
    <div class="vf-blk">
      <div class="vf-blk-t">Resumo</div>
      ${verV?`<div class="vf-kv"><span class="k">Valor da venda</span><span class="vv num">${money(r.valor)}</span></div>`:''}
      ${verM?`<div class="vf-kv"><span class="k">Custo da mercadoria</span><span class="vv num">${money(r.custo)}</span></div>`:''}
      ${verM&&r.taxa>0?`<div class="vf-kv"><span class="k">Taxa de cartão paga</span><span class="vv num">${money(r.taxa)}</span></div>`:''}
      ${verM?`<div class="vf-kv big"><span class="k">Lucro</span><span class="vv num">${money(r.lucro)}${r.valor>0?` · ${mg}%`:''}</span></div>`:''}
    </div>`;

  return `<div class="v-ficha">
    <div class="vf-head">
      <button class="vf-fechar" onclick="fecharFicha()" aria-label="Fechar ficha">✕</button>
      <div class="vf-eyebrow">Ficha da venda</div>
      <div class="vf-title">#${r.id} · ${dataBR}</div>
      <div class="vf-chips">${lojaBadge} ${chipStatus}</div>
    </div>
    <div class="vf-body">
      ${blocoCliente}${blocoAparelhos}${blocoAcess}${blocoPagto}${blocoUpgrade}${blocoResumo}
    </div>
  </div>`;
}

// ── RESUMO DO DIA (faixa recolhivel entre os dias na lista de vendas) ─────
// Recolhida: peças (total/Cart/Urban) · bruto · lucro · acessorios (bruto/lucro).
// Aberta: vendas+comissao por vendedor, comissao dos atendentes e quanto entrou
// por forma de pagamento (cheio + liquido). Comissao de vendedor no valor BASE
// (R$25/un); a faixa de R$35 e as metas sao mensais (Dashboard).
function pagFormaInfo(f){
  const raw = String(f==null?'':f).toLowerCase();
  if(raw.includes('pix'))                             return ['pix','Pix'];
  if(raw.includes('créd')||raw.includes('cred'))      return ['credito','Crédito'];
  if(raw.includes('déb') ||raw.includes('deb'))       return ['debito','Débito'];
  if(raw.includes('dinh'))                            return ['dinheiro','Dinheiro'];
  return ['outro', f || 'Outro'];
}

// Conta bancaria -> {loja, curto}. Desde 04/ago/2026 a FoneNinja tem uma conta
// por loja e por forma ("Cart - PicPay", "Urban - PagSeguro"): o prefixo VIRA a
// loja e some do rotulo, senao a linha do resumo repete "Cart" duas vezes.
// Conta sem prefixo (PagBank do debito, Caixa do dinheiro, MercadoPago antigo)
// nao separa loja -- devolve loja null de proposito, e o resumo mostra assim.
function pagContaInfo(conta){
  const nome = String(conta==null?'':conta).trim();
  if(!nome) return { loja:null, curto:'(sem conta)' };
  const m = nome.match(/^(cart|urban)\s*[-–]\s*(.+)$/i);
  if(m) return { loja: m[1].toLowerCase(), curto: m[2].trim() };
  return { loja:null, curto: nome };
}

function resumoDiaHTML(dia, diaRows, COLS){
  const verV = podeVerValor(), verM = podeVerMargem();
  const aberto = vendasDiasAbertos.has(dia);

  let pcT=0, pcC=0, pcU=0, bruto=0, lucro=0, acB=0, acL=0;
  const vendMap={}, atMap={}, pgMap={};
  diaRows.forEach(r => {
    pcT += r.nPrincipais;
    if(r.loja==='cart') pcC += r.nPrincipais; else if(r.loja==='urban') pcU += r.nPrincipais;
    bruto += r.valor; lucro += r.lucro; acB += r.acessBruto; acL += r.acessLucro;
    const vk = matchNome(r.vendedor, VO_KEYS);
    if(vk){ (vendMap[vk] = vendMap[vk] || {v:0, ap:0}); vendMap[vk].v++; vendMap[vk].ap += r.nPrincipais; }
    const ak = matchNome(r.atendente, atKeysVigentes());
    if(ak){ (atMap[ak] = atMap[ak] || {ab:0, al:0, qt:0}); atMap[ak].ab += r.acessBruto; atMap[ak].al += r.acessLucro; atMap[ak].qt++; }
    (r.pagamentos||[]).forEach(p => {
      const [k,label] = pagFormaInfo(p.forma);
      const pg = (pgMap[k] = pgMap[k] || {label, cheio:0, liq:0, contas:{}});
      pg.cheio += p.valor; pg.liq += p.liquido;
      // Quebra por conta dentro da forma: e o que mostra quanto do Pix caiu no
      // Mercado Pago da Cart e quanto no PagSeguro da Urban.
      const ci = pagContaInfo(p.conta);
      const ck = ci.loja ? ci.loja+'|'+ci.curto : ci.curto;
      const c = (pg.contas[ck] = pg.contas[ck] || {loja:ci.loja, curto:ci.curto, cheio:0, liq:0});
      c.cheio += p.valor; c.liq += p.liquido;
    });
  });

  const dataLabel = dia
    ? new Date(dia+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'short', day:'2-digit', month:'2-digit'}).replace('.','')
    : '—';
  const nV = diaRows.length;

  const kpi = (rot, val, sub, ok) => `<span class="v-dia-kpi"><i>${rot}</i><b${ok?' class="ok"':''}>${val}</b>${sub?`<em>${sub}</em>`:''}</span>`;
  const kpis = [
    kpi('peças', pcT, `Cart ${pcC} · Urban ${pcU}`),
    verV ? kpi('bruto', money(bruto)) : '',
    verM ? kpi('lucro', money(lucro), '', true) : '',
    verV ? kpi('acessórios', money(acB), verM ? `lucro ${money(acL)}` : '') : '',
  ].filter(Boolean).join('');

  let detalhe = '';
  if(aberto){
    const lead = '<span class="v-lead"></span>';
    const vendRows = Object.entries(vendMap)
      .sort((a,b)=>b[1].ap-a[1].ap)
      .map(([k,d]) => `<div class="v-dia-lin"><span class="nm">${cap1(k)}</span>
        <span class="mt">${d.v} venda${d.v!==1?'s':''} · ${d.ap} un</span>
        ${verM?`${lead}<span class="cm">${money(d.ap*25)}</span>`:''}</div>`).join('')
      || '<div class="v-dia-vazio">—</div>';
    const atRows = Object.entries(atMap)
      .sort((a,b)=>b[1].ab-a[1].ab)
      .map(([k,d]) => `<div class="v-dia-lin"><span class="nm">${cap1(k)}</span>
        <span class="mt">${verV?money(d.ab):d.qt+' at.'} acess.</span>
        ${verM?`${lead}<span class="cm">${money(d.al*0.25)}</span>`:''}</div>`).join('')
      || '<div class="v-dia-vazio">—</div>';
    const ordem = ['pix','credito','debito','dinheiro','outro'];
    // Sublinha por conta so quando a forma se divide em mais de uma: Dinheiro no
    // Caixa nao ganha uma linha repetindo "Caixa".
    const pgRows = Object.entries(pgMap)
      .sort((a,b)=>ordem.indexOf(a[0])-ordem.indexOf(b[0]))
      .map(([,d]) => {
        const contas = Object.values(d.contas).sort((a,b)=>b.cheio-a.cheio);
        const sub = contas.length < 2 ? '' : contas.map(c =>
          `<div class="v-dia-lin v-dia-sub"><span class="nm">${
            c.loja ? `<i class="v-dia-loja">${c.loja==='urban'?'Urban':'Cart'}</i> ` : ''
          }${escapeHtml(c.curto)}</span>
          ${lead}<span class="cm">${money(c.cheio)}</span></div>`).join('');
        return `<div class="v-dia-lin"><span class="nm">${escapeHtml(d.label)}</span>
          ${lead}<span class="cm">${money(d.cheio)}${verM?` <em>líq ${money(d.liq)}</em>`:''}</span></div>${sub}`;
      }).join('')
      || '<div class="v-dia-vazio">—</div>';

    detalhe = `<div class="v-dia-cols">
      <div class="v-dia-sec"><div class="v-dia-sec-t">Vendedores</div>${vendRows}</div>
      <div class="v-dia-sec"><div class="v-dia-sec-t">Atendentes</div>${atRows}</div>
      ${verV?`<div class="v-dia-sec"><div class="v-dia-sec-t">Pagamento</div>${pgRows}</div>`:''}
    </div>
    ${verM?`<div class="v-dia-nota">Comissão de vendedor no valor base (R$25/un). Faixa de R$35 e metas são mensais — ver Dashboard.</div>`:''}`;
  }

  return `<tr class="v-diaband${aberto?' aberta':''}" onclick="toggleDiaResumo('${dia}')">
    <td colspan="${COLS}">
      <div class="v-dia-head">
        <div class="v-dia-cal"><span class="est-seta">${aberto?'▾':'▸'}</span>
          <span class="v-dia-data">${dataLabel}</span>
          <span class="v-dia-cnt">${nV} venda${nV!==1?'s':''}</span></div>
        <div class="v-dia-kpis">${kpis}</div>
      </div>
      ${detalhe}
    </td>
  </tr>`;
}


let _vendasVisiveis = [];
let vendasDiasAbertos = new Set(); // dias com o resumo expandido
function toggleDiaResumo(dia){
  if(vendasDiasAbertos.has(dia)) vendasDiasAbertos.delete(dia);
  else vendasDiasAbertos.add(dia);
  if(currentTab==='vendas') renderContent();
}
let vendasSelecionada = null; // id da venda com ficha aberta (null = nenhuma)
let vendasModo = 'compacto'; // 'compacto' | 'completo' — liga as colunas analiticas extras
function toggleVendasModo(){
  vendasModo = vendasModo==='completo' ? 'compacto' : 'completo';
  if(currentTab==='vendas') document.getElementById('content').innerHTML = renderVendas();
}

// Seleciona a venda e abre a ficha do lado. Tocar na mesma linha fecha.
function selecionarVenda(id){
  if(vendasSelecionada === id){ vendasSelecionada = null; }
  else {
    vendasSelecionada = id;
    const r = _vendasVisiveis.find(x => x.id === id);
    const ids = (r?.itens?.principais || []).map(i => i.appleId).filter(Boolean);
    if(ids.length) buscarOrigemItens(ids).then(() => { if(currentTab==='vendas') renderContent(); });
  }
  if(currentTab==='vendas') renderContent();
}
function fecharFicha(){ vendasSelecionada = null; if(currentTab==='vendas') renderContent(); }

// De onde o aparelho veio. Diferente do Estoque, aqui olhamos so em compras:
// procurar em vendas devolveria a propria venda que estamos abrindo.
let _origemItem = {};

async function buscarOrigemItens(ids){
  const faltam = [...new Set(ids)].filter(id => _origemItem[id] === undefined);
  if(!faltam.length) return;
  faltam.forEach(id => { _origemItem[id] = 'buscando'; });
  try {
    const linhas = await sbGet('compra_produtos',
      `apple_id=in.(${faltam.join(',')})&select=apple_id,compras(fornecedor_nome,data_entrada)`, 500);
    faltam.forEach(id => { _origemItem[id] = null; });
    (linhas||[]).forEach(l => {
      _origemItem[l.apple_id] = { fornecedor: l.compras?.fornecedor_nome || null,
                                  data: l.compras?.data_entrada || null };
    });
  } catch(e){ console.warn('[origem item]', e); faltam.forEach(id => { _origemItem[id] = null; }); }
}

// Alem do fornecedor, mostra a data de entrada e quantos dias o aparelho ficou
// parado ate ser vendido — as duas datas ja vinham na mesma busca.
function origemItemTxt(appleId, dataVenda){
  const o = appleId ? _origemItem[appleId] : undefined;
  if(o === 'buscando') return '<span class="est-sempreco">buscando…</span>';
  if(!o || !o.fornecedor) return '<span class="est-sempreco">—</span>';

  let extra = '';
  if(o.data){
    // "2026-05-20" seria lido como meia-noite UTC e o fuso -3 jogaria para o dia
    // anterior; fixar meio-dia evita a virada de data
    const entrada = new Date(/^\d{4}-\d{2}-\d{2}$/.test(o.data) ? o.data + 'T12:00:00' : o.data);
    extra = ` · ${entrada.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}`;
    if(dataVenda){
      const dias = Math.round((new Date(dataVenda) - entrada) / 86400000);
      if(dias >= 0) extra += ` · <span class="v-dias" data-tom="${dias>60?'alerta':''}">${dias}d parado</span>`;
    }
  }
  return escapeHtml(o.fornecedor) + extra;
}

function sortVendas(col){
  if(vendasSortCol===col) vendasSortDir*=-1;
  else { vendasSortCol=col; vendasSortDir=1; }
  document.getElementById('content').innerHTML=renderVendas();
}
function filterVendas(tipo,val){
  if(tipo==='limpar'){
    vendasSearch=''; vendasLoja='todas'; vendasVendedor='todos';
    vendasAtendente='todos'; vendasProduto=''; vendasConta='todas';
    renderContent(); return;
  }
  if(tipo==='search')vendasSearch=val;
  else if(tipo==='loja')vendasLoja=val;
  else if(tipo==='vendedor')vendasVendedor=val;
  else if(tipo==='atendente')vendasAtendente=val;
  else if(tipo==='produto')vendasProduto=val;
  else if(tipo==='conta')vendasConta=val;
  document.getElementById('content').innerHTML=renderVendas();
}



// ── TEXTOS COMPARTILHAVEIS DAS VENDAS ────────────────────────────────────
const brlTxt = n => 'R$ ' + Number(n||0).toLocaleString('pt-BR');
const dataTxt = d => d ? new Date(d).toLocaleDateString('pt-BR') : '';
const nomeCurtoProduto = t => String(t||'')
  .replace(/^iPhone\s+/i,'').replace(/\s*(seminovo|lacrado)\s*$/i,'').trim();

// Resumo de UMA venda — vai para o cliente, entao nao leva custo nem lucro,
// mesmo quando quem gera e socio.
function compartilharVenda(id){
  const r = _vendasVisiveis.find(x => x.id === id);
  if(!r) return;

  let txt = `${dataTxt(r.data)}\n#${r.id}\n${r.cliente}\n`;

  if(r.itens && r.itens.principais.length){
    txt += `\n*Aparelhos*\n`;
    r.itens.principais.forEach(p => {
      const et = p.etiqueta && p.etiqueta !== '—' ? ` · ${p.etiqueta}` : '';
      txt += `${nomeCurtoProduto(p.titulo)}${et} · ${brlTxt(p.valor)}\n`;
    });
  }
  if(r.acessResumo.length){
    txt += `\n*Acessórios*\n`;
    r.acessResumo.forEach(a => { txt += `${a.titulo} · ${brlTxt(a.preco)}\n`; });
  }
  txt += `\n*Total: ${brlTxt(r.valor)}*\n`;
  if(r.vendedor && r.vendedor !== '—')  txt += `Vendedor: ${cap1(r.vendedor)}\n`;
  if(r.atendente && r.atendente !== '—') txt += `Atendente: ${cap1(r.atendente)}\n`;

  abrirWaModalDireto(txt.trimEnd(), `Venda #${r.id}`);
}

const cap1 = n => n ? String(n).charAt(0).toUpperCase() + String(n).slice(1) : '';

// Resumo do dia — uso interno da equipe.
function resumoDoDia(){
  const hoje = brtNow();
  const doDia = allVendas.filter(v =>
    v.status === 'completed' && v.data_saida && brtSameDay(toBRT(v.data_saida), hoje));

  if(!doDia.length){ abrirWaModalDireto('_Nenhuma venda registrada hoje._', 'Resumo do dia'); return; }

  let aparelhos = 0, bruto = 0, lucro = 0, totalAcess = 0;
  const porVendedor = {}, porAtendente = {};

  doDia.forEach(v => {
    const { vendedor, atendente } = getVendaInfo(v);
    const itens = v._produtos || [];
    const princ = itens.filter(isPrincipal);
    const acess = itens.filter(p => !isPrincipal(p));
    const valorAcess = acess.reduce((a,p) => a + parseFloat(p.preco || 0), 0);

    aparelhos  += princ.length;
    totalAcess += valorAcess;
    bruto += parseFloat(v.valor_total || 0);
    lucro += parseFloat(v.lucro || 0);

    if(vendedor){
      porVendedor[vendedor] = porVendedor[vendedor] || { vendas:0, aparelhos:0 };
      porVendedor[vendedor].vendas++;
      porVendedor[vendedor].aparelhos += princ.length;
    }
    if(atendente){
      porAtendente[atendente] = porAtendente[atendente] || { vendas:0, acess:0 };
      porAtendente[atendente].vendas++;
      porAtendente[atendente].acess += valorAcess;
    }
  });

  let txt = `*Resumo do dia* · ${hoje.toLocaleDateString('pt-BR')}\n\n`;
  txt += `Vendas: ${doDia.length}\n`;
  txt += `Aparelhos: ${aparelhos}\n`;
  txt += `Acessórios: ${brlTxt(totalAcess)}\n`;
  if(podeVerDinheiro()){
    txt += `Bruto: ${brlTxt(bruto)}\n`;
    txt += `Lucro: ${brlTxt(lucro)}${bruto ? ` (margem ${Math.round(lucro/bruto*100)}%)` : ''}\n`;
  }

  const vend = Object.entries(porVendedor).sort((a,b) => b[1].vendas - a[1].vendas);
  if(vend.length){
    txt += `\n*Vendedores*\n`;
    vend.forEach(([n,d]) => {
      txt += `${cap1(n)} · ${d.vendas} venda${d.vendas!==1?'s':''} · ${d.aparelhos} aparelho${d.aparelhos!==1?'s':''}\n`;
    });
  }
  const aten = Object.entries(porAtendente).sort((a,b) => b[1].acess - a[1].acess);
  if(aten.length){
    txt += `\n*Atendentes*\n`;
    aten.forEach(([n,d]) => {
      txt += `${cap1(n)} · ${brlTxt(d.acess)} em acessórios · ${d.vendas} atendimento${d.vendas!==1?'s':''}\n`;
    });
  }
  abrirWaModalDireto(txt.trimEnd(), 'Resumo do dia');
}
