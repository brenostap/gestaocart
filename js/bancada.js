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
  return `<input class="c-input bnc-valor" inputmode="decimal" placeholder="—"
     value="${l.valor_cobrado == null ? '' : l.valor_cobrado}"
     onchange="bncSalvarValor(${l.id}, this)" onclick="event.stopPropagation()">`;
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

  const abas = UI.toolbar(
    UI.chip('Na bancada (' + abertas.length + ')', _bncAba === 'abertas', "setBancadaAba('abertas')"),
    UI.chip('Voltaram', _bncAba === 'fechadas', "setBancadaAba('fechadas')")
  );

  const erro = _bncErro && currentTab === 'bancada'
    ? `<div class="bnc-erro">${UI.esc(_bncErro)}</div>` : '';

  return cabecalho + UI.kpis(kpis) + erro + abas
       + (_bncAba === 'abertas' ? bncTabelaAbertas(abertas) : bncTabelaFechadas());
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
