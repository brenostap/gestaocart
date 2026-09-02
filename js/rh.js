// ============================================================================
// RH — a área da Nara. DUAS telas: `rhfolha` (o que pagar no mês) e
// `rhpessoas` (o cadastro de quem já esteve e está na loja). Clicar numa
// pessoa em qualquer uma das duas abre a MESMA ficha.
//
// ⚠️ ELA NÃO CALCULA FOLHA. Lê a `folha_mensal`, que já está congelada.
//
// Esse é o ponto inteiro do módulo. A aba Equipe mostra a mesma folha, mas
// CALCULANDO no navegador — e pra isso precisa de todas as vendas e de todos os
// `venda_produtos`, incluindo `valor_estoque`, que é o custo do aparelho. Dar
// Equipe pra uma pessoa de fora seria abrir o custo do estoque inteiro; a tela
// esconderia, a API não.
//
// Aqui o dado que chega já é só folha e cadastro. Não existe número da loja pra
// vazar porque ele nunca é buscado — e o RLS (`eh_rh()`) garante isso do lado de
// lá, não é este arquivo que protege.
//
// Por isso também os valores usam `brl()` direto, sem `money()`: o interruptor
// de dinheiro existe pra telas que MISTURAM dinheiro que pode e dinheiro que
// não pode. Esta não mistura — tudo que ela renderiza é folha.
//
// ⚠️ O QUE ELA ESCREVE, E SÓ ISSO: `funcionarios_config` (o cadastro). Nasceu
// somente-leitura em 02/set/2026 e mudou no mesmo dia, quando o RH pediu o
// módulo cadastral: quem tem CPF, RG e endereço na mão é a Nara, não o dono —
// um cadastro que o RH não preenche não serve pra nada. Folha, custos e o resto
// seguem fechados pra ela, na cortina E na fechadura.
// ============================================================================

let rhMes = null;          // 'YYYY-MM' escolhido; null = o mais recente
let rhFolha = [];          // linhas de folha_mensal (todos os meses)
let rhSalarios = [];       // custos da area Funcionarios (o RLS já filtra)
let rhCad = {};            // funcionarios_config: id -> cadastro completo
let rhCarregado = false;
let rhErro = '';
let rhAberto = null;       // id da pessoa com a ficha aberta
let rhFichaAba = 'pagamento';
let rhEditando = false;
let rhSalvando = '';

// Situações do cadastro. `afastado` não foi pedido pela Nara mas cabe no mesmo
// eixo (a pessoa não está trabalhando e não foi desligada) e o CHECK do banco
// já aceita — sem ele, licença médica viraria "férias", que é outra coisa.
const RH_STATUS = [
  { v:'ativo',     t:'Ativo',     tom:'ok'       },
  { v:'ferias',    t:'Férias',    tom:'processo' },
  { v:'afastado',  t:'Afastado',  tom:'alerta'   },
  { v:'desligado', t:'Desligado', tom:'critico'  },
];
const rhStatusInfo = s => RH_STATUS.find(x => x.v === s) || { v:'', t:'Sem status', tom:'' };

async function carregarRh(){
  rhErro = '';
  try{
    const [folha, custos, cfg] = await Promise.all([
      sbGet('folha_mensal', 'order=mes.desc,total_variavel.desc', 500),
      // ⚠️ Sem filtro de área aqui de propósito: quem filtra é a POLICY
      // (`custos_rh`). Se um dia o filtro sumir do banco, o bug tem que
      // aparecer no teste de RLS, não ficar escondido atrás de um `and` no JS.
      sbGet('custos', 'order=data.desc', 2000),
      sbGet('funcionarios_config', 'order=id', 200).catch(() => []),
    ]);
    rhFolha = folha || [];
    rhSalarios = custos || [];
    rhCad = {};
    (cfg || []).forEach(c => { rhCad[c.id] = c; });
  }catch(e){
    console.warn('[rh] carga falhou:', e.message);
    rhErro = e.message || 'falha ao carregar';
    rhFolha = []; rhSalarios = []; rhCad = {};
  }
  rhCarregado = true;
}

async function recarregarRh(){
  rhCarregado = false;
  if(ehTelaRh()) renderContent();
  await carregarRh();
  if(ehTelaRh()) renderContent();
}
function ehTelaRh(){ return currentTab === 'rhfolha' || currentTab === 'rhpessoas'; }

// -- MESES -------------------------------------------------------------------
function rhMeses(){
  return [...new Set(rhFolha.map(f => f.mes))].sort().reverse();
}
function rhMesVisto(){
  const ms = rhMeses();
  return (rhMes && ms.includes(rhMes)) ? rhMes : (ms[0] || null);
}
function setRhMes(m){ rhMes = m; if(ehTelaRh()) renderContent(); }

const RH_MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
function rhRotuloMes(ym){
  const [a,m] = String(ym).split('-');
  return RH_MESES[Number(m)-1] + '/' + a;
}
function rhData(d){
  if(!d) return '—';
  const [a,m,dia] = String(d).slice(0,10).split('-');
  return dia && m ? `${dia}/${m}/${a}` : '—';
}
function rhDataCurta(d){
  if(!d) return '—';
  const [,m,dia] = String(d).slice(0,10).split('-');
  return dia && m ? `${dia}/${m}` : '—';
}

// -- PESSOAS -----------------------------------------------------------------
// A lista de gente é a UNIÃO de três fontes, e a ordem importa:
//   1. `funcionarios_config` — o cadastro do RH, que é quem manda no nome e no
//      status. É a única fonte que a Nara edita.
//   2. `folha_mensal` — quem foi pago em algum mês. Garante que ninguém que
//      recebeu suma da tela por não ter cadastro ainda.
//   3. `FUNC` (js/config.js) — o cadastro-mestre do painel, usado só como
//      preenchimento de nome/cargo enquanto o RH não digitou o dele.
// ⚠️ Sócio fica de fora: não entra na folha e não é colaborador da Nara.
const RH_FORA = ['gustavo','marcella'];

function rhPessoas(){
  const ids = new Set();
  Object.keys(rhCad).forEach(id => ids.add(id));
  rhFolha.forEach(f => ids.add(f.func_id));
  (typeof FUNC !== 'undefined' ? FUNC : []).forEach(f => { if(f.atKey || f.voKey) ids.add(f.id); });
  RH_FORA.forEach(id => ids.delete(id));

  return [...ids].map(id => {
    const c = rhCad[id] || {};
    const f = (typeof FUNC !== 'undefined' ? FUNC : []).find(x => x.id === id) || {};
    const linhaFolha = rhFolha.find(x => x.func_id === id) || {};
    return {
      id,
      nome:   c.nome_completo || linhaFolha.nome || f.nome || f.ap || id,
      curto:  f.ap || c.nome_completo || linhaFolha.nome || id,
      cargo:  c.cargo || (f.cargo || '').replace(/\s*\(saiu\)\s*/i,'') || '—',
      status: c.status || (rhSaiuNoFUNC(id) ? 'desligado' : 'ativo'),
      cad:    c,
      temCadastro: !!rhCad[id],
    };
  }).sort((a,b) => a.curto.localeCompare(b.curto,'pt-BR'));
}

// O FUNC diz que a pessoa saiu? É o que a FOLHA usa (saiuDaEquipe), e por isso
// vale como padrão quando o cadastro do RH ainda não existe.
function rhSaiuNoFUNC(id){
  const f = (typeof FUNC !== 'undefined' ? FUNC : []).find(x => x.id === id);
  if(!f) return false;
  return !!f.saiuEm || /\(saiu\)/i.test(f.cargo || '');
}

// ⚠️ DOIS REGISTROS DE DESLIGAMENTO, E ELES PODEM DISCORDAR. O `status` daqui é
// o registro do RH (muda no dia em que a pessoa sai); `saiuEm`/"(saiu)" no FUNC
// é o que tira a pessoa da FOLHA, e só muda quando o dono commita. Escolher um
// calado esconderia ou uma folha paga a mais, ou uma pessoa sumida do histórico.
// Então a tela ACUSA — mesma lição da Conferência da Assistência.
function rhDivergencias(){
  const out = [];
  rhPessoas().forEach(p => {
    const noFunc = rhSaiuNoFUNC(p.id);
    if((p.status === 'desligado') !== noFunc) out.push({ ...p,
      texto: p.status === 'desligado'
        ? `${p.curto} está DESLIGADO no cadastro, mas ainda entra na folha (falta marcar no sistema).`
        : `${p.curto} saiu segundo o sistema, mas o cadastro diz "${rhStatusInfo(p.status).t}".` });

    // ⚠️ MESMA ARMADILHA, OUTRO CAMPO. O cargo agora existe no cadastro (que o
    // RH edita) E no FUNC (que a tela de Equipe e o cabecalho do fechamento
    // exportado leem). Mudar so aqui faz a Nara ver "Gerente" e o documento que
    // vai pro colaborador dizer "Atendente" -- e ninguem percebe, porque as
    // duas telas estao certas cada uma na sua fonte.
    const cargoFunc = ((typeof FUNC !== 'undefined' ? FUNC : [])
      .find(x => x.id === p.id) || {}).cargo;
    const limpo = String(cargoFunc || '').replace(/\s*\(saiu\)\s*/i,'').trim();
    const doCad = String((p.cad || {}).cargo || '').trim();
    if(limpo && doCad && limpo.toLowerCase() !== doCad.toLowerCase()) out.push({ ...p,
      texto: `${p.curto}: cargo é "${doCad}" no cadastro e "${limpo}" no sistema — o segundo é o que sai no fechamento do colaborador.` });
  });
  return out;
}

// -- LANÇAMENTOS DO MÊS ------------------------------------------------------
// ⚠️ NÃO É SÓ "SALÁRIO". Em jul/2026 metade das linhas eram HORA EXTRA e uma
// era ajuste de meta; somar tudo numa célula chamada "Salário" faz a Nara pagar
// o valor certo sem saber do que ele é feito — e sem conseguir conferir com o
// ponto. Cada lançamento aparece com data e descrição.
function rhLancamentosDe(id, mes){
  return (rhSalarios || [])
    .filter(c => c.funcionario === id && String(c.data || '').slice(0,7) === mes)
    .sort((a,b) => String(a.data).localeCompare(String(b.data)));
}
function rhTipoLancamento(c){
  const d = String(c.descricao || '');
  if(/f[ée]rias/i.test(d) || c.subgrupo === 'ferias') return { t:'Férias',      tom:'processo' };
  if(/hora/i.test(d))                                 return { t:'Hora extra',  tom:'alerta'   };
  if(/^sal[áa]rio/i.test(d))                          return { t:'Salário',     tom:''         };
  return { t:'Ajuste', tom:'' };
}
function rhSalarioDe(id, mes){
  return rhLancamentosDe(id, mes).reduce((a,c) => a + parseFloat(c.valor || 0), 0);
}
function rhFolhaDe(id, mes){
  return rhFolha.find(f => f.func_id === id && f.mes === mes) || null;
}
function rhTotalDe(id, mes){
  const f = rhFolhaDe(id, mes);
  return rhSalarioDe(id, mes) + Number((f && f.total_variavel) || 0);
}

// -- CONFERÊNCIA DOS BÔNUS AGREGADOS -----------------------------------------
// ⚠️ ISTO CONSERTA UMA MENTIRA QUE A PRIMEIRA VERSÃO DESTA TELA CONTAVA.
// Os bônus são lançados em Custos como UMA linha só, sem pessoa ("Bonus meta
// coletiva R$3.600"), e ao mesmo tempo estão distribuídos pessoa a pessoa
// dentro de `total_variavel` (R$400 × 9). A tela antiga mostrava esses
// lançamentos num card "sem pessoa marcada" ao lado do total — quem somasse os
// dois pagaria o bônus DUAS VEZES. Medido em ago/2026: R$6.542 a mais.
//
// A verba é a mesma; o que a tela faz agora é PROVAR isso, linha por linha. Se
// um dia divergir, é sinal de que Custos e folha não fecham — e aí ela precisa
// ver, não descobrir na hora do Pix.
const RH_AGREGADOS = [
  { re:/coletiv/i,                 col:'bonus_coletivo', rot:'Bônus meta coletiva'   },
  { re:/5\s*%|acess.*anne|anne/i,  col:'bonus_extra',    rot:'Bônus 5% acessórios'   },
  { re:/individual|meta/i,         col:'bonus_meta',     rot:'Bônus meta individual' },
];
function rhAgregadosDoMes(mes){
  const linhas = (rhSalarios || []).filter(c =>
    !c.funcionario && String(c.data || '').slice(0,7) === mes);
  const daFolha = rhFolha.filter(f => f.mes === mes);
  return linhas.map(c => {
    const reg = RH_AGREGADOS.find(r => r.re.test(String(c.descricao || '')));
    const naFolha = reg
      ? daFolha.reduce((a,f) => a + Number(f[reg.col] || 0), 0)
      : null;
    const valor = parseFloat(c.valor || 0);
    return {
      descricao: c.descricao || '—',
      data: c.data,
      valor,
      naFolha,
      // ⚠️ tolerância de R$1: os dois lados arredondam em pontos diferentes
      // (a folha por pessoa, o custo no total). Diferença de centavo não é erro.
      bate: naFolha != null && Math.abs(naFolha - valor) <= 1,
      reconhecido: !!reg,
    };
  });
}

// -- CABEÇALHO E ESTADOS COMUNS ---------------------------------------------
function rhCabecalho(kicker, titulo, desc, acoes){
  return `<div class="pg-head">
    <div>
      <div class="pg-kicker">${kicker}</div>
      <h1 class="pg-title">${titulo}</h1>
      <div class="pg-desc">${desc}</div>
    </div>
    ${acoes ? `<div class="pg-acoes">${acoes}</div>` : ''}
  </div>`;
}
function rhEstadoBase(){
  if(!rhCarregado)
    return UI.card({ corpo: UI.vazio({ titulo:'Carregando…', texto:'Buscando a folha e o cadastro.' }) });
  if(rhErro)
    return UI.card({ corpo: UI.vazio({
      titulo:'Não consegui carregar',
      texto:'Tente atualizar. Se continuar, avise o Breno. ('+UI.esc(rhErro)+')',
      acao: UI.btn('Tentar de novo', {onclick:'recarregarRh()', variante:'primario'}) }) });
  return null;
}

// A linha de pessoa é UM componente com dois usos (folha e cadastro). Foi o
// mesmo caminho da tela de Equipe: dois blocos quase iguais escritos na mão
// divergiam a cada mexida.
function rhLinhaPessoa({id, nome, selo, meio, direita, subDireita}){
  return `<button class="rh-linha" onclick="rhAbrir('${id}')">
    <span class="rh-av">${ini(nome)}</span>
    <span class="rh-corpo">
      <span class="rh-topo"><b class="rh-nome">${UI.esc(nome)}</b>${selo || ''}</span>
      <span class="rh-meio">${meio || ''}</span>
    </span>
    <span class="rh-dir">${direita || ''}${subDireita ? `<i>${subDireita}</i>` : ''}</span>
  </button>`;
}

function rhAbrir(id){ rhAberto = id; rhFichaAba = 'pagamento'; rhEditando = false; renderContent(); }
function rhFechar(){ rhAberto = null; rhEditando = false; renderContent(); }
function setRhFichaAba(a){ rhFichaAba = a; rhEditando = false; renderContent(); }

// ============================================================================
// TELA 1 — FOLHA DO MÊS
// ============================================================================
function renderRhFolha(){
  const base = rhEstadoBase(); if(base) return base;
  if(rhAberto) return rhFicha(rhAberto);

  const mes = rhMesVisto();
  if(!mes)
    return rhCabecalho('Pagamento','Folha','O mês aparece aqui depois de fechado.') + UI.card({
      corpo: UI.vazio({ titulo:'Nenhum mês fechado ainda',
        texto:'A folha aparece aqui depois que o mês é fechado pelo Breno.' }) });

  const linhas = rhFolha.filter(f => f.mes === mes)
    .map(f => ({ f, pessoa: rhPessoas().find(p => p.id === f.func_id) || {curto:f.nome, cargo:'—'} }))
    .map(x => ({ ...x, sal: rhSalarioDe(x.f.func_id, mes), varv: Number(x.f.total_variavel || 0) }))
    .sort((a,b) => (b.sal + b.varv) - (a.sal + a.varv));

  const totSal = linhas.reduce((a,x) => a + x.sal, 0);
  const totVar = linhas.reduce((a,x) => a + x.varv, 0);

  const lista = linhas.map(x => {
    const comp = rhComposicaoCurta(x.f);
    return rhLinhaPessoa({
      id: x.f.func_id,
      nome: x.pessoa.curto || x.f.nome || x.f.func_id,
      selo: UI.badge(x.pessoa.cargo || '—'),
      meio: `<span class="rh-comp">${comp || 'sem variável no mês'}</span>`,
      direita: `<b>${brl(x.sal + x.varv)}</b>`,
      subDireita: `${brl(x.sal)} fixo · ${brl(x.varv)} variável`,
    });
  }).join('');

  const seletor = UI.toolbar(
    ...rhMeses().map(m => UI.chip(rhRotuloMes(m), m === mes, `setRhMes('${m}')`)),
    UI.sep(),
    UI.btn('⬇ Planilha', {onclick:'rhExportar()', variante:'primario', sm:true}),
    UI.btn('🖨 Imprimir', {onclick:'window.print()', sm:true})
  );

  return rhCabecalho('Pagamento', 'Folha — ' + rhRotuloMes(mes),
      'O que sai de folha no mês, pessoa a pessoa. Toque numa pessoa para abrir a ficha completa.')
    + seletor
    + UI.kpis([
        { rotulo:'Pessoas na folha', valor: String(linhas.length) },
        { rotulo:'Fixo (salário e extras)', valor: brl(totSal) },
        { rotulo:'Variável (comissão e bônus)', valor: brl(totVar) },
        { rotulo:'Total a pagar', valor: brl(totSal + totVar), tom:'marca' },
      ])
    + UI.card({ titulo:'Por pessoa', sub:'ordenado pelo total', flush:true, corpo: lista })
    + rhCardConferencia(mes)
    + `<div class="rh-rodape">Mês fechado não muda de valor. Folha e lançamentos continuam com o Breno —
       aqui você confere, exporta e mantém o cadastro.</div>`;
}

function rhComposicaoCurta(f){
  return [
    Number(f.comissao_vendedor)  ? brl(f.comissao_vendedor)+' vendas'     : '',
    Number(f.comissao_atendente) ? brl(f.comissao_atendente)+' acessório'  : '',
    Number(f.bonus_meta)         ? brl(f.bonus_meta)+' meta'               : '',
    Number(f.bonus_coletivo)     ? brl(f.bonus_coletivo)+' time'           : '',
    Number(f.bonus_extra)        ? brl(f.bonus_extra)+' 5%'                : '',
  ].filter(Boolean).join(' · ');
}

function rhCardConferencia(mes){
  const ags = rhAgregadosDoMes(mes);
  if(!ags.length) return '';
  const ruim = ags.filter(a => !a.bate);
  const tabela = UI.tabela({
    colunas:[{titulo:'Lançamento em Custos'},{titulo:'Valor', num:true},
             {titulo:'Mesma verba na folha', num:true},{titulo:'Confere'}],
    linhas: ags.map(a => [
      UI.esc(a.descricao),
      { v: brl(a.valor), num:true },
      { v: a.naFolha == null ? '—' : brl(a.naFolha), num:true },
      { v: a.bate ? UI.badge('bate','ok')
          : a.reconhecido ? UI.badge('diferença de '+brl(Math.abs(a.naFolha - a.valor)),'critico')
          : UI.badge('não reconhecido','alerta') },
    ]),
  });
  return UI.card({
    titulo: ruim.length ? '⚠️ Bônus lançados em Custos — confira' : 'Bônus lançados em Custos',
    sub:'não some com o total acima: é a mesma verba',
    classe: ruim.length ? 'c-card-alerta' : '',
    corpo: `<div class="rh-nota">Estes bônus entram no Custos como uma linha só, sem pessoa,
      e <b>já estão distribuídos</b> dentro do variável de cada um. Somar as duas coisas pagaria
      o bônus duas vezes${ruim.length ? '' : ' — a coluna da direita prova que fecham'}.</div>${tabela}`,
  });
}

// ============================================================================
// TELA 2 — PESSOAS (o cadastro)
// ============================================================================
function renderRhPessoas(){
  const base = rhEstadoBase(); if(base) return base;
  if(rhAberto) return rhFicha(rhAberto);

  const todas = rhPessoas();
  const grupo = s => todas.filter(p => p.status === s);
  const ativos = grupo('ativo'), ferias = grupo('ferias'),
        afast = grupo('afastado'), fora = grupo('desligado');

  const bloco = (lista, mostraSaida) => lista.map(p => {
    const c = p.cad || {};
    const falta = rhCamposFaltando(p).length;
    return rhLinhaPessoa({
      id: p.id,
      nome: p.nome,
      selo: UI.badge(rhStatusInfo(p.status).t, rhStatusInfo(p.status).tom),
      meio: `<span class="rh-comp">${UI.esc(p.cargo)}${c.departamento ? ' · '+UI.esc(c.departamento) : ''}${
        mostraSaida && c.desligamento ? ' · saiu em '+rhData(c.desligamento) : ''}</span>`,
      direita: falta
        ? UI.badge(falta+' campo'+(falta>1?'s':'')+' em branco','alerta')
        : UI.badge('cadastro completo','ok'),
      subDireita: c.data_inicio ? 'desde '+rhData(c.data_inicio) : 'sem data de admissão',
    });
  }).join('');

  const secao = (titulo, sub, lista, mostraSaida) => lista.length
    ? UI.card({titulo, sub, flush:true, corpo: bloco(lista, mostraSaida)}) : '';

  const div = rhDivergencias();
  const aviso = div.length ? UI.card({
    titulo:'⚠️ Cadastro e sistema discordam',
    sub:'quem sai da folha é o sistema; quem registra o desligamento é você',
    classe:'c-card-alerta',
    corpo: div.map(d => `<div class="c-alerta-linha">${UI.esc(d.texto)}</div>`).join(''),
  }) : '';

  return rhCabecalho('Pessoas', 'Colaboradores',
      'Quem está e quem já esteve na loja. Toque para abrir a ficha e preencher o cadastro.')
    + UI.kpis([
        { rotulo:'Ativos', valor: String(ativos.length), tom:'ok' },
        { rotulo:'Em férias', valor: String(ferias.length), tom: ferias.length?'processo':'' },
        { rotulo:'Afastados', valor: String(afast.length), tom: afast.length?'alerta':'' },
        { rotulo:'Desligados', valor: String(fora.length), sub:'histórico' },
      ])
    + aviso
    + secao('Ativos', ativos.length+' pessoas', ativos)
    + secao('Em férias', 'voltam depois', ferias)
    + secao('Afastados', 'não estão trabalhando', afast)
    + secao('Histórico de desligados', 'o cadastro fica — a linha nunca é apagada', fora, true)
    + `<div class="rh-rodape">O cadastro é seu: dá pra editar por aqui. Desligar é mudar o status,
       nunca apagar a pessoa — é o que mantém o histórico.</div>`;
}

// Campos que a Nara pediu e que ainda estão em branco. Serve de fila de
// trabalho: ela abre a lista e vê onde falta, sem ter que entrar em cada ficha.
const RH_CAMPOS_PEDIDOS = [
  ['nome_completo','Nome completo'], ['cpf','CPF'], ['rg','RG'],
  ['nascimento','Data de nascimento'], ['sexo','Sexo'], ['estado_civil','Estado civil'],
  ['nacionalidade','Nacionalidade'], ['naturalidade','Naturalidade'],
  ['cargo','Cargo'], ['departamento','Departamento'], ['data_inicio','Data de admissão'],
  ['telefone','Telefone'], ['email','E-mail'], ['endereco','Endereço'],
  ['emerg_nome','Contato de emergência'], ['emerg_telefone','Telefone de emergência'],
];
function rhCamposFaltando(p){
  const c = p.cad || {};
  return RH_CAMPOS_PEDIDOS.filter(([k]) => !c[k] || String(c[k]).trim() === '');
}

// ============================================================================
// A FICHA DA PESSOA — a mesma, venha de onde vier
// ============================================================================
function rhFicha(id){
  const p = rhPessoas().find(x => x.id === id);
  if(!p) return UI.card({ corpo: UI.vazio({ titulo:'Pessoa não encontrada',
    acao: UI.btn('Voltar', {onclick:'rhFechar()'}) }) });

  const st = rhStatusInfo(p.status);
  const mes = rhMesVisto();
  const abas = [
    ['pagamento','Pagamento'],
    ['producao','Produção'],
    ['cadastro','Cadastro'],
    ['historico','Histórico'],
  ];

  const topo = `
    <div class="rh-ficha-head">
      ${UI.btn('← Voltar', {onclick:'rhFechar()', variante:'sutil', sm:true})}
      <div class="rh-ficha-id">
        <span class="rh-av grande">${ini(p.nome)}</span>
        <div>
          <h1 class="rh-ficha-nome">${UI.esc(p.nome)}</h1>
          <div class="rh-ficha-sub">
            ${UI.esc(p.cargo)}${p.cad.departamento ? ' · '+UI.esc(p.cad.departamento) : ''}
            ${UI.badge(st.t, st.tom)}
          </div>
        </div>
      </div>
      ${UI.toolbar(...abas.map(([k,t]) => UI.chip(t, rhFichaAba === k, `setRhFichaAba('${k}')`)))}
    </div>`;

  const corpo =
      rhFichaAba === 'cadastro'  ? rhAbaCadastro(p)
    : rhFichaAba === 'producao'  ? rhAbaProducao(p, mes)
    : rhFichaAba === 'historico' ? rhAbaHistorico(p)
    :                              rhAbaPagamento(p, mes);

  return topo + corpo;
}

// -- ABA PAGAMENTO -----------------------------------------------------------
function rhAbaPagamento(p, mes){
  if(!mes) return UI.card({ corpo: UI.vazio({titulo:'Nenhum mês fechado ainda'}) });
  const f = rhFolhaDe(p.id, mes);
  const lanc = rhLancamentosDe(p.id, mes);
  const sal = lanc.reduce((a,c) => a + parseFloat(c.valor||0), 0);
  const varv = Number((f && f.total_variavel) || 0);

  const seletor = UI.toolbar(...rhMeses().map(m =>
    UI.chip(rhRotuloMes(m), m === mes, `setRhMes('${m}')`)));

  const fixo = lanc.length ? UI.tabela({
    colunas:[{titulo:'Data'},{titulo:'Lançamento'},{titulo:'Tipo'},{titulo:'Valor', num:true}],
    linhas: lanc.map(c => {
      const t = rhTipoLancamento(c);
      return [ rhDataCurta(c.data), UI.esc(c.descricao || '—'),
               { v: UI.badge(t.t, t.tom) }, { v: brl(c.valor), num:true } ];
    }).concat([[ { v:'' }, { v:'<b>Subtotal fixo</b>' }, { v:'' },
                 { v:`<b>${brl(sal)}</b>`, num:true } ]]),
  }) : UI.vazio({titulo:'Sem lançamento fixo neste mês',
        texto:'Salário, hora extra e ajustes são lançados em Custos pelo Breno.'});

  // ⚠️ Cada linha do variável vem com a REGRA escrita ao lado. Comissão que a
  // pessoa (e quem paga) não consegue conferir vira desconfiança — é a mesma
  // razão de existir o `podeVerBaseComissao()` no painel do colaborador.
  const regras = f ? [
    Number(f.comissao_vendedor) && ['Comissão de vendas',
      `${f.aparelhos} aparelho${f.aparelhos===1?'':'s'} · R$${VO_CURVA.base}/un até ${VO_CURVA.corte}, R$${VO_CURVA.bonus}/un acima`,
      f.comissao_vendedor],
    Number(f.comissao_atendente) && ['Comissão de acessórios',
      `25% sobre ${brl(f.acess_lucro)} de base · ${f.acess_qtd} itens vendidos`,
      f.comissao_atendente],
    Number(f.bonus_meta) && ['Bônus de meta individual',
      `bateu a faixa de ${brl(rhFaixaBatida(f))} · vendeu ${brl(f.acess_bruto)} em acessórios`,
      f.bonus_meta],
    Number(f.bonus_coletivo) && ['Bônus de meta coletiva',
      'a loja bateu a meta do mês · valor cheio por pessoa, não rateado',
      f.bonus_coletivo],
    Number(f.bonus_extra) && ['Bônus de contrato (5%)',
      'percentual sobre o resultado de acessórios da rede',
      f.bonus_extra],
  ].filter(Boolean) : [];

  const variavel = f ? UI.tabela({
    colunas:[{titulo:'Item'},{titulo:'Como foi calculado'},{titulo:'Valor', num:true}],
    linhas: (regras.length ? regras : [['Sem variável no mês','não houve comissão nem bônus',0]])
      .map(([t,r,v]) => [ `<b>${t}</b>`, `<span class="rh-comp">${r}</span>`,
                          { v: brl(v), num:true } ])
      .concat(regras.length ? [[ { v:'<b>Subtotal variável</b>' }, { v:'' },
                                 { v:`<b>${brl(varv)}</b>`, num:true } ]] : []),
  }) : UI.vazio({titulo:'Sem folha fechada neste mês',
       texto:'Esta pessoa não tem linha na folha de '+rhRotuloMes(mes)+'.'});

  const pix = p.cad.pix || '';
  const pagar = `<div class="rh-pagar">
    <div><span>Total a pagar em ${rhRotuloMes(mes)}</span><b>${brl(sal + varv)}</b></div>
    <div class="rh-pagar-pix"><span>Pix</span><b class="rh-pix">${pix ? UI.esc(pix) : 'não cadastrado'}</b></div>
  </div>`;

  return seletor
    + UI.card({titulo:'Fixo', sub:'lançado em Custos, dia a dia', flush:true, corpo: fixo})
    + UI.card({titulo:'Variável', sub:'da folha congelada de '+rhRotuloMes(mes), flush:true, corpo: variavel})
    + UI.card({corpo: pagar, classe:'rh-card-pagar'})
    + UI.toolbar(
        UI.btn('⬇ Baixar a ficha', {onclick:`rhExportarPessoa('${p.id}')`, variante:'primario', sm:true}),
        UI.btn('🖨 Imprimir', {onclick:'window.print()', sm:true}));
}

// A faixa que a pessoa bateu, derivada do bônus pago — a tabela de faixas mora
// em core.js (metaAtFaixas) e muda por mês; ler dali é o que impede a ficha de
// mostrar a faixa de HOJE num mês antigo já pago.
function rhFaixaBatida(f){
  const faixas = (typeof metaAtFaixas === 'function') ? metaAtFaixas(f.mes) : [];
  const achou = faixas.find(x => Number(x.bonus) === Number(f.bonus_meta));
  return achou ? achou.val : 0;
}

// -- ABA PRODUÇÃO ------------------------------------------------------------
function rhAbaProducao(p, mes){
  const f = mes ? rhFolhaDe(p.id, mes) : null;
  if(!f) return UI.toolbar(...rhMeses().map(m => UI.chip(rhRotuloMes(m), m === mes, `setRhMes('${m}')`)))
    + UI.card({corpo: UI.vazio({titulo:'Sem produção registrada neste mês'})});

  const mt = (typeof metaAtendente === 'function') ? metaAtendente(f.acess_bruto, mes) : null;
  const escada = mt && Number(f.acess_bruto) > 0 ? UI.card({
    titulo:'Meta individual de acessórios',
    sub:'a escada vale para o mês de '+rhRotuloMes(mes),
    corpo: `
      <div class="rh-meta-topo">
        <b>${brl(f.acess_bruto)}</b> vendidos ·
        ${mt.nivel ? `faixa ${mt.nivel} de ${mt.total} — bônus ${brl(mt.bonus)}` : 'nenhuma faixa batida ainda'}
      </div>
      ${UI.barra(mt.prox ? Math.min(100, Math.round(Number(f.acess_bruto)/mt.prox*100)) : 100,
                 mt.maxima ? 'ok' : 'processo')}
      <div class="rh-comp">${mt.prox
        ? `faltaram ${brl(mt.falta)} para a faixa de ${brl(mt.prox)} (bônus ${brl(mt.proxBonus)})`
        : 'faixa máxima batida'}</div>`,
  }) : '';

  const num = (r,v,s) => [ r, { v:`<b>${v}</b>`, num:true }, { v:`<span class="rh-comp">${s||''}</span>` } ];

  return UI.toolbar(...rhMeses().map(m => UI.chip(rhRotuloMes(m), m === mes, `setRhMes('${m}')`)))
    + UI.card({
        titulo:'O que ela produziu em '+rhRotuloMes(mes),
        sub:'é daqui que sai a comissão',
        flush:true,
        corpo: UI.tabela({
          colunas:[{titulo:'Indicador'},{titulo:'Número', num:true},{titulo:'O que significa'}],
          linhas:[
            num('Aparelhos vendidos', f.aparelhos, 'unidades principais, não número de vendas'),
            num('Vendas em que foi o vendedor', f.vendas_vendidas, 'fechou a venda'),
            num('Vendas em que atendeu', f.vendas_atendidas, 'atendeu o cliente no balcão'),
            num('Acessórios vendidos', f.acess_qtd + ' itens', brl(f.acess_bruto)+' em valor de venda'),
            num('Base da comissão de acessório', brl(f.acess_lucro), '25% disso é a comissão dela'),
          ],
        }),
      })
    + escada
    + `<div class="rh-nota">Estes números foram congelados quando o mês fechou${
        f.fechado_em ? ' (' + rhData(String(f.fechado_em).slice(0,10)) + ')' : ''
      } e não mudam mais.</div>`;
}

// -- ABA CADASTRO ------------------------------------------------------------
function rhAbaCadastro(p){
  const c = p.cad || {};
  const falta = rhCamposFaltando(p);

  if(!rhEditando){
    const kv = (rot, val, mono) => `<div class="rh-kv"><span>${rot}</span><b class="${mono?'rh-pix':''}">${
      val ? UI.esc(val) : '<i class="rh-vazio">em branco</i>'}</b></div>`;
    const grupo = (titulo, itens) => UI.card({titulo, corpo:`<div class="rh-kv-grade">${itens.join('')}</div>`});

    return (falta.length ? UI.card({
        titulo:'Faltam '+falta.length+' campo'+(falta.length>1?'s':''),
        classe:'c-card-alerta',
        corpo:`<div class="rh-nota">${falta.map(([,t]) => UI.esc(t)).join(' · ')}</div>`,
      }) : '')
      + UI.toolbar(UI.btn('✎ Editar cadastro', {onclick:'rhEditar()', variante:'primario', sm:true}))
      + grupo('Identificação', [
          kv('Nome completo', c.nome_completo), kv('CPF', c.cpf, true), kv('RG', c.rg, true),
          kv('Data de nascimento', c.nascimento && rhData(c.nascimento)),
          kv('Sexo', c.sexo), kv('Estado civil', c.estado_civil),
          kv('Nacionalidade', c.nacionalidade), kv('Naturalidade', c.naturalidade),
        ])
      + grupo('Vínculo', [
          kv('Cargo', c.cargo), kv('Departamento', c.departamento),
          kv('Situação', rhStatusInfo(p.status).t),
          kv('Data de admissão', c.data_inicio && rhData(c.data_inicio)),
          kv('Data de desligamento', c.desligamento && rhData(c.desligamento)),
          kv('Motivo da saída', c.motivo_saida),
        ])
      + grupo('Contato', [
          kv('Telefone', c.telefone, true), kv('E-mail', c.email),
          kv('Endereço', c.endereco), kv('Chave Pix', c.pix, true),
        ])
      + grupo('Em caso de emergência', [
          kv('Nome', c.emerg_nome), kv('Telefone', c.emerg_telefone, true),
          kv('Parentesco', c.emerg_parentesco),
        ])
      + (c.obs ? UI.card({titulo:'Observações', corpo:`<div class="rh-nota">${UI.esc(c.obs)}</div>`}) : '')
      + rhCardFerias(p);
  }

  // -- modo edição -----------------------------------------------------------
  const t = (k, rot, tipo) => UI.campo({label:rot,
    corpo: UI.input({id:'rh-'+k, tipo: tipo || 'text', valor: c[k] || ''}) });
  const s = (k, rot, ops) => UI.campo({label:rot,
    corpo: UI.select({id:'rh-'+k, opcoes:[{v:'',t:'—'}].concat(ops), valor: c[k] || ''}) });

  return UI.toolbar(
      UI.btn(rhSalvando === p.id ? 'Salvando…' : '✓ Salvar',
        {onclick:`rhSalvarCadastro('${p.id}')`, variante:'primario', sm:true,
         disabled: rhSalvando === p.id}),
      UI.btn('Cancelar', {onclick:'rhCancelarEdicao()', sm:true}))
    + UI.card({titulo:'Identificação', corpo:
        UI.linha(t('nome_completo','Nome completo'))
      + UI.linha(t('cpf','CPF'), t('rg','RG'))
      + UI.linha(t('nascimento','Data de nascimento','date'),
                 s('sexo','Sexo',[{v:'F',t:'Feminino'},{v:'M',t:'Masculino'},{v:'outro',t:'Outro'}]))
      + UI.linha(s('estado_civil','Estado civil',
          ['Solteiro(a)','Casado(a)','União estável','Divorciado(a)','Viúvo(a)'].map(x=>({v:x,t:x}))),
                 t('nacionalidade','Nacionalidade'))
      + UI.linha(t('naturalidade','Naturalidade (cidade/UF de nascimento)')) })
    + UI.card({titulo:'Vínculo', corpo:
        UI.linha(t('cargo','Cargo'), t('departamento','Departamento'))
      + UI.linha(t('data_inicio','Data de admissão','date'),
                 s('status','Situação', RH_STATUS.map(x => ({v:x.v, t:x.t}))))
      + UI.linha(t('desligamento','Data de desligamento','date'), t('motivo_saida','Motivo da saída'))
      + `<div class="rh-nota">Desligado exige a data — é ela que dá sentido ao histórico.
         Mudar a situação aqui <b>não</b> tira a pessoa da folha: isso continua com o Breno,
         e a tela de Pessoas avisa enquanto os dois discordarem.</div>` })
    + UI.card({titulo:'Contato', corpo:
        UI.linha(t('telefone','Telefone'), t('email','E-mail','email'))
      + UI.linha(t('endereco','Endereço completo'))
      + UI.linha(t('pix','Chave Pix')) })
    + UI.card({titulo:'Em caso de emergência', corpo:
        UI.linha(t('emerg_nome','Nome'), t('emerg_telefone','Telefone'))
      + UI.linha(t('emerg_parentesco','Parentesco')) })
    + UI.card({titulo:'Observações', corpo: UI.linha(t('obs','Anotações do RH')) });
}

function rhEditar(){ rhEditando = true; renderContent(); }
function rhCancelarEdicao(){ rhEditando = false; renderContent(); }

const RH_CAMPOS_FORM = ['nome_completo','cpf','rg','nascimento','sexo','estado_civil',
  'nacionalidade','naturalidade','cargo','departamento','data_inicio','status',
  'desligamento','motivo_saida','telefone','email','endereco','pix',
  'emerg_nome','emerg_telefone','emerg_parentesco','obs'];

// ⚠️ Escrita ÚNICA deste arquivo, e é upsert por `id` — mesmo caminho do
// setEquipeExtra() da tela de Equipe. Data vazia tem que virar `null`, não '':
// o Postgres recusa string vazia em coluna `date` e o erro morreria num catch.
async function rhSalvarCadastro(id){
  const dados = { id };
  RH_CAMPOS_FORM.forEach(k => {
    const el = document.getElementById('rh-'+k);
    if(!el) return;
    const v = String(el.value == null ? '' : el.value).trim();
    dados[k] = (v === '' && /nascimento|data_inicio|desligamento/.test(k)) ? null : v;
  });
  if(dados.status === 'desligado' && !dados.desligamento){
    alert('Para desligar, preencha a data de desligamento — é ela que dá sentido ao histórico.');
    return;
  }
  rhSalvando = id; renderContent();
  try{
    const token = await sbAuthToken();
    const r = await fetch(SB_URL+'/rest/v1/funcionarios_config', {
      method:'POST',
      headers:{ 'apikey':SB_KEY, 'Authorization':'Bearer '+token,
        'Content-Type':'application/json', 'Prefer':'resolution=merge-duplicates' },
      body: JSON.stringify({ ...dados, atualizado_por: usuarioEmail || '',
                             updated_at: new Date().toISOString() }),
    });
    if(!r.ok){
      const txt = await r.text().catch(() => '');
      throw new Error('HTTP '+r.status+(txt ? ' — '+txt.slice(0,180) : ''));
    }
    rhCad[id] = { ...(rhCad[id]||{}), ...dados };
    rhEditando = false;
  }catch(e){
    console.error('[rh] salvar cadastro:', e.message);
    alert('Não consegui salvar: '+e.message);
  }
  rhSalvando = '';
  renderContent();
}

// -- FÉRIAS ------------------------------------------------------------------
// ⚠️ CONTA DE CALENDÁRIO, NÃO DE FOLHA. Período aquisitivo = 12 meses de
// trabalho; o direito tem que ser gozado nos 12 meses seguintes (período
// concessivo), senão vence. Deriva só da data de admissão — nada aqui é
// lançamento, e nada aqui paga. Se a admissão estiver em branco, a tela DIZ que
// não sabe, em vez de inventar uma data.
//
// ⚠️ E ELA SÓ SABE METADE. O painel não tem registro de férias GOZADAS: o que
// ele enxerga é o lançamento de férias no Custos do mês em que foi pago
// ("Salário Davi (férias)"). Isso marca o mês, não o período aquisitivo — então
// `gozadas` é um PISO, e a tela precisa dizer isso. A primeira versão deste
// arquivo tinha um campo `vencido` que nunca podia ser true: ele comparava a
// data de hoje com o vencimento do período MAIS RECENTE, que por construção
// ainda está no futuro. Período vencido é o ANTIGO, não o novo.
function rhFeriasDe(dataInicio, hoje, gozadas){
  const txt = String(dataInicio || '').slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(txt)) return null;
  const d0 = new Date(txt + 'T12:00:00');
  const ref = hoje ? new Date(hoje + 'T12:00:00') : new Date();
  if(isNaN(d0.getTime())) return null;

  const soma = k => { const d = new Date(d0.getTime()); d.setFullYear(d.getFullYear()+k); return d; };
  const iso  = d => d.toISOString().slice(0,10);
  const dias = (a,b) => Math.round((a - b) / 86400000);

  let n = 0;                       // periodos aquisitivos ja completos
  while(soma(n+1) <= ref) n++;
  if(n === 0) return { completou:false, proximo: iso(soma(1)), faltam: dias(soma(1), ref) };

  // O periodo k vence em soma(k+1). Com n periodos completos, os de 1 a n-1 ja
  // passaram do prazo. Cada gozo registrado abate o mais antigo.
  const usadas = Math.max(0, Number(gozadas || 0));
  const vencidos = Math.max(0, (n - 1) - usadas);
  return {
    completou:  true,
    periodos:   n,
    gozadas:    usadas,
    aquisitivo: iso(soma(n)),        // quando nasceu o direito mais recente
    vence:      iso(soma(n+1)),      // fim do periodo concessivo dele
    faltam:     dias(soma(n+1), ref),
    vencidos,                        // quantos ja passaram do prazo sem registro
    vencido:    vencidos > 0,
  };
}

// Meses em que apareceu um lançamento de FÉRIAS na folha da pessoa. É tudo que
// o painel sabe sobre gozo — e é por isso que a tela chama de "registro", não de
// "controle": férias tiradas sem lançamento no Custos não chegam aqui.
function rhFeriasRegistradas(id){
  return [...new Set((rhSalarios || [])
    .filter(c => c.funcionario === id && rhTipoLancamento(c).t === 'Férias')
    .map(c => String(c.data || '').slice(0,7)))].sort();
}

function rhCardFerias(p){
  const meses = rhFeriasRegistradas(p.id);
  const fr = rhFeriasDe((p.cad || {}).data_inicio, null, meses.length);
  const rodape = `<div class="rh-nota">Contagem derivada da <b>data de admissão</b>.
    O painel só enxerga férias que viraram lançamento no Custos${
      meses.length ? ' — encontrei ' + meses.map(rhRotuloMes).join(', ') : ' — não encontrei nenhum'
    }. Férias tiradas sem lançamento não chegam aqui, então trate este número como piso.</div>`;

  if(!fr) return UI.card({ titulo:'Férias', corpo:`<div class="rh-nota">
    Sem <b>data de admissão</b> no cadastro, não dá para calcular o período aquisitivo.
    Preencha a admissão e o prazo aparece aqui.</div>` });
  if(!fr.completou) return UI.card({ titulo:'Férias', corpo:`<div class="rh-nota">
    Ainda no primeiro período aquisitivo. Completa 12 meses em <b>${rhData(fr.proximo)}</b>
    (faltam ${fr.faltam} dias).</div>` + rodape });

  const tom = fr.vencido ? 'critico' : fr.faltam <= 90 ? 'alerta' : 'ok';
  return UI.card({
    titulo: fr.vencido ? '⚠️ Férias — período vencido' : 'Férias',
    sub: fr.periodos + ' período' + (fr.periodos>1?'s':'') + ' aquisitivo' +
         (fr.periodos>1?'s':'') + ' completo' + (fr.periodos>1?'s':''),
    classe: fr.vencido ? 'c-card-alerta' : '',
    corpo: `<div class="rh-kv-grade">
        <div class="rh-kv"><span>Direito mais recente em</span><b>${rhData(fr.aquisitivo)}</b></div>
        <div class="rh-kv"><span>Precisa ser gozado até</span><b>${rhData(fr.vence)}</b></div>
        <div class="rh-kv"><span>Gozos registrados</span><b>${fr.gozadas || 'nenhum'}</b></div>
        <div class="rh-kv"><span>Situação</span><b>${UI.badge(
          fr.vencido ? fr.vencidos + ' período' + (fr.vencidos>1?'s':'') + ' vencido' + (fr.vencidos>1?'s':'')
                     : 'faltam ' + fr.faltam + ' dias', tom)}</b></div>
      </div>` + rodape,
  });
}

// -- ABA HISTÓRICO -----------------------------------------------------------
function rhAbaHistorico(p){
  const meses = rhMeses().slice().sort().reverse();
  const linhas = meses.map(m => {
    const f = rhFolhaDe(p.id, m);
    const sal = rhSalarioDe(p.id, m);
    const varv = Number((f && f.total_variavel) || 0);
    if(!f && !sal) return null;
    return [
      `<b>${rhRotuloMes(m)}</b>`,
      { v: sal ? brl(sal) : '—', num:true },
      { v: varv ? brl(varv) : '—', num:true },
      { v: `<b>${brl(sal + varv)}</b>`, num:true },
      { v: `<span class="rh-comp">${f ? (rhComposicaoCurta(f) || '—') : '—'}</span>` },
    ];
  }).filter(Boolean);

  const c = p.cad || {};
  const vinculo = UI.card({titulo:'Vínculo', corpo:`<div class="rh-kv-grade">
      <div class="rh-kv"><span>Admissão</span><b>${c.data_inicio ? rhData(c.data_inicio) : '<i class="rh-vazio">em branco</i>'}</b></div>
      <div class="rh-kv"><span>Situação</span><b>${UI.badge(rhStatusInfo(p.status).t, rhStatusInfo(p.status).tom)}</b></div>
      <div class="rh-kv"><span>Desligamento</span><b>${c.desligamento ? rhData(c.desligamento) : '—'}</b></div>
      <div class="rh-kv"><span>Motivo</span><b>${c.motivo_saida ? UI.esc(c.motivo_saida) : '—'}</b></div>
    </div>`});

  return vinculo
    + UI.card({
        titulo:'Meses pagos',
        sub:'só os meses já fechados — o mês corrente entra quando o Breno fechar',
        flush:true,
        corpo: linhas.length ? UI.tabela({
          colunas:[{titulo:'Mês'},{titulo:'Fixo', num:true},{titulo:'Variável', num:true},
                   {titulo:'Total', num:true},{titulo:'Composição'}],
          linhas,
        }) : UI.vazio({titulo:'Nenhum mês pago ainda'}),
      })
    + rhCardFerias(p);
}

// ============================================================================
// EXPORTAÇÃO — mesma biblioteca do fechamento do sócio
// ============================================================================
function rhExportar(){
  const mes = rhMesVisto();
  if(!mes || typeof XLSX === 'undefined') return;
  const L = [];
  L.push(['FOLHA — ' + rhRotuloMes(mes).toUpperCase()]);
  L.push(['Gerado em ' + new Date().toLocaleString('pt-BR') + ' · fonte: painel Phone Cart']);
  L.push([]);
  L.push(['Pessoa','Cargo','Fixo','Variável','Total','Com. vendas','Com. acessório',
          'Bônus meta','Bônus time','Bônus 5%','Pix']);
  let ts = 0, tv = 0;
  const pessoas = rhPessoas();
  rhFolha.filter(f => f.mes === mes).forEach(f => {
    const p = pessoas.find(x => x.id === f.func_id) || {curto:f.nome, cargo:'', cad:{}};
    const sal = rhSalarioDe(f.func_id, mes), varv = Number(f.total_variavel || 0);
    ts += sal; tv += varv;
    L.push([p.curto || f.nome, p.cargo || '', sal, varv, sal + varv,
      Number(f.comissao_vendedor||0), Number(f.comissao_atendente||0),
      Number(f.bonus_meta||0), Number(f.bonus_coletivo||0), Number(f.bonus_extra||0),
      (p.cad && p.cad.pix) || '']);
  });
  L.push(['TOTAL','', ts, tv, ts + tv]);

  // ⚠️ Os bônus agregados entram na planilha COMO CONFERÊNCIA, com a coluna da
  // folha ao lado -- nunca como uma linha solta abaixo do total. Solta, ela
  // parece dinheiro a mais e a mesma verba sai duas vezes.
  const ags = rhAgregadosDoMes(mes);
  if(ags.length){
    L.push([]);
    L.push(['CONFERÊNCIA — bônus lançados em Custos (já incluídos nos totais acima)']);
    L.push(['Lançamento','Valor em Custos','Mesma verba na folha','Confere']);
    ags.forEach(a => L.push([a.descricao, a.valor, a.naFolha == null ? '' : a.naFolha,
                             a.bate ? 'sim' : 'NÃO']));
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(L), 'Folha ' + mes);
  XLSX.writeFile(wb, `folha-${mes}.xlsx`);
}

// A ficha de uma pessoa só: duas abas, pagamento e cadastro. É o documento que
// a Nara entrega/arquiva por colaborador.
function rhExportarPessoa(id){
  const mes = rhMesVisto();
  if(typeof XLSX === 'undefined') return;
  const p = rhPessoas().find(x => x.id === id);
  if(!p) return;
  const c = p.cad || {}, f = mes ? rhFolhaDe(id, mes) : null;

  const A = [];
  A.push(['FICHA — ' + (p.nome || id).toUpperCase()]);
  A.push(['Mês de referência: ' + (mes ? rhRotuloMes(mes) : '—')]);
  A.push([]);
  A.push(['LANÇAMENTOS FIXOS']);
  A.push(['Data','Lançamento','Tipo','Valor']);
  let sal = 0;
  rhLancamentosDe(id, mes || '').forEach(x => {
    sal += parseFloat(x.valor || 0);
    A.push([x.data, x.descricao || '', rhTipoLancamento(x).t, parseFloat(x.valor || 0)]);
  });
  A.push(['','','Subtotal fixo', sal]);
  A.push([]);
  A.push(['VARIÁVEL']);
  if(f){
    A.push(['Comissão de vendas',      Number(f.comissao_vendedor||0)]);
    A.push(['Comissão de acessórios',  Number(f.comissao_atendente||0)]);
    A.push(['Bônus meta individual',   Number(f.bonus_meta||0)]);
    A.push(['Bônus meta coletiva',     Number(f.bonus_coletivo||0)]);
    A.push(['Bônus 5% (contrato)',     Number(f.bonus_extra||0)]);
    A.push(['Subtotal variável',       Number(f.total_variavel||0)]);
    A.push([]);
    A.push(['PRODUÇÃO NO MÊS']);
    A.push(['Aparelhos vendidos',      Number(f.aparelhos||0)]);
    A.push(['Vendas como vendedor',    Number(f.vendas_vendidas||0)]);
    A.push(['Vendas atendidas',        Number(f.vendas_atendidas||0)]);
    A.push(['Acessórios (itens)',      Number(f.acess_qtd||0)]);
    A.push(['Acessórios (valor)',      Number(f.acess_bruto||0)]);
  } else {
    A.push(['sem folha fechada neste mês']);
  }
  A.push([]);
  A.push(['TOTAL A PAGAR', sal + Number((f && f.total_variavel) || 0)]);
  A.push(['Pix', c.pix || '']);

  const B = [['CADASTRO — ' + (p.nome || id).toUpperCase()], []];
  RH_CAMPOS_PEDIDOS.forEach(([k,rot]) => B.push([rot, c[k] || '']));
  B.push(['Situação', rhStatusInfo(p.status).t]);
  B.push(['Data de desligamento', c.desligamento || '']);
  B.push(['Motivo da saída', c.motivo_saida || '']);
  B.push(['Contato de emergência (parentesco)', c.emerg_parentesco || '']);
  B.push(['Chave Pix', c.pix || '']);
  B.push(['Observações', c.obs || '']);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(A), 'Pagamento');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(B), 'Cadastro');
  XLSX.writeFile(wb, `ficha-${id}-${mes || 'atual'}.xlsx`);
}
