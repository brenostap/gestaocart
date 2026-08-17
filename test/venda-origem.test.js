// ===========================================================================
// Teste da seção "De onde vieram as vendas" — roda com:
//   node test/venda-origem.test.js
//
// O que este teste protege, em ordem de quanto custa errar:
//
//  1. `provavel` NÃO entra na conta de dinheiro. O nível 5 da cascata aponta a
//     pessoa errada 1 vez em 5 (medido contra 43 vendas de verdade conhecida —
//     ver docs/ATRIBUICAO-LEADS-VENDAS.md). Somar junto infla o canal pago e
//     ninguém vê, porque o número continua parecendo um número.
//  2. A cobertura aparece na tela. Isto aqui é PISO, não total: a falta pesa
//     mais no Instagram, então comparar canais é legítimo e afirmar "o Meta Ads
//     deu X" não é. Uma tela que esconde o denominador mente com fato.
//  3. Venda não avaliada ≠ venda avaliada sem lead. São contadas separado, e é
//     essa diferença que permite medir cobertura sem chutar o denominador.
//  4. Sem nenhuma venda avaliada no período a seção some, em vez de desenhar
//     uma tabela de zeros.
//
// Sem browser e sem rede: carrega os js/ reais num contexto com stubs.
// ===========================================================================
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const ctx = {
  console,
  window: { supabase: { createClient: () => ({ auth: {} }) }, matchMedia: () => ({ matches: false }) },
  document: {
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => ({ style:{}, addEventListener(){}, remove(){} }),
    documentElement: { getAttribute: () => null, setAttribute(){} },
    body: { appendChild(){}, insertAdjacentHTML(){} },
  },
  localStorage: { getItem: () => null, setItem(){} },
  fetch: () => Promise.reject(new Error('sem rede no teste')),
  alert: m => { throw new Error('alert: ' + m); },
  Date, Math, JSON, Set, Map, Object, Array, String, Number, parseFloat, parseInt,
  isNaN, RegExp, Error, Promise, setTimeout,
};
ctx.globalThis = ctx;
vm.createContext(ctx);

for (const f of ['config.js','equipe.js','core.js','render.js','custos.js',
                 'ui.js','vendas-extra.js','dash-v2.js','fechamento.js'])
  vm.runInContext(fs.readFileSync(path.join(ROOT,'js',f),'utf8'), ctx, { filename:f });

vm.runInContext(`
  function escapeHtml(s){ return String(s==null?'':s); }
  function money(v){ return brl(v); }
  function podeVerValor(){ return true; }
  function podeVerMargem(){ return true; }
  function podeVerDinheiro(){ return true; }
  function papelAtual(){ return 'socio'; }
  function getPendentes(){ return []; }
`, ctx);

const R = expr => vm.runInContext(expr, ctx);

// -- vendas sinteticas ------------------------------------------------------
// Valores escolhidos pra que a soma errada seja visivel: se o `provavel` de
// 9.000 entrar em Meta Ads, o total vira 29.000 em vez de 20.000.
let seq = 40700000;
const venda = (valor, origemRow) => ({
  id: ++seq, status:'completed', data_saida:'2026-08-05T15:00:00Z',
  valor_total: valor, lucro: valor * 0.2,
  observacoes:'', vendedor_obs:'david', atendente_obs:null,
  cliente:{ nome:'Cliente '+seq },
  _produtos:[{ apple_id:'A'+seq, imei_1:'35'+seq, titulo:'iPhone',
               preco:valor, valor_estoque:valor*0.8 }],
  _origem: origemRow,
});
const conf = (origem, canal) => ({ canal, origem, nivel:0, metodo:'marcacao do fluxo', confianca:'confirmado' });

const vendas = [
  venda(12000, conf('Meta Ads','whatsapp')),
  venda( 8000, conf('Meta Ads','instagram')),
  venda(15000, conf('Orgânico','whatsapp')),
  venda( 5000, conf(null,'instagram')),                                   // lead sem origem gravada
  venda( 9000, { canal:'instagram', origem:'Meta Ads', nivel:5,
                 metodo:'nome fraco + vendedor', confianca:'provavel' }), // NAO pode somar
  venda( 7000, { canal:null, origem:null, nivel:null, metodo:null,
                 confianca:'sem_origem' }),                               // avaliada, sem lead
  venda( 4000, null),                                                     // nunca avaliada
];

ctx.__fx = { vendas };
R('allVendas = __fx.vendas; allMovs = []; ajustesAcessorios = []; _custosCache = [];');
R('currentPeriod = "2026-08"; currentStore = "ambas";');

// -- helpers ----------------------------------------------------------------
let falhas = 0;
const ok  = (cond, msg) => { console.log((cond ? '  ok    ' : '  FALHA ') + msg); if (!cond) falhas++; };
const sec = t => console.log('\n' + t);
const brl = R('brl');

const dash = R('renderDash()');

// -- 1. a secao existe e traz os canais -------------------------------------
sec('a seção aparece quando há venda avaliada no período');
ok(dash.includes('De onde vieram as vendas'), 'título na tela');
ok(dash.includes('Meta Ads'),  'lista Meta Ads');
ok(dash.includes('Orgânico'),  'lista Orgânico');
ok(dash.includes('Sem origem gravada no lead'), 'lead sem origem vira linha própria, não some');

// -- 2. o que NAO pode entrar na conta --------------------------------------
sec('provável fica fora do dinheiro');
ok(dash.includes(brl(20000)),  'Meta Ads soma 20.000 (só os confirmados)');
ok(!dash.includes(brl(29000)), 'Meta Ads NÃO soma o provável de 9.000');
ok(dash.includes('1 provável'), 'diz quantos ficaram de fora');
ok(/1 vez em 5/.test(dash),    'diz por que ficaram de fora');

// -- 3. cobertura na cara ---------------------------------------------------
sec('a cobertura aparece — isto é piso, não total');
ok(/5 de 7 vendas do período com origem identificada/.test(dash),
   'mostra identificadas sobre o total do período');
ok(dash.includes('71%'), 'mostra o percentual');
ok(/1 avaliada sem lead encontrado/.test(dash),  'avaliada sem lead conta separado');
ok(/1 ainda não avaliada/.test(dash),            'não avaliada conta separado');

// -- 4. sem dado, sem tabela de zeros ---------------------------------------
sec('sem venda avaliada a seção some');
R('allVendas = __fx.vendas.map(v => ({ ...v, _origem: null }));');
const semOrigem = R('renderDash()');
ok(!semOrigem.includes('De onde vieram as vendas'),
   'nenhuma venda avaliada → seção não aparece');
ok(semOrigem.length > 1000, 'e o resto do dashboard continua de pé');

// -- 5. a cortina de dinheiro vale aqui tambem ------------------------------
sec('papel sem margem não vê lucro do canal');
R('allVendas = __fx.vendas;');
R('function podeVerMargem(){ return false; }');
const semMargem = R('renderDash()');
ok(semMargem.includes('De onde vieram as vendas'), 'a seção continua aparecendo');
ok(!semMargem.includes('>Lucro</th>') && !semMargem.includes('>Margem</th>'),
   'colunas de lucro e margem somem');

console.log('\n' + (falhas ? `### ${falhas} FALHA(S)` : '### tudo verde'));
process.exit(falhas ? 1 : 0);
