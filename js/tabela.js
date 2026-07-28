// -- ABA TABELA DE PRECOS ---------------------------------------------------
// Le de _precos (Supabase, espelho da planilha oficial). Preco e somente leitura:
// a fonte e o Google Sheets, atualizado pelo botao 'Atualizar da planilha'.
//
// Layout: agrupado por MODELO. Cada modelo vira uma faixa (sticky) com as cores
// em bolinhas; abaixo, uma sub-linha por GB (ou por GB+cor quando o preco varia
// por cor — campo `cor` preenchido). Clicar numa linha abre o painel lateral.

let tabelaCat = null;                 // categoria ativa (ex.: "iPhone 📱")
let tabelaCond = null;                // condicao ativa (ex.: "Seminovo")
let precoFechados = new Set();        // chaves de grupos recolhidos (default: aberto)

function setTabelaCat(c){ tabelaCat = c; tabelaCond = null; if(currentTab==='tabela') renderContent(); }
function setTabelaCond(c){ tabelaCond = c; if(currentTab==='tabela') renderContent(); }
function togglePrecoGrupo(k){
  if(precoFechados.has(k)) precoFechados.delete(k); else precoFechados.add(k);
  if(currentTab==='tabela') renderContent();
}

// Nome do modelo pra exibir: "iPhone 14 Pro". A categoria vem com emoji no banco
// ("iPhone 📱") — limpamos o emoji e so prefixamos se o modelo ja nao comeca com ela.
function _precoCatLimpa(cat){
  return String(cat||'').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}️]/gu,'').replace(/\s+/g,' ').trim();
}
function _precoNomeModelo(p){
  const cl = _precoCatLimpa(p.categoria);
  const mod = String(p.modelo||'').trim();
  if(!cl) return mod;
  return mod.toLowerCase().startsWith(cl.toLowerCase()) ? mod : (cl+' '+mod);
}
// "Azul, Roxo, Preto" -> ['Azul','Roxo','Preto']
function _precoCores(str){
  if(Array.isArray(str)) return str.map(s=>String(s).trim()).filter(Boolean);
  return String(str||'').split(/[,;]/).map(s=>s.trim()).filter(Boolean);
}
function _gb(cap){ return cap ? (capacidadeEmGB(cap)||0) : 0; }
function _precoDot(nome, cls){
  return `<span class="${cls||'tpr-dot'}" style="background:${corHex(nome)||'var(--text4)'}" title="${escapeHtml(nome)}"></span>`;
}

function renderTabela(){
  const todos = getTabelaPrecos();
  if(!todos.length){
    return UI.card({ titulo:'📋 Tabela de preços', corpo: UI.vazio({
      ico:'🗂️', titulo:'Nenhum preço carregado',
      texto:'Puxe os preços da planilha oficial no Google Sheets.',
      acao: UI.btn('↻ Atualizar da planilha', {onclick:'sincronizarPrecos()', variante:'primario', sm:true, id:'btn-sync-precos'})
    })});
  }

  // -- Filtros: categoria (com emoji + contador) e condicao ------------------
  const categorias = [...new Set(todos.map(p=>p.categoria))];
  if(!categorias.includes(tabelaCat)) tabelaCat = categorias[0];
  const condicoes = [...new Set(todos.filter(p=>p.categoria===tabelaCat).map(p=>p.condicao))];
  if(!condicoes.includes(tabelaCond)) tabelaCond = condicoes[0];

  const chipsCat = categorias.map(c =>
    `<button class="c-chip${c===tabelaCat?' ativo':''}" onclick="setTabelaCat('${escapeKey(c)}')">${escapeHtml(c)}<span class="tpr-cnt">${todos.filter(p=>p.categoria===c).length}</span></button>`).join('');
  const chipsCond = condicoes.map(cd =>
    `<button class="c-chip${cd===tabelaCond?' ativo':''}" onclick="setTabelaCond('${escapeKey(cd)}')">${escapeHtml(cd)}</button>`).join('');
  const filtros = `<div class="tpr-head-pad"><div class="c-toolbar" style="margin-bottom:0">${chipsCat}${UI.sep()}${chipsCond}</div></div>`;

  // -- Dados desta combinacao, agrupados por modelo -------------------------
  const linhas = todos.filter(p => p.categoria===tabelaCat && p.condicao===tabelaCond);
  const temUpgrade = linhas.some(p => p.preco_upgrade != null);

  const grupos = [];
  linhas.forEach(p => {
    let g = grupos.find(x => x.modelo === p.modelo);
    if(!g){ g = {modelo:p.modelo, nome:_precoNomeModelo(p), cores:_precoCores(p.cores), variaCor:false, itens:[]}; grupos.push(g); }
    if(p.cor) g.variaCor = true;
    g.itens.push(p);
  });

  const ncols = temUpgrade ? 4 : 3;
  const corpo = grupos.map(g => {
    const k = tabelaCat + '|' + g.modelo;
    const aberto = !precoFechados.has(k);
    const faixa = `<tr class="tpr-grupo${aberto?'':' fechado'}" onclick="togglePrecoGrupo('${escapeKey(k)}')"><td colspan="${ncols}">
      <span class="tpr-seta">▾</span>
      <span class="tpr-nome">${escapeHtml(g.nome)}</span>
      ${g.cores.length ? `<span class="tpr-cores">${g.cores.map(c=>_precoDot(c)).join('')}</span><span class="tpr-cap">${g.cores.length} cor${g.cores.length>1?'es':''}</span>` : ''}
      ${g.variaCor ? '<span class="tpr-varia">preço varia por cor</span>' : ''}
    </td></tr>`;
    if(!aberto) return faixa;

    const itens = g.itens.slice().sort((a,b) =>
      _gb(a.capacidade) - _gb(b.capacidade) ||
      String(a.cor||'').localeCompare(String(b.cor||''),'pt-BR'));

    const rows = itens.map(p => {
      const partes = [];
      if(p.capacidade) partes.push(`<span class="tpr-gb">${escapeHtml(p.capacidade)}</span>`);
      if(p.cor) partes.push(`${_precoDot(p.cor,'tpr-dot-lin')}${escapeHtml(p.cor)}`);
      const label = partes.join(' ') || '<span class="tpr-gb">Único</span>';
      return `<tr class="tpr-lin" onclick="openPrecoPanel('${escapeKey(tabelaCat)}','${escapeKey(g.modelo)}')">
        <td>${label}</td>
        ${temUpgrade ? `<td class="tpr-preco tpr-up">${p.preco_upgrade==null?'—':brl(p.preco_upgrade)}</td>` : ''}
        <td class="tpr-preco tpr-var">${p.preco_varejo==null?'—':brl(p.preco_varejo)}</td>
        <td class="tpr-warn">${p.sujeito_disponibilidade?'<span title="Sujeito a disponibilidade">⚠</span>':''}</td>
      </tr>`;
    }).join('');
    return faixa + rows;
  }).join('');

  const tabela = `<div class="tpr-wrap"><table class="tpr-tab">
    <thead><tr>
      <th>Modelo · GB</th>
      ${temUpgrade ? '<th class="n">Upgrade</th>' : ''}
      <th class="n">Varejo</th>
      <th style="width:44px"></th>
    </tr></thead>
    <tbody>${corpo || `<tr><td colspan="${ncols}"><div class="c-vazio"><div class="c-vazio-titulo">Nada nesta combinação</div></div></td></tr>`}</tbody>
  </table></div>`;

  const acao = `<span style="font-size:11px;color:${_ultimaSyncPrecos?.status==='erro'?'var(--red)':'var(--text4)'};font-weight:400">${textoUltimaSync()}</span>`
    + UI.btn('↻ Atualizar da planilha', {onclick:'sincronizarPrecos()', sm:true, id:'btn-sync-precos'});

  const nota = `<div class="tpr-nota">💡 Preços vêm da planilha oficial no Google Sheets — edite lá e clique em “Atualizar da planilha” · <span style="color:var(--warning)">⚠</span> = sujeito a disponibilidade · bolinhas = cores disponíveis · clique num modelo para ver detalhes</div>`;

  return UI.card({
    titulo: '📋 Tabela de preços',
    sub: `${linhas.length} de ${todos.length}`,
    acao, flush: true,
    corpo: filtros + tabela + nota
  });
}

// -- Painel lateral: detalhe de um modelo -----------------------------------
function openPrecoPanel(cat, modelo){
  const itens = getTabelaPrecos()
    .filter(p => p.categoria===cat && p.modelo===modelo && p.condicao===tabelaCond)
    .sort((a,b) => _gb(a.capacidade) - _gb(b.capacidade) ||
                   String(a.cor||'').localeCompare(String(b.cor||''),'pt-BR'));
  if(!itens.length) return;

  const nome  = _precoNomeModelo(itens[0]);
  const cores = _precoCores(itens[0].cores);
  const temUp = itens.some(p => p.preco_upgrade != null);
  const disp  = itens.some(p => p.sujeito_disponibilidade);

  const chipsCor = cores.length
    ? `<div class="tpr-pnl-cores">${cores.map(c =>
        `<span class="tpr-pnl-cor"><span class="tpr-dot-lin" style="margin:0;background:${corHex(c)||'var(--text4)'}"></span>${escapeHtml(c)}</span>`).join('')}</div>`
    : '';

  const colunas = [{titulo:'Variante'}];
  if(temUp) colunas.push({titulo:'Upgrade', num:true});
  colunas.push({titulo:'Varejo', num:true});

  const linhasTab = itens.map(p => {
    const partes = [];
    if(p.capacidade) partes.push(escapeHtml(p.capacidade));
    if(p.cor) partes.push(escapeHtml(p.cor));
    const cel = [(partes.join(' · ') || 'Único') + (p.sujeito_disponibilidade ? ' <span style="color:var(--warning)" title="Sujeito a disponibilidade">⚠</span>' : '')];
    if(temUp) cel.push({v: p.preco_upgrade==null?'—':brl(p.preco_upgrade), num:true});
    cel.push({v: p.preco_varejo==null?'—':`<span style="color:var(--cart);font-weight:700">${brl(p.preco_varejo)}</span>`, num:true});
    return cel;
  });

  const corpo = `${chipsCor}
    ${UI.tabela({colunas, linhas:linhasTab})}
    ${disp ? `<div class="v-alerta" data-tom="alerta" style="margin-top:12px"><span>⚠ Alguns preços deste modelo estão sujeitos a disponibilidade.</span></div>` : ''}
    <div class="tpr-pnl-nota">Condição: <b>${escapeHtml(tabelaCond)}</b>. Preço oficial vem do Google Sheets. O histórico de preços aparecerá aqui quando começarmos a registrar as mudanças da planilha.</div>`;

  UI.abrirPainel({ titulo: escapeHtml(nome), corpo });
}
