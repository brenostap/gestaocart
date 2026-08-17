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
    const [resumo, vendas] = await Promise.all([
      sbGet('v_minha_comissao_mes', `mes=eq.${mes}`, 1),
      sbGet('v_minhas_vendas', `data_saida=gte.${mes}-01&order=data_saida.desc`, 500),
    ]);
    mdResumo = (resumo && resumo[0]) || null;
    mdVendas = vendas || [];
  }catch(e){
    console.warn('[meudia] carga falhou:', e.message);
    mdErro = e.message || 'falha ao carregar';
    mdResumo = null; mdVendas = [];
  }
  mdCarregado = true;
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
  const total  = commVo + commAt;

  // -- Herói: uma métrica só, que é a pergunta que a pessoa abre o app pra fazer
  const heroi = `<div class="md-heroi">
    <span class="md-heroi-rot">Comissão de ${mdRotuloMes(mes)}</span>
    <span class="md-heroi-val">${brl(total)}</span>
    <span class="md-heroi-sub">${mdLinhaComposicao(commVo, commAt)}</span>
  </div>`;

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

  // -- Minhas vendas do mês
  const linhas = mdVendas.slice(0, 60).map(v => [
    mdDia(v.data_saida),
    UI.esc(v.cliente_nome || '—'),
    UI.badge(v.loja === 'urban' ? 'Urban' : 'Cart', v.loja === 'urban' ? 'alerta' : 'marca'),
    mdPapelNaVenda(v),
    { v: brl(Number(v.valor_total || 0)), num:true },
  ]);
  const tabela = UI.card({
    titulo:'Minhas vendas do mês',
    sub: String(mdVendas.length),
    flush:true,
    corpo: UI.tabela({
      colunas:[{titulo:'Dia'},{titulo:'Cliente'},{titulo:'Loja'},{titulo:'Meu papel'},{titulo:'Valor', num:true}],
      linhas,
      vazio: UI.vazio({ titulo:'Nenhuma venda ainda neste mês',
        texto:'Venda registrada com o seu nome na observação aparece aqui.' })
    })
  });

  return `<div class="md-tela">
    <div class="md-topo">
      <div class="md-ola">Olá${nome ? ', '+UI.esc(nome.split(' ')[0]) : ''}</div>
      ${heroi}
    </div>
    ${blocoVo}${blocoAt}${tabela}
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

function mdLinhaComposicao(commVo, commAt){
  const p = [];
  if(mdTemVo()) p.push(`${brl(commVo)} de aparelho`);
  if(mdTemAt()) p.push(`${brl(commAt)} de acessório`);
  return p.join(' + ') || 'Sem comissão neste mês ainda.';
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
