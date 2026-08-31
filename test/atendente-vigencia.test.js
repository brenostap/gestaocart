// ===========================================================================
// Teste do VO que atende direto — roda com:  node test/atendente-vigencia.test.js
//
// O que este teste protege: **quem recebe os 25% do lucro de acessório, e desde
// quando.** Em 31/08/2026 o dono decidiu que vendedor online que fecha a venda
// direto É o atendente dela — antes disso o nome dele não casava com AT_KEYS e
// o lucro de acessório dessas vendas não ia pra ninguém (7 vendas em ago/2026).
//
// ⚠️ A parte que dói é a VIGÊNCIA, não a regra. abr–jul/2026 já foram pagos:
// aplicar pra trás mudaria fechamento fechado (+R$130 em abr, +R$35 em jun,
// −R$7 em jul, medidos no banco em 31/08). É a mesma lição de
// BRINDE_ISENTO_DESDE e metaAtFaixas, e ela erra CALADA: nada quebra na tela,
// a folha só passa a discordar do extrato que a pessoa recebeu.
//
// Por isso o teste fixa os dois lados — a chave vale em agosto e NÃO vale em
// julho — em vez de só conferir que a lista tem o nome dentro.
//
// A segunda metade cobre o caminho inverso, achado no mesmo dia: **atendente
// que VENDE aparelho**. A regra (R$25/un flat, sem curva) estava só na tela de
// Equipe; o fechamento exportado — o documento que paga — procurava a pessoa
// apenas em VO_KEYS e pagava R$0. Em ago/2026 a tela dizia R$75 pro Vitinho e
// a planilha dizia R$0. Hoje as duas passam por comissaoDeAparelho().
// ===========================================================================
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');

const ctx = {
  console,
  window: { supabase: { createClient: () => ({ auth: {} }) }, matchMedia: () => ({matches:false}) },
  document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
  localStorage: { getItem: () => null, setItem(){} },
  fetch: () => Promise.reject(new Error('sem rede')),
  Date, Math, JSON, Set, Map, Object, Array, String, Number, parseFloat, parseInt,
  isNaN, RegExp, Error, Promise, setTimeout,
};
ctx.globalThis = ctx; vm.createContext(ctx);
for (const f of ['config.js','equipe.js','core.js'])
  vm.runInContext(fs.readFileSync(path.join(ROOT,'js',f),'utf8'), ctx, {filename:f});
const R = e => vm.runInContext(e, ctx);

let falhas = 0;
const ok  = m => console.log('  ok      ' + m);
const bad = m => { falhas++; console.log('  FALHOU  ' + m); };
const eq  = (titulo, obtido, esperado) =>
  JSON.stringify(obtido) === JSON.stringify(esperado) ? ok(titulo)
  : bad(`${titulo}\n         obtido:   ${JSON.stringify(obtido)}\n         esperado: ${JSON.stringify(esperado)}`);

console.log('\nVO que atende direto — vale de ago/2026 em diante, nunca antes\n');

// -- a chave liga e desliga por mês -----------------------------------------
for (const k of R('VO_ATENDE_KEYS')) {
  const antes  = R(`!!matchNome('${k}', atKeysVigentes('2026-07'))`);
  const depois = R(`!!matchNome('${k}', atKeysVigentes('2026-08'))`);
  if (!antes && depois) ok(`${k}: atendente em ago/2026, não em jul/2026`);
  else bad(`${k}: jul=${antes} ago=${depois} — esperado jul=false ago=true`);
}

// Mês que não é mês (semana/tudo/custom) usa a regra de HOJE, igual brindeIsento.
eq('período sem mês definido usa a lista de hoje',
  R("atKeysVigentes(null).length"), R("AT_KEYS.length + VO_ATENDE_KEYS.length"));

// -- ninguém a mais, ninguém a menos ----------------------------------------
eq('julho continua exatamente com os atendentes de julho',
  R("atKeysVigentes('2026-07')"), R('AT_KEYS'));

// A Maria já era híbrida desde jun/2026 pelo FUNC (atKey + voKey) — ela NÃO
// pode depender da vigência nova, senão junho e julho mudam de valor.
eq('Maria continua atendente em jul/2026 (regra antiga, não a nova)',
  R("matchNome('maria', atKeysVigentes('2026-07'))"), 'maria');

// -- o cadastro tem que acompanhar, senão a folha não paga -------------------
// fechamentoPessoas() exige f.atKey; sem isso a chave existe e o dinheiro não sai.
for (const k of R('VO_ATENDE_KEYS')) {
  const temAtKey = R(`FUNC.some(f => f.atKey === '${k}')`);
  if (temAtKey) ok(`${k} tem atKey no FUNC (a folha alcança)`);
  else bad(`${k} está em VO_ATENDE_KEYS mas não tem atKey no FUNC — a folha nunca paga`);
}

// -- o ranking de atendentes segue o mesmo calendário ------------------------
const labelsAgo = R("atLabelsAll('2026-08').map(x=>x[1])");
const labelsJul = R("atLabelsAll('2026-07').map(x=>x[1])");
for (const k of R('VO_ATENDE_KEYS')) {
  if (labelsAgo.includes(k) && !labelsJul.includes(k)) ok(`${k} aparece no ranking de ago, não no de jul`);
  else bad(`${k} no ranking: ago=${labelsAgo.includes(k)} jul=${labelsJul.includes(k)}`);
}

// -- a venda carrega o próprio mês ------------------------------------------
// getVendaInfo() roda no dashboard com meses diferentes ao mesmo tempo; o
// fallback do login (cadastradorAT) tem que olhar a DATA DA VENDA, não o
// período da tela — senão a Isa vira atendente de uma venda de julho.
vm.runInContext(`funcionariosFN = [{id:6440,nome:'Isa'},{id:3100,nome:'Anne'}];`, ctx);
const vendaJul = { observacoes:null, cadastrador_id:6440, data_saida:'2026-07-15T18:00:00+00:00' };
const vendaAgo = { observacoes:null, cadastrador_id:6440, data_saida:'2026-08-15T18:00:00+00:00' };
ctx.__j = vendaJul; ctx.__a = vendaAgo;
eq('venda de julho não ganha atendente novo pelo login',
  R('getVendaInfo(__j).atendente'), null);
eq('venda de agosto ganha',
  R('getVendaInfo(__a).atendente'), 'isa');

// ---------------------------------------------------------------------------
// Atendente que vende aparelho: R$25/un flat, e a TELA e a FOLHA dizem o mesmo
// ---------------------------------------------------------------------------
console.log('\natendente que vende aparelho — tela e folha nao podem divergir\n');

// Carrega o resto da cadeia (calc/fechamentoEquipe moram em render.js e equipe.js,
// mas fechamento.js e custos.js entram na conta da folha).
for (const f of ['render.js','custos.js','ui.js','vendas-extra.js','dash-v2.js','fechamento.js'])
  vm.runInContext(fs.readFileSync(path.join(ROOT,'js',f),'utf8'), ctx, {filename:f});
vm.runInContext(`
  function escapeHtml(s){ return String(s==null?'':s); }
  function money(v){ return brl(v); }
  function podeVerValor(){ return true; } function podeVerMargem(){ return true; }
  function podeVerDinheiro(){ return true; } function papelAtual(){ return 'socio'; }
  function getPendentes(){ return []; }
`, ctx);

// Um mes minimo: Vitinho (atendente) vendeu 3 aparelhos; Mel (VO) vendeu 2.
const prods = n => Array.from({length:n}, (_,i) => (
  { apple_id:'A'+i, imei_1:'35'+i, titulo:'iPhone', preco:4000, valor_estoque:3000 }));
const mkVenda = (id, vendedor, n, mes) => ({
  id, status:'completed', data_saida: mes+'-12T15:00:00Z',
  valor_total: n*4000, lucro: n*1000, observacoes:'',
  vendedor_obs: vendedor, atendente_obs:'anne',
  cliente:{nome:'C'+id}, _produtos: prods(n),
});
function rodar(mes){
  ctx.__fx = { vendas:[ mkVenda(1,'vitinho',3,mes), mkVenda(2,'mel',2,mes) ] };
  vm.runInContext(`allVendas=__fx.vendas; allMovs=[]; ajustesAcessorios=[]; _custosCache=[];
                   currentPeriod='${mes}'; currentStore='ambas';`, ctx);
  const fech = R('fechamentoEquipe()');
  const lA   = R('calc().lAcess');
  const tela = {};
  R('FUNC').forEach(f => { ctx.__f = f; ctx.__lA = lA;
    tela[f.id] = R('calcComissaoFunc(__f, allVendas, allMovs, __lA)'); });
  const folha = Object.fromEntries(fech.pessoas.map(p => [p.id, p]));
  return { tela, folha };
}

const ago = rodar('2026-08');
eq('ago: a folha paga os 3 aparelhos do Vitinho a R$25', ago.folha.vitinho?.commVo, 75);
eq('ago: a tela diz o mesmo',                            ago.tela.vitinho?.commVo,  75);
eq('ago: o VO continua na curva (2 un x R$25)',          ago.folha.mel?.commVo,     50);

const jul = rodar('2026-07');
eq('jul: nao paga pra tras — a folha exportada disse R$0', jul.folha.vitinho?.commVo, 0);
eq('jul: e a tela concorda com ela',                       jul.tela.vitinho?.commVo,  0);
eq('jul: o VO nao muda',                                   jul.folha.mel?.commVo,     50);

// O detalhe por venda tem que somar o agregado — e o que faz a planilha valer
// como prova. Era aqui que a divergencia aparecia: coluna cheia, total zerado.
const linhas = ago.folha.vitinho?.linhasVo || [];
eq('ago: a soma da coluna bate com o total',
  linhas.reduce((a,l) => a + l.comissao, 0), ago.folha.vitinho?.commVo);

// O card "Vendedores" do dashboard tem que mostrar quem vendeu aparelho, e não
// só os vendedores online. Em ago/2026 os 3 aparelhos do Vitinho não caíam em
// linha nenhuma: fora do ranking (que listava só VO) e fora de "Loja (casa)"
// (que é pra quem não é da equipe). O card somava 370 num mês de 373.
const htmlAgo = R('renderDashV2()');
const linhaVit = /d2-rank-name">Vitinho<\/div>[\s\S]{0,200}?d2-rank-res">([^<]*)/.exec(htmlAgo);
eq('ago: o atendente que vendeu aparece no ranking com as 3 un',
  linhaVit && linhaVit[1].trim(), '3 un');

// E some quando não vendeu — atendente zerado ali é ruído, o lugar dele é o
// card ao lado.
ctx.__fx = { vendas:[ mkVenda(2,'mel',2,'2026-08') ] };
vm.runInContext(`allVendas=__fx.vendas; currentPeriod='2026-08';`, ctx);
const semVit = R('renderDashV2()');
const posVit = semVit.indexOf('d2-rank-name">Vitinho');
const posAcess = semVit.indexOf('Atendentes');
eq('atendente que não vendeu aparelho não vira linha no card de vendedores',
  posVit === -1 || posVit > posAcess, true);

console.log(falhas ? `\n### ${falhas} falha(s)` : '\n### tudo verde');
process.exit(falhas ? 1 : 0);
