// ============================================================================
// SHELL — sidebar (desktop) + bottom-tabs (mobile)
// O contexto (loja + periodo) vive aqui e NAO reinicia ao trocar de secao,
// conforme o brief §7.2. Antes cada tela renderizava a propria copia.
// ============================================================================

const ICO = {
  dash:      '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
  vendas:    '<svg viewBox="0 0 24 24"><path d="M3 3h2l2.6 12.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L21 8H6"/><circle cx="10" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/></svg>',
  estoque:   '<svg viewBox="0 0 24 24"><path d="M21 8.5v7a2 2 0 0 1-1 1.7l-7 3.9a2 2 0 0 1-2 0l-7-3.9a2 2 0 0 1-1-1.7v-7a2 2 0 0 1 1-1.7l7-3.9a2 2 0 0 1 2 0l7 3.9a2 2 0 0 1 1 1.7Z"/><path d="m3.5 7.5 8.5 4.8 8.5-4.8M12 21v-8.7"/></svg>',
  movs:      '<svg viewBox="0 0 24 24"><path d="M7 4v13m0 0-3-3m3 3 3-3M17 20V7m0 0-3 3m3-3 3 3"/></svg>',
  equipe:    '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16.5 5.2a3.2 3.2 0 0 1 0 5.6M18 20a6.4 6.4 0 0 0-2-4.6"/></svg>',
  tabela:    '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9.5h18M3 15h18M9.5 9.5V20"/></svg>',
  custos:    '<svg viewBox="0 0 24 24"><path d="M12 2v20"/><path d="M17 6.5c0-1.9-2.2-3-5-3s-5 1.1-5 3 2.2 2.7 5 3.2 5 1.3 5 3.3-2.2 3.2-5 3.2-5-1.3-5-3.2"/></svg>',
  fechamento:'<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/><path d="m9 15 2 2 4-4"/></svg>',
};

const NAV = [
  { grupo:'Operação',  itens:[
    {id:'dash',    label:'Dashboard'},
    {id:'vendas',  label:'Vendas'},
    {id:'estoque', label:'Estoque'},
    {id:'movs',    label:'Movimentações'},
  ]},
  { grupo:'Gestão', itens:[
    {id:'equipe',  label:'Equipe'},
    {id:'tabela',  label:'Tabela de preços'},
  ]},
  { grupo:'Financeiro', itens:[
    {id:'custos',     label:'Custos'},
    {id:'fechamento', label:'Fechamento', emBreve:true},
  ]},
];

// Bottom-tab do mobile: 5 slots (brief §5)
const NAV_MOBILE = ['dash','vendas','estoque','equipe','custos'];

// ---------------------------------------------------------------------------
// PERMISSAO — a matriz do brief §2. Hoje todos os usuarios sao socios; quando
// a fase de perfis chegar, basta papelAtual() passar a ler o perfil real.
// ---------------------------------------------------------------------------
const MATRIZ_ACESSO = {
  socio:     ['dash','vendas','estoque','movs','equipe','tabela','custos','fechamento'],
  gerente:   ['dash','vendas','estoque','movs','equipe'],
  vendedor:  ['dash','vendas','estoque'],
  atendente: ['dash','vendas','estoque'],
};

function papelAtual(){ return 'socio'; }
function podeVer(secao){ return (MATRIZ_ACESSO[papelAtual()] || []).includes(secao); }

// Duas permissoes distintas, a pedido do dono:
//   VALOR  = por quanto foi vendido. O colaborador negociou o preco, entao ve.
//   MARGEM = custo e lucro. So socio.
const VE_VALOR  = ['socio','gerente','vendedor','atendente'];
const VE_MARGEM = ['socio'];

function podeVerValor(){  return VE_VALOR.includes(papelAtual()); }
function podeVerMargem(){ return VE_MARGEM.includes(papelAtual()); }

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
        <span class="sb-brand-name" id="header-logo-name">Phone Cart</span>
        <span class="sb-brand-sub" id="header-logo-sub">Dashboard</span>
      </div>
    </div>

    <div class="sb-context">
      <div class="label-mono">Loja</div>
      <div class="sb-stores">
        ${lojas.map(([id,l]) => `<button class="sb-store${currentStore===id?' active':''}" data-store="${id}"
            onclick="setStore('${id}')">${l}</button>`).join('')}
      </div>
      <div class="label-mono" style="margin-top:12px">Período</div>
      <select class="sb-period" id="psel" onchange="setPeriod()">${gerarOpcoesMeses()}</select>
      <div id="sb-dates">${gerarDatePickers()}</div>
    </div>

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

    <div class="sb-foot">
      <button class="sb-fbtn" id="btn-tema" onclick="alternarTema()" title="Alternar tema">${temaEscuroAtivo()?'☀':'☾'}</button>
      <button class="sb-fbtn" onclick="reloadData()" title="Atualizar dados">↻</button>
      <button class="sb-fbtn sb-sair" onclick="doLogout()">Sair</button>
    </div>`;

  const bt = document.getElementById('bottom-tabs');
  if(bt){
    bt.innerHTML = NAV.flatMap(g => g.itens)
      .filter(i => NAV_MOBILE.includes(i.id) && podeVer(i.id))
      .map(i => `<button class="bt-item${currentTab===i.id?' active':''}" data-tab="${i.id}"
          onclick="setTab('${i.id}')">
          <span class="bt-ico">${ICO[i.id]||''}</span><span class="bt-label">${i.label}</span>
        </button>`).join('');
  }

  if(typeof updateHeaderLogo === 'function') updateHeaderLogo();
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
