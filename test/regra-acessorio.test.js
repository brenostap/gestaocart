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
const js = vm.runInContext('({isPrincipal, isAcess, isCancelado, ehBrinde, lucroAcessComissao})', ctx);

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

// ===========================================================================
// SEGUNDO ESPELHO: o BRINDE (20/ago/2026)
//
// Acessório entregue com preço 0 e custo > 0 vinha DESCONTANDO da comissão de
// quem entregou — a comissão é 25% do lucro, e o brinde só tem custo. O dono
// decidiu que não desconta: quem dá o brinde é quem fecha a venda. O custo
// continua da loja; sai só da conta de quem recebe.
//
//   JS  — ehBrinde() / lucroAcessComissao()      em js/core.js
//   SQL — eh_brinde() / lucro_acess_comissao()   no Postgres
//         (supabase/migrations/20260820_brinde_nao_desconta_comissao.sql)
//
// A coluna `sql` abaixo foi MEDIDA no banco em 20/ago/2026, não deduzida.
// ===========================================================================
console.log('\nespelho do brinde — SQL x JS');

const BRINDES = [
  { preco: 0,    custo: 11.63, brinde: true,  lucro: 0,      nota: 'o FONE AIRDOTS real de 18/ago' },
  { preco: null, custo: 11.63, brinde: true,  lucro: 0,      nota: 'preço nulo conta como brinde' },
  { preco: 0,    custo: 0,     brinde: false, lucro: 0,      nota: 'preço 0 e custo 0 não é brinde' },
  { preco: 0,    custo: null,  brinde: false, lucro: 0,      nota: 'sem custo não é brinde' },
  { preco: 60,   custo: 4.89,  brinde: false, lucro: 55.11,  nota: 'capa vendida' },
  { preco: 20,   custo: 2.98,  brinde: false, lucro: 17.02,  nota: 'película vendida' },
  // Vendido ABAIXO do custo continua descontando: foi uma venda, não um brinde.
  { preco: 10,   custo: 25.00, brinde: false, lucro: -15.00, nota: 'vendido no prejuízo ainda desconta' },
];

for (const c of BRINDES) {
  const item = { preco: c.preco, valor_estoque: c.custo };
  const b = js.ehBrinde(item);
  const l = js.lucroAcessComissao(item, '2026-08');
  const rotulo = `preço=${c.preco} custo=${c.custo} — ${c.nota}`;
  if (b === c.brinde && Math.abs(l - c.lucro) < 0.005) ok(rotulo);
  else bad(`${rotulo} — JS {brinde:${b}, lucro:${l}} != SQL {brinde:${c.brinde}, lucro:${c.lucro}}`);
}

// ⚠️ A ISENÇÃO TEM DATA — vale de ago/2026 em diante. Sem isso, o fechamento
// de um mês já pago subiria sozinho: +R$336 em jul/2026 e +R$537 em jun/2026,
// medidos em 20/ago. É a mesma trava das faixas de meta (metaAtFaixas).
// Verdicts medidos no SQL: lucro_acess_comissao(0, 11.63, mes).
const VIGENCIA = [
  { mes:'2026-06', lucro:-11.63 },
  { mes:'2026-07', lucro:-11.63 },
  { mes:'2026-08', lucro:0 },
  { mes:'2026-09', lucro:0 },
];
for (const v of VIGENCIA) {
  const l = js.lucroAcessComissao({ preco:0, valor_estoque:11.63 }, v.mes);
  if (Math.abs(l - v.lucro) < 0.005) ok(`brinde em ${v.mes} vale ${v.lucro} (igual ao SQL)`);
  else bad(`vigência divergiu em ${v.mes}: JS ${l} != SQL ${v.lucro}`);
}

// A classificação NÃO muda: brinde continua sendo acessório (segue contando no
// attach rate e em acess_qtd). Só o dinheiro muda.
const brinde = { apple_id:null, imei_1:null, valor_estoque:11.63, preco:0 };
if (js.isAcess(brinde)) ok('brinde continua classificado como acessório');
else bad('brinde deixou de ser acessório — isso mexeria no attach rate, que ninguém pediu');

// ---------------------------------------------------------------------------
// QUAL VENDA ENTRA NA CONTA — o terceiro espelho, achado em 31/ago/2026
//
// `filterByPeriod()` (js/render.js) nunca conta venda `canceled` e, por padrão,
// também não conta `pending`. As views do banco não filtravam status NENHUM, e
// por isso a MESMA meta coletiva aparecia com dois números: 359 aparelhos no
// dashboard do sócio e 373 no "Meu dia" do colaborador (14 vendas pendentes).
//
// Espelho no Postgres: `venda_conta(status)`
// (supabase/migrations/20260831b_views_da_comissao_filtram_status.sql).
// ---------------------------------------------------------------------------
console.log('\nqual venda entra na conta (espelho de venda_conta no SQL)\n');

// Carrega render.js só agora: é dele que vem filterByPeriod.
vm.runInContext(fs.readFileSync(path.join(ROOT,'js','render.js'),'utf8'), ctx, {filename:'render.js'});
vm.runInContext(`currentPeriod='2026-08'; currentStore='ambas';`, ctx);

const v = (id, status) => ({ id, status, data_saida:'2026-08-12T15:00:00Z', _produtos:[] });
ctx.__vs = [v(1,'completed'), v(2,'pending'), v(3,'canceled')];

// O SQL diz: not in ('canceled','pending'). O JS tem que dizer o mesmo.
const CONTRATO_STATUS = [
  { status:'completed', conta:true  },
  { status:'pending',   conta:false },
  { status:'canceled',  conta:false },
];
const passou = vm.runInContext('filterByPeriod(__vs).map(x=>x.status)', ctx);
for (const c of CONTRATO_STATUS) {
  const temJs = passou.includes(c.status);
  if (temJs === c.conta) ok(`${c.status}: JS ${c.conta ? 'conta' : 'não conta'} (igual ao SQL)`);
  else bad(`${c.status}: JS diz ${temJs}, SQL diz ${c.conta} — a folha e a tela da pessoa vão divergir`);
}

// `incluirPending` é o único jeito de a pendente entrar, e ela existe de
// propósito: a tela de vendas incompletas cobra a obs antes de a venda fechar.
const comPend = vm.runInContext('filterByPeriod(__vs, true).map(x=>x.status)', ctx);
if (comPend.includes('pending') && !comPend.includes('canceled'))
  ok('incluirPending traz a pendente e continua sem a cancelada');
else bad('incluirPending: ' + JSON.stringify(comPend));

console.log(falhas ? `\n### ${falhas} falha(s)` : '\n### tudo verde');
process.exit(falhas ? 1 : 0);
