// ============================================================================
// CONFERÊNCIA DE FONTES — quem atendeu, segundo cada fonte
//
// Existem TRES respostas pra "quem atendeu esta venda", e elas discordam:
//
//   1. obs           — o nome que o atendente digita na observacao.
//   2. campo vendedor— `vendas.vendedor_id`, o perfil SELECIONAVEL da FoneNinja
//                      (resolve pra nome via a tabela `funcionarios`).
//   3. cadastrador   — quem estava LOGADO ao lancar. Vem so dentro de
//                      `contas.raw` (ver data.js) e ninguem escolhe: e automatico.
//
// ⚠️ Esta tela NAO decide comissao. Ela existe pra medir, em dado real, quanto
// cada fonte erra — antes de trocar a regra de registro do time. Medicao de
// jul/2026: campo vendedor 97,3%, cadastrador 90,7% (contra a obs).
//
// O cadastrador erra quando o atendente usa a maquina logada do colega. Por
// isso ele NAO e "mais exato por ser automatico": ele mede o login, nao a pessoa.
// ============================================================================

// Reduz um nome qualquer (obs, perfil FoneNinja, nome completo) a uma chave
// canonica de atendente. Usa ALIASES/AT_KEYS de core.js -- fonte unica, pra nao
// nascer uma segunda tabela de apelidos aqui.
function confChaveAtendente(nome){
  if(!nome) return null;
  const limpo = String(nome).toLowerCase().trim();
  // Tenta o nome inteiro; se nao casar, tenta so o primeiro nome ("Leonardo
  // Novais" -> "leonardo" -> alias -> "leo").
  return matchNome(limpo, AT_KEYS) || matchNome(limpo.split(/\s+/)[0], AT_KEYS);
}

// Compara as tres fontes venda a venda no periodo/loja atual.
function conferenciaFontes(){
  let v = filterByPeriod(allVendas);
  if(currentStore !== 'ambas') v = v.filter(x => getVendaInfo(x).loja === currentStore);

  const funcPorId = {};
  (funcionariosFN||[]).forEach(f => { funcPorId[f.id] = f.nome; });

  const linhas = [];
  v.forEach(venda => {
    const obsNome = getVendaInfo(venda).atendente || '';
    const campoNome = funcPorId[venda.vendedor_id] || '';
    const cadNome = venda._cadastrador?.nome || '';

    const obs = confChaveAtendente(obsNome);
    const campo = confChaveAtendente(campoNome);
    const cad = confChaveAtendente(cadNome);

    // So compara o que da pra comparar: sem obs nao ha referencia, e venda sem
    // conta a receber nao tem cadastrador. Contar essas como "erro" mentiria.
    if(!obs) return;

    linhas.push({
      id: venda.id,
      data: (venda.data_saida||'').slice(0,10),
      loja: getVendaInfo(venda).loja || '—',
      valor: parseFloat(venda.valor_total||0),
      obs, campo, cad,
      obsNome, campoNome, cadNome,
      campoBate: campo ? campo === obs : null,
      cadBate:   cad   ? cad   === obs : null,
    });
  });

  const comCampo = linhas.filter(l => l.campoBate !== null);
  const comCad   = linhas.filter(l => l.cadBate !== null);

  return {
    linhas,
    total: linhas.length,
    campo: { base: comCampo.length, bate: comCampo.filter(l => l.campoBate).length },
    cad:   { base: comCad.length,   bate: comCad.filter(l => l.cadBate).length },
    // Divergentes = alguma fonte automatica discorda da obs. Sao as vendas em
    // que trocar a regra de registro mudaria a comissao de alguem.
    divergentes: linhas.filter(l => l.campoBate === false || l.cadBate === false),
  };
}

function confPct(o){ return o.base ? (o.bate / o.base * 100).toFixed(1).replace('.',',') + '%' : '—'; }

// capNome de render.js e local do renderVendas -- nao da pra reaproveitar daqui.
function confCap(n){ return n && n !== '—' ? n.charAt(0).toUpperCase() + n.slice(1) : '—'; }

// -- Modal -------------------------------------------------------------------
function abrirConferencia(){
  const c = conferenciaFontes();

  const placar = UI.kpis([
    { rotulo:'Vendas com obs', valor: c.total, sub:'base da comparação' },
    { rotulo:'Campo vendedor', valor: confPct(c.campo),
      sub: c.campo.bate + ' de ' + c.campo.base + ' batem com a obs',
      tom: c.campo.base && c.campo.bate/c.campo.base >= 0.97 ? 'ok' : 'alerta' },
    { rotulo:'Cadastrador', valor: confPct(c.cad),
      sub: c.cad.bate + ' de ' + c.cad.base + ' batem com a obs',
      tom: c.cad.base && c.cad.bate/c.cad.base >= 0.97 ? 'ok' : 'alerta' },
  ]);

  const cel = (nome, bate) => bate === null ? '<span class="conf-na">—</span>'
    : `<span class="conf-fonte" data-bate="${bate ? 'sim' : 'nao'}">${UI.esc(confCap(nome) || '—')}</span>`;

  const tabela = UI.tabela({
    colunas: [{titulo:'Venda'}, {titulo:'Data'}, {titulo:'Loja'},
              {titulo:'Obs diz'}, {titulo:'Campo vendedor'}, {titulo:'Cadastrador'},
              {titulo:'Valor', num:true}],
    linhas: c.divergentes
      .sort((a,b) => b.data.localeCompare(a.data))
      .map(l => [
        '#'+l.id,
        l.data ? l.data.split('-').reverse().slice(0,2).join('/') : '—',
        l.loja === 'urban' ? UI.badge('Urban','alerta') : UI.badge('Cart','processo'),
        `<span class="conf-fonte" data-bate="ref">${UI.esc(confCap(l.obsNome))}</span>`,
        cel(l.campoNome, l.campoBate),
        cel(l.cadNome, l.cadBate),
        money(l.valor),
      ]),
    vazio: UI.vazio({ titulo:'Nenhuma divergência no período',
      texto:'As três fontes concordam em todas as vendas com observação preenchida.' }),
  });

  UI.abrirModal({
    titulo: 'Conferência — quem atendeu',
    classe: 'largo',
    corpo: placar + `
      <p class="conf-nota">A <strong>obs</strong> é a referência porque é a única que a pessoa
      escreve de propósito. O <strong>campo vendedor</strong> é selecionável na FoneNinja.
      O <strong>cadastrador</strong> é automático — mas registra o <em>login aberto</em>,
      não quem atendeu: por isso ele erra quando alguém usa a máquina do colega.</p>
      ${tabela}
      <p class="conf-nota">${c.divergentes.length} venda(s) em que trocar a regra de registro
      mudaria a comissão de alguém.</p>`,
  });
}
