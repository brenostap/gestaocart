// ===========================================================================
// Teste do "Meu dia" — roda com:  node test/meudia.test.js
//
// O que este teste protege, em ordem de importância:
//
// 1. **A tela existe pela CHAVE, não pelo papel.** O Vitinho é `bancada` e
//    atende no balcão: se `podeVer('meudia')` voltar a olhar só o
//    MATRIZ_ACESSO, ele perde a tela e ninguém percebe — foi exatamente assim
//    que em 13/ago ele abriu o celular e só tinha "Estoque".
// 2. **Sócio não ganha a tela.** Ele não tem chave e não é comissionado.
// 3. **A tela monta.** Ela é montada por dado de VIEW, num formato que o resto
//    do painel não usa; um campo renomeado no banco derruba ela inteira.
// 4. **A base da comissão só aparece pra quem tem chave de atendente.**
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
                 'ui.js','bancada.js','meudia.js','shell.js'])
  vm.runInContext(fs.readFileSync(path.join(ROOT,'js',f),'utf8'), ctx, {filename:f});

let falhas = 0;
const ok  = m => console.log('  ok     ' + m);
const bad = m => { falhas++; console.log('  FALHOU ' + m); };
const run = js => vm.runInContext(js, ctx);

function comPerfil(perfil, fn){
  run(`meuPerfil = ${JSON.stringify(perfil)}; papelPreview='';`);
  return fn();
}

// -- 1. a tela vem da chave, não do papel ---------------------------------
console.log('quem alcança a tela');

comPerfil({papel:'bancada', nome:'Vitor Lima', at_key:'vitinho', ativo:true}, () => {
  run(`usuarioEmail='vitorgsc31@gmail.com';`);
  if (run(`podeVer('meudia')`)) ok('Vitinho (bancada + at_key) alcança Meu dia');
  else bad('Vitinho perdeu a tela — podeVer voltou a olhar só o papel');
  if (run(`podeVer('estoque') && podeVer('bancada')`)) ok('Vitinho mantém Estoque e Assistência');
  else bad('Vitinho perdeu Estoque/Assistência');
  const { fixas, mais } = run(`navMobile()`);
  const alcancaveis = [...fixas, ...mais];
  if (alcancaveis.includes('meudia')) ok('Meu dia alcançável na barra do celular');
  else bad('Meu dia sumiu no celular — que é onde ele usa');
});

comPerfil({papel:'bancada', nome:'Alguém', ativo:true}, () => {
  if (!run(`podeVer('meudia')`)) ok('bancada SEM chave não vê Meu dia');
  else bad('bancada sem chave ganhou uma tela vazia');
});

comPerfil({papel:'socio', nome:'Breno', ativo:true}, () => {
  run(`usuarioEmail='breno@phonestp.com';`);
  if (!run(`podeVer('meudia')`)) ok('sócio não vê Meu dia (não é comissionado)');
  else bad('sócio ganhou a tela de comissão');
  if (run(`podeVer('custos') && podeVerMargem()`)) ok('sócio segue com tudo');
  else bad('sócio perdeu acesso');
});

comPerfil({papel:'comercial', nome:'Maria', vo_key:'maria', at_key:'maria', ativo:true}, () => {
  const telas = run(`telasDoUsuario()`);
  if (telas.includes('meudia')) ok('Maria (comercial, vende e atende) alcança Meu dia');
  else bad('Maria não alcança a tela');
  if (run(`podeVerValor()`) && !run(`podeVerMargem()`))
    ok('comercial vê valor da venda e NÃO vê margem');
  else bad('comercial com o interruptor de dinheiro errado');
  if (!run(`podeVer('custos') || podeVer('equipe') || podeVer('dash')`))
    ok('comercial não alcança Custos, Equipe nem Dashboard');
  else bad('comercial alcançou tela que não é dele');
});

// -- 2. a tela monta com dado de view -------------------------------------
console.log('a tela monta');

const RESUMO = { mes:'2026-08', vendas_vendidas:0, aparelhos_vendidos:0, vendas_atendidas:54,
                 vendas_com_acessorio:48, acess_qtd:90, acess_bruto:'2300.00', acess_lucro:'1496.34' };
const VENDAS = [
  { id:1, loja:'cart',  data_saida:'2026-08-15T18:24:37+00:00', cliente_nome:'Fulano',
    valor_total:'1950.00', fui_vendedor:false, fui_atendente:true },
  { id:2, loja:'urban', data_saida:'2026-08-14T17:41:59+00:00', cliente_nome:null,
    valor_total:'7395.50', fui_vendedor:true,  fui_atendente:true },
];

comPerfil({papel:'bancada', nome:'Vitor Lima', at_key:'vitinho', ativo:true}, () => {
  run(`mdResumo = ${JSON.stringify(RESUMO)}; mdVendas = ${JSON.stringify(VENDAS)};
       mdCarregado = true; mdErro = '';`);
  let html = '';
  try { html = run(`renderMeuDia()`); ok('renderMeuDia() não estoura'); }
  catch(e){ bad('renderMeuDia() estourou: ' + e.message); return; }

  // 25% de 1.496,34 = 374,08 -> brl arredonda pra 374
  if (html.includes('R$374')) ok('comissão de acessório sai 25% do lucro (R$374)');
  else bad('comissão de acessório errada — esperava R$374 no HTML');

  // attach rate: 48 de 54 = 89%
  if (html.includes('89%')) ok('attach rate 48/54 = 89%');
  else bad('attach rate errado');

  if (html.includes('Como chega nesse valor')) ok('a base da conta aparece pra quem tem at_key');
  else bad('a base da conta sumiu — comissão que não se confere vira desconfiança');

  if (!/valor_estoque|custo_total/.test(html)) ok('nenhum campo de custo vaza no HTML');
  else bad('campo de custo apareceu na tela do colaborador');

  if (html.includes('Fulano')) ok('a lista de vendas monta');
  else bad('a lista de vendas não montou');
});

// Vendedor puro: sem at_key, não existe bloco de acessório nem base da conta.
comPerfil({papel:'comercial', nome:'David', vo_key:'david', ativo:true}, () => {
  run(`mdResumo = {mes:'2026-08', vendas_vendidas:40, aparelhos_vendidos:42,
        vendas_atendidas:0, vendas_com_acessorio:0, acess_qtd:0, acess_bruto:0, acess_lucro:0};
       mdVendas = []; mdCarregado = true; mdErro='';`);
  let html = '';
  try { html = run(`renderMeuDia()`); ok('renderMeuDia() monta pra vendedor puro'); }
  catch(e){ bad('estourou pro vendedor: ' + e.message); return; }
  if (!html.includes('Como chega nesse valor')) ok('sem at_key, a base da comissão não aparece');
  else bad('vendedor puro viu a base de acessório');
  // 42 aparelhos abaixo do corte de 80 -> 42 x R$25 = R$1.050
  if (html.includes('R$1.050')) ok('comissão de vendedor usa a curva de core.js (42 x R$25)');
  else bad('comissão de vendedor divergiu da curva');
  if (html.includes('Faltam 38 aparelhos')) ok('diz quanto falta pro degrau de 80');
  else bad('não diz quanto falta pro degrau');
});

// -- 3. estado de erro é honesto -------------------------------------------
comPerfil({papel:'bancada', nome:'Vitor', at_key:'vitinho', ativo:true}, () => {
  run(`mdCarregado = true; mdErro = 'HTTP 500';`);
  const html = run(`renderMeuDia()`);
  if (html.includes('Não consegui carregar')) ok('falha de carga vira aviso, não tela em branco');
  else bad('falha de carga não avisou');
  run(`mdErro='';`);
});

console.log(falhas ? `\n### ${falhas} falha(s)` : '\n### tudo verde');
process.exit(falhas ? 1 : 0);
