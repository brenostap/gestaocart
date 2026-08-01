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

  if(f.tipo==='socio') return { vendCount:0, units:0, comm:0, rate:0, metaBatida:false, tipo:'socio' };
  if(f.tipo==='online'){
    const k=f.voKey;
    if(!k) return { vendCount:0, units:0, comm:0, rate:25, metaBatida:false, tipo:'online' };
    let vendCount=0,units=0;
    v.forEach(x=>{ const {vendedor}=getVendaInfo(x); const m=matchNome(vendedor,[k]); if(m){vendCount++;units+=contarIphones(x);} });
    // Curva de comissao: fonte unica em core.js (VO_CURVA / comissaoVendedor)
    const comm = comissaoVendedor(units);
    const rate = units>VO_CURVA.corte ? VO_CURVA.bonus : VO_CURVA.base;
    const metaBatida = units>VO_CURVA.corte;
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
// criterio de AT_LABELS_ALL/VO_LABELS_ALL (core.js), entao ranking e folha
// falam do mesmo conjunto de gente.
function fechamentoPessoas(){
  return FUNC.filter(f =>
    !/\(saiu\)/i.test(f.cargo||'') &&
    ((f.voKey && VO_KEYS.includes(f.voKey)) || (f.atKey && AT_KEYS.includes(f.atKey)))
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
  // Bonus coletivo e pago CHEIO para cada pessoa (uma vez por pessoa).
  const bonusCol = (metaDev?.bonus||0) + (metaAc?.bonus||0);

  const avisos = [];
  if(currentStore !== 'ambas') avisos.push(
    'Contexto da loja está em "'+currentStore+'" — a folha só considera as vendas dessa loja.');

  const pessoas = fechamentoPessoas().map(f => {
    const vo = (f.voKey && VO_KEYS.includes(f.voKey)) ? (m.voMap[f.voKey] || null) : null;
    const at = (f.atKey && AT_KEYS.includes(f.atKey)) ? (m.atMap[f.atKey] || null) : null;

    const units      = vo ? vo.units : 0;
    const pedidos    = vo ? vo.vendas : 0;
    const commVo     = comissaoVendedor(units);
    const la         = at ? at.la : 0;
    const brutoAcess = at ? at.brutoAcess : 0;
    const qtAcess    = at ? at.qt : 0;
    const commAt     = Math.round(la * 0.25);
    const bonus5     = f.bonus ? Math.round(m.lAcess * 0.05) : 0;
    const meta       = metaAtendente(brutoAcess);
    const bonusMeta  = at ? meta.bonus : 0;
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
      l.comissao = comissaoVendedor(acum) - comissaoVendedor(antes);
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
      bonus5, bonusMeta, bonusCol, meta,
      total: rem.valor + extrasTot + commVo + commAt + bonus5 + bonusMeta + bonusCol,
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

  return {
    m, ref:_refAnoMes(), loja:currentStore, geradoEm:new Date(),
    mesLabel: fechamentoMesLabel(),
    base: {
      aparelhos:m.unPrincipal, acessBruto:m.vendaAcess, acessLucro:m.lAcess,
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

  // O seletor de periodo agora vive na sidebar (contexto persistente, brief §7.2)
  let html = '';

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
      const metaNivel=metaAtendente(comm.brutoAcess).nivel; // faixas em core.js
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
  // Todos os numeros vem de fechamentoEquipe(): a tela e a exportacao leem o
  // MESMO objeto. Nao recalcular nada aqui.
  const fech=fechamentoEquipe();
  const {pessoas,totais,bonusCol:bonusColF}=fech;
  // A coluna de extras (hora extra, ajuste de meta) so aparece nos meses que
  // tem extra -- mes normal continua com a tabela enxuta, que e a regra no
  // celular. O title conta de onde veio cada um.
  const temExtras=pessoas.some(p=>p.extrasTot!==0);
  const thNum=(t,cor)=>'<th style="text-align:right;padding:6px 8px;color:'+(cor||'var(--text4)')
    +';font-weight:'+(cor?'700':'600')+';font-size:10px;text-transform:uppercase;letter-spacing:.05em">'+t+'</th>';

  const tabelaFechamento=`
    <div class="card" style="margin-top:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap">
        <div class="card-title" style="margin:0">📋 Fechamento — ${fech.mesLabel}</div>
        <div style="display:flex;gap:8px">
          ${UI.btn('📊 Exportar fechamento',{onclick:'exportarFechamento(this)',variante:'primario',sm:true,titulo:'Planilha com uma aba por colaborador, venda a venda'})}
          ${UI.btn('📋 Gerar resumos',{onclick:'gerarResumoEquipe()',sm:true})}
        </div>
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead>
            <tr style="border-bottom:1px solid var(--border2)">
              <th style="text-align:left;padding:6px 8px;color:var(--text4);font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:.05em">Pessoa</th>
              ${thNum('Salário')}
              ${temExtras?thNum('Extras'):''}
              ${thNum('Comissão')}
              ${thNum('5% Acess')}
              ${thNum('Bônus meta')}
              ${thNum('Total','var(--cart)')}
            </tr>
          </thead>
          <tbody>
            ${pessoas.map(p=>`
              <tr style="border-bottom:1px solid var(--border)">
                <td style="padding:8px 8px;font-weight:600;color:var(--text)">${p.nome}</td>
                <td style="padding:8px 8px;text-align:right;color:var(--text3)">${p.sal>0?brl(p.sal):'—'}</td>
                ${temExtras?`<td style="padding:8px 8px;text-align:right;color:var(--purple)" title="${escAttr(p.extras.map(e=>e.desc+' '+brl(e.valor)).join(' · '))}">${p.extrasTot?'+'+brl(p.extrasTot):'—'}</td>`:''}
                <td style="padding:8px 8px;text-align:right;color:var(--text2)">${p.comm>0?brl(p.comm):'—'}</td>
                <td style="padding:8px 8px;text-align:right;color:var(--green)">${p.bonus5>0?brl(p.bonus5):'—'}</td>
                <td style="padding:8px 8px;text-align:right;color:var(--yellow)">${p.bonusMeta>0?'+'+brl(p.bonusMeta):'—'}</td>
                <td style="padding:8px 8px;text-align:right;font-weight:700;color:var(--cart)">${brl(p.total)}</td>
              </tr>`).join('')}
          </tbody>
          <tfoot>
            <tr style="border-top:2px solid var(--border2)">
              <td style="padding:8px 8px;font-weight:700;color:var(--text)">Total folha</td>
              <td colspan="${temExtras?5:4}" style="padding:8px 8px;text-align:right;font-size:10px;color:var(--text4)">
                ${bonusColF>0?`cada total inclui bônus coletivo ${brl(bonusColF)} (devices+acess)`:''}
              </td>
              <td style="padding:8px 8px;text-align:right;font-weight:700;font-size:14px;color:var(--cart)">${brl(totais.folha)}</td>
            </tr>
            <tr>
              <td colspan="${temExtras?6:5}" style="padding:6px 8px;font-size:11px;color:var(--text3)">Lucro líquido após folha completa e demais custos</td>
              <td style="padding:6px 8px;text-align:right;font-weight:700;font-size:13px;color:${totais.liquido>0?'var(--green)':'var(--red)'}">${brl(totais.liquido)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>`;

  html += tabelaFechamento;

    return html;
}

function gerarResumoEquipe(){
  // Mesma fonte da tabela e da exportacao -- a mensagem que vai pro colaborador
  // nao pode sair de uma conta paralela.
  const fech=fechamentoEquipe();
  const mesLabel=fech.mesLabel;
  const pessoas=fech.pessoas;
  const bonusColPorPessoa=fech.bonusCol;

  // Montar mensagem de cada pessoa
  function montarMsg(p){
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
      const meta = {nivel:_mt.nivel, val:_mt.bonus, label:_mt.nivel?'R$'+(_mt.faixa/1000)+'k':''};
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
            ${metaNivel<3&&proxMeta?`<span>R$${proxMeta/1000}k</span>`:'<span style="color:var(--green)">✅ máxima</span>'}
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
        <div style="font-size:11px;font-weight:700;color:var(--text4);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px">Fechamento</div>
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
    data_inicio: campo('inicio') ?? cur.data_inicio ?? '',
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

