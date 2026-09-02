// ============================================================================
// FOLHA (RH) — a tela da Nara
//
// ⚠️ ELA NÃO CALCULA NADA. Lê a `folha_mensal`, que já está congelada.
//
// Esse é o ponto inteiro da tela. A aba Equipe mostra a mesma folha, mas
// CALCULANDO no navegador — e pra isso precisa de todas as vendas e de todos os
// `venda_produtos`, incluindo `valor_estoque`, que é o custo do aparelho. Dar
// Equipe pra uma pessoa de fora seria abrir o custo do estoque inteiro; a tela
// esconderia, a API não.
//
// Aqui o dado que chega já é só folha. Não existe número da loja pra vazar
// porque ele nunca é buscado — e o RLS (`eh_rh()`) garante isso do lado de lá,
// não é este arquivo que protege.
//
// Por isso também os valores usam `brl()` direto, sem `money()`: o interruptor
// de dinheiro existe pra telas que MISTURAM dinheiro que pode e dinheiro que
// não pode. Esta não mistura — tudo que ela renderiza é folha.
//
// Somente leitura, por decisão do dono (02/set/2026). Nada de gravar.
// ============================================================================

let rhMes = null;          // 'YYYY-MM' escolhido; null = o mais recente
let rhFolha = [];          // linhas de folha_mensal (todos os meses)
let rhSalarios = [];       // custos da area Funcionarios (o RLS já filtra)
let rhPix = {};            // funcionarios_config: id -> pix
let rhCarregado = false;
let rhErro = '';

async function carregarRh(){
  rhErro = '';
  try{
    const [folha, custos, cfg] = await Promise.all([
      sbGet('folha_mensal', 'order=mes.desc,total_variavel.desc', 500),
      // ⚠️ Sem filtro de área aqui de propósito: quem filtra é a POLICY
      // (`custos_rh`). Se um dia o filtro sumir do banco, o bug tem que
      // aparecer no teste de RLS, não ficar escondido atrás de um `and` no JS.
      sbGet('custos', 'order=data.desc', 2000),
      sbGet('funcionarios_config', 'select=id,pix', 200).catch(() => []),
    ]);
    rhFolha = folha || [];
    rhSalarios = custos || [];
    rhPix = {};
    (cfg || []).forEach(c => { if(c.pix) rhPix[c.id] = c.pix; });
  }catch(e){
    console.warn('[rh] carga falhou:', e.message);
    rhErro = e.message || 'falha ao carregar';
    rhFolha = []; rhSalarios = []; rhPix = {};
  }
  rhCarregado = true;
}

function rhMeses(){
  return [...new Set(rhFolha.map(f => f.mes))].sort().reverse();
}
function rhMesVisto(){
  const ms = rhMeses();
  return (rhMes && ms.includes(rhMes)) ? rhMes : (ms[0] || null);
}
function setRhMes(m){ rhMes = m; if(currentTab === 'rhfolha') renderContent(); }

// Salário da pessoa no mês: soma dos lançamentos de Custos da área Funcionários
// com o `funcionario` dela. Mesma fonte que a folha do sócio usa — não há uma
// segunda tabela de salário, e não pode haver.
function rhSalarioDe(funcId, mes){
  return (rhSalarios || [])
    .filter(c => c.funcionario === funcId && String(c.data || '').slice(0,7) === mes)
    .reduce((a,c) => a + parseFloat(c.valor || 0), 0);
}

// Lançamentos da área Funcionários SEM pessoa marcada (bônus agregados, por
// exemplo). Aparecem à parte porque não cabem na linha de ninguém — e some-los
// no total de alguém seria inventar.
function rhSemPessoa(mes){
  return (rhSalarios || []).filter(c =>
    !c.funcionario && String(c.data || '').slice(0,7) === mes);
}

function renderRhFolha(){
  if(!rhCarregado)
    return UI.card({ corpo: UI.vazio({ titulo:'Carregando…', texto:'Buscando a folha.' }) });
  if(rhErro)
    return UI.card({ corpo: UI.vazio({
      titulo:'Não consegui carregar',
      texto:'Tente atualizar. Se continuar, avise o Breno. ('+UI.esc(rhErro)+')',
      acao: UI.btn('Tentar de novo', {onclick:'recarregarRh()', variante:'primario'}) }) });

  const mes = rhMesVisto();
  if(!mes)
    return UI.card({ corpo: UI.vazio({
      titulo:'Nenhum mês fechado ainda',
      texto:'A folha aparece aqui depois que o mês é fechado pelo Breno.' }) });

  const linhas = rhFolha.filter(f => f.mes === mes);
  const semPessoa = rhSemPessoa(mes);

  let totSal = 0, totVar = 0;
  const corpo = linhas.map(f => {
    const sal = rhSalarioDe(f.func_id, mes);
    const varv = Number(f.total_variavel || 0);
    totSal += sal; totVar += varv;
    const comp = [
      Number(f.comissao_vendedor)  ? brl(f.comissao_vendedor)+' vendas'    : '',
      Number(f.comissao_atendente) ? brl(f.comissao_atendente)+' acessório': '',
      Number(f.bonus_meta)         ? brl(f.bonus_meta)+' meta'             : '',
      Number(f.bonus_coletivo)     ? brl(f.bonus_coletivo)+' time'         : '',
      Number(f.bonus_extra)        ? brl(f.bonus_extra)+' extra'           : '',
    ].filter(Boolean).join(' · ');
    return [
      UI.esc(f.nome || f.func_id),
      { v: sal ? brl(sal) : '—', num:true },
      { v: brl(varv), num:true },
      { v: `<b>${brl(sal + varv)}</b>`, num:true },
      { v: `<span class="rh-comp">${comp || '—'}</span>` },
      { v: `<span class="rh-pix">${UI.esc(rhPix[f.func_id] || '—')}</span>` },
    ];
  });

  const tabela = UI.tabela({
    colunas:[{titulo:'Pessoa'},{titulo:'Salário', num:true},{titulo:'Variável', num:true},
             {titulo:'Total', num:true},{titulo:'Composição do variável'},{titulo:'Pix'}],
    linhas: corpo.concat([[
      { v:'<b>TOTAL</b>' }, { v:`<b>${brl(totSal)}</b>`, num:true },
      { v:`<b>${brl(totVar)}</b>`, num:true }, { v:`<b>${brl(totSal+totVar)}</b>`, num:true },
      '', '',
    ]]),
  });

  const seletor = UI.toolbar(
    ...rhMeses().map(m => UI.chip(rhRotuloMes(m), m === mes, `setRhMes('${m}')`)),
    UI.sep(),
    UI.btn('⬇ Baixar planilha', {onclick:'rhExportar()', variante:'primario', sm:true}),
    UI.btn('🖨 Imprimir / PDF', {onclick:'window.print()', sm:true})
  );

  // Lançamentos sem pessoa: o total da área não fecha com a soma das linhas sem
  // eles, e não dizer isso faria a Nara procurar um erro que não existe.
  const extras = semPessoa.length ? UI.card({
    titulo:'Lançamentos sem pessoa marcada',
    sub:'entram no custo da área, não na linha de ninguém',
    corpo: UI.tabela({
      colunas:[{titulo:'Data'},{titulo:'Descrição'},{titulo:'Valor', num:true}],
      linhas: semPessoa.map(c => [
        rhData(c.data), UI.esc(c.descricao || '—'), { v: brl(c.valor), num:true },
      ]),
    })
  }) : '';

  return `<div class="rh-tela">
    <h2 class="rh-titulo">Folha — ${rhRotuloMes(mes)}</h2>
    ${seletor}
    ${UI.kpis([
      { rotulo:'Pessoas', valor: String(linhas.length) },
      { rotulo:'Salário fixo', valor: brl(totSal) },
      { rotulo:'Comissões e bônus', valor: brl(totVar) },
      { rotulo:'Total da folha', valor: brl(totSal + totVar), tom:'marca' },
    ])}
    ${UI.card({ titulo:'Por pessoa', flush:true, corpo: tabela })}
    ${extras}
    <div class="rh-rodape">Mês fechado não muda de valor. Esta tela é só leitura —
      lançamento e fechamento continuam com o Breno.</div>
  </div>`;
}

const RH_MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
function rhRotuloMes(ym){
  const [a,m] = String(ym).split('-');
  return RH_MESES[Number(m)-1] + '/' + a;
}
function rhData(d){
  if(!d) return '—';
  const [a,m,dia] = String(d).slice(0,10).split('-');
  return `${dia}/${m}`;
}

// Exportação: mesma biblioteca do fechamento do sócio, uma aba só. Ela pediu
// "exportar alguns documentos" e isso é o documento que ela precisa entregar.
function rhExportar(){
  const mes = rhMesVisto();
  if(!mes || typeof XLSX === 'undefined') return;
  const L = [];
  L.push(['FOLHA — ' + rhRotuloMes(mes).toUpperCase()]);
  L.push(['Gerado em ' + new Date().toLocaleString('pt-BR') + ' · fonte: painel Phone Cart']);
  L.push([]);
  L.push(['Pessoa','Salário','Variável','Total','Com. vendas','Com. acessório',
          'Bônus meta','Bônus time','Bônus extra','Pix']);
  let ts = 0, tv = 0;
  rhFolha.filter(f => f.mes === mes).forEach(f => {
    const sal = rhSalarioDe(f.func_id, mes), varv = Number(f.total_variavel || 0);
    ts += sal; tv += varv;
    L.push([f.nome || f.func_id, sal, varv, sal + varv,
      Number(f.comissao_vendedor||0), Number(f.comissao_atendente||0),
      Number(f.bonus_meta||0), Number(f.bonus_coletivo||0), Number(f.bonus_extra||0),
      rhPix[f.func_id] || '']);
  });
  L.push(['TOTAL', ts, tv, ts + tv]);
  const sem = rhSemPessoa(mes);
  if(sem.length){
    L.push([]);
    L.push(['Lançamentos sem pessoa marcada']);
    sem.forEach(c => L.push([c.descricao || '—', '', '', Number(c.valor||0)]));
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(L), 'Folha ' + mes);
  XLSX.writeFile(wb, `folha-${mes}.xlsx`);
}

async function recarregarRh(){
  rhCarregado = false;
  if(currentTab === 'rhfolha') renderContent();
  await carregarRh();
  if(currentTab === 'rhfolha') renderContent();
}
