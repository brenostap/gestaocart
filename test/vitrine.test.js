// ===========================================================================
// Teste da Vitrine — roda com:  node test/vitrine.test.js
//
// O que este teste protege, em ordem de importância:
//
// 1. **Aparelho na assistência não vira mensagem pro cliente.** 16% do estoque
//    está fora da loja marcado como disponível — prometer um deles é o problema
//    que a tabela `bancada` nasceu pra resolver. O selo tem que aparecer E o
//    "copiar" tem que recusar.
// 2. **O preço sai da tabela oficial.** `estoque.preco_varejo` está vazio em
//    100% dos itens; se a tela cair nele, o vendedor cota R$0.
// 3. **Nada de custo, margem ou fornecedor** chega na tela.
// 4. A busca acha por modelo, etiqueta e final de IMEI — é como a pessoa
//    procura com o cliente na frente.
// ===========================================================================
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');

const ctx = {
  console,
  window: { supabase: { createClient: () => ({ auth: {} }) }, matchMedia: () => ({matches:false}) },
  document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => ({ style:{}, select(){}, remove(){}, set value(v){}, get value(){return '';} }),
    documentElement: { getAttribute: () => null, setAttribute(){} },
    body: { appendChild(){}, insertAdjacentHTML(){} } },
  localStorage: { getItem: () => null, setItem(){} },
  fetch: () => Promise.reject(new Error('sem rede')),
  navigator: {},
  alert: m => { ctx._alerta = m; },
  Date, Math, JSON, Set, Map, Object, Array, String, Number, parseFloat, parseInt,
  isNaN, RegExp, Error, Promise, setTimeout, clearTimeout,
};
ctx.globalThis = ctx; vm.createContext(ctx);

for (const f of ['config.js','equipe.js','core.js','render.js','custos.js','estoque.js',
                 'ui.js','bancada.js','meudia.js','vitrine.js','shell.js'])
  vm.runInContext(fs.readFileSync(path.join(ROOT,'js',f),'utf8'), ctx, {filename:f});

let falhas = 0;
const ok  = m => console.log('  ok     ' + m);
const bad = m => { falhas++; console.log('  FALHOU ' + m); };
const run = js => vm.runInContext(js, ctx);

// Preços como o loadTabelaFromSB() normaliza (modelo_norm / cor_norm).
run(`
  meuPerfil = { papel:'comercial', nome:'David', vo_key:'david', ativo:true };
  _precosCache = [
    { modelo_norm:'iphone 13 pro max', capacidade:'256GB', condicao:'Seminovo',
      cor:null, cor_norm:null, preco_varejo:4200, preco_upgrade:3100 },
    { modelo_norm:'iphone 15', capacidade:'128GB', condicao:'Seminovo',
      cor:null, cor_norm:null, preco_varejo:3900, preco_upgrade:2800 },
  ];
  vitItens = [
    { id:1, titulo:'iPhone 13 Pro Max 256GB Grafite Seminovo', serial:'E1381',
      imei_1:'350000000003324', bateria:88, preco_varejo:null, status:'available',
      na_assistencia:false, estado:null, dias_parado:112 },
    { id:2, titulo:'iPhone 15 128GB Rosa Seminovo', serial:'E1618',
      imei_1:'350000000009911', bateria:95, preco_varejo:null, status:'available',
      na_assistencia:true, estado:null, dias_parado:9 },
    { id:3, titulo:'iPhone 15 128GB Preto Seminovo', serial:'E1700',
      imei_1:'350000000007777', bateria:79, preco_varejo:null, status:'available',
      na_assistencia:false, estado:'saldao', dias_parado:null },
  ];
  vitCarregado = true; vitErro = ''; vitBusca = ''; vitEsconderAssistencia = false;
  vitSoParados = false;
  currentTab = 'vitrine';
`);

// -- 1. o aparelho fora da loja ---------------------------------------------
console.log('o que está na assistência');

const html = run(`renderVitrine()`);
if (html.includes('Na assistência')) ok('o selo aparece na lista');
else bad('aparelho na assistência não foi marcado');

// O botao "copiar pro cliente" saiu a pedido do dono (17/ago). O selo fica --
// e ele que impede prometer aparelho que nao esta na prateleira.
if (!/Copiar pro cliente/.test(html)) ok('sem botão de copiar pro cliente');
else bad('o botão de copiar continua na tela');

run(`_alerta = null; vitEsconderAssistencia = true;`);
const so = run(`vitFiltrados().length`);
if (so === 2) ok('dá pra esconder o que está na assistência (2 de 3)');
else bad('filtro de assistência errado: ' + so);
run(`vitEsconderAssistencia = false;`);

// -- 2. preço da tabela oficial ---------------------------------------------
console.log('preço');

const d1 = run(`vitDados(vitItens[0])`);
if (d1.varejo === 4200) ok('preço vem da tabela oficial, não do estoque (R$4.200)');
else bad('preço errado: ' + JSON.stringify(d1.varejo));
if (d1.upgrade === 3100) ok('preço de troca também aparece');
else bad('preço de troca não veio');
if (html.includes('R$4.200')) ok('e chega na tela');
else bad('preço não apareceu no HTML');

// Item sem linha na tabela não pode virar R$0 — tem que dizer que não tem preço.
run(`vitItens.push({ id:9, titulo:'iPhone 99 512GB Roxo Seminovo', serial:'E9',
     imei_1:'350000000000009', bateria:100, na_assistencia:false, estado:null });`);
const semPreco = run(`vitDados(vitItens[vitItens.length-1])`);
if (semPreco.varejo === null) ok('modelo fora da tabela fica sem preço, não R$0');
else bad('inventou preço: ' + semPreco.varejo);
if (run(`renderVitrine()`).includes('sem preço na tabela')) ok('e a tela diz isso');
else bad('a tela não avisou que falta preço');
run(`vitItens.pop();`);

// -- 3. nada de dinheiro fechado --------------------------------------------
console.log('o que NÃO pode aparecer');

const h = run(`renderVitrine()`);
for (const proibido of ['valor_estoque','ultimo_fornecedor','margem','custo'])
  if (!h.includes(proibido)) ok(`sem "${proibido}" no HTML`);
  else bad(`"${proibido}" vazou pra tela do vendedor`);

// -- 4. a busca acha do jeito que a pessoa procura --------------------------
console.log('busca');

const casos = [
  ['13 Pro',   1, 'por modelo'],
  ['E1618',    1, 'por etiqueta'],
  ['9911',     1, 'pelo final do IMEI'],
  ['rosa',     1, 'por cor (vem no título)'],
  ['iphone',   3, 'termo amplo devolve tudo'],
  ['xyz',      0, 'termo que não existe devolve nada'],
];
for (const [termo, esperado, nome] of casos){
  run(`vitBusca = ${JSON.stringify(termo)};`);
  const n = run(`vitFiltrados().length`);
  if (n === esperado) ok(`${nome} ("${termo}")`);
  else bad(`${nome} ("${termo}") — achou ${n}, esperava ${esperado}`);
}
run(`vitBusca='';`);

// Estado vazio diz o próximo passo (brief §7.5)
run(`vitBusca='xyz';`);
const vazio = run(`renderVitrine()`);
if (/Tente o modelo/.test(vazio)) ok('busca sem resultado diz como procurar');
else bad('estado vazio não ajuda');
run(`vitBusca='';`);

// -- 5. filtros de modelo e capacidade (17/ago/2026) ------------------------
// As opções saem do próprio estoque: modelo novo aparece sozinho e modelo que
// acabou some. Lista fixa no código envelheceria a cada lançamento da Apple.
console.log('filtros de modelo e GB');

const ops = run(`vitOpcoes()`);
if (JSON.stringify(ops.modelos) === JSON.stringify(['iPhone 15','iPhone 13 Pro Max']))
  ok('modelos vêm do estoque, geração mais nova primeiro');
else bad('lista de modelos errada: ' + JSON.stringify(ops.modelos));
if (JSON.stringify(ops.caps) === JSON.stringify(['128GB','256GB']))
  ok('capacidades ordenadas por tamanho');
else bad('capacidades erradas: ' + JSON.stringify(ops.caps));

run(`vitModelo = 'iPhone 15';`);
if (run(`vitFiltrados().length`) === 2) ok('filtro de modelo corta certo (2 iPhone 15)');
else bad('filtro de modelo errado: ' + run(`vitFiltrados().length`));

run(`vitCap = '256GB';`);
if (run(`vitFiltrados().length`) === 0) ok('modelo + capacidade combinam (nenhum 15 de 256GB)');
else bad('combinação de filtros errada');

// Filtro sem resultado NÃO pode mandar atualizar o app — a loja tem aparelho,
// esse recorte é que não tem.
const semResultado = run(`renderVitrine()`);
if (/Nenhum aparelho com esse filtro/.test(semResultado) && !/Atualizar agora/.test(semResultado))
  ok('filtro vazio oferece limpar filtros, não "atualize o app"');
else bad('filtro vazio mandou atualizar o app à toa');

run(`limparFiltrosVitrine();`);
if (run(`vitFiltrados().length`) === 3 && run(`vitModelo`) === 'todos' && run(`vitCap`) === 'todas')
  ok('limpar filtros volta tudo');
else bad('limpar filtros não funcionou');

// "Troca" virou "Upgrade" a pedido do dono — é a palavra que a loja usa.
const comPreco = run(`renderVitrine()`);
if (/upgrade /.test(comPreco) && !/Troca:/.test(comPreco)) ok('o preço de entrada se chama "upgrade"');
else bad('ainda diz "Troca"');
// Upgrade logo abaixo do preço de venda: são a mesma decisão do vendedor
// ("por quanto sai, quanto pago na entrada"), e separados ele lia um sem o outro.
if (/vit-precos[\s\S]{0,220}vit-upgrade/.test(comPreco))
  ok('o upgrade fica na mesma coluna, abaixo do preço de venda');
else bad('o upgrade não está abaixo do preço');

// -- 5b. dia de prateleira ---------------------------------------------------
// O §10 de docs/funcoes/midias-e-conteudo.md pergunta "quais aparelhos estão
// parados?". A resposta existia só do lado do sócio (v_estoque_margem é
// eh_socio()); agora vem na mesma view da Vitrine, como TEMPO e não dinheiro.
console.log('dia de prateleira');
run(`meuPerfil = { papel:'comercial', nome:'David', vo_key:'david', ativo:true };
     usuarioEmail='davidsr122004@gmail.com'; currentTab='vitrine'; vitSoParados=false;`);

const comDias = run(`renderVitrine()`);
if (/112 dias parado/.test(comDias)) ok('aparelho de 112 dias ganha selo');
else bad('o selo de parado não apareceu');
// 90+ é vermelho, 60-89 é âmbar: a cor diz a urgência sem precisar ler o número.
if (/112 dias parado[\s\S]{0,40}critico|critico[\s\S]{0,40}112 dias parado/.test(comDias)
    || /c-badge[^>]*critico[^>]*>112 dias parado/.test(comDias)) ok('90+ dias sai em vermelho');
else bad('parado de 112 dias não saiu como crítico');
// Aparelho novo na loja NÃO vira alarme: vai como meta discreta.
if (/9d na loja/.test(comDias) && !/9 dias parado/.test(comDias))
  ok('aparelho de 9 dias fica no meta, sem alarme');
else bad('aparelho novo virou alarme');
// ⚠️ Entrada não encontrada (nem compra nem troca) NÃO pode virar "0 dias":
// seria dizer que chegou hoje um aparelho que ninguém sabe de onde veio.
if (!/0 dias parado/.test(comDias) && !/0d na loja/.test(comDias))
  ok('sem data de entrada não inventa "0 dias"');
else bad('item sem entrada virou 0 dias');

// O chip só existe se houver o que achar, e diz quantos são.
if (/Parados há 60\+ dias \(1\)/.test(comDias)) ok('o chip conta os parados da operação inteira');
else bad('o chip de parados não apareceu com a contagem');

run(`toggleVitParados()`);
if (run(`vitFiltrados().length`) === 1) ok('o filtro deixa só os parados');
else bad('o filtro de parados não cortou a lista');
run(`limparFiltrosVitrine()`);
if (run(`vitSoParados`) === false && run(`vitFiltrados().length`) === 3)
  ok('limpar filtros também solta o de parados');
else bad('limpar filtros esqueceu o de parados');

// -- 6. o menu ---------------------------------------------------------------
console.log('menu');
if (run(`podeVer('vitrine')`)) ok('comercial alcança a Vitrine');
else bad('comercial não alcança a Vitrine');
run(`meuPerfil = { papel:'socio', nome:'Breno', ativo:true }; usuarioEmail='breno@phonestp.com';`);
if (run(`podeVer('vitrine')`) === false) ok('sócio não vê Vitrine (ele tem o Estoque inteiro)');
else bad('sócio ganhou uma tela duplicada');

console.log(falhas ? `\n### ${falhas} falha(s)` : '\n### tudo verde');
process.exit(falhas ? 1 : 0);
