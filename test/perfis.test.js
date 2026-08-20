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

eq('vê Estoque, Assistência e Tabela de preços',
   ['estoque','bancada','tabela'].map(s => comoPapel('bancada', `podeVer('${s}')`)), [true, true, true]);
eq('NÃO vê dash, vendas, compras, movs, equipe, contas, custos, fechamento',
   ['dash','vendas','compras','movs','equipe','contas','custos','fechamento']
     .map(s => comoPapel('bancada', `podeVer('${s}')`)),
   [false,false,false,false,false,false,false,false]);

// ⚠️ A Tabela entrou pelo QUINTO interruptor (20/ago), não por VE_VALOR — e a
// diferença é o que impede um vazamento. Preço de catálogo é o que a loja
// publica no story; valor de venda é quanto AQUELE cliente pagou. Se a aba
// tivesse entrado por VE_VALOR, o Vitinho ganharia junto o "Exportar WhatsApp"
// do Estoque, que manda preço item a item e está fechado de propósito.
eq('bancada vê preço de catálogo', comoPapel('bancada','podeVerPrecoTabela()'), true);
eq('e moneyPreco() mostra o número', comoPapel('bancada','moneyPreco(2782)'), 'R$2.782');
eq('mas money() (valor da venda) segue mudo', comoPapel('bancada','money(2782)'), '—');
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
// ⚠️ Desde 13/ago o papel bancada VÊ custo de serviço — de propósito, por um
// interruptor próprio (podeVerCustoServico). É ele quem leva os aparelhos e
// recebe as notas; sem isso não dá pra conferir a nota de segunda no painel.
// O que continua fechado é dinheiro de APARELHO: custo, preço, margem, capital.
ok('vê a coluna de custo de serviço', /Serviço no mês/.test(bnc));
ok('NÃO vê o capital parado nos aparelhos', !/Capital parado/.test(bnc));
ok('mostra os dias fora, que é o que interessa pra ele', /\d+d</.test(bnc));

const bncSocio = comoPapel('socio', '(function(){ currentTab="bancada"; return renderBancada(); })()');
ok('sócio continua vendo o capital parado', /Capital parado/.test(bncSocio));

console.log('\nbarra de baixo do celular (o bug de 13/ago)\n');

eq('papel bancada vê as TRÊS telas na barra do celular',
   comoPapel('bancada','navMobile().fixas'), ['estoque','bancada','tabela']);
eq('papel que cabe na barra não precisa de "Mais"',
   comoPapel('bancada','navMobile().mais'), []);
// O socio tem 11 telas: 4 ficam fixas e as outras 7 vao pro "Mais". Antes de
// 15/ago as 7 simplesmente nao existiam no celular.
eq('sócio tem 4 slots fixos',
   comoPapel('socio','navMobile().fixas'), ['dash','vendas','estoque','equipe']);
eq('e as outras 7 ficam alcançáveis pelo "Mais"',
   comoPapel('socio','navMobile().mais'),
   ['compras','bancada','movs','tabela','contas','custos','fechamento']);
ok('toda tela do papel é alcançável no celular — fixa ou no "Mais"',
   Object.keys(R('MATRIZ_ACESSO')).every(p => {
     const n = comoPapel(p, 'navMobile()');
     const alcanca = n.fixas.concat(n.mais).sort();
     return JSON.stringify(alcanca) === JSON.stringify(R('MATRIZ_ACESSO')[p].slice().sort());
   }));
ok('nenhum papel mostra tela que não pode ver',
   Object.keys(R('MATRIZ_ACESSO')).every(p => {
     const n = comoPapel(p, 'navMobile()');
     return n.fixas.concat(n.mais).every(id => comoPapel(p, "podeVer('" + id + "')"));
   }));

const estBanc = comoPapel('bancada', '(function(){ currentTab="estoque"; return renderEstoque(); })()');
ok('Estoque do papel bancada tem 2 KPIs (grade de 2 colunas no celular, sem órfão)',
   (estBanc.match(/class="c-kpi"/g) || []).length === 2,
   'kpis: ' + (estBanc.match(/class="c-kpi"/g) || []).length);
ok('sem filtro de Origem (é nome de fornecedor)', !/setEstoqueOrigem/.test(estBanc));

const estSocio = comoPapel('socio', '(function(){ currentTab="estoque"; return renderEstoque(); })()');
ok('sócio mantém os KPIs de sempre', (estSocio.match(/class="c-kpi"/g) || []).length >= 4);
ok('sócio mantém o filtro de Origem', /setEstoqueOrigem/.test(estSocio));

// -- Estoque vindo da VIEW (17/ago/2026) ------------------------------------
// Desde que a tabela `estoque` virou só do sócio, o papel bancada lê
// `v_estoque_vitrine` — que NÃO traz valor_estoque nem ultimo_fornecedor.
// Campo ausente não é zero: "custo 0" viraria "margem = preço cheio", número
// inventado esperando alguém mostrar.
console.log('\nestoque vindo da view (sem custo, sem fornecedor)\n');

R(`estoqueItens = [
  { id: 303, titulo:'iPhone 16 Plus 128GB Rosa Seminovo', produto:{titulo:'iPhone 16 Plus 128GB Rosa Seminovo'},
    serial:'381', imei_1:'350000000003324', bateria: 88, preco_varejo: 4200, status:'available' },
];`);

const dView = comoPapel('bancada', 'dadosDoItem(estoqueItens[0])');
ok('custo ausente vira null, não zero', dView.custo === null, 'custo: ' + JSON.stringify(dView.custo));
ok('margem sem custo é null, não o preço cheio', dView.margem === null, 'margem: ' + JSON.stringify(dView.margem));
ok('origem não carimba "Entrada (cliente)" sem ter o dado', dView.origem === null,
   'origem: ' + JSON.stringify(dView.origem));

const estView = comoPapel('bancada', '(function(){ currentTab="estoque"; return renderEstoque(); })()');
ok('a tela monta com o item da view', /iPhone 16 Plus/.test(estView));
ok('nenhum NaN escapa pra tela', !/NaN/.test(estView));
ok('nenhum campo de custo aparece', !/valor_estoque/.test(estView));

// O sócio continua lendo a TABELA, com custo — a view não pode ter virado a
// fonte de todo mundo por engano.
const dSocio = comoPapel('socio', 'dadosDoItem({id:9, titulo:"iPhone 15 128GB Preto", produto:{titulo:"iPhone 15 128GB Preto"}, valor_estoque: 3000, ultimo_fornecedor:"STP"})');
ok('sócio com a tabela segue calculando custo e margem',
   dSocio.custo === 3000 && dSocio.margem === 1200 && dSocio.origem === 'STP',
   JSON.stringify({custo:dSocio.custo, margem:dSocio.margem, origem:dSocio.origem}));

// -- Papel que este JS não conhece (17/ago/2026) ----------------------------
// Código velho + papel novo no banco = `permitidas` vazio. O fallback era
// 'estoque' — a tela que essa pessoa justamente não pode ler —, então o
// sintoma aparecia como "estoque zerado", que parece dado e não parece bug.
// Aconteceu no primeiro login do papel `comercial`.
// -- Usuário sem perfil (17/ago/2026) ---------------------------------------
// Um usuário foi recriado no Auth, o user_id mudou, e `perfis.user_id` tem
// ON DELETE CASCADE — o perfil foi junto, calado. Sem a distinção abaixo, ela
// caía no padrão 'socio' e via o MENU INTEIRO DE ADMIN com zero em tudo.
// O RLS protegia o dado; a tela é que mentia.
console.log('\nusuário sem perfil não vira admin\n');

eq('leu e NÃO veio linha => papel "nenhum", não "socio"',
   R(`(function(){ meuPerfil = null; perfilLidoSemLinha = true; return papelReal(); })()`),
   'nenhum');
eq('sem perfil não alcança tela nenhuma',
   R(`(function(){ meuPerfil = null; perfilLidoSemLinha = true; return telasDoUsuario(); })()`),
   []);
ok('e a tela diz que o acesso não foi liberado — não manda atualizar à toa',
   /Acesso não liberado/.test(R(`(function(){ meuPerfil=null; perfilLidoSemLinha=true; return renderSemAcesso(); })()`)));

// A falha de LEITURA continua caindo em 'socio': o dono não pode ficar travado
// por uma queda de rede, e quem decide o dado é o RLS.
eq('leitura que FALHOU continua no padrão sócio',
   R(`(function(){ meuPerfil = null; perfilLidoSemLinha = false; return papelReal(); })()`),
   'socio');

R(`perfilLidoSemLinha = false;`);

console.log('\npapel desconhecido cai em tela honesta\n');

// recarregarLimpo() mora em versao.js, que este teste nao carrega. Sem o stub
// o botao some -- e a tela ficaria sem saida de emergencia, que e justo o que
// ela existe pra oferecer.
R(`function recarregarLimpo(){}`);

const semAcesso = R(`(function(){
  meuPerfil = { papel:'papel_que_ainda_nao_existe', ativo:true };
  papelPreview = '';
  const permitidas = telasDoUsuario();
  return { permitidas, html: renderSemAcesso() };
})()`);
ok('papel desconhecido não alcança tela nenhuma', semAcesso.permitidas.length === 0,
   JSON.stringify(semAcesso.permitidas));
ok('a tela diz pra atualizar, não mostra número vazio',
   /Atualize o app/.test(semAcesso.html) && /Atualizar agora/.test(semAcesso.html));

// Estoque sem item não pode dizer "vazio": com 218 aparelhos na prateleira, o
// caso realista é leitura que não veio.
const estVazio = R(`(function(){
  meuPerfil = { papel:'bancada', ativo:true };
  const antes = estoqueItens; estoqueItens = [];
  const h = renderEstoque(); estoqueItens = antes; return h;
})()`);
ok('estoque sem item manda atualizar em vez de dizer que está vazio',
   /Nenhum aparelho carregado/.test(estVazio) && /Atualizar agora/.test(estVazio));

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo certo.\n');
process.exit(falhas ? 1 : 0);
