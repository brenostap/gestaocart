// -- Helpers de data em fuso BRT (America/Sao_Paulo, UTC-3) --
// Banco grava data_saida em UTC. Para consistencia (qualquer navegador, qualquer fuso),
// SEMPRE comparar datas em BRT. Nao depender do fuso do navegador do usuario.
function toBRT(dateStr){
  // Retorna um objeto Date "deslocado" para BRT: getMonth/getFullYear/getDate
  // retornam os componentes corretos em BRT independente do fuso do navegador.
  const d = new Date(dateStr);
  // UTC offset em ms (-3h para BRT). Brasil nao tem mais horario de verao desde 2019.
  return new Date(d.getTime() - 3*60*60*1000);
}
function brtNow(){
  return toBRT(new Date().toISOString());
}
function brtSameDay(a, b){
  return a.getUTCFullYear()===b.getUTCFullYear()
      && a.getUTCMonth()===b.getUTCMonth()
      && a.getUTCDate()===b.getUTCDate();
}
function brtComponents(dateStr){
  // Retorna {year, month (1-12), day} no fuso BRT
  const d = toBRT(dateStr);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth()+1, day: d.getUTCDate() };
}
const ALIASES={
  // -- Vendedores online ----------------------------------
  'isabella':'isa',                              // isa
  'melissa':'mel','mell':'mel',                  // mel
  'pe':'pietra',                                 // pietra (abreviacao)
  // xavier era funcionario antigo -- nao mapear mais

  // -- Atendentes presenciais -----------------------------
  'vitor':'vitinho','victor':'vitinho',           // vitinho
  'citinho':'vitinho','vitinh':'vitinho',         // vitinho
  'vitonho':'vitinho','vitinhi':'vitinho','vitinhoi':'vitinho', // vitinho (typos jun/2026)
  'deni':'denilson','denilsom':'denilson',        // denilson
  'deno':'denilson',                             // denilson (erro frequente)
  'davii':'davi',                                // davi
  'ane':'anne','anen':'anne',                    // anne (erro frequente)
  'léo':'leo',                                   // leo (acento, jun/2026)
  'madu':'maria',                                // maria (erro frequente, jun/2026)

  // -- Loja / Socios / IAs --------------------------------
  // (nao mapeiam para nenhum VO ou AT -- ficam como loja)
  // marcela, marcella, maju, duda -> tratados em SOCIOS_LOJA
};

// Socios e IAs -- aparecem nas vendas mas NAO sao VO nem AT
const SOCIOS_LOJA = ['breno','gustavo','marcella','marcela','marcelo','maju','duda','cart','urban','online','loja'];

// Vendedores online OFICIAIS -- so esses recebem comissao por device
// maria: SAC/online (entrou jun/2026) -- device com curva 80
const VO_KEYS = ['david','isa','mel','pietra','maria'];

// Atendentes presenciais OFICIAIS -- so esses recebem 25% de acess
// leo (jun/2026), luana (saiu jun/2026 -- mantida para historico), gabi (entrou no
// lugar da luana), maria (hibrida: atende acess quando e a atendente)
const AT_KEYS = ['vitinho','davi','anne','denilson','pietra','leo','luana','gabi','maria'];

// Listas [rotulo, chave] para RANKING e BONUS -- derivadas do cadastro (FUNC em config.js).
// NUNCA escrever nomes a mao nas telas: em jul/2026 o Leo (top 1 do mes) e a Gabi ficaram
// de fora de 4 arrays hardcoded no dashboard, e o bonus de meta saiu R$1.000 menor que a folha.
// Quem entra/sai do FUNC passa a aparecer sozinho. Quem saiu (cargo "(saiu)") fica fora.
// Confere com o conjunto que a folha (equipe.js) paga.
// Quem saiu da loja. Marca-se com "(saiu)" no cargo do FUNC (config.js) -- o
// cadastro FICA, senao o historico perde a atribuicao das vendas dela. Esta e a
// UNICA leitura desse marcador: quem precisa esconder ex-funcionario chama daqui.
//
// Duas formas, e a diferenca importa:
//   cargo "(saiu)" sozinho -> fora de TODOS os meses. E como Pietra e Luana ja
//     foram exportadas; mexer nisso agora mudaria fechamento antigo.
//   saiuEm:'YYYY-MM'       -> fora so DAQUELE MES EM DIANTE. Os meses anteriores
//     continuam com a pessoa na folha, porque ela foi paga neles. Denilson saiu
//     em 31/07/2026: julho tem salario, hora extra e o bonus coletivo dele
//     lancados -- se sumisse de julho, a folha ja paga mudaria de valor.
// Periodo que nao e um mes (semana/tudo/custom) mantem a pessoa: e historico.
function saiuDaEquipe(f, ref){
  if(!f) return false;
  if(f.saiuEm) return _refAnoMes(ref) >= f.saiuEm;
  return /\(saiu\)/i.test(f.cargo || '');
}

// Funcoes, nao constantes: com saida por mes a lista muda conforme o periodo do
// contexto. Eram `const` avaliado uma vez na carga -- quem saiu em agosto ficaria
// no ranking de agosto ou sumiria de julho, dependendo da ordem dos scripts.
function atLabelsAll(ref){
  return FUNC.filter(f => f.atKey && AT_KEYS.includes(f.atKey) && !saiuDaEquipe(f, ref))
             .map(f => [f.ap, f.atKey]);
}
function voLabelsAll(ref){
  return FUNC.filter(f => f.voKey && VO_KEYS.includes(f.voKey) && !saiuDaEquipe(f, ref))
             .map(f => [f.ap, f.voKey]);
}

// === Regras novas a partir de junho/2026 (NAO retroativas) ===
// Tiers de meta coletiva e classificador de acessorio mudaram em jun/2026.
// Meses anteriores (abr/mai) mantem o regime antigo para nao alterar fechamentos pagos.
function _periodoNovoRegime(ref){
  let p = ref;
  if(!p || p==='mes'){
    if(typeof currentPeriod!=='undefined' && /^\d{4}-\d{2}$/.test(currentPeriod)) p=currentPeriod;
    else return true; // mes corrente -> regime novo
  }
  if(/^\d{4}-\d{2}$/.test(p)) return p >= '2026-06';
  return true;
}
// Acessorio para fins de COMISSAO: isAcess estrito (jun+), legado !isPrincipal&&!isCancelado (antes)
function acessParaComissao(p, ref){
  return _periodoNovoRegime(ref) ? isAcess(p) : (!isPrincipal(p) && !isCancelado(p));
}

// Periodo de referencia resolvido para 'YYYY-MM'. Filtro que nao e um mes
// (semana/hoje/custom/tudo) devolve null -> quem chama usa a tabela vigente.
function _refAnoMes(ref){
  let p = ref;
  if(!p || p === 'mes'){
    if(typeof currentPeriod !== 'undefined' && /^\d{4}-\d{2}$/.test(currentPeriod)) p = currentPeriod;
    else { const n = new Date(); p = n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0'); }
  }
  return /^\d{4}-\d{2}$/.test(p) ? p : null;
}

// FONTE UNICA das faixas de META COLETIVA (equipe, fechamento, dashboard).
// Estavam copiadas em 6 lugares; quando o dono mudou as faixas em jul/2026 a
// folha teria pago R$1.000 por pessoa onde o certo era R$400.
//
// Regra: NUNCA retroativas -- cada tabela nova vira um degrau, para fechamento
// ja pago nao mudar de valor depois.
//   ate mai/2026 : 300/350/400 aparelhos · 20k/25k/30k acessorios
//   jun/2026     : 350/400/450 aparelhos · 25k/30k/40k acessorios
//   jul/2026 +   : 400/450/500 aparelhos · 30k/40k/50k acessorios
//
// 'dev' conta APARELHOS (unidades principais), nao numero de vendas -- confirmado
// com o dono em 31/07/2026, apesar de a mensagem das metas dizer "400 Vendas".
// 'acess' e o BRUTO de acessorios, nao o lucro.
function metasColetivas(ref){
  const p = _refAnoMes(ref);
  if(p && p < '2026-06') return {
    dev:   [{qt:300,bonus:200},{qt:350,bonus:400},{qt:400,bonus:550}],
    acess: [{val:20000,bonus:150},{val:25000,bonus:200},{val:30000,bonus:500}],
  };
  if(p === '2026-06') return {
    dev:   [{qt:350,bonus:500},{qt:400,bonus:750},{qt:450,bonus:1000}],
    acess: [{val:25000,bonus:200},{val:30000,bonus:500},{val:40000,bonus:750}],
  };
  return {
    dev:   [{qt:400,bonus:600},{qt:450,bonus:800},{qt:500,bonus:1000}],
    acess: [{val:30000,bonus:400},{val:40000,bonus:700},{val:50000,bonus:1000}],
  };
}

// Quem entra no rateio do BONUS COLETIVO do mes. Como o bonus e pago cheio para
// cada pessoa (nao dividido), quem passou o mes fora nao gera nada e ainda assim
// levaria ate R$2.000 -- por isso a lista SEM_BONUS_COLETIVO (config.js).
//
// NUNCA retroativa: antes de ago/2026 todo mundo da folha recebia, inclusive quem
// esteve de ferias (Anne em jun/2026). Fechamento ja pago nao pode mudar de valor.
const BONUS_COL_EXCLUI_DESDE = '2026-08';
function entraNoBonusColetivo(id, ref){
  const p = _refAnoMes(ref);
  if(!p || p < BONUS_COL_EXCLUI_DESDE) return true;
  return !(SEM_BONUS_COLETIVO[p] || []).includes(id);
}

// FONTE UNICA da META INDIVIDUAL do atendente (bruto de acessorios do mes).
// Estava copiada em 8 lugares como ternario solto (equipe.js x5, render.js x2,
// dash-v2.js x1). Diferente da meta coletiva, estas faixas nao mudaram desde que
// existem -- por isso nao tem tabela por mes. Se um dia mudarem, este vira o
// unico lugar a editar (e a regra de "nunca retroativa" vale igual).
const META_AT_FAIXAS = [
  {val:4000,  bonus:100},
  {val:6000,  bonus:300},
  {val:10000, bonus:1000},
];
// Devolve o estado completo da meta: faixa batida, bonus, proxima faixa e quanto
// falta. O "faltou X pra faixa de Y" do fechamento sai daqui, nao de conta na tela.
function metaAtendente(bruto){
  const b = parseFloat(bruto||0);
  const batida = META_AT_FAIXAS.filter(f => b >= f.val).pop() || null;
  const prox   = META_AT_FAIXAS.find(f => b < f.val) || null;
  return {
    nivel:     batida ? META_AT_FAIXAS.indexOf(batida)+1 : 0,
    bonus:     batida ? batida.bonus : 0,
    faixa:     batida ? batida.val : 0,
    prox:      prox ? prox.val : null,
    proxBonus: prox ? prox.bonus : 0,
    falta:     prox ? prox.val - b : 0,
  };
}
function bonusMetaAtendente(bruto){ return metaAtendente(bruto).bonus; }

// FONTE UNICA da comissao do VENDEDOR por device: R$25/un ate o corte de 80
// unidades no mes, R$35/un nas seguintes (a curva vale para o mes inteiro, nao
// so para as unidades extras -- as 80 primeiras continuam a R$25).
const VO_CURVA = { base:25, bonus:35, corte:80 };
function comissaoVendedor(units){
  const u = parseInt(units||0) || 0;
  return u <= VO_CURVA.corte
    ? u*VO_CURVA.base
    : VO_CURVA.corte*VO_CURVA.base + (u-VO_CURVA.corte)*VO_CURVA.bonus;
}

// Socios -- aparecem nas vendas como vendedor mas NAO sao comissionados
const SOCIOS = ['breno','gustavo','marcella','marcela','marcelo'];

// Vendedores online oficiais -- SOMENTE esses recebem comissao por device

function matchNome(n,lista){
  if(!n) return null;
  let nl = n.toLowerCase().trim();
  // Resolver alias primeiro
  if(ALIASES[nl]) nl = ALIASES[nl];
  // Se for socio/loja/IA, nunca e VO nem AT
  if(typeof SOCIOS_LOJA !== 'undefined' && SOCIOS_LOJA.includes(nl)) return null;
  // Match EXATO -- sem startsWith para evitar "davi" -> "david"
  return lista.find(x => nl === x) || null;
}

function parseTitulo(t){
  if(!t)return{modelo:'?',capacidade:'?',cor:'?',condicao:''};
  let s=t.replace(/^iPhone\s+/i,'').trim();
  const cm=s.match(/(\d+\s*(?:GB|TB))/i);
  const cap=cm?cm[1].replace(/\s/g,''):'?';
  const cond=/lacrado/i.test(s)?'Lacrado':/seminovo/i.test(s)?'Seminovo':'';
  const bc=s.split(cm?.[1]||'')[0].trim();
  const cor=s.replace(/^.*?\d+\s*(?:GB|TB)\s*/i,'').replace(/\s*(seminovo|lacrado)\s*$/i,'').trim();
  return{modelo:'iPhone '+bc,capacidade:cap,cor:cor||'?',condicao:cond};
}

// ===================================================================
// PRECOS DE VENDA (lookup na tabela_precos do Supabase)
// ===================================================================
let _precosCache = null;
let _precosCachePromise = null;

// Carregador unico — delega para loadTabelaFromSB(), que normaliza as linhas
// e alimenta tanto _precos (aba Tabela) quanto _precosCache (preco de venda).
async function carregarTabelaPrecos(){
  if(_precosCache && _precosCache.length) return _precosCache;
  if(_precosCachePromise) return _precosCachePromise;
  _precosCachePromise = loadTabelaFromSB().finally(() => { _precosCachePromise = null; });
  return _precosCachePromise;
}

function _normPreco(s){
  if(!s) return '';
  return String(s).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').trim();
}

// Retorna { upgrade, varejo, match } ou null
function getPrecoVenda(item, tabelaPrecos){
  if(!tabelaPrecos || tabelaPrecos.length === 0) return null;
  const titulo = item.produto?.titulo || item.titulo || '';
  if(!titulo) return null;
  const { modelo, capacidade, cor, condicao } = parseTitulo(titulo);
  const modeloNorm = _normPreco(modelo);
  const corNorm = _normPreco(cor);
  const cond = condicao || 'Seminovo';
  // Fase 1: match exato com cor (Lacrado 17 Pro/Pro Max)
  if(corNorm){
    const exato = tabelaPrecos.find(p =>
      p.modelo_norm === modeloNorm &&
      p.capacidade === capacidade &&
      p.condicao === cond &&
      p.cor_norm === corNorm
    );
    if(exato) return { upgrade: exato.preco_upgrade, varejo: exato.preco_varejo, match: 'exato' };
  }
  // Fase 2: match sem cor (vale para todas)
  const semCor = tabelaPrecos.find(p =>
    p.modelo_norm === modeloNorm &&
    p.capacidade === capacidade &&
    p.condicao === cond &&
    p.cor === null
  );
  if(semCor) return { upgrade: semCor.preco_upgrade, varejo: semCor.preco_varejo, match: 'modelo+cap' };
  return null;
}

function getPrecoVendaSync(item){
  return getPrecoVenda(item, _precosCache || []);
}

function filterByPeriodStatic(vendas, period){
  // Sempre usar BRT para consistencia (banco grava UTC)
  const nowBrt=brtNow();
  return vendas.filter(v=>{
    const d=toBRT(v.data_saida);
    if(period==='hoje') return brtSameDay(d, nowBrt);
    if(period==='semana'){
      const s=new Date(nowBrt.getTime());
      s.setUTCDate(nowBrt.getUTCDate()-nowBrt.getUTCDay());
      s.setUTCHours(0,0,0,0);
      return d>=s;
    }
    if(period==='mes') return d.getUTCFullYear()===nowBrt.getUTCFullYear()&&d.getUTCMonth()===nowBrt.getUTCMonth();
    return true;
  });
}
function filterByPeriod(vendas, incluirPending=false){
  // Nunca incluir canceladas
  const ativas = vendas.filter(v => v.status !== 'canceled');
  // Por padrao so completed; com incluirPending tambem traz as pending
  const filtradas = incluirPending ? ativas : ativas.filter(v => v.status !== 'pending');

  const nowBrt=brtNow();
  // Custom date range -- intervalos input do usuario sao locais (BRT)
  if(currentPeriod==='custom' && customDateStart){
    // Tratamos as datas custom como ja sendo em BRT
    // customDateStart e 'YYYY-MM-DD' -> meia-noite BRT = 03:00 UTC
    const start=new Date(customDateStart+'T03:00:00Z');
    const endStr = customDateEnd || customDateStart;
    // Fim do dia: 23:59:59 BRT = 02:59:59 UTC do dia seguinte
    const endDate=new Date(endStr+'T03:00:00Z');
    endDate.setUTCDate(endDate.getUTCDate()+1);
    endDate.setUTCSeconds(endDate.getUTCSeconds()-1);
    return filtradas.filter(v=>{ const d=new Date(v.data_saida); return d>=start&&d<=endDate; });
  }
  // Periodo no formato 'YYYY-MM' = mes especifico (em BRT)
  if(currentPeriod && currentPeriod.match(/^\d{4}-\d{2}$/)){
    const [y,m]=currentPeriod.split('-').map(Number);
    return filtradas.filter(v=>{
      const d=toBRT(v.data_saida);
      return d.getUTCFullYear()===y && d.getUTCMonth()===m-1;
    });
  }
  return filtradas.filter(v=>{
    const d=toBRT(v.data_saida);
    if(currentPeriod==='hoje')return brtSameDay(d, nowBrt);
    if(currentPeriod==='semana'){
      const s=new Date(nowBrt.getTime());
      s.setUTCDate(nowBrt.getUTCDate()-nowBrt.getUTCDay());
      s.setUTCHours(0,0,0,0);
      return d>=s;
    }
    if(currentPeriod==='mes')return d.getUTCFullYear()===nowBrt.getUTCFullYear()&&d.getUTCMonth()===nowBrt.getUTCMonth();
    return true;
  });
}
// Helper para buscar pendentes no periodo
function getPendentes(){
  const nowBrt=brtNow();
  const pendentes=allVendas.filter(v=>v.status==='pending');
  if(currentPeriod==='custom'&&customDateStart){
    const s=new Date(customDateStart+'T03:00:00Z');
    const endStr = customDateEnd || customDateStart;
    const e=new Date(endStr+'T03:00:00Z');
    e.setUTCDate(e.getUTCDate()+1);
    e.setUTCSeconds(e.getUTCSeconds()-1);
    return pendentes.filter(v=>{const d=new Date(v.data_saida);return d>=s&&d<=e;});
  }
  if(currentPeriod&&currentPeriod.match(/^\d{4}-\d{2}$/)){
    const [y,m]=currentPeriod.split('-').map(Number);
    return pendentes.filter(v=>{
      const d=toBRT(v.data_saida);
      return d.getUTCFullYear()===y && d.getUTCMonth()===m-1;
    });
  }
  return pendentes.filter(v=>{
    const d=toBRT(v.data_saida);
    if(currentPeriod==='hoje')return brtSameDay(d, nowBrt);
    if(currentPeriod==='semana'){
      const s=new Date(nowBrt.getTime());
      s.setUTCDate(nowBrt.getUTCDate()-nowBrt.getUTCDay());
      s.setUTCHours(0,0,0,0);
      return d>=s;
    }
    if(currentPeriod==='mes')return d.getUTCFullYear()===nowBrt.getUTCFullYear()&&d.getUTCMonth()===nowBrt.getUTCMonth();
    return true;
  });
}
// Gerar opcoes de meses para o seletor (mes atual + 5 anteriores)
function gerarOpcoesMeses(){
  const now=new Date();
  const meses=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  let opts=`<option value="mes"${currentPeriod==='mes'?' selected':''}>Mês atual</option>`;
  for(let i=1;i<=5;i++){
    const d=new Date(now.getFullYear(),now.getMonth()-i,1);
    const val=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
    opts+=`<option value="${val}"${currentPeriod===val?' selected':''}>${meses[d.getMonth()]} ${d.getFullYear()}</option>`;
  }
  opts+=`<option value="semana"${currentPeriod==='semana'?' selected':''}>Esta semana</option>`;
  opts+=`<option value="hoje"${currentPeriod==='hoje'?' selected':''}>Hoje</option>`;
  opts+=`<option value="tudo"${currentPeriod==='tudo'?' selected':''}>Todo histórico</option>`;
  opts+=`<option value="custom"${currentPeriod==='custom'?' selected':''}>📅 Personalizado...</option>`;
  return opts;
}
function gerarDatePickers(){
  if(currentPeriod!=='custom') return '';
  return `<div style="display:flex;align-items:center;gap:6px;margin-left:4px">
    <input type="date" id="date-start" value="${customDateStart}" onchange="setCustomDate()"
      style="padding:5px 8px;background:rgba(91,139,245,.08);border:1px solid var(--border2);border-radius:8px;color:var(--text);font-size:12px;outline:none;cursor:pointer">
    <span style="color:var(--text4);font-size:11px">até</span>
    <input type="date" id="date-end" value="${customDateEnd}" onchange="setCustomDate()"
      style="padding:5px 8px;background:rgba(91,139,245,.08);border:1px solid var(--border2);border-radius:8px;color:var(--text);font-size:12px;outline:none;cursor:pointer">
  </div>`;
}

