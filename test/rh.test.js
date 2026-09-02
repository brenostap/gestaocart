// ===========================================================================
// Papel `rh` — roda com:  node test/rh.test.js
//
// O QUE ESTE TESTE PROTEGE: **o RH não vê número da loja.** A Nara é de uma
// empresa terceirizada; o pedido do dono foi *"não quero que ela veja números
// da loja como lucro e tudo mais. Somente as partes dos funcionários"*.
//
// ⚠️ ISTO AQUI É A CORTINA. A fechadura é o RLS (`eh_rh()`), nas migrations
// 20260902b_papel_rh.sql e 20260902c_cadastro_colaborador.sql: ela só alcança
// `folha_mensal`, `funcionarios_config` e `custos` COM `area='funcionario'`.
// Teste de front não prova segurança — mas pega o dia em que alguém puser `rh`
// na lista errada aqui.
//
// ⚠️ O erro que este teste existe pra impedir é específico e tentador: dar a
// aba **Equipe** pra ela, "porque já mostra a folha". Aquela tela CALCULA a
// folha no navegador e por isso precisa de todas as vendas e do `valor_estoque`
// — o custo do aparelho. A tela esconderia; a API não.
// ===========================================================================
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');

let falhas = 0;
const ok  = m => console.log('  ok     ' + m);
const bad = m => { falhas++; console.log('  FALHOU ' + m); };
const eq  = (m, a, b) => JSON.stringify(a) === JSON.stringify(b)
  ? ok(m) : bad(`${m} — esperava ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`);

const ctx = {
  console,
  window: { supabase: { createClient: () => ({ auth: {} }) }, matchMedia: () => ({matches:false}) },
  document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => ({ style:{}, addEventListener(){}, remove(){} }),
    documentElement: { getAttribute: () => null, setAttribute(){} },
    body: { appendChild(){}, insertAdjacentHTML(){} } },
  localStorage: { getItem: () => null, setItem(){} },
  fetch: () => Promise.reject(new Error('sem rede')),
  alert: () => {},
  Date, Math, JSON, Set, Map, Object, Array, String, Number, parseFloat, parseInt,
  isNaN, RegExp, Error, Promise, setTimeout,
};
ctx.globalThis = ctx; vm.createContext(ctx);
for (const f of ['config.js','equipe.js','core.js','render.js','custos.js','estoque.js',
                 'ui.js','bancada.js','rh.js','shell.js'])
  vm.runInContext(fs.readFileSync(path.join(ROOT,'js',f),'utf8'), ctx, {filename:f});
vm.runInContext(`function escapeHtml(s){ return String(s==null?'':s); }`, ctx);

const R = e => vm.runInContext(e, ctx);
const comoRh = expr => { R(`meuPerfil = { papel:'rh', nome:'Nara', ativo:true };`); return R(expr); };

// -- 1. o menu -------------------------------------------------------------
console.log('\no que o papel rh alcança\n');

eq('alcança a Folha e os Colaboradores', comoRh('telasDoUsuario()'), ['rhfolha','rhpessoas']);

// ⚠️ `equipe` é a tentação: ela mostra a folha, mas calculando — e por isso
// arrasta venda e custo de aparelho junto.
eq('NÃO alcança equipe, dash, vendas, custos, estoque, compras, contas',
   ['equipe','dash','vendas','custos','estoque','compras','contas','movs','fechamento','diario',
    'bancada','tabela','vitrine','meudia','consulta']
     .map(s => comoRh(`podeVer('${s}')`)),
   new Array(15).fill(false));

console.log('\ndinheiro\n');
eq('rh NÃO vê margem (custo, lucro)',        comoRh('podeVerMargem()'),       false);
eq('rh NÃO vê valor de venda',               comoRh('podeVerValor()'),        false);
eq('rh NÃO vê custo de serviço',             comoRh('podeVerCustoServico()'), false);
eq('e money() fica mudo pra ela',            comoRh('money(2782)'),           '—');
eq('rh está na lista de papéis COM RLS',     R("PAPEIS_COM_RLS.includes('rh')"), true);

// -- 2. os dados de teste --------------------------------------------------
const FOLHA = [
  { mes:'2026-08', func_id:'leo',  nome:'Leo',  aparelhos:0, vendas_vendidas:0, vendas_atendidas:74,
    acess_qtd:199, acess_bruto:'13695', acess_lucro:'10730.87',
    comissao_vendedor:'0', comissao_atendente:'2683',
    bonus_meta:'1000', bonus_coletivo:'400', bonus_extra:'0', total_variavel:'4083' },
  { mes:'2026-08', func_id:'anne', nome:'Anne', aparelhos:0, vendas_vendidas:2, vendas_atendidas:84,
    acess_qtd:209, acess_bruto:'9590', acess_lucro:'7333.07',
    comissao_vendedor:'0', comissao_atendente:'1833',
    bonus_meta:'300', bonus_coletivo:'400', bonus_extra:'1342', total_variavel:'3875' },
  { mes:'2026-07', func_id:'leo',  nome:'Leo',  aparelhos:0, vendas_vendidas:0, vendas_atendidas:60,
    acess_qtd:150, acess_bruto:'11000', acess_lucro:'8544',
    comissao_vendedor:'0', comissao_atendente:'2136',
    bonus_meta:'1000', bonus_coletivo:'400', bonus_extra:'0', total_variavel:'3536' },
];
const CUSTOS = [
  { data:'2026-08-01', area:'funcionario', descricao:'Salário Leo',  valor:2250, funcionario:'leo'  },
  { data:'2026-08-15', area:'funcionario', descricao:'Horas extras (Leo)', valor:360, funcionario:'leo' },
  { data:'2026-08-01', area:'funcionario', descricao:'Salário Anne', valor:2250, funcionario:'anne' },
  { data:'2026-08-31', area:'funcionario', descricao:'Bonus meta coletiva',      valor:800,  funcionario:null },
  { data:'2026-08-31', area:'funcionario', descricao:'Bonus meta individual',    valor:1300, funcionario:null },
  { data:'2026-08-31', area:'funcionario', descricao:'Bonus 5% acessorios Anne', valor:1342, funcionario:null },
];
const CAD = [
  { id:'leo',  nome_completo:'Leo Novais', cargo:'Atendente', status:'ativo',
    pix:'11959372096', data_inicio:'2025-03-10', cpf:'', telefone:'11999990000' },
  { id:'anne', nome_completo:'Alauany Ramos de Campos', cargo:'Gerente de Acessórios',
    status:'ativo', pix:'(11) 95143-9933', data_inicio:'2024-01-05' },
];
const semear = () => R(`meuPerfil = { papel:'rh', nome:'Nara', ativo:true };
   rhFolha = ${JSON.stringify(FOLHA)}; rhSalarios = ${JSON.stringify(CUSTOS)};
   rhCad = {}; ${JSON.stringify(CAD)}.forEach(c => rhCad[c.id] = c);
   rhCarregado = true; rhErro=''; rhMes = null; rhAberto = null;
   rhFichaAba='pagamento'; rhEditando=false;`);
semear();

// -- 3. a tela da folha ----------------------------------------------------
console.log('\na tela da folha\n');
const html = R('renderRhFolha()');

if (/ago\/2026/.test(html)) ok('abre no mês mais recente');
else bad('não abriu no mês mais recente');
if (html.includes('4.083') && html.includes('3.875')) ok('mostra o variável de cada pessoa');
else bad('não mostrou o variável');
// ⚠️ 2.250 + 360 de hora extra: o fixo NÃO é só o salário.
if (html.includes('2.610')) ok('o fixo soma salário + hora extra');
else bad('o fixo não somou a hora extra');
if (html.includes('6.693')) ok('total por pessoa fecha (Leo 2.610 + 4.083)');
else bad('o total por pessoa não fecha');
if (/jul\/2026/.test(html)) ok('oferece os outros meses fechados');
else bad('não dá pra trocar de mês');

// ⚠️ O BUG QUE ESTE BLOCO EXISTE PRA IMPEDIR, e ele custava dinheiro de
// verdade: os bônus são lançados em Custos como UMA linha sem pessoa E estão
// distribuídos dentro de `total_variavel`. A primeira versão da tela mostrava
// os dois lado a lado como se fossem verbas diferentes -- somar pagaria o bônus
// DUAS VEZES (R$6.542 a mais em ago/2026). Agora a tela concilia e prova.
console.log('\nos bônus agregados não podem virar dinheiro a mais\n');
const KPI_TOTAL = 2610 + 2250 + 4083 + 3875;   // 12.818
if (html.includes(KPI_TOTAL.toLocaleString('pt-BR')))
  ok('o total da folha é fixo + variável, sem somar os agregados de novo');
else bad('o total da folha não bate com fixo + variável');
if (/mesma verba/i.test(html)) ok('a tela diz que a verba é a mesma, não uma segunda');
else bad('a tela não avisa que os agregados já estão nos totais');

const ags = R("rhAgregadosDoMes('2026-08')");
eq('coletiva: 800 em Custos = 400+400 na folha',
   ags.find(a => /coletiv/i.test(a.descricao)).bate, true);
eq('individual: 1.300 em Custos ≠ 1.000+300 na folha? não — bate',
   ags.find(a => /individual/i.test(a.descricao)).bate, true);
eq('5%: 1.342 em Custos = o bonus_extra da Anne',
   ags.find(a => /5%/.test(a.descricao)).bate, true);

// Divergência tem que APARECER, não ser escondida.
R(`rhSalarios = rhSalarios.map(c =>
     /coletiva/.test(c.descricao||'') ? {...c, valor: 999} : c);`);
const htmlRuim = R('renderRhFolha()');
if (/confira|diferen/i.test(htmlRuim)) ok('quando Custos e folha divergem, a tela acusa');
else bad('divergência entre Custos e folha passou calada');
semear();

// -- 4. a tela de colaboradores -------------------------------------------
console.log('\na tela de colaboradores\n');
const hp = R('renderRhPessoas()');
if (/Ativos/.test(hp)) ok('separa por situação (ativo / férias / desligado)');
else bad('não agrupou por situação');
if (/hist[óo]rico/i.test(hp)) ok('mantém o histórico de quem saiu — o RH pediu isso explicitamente');
else bad('não há seção de histórico de desligados');
if (/em branco|campo/i.test(hp)) ok('mostra onde o cadastro está incompleto');
else bad('não indica campo faltando');

// ⚠️ Sócio não é colaborador da Nara: não entra na folha e não tem cadastro
// trabalhista aqui.
eq('sócios ficam fora da lista', R("rhPessoas().filter(p=>['gustavo','marcella'].includes(p.id)).length"), 0);

// Os 16 campos que a Nara pediu têm que existir no formulário -- se alguém
// apagar um da lista, a ficha para de cobrar e o cadastro fica incompleto calado.
console.log('\nos campos que o RH pediu\n');
const PEDIDOS = ['nome_completo','naturalidade','nacionalidade','cpf','rg','cargo','departamento',
  'data_inicio','desligamento','nascimento','telefone','email','endereco','sexo','estado_civil','status'];
const noForm = R('RH_CAMPOS_FORM');
const faltando = PEDIDOS.filter(k => !noForm.includes(k));
eq('todo campo pedido pelo RH está no formulário', faltando, []);
eq('e o contato de emergência também', ['emerg_nome','emerg_telefone'].filter(k=>!noForm.includes(k)), []);

// -- 5. a ficha ------------------------------------------------------------
console.log('\na ficha da pessoa\n');
R(`rhAberto='leo'; rhFichaAba='pagamento';`);
const fp = R('renderRhFolha()');
if (fp.includes('Leo Novais')) ok('abre a ficha com o nome do cadastro, não o apelido');
else bad('a ficha não usou o nome completo do cadastro');
if (fp.includes('2.250') && fp.includes('360')) ok('o fixo aparece lançamento a lançamento');
else bad('o fixo veio como um valor só — a hora extra sumiu');
if (/Hora extra/.test(fp)) ok('e cada lançamento diz de que tipo é');
else bad('não classificou o lançamento');
if (fp.includes('6.693')) ok('o total a pagar fecha');
else bad('o total a pagar não fecha');
if (fp.includes('11959372096')) ok('mostra o Pix, que é o que ela usa pra pagar');
else bad('não mostrou o Pix');
// ⚠️ Comissão sem a regra ao lado vira desconfiança -- é a mesma razão de
// existir o podeVerBaseComissao() no painel do colaborador.
if (/25%/.test(fp)) ok('cada linha do variável vem com a regra que a gerou');
else bad('o variável não explica como foi calculado');

R(`rhFichaAba='producao';`);
const fpr = R('renderRhFolha()');
if (fpr.includes('199')) ok('produção mostra os acessórios vendidos');
else bad('produção não mostrou os itens');
if (/faixa|meta/i.test(fpr)) ok('e a escada de meta do mês');
else bad('não mostrou a meta');

R(`rhFichaAba='cadastro';`);
const fc = R('renderRhFolha()');
['CPF','RG','Nacionalidade','Naturalidade','Estado civil','Endereço','emerg','Nascimento']
  .forEach(() => {});
if (/CPF/.test(fc) && /Naturalidade/.test(fc) && /Estado civil/.test(fc) && /emerg/i.test(fc))
  ok('o cadastro mostra os campos que o RH pediu');
else bad('faltou campo do RH na ficha');
if (/em branco/.test(fc)) ok('campo vazio aparece como "em branco", não some');
else bad('campo vazio sumiu da ficha');

R(`rhFichaAba='historico';`);
const fh = R('renderRhFolha()');
if (fh.includes('jul/2026') && fh.includes('ago/2026')) ok('histórico traz mês a mês');
else bad('o histórico não listou os meses');

// -- 6. férias -------------------------------------------------------------
// ⚠️ Conta de calendário derivada da ADMISSÃO. Sem admissão a tela tem que
// DIZER que não sabe -- inventar uma data de vencimento de férias é pior que
// não ter a tela.
console.log('\ncontrole de férias\n');
eq('sem data de admissão, não inventa',            R("rhFeriasDe('', '2026-09-02')"), null);
eq('admissão inválida também não inventa',         R("rhFeriasDe('ontem', '2026-09-02')"), null);
const f1 = R("rhFeriasDe('2025-03-10','2026-09-02')");
eq('1 período aquisitivo completo',                f1.periodos, 1);
eq('direito adquirido em 10/03/2026',              f1.aquisitivo, '2026-03-10');
eq('e vence em 10/03/2027',                        f1.vence, '2027-03-10');
eq('ainda não venceu',                             f1.vencido, false);
const f2 = R("rhFeriasDe('2024-01-05','2026-09-02')");
eq('2 períodos completos',                         f2.periodos, 2);
eq('o mais recente vence em 05/01/2027',           f2.vence, '2027-01-05');
const f3 = R("rhFeriasDe('2026-06-01','2026-09-02')");
eq('menos de um ano: ainda no primeiro período',   f3.completou, false);
// ⚠️ O PERÍODO QUE VENCE É O ANTIGO, NUNCA O MAIS NOVO. A primeira versão
// comparava hoje com o vencimento do período mais recente -- que por construção
// está sempre no futuro, então `vencido` nunca podia ser true e o "controle de
// vencimento" que o RH pediu não controlava nada. Com 2 períodos completos e
// nenhum gozo registrado, o primeiro JÁ passou do prazo.
eq('2 períodos completos e nenhum gozo: 1 já venceu', f2.vencidos, 1);
eq('e isso é marcado como vencido',                   f2.vencido,  true);
eq('1 gozo registrado abate o vencido',
   R("rhFeriasDe('2024-01-05','2026-09-02',1)").vencidos, 0);
eq('1 período só nunca está vencido',                 f1.vencidos, 0);
// O painel só enxerga férias que viraram lançamento no Custos -- é um piso.
eq('gozo vem do lançamento de férias na folha',
   R("rhSalarios=rhSalarios.concat([{data:'2026-07-05',area:'funcionario',descricao:'Salário Leo (férias)',valor:2250,funcionario:'leo'}]); rhFeriasRegistradas('leo')"),
   ['2026-07']);

// -- 7. cadastro x sistema -------------------------------------------------
// ⚠️ DOIS registros de desligamento (status aqui, saiuEm/"(saiu)" no FUNC) e
// eles podem discordar. Escolher um calado esconde ou folha paga a mais, ou
// pessoa sumida do histórico. A tela ACUSA.
console.log('\ncadastro e sistema podem discordar — e a tela tem que dizer\n');
semear();
R(`rhCad['leo'] = {...rhCad['leo'], status:'desligado', desligamento:'2026-08-31'};`);
const div = R('rhDivergencias()');
if (div.some(d => d.id === 'leo')) ok('desligado no cadastro mas ainda na folha: acusado');
else bad('divergência de desligamento passou calada');
if (/discordam/i.test(R('renderRhPessoas()'))) ok('e o aviso aparece na tela');
else bad('o aviso não chegou na tela');
semear();

// ⚠️ MESMA ARMADILHA, OUTRO CAMPO: o cargo vive no cadastro (que o RH edita) E
// no FUNC (que o fechamento exportado imprime no cabeçalho do colaborador).
// Divergir manda a Nara ver "Gerente" e o documento dizer "Atendente".
R(`rhCad['anne'] = {...rhCad['anne'], cargo:'Gerente de Acessórios'};`);
if (R('rhDivergencias()').some(d => /cargo/i.test(d.texto)))
  ok('cargo diferente entre cadastro e sistema também é acusado');
else bad('divergência de cargo passou calada');
R(`rhCad['anne'] = {...rhCad['anne'], cargo:'Atendente'};`);
eq('cargo igual não vira alarme falso',
   R('rhDivergencias()').filter(d => /cargo/i.test(d.texto)).length, 0);
semear();

// -- 8. o roteador ---------------------------------------------------------
// ⚠️ CHAMAR renderContent(), NAO SO renderRhFolha(). O roteamento de abas em
// render.js e uma cadeia if/else if que termina em renderSemAcesso(); uma aba
// nova entrando com `if` solto monta a tela certa e depois e SOBRESCRITA pelo
// else final. Foi exatamente o que aconteceu em 02/set/2026 -- a aba aparecia
// na barra, a tela era montada, e o dono via "Atualize o app". renderRhFolha()
// sozinho passava verde. E a mesma licao do test/registro-venda.test.js.
console.log('\nas duas abas chegam na tela pelo roteador de verdade\n');
for (const [aba, marca] of [['rhfolha','Folha —'], ['rhpessoas','Colaboradores']]) {
  R(`currentTab = '${aba}'; rhAberto = null;
     document.getElementById = function(id){
       return id === 'content' ? { set innerHTML(v){ globalThis.__html = v; },
                                   get innerHTML(){ return globalThis.__html || ''; } } : null; };
     document.querySelectorAll = function(){ return []; };
     __html = '';`);
  try { R('renderContent()'); } catch(e){ /* partes da tela pedem DOM que nao existe */ }
  const escrito = R('__html || ""');
  if (escrito.includes(marca)) ok(`renderContent() entrega a tela de ${aba}`);
  else bad(`renderContent() NAO entregou ${aba} — veio: ` + escrito.slice(0,80));
  if (!/Atualize o app/.test(escrito)) ok(`...e ${aba} não cai no "Atualize o app"`);
  else bad(`${aba} foi sobrescrita pelo renderSemAcesso() — o \`else if\` da cadeia quebrou`);
}

console.log('\nnada de número da loja na tela\n');
semear();
// A tela nunca recebe venda, então não há o que vazar — mas se alguém um dia
// puxar `calc()` aqui dentro, estes termos aparecem. É o canário.
const proibido = ['Lucro líquido','Margem','Custo do aparelho','valor_estoque','Faturamento'];
const achados = proibido.filter(t => R('renderRhFolha()').includes(t));
eq('nenhum termo de resultado da loja no HTML', achados, []);

// -- 9. o que ela pode escrever -------------------------------------------
console.log('\nescrita: só o cadastro\n');
const src = fs.readFileSync(path.join(ROOT,'js','rh.js'),'utf8');
// ⚠️ A regra mudou em 02/set/2026: o papel deixou de ser só-leitura pra poder
// preencher o cadastro. Mas a escrita é EM UMA TABELA SÓ -- e é isso que este
// teste guarda. Qualquer POST/PATCH em outra tabela é bug de permissão.
const escritas = [...src.matchAll(/rest\/v1\/([a-z_]+)/g)].map(m => m[1]);
eq('escreve só em funcionarios_config', [...new Set(escritas)], ['funcionarios_config']);
if (!/method:\s*'DELETE'/i.test(src))
  ok('não apaga nada — desligar é mudar o status, e a linha fica');
else bad('js/rh.js tem DELETE: apagar destrói o histórico que a tabela existe pra guardar');

// ⚠️ A regra é sobre o que ela BUSCA, não sobre a palavra. O rótulo da coluna
// diz "vendas" (a comissão de vendas) e isso é texto de tela, não acesso a dado.
// A primeira versão deste teste proibia a palavra e acusou o rótulo.
const buscas = [...src.matchAll(/sbGet\(\s*'([^']+)'/g)].map(m => m[1]).sort();
eq('busca SÓ folha_mensal, custos e funcionarios_config',
   [...new Set(buscas)], ['custos','folha_mensal','funcionarios_config']);
const proibidas = ['vendas','venda_produtos','estoque','pagamentos','compras','contas'];
eq('não busca venda, produto, estoque, pagamento nem compra',
   buscas.filter(t => proibidas.includes(t)), []);

console.log(falhas ? `\n### ${falhas} falha(s)` : '\n### tudo verde');
process.exit(falhas ? 1 : 0);
