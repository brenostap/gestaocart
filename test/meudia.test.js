// ===========================================================================
// Teste do "Meu dia" — roda com:  node test/meudia.test.js
//
// O que este teste protege, em ordem de importância:
//
// 1. **A tela existe pela CHAVE, não pelo papel.** O Vitinho é `bancada` e
//    atende no balcão: se `podeVer('meudia')` voltar a olhar só o
//    MATRIZ_ACESSO, ele perde a tela e ninguém percebe — foi exatamente assim
//    que em 13/ago ele abriu o celular e só tinha "Estoque".
// 2. **Sócio não ganha a tela.** Ele não tem chave e não é comissionado.
// 3. **A tela monta.** Ela é montada por dado de VIEW, num formato que o resto
//    do painel não usa; um campo renomeado no banco derruba ela inteira.
// 4. **A base da comissão só aparece pra quem tem chave de atendente.**
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
                 'ui.js','bancada.js','meudia.js','shell.js'])
  vm.runInContext(fs.readFileSync(path.join(ROOT,'js',f),'utf8'), ctx, {filename:f});

let falhas = 0;
const ok  = m => console.log('  ok     ' + m);
const bad = m => { falhas++; console.log('  FALHOU ' + m); };
const run = js => vm.runInContext(js, ctx);

function comPerfil(perfil, fn){
  run(`meuPerfil = ${JSON.stringify(perfil)}; papelPreview='';`);
  return fn();
}

// -- 1. a tela vem da chave, não do papel ---------------------------------
console.log('quem alcança a tela');

comPerfil({papel:'bancada', nome:'Vitor Lima', at_key:'vitinho', ativo:true}, () => {
  run(`usuarioEmail='vitorgsc31@gmail.com';`);
  if (run(`podeVer('meudia')`)) ok('Vitinho (bancada + at_key) alcança Meu dia');
  else bad('Vitinho perdeu a tela — podeVer voltou a olhar só o papel');
  if (run(`podeVer('estoque') && podeVer('bancada')`)) ok('Vitinho mantém Estoque e Assistência');
  else bad('Vitinho perdeu Estoque/Assistência');
  const { fixas, mais } = run(`navMobile()`);
  const alcancaveis = [...fixas, ...mais];
  if (alcancaveis.includes('meudia')) ok('Meu dia alcançável na barra do celular');
  else bad('Meu dia sumiu no celular — que é onde ele usa');
});

comPerfil({papel:'bancada', nome:'Alguém', ativo:true}, () => {
  if (!run(`podeVer('meudia')`)) ok('bancada SEM chave não vê Meu dia');
  else bad('bancada sem chave ganhou uma tela vazia');
});

comPerfil({papel:'socio', nome:'Breno', ativo:true}, () => {
  run(`usuarioEmail='breno@phonestp.com';`);
  if (!run(`podeVer('meudia')`)) ok('sócio não vê Meu dia (não é comissionado)');
  else bad('sócio ganhou a tela de comissão');
  if (run(`podeVer('custos') && podeVerMargem()`)) ok('sócio segue com tudo');
  else bad('sócio perdeu acesso');
});

comPerfil({papel:'comercial', nome:'Maria', vo_key:'maria', at_key:'maria', ativo:true}, () => {
  const telas = run(`telasDoUsuario()`);
  if (telas.includes('meudia')) ok('Maria (comercial, vende e atende) alcança Meu dia');
  else bad('Maria não alcança a tela');
  if (run(`podeVerValor()`) && !run(`podeVerMargem()`))
    ok('comercial vê valor da venda e NÃO vê margem');
  else bad('comercial com o interruptor de dinheiro errado');
  if (!run(`podeVer('custos') || podeVer('equipe') || podeVer('dash')`))
    ok('comercial não alcança Custos, Equipe nem Dashboard');
  else bad('comercial alcançou tela que não é dele');
});

// -- 2. a tela monta com dado de view -------------------------------------
console.log('a tela monta');

const RESUMO = { mes:'2026-08', vendas_vendidas:0, aparelhos_vendidos:0, vendas_atendidas:54,
                 vendas_com_acessorio:48, acess_qtd:90, acess_bruto:'2300.00', acess_lucro:'1496.34' };
const VENDAS = [
  { id:1, loja:'cart',  data_saida:'2026-08-15T18:24:37+00:00', cliente_nome:'Fulano',
    valor_total:'1950.00', fui_vendedor:false, fui_atendente:true },
  { id:2, loja:'urban', data_saida:'2026-08-14T17:41:59+00:00', cliente_nome:null,
    valor_total:'7395.50', fui_vendedor:true,  fui_atendente:true },
];

comPerfil({papel:'bancada', nome:'Vitor Lima', at_key:'vitinho', ativo:true}, () => {
  run(`mdResumo = ${JSON.stringify(RESUMO)}; mdVendas = ${JSON.stringify(VENDAS)};
       mdCarregado = true; mdErro = '';`);
  let html = '';
  try { html = run(`renderMeuDia()`); ok('renderMeuDia() não estoura'); }
  catch(e){ bad('renderMeuDia() estourou: ' + e.message); return; }

  // 25% de 1.496,34 = 374,08 -> brl arredonda pra 374
  if (html.includes('R$374')) ok('comissão de acessório sai 25% do lucro (R$374)');
  else bad('comissão de acessório errada — esperava R$374 no HTML');

  // attach rate: 48 de 54 = 89%
  if (html.includes('89%')) ok('attach rate 48/54 = 89%');
  else bad('attach rate errado');

  if (html.includes('Como chega nesse valor')) ok('a base da conta aparece pra quem tem at_key');
  else bad('a base da conta sumiu — comissão que não se confere vira desconfiança');

  if (!/valor_estoque|custo_total/.test(html)) ok('nenhum campo de custo vaza no HTML');
  else bad('campo de custo apareceu na tela do colaborador');

  if (html.includes('Fulano')) ok('a lista de vendas monta');
  else bad('a lista de vendas não montou');

  // O herói de comissão saiu a pedido do dono (17/ago): repetia o que os cards
  // de baixo já dizem. Cada parcela mora onde ela nasce.
  if (!html.includes('md-heroi')) ok('sem o card-herói de comissão');
  else bad('o herói de comissão continua na tela');
});

// -- 3b. vendas agrupadas por dia (17/ago/2026) -----------------------------
// Lista corrida não responde "como foi terça?". O total do dia é o número que
// a pessoa compara com a memória dela.
console.log('vendas por dia');

const VENDAS_DIAS = [
  { id:1, loja:'cart',  data_saida:'2026-08-15T18:00:00+00:00', cliente_nome:'Ana',
    valor_total:'1000.00', aparelhos:1, acess_bruto:'0.00',   fui_vendedor:true, fui_atendente:false },
  { id:2, loja:'urban', data_saida:'2026-08-15T20:00:00+00:00', cliente_nome:'Bruno',
    valor_total:'2000.00', aparelhos:2, acess_bruto:'0.00',   fui_vendedor:true, fui_atendente:false },
  { id:3, loja:'cart',  data_saida:'2026-08-14T15:00:00+00:00', cliente_nome:'Carla',
    valor_total:'500.00',  aparelhos:1, acess_bruto:'120.00', fui_vendedor:true, fui_atendente:false },
];

comPerfil({papel:'comercial', nome:'David', vo_key:'david', ativo:true}, () => {
  run(`mdResumo = null; mdRede = null; mdFolha = []; mdCarregado = true; mdErro='';
       mdVendas = ${JSON.stringify(VENDAS_DIAS)};
       mdFiltroLoja='todas'; mdFiltroDia='todos';`);
  const html = run(`renderMeuDia()`);

  // O total do dia é a COMISSÃO, não o valor vendido (pedido do dono, 20/ago):
  // um iPhone de R$7 mil no nome da pessoa não é dinheiro dela. 15/08 = 3
  // aparelhos x R$25 = R$75; 14/08 = 1 x R$25 = R$25.
  if (html.includes('R$75') && html.includes('R$25'))
    ok('o total do dia é a comissão do dia (15/08 R$75 · 14/08 R$25)');
  else bad('totais por dia errados — deviam ser comissão');
  if (!html.includes('R$3.000'))
    ok('e o valor vendido saiu do lugar do dinheiro da pessoa');
  else bad('a lista ainda soma o valor da venda como se fosse dela');
  if (html.includes('3 vendas') || html.includes('2 vendas'))
    ok('o resumo do dia diz quantas vendas');
  else bad('resumo do dia sem contagem');
  if (/s[áa]b, 15\/08/.test(html)) ok('o dia traz o dia da semana');
  else bad('rótulo do dia sem dia da semana');

  run(`setMdLoja('urban');`);
  if (run(`mdVendasFiltradas().length`) === 1) ok('filtro por loja funciona');
  else bad('filtro por loja errado');

  run(`setMdLoja('todas'); setMdDia('2026-08-14');`);
  const so14 = run(`mdVendasFiltradas()`);
  if (so14.length === 1 && so14[0].cliente_nome === 'Carla') ok('filtro por dia funciona');
  else bad('filtro por dia errado');

  // Só o dia 14 na tela: a comissão dele é R$25 e a do dia 15 (R$75) some junto.
  const soUmDia = run(`renderMeuDia()`);
  if (/R\$25/.test(soUmDia) && !/R\$75/.test(soUmDia)) ok('a lista acompanha o filtro');
  else bad('o filtro não recortou os dias');
  // ⚠️ O resumo continua sendo do DIA INTEIRO (a parte de acessório vem da
  // view, não das linhas) — e o card avisa isso em vez de somar meio dia.
  if (/o total de cada dia continua sendo o do dia inteiro/.test(soUmDia))
    ok('e o card avisa que o resumo do dia não é filtrado');
  else bad('filtro ligado sem aviso — dois números falando de conjuntos diferentes');

  run(`setMdLoja('urban');`);
  if (/Nenhuma venda com esse filtro/.test(run(`renderMeuDia()`)))
    ok('filtro sem resultado diz que é o filtro, não que não há venda');
  else bad('filtro vazio confuso');

  run(`mdFiltroLoja='todas'; mdFiltroDia='todos';`);
});

// -- 3c. o dinheiro da pessoa, por dia (20/ago/2026) ------------------------
// A comissão do atendente é 25% do LUCRO de acessório — que não desce por
// venda de propósito (seria custo por item). Ela fecha no RESUMO DO DIA, com
// o número vindo da view v_minha_comissao_dia.
console.log('comissão por dia');

const DIAS_AT = [
  { dia:'2026-08-15', vendas_vendidas:0, aparelhos_vendidos:0, vendas_atendidas:2,
    vendas_com_acessorio:2, acess_qtd:3, acess_bruto:'400.00', acess_lucro:'280.00' },
  { dia:'2026-08-14', vendas_vendidas:0, aparelhos_vendidos:0, vendas_atendidas:1,
    vendas_com_acessorio:0, acess_qtd:0, acess_bruto:'0.00', acess_lucro:'0.00' },
];
const VENDAS_AT = [
  { id:1, loja:'cart',  data_saida:'2026-08-15T18:00:00+00:00', cliente_nome:'Ana',
    valor_total:'7395.00', aparelhos:1, acess_bruto:'250.00', fui_vendedor:false, fui_atendente:true },
  { id:2, loja:'cart',  data_saida:'2026-08-15T20:00:00+00:00', cliente_nome:'Bruno',
    valor_total:'2100.00', aparelhos:1, acess_bruto:'150.00', fui_vendedor:false, fui_atendente:true },
  { id:3, loja:'urban', data_saida:'2026-08-14T15:00:00+00:00', cliente_nome:'Carla',
    valor_total:'3200.00', aparelhos:1, acess_bruto:'0.00',   fui_vendedor:false, fui_atendente:true },
];

comPerfil({papel:'comercial', nome:'Anne', at_key:'anne', ativo:true}, () => {
  run(`mdResumo = null; mdRede = null; mdFolha = []; mdCarregado = true; mdErro='';
       mdVendas = ${JSON.stringify(VENDAS_AT)}; mdDias = ${JSON.stringify(DIAS_AT)};
       mdFiltroLoja='todas'; mdFiltroDia='todos';`);
  const html = run(`renderMeuDia()`);

  // 25% de 280 = 70 no dia 15; o dia 14 não teve acessório -> R$0
  if (html.includes('R$70')) ok('o total do dia é 25% do lucro de acessório do dia (R$70)');
  else bad('comissão do dia do atendente errada');

  // O valor da VENDA não pode ocupar o lugar do dinheiro da pessoa: R$7.395 é
  // o iPhone que ela atendeu, não o que ela ganhou.
  if (!html.includes('R$7.395')) ok('o valor do aparelho não aparece como número dela');
  else bad('o valor da venda voltou pro lugar da comissão');

  // Na linha, o atendente vê o que VENDEU de acessório (preço, não custo),
  // rotulado — senão seria lido como comissão.
  if (html.includes('R$250') && html.includes('acess.'))
    ok('a linha mostra o acessório vendido, com rótulo');
  else bad('a linha do atendente não mostra o acessório');

  // Venda sem acessório não some nem finge valor: é o outro lado do attach.
  if (/md-venda-zero/.test(html)) ok('venda que não rendeu nada aparece como —');
  else bad('venda sem acessório sumiu ou inventou valor');

  const cardVendas = run(`mdCardVendas()`);
  if (!/valor_estoque|custo_total|acess_lucro/.test(cardVendas)) ok('nenhum campo de custo vaza na lista');
  else bad('campo de custo apareceu na lista de vendas');
});

// Dia negativo ainda existe — não mais por brinde (que desde 20/ago não
// desconta), e sim por acessório vendido ABAIXO do custo, que é venda de
// verdade. A tela escreve direito e diz o porquê.
comPerfil({papel:'comercial', nome:'Anne', at_key:'anne', ativo:true}, () => {
  run(`mdResumo = null; mdRede = null; mdFolha = []; mdCarregado = true; mdErro='';
       mdFiltroLoja='todas'; mdFiltroDia='todos';
       mdVendas = [{ id:9, loja:'cart', data_saida:'2026-08-18T16:00:00+00:00',
         cliente_nome:'Bruno', valor_total:'3950.00', aparelhos:1, acess_bruto:'0.00',
         fui_vendedor:false, fui_atendente:true }];
       mdDias = [{ dia:'2026-08-18', vendas_vendidas:0, aparelhos_vendidos:0, vendas_atendidas:1,
         vendas_com_acessorio:0, acess_qtd:0, acess_bruto:'0.00', acess_lucro:'-11.63' }];`);
  const html = run(`mdCardVendas()`);
  if (html.includes('−R$3')) ok('dia negativo sai como −R$3, não "R$-3"');
  else bad('formatação do dia negativo errada');
  if (html.includes('abaixo do custo')) ok('e a tela explica o motivo (venda abaixo do custo)');
  else bad('dia negativo sem explicação — vira desconfiança');
});

// A soma das comissões por venda TEM que fechar com a curva de core.js —
// inclusive cruzando as 80 unidades, onde a taxa vira R$35. É a mesma técnica
// do .xlsx do fechamento: cada venda vale o que ACRESCENTOU no acumulado.
comPerfil({papel:'comercial', nome:'Mel', vo_key:'mel', ativo:true}, () => {
  const vendas = [];
  for (let i = 0; i < 42; i++)                      // 42 vendas de 2 aparelhos = 84 un
    vendas.push({ id:100+i, loja:'cart', data_saida:`2026-08-${String((i%28)+1).padStart(2,'0')}T18:00:00+00:00`,
                  cliente_nome:'C'+i, valor_total:'3000.00', aparelhos:2, acess_bruto:'0.00',
                  fui_vendedor:true, fui_atendente:false });
  run(`mdVendas = ${JSON.stringify(vendas)}; mdDias = []; mdResumo = null; mdRede = null;
       mdFolha = []; mdCarregado = true; mdErro=''; mdFiltroLoja='todas'; mdFiltroDia='todos';`);
  const soma = Object.values(run(`mdComissaoPorVenda()`)).reduce((a,b) => a+b, 0);
  const curva = run(`comissaoVendedor(84)`);
  if (Math.abs(soma - curva) < 0.005) ok('soma das comissões por venda = curva de 84 un (R$'+curva+')');
  else bad('soma por venda divergiu da curva: ' + soma + ' vs ' + curva);
});

// Vendedor puro: sem at_key, não existe bloco de acessório nem base da conta.
comPerfil({papel:'comercial', nome:'David', vo_key:'david', ativo:true}, () => {
  run(`mdResumo = {mes:'2026-08', vendas_vendidas:40, aparelhos_vendidos:42,
        vendas_atendidas:0, vendas_com_acessorio:0, acess_qtd:0, acess_bruto:0, acess_lucro:0};
       mdVendas = []; mdCarregado = true; mdErro='';`);
  let html = '';
  try { html = run(`renderMeuDia()`); ok('renderMeuDia() monta pra vendedor puro'); }
  catch(e){ bad('estourou pro vendedor: ' + e.message); return; }
  if (!html.includes('Como chega nesse valor')) ok('sem at_key, a base da comissão não aparece');
  else bad('vendedor puro viu a base de acessório');
  // 42 aparelhos abaixo do corte de 80 -> 42 x R$25 = R$1.050
  if (html.includes('R$1.050')) ok('comissão de vendedor usa a curva de core.js (42 x R$25)');
  else bad('comissão de vendedor divergiu da curva');
  if (html.includes('Faltam 38 aparelhos')) ok('diz quanto falta pro degrau de 80');
  else bad('não diz quanto falta pro degrau');
});

// -- 3. bônus coletivo entra no herói --------------------------------------
// Sem isso a tela mentia PRA BAIXO: em ago/2026 são ~R$1.000 por pessoa que
// não apareciam. Número de comissão incompleto é pior que número nenhum —
// a pessoa descobre no dia do pagamento.
console.log('meta do time');

// ago/2026: faixas dev 400/450/500 -> 600/800/1000 · acess 30k/40k/50k -> 400/700/1000
const REDE_BATE_UMA = { mes:'2026-08', aparelhos:423, acess_bruto:'37800.00' }; // 400 e 30k

comPerfil({papel:'bancada', nome:'Vitor Lima', at_key:'vitinho', ativo:true}, () => {
  run(`mdResumo = ${JSON.stringify(RESUMO)}; mdVendas = []; mdCarregado = true; mdErro='';
       mdRede = ${JSON.stringify(REDE_BATE_UMA)};`);
  const rede = run(`mdMetaRede()`);
  if (rede.bonus === 1000) ok('bônus coletivo = R$600 (400 aparelhos) + R$400 (30k acess)');
  else bad('bônus coletivo errado: ' + rede.bonus);

  const html = run(`renderMeuDia()`);
  // Sem o herói, o bônus tem que continuar VISÍVEL — no card da meta, que é
  // onde ele nasce. Some daqui e a pessoa perde R$1.000 de vista.
  if (html.includes('Já garantido pra você') && html.includes('R$1.000'))
    ok('o bônus coletivo aparece no card da meta (R$1.000)');
  else bad('o bônus coletivo sumiu da tela junto com o herói');
  if (html.includes('Meta do time')) ok('o card da meta do time aparece');
  else bad('card da meta do time sumiu');
  if (html.includes('Faltam <b>27</b> aparelhos')) ok('diz quanto falta pra próxima faixa (450 − 423)');
  else bad('não diz quanto falta pra próxima faixa da rede');
});

// Quem está fora do rateio no mês não pode ver o bônus somado.
comPerfil({papel:'comercial', nome:'Davi', at_key:'davi', ativo:true}, () => {
  run(`mdResumo = null; mdVendas = []; mdCarregado = true; mdErro='';
       mdRede = ${JSON.stringify(REDE_BATE_UMA)};
       SEM_BONUS_COLETIVO['2026-08'] = ['davi'];`);
  const rede = run(`mdMetaRede()`);
  const mesAgora = run(`mdMesCorrente()`);
  if (mesAgora !== '2026-08') {
    ok('(fora de ago/2026 — caso do rateio não se aplica neste mês)');
  } else if (rede.bonus === 0 && rede.bonusSeEntrasse === 1000) {
    ok('quem está fora do rateio não recebe o bônus somado');
    const html = run(`renderMeuDia()`);
    if (html.includes('fora do rateio')) ok('e a tela diz por quê, em vez de só somar menos');
    else bad('a tela escondeu o motivo de o bônus não entrar');
  } else bad('rateio não respeitado: ' + JSON.stringify(rede));
});

// ⚠️ O caso REAL de 20/ago/2026, e o que o teste acima não pegava: no começo
// do mês NENHUMA faixa caiu ainda (268 de 400 aparelhos, R$24k de R$30k), então
// `bonusSeEntrasse` é 0 — e o aviso, que dependia dele, sumia. Quem está de
// férias lia "faltam 132 aparelhos pro time liberar R$600 pra cada um" como se
// fosse com ela.
const REDE_SEM_FAIXA = { mes:'2026-08', aparelhos:268, acess_bruto:'24020.00' };

comPerfil({papel:'comercial', nome:'Davi', at_key:'davi', ativo:true}, () => {
  run(`mdResumo = null; mdVendas = []; mdCarregado = true; mdErro='';
       mdRede = ${JSON.stringify(REDE_SEM_FAIXA)};
       SEM_BONUS_COLETIVO['2026-08'] = ['davi'];`);
  if (run(`mdMesCorrente()`) !== '2026-08') {
    ok('(fora de ago/2026 — caso do rateio não se aplica neste mês)');
  } else {
    const rede = run(`mdMetaRede()`);
    if (rede.bonus === 0 && rede.bonusSeEntrasse === 0)
      ok('nenhuma faixa batida ainda: não há bônus a somar');
    else bad('faixa batida onde não devia: ' + JSON.stringify(rede));

    const html = run(`renderMeuDia()`);
    if (html.includes('fora do rateio'))
      ok('mesmo sem faixa batida, a tela avisa que a meta do time não é dela');
    else bad('sem faixa batida o aviso sumia — a pessoa lia a meta como promessa');
    if (!/liberar R\$600 pra cada um\./.test(html))
      ok('e não promete "pra cada um" pra quem está fora');
    else bad('a tela promete o bônus pra quem não vai receber');
  }
});

// Quem ESTÁ no rateio continua lendo a promessa cheia — o aviso não pode
// aparecer pra quem não é o caso.
comPerfil({papel:'comercial', nome:'Anne', at_key:'anne', ativo:true}, () => {
  run(`mdResumo = null; mdVendas = []; mdCarregado = true; mdErro='';
       mdRede = ${JSON.stringify(REDE_SEM_FAIXA)};`);
  const html = run(`renderMeuDia()`);
  if (!html.includes('fora do rateio')) ok('quem está no rateio não vê o aviso');
  else bad('aviso de férias apareceu pra quem trabalhou o mês');
  if (/pra cada um\./.test(html)) ok('e continua lendo "pra cada um"');
  else bad('a promessa sumiu de quem tem direito a ela');
});

// A Anne tem 5% do lucro de acessórios DA REDE — lucro de terceiros, que não
// pode ir pro navegador. A tela precisa dizer isso, não fingir que o total fecha.
comPerfil({papel:'comercial', nome:'Anne', at_key:'anne', ativo:true}, () => {
  run(`mdResumo = ${JSON.stringify(RESUMO)}; mdVendas = []; mdCarregado = true; mdErro='';
       mdRede = ${JSON.stringify(REDE_BATE_UMA)};`);
  const html = run(`renderMeuDia()`);
  if (html.includes('5% do lucro de acessórios da rede')) ok('Anne é avisada do extra que não cabe na tela');
  else bad('Anne veria um total incompleto sem aviso');
});

// Sem o total da rede (view fora do ar), o bônus é 0 e a tela não inventa.
comPerfil({papel:'bancada', nome:'Vitor', at_key:'vitinho', ativo:true}, () => {
  run(`mdResumo = ${JSON.stringify(RESUMO)}; mdVendas = []; mdCarregado = true; mdErro=''; mdRede = null;`);
  const html = run(`renderMeuDia()`);
  if (!html.includes('Meta do time')) ok('sem dado da rede, o card não aparece (não inventa faixa)');
  else bad('card da meta apareceu sem dado');
  if (html.includes('R$374')) ok('e a comissão própria continua certa');
  else bad('a comissão própria quebrou sem o dado da rede');
});

// -- 4. meses fechados vêm congelados --------------------------------------
// Mês pago NÃO se recalcula: o mapa de apelidos de 17/ago resgatou
// atendimentos que o código antigo perdia, então recalcular daria número
// diferente do que a pessoa recebeu — e a tela discordaria do extrato dela.
console.log('meses fechados');

comPerfil({papel:'bancada', nome:'Vitor Lima', at_key:'vitinho', ativo:true}, () => {
  run(`mdResumo = ${JSON.stringify(RESUMO)}; mdVendas = []; mdCarregado = true; mdErro='';
       mdRede = null;
       mdFolha = [
         { mes:'2026-07', func_id:'vitinho', comissao_vendedor:0, comissao_atendente:19,
           bonus_meta:0, bonus_coletivo:600, bonus_extra:0, total_variavel:619 },
         { mes:'2026-06', func_id:'vitinho', comissao_vendedor:25, comissao_atendente:632,
           bonus_meta:100, bonus_coletivo:1000, bonus_extra:0, total_variavel:1757 },
       ];`);
  const html = run(`renderMeuDia()`);
  if (html.includes('Meses fechados')) ok('o card dos meses fechados aparece');
  else bad('meses fechados sumiram');
  if (html.includes('R$619') && html.includes('R$1.757')) ok('mostra o total pago de cada mês');
  else bad('totais dos meses fechados errados');
  if (html.includes('jul/2026') && html.includes('jun/2026')) ok('rotula o mês por extenso curto');
  else bad('rótulo de mês errado');
  if (html.includes('não muda de valor')) ok('diz que mês fechado não muda');
  else bad('não avisa que o mês fechado é congelado');
});

comPerfil({papel:'comercial', nome:'David', vo_key:'david', ativo:true}, () => {
  run(`mdResumo = null; mdVendas = []; mdRede = null; mdFolha = []; mdCarregado = true; mdErro='';`);
  const html = run(`renderMeuDia()`);
  if (!html.includes('Meses fechados')) ok('sem mês fechado, o card não aparece');
  else bad('card apareceu vazio');
});

// -- 5. estado de erro é honesto -------------------------------------------
comPerfil({papel:'bancada', nome:'Vitor', at_key:'vitinho', ativo:true}, () => {
  run(`mdCarregado = true; mdErro = 'HTTP 500';`);
  const html = run(`renderMeuDia()`);
  if (html.includes('Não consegui carregar')) ok('falha de carga vira aviso, não tela em branco');
  else bad('falha de carga não avisou');
  run(`mdErro='';`);
});

// -- 6. navegar por mes: fechado vem da FOLHA, nunca da view ----------------
// A armadilha aqui e sutil e cara: as views recalculam com as regras de hoje.
// Se o mes fechado lesse delas, a tela discordaria do extrato da pessoa. Por
// isso o teste poe a view MENTINDO de proposito e exige que a folha vença.
console.log('\nmes fechado vem congelado da folha\n');

const FOLHA_AGO = { mes:'2026-08', func_id:'leo', nome:'Leo', aparelhos:0, acess_bruto:'13695.00',
  acess_lucro:'10509.48', vendas_atendidas:74, acess_qtd:199, comissao_vendedor:'0',
  comissao_atendente:'2683', bonus_meta:'1000', bonus_coletivo:'400', bonus_extra:'0',
  total_variavel:'4083', fechado_em:'2026-09-01T00:00:00+00:00' };
// A view diz OUTRA COISA -- e nao pode ganhar.
const VIEW_MENTIROSA = { mes:'2026-08', vendas_vendidas:0, aparelhos_vendidos:0,
  vendas_atendidas:95, vendas_com_acessorio:70, acess_qtd:199,
  acess_bruto:'13295.00', acess_lucro:'10100.00' };

comPerfil({papel:'comercial', nome:'Leo', at_key:'leo', ativo:true}, () => {
  run(`mdMes = '2026-08'; mdResumo = ${JSON.stringify(VIEW_MENTIROSA)};
       mdFolha = [${JSON.stringify(FOLHA_AGO)}]; mdVendas = []; mdDias = []; mdRede = null;
       mdCarregado = true; mdErro=''; mdFiltroLoja='todas'; mdFiltroDia='todos';`);
  const html = run(`renderMeuDia()`);
  if (html.includes('13.695')) ok('mês fechado mostra o acessório CONGELADO (R$13.695)');
  else bad('mês fechado não usou a folha congelada');
  if (!html.includes('13.295')) ok('...e não o número recalculado pela view (R$13.295)');
  else bad('a view recalculada venceu a folha congelada');
  if (html.includes('2.683')) ok('a comissão também vem da folha');
  else bad('a comissão não veio da folha');
  if (html.includes('fechado')) ok('a tela diz que o mês está fechado');
  else bad('mês fechado não se identifica');
  if (/mdDocumento\(\)/.test(html)) ok('mês fechado oferece o documento pra baixar');
  else bad('faltou o botão de baixar o fechamento');
});

// Mes corrente NAO oferece documento: numero que ainda muda vira discussao.
comPerfil({papel:'comercial', nome:'Leo', at_key:'leo', ativo:true}, () => {
  run(`mdMes = null; mdResumo = ${JSON.stringify(VIEW_MENTIROSA)}; mdFolha = [];
       mdVendas = []; mdDias = []; mdRede = null; mdCarregado = true; mdErro='';`);
  const html = run(`renderMeuDia()`);
  if (!/mdDocumento\(\)/.test(html)) ok('mês corrente NÃO oferece documento');
  else bad('mês corrente ofereceu documento de número que ainda muda');
  if (html.includes('13.295')) ok('...e aí sim o número vem da view, que é a previsão');
  else bad('mês corrente não usou a view');
});

// Mes antigo SEM congelamento nao inventa numero.
comPerfil({papel:'comercial', nome:'Leo', at_key:'leo', ativo:true}, () => {
  run(`mdMes = '2026-05'; mdResumo = ${JSON.stringify(VIEW_MENTIROSA)}; mdFolha = [];
       mdVendas = []; mdDias = []; mdRede = null; mdCarregado = true; mdErro='';`);
  const html = run(`renderMeuDia()`);
  if (html.includes('não foi fechado')) ok('mês sem congelamento diz isso, em vez de reconstruir');
  else bad('mês não congelado mostrou número reconstruído');
  run(`mdMes = null;`);
});

console.log(falhas ? `\n### ${falhas} falha(s)` : '\n### tudo verde');
process.exit(falhas ? 1 : 0);
