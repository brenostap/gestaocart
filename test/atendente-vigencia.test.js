// ===========================================================================
// Teste do VO que atende direto — roda com:  node test/atendente-vigencia.test.js
//
// O que este teste protege: **quem recebe os 25% do lucro de acessório, e desde
// quando.** Em 31/08/2026 o dono decidiu que vendedor online que fecha a venda
// direto É o atendente dela — antes disso o nome dele não casava com AT_KEYS e
// o lucro de acessório dessas vendas não ia pra ninguém (7 vendas em ago/2026).
//
// ⚠️ A parte que dói é a VIGÊNCIA, não a regra. abr–jul/2026 já foram pagos:
// aplicar pra trás mudaria fechamento fechado (+R$130 em abr, +R$35 em jun,
// −R$7 em jul, medidos no banco em 31/08). É a mesma lição de
// BRINDE_ISENTO_DESDE e metaAtFaixas, e ela erra CALADA: nada quebra na tela,
// a folha só passa a discordar do extrato que a pessoa recebeu.
//
// Por isso o teste fixa os dois lados — a chave vale em agosto e NÃO vale em
// julho — em vez de só conferir que a lista tem o nome dentro.
// ===========================================================================
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');

const ctx = {
  console,
  window: { supabase: { createClient: () => ({ auth: {} }) }, matchMedia: () => ({matches:false}) },
  document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
  localStorage: { getItem: () => null, setItem(){} },
  fetch: () => Promise.reject(new Error('sem rede')),
  Date, Math, JSON, Set, Map, Object, Array, String, Number, parseFloat, parseInt,
  isNaN, RegExp, Error, Promise, setTimeout,
};
ctx.globalThis = ctx; vm.createContext(ctx);
for (const f of ['config.js','equipe.js','core.js'])
  vm.runInContext(fs.readFileSync(path.join(ROOT,'js',f),'utf8'), ctx, {filename:f});
const R = e => vm.runInContext(e, ctx);

let falhas = 0;
const ok  = m => console.log('  ok      ' + m);
const bad = m => { falhas++; console.log('  FALHOU  ' + m); };
const eq  = (titulo, obtido, esperado) =>
  JSON.stringify(obtido) === JSON.stringify(esperado) ? ok(titulo)
  : bad(`${titulo}\n         obtido:   ${JSON.stringify(obtido)}\n         esperado: ${JSON.stringify(esperado)}`);

console.log('\nVO que atende direto — vale de ago/2026 em diante, nunca antes\n');

// -- a chave liga e desliga por mês -----------------------------------------
for (const k of R('VO_ATENDE_KEYS')) {
  const antes  = R(`!!matchNome('${k}', atKeysVigentes('2026-07'))`);
  const depois = R(`!!matchNome('${k}', atKeysVigentes('2026-08'))`);
  if (!antes && depois) ok(`${k}: atendente em ago/2026, não em jul/2026`);
  else bad(`${k}: jul=${antes} ago=${depois} — esperado jul=false ago=true`);
}

// Mês que não é mês (semana/tudo/custom) usa a regra de HOJE, igual brindeIsento.
eq('período sem mês definido usa a lista de hoje',
  R("atKeysVigentes(null).length"), R("AT_KEYS.length + VO_ATENDE_KEYS.length"));

// -- ninguém a mais, ninguém a menos ----------------------------------------
eq('julho continua exatamente com os atendentes de julho',
  R("atKeysVigentes('2026-07')"), R('AT_KEYS'));

// A Maria já era híbrida desde jun/2026 pelo FUNC (atKey + voKey) — ela NÃO
// pode depender da vigência nova, senão junho e julho mudam de valor.
eq('Maria continua atendente em jul/2026 (regra antiga, não a nova)',
  R("matchNome('maria', atKeysVigentes('2026-07'))"), 'maria');

// -- o cadastro tem que acompanhar, senão a folha não paga -------------------
// fechamentoPessoas() exige f.atKey; sem isso a chave existe e o dinheiro não sai.
for (const k of R('VO_ATENDE_KEYS')) {
  const temAtKey = R(`FUNC.some(f => f.atKey === '${k}')`);
  if (temAtKey) ok(`${k} tem atKey no FUNC (a folha alcança)`);
  else bad(`${k} está em VO_ATENDE_KEYS mas não tem atKey no FUNC — a folha nunca paga`);
}

// -- o ranking de atendentes segue o mesmo calendário ------------------------
const labelsAgo = R("atLabelsAll('2026-08').map(x=>x[1])");
const labelsJul = R("atLabelsAll('2026-07').map(x=>x[1])");
for (const k of R('VO_ATENDE_KEYS')) {
  if (labelsAgo.includes(k) && !labelsJul.includes(k)) ok(`${k} aparece no ranking de ago, não no de jul`);
  else bad(`${k} no ranking: ago=${labelsAgo.includes(k)} jul=${labelsJul.includes(k)}`);
}

// -- a venda carrega o próprio mês ------------------------------------------
// getVendaInfo() roda no dashboard com meses diferentes ao mesmo tempo; o
// fallback do login (cadastradorAT) tem que olhar a DATA DA VENDA, não o
// período da tela — senão a Isa vira atendente de uma venda de julho.
vm.runInContext(`funcionariosFN = [{id:6440,nome:'Isa'},{id:3100,nome:'Anne'}];`, ctx);
const vendaJul = { observacoes:null, cadastrador_id:6440, data_saida:'2026-07-15T18:00:00+00:00' };
const vendaAgo = { observacoes:null, cadastrador_id:6440, data_saida:'2026-08-15T18:00:00+00:00' };
ctx.__j = vendaJul; ctx.__a = vendaAgo;
eq('venda de julho não ganha atendente novo pelo login',
  R('getVendaInfo(__j).atendente'), null);
eq('venda de agosto ganha',
  R('getVendaInfo(__a).atendente'), 'isa');

console.log(falhas ? `\n### ${falhas} falha(s)` : '\n### tudo verde');
process.exit(falhas ? 1 : 0);
