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
  ]).then(async ([a, b]) => {
    if(!a.ok || !b.ok) throw new Error('HTTP ' + a.status + '/' + b.status);
    diarioEntradas = await a.json();
    diarioItens    = await b.json();
    return true;
  }).catch(e => {
    console.error('diarioCarregar', e);
    diarioErro = e.message || String(e);
    diarioEntradas = diarioEntradas || [];
    diarioItens    = diarioItens || [];
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
  const velho = !it.fechado_em && dias >= 30;
  const feito = !!it.fechado_em;
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
        ${feito
          ? `✓ fechado em ${diarioDataBR(it.fechado_em)}${it.fechado_nota ? ' — ' + UI.esc(it.fechado_nota) : ''}`
          : `aberto há ${dias} ${dias === 1 ? 'dia' : 'dias'}${velho ? ' — sem mexer' : ''}`}
        ${feito ? '' : `<button class="di-fechar" onclick="diarioFechar(${it.id})">marcar como resolvido</button>`}
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

function renderDiario(){
  // Primeira entrada na tela: dispara a carga e desenha o esqueleto.
  if(diarioEntradas === null){
    diarioRecarregarUmaVez();
    return UI.card({ titulo: 'Diário de bordo',
      corpo: `<div class="di-vazio">Carregando…</div>` });
  }

  const abertos  = (diarioItens || []).filter(i => !i.fechado_em);
  const fechados = (diarioItens || []).filter(i => i.fechado_em);
  const porDono  = {};
  abertos.forEach(i => { (porDono[i.dono] = porDono[i.dono] || []).push(i); });
  // Ordem fixa: primeiro o que depende de fora, depois o que é nosso.
  const ordem = ['dudu', 'dono', 'nos', 'equipe'].filter(d => porDono[d]);

  const kpis = UI.kpis([
    { rotulo: 'Em aberto',      valor: String(abertos.length) },
    { rotulo: 'Para agora',     valor: String(abertos.filter(i => i.prioridade === 1).length) },
    { rotulo: 'Com o Dudu',     valor: String((porDono.dudu || []).length) },
    { rotulo: 'Parados 30d+',   valor: String(abertos.filter(i => diarioDias(i.aberto_em) >= 30).length) },
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
    ${diarioErro ? `<div class="di-erro">Não consegui carregar (${UI.esc(diarioErro)}). O que aparece abaixo pode estar velho.</div>` : ''}
    ${kpis}
    ${UI.card({
      titulo: 'Em aberto',
      sub: 'o que está pendente e com quem',
      corpo: `<div class="di-abertos">${aberto}</div>`,
    })}
    ${UI.card({
      titulo: 'Histórico',
      sub: 'o que foi medido e o que ficou decidido',
      acao: fechados.length
        ? `<button class="c-btn c-btn-sm" onclick="diarioVerFechados=!diarioVerFechados;renderContent()">${diarioVerFechados ? 'esconder' : 'ver'} ${fechados.length} resolvido${fechados.length === 1 ? '' : 's'}</button>`
        : '',
      corpo: `
        ${diarioVerFechados && fechados.length
          ? `<div class="di-abertos di-resolvidos">${fechados.map(diarioItemHtml).join('')}</div>` : ''}
        <div class="di-historico">${historico}</div>`,
    })}`;
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
