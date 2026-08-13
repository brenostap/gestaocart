// ===========================================================================
// Teste dos perfis — roda com:  node test/perfis.test.js
//
// O que este teste protege: **o papel `bancada` não vê dinheiro.** O Vitinho
// entra pra registrar aparelho, não pra ver custo, preço, lucro ou folha.
//
// ⚠️ Isto testa o MENU e o money(), que são a cortina. A fechadura é o RLS por
//    papel no banco (supabase/migrations/*_rls_por_papel.sql) — teste de front
//    não prova segurança nenhuma. Ver docs/PERFIS-E-ACESSO.md.
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

// shell.js entra de verdade: são papelReal(), podeVer() e money() os testados.
for (const f of ['config.js','equipe.js','core.js','render.js','custos.js','estoque.js',
                 'ui.js','bancada.js','shell.js'])
  vm.runInContext(fs.readFileSync(path.join(ROOT,'js',f),'utf8'), ctx, {filename:f});

vm.runInContext(`
  function carregarTabelaPrecos(){ return Promise.resolve(); }
  function carregarFotos(){ return Promise.resolve(); }
  function getPrecoVendaSync(){ return { varejo: 4200 }; }
  function getFornNome(i){ return (i && i.ultimo_fornecedor) || ''; }
  _precosCache = {}; _fotos = {};
  estoqueItens = [
    { id: 303, titulo:'iPhone 16 Plus 128GB Rosa Seminovo', produto:{titulo:'iPhone 16 Plus 128GB Rosa Seminovo'},
      serial:'381', imei_1:'350000000003324', valor_estoque: 2782, bateria: 88, ultimo_fornecedor:'STP' },
  ];
  _bancadaCache = [
    { id: 2, apple_id: 303, imei4:'3324', etiqueta:'381', modelo_txt:'iPhone 16 Plus 128GB Rosa',
      fornecedor:'ACCESS', origem:'estoque', servico:'Troca de tela', saiu_em:'2026-05-11', voltou_em:null },
  ];
`, ctx);

const R = e => vm.runInContext(e, ctx);
const comoPapel = (papel, expr) => R(`(function(){ meuPerfil = ${JSON.stringify({papel})}; return (${expr}); })()`);

let falhas = 0;
function ok(titulo, cond, detalhe){
  if(!cond) falhas++;
  console.log((cond?'  ok    ':'  FALHOU') + '  ' + titulo + (cond || !detalhe ? '' : '\n         ' + detalhe));
}
const eq = (t, a, b) => ok(t, JSON.stringify(a) === JSON.stringify(b),
  `obtido: ${JSON.stringify(a)}  esperado: ${JSON.stringify(b)}`);

console.log('\npapelReal — vem da tabela `perfis`\n');

eq('sem perfil carregado cai no padrão sócio (RLS é quem trava)',
   R('(function(){ meuPerfil = null; return papelReal(); })()'), 'socio');
eq('perfil bancada devolve bancada', comoPapel('bancada','papelReal()'), 'bancada');
eq('perfilSoBancada() só é true no papel bancada',
   [comoPapel('bancada','perfilSoBancada()'), comoPapel('socio','perfilSoBancada()')], [true, false]);

console.log('\nmenu do papel bancada\n');

eq('vê Estoque e Bancada',
   ['estoque','bancada'].map(s => comoPapel('bancada', `podeVer('${s}')`)), [true, true]);
eq('NÃO vê dash, vendas, compras, movs, equipe, tabela, contas, custos, fechamento',
   ['dash','vendas','compras','movs','equipe','tabela','contas','custos','fechamento']
     .map(s => comoPapel('bancada', `podeVer('${s}')`)),
   [false,false,false,false,false,false,false,false,false]);
eq('sócio continua vendo tudo',
   R('(function(){ meuPerfil={papel:"socio"}; return MATRIZ_ACESSO.socio.every(s => podeVer(s)); })()'), true);

console.log('\ndinheiro\n');

eq('bancada não vê valor',  comoPapel('bancada','podeVerValor()'),  false);
eq('bancada não vê margem', comoPapel('bancada','podeVerMargem()'), false);
eq('money() vira travessão pra bancada', comoPapel('bancada','money(2782)'), '—');
ok('money() mostra o valor pro sócio', /2\.782/.test(comoPapel('socio','money(2782)')));

console.log('\nas telas que ele abre montam, e sem número de dinheiro\n');

const est = comoPapel('bancada', '(function(){ currentTab="estoque"; return renderEstoque(); })()');
ok('renderEstoque() monta no papel bancada', typeof est === 'string' && est.length > 500);
ok('sem coluna Custo', !/>Custo</.test(est));
ok('sem KPI Capital', !/Capital/.test(est));
ok('sem botão de exportar WhatsApp', !/Exportar WhatsApp/.test(est));
ok('nenhum R$ na tela', !/R\$/.test(est), est.match(/R\$[^<]{0,12}/g)?.slice(0,3).join(' | '));
ok('o selo da assistência continua lá', /bnc-selo/.test(est));

const bnc = comoPapel('bancada', '(function(){ currentTab="bancada"; _bncAba="abertas"; return renderBancada(); })()');
ok('renderBancada() monta no papel bancada', typeof bnc === 'string' && bnc.length > 300);
ok('sem KPI de capital parado', !/Capital parado/.test(bnc));
ok('nenhum R$ na tela', !/R\$/.test(bnc), bnc.match(/R\$[^<]{0,12}/g)?.slice(0,3).join(' | '));
ok('mostra os dias fora, que é o que interessa pra ele', /\d+d</.test(bnc));

const bncSocio = comoPapel('socio', '(function(){ currentTab="bancada"; return renderBancada(); })()');
ok('sócio continua vendo o capital parado', /Capital parado/.test(bncSocio));

console.log('\nbarra de baixo do celular (o bug de 13/ago)\n');

eq('papel bancada vê as DUAS telas na barra do celular',
   comoPapel('bancada','navMobile()'), ['estoque','bancada']);
eq('sócio continua com os 5 slots do brief',
   comoPapel('socio','navMobile()'), ['dash','vendas','estoque','equipe','custos']);
ok('nenhum papel mostra tela que não pode ver',
   Object.keys(R('MATRIZ_ACESSO')).every(p =>
     comoPapel(p, 'navMobile()').every(id => comoPapel(p, "podeVer('" + id + "')"))));

const estBanc = comoPapel('bancada', '(function(){ currentTab="estoque"; return renderEstoque(); })()');
ok('Estoque do papel bancada tem 2 KPIs (grade de 2 colunas no celular, sem órfão)',
   (estBanc.match(/class="c-kpi"/g) || []).length === 2,
   'kpis: ' + (estBanc.match(/class="c-kpi"/g) || []).length);
ok('sem filtro de Origem (é nome de fornecedor)', !/setEstoqueOrigem/.test(estBanc));

const estSocio = comoPapel('socio', '(function(){ currentTab="estoque"; return renderEstoque(); })()');
ok('sócio mantém os KPIs de sempre', (estSocio.match(/class="c-kpi"/g) || []).length >= 4);
ok('sócio mantém o filtro de Origem', /setEstoqueOrigem/.test(estSocio));

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo certo.\n');
process.exit(falhas ? 1 : 0);
