// ============================================================================
// BANCADA — o que esta fora da loja, na assistencia
//
// Antes desta tela o painel nao sabia que o aparelho tinha saido: ele ficava
// `available` no Estoque ate voltar. Em 12/ago/2026 eram 43 aparelhos e
// R$ 87 mil (16% do estoque disponivel) fisicamente na bancada, todos
// aparecendo como disponiveis. Ver docs/CONTROLE-MANUTENCAO.md.
//
// A regra unica: APARELHO NAO SAI SEM LINHA, NAO VOLTA SEM BAIXA.
//
// Esta e uma tabela DO PAINEL (nao vem da FoneNinja) -- o browser grava direto,
// igual custos/metas_mensais. `bancada` tem policy auth_all.
// ============================================================================

// ⚠️ Nomes top-level daqui NAO podem existir em nenhum outro js/ — <script>
// classicos compartilham um escopo global (ver CLAUDE.md). Por isso o prefixo
// `bnc`/`bancada` em tudo.

// Servicos tirados do que a nota realmente cobra (tabela `reparos`), nao de
// imaginacao. "Subida de bateria" vem primeiro porque e 125 das 175 linhas.
const BNC_SERVICOS = [
  'Subida de bateria', 'Troca de bateria', 'Troca de tela', 'Troca de vidro da tela',
  'Troca de tampa traseira', 'Troca de carcaça', 'Face ID', 'Conector de carga',
  'Botão power / NFC', 'Câmera traseira', 'Câmera frontal', 'Lente de câmera',
  'Auricular', 'Alto-falante', 'Reparo em placa',
  'Não liga', 'Análise',
];

// Carcaça, botão power/NFC e câmera frontal entraram em 19/ago/2026 a pedido do
// dono: acontecem na bancada, mas a nota da RR escreve com outras palavras
// (a da Access é texto livre), então não apareciam no histórico de `reparos`.
// Enquanto não houver 3 notas com esse nome, o preço de referência fica em
// branco -- que é o certo: 2 amostras não são um padrão.

// ---------------------------------------------------------------------------
// SERVIÇO — mais de um por aparelho
//
// A nota já cobra assim: "Subida de Bateria + Troca de Bateria" é uma linha só,
// e combos são 20 das 175 linhas da RR. Guardar no MESMO formato (um texto,
// partes separadas por " + ") é o que faz o preço de referência continuar
// valendo pro combo -- e evita uma tabela filha pra guardar duas palavras.
// ---------------------------------------------------------------------------
const BNC_SERV_SEP = ' + ';

function bncPartesServico(txt){
  return String(txt || '').split(/\s*[+,]\s*/).map(s => s.trim()).filter(Boolean);
}

function bncJuntarServico(lista, extra){
  const vistos = new Set(), out = [];
  (lista || []).concat(bncPartesServico(extra)).forEach(s => {
    const k = s.toLowerCase();
    if(!vistos.has(k)){ vistos.add(k); out.push(s); }
  });
  return out.length ? out.join(BNC_SERV_SEP) : null;
}

// "A + B" e "B + A" são o mesmo serviço. Sem normalizar, a mediana perderia
// metade das amostras -- e referência com menos de 3 amostras não existe.
function bncNormServico(txt){
  return bncPartesServico(txt).map(s => s.toLowerCase()).sort().join('+');
}

// Separa o que está na lista de chips do que foi digitado à mão. É isso que
// permite editar uma linha antiga sem comer o texto que veio da planilha
// ("traseira,up", "NFC") -- o desconhecido volta pro campo livre, não some.
function bncSepararServico(txt){
  const conhecidos = new Map(BNC_SERVICOS.map(s => [s.toLowerCase(), s]));
  const sel = [], extra = [];
  bncPartesServico(txt).forEach(p => {
    const k = conhecidos.get(p.toLowerCase());
    if(k){ if(sel.indexOf(k) < 0) sel.push(k); } else extra.push(p);
  });
  return { sel, extra: extra.join(BNC_SERV_SEP) };
}

function bncChipsServico(sel, fn){
  return BNC_SERVICOS.map((s, i) =>
    UI.chip(UI.esc(s), (sel || []).indexOf(s) >= 0, `${fn}(${i})`)).join('');
}

const BNC_DIAS_ALERTA = 14;   // acima disso o aparelho vira cobranca, nao registro

// ---------------------------------------------------------------------------
// RETORNO — a garantia que a ASSISTENCIA nos da do servico dela
//
// Nao confundir com a nossa garantia pro cliente. Sao duas garantias em
// sentidos opostos, e ate 26/ago/2026 as duas moravam na mesma palavra: das 9
// linhas com origem `garantia`, 3 eram de aparelho `available` (nunca vendido)
// -- e uma delas trazia "Garantia assistencia" escrito na OBSERVACAO a mao,
// porque o campo nao existia.
//
// Retorno nao aparece na nota: nao ha uma unica linha de R$ 0,00 nas 205 de
// `reparos`. Servico refeito de graca so existe se for registrado aqui.
const BNC_RETORNO_DIAS = 90;   // fora disso a tela nao sugere -- e servico novo

// ⚠️ A taxa de retrabalho so conta a partir daqui, pela mesma razao da
// Conferencia. 18/ago e o dia em que o Vitinho passou a registrar NA TELA (47
// linhas dele comecam ali); as 100 linhas anteriores vieram da planilha
// importada, onde a pergunta "e retorno?" nao existia. Dividir por um
// denominador que nao sabia da pergunta produz um numero que parece medido e
// nao e.
const BNC_RETORNO_DESDE = '2026-08-18';

let _bancadaCache = null;     // null = nunca carregou; [] = carregou e esta vazia
let _bncCarregando = false;
let _bncAba        = 'abertas';
let _bncBusca      = '';
let _bncSel        = new Set();   // apple_ids marcados no modal (lote)
let _bncForn       = 'RR';
let _bncRetornoDe  = null;   // id da ida anterior, quando esta e um retorno
let _bncServs      = [BNC_SERVICOS[0]];  // mais de um serviço por aparelho
let _bncServExtra  = '';                 // serviço que não está na lista
let _bncObs        = '';
let _bncManual     = null;    // {modelo, imei4} quando o aparelho nao e do estoque
let _bncSalvando   = false;
let _bncErro       = '';
let _bncFiltro     = '';      // busca da tela (achar o aparelho na lista)
let _bncEditId     = null;    // linha aberta no editor de serviços
let _bncEditServs  = [];
let _bncEditExtra  = '';

// ---------------------------------------------------------------------------
// DADOS
// ---------------------------------------------------------------------------

async function carregarBancada(){
  if(_bncCarregando) return _bancadaCache || [];
  _bncCarregando = true;
  try {
    _bancadaCache = await sbGet('bancada', 'order=saiu_em.desc,id.desc', 1000) || [];
  } catch(e){
    console.error('[bancada] falha ao carregar:', e);
    _bancadaCache = _bancadaCache || [];
  } finally { _bncCarregando = false; }
  return _bancadaCache;
}

function bncAbertas(){ return (_bancadaCache || []).filter(l => !l.voltou_em); }

// Mesma chave do resto da tela: apple_id manda, 4 do IMEI e a reserva. Nunca
// etiqueta -- E1030 e SP1030 colidem sem o prefixo (138 itens do estoque).
function bncMesmoAparelho(a, b){
  if(a.apple_id && b.apple_id) return String(a.apple_id) === String(b.apple_id);
  const x = String(a.imei4 || ''), y = String(b.imei4 || '');
  return x.length === 4 && x !== '0000' && x === y;
}

// A ultima ida FECHADA deste aparelho, dentro da janela de garantia. E ela que
// a tela oferece como "e retorno disto?".
//
// Sugerir e trabalho de maquina; dizer se e o MESMO defeito e trabalho de quem
// esta com o aparelho na mao. Por isso a tela pergunta e nao decide.
function bncUltimaFechada(alvo){
  const hoje = new Date(bncHoje() + 'T12:00:00').getTime();
  return (_bancadaCache || [])
    .filter(l => l.voltou_em && bncMesmoAparelho(l, alvo))
    .filter(l => (hoje - new Date(String(l.voltou_em).slice(0,10) + 'T12:00:00').getTime())
                 / 86400000 <= BNC_RETORNO_DIAS)
    .sort((a, b) => String(b.voltou_em).localeCompare(String(a.voltou_em)))[0] || null;
}

// ---------------------------------------------------------------------------
// DA PRATELEIRA OU TEM DONO? — derivado, nao perguntado
//
// O caminho ja respondeu: quem foi achado na busca do estoque tem `apple_id` e
// esta `available`; quem entrou por "nao esta no estoque" nao tem. O dropdown
// de origem pedia a mesma informacao uma segunda vez -- e em 4 das 37 linhas
// abertas de 26/ago as duas respostas se contradiziam (3 `garantia` e 1
// `cliente` em aparelho que nunca saiu do estoque).
//
// ⚠️ So a lista VIVA deriva. `estoque.status` e o estado de HOJE: 35 das 111
// linhas fechadas sao de aparelho consertado e vendido DEPOIS, e derivar ali
// diria "do cliente" pra reparo que entrou no custo de aquisicao. Linha fechada
// ha mais de um dia e historia: vale o que foi gravado.
//
// ⚠️ GUARDA: sem estoque carregado, NAO deriva. `estoqueItens` vazio faria toda
// linha virar "tem dono" e a lista de "nao vender" sair VAZIA -- o balcao
// venderia aparelho que esta fora, o inverso exato do que esta tela existe pra
// fazer. E o modo de falha do CLAUDE.md: 200 com lista vazia e ninguem
// desconfia.
function bncDaPrateleira(l){
  const vivo = !l.voltou_em || String(l.voltou_em).slice(0,10) === bncHoje();
  if(!vivo || !(estoqueItens || []).length) return l.origem === 'estoque';
  // ⚠️ SEM apple_id NAO E "tem dono" -- e "nao da pra derivar". Ali vale o que
  // foi gravado, e o caminho manual grava 'cliente'. Sao 15 linhas importadas
  // da planilha com origem 'estoque' e sem id: tratar id ausente como dono
  // tiraria todas elas da lista de "nao vender", que e o lugar delas.
  if(!l.apple_id) return l.origem === 'estoque';
  return (estoqueItens || []).some(i => String(i.id) === String(l.apple_id));
}

// ---------------------------------------------------------------------------
// CONFERÊNCIA — a nota bate com o que foi registrado?
//
// `reparos` é o DINHEIRO (vem da nota, depois do fato, via scripts/reparos.js).
// `bancada` é o PARADEIRO (vem da pessoa, durante). Cruzar os dois é o que
// transforma "achei que registrei tudo" em uma lista.
//
// ⚠️ A conferência SÓ COBRA a partir do dia em que o controle começou. Em
// 13/ago a bancada tinha 1 registro e `reparos` tinha 205 linhas de jul+ago:
// cobrar tudo apontaria 204 faltas e ninguém olharia a tela de novo. Falta de
// registro antes do primeiro registro não é falha, é história.
// ---------------------------------------------------------------------------

let _reparosCache = null;      // só sócio: `reparos` tem policy reparos_socio
let _repCarregando = false;

async function carregarReparosBancada(){
  if(_repCarregando || !podeVerMargem()) return _reparosCache || [];
  _repCarregando = true;
  try {
    _reparosCache = await sbGet('reparos',
      'select=id,apple_id,fornecedor,servico,valor_liquido,data_servico,imei_nota,etiqueta_nota,modelo_nota,status&order=data_servico.desc',
      3000) || [];
  } catch(e){
    console.warn('[bancada] não li reparos:', e.message);
    _reparosCache = _reparosCache || [];
  } finally { _repCarregando = false; }
  return _reparosCache;
}

// Dia em que o LIVRO começou — `criado_em`, não `saiu_em`.
//
// ⚠️ A diferença importa e custou um susto: ao carregar os 39 abertos da
// planilha do Vitinho (13/ago), a saída mais antiga era de **11/mai**. Com
// `saiu_em`, a conferência passaria a comparar julho inteiro contra um livro
// que só existe desde agora, e cuspiria ~150 falsas "faltas de registro" no
// primeiro dia. `criado_em` diz a verdade: o registro passou a ser confiável
// quando foi feito, não quando o aparelho saiu.
function bncDesde(){
  const datas = (_bancadaCache || [])
    .map(l => String(l.criado_em || l.saiu_em || '').slice(0,10))
    .filter(Boolean).sort();
  return datas[0] || null;
}

const bncFim4 = s => String(s || '').replace(/\D/g,'').slice(-4);

// Mesma chave dos dois lados: apple_id manda; sem ele, fornecedor + 4 dígitos.
function bncChaveReparo(r){
  if(r.apple_id) return 'a' + r.apple_id;
  const d = bncFim4(r.imei_nota) || bncFim4(r.etiqueta_nota);
  return d ? 'i' + r.fornecedor + d : null;
}
function bncChaveLinha(l){
  if(l.apple_id) return 'a' + l.apple_id;
  return l.imei4 ? 'i' + l.fornecedor + bncFim4(l.imei4) : null;
}

// A régua tem DUAS bordas, e faltava a de cima.
//
// `desde` protege o passado: linha de nota anterior ao livro é história. Mas a
// nota vive num arquivo carregado à mão (`node scripts/reparos.js`), e ela
// ATRASA. Em 26/ago/2026 o livro começava em 13/ago e a última nota carregada
// era de **08/ago**: a janela era vazia por construção, e mesmo assim a
// conferência acusava **40 aparelhos** em "voltou e não apareceu na cobrança".
// Todos falsos — a nota deles não tinha sido carregada ainda.
//
// É o mesmo erro que a borda de baixo já evitava, entrando pelo outro lado.
function bncUltimaNota(){
  const datas = (_reparosCache || [])
    .filter(r => r.status !== 'revisar')
    .map(r => String(r.data_servico || '').slice(0,10))
    .filter(Boolean).sort();
  return datas[datas.length - 1] || null;
}

function bncConciliar(){
  const desde = bncDesde();
  if(!desde) return null;
  const ate = bncUltimaNota();

  const reparos = (_reparosCache || []).filter(r =>
    r.data_servico && r.data_servico >= desde && r.status !== 'revisar');
  const linhas = (_bancadaCache || []).filter(l => l.saiu_em >= desde);

  // Por APARELHO, somando: a nota quebra um conserto em várias linhas, e
  // comparar linha a linha inventaria divergência que não existe.
  const porNota = {}, porReg = {};
  reparos.forEach(r => {
    const k = bncChaveReparo(r); if(!k) return;
    (porNota[k] = porNota[k] || { chave:k, linhas:[], total:0, fornecedor:r.fornecedor,
      modelo:r.modelo_nota, servicos:[] });
    porNota[k].linhas.push(r);
    porNota[k].total += parseFloat(r.valor_liquido || 0);
    if(r.servico) porNota[k].servicos.push(r.servico);
  });
  linhas.forEach(l => {
    const k = bncChaveLinha(l); if(!k) return;
    (porReg[k] = porReg[k] || { chave:k, linhas:[], cobrado:0, temValor:false });
    porReg[k].linhas.push(l);
    if(l.valor_cobrado != null){ porReg[k].cobrado += parseFloat(l.valor_cobrado); porReg[k].temValor = true; }
  });

  const semRegistro = [], semNota = [], valorDiferente = [];

  Object.values(porNota).forEach(n => {
    if(!porReg[n.chave]) semRegistro.push(n);
  });
  Object.values(porReg).forEach(g => {
    const n = porNota[g.chave];
    // Só cobra nota de quem já VOLTOU: o que ainda está fora não foi faturado.
    // Só cobra nota de quem voltou DENTRO da janela que a nota cobre. O que
    // voltou depois da última nota carregada ainda não pôde ser faturado --
    // acusar isso é cobrar o futuro.
    const voltou = g.linhas.some(l => l.voltou_em && (!ate || l.voltou_em <= ate));
    // Retorno nao aparece na nota por definicao -- servico refeito na garantia
    // nao e cobrado, e nao ha uma linha de R$ 0,00 nas 205 de `reparos`.
    // Cobrar nota dele seria alarme falso: o mesmo erro que a conferencia ja
    // evitou ao so cobrar de `criado_em` pra frente.
    const soRetorno = g.linhas.every(l => l.retorno_de);
    if(!n && voltou && !soRetorno) semNota.push(g);
    else if(n && g.temValor && Math.abs(n.total - g.cobrado) >= 1){
      valorDiferente.push({ ...g, nota: n.total, dif: g.cobrado - n.total });
    }
  });

  // ⚠️ Janela vazia NÃO é "está tudo certo". Sem essa distinção a tela mostraria
  // o ✅ verde justamente quando nada foi comparado -- uma mentira mais cara que
  // os 40 alarmes falsos, porque não pede nada de ninguém.
  return { desde, ate, janelaVazia: !ate || ate < desde,
           semRegistro, semNota, valorDiferente,
           notas: Object.keys(porNota).length, registros: Object.keys(porReg).length };
}

// Preço de referência: a MEDIANA do que já foi pago por este serviço neste
// fornecedor. Nasce do próprio histórico da loja -- não de tabela transcrita à
// mão, que erra em silêncio e produz alarme falso toda semana.
function bncPrecoRef(fornecedor, servico){
  // Normalizado: o combo é comparado como conjunto, não como frase. "Subida de
  // Bateria + Troca de Bateria" e a ordem invertida são o mesmo serviço.
  const alvo = bncNormServico(servico);
  if(!alvo) return null;
  const vals = [];
  (_reparosCache || []).forEach(r => {
    if(r.fornecedor === fornecedor && bncNormServico(r.servico) === alvo)
      vals.push(parseFloat(r.valor_liquido || 0));
  });
  (_bancadaCache || []).forEach(l => {
    // Retorno fica FORA: servico refeito na garantia custa zero, e um zero na
    // lista puxaria a mediana pra baixo e faria a tela acusar "preco fora" em
    // servico normal. Ausencia de preco nao e amostra de preco.
    if(l.fornecedor === fornecedor && l.valor_cobrado != null && !l.retorno_de &&
       bncNormServico(l.servico) === alvo)
      vals.push(parseFloat(l.valor_cobrado));
  });
  if(vals.length < 3) return null;          // 2 amostras não são um padrão
  vals.sort((a,b) => a-b);
  const m = Math.floor(vals.length/2);
  return { valor: vals.length % 2 ? vals[m] : (vals[m-1]+vals[m])/2, n: vals.length };
}

// ---------------------------------------------------------------------------
// HISTÓRICO DE ASSISTÊNCIA DE UM APARELHO — pra tela de Estoque
//
// Até 26/ago/2026 o Estoque mostrava o reparo como UMA linha: `reparo −R$300`,
// dentro da margem real. O total, sem dizer o que foi feito, quando, nem onde.
// Pra saber se valia consertar de novo um aparelho que já tinha voltado duas
// vezes era preciso sair do Estoque, abrir a Assistência e buscar pelo IMEI.
//
// ⚠️ AS DUAS FONTES NÃO SE SOMAM. `reparos` é o DINHEIRO (vem da nota, depois
// do fato); `bancada` é o PARADEIRO (vem da pessoa, durante). Juntar os totais
// conta o mesmo conserto duas vezes. Aqui elas são costuradas por CONTENÇÃO --
// a nota cai dentro da ida quando é do mesmo fornecedor e a data está entre
// saiu e voltou. O que não encaixa aparece como linha própria, nunca chutado.
//
// ⚠️ O total em nota usa SÓ `apple_id`, igual à view `v_estoque_margem`. Casar
// nota por 4 dígitos aqui faria a soma divergir do `reparo −R$X` que a margem
// real já mostra na mesma tela -- dois números diferentes pro mesmo aparelho.
// ---------------------------------------------------------------------------
function bncHistoricoDoApple(appleId, imei){
  const f4 = String(imei || '').replace(/\D/g,'').slice(-4);
  const alvo = { apple_id: appleId, imei4: f4 };

  const idas = (_bancadaCache || [])
    .filter(l => bncMesmoAparelho(l, alvo))
    .sort((a, b) => String(a.saiu_em).localeCompare(String(b.saiu_em)));

  const notas = (_reparosCache || [])
    .filter(r => appleId != null && String(r.apple_id) === String(appleId))
    .sort((a, b) => String(a.data_servico).localeCompare(String(b.data_servico)));

  const usadas = new Set();
  const linhas = idas.map(l => {
    const dentro = notas.filter(r => !usadas.has(r.id)
      && r.fornecedor === l.fornecedor
      && r.data_servico >= l.saiu_em
      && (!l.voltou_em || r.data_servico <= l.voltou_em));
    dentro.forEach(r => usadas.add(r.id));
    return { tipo:'ida', data:l.saiu_em, ida:l, notas:dentro,
             valor: dentro.reduce((a, r) => a + parseFloat(r.valor_liquido || 0), 0) };
  });
  notas.filter(r => !usadas.has(r.id))
       .forEach(r => linhas.push({ tipo:'nota', data:r.data_servico, nota:r,
                                   valor: parseFloat(r.valor_liquido || 0) }));
  linhas.sort((a, b) => String(a.data).localeCompare(String(b.data)));

  return { linhas, idas, notas,
           total: notas.reduce((a, r) => a + parseFloat(r.valor_liquido || 0), 0) };
}

function bncHistoricoHtml(appleId, imei){
  if(typeof podeVerCustoServico !== 'function' || !podeVerCustoServico()) return '';
  const h = bncHistoricoDoApple(appleId, imei);
  if(!h.linhas.length) return '';

  const ate = bncUltimaNota();
  const onde = f => f === 'RR' ? 'RR' : f === 'ACCESS' ? 'Access' : (f || '—');

  const valorHtml = (x) => {
    if(x.valor > 0) return `<b>${moneyServico(x.valor)}</b>`;
    if(x.tipo !== 'ida') return '—';
    // Sem valor tem TRÊS motivos diferentes, e confundi-los é o que faz o dono
    // achar que tem cobrança faltando quando não tem.
    if(x.ida.retorno_de) return UI.badge('↩ grátis', 'alerta');
    if(!x.ida.voltou_em) return '<i class="est-rep-vazio">ainda fora</i>';
    if(ate && x.ida.saiu_em > ate) return '<i class="est-rep-vazio">nota não carregada</i>';
    return '<i class="est-rep-vazio">sem cobrança</i>';
  };

  const corpo = h.linhas.map(x => {
    const serv = x.tipo === 'ida' ? (x.ida.servico || '—') : (x.nota.servico || '—');
    const forn = x.tipo === 'ida' ? x.ida.fornecedor : x.nota.fornecedor;
    const quando = x.tipo === 'ida' && x.ida.voltou_em
      ? bncFmtData(x.data) + '→' + bncFmtData(x.ida.voltou_em)
      : bncFmtData(x.data);
    return `<div class="est-rep-linha">
      <span class="est-rep-data">${UI.esc(quando)}</span>
      <span class="est-rep-onde">${UI.esc(onde(forn))}</span>
      <span class="est-rep-serv">${UI.esc(serv)}</span>
      <span class="est-rep-val">${valorHtml(x)}</span>
    </div>`;
  }).join('');

  const idasTxt = h.idas.length === 1 ? '1 ida registrada' : h.idas.length + ' idas registradas';
  return `
    <div class="est-rep">
      <div class="est-rep-tit">Assistência · <b>${moneyServico(h.total)}</b> em nota${
        h.idas.length ? ' · ' + idasTxt : ''}</div>
      ${corpo}
      <div class="est-rep-nota">A nota diz o dinheiro; a ida diz o paradeiro. São fontes
        diferentes — o total é o da nota, e as idas não se somam a ele.</div>
    </div>`;
}

// Usado pela tela de Estoque pra marcar o aparelho que esta fora.
// Chave por apple_id; o imei4 e a rede de seguranca pro aparelho que trocou de
// id (ou que veio do estoque "fresco" da FoneNinja com outra forma).
function bancadaDoApple(appleId, imei){
  const abertas = bncAbertas();
  const porId = abertas.find(l => l.apple_id && String(l.apple_id) === String(appleId));
  if(porId) return porId;
  const f4 = String(imei || '').slice(-4);
  if(f4.length !== 4) return null;
  return abertas.find(l => l.imei4 === f4 && !l.apple_id) || null;
}

function bncDias(desde){
  if(!desde) return 0;
  const d = new Date(desde + 'T12:00:00');
  return Math.max(0, Math.round((Date.now() - d.getTime()) / 86400000));
}

function bncTomDias(n){
  if(n >= BNC_DIAS_ALERTA * 2) return 'critico';
  if(n >= BNC_DIAS_ALERTA)     return 'alerta';
  if(n >= 7)                   return 'processo';
  return 'ok';
}

function bncFmtData(d){
  if(!d) return '—';
  const [y,m,dd] = String(d).slice(0,10).split('-');
  const meses = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  return `${dd}/${meses[parseInt(m,10)-1]}`;
}

function bncHoje(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Custo do aparelho que esta fora. So faz sentido pra quem veio do estoque.
function bncCusto(l){
  if(!l.apple_id) return 0;
  const it = (estoqueItens || []).find(i => String(i.id) === String(l.apple_id));
  return it ? parseFloat(it.valor_estoque || 0) : 0;
}

// ---------------------------------------------------------------------------
// GRAVACAO
// ---------------------------------------------------------------------------

function bncHeaders(extra){
  return Object.assign({
    'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_TOKEN,
    'Content-Type': 'application/json',
  }, extra || {});
}

// Estoura em vez de morrer num catch mudo: linha que nao gravou e aparelho que
// some do controle -- exatamente o problema que a tela existe pra resolver.
async function bncGravar(linhas){
  const r = await fetch(SB_URL + '/rest/v1/bancada', {
    method: 'POST',
    headers: bncHeaders({'Prefer':'return=representation'}),
    body: JSON.stringify(linhas),
  });
  if(!r.ok){
    const txt = await r.text().catch(() => '');
    throw new Error('HTTP ' + r.status + (txt ? ' — ' + txt.slice(0,180) : ''));
  }
  return await r.json();
}

async function bncPatch(id, campos){
  const r = await fetch(SB_URL + '/rest/v1/bancada?id=eq.' + id, {
    method: 'PATCH',
    headers: bncHeaders({'Prefer':'return=representation'}),
    body: JSON.stringify(Object.assign({ atualizado_em: new Date().toISOString() }, campos)),
  });
  if(!r.ok){
    const txt = await r.text().catch(() => '');
    throw new Error('HTTP ' + r.status + (txt ? ' — ' + txt.slice(0,180) : ''));
  }
  const [linha] = await r.json();
  const i = (_bancadaCache || []).findIndex(l => String(l.id) === String(id));
  if(i >= 0 && linha) _bancadaCache[i] = linha;
  return linha;
}

async function bncBaixa(id){
  try { await bncPatch(id, { voltou_em: bncHoje() }); }
  catch(e){ _bncErro = 'Não consegui dar baixa: ' + e.message; }
  if(currentTab === 'bancada') renderContent();
}

async function bncDesfazerBaixa(id){
  try { await bncPatch(id, { voltou_em: null }); }
  catch(e){ _bncErro = 'Não consegui desfazer: ' + e.message; }
  if(currentTab === 'bancada') renderContent();
}

// O valor vem na nota de segunda, sempre DEPOIS do aparelho voltar -- por isso
// e editavel nas duas abas, e nao um campo do formulario de saida.
async function bncSalvarValor(id, el){
  const bruto = String(el && el.value || '').replace(/[^\d,.-]/g,'').replace(',', '.');
  const valor = bruto === '' ? null : parseFloat(bruto);
  if(valor !== null && !(valor >= 0)){ _bncErro = 'Valor inválido.'; renderContent(); return; }
  try { await bncPatch(id, { valor_cobrado: valor }); }
  catch(e){ _bncErro = 'Não gravou o valor: ' + e.message; }
  if(currentTab === 'bancada') renderContent();
}

function bncCampoValor(l){
  if(!podeVerCustoServico()) return '—';
  // Retorno na garantia da assistência não é "valor que falta lançar": é valor
  // que não existe. Input vazio ali pede pra alguém preencher e some no meio
  // dos que faltam de verdade.
  if(l.retorno_de && l.valor_cobrado == null)
    return `<span class="bnc-valor-zero" title="Retorno na garantia — não é cobrado">grátis</span>`;
  // A referência é a mediana do que a loja já pagou por este serviço neste
  // fornecedor. Serve pra pegar o dedo gordo na hora, não pra brigar com a nota.
  const ref = bncPrecoRef(l.fornecedor, l.servico);
  const fora = ref && l.valor_cobrado != null &&
               Math.abs(parseFloat(l.valor_cobrado) - ref.valor) > ref.valor * 0.35;
  return `<input class="c-input bnc-valor${fora ? ' fora' : ''}" inputmode="decimal" placeholder="—"
     value="${l.valor_cobrado == null ? '' : l.valor_cobrado}"
     ${ref ? `title="Costuma ser ${brl(ref.valor)} (${ref.n} serviços)"` : ''}
     onchange="bncSalvarValor(${l.id}, this)" onclick="event.stopPropagation()">
     ${ref ? `<span class="bnc-ref">~${brl(ref.valor)}</span>` : ''}`;
}

// ---------------------------------------------------------------------------
// EDITAR OS SERVIÇOS DE UMA LINHA
//
// O serviço nem sempre é conhecido na saída: o aparelho vai pra "Análise" e a
// assistência acha mais duas coisas. Sem este caminho, o jeito de registrar o
// segundo serviço seria uma segunda linha -- e aí o mesmo aparelho apareceria
// duas vezes fora da loja, que é exatamente o que a tela existe pra evitar.
// ---------------------------------------------------------------------------

function bncAbrirServico(id){
  const l = (_bancadaCache || []).find(x => String(x.id) === String(id));
  if(!l) return;
  const p = bncSepararServico(l.servico);
  _bncEditId = l.id; _bncEditServs = p.sel; _bncEditExtra = p.extra;
  UI.abrirModal({ titulo:'Serviços do aparelho', id:'bnc-modal-serv',
                  corpo: bncCorpoServico(l), foot: bncPeServico(),
                  onFechar:'bncFecharServico()' });
}

function bncFecharServico(){ _bncEditId = null; UI.fecharModal(); }

function bncToggleEditServico(i){
  const s = BNC_SERVICOS[i]; if(!s) return;
  const k = _bncEditServs.indexOf(s);
  if(k >= 0) _bncEditServs.splice(k, 1); else _bncEditServs.push(s);
  bncRedesenharChips('bnc-servs-edit', _bncEditServs, 'bncToggleEditServico');
}
function bncSetEditExtra(v){ _bncEditExtra = v; }

function bncCorpoServico(l){
  const imei = (l.imei4 && l.imei4 !== '0000')
    ? ` <span class="bnc-imei">…${UI.esc(l.imei4)}</span>` : '';
  return `
    <div class="bnc-edit-alvo">${bncProduto(l)}${imei}</div>
    <div class="bnc-servs" id="bnc-servs-edit">${bncChipsServico(_bncEditServs, 'bncToggleEditServico')}</div>
    <input class="c-input bnc-serv-outro" placeholder="outro serviço (opcional)"
       value="${UI.esc(_bncEditExtra)}" oninput="bncSetEditExtra(this.value)">
    <div class="bnc-dica-inline">Marque tudo que esta ida à assistência inclui. A nota
      cobra junto (“Subida de bateria + Troca de tela”) — registrar junto é o que faz
      a conferência bater.</div>`;
}

function bncPeServico(){
  return UI.btn('Cancelar', {onclick:'bncFecharServico()', variante:'sutil'})
       + UI.btn('Salvar serviços', {onclick:'bncSalvarServico()', variante:'primario'});
}

async function bncSalvarServico(){
  const id = _bncEditId;
  if(id == null) return;
  const txt = bncJuntarServico(_bncEditServs, _bncEditExtra);
  try { await bncPatch(id, { servico: txt }); }
  catch(e){ _bncErro = 'Não gravou o serviço: ' + e.message; }
  bncFecharServico();
  if(currentTab === 'bancada') renderContent();
}

// Célula clicável na tabela. O serviço é o campo que mais muda depois da saída.
function bncCelulaServico(l){
  return `<button class="bnc-serv-btn" onclick="event.stopPropagation();bncAbrirServico(${l.id})"
    title="Editar os serviços deste aparelho">${UI.esc(l.servico || '—')}<span class="bnc-serv-mais">✎</span></button>`;
}

// ---------------------------------------------------------------------------
// MODAL DE SAIDA
// ---------------------------------------------------------------------------

// Busca por 4 digitos do IMEI, etiqueta ou modelo. E o OLHO que desempata:
// a lista mostra modelo, cor e custo pra pessoa confirmar. Foi isso que salvou
// o caso da etiqueta 831 (na planilha era um 17 Preto; no estoque, um 15 Azul).
function bncCandidatos(){
  const q = String(_bncBusca || '').toLowerCase().trim();
  if(q.length < 2) return [];
  const foraAgora = new Set(bncAbertas().map(l => String(l.apple_id)));
  const soDigitos = q.replace(/\D/g, '');
  return (estoqueItens || [])
    .filter(i => {
      const imei = String(i.imei_1 || '');
      const etq  = String(i.serial || '').toLowerCase();
      const tit  = String(i.produto?.titulo || i.titulo || '').toLowerCase();
      return (soDigitos.length >= 2 && imei.endsWith(soDigitos))
          || etq.includes(q)
          || (soDigitos.length >= 2 && etq.replace(/\D/g,'') === soDigitos)
          || tit.includes(q);
    })
    .filter(i => !foraAgora.has(String(i.id)))
    .slice(0, 12);
}

function bncAbrirSaida(){
  _bncBusca = ''; _bncSel = new Set(); _bncManual = null;
  _bncForn = 'RR'; _bncRetornoDe = null;
  _bncServs = [BNC_SERVICOS[0]]; _bncServExtra = '';
  _bncObs = ''; _bncErro = '';
  UI.abrirModal({ titulo:'Registrar saída', corpo: bncCorpoModal(), foot: bncPeModal(),
                  id:'bnc-modal', onFechar:'bncFecharModal()' });
  setTimeout(() => document.getElementById('bnc-busca')?.focus(), 60);
}

function bncFecharModal(){ UI.fecharModal(); }

// Redesenha so o miolo do modal: re-abrir o modal inteiro tirava o foco do
// campo de busca a cada digito.
function bncRedesenharModal(){
  const body = document.querySelector('#bnc-modal .c-modal-body');
  const foot = document.querySelector('#bnc-modal .c-modal-foot');
  if(body) body.innerHTML = bncCorpoModal();
  if(foot) foot.innerHTML = bncPeModal();
}

function bncSetBusca(v){
  _bncBusca = v;
  const lista = document.getElementById('bnc-lista');
  if(lista) lista.innerHTML = bncListaHtml();
  const foot = document.querySelector('#bnc-modal .c-modal-foot');
  if(foot) foot.innerHTML = bncPeModal();
}

function bncToggle(id){
  const k = String(id);
  if(_bncSel.has(k)) _bncSel.delete(k); else _bncSel.add(k);
  _bncRetornoDe = null;   // mudou o aparelho, a sugestão anterior não vale mais
  bncRedesenharModal();
  setTimeout(() => {
    const el = document.getElementById('bnc-busca');
    if(el){ el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
  }, 0);
}

function bncSetForn(f){ _bncForn = f; bncRedesenharModal(); }

// ---------------------------------------------------------------------------
// "É retorno?" — a única pergunta do formulário que a máquina não sabe
//
// A tela SUGERE (achou uma ida fechada do mesmo aparelho dentro da janela de
// garantia) e a pessoa CONFIRMA (é o mesmo defeito?). Trocamos o dropdown de
// origem — que o próprio caminho já respondia, e que errou em 4 das 37 linhas
// abertas — por este, que só quem está com o aparelho na mão sabe responder.
//
// Lote não pergunta: 26 aparelhos saindo juntos são serviço novo em lote, não
// 26 retornos. Só aparece com UM aparelho selecionado.
// ---------------------------------------------------------------------------
function bncRetornoCand(){
  let alvo = null;
  if(_bncManual){
    const i4 = String(_bncManual.imei4 || '').replace(/\D/g,'').slice(-4);
    if(i4.length === 4) alvo = { apple_id:null, imei4:i4 };
  } else if(_bncSel.size === 1){
    const id = [..._bncSel][0];
    const it = (estoqueItens || []).find(i => String(i.id) === String(id));
    const d  = it ? dadosDoItem(it) : null;
    alvo = { apple_id:Number(id), imei4:String(d && d.imei || '').slice(-4) };
  }
  return alvo ? bncUltimaFechada(alvo) : null;
}

// ---------------------------------------------------------------------------
// "NÃO ESTÁ NO ESTOQUE" — mas às vezes está, e a busca é que não achou
//
// Achado na auditoria de 26/ago/2026: TRÊS aparelhos do estoque estavam
// registrados pelo caminho manual, sem `apple_id`. Um deles — `SP829`, iPhone
// 15 Azul, R$ 2.400, `available` — tinha caído FORA da lista de "não vender"
// do WhatsApp. O painel dizia que dava pra vender um aparelho que estava na RR.
// É exatamente o buraco que esta tela existe pra tapar, acontecendo na tela.
//
// ⚠️ SUGERE, NÃO CASA SOZINHO. O casamento automático por 4 dígitos já criou um
// vínculo FALSO em 15/ago (aparelho de cliente colado no apple 339662), e o
// estrago é o sinal invertido: aparelho que está na loja ganha o selo de fora.
// Por isso mostra modelo, cor, etiqueta e custo — a pessoa confirma OLHANDO,
// igual à busca. Dois aparelhos terminam em 8849 no estoque de hoje: um 13 Pro
// Max Azul disponível e um 17 Pro Max Prateado vendido. Só o olho desempata.
// ---------------------------------------------------------------------------
function bncSugCandidatos(){
  if(!_bncManual) return [];
  const i4 = String(_bncManual.imei4 || '').replace(/\D/g,'').slice(-4);
  if(i4.length !== 4 || i4 === '0000') return [];
  const foraAgora = new Set(bncAbertas().map(l => String(l.apple_id)));
  return (estoqueItens || [])
    .filter(i => String(i.imei_1 || '').endsWith(i4))
    .filter(i => !foraAgora.has(String(i.id)))
    .slice(0, 4);
}

function bncSugEstoque(){
  const cands = bncSugCandidatos();
  if(!cands.length) return '';
  return `
    <div class="bnc-sug" id="bnc-sug">
      <div class="bnc-sug-tit">Esse final de IMEI é de um aparelho <b>do estoque</b>:</div>
      ${cands.map(i => {
        const d = dadosDoItem(i);
        return `<button class="bnc-cand" onclick="bncUsarDoEstoque(${i.id})">
          <span class="bnc-check">→</span>
          <span class="bnc-cand-txt">
            <b>${UI.esc(d.modelo.replace(/^iPhone\s*/,''))} ${UI.esc(d.capacidade)}</b>
            <i>${UI.esc(d.cor === '?' ? '' : d.cor)}</i>
          </span>
          <span class="bnc-cand-meta">
            <span class="est-tag">${UI.esc(d.etiqueta || 's/ etiqueta')}</span>
            ${podeVerMargem() ? `<span class="bnc-custo">${money(d.custo)}</span>` : ''}
          </span>
        </button>`;
      }).join('')}
      <div class="bnc-dica-inline">Se for esse, <b>use ele</b> — só assim o aparelho sai do
        disponível e entra na lista de “não vender”. Se for do cliente, ignore: 4 dígitos
        coincidem entre aparelhos diferentes.</div>
    </div>`;
}

// Troca o caminho manual pelo do estoque. O aparelho passa a ter `apple_id`, e
// com ele: selo no Estoque, capital parado e lista de não vender.
function bncUsarDoEstoque(id){
  _bncManual = null;
  _bncSel = new Set([String(id)]);
  _bncRetornoDe = null;
  bncRedesenharModal();
}

function bncBlocoRetorno(){
  const c = bncRetornoCand();
  if(!c) return '';
  const onde = c.fornecedor === 'RR' ? 'RR / Legacy' : 'Access';
  return `
    <div class="bnc-retorno${_bncRetornoDe ? ' marcado' : ''}" id="bnc-retorno">
      <label class="bnc-retorno-lbl">
        <input type="checkbox" ${_bncRetornoDe ? 'checked' : ''}
               onchange="bncSetRetorno(this.checked)">
        <span>Este aparelho voltou da <b>${UI.esc(onde)}</b> em
              ${bncFmtData(c.voltou_em)}. É <b>retorno</b> desse serviço?</span>
      </label>
      <div class="bnc-dica-inline">Era “${UI.esc(c.servico || '—')}”. Marque só se for o
        <b>mesmo problema</b> — aí é garantia da assistência e não deve ser cobrado.
        Defeito diferente é serviço novo.</div>
    </div>`;
}

function bncSetRetorno(v){
  const c = bncRetornoCand();
  _bncRetornoDe = (v && c) ? c.id : null;
  bncRedesenharModal();
}
// Redesenha SÓ os chips: `bncRedesenharModal()` remonta o corpo inteiro e
// tiraria o cursor do campo "outro serviço" a cada toque.
function bncRedesenharChips(id, sel, fn){
  const el = document.getElementById(id);
  if(el) el.innerHTML = bncChipsServico(sel, fn);
}

function bncToggleServico(i){
  const s = BNC_SERVICOS[i]; if(!s) return;
  const k = _bncServs.indexOf(s);
  if(k >= 0) _bncServs.splice(k, 1); else _bncServs.push(s);
  bncRedesenharChips('bnc-servs-saida', _bncServs, 'bncToggleServico');
}
function bncSetServExtra(v){ _bncServExtra = v; }
function bncSetObs(v){ _bncObs = v; }

// Aparelho ja vendido (ou do cliente) nao esta no estoque `available` e nao tem
// apple_id. Sem este caminho o Vitinho voltaria pra planilha na primeira
// garantia que aparecesse.
//
// ⚠️ Este botao E a resposta de "tem dono". Nao ha dropdown perguntando de novo:
// ver `bncDaPrateleira()`.
function bncModoManual(){
  _bncManual = _bncManual ? null : { modelo:'', imei4:'' };
  _bncRetornoDe = null;
  bncRedesenharModal();
}

function bncSetManual(campo, v){
  if(!_bncManual) return;
  _bncManual[campo] = v;
  // Os blocos "é retorno?" e "esse IMEI é do estoque" só existem com os 4
  // dígitos. Redesenha SÓ quando a resposta muda -- a cada tecla tiraria o
  // cursor do campo.
  if(campo !== 'imei4') return;
  const mudouRet = !!bncRetornoCand()      !== !!document.getElementById('bnc-retorno');
  const mudouSug = !!bncSugCandidatos().length !== !!document.getElementById('bnc-sug');
  if(mudouRet || mudouSug){
    bncRedesenharModal();
    setTimeout(() => {
      const el = document.getElementById('bnc-imei4');
      if(el){ el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    }, 0);
  }
}

function bncListaHtml(){
  const cands = bncCandidatos();
  if(String(_bncBusca||'').trim().length < 2){
    return `<div class="bnc-dica">Digite os <b>4 últimos do IMEI</b>, a etiqueta ou o modelo.</div>`;
  }
  if(!cands.length){
    // A busca só enxerga o estoque `available`. Aparelho já vendido — que é o
    // que volta na NOSSA garantia — nunca vai aparecer aqui, e é por isso que o
    // caminho de baixo existe.
    return `<div class="bnc-dica">Nada no estoque disponível com isso. Se o aparelho
      <b>já foi vendido</b> ou é do cliente, use <b>“não está no estoque”</b> aqui embaixo.</div>`;
  }
  return cands.map(i => {
    const d = dadosDoItem(i);
    const marcado = _bncSel.has(String(i.id));
    return `<button class="bnc-cand${marcado ? ' marcado' : ''}" onclick="bncToggle(${i.id})">
      <span class="bnc-check">${marcado ? '✓' : ''}</span>
      <span class="bnc-cand-txt">
        <b>${UI.esc(d.modelo.replace(/^iPhone\s*/,''))} ${UI.esc(d.capacidade)}</b>
        <i>${UI.esc(d.cor === '?' ? '' : d.cor)}</i>
      </span>
      <span class="bnc-cand-meta">
        <span class="est-tag">${UI.esc(d.etiqueta || 's/ etiqueta')}</span>
        <span class="bnc-imei">…${UI.esc(String(d.imei).slice(-4) || '????')}</span>
        ${podeVerMargem() ? `<span class="bnc-custo">${money(d.custo)}</span>` : ''}
      </span>
    </button>`;
  }).join('');
}

function bncCorpoModal(){
  const chipsForn = ['RR','ACCESS']
    .map(f => UI.chip(f === 'RR' ? 'RR / Legacy' : 'Access', _bncForn === f, `bncSetForn('${f}')`)).join('');

  const manual = _bncManual ? `
    <div class="bnc-manual">
      ${UI.linha(
        UI.campo({label:'Modelo e cor', corpo:`<input class="c-input" placeholder="14 Pro Max Roxo"
           value="${UI.esc(_bncManual.modelo)}" oninput="bncSetManual('modelo', this.value)">`}),
        UI.campo({label:'4 últimos do IMEI', corpo:`<input class="c-input" id="bnc-imei4" inputmode="numeric" maxlength="4"
           placeholder="0000" value="${UI.esc(_bncManual.imei4)}" oninput="bncSetManual('imei4', this.value)">`})
      )}
      ${bncSugEstoque()}
    </div>` : '';

  return `
    ${_bncErro ? `<div class="bnc-erro">${UI.esc(_bncErro)}</div>` : ''}

    <div class="bnc-busca-wrap">
      <span class="est-busca-ico">⌕</span>
      <input class="c-input" id="bnc-busca" inputmode="numeric" autocomplete="off"
             placeholder="4 últimos do IMEI, etiqueta ou modelo"
             value="${UI.esc(_bncBusca)}" oninput="bncSetBusca(this.value)">
    </div>
    <div class="bnc-lista" id="bnc-lista">${bncListaHtml()}</div>

    <button class="bnc-link" onclick="bncModoManual()">
      ${_bncManual ? '← voltar pra busca no estoque' : 'não está no estoque (já vendido / do cliente)'}
    </button>
    ${manual}

    <div class="c-sep"></div>

    ${UI.campo({label:'Para onde vai', corpo:`<div class="bnc-chips">${chipsForn}</div>`})}
    ${UI.campo({label:'Serviço — pode marcar mais de um', corpo:
      `<div class="bnc-servs" id="bnc-servs-saida">${bncChipsServico(_bncServs, 'bncToggleServico')}</div>
       <input class="c-input bnc-serv-outro" placeholder="outro serviço (opcional)"
          value="${UI.esc(_bncServExtra)}" oninput="bncSetServExtra(this.value)">`})}
    ${bncBlocoRetorno()}
    ${UI.campo({label:'Observação', corpo:`<input class="c-input" placeholder="opcional"
       value="${UI.esc(_bncObs)}" oninput="bncSetObs(this.value)">`})}`;
}

function bncPeModal(){
  const n = _bncManual ? 1 : _bncSel.size;
  const rotulo = n > 1 ? `Registrar saída de ${n} aparelhos` : 'Registrar saída';
  return UI.btn('Cancelar', {onclick:'bncFecharModal()', variante:'sutil'})
       + UI.btn(_bncSalvando ? 'Gravando…' : rotulo,
                {onclick:'bncSalvar()', variante:'primario', disabled: !n || _bncSalvando});
}

async function bncSalvar(){
  if(_bncSalvando) return;
  const quem = (typeof usuarioEmail === 'string' ? usuarioEmail : '') || null;
  // ORIGEM É DERIVADA DO CAMINHO, não perguntada: quem foi achado na busca veio
  // da prateleira, quem entrou pelo "não está no estoque" tem dono. O dropdown
  // que existia aqui pedia a mesma coisa uma segunda vez — e errava.
  const base = { fornecedor:_bncForn, origem: _bncManual ? 'cliente' : 'estoque',
                 servico: bncJuntarServico(_bncServs, _bncServExtra),
                 saiu_em: bncHoje(), obs: _bncObs || null, quem };

  let linhas;
  if(_bncManual){
    const imei4 = String(_bncManual.imei4 || '').replace(/\D/g,'').slice(-4);
    if(imei4.length !== 4){ _bncErro = 'Preciso dos 4 últimos dígitos do IMEI.'; bncRedesenharModal(); return; }
    linhas = [Object.assign({}, base, { imei4, modelo_txt: _bncManual.modelo || null })];
  } else {
    // Lote: uma unica saida, N linhas. 26 aparelhos sairam juntos em 11/ago --
    // se isso custasse 26 registros a mao, a tela nao seria usada.
    const lote = _bncSel.size > 1 ? 'L' + Date.now().toString(36) : null;
    linhas = [..._bncSel].map(id => {
      const it = (estoqueItens || []).find(i => String(i.id) === String(id));
      const d  = it ? dadosDoItem(it) : null;
      return Object.assign({}, base, {
        apple_id: Number(id),
        imei4: String(d?.imei || '').slice(-4) || '0000',
        imei_1: d?.imei || null,
        etiqueta: d?.etiqueta || null,      // COM prefixo: sem ele 138 aparelhos colidem
        modelo_txt: d ? `${d.modelo} ${d.capacidade} ${d.cor}`.trim() : null,
        lote,
      });
    });
  }

  // Retorno só existe pra UM aparelho: lote é serviço novo em lote, não N
  // retornos. Revalidado aqui porque a seleção pode ter mudado depois do clique.
  if(linhas.length === 1 && _bncRetornoDe){
    const c = bncRetornoCand();
    if(c && String(c.id) === String(_bncRetornoDe)) linhas[0].retorno_de = c.id;
  }

  _bncSalvando = true; _bncErro = ''; bncRedesenharModal();
  try {
    const criadas = await bncGravar(linhas);
    _bancadaCache = (criadas || []).concat(_bancadaCache || []);
    bncFecharModal();
  } catch(e){
    _bncErro = 'Não gravou: ' + e.message;
    bncRedesenharModal();
  } finally {
    _bncSalvando = false;
  }
  if(currentTab === 'bancada') renderContent();
  else if(currentTab === 'estoque') renderContent();
}

// ---------------------------------------------------------------------------
// TELA
// ---------------------------------------------------------------------------

function setBancadaAba(a){ _bncAba = a; if(currentTab === 'bancada') renderContent(); }

// ---------------------------------------------------------------------------
// FILTRO — achar o aparelho na lista
//
// Com 30+ linhas na tela e o aparelho na mão, rolar a lista é o que faz a baixa
// não acontecer. Procura pelo que a pessoa tem: 4 do IMEI, etiqueta, modelo.
// ---------------------------------------------------------------------------
function setBancadaFiltro(v){
  _bncFiltro = v;
  if(typeof window !== 'undefined' && window._bncFiltroTimer) clearTimeout(window._bncFiltroTimer);
  const t = setTimeout(() => {
    if(currentTab !== 'bancada') return;
    renderContent();
    // re-focar e pôr o cursor no fim: renderContent() remonta a tela inteira
    const el = document.getElementById('bnc-filtro');
    if(el){ el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
  }, 150);
  if(typeof window !== 'undefined') window._bncFiltroTimer = t;
}

function limparBancadaFiltro(){
  _bncFiltro = '';
  if(currentTab === 'bancada') renderContent();
}

function bncFiltrar(linhas){
  const q = String(_bncFiltro || '').toLowerCase().trim();
  if(!q) return linhas;
  // ⚠️ Só cai no casamento por número quando a busca É um número. Digitou
  // `E1030`? Respeita o prefixo: jogá-lo fora traria o `SP1030` junto, e são
  // 138 aparelhos que colidem assim (docs/CONTROLE-MANUTENCAO.md).
  const dig = /^\d+$/.test(q) ? q : '';
  return (linhas || []).filter(l => {
    const txt = [l.modelo_txt, l.etiqueta, l.servico, l.obs,
                 l.fornecedor === 'RR' ? 'rr legacy' : 'access'].join(' ').toLowerCase();
    return txt.includes(q)
        || (dig.length >= 2 && String(l.imei4 || '').includes(dig))
        || (dig.length >= 2 && String(l.imei_1 || '').includes(dig))
        || (dig.length >= 2 && String(l.etiqueta || '').replace(/\D/g,'') === dig);
  });
}

function bncBarraFiltro(){
  return `
    <div class="bnc-filtro-barra">
      <div class="est-busca">
        <span class="est-busca-ico">⌕</span>
        <input type="text" id="bnc-filtro" autocomplete="off"
               placeholder="Achar aparelho: IMEI, etiqueta, modelo ou serviço"
               value="${UI.esc(_bncFiltro)}" oninput="setBancadaFiltro(this.value)">
      </div>
      ${_bncFiltro ? UI.btn('Limpar', {onclick:'limparBancadaFiltro()', variante:'sutil', sm:true}) : ''}
    </div>`;
}

// ---------------------------------------------------------------------------
// EXPORTAR PRA WHATSAPP -- a lista do que nao pode ser vendido
//
// A baixa acontece no grupo, nao no painel: quem esta no balcao nao abre esta
// tela, mas le o grupo. Sem preco nenhum DE PROPOSITO -- e aviso de "nao venda
// isto", nao lista comercial. Por isso o papel `bancada` tambem exporta, ao
// contrario do "Exportar WhatsApp" do Estoque, que sai atras de podeVerValor().
//
// So entra quem saiu do ESTOQUE. Aparelho de cliente e de garantia tambem esta
// fora da loja, mas nao ha o que dar baixa: nunca esteve disponivel pra venda,
// e os de cliente nem IMEI tem (imei4 = '0000'). Em vez de sumirem calados,
// viram uma linha de contagem no rodape.
// ---------------------------------------------------------------------------
function bncTextoWhatsApp(){
  const abertas = bncAbertas();
  // Mesma ordem da tela: saiu_em crescente, o mais velho no topo. A lista que
  // se cola no grupo e a que se olha aqui sao a mesma lista, na mesma ordem --
  // conferir uma contra a outra nao pode exigir procurar.
  const doEstoque = abertas.filter(bncDaPrateleira)
    .sort((a, b) => String(a.saiu_em).localeCompare(String(b.saiu_em)));
  const outros = abertas.length - doEstoque.length;
  const hoje = bncFmtData(bncHoje());

  if(!doEstoque.length)
    return '🔧 Assistência — ' + hoje + '\n\nNenhum aparelho do estoque está fora agora.';

  // "iPhone" em toda linha e ruido: sao 33 linhas dizendo a mesma coisa. O
  // "final" tambem -- 4 digitos depois do modelo so podem ser o fim do IMEI.
  const linha = l => '• ' + String(l.modelo_txt || 'sem modelo').replace(/^i?[Pp]hone\s*/i, '')
                   + ((l.imei4 && l.imei4 !== '0000') ? ' · ' + l.imei4 : '');

  // Separado por assistencia: quem cobra, cobra numa de cada vez.
  const blocos = [['RR / Legacy', 'RR'], ['Access', 'ACCESS']]
    .map(([titulo, forn]) => {
      const doForn = doEstoque.filter(l => l.fornecedor === forn);
      return doForn.length ? `\n${titulo} (${doForn.length}):\n` + doForn.map(linha).join('\n') : '';
    }).filter(Boolean);

  // Fornecedor fora dos dois conhecidos nao pode sumir da lista.
  const orfaos = doEstoque.filter(l => l.fornecedor !== 'RR' && l.fornecedor !== 'ACCESS');
  if(orfaos.length) blocos.push('\nOutros (' + orfaos.length + '):\n' + orfaos.map(linha).join('\n'));

  return '🔧 NA ASSISTÊNCIA — ' + hoje + '\n'
       + 'Não vender, estão fora da loja (' + doEstoque.length + '):\n'
       + blocos.join('\n')
       + (outros ? '\n\n+ ' + outros + ' de cliente/garantia (não são do estoque).' : '');
}

// ---------------------------------------------------------------------------
// EXPORTAR PRA WHATSAPP -- o que VOLTOU hoje
//
// A outra metade do recado. A lista de "nao vender" tira o aparelho da venda;
// sem o aviso da volta, ele fica fora da venda mais tempo do que ficou fora da
// loja -- ninguem no balcao sabe que ele chegou. Mesma regra da outra lista:
// sem preco, so o que o balcao precisa saber.
// ---------------------------------------------------------------------------
function bncVoltaramNoDia(dia){
  const d = dia || bncHoje();
  return (_bancadaCache || [])
    .filter(l => String(l.voltou_em || '').slice(0,10) === d)
    .sort((a, b) => String(a.saiu_em).localeCompare(String(b.saiu_em)));
}

function bncTextoWhatsAppVoltaram(dia){
  const d = dia || bncHoje();
  const linhas = bncVoltaramNoDia(d);
  const quando = bncFmtData(d);

  if(!linhas.length)
    return '✅ Voltou da assistência — ' + quando + '\n\nNenhum aparelho voltou hoje.';

  // Mesmo formato da lista de "não vender": sem "iPhone", sem a palavra
  // "final". O serviço entra porque quem vende precisa saber o que foi feito.
  const linha = l => '• ' + String(l.modelo_txt || 'sem modelo').replace(/^i?[Pp]hone\s*/i, '')
                   + ((l.imei4 && l.imei4 !== '0000') ? ' · ' + l.imei4 : '')
                   + (l.servico ? ' — ' + l.servico : '');

  // Aparelho VENDIDO enquanto estava fora cai sozinho no bloco de entregar:
  // ele nao esta mais em `estoqueItens` (que so traz `available`). Era um item
  // aberto de "conferir com o Vitinho" no doc -- some sem ninguem fazer nada.
  const doEstoque = linhas.filter(bncDaPrateleira);
  const outros    = linhas.filter(l => !bncDaPrateleira(l));

  const blocos = [];
  if(doEstoque.length)
    blocos.push('Já pode vender (' + doEstoque.length + '):\n' + doEstoque.map(linha).join('\n'));
  // Cliente e garantia voltaram pra ser ENTREGUES, nao vendidos. Misturar os
  // dois no mesmo bloco poria na prateleira aparelho que tem dono.
  if(outros.length)
    blocos.push('Entregar ao dono (' + outros.length + '):\n' + outros.map(linha).join('\n'));

  return '✅ VOLTOU DA ASSISTÊNCIA — ' + quando + '\n\n' + blocos.join('\n\n');
}

function renderBancada(){
  if(_bancadaCache === null){
    carregarBancada().then(() => { if(currentTab === 'bancada') renderContent(); });
    return UI.card({corpo: UI.vazio({ico:'🔧', titulo:'Carregando a assistência…'})});
  }

  const abertas = bncAbertas().slice().sort((a,b) => String(a.saiu_em).localeCompare(String(b.saiu_em)));
  const capital = abertas.reduce((a,l) => a + bncCusto(l), 0);
  const maisVelho = abertas.length ? bncDias(abertas[0].saiu_em) : 0;
  const atrasadas = abertas.filter(l => bncDias(l.saiu_em) >= BNC_DIAS_ALERTA);

  const kpis = [
    { rotulo:'Na assistência', valor: abertas.length, sub:'fora da loja agora' },
    { rotulo:'Mais velho', valor: abertas.length ? maisVelho + ' dias' : '—',
      tom: abertas.length ? bncTomDias(maisVelho) : undefined,
      sub: abertas.length ? bncFmtData(abertas[0].saiu_em) : 'nada fora' },
    { rotulo:'Passou de ' + BNC_DIAS_ALERTA + ' dias', valor: atrasadas.length,
      tom: atrasadas.length ? 'alerta' : 'ok', sub:'precisa de cobrança' },
  ];
  if(podeVerMargem()){
    kpis.splice(1, 0, { rotulo:'Capital parado', valor: money(capital),
      sub:'custo que está fora da loja' });
  }
  // Retrabalho: o número que decide pra ONDE mandar o próximo aparelho. Só
  // conta de BNC_RETORNO_DESDE pra frente -- antes disso a pergunta não existia
  // e o denominador não sabia dela.
  const idas = (_bancadaCache || []).filter(l => l.saiu_em >= BNC_RETORNO_DESDE);
  const retornos = idas.filter(l => l.retorno_de).length;
  if(idas.length){
    kpis.push({ rotulo:'Retorno', valor: retornos,
      tom: retornos ? 'alerta' : undefined,
      sub: (idas.length ? Math.round(retornos / idas.length * 100) : 0)
           + '% das idas desde ' + bncFmtData(BNC_RETORNO_DESDE) });
  }

  // Gasto de bancada do mes corrente. Fica atras do interruptor de custo de
  // SERVICO, nao do de margem: sao dinheiros diferentes.
  if(podeVerCustoServico()){
    const mes = bncHoje().slice(0,7);
    const doMes = (_bancadaCache || []).filter(l =>
      l.valor_cobrado != null && String(l.voltou_em || l.saiu_em).startsWith(mes));
    // Retorno não tem nota -- cobrar valor dele seria um alerta que nunca apaga.
    const semValor = (_bancadaCache || []).filter(l =>
      l.voltou_em && l.valor_cobrado == null && !l.retorno_de).length;
    kpis.push({ rotulo:'Serviço no mês',
      valor: moneyServico(doMes.reduce((a,l) => a + parseFloat(l.valor_cobrado || 0), 0)),
      tom: semValor ? 'alerta' : undefined,
      sub: semValor ? semValor + ' sem valor da nota' : doMes.length + ' serviços lançados' });
  }

  const voltaramHoje = bncVoltaramNoDia().length;

  const cabecalho = `
    <div class="pg-head">
      <div>
        <div class="pg-kicker">Operações</div>
        <h1 class="pg-title">Assistência</h1>
        <div class="pg-desc">O que está na assistência agora. Aparelho não sai sem linha, não volta sem baixa.</div>
      </div>
      <div class="pg-acoes">
        ${UI.btn('📋 Copiar lista', {onclick:'copiarTextoWa(bncTextoWhatsApp())',
          titulo:'Lista pra colar no grupo: modelo e final do IMEI, sem preço'})}
        ${/* só aparece quando há o que avisar -- botão que copia "nada voltou" é ruído */ ''}
        ${voltaramHoje ? UI.btn('✅ Voltaram hoje (' + voltaramHoje + ')',
          {onclick:'copiarTextoWa(bncTextoWhatsAppVoltaram())',
           titulo:'Lista do que chegou da assistência hoje, pra colar no grupo'}) : ''}
        ${UI.btn('+ Registrar saída', {onclick:'bncAbrirSaida()', variante:'primario'})}
      </div>
    </div>`;

  // `reparos` é de sócio (policy reparos_socio) — a conferência é controle
  // financeiro, não trabalho de bancada.
  if(podeVerMargem() && _reparosCache === null)
    carregarReparosBancada().then(() => { if(currentTab === 'bancada') renderContent(); });

  const conf = podeVerMargem() ? bncConciliar() : null;
  const alertas = conf ? conf.semRegistro.length + conf.semNota.length + conf.valorDiferente.length : 0;

  const abas = UI.toolbar(
    UI.chip('Na assistência (' + abertas.length + ')', _bncAba === 'abertas', "setBancadaAba('abertas')"),
    UI.chip('Voltaram', _bncAba === 'fechadas', "setBancadaAba('fechadas')"),
    podeVerMargem()
      ? UI.chip('Conferência' + (alertas ? ' (' + alertas + ')' : ''),
                _bncAba === 'conferencia', "setBancadaAba('conferencia')")
      : ''
  );

  const erro = _bncErro && currentTab === 'bancada'
    ? `<div class="bnc-erro">${UI.esc(_bncErro)}</div>` : '';

  const corpo = _bncAba === 'conferencia' ? bncTelaConferencia(conf)
              : _bncAba === 'fechadas'    ? bncBarraFiltro() + bncTabelaFechadas()
              : bncBarraFiltro() + bncTabelaAbertas(abertas);

  return cabecalho + UI.kpis(kpis) + erro + abas + corpo;
}

// ---------------------------------------------------------------------------
// TELA DA CONFERÊNCIA
// ---------------------------------------------------------------------------

function bncTelaConferencia(conf){
  if(!conf){
    return UI.card({corpo: UI.vazio({
      ico:'📋', titulo:'Ainda não há o que conferir',
      texto:'A conferência cruza a nota da assistência com o que foi registrado aqui. Ela começa a valer no primeiro registro de saída.',
    })});
  }

  const bloco = (titulo, sub, tom, itens, render) => {
    if(!itens.length) return '';
    return UI.card({
      titulo, sub: itens.length + ' · ' + sub, flush:true,
      corpo: `<div class="c-tabela-wrap"><table class="c-tabela bnc-tabela">
        <tbody>${itens.map(render).join('')}</tbody></table></div>`
    });
  };

  const semRegistro = bloco('Na nota, sem registro aqui',
    'saiu da loja e ninguém registrou', 'critico', conf.semRegistro, n => `<tr>
      <td class="forte">${UI.esc(n.modelo || '—')}</td>
      <td><span class="est-tag">${UI.esc(n.chave.replace(/^[ai]/,''))}</span></td>
      <td>${UI.esc(n.fornecedor)}</td>
      <td>${UI.esc([...new Set(n.servicos)].join(', ').slice(0,60) || '—')}</td>
      <td class="num">${moneyServico(n.total)}</td>
    </tr>`);

  const semNota = bloco('Registrado, sem nota',
    'voltou e não apareceu na cobrança', 'alerta', conf.semNota, g => `<tr>
      <td class="forte">${UI.esc((g.linhas[0].modelo_txt || '—').replace(/^iPhone\s*/,''))}</td>
      <td><span class="est-tag">${UI.esc(g.linhas[0].etiqueta || '—')}</span></td>
      <td>${UI.esc(g.linhas[0].fornecedor)}</td>
      <td>${UI.esc(g.linhas.map(l => l.servico).filter(Boolean).join(', ').slice(0,60) || '—')}</td>
      <td class="num">${bncFmtData(g.linhas[0].voltou_em)}</td>
    </tr>`);

  const difs = bloco('Valor diferente da nota',
    'o que foi lançado não bate', 'alerta', conf.valorDiferente, g => `<tr>
      <td class="forte">${UI.esc((g.linhas[0].modelo_txt || '—').replace(/^iPhone\s*/,''))}</td>
      <td><span class="est-tag">${UI.esc(g.linhas[0].etiqueta || '—')}</span></td>
      <td class="num">nota ${moneyServico(g.nota)}</td>
      <td class="num">lançado ${moneyServico(g.cobrado)}</td>
      <td class="num">${UI.badge((g.dif > 0 ? '+' : '') + moneyServico(g.dif),
                                 g.dif > 0 ? 'critico' : 'alerta')}</td>
    </tr>`);

  const nada = !conf.semRegistro.length && !conf.semNota.length && !conf.valorDiferente.length;

  // A nota é carregada à mão e atrasa. Quando ela para antes do livro começar,
  // não há período em comum -- e dizer "tudo bate" aí seria mentir com fato.
  if(conf.janelaVazia){
    return UI.card({corpo: UI.vazio({
      ico:'📥', titulo:'Falta carregar a nota',
      texto: (conf.ate
        ? 'A última nota carregada é de ' + bncFmtData(conf.ate) + ', e o livro da assistência '
          + 'começou em ' + bncFmtData(conf.desde) + '. Não há período em comum pra conferir.'
        : 'Nenhuma nota da assistência foi carregada ainda.')
        + ' Rode `node scripts/reparos.js` com as notas novas — sem elas a conferência '
        + 'compara contra o vazio.',
    })});
  }

  return `
    <div class="bnc-conf-nota">
      Conferindo de <b>${bncFmtData(conf.desde)}</b> a <b>${bncFmtData(conf.ate)}</b> — do dia em que
      o controle começou até a última nota carregada.
      ${conf.notas} aparelhos na nota · ${conf.registros} registrados.
      <span>Fora dessa janela não conta como falta: antes é história, depois a nota ainda não chegou.</span>
    </div>
    ${nada ? UI.card({corpo: UI.vazio({ico:'✅', titulo:'A nota bate com o registro',
        texto:'Nenhum aparelho saiu sem registro, nada voltou sem cobrança e os valores conferem.'})})
      : semRegistro + semNota + difs}`;
}

// Duas respostas, não três: o aparelho é da prateleira ou tem dono.
//
// A palavra "Garantia" saiu do rótulo DE PROPÓSITO — ela queria dizer duas
// coisas opostas ao mesmo tempo (a nossa, pro cliente; e a da assistência, pra
// nós). O segundo sentido virou coluna própria, `retorno_de`.
function bncDonoBadge(l){
  return bncDaPrateleira(l) ? UI.badge('Estoque') : UI.badge('Do cliente', 'processo');
}

// O selo de retorno mora na coluna do SERVIÇO, não na de origem: retorno
// qualifica o serviço ("de novo"), não de quem é o aparelho.
function bncRetornoSelo(l){
  if(!l.retorno_de) return '';
  const ant = (_bancadaCache || []).find(x => String(x.id) === String(l.retorno_de));
  const t = ant
    ? 'Retorno do serviço de ' + bncFmtData(ant.saiu_em) + ' — garantia da assistência'
    : 'Retorno — garantia da assistência';
  return `<span class="bnc-retorno-selo" title="${UI.esc(t)}">${UI.badge('↩ retorno','alerta')}</span>`;
}

function bncProduto(l){
  const txt = l.modelo_txt || '—';
  return UI.esc(String(txt).replace(/^iPhone\s*/,''));
}

function bncTabelaAbertas(abertas){
  if(!abertas.length){
    return UI.card({corpo: UI.vazio({
      ico:'✅', titulo:'Nenhum aparelho fora',
      texto:'Quando um aparelho for pra assistência, registre a saída aqui — assim ele para de aparecer como disponível no Estoque.',
      acao: UI.btn('+ Registrar saída', {onclick:'bncAbrirSaida()', variante:'primario'}),
    })});
  }

  // O filtro corta a LISTA, nunca os KPIs: o número de aparelhos fora e o
  // capital parado são da operação inteira, não da busca.
  const visiveis = bncFiltrar(abertas);
  if(!visiveis.length){
    return UI.card({corpo: UI.vazio({
      ico:'⌕', titulo:'Nada com esse filtro',
      texto:'Nenhum dos ' + abertas.length + ' aparelhos que estão fora bate com “' + UI.esc(_bncFiltro) + '”.',
      acao: UI.btn('Limpar filtro', {onclick:'limparBancadaFiltro()'}),
    })});
  }

  const linhas = visiveis.map(l => {
    const n = bncDias(l.saiu_em);
    return `<tr class="bnc-linha">
      <td data-rot="Aparelho" data-campo="aparelho" class="forte">${bncProduto(l)}</td>
      <td data-rot="Etiqueta" data-campo="etiqueta">${l.etiqueta ? `<span class="est-tag">${UI.esc(l.etiqueta)}</span>` : ''}</td>
      <td data-rot="IMEI" data-campo="imei">${(l.imei4 && l.imei4 !== '0000') ? `<span class="bnc-imei">…${UI.esc(l.imei4)}</span>` : ''}</td>
      <td data-rot="Onde" data-campo="onde">${UI.esc(l.fornecedor === 'RR' ? 'RR / Legacy' : 'Access')}</td>
      <td data-rot="Serviço" data-campo="servico">${bncRetornoSelo(l)}${bncCelulaServico(l)}</td>
      <td data-rot="De onde" data-campo="origem" data-origem="${UI.esc(l.origem||"")}">${bncDonoBadge(l)}</td>
      <td data-rot="Saiu" data-campo="saiu">${bncFmtData(l.saiu_em)}</td>
      <td data-rot="Dias" data-campo="dias" class="num">${UI.badge(n + 'd', bncTomDias(n))}</td>
      ${podeVerCustoServico() ? `<td data-rot="R$" data-campo="valor" class="num">${bncCampoValor(l)}</td>` : ''}
      <td data-rot="" data-campo="acao" class="num">${UI.btn('Voltou', {onclick:`bncBaixa(${l.id})`, sm:true})}</td>
    </tr>`;
  }).join('');

  return UI.card({
    titulo:'Na assistência',
    sub: (visiveis.length === abertas.length
            ? abertas.length + ' aparelhos'
            : visiveis.length + ' de ' + abertas.length + ' aparelhos')
         + ' · do mais velho pro mais novo',
    flush:true,
    corpo: `<div class="c-tabela-wrap"><table class="c-tabela bnc-tabela">
      <thead><tr>
        <th>Aparelho</th><th>Etiqueta</th><th>IMEI</th><th>Onde</th><th>Serviço</th>
        <th>De onde</th><th>Saiu</th><th class="num">Dias</th>
        ${podeVerCustoServico() ? '<th class="num">R$</th>' : ''}<th></th>
      </tr></thead><tbody>${linhas}</tbody></table></div>`
  });
}

function bncTabelaFechadas(){
  // Filtra ANTES de cortar em 100: procurar um aparelho de junho não pode
  // depender de ele estar entre as 100 últimas voltas.
  const todas = bncFiltrar((_bancadaCache || []).filter(l => l.voltou_em))
    .sort((a,b) => String(b.voltou_em).localeCompare(String(a.voltou_em)));
  const fechadas = todas.slice(0, 100);

  if(!fechadas.length){
    return UI.card({corpo: UI.vazio({
      ico: _bncFiltro ? '⌕' : '📋',
      titulo: _bncFiltro ? 'Nada com esse filtro' : 'Nada voltou ainda',
      texto: _bncFiltro
        ? 'Nenhum aparelho que já voltou bate com “' + UI.esc(_bncFiltro) + '”.'
        : 'Assim que você der baixa num aparelho, ele aparece aqui com o tempo que ficou fora.',
      acao: _bncFiltro ? UI.btn('Limpar filtro', {onclick:'limparBancadaFiltro()'}) : undefined,
    })});
  }

  const linhas = fechadas.map(l => {
    const dias = l.saiu_em && l.voltou_em
      ? Math.max(0, Math.round((new Date(l.voltou_em+'T12:00:00') - new Date(l.saiu_em+'T12:00:00')) / 86400000))
      : 0;
    return `<tr>
      <td data-rot="Aparelho" data-campo="aparelho" class="forte">${bncProduto(l)}</td>
      <td data-rot="Etiqueta" data-campo="etiqueta">${l.etiqueta ? `<span class="est-tag">${UI.esc(l.etiqueta)}</span>` : ''}</td>
      <td data-rot="Onde" data-campo="onde">${UI.esc(l.fornecedor === 'RR' ? 'RR / Legacy' : 'Access')}</td>
      <td data-rot="Serviço" data-campo="servico">${bncRetornoSelo(l)}${bncCelulaServico(l)}</td>
      <td data-rot="De onde" data-campo="origem" data-origem="${UI.esc(l.origem||"")}">${bncDonoBadge(l)}</td>
      <td data-rot="Saiu" data-campo="saiu">${bncFmtData(l.saiu_em)}</td>
      <td data-rot="Voltou">${bncFmtData(l.voltou_em)}</td>
      <td data-rot="Ficou" class="num">${UI.badge(dias + 'd', bncTomDias(dias))}</td>
      ${podeVerCustoServico() ? `<td data-rot="R$" data-campo="valor" class="num">${bncCampoValor(l)}</td>` : ''}
      <td data-rot="" data-campo="acao" class="num">${UI.btn('desfazer', {onclick:`bncDesfazerBaixa(${l.id})`, variante:'sutil', sm:true})}</td>
    </tr>`;
  }).join('');

  const semValor = fechadas.filter(l => l.valor_cobrado == null && !l.retorno_de).length;
  return UI.card({
    titulo:'Voltaram',
    sub: (_bncFiltro ? fechadas.length + ' com esse filtro' : fechadas.length + ' últimas')
         + (podeVerCustoServico() && semValor ? ' · ' + semValor + ' sem valor da nota' : ''),
    flush:true,
    corpo: `<div class="c-tabela-wrap"><table class="c-tabela bnc-tabela">
      <thead><tr>
        <th>Aparelho</th><th>Etiqueta</th><th>Onde</th><th>Serviço</th>
        <th>De onde</th><th>Saiu</th><th>Voltou</th><th class="num">Ficou</th>
        ${podeVerCustoServico() ? '<th class="num">R$</th>' : ''}<th></th>
      </tr></thead><tbody>${linhas}</tbody></table></div>`
  });
}
