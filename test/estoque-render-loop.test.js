// ===========================================================================
// Teste do laço de render do Estoque — node test/estoque-render-loop.test.js
//
// O que este teste protege: **a tela não pode se redesenhar em laço.**
//
// Em 18/ago/2026 o dono não conseguia abrir o Estoque no celular. Não era
// lentidão — era laço de microtask, que é pior: congela a página inteira.
//
//   renderEstoque() -> cache ainda vazio -> carregarBancada()
//                   -> a função tem guard contra FETCH duplicado, mas quando já
//                      está carregando devolve uma promise JÁ RESOLVIDA
//                   -> .then(renderContent) vira microtask
//                   -> render de novo -> cache ainda vazio -> ...
//
// E microtask tem prioridade sobre callback de rede: **o fetch de verdade nunca
// chegava a resolver.** Medido no repro: 1.502 renders por segundo. Em
// produção, como carregarFotos() não tinha guard de duplicata, cada volta
// disparava uma requisição real — 3.241 chamadas a `fotos_modelos` em 5
// minutos, contra 4 do resto das tabelas.
//
// A guarda certa não é sobre o fetch: é sobre AGENDAR O REDESENHO.
// ===========================================================================
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');

const ctx = {
  console: { log(){}, warn(){}, error(){} },
  window: { supabase: { createClient: () => ({ auth: {} }) }, matchMedia: () => ({matches:false}) },
  document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => ({ style:{}, addEventListener(){}, remove(){} }),
    documentElement: { getAttribute: () => null, setAttribute(){} },
    body: { appendChild(){}, insertAdjacentHTML(){} } },
  localStorage: { getItem: () => null, setItem(){} },
  Date, Math, JSON, Set, Map, Object, Array, String, Number, parseFloat, parseInt,
  isNaN, RegExp, Error, Promise, setTimeout,
};
ctx.globalThis = ctx; vm.createContext(ctx);
for (const f of ['config.js','equipe.js','core.js','data.js','render.js','custos.js',
                 'estoque.js','ui.js','bancada.js','correcoes.js','shell.js'])
  vm.runInContext(fs.readFileSync(path.join(ROOT,'js',f),'utf8'), ctx, {filename:f});

// sbGet que demora — é a demora que abria a janela pro laço.
vm.runInContext([
  'var RENDERS = 0, CHAMADAS = {};',
  'function sbGet(t){ CHAMADAS[t] = (CHAMADAS[t]||0)+1; return new Promise(r => setTimeout(() => r([]), 5)); }',
  'function carregarUltimaSync(){ return Promise.resolve(); }',
  'function renderContent(){ RENDERS++; if(RENDERS > 500) return; renderEstoque(); }',
  'meuPerfil = {papel:"socio", ativo:true}; usuarioEmail="breno@phonestp.com"; currentTab="estoque";',
  'estoqueItens = [{id:1, titulo:"iPhone 13 Pro 256GB Grafite Seminovo",',
  '  produto:{titulo:"iPhone 13 Pro 256GB Grafite Seminovo"}, valor_estoque:3000}];',
  'renderContent();',
].join('\n'), ctx);

let falhas = 0;
const ok  = m => console.log('  ok     ' + m);
const bad = m => { falhas++; console.log('  FALHOU ' + m); };

setTimeout(() => {
  console.log('laço de render do Estoque');
  const renders  = vm.runInContext('RENDERS', ctx);
  const chamadas = vm.runInContext('CHAMADAS', ctx);

  // O sintoma: 500 era o teto do contador — na prática era infinito.
  if (renders < 20) ok(`abrir o Estoque desenha ${renders}x (era 1.502 por segundo)`);
  else bad(`a tela desenhou ${renders} vezes — o laço voltou`);

  // As fotos eram o passageiro barulhento: uma requisição por volta do laço.
  const fotos = chamadas['fotos_modelos'] || 0;
  if (fotos <= 1) ok(`fotos_modelos pedida ${fotos}x (eram 3.241 em 5 minutos)`);
  else bad(`fotos_modelos pedida ${fotos} vezes`);

  for (const t of ['bancada','estoque_correcoes','v_tabela_precos']) {
    const n = chamadas[t] || 0;
    if (n <= 1) ok(`${t} pedida ${n}x`);
    else bad(`${t} pedida ${n} vezes`);
  }

  // E o fetch tem que ter CONSEGUIDO resolver — era isso que o laço impedia.
  const bancada = vm.runInContext('_bancadaCache', ctx);
  if (Array.isArray(bancada)) ok('o fetch resolveu (a microtask não starvou mais o timer)');
  else bad('o cache continua vazio — o fetch não chegou a resolver');

  console.log(falhas ? `\n### ${falhas} falha(s)` : '\n### tudo verde');
  process.exit(falhas ? 1 : 0);
}, 900);
