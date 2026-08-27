// ===========================================================================
// DIÁRIO DE BORDO — o que foi medido, o que ficou decidido, o que está em aberto
//
// POR QUE ESTA TELA EXISTE
// O dono perguntou "o que ficou resolvido nesse chat?". A informação existia --
// em commit e em docs/ -- mas nenhuma das duas é escrita pra ele: commit é pra
// dev, docs/ é pra agente. Faltava o lugar que ele já abre todo dia.
//
// ⚠️ E NÃO É SÓ CONVENIÊNCIA. `docs/ANALISE-MAJU-AGO-2026.md` pede com todas as
// letras: "carimbe toda mudança de prompt num changelog -- hoje as viradas só
// se descobrem por arqueologia de série". A camada 2 do
// `docs/PLANO-QUALIDADE-IA.md` depende de saber QUANDO algo mudou, senão se
// compara antes/depois sem saber onde é o antes. Esta tela É esse changelog --
// por isso o tipo `prompt` tem destaque próprio.
//
// ⚠️ A REGRA QUE IMPEDE O DIÁRIO DE APODRECER: ele LINKA, nunca COPIA.
// Conteúdo duplicado de docs/ aqui vira terceira fonte de verdade e diverge --
// e o CLAUDE.md marca regra em dois lugares como a classe mais cara de bug.
// `resumo` são até 4 bullets do QUE MUDOU; `docs`/`commits`/`links` são ponteiro.
//
// ⚠️ A METADE DE CIMA É A QUE VALE. Um log ninguém abre duas vezes; "o que está
// pendente e com quem" é o que um dono precisa. Item que passa de 30 dias em
// aberto ganha cor de atenção -- laço velho é o que morre calado.
// ===========================================================================

let diarioEntradas = null;      // null = ainda não carregou (≠ carregou vazio)
let diarioItens    = null;
let diarioCarregando = false;
let diarioErro     = null;
let diarioVerFechados = false;
let diarioTagAberta = null;
// ⚠️ Duas abas porque são duas coisas diferentes: PENDÊNCIAS é o que o dono
// precisa cobrar; ATENDIMENTO é o que a análise descobriu. Misturar as duas foi
// o primeiro desenho, e o dono pediu pra separar -- ele lê as duas em ritmos
// diferentes (pendência é semanal, análise é quando muda alguma coisa).
let diarioAba = 'pendencias';
let atendPadroes = null;
let atendPares   = null;
let atendTags    = null;
let atendLoja    = 'cart';   // a análise é por loja: os prompts são diferentes

// ⚠️ Os tons são os do design system (`css/components.css`), não cor inventada:
// processo=violeta, marca=tint da loja, alerta=âmbar, critico=vermelho, ok=verde.
// Tom vazio = neutro. Ver docs/DESIGN-SYSTEM.md — cor é significado.
const DIARIO_DONOS = {
  dudu:   { rotulo: 'Dudu',   tom: 'processo' },   // depende de fora
  nos:    { rotulo: 'Painel', tom: 'marca'    },
  dono:   { rotulo: 'Você',   tom: 'alerta'   },
  equipe: { rotulo: 'Equipe', tom: ''         },
};

const DIARIO_TIPOS = {
  analise: { rotulo: 'análise', tom: ''         },
  decisao: { rotulo: 'decisão', tom: 'marca'    },
  prompt:  { rotulo: 'prompt',  tom: 'processo' },  // ⚠️ o carimbo do changelog
  codigo:  { rotulo: 'código',  tom: ''         },
  dado:    { rotulo: 'dado',    tom: 'ok'       },
};

/**
 * Carrega as duas tabelas. Guard contra fetch duplicado -- mas ⚠️ o gancho de
 * "carrega e redesenha" fica no REDESENHO, nunca no fetch: em 18/ago um
 * `.then(renderContent)` em cima de promise já resolvida virou laço de
 * microtask e travou o Estoque. Ver `recarregarUmaVez()` em estoque.js.
 */
function diarioCarregar(){
  if(diarioCarregando) return Promise.resolve(false);
  diarioCarregando = true;
  diarioErro = null;
  const h = { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_TOKEN };
  return Promise.all([
    fetch(SB_URL + '/rest/v1/diario?select=*&order=data.desc,id.desc&limit=200', { headers: h }),
    fetch(SB_URL + '/rest/v1/diario_itens?select=*&order=prioridade.asc,aberto_em.asc&limit=300', { headers: h }),
    fetch(SB_URL + '/rest/v1/atendimento_padroes?select=*&order=ordem.asc&limit=200', { headers: h }),
    fetch(SB_URL + '/rest/v1/atendimento_pares?select=*&order=ordem.asc&limit=100', { headers: h }),
    fetch(SB_URL + '/rest/v1/atendimento_tags?select=*&order=n_conversas.desc&limit=400', { headers: h }),
  ]).then(async ([a, b, c, d, e]) => {
    if(!a.ok || !b.ok) throw new Error('HTTP ' + a.status + '/' + b.status);
    diarioEntradas = await a.json();
    diarioItens    = await b.json();
    // ⚠️ a aba de atendimento não pode derrubar a de pendências: se ela falhar,
    // fica vazia e o resto da tela continua de pé.
    atendPadroes = c.ok ? await c.json() : [];
    atendPares   = d.ok ? await d.json() : [];
    atendTags    = e.ok ? await e.json() : [];
    return true;
  }).catch(e => {
    console.error('diarioCarregar', e);
    diarioErro = e.message || String(e);
    diarioEntradas = diarioEntradas || [];
    diarioItens    = diarioItens || [];
    atendPadroes   = atendPadroes || [];
    atendPares     = atendPares || [];
    atendTags      = atendTags || [];
    return true;
  }).finally(() => { diarioCarregando = false; });
}

/** Só recarrega e redesenha uma vez, e só quando de fato veio dado novo. */
function diarioRecarregarUmaVez(){
  diarioCarregar().then(mudou => { if(mudou && typeof renderContent === 'function') renderContent(); });
}

function diarioDias(iso){
  if(!iso) return 0;
  const d = new Date(iso + 'T12:00:00-03:00');
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function diarioDataBR(iso){
  if(!iso) return '—';
  const [a, m, d] = String(iso).split('-');
  return d + '/' + m;
}

/** Item em aberto. A idade é a informação: laço velho é o que morre calado. */
function diarioItemHtml(it){
  const dono = DIARIO_DONOS[it.dono] || DIARIO_DONOS.nos;
  const dias = diarioDias(it.aberto_em);
  const descartado = !!it.descartado_em;
  const feito = !!it.fechado_em || descartado;
  const velho = !feito && dias >= 30;
  return `
    <div class="di-item${feito ? ' feito' : ''}${velho ? ' velho' : ''}">
      <div class="di-item-top">
        <span class="di-item-tit">${UI.esc(it.titulo)}</span>
        <span class="di-item-tags">
          ${it.prioridade === 1 && !feito ? UI.badge('agora', 'critico') : ''}
          ${UI.badge(dono.rotulo, dono.tom)}
        </span>
      </div>
      ${it.detalhe ? `<div class="di-item-det">${UI.esc(it.detalhe)}</div>` : ''}
      <div class="di-item-pe">
        ${descartado
          ? `✕ descartado em ${diarioDataBR(it.descartado_em)}${it.fechado_nota ? ' — ' + UI.esc(it.fechado_nota) : ''}`
          : feito
          ? `✓ resolvido em ${diarioDataBR(it.fechado_em)}${it.fechado_nota ? ' — ' + UI.esc(it.fechado_nota) : ''}`
          : `aberto há ${dias} ${dias === 1 ? 'dia' : 'dias'}${velho ? ' — sem mexer' : ''}`}
        ${feito ? '' : `<button class="di-fechar" onclick="diarioFechar(${it.id})">resolvido</button>
                        <button class="di-fechar di-descartar" onclick="diarioDescartar(${it.id})">não serve</button>`}
      </div>
    </div>`;
}

/** Entrada do histórico. `resumo` é bullet do que mudou, nunca o conteúdo. */
function diarioEntradaHtml(e){
  const tipo = DIARIO_TIPOS[e.tipo] || DIARIO_TIPOS.analise;
  const ponteiros = []
    .concat((e.docs || []).map(d => `<code>${UI.esc(d)}</code>`))
    .concat((e.commits || []).map(c => `<code class="di-sha">${UI.esc(c)}</code>`))
    .concat((e.links || []).map(l => `<a href="${UI.esc(l)}" target="_blank" rel="noopener">link</a>`));
  return `
    <div class="di-entrada">
      <div class="di-quando">
        <span class="di-dia">${diarioDataBR(e.data)}</span>
        ${UI.badge(tipo.rotulo, tipo.tom)}
      </div>
      <div class="di-corpo">
        <div class="di-tit">${UI.esc(e.titulo)}</div>
        ${(e.resumo || []).length
          ? `<ul class="di-resumo">${e.resumo.map(r => `<li>${UI.esc(r)}</li>`).join('')}</ul>`
          : ''}
        ${ponteiros.length ? `<div class="di-ponteiros">${ponteiros.join('')}</div>` : ''}
      </div>
    </div>`;
}

/** As abas. Ordem: o que precisa de ação antes do que precisa de leitura. */
const DIARIO_ABAS = [
  { id: 'pendencias',  label: 'Pendências'  },
  { id: 'atendimento', label: 'Atendimento' },
];

function diarioTabs(){
  return `<div class="di-tabs">${DIARIO_ABAS.map(a =>
    `<button class="di-tab${diarioAba === a.id ? ' ativo' : ''}"
       onclick="diarioAba='${a.id}';renderContent()">${a.label}</button>`).join('')}</div>`;
}

function renderDiario(){
  // Primeira entrada na tela: dispara a carga e desenha o esqueleto.
  if(diarioEntradas === null){
    diarioRecarregarUmaVez();
    return UI.card({ titulo: 'Diário de bordo', corpo: `<div class="di-vazio">Carregando…</div>` });
  }
  const erro = diarioErro
    ? `<div class="di-erro">Não consegui carregar (${UI.esc(diarioErro)}). O que aparece abaixo pode estar velho.</div>` : '';
  return erro + diarioTabs() + (diarioAba === 'atendimento' ? diarioAtendimento() : diarioPendencias());
}

// ===========================================================================
// ABA 1 — PENDÊNCIAS: o que está em aberto e com quem, e o histórico do que
// já foi decidido. É a metade que pede ação.
// ===========================================================================
function diarioPendencias(){
  const vivos    = (diarioItens || []).filter(i => !i.fechado_em && !i.descartado_em);
  const encerrados = (diarioItens || []).filter(i => i.fechado_em || i.descartado_em);
  const porDono  = {};
  vivos.forEach(i => { (porDono[i.dono] = porDono[i.dono] || []).push(i); });
  // Ordem fixa: primeiro o que depende de fora, depois o que é nosso.
  const ordem = ['dudu', 'dono', 'nos', 'equipe'].filter(d => porDono[d]);

  const kpis = UI.kpis([
    { rotulo: 'Em aberto',    valor: String(vivos.length) },
    { rotulo: 'Para agora',   valor: String(vivos.filter(i => i.prioridade === 1).length) },
    { rotulo: 'Com o Dudu',   valor: String((porDono.dudu || []).length) },
    { rotulo: 'Parados 30d+', valor: String(vivos.filter(i => diarioDias(i.aberto_em) >= 30).length) },
  ]);

  const aberto = ordem.length
    ? ordem.map(d => `
        <div class="di-grupo">
          <div class="di-grupo-tit">${DIARIO_DONOS[d].rotulo}</div>
          ${porDono[d].map(diarioItemHtml).join('')}
        </div>`).join('')
    : UI.vazio({ titulo: 'Nada em aberto', texto: 'Todo laço fechado. Raro — aproveite.' });

  const historico = (diarioEntradas || []).length
    ? (diarioEntradas || []).map(diarioEntradaHtml).join('')
    : UI.vazio({ titulo: 'Sem entradas', texto: 'O diário começa na próxima sessão de trabalho.' });

  return `
    ${kpis}
    ${UI.card({ titulo: 'Em aberto', sub: 'o que está pendente e com quem',
      corpo: `<div class="di-abertos">${aberto}</div>` })}
    ${UI.card({
      titulo: 'Histórico', sub: 'o que foi medido e o que ficou decidido',
      acao: encerrados.length
        ? `<button class="c-btn c-btn-sm" onclick="diarioVerFechados=!diarioVerFechados;renderContent()">${diarioVerFechados ? 'esconder' : 'ver'} ${encerrados.length} encerrado${encerrados.length === 1 ? '' : 's'}</button>`
        : '',
      corpo: `
        ${diarioVerFechados && encerrados.length
          ? `<div class="di-abertos di-resolvidos">${encerrados.map(diarioItemHtml).join('')}</div>` : ''}
        <div class="di-historico">${historico}</div>` })}`;
}

// ===========================================================================
// ABA 2 — ATENDIMENTO: o que a Maju faz e o que o vendedor faz.
//
// ⚠️ O PAR VEM PRIMEIRO, o número depois. O dono viu a tabela de percentuais e
// pediu pra VER os exemplos -- porque "3% contra 12%" não mostra o mecanismo, e
// as duas frases lado a lado mostram: é quase a mesma frase, com final diferente.
// ===========================================================================
function diarioAtendimento(){
  const pares   = atendPares || [];
  const padroes = atendPadroes || [];

  const paresHtml = pares.length ? pares.map(p => `
    <div class="at-par">
      <div class="at-momento">${UI.esc(p.momento)}</div>
      <div class="at-falas">
        <div class="at-fala at-ia">
          <span class="at-quem">Maju / Duda</span>
          <p>${UI.esc(p.fala_ia)}</p>
        </div>
        <div class="at-fala at-vend">
          <span class="at-quem">Vendedor</span>
          <p>${UI.esc(p.fala_vendedor)}</p>
        </div>
      </div>
      <div class="at-porque">${UI.esc(p.porque)}</div>
    </div>`).join('')
    : UI.vazio({ titulo: 'Sem exemplos', texto: 'Nenhum par foi carregado ainda.' });

  // Números: quem faz mais aparece com a barra maior. Duas barras, não uma --
  // ⚠️ os denominadores são diferentes (a IA está em todas as conversas, o
  // vendedor só naquelas em que aparece), e a barra é comparação de HÁBITO.
  const linhas = padroes.map(p => {
    const ia = Number(p.pct_ia) || 0, vd = Number(p.pct_vendedor) || 0;
    const max = Math.max(ia, vd, 1);
    return `
      <div class="at-linha${p.destaque ? ' destaque' : ''}">
        <div class="at-comp">
          ${UI.esc(p.comportamento)}
          <span class="at-loja">${p.loja === 'ambas' ? 'as duas lojas' : p.loja}</span>
        </div>
        <div class="at-barras">
          <div class="at-b"><span class="at-b-rot">IA</span>
            <span class="at-b-trilho"><i style="width:${(100*ia/max).toFixed(0)}%"></i></span>
            <span class="at-b-num">${ia}%</span></div>
          <div class="at-b vend"><span class="at-b-rot">vend</span>
            <span class="at-b-trilho"><i style="width:${(100*vd/max).toFixed(0)}%"></i></span>
            <span class="at-b-num">${vd}%</span></div>
        </div>
        ${p.nota ? `<div class="at-nota">${UI.esc(p.nota)}</div>` : ''}
      </div>`;
  }).join('');

  // ── as etiquetas: o que dá pra CONSERTAR, com a frase que gerou cada uma ──
  // ⚠️ Uma tag por conversa, produzida por fora da IA (scripts/tags-atendimento.js).
  // Não depende da Maju marcar nada, e cobre o vendedor também.
  const tags = (atendTags || []).filter(t => t.loja === atendLoja);
  const porTag = {};
  tags.forEach(t => { (porTag[t.tag] = porTag[t.tag] || []).push(t); });
  const ordenadas = Object.values(porTag)
    .sort((a, b) => (b[0].n_conversas / b[0].n_total) - (a[0].n_conversas / a[0].n_total));

  const tagsHtml = ordenadas.length ? ordenadas.map(g => {
    const t = g[0];
    const pct = t.n_total ? Math.round(100 * t.n_conversas / t.n_total) : 0;
    const aberta = diarioTagAberta === t.tag;
    return `
      <div class="tg${t.quem === 'vendedor' ? ' tg-vend' : ''}">
        <button class="tg-cab" onclick="diarioTagAberta=${aberta ? 'null' : `'${t.tag}'`};renderContent()">
          <span class="tg-quem">${t.quem === 'ia' ? 'IA' : 'vendedor'}</span>
          <span class="tg-rot">${UI.esc(t.rotulo)}</span>
          <span class="tg-n">${t.n_conversas}<span class="tg-pct">${pct}%</span></span>
          <span class="tg-seta">${aberta ? '▾' : '▸'}</span>
        </button>
        <div class="tg-conserto">→ ${UI.esc(t.conserto)}</div>
        ${aberta ? `<div class="tg-exemplos">
          ${!t.trecho_e_prova
            ? `<div class="tg-aviso">⚠️ Esta falha é uma <b>ausência</b> — nenhuma frase a prova.
                 O que aparece abaixo é <b>onde caberia</b>, não o erro em si.</div>` : ''}
          ${g.map(x => `<blockquote class="tg-ex">${UI.esc(x.trecho)}
            <cite>conversa ${x.conversa_id}</cite></blockquote>`).join('')}
        </div>` : ''}
      </div>`;
  }).join('') : UI.vazio({ titulo: 'Sem etiquetas', texto: 'Rode scripts/tags-atendimento.js.' });

  const seletor = `<div class="tg-lojas">
    ${['cart', 'urban'].map(l => `<button class="tg-loja${atendLoja === l ? ' ativo' : ''}"
      onclick="atendLoja='${l}';diarioTagAberta=null;renderContent()">${l === 'cart' ? 'Cart' : 'Urban'}</button>`).join('')}
  </div>`;

  return `
    ${UI.card({
      titulo: 'O que dá pra consertar',
      sub: 'clique pra ver as frases reais',
      acao: seletor,
      corpo: `<div class="tgs">${tagsHtml}</div>
        <div class="at-rodape">
          Etiquetas geradas por fora da IA, a partir do texto — <b>cada uma carrega a frase que a
          gerou</b>. Não dependem da Maju marcar nada, e cobrem o vendedor também.
        </div>` })}
    ${UI.card({
      titulo: 'A mesma frase, dois finais',
      sub: 'falas reais das conversas',
      corpo: `<div class="at-pares">${paresHtml}</div>` })}
    ${UI.card({
      titulo: 'O hábito de cada um',
      sub: '% das conversas em que aparece',
      corpo: `<div class="at-linhas">${linhas}</div>
        <div class="at-rodape">
          ⚠️ Os dois lados têm bases diferentes: a IA está em todas as conversas, o vendedor só
          nas que ele assume. A barra compara <b>hábito</b>, não volume.<br>
          ⚠️ Que <b>marcar o horário funciona melhor que perguntar qual</b> ainda é hipótese —
          o que está provado é que <b>conversa com dia marcado converte 14,9% contra 3,4%</b>.
        </div>` })}`;
}

/**
 * Fecha um item. ⚠️ Guarda a DATA em vez de apagar a linha: é isso que permite
 * medir quanto tempo um laço fica aberto -- e apagar seria perder o histórico
 * que justifica a tela existir.
 */
function diarioFechar(id){
  const it = (diarioItens || []).find(i => i.id === id);
  if(!it) return;
  const nota = prompt('Fechar "' + it.titulo + '".\nO que ficou resolvido? (opcional)');
  if(nota === null) return;                       // cancelou
  const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);  // BRT
  fetch(SB_URL + '/rest/v1/diario_itens?id=eq.' + id, {
    method: 'PATCH',
    headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_TOKEN,
               'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify({ fechado_em: hoje, fechado_nota: nota || null }),
  }).then(async r => {
    if(!r.ok){
      const t = await r.text().catch(() => '');
      throw new Error('HTTP ' + r.status + (t ? ' — ' + t.slice(0, 160) : ''));
    }
    it.fechado_em = hoje;
    it.fechado_nota = nota || null;
    renderContent();
  }).catch(e => {
    console.error('diarioFechar', e);
    alert('Não deu pra fechar: ' + e.message);
  });
}

/**
 * Descarta um item. ⚠️ NÃO é o mesmo que resolver, e por isso vai em coluna
 * separada: se muitos itens forem descartados, o problema é o que EU escrevo --
 * e sem separar as duas colunas isso fica invisível.
 */
function diarioDescartar(id){
  const it = (diarioItens || []).find(i => i.id === id);
  if(!it) return;
  const nota = prompt('Descartar "' + it.titulo + '".\nPor que não serve? (opcional, me ajuda a escrever melhor)');
  if(nota === null) return;
  const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);  // BRT
  fetch(SB_URL + '/rest/v1/diario_itens?id=eq.' + id, {
    method: 'PATCH',
    headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_TOKEN,
               'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify({ descartado_em: hoje, fechado_nota: nota || null }),
  }).then(async r => {
    if(!r.ok){
      const t = await r.text().catch(() => '');
      throw new Error('HTTP ' + r.status + (t ? ' — ' + t.slice(0, 160) : ''));
    }
    it.descartado_em = hoje;
    it.fechado_nota = nota || null;
    renderContent();
  }).catch(e => {
    console.error('diarioDescartar', e);
    alert('Não deu pra descartar: ' + e.message);
  });
}
