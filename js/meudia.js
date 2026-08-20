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
// ⚠️ SO O MES CORRENTE, de proposito. O mapa de apelidos de 17/ago resgatou
// atendimentos que o codigo antigo perdia (typos de "vitinho"), entao mes
// fechado recalculado por aqui daria um numero diferente do que a folha pagou.
// Historico so depois do snapshot da folha (docs/PLANO-UPGRADE-2026-08.md §2.2).
// ============================================================================

let mdResumo = null;      // linha de v_minha_comissao_mes do mes corrente
let mdVendas = [];        // v_minhas_vendas do mes corrente
let mdRede   = null;      // linha de v_meta_rede_mes -- total da rede, sem nome
let mdFolha  = [];        // folha_mensal -- meses JA FECHADOS, congelados
let mdCarregado = false;
let mdErro = '';

// 'YYYY-MM' do mes corrente em BRT. Nao usa currentPeriod: esta tela e sempre
// "o meu mes", e o seletor de periodo nem aparece pra quem so tem esta aba.
function mdMesCorrente(){
  const d = new Date();
  const brt = new Date(d.getTime() - 3*60*60*1000);
  return brt.getUTCFullYear() + '-' + String(brt.getUTCMonth()+1).padStart(2,'0');
}

function mdTemVo(){ return !!(meuPerfil && meuPerfil.vo_key); }
function mdTemAt(){ return !!(meuPerfil && meuPerfil.at_key); }

async function carregarMeuDia(){
  mdErro = '';
  const mes = mdMesCorrente();
  try{
    const [resumo, vendas, rede, folha] = await Promise.all([
      sbGet('v_minha_comissao_mes', `mes=eq.${mes}`, 1),
      sbGet('v_minhas_vendas', `data_saida=gte.${mes}-01&order=data_saida.desc`, 500),
      sbGet('v_meta_rede_mes', `mes=eq.${mes}`, 1),
      // Mes fechado NAO se recalcula: vem congelado de folha_mensal, gravado
      // por scripts/folha-snapshot.js rodando o fechamentoEquipe() real.
      sbGet('folha_mensal', `mes=lt.${mes}&order=mes.desc`, 12),
    ]);
    mdResumo = (resumo && resumo[0]) || null;
    mdVendas = vendas || [];
    mdRede   = (rede && rede[0]) || null;
    mdFolha  = folha || [];
  }catch(e){
    console.warn('[meudia] carga falhou:', e.message);
    mdErro = e.message || 'falha ao carregar';
    mdResumo = null; mdVendas = []; mdRede = null; mdFolha = [];
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
  const mes  = mdMesCorrente();
  const nome = (meuPerfil && meuPerfil.nome) || '';

  const aparelhos  = Number(r.aparelhos_vendidos || 0);
  const atendidas  = Number(r.vendas_atendidas   || 0);
  const comAcess   = Number(r.vendas_com_acessorio || 0);
  const acessBruto = Number(r.acess_bruto || 0);
  const acessLucro = Number(r.acess_lucro || 0);

  const commVo = mdTemVo() ? mdComissaoVendedor(aparelhos) : 0;
  const commAt = mdTemAt() ? acessLucro * 0.25 : 0;
  const rede   = mdMetaRede();
  const bonusCol = rede ? rede.bonus : 0;
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
    const meta   = metaAtendente(acessBruto);
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

  return `<div class="md-tela">
    <div class="md-cabecalho">
      <span class="md-ola">Olá${nome ? ', '+UI.esc(nome.split(' ')[0]) : ''}</span>
      <span class="md-mes">${mdRotuloMes(mes)}</span>
    </div>
    ${blocoVo}${blocoAt}${mdCardMetaRede(rede)}${mdCardFechados()}${tabela}
    <div class="md-rodape">Fecha no fim do mês. Número da folha é o do Breno — se não bater, fale com ele.</div>
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

function mdCardVendas(){
  const todas = mdVendas || [];
  const dias  = [...new Set(todas.map(v => mdChaveDia(v.data_saida)))].sort().reverse();
  const lojas = [...new Set(todas.map(v => v.loja).filter(Boolean))];
  const vs    = mdVendasFiltradas();

  // Agrupa preservando a ordem (a carga ja vem por data desc).
  const grupos = [];
  const porDia = {};
  vs.forEach(v => {
    const k = mdChaveDia(v.data_saida);
    if(!porDia[k]){ porDia[k] = { dia:k, itens:[], total:0 }; grupos.push(porDia[k]); }
    porDia[k].itens.push(v);
    porDia[k].total += Number(v.valor_total || 0);
  });

  const chip = (txt, ativo, on) => UI.chip(txt, ativo, on);
  const filtros = UI.toolbar(
    chip('Todas as lojas', mdFiltroLoja === 'todas', "setMdLoja('todas')"),
    ...lojas.map(l => chip(l === 'urban' ? 'Urban' : 'Cart', mdFiltroLoja === l, `setMdLoja('${l}')`)),
    UI.sep(),
    UI.select({ id:'md-dia', valor:mdFiltroDia, extra:'onchange="setMdDia(this.value)"',
      opcoes:[{v:'todos', t:'Todos os dias'}, ...dias.map(d => ({v:d, t:mdRotuloDia(d)}))] })
  );

  const corpo = grupos.length ? grupos.map(g => `
    <div class="md-dia">
      <div class="md-dia-cab">
        <span class="md-dia-nome">${mdRotuloDia(g.dia)}</span>
        <span class="md-dia-meta">${g.itens.length} venda${g.itens.length===1?'':'s'}</span>
        <span class="md-dia-total">${brl(g.total)}</span>
      </div>
      ${g.itens.map(v => `<div class="md-venda">
        <span class="md-venda-cliente">${UI.esc(v.cliente_nome || 'Sem nome')}</span>
        <span class="md-venda-tags">
          ${UI.badge(v.loja === 'urban' ? 'Urban' : 'Cart', v.loja === 'urban' ? 'alerta' : 'marca')}
          ${mdTemVo() && mdTemAt() ? `<span class="md-venda-papel">${mdPapelNaVenda(v)}</span>` : ''}
        </span>
        <span class="md-venda-valor">${brl(Number(v.valor_total || 0))}</span>
      </div>`).join('')}
    </div>`).join('')
  : UI.vazio({
      titulo: (mdFiltroLoja !== 'todas' || mdFiltroDia !== 'todos')
        ? 'Nenhuma venda com esse filtro' : 'Nenhuma venda ainda neste mês',
      texto: (mdFiltroLoja !== 'todas' || mdFiltroDia !== 'todos')
        ? 'Tire o filtro pra ver o mês inteiro.'
        : 'Venda registrada com o seu nome na observação aparece aqui.',
    });

  const totalFiltrado = vs.reduce((a,v) => a + Number(v.valor_total || 0), 0);

  return UI.card({
    titulo:'Minhas vendas',
    sub: `${vs.length} · ${brl(totalFiltrado)}`,
    corpo: filtros + `<div class="md-dias">${corpo}</div>`
  });
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
      mdRotuloMes(f.mes),
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
      Mês fechado não muda de valor. Estes números são os do fechamento que foi pago.
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

async function recarregarMeuDia(){
  mdCarregado = false;
  if(currentTab === 'meudia') renderContent();
  await carregarMeuDia();
  if(currentTab === 'meudia') renderContent();
}
