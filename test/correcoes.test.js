// ===========================================================================
// Teste das correções de estoque — roda com:  node test/correcoes.test.js
//
// O que este teste protege: **a correção é auto-limpante.** Ela existe só
// enquanto DIVERGE da FoneNinja; quando o ERP passa a dizer o mesmo valor, ela
// some da lista sozinha, no próprio sync. É isso que impede a tabela de virar
// um segundo estoque — que foi o motivo de não ter sido feito um espelho.
//
// E protege a trava do IMEI: ele é a chave que liga venda, reparo e bancada,
// então entra como REPORTE e **nunca** substitui o valor exibido.
//
// Contexto: docs/CONTROLE-MANUTENCAO.md
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
                 'ui.js','bancada.js','correcoes.js','shell.js'])
  vm.runInContext(fs.readFileSync(path.join(ROOT,'js',f),'utf8'), ctx, {filename:f});

vm.runInContext(`
  function carregarTabelaPrecos(){ return Promise.resolve(); }
  function carregarFotos(){ return Promise.resolve(); }
  function getPrecoVendaSync(){ return null; }
  function getFornNome(i){ return (i && i.ultimo_fornecedor) || ''; }
  _precosCache = {}; _fotos = {}; _bancadaCache = [];

  estoqueItens = [
    // 101: FoneNinja diz bateria 82 e sem etiqueta -- o time corrigiu os dois
    { id:101, titulo:'iPhone 13 128GB Meia Noite Seminovo', produto:{titulo:'iPhone 13 128GB Meia Noite Seminovo'},
      serial:null, imei_1:'350000000005907', bateria:82, valor_estoque:1405, ultimo_fornecedor:'STP' },
    // 202: o time corrigiu a bateria pra 89 e a FoneNinja JA concorda -> resolvida
    { id:202, titulo:'iPhone 14 128GB Roxo Seminovo', produto:{titulo:'iPhone 14 128GB Roxo Seminovo'},
      serial:'E1201', imei_1:'350000000000346', bateria:89, valor_estoque:1570, ultimo_fornecedor:'' },
    // 303: sem correcao nenhuma
    { id:303, titulo:'iPhone 12 64GB Branco Seminovo', produto:{titulo:'iPhone 12 64GB Branco Seminovo'},
      serial:'E1382', imei_1:'350000000004743', bateria:0, valor_estoque:700, ultimo_fornecedor:'' },
  ];

  _estadosCache = {
    '101': { apple_id:101, estado:'reparo',   quem:'vitor@x.com', obs:'aguardando tela' },
    '303': { apple_id:303, estado:'saldao',   quem:'vitor@x.com' },
  };

  _correcoesCache = [
    { id:1, apple_id:101, campo:'bateria',  valor_novo:'91',    valor_fn:'82', tipo:'correcao', quem:'vitor@x.com' },
    { id:2, apple_id:101, campo:'etiqueta', valor_novo:'E1700', valor_fn:'',   tipo:'correcao', quem:'vitor@x.com' },
    { id:3, apple_id:101, campo:'imei_1',   valor_novo:'350000000009999', valor_fn:'350000000005907', tipo:'reporte', quem:'vitor@x.com' },
    { id:4, apple_id:202, campo:'bateria',  valor_novo:'89',    valor_fn:'84', tipo:'correcao', quem:'vitor@x.com' },
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

console.log('\na correção entra por cima — menos o IMEI\n');

const d101 = R('dadosDoItem(estoqueItens[0])');
eq('bateria corrigida substitui a da FoneNinja', d101.bateria, 91);
eq('etiqueta corrigida aparece onde não havia nenhuma', d101.etiqueta, 'E1700');
eq('IMEI NÃO é substituído — só reportado', d101.imei, '350000000005907');
eq('aparelho fica marcado como corrigido', d101.corrigido, true);

const d303 = R('dadosDoItem(estoqueItens[2])');
eq('aparelho sem correção fica como veio', [d303.bateria, d303.etiqueta, d303.corrigido], [0, 'E1382', false]);

console.log('\nauto-limpante: a correção morre quando a FoneNinja concorda\n');

eq('101 (FoneNinja diz 82, time diz 91) ainda diverge',
   R('corDivergencias(estoqueItens[0]).map(c => c.campo)'), ['bateria','etiqueta','imei_1']);
eq('202 (FoneNinja passou a dizer 89) parou de divergir sozinho',
   R('corDivergencias(estoqueItens[1]).map(c => c.campo)'), []);
eq('303 nunca teve correção', R('corDivergencias(estoqueItens[2]).length'), 0);
ok('reporte de IMEI nunca é dado como resolvido',
   R('corResolvida(estoqueItens[0], _correcoesCache[2])') === false);

console.log('\nquem pode corrigir\n');

eq('sócio e bancada corrigem; papel sem perfil não',
   ['socio','bancada','vendedor'].map(p => comoPapel(p,'podeCorrigirEstoque()')),
   [true, true, false]);

console.log('\na tela monta com o editor no meio\n');

const estBanc = comoPapel('bancada', '(function(){ currentTab="estoque"; estoqueAbertos = new Set([101]); return renderEstoque(); })()');
ok('renderEstoque() monta com a linha aberta', typeof estBanc === 'string' && estBanc.length > 500);
ok('editor aparece pra quem pode corrigir', /cor-bloco/.test(estBanc));
// Abrir o aparelho mostra INFO. Os campos (etiqueta, IMEI) so aparecem depois
// de pedir -- o IMEI estava a um toque de ser trocado sem querer.
ok('editor de campos NAO abre junto com a linha', !/FoneNinja diz/.test(estBanc));
ok('oferece o botão de corrigir', /Corrigir dados do aparelho/.test(estBanc));
const estEdit = comoPapel('bancada', '(function(){ currentTab="estoque"; estoqueAbertos = new Set([101]); corAbrirEdicao(101); return renderEstoque(); })()');
ok('depois de pedir, mostra o que a FoneNinja diz hoje', /FoneNinja diz/.test(estEdit));
ok('e só então o campo de IMEI existe', /data-campo|imei_1/.test(estEdit));
ok('marca ✎ na linha que ainda diverge', (estBanc.match(/cor-marca/g) || []).length === 1,
   'marcas: ' + (estBanc.match(/cor-marca/g) || []).length);
ok('KPI "A corrigir na FoneNinja" conta 1', /A corrigir na FoneNinja[\s\S]{0,200}>1</.test(estBanc));
ok('continua sem R$ pro papel bancada', !/R\$/.test(estBanc));

const estVend = comoPapel('vendedor', '(function(){ currentTab="estoque"; estoqueAbertos = new Set([101]); return renderEstoque(); })()');
ok('quem não pode corrigir não vê o editor', !/cor-bloco/.test(estVend));

console.log('\nestado da peça — o buraco entre "chegou" e "foi pra assistência"\n');

eq('estado marcado é lido', R("(estadoDoApple(101)||{}).estado"), 'reparo');
eq('aparelho sem estado devolve null', R('estadoDoApple(202)'), null);

const estEstado = comoPapel('bancada', '(function(){ currentTab="estoque"; estoqueAbertos = new Set([101]); return renderEstoque(); })()');
ok('selo do estado aparece na linha', /Precisa reparo/.test(estEstado));
// a obs vale mais que o rotulo quando o estado e 'outro': tem que sair na linha
ok('a observação aparece junto do selo', /aguardando tela/.test(estEstado));
//  (o 303) NAO conta: ele e pra vender, nao o contrario.
ok('KPI "Não prontos" nao conta saldão nem quem está fora',
   /Não prontos[\s\S]{0,200}>1</.test(estEstado));
ok('os 5 estados aparecem pra marcar', (estEstado.match(/cor-chip/g) || []).length === 5,
   'chips: ' + (estEstado.match(/cor-chip/g) || []).length);

console.log('\ncusto de serviço: interruptor próprio\n');

eq('sócio e bancada veem custo de serviço; vendedor não',
   ['socio','bancada','vendedor'].map(p => comoPapel(p,'podeVerCustoServico()')),
   [true, true, false]);
eq('moneyServico some pra quem não pode ver', comoPapel('vendedor','moneyServico(250)'), '—');
ok('bancada vê o valor do serviço', /250/.test(comoPapel('bancada','moneyServico(250)')));
ok('mas continua sem ver custo de aparelho', comoPapel('bancada','money(2782)') === '—');

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo certo.\n');
process.exit(falhas ? 1 : 0);
