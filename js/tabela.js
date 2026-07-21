function editarPreco(modelo, capacidade, cellId){
  const tabelaAtual = getTabelaPrecos().find(t => t.modelo === modelo && t.cap === capacidade);
  const precoAtual = tabelaAtual ? tabelaAtual.preco : 0;
  
  // Remover edicao anterior se houver
  const anterior = document.getElementById('edit-preco-modal');
  if(anterior) anterior.remove();

  const modal = document.createElement('div');
  modal.id = 'edit-preco-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)';
  modal.innerHTML = `
    <div style="background:var(--bg2);border:1px solid var(--border2);border-radius:14px;padding:24px;min-width:280px;box-shadow:0 20px 60px rgba(0,0,0,.5)">
      <div style="font-size:11px;color:var(--text4);font-weight:600;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Editar preço</div>
      <div style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:16px">${modelo} ${capacidade}</div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px">
        <span style="font-size:13px;color:var(--text3);font-weight:600">R$</span>
        <input id="edit-preco-input" type="number" value="${precoAtual}" min="0" max="99999"
          style="flex:1;padding:10px 12px;background:var(--bg3);border:2px solid var(--cart);border-radius:8px;color:var(--text);font-size:18px;font-weight:700;outline:none;width:100%"
          onkeydown="if(event.key==='Enter') salvarPrecoEdicao('${modelo}','${capacidade}','${cellId}');if(event.key==='Escape') document.getElementById('edit-preco-modal').remove();">
      </div>
      <div style="display:flex;gap:8px">
        <button onclick="salvarPrecoEdicao('${modelo}','${capacidade}','${cellId}')"
          style="flex:1;padding:10px;background:var(--cart);border:none;border-radius:8px;color:white;font-size:13px;font-weight:700;cursor:pointer">
          ✓ Salvar
        </button>
        <button onclick="document.getElementById('edit-preco-modal').remove()"
          style="padding:10px 16px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;color:var(--text3);font-size:13px;cursor:pointer">
          Cancelar
        </button>
      </div>
    </div>`;
  
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if(e.target === modal) modal.remove(); });
  
  // Focar e selecionar o input
  setTimeout(() => {
    const inp = document.getElementById('edit-preco-input');
    inp?.focus();
    inp?.select();
  }, 50);
}

async function salvarPrecoEdicao(modelo, capacidade, cellId){
  const inp = document.getElementById('edit-preco-input');
  const novoPreco = parseInt(inp?.value || 0);
  if(!novoPreco || novoPreco < 100) return alert('Preço inválido');
  
  // Fechar modal imediatamente com feedback visual
  document.getElementById('edit-preco-modal').remove();
  const cell = document.getElementById(cellId);
  if(cell){
    cell.textContent = '⏳';
    cell.style.opacity = '0.5';
  }
  
  // Salvar no Supabase
  const ok = await savePrecoBD(modelo, capacidade, novoPreco);
  
  // Atualizar a celula
  if(cell){
    cell.textContent = brl(novoPreco);
    cell.style.opacity = '1';
    cell.style.color = ok ? 'var(--green)' : 'var(--yellow)';
    setTimeout(() => { if(cell) cell.style.color = 'var(--text)'; }, 2000);
  }
  
  // Recarregar o cruzamento estoquextabela
  const content = document.getElementById('content');
  if(content && currentTab === 'tabela'){
    // So re-renderizar a parte direita para nao perder posicao
    currentTab = 'tabela';
    renderContent();
  }
}

function renderTabela(){
  // -- Estatisticas rapidas ----------------------------------
  const totalModelos = TABELA_PRECOS.length;
  const precoMin = Math.min(...TABELA_PRECOS.map(p=>p.preco));
  const precoMax = Math.max(...TABELA_PRECOS.map(p=>p.preco));

  // -- Cruzamento estoque x custo x tabela ------------------
  const estoqueComTabela = estoqueItens.map(item => {
    const titulo = item.produto?.titulo || item.titulo || '';
    const precoTabela = getPrecoTabela(titulo);
    const custo = parseFloat(item.valor_estoque||0);
    const margem = precoTabela ? precoTabela - custo : null;
    const pctMargem = precoTabela && custo > 0 ? Math.round((margem/precoTabela)*100) : null;
    return { item, titulo, precoTabela, custo, margem, pctMargem };
  }).filter(x => x.precoTabela !== null);

  const semTabela = estoqueItens.filter(item => {
    const titulo = item.produto?.titulo || item.titulo || '';
    return getPrecoTabela(titulo) === null;
  });

  const totalCapitalEstoque = estoqueItens.reduce((a,i)=>a+parseFloat(i.valor_estoque||0),0);
  const totalVendaTabela = estoqueComTabela.reduce((a,x)=>a+x.precoTabela,0);
  const totalMargemEstoque = estoqueComTabela.reduce((a,x)=>a+x.margem,0);
  const mediaMargem = estoqueComTabela.length > 0 
    ? Math.round(estoqueComTabela.reduce((a,x)=>a+x.pctMargem,0)/estoqueComTabela.length) : 0;

  // -- KPIs do estoque vs tabela ----------------------------
  const kpisHTML = `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">
      <div class="metric" style="padding:12px">
        <div class="metric-label">Custo total estoque</div>
        <div class="metric-value" style="font-size:20px">${brl(totalCapitalEstoque)}</div>
        <div class="metric-sub">${estoqueItens.length} unidades</div>
      </div>
      <div class="metric" style="padding:12px">
        <div class="metric-label">Valor pela tabela</div>
        <div class="metric-value" style="font-size:20px;color:var(--cart)">${brl(totalVendaTabela)}</div>
        <div class="metric-sub">${estoqueComTabela.length} itens mapeados</div>
      </div>
      <div class="metric" style="padding:12px">
        <div class="metric-label">Margem potencial</div>
        <div class="metric-value" style="font-size:20px;color:var(--green)">${brl(totalMargemEstoque)}</div>
        <div class="metric-sub">se vender tudo na tabela</div>
      </div>
      <div class="metric" style="padding:12px">
        <div class="metric-label">Margem média</div>
        <div class="metric-value" style="font-size:20px;color:${mediaMargem>20?'var(--green)':mediaMargem>10?'var(--yellow)':'var(--red)'}">${mediaMargem}%</div>
        <div class="metric-sub">${semTabela.length} itens sem tabela</div>
      </div>
    </div>`;

  // -- Tabela de precos editavel ----------------------------
  // Agrupar por modelo base (iPhone 14, iPhone 15, etc)
  const grupos = {};
  getTabelaPrecos().forEach(p => {
    const base = p.modelo.replace(/iPhone /i,'').replace(/ Pro Max| Pro| Plus|e/g,'').trim();
    const serie = p.modelo.includes('Pro Max') ? 'Pro Max' 
                : p.modelo.includes('Pro') ? 'Pro'
                : p.modelo.includes('Plus') ? 'Plus'
                : p.modelo.includes('16e') || p.modelo.includes('16 e') ? 'e'
                : 'Base';
    if(!grupos[base]) grupos[base] = {};
    if(!grupos[base][serie]) grupos[base][serie] = [];
    grupos[base][serie].push(p);
  });

  const linhasTabela = Object.entries(grupos).sort((a,b)=>parseInt(a[0])-parseInt(b[0])).map(([num, series]) => {
    return Object.entries(series).map(([serie, items]) => {
      const nomeModelo = serie === 'Base' ? `iPhone ${num}` 
                       : serie === 'e' ? `iPhone 16e`
                       : `iPhone ${num} ${serie}`;
      const cols = items.sort((a,b)=>parseInt(a.cap)-parseInt(b.cap)).map(p => {
        const capNum = p.cap.replace('GB','');
        const tabelaAtual = getTabelaPrecos().find(t => t.modelo === p.modelo && t.cap === p.cap);
        const precoAtual = tabelaAtual ? tabelaAtual.preco : p.preco;
        const cellId = 'preco-' + p.modelo.replace(/\s+/g,'_') + '-' + p.cap;
        return `<td style="padding:10px 14px;text-align:center;border:1px solid var(--border);background:var(--bg3);cursor:pointer;transition:background .15s" 
          onmouseenter="this.style.background='rgba(91,139,245,.12)'" 
          onmouseleave="this.style.background='var(--bg3)'"
          onclick="editarPreco('${p.modelo}','${p.cap}','${cellId}')">
          <div style="font-size:11px;font-weight:800;letter-spacing:.04em;color:var(--cart);margin-bottom:4px">${capNum}<span style="font-size:9px;font-weight:600;color:var(--text3)"> GB</span></div>
          <div id="${cellId}" style="font-size:14px;font-weight:700;color:var(--text)">${brl(precoAtual)}</div>
        </td>`;
      }).join('');
      // Destaque no numero do modelo
      const nomePartes = nomeModelo.match(/^(iPhone )(\d+)(.*)?$/);
      const nomeFormatado = nomePartes
        ? `<span style="color:var(--text4);font-size:11px">${nomePartes[1]}</span><span style="color:var(--text);font-size:14px;font-weight:800">${nomePartes[2]}</span><span style="color:var(--text3);font-size:12px;font-weight:600">${nomePartes[3]||''}</span>`
        : nomeModelo;
      return `<tr>
        <td style="padding:10px 14px;border:1px solid var(--border);white-space:nowrap">${nomeFormatado}</td>
        ${cols}
      </tr>`;
    }).join('');
  }).join('');

  // -- Estoque cruzado com tabela ---------------------------
  const estoqueRows = estoqueComTabela
    .sort((a,b) => (a.pctMargem||0) - (b.pctMargem||0))
    .slice(0, 100)
    .map(({item, titulo, precoTabela, custo, margem, pctMargem}) => {
      const tituloShort = titulo.replace(/^iPhone\s+/i,'').replace(/\s*Seminovo\s*$/i,' SN').replace(/\s*Lacrado\s*$/i,' LAC').trim();
      const cor = pctMargem < 10 ? 'var(--red)' : pctMargem < 15 ? 'var(--yellow)' : 'var(--green)';
      return `<tr style="border-bottom:1px solid var(--border)">
        <td style="padding:7px 10px;font-size:12px;color:var(--text3);font-weight:500">${item.serial||'—'}</td>
        <td style="padding:7px 10px;font-size:12px">${tituloShort}</td>
        <td style="padding:7px 10px;font-size:12px;text-align:right">${brl(custo)}</td>
        <td style="padding:7px 10px;font-size:12px;text-align:right;color:var(--cart);font-weight:600">${brl(precoTabela)}</td>
        <td style="padding:7px 10px;font-size:12px;text-align:right;color:var(--green)">${brl(margem)}</td>
        <td style="padding:7px 10px;font-size:12px;text-align:right;font-weight:700;color:${cor}">${pctMargem}%</td>
      </tr>`;
    }).join('');

  return `
    ${kpisHTML}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start">
      
      <div>
        <div class="card">
          <div class="card-title">📋 Tabela de preços — Seminovo</div>
          <div style="overflow-x:auto">
            <table style="width:100%;border-collapse:collapse;font-size:12px">
              <thead>
                <tr>
                  <th style="padding:8px 14px;text-align:left;background:var(--bg);border:1px solid var(--border);font-size:10px;font-weight:700;color:var(--text4);text-transform:uppercase;letter-spacing:.08em">Modelo</th>
                  ${['64GB','128GB','256GB','512GB'].map(c=>`<th style="padding:8px 14px;text-align:center;background:var(--bg);border:1px solid var(--border);font-size:10px;font-weight:700;color:var(--cart);text-transform:uppercase;letter-spacing:.08em">${c.replace('GB',' <span style=\"font-size:9px\">GB</span>')}</th>`).join('')}
                </tr>
              </thead>
              <tbody>${linhasTabela}</tbody>
            </table>
          </div>
          <div style="margin-top:10px;font-size:11px;color:var(--text4)">
            💡 Clique em qualquer preço para editar — salva automaticamente
          </div>
        </div>
      </div>

      <div>
        <div class="card">
          <div class="card-title" style="display:flex;justify-content:space-between">
            <span>📦 Estoque × Tabela</span>
            <span style="font-size:11px;color:var(--text4)">${estoqueComTabela.length} mapeados · ordenado por menor margem</span>
          </div>
          <div style="overflow-x:auto">
            <table style="width:100%;border-collapse:collapse">
              <thead>
                <tr style="border-bottom:1px solid var(--border2)">
                  <th style="padding:6px 10px;text-align:left;font-size:10px;color:var(--text4);font-weight:600;text-transform:uppercase">Etiq</th>
                  <th style="padding:6px 10px;text-align:left;font-size:10px;color:var(--text4);font-weight:600;text-transform:uppercase">Produto</th>
                  <th style="padding:6px 10px;text-align:right;font-size:10px;color:var(--text4);font-weight:600;text-transform:uppercase">Custo</th>
                  <th style="padding:6px 10px;text-align:right;font-size:10px;color:var(--cart);font-weight:600;text-transform:uppercase">Tabela</th>
                  <th style="padding:6px 10px;text-align:right;font-size:10px;color:var(--green);font-weight:600;text-transform:uppercase">Margem</th>
                  <th style="padding:6px 10px;text-align:right;font-size:10px;color:var(--text4);font-weight:600;text-transform:uppercase">%</th>
                </tr>
              </thead>
              <tbody>
                ${estoqueRows}
              </tbody>
            </table>
          </div>
          ${semTabela.length > 0 ? `<div style="margin-top:8px;font-size:11px;color:var(--text4)">⚠ ${semTabela.length} itens sem correspondência na tabela (iPad, Mac, Watch, etc)</div>` : ''}
        </div>
      </div>
    </div>`;
}

