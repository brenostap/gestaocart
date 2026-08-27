// ===========================================================================
// Teste do Diário de bordo — roda com:  node test/diario.test.js
//
// O que este teste protege:
//
// 1. **A tela monta.** Padrão da casa: teste de unidade não vê quebra de render.
//    Em 06/ago renomear uma chave da Conferência derrubou a tela de Vendas
//    inteira e nenhum teste viu, porque ninguém montava a tela (CLAUDE.md).
// 2. **Item em aberto aparece; item fechado não polui o topo.** A metade de cima
//    é a razão da tela existir — se ela encher de coisa resolvida, morre.
// 3. **Laço velho é marcado.** Item parado há 30+ dias ganha classe `velho`.
//    É o que impede um pedido pro Dudu de morrer calado.
// 4. **A tela é só do sócio.** Ela carrega decisão de negócio e número de
//    dinheiro (ROAS, comissão, margem). ⚠️ Isto aqui é a CORTINA; a fechadura é
//    a policy `eh_socio()` na migration. Ver docs/PERFIS-E-ACESSO.md.
// 5. **⚠️ O diário LINKA, nunca COPIA.** `resumo` são bullets do que mudou;
//    `docs`/`commits`/`links` são ponteiro. Se um resumo começar a crescer, é
//    sinal de que virou cópia de docs/ — e conteúdo em dois lugares diverge,
//    que o CLAUDE.md marca como a classe mais cara de bug.
//
// Contexto: docs/PLANO-QUALIDADE-IA.md
// ===========================================================================
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');

let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FALHA ') + msg); if(!cond) falhas++; };

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

for (const f of ['config.js','ui.js','diario.js'])
  vm.runInContext(fs.readFileSync(path.join(ROOT,'js',f),'utf8'), ctx, {filename:f});

vm.runInContext(`function renderContent(){}`, ctx);
// as duas tabelas da aba Atendimento (a carga real vem do Supabase)
vm.runInContext(`
  atendPadroes = [
    { comportamento:'Pergunta FECHADA', loja:'cart', pct_ia:3, pct_vendedor:12, destaque:true, nota:null, ordem:10 },
    { comportamento:'Pergunta ABERTA',  loja:'cart', pct_ia:36, pct_vendedor:10, destaque:true, nota:null, ordem:20 },
  ];
  leadScore = [
    { loja:'cart', origem:'Orgânico', canal:'whatsapp', tema:'(sem anuncio)', leads:1086,
      transferidos:408, vendas:73, ticket_medio:3623, lucro_medio:784, lucro_por_lead:52.68,
      custo_por_lead:null, nota:'O padrão contra o qual os outros devem ser lidos.' },
    { loja:'cart', origem:'Meta Ads', canal:'instagram', tema:'aparelho do cliente', leads:824,
      transferidos:128, vendas:3, ticket_medio:1920, lucro_medio:288, lucro_por_lead:1.04,
      custo_por_lead:5.54, nota:'O único claramente abaixo do próprio custo.' },
    { loja:'urban', origem:'Orgânico (não confiável)', canal:'instagram', tema:'(sem anuncio)',
      leads:2518, transferidos:448, vendas:19, ticket_medio:5163, lucro_medio:678,
      lucro_por_lead:5.12, custo_por_lead:null, nota:'NÃO USE PRA DECIDIR VERBA.' },
  ];
  atendTags = [
    { loja:'cart', tag:'convite_aberto', quem:'ia', rotulo:'Convidou mas mandou o cliente escolher o dia',
      conserto:'Oferecer um horário concreto', n_conversas:457, n_total:1291,
      trecho:'Que dia e horário você consegue passar aqui?', conversa_id:39514, trecho_e_prova:true },
    { loja:'cart', tag:'nao_tentou_fechar', quem:'ia', rotulo:'Cotou preço e nunca tentou fechar',
      conserto:'Uma pergunta de fechamento depois do preço', n_conversas:738, n_total:1291,
      trecho:'O modelo 128GB seminovo sai R$ 3.890 à vista.', conversa_id:39690, trecho_e_prova:false },
    { loja:'urban', tag:'convite_aberto', quem:'ia', rotulo:'Convidou mas mandou escolher o dia',
      conserto:'Oferecer um horário', n_conversas:402, n_total:1025,
      trecho:'Que dia e horário você consegue passar aqui na loja?', conversa_id:13545, trecho_e_prova:true },
  ];
  atendPares = [
    { momento:'Ela separou o aparelho', porque:'Ela pergunta QUAL dia; ele DIZ o dia.',
      fala_ia:'Que dia pode passar pra ver ele de pertinho?',
      fala_vendedor:'Fiquei com ele separado pra sexta às 16h. Me passa o nome completo.' },
  ];
`, ctx);

// ── dados de exemplo: um item novo, um velho e um fechado ──────────────────
const hoje = new Date();
const diasAtras = n => new Date(hoje.getTime() - n*86400000).toISOString().slice(0,10);

vm.runInContext(`
  diarioEntradas = [
    { id:1, data:'2026-08-27', titulo:'A Maju pergunta aberto; o vendedor pergunta fechado',
      resumo:['Ela pergunta o dia em 36–39%, mais que o vendedor.','O que falta é pedir um SIM.'],
      docs:['docs/PLANO-QUALIDADE-IA.md'], commits:['7fcbc3c'], links:[], tipo:'analise' },
    { id:2, data:'2026-08-20', titulo:'Prompt novo da Maju no ar',
      resumo:[], docs:[], commits:[], links:[], tipo:'prompt' },
  ];
  diarioItens = [
    { id:10, titulo:'Ligar a conversa_estado', detalhe:'Destrava a camada 0.',
      dono:'dudu', prioridade:1, aberto_em:'${diasAtras(2)}', fechado_em:null },
    { id:11, titulo:'Pedido esquecido', detalhe:null,
      dono:'nos', prioridade:2, aberto_em:'${diasAtras(45)}', fechado_em:null },
    { id:12, titulo:'Ler 30 conversas', detalhe:null,
      dono:'nos', prioridade:2, aberto_em:'${diasAtras(3)}',
      fechado_em:'${diasAtras(1)}', fechado_nota:'Hipótese caiu.' },
  ];
`, ctx);

const html = vm.runInContext('renderDiario()', ctx);

console.log('\n1. A tela monta');
ok(typeof html === 'string' && html.length > 500, 'renderDiario() devolve HTML');
ok(!/undefined|NaN|\[object Object\]/.test(html), 'sem undefined/NaN/[object Object] no HTML');

console.log('\n2. O topo mostra o que está em aberto, e só isso');
ok(html.includes('Ligar a conversa_estado'), 'item em aberto aparece');
ok(html.includes('Pedido esquecido'), 'o segundo item em aberto aparece');
const topo = html.slice(0, html.indexOf('Histórico'));
ok(!topo.includes('Ler 30 conversas'), 'item JÁ FECHADO não polui a metade de cima');
ok(/Em aberto[\s\S]{0,400}>2</.test(html), 'o KPI conta 2 em aberto (não 3)');

console.log('\n3. Laço velho é marcado');
const bloco = html.slice(html.indexOf('Pedido esquecido') - 400, html.indexOf('Pedido esquecido'));
ok(/di-item\b[^"]*velho/.test(bloco), 'item parado há 45 dias ganha a classe `velho`');
const blocoNovo = html.slice(html.indexOf('Ligar a conversa_estado') - 400, html.indexOf('Ligar a conversa_estado'));
ok(!/velho/.test(blocoNovo), 'item de 2 dias NÃO é marcado como velho');
ok(html.includes('agora'), 'prioridade 1 ganha o selo "agora"');

console.log('\n4. O dono de cada laço aparece — é a pergunta que a tela responde');
ok(html.includes('Dudu'), 'o que depende do Dudu está identificado');
ok(html.indexOf('Dudu') < html.indexOf('Painel'), 'o que depende de fora vem primeiro');

console.log('\n5. Carimbo de mudança de prompt (o changelog que a análise de série exige)');
ok(html.includes('prompt'), 'entrada do tipo `prompt` é rotulada como tal');
ok(html.includes('7fcbc3c') && html.includes('docs/PLANO-QUALIDADE-IA.md'),
   'ponteiros (commit e doc) aparecem — é assim que o diário linka em vez de copiar');

console.log('\n6. A tela é só do sócio (cortina; a fechadura é eh_socio() na migration)');
const shell = fs.readFileSync(path.join(ROOT,'js','shell.js'),'utf8');
// ⚠️ ancora na DECLARACAO, nao na primeira mencao: 'MATRIZ_ACESSO' aparece
// antes num comentario da NAV, e o slice pegava o pedaco errado do arquivo.
const iMatriz = shell.indexOf('const MATRIZ_ACESSO');
const matriz = shell.slice(iMatriz, shell.indexOf('};', iMatriz));
for (const papel of ['bancada','comercial','gerente','vendedor','atendente']) {
  const linha = matriz.split('\n').find(l => l.trim().startsWith(papel + ':')) || '';
  ok(!linha.includes("'diario'"), `papel \`${papel}\` NÃO alcança o Diário`);
}
ok((matriz.split('\n').find(l => l.trim().startsWith('socio:')) || '').includes("'diario'"),
   'o sócio alcança');

const mig = fs.readFileSync(path.join(ROOT,'supabase','migrations','20260827_diario_de_bordo.sql'),'utf8');
ok(/create policy diario_socio[\s\S]*eh_socio\(\)/.test(mig), 'a policy do banco exige eh_socio()');
ok(/revoke all on public\.diario[^;]*from anon/.test(mig), '`anon` não lê o diário');

console.log('\n7. ⚠️ O diário linka, nunca copia');
const longos = vm.runInContext('diarioEntradas', ctx)
  .flatMap(e => e.resumo || []).filter(r => r.length > 220);
ok(longos.length === 0, 'nenhum bullet de resumo passa de 220 caracteres');
ok(vm.runInContext('diarioEntradas', ctx).every(e => (e.resumo||[]).length <= 4),
   'nenhuma entrada passa de 4 bullets');

console.log('\n8. As duas abas');
const htmlAtend = vm.runInContext("diarioAba='atendimento'; renderDiario()", ctx);
vm.runInContext("diarioAba='pendencias'", ctx);
ok(html.includes('Pendências') && html.includes('Atendimento'), 'as duas abas aparecem');
ok(!html.includes('Que dia pode passar'), 'a aba Pendências NÃO mostra a análise');
ok(!htmlAtend.includes('Ligar a conversa_estado') && !htmlAtend.includes('Fazer a Maju anotar'),
   'a aba Atendimento NÃO mostra pendência');

console.log('\n9. ⚠️ A aba Atendimento mostra a FALA, não só o número');
ok(htmlAtend.includes('Que dia pode passar pra ver ele de pertinho?'), 'a fala da IA aparece verbatim');
ok(htmlAtend.includes('Me passa o nome completo'), 'a fala do vendedor aparece verbatim');
ok(htmlAtend.indexOf('Que dia pode passar') < htmlAtend.indexOf('Pergunta FECHADA'),
   'o PAR vem antes do número — foi o pedido do dono, e é o que mostra o mecanismo');
ok(/14,9%[\s\S]{0,40}3,4%/.test(htmlAtend),
   'o rodapé separa o que está provado do que é hipótese');

console.log('\n10. ⚠️ As etiquetas: falha, quanto, conserto e a frase real');
ok(htmlAtend.includes('Convidou mas mandou o cliente escolher o dia'), 'a falha aparece pelo nome');
ok(htmlAtend.includes('457'), 'com quantas conversas');
ok(htmlAtend.includes('Oferecer um horário concreto'),
   'e com o CONSERTO — tag sem conserto é reclamação');
ok(!htmlAtend.includes('Que dia e horário você consegue passar aqui?'),
   'a frase fica escondida até clicar (a tela não vira parede de texto)');

const aberta = vm.runInContext("diarioTagAberta='convite_aberto'; diarioAba='atendimento'; renderDiario()", ctx);
ok(aberta.includes('Que dia e horário você consegue passar aqui?'), 'clicando, a frase real aparece');
ok(aberta.includes('39514'), 'com o número da conversa, pra conferir');

console.log('\n10b. ⚠️ Tag de AUSÊNCIA avisa que a frase não é a culpada');
const ausencia = vm.runInContext("diarioTagAberta='nao_tentou_fechar'; renderDiario()", ctx);
ok(/ausência/i.test(ausencia) && /onde caberia/i.test(ausencia),
   'diz que é ausência e que o trecho é onde caberia, não o erro');
const comProva = vm.runInContext("diarioTagAberta='convite_aberto'; renderDiario()", ctx);
ok(!/onde caberia/i.test(comProva), 'e NÃO diz isso quando a frase é a prova');

console.log('\n10c. Uma loja por vez — os prompts são diferentes');
vm.runInContext("diarioTagAberta=null; atendLoja='cart'", ctx);
const soCart = vm.runInContext('renderDiario()', ctx);
ok(!soCart.includes('Convidou mas mandou escolher o dia'), 'a Cart não mostra etiqueta da Urban');
vm.runInContext("atendLoja='urban'", ctx);
ok(vm.runInContext('renderDiario()', ctx).includes('Convidou mas mandou escolher o dia'),
   'e trocando pra Urban, aparece a dela');
vm.runInContext("atendLoja='cart'; diarioAba='pendencias'", ctx);

console.log('\n10d. ⚠️ A régua (camada 1) vem ANTES das etiquetas');
const at = vm.runInContext("diarioTagAberta=null; atendLoja='cart'; diarioAba='atendimento'; renderDiario()", ctx);
ok(at.includes('Quanto vale cada tipo de lead'), 'a régua aparece');
ok(at.indexOf('Quanto vale cada tipo de lead') < at.indexOf('O que dá pra consertar'),
   'e vem ANTES — sem régua, "57% não tentou fechar" não tem contra o que ser lido');
ok(/R\$\s?52[.,]68/.test(at), 'mostra o lucro esperado por lead');
ok(/-?R\$\s?4[.,]50/.test(at) || at.includes('5,54'),
   'e a sobra contra o custo de mídia, quando existe');
ok(/08\/jun/.test(at) && /45 dias/.test(at),
   'declara a janela e a maturação normalizada — sem isso o número não é comparável');
ok(/67%/.test(at) && /33%/.test(at), 'e avisa do degrau de 08/jun');

console.log('\n10e. ⚠️ Segmento não confiável não pode parecer igual aos outros');
vm.runInContext("atendLoja='urban'", ctx);
const urb = vm.runInContext('renderDiario()', ctx);
ok(urb.includes('não confiável'), 'o rótulo diz que não é confiável');
ok(/ls-alerta/.test(urb), 'e ganha tratamento visual próprio, não a mesma barra verde');
ok(urb.includes('NÃO USE PRA DECIDIR VERBA'), 'com o motivo escrito');
vm.runInContext("atendLoja='cart'", ctx);

console.log('\n11. A aba Atendimento não derruba a de Pendências');
vm.runInContext('atendPadroes = []; atendPares = []; atendTags = []; leadScore = [];', ctx);
const semDados = vm.runInContext("diarioAba='atendimento'; renderDiario()", ctx);
vm.runInContext("diarioAba='pendencias'", ctx);
ok(typeof semDados === 'string' && semDados.length > 200, 'sem dado de atendimento, a tela ainda monta');
ok(vm.runInContext("renderDiario()", ctx).includes('Fazer a Maju anotar') === false ||
   vm.runInContext("renderDiario()", ctx).includes('Em aberto'),
   'e a aba de pendências continua de pé');

console.log('\n12. Descartar é diferente de resolver');
const js = fs.readFileSync(path.join(ROOT,'js','diario.js'),'utf8');
ok(/descartado_em/.test(js), 'existe coluna própria pra descarte');
ok(js.indexOf('descartado_em') !== js.lastIndexOf('descartado_em'),
   'descartar não reaproveita fechado_em — se muito item for descartado, o problema é o que EU escrevo');

console.log('\n13. Fechar guarda a DATA em vez de apagar a linha');
ok(/fechado_em/.test(fs.readFileSync(path.join(ROOT,'js','diario.js'),'utf8')),
   'diarioFechar grava fechado_em');
ok(!/method:\s*'DELETE'/.test(fs.readFileSync(path.join(ROOT,'js','diario.js'),'utf8')),
   'não existe DELETE — sem a data não dá pra medir há quanto tempo o laço ficou aberto');

console.log(falhas ? `\n${falhas} FALHA(S)\n` : '\nTudo certo.\n');
process.exit(falhas ? 1 : 0);
