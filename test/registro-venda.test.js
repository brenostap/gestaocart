// ===========================================================================
// Teste da virada de registro (ago/2026) — roda com:
//   node test/registro-venda.test.js
//
// O que este teste protege: **a obs manda**. Os campos estruturados da FoneNinja
// (vendedor_nome, cadastrador_id, origem_cliente_id) só entram onde a obs não
// diz nada — venda sem obs sumia da comissão em silêncio, e desde 06/ago já
// existe venda assim.
//
// O caso que mais dói e por isso está aqui: até 05/ago o campo vendedor
// carregava o ATENDENTE. Sem o filtro por VO_KEYS, Vitinho viraria "vendedor" e
// receberia comissão de venda que não é dele.
//
// Contexto completo: docs/REGISTRO-VENDA-2026-08.md
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
for (const f of ['config.js','equipe.js','core.js','render.js','custos.js','ui.js',
                 'vendas-extra.js','dash-v2.js','conferencia.js'])
  vm.runInContext(fs.readFileSync(path.join(ROOT,'js',f),'utf8'), ctx, {filename:f});
vm.runInContext(`
  function escapeHtml(s){ return String(s==null?'':s); }
  function money(v){ return brl(v); }
  function podeVerValor(){ return true; }
  function podeVerMargem(){ return true; }
  function papelAtual(){ return 'socio'; }
  function getPendentes(){ return []; }
  ORIGEM_LOJA = {7155:'cart', 7938:'urban'};
  funcionariosFN = [{id:3165,nome:'Vitinho'},{id:6023,nome:'Leonardo Novais'},{id:3100,nome:'Anne'}];
`, ctx);
const R = e => vm.runInContext(e, ctx);

let falhas = 0;
function eq(titulo, obtido, esperado){
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if(!ok) falhas++;
  console.log((ok?'  ok   ':'  FALHOU') + '  ' + titulo + (ok ? '' :
    `\n         obtido:   ${JSON.stringify(obtido)}\n         esperado: ${JSON.stringify(esperado)}`));
}
const info = v => { ctx.__v = v; return R('getVendaInfo(__v)'); };

console.log('\ngetVendaInfo — obs manda, campo estruturado so tapa buraco\n');

eq('venda SEM obs usa campo+origem+login (regra nova)',
  info({ observacoes:null, vendedor_nome:'Mel', cadastrador_id:3165, origem_cliente_id:7155 }),
  { loja:'cart', vendedor:'mel', atendente:'vitinho' });

eq('venda antiga sem obs NAO transforma atendente do campo em vendedor',
  info({ observacoes:null, vendedor_nome:'Vitinho', cadastrador_id:3165, origem_cliente_id:7155 }),
  { loja:'cart', vendedor:null, atendente:'vitinho' });

eq('obs completa manda, mesmo com campo discordando',
  info({ observacoes:'loja urban\nVendedor David\nAtendente Leo',
         vendedor_obs:'david', atendente_obs:'leo',
         vendedor_nome:'Mel', cadastrador_id:3100, origem_cliente_id:7155 }),
  { loja:'urban', vendedor:'david', atendente:'leo' });

eq('obs so com a loja: vendedor e atendente vem dos campos',
  info({ observacoes:'loja urban', vendedor_nome:'Isabella', cadastrador_id:6023, origem_cliente_id:7155 }),
  { loja:'urban', vendedor:'isa', atendente:'leo' });

eq('sem nada nao inventa',
  info({ observacoes:null }), { loja:null, vendedor:null, atendente:null });

eq('origem desconhecida (ATACADO) nao vira loja',
  info({ observacoes:null, origem_cliente_id:8322 }), { loja:null, vendedor:null, atendente:null });

eq('cadastrador antigo (contas.raw) ainda vale',
  info({ observacoes:null, _cadastrador:{id:6023, nome:'Leonardo Novais'} }),
  { loja:null, vendedor:null, atendente:'leo' });

eq('socio no campo vendedor nao vira vendedor',
  info({ observacoes:null, vendedor_nome:'Breno Stapcinskas', cadastrador_id:3100 }),
  { loja:null, vendedor:null, atendente:'anne' });

// -- conferencia com os campos novos ---------------------------------------
const mk = (id, obs, vendNome, cadId, origem) => ({
  id, data_saida:'2026-08-06T15:00:00+00:00', valor_total:5000, observacoes:obs,
  vendedor_nome:vendNome, cadastrador_id:cadId, origem_cliente_id:origem,
  vendedor_obs:null, atendente_obs:null, _produtos:[], _pagamentos:[],
});
ctx.__vendas = [
  mk(1, 'cart\nVendedor Mel\nAtendente Vitinho', 'Mel', 3165, 7155),      // tudo certo
  mk(2, 'urban\nVendedor Isa\nAtendente Leo', 'Isabella', 6023, 7938),    // tudo certo
  mk(3, 'cart\nVendedor Mel\nAtendente Anne', 'Isabella', 3100, 7938),    // vendedor e loja errados
  mk(4, null, 'Mel', 3165, 7155),                                        // sem obs (nao entra na base)
];
R('allVendas = __vendas; currentStore="ambas"; currentPeriod="2026-08";');
const c = R('conferenciaFontes()');
console.log('\nconferencia\n');
eq('base = so vendas com obs', c.total, 3);
eq('cobertura do campo vendedor', [c.vendedor.base, c.vendedor.comCampo], [3, 3]);
eq('acerto do campo vendedor', [c.vendedor.acerto.bate, c.vendedor.acerto.base], [2, 3]);
eq('origem x loja da obs', [c.lojaOrigem.bate, c.lojaOrigem.base], [2, 3]);
eq('cadastrador x atendente da obs', [c.cad.bate, c.cad.base], [3, 3]);
R('UI.abrirModal = o => { globalThis.__modal = o; }');
R('abrirConferencia()');
eq('modal monta', R('typeof __modal.corpo === "string" && __modal.corpo.length > 500'), true);

// -- a tela de Vendas TEM que renderizar -----------------------------------
// Em 06/ago/2026 a Conferência renomeou `divergentes` -> `divVendedor`/`divAtendente`
// e o renderVendas continuou lendo `conf.divergentes.length`: TypeError na hora
// de montar a faixa de alertas, e a tela de Vendas inteira parou de abrir. Os
// testes de unidade passaram todos -- ninguém tinha chamado renderVendas().
console.log('\ntela de Vendas\n');
vm.runInContext(`
  function podeVerDinheiro(){ return true; }
  function podeVerCusto(){ return true; }
  function lojaLabel(l){ return l||''; }
  vendasSearch=''; vendasLoja='todas'; vendasVendedor='todos'; vendasAtendente='todos';
  vendasProduto=''; vendasSortCol=''; vendasConta='todas'; currentTab='vendas';
`, ctx);
let htmlVendas = '';
try { htmlVendas = R('renderVendas()'); }
catch(e){ htmlVendas = '__ERRO__ ' + e.message; }
eq('renderVendas() nao estoura', htmlVendas.startsWith('__ERRO__') ? htmlVendas : true, true);
eq('renderVendas() lista as vendas do periodo', /40596487|#1\b|Cliente/.test(htmlVendas) || htmlVendas.length > 1000, true);

console.log(falhas ? `\n### ${falhas} FALHA(S)\n` : '\n### tudo verde\n');
process.exit(falhas ? 1 : 0);
