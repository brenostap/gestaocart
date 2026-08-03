// ===========================================================================
// Teste do fechamento da equipe — roda com:  node test/fechamento.test.js
//
// O que este teste protege: a regra de que a TELA e a EXPORTAÇÃO saem do mesmo
// fechamentoEquipe(). É o que faz a planilha valer como documento de prova. Se
// alguém voltar a calcular a folha por fora (uma cópia de cvF/caF/bmF, uma
// lista de pessoas escrita à mão), os números divergem e este teste quebra.
//
// Não tem browser nem rede: carrega os js/ reais num contexto com stubs e
// alimenta com vendas sintéticas com a forma de julho/2026 (curva de 80 un,
// centavos que forçam rateio, ajuste manual, pessoa híbrida, férias na folha).
// Os números REAIS de julho foram conferidos direto no banco, não aqui.
// ===========================================================================
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// -- contexto ---------------------------------------------------------------
const capturado = { html: null };
const ctx = {
  console,
  window: { supabase: { createClient: () => ({ auth: {} }) },
            matchMedia: () => ({ matches: false }) },
  document: {
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => ({ style:{}, addEventListener(){}, remove(){} }),
    documentElement: { getAttribute: () => null, setAttribute(){} },
    body: { appendChild(el){ capturado.html = el.innerHTML; }, insertAdjacentHTML(){} },
  },
  localStorage: { getItem: () => null, setItem(){} },
  fetch: () => Promise.reject(new Error('sem rede no teste')),
  alert: m => { throw new Error('alert: ' + m); },
  Date, Math, JSON, Set, Map, Object, Array, String, Number, parseFloat, parseInt,
  isNaN, RegExp, Error, Promise, setTimeout,
};
ctx.globalThis = ctx;
vm.createContext(ctx);

// Ordem do index.html (o que o fechamento precisa)
for (const f of ['config.js','equipe.js','core.js','render.js','custos.js',
                 'ui.js','vendas-extra.js','dash-v2.js','fechamento.js'])
  vm.runInContext(fs.readFileSync(path.join(ROOT,'js',f),'utf8'), ctx, { filename:f });

// Funcoes que moram em arquivos que este teste nao carrega (estoque.js, shell.js)
vm.runInContext(`
  function escapeHtml(s){ return String(s==null?'':s); }
  function money(v){ return brl(v); }
  function podeVerValor(){ return true; }
  function podeVerMargem(){ return true; }
  function podeVerDinheiro(){ return true; }
  function papelAtual(){ return 'socio'; }
  function getPendentes(){ return []; }
`, ctx);

// top-level let/const dos <script> vivem no escopo lexico do contexto, nao no
// objeto sandbox -> ler e escrever so por runInContext.
const R = expr => vm.runInContext(expr, ctx);

// -- vendas sinteticas ------------------------------------------------------
let seq = 40500000;
const vendas = [];
function venda({ vendedor, atendente, principais = 0, acess = [], dia }) {
  const id = ++seq;
  const prods = [];
  for (let i = 0; i < principais; i++)
    prods.push({ apple_id:'A'+id+i, imei_1:'35'+id+i, titulo:'iPhone', preco:4000, valor_estoque:3000 });
  acess.forEach(a => prods.push({ apple_id:null, imei_1:null, titulo:'Capa',
    preco:a.preco, valor_estoque:a.custo }));
  vendas.push({
    id, status:'completed',
    data_saida: '2026-07-' + String(dia).padStart(2,'0') + 'T15:00:00Z',
    valor_total: prods.reduce((a,p) => a+p.preco, 0),
    lucro: prods.reduce((a,p) => a+p.preco-p.valor_estoque, 0),
    observacoes:'', vendedor_obs: vendedor||null, atendente_obs: atendente||null,
    cliente: { nome:'Cliente '+id }, _produtos: prods,
  });
}

// Mel 115 aparelhos: cruza a curva de 80 no meio do mes
let restam = 115;
for (let d = 1; d <= 30 && restam > 0; d++) {
  const n = d === 30 ? restam : Math.min(restam, 4);
  restam -= n;
  venda({ vendedor:'mel', principais:n, dia:d });
}
for (let d = 1; d <= 30; d++) venda({ vendedor:'david', principais:3, dia:d }); // 90, cruza
venda({ vendedor:'david', principais:0, dia:30 });                              // pedido sem aparelho
for (let d = 1; d <= 14; d++) venda({ vendedor:'isa', principais:5, dia:d });   // 70, nao cruza
// Maria: hibrida (vende aparelho E atende acessorio)
for (let d = 1; d <= 7; d++) venda({ vendedor:'maria', principais:7, dia:d });
venda({ atendente:'maria', acess:[{preco:410, custo:135.6}], dia:9 });
// Anne: muitos acessorios com centavos -> forca o rateio do arredondamento
for (let d = 1; d <= 28; d++)
  venda({ atendente:'anne', dia:d, acess:[{preco:120.9+d, custo:41.37},{preco:250.5, custo:90.11}] });
// Davi: bruto 9.960 -> testa o "faltaram R$40 para R$10.000"
for (let d = 1; d <= 20; d++) venda({ atendente:'davi', acess:[{preco:498, custo:165}], dia:d });
// Leo: uma linha com lucro NEGATIVO (acessorio vendido abaixo do custo)
venda({ atendente:'leo', acess:[{preco:50, custo:180}], dia:3 });
for (let d = 4; d <= 25; d++) venda({ atendente:'leo', acess:[{preco:533.3, custo:170.9}], dia:d });
venda({ atendente:'denilson', acess:[{preco:300, custo:100}], dia:5 });

ctx.__fx = {
  vendas,
  ajustes: [{ mes:'2026-07', atendente:'denilson', valor_bruto:590,
              descricao:'venda 123 sem atendente' }],
};
R('allVendas = __fx.vendas; allMovs = []; currentPeriod = "2026-07"; currentStore = "ambas";');

// Folha real do mes: Vitinho de ferias (2.750) e Gabi proporcional (1.161),
// diferentes da constante SALARIOS -- e o ponto do lancamento em Custos.
const SALARIOS = R('SALARIOS');
ctx.__fx.custos = [
  ...Object.entries(SALARIOS)
      .filter(([f]) => f !== 'vitinho' && f !== 'gabi')
      .map(([f,v]) => ({ id:'s'+f, desc:'Salário '+f, valor:v, data:'2026-07-01',
                         area:'funcionario', loja:'ambas', fixo:true, funcionario:f })),
  { id:'sv', desc:'Salário Vitinho (férias)', valor:2750, data:'2026-07-01',
    area:'funcionario', loja:'ambas', fixo:true, funcionario:'vitinho' },
  { id:'sg', desc:'Salário Gabi', valor:1161, data:'2026-07-01',
    area:'funcionario', loja:'ambas', fixo:true, funcionario:'gabi' },
  { id:'a1', desc:'Aluguel', valor:9000, data:'2026-07-05', area:'aluguel', loja:'ambas' },
  // Extras nominais (fixo:false + funcionario): hora extra e ajuste de meta
  { id:'e1', desc:'Horas extras (18h33)', valor:284, data:'2026-07-31',
    area:'funcionario', loja:'ambas', fixo:false, funcionario:'anne', obs:'banco de horas' },
  { id:'e2', desc:'Ajuste meta individual', valor:700, data:'2026-07-31',
    area:'funcionario', loja:'ambas', fixo:false, funcionario:'davi',
    obs:'faltaram R$40 para R$10k — arredondado pelo dono' },
];
R('ajustesAcessorios = __fx.ajustes; _custosCache = __fx.custos;');

// -- helpers ----------------------------------------------------------------
let falhas = 0;
const ok  = (cond, msg) => { console.log((cond ? '  ok    ' : '  FALHA ') + msg); if (!cond) falhas++; };
const sec = t => console.log('\n' + t);
const html = expr => { try { const h = R(expr);
    if (typeof h !== 'string' || h.length < 100) throw new Error('html vazio');
    return h; } catch(e){ falhas++; console.log('  FALHA ' + expr + ': ' + e.message); return ''; } };

const fech = R('fechamentoEquipe()');
const brl  = R('brl');
const m    = R('calc()');

// -- 1. calc(): o detalhe por venda soma o mesmo que o agregado -------------
sec('calc() — detalhe por venda bate com o agregado');
Object.entries(m.voMap).filter(([,v]) => v.linhas.length).forEach(([k,v]) =>
  ok(v.linhas.reduce((a,l) => a+l.units, 0) === v.units, `voMap.${k}: Σ linhas = ${v.units} un`));
Object.entries(m.atMap).filter(([,v]) => v.linhas.length).forEach(([k,v]) => {
  ok(Math.abs(v.linhas.reduce((a,l) => a+l.bruto, 0) - v.brutoAcess) < 0.01, `atMap.${k}: Σ bruto`);
  ok(Math.abs(v.linhas.reduce((a,l) => a+l.lucro, 0) - v.la) < 0.01, `atMap.${k}: Σ lucro`);
});

// -- 2. a coluna de comissao fecha EXATAMENTE com o resumo ------------------
sec('a soma da coluna de comissão bate com o resumo');
fech.pessoas.forEach(p => {
  ok(p.linhasVo.reduce((a,l) => a+l.comissao, 0) === p.commVo,
     `${p.nome}: vendedor ${brl(p.commVo)}`);
  ok(p.linhasAt.reduce((a,l) => a+l.comissao, 0) === p.commAt,
     `${p.nome}: atendente ${brl(p.commAt)}`);
});
ok(R('fechConferir')(fech).length === 0, 'a conferência embutida não achou divergência');

// -- 3. curva de 80 unidades ------------------------------------------------
sec('curva de 80 unidades do vendedor');
const mel = fech.pessoas.find(p => p.id === 'mel');
ok(mel.units === 115, 'Mel com 115 aparelhos');
ok(mel.commVo === 80*25 + 35*35, `comissão ${brl(mel.commVo)} = 80×25 + 35×35`);
const taxas = [...new Set(mel.linhasVo.map(l => Math.round(l.taxa)))].sort((a,b) => a-b);
ok(taxas.includes(25) && taxas.includes(35), 'a virada de R$25 para R$35 aparece nas linhas');
ok(mel.linhasVo.every((l,i,a) => i === 0 || String(a[i-1].data) <= String(l.data)),
   'linhas do vendedor em ordem cronológica (a curva depende da ordem)');

// -- 4. salario vem do lancamento em Custos ---------------------------------
sec('salário sai de Custos, não da constante');
const vit = fech.pessoas.find(p => p.id === 'vitinho');
const gab = fech.pessoas.find(p => p.id === 'gabi');
ok(vit.sal === 2750, `Vitinho ${brl(vit.sal)} (a constante diria ${brl(SALARIOS.vitinho)})`);
ok(gab.sal === 1161, `Gabi ${brl(gab.sal)} (a constante diria ${brl(SALARIOS.gabi)})`);
ok(vit.salOrigem === 'custos' && gab.salOrigem === 'custos', 'origem marcada como "custos"');

// -- 5. ajuste manual de acessorio vira linha -------------------------------
sec('ajuste manual de acessório entra como linha');
const den = fech.pessoas.find(p => p.id === 'denilson');
ok(den.linhasAt.filter(l => l.ajuste).length === 1, 'Denilson tem 1 linha de ajuste');
ok(Math.round(den.brutoAcess) === 890, `bruto ${brl(den.brutoAcess)} = venda 300 + ajuste 590`);
ok(den.linhasAt.reduce((a,l) => a+l.comissao, 0) === den.commAt, 'com ajuste, a coluna ainda fecha');

// -- 6. quem entra na folha vem do cadastro ---------------------------------
sec('quem entra na folha sai do cadastro (FUNC), não de lista à mão');
const ids = fech.pessoas.map(p => p.id).sort();
ok(!ids.includes('pietra') && !ids.includes('luana'), 'quem tem "(saiu)" no cargo fica fora');
ok(!ids.includes('gustavo') && !ids.includes('marcella'), 'sócios ficam fora');
ok(ids.length === 10, `10 pessoas na folha (${ids.length}): ${ids.join(', ')}`);

// -- 7. metas ---------------------------------------------------------------
sec('metas — faixa batida e quanto faltou');
const davi = fech.pessoas.find(p => p.id === 'davi');
ok(davi.meta.nivel === 2 && davi.meta.prox === 10000, 'Davi: faixa de 6k batida, próxima 10k');
ok(Math.round(davi.meta.falta) === 40, `faltaram ${brl(davi.meta.falta)} para R$10.000`);
ok(R('comissaoVendedor(115)') === 3225 && R('comissaoVendedor(80)') === 2000, 'curva do vendedor');
ok(R('bonusMetaAtendente(9999)') === 300 && R('bonusMetaAtendente(10000)') === 1000,
   'faixas da meta individual');
const comCol = fech.pessoas.filter(p => p.bonusCol > 0).length;
ok(fech.totais.bonusCol === comCol * fech.bonusCol,
   `bônus coletivo pago cheio para cada pessoa do rateio (${comCol})`);
ok(comCol === fech.pessoas.length, 'em jul/2026 ninguém está fora do rateio');

// Ferias/afastamento tiram a pessoa do rateio -- mas NUNCA retroativo. Anne esteve
// de ferias em jun/2026 e recebeu o coletivo; mexer nisso mudaria folha ja paga.
ok(R('entraNoBonusColetivo("davi", "2026-08")') === false,
   'Davi fica fora do rateio em ago/2026 (férias o mês inteiro)');
ok(R('entraNoBonusColetivo("leo", "2026-08")') === true, 'quem trabalhou continua no rateio');
ok(R('entraNoBonusColetivo("anne", "2026-06")') === true,
   'regra não é retroativa: jun/2026 (férias da Anne) não muda');
ok(R('entraNoBonusColetivo("davi", "2026-07")') === true, 'julho fechado não muda');

// -- 8. mes anterior nao vaza o contexto ------------------------------------
sec('comparação com o mês anterior não vaza o contexto global');
const antesP = R('currentPeriod'), antesL = R('currentStore');
R('fechamentoEquipeRef("2026-06")');
ok(R('currentPeriod') === antesP && R('currentStore') === antesL,
   `contexto restaurado (${R('currentPeriod')} / ${R('currentStore')})`);
ok(R('fechamentoMesAnterior("2026-01")') === '2025-12', 'virada de ano');
ok(R('fechamentoEquipeRef("semana")') === null, 'período que não é mês devolve null');

// -- 9. A REGRA: tela e exportacao mostram o MESMO numero -------------------
sec('tela e exportação saem da mesma folha');
const tela = html('renderEquipe()');
ok(tela.includes('exportarFechamento(this)'), 'botão "Exportar fechamento" na aba Equipe');
ok(tela.includes('Julho de 2026'), 'título usa o período selecionado, não o mês de hoje');
ok(tela.includes(brl(fech.totais.folha)), `total da folha ${brl(fech.totais.folha)} na tela`);
fech.pessoas.forEach(p => ok(tela.includes(brl(p.total)), `tabela mostra ${p.nome} ${brl(p.total)}`));

R('gerarResumoEquipe()');
fech.pessoas.forEach(p => ok(String(capturado.html).includes(brl(p.total)),
  `resumo de WhatsApp de ${p.nome} mostra ${brl(p.total)}`));

fech.pessoas.forEach(p => {
  const card = html(`renderFuncCard(${JSON.stringify(p.id)}, ${fech.m.lAcess})`);
  ok(card.includes(brl(p.total)), `card individual de ${p.nome} mostra ${brl(p.total)}`);
});

// -- 9b. TUDO segue o filtro da sidebar, nunca o mes de hoje ---------------
// Bug relatado em 01/ago/2026: no dia 1o do mes o card dizia "Agosto" enquanto
// mostrava os numeros de julho, e o historico estava fixo em jan/fev/mar/2026.
sec('a tela segue o período da sidebar, não o mês de hoje');
const hojeMes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho',
                 'Agosto','Setembro','Outubro','Novembro','Dezembro'][new Date().getMonth()];
const semRotuloDeHoje = h => hojeMes === 'Julho' || !h.includes(hojeMes + ' ' + new Date().getFullYear());
ok(tela.includes('Julho de 2026'), 'tabela de fechamento: "Julho de 2026"');
fech.pessoas.slice(0,3).forEach(p => {
  const card = html(`renderFuncCard(${JSON.stringify(p.id)}, ${fech.m.lAcess})`);
  ok(card.includes('Julho 2026'), `card de ${p.nome}: cabeçalho e total dizem "Julho 2026"`);
  ok(semRotuloDeHoje(card), `card de ${p.nome}: não vaza o mês de hoje (${hojeMes})`);
  ok(card.includes('Mai') && card.includes('Jun') && card.includes('Jul'),
     `card de ${p.nome}: histórico é mai/jun/jul (os 3 meses até o filtro)`);
});
ok(R('fechamentoMesMenos("2026-01", 2)') === '2025-11', 'fechamentoMesMenos vira o ano');
ok(R('fechamentoMesMenos("2026-07", 0)') === '2026-07', 'n=0 devolve o próprio mês');

// -- 9c. extras nominais (hora extra, ajuste de meta) -----------------------
sec('extras lançados em Custos entram na folha como linha própria');
const anneX = fech.pessoas.find(p => p.id === 'anne');
const daviX = fech.pessoas.find(p => p.id === 'davi');
ok(anneX.extras.length === 1 && anneX.extrasTot === 284,
   `Anne: 1 extra de ${brl(anneX.extrasTot)} (${anneX.extras[0].desc})`);
ok(daviX.extras.length === 1 && daviX.extrasTot === 700,
   `Davi: 1 extra de ${brl(daviX.extrasTot)} (${daviX.extras[0].desc})`);
ok(daviX.total === daviX.sal + 700 + daviX.comm + daviX.bonusMeta + daviX.bonusCol,
   `total de Davi inclui o extra (${brl(daviX.total)})`);
ok(daviX.sal === 2250, 'o extra NÃO é somado no salário (fica em linha separada)');
ok(fech.totais.extras === 984, `total de extras da folha ${brl(fech.totais.extras)}`);
ok(fech.pessoas.filter(p => p.extrasTot === 0).every(p => p.extras.length === 0),
   'quem não tem extra continua com a lista vazia');
const telaX = html('renderEquipe()');
ok(telaX.includes('Extras'), 'coluna "Extras" aparece na tabela quando há extra no mês');
ok(telaX.includes(brl(daviX.total)), `tabela mostra o total novo de Davi ${brl(daviX.total)}`);
const cardX = html('renderFuncCard("davi", 0)');
ok(cardX.includes('Ajuste meta individual'), 'card de Davi mostra a descrição do extra');
ok(cardX.includes(brl(daviX.total)), 'card de Davi bate com a folha');

// -- 9d. PDF: mesmo numero, uma folha por pessoa ---------------------------
sec('PDF sai da mesma folha e quebra uma página por pessoa');
R('fechamentoPDF()');
const pdf = String(capturado.html);
ok(pdf.includes('fp-pagina'), 'documento montado com páginas');
const nPag = (pdf.match(/class="fp-pagina"/g) || []).length;
ok(nPag === fech.pessoas.length + 1,
   `${nPag} páginas = ${fech.pessoas.length} pessoas + 1 geral`);
fech.pessoas.forEach(p => ok(pdf.includes(brl(p.total)),
  `PDF mostra ${p.nome} ${brl(p.total)} (= folha)`));
ok(pdf.includes(brl(fech.totais.folha)), `PDF mostra a folha ${brl(fech.totais.folha)}`);
ok(pdf.includes('Julho de 2026'), 'PDF usa o período selecionado');
ok(pdf.includes('Ajuste meta individual'), 'PDF mostra a descrição do extra');
ok(pdf.includes('faltaram R$40 para R$10.000'),
   'PDF diz a verdade sobre a meta do Davi mesmo com o ajuste');
ok(!/style="[^"]*#[0-9a-fA-F]{3,6}/.test(pdf), 'nenhuma cor literal no HTML do documento');

R('fechamentoPDF("davi")');
const pdfDavi = String(capturado.html);
const nPagDavi = (pdfDavi.match(/class="fp-pagina"/g) || []).length;
ok(nPagDavi === 1, 'PDF individual tem 1 página só');
ok(pdfDavi.includes(brl(daviX.total)), `PDF individual mostra ${brl(daviX.total)}`);
ok(!pdfDavi.includes('Folha — todos lado a lado'),
   'PDF individual não leva a aba geral (não vaza o dado dos outros)');
fech.pessoas.filter(p => p.id !== 'davi').forEach(p =>
  ok(!pdfDavi.includes('>' + p.nome + '<'), `PDF do Davi não cita ${p.nome}`));

// -- 9e. print.css desfaz o empilhamento de tabela do celular --------------
// components.css empilha .c-tabela em cartoes abaixo de 720px. Imprimindo do
// iPhone isso valeria no papel e 250 linhas de venda virariam 250 cartoes.
sec('print.css: documento sempre claro e tabela sempre tabela');
const printCss = fs.readFileSync(path.join(ROOT,'css','print.css'),'utf8');
// indexOf('@media print') pegaria a MENÇÃO num comentário lá em cima; o corte
// tem que ser na abertura do bloco.
const _iPrint = printCss.indexOf('@media print{');
const blocoPrint = printCss.slice(_iPrint);
const foraDoPrint = printCss.slice(0, _iPrint);

// O tema claro do documento tem que valer SEMPRE, nao so em @media print: o
// iPhone reaproveita o raster da camada acelerada e imprimia os tokens escuros
// (blocos pretos #0f1420 e circulo azul #5b8bf5 no PDF de 01/ago/2026).
[['.fp-doc{', 'o bloco de tokens vive em .fp-doc'],
 ['--bg:#ffffff', 'fundo claro'],
 ['--cart:#3b6fd6', 'azul claro (o escuro #5b8bf5 era o do círculo sujo)'],
 ['--text:#1a1f36', 'texto escuro'],
].forEach(([t,msg]) => ok(foraDoPrint.includes(t), msg + ' — fora do @media print'));
ok(!blocoPrint.includes('--bg:#ffffff'),
   'os tokens NÃO estão só dentro de @media print (era a causa do PDF sujo)');
// sem comentários: o próprio arquivo explica por que a propriedade saiu
const printSemComentario = printCss.replace(/\/\*[\s\S]*?\*\//g, '');
ok(!/-webkit-overflow-scrolling:\s*touch/.test(printSemComentario),
   'sem -webkit-overflow-scrolling:touch (promovia o overlay a camada acelerada)');

// A tabela nao pode empilhar em cartao (components.css faz isso abaixo de 720px)
[['.fp-doc .c-tabela{ display:table', 'tabela é table em qualquer largura'],
 ['.fp-doc .c-tabela td{', 'td é table-cell'],
 ['.fp-doc .c-tabela thead{ display:table-header-group', 'cabeçalho repete'],
 ['content:none !important', 'rótulo ::before do modo celular some'],
].forEach(([t,msg]) => ok(foraDoPrint.includes(t), msg));

// O FUNDO DA PÁGINA. Foi a causa real dos blocos pretos e do círculo azul:
// html/body têm background:var(--bg) (#0f1420 no escuro) e o body::before é um
// position:fixed com radial-gradients rgba(91,139,245) -- e pseudo-elemento NÃO
// é filho, então `body > *{display:none}` nunca pegou ele.
[['html, body{ background:#ffffff', 'página branca, seja qual for o tema'],
 ['background-image:none !important', 'sem o gradiente de fundo do body'],
 ['body::before, body::after{ display:none', 'fundo atmosférico fora do papel'],
].forEach(([t,msg]) => ok(blocoPrint.includes(t), msg));

// E no papel: quebra por pessoa, nada de camada composta
[['break-after:page', 'quebra de página por pessoa'],
 ['position:static !important', 'overlay sai de position:fixed'],
 ['-webkit-overflow-scrolling:auto', 'scroll acelerado desligado'],
 ['print-color-adjust:exact', 'fundos saem no papel'],
].forEach(([t,msg]) => ok(blocoPrint.includes(t), msg));
ok(/@page\{[^}]*size:A4/.test(blocoPrint.replace(/\s/g,'')), 'papel A4 com margem');

// Todo asset local do index.html tem que levar a MESMA versão: se um ficar pra
// trás, aquele arquivo continua vindo do cache do iPhone, calado.
sec('versão dos assets no index.html');
const indexHtml = fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const locais = [...indexHtml.matchAll(/(?:src|href)="((?:js|css)\/[^"]+)"/g)].map(m => m[1]);
ok(locais.length > 10, `${locais.length} assets locais no index.html`);
const semVersao = locais.filter(u => !/\?v=/.test(u));
ok(semVersao.length === 0, 'todos com ?v=' + (semVersao.length ? ': faltam ' + semVersao.join(', ') : ''));
const versoes = [...new Set(locais.map(u => u.split('?v=')[1]))];
ok(versoes.length === 1, 'todos na MESMA versão (' + versoes.join(' / ') + ')');
ok(indexHtml.includes('js/versao.js?v='), 'js/versao.js carregado (é quem mostra a faixa)');
ok(!/cdn\.[^"]*\?v=/.test(indexHtml), 'nada de ?v= nas CDNs');

// -- 9f. conciliacao Custos x folha ----------------------------------------
// Os dois lados tem que dizer o mesmo numero, tirando a comissao (que de
// proposito nao e lancada em Custos). As 3 direcoes:
sec('conciliação: Custos (área Funcionários) × o que a folha calcula');
const custosBase = R('_custosCache');

// (a) fixture sem os lancamentos de bonus -> "falta lancar"
ok(fech.totais.conciliacao < 0,
   `falta lançar ${brl(-fech.totais.conciliacao)} (os 3 bônus do mês)`);
ok(fech.avisos.some(a => a.includes('Falta lançar')), 'avisa o que falta lançar');

// (b) com os bonus lancados no valor que a folha calcula -> bate
ctx.__fx.custosOk = custosBase.concat([
  {id:'b1', desc:'Bonus meta coletiva',      valor:fech.totais.bonusCol,  data:'2026-07-31',
   area:'funcionario', loja:'ambas', fixo:false, funcionario:null},
  {id:'b2', desc:'Bonus meta individual',    valor:fech.totais.bonusMeta, data:'2026-07-31',
   area:'funcionario', loja:'ambas', fixo:false, funcionario:null},
  {id:'b3', desc:'Bonus 5% acessorios Anne', valor:fech.totais.bonus5,    data:'2026-07-31',
   area:'funcionario', loja:'ambas', fixo:false, funcionario:null},
]);
R('_custosCache = __fx.custosOk;');
const fechOk = R('fechamentoEquipe()');
ok(fechOk.totais.conciliacao === 0,
   `bate: Custos ${brl(fechOk.totais.custosDaFolha)} = folha sem comissão ${brl(fechOk.totais.folhaSemComissao)}`);
ok(!fechOk.avisos.some(a => a.includes('Custos tem') || a.includes('Falta lançar')),
   'sem aviso de conciliação quando bate');

// (c) bonus dos 5% com valor VELHO (o caso do resync: 1.287 em vez de 1.305)
ctx.__fx.custosVelhos = ctx.__fx.custosOk.map(c =>
  c.id === 'b3' ? {...c, valor: c.valor - 18} : c);
R('_custosCache = __fx.custosVelhos;');
const fechVelho = R('fechamentoEquipe()');
ok(fechVelho.totais.conciliacao === -18,
   'pega o bônus de 5% desatualizado pelo resync (diferença de R$18)');
ok(fechVelho.avisos.some(a => a.includes('Falta lançar')), 'e avisa');

// (d) lancamento na area sem pessoa -> dinheiro que sumiria dos dois lados
ctx.__fx.custosOrfao = ctx.__fx.custosOk.concat([
  {id:'o1', desc:'Vale transporte', valor:300, data:'2026-07-20',
   area:'funcionario', loja:'ambas', fixo:false, funcionario:null},
]);
R('_custosCache = __fx.custosOrfao;');
const fechOrfao = R('fechamentoEquipe()');
ok(fechOrfao.totais.conciliacao === 300, 'pega os R$300 lançados sem pessoa');
ok(fechOrfao.avisos.some(a => a.includes('a mais na área Funcionários')),
   'avisa que o valor não chega em ninguém nem no resultado');
const telaAviso = html('renderEquipe()');
ok(telaAviso.includes('Confira antes de fechar a folha'),
   'o aviso aparece NA TELA, não só no arquivo exportado');

R('_custosCache = __fx.custos;'); // devolve o estado do fixture

// -- 9g. seletor de PDF individual ------------------------------------------
sec('seletor: documento completo ou a folha de uma pessoa');
let modalHtml = '';
const criarOrig = ctx.document.createElement;
ctx.document.body.insertAdjacentHTML = (_pos, h) => { modalHtml = h; };
R('fechamentoPDFEscolher()');
ok(modalHtml.includes('Documento completo'), 'oferece o documento inteiro');
fech.pessoas.forEach(p => ok(modalHtml.includes(`fechamentoPDF('${p.id}')`),
  `oferece a folha individual de ${p.nome}`));
ok(modalHtml.includes(brl(fech.pessoas[0].total)), 'mostra o total de cada um no botão');

// -- 10. o resto do painel continua de pe -----------------------------------
sec('dashboards continuam renderizando depois da mudança no calc()');
ok(html('renderDash()').length > 1000, 'renderDash()');
ok(html('renderDashV2()').length > 1000, 'renderDashV2()');

console.log('\n' + (falhas ? `### ${falhas} FALHA(S)` : '### tudo verde'));
process.exit(falhas ? 1 : 0);
