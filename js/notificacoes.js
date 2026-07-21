// -- SISTEMA DE NOTIFICACOES ------------------------------------------------
let _lastVendaId = 0;
let _notifCount = 0;
let _pollingInterval = null;
let _notifQueue = [];
let _notifAtiva = false;

function iniciarPolling(){
  if(_pollingInterval) return;
  // Registrar o ID da ultima venda carregada como baseline
  if(allVendas.length > 0){
    _lastVendaId = Math.max(...allVendas.map(v=>v.id));
  }
  // Verificar a cada 2 minutos
  _pollingInterval = setInterval(verificarNovasVendas, 2 * 60 * 1000);
  console.log('[Notif] Polling iniciado. Última venda:', _lastVendaId);
}

async function verificarNovasVendas(){
  // Renova o token a cada ciclo (2 min), o que tambem mantem SB_TOKEN fresco
  // para as demais chamadas enquanto o app estiver aberto.
  const token=await sbAuthToken();
  if(token===SB_KEY) return; // sem sessão autenticada
  try{
    const r = await fetch(BASE+'/vendas?sort=data_saida:desc&page=1&perPage=5&filters[status]=completed',{
      headers:{'apikey':SB_KEY,'Authorization':'Bearer '+token,'Accept':'application/json'}
    });
    if(r.status===401){ sessaoExpirou(); return; }
    const d = await r.json();
    const novas = (d.data||[]).filter(v => v.id > _lastVendaId);
    if(novas.length === 0) return;

    // Buscar detalhes das vendas novas
    for(const venda of novas.reverse()){
      const det = await fetch(BASE+'/vendas/'+venda.id,{
        headers:{'apikey':SB_KEY,'Authorization':'Bearer '+token,'Accept':'application/json'}
      }).then(r=>r.json()).catch(()=>null);
      const detail = det?.data || det || venda;
      _notifQueue.push(detail);
      _notifCount++;
      // Adicionar ao allVendas para nao perder
      if(!allVendas.find(v=>v.id===venda.id)){
        allVendas.unshift(venda);
      }
    }
    _lastVendaId = Math.max(...(d.data||[]).map(v=>v.id));

    // Mostrar primeira da fila
    if(!_notifAtiva) mostrarProximaNotif();

    // Atualizar badge do titulo da aba
    atualizarBadgeTab();

    // Re-renderizar o conteudo atual
    renderContent();
  } catch(e){
    console.warn('[Notif] Erro ao verificar:', e.message);
  }
}

function mostrarProximaNotif(){
  if(_notifQueue.length === 0){ _notifAtiva=false; return; }
  _notifAtiva = true;
  const venda = _notifQueue.shift();
  exibirNotif(venda);
}

function exibirNotif(venda){
  const produtos = venda.produtos || [];
  const isPrinc = p => !!(p.apple_id)||(parseFloat(p.valor_estoque||0)>=200);
  const principais = produtos.filter(isPrinc);
  const acesss = produtos.filter(p=>!isPrinc(p));
  const {loja, vendedor, atendente} = getVendaInfo(venda);
  const acessBruto = acesss.reduce((a,p)=>a+parseFloat(p.preco||0),0);

  // Linha 1: produtos
  const prodStr = principais.length > 0
    ? principais.map(p=>{
        const t=(p.titulo||'').replace(/^iPhone\s+/i,'').replace(/\s*Seminovo\s*$/i,' SN').replace(/\s*Lacrado\s*$/i,' LAC');
        const s=p.serial||p.apple?.serial||'';
        return t+(s?' #'+s:'');
      }).join(' + ')
    : '—';

  const clienteNome = venda.cliente?.nome || '—';
  const clienteShort = clienteNome.split(' ').filter((_,i,a)=>i===0||i===a.length-1).join(' ');

  const SOCIOS_NOMES=['gustavo','marcella'];
  const vendLabel = vendedor ? (SOCIOS_NOMES.includes(vendedor.toLowerCase()) ? '★ Sócio: ' : 'Vendedor: ') + vendedor.charAt(0).toUpperCase()+vendedor.slice(1) : '';
  const vendedorStr = [
    vendLabel,
    atendente ? 'Atendente: '+atendente.charAt(0).toUpperCase()+atendente.slice(1) : ''
  ].filter(Boolean).join(' · ');

  const lojaStr = loja==='cart'?'Phone Cart':loja==='urban'?'Urban':'—';
  const totalStr = 'R$'+Math.round(parseFloat(venda.valor_total||0)).toLocaleString('pt-BR');
  const lucroStr = 'Lucro R$'+Math.round(parseFloat(venda.lucro||0)).toLocaleString('pt-BR');
  const acessStr = acessBruto>0 ? ' · Acess. R$'+Math.round(acessBruto).toLocaleString('pt-BR') : '';

  document.getElementById('notif-loja').textContent = lojaStr;
  document.getElementById('notif-id').textContent = '#'+venda.id;
  document.getElementById('notif-linha1').textContent = prodStr+' — '+clienteShort;
  document.getElementById('notif-linha2').textContent = totalStr+' · '+lucroStr+acessStr+(vendedorStr?' · '+vendedorStr:'');

  // Mostrar banner
  const banner = document.getElementById('notif-banner');
  banner.classList.add('show');

  // Som de notificacao (beep simples via Web Audio API)
  try{
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1100, ctx.currentTime+0.1);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime+0.4);
  } catch(e){}

  // Auto-fechar apos 12s se nao houver mais na fila
  setTimeout(()=>{
    if(_notifQueue.length > 0){
      // tem mais -- trocar pela proxima
      mostrarProximaNotif();
    } else {
      fecharNotif();
    }
  }, 12000);

  // Atualizar contador
  const counter = document.getElementById('notif-counter');
  if(_notifCount > 0){
    counter.textContent = _notifCount;
    counter.classList.add('show');
  }
}

function fecharNotif(){
  document.getElementById('notif-banner').classList.remove('show');
  _notifAtiva = false;
  // Mostrar proxima se houver
  if(_notifQueue.length > 0){
    setTimeout(mostrarProximaNotif, 500);
  } else {
    // Limpar contador
    document.getElementById('notif-counter').classList.remove('show');
    _notifCount = 0;
    document.title = 'Phone Cart — Dashboard';
  }
}

function atualizarBadgeTab(){
  if(_notifCount > 0){
    document.title = '('+_notifCount+') Phone Cart — Dashboard';
  }
}


