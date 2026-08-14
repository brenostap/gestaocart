// ===========================================================================
// Teste da conferência da bancada — roda com:
//   node test/conferencia-bancada.test.js
//
// O que este teste protege, em ordem de importância:
//
// 1. **A conferência não cobra o passado.** Em 13/ago a `bancada` tinha 1
//    registro e `reparos` tinha 205 linhas de jul+ago. Cobrar tudo apontaria
//    204 faltas e ninguém abriria a tela de novo. Falta de registro ANTES do
//    primeiro registro não é falha, é história.
// 2. **Compara por aparelho, somando.** A nota quebra um conserto em várias
//    linhas; comparar linha a linha inventaria divergência que não existe.
// 3. **Só cobra nota de quem já voltou.** O que ainda está fora não foi
//    faturado — apontar seria alarme falso toda semana.
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
  function getFornNome(){ return ''; }
  _precosCache = {}; _fotos = {}; _correcoesCache = []; _estadosCache = {};
  estoqueItens = [];
  meuPerfil = { papel:'socio' };
  currentTab = 'bancada';

  // A bancada começou em 10/ago.
  _bancadaCache = [
    // casa com a nota e o valor bate (400 = 250 + 150, duas linhas na nota)
    { id:1, apple_id:501, imei4:'1111', etiqueta:'E1501', modelo_txt:'iPhone 13 128GB Preto',
      fornecedor:'RR', origem:'estoque', servico:'Troca de tela',
      saiu_em:'2026-08-10', voltou_em:'2026-08-12', valor_cobrado:400, criado_em:'2026-08-10T09:00:00Z' },
    // casa, mas o valor lançado está errado (nota diz 180)
    { id:2, apple_id:502, imei4:'2222', etiqueta:'E1502', modelo_txt:'iPhone 12 64GB Branco',
      fornecedor:'RR', origem:'estoque', servico:'Troca de bateria',
      saiu_em:'2026-08-11', voltou_em:'2026-08-12', valor_cobrado:300, criado_em:'2026-08-11T09:00:00Z' },
    // voltou e NÃO está na nota
    { id:3, apple_id:503, imei4:'3333', etiqueta:'E1503', modelo_txt:'iPhone 11 64GB Preto',
      fornecedor:'ACCESS', origem:'estoque', servico:'Face ID',
      saiu_em:'2026-08-11', voltou_em:'2026-08-12', valor_cobrado:null, criado_em:'2026-08-11T09:00:00Z' },
    // AINDA está fora: não pode ser cobrado de nota
    { id:4, apple_id:504, imei4:'4444', etiqueta:'E1504', modelo_txt:'iPhone 14 128GB Roxo',
      fornecedor:'RR', origem:'estoque', servico:'Subida de bateria',
      saiu_em:'2026-08-12', voltou_em:null, valor_cobrado:null, criado_em:'2026-08-12T09:00:00Z' },
  ];

  _reparosCache = [
    // 501: dois serviços na mesma nota -> 400 no total
    { id:11, apple_id:501, fornecedor:'RR', servico:'Troca de tela', valor_liquido:250,
      data_servico:'2026-08-11', modelo_nota:'13 preto', status:'ok' },
    { id:12, apple_id:501, fornecedor:'RR', servico:'Troca de vidro da tela', valor_liquido:150,
      data_servico:'2026-08-11', modelo_nota:'13 preto', status:'ok' },
    // 502: nota diz 180, a loja lançou 300
    { id:13, apple_id:502, fornecedor:'RR', servico:'Troca de bateria', valor_liquido:180,
      data_servico:'2026-08-11', modelo_nota:'12 branco', status:'ok' },
    // 999: está na nota e NUNCA foi registrado
    { id:14, apple_id:999, fornecedor:'RR', servico:'Reparo em placa', valor_liquido:700,
      data_servico:'2026-08-12', modelo_nota:'14 pro roxo', status:'ok' },
    // ANTES da bancada existir: não pode virar cobrança
    { id:15, apple_id:888, fornecedor:'RR', servico:'Troca de tela', valor_liquido:340,
      data_servico:'2026-07-20', modelo_nota:'13 azul', status:'ok' },
    { id:16, apple_id:887, fornecedor:'ACCESS', servico:'Face ID', valor_liquido:500,
      data_servico:'2026-07-21', modelo_nota:'13 promax', status:'ok' },
    // em revisão: o próprio importador não confia nela
    { id:17, apple_id:null, fornecedor:'RR', servico:'sub bat', valor_liquido:120,
      data_servico:'2026-08-12', modelo_nota:null, status:'revisar', imei_nota:'7777' },
    // amostras pra mediana de "Troca de bateria" na RR
    { id:18, apple_id:601, fornecedor:'RR', servico:'Troca de bateria', valor_liquido:170,
      data_servico:'2026-08-01', status:'ok' },
    { id:19, apple_id:602, fornecedor:'RR', servico:'Troca de bateria', valor_liquido:190,
      data_servico:'2026-08-02', status:'ok' },
  ];
`, ctx);

const R = e => vm.runInContext(e, ctx);
let falhas = 0;
function ok(t, cond, det){
  if(!cond) falhas++;
  console.log((cond?'  ok    ':'  FALHOU') + '  ' + t + (cond || !det ? '' : '\n         ' + det));
}
const eq = (t,a,b) => ok(t, JSON.stringify(a) === JSON.stringify(b),
  `obtido: ${JSON.stringify(a)}  esperado: ${JSON.stringify(b)}`);

console.log('\na conferência não cobra o passado\n');

// ⚠️ É `criado_em`, não `saiu_em`: ao importar os 38 abertos da planilha do
// Vitinho, a saída mais antiga era de 11/mai. Com `saiu_em` a conferência
// compararia julho inteiro contra um livro que só existe desde agora, e
// cuspiria ~150 falsas faltas no primeiro dia.
eq('o livro começou em 10/ago', R('bncDesde()'), '2026-08-10');
eq('saída velha NÃO puxa a régua pra trás',
   R(`(function(){
        const antes = bncDesde();
        _bancadaCache.push({ id:99, apple_id:777, imei4:'9999', fornecedor:'RR', origem:'estoque',
          servico:'tela', saiu_em:'2026-05-11', voltou_em:null, criado_em:'2026-08-13T10:00:00Z' });
        const depois = bncDesde();
        _bancadaCache.pop();
        return [antes, depois];
      })()`), ['2026-08-10','2026-08-10']);

const c = R('bncConciliar()');
eq('as 2 linhas de julho NÃO viram falta de registro',
   c.semRegistro.map(n => n.chave), ['a999']);
ok('linha em revisão não entra na conferência',
   !JSON.stringify(c).includes('7777'));

console.log('\ncompara por aparelho, somando as linhas da nota\n');

ok('501 (250 + 150 na nota = 400 lançado) não vira divergência',
   !c.valorDiferente.some(g => g.chave === 'a501'),
   'divergentes: ' + c.valorDiferente.map(g => g.chave).join(','));
eq('502 (nota 180, lançado 300) vira divergência de +120',
   c.valorDiferente.map(g => [g.chave, g.dif]), [['a502', 120]]);

console.log('\nsó cobra nota de quem já voltou\n');

eq('503 voltou e não está na nota', c.semNota.map(g => g.chave), ['a503']);
ok('504 ainda está fora — não é cobrado de nota',
   !c.semNota.some(g => g.chave === 'a504'));

console.log('\npreço de referência: nasce do histórico, não de tabela transcrita\n');

const ref = R("bncPrecoRef('RR','Troca de bateria')");
eq('mediana de 170, 180, 190 e 300 é 185 com 4 amostras', [ref.valor, ref.n], [185, 4]);
eq('serviço com menos de 3 amostras não vira referência',
   R("bncPrecoRef('RR','Reparo em placa')"), null);
eq('fornecedor errado não empresta preço',
   R("bncPrecoRef('ACCESS','Troca de bateria')"), null);

console.log('\na tela monta\n');

const tela = R('(function(){ _bncAba="conferencia"; return renderBancada(); })()');
ok('renderBancada() monta na aba Conferência', typeof tela === 'string' && tela.length > 500);
ok('diz de que data está conferindo', /10\/ago/.test(tela));
ok('mostra os três blocos', /sem registro aqui/.test(tela) && /sem nota/i.test(tela)
   && /Valor diferente/.test(tela));
ok('a aba traz o número de alertas', /Conferência \(3\)/.test(tela));

const semNada = R('(function(){ _bancadaCache = []; _bncAba="conferencia"; return renderBancada(); })()');
ok('bancada vazia não explode e explica o que falta',
   /Ainda não há o que conferir/.test(semNada));

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo certo.\n');
process.exit(falhas ? 1 : 0);
