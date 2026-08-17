// ============================================================================
// CORREÇÕES DE ESTOQUE — o delta entre o que a loja sabe e o que a FoneNinja diz
//
// NÃO é um espelho do estoque. O sync reescreve as 237 linhas de `estoque` de
// hora em hora (conferido em 13/ago: 237 de 237 tocadas nas últimas 2h), então
// editar `estoque` direto seria escrever na areia. Aqui fica só o que mudou.
//
// AUTO-LIMPANTE: a correção existe enquanto DIVERGE. Quando a FoneNinja passa a
// dizer o mesmo valor, ela some da lista de divergência sozinha, no próprio
// sync. É isso que impede virar um segundo estoque.
//
// O buraco que ela fecha: 57% do estoque sem etiqueta, 45% sem bateria.
//
// Ver docs/CONTROLE-MANUTENCAO.md.
// ============================================================================

// ⚠️ Escopo global compartilhado (ver CLAUDE.md): prefixo `cor`/`correcoes`.

// `imei_1` é só reporte: é a chave que liga venda, reparo e assistência. Trocar
// sozinho quebraria o casamento de tudo.
const COR_CAMPOS = {
  bateria:  { rotulo:'Bateria',  tipo:'correcao', sufixo:'%' },
  etiqueta: { rotulo:'Etiqueta', tipo:'correcao' },
  imei_1:   { rotulo:'IMEI',     tipo:'reporte'  },
};

// ESTADO da peça — informação NOVA, que a FoneNinja não tem e nunca vai ter.
// Por isso mora em tabela própria e não na camada auto-limpante: não teria pra
// onde convergir. E é diferente da Bancada: aqui o aparelho está NA LOJA e não
// está pronto pra vender. Era o buraco entre "chegou" e "foi pra assistência".
//
// O conjunto mudou em 15/ago/2026 e o EIXO mudou junto. O antigo (revisado,
// avaliar, reparar, peça, sem conserto) descrevia o estado TÉCNICO. O novo
// descreve por que o aparelho não é uma venda normal agora — o que inclui
// motivo comercial, que o eixo técnico não sabia dizer.
//
// Cor = significado (docs/DESIGN-SYSTEM.md), e aqui ela responde "posso vender
// este aparelho hoje?":
//   saldão    → sem tom: dá pra vender, só que com desconto. Não é problema.
//   reparo    → âmbar:   precisa de ação antes de vender.
//   bloqueado → vermelho: não vende, ponto.
//   reservado → violeta: está num processo, tem dono.
//   outro     → sem tom: quem explica é a observação.
const COR_ESTADOS = [
  { v:'saldao',    t:'Saldão',        tom:'',         ico:'🏷️' },
  { v:'reparo',    t:'Precisa reparo', tom:'alerta',   ico:'🔧' },
  { v:'bloqueado', t:'Bloqueado',     tom:'critico',  ico:'⛔' },
  { v:'reservado', t:'Reservado',     tom:'processo', ico:'🔒' },
  { v:'outro',     t:'Outro',         tom:'',         ico:'✎' },
];

// Estados que TIRAM o aparelho da venda de hoje. `saldao` fica de fora de
// propósito: ele é o contrário — é pra vender logo. `outro` também, porque
// ninguém sabe o que ele significa sem ler a observação.
const COR_ESTADOS_NAO_VENDE = ['reparo', 'bloqueado', 'reservado'];
const COR_ESTADO_MAP = Object.fromEntries(COR_ESTADOS.map(e => [e.v, e]));

let _correcoesCache = null;     // null = nunca carregou
let _estadosCache   = null;     // apple_id -> linha de estoque_estado
let _corCarregando  = false;
let _corErro        = '';
let _corSalvando    = '';       // 'apple_id:campo' em gravacao
// Quem pediu pra editar os campos de correcao. Zera ao fechar a linha.
const _corEditando  = new Set();

async function carregarCorrecoes(){
  if(_corCarregando) return _correcoesCache || [];
  _corCarregando = true;
  try {
    const [cs, es] = await Promise.all([
      sbGet('estoque_correcoes', 'order=atualizado_em.desc', 2000),
      sbGet('estoque_estado', 'order=atualizado_em.desc', 2000),
    ]);
    _correcoesCache = cs || [];
    _estadosCache = {};
    (es || []).forEach(e => { _estadosCache[String(e.apple_id)] = e; });
  } catch(e){
    console.error('[correcoes] falha ao carregar:', e);
    _correcoesCache = _correcoesCache || [];
    _estadosCache = _estadosCache || {};
  } finally { _corCarregando = false; }
  return _correcoesCache;
}

function estadoDoApple(appleId){
  return (_estadosCache || {})[String(appleId)] || null;
}

// `obs` chega como undefined quando só o chip mudou -- nesse caso a observação
// que já estava lá é preservada. Passar '' apaga de verdade.
async function corSalvarEstado(appleId, estado, obs){
  _corErro = '';
  const anterior = estadoDoApple(appleId);
  try {
    if(!estado){
      const r = await fetch(`${SB_URL}/rest/v1/estoque_estado?apple_id=eq.${appleId}`,
        { method:'DELETE', headers:{ 'apikey':SB_KEY, 'Authorization':'Bearer '+SB_TOKEN } });
      if(!r.ok) throw new Error('HTTP ' + r.status);
      delete (_estadosCache || {})[String(appleId)];
    } else {
      const linha = { apple_id: Number(appleId), estado,
        obs: (obs === undefined ? (anterior && anterior.obs) : obs) || null,
        quem: (typeof usuarioEmail === 'string' ? usuarioEmail : '') || null,
        atualizado_em: new Date().toISOString() };
      const r = await fetch(SB_URL + '/rest/v1/estoque_estado', {
        method:'POST',
        headers:{ 'apikey':SB_KEY, 'Authorization':'Bearer '+SB_TOKEN,
          'Content-Type':'application/json',
          'Prefer':'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(linha),
      });
      if(!r.ok){
        const txt = await r.text().catch(() => '');
        throw new Error('HTTP ' + r.status + (txt ? ' — ' + txt.slice(0,160) : ''));
      }
      const [gravado] = await r.json();
      _estadosCache = _estadosCache || {};
      if(gravado) _estadosCache[String(appleId)] = gravado;
    }
  } catch(e){
    _corErro = 'Não gravou o estado: ' + e.message;
    console.error('[estado]', e);
  }
  if(currentTab === 'estoque') renderContent();
}

// Toca no mesmo estado = desmarca. Sem isso ele fica preso na primeira escolha.
function corMarcarEstado(appleId, estado){
  const atual = estadoDoApple(appleId);
  return corSalvarEstado(appleId, (atual && atual.estado === estado) ? null : estado);
}

// A observação grava sozinha, sem mexer no estado. Desmarcar o estado apaga a
// linha inteira -- e a observação junto, que é o certo: ela descreve aquele
// estado, não o aparelho.
function corSalvarObs(appleId){
  const el = document.getElementById('cor-obs-' + appleId);
  const atual = estadoDoApple(appleId);
  if(!el || !atual) return;
  return corSalvarEstado(appleId, atual.estado, el.value.trim());
}

// apple_id -> { campo: linha }
function correcoesDoApple(appleId){
  const out = {};
  (_correcoesCache || []).forEach(c => {
    if(String(c.apple_id) === String(appleId)) out[c.campo] = c;
  });
  return out;
}

// O valor que a FoneNinja traz hoje, normalizado pra comparar com o corrigido.
function corValorFN(item, campo){
  if(campo === 'etiqueta') return String(item.serial || '');
  if(campo === 'bateria')  return String(parseInt(item.bateria || 0) || '');
  return String(item[campo] || '');
}

// A correção "morreu"? Só quando a FoneNinja concorda. É a linha inteira do
// desenho: ninguém marca como resolvida, o sync resolve.
function corResolvida(item, c){
  if(!c || c.tipo === 'reporte') return false;
  return corValorFN(item, c.campo) === String(c.valor_novo);
}

// Correções vivas (ainda divergindo) de um aparelho.
function corDivergencias(item){
  const cs = correcoesDoApple(item.id);
  return Object.values(cs).filter(c => c.tipo === 'reporte' || !corResolvida(item, c));
}

// ---------------------------------------------------------------------------
// GRAVAÇÃO
// ---------------------------------------------------------------------------

async function corSalvar(appleId, campo, valorNovo, item){
  const def = COR_CAMPOS[campo];
  if(!def) throw new Error('campo não editável: ' + campo);
  const chave = appleId + ':' + campo;
  _corSalvando = chave; _corErro = '';
  try {
    const linha = {
      apple_id: Number(appleId), campo,
      valor_novo: String(valorNovo).trim(),
      valor_fn: item ? corValorFN(item, campo) : null,
      tipo: def.tipo,
      quem: (typeof usuarioEmail === 'string' ? usuarioEmail : '') || null,
      atualizado_em: new Date().toISOString(),
    };
    const r = await fetch(SB_URL + '/rest/v1/estoque_correcoes', {
      method: 'POST',
      headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_TOKEN,
        'Content-Type': 'application/json',
        // upsert pelo par (apple_id, campo): corrigir de novo sobrescreve
        'Prefer': 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(linha),
    });
    if(!r.ok){
      const txt = await r.text().catch(() => '');
      throw new Error('HTTP ' + r.status + (txt ? ' — ' + txt.slice(0,160) : ''));
    }
    const [gravada] = await r.json();
    _correcoesCache = (_correcoesCache || []).filter(c =>
      !(String(c.apple_id) === String(appleId) && c.campo === campo));
    if(gravada) _correcoesCache.unshift(gravada);
  } catch(e){
    _corErro = 'Não gravou: ' + e.message;
    console.error('[correcoes]', e);
  } finally { _corSalvando = ''; }
}

async function corApagar(appleId, campo){
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/estoque_correcoes?apple_id=eq.${appleId}&campo=eq.${campo}`,
      { method: 'DELETE', headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_TOKEN } });
    if(!r.ok) throw new Error('HTTP ' + r.status);
    _correcoesCache = (_correcoesCache || []).filter(c =>
      !(String(c.apple_id) === String(appleId) && c.campo === campo));
  } catch(e){
    _corErro = 'Não consegui apagar: ' + e.message;
  }
}

// ---------------------------------------------------------------------------
// UI — o formulário mora dentro da linha expandida do Estoque
// ---------------------------------------------------------------------------

function corFormId(appleId, campo){ return `cor-${campo}-${appleId}`; }

async function corAplicarCampo(appleId, campo){
  const el = document.getElementById(corFormId(appleId, campo));
  if(!el) return;
  const valor = String(el.value || '').trim();
  const item = (estoqueItens || []).find(i => String(i.id) === String(appleId));
  if(!valor){ await corApagar(appleId, campo); }
  else if(campo === 'bateria' && !(parseInt(valor) > 0 && parseInt(valor) <= 100)){
    _corErro = 'Bateria tem que ser de 1 a 100.';
  }
  else { await corSalvar(appleId, campo, valor, item); }
  if(currentTab === 'estoque') renderContent();
}

// Bloco editável dentro do detalhe da linha do Estoque.
function corBlocoHtml(d){
  const id = d.item.id;
  const cs = correcoesDoApple(id);
  const campo = (campo, valorAtual, extra) => {
    const c = cs[campo];
    const def = COR_CAMPOS[campo];
    const resolvida = corResolvida(d.item, c);
    const marca = !c ? ''
      : resolvida ? UI.badge('já na FoneNinja', 'ok')
      : def.tipo === 'reporte' ? UI.badge('reportado', 'alerta')
      : UI.badge('corrigido aqui', 'processo');
    return `<div class="cor-campo">
      <i class="det-rot">${def.rotulo} ${marca}</i>
      <div class="cor-linha">
        <input class="c-input" id="${corFormId(id, campo)}" ${extra || ''}
               value="${UI.esc(c ? c.valor_novo : valorAtual)}"
               placeholder="${UI.esc(valorAtual || '—')}"
               onclick="event.stopPropagation()">
        ${UI.btn('Salvar', {onclick:`event.stopPropagation();corAplicarCampo(${id},'${campo}')`, sm:true})}
      </div>
      ${c && !resolvida ? `<span class="cor-antes">FoneNinja diz: ${UI.esc(c.valor_fn || '—')}
        · por ${UI.esc((c.quem||'').split('@')[0])}</span>` : ''}
    </div>`;
  };

  const est = estadoDoApple(id);
  const fora = typeof bancadaDoApple === 'function' ? bancadaDoApple(id, d.imei) : null;
  const estadoBloco = `
    <div class="cor-estado">
      <i class="det-rot">Estado da peça</i>
      ${fora ? `<div class="cor-estado-fora">Está na assistência desde ${UI.esc(fora.saiu_em)} —
        isso vem da Assistência e não se marca aqui.</div>` : ''}
      <div class="bnc-chips">
        ${COR_ESTADOS.map(e => `<button class="c-chip cor-chip${est && est.estado === e.v ? ' ativo' : ''}"
            data-tom="${e.tom}" onclick="event.stopPropagation();corMarcarEstado(${id},'${e.v}')"
            >${e.ico} ${e.t}</button>`).join('')}
      </div>
      ${est ? `
        <div class="cor-linha cor-obs">
          <input class="c-input" id="cor-obs-${id}" placeholder="${
            est.estado === 'outro' ? 'O que está acontecendo com este aparelho?'
                                   : 'Observação (opcional)'}"
                 value="${UI.esc(est.obs || '')}"
                 onclick="event.stopPropagation()"
                 onkeydown="if(event.key==='Enter'){event.preventDefault();corSalvarObs(${id})}">
          ${UI.btn('Salvar', {onclick:`event.stopPropagation();corSalvarObs(${id})`, sm:true})}
        </div>
        <span class="cor-antes">marcado por ${UI.esc((est.quem||'').split('@')[0])} ·
          toque no mesmo estado pra desmarcar</span>` : ''}
    </div>`;

  // ⚠️ Os campos de correção ficam FECHADOS até pedirem. Abrir o aparelho é o
  // gesto de "quero ver", e ele acontece o dia todo; a etiqueta e o IMEI
  // estavam a um toque de distância de serem trocados sem querer -- e o IMEI é
  // a chave que liga venda, reparo e assistência. O estado da peça continua à
  // vista de propósito: é a marcação do dia a dia, e um toque a desfaz.
  const editando = _corEditando.has(String(id));
  const camposBloco = editando ? `
    <div class="cor-titulo">Editando
      <span class="cor-sub">a FoneNinja continua sendo a fonte — isto marca a diferença</span></div>
    <div class="cor-grade">
      ${campo('bateria',  String(d.bateria || ''), 'inputmode="numeric" maxlength="3"')}
      ${campo('etiqueta', d.etiqueta || '', 'placeholder="E1585"')}
      ${campo('imei_1',   d.imei || '', 'inputmode="numeric"')}
    </div>
    <span class="cor-nota">IMEI só levanta a mão: é a chave que liga venda, reparo e assistência,
      então quem troca de verdade é um sócio na FoneNinja.</span>`
    // O botao continua FECHANDO os campos (ver o aviso acima), mas agora diz o
    // que ha dentro. Antes era "✎ Corrigir dados do aparelho": nao dava pra
    // saber se valia o toque, entao ninguem tocava.
    : `<div class="cor-abrir">
        ${UI.btn('Editar', {onclick:`event.stopPropagation();corAbrirEdicao(${id})`, variante:'sutil', sm:true})}
        <span class="cor-editaveis">bateria · etiqueta · IMEI</span>
      </div>`;

  return `<div class="cor-bloco" onclick="event.stopPropagation()">
    ${_corErro ? `<div class="bnc-erro">${UI.esc(_corErro)}</div>` : ''}
    ${estadoBloco}
    ${camposBloco}
  </div>`;
}

// Fechar a linha esquece a edição: se o aparelho for reaberto depois, volta
// fechado. Sem isso o "modo perigoso" ficaria ligado sem ninguém ver.
function corAbrirEdicao(appleId){
  _corEditando.add(String(appleId));
  if(currentTab === 'estoque') renderContent();
}
function corFecharEdicao(appleId){
  _corEditando.delete(String(appleId));
}
