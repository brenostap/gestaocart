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
  function podeVerCustoServico(){ return true; }
  function moneyServico(v){ return brl(v); }
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
ok('marca quem tem dono', bnc.includes('Do cliente'));
// A palavra "Garantia" saiu do rótulo: ela dizia duas coisas opostas ao mesmo
// tempo (a nossa, pro cliente; a da assistência, pra nós). A segunda virou
// coluna própria, `retorno_de`.
ok('a palavra "Garantia" não é mais rótulo de origem', !/>Garantia</.test(bnc));

const fech = R('(function(){ _bncAba = "fechadas"; return renderBancada(); })()');
ok('aba Voltaram mostra o que voltou', fech.includes('SP1030'));
ok('aba Voltaram mostra quantos dias ficou fora', /3d/.test(fech));

const est = R('(function(){ currentTab = "estoque"; return renderEstoque(); })()');
ok('renderEstoque() continua montando', typeof est === 'string' && est.length > 500);
// `class="bnc-selo"` exato, não /bnc-selo/: o selo carrega um
// <span class="bnc-selo-txt"> (o texto que some no cartão do celular), e o
// regex solto contava 2 por aparelho.
ok('selo aparece nos 2 que estão fora', (est.match(/class="bnc-selo"/g) || []).length === 2,
   'selos: ' + (est.match(/class="bnc-selo"/g) || []).length);
ok('linha do que está fora ganha a classe na-bancada',
   (est.match(/na-bancada/g) || []).length === 2);
ok('KPI "Na assistência" mostra 2', /Na assistência[\s\S]{0,200}>2</.test(est));
ok('o que voltou NÃO ganha selo', !/SP1030[\s\S]{0,200}bnc-selo/.test(est));

console.log('\nexportar pra WhatsApp — a lista de "não vender"\n');

const wa = R('bncTextoWhatsApp()');
// sem a palavra 'iPhone': 33 linhas repetindo o obvio viravam ruido
ok('lista os 2 que saíram do estoque, sem repetir "iPhone"',
   wa.includes('16 128GB Rosa') && wa.includes('16 Plus 128GB Rosa'));
ok('a palavra iPhone não aparece', !/iPhone/i.test(wa));
ok('traz os 4 últimos do IMEI, sem a palavra "final"',
   wa.includes('8580') && wa.includes('3324') && !/final/i.test(wa));
// quem cobra, cobra uma assistência de cada vez
ok('separa por fornecedor', /RR \/ Legacy \(1\)/.test(wa) && /Access \(1\)/.test(wa));
// Mesma ordem da tela (saiu_em crescente): o 16 Plus saiu em 11/mai, o 16 em
// 10/ago. Conferir a lista colada no grupo contra a tela não pode dar trabalho.
// RR primeiro, Access depois: quem cobra segue a lista de cima pra baixo
ok('bloco da RR vem antes do da Access',
   wa.indexOf('RR / Legacy') < wa.indexOf('Access'));
// e DENTRO do bloco a ordem continua sendo a da tela (saiu_em crescente)
const waOrdem = (function(){
  const antes = R('_bancadaCache');
  R("_bancadaCache = [" +
    "{id:9,imei4:'1111',modelo_txt:'iPhone 14 Novo',fornecedor:'RR',origem:'estoque',servico:'x',saiu_em:'2026-08-12',voltou_em:null}," +
    "{id:8,imei4:'2222',modelo_txt:'iPhone 13 Velho',fornecedor:'RR',origem:'estoque',servico:'x',saiu_em:'2026-06-01',voltou_em:null}]");
  const t = R('bncTextoWhatsApp()');
  R('_bancadaCache = ' + JSON.stringify(antes));
  return t;
})();
ok('mais velho primeiro dentro do bloco',
   waOrdem.indexOf('13 Velho') < waOrdem.indexOf('14 Novo'));
// O que já voltou está de novo disponível: anunciar como "não vender" seria
// tirar da venda um aparelho que está na prateleira.
ok('NÃO inclui o que já voltou', !wa.includes('iPhone 16 128GB Preto'));
// Aparelho de cliente não é estoque — não há o que dar baixa. Mas some da
// lista contado, não calado.
ok('aparelho de cliente fica fora da lista', !wa.includes('(cliente)'));
ok('mas aparece contado no rodapé', /\+ 1 de cliente\/garantia/.test(wa));
// Sem preço: é aviso operacional, não lista comercial. É o que permite o papel
// `bancada` exportar, ao contrário do Exportar WhatsApp do Estoque.
ok('não vaza preço nenhum', !/R\$/.test(wa));

console.log('\nserviço — mais de um por aparelho\n');

// A nota da RR já cobra assim ("Subida de Bateria + Troca de Bateria"). Gravar
// no mesmo formato é o que mantém o preço de referência valendo pro combo.
eq('junta os serviços com " + "',
   R("bncJuntarServico(['Troca de tela','Face ID'], '')"), 'Troca de tela + Face ID');
eq('o campo livre entra junto',
   R("bncJuntarServico(['Troca de tela'], 'polimento')"), 'Troca de tela + polimento');
eq('não repete o mesmo serviço',
   R("bncJuntarServico(['Troca de tela'], 'troca de tela')"), 'Troca de tela');
eq('nada marcado vira NULL, não string vazia',
   R("bncJuntarServico([], '')"), null);

// Ordem não é significado: sem normalizar, a mediana perderia metade das
// amostras e o preço de referência (mín. 3) deixaria de existir.
ok('"A + B" e "B + A" são o mesmo serviço',
   R("bncNormServico('Troca de tela + Face ID') === bncNormServico('Face ID + Troca de tela')"));
ok('serviços diferentes continuam diferentes',
   R("bncNormServico('Troca de tela') !== bncNormServico('Troca de tela + Face ID')"));

// Editar linha antiga não pode comer o que veio da planilha do Vitinho.
eq('o que não está na lista volta pro campo livre, não some',
   R("bncSepararServico('Troca de tela, NFC').extra"), 'NFC');
eq('e o que está na lista vira chip marcado',
   R("bncSepararServico('Troca de tela, NFC').sel"), ['Troca de tela']);
eq('os três serviços novos existem na lista',
   R("['Câmera frontal','Troca de carcaça','Botão power / NFC'].filter(s => BNC_SERVICOS.indexOf(s) >= 0).length"), 3);

console.log('\nfiltro — achar o aparelho na lista\n');

eq('acha pelos 4 do IMEI',   R("(function(){_bncFiltro='3324'; const r=bncFiltrar(_bancadaCache).map(l=>l.id); _bncFiltro=''; return r;})()"), [2]);
// A etiqueta com prefixo tem que ser respeitada: `E1030` e `SP1030` são
// aparelhos diferentes e 138 itens do estoque colidem sem o prefixo.
eq('etiqueta com prefixo não traz o vizinho', R("(function(){_bncFiltro='E1030'; const r=bncFiltrar(_bancadaCache).map(l=>l.id); _bncFiltro=''; return r;})()"), [1]);
eq('mas só o número traz os dois (a pessoa desempata olhando)', R("(function(){_bncFiltro='1030'; const r=bncFiltrar(_bancadaCache).map(l=>l.id); _bncFiltro=''; return r;})()"), [1,3]);
eq('acha pelo modelo',       R("(function(){_bncFiltro='16 plus'; const r=bncFiltrar(_bancadaCache).map(l=>l.id); _bncFiltro=''; return r;})()"), [2]);
eq('acha pelo serviço',      R("(function(){_bncFiltro='placa'; const r=bncFiltrar(_bancadaCache).map(l=>l.id); _bncFiltro=''; return r;})()"), [1]);
eq('filtro vazio não filtra nada', R("(function(){_bncFiltro=''; return bncFiltrar(_bancadaCache).length;})()"), 4);

const filtrada = R("(function(){ _bncAba='abertas'; currentTab='bancada'; _bncFiltro='3324'; const h=renderBancada(); _bncFiltro=''; return h; })()");
ok('a tela filtrada mostra só 1 linha', (filtrada.match(/class="bnc-linha"/g) || []).length === 1);
// O filtro corta a lista, nunca o placar: capital parado e "quantos estão fora"
// são da operação inteira. Filtrar não pode fazer o problema parecer menor.
ok('o KPI continua contando os 3 que estão fora', /Na assistência[\s\S]{0,200}>3</.test(filtrada),
   'o KPI mudou com o filtro');

console.log('\nexportar pra WhatsApp — o que voltou hoje\n');

const waV = (function(){
  const antes = R('_bancadaCache');
  R("_bancadaCache = [" +
    "{id:20,imei4:'1111',modelo_txt:'iPhone 14 Pro 128GB Preto',fornecedor:'RR',origem:'estoque'," +
    " servico:'Troca de tela + Face ID',saiu_em:'2026-08-01',voltou_em:bncHoje()}," +
    "{id:21,imei4:'2222',modelo_txt:'iPhone 13 Azul',fornecedor:'RR',origem:'garantia'," +
    " servico:'Troca de bateria',saiu_em:'2026-08-02',voltou_em:bncHoje()}," +
    "{id:22,imei4:'3333',modelo_txt:'iPhone 12 Verde',fornecedor:'RR',origem:'estoque'," +
    " servico:'x',saiu_em:'2026-07-01',voltou_em:'2026-08-04'}]");
  const t = R('bncTextoWhatsAppVoltaram()');
  R('_bancadaCache = ' + JSON.stringify(antes));
  return t;
})();
ok('lista o que voltou HOJE', waV.includes('1111') && waV.includes('2222'));
ok('não lista o que voltou em outro dia', !waV.includes('3333'));
// Aparelho de garantia voltou pra ser ENTREGUE, não vendido. Misturar poria na
// prateleira aparelho que já tem dono.
ok('separa "já pode vender" de "entregar ao dono"',
   /Já pode vender \(1\)/.test(waV) && /Entregar ao dono \(1\)/.test(waV));
ok('diz o serviço que foi feito', waV.includes('Troca de tela + Face ID'));
ok('não vaza preço nenhum', !/R\$/.test(waV));
ok('a palavra iPhone não aparece', !/iPhone/i.test(waV));
ok('dia sem baixa não gera lista falsa',
   /Nenhum aparelho voltou hoje/.test(R("bncTextoWhatsAppVoltaram('2026-01-01')")));

R('_bancadaCache = [];');
ok('bancada vazia não gera lista falsa',
   /Nenhum aparelho do estoque/.test(R('bncTextoWhatsApp()')));

console.log('\nde onde vem o aparelho — derivado, não perguntado\n');

// O dropdown de origem saiu do formulário em 26/ago/2026: o CAMINHO já
// responde (achou na busca do estoque = prateleira; "não está no estoque" =
// tem dono), e perguntar de novo errava — em 4 das 37 linhas abertas daquele
// dia as duas respostas se contradiziam.
const derivado = (function(){
  const antes = R('_bancadaCache');
  R("_bancadaCache = [" +
    // origem gravada diz 'garantia', mas o aparelho 202 está available no
    // estoque: nunca foi vendido. É o caso real da linha 155 (26/ago).
    "{id:50,apple_id:202,imei4:'1234',modelo_txt:'iPhone 16 128GB Preto',fornecedor:'RR'," +
    " origem:'garantia',servico:'Não liga',saiu_em:'2026-08-20',voltou_em:null}," +
    // sem apple_id e origem 'estoque': linha importada da planilha. NÃO dá pra
    // derivar, então vale o que foi gravado — são 15 dessas em produção.
    "{id:51,apple_id:null,imei4:'5555',modelo_txt:'14 Pro Roxo',fornecedor:'RR'," +
    " origem:'estoque',servico:'Face ID',saiu_em:'2026-08-21',voltou_em:null}," +
    // sem apple_id e origem 'cliente': o caminho manual. Tem dono.
    "{id:52,apple_id:null,imei4:'6666',modelo_txt:'13 Azul',fornecedor:'RR'," +
    " origem:'cliente',servico:'Troca de tela',saiu_em:'2026-08-22',voltou_em:null}]");
  const r = {
    g: R('bncDaPrateleira(_bancadaCache[0])'),
    semId: R('bncDaPrateleira(_bancadaCache[1])'),
    dono: R('bncDaPrateleira(_bancadaCache[2])'),
    wa: R('bncTextoWhatsApp()'),
  };
  // ⚠️ GUARDA: estoque vazio não pode fazer a lista de "não vender" sair vazia.
  const est = R('estoqueItens');
  R('estoqueItens = [];');
  r.semEstoque = R('bncDaPrateleira(_bancadaCache[0])');
  r.waSemEstoque = R('bncTextoWhatsApp()');
  R('estoqueItens = ' + JSON.stringify(est));
  R('_bancadaCache = ' + JSON.stringify(antes));
  return r;
})();

ok('origem gravada "garantia" em aparelho available vira prateleira', derivado.g === true);
ok('sem apple_id NÃO é "tem dono": vale o gravado', derivado.semId === true);
ok('caminho manual (origem cliente) tem dono', derivado.dono === false);
ok('os dois da prateleira entram na lista de não vender',
   derivado.wa.includes('1234') && derivado.wa.includes('5555'));
ok('o que tem dono fica fora da lista', !derivado.wa.includes('6666'));
// Sem estoque carregado a derivação desliga: derivar ali diria "tem dono" pra
// tudo e a lista sairia VAZIA — o balcão venderia aparelho que está fora.
ok('estoque vazio NÃO deriva: cai no que foi gravado', derivado.semEstoque === false);
ok('e a lista de não vender não some (a linha do estoque continua)',
   derivado.waSemEstoque.includes('5555'));

console.log('\nde quem é o aparelho — o pós-venda precisa da resposta\n');

// Das 168 idas em 26/ago/2026, 21 eram de cliente ou garantia e NENHUMA dizia
// de quem era o aparelho: `quem` guarda o e-mail de quem registrou, não o dono.
// §6 de docs/funcoes/coordenadora-pos-venda.md manda registrar nome e contato.
const dono = (function(){
  const antes = R('_bancadaCache');
  R("_bancadaCache = [" +
    "{id:70,apple_id:null,imei4:'4321',modelo_txt:'13 Azul',fornecedor:'RR'," +
    " origem:'cliente',servico:'Troca de tela',saiu_em:'2026-08-24',voltou_em:null," +
    " cliente_nome:'Fernanda Alves de Souza',cliente_tel:'(11) 98888-7766'}," +
    // Aparelho de cliente ANTIGO, gravado antes das colunas existirem.
    "{id:71,apple_id:null,imei4:'8888',modelo_txt:'12 mini Preto',fornecedor:'ACCESS'," +
    " origem:'cliente',servico:'Auricular',saiu_em:'2026-08-25',voltou_em:null}]");
  const r = {
    tabela: R('bncTabelaAbertas(bncAbertas())'),
    porNome: R("_bncFiltro='fernanda'; bncFiltrar(bncAbertas()).length"),
    porTel:  R("_bncFiltro='98888'; bncFiltrar(bncAbertas()).length"),
    semDono: R("_bncFiltro='12 mini'; bncFiltrar(bncAbertas()).length"),
  };
  R("_bncFiltro='';");
  R('_bancadaCache = ' + JSON.stringify(antes));
  return r;
})();

ok('o nome do dono aparece na linha', /Fernanda Alves/.test(dono.tabela));
// Nome inteiro estoura a coluna: mostra os dois primeiros, o resto no title.
ok('a coluna mostra o nome curto', /Fernanda Alves<\/span>|>Fernanda Alves</.test(dono.tabela));
ok('o telefone fica no title, não na tabela',
   /title="[^"]*98888-7766/.test(dono.tabela) && !/>\(11\) 98888-7766</.test(dono.tabela));
// ⚠️ Linha antiga não pode sumir nem quebrar: 21 idas já existem sem dono.
ok('aparelho de cliente SEM dono ainda diz "Do cliente"', /Do cliente/.test(dono.tabela));
// É assim que a pergunta chega: pelo nome, não pelo IMEI.
ok('acha pelo nome do cliente', dono.porNome === 1);
// ⚠️ O selo é CLICÁVEL nos dois casos: sem dono para preencher (as 21 idas
// antigas), com dono para corrigir. Sem isso, esquecer na saída era definitivo.
ok('sem dono, o selo abre o editor', /bnc-dono-btn falta[\s\S]{0,120}bncAbrirServico\(71\)/.test(dono.tabela));
ok('com dono, também dá pra corrigir', /bncAbrirServico\(70\)/.test(dono.tabela));
ok('acha pelo telefone', dono.porTel === 1);
ok('e continua achando pelo modelo', dono.semDono === 1);

console.log('\neditar o dono depois — as 21 idas órfãs\n');

const edicao = (function(){
  const antes = R('_bancadaCache');
  R("_bancadaCache = [" +
    "{id:80,apple_id:null,imei4:'4321',modelo_txt:'13 Azul',fornecedor:'RR'," +
    " origem:'cliente',servico:'Troca de tela',saiu_em:'2026-08-24',voltou_em:null}," +
    "{id:81,apple_id:202,imei4:'1234',modelo_txt:'iPhone 16 128GB Preto',fornecedor:'RR'," +
    " origem:'estoque',servico:'Não liga',saiu_em:'2026-08-20',voltou_em:null}]");
  R("_bncEditId=80; _bncEditServs=['Troca de tela']; _bncEditExtra='';" +
    "_bncEditCli=''; _bncEditTel='';");
  const semDono = R('bncCorpoServico(_bancadaCache[0])');
  const prateleira = R('bncCorpoServico(_bancadaCache[1])');
  R("_bncEditCli='Fernanda Alves'; _bncEditTel='(11) 98888-7766';");
  const comDono = R('bncCorpoServico(_bancadaCache[0])');
  R('_bancadaCache = ' + JSON.stringify(antes));
  R("_bncEditId=null; _bncEditCli=''; _bncEditTel='';");
  return { semDono, prateleira, comDono };
})();

ok('aparelho de cliente ganha os campos de dono no editor',
   /De quem é o aparelho/.test(edicao.semDono));
// Sem dono, o editor DIZ por que aquilo importa -- campo em branco sozinho não
// explica que o pós-venda depende dele.
ok('e avisa que ninguém registrou quem é',
   /ninguém\s+registrou quem é/.test(edicao.semDono.replace(/\s+/g,' ')));
ok('com dono preenchido o aviso some', !/ninguém\s+registrou/.test(edicao.comDono.replace(/\s+/g,' ')));
ok('e o nome aparece no campo', /Fernanda Alves/.test(edicao.comDono));
// ⚠️ Aparelho da prateleira NÃO tem dono: o bloco nem aparece. Deixar o campo
// convidaria a preencher errado -- mesma razão do formulário de saída.
ok('aparelho da prateleira NÃO ganha campo de dono',
   !/De quem é o aparelho/.test(edicao.prateleira));

console.log('\nretorno — a garantia que a ASSISTÊNCIA nos dá\n');

const ret = (function(){
  const antes = R('_bancadaCache');
  R("_bancadaCache = [" +
    "{id:60,apple_id:null,imei4:'9722',modelo_txt:'15 max preto',fornecedor:'RR'," +
    " origem:'cliente',servico:'Troca de bateria',saiu_em:'2026-08-24',voltou_em:bncHoje()}," +
    // mesma etiqueta de tempo, aparelho diferente: não pode casar
    "{id:61,apple_id:null,imei4:'1111',modelo_txt:'13 azul',fornecedor:'RR'," +
    " origem:'cliente',servico:'Troca de tela',saiu_em:'2026-08-20',voltou_em:bncHoje()}," +
    // ida antiga do MESMO aparelho, fora da janela de 90 dias
    "{id:62,apple_id:null,imei4:'9722',modelo_txt:'15 max preto',fornecedor:'RR'," +
    " origem:'cliente',servico:'Face ID',saiu_em:'2026-01-02',voltou_em:'2026-01-05'}]");
  const r = {
    acha:   R("(bncUltimaFechada({apple_id:null, imei4:'9722'})||{}).id"),
    outro:  R("(bncUltimaFechada({apple_id:null, imei4:'1111'})||{}).id"),
    zeros:  R("bncUltimaFechada({apple_id:null, imei4:'0000'})"),
    naoTem: R("bncUltimaFechada({apple_id:null, imei4:'4321'})"),
  };
  R('_bancadaCache = ' + JSON.stringify(antes));
  return r;
})();

// Sugerir é trabalho de máquina; dizer se é o MESMO defeito é de quem está com
// o aparelho na mão. Por isso a tela oferece a ida anterior e não decide.
eq('sugere a última ida fechada do mesmo aparelho', ret.acha, 60);
eq('não confunde aparelhos diferentes', ret.outro, 61);
// A ida de janeiro está fora da janela: é serviço novo, não retorno.
ok('ida fora da janela de 90 dias não é sugerida', ret.acha !== 62);
// '0000' é o "não sei o IMEI" da planilha — casar por ele juntaria 5 aparelhos
// distintos numa coisa só.
eq('imei 0000 nunca casa', ret.zeros, null);
eq('aparelho sem histórico não sugere nada', ret.naoTem, null);

// A mediana de referência é o número que acusa "preço fora". Um zero de
// retorno ali puxaria a referência pra baixo e faria a tela reclamar de
// serviço normal. Ausência de preço não é amostra de preço.
const precoRef = (function(){
  const antes = R('_bancadaCache');
  R("_bancadaCache = [" +
    "{id:70,fornecedor:'RR',servico:'Troca de tela',valor_cobrado:300,voltou_em:'2026-08-01'}," +
    "{id:71,fornecedor:'RR',servico:'Troca de tela',valor_cobrado:300,voltou_em:'2026-08-02'}," +
    "{id:72,fornecedor:'RR',servico:'Troca de tela',valor_cobrado:300,voltou_em:'2026-08-03'}," +
    "{id:73,fornecedor:'RR',servico:'Troca de tela',valor_cobrado:0,retorno_de:70,voltou_em:'2026-08-04'}]");
  const r = R("(bncPrecoRef('RR','Troca de tela')||{})");
  R('_bancadaCache = ' + JSON.stringify(antes));
  return r;
})();
eq('retorno a R$ 0 não entra na mediana de referência', precoRef.valor, 300);
eq('e nem conta como amostra', precoRef.n, 3);

// O selo mora na coluna do SERVIÇO: retorno qualifica o serviço ("de novo"),
// não de quem é o aparelho.
const comSelo = (function(){
  const antes = R('_bancadaCache');
  R("_bancadaCache = [" +
    "{id:80,apple_id:101,imei4:'8580',modelo_txt:'iPhone 16 128GB Rosa',fornecedor:'RR'," +
    " origem:'estoque',servico:'Troca de bateria',saiu_em:'2026-08-20',voltou_em:'2026-08-21',valor_cobrado:120}," +
    "{id:81,apple_id:101,imei4:'8580',modelo_txt:'iPhone 16 128GB Rosa',fornecedor:'RR'," +
    " origem:'estoque',servico:'Troca de bateria',saiu_em:'2026-08-25',voltou_em:null,retorno_de:80}]");
  const h = R("(function(){ _bncAba='abertas'; currentTab='bancada'; return renderBancada(); })()");
  R('_bancadaCache = ' + JSON.stringify(antes));
  return h;
})();
ok('a tela marca o retorno', /retorno/.test(comSelo));
// Retorno não tem nota. Input vazio ali pediria pra alguém preencher e sumiria
// no meio dos valores que faltam de verdade.
ok('retorno mostra "grátis", não campo de valor vazio', comSelo.includes('grátis'));
ok('KPI de retrabalho aparece', /Retorno[\s\S]{0,300}% das idas/.test(comSelo));

console.log('\n"não está no estoque" — mas às vezes está\n');

// Auditoria de 26/ago/2026: TRÊS aparelhos do estoque estavam registrados pelo
// caminho manual, sem apple_id. Um deles (SP829, iPhone 15 Azul, R$ 2.400,
// available) tinha caído FORA da lista de "não vender": o painel dizia que dava
// pra vender um aparelho que estava na RR.
const sug = (function(){
  const antes = R('_bancadaCache');
  R('_bancadaCache = [];');
  R("_bncManual = {modelo:'16 rosa', imei4:''};");
  const r = {};
  R("_bncManual.imei4 = '858';");  r.parcial = R('bncSugCandidatos().length');
  R("_bncManual.imei4 = '0000';"); r.zeros   = R('bncSugCandidatos().length');
  R("_bncManual.imei4 = '9999';"); r.nada    = R('bncSugCandidatos().length');
  R("_bncManual.imei4 = '8580';");
  r.acha = R('bncSugCandidatos().map(i => i.id)');
  r.html = R('bncSugEstoque()');
  R('bncUsarDoEstoque(101);');
  r.depoisManual = R('_bncManual');
  r.depoisSel    = R('[..._bncSel]');
  R('_bncManual = null; _bncSel = new Set();');
  R('_bancadaCache = ' + JSON.stringify(antes));
  return r;
})();

eq('acha o aparelho do estoque pelos 4 do IMEI', sug.acha, [101]);
eq('menos de 4 dígitos não sugere nada', sug.parcial, 0);
// '0000' é o "não sei o IMEI" da planilha: sugerir por ele juntaria aparelhos
// que não têm nada a ver.
eq('0000 nunca sugere', sug.zeros, 0);
eq('IMEI que não existe no estoque não sugere', sug.nada, 0);
// ⚠️ SUGERE, não casa sozinho: mostra modelo, cor, etiqueta e custo pra pessoa
// confirmar OLHANDO. Casar por 4 dígitos sozinho já colou um aparelho de
// cliente num apple do estoque (15/ago/2026), com o sinal invertido.
ok('a sugestão mostra a etiqueta pra pessoa desempatar', sug.html.includes('E1030'));
ok('e o modelo', /16\b/.test(sug.html));
ok('e é um botão, não um casamento automático', sug.html.includes('bncUsarDoEstoque(101)'));
// Aceitar a sugestão troca o caminho manual pelo do estoque: com apple_id vêm
// o selo no Estoque, o capital parado e a lista de "não vender".
eq('aceitar sai do modo manual', sug.depoisManual, null);
eq('e seleciona o aparelho do estoque', sug.depoisSel, ['101']);

// Aparelho que JÁ está fora não pode ser sugerido de novo — viraria segunda
// linha aberta pro mesmo aparelho.
const sugFora = (function(){
  R("_bancadaCache = [{id:1, apple_id:101, imei4:'8580', fornecedor:'RR', origem:'estoque'," +
    " servico:'x', saiu_em:'2026-08-10', voltou_em:null}];");
  R("_bncManual = {modelo:'x', imei4:'8580'};");
  const n = R('bncSugCandidatos().length');
  R('_bncManual = null; _bancadaCache = [];');
  return n;
})();
eq('aparelho que já está fora não é sugerido', sugFora, 0);

console.log('\nhistórico de assistência dentro do aparelho (tela Estoque)\n');

// Até 26/ago/2026 o Estoque mostrava só `reparo −R$300`: o total, sem dizer o
// que foi feito, quando nem onde. Saber se valia consertar de novo exigia sair
// da tela, abrir a Assistência e buscar pelo IMEI.
const hist = (function(){
  const antesB = R('_bancadaCache'), antesR = R('_reparosCache');
  R("_bancadaCache = [" +
    // ida COM nota dentro dela (mesmo fornecedor, data entre saiu e voltou)
    "{id:90,apple_id:101,imei4:'8580',fornecedor:'RR',origem:'estoque'," +
    " servico:'Troca de tela',saiu_em:'2026-07-10',voltou_em:'2026-07-15'}," +
    // ida DEPOIS da última nota carregada (08/ago): nota ainda não existe
    "{id:91,apple_id:101,imei4:'8580',fornecedor:'RR',origem:'estoque'," +
    " servico:'Subida de bateria',saiu_em:'2026-08-20',voltou_em:'2026-08-21'}," +
    // retorno na garantia: é grátis, não é cobrança faltando
    "{id:92,apple_id:101,imei4:'8580',fornecedor:'RR',origem:'estoque'," +
    " servico:'Subida de bateria',saiu_em:'2026-08-22',voltou_em:'2026-08-23',retorno_de:91}," +
    // ainda fora
    "{id:93,apple_id:101,imei4:'8580',fornecedor:'ACCESS',origem:'estoque'," +
    " servico:'Face ID',saiu_em:'2026-08-25',voltou_em:null}]");
  R("_reparosCache = [" +
    "{id:70,apple_id:101,fornecedor:'RR',servico:'Troca de Tela',valor_liquido:300,data_servico:'2026-07-12',status:'ok'}," +
    // nota SEM ida registrada: o livro da bancada só começou depois
    "{id:71,apple_id:101,fornecedor:'RR',servico:'Conector de Carga',valor_liquido:180,data_servico:'2026-08-08',status:'ok'}," +
    // outro aparelho: não pode vazar pra este
    "{id:72,apple_id:202,fornecedor:'RR',servico:'Face ID',valor_liquido:900,data_servico:'2026-08-01',status:'ok'}]");
  const d = R('bncHistoricoDoApple(101, "350000000008580")');
  const h = R('bncHistoricoHtml(101, "350000000008580")');
  const vazio = R('bncHistoricoHtml(303, "350000000003324")');
  // `reparo` na margem real vem da view v_estoque_margem, não do cache local --
  // e é ela que alimenta o campo "Investido".
  const antesM = R('_margemExtra');
  R("setMargemExtra([{apple_id:101, dias_parado:30, reparo:480, entrou_em:'2026-07-01'}]);");
  R('estoqueAbertos.add(101); _origem[101] = null;');
  const tela = R('(function(){ currentTab="estoque"; return renderEstoque(); })()');
  R('estoqueAbertos.delete(101); _margemExtra = ' + JSON.stringify(antesM) + ';');
  R('_bancadaCache = ' + JSON.stringify(antesB));
  R('_reparosCache = ' + JSON.stringify(antesR));
  return { d, h, vazio, tela };
})();

eq('o total em nota é só deste aparelho', hist.d.total, 480);
eq('4 idas + 1 nota que não coube em nenhuma = 5 linhas', hist.d.linhas.length, 5);
// ⚠️ A nota cai DENTRO da ida por contenção (mesmo fornecedor, data entre saiu
// e voltou). Nunca por chute: o que não encaixa vira linha própria.
eq('a nota de 12/jul entra na ida de 10→15/jul', hist.d.linhas[0].valor, 300);
eq('e a ida some a nota certa', hist.d.linhas[0].ida.id, 90);
ok('a nota de 08/ago, sem ida, vira linha própria',
   hist.d.linhas.some(x => x.tipo === 'nota' && x.nota.id === 71));
ok('nota de outro aparelho não vaza', !JSON.stringify(hist.d).includes('"id":72'));

// ⚠️ As duas fontes NÃO se somam: a nota é o dinheiro, a ida é o paradeiro.
// Somar contaria o mesmo conserto duas vezes.
ok('o total é o da nota, não nota + idas', hist.h.includes('em nota'));
ok('a tela avisa que não se somam', /não se somam/.test(hist.h));

// Sem valor tem TRÊS motivos diferentes. Confundi-los faz o dono achar que
// tem cobrança faltando quando não tem.
ok('retorno aparece como grátis', /grátis/.test(hist.h));
ok('ida depois da última nota diz que a nota não chegou',
   /nota não carregada/.test(hist.h));
ok('ida em aberto diz "ainda fora"', /ainda fora/.test(hist.h));

ok('diz o serviço que foi feito', hist.h.includes('Troca de tela'));
ok('aparelho sem histórico não gera bloco vazio', hist.vazio === '');

// O bloco tem que aparecer DE VERDADE na tela de Estoque, com o aparelho
// aberto -- é lá que a pergunta "vale consertar de novo?" acontece.
ok('a tela de Estoque monta com o bloco dentro', /est-rep-linha/.test(hist.tela));
ok('e mostra o total investido (compra + reparo)', /Investido/.test(hist.tela));

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo certo.\n');
process.exit(falhas ? 1 : 0);
