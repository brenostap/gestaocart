// ===========================================================================
// Teste da margem real — roda com:  node test/margem-real.test.js
//
// O que este teste protege: **o número que decide compra.**
//
// O `CONTEXT.md` é direto: a margem que o painel mostrava é só
// `preço − custo`, e faltam carrego, taxa de cartão e reparo — R$250 a 600 por
// aparelho, pesando MAIS no modelo lento. Decidir compra pela bruta **inverte a
// decisão**. Se este cálculo errar, ele erra silenciosamente e para o lado
// errado: mostra margem boa em aparelho que está sangrando na prateleira.
//
// Três armadilhas que este teste fixa:
//
// 1. **A taxa de cartão é `taxa − taxa_extra`**, não `taxa`. A taxa_extra é
//    juro repassado ao cliente, ou seja GANHO da loja. Usar a taxa cheia
//    inflaria o custo em quase metade (jul/2026: 5,03% viram 3,70%).
// 2. **Parcela ausente não é zero.** Sem dias parados não há carrego — e o
//    número tem que se anunciar como teto, não como resultado.
// 3. **O carrego cresce com o tempo**, que é o ponto: é ele que separa o
//    aparelho que gira do que dorme.
// ===========================================================================
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');

const ctx = {
  console,
  window: { supabase: { createClient: () => ({ auth: {} }) }, matchMedia: () => ({matches:false}) },
  document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => ({ style:{}, addEventListener(){}, remove(){} }),
    documentElement: { getAttribute: () => null, setAttribute(){} },
    body: { appendChild(){}, insertAdjacentHTML(){} } },
  localStorage: { getItem: () => null, setItem(){} },
  fetch: () => Promise.reject(new Error('sem rede')),
  Date, Math, JSON, Set, Map, Object, Array, String, Number, parseFloat, parseInt,
  isNaN, RegExp, Error, Promise, setTimeout,
};
ctx.globalThis = ctx; vm.createContext(ctx);
for (const f of ['config.js','equipe.js','core.js','render.js','custos.js','estoque.js',
                 'ui.js','bancada.js','correcoes.js','shell.js'])
  vm.runInContext(fs.readFileSync(path.join(ROOT,'js',f),'utf8'), ctx, {filename:f});

let falhas = 0;
const ok  = m => console.log('  ok     ' + m);
const bad = m => { falhas++; console.log('  FALHOU ' + m); };
const run = js => vm.runInContext(js, ctx);
const perto = (a,b,tol=0.51) => Math.abs(a-b) <= tol;

run(`meuPerfil = { papel:'socio', ativo:true }; usuarioEmail='breno@phonestp.com';`);

// -- 1. a taxa de cartão desconta o juro repassado --------------------------
console.log('taxa de cartão medida');

// R$100.000 vendidos · R$5.000 de taxa · R$1.500 de juro repassado ao cliente
// => custo real 3.500 => 3,5%. Usar a taxa cheia daria 5%.
run(`
  limparTaxaCartaoCache();
  allVendas = [{ data_saida: new Date().toISOString(), _pagamentos: [
    { valor:100000, taxa:5000, taxa_extra:1500, status:'paid' }
  ]}];
`);
const taxa = run(`taxaCartaoEfetiva()`);
if (perto(taxa, 0.035, 0.0001)) ok('taxa = (taxa − taxa_extra) / valor = 3,5%');
else bad('taxa errada: ' + taxa + ' (esperava 0.035; 0.05 = esqueceu o taxa_extra)');

// Pagamento cancelado não entra na conta.
run(`
  limparTaxaCartaoCache();
  allVendas = [{ data_saida: new Date().toISOString(), _pagamentos: [
    { valor:100000, taxa:5000, taxa_extra:1500, status:'paid' },
    { valor:900000, taxa:90000, taxa_extra:0,   status:'canceled' }
  ]}];
`);
if (perto(run(`taxaCartaoEfetiva()`), 0.035, 0.0001)) ok('pagamento cancelado fica de fora');
else bad('cancelado entrou na taxa');

// Sem venda carregada não há taxa — e null não pode virar zero.
run(`limparTaxaCartaoCache(); allVendas = [];`);
if (run(`taxaCartaoEfetiva()`) === null) ok('sem venda carregada, a taxa é null (não zero)');
else bad('inventou taxa sem dado');

// -- 2. a conta completa ----------------------------------------------------
console.log('a conta');

run(`
  limparTaxaCartaoCache();
  allVendas = [{ data_saida: new Date().toISOString(), _pagamentos: [
    { valor:100000, taxa:5000, taxa_extra:1500, status:'paid' }   // 3,5%
  ]}];
  _precosCache = [{ modelo_norm:'iphone 13 pro', capacidade:'256GB', condicao:'Seminovo',
                    cor:null, cor_norm:null, preco_varejo:4000, preco_upgrade:3000 }];
  setMargemExtra([{ apple_id: 77, dias_parado: 90, reparo: 200, entrou_em:'2026-05-19' }]);
`);
const item = { id:77, titulo:'iPhone 13 Pro 256GB Grafite Seminovo',
               produto:{titulo:'iPhone 13 Pro 256GB Grafite Seminovo'}, valor_estoque:3000 };
const d = run(`dadosDoItem(${JSON.stringify(item)})`);

// bruta   = 4000 − 3000            = 1000
// carrego = 3000 × 90 × (0,03/30)  =  270
// taxa    = 4000 × 3,5%            =  140
// reparo                            =  200
// real    = 1000 − 270 − 140 − 200 =  390
if (d.margem === 1000) ok('margem bruta = preço − custo = R$1.000');
else bad('bruta errada: ' + d.margem);
if (perto(d.carrego, 270)) ok('carrego = custo × 90 dias × 0,1%/dia = R$270');
else bad('carrego errado: ' + d.carrego);
if (perto(d.taxaCartao, 140)) ok('taxa de cartão = preço × 3,5% = R$140');
else bad('taxa errada: ' + d.taxaCartao);
if (d.reparo === 200) ok('reparo entra do banco (R$200)');
else bad('reparo errado: ' + d.reparo);
if (perto(d.margemReal, 390)) ok('margem real = R$390 — 61% menor que a bruta');
else bad('margem real errada: ' + d.margemReal + ' (esperava 390)');
if (!d.margemFaltando.length) ok('com tudo em mãos, nada é marcado como faltando');
else bad('marcou parcela faltando sem motivo: ' + d.margemFaltando);

// -- 3. o carrego é o que separa o que gira do que dorme --------------------
console.log('o tempo cobra');

run(`setMargemExtra([{ apple_id: 77, dias_parado: 5, reparo: 0 }]);`);
const rapido = run(`dadosDoItem(${JSON.stringify(item)})`);
run(`setMargemExtra([{ apple_id: 77, dias_parado: 300, reparo: 0 }]);`);
const parado = run(`dadosDoItem(${JSON.stringify(item)})`);
if (rapido.margemReal > parado.margemReal + 800)
  ok(`mesmo aparelho: 5 dias = ${Math.round(rapido.margemReal)} · 300 dias = ${Math.round(parado.margemReal)}`);
else bad('o tempo não está cobrando: ' + rapido.margemReal + ' vs ' + parado.margemReal);
if (parado.margemReal < 0) ok('300 dias de prateleira levam a margem pra NEGATIVO');
else bad('300 dias deveriam zerar a margem deste aparelho');

// -- 4. parcela ausente não vira zero --------------------------------------
console.log('ausente ≠ zero');

run(`setMargemExtra([]);`);   // sem dias, sem reparo
const semDados = run(`dadosDoItem(${JSON.stringify(item)})`);
if (semDados.carrego === null && semDados.reparo === null)
  ok('sem dado do banco, carrego e reparo são null');
else bad('inventou carrego/reparo: ' + JSON.stringify([semDados.carrego, semDados.reparo]));
if (semDados.margemFaltando.includes('carrego') && semDados.margemFaltando.includes('reparo'))
  ok('e o item se marca como incompleto');
else bad('não marcou o que falta: ' + semDados.margemFaltando);
if (perto(semDados.margemReal, 860))
  ok('a margem real vira teto (1000 − 140 de taxa), não some da tela');
else bad('margem real com dado faltando: ' + semDados.margemReal);

const html = run(`margemRealHtml(${JSON.stringify(semDados)})`);
if (/o número é teto/.test(html)) ok('a tela avisa que é teto, e não resultado fechado');
else bad('a tela não avisou que o número está incompleto');

// Sem preço de tabela não existe margem nenhuma — nem bruta, nem real.
run(`_precosCache = [];`);
const semPreco = run(`dadosDoItem(${JSON.stringify(item)})`);
if (semPreco.margemReal === null && semPreco.margem === null)
  ok('sem preço de tabela, não há margem — nem real nem bruta');
else bad('inventou margem sem preço');

console.log(falhas ? `\n### ${falhas} falha(s)` : '\n### tudo verde');
process.exit(falhas ? 1 : 0);
