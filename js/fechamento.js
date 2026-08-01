// ===========================================================================
// EXPORTACAO DO FECHAMENTO — documento de prova por colaborador
//
// Gera uma planilha com UMA ABA POR PESSOA (mais uma aba Geral): resumo do que
// a pessoa recebe, onde parou nas metas, comparativo com o mes anterior e a
// lista das vendas que geraram comissao, uma linha por venda. Serve para
// resolver questionamento: abre a aba da pessoa e mostra venda a venda.
//
// REGRA QUE SUSTENTA O DOCUMENTO: aqui nao se calcula NADA. Todo numero vem de
// fechamentoEquipe() (equipe.js), que vem de calc() (render.js) -- a mesma
// fonte que pinta a tela. Se um dia o arquivo e a tela discordarem, o problema
// esta na fonte, nao em duas contas diferentes. Nao adicionar conta neste
// arquivo: se falta um numero, ele nasce em fechamentoEquipe().
//
// O arquivo e do dono e nao vai para a equipe -- por isso mostra custo, lucro
// e margem sem restricao (nao passa por money()/podeVerMargem).
// ===========================================================================

// SheetJS via CDN, carregado SO no clique. O app nao tem bundler; um <script>
// fixo no index.html custaria ~900KB em toda visita para um botao usado uma vez
// por mes. Mesmo caminho que o supabase-js ja usa (CDN), sem tocar a ordem de
// carga do index.html.
const FECH_XLSX_CDN = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
let _fechXlsxPromise = null;

function fechCarregarXLSX(){
  if(window.XLSX) return Promise.resolve(window.XLSX);
  if(_fechXlsxPromise) return _fechXlsxPromise;
  _fechXlsxPromise = new Promise((ok, err) => {
    const s = document.createElement('script');
    s.src = FECH_XLSX_CDN;
    s.onload  = () => window.XLSX ? ok(window.XLSX)
                                  : err(new Error('a biblioteca de planilha carregou mas não inicializou'));
    s.onerror = () => { _fechXlsxPromise = null;
                        err(new Error('não foi possível baixar a biblioteca de planilha (sem internet?)')); };
    document.head.appendChild(s);
  });
  return _fechXlsxPromise;
}

// -- Celulas ---------------------------------------------------------------
// Numero entra como NUMERO na planilha (da pra somar e filtrar no Excel), com
// formato de exibicao. Texto entra como texto.
const _fechMoeda = 'R$ #,##0';
function fechMo(v){ return {v: Math.round((parseFloat(v)||0)*100)/100, t:'n', z:_fechMoeda}; }
function fechNu(v){ return {v: parseFloat(v)||0, t:'n', z:'#,##0'}; }
function fechId(v){ return {v: parseFloat(v)||0, t:'n', z:'0'}; }
function fechPc(v){ return {v: (parseFloat(v)||0)/100, t:'n', z:'0%'}; }

// Data da venda em BRT (o banco grava UTC; toBRT desloca -3h)
function fechData(iso){
  if(!iso) return '—';
  const d = toBRT(iso);
  const p = n => String(n).padStart(2,'0');
  return p(d.getUTCDate())+'/'+p(d.getUTCMonth()+1)+'/'+d.getUTCFullYear();
}
function fechDataHora(dt){
  const p = n => String(n).padStart(2,'0');
  return p(dt.getDate())+'/'+p(dt.getMonth()+1)+'/'+dt.getFullYear()
       + ' às ' + p(dt.getHours())+':'+p(dt.getMinutes());
}

// Nome de aba: Excel corta em 31 e proibe : \ / ? * [ ]
function fechNomeAba(nome, usados){
  let base = String(nome||'aba').replace(/[:\\\/?*\[\]]/g,'-').slice(0,31).trim() || 'aba';
  let n = base, i = 2;
  while(usados.has(n)){ n = base.slice(0, 28) + '~' + i; i++; }
  usados.add(n);
  return n;
}

// -- Blocos reaproveitados entre as abas -----------------------------------

// "faltaram R$40 para R$10.000 (bônus de R$1.000)" — o texto do quanto faltou
// sai de metaAtendente(), que le META_AT_FAIXAS (core.js).
function fechTextoMetaIndividual(meta){
  const batida = meta.nivel > 0
    ? 'faixa de '+brl(meta.faixa)+' batida → bônus '+brl(meta.bonus)
    : 'nenhuma faixa batida';
  if(!meta.prox) return batida + ' · faixa máxima';
  return batida + ' · faltaram ' + brl(meta.falta) + ' para ' + brl(meta.prox)
       + ' (bônus de ' + brl(meta.proxBonus) + ')';
}

function fechTextoMetaColetivaDev(fech){
  const b = fech.metaDev, p = fech.metaDevProx, un = fech.base.aparelhos;
  const batida = b ? b.qt+' aparelhos batidos → bônus '+brl(b.bonus) : 'nenhuma faixa batida';
  if(!p) return batida + ' · faixa máxima';
  return batida + ' · faltaram ' + (p.qt-un) + ' aparelhos para ' + p.qt
       + ' (bônus de ' + brl(p.bonus) + ')';
}

function fechTextoMetaColetivaAcess(fech){
  const b = fech.metaAc, p = fech.metaAcProx, v = fech.base.acessBruto;
  const batida = b ? brl(b.val)+' batidos → bônus '+brl(b.bonus) : 'nenhuma faixa batida';
  if(!p) return batida + ' · faixa máxima';
  return batida + ' · faltaram ' + brl(p.val-v) + ' para ' + brl(p.val)
       + ' (bônus de ' + brl(p.bonus) + ')';
}

// -- Aba de um colaborador --------------------------------------------------
function fechAbaPessoa(p, fech, ant){
  const L = [];
  const vazio = () => L.push([]);

  L.push(['FECHAMENTO — ' + fech.mesLabel.toUpperCase()]);
  L.push([p.nome + (p.nomeCompleto && p.nomeCompleto !== p.nome ? '  ·  '+p.nomeCompleto : '')
          + '  ·  ' + (p.cargo||'')]);
  L.push(['Documento gerado em ' + fechDataHora(fech.geradoEm)
          + '  ·  loja: ' + (fech.loja === 'ambas' ? 'Cart + Urban' : fech.loja)
          + '  ·  fonte: painel Phone Cart']);
  vazio();

  // -- Resumo --------------------------------------------------------------
  L.push(['RESUMO — O QUE ENTRA NO PAGAMENTO']);
  L.push(['Item', 'Valor', 'De onde vem']);
  if(p.sal > 0) L.push(['Salário', fechMo(p.sal),
    p.salOrigem === 'custos' ? 'lançamento em Custos: ' + p.salDesc
                             : '⚠ sem lançamento em Custos no mês — valor da tabela de salários']);
  p.extras.forEach(e => L.push([e.desc, fechMo(e.valor),
    'lançamento em Custos' + (e.obs ? ' · ' + e.obs : '')]));
  if(p.commVo > 0 || p.ehVendedor) L.push(['Comissão de vendedor', fechMo(p.commVo),
    p.units + ' aparelhos · ' + brl(VO_CURVA.base) + '/un até ' + VO_CURVA.corte
    + ' un, ' + brl(VO_CURVA.bonus) + '/un acima']);
  if(p.commAt > 0 || p.ehAtendente) L.push(['Comissão de atendente', fechMo(p.commAt),
    '25% do lucro dos acessórios das vendas que atendeu']);
  if(p.bonus5 > 0) L.push(['Bônus 5% acessórios', fechMo(p.bonus5),
    '5% do lucro de acessórios da loja no mês (' + brl(fech.base.acessLucro) + ')']);
  if(p.bonusMeta > 0) L.push(['Bônus meta individual', fechMo(p.bonusMeta),
    'bruto de acessórios ' + brl(p.brutoAcess) + ' → faixa ' + brl(p.meta.faixa)]);
  if(p.bonusCol > 0) L.push(['Bônus meta coletiva', fechMo(p.bonusCol),
    'metas da loja no mês (pago cheio para cada pessoa)']);
  L.push(['TOTAL A RECEBER', fechMo(p.total), '']);
  vazio();

  // -- Metas ---------------------------------------------------------------
  L.push(['METAS — ONDE CHEGOU E QUANTO FALTOU']);
  L.push(['Meta', 'Onde chegou', 'Situação']);
  if(p.ehAtendente) L.push(['Individual — bruto de acessórios', fechMo(p.brutoAcess),
    fechTextoMetaIndividual(p.meta)]);
  if(p.ehVendedor){
    const falta = Math.max(0, VO_CURVA.corte + 1 - p.units);
    L.push(['Curva de comissão — aparelhos', fechNu(p.units),
      p.units > VO_CURVA.corte
        ? 'passou de ' + VO_CURVA.corte + ' un → ' + brl(VO_CURVA.bonus) + '/un nas '
          + (p.units - VO_CURVA.corte) + ' seguintes'
        : 'faltaram ' + falta + ' aparelhos para ' + brl(VO_CURVA.bonus) + '/un']);
  }
  L.push(['Coletiva — aparelhos da loja', fechNu(fech.base.aparelhos), fechTextoMetaColetivaDev(fech)]);
  L.push(['Coletiva — acessórios da loja', fechMo(fech.base.acessBruto), fechTextoMetaColetivaAcess(fech)]);
  vazio();

  // -- Comparacao com o mes anterior ---------------------------------------
  if(ant){
    const a = ant.pessoas.find(x => x.id === p.id) || null;
    L.push(['COMPARAÇÃO COM ' + ant.mesLabel.toUpperCase()]);
    L.push(['', ant.mesLabel, fech.mesLabel, 'Diferença']);
    const linha = (rot, vAnt, vAtu, moeda) => {
      const fmt = moeda ? fechMo : fechNu;
      L.push([rot, fmt(vAnt), fmt(vAtu), fmt(vAtu - vAnt)]);
    };
    if(p.ehVendedor) linha('Aparelhos vendidos', a ? a.units : 0, p.units, false);
    if(p.ehAtendente) linha('Bruto de acessórios', a ? a.brutoAcess : 0, p.brutoAcess, true);
    if(p.ehAtendente) linha('Lucro de acessórios', a ? a.la : 0, p.la, true);
    linha('Comissão', a ? a.comm : 0, p.comm, true);
    linha('Total recebido', a ? a.total : 0, p.total, true);
    if(!a) L.push(['', '', '', 'não estava na folha em ' + ant.mesLabel]);
  } else {
    L.push(['COMPARAÇÃO COM O MÊS ANTERIOR']);
    L.push(['Indisponível — o período selecionado não é um mês fechado.']);
  }
  vazio();

  // -- Vendas: vendedor ----------------------------------------------------
  if(p.ehVendedor){
    L.push(['VENDAS COMO VENDEDOR — ' + p.linhasVo.length + ' pedidos · ' + p.units + ' aparelhos']);
    L.push(['A comissão da venda é o quanto ela acrescentou no acumulado do mês: as '
            + VO_CURVA.corte + ' primeiras unidades valem ' + brl(VO_CURVA.base)
            + ' e as seguintes ' + brl(VO_CURVA.bonus) + '.']);
    L.push(['Venda', 'Data', 'Cliente', 'Aparelhos', 'R$/un', 'Comissão']);
    p.linhasVo.forEach(l => L.push([
      fechId(l.id), fechData(l.data), l.cliente || '—',
      fechNu(l.units), fechMo(l.taxa), fechMo(l.comissao)
    ]));
    L.push(['TOTAL', '', '', fechNu(p.units), '', fechMo(p.commVo)]);
    vazio();
  }

  // -- Vendas: atendente ---------------------------------------------------
  if(p.ehAtendente){
    L.push(['VENDAS COMO ATENDENTE — ' + p.linhasAt.length + ' vendas · '
            + p.qtAcess + ' acessórios']);
    L.push(['Uma linha por venda (não por acessório). A comissão da linha é 25% do lucro, '
            + 'arredondada ao real de forma que a coluna feche exatamente com o resumo.']);
    L.push(['Venda', 'Data', 'Cliente', 'Itens', 'Bruto acessórios', 'Lucro', 'Comissão (25%)']);
    p.linhasAt.forEach(l => L.push([
      l.ajuste ? 'ajuste' : fechId(l.id),
      l.ajuste ? '—' : fechData(l.data),
      l.ajuste ? ('ajuste manual: ' + (l.desc||'')) : (l.cliente || '—'),
      fechNu(l.qt), fechMo(l.bruto), fechMo(l.lucro), fechMo(l.comissao)
    ]));
    L.push(['TOTAL', '', '', fechNu(p.qtAcess), fechMo(p.brutoAcess), fechMo(p.la), fechMo(p.commAt)]);
  }

  const ws = XLSX.utils.aoa_to_sheet(L);
  ws['!cols'] = [{wch:12},{wch:12},{wch:38},{wch:11},{wch:16},{wch:13},{wch:14}];
  return ws;
}

// -- Aba geral --------------------------------------------------------------
function fechAbaGeral(fech, ant){
  const L = [];
  const vazio = () => L.push([]);
  const t = fech.totais;

  L.push(['FECHAMENTO DA EQUIPE — ' + fech.mesLabel.toUpperCase()]);
  L.push(['Documento gerado em ' + fechDataHora(fech.geradoEm)
          + '  ·  loja: ' + (fech.loja === 'ambas' ? 'Cart + Urban' : fech.loja)]);
  L.push(['Os valores refletem os dados no momento da geração. O bônus de 5% depende do lucro '
          + 'de acessórios, que muda quando roda o resync — gerar de novo depois do resync do mês.']);
  vazio();

  L.push(['BASE DO MÊS']);
  L.push(['Aparelhos vendidos', fechNu(fech.base.aparelhos), fechTextoMetaColetivaDev(fech)]);
  L.push(['Acessórios (bruto)', fechMo(fech.base.acessBruto), fechTextoMetaColetivaAcess(fech)]);
  L.push(['Acessórios (lucro)', fechMo(fech.base.acessLucro), 'base da comissão de atendente e do bônus de 5%']);
  L.push(['Bônus coletivo por pessoa', fechMo(fech.bonusCol), 'pago cheio para cada colaborador']);
  L.push(['Vendas no período', fechNu(fech.base.vendas), '']);
  vazio();

  const ranking = fech.pessoas.slice().sort((a,b) => b.total - a.total);
  L.push(['FOLHA — TODOS LADO A LADO (ordenado por total)']);
  L.push(['#', 'Pessoa', 'Cargo', 'Aparelhos', 'Bruto acess.', 'Lucro acess.',
          'Salário', 'Extras', 'Comissão', '5% acess.', 'Meta indiv.', 'Meta coletiva', 'TOTAL']);
  ranking.forEach((p, i) => L.push([
    fechNu(i+1), p.nome, p.cargo || '',
    fechNu(p.units), fechMo(p.brutoAcess), fechMo(p.la),
    fechMo(p.sal), fechMo(p.extrasTot), fechMo(p.comm), fechMo(p.bonus5),
    fechMo(p.bonusMeta), fechMo(p.bonusCol), fechMo(p.total)
  ]));
  L.push(['', 'TOTAL', '',
    fechNu(ranking.reduce((a,p) => a+p.units, 0)),
    fechMo(ranking.reduce((a,p) => a+p.brutoAcess, 0)),
    fechMo(ranking.reduce((a,p) => a+p.la, 0)),
    fechMo(t.sal), fechMo(t.extras), fechMo(t.comm), fechMo(t.bonus5),
    fechMo(t.bonusMeta), fechMo(t.bonusCol), fechMo(t.folha)]);
  vazio();

  L.push(['RESULTADO']);
  L.push(['Lucro das vendas no mês', fechMo(fech.base.lucro), 'já líquido da taxa de cartão']);
  L.push(['(-) Folha completa', fechMo(-t.folha), 'salário + extras + comissão + bônus']);
  L.push(['(-) Demais custos do mês', fechMo(-t.custosForaFolha), 'Custos, exceto a área Funcionários']);
  L.push(['= Resultado após folha e custos', fechMo(t.liquido), '']);
  vazio();

  if(ant){
    L.push(['COMPARAÇÃO COM ' + ant.mesLabel.toUpperCase()]);
    L.push(['', ant.mesLabel, fech.mesLabel, 'Diferença']);
    const cmp = (rot, va, vc, moeda) => {
      const fmt = moeda ? fechMo : fechNu;
      L.push([rot, fmt(va), fmt(vc), fmt(vc-va)]);
    };
    cmp('Aparelhos vendidos', ant.base.aparelhos, fech.base.aparelhos, false);
    cmp('Acessórios (bruto)', ant.base.acessBruto, fech.base.acessBruto, true);
    cmp('Folha completa', ant.totais.folha, t.folha, true);
    vazio();
  }

  if(fech.avisos.length){
    L.push(['AVISOS']);
    fech.avisos.forEach(a => L.push([a]));
  }

  const ws = XLSX.utils.aoa_to_sheet(L);
  ws['!cols'] = [{wch:5},{wch:14},{wch:22},{wch:11},{wch:14},{wch:14},
                 {wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:13},{wch:13}];
  return ws;
}

// -- Conferencia ------------------------------------------------------------
// A coluna de comissao TEM que fechar com o resumo -- e a promessa do
// documento. Se nao fechar, o arquivo sai com o aviso em vez de sair mentindo.
function fechConferir(fech){
  const erros = [];
  fech.pessoas.forEach(p => {
    const sVo = p.linhasVo.reduce((a,l) => a+l.comissao, 0);
    const sAt = p.linhasAt.reduce((a,l) => a+l.comissao, 0);
    if(Math.round(sVo) !== Math.round(p.commVo))
      erros.push(p.nome + ': soma das vendas como vendedor ' + brl(sVo)
                 + ' ≠ comissão do resumo ' + brl(p.commVo));
    if(Math.round(sAt) !== Math.round(p.commAt))
      erros.push(p.nome + ': soma das vendas como atendente ' + brl(sAt)
                 + ' ≠ comissão do resumo ' + brl(p.commAt));
  });
  const somaTotais = fech.pessoas.reduce((a,p) => a+p.total, 0);
  if(Math.round(somaTotais) !== Math.round(fech.totais.folha))
    erros.push('soma dos totais ' + brl(somaTotais) + ' ≠ total da folha ' + brl(fech.totais.folha));
  return erros;
}

// ===========================================================================
// VERSAO PDF — o documento que o dono compartilha com os socios
//
// Mesma fonte (fechamentoEquipe()), meio diferente: o xlsx e instrumento de
// conferencia (ordena, filtra, soma); o PDF e o documento que se manda pra
// alguem. Uma folha por pessoa.
//
// Sem biblioteca: monta o HTML com os componentes normais (UI.*) e usa o
// window.print() do navegador -> "Salvar em PDF". No iPhone sai pelo share
// sheet. As regras de quebra de pagina e o tema claro no papel vivem em
// css/print.css -- aqui nao se escreve estilo na mao.
//
// Vai para socios (Marcella e Gustavo), entao mostra custo, lucro e margem
// igual a planilha.
// ===========================================================================

function fechSecao(titulo, corpo){
  return `<div class="fp-sec"><div class="fp-sec-tit">${titulo}</div>${corpo}</div>`;
}

// Resumo do pagamento: as mesmas linhas do resumo da aba da planilha.
function fechLinhasPagamento(p, fech){
  const L = [];
  if(p.sal > 0) L.push(['Salário', p.sal,
    p.salOrigem === 'custos' ? p.salDesc : '⚠ sem lançamento em Custos — valor da tabela']);
  p.extras.forEach(e => L.push([e.desc, e.valor, e.obs || 'lançamento em Custos']));
  if(p.commVo > 0) L.push(['Comissão de vendedor', p.commVo,
    p.units + ' aparelhos · ' + brl(VO_CURVA.base) + '/un até ' + VO_CURVA.corte
    + ' un, ' + brl(VO_CURVA.bonus) + '/un acima']);
  if(p.commAt > 0) L.push(['Comissão de atendente', p.commAt,
    '25% do lucro dos acessórios que atendeu']);
  if(p.bonus5 > 0) L.push(['Bônus 5% acessórios', p.bonus5,
    '5% do lucro de acessórios da loja (' + brl(fech.base.acessLucro) + ')']);
  if(p.bonusMeta > 0) L.push(['Bônus meta individual', p.bonusMeta,
    'bruto ' + brl(p.brutoAcess) + ' → faixa ' + brl(p.meta.faixa)]);
  if(p.bonusCol > 0) L.push(['Bônus meta coletiva', p.bonusCol,
    'metas da loja no mês, pago cheio para cada pessoa']);
  return L;
}

function fechPaginaPessoa(p, fech, ant){
  const a = ant ? (ant.pessoas.find(x => x.id === p.id) || null) : null;

  const pagamento = UI.tabela({
    colunas: [{titulo:'Item'}, {titulo:'Valor', num:true, largura:'110px'}, {titulo:'De onde vem'}],
    linhas: fechLinhasPagamento(p, fech).map(([rot, val, de]) =>
      [rot, {v: money(val), num:true}, {v:`<span class="fp-nota">${UI.esc(de)}</span>`}]),
  });

  const metas = [];
  if(p.ehAtendente) metas.push(['Individual — bruto de acessórios', money(p.brutoAcess),
    fechTextoMetaIndividual(p.meta)]);
  if(p.ehVendedor) metas.push(['Curva de comissão — aparelhos', p.units,
    p.units > VO_CURVA.corte
      ? 'passou de ' + VO_CURVA.corte + ' un → ' + brl(VO_CURVA.bonus) + '/un nas '
        + (p.units - VO_CURVA.corte) + ' seguintes'
      : 'faltaram ' + Math.max(0, VO_CURVA.corte + 1 - p.units) + ' aparelhos para '
        + brl(VO_CURVA.bonus) + '/un']);
  metas.push(['Coletiva — aparelhos da loja', fech.base.aparelhos, fechTextoMetaColetivaDev(fech)]);
  metas.push(['Coletiva — acessórios da loja', money(fech.base.acessBruto), fechTextoMetaColetivaAcess(fech)]);

  const tabelaMetas = UI.tabela({
    colunas: [{titulo:'Meta'}, {titulo:'Onde chegou', num:true, largura:'110px'}, {titulo:'Situação'}],
    linhas: metas.map(([rot, val, sit]) =>
      [rot, {v: val, num:true}, {v:`<span class="fp-nota">${UI.esc(sit)}</span>`}]),
  });

  // Comparativo com o mes anterior
  let comparativo = '';
  if(ant){
    const linhas = [];
    const cmp = (rot, va, vc, moeda) => {
      const d = vc - va;
      const f = moeda ? money : (x => String(x));
      linhas.push([rot, {v:f(va), num:true}, {v:f(vc), num:true},
        {v:`<span class="${d>0?'ok':d<0?'critico':''}">${d>0?'+':''}${f(d)}</span>`, num:true}]);
    };
    if(p.ehVendedor)  cmp('Aparelhos vendidos', a?a.units:0, p.units, false);
    if(p.ehAtendente) cmp('Bruto de acessórios', a?a.brutoAcess:0, p.brutoAcess, true);
    if(p.ehAtendente) cmp('Lucro de acessórios', a?a.la:0, p.la, true);
    cmp('Comissão', a?a.comm:0, p.comm, true);
    cmp('Total recebido', a?a.total:0, p.total, true);
    comparativo = fechSecao('Comparação com ' + ant.mesLabel, UI.tabela({
      colunas: [{titulo:''}, {titulo:ant.mesLabel, num:true}, {titulo:fech.mesLabel, num:true},
                {titulo:'Diferença', num:true}],
      linhas,
    }) + (a ? '' : `<div class="fp-nota">Não estava na folha em ${ant.mesLabel}.</div>`));
  }

  // Vendas
  let vendas = '';
  if(p.ehVendedor){
    vendas += fechSecao(
      `Vendas como vendedor — ${p.linhasVo.length} pedidos · ${p.units} aparelhos`,
      UI.tabela({
        colunas: [{titulo:'Venda'}, {titulo:'Data'}, {titulo:'Cliente'},
                  {titulo:'Aparelhos', num:true}, {titulo:'R$/un', num:true}, {titulo:'Comissão', num:true}],
        linhas: p.linhasVo.map(l => [
          {v:l.id, classe:'mono'}, fechData(l.data), UI.esc(l.cliente || '—'),
          {v:l.units, num:true}, {v:money(l.taxa), num:true},
          {v:`<b>${money(l.comissao)}</b>`, num:true},
        ]).concat([[{v:'<b>TOTAL</b>'}, '', '', {v:`<b>${p.units}</b>`, num:true}, '',
                    {v:`<b>${money(p.commVo)}</b>`, num:true}]]),
      })
      + `<div class="fp-nota">A comissão da venda é o quanto ela acrescentou no acumulado do mês:
         as ${VO_CURVA.corte} primeiras unidades valem ${brl(VO_CURVA.base)} e as seguintes
         ${brl(VO_CURVA.bonus)}.</div>`);
  }
  if(p.ehAtendente){
    vendas += fechSecao(
      `Vendas como atendente — ${p.linhasAt.length} vendas · ${p.qtAcess} acessórios`,
      UI.tabela({
        colunas: [{titulo:'Venda'}, {titulo:'Data'}, {titulo:'Cliente'}, {titulo:'Itens', num:true},
                  {titulo:'Bruto', num:true}, {titulo:'Lucro', num:true}, {titulo:'Comissão', num:true}],
        linhas: p.linhasAt.map(l => [
          {v: l.ajuste ? 'ajuste' : l.id, classe:'mono'},
          l.ajuste ? '—' : fechData(l.data),
          UI.esc(l.ajuste ? ('ajuste manual: ' + (l.desc||'')) : (l.cliente || '—')),
          {v:l.qt, num:true}, {v:money(l.bruto), num:true}, {v:money(l.lucro), num:true},
          {v:`<b>${money(l.comissao)}</b>`, num:true},
        ]).concat([[{v:'<b>TOTAL</b>'}, '', '', {v:`<b>${p.qtAcess}</b>`, num:true},
                    {v:`<b>${money(p.brutoAcess)}</b>`, num:true},
                    {v:`<b>${money(p.la)}</b>`, num:true},
                    {v:`<b>${money(p.commAt)}</b>`, num:true}]]),
      })
      + `<div class="fp-nota">Uma linha por venda (não por acessório). A comissão da linha é 25%
         do lucro, arredondada ao real de forma que a coluna feche exatamente com o resumo.</div>`);
  }

  return `<div class="fp-pagina">
    <div class="fp-cab">
      <div>
        <div class="fp-cab-nome">${UI.esc(p.nome)}</div>
        <div class="fp-cab-sub">${UI.esc(p.nomeCompleto || '')}${p.cargo ? ' · '+UI.esc(p.cargo) : ''}</div>
      </div>
      <div class="fp-cab-mes">Fechamento<br><b>${fech.mesLabel}</b></div>
    </div>
    <div class="fp-total">
      <span class="fp-total-rot">Total a receber</span>
      <span class="fp-total-val">${money(p.total)}</span>
    </div>
    ${fechSecao('O que entra no pagamento', pagamento)}
    ${fechSecao('Metas — onde chegou e quanto faltou', tabelaMetas)}
    ${comparativo}
    ${vendas}
    <div class="fp-rodape">
      Gerado em ${fechDataHora(fech.geradoEm)} ·
      loja: ${fech.loja === 'ambas' ? 'Cart + Urban' : UI.esc(fech.loja)} ·
      fonte: painel Phone Cart
    </div>
  </div>`;
}

function fechPaginaGeral(fech, ant){
  const t = fech.totais;
  const temExtras = fech.pessoas.some(p => p.extrasTot !== 0);
  const ranking = fech.pessoas.slice().sort((a,b) => b.total - a.total);

  const colunas = [{titulo:'#', num:true}, {titulo:'Pessoa'}, {titulo:'Aparelhos', num:true},
    {titulo:'Bruto acess.', num:true}, {titulo:'Salário', num:true}]
    .concat(temExtras ? [{titulo:'Extras', num:true}] : [])
    .concat([{titulo:'Comissão', num:true}, {titulo:'Bônus', num:true}, {titulo:'Total', num:true}]);

  const linhas = ranking.map((p,i) => [
    {v:i+1, num:true}, UI.esc(p.nome), {v:p.units||'—', num:true},
    {v:p.brutoAcess ? money(p.brutoAcess) : '—', num:true},
    {v:money(p.sal), num:true},
  ].concat(temExtras ? [{v:p.extrasTot ? money(p.extrasTot) : '—', num:true}] : [])
   .concat([
    {v:p.comm ? money(p.comm) : '—', num:true},
    {v:money(p.bonus5 + p.bonusMeta + p.bonusCol), num:true},
    {v:`<b>${money(p.total)}</b>`, num:true},
  ]));

  linhas.push(['', {v:'<b>TOTAL</b>'},
    {v:`<b>${ranking.reduce((a,p)=>a+p.units,0)}</b>`, num:true},
    {v:`<b>${money(ranking.reduce((a,p)=>a+p.brutoAcess,0))}</b>`, num:true},
    {v:`<b>${money(t.sal)}</b>`, num:true}]
    .concat(temExtras ? [{v:`<b>${money(t.extras)}</b>`, num:true}] : [])
    .concat([
      {v:`<b>${money(t.comm)}</b>`, num:true},
      {v:`<b>${money(t.bonus5 + t.bonusMeta + t.bonusCol)}</b>`, num:true},
      {v:`<b>${money(t.folha)}</b>`, num:true},
    ]));

  const base = UI.kpis([
    {rotulo:'Aparelhos vendidos', valor:fech.base.aparelhos, sub:fechTextoMetaColetivaDev(fech)},
    {rotulo:'Acessórios (bruto)', valor:money(fech.base.acessBruto), sub:fechTextoMetaColetivaAcess(fech)},
    {rotulo:'Folha completa', valor:money(t.folha), tom:'marca',
     sub:`${fech.pessoas.length} pessoas · bônus coletivo ${brl(fech.bonusCol)} cada`},
    {rotulo:'Resultado após folha e custos', valor:money(t.liquido),
     tom: t.liquido > 0 ? 'ok' : 'critico',
     sub:`lucro ${brl(fech.base.lucro)} − folha − ${brl(t.custosForaFolha)} de outros custos`},
  ]);

  let comparativo = '';
  if(ant){
    comparativo = fechSecao('Comparação com ' + ant.mesLabel, UI.tabela({
      colunas:[{titulo:''}, {titulo:ant.mesLabel, num:true}, {titulo:fech.mesLabel, num:true},
               {titulo:'Diferença', num:true}],
      linhas:[
        ['Aparelhos vendidos', {v:ant.base.aparelhos, num:true}, {v:fech.base.aparelhos, num:true},
         {v:(fech.base.aparelhos-ant.base.aparelhos>0?'+':'')+(fech.base.aparelhos-ant.base.aparelhos), num:true}],
        ['Acessórios (bruto)', {v:money(ant.base.acessBruto), num:true}, {v:money(fech.base.acessBruto), num:true},
         {v:money(fech.base.acessBruto-ant.base.acessBruto), num:true}],
        ['Folha completa', {v:money(ant.totais.folha), num:true}, {v:money(t.folha), num:true},
         {v:money(t.folha-ant.totais.folha), num:true}],
      ],
    }));
  }

  const avisos = fech.avisos.length
    ? fechSecao('Avisos', fech.avisos.map(x => `<div class="fp-nota">• ${UI.esc(x)}</div>`).join(''))
    : '';

  return `<div class="fp-pagina">
    <div class="fp-cab">
      <div>
        <div class="fp-cab-nome">Fechamento da equipe</div>
        <div class="fp-cab-sub">Phone Cart · Urban</div>
      </div>
      <div class="fp-cab-mes"><b>${fech.mesLabel}</b></div>
    </div>
    ${base}
    ${fechSecao('Folha — todos lado a lado', UI.tabela({colunas, linhas}))}
    ${comparativo}
    ${avisos}
    <div class="fp-rodape">
      Gerado em ${fechDataHora(fech.geradoEm)} ·
      loja: ${fech.loja === 'ambas' ? 'Cart + Urban' : UI.esc(fech.loja)} ·
      fonte: painel Phone Cart. O bônus de 5% depende do lucro de acessórios, que muda
      quando roda o resync — gerar de novo depois do resync do mês.
    </div>
  </div>`;
}

// so: id de uma pessoa para gerar so a folha dela; vazio = documento completo
function fechamentoPDF(so){
  const fech = fechamentoEquipe();
  if(!fech.pessoas.length){
    alert('Nenhum colaborador na folha deste período.');
    return;
  }
  const erros = fechConferir(fech);
  if(erros.length) fech.avisos.push(...erros.map(e => '⚠ CONFERÊNCIA: ' + e));

  const ant = fechamentoEquipeRef(fechamentoMesAnterior(fech.ref));
  const pessoas = so ? fech.pessoas.filter(p => p.id === so)
                     : fech.pessoas.slice().sort((a,b) => b.total - a.total);

  const corpo = (so ? '' : fechPaginaGeral(fech, ant))
              + pessoas.map(p => fechPaginaPessoa(p, fech, ant)).join('');

  document.querySelector('.fp-overlay')?.remove();
  const el = document.createElement('div');
  el.className = 'fp-overlay';
  el.innerHTML = `
    <div class="fp-bar">
      <span class="fp-bar-tit">Fechamento ${fech.mesLabel}${so ? ' · '+UI.esc(pessoas[0]?.nome||'') : ''} — confira e use Imprimir para salvar em PDF</span>
      <span class="fp-bar-acoes">
        ${UI.btn('🖨 Imprimir / PDF', {onclick:'window.print()', variante:'primario', sm:true})}
        ${UI.btn('Fechar', {onclick:'fechFecharPDF()', sm:true})}
      </span>
    </div>
    <div class="fp-doc">${corpo}</div>`;
  document.body.appendChild(el);
  el.scrollTop = 0;
}

function fechFecharPDF(){ document.querySelector('.fp-overlay')?.remove(); }

// Escolher o que gerar: documento inteiro ou a folha de uma pessoa. O botao no
// card da pessoa ja abre a dela direto; este menu existe para nao ter que
// entrar e sair de 10 cards quando o dono quer os individuais em sequencia.
function fechamentoPDFEscolher(){
  const fech = fechamentoEquipe();
  if(!fech.pessoas.length){
    alert('Nenhum colaborador na folha deste período.');
    return;
  }
  const pessoas = fech.pessoas.slice().sort((a,b) => b.total - a.total);
  const corpo = `
    <div class="fp-escolha">
      ${UI.btn('📄 Documento completo <span>' + fech.mesLabel + ' · '
        + pessoas.length + ' pessoas + geral</span>',
        {onclick:'UI.fecharModal();fechamentoPDF()', variante:'primario'})}
      <div class="fp-escolha-sep">ou a folha de uma pessoa só</div>
      <div class="fp-escolha-grade">
        ${pessoas.map(p => UI.btn(UI.esc(p.nome) + '<span>' + brl(p.total) + '</span>',
          {onclick:`UI.fecharModal();fechamentoPDF('${p.id}')`})).join('')}
      </div>
    </div>`;
  UI.abrirModal({titulo:'📄 Gerar PDF — ' + fech.mesLabel, corpo});
}

// -- Acao do botao ----------------------------------------------------------
function exportarFechamento(btn){
  const rotulo = btn ? btn.innerHTML : null;
  const ocupado = txt => { if(btn){ btn.disabled = true; btn.innerHTML = txt; } };
  const solto   = ()  => { if(btn){ btn.disabled = false; btn.innerHTML = rotulo; } };

  ocupado('⏳ Gerando…');
  fechCarregarXLSX().then(() => {
    const fech = fechamentoEquipe();
    if(!fech.pessoas.length) throw new Error('nenhum colaborador na folha deste período');

    const erros = fechConferir(fech);
    if(erros.length) fech.avisos.push(...erros.map(e => '⚠ CONFERÊNCIA: ' + e));

    // Mes anterior pelo MESMO caminho (troca o contexto, mede, restaura)
    const ant = fechamentoEquipeRef(fechamentoMesAnterior(fech.ref));

    const wb = XLSX.utils.book_new();
    const usados = new Set();
    XLSX.utils.book_append_sheet(wb, fechAbaGeral(fech, ant), fechNomeAba('Geral', usados));
    fech.pessoas.slice().sort((a,b) => b.total - a.total).forEach(p =>
      XLSX.utils.book_append_sheet(wb, fechAbaPessoa(p, fech, ant), fechNomeAba(p.nome, usados)));

    const nome = 'fechamento-' + (fech.ref || 'periodo')
               + (fech.loja === 'ambas' ? '' : '-' + fech.loja) + '.xlsx';
    XLSX.writeFile(wb, nome);

    if(erros.length){
      alert('A planilha foi gerada, mas a conferência encontrou divergência:\n\n'
            + erros.join('\n')
            + '\n\nO arquivo traz esses avisos na aba Geral. Não use como prova antes de resolver.');
    }
    solto();
  }).catch(e => {
    console.error('exportarFechamento:', e);
    solto();
    alert('Não foi possível gerar a planilha.\n\n' + (e && e.message ? e.message : e)
          + '\n\nNada foi alterado — dá pra tentar de novo.');
  });
}
