// ===========================================================================
// Teste da tela de PÓS-VENDA — roda com:
//   node test/consulta.test.js
//
// O que este teste protege:
//
//  1. O TETO DE DINHEIRO. A tela existe pra quem NÃO vê custo. Ela lê
//     v_venda_consulta/_itens, que não trazem custo_total, lucro nem
//     valor_estoque -- e o HTML não pode inventar nenhum dos três.
//  2. O SELO DE ASSISTÊNCIA casa por apple_id e, na falta, pelos 4 do IMEI --
//     a mesma regra do resto do projeto (docs/CONTROLE-MANUTENCAO.md).
//  3. "HÁ N DIAS" NÃO É "ESTÁ NA GARANTIA". O prazo por produto não existe no
//     sistema; afirmar garantia a partir de uma data seria inventar regra.
//  4. Aparelho de cliente SEM contato registrado tem que APARECER como sem
//     contato -- é o buraco que as colunas novas da `bancada` vieram tapar, e
//     escondê-lo faria parecer resolvido.
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
  navigator: {},
  Date, Math, JSON, Set, Map, Object, Array, String, Number, parseFloat, parseInt,
  isNaN, RegExp, Error, Promise, setTimeout, clearTimeout, encodeURIComponent,
};
ctx.globalThis = ctx; vm.createContext(ctx);
for (const f of ['config.js','equipe.js','core.js','render.js','custos.js','estoque.js',
                 'ui.js','bancada.js','meudia.js','vitrine.js','consulta.js','shell.js'])
  vm.runInContext(fs.readFileSync(path.join(ROOT,'js',f),'utf8'), ctx, {filename:f});

let falhas = 0;
const ok  = m => console.log('  ok     ' + m);
const bad = m => { falhas++; console.log('  FALHOU ' + m); };
const R = js => vm.runInContext(js, ctx);

// A Maria: vende e atende, papel comercial. É quem faz pós-venda.
R(`
  meuPerfil = { papel:'comercial', nome:'Maria', vo_key:'maria', at_key:'maria', ativo:true };
  usuarioEmail = 'mariaaveloso28@gmail.com';
  currentTab = 'consulta';
  cnsVendas = [
    { id:40611960, data_saida:'2026-08-17T14:53:00+00:00', status:'completed', loja:'urban',
      cliente_nome:'Gabriela Lettieri', cliente_tel:'(11) 97777-1234', cliente_cidade:'São Paulo',
      valor_total:4850, qtd_produtos:3, vendedor_key:'mel', atendente_key:'leo' },
  ];
  cnsItens = { 40611960: [
    { id:1, venda_id:40611960, apple_id:607036, titulo:'iPhone 15 Pro Max 256GB Titânio Natural',
      serial:'E1590', imei_1:'350496309423206', preco:3950, quantidade:1 },
    { id:2, venda_id:40611960, apple_id:null, titulo:'Pelicula Vidro Privativo',
      serial:null, imei_1:null, preco:80, quantidade:1 },
  ]};
  cnsFora = [
    { id:70, apple_id:607036, imei4:'3206', modelo_txt:'15 Pro Max Titânio Natural',
      fornecedor:'RR', origem:'cliente', servico:'Troca de tela', saiu_em:'2026-08-24',
      voltou_em:null, cliente_nome:'Gabriela Lettieri', cliente_tel:'(11) 97777-1234', dias_fora:3 },
    { id:71, apple_id:null, imei4:'8849', modelo_txt:'13 Pro Max Azul',
      fornecedor:'ACCESS', origem:'garantia', servico:'Não liga', saiu_em:'2026-08-12',
      voltou_em:null, cliente_nome:null, cliente_tel:null, dias_fora:14 },
  ];
  cnsForaCarregado = true; cnsJaBuscou = true; cnsAberta = 40611960; cnsErro = ''; cnsBuscando = false;
`);

console.log('\na ficha da venda\n');
const ficha = R('renderConsulta()');

if (ficha.includes('Gabriela Lettieri')) ok('acha o cliente');
else bad('o nome do cliente não apareceu');
// O IMEI é o que a pessoa confere com o aparelho na mão (§9 dos atendentes).
if (/IMEI ⋯423206/.test(ficha)) ok('mostra o IMEI do aparelho vendido');
else bad('o IMEI não apareceu');
if (/R\$\s?4\.850/.test(ficha)) ok('mostra o valor da venda (podeVerValor é sim pro comercial)');
else bad('o valor da venda não apareceu');

// -- 1. o teto de dinheiro --------------------------------------------------
console.log('\no que esta tela NUNCA pode mostrar\n');
// Não há custo no dado que chega; o teste falha se alguém no futuro plugar a
// tabela `vendas` aqui "porque era mais fácil".
if (!/lucro|custo|margem/i.test(ficha)) ok('nenhuma palavra de custo, lucro ou margem no HTML');
else bad('vazou custo/lucro/margem na tela do comercial');

// -- 2. o selo de assistência ----------------------------------------------
console.log('\no aparelho está na assistência agora?\n');
if (/na assistência há 3d/.test(ficha)) ok('o aparelho que está fora ganha selo na ficha');
else bad('o selo de assistência não apareceu');
// Casamento por apple_id (o caso acima) e por 4 dígitos (o de baixo).
const porImei = R(`cnsNaAssistencia({apple_id:null, imei_1:'358888888888849'})`);
if (porImei && porImei.id === 71) ok('sem apple_id, casa pelos 4 últimos do IMEI');
else bad('o casamento por 4 dígitos não funcionou');
const semCasar = R(`cnsNaAssistencia({apple_id:999, imei_1:'350000000000001'})`);
if (semCasar === null) ok('aparelho que não está fora não ganha selo');
else bad('casou um aparelho que não está na assistência');

// -- 3. garantia: o fato, não a conclusão -----------------------------------
console.log('\ngarantia — diz o fato, não inventa a regra\n');
if (/há \d+ dias?/.test(ficha)) ok('mostra há quantos dias a venda foi feita');
else bad('não mostra o tempo desde a venda');
// ⚠️ O prazo por produto não existe no sistema. Dizer "na garantia" a partir da
// data seria o painel decidindo uma regra comercial que ninguém cadastrou.
if (!/na garantia|fora da garantia|dentro da garantia/i.test(ficha))
  ok('NÃO afirma se está na garantia — o prazo não existe no sistema');
else bad('a tela afirmou garantia sem ter a regra cadastrada');

// -- 4. quem está esperando -------------------------------------------------
console.log('\naparelhos de cliente na assistência (§9)\n');
R('cnsJaBuscou = false;');
const lista = R('renderConsulta()');
if (/Aparelhos de cliente na assistência/.test(lista)) ok('a lista abre antes de qualquer busca');
else bad('a lista de quem está esperando não apareceu');
if (/1 sem dono registrado/.test(lista)) ok('conta quantos estão sem dono registrado');
else bad('não avisa que há aparelho sem dono');
if (/sem contato/.test(lista)) ok('o que não tem contato aparece como "sem contato"');
else bad('aparelho sem contato foi escondido');
// 14 dias fora é vermelho: é o número que faz o pós-venda cobrar a assistência.
if (/critico[^>]*>14d<|>14d<[\s\S]{0,30}critico/.test(lista) || /c-badge[^>]*critico[^>]*>14d</.test(lista))
  ok('mais de 10 dias fora sai em vermelho');
else bad('14 dias fora não virou alerta');
// O link de WhatsApp é o gesto seguinte: avisar o cliente (§9).
if (/wa\.me\/5511977771234/.test(lista)) ok('o telefone vira link de WhatsApp, sem máscara');
else bad('o link de WhatsApp não foi montado');

// -- 4b. o que NÃO carregou não pode virar tela vazia ------------------------
// Mesmo erro do ✅ verde com janela vazia da Conferência: "não deu pra conferir"
// não é "está tudo certo". Se a lista falhar, o pós-venda tem que SABER.
console.log('\nfalha de carga não vira "ninguém esperando"\n');
R(`cnsJaBuscou = false; cnsFora = []; cnsForaErro = 'Supabase v_assistencia_cliente: 500';`);
const comFalha = R('renderConsulta()');
if (/Não consegui ver quem está esperando/.test(comFalha)) ok('a falha aparece na tela');
else bad('a falha da carga sumiu em silêncio');
if (/NÃO quer dizer que não há ninguém esperando/.test(comFalha))
  ok('e diz explicitamente que isso não é "não há ninguém"');
else bad('a tela não desfaz a leitura errada');

R(`cnsForaErro = ''; cnsFora = [];`);
const vazio = R('renderConsulta()');
if (/Nenhum aparelho de cliente na assistência/.test(vazio) && !/Não consegui/.test(vazio))
  ok('carregou e está vazio de verdade diz outra coisa');
else bad('vazio real e falha estão dizendo a mesma coisa');

// Duplo Enter não dispara duas rodadas de requisição.
R(`cnsBuscando = true; cnsBusca = 'teste'; cnsErro = 'nao-tocado';`);
R(`cnsBuscar()`);
if (R('cnsErro') === 'nao-tocado') ok('busca em andamento ignora um segundo disparo');
else bad('duplo Enter disparou duas buscas');
R(`cnsBuscando = false; cnsErro = '';`);

// -- 4c. telefone que não dá pra ligar não vira link -------------------------
// 11 dos 4.865 telefones do banco são placeholder ("00000000000"). Link pra eles
// abriria o WhatsApp num número inexistente, e a pessoa concluiria que o cliente
// não tem WhatsApp -- quando o que houve foi cadastro vazio.
console.log('\ntelefone: link só quando dá pra ligar\n');
if (R(`cnsTelValido('(11) 97777-1234')`) === '11977771234') ok('telefone normal vira 11 dígitos');
else bad('telefone válido não passou');
if (R(`cnsTelValido('00000000000')`) === null) ok('placeholder de zeros não é telefone');
else bad('o placeholder virou link');
if (R(`cnsTelValido('119140050')`) === null) ok('número curto demais não vira link');
else bad('número curto passou');
const htmlTel = R(`cnsTelHtml('00000000000')`);
if (/inválido/.test(htmlTel) && !/wa\.me/.test(htmlTel)) ok('inválido aparece como texto, dizendo que é inválido');
else bad('o inválido virou link mesmo assim');

// -- 4d. a query que a busca monta ------------------------------------------
// ⚠️ ESTE É O TESTE QUE FALTAVA. O bug que quebrava a busca -- colar
// "(11) 97777-1234" fechava o `or=(...)` do PostgREST no meio e a API devolvia
// 400 -- passou por 14 baterias verdes porque NENHUM teste do projeto monta uma
// query. O cálculo e a tela eram provados; a fronteira com o banco, não.
console.log('\na query que vai pro banco\n');

// Tira o que está entre aspas: o que sobra é a SINTAXE, e nela vírgula e
// parêntese têm significado. Se um termo vazar pra fora das aspas, aparece aqui.
const soSintaxe = f => f.replace(/"[^"]*"/g, '""');
const hostis = [
  '(11) 97777-1234',            // o caso real: telefone colado do WhatsApp
  'Silva, João',                // vírgula separa condições no `or`
  'Maria (mãe da Ana)',         // parêntese fecha o grupo
  'a,b)or=(id.eq.1',            // tentativa de emendar outro filtro
  'José "Zé" da Silva',         // aspas fechariam o valor
  'C:\\Users\\x',               // barra invertida escaparia a aspa
  '50% de desconto',            // % é curinga do LIKE
  '   ',                        // só espaço
];
let sintaxeOk = true, aspasOk = true;
for(const q of hostis){
  for(const f of [R(`cnsFiltroItens(${JSON.stringify(q)})`), R(`cnsFiltroGente(${JSON.stringify(q)})`)]){
    const nu = soSintaxe(f);
    // Fora das aspas só pode existir a estrutura: or=(campo.op."",campo.op."")
    if(!/^(or=\(\w+\.\w+\.""(,\w+\.\w+\."")*\)|\w+=\w+\.""|\w+=\w+\."")$/.test(nu)){
      sintaxeOk = false; console.log('         quebrou com ' + JSON.stringify(q) + ' -> ' + nu);
    }
    // e o número de aspas tem que ser par: ímpar = valor não fechado
    if((f.match(/"/g) || []).length % 2 !== 0) aspasOk = false;
  }
}
if(sintaxeOk) ok('nenhum termo hostil vaza pra fora das aspas');
else bad('um termo quebrou a sintaxe do filtro');
if(aspasOk) ok('as aspas sempre fecham');
else bad('sobrou aspa aberta — o valor vazaria');

// O telefone entra por dígitos, sem máscara: o banco guarda 11 dígitos limpos.
if (/cliente_tel\.like\."\*11977771234\*"/.test(R(`cnsFiltroGente('(11) 97777-1234')`)))
  ok('telefone com máscara vira dígitos no filtro');
else bad('a máscara do telefone foi pro filtro');
// Busca curta não vai pro campo de telefone (todo mundo tem "12" no número).
if (!/cliente_tel/.test(R(`cnsFiltroGente('ana')`))) ok('termo curto não procura em telefone');
else bad('termo de texto foi parar no filtro de telefone');

// -- 5. o menu --------------------------------------------------------------
console.log('\nquem alcança a tela\n');
if (R(`podeVer('consulta')`)) ok('comercial alcança o Pós-venda');
else bad('comercial não alcança o Pós-venda');
R(`meuPerfil = { papel:'bancada', nome:'Vitinho', at_key:'vitinho', ativo:true };`);
if (R(`podeVer('consulta')`) === false) ok('bancada NÃO alcança (valor de venda não é do papel dele)');
else bad('a bancada ganhou acesso a valor de venda');
R(`meuPerfil = { papel:'socio', nome:'Breno', ativo:true }; usuarioEmail='breno@phonestp.com';`);
if (R(`podeVer('consulta')`) === false) ok('sócio não vê tela duplicada (ele tem Vendas inteira)');
else bad('sócio ganhou uma tela duplicada');

console.log(falhas ? `\n### ${falhas} falha(s)` : '\n### tudo verde');
process.exit(falhas ? 1 : 0);
