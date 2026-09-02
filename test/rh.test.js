// ===========================================================================
// Papel `rh` — roda com:  node test/rh.test.js
//
// O QUE ESTE TESTE PROTEGE: **o RH não vê número da loja.** A Nara é de uma
// empresa terceirizada; o pedido do dono foi *"não quero que ela veja números
// da loja como lucro e tudo mais. Somente as partes dos funcionários"*.
//
// ⚠️ ISTO AQUI É A CORTINA. A fechadura é o RLS (`eh_rh()`), na migration
// 20260902_papel_rh.sql: ela só alcança `folha_mensal`, `funcionarios_config` e
// `custos` COM `area='funcionario'`. Teste de front não prova segurança — mas
// pega o dia em que alguém puser `rh` na lista errada aqui.
//
// ⚠️ O erro que este teste existe pra impedir é específico e tentador: dar a
// aba **Equipe** pra ela, "porque já mostra a folha". Aquela tela CALCULA a
// folha no navegador e por isso precisa de todas as vendas e do `valor_estoque`
// — o custo do aparelho. A tela esconderia; a API não.
// ===========================================================================
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');

let falhas = 0;
const ok  = m => console.log('  ok     ' + m);
const bad = m => { falhas++; console.log('  FALHOU ' + m); };
const eq  = (m, a, b) => JSON.stringify(a) === JSON.stringify(b)
  ? ok(m) : bad(`${m} — esperava ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`);

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
                 'ui.js','bancada.js','rh.js','shell.js'])
  vm.runInContext(fs.readFileSync(path.join(ROOT,'js',f),'utf8'), ctx, {filename:f});
vm.runInContext(`function escapeHtml(s){ return String(s==null?'':s); }`, ctx);

const R = e => vm.runInContext(e, ctx);
const comoRh = expr => { R(`meuPerfil = { papel:'rh', nome:'Nara', ativo:true };`); return R(expr); };

// -- 1. o menu -------------------------------------------------------------
console.log('\no que o papel rh alcança\n');

eq('alcança só a Folha', comoRh('telasDoUsuario()'), ['rhfolha']);

// ⚠️ `equipe` é a tentação: ela mostra a folha, mas calculando — e por isso
// arrasta venda e custo de aparelho junto.
eq('NÃO alcança equipe, dash, vendas, custos, estoque, compras, contas',
   ['equipe','dash','vendas','custos','estoque','compras','contas','movs','fechamento','diario',
    'bancada','tabela','vitrine','meudia','consulta']
     .map(s => comoRh(`podeVer('${s}')`)),
   new Array(15).fill(false));

console.log('\ndinheiro\n');
eq('rh NÃO vê margem (custo, lucro)',        comoRh('podeVerMargem()'),       false);
eq('rh NÃO vê valor de venda',               comoRh('podeVerValor()'),        false);
eq('rh NÃO vê custo de serviço',             comoRh('podeVerCustoServico()'), false);
eq('e money() fica mudo pra ela',            comoRh('money(2782)'),           '—');
eq('rh está na lista de papéis COM RLS',     R("PAPEIS_COM_RLS.includes('rh')"), true);

// -- 2. a tela ------------------------------------------------------------
console.log('\na tela da folha\n');

const FOLHA = [
  { mes:'2026-08', func_id:'leo',  nome:'Leo',  comissao_vendedor:'0', comissao_atendente:'2683',
    bonus_meta:'1000', bonus_coletivo:'400', bonus_extra:'0', total_variavel:'4083' },
  { mes:'2026-08', func_id:'anne', nome:'Anne', comissao_vendedor:'0', comissao_atendente:'1833',
    bonus_meta:'300', bonus_coletivo:'400', bonus_extra:'1342', total_variavel:'3875' },
  { mes:'2026-07', func_id:'leo',  nome:'Leo',  comissao_vendedor:'0', comissao_atendente:'2136',
    bonus_meta:'1000', bonus_coletivo:'400', bonus_extra:'0', total_variavel:'3536' },
];
const CUSTOS = [
  { data:'2026-08-01', area:'funcionario', descricao:'Salário Leo',  valor:2250, funcionario:'leo'  },
  { data:'2026-08-01', area:'funcionario', descricao:'Salário Anne', valor:2250, funcionario:'anne' },
  { data:'2026-08-31', area:'funcionario', descricao:'Bonus meta coletiva', valor:3600, funcionario:null },
];
R(`meuPerfil = { papel:'rh', nome:'Nara', ativo:true };
   rhFolha = ${JSON.stringify(FOLHA)}; rhSalarios = ${JSON.stringify(CUSTOS)};
   rhPix = { leo:'11959372096' }; rhCarregado = true; rhErro=''; rhMes = null;`);
const html = R('renderRhFolha()');

if (/ago\/2026/.test(html)) ok('abre no mês mais recente');
else bad('não abriu no mês mais recente');
if (html.includes('4.083') && html.includes('3.875')) ok('mostra o variável de cada pessoa');
else bad('não mostrou o variável');
if (html.includes('2.250')) ok('mostra o salário, vindo de Custos');
else bad('não mostrou o salário');
if (html.includes('6.333')) ok('soma salário + variável por pessoa (Leo 2.250+4.083)');
else bad('o total por pessoa não fecha');
if (html.includes('11959372096')) ok('mostra o Pix, que é o que ela usa pra pagar');
else bad('não mostrou o Pix');

// ⚠️ Lançamento sem pessoa (bônus agregado) NÃO pode entrar na linha de
// ninguém, mas também não pode sumir: sem ele o total da área não fecha e ela
// procura um erro que não existe.
if (/sem pessoa marcada/i.test(html) && html.includes('3.600'))
  ok('lançamento sem pessoa aparece à parte, não somado em ninguém');
else bad('lançamento sem pessoa sumiu ou foi somado em alguém');

if (/jul\/2026/.test(html)) ok('oferece os outros meses fechados');
else bad('não dá pra trocar de mês');

// ⚠️ CHAMAR renderContent(), NAO SO renderRhFolha(). O roteamento de abas em
// render.js e uma cadeia if/else if que termina em renderSemAcesso(); uma aba
// nova entrando com `if` solto monta a tela certa e depois e SOBRESCRITA pelo
// else final. Foi exatamente o que aconteceu em 02/set/2026 -- a aba aparecia
// na barra, a tela era montada, e o dono via "Atualize o app". renderRhFolha()
// sozinho passava verde. E a mesma licao do test/registro-venda.test.js.
console.log('\na aba chega na tela pelo roteador de verdade\n');
{
  let escrito = '';
  R(`currentTab = 'rhfolha';
     document.getElementById = function(id){
       return id === 'content' ? { set innerHTML(v){ globalThis.__html = v; },
                                   get innerHTML(){ return globalThis.__html || ''; } } : null; };
     document.querySelectorAll = function(){ return []; };
     __html = '';`);
  try { R('renderContent()'); } catch(e){ /* partes da tela pedem DOM que nao existe */ }
  escrito = R('__html || ""');
  if (/Folha —/.test(escrito)) ok('renderContent() entrega a tela da Folha');
  else bad('renderContent() NAO entregou a Folha — veio: ' + escrito.slice(0,80));
  if (!/Atualize o app/.test(escrito)) ok('...e não cai no "Atualize o app"');
  else bad('a tela foi sobrescrita pelo renderSemAcesso() — o `else if` da cadeia quebrou');
}

console.log('\nnada de número da loja na tela\n');
// A tela nunca recebe venda, então não há o que vazar — mas se alguém um dia
// puxar `calc()` aqui dentro, estes termos aparecem. É o canário.
const proibido = ['Lucro líquido','Margem','Custo do aparelho','valor_estoque','Faturamento'];
const achados = proibido.filter(t => html.includes(t));
eq('nenhum termo de resultado da loja no HTML', achados, []);

// -- 3. só leitura --------------------------------------------------------
console.log('\nsó leitura\n');
const src = fs.readFileSync(path.join(ROOT,'js','rh.js'),'utf8');
if (!/sbSet|sbPost|method:\s*'POST'|method:\s*'PATCH'|method:\s*'DELETE'/i.test(src))
  ok('js/rh.js não tem nenhuma escrita');
else bad('js/rh.js escreve em algum lugar — o papel é só leitura');
// ⚠️ A regra é sobre o que ela BUSCA, não sobre a palavra. O rótulo da coluna
// diz "vendas" (a comissão de vendas) e isso é texto de tela, não acesso a dado.
// A primeira versão deste teste proibia a palavra e acusou o rótulo.
const buscas = [...src.matchAll(/sbGet\(\s*'([^']+)'/g)].map(m => m[1]).sort();
eq('busca SÓ folha_mensal, custos e funcionarios_config',
   [...new Set(buscas)], ['custos','folha_mensal','funcionarios_config']);
const proibidas = ['vendas','venda_produtos','estoque','pagamentos','compras','contas'];
const vazou = buscas.filter(t => proibidas.includes(t));
eq('não busca venda, produto, estoque, pagamento nem compra', vazou, []);

console.log(falhas ? `\n### ${falhas} falha(s)` : '\n### tudo verde');
process.exit(falhas ? 1 : 0);
