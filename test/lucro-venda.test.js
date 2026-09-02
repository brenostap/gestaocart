// ===========================================================================
// LUCRO DA VENDA — a "fórmula A". Roda com: node test/lucro-venda.test.js
//
// O QUE ESTE TESTE PROTEGE: **o número que diz se o mês deu certo.**
//
// Até 02/set/2026 sete pontos do painel somavam `vendas.lucro`, o campo que a
// FoneNinja manda pronto. Ele erra, e erra pra menos: em ago/2026 dizia
// R$274.581 contra R$278.033 reais nas mesmas 384 vendas — e **58 vendas (15%)
// divergiam**. O caso que fechou o argumento foi a venda 40619619: iPhone 17 Pro
// Max vendido a R$7.590 que custou R$7.025, cliente pagou R$8.898 no crédito e
// caíram R$8.076,72 na conta. O campo dizia **−R$143,63 de prejuízo**.
//
// ⚠️ ITEM x VENDA. `venda_produtos.lucro` (preço − custo) está CERTO e é dele
// que sai a comissão de acessório. Quem erra é só o total da venda. Por isso
// trocar isto **não muda o que ninguém recebe** — e a seção 4 prova.
// ===========================================================================
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');

let falhas = 0;
const ok  = m => console.log('  ok     ' + m);
const bad = m => { falhas++; console.log('  FALHOU ' + m); };
const eq  = (m, a, b) => JSON.stringify(a) === JSON.stringify(b)
  ? ok(m) : bad(`${m} — esperava ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`);
const perto = (m, a, b, tol) => Math.abs(a-b) <= (tol||0.01)
  ? ok(m) : bad(`${m} — esperava ~${b}, veio ${a}`);

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
for (const f of ['config.js','equipe.js','core.js','ui.js','render.js'])
  vm.runInContext(fs.readFileSync(path.join(ROOT,'js',f),'utf8'), ctx, {filename:f});
const R = e => vm.runInContext(e, ctx);

// -- 1. a venda real que motivou a troca ------------------------------------
console.log('\na venda 40619619 — o caso que fechou o argumento\n');

// Dados reais, copiados do Supabase em 02/set/2026.
const V40619619 = {
  id: 40619619, valor_total: 7590, lucro: -143.63, custo_total: 7033.07,
  _produtos: [
    { titulo:'Pelicula Vidro Privativo unico', preco:0,    valor_estoque:2.98,  lucro:-2.98 },
    { titulo:'Space 17 Promax',                preco:0,    valor_estoque:5.09,  lucro:-5.09 },
    { titulo:'iPhone 17 Pro Max 256GB',        preco:7590, valor_estoque:7025,  lucro:565,
      imei_1:'358903506692535' },
  ],
  _pagamentos: [{ forma_pagamento:'Credito/Cart/Picpay', valor:8898.01,
                  taxa:821.29, taxa_extra:486.72, liquido:8076.72 }],
};
R(`V = ${JSON.stringify(V40619619)};`);

perto('a fórmula A dá +R$1.043,65', R('lucroVenda(V)'), 1043.65);
eq('e ela vem do painel, não do campo cru', R("lucroDaVenda(V).fonte"), 'painel');
if (R('lucroVenda(V)') > 0 && V40619619.lucro < 0)
  ok('o campo da FoneNinja dizia PREJUÍZO numa venda que deu lucro');
else bad('o caso perdeu o sentido — confira os dados');

// ⚠️ A checagem de sanidade da memória: `líquido − valor_total = taxa_extra`.
// Quando ela vale, a fórmula A é literalmente "o que caiu na conta menos o que
// a mercadoria custou" — que é o argumento inteiro.
perto('líquido − valor_total = taxa_extra (sanidade)',
      8076.72 - 7590, 486.72);
perto('e aí A = líquido − custo dos itens', R('lucroVenda(V)'), 8076.72 - 7033.07, 0.02);

// -- 2. as regras que erram calado ------------------------------------------
console.log('\nas três regras que a fórmula carrega\n');

// ⚠️ A taxa_extra SOMA. É juro que o cliente pagou e a loja embolsou — GANHO,
// não custo. Tratar como despesa inverte o sinal de um número de R$16 mil/mês.
R(`SEM_TX = {...V, _pagamentos:[{taxa_extra:0}]};`);
perto('sem juros repassados, a mesma venda dá R$556,93', R('lucroVenda(SEM_TX)'), 556.93);
if (R('lucroVenda(V)') > R('lucroVenda(SEM_TX)'))
  ok('a taxa_extra soma — ela é ganho, nunca custo');
else bad('a taxa_extra está sendo tratada como custo: inverte o sinal');

// ⚠️ Item cancelado (custo 0 E tem imei) é devolução: volta pro estoque. Contar
// vira lucro fantasma — inflou julho/2026 em R$28 mil antes de ser filtrado.
R(`COM_CANC = {...V, _produtos: V._produtos.concat([
     { titulo:'iPhone devolvido', preco:4000, valor_estoque:0, imei_1:'999' }]) };`);
perto('item cancelado não entra (seria lucro fantasma)',
      R('lucroVenda(COM_CANC)'), R('lucroVenda(V)'));

// Brinde: preço 0 e custo > 0. Ele CUSTA pra loja e continua inteiro no
// resultado dela — o que não desconta é a comissão de quem entregou, e isso é
// outro lugar (lucroAcessComissao).
R(`SO_BRINDE = { _produtos:[{preco:0, valor_estoque:11.63}], _pagamentos:[] };`);
perto('brinde pesa no resultado da loja (−R$11,63)', R('lucroVenda(SO_BRINDE)'), -11.63);

// -- 3. sem _produtos, diz de onde veio ------------------------------------
// ⚠️ Não é detalhe: é o único caminho pelo qual o número velho ainda aparece.
// Silenciar isso faria a cobertura ser impossível de medir.
console.log('\nquando não dá pra calcular\n');
R(`SEM_ITENS = { valor_total:1000, lucro:123.45, _produtos:[] };`);
perto('cai no campo da FoneNinja', R('lucroVenda(SEM_ITENS)'), 123.45);
eq('e AVISA que caiu', R("lucroDaVenda(SEM_ITENS).fonte"), 'foneninja');
eq('venda com itens diz que veio do painel', R("lucroDaVenda(V).fonte"), 'painel');

// -- 4. NÃO mexe em comissão ------------------------------------------------
// ⚠️ ESTA SEÇÃO É A LICENÇA PRA TROCAR A FÓRMULA. Comissão sai do lucro do
// ITEM (`p.preco − p.valor_estoque`), nunca do total da venda. Se um dia a
// comissão passar a ler o total, mudar a fórmula passa a mexer em mês pago —
// e aí precisa de vigência, como VO_ATENDE_DESDE e metaAtFaixas.
console.log('\na troca não mexe no que ninguém recebe\n');
const fontes = ['equipe.js','render.js'].map(f =>
  fs.readFileSync(path.join(ROOT,'js',f),'utf8')).join('\n');
if (!/lucroVenda\(|lucroDaVenda\(|somaLucro\(/.test(
      fontes.slice(fontes.indexOf('function calcComissaoFunc'),
                   fontes.indexOf('function calcComissaoFunc') + 6000)))
  ok('calcComissaoFunc() não usa o lucro da venda');
else bad('a comissão passou a depender do total da venda — precisa de vigência');

R(`ITEM = { preco: 350, valor_estoque: 76.75 };`);
perto('o lucro do ITEM continua preço − custo', R('ITEM.preco - ITEM.valor_estoque'), 273.25);
perto('e a comissão de acessório é 25% dele', R('(ITEM.preco - ITEM.valor_estoque) * 0.25'), 68.3125);

// -- 5. soma de lista -------------------------------------------------------
console.log('\nsoma\n');
R(`LISTA = [V, SEM_TX, SEM_ITENS];`);
perto('somaLucro soma item a item, sem atalho',
      R('somaLucro(LISTA)'), 1043.65 + 556.93 + 123.45, 0.05);
eq('lista vazia é zero', R('somaLucro([])'), 0);
eq('undefined não explode',  R('somaLucro(undefined)'), 0);
eq('venda sem nada é zero',  R('lucroVenda({})'), 0);

// -- 6. ninguém mais soma o campo cru --------------------------------------
// ⚠️ ESTA SEÇÃO EXISTE PORQUE EU ACHEI O 8º PONTO NO GREP, NÃO NO TESTE. O
// mapa original (docs/IDEIAS.md) listava 7 lugares somando `vendas.lucro`;
// `js/notificacoes.js` não estava nele e ficou pra trás — justamente a
// notificação de venda nova, a tela que o dono lê no celular assim que a venda
// entra. Mapa escrito à mão envelhece; varredura não.
console.log('\nnenhum arquivo soma o campo cru da venda\n');
{
  const dir = path.join(ROOT,'js');
  // `lucroDaVenda` pode ler `v.lucro` -- ela É o fallback. O resto, não.
  const isento = f => f === 'core.js';
  const suspeitos = [];
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.js'))) {
    if (isento(f)) continue;
    fs.readFileSync(path.join(dir,f),'utf8').split('\n').forEach((linha, i) => {
      if (/^\s*\/\//.test(linha)) return;                       // comentário
      // ⚠️ Mira no PADRÃO da leitura crua (`parseFloat(x.lucro||0)`), não no
      // nome da variável: `x.lucro` também aparece em linha AGREGADA, onde o
      // campo já foi somado por outra conta (dash-v2.js, ranking de modelo).
      // A primeira versão desta varredura acusou aquilo e o número certo junto.
      if (/parseFloat\(\s*(x|v|venda|ve)\.lucro/.test(linha)) suspeitos.push(`${f}:${i+1}`);
    });
  }
  eq('nenhum arquivo soma o lucro cru da venda (só core.js, como fallback)',
     suspeitos, []);
}

console.log(falhas ? `\n### ${falhas} falha(s)` : '\n### tudo verde');
process.exit(falhas ? 1 : 0);
