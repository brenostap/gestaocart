window.onload=async function(){
  // Mantém SB_TOKEN sincronizado com a sessão (inclui refresh automático do token).
  sb.auth.onAuthStateChange((_event, session)=>{
    SB_TOKEN = session ? session.access_token : SB_KEY;
  });
  const { data:{ session } } = await sb.auth.getSession();
  if(session){
    SB_TOKEN=session.access_token;
    enterApp();
    loadAllData();
  } else {
    // Sem sessão: mostrar tela de login
    const ls=document.getElementById('login-screen');
    if(ls) ls.style.display='flex';
  }
};
