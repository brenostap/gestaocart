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

// `imei_1` é só reporte: é a chave que liga venda, reparo e bancada. Trocar
// sozinho quebraria o casamento de tudo.
const COR_CAMPOS = {
  bateria:  { rotulo:'Bateria',  tipo:'correcao', sufixo:'%' },
  etiqueta: { rotulo:'Etiqueta', tipo:'correcao' },
  imei_1:   { rotulo:'IMEI',     tipo:'reporte'  },
};

let _correcoesCache = null;     // null = nunca carregou
let _corCarregando  = false;
let _corErro        = '';
let _corSalvando    = '';       // 'apple_id:campo' em gravação

async function carregarCorrecoes(){
  if(_corCarregando) return _correcoesCache || [];
  _corCarregando = true;
  try {
    _correcoesCache = await sbGet('estoque_correcoes', 'order=atualizado_em.desc', 2000) || [];
  } catch(e){
    console.error('[correcoes] falha ao carregar:', e);
    _correcoesCache = _correcoesCache || [];
  } finally { _corCarregando = false; }
  return _correcoesCache;
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

  return `<div class="cor-bloco" onclick="event.stopPropagation()">
    <div class="cor-titulo">Corrigir o que está errado
      <span class="cor-sub">a FoneNinja continua sendo a fonte — isto marca a diferença</span></div>
    ${_corErro ? `<div class="bnc-erro">${UI.esc(_corErro)}</div>` : ''}
    <div class="cor-grade">
      ${campo('bateria',  String(d.bateria || ''), 'inputmode="numeric" maxlength="3"')}
      ${campo('etiqueta', d.etiqueta || '', 'placeholder="E1585"')}
      ${campo('imei_1',   d.imei || '', 'inputmode="numeric"')}
    </div>
    <span class="cor-nota">IMEI só levanta a mão: é a chave que liga venda, reparo e bancada,
      então quem troca de verdade é um sócio na FoneNinja.</span>
  </div>`;
}
