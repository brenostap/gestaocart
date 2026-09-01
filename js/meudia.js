// ============================================================================
// MEU DIA — a tela de quem vende e de quem atende
//
// Existe porque esconder numero nao desenha tela: um colaborador caindo no
// dashboard do socio via `money()` devolver '—' em cada KPI, o que comunica
// "tem coisa aqui que voce nao pode ver". Papel novo pede tela nova.
//
// ⚠️ DE ONDE VEM O NUMERO. Esta tela NAO calcula comissao a partir das vendas
// carregadas -- ela nao tem como. O 25% do atendente incide sobre o LUCRO de
// acessorio, e `valor_estoque` nunca chega no navegador dele. Entao:
//
//   quantidade e valor  ->  view v_minhas_vendas   (sem custo, sem lucro)
//   base do mes         ->  view v_minha_comissao_mes (SO agregado)
//
// Quem classifica item como acessorio ali e `eh_acessorio()` no Postgres, que e
// o espelho de isAcess() daqui. Os dois andam juntos -- test/regra-acessorio.test.js.
//
// ⚠️ MES FECHADO NAO SE RECALCULA AQUI -- ele vem de `folha_mensal`.
// Ate 01/set/2026 esta tela mostrava SO o mes corrente, porque recalcular mes
// pago daria numero diferente do que a folha pagou (o mapa de apelidos de
// 17/ago resgatou atendimentos que o codigo antigo perdia). A condicao que
// faltava era o snapshot da folha, e ele existe desde 01/set: ago/2026 e
// jul/2026 estao congelados.
//
// Entao a navegacao por mes segue DUAS fontes, e a diferenca importa:
//   mes corrente  -> views (v_minha_comissao_mes/dia). Recalcula, e tudo bem:
//                    o mes ainda esta correndo e o numero e uma previsao.
//   mes FECHADO   -> folha_mensal, congelado. NUNCA a view -- ela recalcularia
//                    com as regras de hoje e discordaria do extrato da pessoa.
// Mes antigo SEM linha em folha_mensal nao mostra comissao nenhuma: dizer "nao
// foi congelado" e honesto; mostrar um numero reconstruido nao e.
// ============================================================================

let mdResumo = null;      // linha de v_minha_comissao_mes do mes corrente
let mdDias   = [];        // v_minha_comissao_dia -- a base agregada POR DIA
let mdVendas = [];        // v_minhas_vendas do mes corrente
let mdRede   = null;      // linha de v_meta_rede_mes -- total da rede, sem nome
let mdFolha  = [];        // folha_mensal -- meses JA FECHADOS, congelados
let mdCarregado = false;
let mdErro = '';
let mdMes = null;         // mes sendo olhado; null = o corrente

// 'YYYY-MM' do mes corrente em BRT. Nao usa currentPeriod: esta tela e sempre
// "o meu mes", e o seletor de periodo nem aparece pra quem so tem esta aba.
function mdMesCorrente(){
  const d = new Date();
  const brt = new Date(d.getTime() - 3*60*60*1000);
  return brt.getUTCFullYear() + '-' + String(brt.getUTCMonth()+1).padStart(2,'0');
}

// O mes na tela. `mdMes` so muda pelas setas; o padrao e sempre o corrente.
function mdMesVisto(){ return mdMes || mdMesCorrente(); }
function mdEhCorrente(){ return mdMesVisto() === mdMesCorrente(); }
// A linha congelada deste mes, se houver. E ela quem manda em mes fechado.
function mdFolhaDoMes(ym){ return (mdFolha || []).find(f => f.mes === ym) || null; }
// Meses que a pessoa pode abrir: os congelados dela + o corrente. Sem inventar
// mes vazio -- se nao ha folha nem e o corrente, nao ha o que mostrar.
function mdMesesDisponiveis(){
  const ms = new Set((mdFolha || []).map(f => f.mes));
  ms.add(mdMesCorrente());
  return [...ms].sort();
}
function mdMesVizinho(dir){
  const ms = mdMesesDisponiveis();
  const i = ms.indexOf(mdMesVisto());
  return ms[i + dir] || null;
}
async function mdVerMes(ym){
  if(!ym || ym === mdMesVisto()) return;
  mdMes = ym; mdFiltroLoja = 'todas'; mdFiltroDia = 'todos';
  await recarregarMeuDia();
}

function mdTemVo(){ return !!(meuPerfil && meuPerfil.vo_key); }
function mdTemAt(){ return !!(meuPerfil && meuPerfil.at_key); }

async function carregarMeuDia(){
  mdErro = '';
  const mes = mdMesVisto();
  try{
    const [resumo, dias, vendas, rede, folha] = await Promise.all([
      sbGet('v_minha_comissao_mes', `mes=eq.${mes}`, 1),
      // A comissao do dia sai daqui, nao das vendas: 25% incide sobre o LUCRO
      // de acessorio, que nunca chega no navegador item a item. Ver a migration
      // 20260820_comissao_por_dia_e_brt.sql pro numero que decidiu o "por dia".
      sbGet('v_minha_comissao_dia', `dia=gte.${mes}-01&order=dia.desc`, 62),
      sbGet('v_minhas_vendas', `data_saida=gte.${mes}-01&order=data_saida.desc`, 500),
      sbGet('v_meta_rede_mes', `mes=eq.${mes}`, 1),
      // Mes fechado NAO se recalcula: vem congelado de folha_mensal, gravado
      // por scripts/folha-snapshot.js rodando o fechamentoEquipe() real.
      // ⚠️ SEM filtro de mes: a lista inteira alimenta a navegacao (que meses
      // existem) e o proprio mes olhado, quando ele ja estiver fechado.
      sbGet('folha_mensal', `order=mes.desc`, 36),
    ]);
    mdResumo = (resumo && resumo[0]) || null;
    mdDias   = dias || [];
    mdVendas = vendas || [];
    mdRede   = (rede && rede[0]) || null;
    mdFolha  = folha || [];
  }catch(e){
    console.warn('[meudia] carga falhou:', e.message);
    mdErro = e.message || 'falha ao carregar';
    mdResumo = null; mdDias = []; mdVendas = []; mdRede = null; mdFolha = [];
  }
  mdCarregado = true;
}

// A linha do cadastro (FUNC) desta pessoa, achada pela chave. Serve pra duas
// coisas que o perfil nao sabe: se ela esta fora do rateio do bonus coletivo
// neste mes, e se ela tem o extra de 5% (hoje so a Anne).
function mdFunc(){
  if(!meuPerfil) return null;
  const vo = meuPerfil.vo_key, at = meuPerfil.at_key;
  return FUNC.find(f => (vo && f.voKey === vo) || (at && f.atKey === at)) || null;
}

// BONUS COLETIVO -- pago CHEIO por pessoa quando a REDE bate a faixa. Sem ele o
// heroi mentia pra baixo: em ago/2026 sao ~R$1.000 que a tela nao contava.
//
// As faixas vem de metasColetivas() (core.js), que e por mes e nunca retroativa.
// Os totais vem da view v_meta_rede_mes. Nenhum dos dois mora aqui de proposito.
function mdMetaRede(){
  if(!mdRede) return null;
  const metas = metasColetivas(mdMesCorrente());
  const un    = Number(mdRede.aparelhos || 0);
  const ac    = Number(mdRede.acess_bruto || 0);
  const devBatida = metas.dev.filter(x => un >= x.qt).pop() || null;
  const devProx   = metas.dev.find(x => un < x.qt) || null;
  const acBatida  = metas.acess.filter(x => ac >= x.val).pop() || null;
  const acProx    = metas.acess.find(x => ac < x.val) || null;
  const f = mdFunc();
  // Ferias/afastamento tiram a pessoa do rateio naquele mes (SEM_BONUS_COLETIVO).
  const entra = !f || typeof entraNoBonusColetivo !== 'function'
              || entraNoBonusColetivo(f.id, mdMesCorrente());
  const bruto = (devBatida?.bonus || 0) + (acBatida?.bonus || 0);
  return { un, ac, devBatida, devProx, acBatida, acProx, entra, bonus: entra ? bruto : 0, bonusSeEntrasse: bruto };
}

// Comissao de vendedor: a curva de 80 un e fonte unica em core.js. Atendente que
// vende device entra pelo atKey e ganha R$25/un flat, sem curva -- mesma regra
// de calcComissaoFunc(), pra tela e folha nao divergirem.
function mdComissaoVendedor(aparelhos){
  const chave = meuPerfil && meuPerfil.vo_key;
  const ehVoOficial = !!(chave && typeof VO_KEYS !== 'undefined' && VO_KEYS.includes(chave));
  if(ehVoOficial) return comissaoVendedor(aparelhos);
  return aparelhos * VO_CURVA.base;
}

function renderMeuDia(){
  if(!mdCarregado){
    return UI.card({ corpo: UI.vazio({ titulo:'Carregando…', texto:'Buscando os seus números do mês.' }) });
  }
  if(mdErro){
    return UI.card({ corpo: UI.vazio({
      titulo:'Não consegui carregar', texto:'Tente atualizar. Se continuar, avise o Breno. ('+UI.esc(mdErro)+')',
      acao: UI.btn('Tentar de novo', {onclick:'recarregarMeuDia()', variante:'primario'}) }) });
  }

  const r    = mdResumo || {};
  const mes  = mdMesVisto();
  const nome = (meuPerfil && meuPerfil.nome) || '';
  const cong = mdEhCorrente() ? null : mdFolhaDoMes(mes);

  // ⚠️ A FONTE MUDA COM O MES. Corrente vem da view (previsao, recalcula);
  // fechado vem de folha_mensal (congelado, e o que foi pago). Nunca o
  // contrario -- ver o comentario do topo do arquivo.
  const aparelhos  = cong ? Number(cong.aparelhos   || 0) : Number(r.aparelhos_vendidos || 0);
  const acessBruto = cong ? Number(cong.acess_bruto || 0) : Number(r.acess_bruto || 0);
  const acessLucro = cong ? Number(cong.acess_lucro || 0) : Number(r.acess_lucro || 0);
  // Attach: no mes fechado a folha nao guarda "quantas atendi ao todo", entao
  // sai da propria lista de vendas, que e fato e nao conta.
  const atendidas  = cong ? (mdVendas || []).filter(v => v.fui_atendente).length
                          : Number(r.vendas_atendidas || 0);
  const comAcess   = cong ? (mdVendas || []).filter(v => v.fui_atendente && Number(v.acess_bruto || 0) > 0).length
                          : Number(r.vendas_com_acessorio || 0);

  const commVo = cong ? Number(cong.comissao_vendedor  || 0) : (mdTemVo() ? mdComissaoVendedor(aparelhos) : 0);
  const commAt = cong ? Number(cong.comissao_atendente || 0) : (mdTemAt() ? acessLucro * 0.25 : 0);
  const rede   = mdMetaRede();
  const bonusCol = cong ? Number(cong.bonus_coletivo || 0) : (rede ? rede.bonus : 0);
  // O herói de comissão saiu a pedido do dono (17/ago): repetia o que os cards
  // de baixo já dizem. Cada parcela mora onde ela nasce -- aparelho no card de
  // aparelhos, acessório no de acessórios, meta do time no card da meta.

  // -- Lado vendedor
  let blocoVo = '';
  if(mdTemVo()){
    const prox = mdProximaFaixaVo(aparelhos);
    blocoVo = UI.card({
      titulo:'Aparelhos vendidos',
      corpo: UI.kpis([
        { rotulo:'No mês',     valor:String(aparelhos) },
        { rotulo:'Comissão',   valor:brl(commVo), tom:'ok' },
        { rotulo:'Por aparelho', valor:brl(aparelhos >= VO_CURVA.corte ? VO_CURVA.bonus : VO_CURVA.base) },
      ]) + (prox ? `<div class="md-meta">
          ${UI.barra(Math.min(100, aparelhos / VO_CURVA.corte * 100), 'marca')}
          <span class="md-meta-txt">${prox}</span>
        </div>` : '')
    });
  }

  // -- Lado atendente
  let blocoAt = '';
  if(mdTemAt()){
    const meta   = metaAtendente(acessBruto, mes);
    const attach = atendidas > 0 ? Math.round(comAcess / atendidas * 100) : 0;
    blocoAt = UI.card({
      titulo:'Acessórios',
      sub: `${atendidas} venda${atendidas===1?'':'s'} atendida${atendidas===1?'':'s'}`,
      corpo: UI.kpis([
        { rotulo:'Levaram acessório', valor:attach+'%', sub:`${comAcess} de ${atendidas}`,
          tom: attach >= 70 ? 'ok' : attach >= 40 ? 'alerta' : 'critico' },
        { rotulo:'Vendido em acessório', valor:brl(acessBruto) },
        { rotulo:'Comissão (25%)', valor:brl(commAt), tom:'ok' },
      ]) + `<div class="md-meta">
        ${UI.barra(meta.prox ? Math.min(100, acessBruto / meta.prox * 100) : 100, meta.maxima ? 'ok' : 'marca')}
        <span class="md-meta-txt">${meta.maxima
          ? `Meta máxima batida — bônus de ${brl(meta.bonus)}.`
          : meta.prox
            ? `Faltam ${brl(meta.falta)} pra faixa de ${brl(meta.prox)} (bônus ${brl(meta.proxBonus)}).`
            : ''}</span>
      </div>` + mdBaseDaConta(acessBruto, acessLucro, commAt)
    });
  }

  const tabela = mdCardVendas();

  const ant = mdMesVizinho(-1), prox = mdMesVizinho(1);
  const seta = (ym, txt, titulo) => ym
    ? `<button class="md-seta" onclick="mdVerMes('${ym}')" title="${titulo}">${txt}</button>`
    : `<span class="md-seta off">${txt}</span>`;

  // Mes fechado ganha selo e botao de documento. O corrente nao tem documento:
  // ele ainda vai mudar, e papel com numero que muda vira discussao depois.
  const selo = cong
    ? UI.badge('fechado · já pago', 'ok')
    : UI.badge('em andamento', 'marca');
  const baixar = cong
    ? UI.btn('📄 Baixar meu fechamento', {onclick:'mdDocumento()', variante:'primario', sm:true})
    : '';

  const avisoNaoCongelado = (!cong && !mdEhCorrente())
    ? UI.card({ corpo: UI.vazio({ titulo:'Este mês não foi fechado',
        texto:'Os números só aparecem depois que o fechamento é congelado. Fale com o Breno.' }) })
    : '';

  return `<div class="md-tela">
    <div class="md-cabecalho">
      <span class="md-ola">Olá${nome ? ', '+UI.esc(nome.split(' ')[0]) : ''}</span>
      <span class="md-mes-nav">
        ${seta(ant, '‹', ant ? 'Ver '+mdRotuloMes(ant) : '')}
        <span class="md-mes">${mdRotuloMes(mes)}</span>
        ${seta(prox, '›', prox ? 'Ver '+mdRotuloMes(prox) : '')}
      </span>
    </div>
    <div class="md-selo-linha">${selo}${baixar}</div>
    ${avisoNaoCongelado}
    ${(cong || mdEhCorrente()) ? `${blocoVo}${blocoAt}${mdCardMetaRede(rede)}${tabela}` : ''}
    ${mdCardFechados()}
    <div class="md-rodape">${cong
      ? 'Mês fechado não muda de valor. Estes são os números do fechamento que foi pago.'
      : 'Fecha no fim do mês. Número da folha é o do Breno — se não bater, fale com ele.'}</div>
  </div>`;
}

// A pessoa precisa conseguir refazer a conta dos 25% sozinha. Comissao que nao
// se confere vira desconfianca -- por isso a base aparece, agregada (decisao do
// dono em 17/ago). Nunca item a item: ai seria custo de produto.
function mdBaseDaConta(bruto, lucro, comissao){
  if(!podeVerBaseComissao()) return '';
  return `<div class="md-conta">
    <span class="md-conta-rot">Como chega nesse valor</span>
    <span class="md-conta-linha">Vendido em acessórios <b>${brl(bruto)}</b></span>
    <span class="md-conta-linha">Menos o que custou, sobra <b>${brl(lucro)}</b></span>
    <span class="md-conta-linha">25% disso é a sua comissão: <b>${brl(comissao)}</b></span>
  </div>`;
}

// -- Minhas vendas, por dia --------------------------------------------------
// Agrupado por dia com total, a pedido do dono (17/ago). Lista corrida de 50
// linhas nao responde a pergunta que ele faz -- "como foi terça?" --, e o
// total do dia e o numero que a pessoa compara com a memoria dela.
let mdFiltroLoja = 'todas';
let mdFiltroDia  = 'todos';

function setMdLoja(l){ mdFiltroLoja = l; if(currentTab==='meudia') renderContent(); }
function setMdDia(d){  mdFiltroDia  = d; if(currentTab==='meudia') renderContent(); }

// 'YYYY-MM-DD' em BRT -- a chave do agrupamento. Usa o mesmo deslocamento do
// resto do painel; dia de venda e dia da loja, nao UTC.
function mdChaveDia(iso){
  if(!iso) return '';
  const d = new Date(iso);
  const brt = new Date(d.getTime() - 3*60*60*1000);
  return brt.toISOString().slice(0,10);
}

function mdVendasFiltradas(){
  return (mdVendas || []).filter(v =>
    (mdFiltroLoja === 'todas' || (v.loja || '') === mdFiltroLoja) &&
    (mdFiltroDia  === 'todos' || mdChaveDia(v.data_saida) === mdFiltroDia));
}

// ---------------------------------------------------------------------------
// O QUE ESTA VENDA ME DEU
//
// Pedido do dono (20/ago): na lista, o valor da venda nao e o numero da pessoa
// -- um iPhone de R$7 mil no nome dela nao e dinheiro dela. O numero dela e a
// comissao. Duas comissoes muito diferentes, e so uma cabe por venda:
//
//   VENDEDOR   aparelho x taxa. Conta que nao usa custo nenhum -> exata, por
//              venda, e a soma do mes fecha com a curva de core.js.
//   ATENDENTE  25% do LUCRO de acessorio. Por venda seria custo por item, que
//              e o que o dono fechou em 17/ago. Fica no RESUMO DO DIA (medido:
//              por venda o custo de um item vaza em 19% dos casos; por dia, em
//              4,8%). Na linha da venda entra o que ela VENDEU de acessorio --
//              preco, nao custo, e informacao que ela ja tem.
// ---------------------------------------------------------------------------

// A comissao de cada venda e o quanto ela ACRESCENTOU no acumulado do mes --
// mesma tecnica do .xlsx do fechamento. E o que faz a 81a unidade aparecer
// valendo R$35 sem inventar uma segunda regra.
function mdComissaoPorVenda(){
  const map = {};
  let acum = 0;
  (mdVendas || []).slice()
    .sort((a, b) => String(a.data_saida).localeCompare(String(b.data_saida)))
    .forEach(v => {
      if(!v.fui_vendedor) return;
      const un = Number(v.aparelhos || 0);
      if(!un) return;
      const antes = mdComissaoVendedor(acum);
      acum += un;
      map[v.id] = mdComissaoVendedor(acum) - antes;
    });
  return map;
}

// brl() escreve "R$-3" quando o numero e negativo. Desde 20/ago o BRINDE nao
// desconta mais (ehBrinde em core.js), mas negativo ainda acontece: acessorio
// vendido ABAIXO do custo e uma venda de verdade e continua descontando. O
// numero e verdade e fica -- so escrito como gente escreve.
function mdBrlSinal(v){
  return v < 0 ? '−' + brl(-v) : brl(v);
}

function mdDiaInfo(chave){
  return (mdDias || []).find(d => String(d.dia).slice(0,10) === chave) || null;
}

// Acessorio da venda so conta pra quem ATENDEU: a view traz o acessorio da
// venda inteira, e numa venda que eu so vendi o acessorio e de outra pessoa.
function mdAcessDaVenda(v){
  return v.fui_atendente ? Number(v.acess_bruto || 0) : 0;
}

function mdCardVendas(){
  const todas = mdVendas || [];
  const dias  = [...new Set(todas.map(v => mdChaveDia(v.data_saida)))].sort().reverse();
  const lojas = [...new Set(todas.map(v => v.loja).filter(Boolean))];
  const vs    = mdVendasFiltradas();

  // Agrupa preservando a ordem (a carga ja vem por data desc).
  const comissao = mdComissaoPorVenda();
  const grupos = [];
  const porDia = {};
  vs.forEach(v => {
    const k = mdChaveDia(v.data_saida);
    if(!porDia[k]){ porDia[k] = { dia:k, itens:[], comVo:0, acess:0, un:0 }; grupos.push(porDia[k]); }
    const g = porDia[k];
    g.itens.push(v);
    g.comVo  += comissao[v.id] || 0;
    g.acess  += mdAcessDaVenda(v);
    g.un     += v.fui_vendedor ? Number(v.aparelhos || 0) : 0;
  });

  const chip = (txt, ativo, on) => UI.chip(txt, ativo, on);
  const filtros = UI.toolbar(
    chip('Todas as lojas', mdFiltroLoja === 'todas', "setMdLoja('todas')"),
    ...lojas.map(l => chip(l === 'urban' ? 'Urban' : 'Cart', mdFiltroLoja === l, `setMdLoja('${l}')`)),
    UI.sep(),
    UI.select({ id:'md-dia', valor:mdFiltroDia, extra:'onchange="setMdDia(this.value)"',
      opcoes:[{v:'todos', t:'Todos os dias'}, ...dias.map(d => ({v:d, t:mdRotuloDia(d)}))] })
  );

  const corpo = grupos.length ? grupos.map(g => {
    const d = mdDiaInfo(g.dia);
    // ⚠️ A parte de acessorio do resumo vem da VIEW (dia inteiro), a de
    // aparelho vem das linhas listadas. Com filtro de loja ligado os dois
    // deixariam de falar do mesmo conjunto -- por isso o resumo e sempre do
    // dia inteiro, e o card avisa quando ha filtro.
    const comAt = (mdTemAt() && d) ? Number(d.acess_lucro || 0) * 0.25 : 0;
    const comDia = g.comVo + comAt;
    const contexto = [
      g.itens.length + ' venda' + (g.itens.length === 1 ? '' : 's'),
      mdTemVo() && g.un ? g.un + ' aparelho' + (g.un === 1 ? '' : 's') : '',
      mdTemAt() && d && Number(d.acess_bruto) ? brl(Number(d.acess_bruto)) + ' em acessórios' : '',
    ].filter(Boolean).join(' · ');

    return `
    <div class="md-dia">
      <div class="md-dia-cab">
        <span class="md-dia-nome">${mdRotuloDia(g.dia)}</span>
        <span class="md-dia-meta">${contexto}</span>
        <span class="md-dia-total${comDia < 0 ? ' neg' : ''}" title="${comDia < 0
          ? 'Acessório vendido abaixo do custo — brinde não desconta, venda no prejuízo sim.'
          : 'A sua comissão deste dia'}">${mdBrlSinal(comDia)}</span>
      </div>
      ${g.itens.map(v => `<div class="md-venda">
        <span class="md-venda-cliente">${UI.esc(v.cliente_nome || 'Sem nome')}</span>
        <span class="md-venda-tags">
          ${UI.badge(v.loja === 'urban' ? 'Urban' : 'Cart', v.loja === 'urban' ? 'alerta' : 'marca')}
          ${mdTemVo() && mdTemAt() ? `<span class="md-venda-papel">${mdPapelNaVenda(v)}</span>` : ''}
        </span>
        ${mdValorDaVenda(v, comissao)}
      </div>`).join('')}
    </div>`; }).join('')
  : UI.vazio({
      titulo: (mdFiltroLoja !== 'todas' || mdFiltroDia !== 'todos')
        ? 'Nenhuma venda com esse filtro' : 'Nenhuma venda ainda neste mês',
      texto: (mdFiltroLoja !== 'todas' || mdFiltroDia !== 'todos')
        ? 'Tire o filtro pra ver o mês inteiro.'
        : 'Venda registrada com o seu nome na observação aparece aqui.',
    });

  const comFiltro = mdFiltroLoja !== 'todas' || mdFiltroDia !== 'todos';
  const nota = comFiltro && grupos.length
    ? `<div class="md-nota">Com filtro ligado, o total de cada dia continua sendo o do dia inteiro.</div>`
    : '';

  return UI.card({
    titulo:'Minhas vendas',
    sub: `${vs.length} venda${vs.length === 1 ? '' : 's'} · o valor de cada dia é a sua comissão`,
    corpo: filtros + nota + `<div class="md-dias">${corpo}</div>`
  });
}

// O numero da LINHA. Vendedor tem comissao exata por venda; atendente ve o que
// vendeu de acessorio ali (a comissao dele fecha no dia, no cabecalho).
function mdValorDaVenda(v, comissao){
  const com = comissao[v.id] || 0;
  if(v.fui_vendedor && com)
    return `<span class="md-venda-valor">${brl(com)}</span>`;
  const ac = mdAcessDaVenda(v);
  if(ac)
    return `<span class="md-venda-valor">${brl(ac)} <i class="md-venda-uni">acess.</i></span>`;
  // Venda que nao rendeu nada pra pessoa e informacao, nao buraco: e o outro
  // lado do attach rate que o card de cima mostra.
  return `<span class="md-venda-valor md-venda-zero">—</span>`;
}

// "seg, 11/08" — o dia da semana ajuda mais que o número quando a pessoa está
// lembrando de como foi a semana dela.
const MD_SEMANA = ['dom','seg','ter','qua','qui','sex','sáb'];
function mdRotuloDia(chave){
  if(!chave) return '—';
  const [a,m,d] = chave.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m-1, d));
  return `${MD_SEMANA[dt.getUTCDay()]}, ${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')}`;
}

// -- Meses fechados ----------------------------------------------------------
// Vem de `folha_mensal`, congelado. NUNCA recalculado aqui: o mapa de apelidos
// de 17/ago resgatou atendimentos que o codigo antigo perdia, entao recalcular
// mes pago daria um numero diferente do que a pessoa recebeu -- e ela veria a
// tela discordar do proprio extrato.
function mdCardFechados(){
  if(!mdFolha.length) return '';
  const linhas = mdFolha.map(f => {
    const partes = [];
    if(Number(f.comissao_vendedor))  partes.push(`${brl(f.comissao_vendedor)} aparelho`);
    if(Number(f.comissao_atendente)) partes.push(`${brl(f.comissao_atendente)} acessório`);
    if(Number(f.bonus_meta))         partes.push(`${brl(f.bonus_meta)} meta`);
    if(Number(f.bonus_coletivo))     partes.push(`${brl(f.bonus_coletivo)} time`);
    if(Number(f.bonus_extra))        partes.push(`${brl(f.bonus_extra)} extra`);
    return [
      { v:`<a href="#" onclick="mdVerMes('${f.mes}');return false">${mdRotuloMes(f.mes)}</a>` },
      partes.join(' · ') || '—',
      { v: brl(f.total_variavel), num:true },
    ];
  });
  return UI.card({
    titulo:'Meses fechados',
    sub:'já pagos',
    flush:true,
    corpo: UI.tabela({
      colunas:[{titulo:'Mês'},{titulo:'Composição'},{titulo:'Total', num:true}],
      linhas,
    }) + `<div class="md-rodape" style="text-align:left;padding:10px 14px 4px">
      Mês fechado não muda de valor. Clique no mês para abrir o detalhe e baixar o documento.
    </div>`
  });
}

function mdLinhaComposicao(commVo, commAt, bonusCol){
  const p = [];
  if(mdTemVo()) p.push(`${brl(commVo)} de aparelho`);
  if(mdTemAt()) p.push(`${brl(commAt)} de acessório`);
  if(bonusCol)  p.push(`${brl(bonusCol)} de meta do time`);
  return p.join(' + ') || 'Sem comissão neste mês ainda.';
}

// -- Meta do time ------------------------------------------------------------
// A barra sozinha nao muda comportamento; o que muda e "faltam N". E aqui o
// "faltam" vale pra TODO MUNDO ao mesmo tempo, que e o ponto de uma meta
// coletiva -- por isso ela aparece na tela de cada um.
function mdCardMetaRede(rede){
  if(!rede) return '';
  const pct = (v, alvo) => alvo ? Math.min(100, v / alvo * 100) : 100;

  // "pra cada um" é promessa. Pra quem está fora do rateio no mês, quem recebe
  // é o time — não ela.
  const cada = rede.entra ? 'pra cada um' : 'pra cada um do rateio';
  const linhaDev = rede.devProx
    ? `Faltam <b>${rede.devProx.qt - rede.un}</b> aparelhos pro time liberar ${brl(rede.devProx.bonus)} ${cada}.`
    : `Faixa máxima batida — ${brl(rede.devBatida ? rede.devBatida.bonus : 0)} ${cada}.`;
  const linhaAc = rede.acProx
    ? `Faltam <b>${brl(rede.acProx.val - rede.ac)}</b> em acessório pro time liberar ${brl(rede.acProx.bonus)}.`
    : `Faixa máxima batida — ${brl(rede.acBatida ? rede.acBatida.bonus : 0)} ${cada}.`;

  // ⚠️ O aviso NÃO pode depender de já haver faixa batida. Até 20/ago/2026 ele
  // só aparecia com `bonusSeEntrasse > 0` — e no começo do mês, quando nenhuma
  // faixa caiu ainda, quem está de férias lia "faltam 132 aparelhos pro time
  // liberar R$600 pra cada um" como se fosse com ela. Promessa que a folha não
  // vai cumprir é pior que número nenhum. Vem no TOPO do card: o motivo tem que
  // ser lido antes dos números, não depois.
  const aviso = !rede.entra
    ? `<div class="md-aviso">Você está fora do rateio deste mês (férias/afastamento)${
         rede.bonusSeEntrasse ? `, então ${brl(rede.bonusSeEntrasse)} não entram na sua conta` : ''
       }. A meta do time abaixo é do time — ela não entra na sua conta neste mês.</div>`
    : '';

  // 5% do lucro de acessórios da REDE: e lucro de terceiros, nao da pra mandar
  // pro navegador de ninguem. Some no fechamento -- dizer isso e melhor que
  // mostrar um total que a pessoa vai descobrir incompleto no dia do pagamento.
  const f = mdFunc();
  const extra = (f && f.bonus)
    ? `<div class="md-conta-linha" style="margin-top:8px">Você também recebe <b>5% do lucro de acessórios da rede</b>. Esse valor não aparece aqui — sai no fechamento do mês.</div>`
    : '';

  return UI.card({
    titulo:'Meta do time',
    sub: mdRotuloMes(mdMesCorrente()),
    corpo: `
      ${aviso}
      <div class="md-meta">
        <span class="md-meta-txt"><b>${rede.un}</b> aparelhos vendidos pela rede</span>
        ${UI.barra(pct(rede.un, rede.devProx ? rede.devProx.qt : rede.un), rede.devProx ? 'marca' : 'ok')}
        <span class="md-meta-txt">${linhaDev}</span>
      </div>
      <div class="md-meta" style="margin-top:16px">
        <span class="md-meta-txt"><b>${brl(rede.ac)}</b> vendidos em acessório pela rede</span>
        ${UI.barra(pct(rede.ac, rede.acProx ? rede.acProx.val : rede.ac), rede.acProx ? 'marca' : 'ok')}
        <span class="md-meta-txt">${linhaAc}</span>
      </div>
      ${rede.bonus ? `<div class="md-conta" style="margin-top:14px">
        <span class="md-conta-rot">Já garantido pra você</span>
        <span class="md-conta-linha">Meta do time até agora: <b>${brl(rede.bonus)}</b></span>
      </div>` : ''}
      ${extra}`
  });
}

function mdProximaFaixaVo(aparelhos){
  const chave = meuPerfil && meuPerfil.vo_key;
  if(!(chave && typeof VO_KEYS !== 'undefined' && VO_KEYS.includes(chave))) return '';
  if(aparelhos >= VO_CURVA.corte) return `Acima de ${VO_CURVA.corte} aparelhos — cada um vale ${brl(VO_CURVA.bonus)}.`;
  const faltam = VO_CURVA.corte - aparelhos;
  return `Faltam ${faltam} aparelho${faltam===1?'':'s'} pra cada próximo valer ${brl(VO_CURVA.bonus)} (hoje ${brl(VO_CURVA.base)}).`;
}

function mdPapelNaVenda(v){
  const p = [];
  if(v.fui_vendedor)  p.push('Vendi');
  if(v.fui_atendente) p.push('Atendi');
  return p.join(' · ') || '—';
}

function mdDia(iso){
  if(!iso) return '—';
  const d = new Date(iso);
  const brt = new Date(d.getTime() - 3*60*60*1000);
  return String(brt.getUTCDate()).padStart(2,'0') + '/' + String(brt.getUTCMonth()+1).padStart(2,'0');
}

const MD_MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
function mdRotuloMes(ym){
  const [a,m] = String(ym).split('-');
  return MD_MESES[Number(m)-1] + '/' + a;
}

// ---------------------------------------------------------------------------
// MEU FECHAMENTO — o documento que a pessoa baixa
//
// ⚠️ NAO e o PDF do socio (fechamento.js). Aquele nasce de fechamentoEquipe(),
// que precisa de custo e lucro de TODAS as vendas -- dado que nunca chega no
// navegador do colaborador, e nem deve. Este aqui e montado com o que ela ja
// tem na tela: a linha congelada dela em folha_mensal mais as proprias vendas.
//
// Mesmo caminho do PDF do socio: sem biblioteca, e o window.print() do
// navegador que vira arquivo. No iPhone sai pelo share sheet. O estilo do papel
// e o mesmo css/print.css -- por isso as classes fp-*.
//
// So existe pra MES FECHADO. Documento de mes que ainda muda vira discussao
// depois ("mas no papel estava outro numero").
// ---------------------------------------------------------------------------
function mdDocumento(){
  const mes = mdMesVisto();
  const f = mdFolhaDoMes(mes);
  if(!f) return;
  const nome = (meuPerfil && meuPerfil.nome) || f.nome || '';

  const linhas = [];
  const add = (rot, val, de) => { if(Number(val)) linhas.push([rot, Number(val), de]); };
  add('Comissão de vendedor', f.comissao_vendedor,
      `${f.aparelhos} aparelho${Number(f.aparelhos)===1?'':'s'} vendidos no mês`);
  add('Comissão de atendente', f.comissao_atendente,
      `25% do lucro dos acessórios das vendas que você atendeu`);
  add('Bônus de meta individual', f.bonus_meta,
      `${brl(f.acess_bruto)} de acessório no mês`);
  add('Bônus de meta coletiva', f.bonus_coletivo, 'metas da loja, pago cheio para cada pessoa');
  add('Bônus extra', f.bonus_extra, '5% do lucro de acessórios da loja no mês');

  const resumo = UI.tabela({
    colunas:[{titulo:'Item'},{titulo:'Valor', num:true, largura:'110px'},{titulo:'De onde vem'}],
    linhas: linhas.map(([rot,val,de]) =>
      [rot, {v:brl(val), num:true}, {v:`<span class="fp-nota">${UI.esc(de)}</span>`}]),
  });

  const minhas = (mdVendas || []).slice()
    .sort((a,b) => String(b.data_saida).localeCompare(String(a.data_saida)));
  const comissao = mdComissaoPorVenda();
  const vendas = minhas.length ? UI.tabela({
    colunas:[{titulo:'Data'},{titulo:'Cliente'},{titulo:'Loja'},{titulo:'Meu papel'},
             {titulo:'Acessórios', num:true},{titulo:'Comissão', num:true}],
    linhas: minhas.map(v => [
      mdDia(v.data_saida), UI.esc(v.cliente_nome || '—'),
      v.loja === 'urban' ? 'Urban' : 'Cart', mdPapelNaVenda(v),
      {v: mdAcessDaVenda(v) ? brl(mdAcessDaVenda(v)) : '—', num:true},
      {v: comissao[v.id] ? brl(comissao[v.id]) : '—', num:true},
    ]),
  }) + `<div class="fp-nota">A comissão de atendente não cabe por venda — ela é 25% do lucro
        do acessório, e o lucro fecha no mês. Por isso a coluna Comissão só tem número nas
        vendas em que você foi o vendedor.</div>` : '<div class="fp-nota">Sem vendas no mês.</div>';

  const doc = `<div class="fp-overlay">
    <div class="fp-bar">
      <span class="fp-bar-tit">Meu fechamento de ${mdRotuloMes(mes)} — use Imprimir para salvar em PDF</span>
      <span class="fp-bar-acoes">
        ${UI.btn('🖨 Imprimir / PDF', {onclick:'window.print()', variante:'primario', sm:true})}
        ${UI.btn('Fechar', {onclick:'mdFecharDoc()', sm:true})}
      </span>
    </div>
    <div class="fp-doc"><div class="fp-pagina">
      <div class="fp-cab">
        <div>
          <div class="fp-cab-nome">${UI.esc(nome)}</div>
          <div class="fp-cab-sub">Fechamento de ${mdRotuloMes(mes)} · congelado em ${mdDia(f.fechado_em)}</div>
        </div>
        <div class="fp-cab-mes">Phone Cart · Urban<br>documento do colaborador</div>
      </div>
      <div class="fp-total">
        <span class="fp-total-rot">Total variável</span>
        <span class="fp-total-val">${brl(f.total_variavel)}</span>
      </div>
      <div class="fp-sec"><div class="fp-sec-tit">O que entra nesse valor</div>${resumo}</div>
      <div class="fp-sec"><div class="fp-sec-tit">Minhas vendas do mês — ${minhas.length}</div>${vendas}</div>
      <div class="fp-rodape">Este é o fechamento congelado: ele não muda de valor depois de pago.
        O salário fixo não entra aqui — este documento é só a parte variável.</div>
    </div></div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', doc);
}
function mdFecharDoc(){ document.querySelector('.fp-overlay')?.remove(); }

async function recarregarMeuDia(){
  mdCarregado = false;
  if(currentTab === 'meudia') renderContent();
  await carregarMeuDia();
  if(currentTab === 'meudia') renderContent();
}
