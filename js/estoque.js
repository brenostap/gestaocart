function getCorStyle(titulo){
  const t=titulo.toLowerCase();
  for(const [key,val] of Object.entries(COR_MAP)){
    if(t.includes(key)) return val;
  }
  return null;
}
function corNomeHtml(cl){
  const cs=getCorStyle(cl);
  if(!cs) return cl;
  return '<span style="background:'+cs.bg+';color:'+cs.fg+';padding:1px 6px;border-radius:5px;font-size:11px">'+cl+'</span>';
}
function estNomeHtml(curto, completo){
  const cs=getCorStyle(completo);
  if(!cs) return curto;
  const corMatch=completo.match(/(?:tit[aâ]nio [a-z]+|preto|branco|rosa|roxo|azul|verde|dourado|grafite|estelar|prateado|meia noite|lavanda|laranja|amarelo|chumbo)/i);
  const corLabel=corMatch?corMatch[0]:'';
  return curto+'<span style="background:'+cs.bg+';color:'+cs.fg+';padding:0 5px;border-radius:4px;font-size:10px;margin-left:5px">'+corLabel+'</span>';
}
// ===================================================================
// ESTOQUE V3 -- Vista Agrupada + Lista Expansivel + WhatsApp
// ===================================================================

// Helpers globais (usados por render, lista e templates WA)
const CORES_HEX = {
  'branco': '#f5f5f0',
  'preto': '#1a1a1a',
  'cinza espacial': '#3d3d3d',
  'grafite': '#3d3d3d',
  'prata': '#d8d8d8',
  'prateado': '#d8d8d8',
  'dourado': '#e8c887',
  'rosa': '#f4b6c2',
  'azul': '#4a6fa5',
  'azul pacifico': '#5b8bf5',
  'azul sierra': '#6b7d9b',
  'verde': '#7ba88a',
  'verde alpino': '#5d7a5e',
  'verde meia noite': '#1a3d2e',
  'verde-acinzentado': '#6b8074',
  'vermelho': '#c53030',
  'amarelo': '#f4d03f',
  'roxo': '#9b59b6',
  'roxo profundo': '#5e3a7a',
  'preto espacial': '#1a1a1a',
  'meia noite': '#1c1c2e',
  'meia-noite': '#1c1c2e',
  'estelar': '#e8d4d0',
  'ultramarino': '#3b5998',
  'lavanda': '#c5b8d8',
  'salvia': '#a8b89c',
  'titanio natural': '#e5e5dc',
  'titanio azul': '#4a6fa5',
  'titanio branco': '#d4d4dc',
  'titanio preto': '#3d3d3d',
  'titanio desert': '#c4a575',
  'titanio laranja cosmico': '#d97044',
  'laranja cosmico': '#d97044',
  'laranja': '#e07a3c',
  'ouro rose': '#dba89a',
  'preto brilhante': '#0a0a0a',
  'preto meia noite': '#1c1c2e',
  'natural': '#e5e5dc'
};

function corHex(corNome){
  if(!corNome || corNome === '?') return '#d2d2d7';
  const key = corNome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  return CORES_HEX[key] || '#d2d2d7';
}

function corPrecisaBorda(corNome){
  const claras = ['branco','estelar','natural','titanio natural','titanio branco','prata','prateado','lavanda','salvia','rosa'];
  const key = (corNome||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  return claras.some(c => key.includes(c));
}

function batClassEst(bat){
  if(!bat || bat === 0) return '';
  if(bat < 80) return 'ruim';
  if(bat < 85) return 'medio';
  return 'bom';
}

function dataEntradaFmt(item){
  const mov = item.movimentacoes && item.movimentacoes.length > 0 ? item.movimentacoes[0] : null;
  const data = mov ? (mov.created_at||'').slice(0,10) : (item.created_at||'').slice(0,10);
  if(!data) return '—';
  const [y,m,d] = data.split('-');
  const meses = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  return `${d}/${meses[parseInt(m)-1]}`;
}

function fornCompacto(item){
  const mov = item.movimentacoes && item.movimentacoes.length > 0 ? item.movimentacoes[0] : null;
  const isUpgrade = mov && mov.parent_type === 'upgrade';
  if(isUpgrade) return 'Upgrade';
  return (getFornNome(item) || '—').slice(0, 12);
}

function escapeKey(k){ return String(k).replace(/'/g, "\\'"); }
function escapeHtml(s){ return String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

function bolinhaEmoji(cor){
  const k = (cor||'').toLowerCase();
  if(k.includes('branco') || k.includes('natural') || k.includes('estelar')) return '⚪';
  if(k.includes('preto') || k.includes('meia noite') || k.includes('grafite')) return '⚫';
  if(k.includes('azul')) return '🔵';
  if(k.includes('vermelho')) return '🔴';
  if(k.includes('amarelo') || k.includes('dourado')) return '🟡';
  if(k.includes('verde')) return '🟢';
  if(k.includes('rosa') || k.includes('lavanda') || k.includes('roxo')) return '🟣';
  if(k.includes('laranja') || k.includes('desert')) return '🟠';
  return '⚪';
}

// Constroi arvore Modelo > Capacidade > Cor > [items]
function construirTreeEstoque(items, search){
  const q = (search||'').toLowerCase().trim();
  const tree = {};
  items.forEach(item => {
    const titulo = item.produto?.titulo || item.titulo || '';
    const { modelo, capacidade, cor } = parseTitulo(titulo);
    if(q){
      const matchTitulo = titulo.toLowerCase().includes(q);
      const matchImei = (item.imei_1||'').toLowerCase().includes(q);
      const matchSerial = (item.serial||'').toLowerCase().includes(q);
      const matchForn = (getFornNome(item)||'').toLowerCase().includes(q);
      if(!matchTitulo && !matchImei && !matchSerial && !matchForn) return;
    }
    if(!tree[modelo]) tree[modelo] = { caps:{}, total:0, custoTotal:0 };
    if(!tree[modelo].caps[capacidade]) tree[modelo].caps[capacidade] = { cores:{}, total:0, custoTotal:0 };
    if(!tree[modelo].caps[capacidade].cores[cor]) tree[modelo].caps[capacidade].cores[cor] = { items:[], custoTotal:0 };
    const custo = parseFloat(item.valor_estoque||0);
    tree[modelo].caps[capacidade].cores[cor].items.push(item);
    tree[modelo].caps[capacidade].cores[cor].custoTotal += custo;
    tree[modelo].caps[capacidade].total++;
    tree[modelo].caps[capacidade].custoTotal += custo;
    tree[modelo].total++;
    tree[modelo].custoTotal += custo;
  });
  return tree;
}

function renderEstoque(){
  const disponiveis = estoqueItens;
  if(!_precosCache) carregarTabelaPrecos().then(() => renderContent());

  const custoTotal = disponiveis.reduce((a,i) => a + parseFloat(i.valor_estoque||0), 0);
  const modelosUnicos = new Set(disponiveis.map(i => parseTitulo(i.produto?.titulo || i.titulo || '').modelo)).size;

  const kpisHTML = `
    <div class="est-kpi-strip">
      <div class="kpi-mini">
        <div class="kpi-mini-label">Em estoque</div>
        <div class="kpi-mini-value">${disponiveis.length}<span class="unit"> un</span></div>
      </div>
      <div class="kpi-mini">
        <div class="kpi-mini-label">Custo total parado</div>
        <div class="kpi-mini-value">${brl(custoTotal)}</div>
      </div>
      <div class="kpi-mini">
        <div class="kpi-mini-label">Modelos diferentes</div>
        <div class="kpi-mini-value">${modelosUnicos}</div>
      </div>
    </div>`;

  const headerHTML = `
    <div class="est-header">
      <div class="est-view-toggle">
        <button class="${estoqueViewV3==='agrupado'?'active':''}" onclick="setEstoqueViewV3('agrupado')">Agrupado</button>
        <button class="${estoqueViewV3==='lista'?'active':''}" onclick="setEstoqueViewV3('lista')">Lista</button>
      </div>
      <div class="est-search-wrap">
        <span class="est-search-icon">⌕</span>
        <input type="text" class="est-search-input" id="est-search-v3" placeholder="Buscar por modelo, IMEI, etiqueta, fornecedor..."
               value="${escapeHtml(estoqueSearchV3)}" oninput="setEstoqueSearchV3(this.value)">
      </div>
      <button class="est-wa-btn" onclick="abrirWaModal()">
        <span class="wa-icon">💬</span> Exportar WhatsApp
      </button>
    </div>`;

  const tree = construirTreeEstoque(disponiveis, estoqueSearchV3);

  if(estoqueViewV3 === 'agrupado'){
    return kpisHTML + headerHTML + renderEstoqueAgrupado(tree);
  } else {
    return kpisHTML + headerHTML + renderEstoqueLista(tree);
  }
}

function renderEstoqueAgrupado(tree){
  const modelosOrdenados = Object.entries(tree).sort((a,b) => a[0].localeCompare(b[0]));
  if(modelosOrdenados.length === 0){
    return '<div style="padding:40px;text-align:center;color:var(--text-4);font-size:13px">Nenhum item encontrado</div>';
  }
  let html = '';
  modelosOrdenados.forEach(([modelo, dataModelo]) => {
    const capsCount = Object.keys(dataModelo.caps).length;
    html += `
      <div class="est-agr-modelo">
        <div class="est-agr-modelo-header">
          <div class="est-agr-modelo-nome">
            <strong>${escapeHtml(modelo)}</strong>
            <span>${dataModelo.total} un · ${capsCount} ${capsCount===1?'capacidade':'capacidades'}</span>
          </div>
          <div class="est-agr-modelo-custo">${brl(dataModelo.custoTotal)} custo</div>
        </div>`;

    const ordCap = ['64GB','128GB','256GB','512GB','1TB','?'];
    const capsOrdered = Object.entries(dataModelo.caps).sort((a,b) => {
      const ia = ordCap.indexOf(a[0]); const ib = ordCap.indexOf(b[0]);
      return (ia<0?99:ia) - (ib<0?99:ib);
    });

    capsOrdered.forEach(([cap, dataCap]) => {
      const itemRef = Object.values(dataCap.cores)[0]?.items[0];
      const precoInfo = itemRef ? getPrecoVendaSync(itemRef) : null;
      const precoVenda = precoInfo?.varejo;
      const precoHTML = precoVenda
        ? `<div class="est-cap-preco">${brl(precoVenda)}</div>`
        : `<div class="est-cap-preco empty">—</div>`;

      html += `
        <div class="est-cap-card">
          <div class="est-cap-head">
            <div>
              <div class="est-cap-label">${escapeHtml(cap)} · ${dataCap.total} un</div>
              <div class="est-cap-sub">${brl(dataCap.custoTotal)} custo total</div>
            </div>
            ${precoHTML}
          </div>
          <div class="est-cores-row">`;

      const coresOrdered = Object.entries(dataCap.cores).sort((a,b) => b[1].items.length - a[1].items.length);
      coresOrdered.forEach(([cor, dataCor]) => {
        const qtd = dataCor.items.length;
        const critico = qtd <= 2 && cor !== '?';
        const corKey = `${modelo}__${cap}__${cor}`;
        const isOpen = estoqueColorOpen === corKey;
        const hex = corHex(cor);
        const borda = corPrecisaBorda(cor) ? 'borda' : '';
        const cls = `est-cor-chip${isOpen?' active':''}${critico?' critico':''}`;
        html += `
          <div class="${cls}" onclick="toggleCorEst('${escapeKey(corKey)}')">
            <span class="est-cor-bolinha ${borda} ${critico?'critico':''}" style="background:${hex}"></span>
            <span>${escapeHtml(cor)} <strong style="font-weight:500">${qtd}</strong></span>
          </div>`;
      });
      html += `</div>`;

      const corAbertaKey = estoqueColorOpen;
      if(corAbertaKey){
        const partes = corAbertaKey.split('__');
        const mAb = partes[0], cAb = partes[1], corAb = partes.slice(2).join('__');
        if(mAb === modelo && cAb === cap){
          const dataCorAb = dataCap.cores[corAb];
          if(dataCorAb){
            html += renderImeisExpand(modelo, cap, corAb, dataCorAb.items);
          }
        }
      }
      html += `</div>`;
    });
    html += `</div>`;
  });
  return html;
}

function renderImeisExpand(modelo, cap, cor, items){
  const itemsOrdenados = items.slice().sort((a,b) => parseInt(b.bateria||0) - parseInt(a.bateria||0));
  let h = `
    <div class="est-imeis-expand">
      <div class="est-imeis-head">
        <div class="est-imeis-title">${items.length} ${items.length===1?'unidade':'unidades'}</div>
        <button class="est-wa-mini" onclick="event.stopPropagation();gerarTextoWhatsAppB('${escapeKey(modelo)}','${escapeKey(cap)}','${escapeKey(cor)}')">
          <span style="color:#25d366">💬</span> Texto WhatsApp
        </button>
      </div>
      <div class="est-imeis-grid head">
        <div>Etiq</div>
        <div>IMEI</div>
        <div>Bat</div>
        <div>Forn</div>
        <div class="data">Entrada</div>
        <div style="text-align:right">Custo</div>
      </div>`;
  itemsOrdenados.forEach(item => {
    const bat = parseInt(item.bateria||0);
    const batCls = batClassEst(bat);
    const custo = parseFloat(item.valor_estoque||0);
    h += `
      <div class="est-imeis-grid">
        <div class="etiq">${escapeHtml(item.serial || '—')}</div>
        <div class="imei">${escapeHtml(item.imei_1 || '—')}</div>
        <div class="bat ${batCls}">${bat>0 ? bat+'%' : '—'}</div>
        <div>${escapeHtml(fornCompacto(item))}</div>
        <div class="data" style="font-size:10px;color:var(--text-3)">${dataEntradaFmt(item)}</div>
        <div class="custo">${custo>0 ? brl(custo) : '—'}</div>
      </div>`;
  });
  h += `</div>`;
  return h;
}

function renderEstoqueLista(tree){
  const skus = [];
  Object.entries(tree).forEach(([modelo, dataModelo]) => {
    Object.entries(dataModelo.caps).forEach(([cap, dataCap]) => {
      Object.entries(dataCap.cores).forEach(([cor, dataCor]) => {
        const custoMedio = dataCor.items.length > 0 ? dataCor.custoTotal / dataCor.items.length : 0;
        const itemRef = dataCor.items[0];
        const precoInfo = itemRef ? getPrecoVendaSync(itemRef) : null;
        skus.push({
          modelo, cap, cor,
          qtd: dataCor.items.length,
          custoMedio,
          precoVenda: precoInfo?.varejo,
          items: dataCor.items,
          critico: dataCor.items.length <= 2 && cor !== '?'
        });
      });
    });
  });

  const ordCap = ['64GB','128GB','256GB','512GB','1TB','?'];
  skus.sort((a,b) => {
    if(a.modelo !== b.modelo) return a.modelo.localeCompare(b.modelo);
    const ia = ordCap.indexOf(a.cap); const ib = ordCap.indexOf(b.cap);
    const ic = (ia<0?99:ia) - (ib<0?99:ib);
    if(ic !== 0) return ic;
    return b.qtd - a.qtd;
  });

  if(skus.length === 0){
    return '<div style="padding:40px;text-align:center;color:var(--text-4);font-size:13px">Nenhum item encontrado</div>';
  }

  let html = `
    <div class="est-lista">
      <div class="est-lista-head">
        <div></div>
        <div></div>
        <div>Modelo</div>
        <div class="center">Qtd</div>
        <div class="right">Custo méd.</div>
        <div class="right">Venda</div>
      </div>`;

  skus.forEach(sku => {
    const skuKey = `${sku.modelo}__${sku.cap}__${sku.cor}`;
    const isOpen = estoqueSkuOpen.has(skuKey);
    const hex = corHex(sku.cor);
    const borda = corPrecisaBorda(sku.cor) ? 'borda' : '';
    const criticoCls = sku.critico ? ' critico' : '';
    const aberto = isOpen ? ' aberto' : '';
    html += `
      <div class="est-sku-row${criticoCls}${aberto}" onclick="toggleSkuLista('${escapeKey(skuKey)}')">
        <div class="toggle">${isOpen ? '▾' : '▸'}</div>
        <div><span class="est-cor-bolinha ${borda} ${sku.critico?'critico':''}" style="background:${hex}"></span></div>
        <div class="nome">${escapeHtml(sku.modelo)} ${escapeHtml(sku.cap)} · ${escapeHtml(sku.cor)}</div>
        <div class="qtd">${sku.qtd}</div>
        <div class="custo-med">${sku.custoMedio>0 ? brl(sku.custoMedio) : '—'}</div>
        <div class="venda ${sku.precoVenda ? '' : 'empty'}">${sku.precoVenda ? brl(sku.precoVenda) : '—'}</div>
      </div>`;
    if(isOpen){
      html += `<div class="est-sku-expand">${renderImeisExpand(sku.modelo, sku.cap, sku.cor, sku.items)}</div>`;
    }
  });
  html += `</div>`;
  return html;
}

function toggleCorEst(corKey){
  if(estoqueColorOpen === corKey) estoqueColorOpen = null;
  else estoqueColorOpen = corKey;
  renderContent();
}

function toggleSkuLista(skuKey){
  if(estoqueSkuOpen.has(skuKey)) estoqueSkuOpen.delete(skuKey);
  else estoqueSkuOpen.add(skuKey);
  renderContent();
}

function setEstoqueViewV3(v){
  estoqueViewV3 = v;
  estoqueColorOpen = null;
  estoqueSkuOpen.clear();
  renderContent();
}

function setEstoqueSearchV3(v){
  estoqueSearchV3 = v;
  if(window._estSearchTimer) clearTimeout(window._estSearchTimer);
  window._estSearchTimer = setTimeout(() => {
    renderContent();
    // re-focar e posicionar cursor no fim
    const el = document.getElementById('est-search-v3');
    if(el){
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, 150);
}

// ===================================================================
// WHATSAPP -- templates + modal
// ===================================================================

function gerarTextoWhatsAppB(modelo, cap, cor){
  const tree = construirTreeEstoque(estoqueItens, '');
  const dataCor = tree[modelo]?.caps[cap]?.cores[cor];
  if(!dataCor) return;
  const itemRef = dataCor.items[0];
  const precoInfo = itemRef ? getPrecoVendaSync(itemRef) : null;
  const precoTxt = precoInfo?.varejo ? `R$ ${precoInfo.varejo.toLocaleString('pt-BR', {minimumFractionDigits: 2})}` : '—';
  const corEmoji = bolinhaEmoji(cor);

  let txt = `📱 *${modelo}*\n\n`;
  txt += `*${cap} · ${precoTxt}*\n`;
  txt += `${corEmoji} ${cor} — ${dataCor.items.length} un\n\n`;
  txt += `_Pronta entrega · Garantia 90 dias_\n`;
  txt += `_Phone Cart_`;

  abrirWaModalDireto(txt, `${modelo} ${cap} ${cor}`);
}

function gerarTextoWhatsAppGeral(template, scope){
  const search = scope === 'visiveis' ? estoqueSearchV3 : '';
  const tree = construirTreeEstoque(estoqueItens, search);
  if(Object.keys(tree).length === 0) return '_Sem itens no estoque._';

  const hoje = new Date();
  const meses = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  const dataStr = `${hoje.getDate()}/${meses[hoje.getMonth()]}/${hoje.getFullYear()}`;
  const ordCap = ['64GB','128GB','256GB','512GB','1TB','?'];

  if(template === 'A'){
    let txt = `📱 *ESTOQUE PHONE CART*\n_Atualizado ${dataStr}_\n\n━━━━━━━━━━━━━━━\n\n`;
    const modelosOrd = Object.entries(tree).sort((a,b) => a[0].localeCompare(b[0]));
    modelosOrd.forEach(([modelo, dataModelo]) => {
      txt += `*${modelo}*\n`;
      const capsOrd = Object.entries(dataModelo.caps).sort((a,b) => {
        const ia=ordCap.indexOf(a[0]); const ib=ordCap.indexOf(b[0]);
        return (ia<0?99:ia)-(ib<0?99:ib);
      });
      capsOrd.forEach(([cap, dataCap]) => {
        const itemRef = Object.values(dataCap.cores)[0]?.items[0];
        const precoInfo = itemRef ? getPrecoVendaSync(itemRef) : null;
        const precoTxt = precoInfo?.varejo ? ` · R$ ${precoInfo.varejo.toLocaleString('pt-BR')}` : '';
        txt += `▸ ${cap}${precoTxt}\n`;
        const coresOrd = Object.entries(dataCap.cores).sort((a,b) => b[1].items.length - a[1].items.length);
        coresOrd.forEach(([cor, dataCor]) => {
          const qtd = dataCor.items.length;
          const critico = qtd <= 2 ? ' ⚠️' : '';
          txt += `   • ${cor} — ${qtd} un${critico}\n`;
        });
      });
      txt += `\n`;
    });
    txt += `━━━━━━━━━━━━━━━\n_Phone Cart · Sala 309_\n_Pronta entrega · Garantia 90 dias_`;
    return txt;
  }

  if(template === 'C'){
    let txt = `📱 *Phone Cart* · ${dataStr}\n\n`;
    const modelosOrd = Object.entries(tree).sort((a,b) => a[0].localeCompare(b[0]));
    modelosOrd.forEach(([modelo, dataModelo]) => {
      const modeloShort = modelo.replace(/^iPhone\s+/, '');
      txt += `*${modeloShort}*\n`;
      const capsOrd = Object.entries(dataModelo.caps).sort((a,b) => {
        const ia=ordCap.indexOf(a[0]); const ib=ordCap.indexOf(b[0]);
        return (ia<0?99:ia)-(ib<0?99:ib);
      });
      capsOrd.forEach(([cap, dataCap]) => {
        const itemRef = Object.values(dataCap.cores)[0]?.items[0];
        const precoInfo = itemRef ? getPrecoVendaSync(itemRef) : null;
        const capShort = cap.replace('GB','').replace('TB','TB');
        const precoTxt = precoInfo?.varejo ? ` — R$ ${precoInfo.varejo.toLocaleString('pt-BR')}` : '';
        const coresStr = Object.entries(dataCap.cores)
          .sort((a,b) => b[1].items.length - a[1].items.length)
          .map(([cor, d]) => `${cor}(${d.items.length})`)
          .join(' ');
        txt += `${capShort}: ${coresStr}${precoTxt}\n`;
      });
      txt += `\n`;
    });
    txt += `_Garantia 90 dias_`;
    return txt;
  }
  return '';
}

function abrirWaModal(){
  estoqueWaModalState.open = true;
  estoqueWaModalState.template = 'A';
  estoqueWaModalState.scope = 'todos';
  renderContent();
  setTimeout(() => atualizarPreviewWa(), 50);
}

function abrirWaModalDireto(texto, titulo){
  const overlayId = 'wa-modal-direto';
  let overlay = document.getElementById(overlayId);
  if(overlay) overlay.remove();

  overlay = document.createElement('div');
  overlay.id = overlayId;
  overlay.className = 'est-wa-modal-overlay show';
  overlay.onclick = (e) => { if(e.target === overlay) overlay.remove(); };

  // Stash texto pra evitar problema de escaping no onclick
  window._waDiretoTexto = texto;

  overlay.innerHTML = `
    <div class="est-wa-modal" onclick="event.stopPropagation()">
      <div class="est-wa-modal-head">
        <div class="est-wa-modal-title">💬 ${escapeHtml(titulo)}</div>
        <button class="est-wa-modal-close" onclick="document.getElementById('${overlayId}').remove()">✕</button>
      </div>
      <div class="est-wa-modal-body">
        <div class="est-wa-preview" id="wa-direto-preview">${escapeHtml(texto)}</div>
      </div>
      <div class="est-wa-modal-foot">
        <button onclick="document.getElementById('${overlayId}').remove()">Fechar</button>
        <button class="primary" onclick="copiarTextoWa(window._waDiretoTexto)">📋 Copiar texto</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

function fecharWaModal(){
  estoqueWaModalState.open = false;
  renderContent();
}

function setWaTemplate(t){
  estoqueWaModalState.template = t;
  // re-renderiza pra atualizar a aba ativa visualmente
  const modal = document.querySelector('.est-wa-modal-overlay:not(#wa-modal-direto)');
  if(modal){
    modal.outerHTML = renderWaModalHTML();
    setTimeout(() => atualizarPreviewWa(), 30);
  }
}

function setWaScope(s){
  estoqueWaModalState.scope = s;
  atualizarPreviewWa();
}

function atualizarPreviewWa(){
  const txt = gerarTextoWhatsAppGeral(estoqueWaModalState.template, estoqueWaModalState.scope);
  const el = document.getElementById('wa-preview-area');
  if(el) el.textContent = txt;
}

function copiarTextoWa(txt){
  if(!txt){
    const el = document.getElementById('wa-preview-area') || document.getElementById('wa-direto-preview');
    txt = el ? el.textContent : '';
  }
  if(!txt) return;
  const btn = event?.target;
  navigator.clipboard.writeText(txt).then(() => {
    if(btn){
      const orig = btn.textContent;
      btn.textContent = '✓ Copiado!';
      setTimeout(() => { btn.textContent = orig; }, 1500);
    }
  }).catch(err => {
    console.error('Erro ao copiar:', err);
    alert('Não foi possível copiar. Selecione e copie manualmente.');
  });
}

function abrirWhatsApp(){
  window.open('https://wa.me/', '_blank');
}

function renderWaModalHTML(){
  if(!estoqueWaModalState.open) return '';
  return `
    <div class="est-wa-modal-overlay show" onclick="if(event.target===this)fecharWaModal()">
      <div class="est-wa-modal" onclick="event.stopPropagation()">
        <div class="est-wa-modal-head">
          <div class="est-wa-modal-title">💬 Exportar estoque · WhatsApp</div>
          <button class="est-wa-modal-close" onclick="fecharWaModal()">✕</button>
        </div>
        <div class="est-wa-modal-body">
          <div class="est-wa-modal-tabs">
            <button class="est-wa-tab ${estoqueWaModalState.template==='A'?'active':''}" onclick="setWaTemplate('A')">Catálogo completo</button>
            <button class="est-wa-tab ${estoqueWaModalState.template==='C'?'active':''}" onclick="setWaTemplate('C')">Compacto</button>
          </div>
          <div class="est-wa-scope-toggle">
            <label><input type="radio" name="wa-scope" value="todos" ${estoqueWaModalState.scope==='todos'?'checked':''} onchange="setWaScope('todos')"> Tudo</label>
            <label><input type="radio" name="wa-scope" value="visiveis" ${estoqueWaModalState.scope==='visiveis'?'checked':''} onchange="setWaScope('visiveis')"> Só visíveis na busca</label>
          </div>
          <div class="est-wa-preview" id="wa-preview-area"></div>
        </div>
        <div class="est-wa-modal-foot">
          <button onclick="fecharWaModal()">Cancelar</button>
          <button onclick="copiarTextoWa()">📋 Copiar texto</button>
          <button class="primary" onclick="copiarTextoWa();abrirWhatsApp()">💬 Copiar e abrir WhatsApp</button>
        </div>
      </div>
    </div>`;
}


// renderEquipe is defined above in the FUNC module


