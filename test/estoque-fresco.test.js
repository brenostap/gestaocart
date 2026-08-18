// ===========================================================================
// Teste do estoque "fresco" da FoneNinja — node test/estoque-fresco.test.js
//
// O que este teste protege: **a lista de estoque não pode encolher nem perder
// campo por causa de uma resposta do ERP.**
//
// Até 18/ago/2026 a carga fazia `if(ae.length>0) estoqueItens = ae;` — trocava
// a lista INTEIRA pelo payload da FoneNinja. Dois estragos possíveis, os dois
// silenciosos:
//   1. campo que o payload não traz (valor_estoque, ultimo_fornecedor) sumia —
//      e com a regra "ausente ≠ zero" da margem real, o custo virava null e a
//      margem desaparecia da tela do sócio;
//   2. se o ERP devolvesse menos itens, o estoque encolhia sem aviso.
//
// E ela era um `await` no meio do boot: 300–900ms de Edge Function mais a
// latência da FoneNinja atrás, com dois 504 registrados. Agora roda depois do
// primeiro desenho.
// ===========================================================================
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');

let respostaDoErp = null, deuErro = null;
const ctx = {
  console: { log(){}, warn(){}, error(){} },
  window: { supabase: { createClient: () => ({ auth: {} }) }, matchMedia: () => ({matches:false}) },
  document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
  localStorage: { getItem: () => null, setItem(){} },
  fetch: () => deuErro ? Promise.reject(new Error(deuErro))
                       : Promise.resolve({ ok:true, json: () => Promise.resolve(respostaDoErp) }),
  Date, Math, JSON, Set, Map, Object, Array, String, Number, parseFloat, parseInt,
  isNaN, RegExp, Error, Promise, setTimeout,
};
ctx.globalThis = ctx; vm.createContext(ctx);
for (const f of ['config.js','equipe.js','core.js','data.js'])
  vm.runInContext(fs.readFileSync(path.join(ROOT,'js',f),'utf8'), ctx, {filename:f});
vm.runInContext(`function renderContent(){} function setProgress(){} function updateStatusBar(){}
                 function iniciarPolling(){} currentTab='estoque';`, ctx);

let falhas = 0;
const ok  = m => console.log('  ok     ' + m);
const bad = m => { falhas++; console.log('  FALHOU ' + m); };
const run = js => vm.runInContext(js, ctx);

// Estoque do Supabase: tem custo e fornecedor. O payload do ERP não tem.
const DO_BANCO = [
  { id:1, titulo:'iPhone 13 Pro 256GB', valor_estoque:3000, ultimo_fornecedor:'STP', bateria:88 },
  { id:2, titulo:'iPhone 15 128GB',     valor_estoque:4000, ultimo_fornecedor:'ACME', bateria:95 },
  { id:3, titulo:'iPhone 12 64GB',      valor_estoque:1500, ultimo_fornecedor:'STP', bateria:79 },
];

async function comResposta(payload, erro){
  respostaDoErp = payload; deuErro = erro || null;
  run(`estoqueItens = ${JSON.stringify(DO_BANCO)};`);
  await run(`atualizarEstoqueFresco({})`);
  return run(`estoqueItens`);
}

(async () => {
  console.log('estoque fresco da FoneNinja');

  // 1. O ERP devolve MENOS itens (2 de 3) e sem os campos de custo.
  let r = await comResposta({ data: [
    { id:1, titulo:'iPhone 13 Pro 256GB', bateria:90 },
    { id:2, titulo:'iPhone 15 128GB',     bateria:95 },
  ]});
  if (r.length === 3) ok('ERP com menos itens NÃO encolhe o estoque (3 continuam 3)');
  else bad('o estoque encolheu para ' + r.length);

  const item1 = r.find(i => i.id === 1);
  if (item1.valor_estoque === 3000) ok('custo do Supabase sobrevive ao payload sem custo');
  else bad('o custo sumiu: ' + item1.valor_estoque);
  if (item1.ultimo_fornecedor === 'STP') ok('fornecedor também sobrevive');
  else bad('o fornecedor sumiu');
  if (item1.bateria === 90) ok('e o campo que o ERP traz é atualizado (bateria 88 → 90)');
  else bad('não atualizou a bateria: ' + item1.bateria);

  // 2. Aparelho novo no ERP entra na lista.
  r = await comResposta({ data: [{ id:9, titulo:'iPhone 16 512GB', bateria:100 }] });
  if (r.length === 4 && r.some(i => i.id === 9)) ok('aparelho novo do ERP entra na lista');
  else bad('não somou o aparelho novo');

  // 3. null/undefined do ERP não apagam o que já existe.
  r = await comResposta({ data: [{ id:1, titulo:'iPhone 13 Pro 256GB', valor_estoque:null, bateria:undefined }] });
  const i1 = r.find(i => i.id === 1);
  if (i1.valor_estoque === 3000 && i1.bateria === 88) ok('null e undefined do ERP não apagam campo');
  else bad('campo apagado por null/undefined: ' + JSON.stringify([i1.valor_estoque, i1.bateria]));

  // 4. ERP fora do ar não pode derrubar o estoque.
  r = await comResposta(null, 'timeout');
  if (r.length === 3 && r[0].valor_estoque === 3000)
    ok('ERP fora do ar (504/timeout) mantém o estoque do Supabase intacto');
  else bad('a falha do ERP estragou o estoque');

  // 5. Resposta vazia também não zera nada.
  r = await comResposta({ data: [] });
  if (r.length === 3) ok('resposta vazia do ERP não zera o estoque');
  else bad('resposta vazia zerou o estoque');

  console.log(falhas ? `\n### ${falhas} falha(s)` : '\n### tudo verde');
  process.exit(falhas ? 1 : 0);
})();
