// AUTH (Supabase e-mail/senha)
function enterApp(){
  const ls=document.getElementById('login-screen');
  const app=document.getElementById('app');
  if(ls) ls.style.display='none';
  if(app) app.style.display='grid';
  renderShell();
  iniciarTokenKeepAlive();
}

// Mantem SB_TOKEN sempre valido para as chamadas que leem a variavel global
// (escritas de custos, precos, equipe). Independe do polling de vendas.
let _tokenKeepAlive=null;
function iniciarTokenKeepAlive(){
  if(_tokenKeepAlive) return;
  _tokenKeepAlive=setInterval(sbAuthToken, 60*1000);
}
function pararTokenKeepAlive(){
  if(_tokenKeepAlive){clearInterval(_tokenKeepAlive);_tokenKeepAlive=null;}
}

async function doLogin(){
  // celular costuma capitalizar a primeira letra e o teclado insere espaco no
  // fim; normalizamos antes de enviar
  const email=document.getElementById('login-email').value.trim().toLowerCase();
  const password=document.getElementById('login-password').value;
  if(!email||!password){document.getElementById('login-error').textContent='Informe e-mail e senha.';return;}
  const btn=document.getElementById('login-btn');
  btn.disabled=true;btn.textContent='Verificando...';
  document.getElementById('login-error').textContent='';
  try{
    const {data,error}=await sb.auth.signInWithPassword({email,password});
    if(error) throw error;
    SB_TOKEN=data.session.access_token;
    usuarioEmail=(data.user?.email||'').toLowerCase();
    usuarioId=data.user?.id||'';
    // Antes do enterApp(): e o perfil que decide o menu que o renderShell desenha.
    await carregarMeuPerfil();
    enterApp();
    await loadAllData();
  }catch(e){
    // ⚠️ Ate 17/ago/2026 QUALQUER erro virava "E-mail ou senha inválidos" -- o
    // catch-all. Falha de rede, CORS e projeto fora do ar diziam a mesma coisa
    // que senha errada, e a pessoa ficava redigitando a senha certa. Agora o
    // desconhecido aparece como ele e.
    const msg = String(e?.message||'');
    console.error('[login]', msg);
    document.getElementById('login-error').textContent =
      /invalid login credentials|invalid credentials/i.test(msg)
        ? 'E-mail ou senha incorretos.'
      : /Email not confirmed/i.test(msg) ? 'E-mail ainda não confirmado. Fale com o Breno.'
      : /rate limit|too many/i.test(msg) ? 'Muitas tentativas. Aguarde um minuto e tente de novo.'
      : /failed to fetch|networkerror|load failed/i.test(msg)
        ? 'Sem conexão com o servidor. Confira a internet e tente de novo.'
      : 'Não consegui entrar: ' + msg;
    btn.disabled=false;btn.textContent='Entrar';
  }
}

// Le a linha do usuario em `perfis`. Precisa do user_id: a policy de leitura
// tambem deixa o socio ver TODAS as linhas, entao sem o filtro o painel do dono
// pegaria o papel de outra pessoa (a primeira da lista).
async function carregarMeuPerfil(){
  if(!usuarioId){ meuPerfil = null; return null; }
  try{
    // vo_key/at_key decidem QUAIS LINHAS sao minhas e se a tela "Meu dia"
    // existe -- sem elas no select, quem atende no balcao nao ve o que ganhou.
    const linhas = await sbGet('perfis',
      `select=papel,nome,funcionario_id,ativo,vo_key,at_key&user_id=eq.${usuarioId}`, 1);
    meuPerfil = (linhas && linhas[0]) || null;
    // ⚠️ Leu e NAO veio linha e MUITO diferente de "nao consegui ler". Sem esta
    // distincao, quem nao tem perfil caia no padrao 'socio' e via o MENU
    // INTEIRO DE ADMIN, com zero em tudo (o RLS protege o dado, nao a tela).
    // Aconteceu em 17/ago/2026: um usuario foi recriado no Auth, o user_id
    // mudou, e `perfis.user_id` tem ON DELETE CASCADE -- o perfil foi junto,
    // calado. A pessoa abriu o painel e viu Custos, Equipe, Compras, tudo.
    perfilLidoSemLinha = !meuPerfil;
  }catch(e){
    perfilLidoSemLinha = false;   // falhou a LEITURA -- ver papelReal()
    // Nao derruba o login: o RLS ja e a trava real, e papelReal() cai no
    // padrao. Sem perfil o banco devolve zero linha e as telas ficam vazias --
    // que e o sintoma certo, e nao uma tela cheia de dado que nao devia.
    console.warn('[perfil] nao consegui ler o perfil:', e.message);
    meuPerfil = null;
  }
  // O papel muda o menu inteiro; a tela aberta pode nem existir pra ele.
  if(typeof podeVer === 'function' && !podeVer(currentTab)){
    const permitidas = (typeof telasDoUsuario === 'function')
      ? telasDoUsuario() : (MATRIZ_ACESSO[papelAtual()] || []);
    // ⚠️ O fallback era 'estoque', e isso e uma armadilha: papel que este JS
    // NAO CONHECE (o caso de codigo velho diante de um papel novo) cai com
    // `permitidas` vazio e ia parar justamente na tela que ele nao pode ler --
    // aparecendo como "estoque zerado" em vez de "app desatualizado".
    // Aconteceu em 17/ago/2026 com o primeiro login do papel `comercial`.
    currentTab = permitidas[0] || 'semacesso';
  }
  return meuPerfil;
}

async function doLogout(){
  if(_pollingInterval){clearInterval(_pollingInterval);_pollingInterval=null;}
  pararTokenKeepAlive();
  try{ await sb.auth.signOut(); }catch(e){}
  SB_TOKEN=SB_KEY;usuarioEmail='';usuarioId='';meuPerfil=null;
  allVendas=[];allMovs=[];estoqueItens=[];
  if(typeof _bancadaCache !== 'undefined') _bancadaCache=null;
  document.getElementById('app').style.display='none';
  document.getElementById('login-screen').style.display='flex';
  const pw=document.getElementById('login-password');if(pw) pw.value='';
  document.getElementById('login-btn').disabled=false;
  document.getElementById('login-btn').textContent='Entrar';
}

function setProgress(pct,txt){
  document.getElementById('loading-fill').style.width=pct+'%';
  document.getElementById('loading-text').textContent=txt;
}


// -- SUPABASE HELPERS ------------------------------------------------------
// Devolve um access_token valido. getSession() renova sozinho quando o token
// expirou; nao da pra confiar so na variavel SB_TOKEN, que fica velha se a aba
// ficar aberta/dormindo (era o que fazia o polling levar 401 em silencio).
async function sbAuthToken(){
  try{
    const { data:{ session } } = await sb.auth.getSession();
    if(session && session.access_token){ SB_TOKEN=session.access_token; return SB_TOKEN; }
  }catch(e){}
  SB_TOKEN=SB_KEY;
  return SB_TOKEN;
}

// Sessao morreu de vez: para o polling e devolve o usuario pro login.
function sessaoExpirou(){
  if(_pollingInterval){clearInterval(_pollingInterval);_pollingInterval=null;}
  pararTokenKeepAlive();
  SB_TOKEN=SB_KEY;
  const app=document.getElementById('app');
  if(app) app.style.display='none';
  const ls=document.getElementById('login-screen');
  if(ls) ls.style.display='flex';
  const err=document.getElementById('login-error');
  if(err) err.textContent='Sua sessão expirou. Entre novamente.';
  const btn=document.getElementById('login-btn');
  if(btn){ btn.disabled=false; btn.textContent='Entrar'; }
}

// ⚠️ DUAS ARMADILHAS DO POSTGREST NUM LUGAR SO. Medidas em 02/set/2026.
//
// 1. ELE CORTA EM 1.000 LINHAS E O `limit=` NAO MUDA ISSO. O Supabase configura
//    db-max-rows=1000 no servidor; pedir limit=2000 ou 5000 devolve
//    `content-range: 0-999/1992` do mesmo jeito. Ate hoje isto era um
//    console.warn que ninguem lia -- e o painel carregava 1.000 das 1.992
//    vendas dos ultimos 6 meses. Setembro, agosto e julho vinham inteiros;
//    JUNHO vinha pela metade e maio/abril nao vinham. Quem escolhesse um mes
//    antigo via faturamento e lucro MENORES que a verdade, sem aviso na tela.
//
// 2. `Prefer: count=exact` MAIS QUE DOBRA O TEMPO. Ele obriga um COUNT completo
//    a cada request: 363ms contra 166ms no mesmo lote de venda_produtos. Estava
//    em TODAS as chamadas, so pra alimentar um aviso de truncagem.
//
// Por isso a paginacao aqui NAO usa count: pagina cheia (1.000) significa "pode
// ter mais", pagina curta significa "acabou". Custa um request extra quando o
// total e multiplo exato de 1.000 -- barato perto de contar tudo toda vez.
//
// `limit` continua sendo o TETO de seguranca: existe pra uma query mal filtrada
// nao arrastar a tabela inteira, e ele avisa quando bate.
const SB_PAGINA = 1000;   // db-max-rows do projeto
async function sbGet(table, params='', limit=2000){
  const token=await sbAuthToken();
  const H={'apikey':SB_KEY,'Authorization':'Bearer '+token,'Accept':'application/json'};
  let json=[];
  while(json.length < limit){
    const de=json.length, ate=Math.min(limit, de+SB_PAGINA)-1;
    const r=await fetch(`${SB_URL}/rest/v1/${table}?${params}`,
      {headers:{...H,'Range-Unit':'items','Range':`${de}-${ate}`}});
    if(r.status===401){ sessaoExpirou(); throw new Error('Sessão expirada'); }
    if(!r.ok && r.status!==206) throw new Error(`Supabase ${table}: ${r.status}`);
    const p=await r.json();
    if(!Array.isArray(p)) return p;          // erro/objeto: devolve como veio
    json=json.concat(p);
    if(p.length < ate-de+1) return json;      // pagina curta = acabou
  }
  console.warn(`sbGet(${table}): parei no teto de ${limit} linhas. Pode haver mais — aumente o limit.`);
  return json;
}

