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
//  5. **Venda da IA não é venda da loja.** Maju e Duda fecham venda sozinhas
//     (16 em jun/2026, 17 em jul, 9 em ago) e não recebem comissão — igual à
//     loja. Mas somar as duas no mesmo balde apaga quantas vendas o
//     atendimento automático fechou, que é justamente o número que cruza com
//     o lead depois. Decisão do dono, 31/ago/2026.
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

const dash = R('renderDashV2()');

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
const semOrigem = R('renderDashV2()');
ok(!semOrigem.includes('De onde vieram as vendas'),
   'nenhuma venda avaliada → seção não aparece');
ok(semOrigem.length > 1000, 'e o resto do dashboard continua de pé');

// -- 5. a cortina de dinheiro vale aqui tambem ------------------------------
sec('papel sem margem não vê lucro do canal');
R('allVendas = __fx.vendas;');
R('function podeVerMargem(){ return false; }');
const semMargem = R('renderDashV2()');
ok(semMargem.includes('De onde vieram as vendas'), 'a seção continua aparecendo');
// ⚠️ Escopado ao CARD da origem, não à tela: o dashboard tem outras tabelas
// com coluna "Lucro" (Vendas recentes mostra '—' pra quem não vê margem). Sem
// o escopo, este teste passaria a medir a tela errada.
const cardSemMargem = R('d2CardOrigem(_d2VendasDoPeriodo())');
ok(!/>Lucro</.test(cardSemMargem) && !/>Margem</.test(cardSemMargem),
   'no card da origem, as colunas de lucro e margem somem');

// ---------------------------------------------------------------------------
// 5. A IA tem balde próprio — não cai em "Loja (casa)"
// ---------------------------------------------------------------------------
console.log('\nvenda da IA aparece separada da venda da loja\n');

const vIA = (vendedor) => ({ ...venda(3000, null), vendedor_obs: vendedor });
ctx.__fx.ia = [
  vIA('maju'), vIA('maju'),
  vIA('duda'),
  vIA('malu'),      // typo real de 'maju' -- tem que cair na Maju, não na loja
  vIA('cart'),      // venda da casa de verdade
  vIA('breno'),     // sócio: casa também
  vIA('david'),     // vendedor de gente: nenhum dos dois baldes
];
R('allVendas = __fx.ia;');
const mIA = R('calc()');

ok(mIA.iaMap.maju.units === 3, `Maju: 3 un (2 + o typo "malu") — deu ${mIA.iaMap.maju.units}`);
ok(mIA.iaMap.duda.units === 1, `Duda: 1 un — deu ${mIA.iaMap.duda.units}`);
ok(mIA.iaUnits === 4,          `IA no total: 4 un — deu ${mIA.iaUnits}`);
ok(mIA.lojaUnits === 2,        `Loja (casa): 2 un, sem a IA junto — deu ${mIA.lojaUnits}`);

// A IA continua SEM comissão: é o que a separação não pode ter mexido.
ok(R("matchNome('maju', VO_KEYS)") === null && R("matchNome('duda', VO_KEYS)") === null,
   'a IA continua sem comissão de vendedor');
ok(R("matchNome('maju', atKeysVigentes())") === null,
   'a IA continua sem comissão de atendente');

// E aparece na tela, com a loja dela — é o que serve pro cruzamento.
const htmlIA = R('renderDashV2()');
ok(htmlIA.includes('Maju (IA · Cart)'),  'o dashboard mostra "Maju (IA · Cart)"');
ok(htmlIA.includes('Duda (IA · Urban)'), 'o dashboard mostra "Duda (IA · Urban)"');
ok(htmlIA.includes('Loja (casa)'),       'e a linha da loja continua existindo, separada');

// IA sem venda no período não vira linha zerada.
R('allVendas = __fx.ia.filter(v => v.vendedor_obs !== "duda");');
ok(!R('renderDashV2()').includes('Duda (IA'), 'IA sem venda no período não aparece');

console.log('\n' + (falhas ? `### ${falhas} FALHA(S)` : '### tudo verde'));
process.exit(falhas ? 1 : 0);
