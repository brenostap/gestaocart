// ============================================================================
// SHELL — sidebar (desktop) + bottom-tabs (mobile)
// O contexto (loja + periodo) vive aqui e NAO reinicia ao trocar de secao,
// conforme o brief §7.2. Antes cada tela renderizava a propria copia.
// ============================================================================

const ICO = {
  meudia:    '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.4"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/></svg>',
  vitrine:   '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>',
  consulta:  '<svg viewBox="0 0 24 24"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4L3 21l1.1-3.4A8.4 8.4 0 1 1 21 11.5Z"/><path d="M8.5 11.5h7M8.5 8.5h4"/></svg>',
  dash:      '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
  vendas:    '<svg viewBox="0 0 24 24"><path d="M3 3h2l2.6 12.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L21 8H6"/><circle cx="10" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/></svg>',
  compras:   '<svg viewBox="0 0 24 24"><path d="M6 2 3 6v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
  estoque:   '<svg viewBox="0 0 24 24"><path d="M21 8.5v7a2 2 0 0 1-1 1.7l-7 3.9a2 2 0 0 1-2 0l-7-3.9a2 2 0 0 1-1-1.7v-7a2 2 0 0 1 1-1.7l7-3.9a2 2 0 0 1 2 0l7 3.9a2 2 0 0 1 1 1.7Z"/><path d="m3.5 7.5 8.5 4.8 8.5-4.8M12 21v-8.7"/></svg>',
  movs:      '<svg viewBox="0 0 24 24"><path d="M7 4v13m0 0-3-3m3 3 3-3M17 20V7m0 0-3 3m3-3 3 3"/></svg>',
  bancada:   '<svg viewBox="0 0 24 24"><path d="M14.7 6.3a4.5 4.5 0 0 0 5.9 5.9L21 12l-8 8a2.8 2.8 0 0 1-4-4l8-8Z"/><path d="m6.5 17.5-3 3"/></svg>',
  equipe:    '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16.5 5.2a3.2 3.2 0 0 1 0 5.6M18 20a6.4 6.4 0 0 0-2-4.6"/></svg>',
  tabela:    '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9.5h18M3 15h18M9.5 9.5V20"/></svg>',
  contas:    '<svg viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="13" rx="2"/><path d="M2 10.5h20"/><path d="M6 15.5h4"/></svg>',
  custos:    '<svg viewBox="0 0 24 24"><path d="M12 2v20"/><path d="M17 6.5c0-1.9-2.2-3-5-3s-5 1.1-5 3 2.2 2.7 5 3.2 5 1.3 5 3.3-2.2 3.2-5 3.2-5-1.3-5-3.2"/></svg>',
  fechamento:'<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/><path d="m9 15 2 2 4-4"/></svg>',
};

const NAV = [
  { grupo:'Operação',  itens:[
    // Primeiro item de propósito: pra quem tem chave, é a tela que ele abre.
    {id:'meudia',  label:'Meu dia'},
    // Busca de aparelho pra responder o cliente. Vive na Operação porque é isso
    // que ela é: trabalho de balcão, não relatório.
    // ⚠️ O id continua 'vitrine' (arquivo, funções vit*, MATRIZ_ACESSO). Só o
    // rótulo virou "Estoque" em 17/ago/2026 — mesmo padrão de bancada/Assistência.
    {id:'vitrine', label:'Estoque'},
    // Achar a venda de quem chegou com problema. Fica na Operacao pelo mesmo
    // motivo da Vitrine: e trabalho de balcao, nao relatorio.
    {id:'consulta', label:'Pós-venda'},
    {id:'dash',    label:'Dashboard'},
    {id:'vendas',  label:'Vendas'},
    {id:'compras', label:'Compras'},
    {id:'estoque', label:'Estoque'},
    // O id continua 'bancada' (tabela, arquivo, funcoes bnc*). So o rotulo mudou.
    {id:'bancada', label:'Assistência'},
    {id:'movs',    label:'Movimentações'},
  ]},
  { grupo:'Gestão', itens:[
    {id:'equipe',  label:'Equipe'},
    // O que foi medido, o que ficou decidido e o que esta em aberto -- e com
    // quem. Nasceu em 27/ago/2026 porque commit e docs/ nao sao escritos pro
    // dono. Tambem e o changelog que a analise de serie exige: sem data de
    // mudanca de prompt, comparar antes/depois vira arqueologia.
    {id:'diario',  label:'Diário'},
    {id:'tabela',  label:'Tabela de preços'},
  ]},
  { grupo:'Financeiro', itens:[
    {id:'contas',     label:'Contas'},
    {id:'custos',     label:'Custos'},
    {id:'fechamento', label:'Fechamento', emBreve:true},
  ]},
];

// Bottom-tab do mobile: 4 slots fixos + "Mais" (brief §5)
const NAV_MOBILE = ['dash','vendas','estoque','equipe','custos'];
const ICO_MAIS = '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>';

// A folha do "Mais" vive fora do #content: ela precisa abrir de qualquer tela,
// e o renderContent() redesenha o miolo inteiro a cada troca de aba.
function abrirNavMais(){
  fecharNavMais();
  const { mais } = navMobile();
  const itens = NAV.flatMap(g => g.itens).filter(i => mais.includes(i.id) && podeVer(i.id));
  const el = document.createElement('div');
  el.id = 'nav-mais';
  el.className = 'c-modal-overlay';
  el.onclick = e => { if(e.target === el) fecharNavMais(); };
  el.innerHTML = `<div class="c-modal nav-mais-sheet">
    <div class="c-modal-head"><div class="c-modal-title">Todas as telas</div>
      <button class="c-btn c-btn-sm sutil" onclick="fecharNavMais()">Fechar</button></div>
    <div class="c-modal-body nav-mais-grade">
      ${itens.map(i => `<button class="nav-mais-item${currentTab===i.id?' ativo':''}"
          onclick="fecharNavMais();setTab('${i.id}')">
          <span class="nav-mais-ico">${ICO[i.id]||''}</span>${i.label}</button>`).join('')}
    </div></div>`;
  document.body.appendChild(el);
}
function fecharNavMais(){
  const el = document.getElementById('nav-mais');
  if(el) el.remove();
}

// ⚠️ Os 5 slots acima foram escolhidos pro socio, que tem 11 telas. Quem tem
// POUCAS telas nao cabe nessa regra: em 13/ago/2026 o Vitinho entrou pela
// primeira vez e viu so "Estoque" na barra de baixo -- `bancada` nao estava nos
// 5 slots, e a intersecao com o papel dele sobrou uma tela so. No desktop as
// duas apareciam, entao o bug so existia no celular, que e justo onde ele usa.
// Regra: papel que cabe nos 5 slots mostra TUDO que pode ver.
// ⚠️ Ate 15/ago isto devolvia SO os 5 slots, e o resto ficava inalcancavel no
// celular: o socio tem 11 telas e seis delas -- Compras, Assistencia,
// Movimentacoes, Tabela, Contas, Fechamento -- nao existiam no telefone. Nao
// havia como rolar a barra nem descobrir que faltava coisa; simplesmente nao
// estavam la. Agora as 4 primeiras ficam fixas e o resto vai pro botao "Mais".
function navMobile(){
  const permitidas = telasDoUsuario();
  if(permitidas.length <= 5) return { fixas: permitidas, mais: [] };
  const fixas = NAV_MOBILE.filter(id => permitidas.includes(id)).slice(0, 4);
  return { fixas, mais: permitidas.filter(id => !fixas.includes(id)) };
}

// ---------------------------------------------------------------------------
// PERMISSAO — a matriz do brief §2. Hoje todos os usuarios sao socios; quando
// a fase de perfis chegar, basta papelAtual() passar a ler o perfil real.
// ---------------------------------------------------------------------------
// Bancada e operacao de loja, nao financeiro: quem atende precisa saber que o
// aparelho nao esta na prateleira antes de prometer.
const MATRIZ_ACESSO = {
  socio:     ['dash','vendas','compras','estoque','bancada','movs','equipe','tabela','contas','custos','fechamento','diario'],
  // Vitinho: so o que a bancada exige. Sem dash, sem vendas, sem preco.
  bancada:   ['estoque','bancada','tabela'],
  // Vendedor, atendente e quem faz as duas coisas. O que a pessoa FAZ nao esta
  // aqui -- esta nas chaves vo_key/at_key do perfil. Ver docs/PERFIS-E-ACESSO.md.
  // `tabela` entrou em 20/ago a pedido do dono: quem atende precisa do preco
  // oficial na mao, e ele ja chega mastigado pela view `v_tabela_precos`
  // (sem custo, sem margem) -- a mesma que a Vitrine usa.
  // ⚠️ `consulta` (Pos-venda) SAIU de todos os papeis em 02/set/2026, a pedido do
  // dono: "nao entendi e nao gostei, nao acho que seja necessario em nenhum
  // perfil". Ela tinha entrado no comercial em 26/ago e na bancada em 01/set.
  // O codigo de js/consulta.js e as views v_venda_consulta* continuam existindo
  // -- o que saiu foi o acesso. Se voltar, volta por aqui.
  // ⚠️ E cortina, nao fechadura: as views ainda dao SELECT pra `authenticated`.
  // Tirar do menu NAO impede quem tem login de ler pela API.
  comercial: ['meudia','vitrine','tabela'],
  gerente:   ['dash','vendas','estoque','bancada','movs','equipe'],
  vendedor:  ['dash','vendas','estoque','bancada'],
  atendente: ['dash','vendas','estoque','bancada'],
};

// ⚠️ `meudia` NAO e do papel, e da CHAVE. O Vitinho e `bancada` e atende no
// balcao (52 vendas em ago/2026): ele mantem Estoque e Assistencia E ganha esta
// tela. Papel diz o teto de dinheiro; chave diz o que e meu.
function temChaveComercial(){ return !!(meuPerfil && (meuPerfil.vo_key || meuPerfil.at_key)); }

// As telas que este usuario alcanca = as do papel + `meudia` se ele tem chave.
// Fonte unica de podeVer() e navMobile(): sem isso a barra do celular volta a
// esconder tela que existe no desktop, que ja aconteceu em 13/ago.
function telasDoUsuario(){
  const doPapel = MATRIZ_ACESSO[papelAtual()] || [];
  if(temChaveComercial() && !doPapel.includes('meudia')) return ['meudia', ...doPapel];
  return doPapel;
}

// ⚠️ Só 'socio' e 'bancada' têm RLS de verdade no banco. Os outros três seguem
// sendo PREVIA VISUAL do dono: criar um perfil 'vendedor' hoje daria uma tela
// de Vendas aberta lendo zero linha. Por isso o CHECK da tabela `perfis` só
// aceita os dois. Ver docs/PERFIS-E-ACESSO.md.
const PAPEIS_COM_RLS = ['socio','bancada','comercial'];
const PAPEIS = ['socio','bancada','comercial','gerente','vendedor','atendente'];
const LABEL_PAPEL = { socio:'Sócio', bancada:'Assistência', comercial:'Comercial',
                      gerente:'Gerente', vendedor:'Vendedor', atendente:'Atendente' };

// Papel de verdade do usuario logado: vem da tabela `perfis` (auth.js carrega).
// Padrao 'socio' quando o perfil nao carregou -- e escolha de UX, nao de
// seguranca: quem decide o que o banco entrega e o RLS. Se a leitura falhar por
// rede, o dono continua com o menu inteiro; se falhar por falta de perfil, o
// banco devolve zero linha e as telas ficam vazias -- que e o sintoma certo.
function papelReal(){
  if(meuPerfil && meuPerfil.papel) return meuPerfil.papel;
  // ⚠️ Duas ausencias diferentes, e so uma pode virar 'socio':
  //   leitura FALHOU (rede)      -> 'socio'. E o padrao documentado: o dono nao
  //                                 pode ficar travado por uma falha de rede, e
  //                                 quem decide o dado e o RLS, nao o menu.
  //   leitura OK, SEM LINHA      -> 'nenhum'. A pessoa nao tem perfil; abrir o
  //                                 menu inteiro de admin pra ela e mentira --
  //                                 ela ve Custos, Equipe e Compras com zero em
  //                                 tudo e conclui que o painel esta quebrado
  //                                 (ou que ela e admin). Aconteceu em 17/ago.
  return perfilLidoSemLinha ? 'nenhum' : 'socio';
}

// Quem só cuida da bancada nao precisa (nem deve) carregar venda, custo e folha.
function perfilSoBancada(){ return papelReal() === 'bancada'; }

// Quem nao tem tela que use loja+periodo nao precisa do seletor ocupando a
// sidebar. "Meu dia" e sempre o mes corrente e as duas lojas.
function semContextoLojaPeriodo(){
  return perfilSoBancada() || papelAtual() === 'comercial';
}

// So o dono. Usado pra decidir quem enxerga o seletor "Ver como".
function ehDono(){ return usuarioEmail === EMAIL_DONO; }

// "Ver como": o dono olha o painel com os olhos de outro papel sem deslogar.
// ⚠️ E PREVIA VISUAL, nao trava de seguranca: o RLS do banco continua liberando
// leitura pra qualquer usuario autenticado. A trava real so existe quando a fase
// de perfis descer pro RLS (docs/IDEIAS.md > Perfis / Permissoes).
function papelAtual(){
  return (papelPreview && ehDono()) ? papelPreview : papelReal();
}
function setPapelPreview(p){
  papelPreview = (p && p !== papelReal()) ? p : '';
  try{ localStorage.setItem('pc_papel_preview', papelPreview); }catch(e){}
  // A tela aberta pode nao existir para o papel escolhido (ex.: Custos para
  // vendedor). Sem isso o painel ficaria numa tela que sumiu do menu.
  if(!podeVer(currentTab)) currentTab = 'dash';
  renderShell();
  // A previa muda o que cada tela pode mostrar (money(), colunas de margem),
  // entao a tela precisa ser desenhada de novo, nao so o shell.
  if(typeof renderContent === 'function') renderContent();
}

// Faixa de aviso no topo do conteudo. Sem ela da pra esquecer que esta na previa
// e concluir que o painel "perdeu" o lucro.
function renderPreviewBar(){
  const el = document.getElementById('preview-bar');
  if(!el) return;
  const ativo = papelPreview && ehDono();
  el.style.display = ativo ? 'flex' : 'none';
  el.innerHTML = ativo
    ? `<span>Prévia: você está vendo o painel como <b>${LABEL_PAPEL[papelPreview]||papelPreview}</b>.</span>
       <button class="pv-btn" onclick="setPapelPreview('socio')">Voltar a sócio</button>`
    : '';
}

function podeVer(secao){ return telasDoUsuario().includes(secao); }

// Duas permissoes distintas, a pedido do dono:
//   VALOR  = por quanto foi vendido. O colaborador negociou o preco, entao ve.
//   MARGEM = custo e lucro. So socio.
// 'bancada' nao entra em nenhuma das duas: o Vitinho precisa do aparelho, nao
// do preco dele. Assim money() devolve '—' em qualquer tela que ele abrir.
const VE_VALOR  = ['socio','comercial','gerente','vendedor','atendente'];
const VE_MARGEM = ['socio'];

function podeVerValor(){  return VE_VALOR.includes(papelAtual()); }
function podeVerMargem(){ return VE_MARGEM.includes(papelAtual()); }

// Corrigir bateria/etiqueta/IMEI do estoque. Eixo proprio, e nao um degrau da
// escada de dinheiro: quem mexe no aparelho e quem sabe o dado, e e justamente
// o papel `bancada` -- que nao ve valor nenhum. 57% do estoque esta sem
// etiqueta e 45% sem bateria porque ninguem com essa informacao tinha onde por.
const PODE_CORRIGIR = ['socio','bancada'];
function podeCorrigirEstoque(){ return PODE_CORRIGIR.includes(papelAtual()); }

// Custo de SERVICO (o que a assistencia cobra) e categoria propria -- nao e
// custo de aparelho nem margem. Quem leva os aparelhos e recebe as notas ja ve
// esses numeros no papel; esconder no painel so impediria ele de conferir a
// nota de segunda, que e o trabalho. Aparelho, preco e margem seguem fechados.
const VE_CUSTO_SERVICO = ['socio','bancada'];
function podeVerCustoServico(){ return VE_CUSTO_SERVICO.includes(papelAtual()); }

// Irmao de money(), com outro interruptor. Existe pra que uma tela nao precise
// escolher entre "mostrar tudo" e "esconder tudo" de dinheiro.
function moneyServico(valor, mudo){
  return podeVerCustoServico() ? brl(valor) : (mudo === undefined ? '—' : mudo);
}

// QUARTO interruptor (17/ago/2026): a BASE DA PROPRIA COMISSAO. O atendente
// ganha 25% de um lucro que ele nao pode ver -- e comissao que a pessoa nao
// consegue conferir vira desconfianca. Entao ele ve a soma do mes DAS VENDAS
// DELE, agregada, e nunca item a item.
//
// Nao e podeVerMargem() disfarcado: isto e o dinheiro DELE, agregado, e vale
// justamente pra quem NAO ve margem. Quem tem chave de atendente, ve.
function podeVerBaseComissao(){ return !!(meuPerfil && meuPerfil.at_key); }

// QUINTO interruptor (20/ago/2026): o PRECO DE TABELA.
//
// ⚠️ Nao e o mesmo dinheiro de podeVerValor(). `podeVerValor` fala do valor de
// UMA VENDA (quanto aquele cliente pagou); este fala do preco de catalogo, que
// a loja publica no story do Instagram toda semana. Esconder de quem atende no
// balcao um numero que esta no story nao protege nada -- so faz a pessoa
// perguntar pro colega.
//
// Foi por isso que a aba Tabela nao entrou por VE_VALOR: por ali, o Vitinho
// ganharia junto o "Exportar WhatsApp" do Estoque, que manda preco item a item
// e esta fechado de proposito (docs/CONTROLE-MANUTENCAO.md).
//
// Quem tem perfil ativo ve. Custo, lucro e margem seguem em VE_MARGEM.
function podeVerPrecoTabela(){ return papelAtual() !== 'nenhum'; }

// Irmao de money() para preco de catalogo. Nao tem modo mudo: se a tela chegou
// ate aqui, a pessoa pode ver o preco.
function moneyPreco(valor){
  return podeVerPrecoTabela() ? brl(valor) : '—';
}

// Mantido porque varias telas ja chamam; hoje significa "pode ver custo/lucro"
function podeVerDinheiro(){ return podeVerMargem(); }

// Todo valor em R$ deveria passar por aqui: se o papel nao pode ver, o numero
// simplesmente nao e renderizado. Evita que uma tela nova vaze por esquecimento.
function money(valor, mudo){
  return podeVerValor() ? brl(valor) : (mudo === undefined ? '—' : mudo);
}

// ---------------------------------------------------------------------------
// TEMA
// ---------------------------------------------------------------------------
function alternarTema(){
  const atual = document.documentElement.getAttribute('data-theme');
  const sistemaEscuro = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const novo = atual ? (atual === 'dark' ? 'light' : 'dark') : (sistemaEscuro ? 'light' : 'dark');
  document.documentElement.setAttribute('data-theme', novo);
  try { localStorage.setItem('pc_tema', novo); } catch(e){}
  const b = document.getElementById('btn-tema');
  if(b) b.textContent = temaEscuroAtivo() ? '☀' : '☾';
}

function temaEscuroAtivo(){
  const t = document.documentElement.getAttribute('data-theme');
  if(t) return t === 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// ---------------------------------------------------------------------------
// RENDER
// ---------------------------------------------------------------------------
function renderShell(){
  const sb = document.getElementById('sidebar');
  if(!sb) return;

  const lojas = [['ambas','Ambas'],['cart','Phone Cart'],['urban','Urban']];

  sb.innerHTML = `
    <div class="sb-brand">
      <img class="sb-logo" id="header-logo" src="img/phonecart-icon.png" alt="">
      <div class="sb-brand-txt">
        <!-- estado inicial = loja 'ambas'; updateHeaderLogo() troca ao mudar de loja -->
        <span class="sb-brand-name" id="header-logo-name">Cart System</span>
        <span class="sb-brand-sub" id="header-logo-sub">Visão consolidada</span>
      </div>
    </div>

    ${semContextoLojaPeriodo() ? '' : `
    <div class="sb-context">
      <div class="label-mono">Loja</div>
      <div class="sb-stores">
        ${lojas.map(([id,l]) => `<button class="sb-store${currentStore===id?' active':''}" data-store="${id}"
            onclick="setStore('${id}')">${l}</button>`).join('')}
      </div>
      <div class="label-mono" style="margin-top:12px">Período</div>
      <select class="sb-period" id="psel" onchange="setPeriod()">${gerarOpcoesMeses()}</select>
      <div id="sb-dates">${gerarDatePickers()}</div>
    </div>`}

    <nav class="sb-nav">
      ${NAV.map(g => {
        const itens = g.itens.filter(i => podeVer(i.id));
        if(!itens.length) return '';
        return `<div class="sb-group">
          <div class="sb-group-title">${g.grupo}</div>
          ${itens.map(i => `<button class="sb-item${currentTab===i.id?' active':''}" data-tab="${i.id}"
              onclick="setTab('${i.id}')">
              <span class="sb-ico">${ICO[i.id]||''}</span>
              <span class="sb-item-label">${i.label}</span>
              ${i.emBreve ? '<span class="sb-soon">em breve</span>' : ''}
            </button>`).join('')}
        </div>`;
      }).join('')}
    </nav>

    ${ehDono() ? `
    <div class="sb-preview${papelPreview?' ativo':''}">
      <div class="label-mono">Ver como</div>
      <select class="sb-period" id="papel-sel" onchange="setPapelPreview(this.value)">
        ${PAPEIS.map(p => `<option value="${p}"${papelAtual()===p?' selected':''}>${LABEL_PAPEL[p]}</option>`).join('')}
      </select>
    </div>` : ''}

    <div class="sb-foot">
      <button class="sb-fbtn" id="btn-tema" onclick="alternarTema()" title="Alternar tema">${temaEscuroAtivo()?'☀':'☾'}</button>
      <button class="sb-fbtn" onclick="reloadData()" title="Atualizar dados">↻</button>
      <button class="sb-fbtn sb-sair" onclick="doLogout()">Sair</button>
    </div>`;

  const bt = document.getElementById('bottom-tabs');
  if(bt){
    const { fixas, mais } = navMobile();
    const btn = i => `<button class="bt-item${currentTab===i.id?' active':''}" data-tab="${i.id}"
        onclick="setTab('${i.id}')">
        <span class="bt-ico">${ICO[i.id]||''}</span><span class="bt-label">${i.label}</span>
      </button>`;
    const todos = NAV.flatMap(g => g.itens);
    // O "Mais" acende quando a tela aberta esta dentro dele -- senao a barra
    // fica sem nenhum item ativo e parece que voce nao esta em lugar nenhum.
    const dentroDoMais = mais.includes(currentTab);
    bt.innerHTML = todos.filter(i => fixas.includes(i.id) && podeVer(i.id)).map(btn).join('')
      + (mais.length ? `<button class="bt-item${dentroDoMais ? ' active' : ''}" onclick="abrirNavMais()">
          <span class="bt-ico">${ICO_MAIS}</span><span class="bt-label">Mais</span>
        </button>` : '');
  }

  if(typeof updateHeaderLogo === 'function') updateHeaderLogo();
  renderPreviewBar();
}

// Marca o item ativo sem re-renderizar o shell (evita perder o foco do select).
function marcarAtivoShell(){
  document.querySelectorAll('.sb-item,.bt-item').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === currentTab));
  document.querySelectorAll('.sb-store').forEach(b =>
    b.classList.toggle('active', b.dataset.store === currentStore));
  const d = document.getElementById('sb-dates');
  if(d) d.innerHTML = gerarDatePickers();
}

// Tela de "este app nao sabe quem voce e". Aparece quando o papel do usuario
// nao existe neste JS -- ou seja, quando o codigo esta velho e o banco ja tem
// um papel novo. E o sintoma CERTO: antes isso virava "estoque zerado", que
// parece dado e nao parece bug (17/ago/2026, primeiro login do `comercial`).
function renderSemAcesso(){
  const papel = (typeof papelAtual === 'function') ? papelAtual() : '?';
  // Dois motivos distintos pra cair aqui, e a pessoa merece saber qual:
  const semPerfil = papel === 'nenhum';
  return `<div class="c-card" style="text-align:center;padding:48px 24px">
    <div class="t-title" style="margin-bottom:8px">${semPerfil ? 'Acesso não liberado' : 'Atualize o app'}</div>
    <div class="t-body" style="color:var(--text3);max-width:420px;margin:0 auto 18px">
      ${semPerfil
        ? `O seu login funciona, mas ainda não tem acesso configurado no painel.
           Fale com o Breno — é um cadastro de um minuto do lado dele.`
        : `Esta versão do painel não conhece o seu acesso${papel && papel !== '?' ? ` (<b>${papel}</b>)` : ''}.
           Quase sempre é código antigo guardado no aparelho — atualizar resolve.
           Se continuar assim depois de atualizar, fale com o Breno.`}
    </div>
    ${typeof recarregarLimpo === 'function'
      ? UI.btn('Atualizar agora', {onclick:'recarregarLimpo()', variante:'primario'})
      : ''}
  </div>`;
}

// Placeholder honesto para a secao que o brief prevê mas ainda nao existe.
function renderFechamento(){
  return `<div class="card" style="text-align:center;padding:48px 24px">
    <div class="t-title" style="margin-bottom:8px">Fechamento</div>
    <div class="t-body" style="color:var(--text3);max-width:420px;margin:0 auto">
      Esta seção ainda não foi construída. O fechamento mensal hoje é feito na aba
      <b>Equipe</b> (comissões) e <b>Custos</b> (resultado).
    </div>
  </div>`;
}
