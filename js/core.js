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
// leo (jun/2026), luana (saiu jun/2026), maria (hibrida: atende acess quando e a atendente)
const AT_KEYS = ['vitinho','davi','anne','denilson','pietra','leo','luana','maria'];

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

async function carregarTabelaPrecos(){
  if(_precosCache) return _precosCache;
  if(_precosCachePromise) return _precosCachePromise;
  _precosCachePromise = (async () => {
    try {
      const r = await fetch(SB_URL + '/rest/v1/tabela_precos?select=*&ativo=eq.true', {
        headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_TOKEN }
      });
      if(!r.ok) throw new Error('Falha ao carregar tabela_precos: ' + r.status);
      const data = await r.json();
      _precosCache = data;
      console.log('✅ Tabela de preços carregada: ' + data.length + ' linhas');
      return data;
    } catch(e) {
      console.warn('⚠️ Erro carregando tabela_precos:', e);
      _precosCache = [];
      return [];
    }
  })();
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

