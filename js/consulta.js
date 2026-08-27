// ============================================================================
// PÓS-VENDA — achar a venda de quem está com problema
//
// §2 e §3 de docs/funcoes/coordenadora-pos-venda.md: "consultar as informações
// da venda ANTES de dar uma orientação". A Maria e `comercial` -- ela via so as
// PROPRIAS vendas (v_minhas_vendas), e pos-venda e sobre a venda dos outros.
//
// ⚠️ ESTA TELA LE VIEW, NAO TABELA. `vendas`, `venda_produtos` e `bancada` sao
// eh_socio()/pode_operar(). O que chega aqui vem mastigado, SEM custo_total,
// lucro, recebimento_* nem valor_estoque -- a regra dos quatro interruptores
// continua de pe: podeVerValor() sim, podeVerMargem() nao.
//
// A BUSCA E UMA SO, de proposito. O cliente chega com o aparelho na mao (IMEI),
// com o nome dele, ou com o telefone -- nunca com o numero do pedido. Perguntar
// "buscar por quê?" antes de deixar procurar seria empurrar pra pessoa uma
// decisao que a maquina consegue tomar olhando o que foi digitado.
// ============================================================================

let cnsBusca = '';
let cnsVendas = [];        // v_venda_consulta do que a busca achou
let cnsItens = {};         // venda_id -> itens (v_venda_consulta_itens)
let cnsFora = [];          // v_assistencia_cliente, aparelhos de cliente fora AGORA
let cnsForaCarregado = false;
let cnsForaErro = '';       // ⚠️ 'não carregou' ≠ 'ninguém esperando'
let cnsBuscando = false;
let cnsErro = '';
let cnsJaBuscou = false;
let cnsAberta = null;      // id da venda expandida

// Só dígitos, sem máscara: IMEI, telefone e etiqueta chegam escritos de todo
// jeito ("(11) 98888-7766", "…7766", "7766").
function cnsDigitos(s){ return String(s || '').replace(/\D/g, ''); }

// ---------------------------------------------------------------------------
// ⚠️ O TERMO VAI ENTRE ASPAS NO PostgREST -- senão o parêntese do telefone
// derruba a busca.
//
// `or=(campo.ilike.*termo*,outro.like.*x*)` é sintaxe: a VÍRGULA separa as
// condições e o PARÊNTESE fecha o grupo. Colar "(11) 97777-1234" -- que é o
// gesto mais provável de quem recebeu o número no WhatsApp -- fecharia o `or`
// no meio e a API devolveria 400. Entre aspas duplas o valor pode conter os
// dois. O que não pode entrar de jeito nenhum é a própria aspa e a barra
// invertida (fechariam a string), e o `*`, que viraria curinga extra.
// ---------------------------------------------------------------------------
function cnsSeguro(s){
  const limpo = String(s || '').replace(/["\\*%]/g, '').replace(/\s+/g, ' ').trim();
  // E vai percent-encoded por cima: `sbGet` monta a URL na mao e passa pro
  // fetch. Sem isto, um `#` no nome cortaria a URL (vira fragmento) e um `&`
  // viraria parametro novo. O servidor decodifica antes de parsear, e as aspas
  // continuam delimitando o valor -- os dois cuidados se somam, nao se anulam.
  return encodeURIComponent(limpo);
}

// A lista de "quem está esperando" (§9) vem junto com a carga do comercial: ela
// é a primeira coisa que a tela mostra, antes de qualquer busca.
async function carregarPosVenda(){
  cnsForaErro = '';
  try{
    cnsFora = await sbGet('v_assistencia_cliente', 'voltou_em=is.null&order=saiu_em.asc', 200) || [];
  }catch(e){
    // ⚠️ Lista vazia por FALHA não pode virar tela vazia: "não carregou" não é
    // "ninguém está esperando". É o mesmo erro do ✅ verde com janela vazia da
    // Conferência -- a mentira silenciosa é pior que o alarme falso.
    console.warn('[pos-venda] assistência não carregou:', e.message);
    cnsFora = [];
    cnsForaErro = e.message || 'falha de rede';
  }
  cnsForaCarregado = true;
}

// Recarrega a lista de quem está esperando. É BOTÃO, não gancho automático: o
// Vitinho registra saída no celular dele e a Maria precisa poder atualizar sem
// recarregar o app -- mas gancho de "carrega e redesenha" no render é o laço de
// microtask que travou o Estoque em 18/ago (ver CLAUDE.md).
async function cnsRecarregarFora(){
  cnsForaCarregado = false;
  if(currentTab === 'consulta') renderContent();
  await carregarPosVenda();
  if(currentTab === 'consulta') renderContent();
}

// Os dois filtros que a busca monta. Funções PURAS de propósito: sem elas, a
// única forma de provar que um telefone com parêntese não derruba a query seria
// bater na rede -- e foi assim que o defeito passou por 14 baterias verdes.
// test/consulta.test.js monta as duas com termos hostis.
function cnsFiltroItens(q){
  const dig = cnsDigitos(q), seguro = cnsSeguro(q);
  return `or=(imei_1.like."*${dig}*",serial.ilike."*${seguro}*")`;
}
function cnsFiltroGente(q){
  const dig = cnsDigitos(q), seguro = cnsSeguro(q);
  // Com 4+ dígitos vale procurar nos dois: "7766" tanto pode ser final de IMEI
  // quanto de telefone, e devolver as duas coisas custa menos que perguntar.
  return dig.length >= 4
    ? `or=(cliente_nome.ilike."*${seguro}*",cliente_tel.like."*${dig}*")`
    : `cliente_nome=ilike."*${seguro}*"`;
}

// ---------------------------------------------------------------------------
// A BUSCA
//
// Duas passadas, porque as duas chaves moram em tabelas diferentes: IMEI está
// no ITEM e nome/telefone estão na VENDA. Digitou número? Procura os dois --
// "7766" tanto pode ser final de IMEI quanto de telefone, e devolver as duas
// coisas custa uma requisição a mais e evita a pergunta.
// ---------------------------------------------------------------------------
async function cnsBuscar(){
  if(cnsBuscando) return;   // Enter repetido não dispara duas rodadas
  const q = String(cnsBusca || '').trim();
  if(q.length < 3){ cnsErro = 'Digite pelo menos 3 caracteres.'; renderContent(); return; }

  cnsBuscando = true; cnsErro = ''; cnsAberta = null;
  if(currentTab === 'consulta') renderContent();

  const dig = cnsDigitos(q);
  try{
    const achados = new Map();

    // 1. pelo que o cliente tem na mão: IMEI ou etiqueta do aparelho
    if(dig.length >= 4){
      const itens = await sbGet('v_venda_consulta_itens',
        `${cnsFiltroItens(q)}&order=venda_id.desc`, 60) || [];
      const ids = [...new Set(itens.map(i => i.venda_id))].slice(0, 30);
      if(ids.length){
        const vs = await sbGet('v_venda_consulta',
          `id=in.(${ids.join(',')})&order=data_saida.desc`, 30) || [];
        vs.forEach(v => achados.set(v.id, v));
      }
    }

    // 2. pelo que ele diz: nome ou telefone
    const vs2 = await sbGet('v_venda_consulta', `${cnsFiltroGente(q)}&order=data_saida.desc`, 30) || [];
    vs2.forEach(v => { if(!achados.has(v.id)) achados.set(v.id, v); });

    // 3. "#40611960" — quem já está com a venda aberta em outra tela
    if(/^\d{6,}$/.test(dig) && !achados.size){
      const vs3 = await sbGet('v_venda_consulta', `id=eq.${dig}`, 1) || [];
      vs3.forEach(v => achados.set(v.id, v));
    }

    cnsVendas = [...achados.values()]
      .sort((a, b) => String(b.data_saida).localeCompare(String(a.data_saida)))
      .slice(0, 30);

    // Os itens de tudo que apareceu, numa requisição só: a ficha precisa do
    // IMEI pra conferir com o aparelho que está na mão da pessoa (§9 do
    // documento dos atendentes: "o aparelho entregue é o registrado na venda").
    cnsItens = {};
    if(cnsVendas.length){
      const ids = cnsVendas.map(v => v.id);
      const its = await sbGet('v_venda_consulta_itens',
        `venda_id=in.(${ids.join(',')})&order=preco.desc`, 400) || [];
      its.forEach(i => { (cnsItens[i.venda_id] = cnsItens[i.venda_id] || []).push(i); });
    }
    // Uma venda só? Já abre: a pessoa procurou justamente por ela.
    if(cnsVendas.length === 1) cnsAberta = cnsVendas[0].id;
  }catch(e){
    console.warn('[pos-venda] busca falhou:', e.message);
    cnsErro = 'Não consegui buscar: ' + (e.message || 'falha de rede');
    cnsVendas = []; cnsItens = {};
  }
  cnsBuscando = false;
  cnsJaBuscou = true;
  if(currentTab === 'consulta') renderContent();
}

function cnsSetBusca(v){ cnsBusca = v; }
function cnsSubmit(ev){ if(ev) ev.preventDefault(); cnsBuscar(); return false; }
function cnsLimpar(){
  cnsBusca = ''; cnsVendas = []; cnsItens = {}; cnsErro = ''; cnsJaBuscou = false; cnsAberta = null;
  if(currentTab === 'consulta') renderContent();
}
function cnsAbrir(id){
  cnsAberta = (String(cnsAberta) === String(id)) ? null : id;
  if(currentTab === 'consulta') renderContent();
}

// ---------------------------------------------------------------------------
// O aparelho desta venda está na assistência AGORA?
//
// ⚠️ Casa por `apple_id` e, na falta dele, pelos 4 últimos do IMEI. É a mesma
// regra do resto do projeto (docs/CONTROLE-MANUTENCAO.md) e pela mesma razão:
// etiqueta colide (E1030 x SP1030) e há dois 8849 no estoque de hoje. Aqui o
// erro é barato -- mostra um selo a mais numa ficha --, mas o critério continua
// sendo o mesmo pra não nascer uma segunda regra de casamento.
// ---------------------------------------------------------------------------
function cnsNaAssistencia(item){
  if(!item) return null;
  const i4 = String(item.imei_1 || '').slice(-4);
  return (cnsFora || []).find(f =>
    (item.apple_id && String(f.apple_id) === String(item.apple_id))
    || (i4.length === 4 && String(f.imei4 || '') === i4)) || null;
}

// ---------------------------------------------------------------------------
// O telefone só vira link se der pra ligar de verdade.
//
// 11 dos 4.865 telefones cadastrados são placeholder ("00000000000"). Montar
// wa.me pra eles abriria o WhatsApp num número inexistente e a pessoa
// concluiria que o cliente não tem WhatsApp -- quando o que houve foi cadastro
// vazio. Aqui o número aparece como texto e o motivo fica claro.
//
// Formato: o banco guarda 11 dígitos (DDD + 9 + número) em 4.830 casos e 10 em
// 35 -- nenhum com o 55 na frente, por isso o prefixo entra aqui.
// ---------------------------------------------------------------------------
function cnsTelValido(tel){
  const d = cnsDigitos(tel);
  if(d.length < 10 || d.length > 11) return null;
  if(/^(\d)\1+$/.test(d)) return null;      // 00000000000 e afins
  return d;
}

function cnsTelHtml(tel, rotulo){
  if(!tel) return '<span class="cns-semtel">sem telefone</span>';
  const d = cnsTelValido(tel);
  if(!d) return `<span class="cns-semtel" title="Número inválido no cadastro da venda">${UI.esc(tel)} (inválido)</span>`;
  return `<a class="cns-tel" href="https://wa.me/55${d}" target="_blank" rel="noopener">${UI.esc(rotulo || tel)}</a>`;
}

function cnsQuem(v){
  const p = [];
  if(v.vendedor_key)  p.push('vendeu ' + v.vendedor_key);
  if(v.atendente_key) p.push('atendeu ' + v.atendente_key);
  return p.join(' · ');
}

function cnsData(d){
  if(!d) return '—';
  const s = String(d).slice(0, 10).split('-');
  return s.length === 3 ? `${s[2]}/${s[1]}/${s[0]}` : String(d);
}

// Quantos dias desde a venda -- é o que decide a conversa de garantia (§5).
// ⚠️ NÃO diz "está na garantia": o prazo por produto não existe no sistema, e
// afirmar isso a partir de uma data seria inventar regra. Diz o fato.
function cnsDiasDaVenda(d){
  if(!d) return null;
  const ms = Date.now() - new Date(String(d).slice(0,10) + 'T12:00:00').getTime();
  return Math.max(0, Math.round(ms / 86400000));
}

function cnsFichaHtml(v){
  const itens = cnsItens[v.id] || [];
  const dias = cnsDiasDaVenda(v.data_saida);
  const linhas = itens.map(i => {
    const fora = cnsNaAssistencia(i);
    const imei = String(i.imei_1 || '');
    return `<div class="cns-item">
      <div class="cns-item-nome">${UI.esc(String(i.titulo || '—').replace(/^iPhone\s*/,''))}</div>
      <div class="cns-item-meta">
        ${i.serial ? `<span class="est-tag">${UI.esc(i.serial)}</span>` : ''}
        ${imei ? `<span class="cns-mono" title="${UI.esc(imei)}">IMEI ⋯${UI.esc(imei.slice(-6))}</span>` : ''}
        <span class="cns-preco">${money(parseFloat(i.preco || 0))}</span>
        ${fora ? UI.badge('na assistência há ' + fora.dias_fora + 'd', 'alerta') : ''}
      </div>
    </div>`;
  }).join('');

  return `<div class="cns-ficha">
    <div class="cns-ficha-topo">
      <div>
        <div class="cns-cli">${UI.esc(v.cliente_nome || 'sem nome')}</div>
        <div class="cns-cli-meta">
          ${cnsTelHtml(v.cliente_tel)}
          ${v.cliente_cidade ? `<span>${UI.esc(v.cliente_cidade)}</span>` : ''}
        </div>
      </div>
      <div class="cns-ficha-num">
        <div class="cns-valor">${money(parseFloat(v.valor_total || 0))}</div>
        <div class="cns-sub">#${v.id}</div>
      </div>
    </div>
    <div class="cns-ficha-linha">
      <span>${cnsData(v.data_saida)}${dias != null ? ` · há ${dias} dia${dias === 1 ? '' : 's'}` : ''}</span>
      ${cnsQuem(v) ? `<span>${UI.esc(cnsQuem(v))}</span>` : ''}
      ${v.status && v.status !== 'completed' ? UI.badge(v.status === 'pending' ? 'pendente' : v.status, 'alerta') : ''}
    </div>
    ${linhas ? `<div class="cns-itens">${linhas}</div>`
             : '<div class="cns-vazio-itens">Sem itens registrados nesta venda.</div>'}
  </div>`;
}

function cnsResultadoHtml(){
  if(cnsBuscando) return UI.card({corpo:`<div class="cns-carregando">Procurando…</div>`});
  if(cnsErro)     return UI.card({corpo: UI.vazio({ico:'⚠️', titulo:'A busca falhou', texto:cnsErro,
                     acao: UI.btn('Tentar de novo', {onclick:'cnsBuscar()', variante:'primario'})})});
  if(!cnsJaBuscou) return '';
  if(!cnsVendas.length) return UI.card({corpo: UI.vazio({
    ico:'⌕', titulo:'Nada com isso',
    texto:'Procure pelo final do IMEI do aparelho, pelo nome do cliente ou pelo telefone. ' +
          'Se a venda for muito antiga, tente o nome completo como está na nota.',
    acao: UI.btn('Limpar', {onclick:'cnsLimpar()'})})});

  const cards = cnsVendas.map(v => {
    const aberta = String(cnsAberta) === String(v.id);
    const itens = cnsItens[v.id] || [];
    const foraAqui = itens.some(i => cnsNaAssistencia(i));
    return `<div class="cns-linha${aberta ? ' aberta' : ''}">
      <button class="cns-cab" onclick="cnsAbrir(${v.id})">
        <span class="cns-cab-cli">${UI.esc(v.cliente_nome || 'sem nome')}</span>
        <span class="cns-cab-meta">${cnsData(v.data_saida)}${v.loja ? ' · ' + UI.esc(v.loja) : ''}</span>
        <span class="cns-cab-val">${money(parseFloat(v.valor_total || 0))}</span>
        ${foraAqui ? UI.badge('na assistência', 'alerta') : ''}
        <span class="cns-seta">${aberta ? '▾' : '▸'}</span>
      </button>
      ${aberta ? cnsFichaHtml(v) : ''}
    </div>`;
  }).join('');

  return UI.card({
    titulo: cnsVendas.length === 1 ? 'A venda' : cnsVendas.length + ' vendas',
    sub: cnsVendas.length >= 30 ? 'mostrando as 30 mais recentes — refine a busca' : 'da mais nova pra mais antiga',
    flush: true,
    corpo: `<div class="cns-lista">${cards}</div>`,
  });
}

// §9: "quais aparelhos estão na assistência · quais clientes precisam receber
// retorno". É a primeira coisa da tela porque é o trabalho que não pode esperar
// alguém lembrar de procurar.
function cnsForaHtml(){
  if(!cnsForaCarregado)
    return UI.card({corpo:`<div class="cns-carregando">Carregando quem está esperando…</div>`});
  if(cnsForaErro)
    return UI.card({corpo: UI.vazio({ico:'⚠️',
      titulo:'Não consegui ver quem está esperando',
      texto:'A lista de aparelhos na assistência não carregou (' + UI.esc(cnsForaErro) + '). ' +
            'Isso NÃO quer dizer que não há ninguém esperando — quer dizer que não deu pra conferir.',
      acao: UI.btn('Tentar de novo', {onclick:'cnsRecarregarFora()', variante:'primario'})})});
  if(!cnsFora.length)
    return UI.card({corpo: UI.vazio({ico:'✅', titulo:'Nenhum aparelho de cliente na assistência',
      texto:'Quando um aparelho de cliente sair para a assistência, ele aparece aqui com o tempo que está fora.',
      acao: UI.btn('Atualizar', {onclick:'cnsRecarregarFora()'})})});
  const linhas = cnsFora.map(f => `<tr>
    <td data-rot="Cliente" class="forte">${UI.esc(f.cliente_nome || '—')}</td>
    <td data-rot="Aparelho">${UI.esc(String(f.modelo_txt || '—').replace(/^iPhone\s*/,''))}</td>
    <td data-rot="IMEI">${f.imei4 && f.imei4 !== '0000' ? '⋯' + UI.esc(f.imei4) : ''}</td>
    <td data-rot="Serviço">${UI.esc(f.servico || '—')}</td>
    <td data-rot="Onde">${UI.esc(f.fornecedor === 'RR' ? 'RR / Legacy' : 'Access')}</td>
    <td data-rot="Fora há" class="num">${UI.badge(f.dias_fora + 'd', f.dias_fora >= 10 ? 'critico' : f.dias_fora >= 5 ? 'alerta' : '')}</td>
    <td data-rot="" class="num">${f.cliente_tel
      ? cnsTelHtml(f.cliente_tel, 'avisar')
      : '<span class="cns-semtel" title="Ninguém registrou o contato do dono na saída">sem contato</span>'}</td>
  </tr>`).join('');

  const semDono = cnsFora.filter(f => !f.cliente_nome).length;
  return UI.card({
    titulo:'Aparelhos de cliente na assistência',
    sub: cnsFora.length + (cnsFora.length === 1 ? ' aparelho fora' : ' aparelhos fora')
       + (semDono ? ` · ${semDono} sem dono registrado` : ''),
    flush:true,
    corpo:`<div class="c-tabela-wrap"><table class="c-tabela cns-tabela">
      <thead><tr><th>Cliente</th><th>Aparelho</th><th>IMEI</th><th>Serviço</th>
      <th>Onde</th><th class="num">Fora há</th><th></th></tr></thead>
      <tbody>${linhas}</tbody></table></div>
      <div class="cns-atualizar">${UI.btn('Atualizar', {onclick:'cnsRecarregarFora()', sm:true})}</div>`,
  });
}

function renderConsulta(){
  return `<div class="cns-tela">
    <form class="cns-busca-wrap" onsubmit="return cnsSubmit(event)">
      <input class="c-input cns-busca" id="cns-busca" type="search"
             placeholder="Final do IMEI, nome do cliente ou telefone"
             value="${UI.esc(cnsBusca)}" oninput="cnsSetBusca(this.value)"
             autocapitalize="none" autocorrect="off" spellcheck="false">
      ${UI.btn(cnsBuscando ? 'Procurando…' : 'Procurar',
               {type:'submit', variante:'primario', disabled: cnsBuscando})}
      ${cnsJaBuscou ? UI.btn('Limpar', {onclick:'cnsLimpar()', variante:'sutil'}) : ''}
    </form>
    ${cnsResultadoHtml()}
    ${cnsJaBuscou ? '' : cnsForaHtml()}
  </div>`;
}
