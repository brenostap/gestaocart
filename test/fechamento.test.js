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
ok(fech.totais.bonusCol === fech.pessoas.length * fech.bonusCol,
   'bônus coletivo pago cheio para cada pessoa');

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

// -- 10. o resto do painel continua de pe -----------------------------------
sec('dashboards continuam renderizando depois da mudança no calc()');
ok(html('renderDash()').length > 1000, 'renderDash()');
ok(html('renderDashV2()').length > 1000, 'renderDashV2()');

console.log('\n' + (falhas ? `### ${falhas} FALHA(S)` : '### tudo verde'));
process.exit(falhas ? 1 : 0);
