// ============================================================================
// CONFERÊNCIA DE FONTES — quem atendeu e quem vendeu, segundo cada fonte
//
// Existem TRES respostas pra "quem trabalhou nesta venda", e elas discordam:
//
//   1. obs           — os nomes que o atendente digita na observacao.
//   2. campo vendedor— `vendas.vendedor_id`, o perfil SELECIONAVEL da FoneNinja
//                      (resolve pra nome via a tabela `funcionarios`).
//   3. cadastrador   — quem estava LOGADO ao lancar. Vem so dentro de
//                      `contas.raw` (ver data.js) e ninguem escolhe: e automatico.
//
// ⚠️ MUDANCA DE REGRA (ago/2026). Ate 05/ago o campo vendedor so tinha perfil de
// ATENDENTE -- por isso ele batia com o atendente da obs em 97,3% (jul/2026).
// O dono criou perfil pros vendedores ONLINE (Mel, Isa, David) e a instrucao ao
// time virou: campo vendedor = quem VENDEU, login = quem ATENDEU. Ou seja, a
// mesma coluna troca de significado no meio do historico.
//
// Por isso esta tela mede DUAS coisas ao mesmo tempo, sem data de corte:
//   • regra nova  — campo vendedor x vendedor da obs   (tem que SUBIR ate 100%)
//   • regra atual — campo vendedor x atendente da obs  (vai CAIR conforme viram)
// A obs continua sendo a referencia e quem paga comissao enquanto a virada nao
// fecha. Esta tela NAO decide comissao: ela existe pra dizer QUANDO da pra parar
// de escrever a obs a mao.
//
// O cadastrador erra quando o atendente usa a maquina logada do colega. Por
// isso ele NAO e "mais exato por ser automatico": ele mede o login, nao a pessoa.
// ============================================================================

// Reduz um nome qualquer (obs, perfil FoneNinja, nome completo) a uma chave
// canonica. Usa ALIASES/AT_KEYS/VO_KEYS de core.js -- fonte unica, pra nao
// nascer uma segunda tabela de apelidos aqui.
function confChave(nome, lista){
  if(!nome) return null;
  const limpo = String(nome).toLowerCase().trim();
  // Tenta o nome inteiro; se nao casar, tenta so o primeiro nome ("Leonardo
  // Novais" -> "leonardo" -> alias -> "leo").
  return matchNome(limpo, lista) || matchNome(limpo.split(/\s+/)[0], lista);
}
function confChaveAtendente(nome){ return confChave(nome, AT_KEYS); }
function confChaveVendedor(nome){  return confChave(nome, VO_KEYS); }

// Compara as fontes venda a venda no periodo/loja atual.
function conferenciaFontes(){
  let v = filterByPeriod(allVendas);
  if(currentStore !== 'ambas') v = v.filter(x => getVendaInfo(x).loja === currentStore);

  const funcPorId = {};
  (funcionariosFN||[]).forEach(f => { funcPorId[f.id] = f.nome; });

  const linhas = [];
  v.forEach(venda => {
    const info = getVendaInfo(venda);
    const campoNome = funcPorId[venda.vendedor_id] || '';
    const cadNome = venda._cadastrador?.nome || '';

    const obsAt = confChaveAtendente(info.atendente || '');
    const obsVo = confChaveVendedor(info.vendedor || '');
    // O MESMO nome do campo lido pelas duas reguas: 'Vitinho' so casa como
    // atendente, 'Mel' so como vendedora. Nome que casa nos dois (maria, pietra)
    // conta nas duas -- e o dado, nao da pra desempatar aqui.
    const campoAt = confChaveAtendente(campoNome);
    const campoVo = confChaveVendedor(campoNome);
    const cad = confChaveAtendente(cadNome);

    // So compara o que da pra comparar: sem obs nao ha referencia, e venda sem
    // conta a receber nao tem cadastrador. Contar essas como "erro" mentiria.
    if(!obsAt && !obsVo) return;

    linhas.push({
      id: venda.id,
      data: (venda.data_saida||'').slice(0,10),
      loja: info.loja || '—',
      valor: parseFloat(venda.valor_total||0),
      obsAt, obsVo, campoAt, campoVo, cad,
      obsAtNome: info.atendente || '', obsVoNome: info.vendedor || '',
      campoNome, cadNome,
      // regra atual (campo = atendente) e regra nova (campo = vendedor)
      campoAtBate: (obsAt && campoAt) ? campoAt === obsAt : null,
      campoVoBate: (obsVo && campoVo) ? campoVo === obsVo : null,
      cadBate:     (obsAt && cad)     ? cad     === obsAt : null,
    });
  });

  const placar = (chave) => {
    const base = linhas.filter(l => l[chave] !== null);
    return { base: base.length, bate: base.filter(l => l[chave]).length };
  };

  // Cobertura da regra nova: em quantas vendas o campo JA traz um vendedor
  // online. E o numero que sobe conforme o time adota -- 100% = pode largar a obs.
  const comObsVo = linhas.filter(l => l.obsVo);
  const jaNoCampo = comObsVo.filter(l => l.campoVo).length;

  return {
    linhas,
    total: linhas.length,
    // base = vendas com vendedor na obs (o universo da virada).
    // comCampo = quantas dessas ja trazem o vendedor no campo.
    // acerto = placar SO entre as que ja trazem -- base propria, nao a de cima.
    vendedor: { base: comObsVo.length, comCampo: jaNoCampo, acerto: placar('campoVoBate') },
    campo: placar('campoAtBate'),
    cad:   placar('cadBate'),
    // Divergentes = alguma fonte automatica discorda da obs. Sao as vendas em
    // que trocar a regra de registro mudaria a comissao de alguem.
    divAtendente: linhas.filter(l => l.campoAtBate === false || l.cadBate === false),
    divVendedor:  linhas.filter(l => l.campoVoBate === false),
  };
}

function confPct(o){ return o.base ? (o.bate / o.base * 100).toFixed(1).replace('.',',') + '%' : '—'; }
function confPctN(n, base){ return base ? (n / base * 100).toFixed(1).replace('.',',') + '%' : '—'; }

// capNome de render.js e local do renderVendas -- nao da pra reaproveitar daqui.
function confCap(n){ return n && n !== '—' ? n.charAt(0).toUpperCase() + n.slice(1) : '—'; }

function confLojaBadge(loja){
  return loja === 'urban' ? UI.badge('Urban','alerta') : UI.badge('Cart','processo');
}
function confData(d){ return d ? d.split('-').reverse().slice(0,2).join('/') : '—'; }

// -- Modal -------------------------------------------------------------------
function abrirConferencia(){
  const c = conferenciaFontes();

  // Bloco 1: a virada. Cobertura primeiro -- e ela que diz se a regra pegou.
  const placarNovo = UI.kpis([
    { rotulo:'Campo já traz o vendedor', valor: confPctN(c.vendedor.comCampo, c.vendedor.base),
      sub: c.vendedor.comCampo + ' de ' + c.vendedor.base + ' vendas com vendedor na obs',
      tom: c.vendedor.base && c.vendedor.comCampo/c.vendedor.base >= 0.99 ? 'ok' : 'alerta' },
    { rotulo:'E acerta quem foi', valor: confPct(c.vendedor.acerto),
      sub: c.vendedor.acerto.bate + ' de ' + c.vendedor.acerto.base + ' batem com a obs',
      tom: c.vendedor.acerto.base && c.vendedor.acerto.bate/c.vendedor.acerto.base >= 0.99 ? 'ok' : 'alerta' },
  ]);

  const placarAtual = UI.kpis([
    { rotulo:'Vendas com obs', valor: c.total, sub:'base da comparação' },
    { rotulo:'Campo vendedor = atendente', valor: confPct(c.campo),
      sub: c.campo.bate + ' de ' + c.campo.base + ' batem com a obs',
      tom: c.campo.base && c.campo.bate/c.campo.base >= 0.97 ? 'ok' : 'alerta' },
    { rotulo:'Cadastrador = atendente', valor: confPct(c.cad),
      sub: c.cad.bate + ' de ' + c.cad.base + ' batem com a obs',
      tom: c.cad.base && c.cad.bate/c.cad.base >= 0.97 ? 'ok' : 'alerta' },
  ]);

  const cel = (nome, bate) => bate === null ? '<span class="conf-na">—</span>'
    : `<span class="conf-fonte" data-bate="${bate ? 'sim' : 'nao'}">${UI.esc(confCap(nome) || '—')}</span>`;
  const celRef = (nome) => `<span class="conf-fonte" data-bate="ref">${UI.esc(confCap(nome))}</span>`;

  const tabelaVend = UI.tabela({
    colunas: [{titulo:'Venda'}, {titulo:'Data'}, {titulo:'Loja'},
              {titulo:'Vendedor na obs'}, {titulo:'Campo vendedor'}, {titulo:'Valor', num:true}],
    linhas: c.divVendedor
      .sort((a,b) => b.data.localeCompare(a.data))
      .map(l => ['#'+l.id, confData(l.data), confLojaBadge(l.loja),
                 celRef(l.obsVoNome), cel(l.campoNome, false), money(l.valor)]),
    vazio: UI.vazio({ titulo:'Nenhuma divergência de vendedor',
      texto:'Onde o campo já traz um vendedor online, ele bate com a obs.' }),
  });

  const tabelaAtend = UI.tabela({
    colunas: [{titulo:'Venda'}, {titulo:'Data'}, {titulo:'Loja'},
              {titulo:'Atendente na obs'}, {titulo:'Campo vendedor'}, {titulo:'Cadastrador'},
              {titulo:'Valor', num:true}],
    linhas: c.divAtendente
      .sort((a,b) => b.data.localeCompare(a.data))
      .map(l => ['#'+l.id, confData(l.data), confLojaBadge(l.loja),
                 celRef(l.obsAtNome), cel(l.campoNome, l.campoAtBate), cel(l.cadNome, l.cadBate),
                 money(l.valor)]),
    vazio: UI.vazio({ titulo:'Nenhuma divergência no período',
      texto:'As fontes concordam em todas as vendas com observação preenchida.' }),
  });

  UI.abrirModal({
    titulo: 'Conferência — quem vendeu e quem atendeu',
    classe: 'largo',
    corpo: `
      <p class="conf-nota"><strong>Regra nova (ago/2026):</strong> o campo vendedor da FoneNinja
      passa a ser o <strong>vendedor online</strong> e o <strong>login</strong> passa a ser o
      atendente. Enquanto a obs continuar sendo escrita, ela é a referência e é ela que paga
      comissão — estes números dizem quando dá pra parar de escrever.</p>
      ${placarNovo}
      ${tabelaVend}
      <p class="conf-nota" style="margin-top:22px"><strong>Regra antiga — quem atendeu.</strong>
      O campo vendedor batia com o <em>atendente</em> porque só existia perfil de atendente;
      esse número cai conforme o time adota a regra nova, e isso é esperado.
      O <strong>cadastrador</strong> é automático — mas registra o <em>login aberto</em>,
      não quem atendeu: por isso erra quando alguém usa a máquina do colega.</p>
      ${placarAtual}
      ${tabelaAtend}
      <p class="conf-nota">${c.divVendedor.length} divergência(s) de vendedor ·
      ${c.divAtendente.length} de atendente no período.</p>`,
  });
}
