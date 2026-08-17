// ===========================================================================
// Teste do espelho da regra de item — roda com:  node test/regra-acessorio.test.js
//
// O que este teste protege: **a classificação de item existe em DOIS lugares.**
//   JS  — isPrincipal() / isAcess() / isCancelado()  em js/equipe.js
//   SQL — eh_principal() / eh_acessorio() / eh_cancelado()  no Postgres
//         (supabase/migrations/20260817_base_da_comissao_agregada.sql)
//
// Precisa dos dois porque o sócio calcula no navegador, com os itens na mão, e
// o colaborador NÃO PODE receber os itens — `valor_estoque` é custo. Ele recebe
// só o agregado do mês, e quem agrega é o banco.
//
// Divergir aqui não quebra tela nenhuma: paga comissão errada, calada. Por isso
// o contrato abaixo é literal — são as 9 combinações que de fato existem nos
// 14.897 itens de `venda_produtos` (levantadas em 17/ago/2026), com o veredito
// que o SQL deu para cada uma. Se você mudar a regra no JS, mude a migration
// junto e atualize esta tabela.
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
const js = vm.runInContext('({isPrincipal, isAcess, isCancelado})', ctx);

// As 9 combinações reais, com o veredito do SQL. `itens` é quantos itens do
// banco caem em cada uma — serve pra provar que a cobertura é 100%.
const CONTRATO = [
  { apple:false, imei:false, custo:195.00, itens:9363, principal:false, acessorio:true,  cancelado:false },
  { apple:true,  imei:true,  custo:250.00, itens:4691, principal:true,  acessorio:false, cancelado:false },
  { apple:true,  imei:true,  custo:0.00,   itens:393,  principal:false, acessorio:false, cancelado:true  },
  { apple:false, imei:false, custo:0.00,   itens:266,  principal:false, acessorio:true,  cancelado:false },
  { apple:false, imei:false, custo:260.00, itens:82,   principal:true,  acessorio:false, cancelado:false },
  { apple:true,  imei:false, custo:500.00, itens:78,   principal:true,  acessorio:false, cancelado:false },
  { apple:true,  imei:true,  custo:180.00, itens:10,   principal:true,  acessorio:false, cancelado:false },
  { apple:true,  imei:true,  custo:240.00, itens:10,   principal:true,  acessorio:false, cancelado:false },
  { apple:true,  imei:false, custo:0.00,   itens:4,    principal:true,  acessorio:false, cancelado:false },
];
const TOTAL_ITENS = 14897;

let falhas = 0, cobertos = 0;
const ok  = m => console.log('  ok    ' + m);
const bad = m => { falhas++; console.log('  FALHOU ' + m); };

console.log('espelho da regra de item — SQL x JS');
for (const c of CONTRATO) {
  const item = { apple_id: c.apple ? 123456 : null,
                 imei_1:  c.imei  ? '350000000000000' : null,
                 valor_estoque: c.custo };
  const r = { principal: js.isPrincipal(item), acessorio: js.isAcess(item), cancelado: js.isCancelado(item) };
  const rotulo = `apple=${c.apple?'sim':'nao'} imei=${c.imei?'sim':'nao'} custo=${c.custo}`;
  const igual = r.principal === c.principal && r.acessorio === c.acessorio && r.cancelado === c.cancelado;
  if (igual) { ok(rotulo); cobertos += c.itens; }
  else bad(`${rotulo} — JS ${JSON.stringify(r)} != SQL ${JSON.stringify({principal:c.principal,acessorio:c.acessorio,cancelado:c.cancelado})}`);
}

// A prova só vale se as 9 combinações forem TODAS as que existem.
if (cobertos === TOTAL_ITENS) ok(`cobertura: ${cobertos} de ${TOTAL_ITENS} itens`);
else bad(`cobertura: ${cobertos} de ${TOTAL_ITENS} itens — o contrato ficou velho, relevante as combinacoes no banco`);

// Uma venda cancelada NUNCA pode contar como aparelho vendido: era 393 itens.
const cancelado = { apple_id: 999, imei_1: '350000000000000', valor_estoque: 0 };
if (!js.isPrincipal(cancelado)) ok('item cancelado nao conta como aparelho');
else bad('item cancelado contou como aparelho');

console.log(falhas ? `\n### ${falhas} falha(s)` : '\n### tudo verde');
process.exit(falhas ? 1 : 0);
