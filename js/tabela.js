// -- ABA TABELA DE PRECOS ---------------------------------------------------
// Le de _precos (Supabase, espelho da planilha oficial). Preco e somente leitura:
// a fonte e o Google Sheets, atualizado pelo botao 'Atualizar da planilha'.
//
// Layout (ago/2026, inspirado na tabela que a loja posta nos stories): as
// condicoes viram SECOES empilhadas — Seminovos primeiro, Lacrados abaixo — e a
// lista segue descendo. Dentro de cada secao, uma linha por MODELO, fechada por
// padrao: mostra cores e a faixa de preco. Clicar abre as variantes (GB/cor).
// Fechado por padrao e o que faz caber muito mais coisa na tela.

let tabelaCat = null;                 // categoria ativa (ex.: "iPhone")
let tabelaCond = null;                // condicao ativa; null/'' = TODAS (padrao)
let precoAbertos = new Set();         // chaves de grupos expandidos (default: fechado)

// Ordem de exibicao. O que nao estiver aqui vai pro fim, em ordem alfabetica.
// iPhone na frente porque e o que a loja mais vende e o que se olha primeiro.
const PRECO_CAT_ORDEM  = ['iphone','ipad','macbook','apple watch','airpods','acessorios apple'];
const PRECO_COND_ORDEM = ['seminovo','lacrado'];

function _precoIdx(ordem, valor){
  const i = ordem.indexOf(_precoCatLimpa(valor).toLowerCase());
  return i < 0 ? ordem.length : i;
}
function _precoOrdena(arr, ordem){
  return arr.slice().sort((a,b) =>
    _precoIdx(ordem,a) - _precoIdx(ordem,b) || String(a).localeCompare(String(b),'pt-BR'));
}
// "Seminovo" -> "Seminovos" (titulo da secao)
function _precoCondLabel(cd){
  const s = String(cd||'').trim();
  return !s ? 'Sem condição' : (/s$/i.test(s) ? s : s+'s');
}
// Faixa de preco da linha fechada: "R$2.950" ou "R$2.950 – 3.550".
function _faixaPreco(vals){
  const v = vals.filter(x => x != null).map(Number).filter(n => !isNaN(n));
  if(!v.length) return '—';
  const mn = Math.min(...v), mx = Math.max(...v);
  if(mn === mx) return moneyPreco(mn);
  return podeVerPrecoTabela()
    ? `${moneyPreco(mn)}<span class="tpr-ate">–</span>${Math.round(mx).toLocaleString('pt-BR')}`
    : '—';
}

function setTabelaCat(c){ tabelaCat = c; tabelaCond = null; if(currentTab==='tabela') renderContent(); }
function setTabelaCond(c){ tabelaCond = c || null; if(currentTab==='tabela') renderContent(); }
function togglePrecoGrupo(k){
  if(precoAbertos.has(k)) precoAbertos.delete(k); else precoAbertos.add(k);
  if(currentTab==='tabela') renderContent();
}
// Abrir/fechar a secao inteira de uma vez. Sem isso, ver todos os seminovos
// (27 modelos) custaria 27 cliques.
function togglePrecoSecao(cond, chaves){
  const ks = String(chaves||'').split('~~').filter(Boolean);
  const algumFechado = ks.some(k => !precoAbertos.has(k));
  ks.forEach(k => { if(algumFechado) precoAbertos.add(k); else precoAbertos.delete(k); });
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

  // -- Filtros: categoria (com contador) e condicao ("Todas" = empilha as secoes)
  const categorias = _precoOrdena([...new Set(todos.map(p=>p.categoria))], PRECO_CAT_ORDEM);
  if(!categorias.includes(tabelaCat)) tabelaCat = categorias[0];
  const condicoes = _precoOrdena(
    [...new Set(todos.filter(p=>p.categoria===tabelaCat).map(p=>p.condicao))], PRECO_COND_ORDEM);
  if(tabelaCond && !condicoes.includes(tabelaCond)) tabelaCond = null;   // trocou de categoria

  const chipsCat = categorias.map(c =>
    `<button class="c-chip${c===tabelaCat?' ativo':''}" onclick="setTabelaCat('${escapeKey(c)}')">${escapeHtml(c)}<span class="tpr-cnt">${todos.filter(p=>p.categoria===c).length}</span></button>`).join('');
  const chipsCond = (condicoes.length > 1 ? [''] : []).concat(condicoes).map(cd =>
    `<button class="c-chip${(cd||null)===tabelaCond?' ativo':''}" onclick="setTabelaCond('${escapeKey(cd)}')">${cd?escapeHtml(cd):'Todas'}</button>`).join('');
  const filtros = `<div class="tpr-head-pad"><div class="c-toolbar" style="margin-bottom:0">${chipsCat}${UI.sep()}${chipsCond}</div></div>`;

  // -- Dados em secoes (condicao) > grupos (modelo) > itens (GB/cor) --------
  const linhas = todos.filter(p =>
    p.categoria===tabelaCat && (!tabelaCond || p.condicao===tabelaCond));
  const temUpgrade = linhas.some(p => p.preco_upgrade != null);
  const ncols = temUpgrade ? 4 : 3;

  const secoes = condicoes.filter(cd => !tabelaCond || cd===tabelaCond).map(cd => {
    const grupos = [];
    linhas.filter(p => p.condicao===cd).forEach(p => {
      let g = grupos.find(x => x.modelo === p.modelo);
      if(!g){ g = {modelo:p.modelo, nome:_precoNomeModelo(p), cores:_precoCores(p.cores), variaCor:false, itens:[]}; grupos.push(g); }
      if(p.cor) g.variaCor = true;
      g.itens.push(p);
    });
    return {cond:cd, grupos};
  }).filter(s => s.grupos.length);

  const corpo = secoes.map(s => {
    const chaves = s.grupos.map(g => tabelaCat+'|'+s.cond+'|'+g.modelo);
    const nAbertos = chaves.filter(k => precoAbertos.has(k)).length;
    const nPrecos = s.grupos.reduce((a,g) => a + g.itens.length, 0);

    const titulo = `<tr class="tpr-secao"><td colspan="${ncols}">
      <span class="tpr-secao-nome">${escapeHtml(_precoCondLabel(s.cond))}</span>
      <span class="tpr-secao-cnt">${s.grupos.length} modelo${s.grupos.length>1?'s':''} · ${nPrecos} preço${nPrecos>1?'s':''}</span>
      <button class="tpr-secao-tudo" onclick="togglePrecoSecao('${escapeKey(s.cond)}','${escapeKey(chaves.join('~~'))}')">${nAbertos===chaves.length?'fechar tudo':'abrir tudo'}</button>
    </td></tr>`;

    const linhasSecao = s.grupos.map(g => {
      const k = tabelaCat+'|'+s.cond+'|'+g.modelo;
      const aberto = precoAbertos.has(k);
      const itens = g.itens.slice().sort((a,b) =>
        _gb(a.capacidade) - _gb(b.capacidade) ||
        String(a.cor||'').localeCompare(String(b.cor||''),'pt-BR'));

      // Linha fechada: ja entrega nome, cores e faixa de preco — na maioria das
      // vezes e a unica coisa que se quer saber, e cabe uma por linha.
      const fxUp = _faixaPreco(itens.map(p=>p.preco_upgrade));
      const faixa = `<tr class="tpr-grupo${aberto?' aberto':''}" onclick="togglePrecoGrupo('${escapeKey(k)}')">
        <td>
          <div class="tpr-mod">
            <span class="tpr-seta">▾</span>
            <span class="tpr-nome">${escapeHtml(g.nome)}</span>
            ${g.cores.length ? `<span class="tpr-cores">${g.cores.map(c=>_precoDot(c)).join('')}</span>` : ''}
            <span class="tpr-cap">${itens.length} opç${itens.length>1?'ões':'ão'}</span>
            ${g.variaCor ? '<span class="tpr-varia">preço varia por cor</span>' : ''}
          </div>
        </td>
        ${temUpgrade ? `<td class="tpr-preco tpr-up tpr-col-up">${fxUp}</td>` : ''}
        <td class="tpr-preco tpr-var">${_faixaPreco(itens.map(p=>p.preco_varejo))}
          ${temUpgrade && fxUp!=='—' ? `<span class="tpr-up-mob">${fxUp} <i>upgrade</i></span>` : ''}</td>
        <td class="tpr-warn">${itens.some(p=>p.sujeito_disponibilidade)?'<span title="Sujeito a disponibilidade">⚠</span>':''}</td>
      </tr>`;
      if(!aberto) return faixa;

      const rows = itens.map(p => {
        const partes = [];
        if(p.capacidade) partes.push(`<span class="tpr-gb">${escapeHtml(p.capacidade)}</span>`);
        if(p.cor) partes.push(`${_precoDot(p.cor,'tpr-dot-lin')}${escapeHtml(p.cor)}`);
        const label = partes.join(' ') || '<span class="tpr-gb">Único</span>';
        return `<tr class="tpr-lin" onclick="openPrecoPanel('${escapeKey(tabelaCat)}','${escapeKey(g.modelo)}','${escapeKey(s.cond)}')">
          <td>${label}</td>
          ${temUpgrade ? `<td class="tpr-preco tpr-up tpr-col-up">${p.preco_upgrade==null?'—':moneyPreco(p.preco_upgrade)}</td>` : ''}
          <td class="tpr-preco tpr-var">${p.preco_varejo==null?'—':moneyPreco(p.preco_varejo)}
            ${temUpgrade && p.preco_upgrade!=null ? `<span class="tpr-up-mob">${moneyPreco(p.preco_upgrade)} <i>upgrade</i></span>` : ''}</td>
          <td class="tpr-warn">${p.sujeito_disponibilidade?'<span title="Sujeito a disponibilidade">⚠</span>':''}</td>
        </tr>`;
      }).join('');
      return faixa + rows;
    }).join('');

    return titulo + linhasSecao;
  }).join('');

  const tabela = `<div class="tpr-wrap"><table class="tpr-tab">
    <thead><tr>
      <th>Modelo</th>
      ${temUpgrade ? '<th class="n tpr-col-up">Upgrade <i>na troca</i></th>' : ''}
      <th class="n">Varejo <i>à vista</i></th>
      <th style="width:36px"></th>
    </tr></thead>
    <tbody>${corpo || `<tr><td colspan="${ncols}"><div class="c-vazio"><div class="c-vazio-titulo">Nada nesta combinação</div></div></td></tr>`}</tbody>
  </table></div>`;

  // A data da ultima sync saiu do cabecalho: no celular ela empurrava o titulo
  // pra 3 linhas. Continua visivel, junto da nota que fala da planilha.
  // ⚠️ Só sócio: a Edge Function `sync-precos` exige o papel desde 14/ago, então
  // pro colaborador este botão só produziria um 403 e a sensação de tela quebrada.
  const acao = podeVerMargem()
    ? UI.btn('↻ Atualizar da planilha', {onclick:'sincronizarPrecos()', sm:true, id:'btn-sync-precos'})
    : '';

  const nota = podeVerMargem()
    ? `<div class="tpr-nota">💡 Preços vêm da planilha oficial no Google Sheets — edite lá e clique em “Atualizar da planilha” (<span style="color:${_ultimaSyncPrecos?.status==='erro'?'var(--red)':'var(--text4)'}">${textoUltimaSync()}</span>) · toque no modelo para abrir as capacidades, e numa capacidade para ver o detalhe · <span style="color:var(--warning)">⚠</span> = sujeito a disponibilidade · bolinhas = cores disponíveis</div>`
    : `<div class="tpr-nota">💡 <b>Varejo</b> é o preço à vista; <b>Upgrade</b> é o preço quando o cliente dá um aparelho na troca · toque no modelo para abrir as capacidades · <span style="color:var(--warning)">⚠</span> = sujeito a disponibilidade · bolinhas = cores disponíveis · ${textoUltimaSync()}</div>`;

  return UI.card({
    titulo: '📋 Tabela de preços',
    sub: `${linhas.length} de ${todos.length}`,
    acao, flush: true,
    corpo: filtros + tabela + nota
  });
}

// -- Painel lateral: detalhe de um modelo -----------------------------------
// `cond` vem da secao clicada. Com o filtro em "Todas", tabelaCond e null e a
// condicao precisa vir de fora — senao o painel abriria vazio.
function openPrecoPanel(cat, modelo, cond){
  const alvo = cond || tabelaCond;
  const itens = getTabelaPrecos()
    .filter(p => p.categoria===cat && p.modelo===modelo && (!alvo || p.condicao===alvo))
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
    if(temUp) cel.push({v: p.preco_upgrade==null?'—':moneyPreco(p.preco_upgrade), num:true});
    cel.push({v: p.preco_varejo==null?'—':`<span style="color:var(--cart);font-weight:700">${moneyPreco(p.preco_varejo)}</span>`, num:true});
    return cel;
  });

  const corpo = `${chipsCor}
    ${UI.tabela({colunas, linhas:linhasTab})}
    ${disp ? `<div class="v-alerta" data-tom="alerta" style="margin-top:12px"><span>⚠ Alguns preços deste modelo estão sujeitos a disponibilidade.</span></div>` : ''}
    <div class="tpr-pnl-nota">Condição: <b>${escapeHtml(itens[0].condicao||'—')}</b>. Preço oficial vem do Google Sheets. O histórico de preços aparecerá aqui quando começarmos a registrar as mudanças da planilha.</div>`;

  UI.abrirPainel({ titulo: escapeHtml(nome), corpo });
}
