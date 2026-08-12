// ============================================================================
// UI — vocabulario de componentes do Cart System
//
// As telas devem PEDIR componentes em vez de escrever estilo inline. Assim um
// ajuste de token ou de espacamento vale para o sistema inteiro, em vez de
// exigir busca-e-substitui em 566 lugares.
//
//   UI.card({titulo, sub, acao, corpo})
//   UI.kpi({rotulo, valor, sub, tom})   UI.kpis([...])
//   UI.badge(texto, tom)
//   UI.tabela({colunas, linhas, vazio})
//   UI.vazio({ico, titulo, texto, acao})
//   UI.btn(texto, {onclick, variante, sm})
//   UI.chip(texto, ativo, onclick)
//   UI.barra(pct, tom)
//   UI.kv(chave, valor)
//   UI.painel({titulo, corpo, onFechar})
//
// tom: 'ok' | 'alerta' | 'critico' | 'processo' | 'marca' | undefined
// ============================================================================

const UI = {

  esc(s){
    return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
      ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  },

  _tom(t){ return t ? ` data-tom="${t}"` : ''; },

  // -- Card ---------------------------------------------------------------
  card({titulo, sub, acao, corpo, flush, classe} = {}){
    const cabecalho = (titulo || acao) ? `
      <div class="c-card-head">
        ${titulo ? `<div class="c-card-title">${titulo}${sub ? ` <span class="c-card-sub">${sub}</span>` : ''}</div>` : ''}
        ${acao ? `<div class="c-card-action">${acao}</div>` : ''}
      </div>` : '';
    return `<div class="c-card${classe ? " "+classe : ""}">${cabecalho}
      <div class="c-card-body${flush ? ' flush' : ''}">${corpo || ''}</div>
    </div>`;
  },

  // -- KPI ----------------------------------------------------------------
  kpi({rotulo, valor, sub, tom} = {}){
    return `<div class="c-kpi"${this._tom(tom)}>
      <span class="c-kpi-label">${rotulo || ''}</span>
      <span class="c-kpi-value">${valor == null ? '—' : valor}</span>
      ${sub ? `<span class="c-kpi-sub">${sub}</span>` : ''}
    </div>`;
  },
  kpis(lista){ return `<div class="c-kpi-grid">${(lista||[]).map(k => this.kpi(k)).join('')}</div>`; },

  // -- Badge --------------------------------------------------------------
  badge(texto, tom, mono){
    return `<span class="c-badge${mono ? ' c-badge-mono' : ''}"${this._tom(tom)}>${texto}</span>`;
  },

  // -- Badge de forma de pagamento ----------------------------------------
  // Eixo de cor proprio (data-forma), nao os tons semanticos. Normaliza o nome
  // cru da FoneNinja ("Pix MercadoPago", "Crédito"...) para chave + rotulo curto.
  // Forma nao reconhecida vira badge neutro com o texto original.
  badgePagto(forma){
    const raw = String(forma == null ? '' : forma).toLowerCase();
    let key = '', label = forma || '—';
    if(raw.includes('pix'))                          { key = 'pix';      label = 'Pix'; }
    else if(raw.includes('créd') || raw.includes('cred')) { key = 'credito';  label = 'Crédito'; }
    else if(raw.includes('déb')  || raw.includes('deb'))  { key = 'debito';   label = 'Débito'; }
    else if(raw.includes('dinh'))                    { key = 'dinheiro'; label = 'Dinheiro'; }
    return `<span class="c-badge"${key ? ` data-forma="${key}"` : ''}>${this.esc(label)}</span>`;
  },

  // -- Tabela -------------------------------------------------------------
  // colunas: [{titulo, num, largura}]
  // linhas:  [[celula, ...]]  — celula pode ser string ou {v, num, classe}
  // onLinha: recebe o indice e devolve o codigo do onclick da <tr>
  tabela({colunas = [], linhas = [], vazio, onLinha} = {}){
    if(!linhas.length){
      return vazio || this.vazio({titulo:'Nada por aqui', texto:'Não há registros para este filtro.'});
    }
    const th = colunas.map(c =>
      `<th class="${c.num ? 'num' : ''}"${c.largura ? ` style="width:${c.largura}"` : ''}>${c.titulo || ''}</th>`).join('');
    const tr = linhas.map((l, li) => `<tr${onLinha ? ` class="clicavel" onclick="${onLinha(li)}"` : ''}>${l.map((cel, i) => {
      const o = (cel && typeof cel === 'object') ? cel : {v: cel};
      const num = o.num !== undefined ? o.num : (colunas[i] && colunas[i].num);
      return `<td class="${num ? 'num ' : ''}${o.classe || ''}">${o.v == null ? '—' : o.v}</td>`;
    }).join('')}</tr>`).join('');
    return `<div class="c-tabela-wrap"><table class="c-tabela">
      <thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
  },

  // -- Estado vazio (sempre diz o proximo passo, brief §7.5) --------------
  vazio({ico, titulo, texto, acao} = {}){
    return `<div class="c-vazio">
      ${ico ? `<div class="c-vazio-ico">${ico}</div>` : ''}
      <div class="c-vazio-titulo">${titulo || 'Nada por aqui'}</div>
      ${texto ? `<div class="c-vazio-texto">${texto}</div>` : ''}
      ${acao || ''}
    </div>`;
  },

  // -- Botao / chip -------------------------------------------------------
  btn(texto, {onclick, variante, sm, id, titulo, disabled} = {}){
    return `<button class="c-btn${variante ? ' '+variante : ''}${sm ? ' c-btn-sm' : ''}"
      ${id ? `id="${id}"` : ''} ${onclick ? `onclick="${onclick}"` : ''}
      ${titulo ? `title="${this.esc(titulo)}"` : ''} ${disabled ? 'disabled' : ''}>${texto}</button>`;
  },
  chip(texto, ativo, onclick){
    return `<button class="c-chip${ativo ? ' ativo' : ''}" onclick="${onclick}">${texto}</button>`;
  },
  toolbar(...partes){ return `<div class="c-toolbar">${partes.filter(Boolean).join('')}</div>`; },
  sep(){ return '<div class="c-sep"></div>'; },

  // -- Barra de progresso -------------------------------------------------
  barra(pct, tom){
    const p = Math.max(0, Math.min(100, Number(pct) || 0));
    return `<div class="c-barra"><div class="c-barra-fill"${this._tom(tom)} style="width:${p}%"></div></div>`;
  },

  // -- Linha chave/valor --------------------------------------------------
  kv(chave, valor){
    return `<div class="c-kv"><span class="c-kv-k">${chave}</span><span class="c-kv-v">${valor == null ? '—' : valor}</span></div>`;
  },

  // -- Painel lateral (vira sheet no celular) -----------------------------
  painel({titulo, corpo, onFechar} = {}){
    // Sem aspas duplas: o handler vai dentro de onclick="…" (aspas duplas). Usar
    // aspas duplas aqui cortava o atributo no meio e quebrava o botao de fechar.
    const fechar = onFechar || 'UI.fecharPainel()';
    return `<div class="c-painel-overlay" onclick="if(event.target===this){${fechar}}">
      <div class="c-painel">
        <div class="c-painel-head">
          <div class="c-card-title">${titulo || ''}</div>
          <div class="c-card-action">${this.btn('✕', {onclick: fechar, variante:'sutil', sm:true})}</div>
        </div>
        <div class="c-painel-body">${corpo || ''}</div>
      </div>
    </div>`;
  },

  abrirPainel(opts){
    document.querySelector('.c-painel-overlay')?.remove();
    document.body.insertAdjacentHTML('beforeend', this.painel(opts));
  },
  fecharPainel(){ document.querySelector('.c-painel-overlay')?.remove(); },

  // -- Campos de formulario -----------------------------------------------
  // Tela nova nao escreve <input> na mao: pede UI.campo(...) (brief §1).
  campo({label, corpo} = {}){
    return `<div class="c-field">
      ${label ? `<span class="c-field-label">${label}</span>` : ''}
      ${corpo || ''}
    </div>`;
  },
  input({id, tipo, valor, placeholder, extra} = {}){
    return `<input class="c-input" id="${id}" type="${tipo || 'text'}"
      value="${valor == null ? '' : this.esc(valor)}"
      ${placeholder ? `placeholder="${this.esc(placeholder)}"` : ''} ${extra || ''}>`;
  },
  // `extra` carrega atributos crus (onchange, disabled...). Sem ele a tela
  // precisava remendar a string com .replace('<select', ...), que quebra calado
  // no dia em que a marcacao daqui mudar.
  select({id, opcoes = [], valor, extra} = {}){
    const opts = opcoes.map(o => {
      const v = (o && typeof o === 'object') ? o.v : o;
      const t = (o && typeof o === 'object') ? o.t : o;
      return `<option value="${this.esc(v)}"${String(v) === String(valor) ? ' selected' : ''}>${t}</option>`;
    }).join('');
    return `<select class="c-select" id="${id}" ${extra || ''}>${opts}</select>`;
  },
  linha(...campos){ return `<div class="c-field-row${campos.length > 1 ? ' dois' : ''}">${campos.join('')}</div>`; },

  // -- Modal central (acao focada: criar/editar) --------------------------
  // classe:'largo' quando o conteudo e uma tabela de comparacao — os 460px
  // padrao cortam colunas, e tabela cortada derrota o proposito de comparar.
  modal({titulo, corpo, foot, id, onFechar, classe} = {}){
    const fechar = onFechar || 'UI.fecharModal()';
    return `<div class="c-modal-overlay" ${id ? `id="${id}"` : ''} onclick="if(event.target===this){${fechar}}">
      <div class="c-modal${classe ? ' '+classe : ''}">
        <div class="c-modal-head">
          <div class="c-modal-title">${titulo || ''}</div>
          ${this.btn('✕', {onclick: fechar, variante:'sutil', sm:true})}
        </div>
        <div class="c-modal-body">${corpo || ''}</div>
        ${foot ? `<div class="c-modal-foot">${foot}</div>` : ''}
      </div>
    </div>`;
  },
  abrirModal(opts){
    this.fecharModal();
    document.body.insertAdjacentHTML('beforeend', this.modal(opts));
  },
  fecharModal(){ document.querySelector('.c-modal-overlay')?.remove(); },
};
