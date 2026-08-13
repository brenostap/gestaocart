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
    const msg = String(e?.message||'');
    document.getElementById('login-error').textContent =
      /Email not confirmed/i.test(msg) ? 'E-mail ainda não confirmado. Fale com o Breno.'
      : /rate limit|too many/i.test(msg) ? 'Muitas tentativas. Aguarde um minuto e tente de novo.'
      : 'E-mail ou senha inválidos.';
    btn.disabled=false;btn.textContent='Entrar';
  }
}

// Le a linha do usuario em `perfis`. Precisa do user_id: a policy de leitura
// tambem deixa o socio ver TODAS as linhas, entao sem o filtro o painel do dono
// pegaria o papel de outra pessoa (a primeira da lista).
async function carregarMeuPerfil(){
  if(!usuarioId){ meuPerfil = null; return null; }
  try{
    const linhas = await sbGet('perfis',
      `select=papel,nome,funcionario_id,ativo&user_id=eq.${usuarioId}`, 1);
    meuPerfil = (linhas && linhas[0]) || null;
  }catch(e){
    // Nao derruba o login: o RLS ja e a trava real, e papelReal() cai no
    // padrao. Sem perfil o banco devolve zero linha e as telas ficam vazias --
    // que e o sintoma certo, e nao uma tela cheia de dado que nao devia.
    console.warn('[perfil] nao consegui ler o perfil:', e.message);
    meuPerfil = null;
  }
  // O papel muda o menu inteiro; a tela aberta pode nem existir pra ele.
  if(typeof podeVer === 'function' && !podeVer(currentTab)){
    const permitidas = (MATRIZ_ACESSO[papelAtual()] || []);
    currentTab = permitidas[0] || 'estoque';
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

async function sbGet(table, params='', limit=2000){
  const token=await sbAuthToken();
  const url=`${SB_URL}/rest/v1/${table}?${params}&limit=${limit}`;
  const r=await fetch(url,{headers:{'apikey':SB_KEY,'Authorization':'Bearer '+token,'Accept':'application/json','Prefer':'count=exact'}});
  if(r.status===401){ sessaoExpirou(); throw new Error('Sessão expirada'); }
  if(!r.ok) throw new Error(`Supabase ${table}: ${r.status}`);
  const json=await r.json();
  // count=exact -> Content-Range "inicio-fim/total". Se o total passar do limit, a
  // resposta veio truncada em silencio (o dashboard subconta faturamento/lucro). Avisa.
  const range=r.headers.get('content-range');
  const total=range&&range.includes('/')?parseInt(range.split('/')[1],10):null;
  if(total!=null&&Array.isArray(json)&&total>json.length){
    console.warn(`sbGet(${table}): ${json.length} de ${total} linhas — limite de ${limit} atingido, dados TRUNCADOS. Aumente o limit ou pagine.`);
  }
  return json;
}

