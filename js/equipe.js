// -- EQUIPE Supabase helpers ------------------------------------------------
let _funcConfigCache = {};
let _dividasCache = {};

function getEquipeExtra(id){
  return _funcConfigCache[id] || {};
}
// Grava o contato no Supabase (upsert pela PK id) e devolve uma Promise.
// IMPORTANTE: as chaves de `data` tem que ser os NOMES DAS COLUNAS
// (pix, telefone, email, data_inicio, obs). Ate jul/2026 o codigo mandava
// tel/dataInicio, o PostgREST rejeitava, e o erro morria num catch mudo --
// por isso a tabela ficou vazia desde que foi criada. Se falhar, agora estoura.
function setEquipeExtra(id, data){
  _funcConfigCache[id] = { ...(_funcConfigCache[id]||{}), ...data, id };
  return fetch(SB_URL+'/rest/v1/funcionarios_config', {
    method: 'POST',
    headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer '+SB_TOKEN,
      'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify({ id, ...data, updated_at: new Date().toISOString() })
  }).then(async r => {
    if(!r.ok){
      const txt = await r.text().catch(() => '');
      console.error('setEquipeExtra HTTP '+r.status, txt);
      throw new Error('HTTP '+r.status+(txt?' — '+txt.slice(0,180):''));
    }
    return true;
  });
}

// Escapa para uso DENTRO de atributo HTML. O escapeHtml() do estoque.js so
// trata & < > -- aspas passariam e quebrariam value="..." agora que o campo
// e digitado pelo usuario.
function escAttr(s){
  return String(s==null?'':s).replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// Contato efetivo: o que esta salvo no Supabase manda; FUNC (config.js) e o
// fallback. Da pra editar pela tela sem mexer no codigo, e nada quebra se a
// tabela estiver vazia.
function funcContato(f){
  const e = getEquipeExtra(f.id) || {};
  const pick = (a, b) => (a != null && a !== '') ? a : (b || '');
  return {
    pix:         pick(e.pix,         f.pix),
    telefone:    pick(e.telefone,    ''),
    email:       pick(e.email,       f.email),
    data_inicio: pick(e.data_inicio, ''),
    obs:         pick(e.obs,         '')
  };
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

  if(f.tipo==='socio') return { vendCount:0, units:0, unitsVo:0, comm:0, rate:0, metaBatida:false, tipo:'socio' };

  // Os dois lados sao contados INDEPENDENTES, igual fechamentoEquipe() faz. Antes
  // quem decidia era o f.tipo, num if/else: Maria e tipo:'online' COM atKey, entao
  // parava no primeiro branch e os acessorios dela nao existiam nesta tela --
  // enquanto a folha pagava os 25% certinhos. Tela e folha tem que dizer o mesmo
  // numero; era so questao de a Maria vender acessorio pra divergencia aparecer.
  const ehVo = !!(f.voKey && VO_KEYS.includes(f.voKey));
  const ehAt = !!(f.atKey && atKeysVigentes().includes(f.atKey));

  // -- Lado vendedor ---------------------------------------------------------
  // Vendedor oficial segue a curva de 80 un (fonte unica em core.js). Atendente
  // que vende device entra pelo atKey e ganha R$25/un flat, sem curva.
  const kVend = f.voKey || f.atKey;
  let vendCount=0, unitsVo=0;
  if(kVend) v.forEach(x=>{
    const {vendedor}=getVendaInfo(x);
    if(matchNome(vendedor,[kVend])){ vendCount++; unitsVo+=contarIphones(x); }
  });
  const commVo = comissaoDeAparelho(ehVo ? f.voKey : f.atKey, unitsVo);

  // -- Lado atendente --------------------------------------------------------
  let la=0, qt=0, bruto=0;
  if(ehAt){
    const vAtend={};
    v.forEach(x=>{ const {atendente}=getVendaInfo(x); if(matchNome(atendente,[f.atKey]))vAtend[x.id]=true; });
    v.filter(x=>vAtend[x.id]).forEach(x=>{
      getAcess(x).forEach(p=>{
        // Brinde nao desconta da comissao (core.js > lucroAcessComissao). Ele
        // continua contado em `qt`: saiu da loja, e o attach rate nao muda.
        la += lucroAcessComissao(p);
        bruto += parseFloat(p.preco||0); qt++;
      });
    });
  }
  const bonus  = f.bonus ? lAcessTotal*0.05 : 0;
  const commAt = ehAt ? la*0.25 + bonus : 0;

  return {
    vendCount,
    units: unitsVo, unitsVo,          // `units` e o nome que os rankings usam
    commVo, commAt, comm: commVo+commAt, bonus,
    qt, brutoAcess:bruto, lucroAcess:la,
    rate: ehVo && unitsVo>VO_CURVA.corte ? VO_CURVA.bonus : VO_CURVA.base,
    metaBatida: ehVo && unitsVo>VO_CURVA.corte,
    tipo: ehVo && ehAt ? 'ambos' : ehVo ? 'online' : 'presencial',
  };
}

// ===========================================================================
// FECHAMENTO — FONTE UNICA da folha do mes
//
// Antes os mesmos numeros eram remontados em 3 lugares (a tabela de fechamento
// e os resumos aqui, e o card individual), cada um com sua copia de cvF/caF/bmF
// e sua lista de pessoas escrita a mao. Agora existe UM caminho:
//
//     calc()  ->  fechamentoEquipe()  ->  tela / resumos / card / exportacao
//
// Quem quiser um numero da folha PEDE aqui. E o que sustenta a exportacao como
// documento de prova: se o arquivo e a tela saem do mesmo objeto, nao ha como
// discordarem. Nao criar conta de folha fora daqui.
// ===========================================================================

// Quem entra na folha: derivado do cadastro (FUNC), nunca lista a mao. Quem
// ganha "(saiu)" no cargo sai sozinho; quem entra aparece sozinho. Mesmo
// criterio de atLabelsAll/voLabelsAll (core.js), entao ranking e folha
// falam do mesmo conjunto de gente.
function fechamentoPessoas(){
  return FUNC.filter(f =>
    !saiuDaEquipe(f) &&
    ((f.voKey && VO_KEYS.includes(f.voKey)) || (f.atKey && atKeysVigentes().includes(f.atKey)))
  );
}

// O que a pessoa recebe FORA do que sai de venda: salario + extras do mes.
// Tudo vem dos LANCAMENTOS em Custos da area 'funcionario' com o campo
// `funcionario` preenchido -- nunca da constante SALARIOS.
//
//   fixo=true  -> o salario do mes (ferias, proporcional de quem entrou no meio
//                 do mes, desconto). Em jul/2026 a constante diria Vitinho
//                 2.250 e Gabi 2.250; o pago foi 2.750 e 1.161.
//   fixo=false -> extras nominais: hora extra, ajuste de meta, vale. Cada um
//                 entra na folha como LINHA PROPRIA, com a descricao -- e o que
//                 faz o documento de prova dizer por que aquele valor existe,
//                 em vez de inchar o salario sem explicacao.
//
// Sem lancamento de salario (custos ainda carregando, ou mes sem folha gerada)
// cai na constante e avisa -- melhor um numero marcado como estimado que um
// zero mudo.
function remuneracaoFixa(id){
  const lancs = filterCustoPeriod(getCustos())
    .filter(c => c.area==='funcionario' && c.funcionario===id);
  const salLancs = lancs.filter(c => c.fixo);
  const extras = lancs.filter(c => !c.fixo).map(c => ({
    desc: c.desc || 'extra', valor: parseFloat(c.valor||0), obs: c.obs || ''
  }));
  if(salLancs.length) return {
    valor: salLancs.reduce((a,c) => a+parseFloat(c.valor||0), 0),
    origem: 'custos',
    desc: salLancs.map(c => c.desc).join(' · '),
    extras
  };
  return { valor: SALARIOS[id]||0, origem:'constante', desc:'', extras };
}

// Distribui um total INTEIRO entre as linhas, proporcional ao valor cru, pelo
// metodo do maior resto. A folha paga em reais inteiros (Math.round no total);
// se as linhas fossem arredondadas uma a uma a coluna fecharia com centavos de
// diferenca do resumo -- e ai o documento perde a serventia. Aqui a soma da
// coluna e IGUAL ao total pago, por construcao.
function distribuirEmInteiros(valores, total){
  const brutos = valores.map(v => parseFloat(v||0));
  const out = brutos.map(v => Math.floor(v));
  let resto = Math.round(total) - out.reduce((a,b)=>a+b,0);
  const ordem = brutos.map((v,i) => ({i, frac: v-Math.floor(v)}))
                      .sort((a,b) => b.frac-a.frac);
  for(let k=0; resto>0 && ordem.length; k++, resto--) out[ordem[k%ordem.length].i]++;
  return out;
}

function _fechOrdemData(a,b){ return String(a.data||'').localeCompare(String(b.data||'')); }

// Monta a folha do periodo que estiver no contexto (loja + periodo da sidebar).
function fechamentoEquipe(){
  const m = calc();
  const metas = metasColetivas();
  const metaDev     = metas.dev.filter(x => m.unPrincipal >= x.qt).pop() || null;
  const metaDevProx = metas.dev.find(x => m.unPrincipal < x.qt) || null;
  const metaAc      = metas.acess.filter(x => m.vendaAcess >= x.val).pop() || null;
  const metaAcProx  = metas.acess.find(x => m.vendaAcess < x.val) || null;
  // Bonus coletivo e pago CHEIO para cada pessoa (uma vez por pessoa) -- menos
  // quem esta em SEM_BONUS_COLETIVO no mes (ferias/afastamento, ver core.js).
  const bonusCol = (metaDev?.bonus||0) + (metaAc?.bonus||0);

  const avisos = [];
  if(currentStore !== 'ambas') avisos.push(
    'Contexto da loja está em "'+currentStore+'" — a folha só considera as vendas dessa loja.');

  const pessoas = fechamentoPessoas().map(f => {
    // A chave de VENDEDOR da pessoa: o voKey quando ela e vendedora online, o
    // atKey quando e atendente que tambem vende (R$25/un). Procurar so em
    // VO_KEYS era o que fazia a folha pagar R$0 e a tela mostrar a comissao.
    const kVend = (f.voKey && VO_KEYS.includes(f.voKey)) ? f.voKey
                : (f.atKey && atKeysVigentes().includes(f.atKey)) ? f.atKey : null;
    const vo = kVend ? (m.voMap[kVend] || null) : null;
    const at = (f.atKey && atKeysVigentes().includes(f.atKey)) ? (m.atMap[f.atKey] || null) : null;

    const units      = vo ? vo.units : 0;
    const pedidos    = vo ? vo.vendas : 0;
    const commVo     = comissaoDeAparelho(kVend, units);
    const la         = at ? at.la : 0;
    const brutoAcess = at ? at.brutoAcess : 0;
    const qtAcess    = at ? at.qt : 0;
    const commAt     = Math.round(la * 0.25);
    const bonus5     = f.bonus ? Math.round(m.lAcess * 0.05) : 0;
    const meta       = metaAtendente(brutoAcess);
    const bonusMeta  = at ? meta.bonus : 0;
    const bonusColP  = entraNoBonusColetivo(f.id) ? bonusCol : 0;
    if(bonusCol > 0 && bonusColP === 0) avisos.push(
      f.ap+' esta fora do rateio do bonus coletivo neste mes ('+brl(bonusCol)+' nao pagos).');
    const rem        = remuneracaoFixa(f.id);
    const extrasTot  = rem.extras.reduce((a,e) => a+e.valor, 0);
    if(rem.origem === 'constante' && rem.valor > 0) avisos.push(
      'Salário de '+f.ap+' não tem lançamento em Custos no período — usando o valor da tabela ('+brl(rem.valor)+').');

    // -- Linhas de venda -----------------------------------------------------
    // Vendedor: a curva de 80 un vale para o mes, entao a comissao da venda e o
    // quanto ELA acrescentou ao acumulado. Soma = comissaoVendedor(total), exato,
    // e a linha onde a taxa vira R$35 fica visivel.
    const linhasVo = (vo ? vo.linhas : []).map(l => ({...l})).sort(_fechOrdemData);
    let acum = 0;
    linhasVo.forEach(l => {
      const antes = acum; acum += l.units;
      l.comissao = comissaoDeAparelho(kVend, acum) - comissaoDeAparelho(kVend, antes);
      l.taxa = l.units > 0 ? l.comissao / l.units : 0;
    });

    // Atendente: 25% do lucro da venda, arredondado pelo maior resto.
    const linhasAt = (at ? at.linhas : []).map(l => ({...l})).sort(_fechOrdemData);
    const inteiros = distribuirEmInteiros(linhasAt.map(l => l.lucro * 0.25), commAt);
    linhasAt.forEach((l,i) => { l.comissao = inteiros[i]; });

    return {
      id:f.id, nome:f.ap, nomeCompleto:f.nome, cargo:f.cargo, tipo:f.tipo,
      voKey:f.voKey||null, atKey:f.atKey||null, ehVendedor:!!vo, ehAtendente:!!at,
      units, pedidos, la, brutoAcess, qtAcess,
      sal:rem.valor, salOrigem:rem.origem, salDesc:rem.desc,
      extras:rem.extras, extrasTot,
      commVo, commAt, comm:commVo+commAt,
      bonus5, bonusMeta, bonusCol: bonusColP, meta,
      total: rem.valor + extrasTot + commVo + commAt + bonus5 + bonusMeta + bonusColP,
      linhasVo, linhasAt,
    };
  });

  const soma = k => pessoas.reduce((a,p) => a + p[k], 0);
  // Custos do mes SEM a area 'funcionario': salario e bonus ja estao dentro da
  // folha (o salario VEM desses lancamentos; os 3 lancamentos de bonus batem com
  // bonusMeta/bonusCol/bonus5). Somar a area de novo pagaria a folha duas vezes.
  const custosForaFolha = filterCustoPeriod(getCustos())
    .filter(c => c.area !== 'funcionario')
    .reduce((a,c) => a + parseFloat(c.valor||0), 0);

  const totais = {
    sal:soma('sal'), extras:soma('extrasTot'),
    comm:soma('comm'), commVo:soma('commVo'), commAt:soma('commAt'),
    bonus5:soma('bonus5'), bonusMeta:soma('bonusMeta'), bonusCol:soma('bonusCol'),
    folha:soma('total'), custosForaFolha,
  };
  // folha ja embute salario + comissao + os 3 bonus. Comissao nao esta em Custos
  // (lancar seria contar duas vezes -- ver docs/IDEIAS.md).
  totais.liquido = m.lucro - totais.folha - custosForaFolha;

  // -- Conciliacao: Custos (area funcionario) x o que a folha calcula ---------
  // Os dois tem que dizer o mesmo numero, tirando a comissao, que de proposito
  // nao e lancada. Diferenca aponta um destes:
  //   > 0  lancamento na area sem pessoa marcada -- o valor nao chega em
  //        ninguem E fica fora do resultado (a area inteira e excluida de
  //        custosForaFolha). Sumia calado ate ago/2026;
  //   < 0  falta lancar (tipico: bonus do mes ainda nao lancado);
  //   != 0 bonus lancado com valor velho -- e o caso do 5% depois do resync
  //        fundo, que em jul/2026 mudou de 1.287 para 1.305.
  const custosDaFolha = filterCustoPeriod(getCustos())
    .filter(c => c.area === 'funcionario')
    .reduce((a,c) => a + parseFloat(c.valor||0), 0);
  totais.custosDaFolha = custosDaFolha;
  totais.folhaSemComissao = totais.sal + totais.extras
                          + totais.bonus5 + totais.bonusMeta + totais.bonusCol;
  totais.conciliacao = Math.round(custosDaFolha - totais.folhaSemComissao);
  if(totais.conciliacao > 0) avisos.push(
    'Custos tem '+brl(totais.conciliacao)+' a mais na área Funcionários do que a folha calcula. '
    + 'Provável lançamento sem pessoa marcada (o valor não chega em ninguém nem no resultado) '
    + 'ou bônus com valor diferente do calculado.');
  if(totais.conciliacao < 0) avisos.push(
    'Falta lançar '+brl(-totais.conciliacao)+' em Custos (área Funcionários) para bater com a folha. '
    + 'Se o mês ainda não fechou, é só o bônus que ainda não foi lançado.');

  return {
    m, ref:_refAnoMes(), loja:currentStore, geradoEm:new Date(),
    mesLabel: fechamentoMesLabel(),
    base: {
      // acessLucro aqui e a BASE DA COMISSAO (o 5% da Anne sai dele, e o
      // documento da folha imprime este numero). O lucro da loja, com brinde,
      // e m.lAcess -- ele fica no resultado, nao na folha.
      aparelhos:m.unPrincipal, acessBruto:m.vendaAcess, acessLucro:m.lAcessCom,
      acessLucroLoja:m.lAcess,
      vendas:m.cnt, lucro:m.lucro,
    },
    metaDev, metaDevProx, metaAc, metaAcProx, bonusCol,
    pessoas, totais, avisos,
  };
}

// Rotulo do periodo em texto ("Julho de 2026"). Um filtro que nao e um mes
// (semana/hoje/custom/tudo) diz o que e, em vez de mentir um mes.
function fechamentoMesLabel(){
  const ref = _refAnoMes();
  if(!ref) return 'Período selecionado';
  const [y,mo] = ref.split('-').map(Number);
  const nomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho',
                 'Agosto','Setembro','Outubro','Novembro','Dezembro'];
  return nomes[mo-1] + ' de ' + y;
}

// Fechamento de OUTRO mes pelo MESMO caminho (calc + custos do periodo). Troca
// o contexto global, mede e restaura -- e como a comparacao com o mes anterior
// sai sem uma segunda implementacao. Devolve null se o mes nao for resolvivel.
function fechamentoEquipeRef(anoMes){
  if(!/^\d{4}-\d{2}$/.test(anoMes||'')) return null;
  const antes = currentPeriod;
  try { currentPeriod = anoMes; return fechamentoEquipe(); }
  finally { currentPeriod = antes; }
}

// 'YYYY-MM' n meses antes de ref (n=0 devolve o proprio ref). Vira o ano sozinho.
function fechamentoMesMenos(ref, n){
  if(!/^\d{4}-\d{2}$/.test(ref||'')) return null;
  const [y,m] = ref.split('-').map(Number);
  const d = new Date(Date.UTC(y, m-1-(n||0), 1));
  return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0');
}
function fechamentoMesAnterior(ref){ return fechamentoMesMenos(ref, 1); }

function renderEquipe(){
  const movsMap={};
  allMovs.forEach(function(m){ if(!movsMap[m.parent_id])movsMap[m.parent_id]=[]; movsMap[m.parent_id].push(m); });
  const v=filterByPeriod(allVendas);
  const ids=new Set(v.map(function(x){return x.id;}));
  const acAll=allMovs.filter(function(m){return ids.has(m.parent_id)&&isAcess(m);});
  // Base do 5% da Anne: e comissao, entao brinde nao desconta.
  const lAcessTotal=acAll.reduce(function(a,m){return a+lucroAcessComissao(m);},0);

  if(equipeOpenId){ return renderFuncCard(equipeOpenId, lAcessTotal); }

  const SOCIOS_IDS=['gustavo','marcella'];
  const metricas={};
  FUNC.forEach(function(f){ metricas[f.id]=calcComissaoFunc(f,allVendas,allMovs,lAcessTotal); });

  // Quem saiu nao vira card: a tela mostra a equipe de HOJE. O cadastro continua
  // no FUNC (historico das vendas) e o fechamento usa o mesmo criterio em
  // fechamentoPessoas() -- entao tela e folha falam da mesma gente.
  const naEquipe=function(f){ return !SOCIOS_IDS.includes(f.id) && !saiuDaEquipe(f); };
  const socios=FUNC.filter(function(f){return SOCIOS_IDS.includes(f.id);});
  const online=FUNC.filter(function(f){return naEquipe(f)&&f.tipo==='online'&&!f.atKey;});
  const presencial=FUNC.filter(function(f){return naEquipe(f)&&(f.tipo==='presencial'||(f.atKey&&!f.voKey));});
  const ambos=FUNC.filter(function(f){return naEquipe(f)&&f.voKey&&f.atKey;});

  // Fechamento primeiro: o placar do topo sai DELE, nao de uma segunda conta.
  const fech=fechamentoEquipe();
  const {pessoas,totais,bonusCol:bonusColF}=fech;
  const porNome={}; pessoas.forEach(function(p){ porNome[p.id||p.func_id||p.nome]=p; });

  const saldoDividaDe=function(id){
    return getDividas(id).reduce(function(a,d){
      const pago=d.parcelas.filter(function(p){return p.paga;}).reduce(function(s,p){return s+p.valor;},0);
      return a+(d.total-pago);
    },0);
  };

  // -- Linha de pessoa: um componente so, dois usos ---------------------------
  // Antes eram dois blocos de HTML quase iguais escritos na mao, cada um com
  // suas cores literais e seu gradiente. O que muda entre vendedor e atendente
  // e o NUMERO que manda na barra -- o resto e o mesmo.
  const linhaPessoa=function(f, rank, dados){
    const m=metricas[f.id]||{};
    const div=saldoDividaDe(f.id);
    const medalha=rank===0?'🥇':rank===1?'🥈':rank===2?'🥉':'';
    const pct=dados.max>0?Math.round((dados.valor/dados.max)*100):0;
    const total=(porNome[f.id]||{}).total;
    return `
      <button class="eq-linha" onclick="openFunc('${f.id}')">
        <span class="eq-av" data-tom="${dados.tom}">${ini(f.nome)}${medalha?`<i class="eq-medalha">${medalha}</i>`:''}</span>
        <span class="eq-corpo">
          <span class="eq-topo">
            <b class="eq-nome">${UI.esc(f.ap)}</b>
            ${dados.selo||''}
            ${div>0?UI.badge('dívida '+brl(div),'alerta'):''}
          </span>
          <span class="eq-num">${dados.linha}</span>
          ${UI.barra(pct)}
        </span>
        <span class="eq-total">
          ${total!=null?`<b>${brl(total)}</b><i>a receber</i>`:`<b>${brl(m.comm||0)}</b><i>comissão</i>`}
        </span>
      </button>`;
  };

  const secao=function(titulo, sub, corpo){
    return corpo ? UI.card({titulo, sub, corpo, flush:true, classe:'eq-card'}) : '';
  };

  // -- Vendedores: o numero que manda e APARELHO ------------------------------
  const todosVo=online.concat(ambos)
    .sort(function(a,b){return (metricas[b.id]&&metricas[b.id].units||0)-(metricas[a.id]&&metricas[a.id].units||0);});
  const maxUn=Math.max.apply(null, todosVo.map(function(x){return metricas[x.id]&&metricas[x.id].units||0;}).concat([1]));
  const blocoVo=todosVo.map(function(f, rank){
    const m=metricas[f.id]||{};
    const un=m.units||m.unitsVo||0;
    return linhaPessoa(f, rank, {
      tom:'vo', max:maxUn, valor:un,
      selo: un>VO_CURVA.corte ? UI.badge('R$'+VO_CURVA.bonus+'/un','ok') : '',
      linha: `<b>${un}</b> aparelhos · ${m.vendCount||0} venda${m.vendCount===1?'':'s'}`,
    });
  }).join('');

  // -- Atendentes: o numero que manda e BRUTO DE ACESSORIO --------------------
  // Quem e os dois (Maria) entra nos DOIS rankings: ela concorre a escada do
  // atendente igual a todo mundo.
  const todosAt=presencial.concat(ambos)
    .sort(function(a,b){return (metricas[b.id]&&metricas[b.id].brutoAcess||0)-(metricas[a.id]&&metricas[a.id].brutoAcess||0);});
  const maxBr=Math.max.apply(null, todosAt.map(function(x){return metricas[x.id]&&metricas[x.id].brutoAcess||0;}).concat([1]));
  const blocoAt=todosAt.map(function(f, rank){
    const m=metricas[f.id]||{};
    const mt=metaAtendente(m.brutoAcess||0);
    return linhaPessoa(f, rank, {
      tom:'at', max:maxBr, valor:m.brutoAcess||0,
      selo: mt.nivel ? UI.badge((mt.maxima?'🏆 ':'')+metaAtRotulo(mt), mt.nivel>=2?'ok':'processo') : '',
      linha: `<b>${brl(m.brutoAcess||0)}</b> em acessórios · ${m.qt||0} iten${m.qt===1?'':'s'}`,
    });
  }).join('');

  // -- Sócios: nao entram na folha, entao nao entram no placar ----------------
  const sociosMostrar=socios.slice();
  if(!FUNC.find(function(f){return f.id==='marcella';}))
    sociosMostrar.push({id:'marcella',ap:'Marcella',nome:'Marcella',cargo:'Sócia',tipo:'socio'});
  const blocoSocios=sociosMostrar.map(function(f){
    const m=metricas[f.id]||{};
    const un=m.units||m.vendCount||0;
    return `<button class="eq-linha eq-socio" onclick="openFunc('${f.id}')">
      <span class="eq-av" data-tom="socio">${ini(f.nome)}</span>
      <span class="eq-corpo">
        <span class="eq-topo"><b class="eq-nome">${UI.esc(f.ap)}</b>${UI.badge('sócio','marca')}</span>
        <span class="eq-num">${un>0?`<b>${un}</b> produtos no período`:'sem venda no período'}</span>
      </span>
    </button>`;
  }).join('');

  // -- O placar do mes -------------------------------------------------------
  // Sai todo de fechamentoEquipe(). Vem ANTES dos cards porque e a pergunta que
  // se faz ao abrir a tela: quanto sai de folha este mes, e o que sobra.
  const kpis=[
    { rotulo:'Folha do mês', valor: money(totais.folha), sub: pessoas.length+' pessoas' },
    { rotulo:'Comissões', valor: money(totais.comm), sub:'vendedor + atendente' },
    { rotulo:'Bônus', valor: money((totais.bonus5||0)+(totais.bonusMeta||0)+(totais.bonusCol||0)),
      sub: bonusColF>0 ? 'coletivo '+brl(bonusColF)+'/pessoa' : 'sem bônus coletivo ainda' },
    { rotulo:'Sobra depois da folha', valor: money(totais.liquido),
      tom: totais.liquido>0?'ok':'critico', sub:'lucro − folha − custos' },
  ];

  // -- Fechamento: o mesmo objeto que a exportacao le -------------------------
  const temExtras=pessoas.some(function(p){return p.extrasTot!==0;});
  const colunas=[{t:'Pessoa'},{t:'Salário',num:true}]
    .concat(temExtras?[{t:'Extras',num:true}]:[])
    .concat([{t:'Comissão',num:true},{t:'5% acess.',num:true},{t:'Bônus meta',num:true},{t:'Total',num:true}]);

  const linhasFech=pessoas.map(function(p){
    const cel=[`<td class="forte">${UI.esc(p.nome)}</td>`,
               `<td class="num">${p.sal>0?money(p.sal):'—'}</td>`];
    if(temExtras) cel.push(`<td class="num eq-extra" title="${escAttr(p.extras.map(function(e){return e.desc+' '+brl(e.valor);}).join(' · '))}">${p.extrasTot?'+'+money(p.extrasTot):'—'}</td>`);
    cel.push(`<td class="num">${p.comm>0?money(p.comm):'—'}</td>`);
    cel.push(`<td class="num eq-ok">${p.bonus5>0?money(p.bonus5):'—'}</td>`);
    cel.push(`<td class="num eq-meta">${p.bonusMeta>0?'+'+money(p.bonusMeta):'—'}</td>`);
    cel.push(`<td class="num eq-total-cel">${money(p.total)}</td>`);
    return '<tr>'+cel.join('')+'</tr>';
  }).join('');

  const foraDoRateio=pessoas.filter(function(p){return p.bonusCol===0;}).map(function(p){return p.nome;});
  const rodape=`
    <tr class="eq-fim">
      <td class="forte">Total da folha</td>
      <td class="num" colspan="${temExtras?5:4}">${bonusColF>0
        ? `<span class="eq-nota">cada total inclui o bônus coletivo de ${brl(bonusColF)}${foraDoRateio.length?' · fora do rateio: '+UI.esc(foraDoRateio.join(', ')):''}</span>`
        : ''}</td>
      <td class="num eq-total-cel">${money(totais.folha)}</td>
    </tr>
    <tr>
      <td colspan="${temExtras?6:5}"><span class="eq-nota">Lucro líquido depois da folha completa e dos demais custos</span></td>
      <td class="num ${totais.liquido>0?'eq-ok':'eq-ruim'}">${money(totais.liquido)}</td>
    </tr>`;

  const tabelaFech=UI.card({
    titulo:'Fechamento — '+fech.mesLabel,
    sub:'a tela e a exportação leem o mesmo cálculo',
    flush:true,
    corpo:`<div class="c-tabela-wrap"><table class="c-tabela eq-tabela">
      <thead><tr>${colunas.map(function(c){return `<th${c.num?' class="num"':''}>${c.t}</th>`;}).join('')}</tr></thead>
      <tbody>${linhasFech}</tbody>
      <tfoot>${rodape}</tfoot>
    </table></div>`,
  });

  // Aviso de conciliacao vem ANTES de tudo: quem abre esta tela esta fechando a
  // folha, e o aviso e justamente "nao feche ainda".
  const avisos=fech.avisos.length ? UI.card({
    titulo:'⚠️ Confira antes de fechar a folha',
    corpo: fech.avisos.map(function(a){return `<div class="c-alerta-linha">${UI.esc(a)}</div>`;}).join(''),
    classe:'c-card-alerta',
  }) : '';

  const cabecalho=`
    <div class="pg-head">
      <div>
        <div class="pg-kicker">Pessoas</div>
        <h1 class="pg-title">Equipe</h1>
        <div class="pg-desc">Quem vendeu o quê no período — e quanto sai de folha. Toque numa pessoa para abrir a ficha.</div>
      </div>
      <div class="pg-acoes">
        ${UI.btn('📊 Planilha',{onclick:'exportarFechamento(this)',variante:'primario',titulo:'Arquivo .xlsx com uma aba por colaborador, venda a venda'})}
        ${UI.btn('📄 PDF',{onclick:'fechamentoPDFEscolher()',titulo:'Uma folha por colaborador, ou a folha de uma pessoa só'})}
        ${UI.btn('📋 Resumos',{onclick:'gerarResumoEquipe()',titulo:'Texto pronto pra mandar pra cada pessoa'})}
      </div>
    </div>`;

  return cabecalho + UI.kpis(kpis) + avisos
       + secao('Vendedores', todosVo.length+' pessoas · ordenado por aparelho', blocoVo)
       + secao('Atendentes', todosAt.length+' pessoas · ordenado por acessório', blocoAt)
       + secao('Sócios', 'não entram na folha', blocoSocios)
       + tabelaFech;
}

function gerarResumoEquipe(){
  // Mesma fonte da tabela e da exportacao -- a mensagem que vai pro colaborador
  // nao pode sair de uma conta paralela.
  const fech=fechamentoEquipe();
  const mesLabel=fech.mesLabel;
  const pessoas=fech.pessoas;

  // Montar mensagem de cada pessoa
  function montarMsg(p){
    // Bonus coletivo e por PESSOA -- quem ficou de fora no mes (ferias) nao pode
    // receber a linha na mensagem dizendo que ganhou.
    const bonusColPorPessoa=p.bonusCol;
    const lines=[];
    lines.push('📊 *Fechamento '+mesLabel+'*');
    lines.push('');
    lines.push('Olá, '+p.nome+'! Segue seu resumo:');
    lines.push('');
    if(p.sal>0) lines.push('💼 Salário fixo: *'+brl(p.sal)+'*');
    p.extras.forEach(e => lines.push('➕ '+e.desc+': *'+brl(e.valor)+'*'));
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
  const mesesCurtos = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

  // O card segue o PERIODO DA SIDEBAR, nao o mes de hoje. Antes o historico
  // estava fixo em jan/fev/mar/2026 e os rotulos vinham de new Date() -- no dia
  // 1o do mes o card dizia "Agosto" enquanto mostrava os numeros de julho.
  // Filtro que nao e um mes (semana/hoje/custom/tudo) cai no mes corrente.
  const refCard = _refAnoMes() ||
    (new Date().getFullYear()+'-'+String(new Date().getMonth()+1).padStart(2,'0'));
  const mesAtualStr = refCard;
  // Historico: os 3 meses que terminam no periodo selecionado
  const meses = [2,1,0].map(i => fechamentoMesMenos(refCard, i));
  const mesLabels = {};
  meses.forEach(mm => { mesLabels[mm] = mesesCurtos[Number(mm.slice(5,7))-1]; });
  // Rotulo do periodo, igual ao da tabela de fechamento
  const mesNomeSel = fechamentoMesLabel().replace(' de ', ' ');

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
      const commVo = comissaoVendedor(units);
      const commAt = lucroAcess*0.25;
      const metaAt = bonusMetaAtendente(brutoAcess);
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
      const comm = comissaoVendedor(units);
      const rate = units>VO_CURVA.corte?VO_CURVA.bonus:VO_CURVA.base;
      const metaBatida = units>VO_CURVA.corte;
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
      const _mt = metaAtendente(brutoAcess); // faixas em core.js
      const meta = {nivel:_mt.nivel, val:_mt.bonus, label:metaAtRotulo(_mt)};
      return { brutoAcess:Math.round(brutoAcess), lucroAcess:Math.round(lucroAcess), qtAcess, comm, bonus5:Math.round(bonus5), meta, tipo:'presencial' };
    }
  }

  const dadosMeses = {};
  meses.forEach(m => dadosMeses[m] = calcMes(m));
  const dadosAtual = dadosMeses[mesAtualStr] || calcMes(mesAtualStr);

  // -- Mes atual: os numeros vem da folha (fechamentoEquipe), nao de conta local.
  // Antes este bloco tinha a propria versao: usava SALARIOS em vez do lancamento
  // de Custos, e no caso hibrido (Maria) ignorava a curva de 80 un -- o card
  // mostrava um total diferente da tabela de fechamento logo abaixo.
  const fechCard = fechamentoEquipe();
  const mCalc = fechCard.m;
  const lAcessCalc = mCalc.lAcess || 0;
  const pFech = fechCard.pessoas.find(p => p.id === f.id) || null;

  const sal             = pFech ? pFech.sal       : 0;
  const commAtual       = pFech ? pFech.comm      : 0;
  const bonus5Atual     = pFech ? pFech.bonus5    : 0;
  const bonusMetaAtual  = pFech ? pFech.bonusMeta : 0;
  const bonusColPP      = pFech ? pFech.bonusCol  : fechCard.bonusCol;
  const totalReceber    = pFech ? pFech.total     : 0;

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
      const mt=metaAtendente(ba); // faixas em core.js (fonte unica)
      const metaNivel=mt.nivel, proxMeta=mt.prox;
      const faltaMeta=Math.max(0,mt.falta);
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
            ${!mt.maxima&&proxMeta?`<span>R$${proxMeta/1000}k</span>`:'<span style="color:var(--green)">✅ máxima</span>'}
          </div>
        </div>`;
    }
  }

  // -- Contato: leitura x edicao -------------------------------------------------
  // Valores vem do Supabase quando existem, senao do FUNC (config.js). Editavel
  // pela tela -- sao campos de cadastro puro, nenhum entra em conta de fechamento.
  const ct = funcContato(f);
  const boxCt = (rot, val, copiavel) => !val ? '' : `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;background:var(--bg3);border-radius:10px;margin-bottom:8px">
      <div style="min-width:0">
        <div style="font-size:10px;color:var(--text4);font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-bottom:2px">${rot}</div>
        <div style="font-size:13px;font-weight:600;color:var(--text);word-break:break-word;white-space:pre-wrap">${escapeHtml(val)}</div>
      </div>
      ${copiavel ? `<button class="c-btn c-btn-sm" data-copy="${escAttr(val)}" onclick="copiarCampo(this)" style="flex:none">Copiar</button>` : ''}
    </div>`;

  const contatoLeitura = (ct.pix||ct.telefone||ct.email||ct.data_inicio||ct.obs)
    ? boxCt('PIX', ct.pix, true) + boxCt('Telefone', ct.telefone, true)
      + boxCt('E-mail', ct.email, true) + boxCt('Início', ct.data_inicio, false)
      + boxCt('Observações', ct.obs, false)
    : `<div style="padding:12px 14px;background:var(--bg3);border-radius:10px;font-size:12px;color:var(--text3)">Sem dados de contato — use <b>Editar</b> para preencher.</div>`;

  const contatoEdicao = `
    <div style="display:grid;gap:10px">
      ${editField('PIX',           'pix_'+f.id,    escAttr(ct.pix))}
      ${editField('Telefone',      'tel_'+f.id,    escAttr(ct.telefone))}
      ${editField('E-mail',        'email_'+f.id,  escAttr(ct.email), 'email')}
      ${editField('Início',        'inicio_'+f.id, escAttr(ct.data_inicio), 'date')}
      ${editField('Observações',   'obs_'+f.id,    escapeHtml(ct.obs), 'textarea')}
    </div>`;

  const btnsContato = equipeEditMode
    ? `<div style="display:flex;gap:8px">
         <button id="btn-salvar-${f.id}" class="c-btn c-btn-sm primario" onclick="saveEquipeExtra('${f.id}')">Salvar</button>
         <button class="c-btn c-btn-sm" onclick="toggleEquipeEdit('${f.id}')">Cancelar</button>
       </div>`
    : `<button class="c-btn c-btn-sm" onclick="toggleEquipeEdit('${f.id}')">Editar</button>`;

  // -- Fechamento --------------------------------------------------------------
  const mesNomeAtual = mesNomeSel; // periodo da sidebar, nao o mes de hoje
  const linhasFechamento = [
    sal>0 ? ['Salário fixo', brl(sal)] : null,
    ...(pFech ? pFech.extras.map(e => [e.desc, brl(e.valor)]) : []),
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
    if(pFech) pFech.extras.forEach(e => lines.push('➕ '+e.desc+': *'+brl(e.valor)+'*'));
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
          ${mesNomeSel}
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
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px">
          <div style="font-size:11px;font-weight:700;color:var(--text4);text-transform:uppercase;letter-spacing:.08em">Fechamento</div>
          ${UI.btn('📄 PDF', {onclick:`fechamentoPDF('${f.id}')`, sm:true,
            titulo:'Só a folha de '+escAttr(f.ap)+', pra compartilhar'})}
        </div>
        ${fechamentoHtml}
      </div>

      <!-- CONTATO -->
      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px">
          <div style="font-size:11px;font-weight:700;color:var(--text4);text-transform:uppercase;letter-spacing:.08em">Contato</div>
          ${btnsContato}
        </div>
        ${equipeEditMode ? contatoEdicao : contatoLeitura}
      </div>

    </div>`;
}


function editField(label, id, val, type='text'){
  if(type==='textarea') return `<div><div style="font-size:11px;color:var(--text3);margin-bottom:4px">${label}</div><textarea id="${id}" style="width:100%;padding:8px 12px;background:var(--bg3);border:1px solid var(--border2);border-radius:8px;color:var(--text);font-size:13px;outline:none;resize:vertical;min-height:80px;font-family:inherit">${val}</textarea></div>`;
  return `<div><div style="font-size:11px;color:var(--text3);margin-bottom:4px">${label}</div><input id="${id}" type="${type}" value="${val}" style="width:100%;padding:8px 12px;background:var(--bg3);border:1px solid var(--border2);border-radius:8px;color:var(--text);font-size:13px;outline:none"></div>`;
}

function toggleEquipeEdit(id){
  equipeOpenId=id;
  equipeEditMode=!equipeEditMode;
  document.getElementById('content').innerHTML=renderEquipe();
}

function copiarCampo(btn){
  navigator.clipboard.writeText(btn.dataset.copy||'');
  const antes=btn.textContent;
  btn.textContent='✅';
  setTimeout(()=>{btn.textContent=antes;},2000);
}

function saveEquipeExtra(id){
  const f=FUNC.find(x=>x.id===id);
  if(!f) return;
  // '' e valor valido (limpar o campo apaga de verdade) -- por isso ?? e nao ||.
  const campo=k=>document.getElementById(k+'_'+id)?.value?.trim();
  const cur=getEquipeExtra(id);
  const dados={
    pix:         campo('pix')    ?? cur.pix         ?? f.pix   ?? '',
    telefone:    campo('tel')    ?? cur.telefone    ?? '',
    email:       campo('email')  ?? cur.email       ?? f.email ?? '',
    // ⚠️ `data_inicio` virou coluna DATE em 02/set/2026 (era text, e aceitava ''
    // e formato BR -- os dois quebravam a conta de ferias do RH em silencio).
    // Coluna date RECUSA string vazia: limpar o campo tem que mandar null.
    data_inicio: (campo('inicio') ?? cur.data_inicio ?? '') || null,
    obs:         campo('obs')    ?? cur.obs         ?? ''
  };
  const btn=document.getElementById('btn-salvar-'+id);
  if(btn){ btn.disabled=true; btn.textContent='Salvando…'; }
  setEquipeExtra(id,dados)
    .then(()=>{
      equipeEditMode=false;
      document.getElementById('content').innerHTML=renderEquipe();
    })
    .catch(err=>{
      if(btn){ btn.disabled=false; btn.textContent='Salvar'; }
      alert('Não foi possível salvar as alterações de '+f.ap+'.\n\n'+err.message
            +'\n\nNada foi perdido — os campos continuam preenchidos na tela.');
    });
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

// "venda cart" / "venda urban" e a LOJA, nao uma pessoa. O trecho contem "vend",
// entao caia no ramo do vendedor e sobrescrevia o nome ja encontrado quando a
// linha da loja vinha DEPOIS: "Atendente Gabi vendedor David venda cart" virava
// vendedor="cart", que cai em SOCIOS_LOJA e vira ninguem -- o David perdia a
// comissao em silencio (venda 40585050, R$2.880, jul/2026).
// ⚠️ ESTE PARSER TEM UM ESPELHO EM OUTRO REPO: parseObs() no sync.js de
// brenostap/phonecar-sync. Ele preenche vendas.vendedor_obs/atendente_obs, de
// onde nasce a chave e de onde as views do "Meu dia" leem. Mexeu aqui, mexe la
// -- e confira com `node scripts/compara-parsers.js ../phonecar-sync/sync.js`,
// que roda os dois contra as vendas reais e tem que dar DIVERGEM 0.
// Em 01/set/2026 eram 47 divergencias: o sync nao lia "Atendente. Anne".
const NOME_E_LOJA = ['cart','urban','loja','online'];

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
        if(nome&&!NOME_E_LOJA.includes(nome)) vendedor=nome;
      }
    }
    if(isAtend){
      // Aceita: atendente, atendentes, atendeu, atendi, atendendo
      const ma=l.match(/atend(?:ente[s]?|eu|i\w*|endo)?[\s\-:.,]+(.+)/);
      if(ma){
        const tokens=ma[1].trim().split(/[\s,]+/);
        const nome=tokens.map(t=>t.replace(/[-:,.]/g,'').trim()).find(t=>t.length>1);
        if(nome&&!NOME_E_LOJA.includes(nome)) atendente=nome;
      }
    }
  });
  return{loja,vendedor,atendente};
}
// Helper que usa campos diretos (atendente_obs/vendedor_obs) quando disponiveis
// Fallback para parseObs(observacoes) para compatibilidade com FoneNinja
//
// A OBS MANDA. Os campos estruturados da FoneNinja (virada de ago/2026, ver
// docs/REGISTRO-VENDA-2026-08.md) entram SO onde a obs nao diz nada -- venda sem
// obs some da comissao em silencio, e desde 06/ago ja existe venda assim.
// Nada de sobrescrever o que a pessoa escreveu: se a obs e o campo discordarem,
// a diferenca aparece na Conferencia e o dono decide.
function getVendaInfo(venda){
  if(!venda) return {loja:null,vendedor:null,atendente:null};
  const parsed = parseObs(venda.observacoes||'');
  const obsVend = venda.vendedor_obs || parsed.vendedor;
  const obsAtend = venda.atendente_obs || parsed.atendente;
  return {
    loja:      parsed.loja  || lojaDaOrigem(venda.origem_cliente_id),
    vendedor:  obsVend      || campoVendedorVO(venda),
    atendente: obsAtend     || cadastradorAT(venda),
  };
}

// -- Campos estruturados (so valem como TAPA-BURACO da obs) ------------------
// origem do cliente -> loja. O sync grava o id NA VENDA (ja congelado) e o
// catalogo em `origens_cliente`; ORIGEM_LOJA e o mapa carregado no data.js.
function lojaDaOrigem(origemId){
  if(!origemId) return null;
  return (typeof ORIGEM_LOJA !== 'undefined' && ORIGEM_LOJA[origemId]) || null;
}
// Campo vendedor -> so aceita quem e VENDEDOR ONLINE de verdade. Ate 05/ago esse
// campo carregava o ATENDENTE (era o unico perfil que existia): sem este filtro,
// Vitinho viraria vendedor e receberia comissao de venda que nao e dele.
function campoVendedorVO(venda){
  const nome = venda.vendedor_nome;
  if(!nome) return null;
  const k = matchNome(String(nome).toLowerCase().trim(), VO_KEYS)
         || matchNome(String(nome).toLowerCase().trim().split(/\s+/)[0], VO_KEYS);
  return k || null;
}
// Cadastrador (quem estava logado) -> atendente. Mesmo cuidado: so passa quem e
// atendente oficial. `cadastrador_id` vem do sync; `_cadastrador` e a fonte
// antiga (contas.raw), que ainda cobre as vendas nao re-sincronizadas.
function cadastradorAT(venda){
  const nome = (typeof funcNomePorId === 'function' ? funcNomePorId(venda.cadastrador_id) : null)
            || venda._cadastrador?.nome;
  if(!nome) return null;
  const n = String(nome).toLowerCase().trim();
  // A lista vale pelo MES DA VENDA, nao pelo periodo da tela: o dashboard monta
  // meses diferentes de uma vez, e quem passou a ser atendente em ago/2026
  // (VO_ATENDE_KEYS) nao pode virar atendente de uma venda de julho.
  const ats = atKeysVigentes(mesDaVenda(venda));
  return matchNome(n, ats) || matchNome(n.split(/\s+/)[0], ats) || null;
}
// 'YYYY-MM' da venda em BRT (o banco grava data_saida em UTC).
function mesDaVenda(venda){
  if(!venda || !venda.data_saida) return null;
  const c = brtComponents(venda.data_saida);
  return c.year + '-' + String(c.month).padStart(2,'0');
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

