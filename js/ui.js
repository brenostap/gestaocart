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

  // -- Tabela -------------------------------------------------------------
  // colunas: [{titulo, num, largura}]
  // linhas:  [[celula, ...]]  — celula pode ser string ou {v, num, classe}
  tabela({colunas = [], linhas = [], vazio} = {}){
    if(!linhas.length){
      return vazio || this.vazio({titulo:'Nada por aqui', texto:'Não há registros para este filtro.'});
    }
    const th = colunas.map(c =>
      `<th class="${c.num ? 'num' : ''}"${c.largura ? ` style="width:${c.largura}"` : ''}>${c.titulo || ''}</th>`).join('');
    const tr = linhas.map(l => `<tr>${l.map((cel, i) => {
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
    const fechar = onFechar || 'document.querySelector(".c-painel-overlay")?.remove()';
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
};
