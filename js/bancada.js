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
  'Troca de tampa traseira', 'Face ID', 'Conector de carga', 'Câmera traseira',
  'Lente de câmera', 'Auricular', 'Alto-falante', 'Reparo em placa',
  'Não liga', 'Análise',
];

const BNC_DIAS_ALERTA = 14;   // acima disso o aparelho vira cobranca, nao registro

let _bancadaCache = null;     // null = nunca carregou; [] = carregou e esta vazia
let _bncCarregando = false;
let _bncAba        = 'abertas';
let _bncBusca      = '';
let _bncSel        = new Set();   // apple_ids marcados no modal (lote)
let _bncForn       = 'RR';
let _bncOrigem     = 'estoque';
let _bncServico    = BNC_SERVICOS[0];
let _bncObs        = '';
let _bncManual     = null;    // {modelo, imei4} quando o aparelho nao e do estoque
let _bncSalvando   = false;
let _bncErro       = '';

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

// ---------------------------------------------------------------------------
// CONFERÊNCIA — a nota bate com o que foi registrado?
//
// `reparos` é o DINHEIRO (vem da nota, depois do fato, via scripts/reparos.js).
// `bancada` é o PARADEIRO (vem da pessoa, durante). Cruzar os dois é o que
// transforma "achei que registrei tudo" em uma lista.
//
// ⚠️ A conferência SÓ COBRA a partir do dia em que a bancada começou. Em
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

// Dia em que o livro da bancada começou. Antes disso não se cobra nada.
function bncDesde(){
  const datas = (_bancadaCache || []).map(l => l.saiu_em).filter(Boolean).sort();
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

function bncConciliar(){
  const desde = bncDesde();
  if(!desde) return null;

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
    const voltou = g.linhas.some(l => l.voltou_em);
    if(!n && voltou) semNota.push(g);
    else if(n && g.temValor && Math.abs(n.total - g.cobrado) >= 1){
      valorDiferente.push({ ...g, nota: n.total, dif: g.cobrado - n.total });
    }
  });

  return { desde, semRegistro, semNota, valorDiferente,
           notas: Object.keys(porNota).length, registros: Object.keys(porReg).length };
}

// Preço de referência: a MEDIANA do que já foi pago por este serviço neste
// fornecedor. Nasce do próprio histórico da loja -- não de tabela transcrita à
// mão, que erra em silêncio e produz alarme falso toda semana.
function bncPrecoRef(fornecedor, servico){
  const alvo = String(servico || '').toLowerCase().trim();
  if(!alvo) return null;
  const vals = [];
  (_reparosCache || []).forEach(r => {
    if(r.fornecedor === fornecedor && String(r.servico||'').toLowerCase().trim() === alvo)
      vals.push(parseFloat(r.valor_liquido || 0));
  });
  (_bancadaCache || []).forEach(l => {
    if(l.fornecedor === fornecedor && l.valor_cobrado != null &&
       String(l.servico||'').toLowerCase().trim() === alvo)
      vals.push(parseFloat(l.valor_cobrado));
  });
  if(vals.length < 3) return null;          // 2 amostras não são um padrão
  vals.sort((a,b) => a-b);
  const m = Math.floor(vals.length/2);
  return { valor: vals.length % 2 ? vals[m] : (vals[m-1]+vals[m])/2, n: vals.length };
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
  _bncForn = 'RR'; _bncOrigem = 'estoque'; _bncServico = BNC_SERVICOS[0];
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
  bncRedesenharModal();
  setTimeout(() => {
    const el = document.getElementById('bnc-busca');
    if(el){ el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
  }, 0);
}

function bncSetForn(f){ _bncForn = f; bncRedesenharModal(); }
function bncSetOrigem(o){ _bncOrigem = o; bncRedesenharModal(); }
function bncSetServico(s){ _bncServico = s; }
function bncSetObs(v){ _bncObs = v; }

// Aparelho do cliente nao esta no estoque e nao tem apple_id. Sem este caminho
// o Vitinho voltaria pra planilha na primeira garantia que aparecesse.
function bncModoManual(){
  _bncManual = _bncManual ? null : { modelo:'', imei4:'' };
  if(_bncManual) _bncOrigem = 'cliente';
  bncRedesenharModal();
}
function bncSetManual(campo, v){ if(_bncManual) _bncManual[campo] = v; }

function bncListaHtml(){
  const cands = bncCandidatos();
  if(String(_bncBusca||'').trim().length < 2){
    return `<div class="bnc-dica">Digite os <b>4 últimos do IMEI</b>, a etiqueta ou o modelo.</div>`;
  }
  if(!cands.length){
    return `<div class="bnc-dica">Nada no estoque com isso. Se o aparelho é do cliente,
      use <b>“não está no estoque”</b> aqui embaixo.</div>`;
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
        UI.campo({label:'4 últimos do IMEI', corpo:`<input class="c-input" inputmode="numeric" maxlength="4"
           placeholder="0000" value="${UI.esc(_bncManual.imei4)}" oninput="bncSetManual('imei4', this.value)">`})
      )}
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
      ${_bncManual ? '← voltar pra busca no estoque' : 'não está no estoque (aparelho do cliente)'}
    </button>
    ${manual}

    <div class="c-sep"></div>

    ${UI.campo({label:'Para onde vai', corpo:`<div class="bnc-chips">${chipsForn}</div>`})}
    ${UI.linha(
      UI.campo({label:'Serviço', corpo: UI.select({id:'bnc-servico', valor:_bncServico,
        opcoes: BNC_SERVICOS, extra:'onchange="bncSetServico(this.value)"'})}),
      UI.campo({label:'Origem', corpo: UI.select({id:'bnc-origem', valor:_bncOrigem, extra:'onchange="bncSetOrigem(this.value)"', opcoes:[
        {v:'estoque', t:'Estoque (recondicionamento)'},
        {v:'garantia', t:'Garantia (já vendido)'},
        {v:'cliente',  t:'Cliente (serviço pago)'},
      ]})})
    )}
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
  const base = { fornecedor:_bncForn, origem:_bncOrigem, servico:_bncServico,
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

function renderBancada(){
  if(_bancadaCache === null){
    carregarBancada().then(() => { if(currentTab === 'bancada') renderContent(); });
    return UI.card({corpo: UI.vazio({ico:'🔧', titulo:'Carregando a bancada…'})});
  }

  const abertas = bncAbertas().slice().sort((a,b) => String(a.saiu_em).localeCompare(String(b.saiu_em)));
  const capital = abertas.reduce((a,l) => a + bncCusto(l), 0);
  const maisVelho = abertas.length ? bncDias(abertas[0].saiu_em) : 0;
  const atrasadas = abertas.filter(l => bncDias(l.saiu_em) >= BNC_DIAS_ALERTA);

  const kpis = [
    { rotulo:'Na bancada', valor: abertas.length, sub:'fora da loja agora' },
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
  // Gasto de bancada do mes corrente. Fica atras do interruptor de custo de
  // SERVICO, nao do de margem: sao dinheiros diferentes.
  if(podeVerCustoServico()){
    const mes = bncHoje().slice(0,7);
    const doMes = (_bancadaCache || []).filter(l =>
      l.valor_cobrado != null && String(l.voltou_em || l.saiu_em).startsWith(mes));
    const semValor = (_bancadaCache || []).filter(l => l.voltou_em && l.valor_cobrado == null).length;
    kpis.push({ rotulo:'Serviço no mês',
      valor: moneyServico(doMes.reduce((a,l) => a + parseFloat(l.valor_cobrado || 0), 0)),
      tom: semValor ? 'alerta' : undefined,
      sub: semValor ? semValor + ' sem valor da nota' : doMes.length + ' serviços lançados' });
  }

  const cabecalho = `
    <div class="pg-head">
      <div>
        <div class="pg-kicker">Operações</div>
        <h1 class="pg-title">Bancada</h1>
        <div class="pg-desc">O que está na assistência agora. Aparelho não sai sem linha, não volta sem baixa.</div>
      </div>
      <div class="pg-acoes">
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
    UI.chip('Na bancada (' + abertas.length + ')', _bncAba === 'abertas', "setBancadaAba('abertas')"),
    UI.chip('Voltaram', _bncAba === 'fechadas', "setBancadaAba('fechadas')"),
    podeVerMargem()
      ? UI.chip('Conferência' + (alertas ? ' (' + alertas + ')' : ''),
                _bncAba === 'conferencia', "setBancadaAba('conferencia')")
      : ''
  );

  const erro = _bncErro && currentTab === 'bancada'
    ? `<div class="bnc-erro">${UI.esc(_bncErro)}</div>` : '';

  const corpo = _bncAba === 'conferencia' ? bncTelaConferencia(conf)
              : _bncAba === 'fechadas'    ? bncTabelaFechadas()
              : bncTabelaAbertas(abertas);

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

  return `
    <div class="bnc-conf-nota">
      Conferindo de <b>${bncFmtData(conf.desde)}</b> pra cá — o dia em que a bancada começou.
      ${conf.notas} aparelhos na nota · ${conf.registros} registrados.
      <span>Linha de nota anterior a essa data não conta como falta: é história, não falha.</span>
    </div>
    ${nada ? UI.card({corpo: UI.vazio({ico:'✅', titulo:'A nota bate com o registro',
        texto:'Nenhum aparelho saiu sem registro, nada voltou sem cobrança e os valores conferem.'})})
      : semRegistro + semNota + difs}`;
}

function bncOrigemBadge(o){
  if(o === 'garantia') return UI.badge('Garantia', 'alerta');
  if(o === 'cliente')  return UI.badge('Cliente', 'processo');
  return UI.badge('Estoque');
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

  const linhas = abertas.map(l => {
    const n = bncDias(l.saiu_em);
    return `<tr class="bnc-linha">
      <td data-rot="Aparelho" class="forte">${bncProduto(l)}</td>
      <td data-rot="Etiqueta"><span class="est-tag">${UI.esc(l.etiqueta || '—')}</span></td>
      <td data-rot="IMEI"><span class="bnc-imei">…${UI.esc(l.imei4 || '????')}</span></td>
      <td data-rot="Onde">${UI.esc(l.fornecedor === 'RR' ? 'RR / Legacy' : 'Access')}</td>
      <td data-rot="Serviço">${UI.esc(l.servico || '—')}</td>
      <td data-rot="Origem">${bncOrigemBadge(l.origem)}</td>
      <td data-rot="Saiu">${bncFmtData(l.saiu_em)}</td>
      <td data-rot="Dias" class="num">${UI.badge(n + 'd', bncTomDias(n))}</td>
      ${podeVerCustoServico() ? `<td data-rot="R$" class="num">${bncCampoValor(l)}</td>` : ''}
      <td data-rot="" class="num">${UI.btn('Voltou', {onclick:`bncBaixa(${l.id})`, sm:true})}</td>
    </tr>`;
  }).join('');

  return UI.card({
    titulo:'Na bancada', sub: abertas.length + ' aparelhos · do mais velho pro mais novo', flush:true,
    corpo: `<div class="c-tabela-wrap"><table class="c-tabela bnc-tabela">
      <thead><tr>
        <th>Aparelho</th><th>Etiqueta</th><th>IMEI</th><th>Onde</th><th>Serviço</th>
        <th>Origem</th><th>Saiu</th><th class="num">Dias</th>
        ${podeVerCustoServico() ? '<th class="num">R$</th>' : ''}<th></th>
      </tr></thead><tbody>${linhas}</tbody></table></div>`
  });
}

function bncTabelaFechadas(){
  const fechadas = (_bancadaCache || []).filter(l => l.voltou_em)
    .sort((a,b) => String(b.voltou_em).localeCompare(String(a.voltou_em)))
    .slice(0, 100);

  if(!fechadas.length){
    return UI.card({corpo: UI.vazio({
      ico:'📋', titulo:'Nada voltou ainda',
      texto:'Assim que você der baixa num aparelho, ele aparece aqui com o tempo que ficou fora.',
    })});
  }

  const linhas = fechadas.map(l => {
    const dias = l.saiu_em && l.voltou_em
      ? Math.max(0, Math.round((new Date(l.voltou_em+'T12:00:00') - new Date(l.saiu_em+'T12:00:00')) / 86400000))
      : 0;
    return `<tr>
      <td data-rot="Aparelho" class="forte">${bncProduto(l)}</td>
      <td data-rot="Etiqueta"><span class="est-tag">${UI.esc(l.etiqueta || '—')}</span></td>
      <td data-rot="Onde">${UI.esc(l.fornecedor === 'RR' ? 'RR / Legacy' : 'Access')}</td>
      <td data-rot="Serviço">${UI.esc(l.servico || '—')}</td>
      <td data-rot="Origem">${bncOrigemBadge(l.origem)}</td>
      <td data-rot="Saiu">${bncFmtData(l.saiu_em)}</td>
      <td data-rot="Voltou">${bncFmtData(l.voltou_em)}</td>
      <td data-rot="Ficou" class="num">${UI.badge(dias + 'd', bncTomDias(dias))}</td>
      ${podeVerCustoServico() ? `<td data-rot="R$" class="num">${bncCampoValor(l)}</td>` : ''}
      <td data-rot="" class="num">${UI.btn('desfazer', {onclick:`bncDesfazerBaixa(${l.id})`, variante:'sutil', sm:true})}</td>
    </tr>`;
  }).join('');

  const semValor = fechadas.filter(l => l.valor_cobrado == null).length;
  return UI.card({
    titulo:'Voltaram',
    sub: fechadas.length + ' últimas' + (podeVerCustoServico() && semValor
          ? ' · ' + semValor + ' sem valor da nota' : ''),
    flush:true,
    corpo: `<div class="c-tabela-wrap"><table class="c-tabela bnc-tabela">
      <thead><tr>
        <th>Aparelho</th><th>Etiqueta</th><th>Onde</th><th>Serviço</th>
        <th>Origem</th><th>Saiu</th><th>Voltou</th><th class="num">Ficou</th>
        ${podeVerCustoServico() ? '<th class="num">R$</th>' : ''}<th></th>
      </tr></thead><tbody>${linhas}</tbody></table></div>`
  });
}
