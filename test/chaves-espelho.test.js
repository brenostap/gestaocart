// ===========================================================================
// Espelho das chaves de gente entre o JS e o Postgres — roda com:
//   node test/chaves-espelho.test.js
//
// O QUE ESTE TESTE PROTEGE: quem é vendedor e quem é atendente está escrito em
// DOIS lugares, e os dois pagam. `VO_KEYS`/`AT_KEYS`/`VO_ATENDE_KEYS` em
// js/core.js decidem a FOLHA; `eh_vo_key()`/`eh_at_key()` no Postgres decidem o
// que as colunas `vendas.vendedor_key`/`atendente_key` recebem — e delas saem as
// views do "Meu dia", que é onde o colaborador confere o próprio número.
//
// Divergir ali não quebra tela: a folha paga uma coisa e a tela da pessoa mostra
// outra. Foi exatamente o que aconteceu em 01/set/2026 pelo outro lado (o
// fallback faltando no trigger): a Mel recebeu por uma venda de R$4.850 que não
// aparecia na lista dela.
//
// ⚠️ ESTE TESTE COMPARA O ARQUIVO DE MIGRATION, NÃO O BANCO NO AR. Ele pega quem
// editou um lado e esqueceu o outro, que é o erro comum. Não pega migration
// escrita e não aplicada — pra isso, o Supabase.
// ===========================================================================
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');

let falhas = 0;
const ok  = m => console.log('  ok     ' + m);
const bad = m => { falhas++; console.log('  FALHOU ' + m); };

// -- lado JS ---------------------------------------------------------------
const ctx = {
  console,
  window: { supabase: { createClient: () => ({ auth: {} }) }, matchMedia: () => ({matches:false}) },
  document: { getElementById: () => null, querySelectorAll: () => [] },
  localStorage: { getItem: () => null, setItem(){} },
  Date, Math, JSON, Set, Map, Object, Array, String, Number, parseFloat, parseInt,
  isNaN, RegExp, Error, Promise, setTimeout,
};
ctx.globalThis = ctx; vm.createContext(ctx);
for (const f of ['config.js','core.js'])
  vm.runInContext(fs.readFileSync(path.join(ROOT,'js',f),'utf8'), ctx, {filename:f});

const VO        = vm.runInContext('VO_KEYS', ctx);
const AT        = vm.runInContext('AT_KEYS', ctx);
const VO_ATENDE = vm.runInContext('VO_ATENDE_KEYS', ctx);
const DESDE     = vm.runInContext('VO_ATENDE_DESDE', ctx);

// -- lado SQL: lê a migration e extrai os arrays ---------------------------
const MIG = path.join(ROOT, 'supabase/migrations/20260902_resolve_venda_keys_com_fallback.sql');
if (!fs.existsSync(MIG)) { console.log('\n### migration não encontrada: ' + MIG); process.exit(1); }
const sql = fs.readFileSync(MIG, 'utf8');

// Pega o array literal que vem depois do nome da função.
function arrayDe(fn){
  const i = sql.indexOf('function public.' + fn);
  if (i < 0) return null;
  const m = sql.slice(i).match(/array\[([\s\S]*?)\]/);
  if (!m) return null;
  return m[1].split(',').map(s => s.trim().replace(/^'|'$/g,'')).filter(Boolean);
}
const sqlVO = arrayDe('eh_vo_key');
const sqlAT = arrayDe('eh_at_key');

const mesmoConjunto = (a, b) => {
  const A = [...new Set(a)].sort(), B = [...new Set(b)].sort();
  return A.length === B.length && A.every((x,i) => x === B[i]);
};
const falta = (a, b) => a.filter(x => !b.includes(x));

console.log('\nvendedores online (VO_KEYS × eh_vo_key)\n');
if (!sqlVO) bad('não achei o array de eh_vo_key na migration');
else if (mesmoConjunto(VO, sqlVO)) ok(`as duas listas batem: ${VO.join(', ')}`);
else bad(`divergem — só no core.js: [${falta(VO,sqlVO)}] · só no SQL: [${falta(sqlVO,VO)}]`);

console.log('\natendentes (AT_KEYS + VO_ATENDE_KEYS × eh_at_key)\n');
// ⚠️ eh_at_key carrega os DOIS conjuntos de propósito: quem é atendente hoje e
// quem passou a ser em ago/2026. A VIGÊNCIA fica com at_key_vigente(), não aqui —
// se ela morasse nesta lista, um mês já pago mudaria de dono sozinho.
const esperado = [...new Set([...AT, ...VO_ATENDE])];
if (!sqlAT) bad('não achei o array de eh_at_key na migration');
else if (mesmoConjunto(esperado, sqlAT)) ok(`as duas listas batem (${esperado.length} chaves)`);
else bad(`divergem — só no core.js: [${falta(esperado,sqlAT)}] · só no SQL: [${falta(sqlAT,esperado)}]`);

console.log('\na vigência não vazou pra dentro da lista\n');
if (VO_ATENDE.every(k => sqlAT && sqlAT.includes(k)))
  ok(`${VO_ATENDE.join(', ')} estão em eh_at_key — quem filtra por mês é at_key_vigente()`);
else bad('VO_ATENDE_KEYS fora de eh_at_key: eles nunca seriam atendentes no banco');

// A data mora no at_key_vigente(), que é outra migration. Aqui só garantimos que
// alguém não a moveu pra cá por engano.
if (!/2026-08|VO_ATENDE_DESDE/.test(sql.slice(sql.indexOf('eh_at_key'), sql.indexOf('resolve_venda_keys'))))
  ok(`a data ${DESDE} não está chumbada em eh_at_key`);
else bad('a vigência foi parar em eh_at_key — ela é de at_key_vigente()');

console.log('\no fallback está na ordem certa\n');
const corpo = sql.slice(sql.indexOf('function public.resolve_venda_keys'));
const iObs = corpo.indexOf('vendedor_obs'), iNome = corpo.indexOf('vendedor_nome'),
      iCad = corpo.indexOf('cadastrador_id');
if (iObs > 0 && iNome > iObs) ok('a obs é lida ANTES do campo vendedor_nome');
else bad('o fallback do vendedor vem antes da obs — a obs tem que mandar');
if (iCad > iObs) ok('a obs é lida ANTES do cadastrador');
else bad('o cadastrador vem antes da obs — ele acerta ~90,7%, a obs manda');
if (/eh_vo_key/.test(corpo.slice(iNome, iCad > iNome ? iCad : undefined)))
  ok('o fallback do vendedor só aceita quem é VO de verdade');
else bad('o fallback do vendedor não filtra por VO — atendente viraria vendedor');
if (/at_key_vigente/.test(corpo.slice(iCad)))
  ok('o fallback do atendente respeita a vigência do mês da venda');
else bad('o fallback do atendente ignora a vigência — mês pago mudaria de dono');

console.log(falhas ? `\n### ${falhas} falha(s)` : '\n### tudo verde');
process.exit(falhas ? 1 : 0);
