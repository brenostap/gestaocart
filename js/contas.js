// ============================================================================
// CONTAS — para onde o dinheiro da venda foi
//
// Le `pagamentos.conta_bancaria` (o que o atendente escolhe na FoneNinja) e
// responde duas perguntas diferentes:
//
//   Por conta  — quanto entrou em cada banco no periodo (bruto, taxa, liquido).
//                E o numero que voce compara com o extrato.
//   Por dia    — quando o dinheiro CAI, pela data de compensacao. E o que separa
//                o D0 da PagSeguro do D1 da PicPay.
//
// ⚠️ NAO calcula lucro e nao mexe em comissao. Aqui e so caixa: entrou/quando.
// O `liquido` vem da FoneNinja e erra em ~9% das vendas (ver CLAUDE.md) — por
// isso a tela mostra bruto e taxa ao lado, e marca o que esta suspeito.
// ============================================================================

let contasView = 'conta';   // 'conta' | 'dia'

// -- Coleta ------------------------------------------------------------------
// Achata os pagamentos das vendas do periodo/loja em linhas planas. Cancelados
// ja saem no data.js; aqui so descartamos pagamento sem conta preenchida quando
// for contar por conta (vira a linha "(sem conta)", que e justamente o que
// precisa ser corrigido na FoneNinja).
function contasLinhas(){
  let v = filterByPeriod(allVendas);
  if(currentStore !== 'ambas') v = v.filter(x => getVendaInfo(x).loja === currentStore);

  const linhas = [];
  v.forEach(venda => {
    (venda._pagamentos || []).forEach(p => {
      const valor   = parseFloat(p.valor || 0);
      const taxa    = parseFloat(p.taxa || 0);
      const liquido = parseFloat(p.liquido || 0);
      linhas.push({
        vendaId: venda.id,
        loja:    getVendaInfo(venda).loja || '—',
        conta:   (p.conta_bancaria || '').trim() || '(sem conta)',
        forma:   p.forma_pagamento || '—',
        valor, taxa, liquido,
        parcelas: parseInt(p.numero_parcelas || 1) || 1,
        dataPag:  p.data_pagamento || null,
        dataComp: p.data_compensacao || p.data_pagamento || null,
        // Suspeito = o liquido nao fecha com valor - taxa (o erro de ~9% da
        // FoneNinja). Tolerancia de R$1 pra nao acusar arredondamento.
        suspeito: valor > 0 && Math.abs((valor - taxa) - liquido) > 1,
      });
    });
  });
  return linhas;
}

function contasDiaBRT(iso){
  if(!iso) return '—';
  const d = toBRT(iso);
  return String(d.getUTCDate()).padStart(2,'0') + '/' +
         String(d.getUTCMonth()+1).padStart(2,'0');
}

// -- Tela --------------------------------------------------------------------
function renderContas(){
  const linhas = contasLinhas();

  const toggle = `
    <div class="estoque-toggle">
      <button class="etoggle${contasView==='conta'?' active':''}" onclick="setContasView('conta')">Por conta</button>
      <button class="etoggle${contasView==='dia'  ?' active':''}" onclick="setContasView('dia')">Por dia</button>
    </div>`;

  if(!linhas.length){
    return UI.toolbar(toggle) + UI.vazio({
      titulo: 'Nenhum pagamento no período',
      texto:  'Troque o período no topo, ou confira se o sync da FoneNinja rodou.',
    });
  }

  const bruto   = linhas.reduce((a,l) => a + l.valor, 0);
  const taxa    = linhas.reduce((a,l) => a + l.taxa, 0);
  const liquido = linhas.reduce((a,l) => a + l.liquido, 0);
  const semConta = linhas.filter(l => l.conta === '(sem conta)').length;
  const suspeitos = linhas.filter(l => l.suspeito).length;

  const kpis = UI.kpis([
    { rotulo:'Entrou (bruto)', valor: money(bruto), sub: linhas.length + ' pagamentos' },
    { rotulo:'Taxa de maquininha', valor: money(taxa),
      sub: bruto>0 ? (taxa/bruto*100).toFixed(1).replace('.',',') + '% do bruto' : '—',
      tom: 'alerta' },
    { rotulo:'Líquido', valor: money(liquido), sub:'o que cai na conta', tom:'ok' },
  ]);

  // Avisos: o que impede a conferencia de fechar.
  const avisos = [];
  if(semConta)  avisos.push(UI.badge(semConta + ' sem conta escolhida', 'critico'));
  if(suspeitos) avisos.push(UI.badge(suspeitos + ' com líquido suspeito', 'alerta'));
  const barraAvisos = avisos.length
    ? `<div class="c-toolbar" style="margin-bottom:12px">${avisos.join('')}
        <span class="c-card-sub">líquido suspeito = valor − taxa não bate com o que a FoneNinja gravou</span>
       </div>`
    : '';

  const corpo = contasView === 'dia' ? contasPorDia(linhas) : contasPorConta(linhas);
  return UI.toolbar(toggle) + kpis + barraAvisos + corpo;
}

function setContasView(v){
  contasView = v;
  document.getElementById('content').innerHTML = renderContas();
}

// -- Visao "Por conta" -------------------------------------------------------
// Um card por banco. Dentro, a quebra por forma de pagamento — e ali que da pra
// ver se o Pix da Urban esta mesmo caindo na PagSeguro e nao em outro lugar.
function contasPorConta(linhas){
  const mapa = {};
  linhas.forEach(l => {
    const c = mapa[l.conta] = mapa[l.conta] || {
      conta:l.conta, valor:0, taxa:0, liquido:0, qtd:0, suspeitos:0, formas:{}, lojas:{}
    };
    c.valor += l.valor; c.taxa += l.taxa; c.liquido += l.liquido; c.qtd++;
    if(l.suspeito) c.suspeitos++;
    const f = c.formas[l.forma] = c.formas[l.forma] || {valor:0, liquido:0, qtd:0};
    f.valor += l.valor; f.liquido += l.liquido; f.qtd++;
    c.lojas[l.loja] = (c.lojas[l.loja] || 0) + l.valor;
  });

  const contas = Object.values(mapa).sort((a,b) => b.valor - a.valor);

  return contas.map(c => {
    const formas = Object.entries(c.formas).sort((a,b) => b[1].valor - a[1].valor);
    const tabela = UI.tabela({
      colunas: [
        {titulo:'Forma'}, {titulo:'Qtd', num:true},
        {titulo:'Bruto', num:true}, {titulo:'Líquido', num:true},
      ],
      linhas: formas.map(([nome, f]) => [
        UI.badgePagto(nome), f.qtd, money(f.valor), money(f.liquido),
      ]),
    });

    // Quais lojas usam essa conta. Se aparecer mais de uma numa conta que
    // deveria ser de uma loja so, e sinal de conta escolhida errada.
    const lojas = Object.keys(c.lojas).sort((a,b) => c.lojas[b] - c.lojas[a]);
    const selo = lojas.length === 1
      ? UI.badge(lojas[0] === 'urban' ? 'Urban' : lojas[0] === 'cart' ? 'Cart' : lojas[0], 'marca')
      : UI.badge(lojas.length + ' lojas', 'alerta');

    const sub = c.suspeitos ? UI.badge(c.suspeitos + ' a conferir', 'alerta') : '';

    return UI.card({
      titulo: UI.esc(c.conta) + ' ' + selo,
      acao: `<span class="c-kpi-value">${money(c.liquido)}</span>`,
      corpo: `
        ${UI.kv('Bruto', money(c.valor))}
        ${UI.kv('Taxa', money(c.taxa))}
        ${UI.kv('Líquido (cai na conta)', money(c.liquido))}
        ${UI.kv('Pagamentos', c.qtd + (sub ? ' · ' + sub : ''))}
        ${tabela}`,
    });
  }).join('');
}

// -- Visao "Por dia" ---------------------------------------------------------
// Agrupa pela data de COMPENSACAO, nao pela data da venda. E o que mostra o D0
// da PagSeguro caindo no mesmo dia e o D1 da PicPay caindo no dia seguinte.
function contasPorDia(linhas){
  const contas = [...new Set(linhas.map(l => l.conta))]
    .sort((a,b) => a.localeCompare(b));

  const mapa = {};
  linhas.forEach(l => {
    const k = l.dataComp ? String(l.dataComp).slice(0,10) : 'sem-data';
    const d = mapa[k] = mapa[k] || {chave:k, total:0, porConta:{}};
    d.total += l.liquido;
    d.porConta[l.conta] = (d.porConta[l.conta] || 0) + l.liquido;
  });

  const dias = Object.values(mapa).sort((a,b) => b.chave.localeCompare(a.chave));

  const tabela = UI.tabela({
    colunas: [{titulo:'Dia'}, ...contas.map(c => ({titulo:c, num:true})), {titulo:'Total', num:true}],
    linhas: dias.map(d => [
      d.chave === 'sem-data' ? 'sem data' : contasDiaBRT(d.chave + 'T12:00:00Z'),
      ...contas.map(c => d.porConta[c] ? money(d.porConta[c]) : '—'),
      {v: money(d.total), classe:'forte'},
    ]),
  });

  return UI.card({
    titulo: 'Líquido por dia de compensação',
    sub: 'quando o dinheiro cai — não quando a venda foi feita',
    corpo: tabela,
    flush: true,
  });
}
