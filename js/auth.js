// AUTH (Supabase e-mail/senha)
function enterApp(){
  const ls=document.getElementById('login-screen');
  const app=document.getElementById('app');
  if(ls) ls.style.display='none';
  if(app) app.style.display='block';
  updateHeaderLogo();
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
  const email=document.getElementById('login-email').value.trim();
  const password=document.getElementById('login-password').value;
  if(!email||!password){document.getElementById('login-error').textContent='Informe e-mail e senha.';return;}
  const btn=document.getElementById('login-btn');
  btn.disabled=true;btn.textContent='Verificando...';
  document.getElementById('login-error').textContent='';
  try{
    const {data,error}=await sb.auth.signInWithPassword({email,password});
    if(error) throw error;
    SB_TOKEN=data.session.access_token;
    enterApp();
    await loadAllData();
  }catch(e){
    document.getElementById('login-error').textContent='E-mail ou senha inválidos.';
    btn.disabled=false;btn.textContent='Entrar';
  }
}

async function doLogout(){
  if(_pollingInterval){clearInterval(_pollingInterval);_pollingInterval=null;}
  pararTokenKeepAlive();
  try{ await sb.auth.signOut(); }catch(e){}
  SB_TOKEN=SB_KEY;allVendas=[];allMovs=[];estoqueItens=[];
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
  return r.json();
}

