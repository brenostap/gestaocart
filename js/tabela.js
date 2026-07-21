// -- ABA TABELA DE PRECOS ---------------------------------------------------
// Le de _precos (Supabase). A planilha do Google e a fonte oficial: aqui os
// precos sao somente leitura, atualizados pelo botao 'Atualizar da planilha'.

let tabelaCat = 'iPhone';
let tabelaCond = 'Seminovo';

function setTabelaCat(c){ tabelaCat = c; if(currentTab==='tabela') renderContent(); }
function setTabelaCond(c){ tabelaCond = c; if(currentTab==='tabela') renderContent(); }

function renderTabela(){
  const todos = getTabelaPrecos();
  if(!todos.length){
    return `<div class="card"><div class="card-title">📋 Tabela de preços</div>
      <div style="padding:20px;color:var(--text4);font-size:13px">Nenhum preço carregado.</div></div>`;
  }

  // -- Cruzamento estoque x tabela ---------------------------------------
  const cruzado = estoqueItens.map(item => {
    const titulo = item.produto?.titulo || item.titulo || '';
    const precoTabela = getPrecoTabela(titulo);
    const custo = parseFloat(item.valor_estoque||0);
    const margem = precoTabela ? precoTabela - custo : null;
    const pct = precoTabela && precoTabela > 0 ? Math.round((margem/precoTabela)*100) : null;
    return { item, titulo, precoTabela, custo, margem, pct };
  }).filter(x => x.precoTabela !== null);

  const semTabela = estoqueItens.length - cruzado.length;
  const capital = estoqueItens.reduce((a,i)=>a+parseFloat(i.valor_estoque||0),0);
  const valorTabela = cruzado.reduce((a,x)=>a+x.precoTabela,0);
  const margemTotal = cruzado.reduce((a,x)=>a+x.margem,0);
  const margemMedia = cruzado.length ? Math.round(cruzado.reduce((a,x)=>a+x.pct,0)/cruzado.length) : 0;

  const kpis = `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">
      <div class="metric" style="padding:12px">
        <div class="metric-label">Custo total estoque</div>
        <div class="metric-value" style="font-size:20px">${brl(capital)}</div>
        <div class="metric-sub">${estoqueItens.length} unidades</div>
      </div>
      <div class="metric" style="padding:12px">
        <div class="metric-label">Valor pela tabela</div>
        <div class="metric-value" style="font-size:20px;color:var(--cart)">${brl(valorTabela)}</div>
        <div class="metric-sub">${cruzado.length} itens mapeados</div>
      </div>
      <div class="metric" style="padding:12px">
        <div class="metric-label">Margem potencial</div>
        <div class="metric-value" style="font-size:20px;color:var(--green)">${brl(margemTotal)}</div>
        <div class="metric-sub">se vender tudo na tabela</div>
      </div>
      <div class="metric" style="padding:12px">
        <div class="metric-label">Margem média</div>
        <div class="metric-value" style="font-size:20px;color:${margemMedia>20?'var(--green)':margemMedia>10?'var(--yellow)':'var(--red)'}">${margemMedia}%</div>
        <div class="metric-sub">${semTabela} itens sem tabela</div>
      </div>
    </div>`;

  // -- Filtros -----------------------------------------------------------
  const categorias = [...new Set(todos.map(p=>p.categoria))];
  const condicoes = [...new Set(todos.filter(p=>p.categoria===tabelaCat).map(p=>p.condicao))];
  if(!condicoes.includes(tabelaCond) && condicoes.length) tabelaCond = condicoes[0];

  const btn = (ativo, onclick, texto) => `
    <button onclick="${onclick}" style="padding:6px 14px;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;
      border:1px solid ${ativo?'var(--cart)':'var(--border)'};
      background:${ativo?'var(--cart)':'var(--bg3)'};
      color:${ativo?'#fff':'var(--text3)'}">${texto}</button>`;

  const filtros = `
    <div style="display:flex;flex-wrap:wrap;gap:14px;align-items:center;margin-bottom:14px">
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${categorias.map(c=>btn(c===tabelaCat, `setTabelaCat('${escapeKey(c)}')`, escapeHtml(c))).join('')}
      </div>
      <div style="width:1px;height:20px;background:var(--border)"></div>
      <div style="display:flex;gap:6px">
        ${condicoes.map(c=>btn(c===tabelaCond, `setTabelaCond('${escapeKey(c)}')`, escapeHtml(c))).join('')}
      </div>
    </div>`;

  // -- Tabela ------------------------------------------------------------
  const linhas = todos
    .filter(p => p.categoria===tabelaCat && p.condicao===tabelaCond)
    .sort((a,b) => a.nome_completo.localeCompare(b.nome_completo,'pt-BR',{numeric:true})
                || String(a.capacidade||'').localeCompare(String(b.capacidade||''),'pt-BR',{numeric:true}));

  const temCor = linhas.some(p => p.cor);
  const temUpgrade = linhas.some(p => p.preco_upgrade != null) || tabelaCond === 'Seminovo';

  const celula = (p, campo) => {
    const v = p[campo];
    const cor = campo==='preco_varejo' ? 'var(--cart)' : 'var(--text)';
    return `<td style="padding:8px 12px;text-align:right;border-bottom:1px solid var(--border);font-weight:700;font-variant-numeric:tabular-nums;color:${v==null?'var(--text4)':cor}">
      ${v==null ? '—' : brl(v)}</td>`;
  };

  const corpo = linhas.map(p => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid var(--border);font-weight:600">${escapeHtml(p.nome_completo)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid var(--border);color:var(--text3);font-variant-numeric:tabular-nums">${p.capacidade||'—'}</td>
      ${temCor ? `<td style="padding:8px 12px;border-bottom:1px solid var(--border);color:var(--text3);font-size:12px">${escapeHtml(p.cor||'—')}</td>` : ''}
      ${temUpgrade ? celula(p,'preco_upgrade') : ''}
      ${celula(p,'preco_varejo')}
      <td style="padding:8px 12px;border-bottom:1px solid var(--border);text-align:center">
        ${p.sujeito_disponibilidade ? '<span title="Sujeito a disponibilidade" style="font-size:11px;color:var(--yellow)">⚠</span>' : ''}
      </td>
    </tr>`).join('');

  const th = (txt, align='left', cor='var(--text4)') =>
    `<th style="padding:8px 12px;text-align:${align};background:var(--bg);border-bottom:1px solid var(--border2);font-size:10px;font-weight:700;color:${cor};text-transform:uppercase;letter-spacing:.08em">${txt}</th>`;

  // -- Estoque x tabela --------------------------------------------------
  const estoqueRows = cruzado.sort((a,b)=>(a.pct||0)-(b.pct||0)).slice(0,100).map(({item,titulo,precoTabela,custo,margem,pct}) => {
    const curto = titulo.replace(/^iPhone\s+/i,'').replace(/\s*Seminovo\s*$/i,' SN').replace(/\s*Lacrado\s*$/i,' LAC').trim();
    const cor = pct<10 ? 'var(--red)' : pct<15 ? 'var(--yellow)' : 'var(--green)';
    return `<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:7px 10px;font-size:12px;color:var(--text3)">${item.serial||'—'}</td>
      <td style="padding:7px 10px;font-size:12px">${escapeHtml(curto)}</td>
      <td style="padding:7px 10px;font-size:12px;text-align:right;font-variant-numeric:tabular-nums">${brl(custo)}</td>
      <td style="padding:7px 10px;font-size:12px;text-align:right;color:var(--cart);font-weight:600;font-variant-numeric:tabular-nums">${brl(precoTabela)}</td>
      <td style="padding:7px 10px;font-size:12px;text-align:right;color:var(--green);font-variant-numeric:tabular-nums">${brl(margem)}</td>
      <td style="padding:7px 10px;font-size:12px;text-align:right;font-weight:700;color:${cor}">${pct}%</td>
    </tr>`;
  }).join('');

  return `
    ${kpis}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start">
      <div class="card">
        <div class="card-title" style="display:flex;justify-content:space-between;align-items:center;gap:10px">
          <span>📋 Tabela de preços</span>
          <span style="display:flex;align-items:center;gap:10px">
            <span style="font-size:11px;color:${_ultimaSyncPrecos?.status==='erro'?'var(--red)':'var(--text4)'};font-weight:400">
              ${linhas.length} de ${todos.length} · ${textoUltimaSync()}
            </span>
            <button id="btn-sync-precos" onclick="sincronizarPrecos()"
              style="padding:5px 12px;border-radius:8px;border:1px solid var(--cart);background:var(--bg3);color:var(--cart);font-size:11px;font-weight:700;cursor:pointer">
              ↻ Atualizar da planilha</button>
          </span>
        </div>
        ${filtros}
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead><tr>
              ${th('Modelo')}${th('GB')}${temCor?th('Cor'):''}
              ${temUpgrade?th('Upgrade','right'):''}${th('Varejo','right','var(--cart)')}${th('','center')}
            </tr></thead>
            <tbody>${corpo || `<tr><td colspan="6" style="padding:20px;text-align:center;color:var(--text4)">Nada nesta combinação.</td></tr>`}</tbody>
          </table>
        </div>
        <div style="margin-top:10px;font-size:11px;color:var(--text4)">
          💡 Os preços vêm da planilha oficial no Google Sheets — edite lá e clique em “Atualizar da planilha” · ⚠ = sujeito a disponibilidade
        </div>
      </div>

      <div class="card">
        <div class="card-title" style="display:flex;justify-content:space-between">
          <span>📦 Estoque × Tabela</span>
          <span style="font-size:11px;color:var(--text4)">${cruzado.length} mapeados · menor margem primeiro</span>
        </div>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse">
            <thead><tr style="border-bottom:1px solid var(--border2)">
              ${th('Etiq')}${th('Produto')}${th('Custo','right')}${th('Tabela','right','var(--cart)')}${th('Margem','right','var(--green)')}${th('%','right')}
            </tr></thead>
            <tbody>${estoqueRows}</tbody>
          </table>
        </div>
        ${semTabela>0 ? `<div style="margin-top:8px;font-size:11px;color:var(--text4)">⚠ ${semTabela} itens sem correspondência na tabela</div>` : ''}
      </div>
    </div>`;
}
