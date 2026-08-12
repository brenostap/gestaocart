// ===========================================================================
// Teste da Bancada — roda com:  node test/bancada.test.js
//
// O que este teste protege:
//
// 1. **O aparelho que está fora some do disponível.** Era esse o buraco: em
//    12/ago/2026 eram 43 aparelhos e R$ 87 mil marcados `available` enquanto
//    estavam fisicamente na assistência.
// 2. **A tela de Estoque continua montando** com o selo no meio. Renomear uma
//    chave da Conferência já derrubou a tela de Vendas inteira em 06/ago e
//    nenhum teste de unidade viu, porque ninguém montava a tela (CLAUDE.md).
// 3. **Casamento por apple_id, não por etiqueta.** `E1030` e `SP1030` são
//    aparelhos diferentes; 138 itens do estoque colidem se o prefixo cair.
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
                 'ui.js','bancada.js'])
  vm.runInContext(fs.readFileSync(path.join(ROOT,'js',f),'utf8'), ctx, {filename:f});

vm.runInContext(`
  function money(v){ return brl(v); }
  function podeVerValor(){ return true; }
  function podeVerMargem(){ return true; }
  function papelAtual(){ return 'socio'; }
  function carregarTabelaPrecos(){ return Promise.resolve(); }
  function carregarFotos(){ return Promise.resolve(); }
  function getPrecoVendaSync(){ return null; }
  function getFornNome(i){ return i && i.ultimo_fornecedor || ''; }
  _precosCache = {}; _fotos = {};
  currentTab = 'estoque';

  // Dois aparelhos que colidem quando o prefixo da etiqueta cai: E1030 e SP1030.
  estoqueItens = [
    { id: 101, titulo:'iPhone 16 128GB Rosa Seminovo',  produto:{titulo:'iPhone 16 128GB Rosa Seminovo'},
      serial:'E1030',  imei_1:'350000000008580', valor_estoque: 3700, bateria: 92, ultimo_fornecedor:'' },
    { id: 202, titulo:'iPhone 16 128GB Preto Seminovo', produto:{titulo:'iPhone 16 128GB Preto Seminovo'},
      serial:'SP1030', imei_1:'350000000001234', valor_estoque: 3500, bateria: 95, ultimo_fornecedor:'DESEJO' },
    { id: 303, titulo:'iPhone 16 Plus 128GB Rosa Seminovo', produto:{titulo:'iPhone 16 Plus 128GB Rosa Seminovo'},
      serial:'381', imei_1:'350000000003324', valor_estoque: 2782, bateria: 88, ultimo_fornecedor:'STP' },
  ];

  // Só o 101 e o 303 estão fora. O 303 é o caso real de 93 dias.
  _bancadaCache = [
    { id: 1, apple_id: 101, imei4:'8580', etiqueta:'E1030', modelo_txt:'iPhone 16 128GB Rosa',
      fornecedor:'RR', origem:'estoque', servico:'Reparo em placa', saiu_em:'2026-08-10', voltou_em:null },
    { id: 2, apple_id: 303, imei4:'3324', etiqueta:'381', modelo_txt:'iPhone 16 Plus 128GB Rosa',
      fornecedor:'ACCESS', origem:'estoque', servico:'Troca de tela', saiu_em:'2026-05-11', voltou_em:null },
    { id: 3, apple_id: 202, imei4:'1234', etiqueta:'SP1030', modelo_txt:'iPhone 16 128GB Preto',
      fornecedor:'RR', origem:'garantia', servico:'Subida de bateria',
      saiu_em:'2026-08-01', voltou_em:'2026-08-04' },
    { id: 4, apple_id: null, imei4:'7777', modelo_txt:'13 Pro Max Azul (cliente)',
      fornecedor:'ACCESS', origem:'cliente', servico:'Conector de carga', saiu_em:'2026-08-11', voltou_em:null },
  ];
`, ctx);

const R = e => vm.runInContext(e, ctx);

let falhas = 0;
function ok(titulo, cond, detalhe){
  if(!cond) falhas++;
  console.log((cond?'  ok    ':'  FALHOU') + '  ' + titulo + (cond || !detalhe ? '' : '\n         ' + detalhe));
}
function eq(titulo, obtido, esperado){
  ok(titulo, JSON.stringify(obtido) === JSON.stringify(esperado),
     `obtido: ${JSON.stringify(obtido)}  esperado: ${JSON.stringify(esperado)}`);
}

console.log('\nbancadaDoApple — quem está fora agora\n');

eq('aparelho fora é encontrado pelo apple_id',
   R('(bancadaDoApple(101, "350000000008580")||{}).id'), 1);

eq('aparelho que já voltou NÃO conta como fora',
   R('bancadaDoApple(202, "350000000001234")'), null);

eq('aparelho que nunca saiu não é encontrado',
   R('bancadaDoApple(999, "350000000009999")'), null);

// A etiqueta E1030 e SP1030 viram o mesmo "1030" sem o prefixo. Se o casamento
// caísse pra etiqueta, o 202 (que voltou) apareceria como fora.
ok('etiqueta ambígua não contamina: E1030 fora não marca SP1030',
   R('bancadaDoApple(202, "350000000001234") === null'));

eq('aparelho de cliente (sem apple_id) casa pelos 4 dígitos',
   R('(bancadaDoApple(null, "350000000007777")||{}).id'), 4);

console.log('\nbncDias / bncTomDias — o tempo é o alarme\n');

eq('saída de hoje dá 0 dia', R('bncDias(bncHoje())'), 0);
eq('até 6 dias é ok',        R('bncTomDias(6)'),  'ok');
eq('7 dias vira processo',   R('bncTomDias(7)'),  'processo');
eq('14 dias vira alerta',    R('bncTomDias(14)'), 'alerta');
eq('28 dias vira crítico',   R('bncTomDias(28)'), 'critico');

console.log('\ncandidatos do modal — o olho desempata\n');

R('_bncBusca = "3324"; _bncSel = new Set();');
eq('4 dígitos do IMEI não trazem aparelho que JÁ está fora',
   R('bncCandidatos().length'), 0);

R('_bncBusca = "1234";');
eq('4 dígitos trazem o aparelho que voltou (está disponível de novo)',
   R('bncCandidatos().map(i => i.id)'), [202]);

R('_bncBusca = "16 plus";');
eq('busca por modelo não traz o que está fora',
   R('bncCandidatos().length'), 0);

R('_bncBusca = "";');

console.log('\nas telas montam de verdade\n');

const bnc = R('(function(){ _bncAba = "abertas"; currentTab = "bancada"; return renderBancada(); })()');
ok('renderBancada() devolve HTML', typeof bnc === 'string' && bnc.length > 500);
ok('mostra os 3 aparelhos abertos', (bnc.match(/class="bnc-linha"/g) || []).length === 3,
   'linhas: ' + (bnc.match(/class="bnc-linha"/g) || []).length);
ok('o mais velho vem primeiro (o de 11/mai)', bnc.indexOf('16 Plus') < bnc.indexOf('16 128GB Rosa'));
ok('marca a origem garantia/cliente', bnc.includes('Cliente'));

const fech = R('(function(){ _bncAba = "fechadas"; return renderBancada(); })()');
ok('aba Voltaram mostra o que voltou', fech.includes('SP1030'));
ok('aba Voltaram mostra quantos dias ficou fora', /3d/.test(fech));

const est = R('(function(){ currentTab = "estoque"; return renderEstoque(); })()');
ok('renderEstoque() continua montando', typeof est === 'string' && est.length > 500);
ok('selo aparece nos 2 que estão fora', (est.match(/bnc-selo/g) || []).length === 2,
   'selos: ' + (est.match(/bnc-selo/g) || []).length);
ok('linha do que está fora ganha a classe na-bancada',
   (est.match(/na-bancada/g) || []).length === 2);
ok('KPI "Na assistência" mostra 2', /Na assistência[\s\S]{0,200}>2</.test(est));
ok('o que voltou NÃO ganha selo', !/SP1030[\s\S]{0,200}bnc-selo/.test(est));

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo certo.\n');
process.exit(falhas ? 1 : 0);
