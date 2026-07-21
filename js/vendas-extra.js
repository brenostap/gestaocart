// -- VENDAS COM DADOS INCOMPLETOS ----------------------------------------------
function getVendasIncompletas(){
  const vendas = filterByPeriod(allVendas, true); // incluir pending tambem
  const resultado = [];

  vendas.forEach(v => {
    const info = getVendaInfo(v);
    const loja = info.loja;
    const vend = (info.vendedor||'').toLowerCase().trim();
    const atend = (info.atendente||'').toLowerCase().trim();

    const temDevice = v._produtos?.some(p => isPrincipal(p));
    const temAcess = v._produtos?.some(p => !isPrincipal(p));
    const temProduto = v._produtos && v._produtos.length > 0;
    const valor = parseFloat(v.valor_total||0);

    // Device com prejuizo: valor_estoque > preco em algum item principal
    const prejuizoDevice = v._produtos?.find(p =>
      isPrincipal(p) && parseFloat(p.preco||0) > 0 && parseFloat(p.valor_estoque||0) > parseFloat(p.preco||0)
    );

    const vendIsVO = matchNome(vend, VO_KEYS);
    const vendIsAT = matchNome(vend, AT_KEYS); // atendente pode vender device (R$25/un)
    const vendIsLoja = !vend || SOCIOS_LOJA.includes(vend);
    const vendIsKnown = vendIsVO || vendIsAT || vendIsLoja;

    const atendIsAT = matchNome(atend, AT_KEYS);
    const atendIsKnown = atendIsAT || !atend || SOCIOS_LOJA.includes(atend);

    const tipos = [];
    if(!loja) tipos.push('sem_loja');
    if(!vend && temDevice) tipos.push('sem_vendedor');
    if(!atend && temAcess) tipos.push('sem_atendente');
    if(vend && !vendIsKnown) tipos.push('vendedor_desconhecido');
    if(atend && !atendIsKnown) tipos.push('atendente_desconhecido');
    if(valor === 0 && temProduto && v.status==='completed') tipos.push('valor_zero');
    if(prejuizoDevice) tipos.push('prejuizo_device');

    if(tipos.length > 0) {
      // Severidade: 'leve' se a venda nao tem device (so acessorio) -- nao bloqueia comissao de R$25
      // 'critica' se tem device com info faltando -- impacta atribuicao de receita e comissao
      // 'critica' tambem se valor_zero com device ou prejuizo
      const ehCritica = (temDevice && (
        tipos.includes('sem_loja') ||
        tipos.includes('sem_vendedor') ||
        tipos.includes('vendedor_desconhecido') ||
        tipos.includes('prejuizo_device')
      )) || tipos.includes('valor_zero');
      const severidade = ehCritica ? 'critica' : 'leve';
      resultado.push({
        id: v.id,
        data: v.data_saida.slice(0,10),
        status: v.status,
        valor: v.valor_total,
        loja: loja || '—',
        vendedor: info.vendedor || '—',
        atendente: info.atendente || '—',
        tipos,
        severidade,
        prejuizo: prejuizoDevice ? (parseFloat(prejuizoDevice.preco) - parseFloat(prejuizoDevice.valor_estoque)) : 0,
        produtos: v._produtos?.filter(p=>isPrincipal(p)).map(p=>
          (p.titulo||'').replace(/^iPhone\s*/i,'').replace(/\s*Seminovo/i,' SN').trim().slice(0,22)
        ).join(', ') || null,
        acess: v._produtos?.filter(p=>!isPrincipal(p)).length || 0,
      });
    }
  });

  return resultado.sort((a,b) => b.data.localeCompare(a.data));
}


function abrirModalIncompletas(){
  const lista = getVendasIncompletas().filter(v => v.status === 'completed');
  const criticas = lista.filter(v => v.severidade === 'critica');
  const leves = lista.filter(v => v.severidade === 'leve');

  const labels = {
    'sem_loja': '🏪 Sem loja',
    'sem_vendedor': '👤 Sem vendedor',
    'sem_atendente': '🏷 Sem atendente',
    'vendedor_desconhecido': '❓ Vendedor desconhecido',
    'atendente_desconhecido': '❓ Atendente desconhecido',
    'valor_zero': '💸 Valor R$ 0',
    'prejuizo_device': '📉 Device com prejuízo',
  };

  function rowsHTML(itens, sev){
    if(itens.length === 0){
      return `<div style="padding:32px 0;text-align:center;color:var(--text4);font-size:12px">Nenhuma venda nesta categoria 🎉</div>`;
    }
    const cor = sev === 'critica' ? '#ff6347' : '#fbbf24';
    const bg  = sev === 'critica' ? 'rgba(255,99,71,.12)' : 'rgba(251,191,36,.15)';
    return itens.map(v => {
      const tags = v.tipos.map(t =>
        `<span style="font-size:10px;padding:2px 7px;border-radius:4px;background:${bg};color:${cor};font-weight:600">${labels[t]||t}</span>`
      ).join(' ');
      const dataFmt = v.data.slice(5).replace('-','/');
      return `
        <div style="padding:10px 0;border-bottom:1px solid var(--border)">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
            <div style="flex:1;min-width:0">
              <div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:3px">
                <a href="https://app.fone.ninja/vendas/${v.id}" target="_blank" rel="noopener" style="color:var(--cart);text-decoration:none">#${v.id} ↗</a> · ${dataFmt} · ${brl(v.valor||0)}${v.prejuizo>0?` · <span style="color:var(--red)">-${brl(v.prejuizo)}</span>`:''}
              </div>
              <div style="font-size:11px;color:var(--text4);margin-bottom:4px">
                ${v.produtos ? '📱 '+v.produtos : ''}${v.acess>0 ? (v.produtos?' · ':'')+v.acess+' acess.':''}
              </div>
              <div style="font-size:11px;color:var(--text3)">
                Loja: <b>${v.loja}</b> · Vendedor: <b>${v.vendedor}</b> · Atendente: <b>${v.atendente}</b>
              </div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex-shrink:0">
              ${tags}
            </div>
          </div>
        </div>`;
    }).join('');
  }

  // Estado da aba inicial: critica por padrao; se nao tiver critica e tiver leve, abre em leve
  if(typeof window._abaIncompletas === 'undefined') window._abaIncompletas = 'critica';
  if(criticas.length === 0 && leves.length > 0) window._abaIncompletas = 'leve';
  if(leves.length === 0 && criticas.length > 0) window._abaIncompletas = 'critica';

  // Guardar listas no escopo da funcao de troca
  window._incompletasCriticas = criticas;
  window._incompletasLeves = leves;
  window._incompletasLabels = labels;

  function abaStyle(active, sev){
    const cor = sev === 'critica' ? '#ff6347' : '#fbbf24';
    return active
      ? `padding:8px 14px;background:${sev==='critica'?'rgba(255,99,71,.15)':'rgba(251,191,36,.15)'};border:1px solid ${sev==='critica'?'rgba(255,99,71,.4)':'rgba(251,191,36,.4)'};border-radius:8px;color:${cor};font-size:12px;font-weight:700;cursor:pointer`
      : `padding:8px 14px;background:transparent;border:1px solid var(--border);border-radius:8px;color:var(--text3);font-size:12px;font-weight:500;cursor:pointer`;
  }

  const aba = window._abaIncompletas;
  const itensAba = aba === 'critica' ? criticas : leves;

  const existing = document.getElementById('modal-incompletas');
  if(existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'modal-incompletas';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px)';
  modal.innerHTML = `
    <div style="background:var(--bg2);border:1px solid var(--border2);border-radius:16px;max-width:620px;width:100%;max-height:80vh;display:flex;flex-direction:column">
      <div style="padding:20px 24px 16px;border-bottom:1px solid var(--border);flex-shrink:0">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <div>
            <div style="font-size:15px;font-weight:700">⚠️ Obs incompletas</div>
            <div style="font-size:11px;color:var(--text4);margin-top:3px">Corrija no FoneNinja · sync automático a cada hora</div>
          </div>
          <button onclick="document.getElementById('modal-incompletas').remove()" style="background:none;border:none;color:var(--text3);font-size:20px;cursor:pointer">×</button>
        </div>
        <div style="display:flex;gap:8px">
          <button onclick="trocarAbaIncompletas('critica')" style="${abaStyle(aba==='critica','critica')}">
            🔴 Críticas (${criticas.length})
          </button>
          <button onclick="trocarAbaIncompletas('leve')" style="${abaStyle(aba==='leve','leve')}">
            🟡 Leves (${leves.length})
          </button>
        </div>
        <div style="font-size:11px;color:var(--text4);margin-top:10px">
          ${aba==='critica'
            ? '🔴 Vendas <b>com device</b> faltando info — impacta atribuição de receita e comissão'
            : '🟡 Vendas <b>só de acessórios</b> faltando info — impacto menor, mas vale corrigir'}
        </div>
      </div>
      <div id="modal-incompletas-body" style="padding:0 24px;overflow-y:auto;flex:1">
        ${rowsHTML(itensAba, aba)}
      </div>
      <div style="padding:14px 24px;border-top:1px solid var(--border);font-size:11px;color:var(--text4);flex-shrink:0">
        💡 Formatos aceitos: <b>cart/urban</b> · vendedor: <b>david/isa/mel/pietra</b> · atendente: <b>davi/anne/vitinho/denilson/pietra</b>
      </div>
    </div>`;

  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if(e.target === modal) modal.remove(); });
}

function trocarAbaIncompletas(sev){
  window._abaIncompletas = sev;
  // Re-renderizar abrindo de novo (preserva estado)
  abrirModalIncompletas();
}


function abrirEdicaoCusto(id){
  const c = (_custosCache||[]).find(x=>x.id===id);
  if(!c){ alert('Custo não encontrado'); return; }
  editarCusto(id, c.desc||c.descricao||'', c.valor||0, c.loja||'ambas', c.area||'outros', c.data||'', c.obs||'');
}

function editarCusto(id, desc, valor, loja, area, data, obs){
  const existing = document.getElementById('modal-editar-custo');
  if(existing) existing.remove();

  const areas = ['marketing','assistencia','financeiro','aluguel','ia','contabilidade','operacional','outros','salario'];
  const areaOpts = areas.map(a => `<option value="${a}"${a===area?' selected':''}>${areaLabel(a)}</option>`).join('');
  const lojaOpts = ['cart','urban','ambas'].map(l => `<option value="${l}"${l===loja?' selected':''}>${l==='cart'?'📱 Cart':l==='urban'?'🏙 Urban':'🔀 Ambas'}</option>`).join('');

  const modal = document.createElement('div');
  modal.id = 'modal-editar-custo';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px)';
  modal.innerHTML = `
    <div style="background:var(--bg2);border:1px solid var(--border2);border-radius:16px;width:100%;max-width:440px;padding:24px">
      <div style="font-size:15px;font-weight:700;margin-bottom:20px">✏️ Editar custo</div>

      <div style="display:grid;gap:12px">
        <div>
          <div style="font-size:11px;color:var(--text4);margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:.06em">Descrição</div>
          <input id="ec-desc" value="${desc}" style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:8px 12px;color:var(--text);font-size:13px;box-sizing:border-box">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div>
            <div style="font-size:11px;color:var(--text4);margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:.06em">Valor</div>
            <input id="ec-valor" type="number" value="${valor}" style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:8px 12px;color:var(--text);font-size:13px;box-sizing:border-box">
          </div>
          <div>
            <div style="font-size:11px;color:var(--text4);margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:.06em">Data</div>
            <input id="ec-data" type="date" value="${data}" style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:8px 12px;color:var(--text);font-size:13px;box-sizing:border-box">
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div>
            <div style="font-size:11px;color:var(--text4);margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:.06em">Loja</div>
            <select id="ec-loja" style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:8px 12px;color:var(--text);font-size:13px;box-sizing:border-box">${lojaOpts}</select>
          </div>
          <div>
            <div style="font-size:11px;color:var(--text4);margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:.06em">Categoria</div>
            <select id="ec-area" style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:8px 12px;color:var(--text);font-size:13px;box-sizing:border-box">${areaOpts}</select>
          </div>
        </div>
        <div>
          <div style="font-size:11px;color:var(--text4);margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:.06em">Obs</div>
          <input id="ec-obs" value="${obs}" style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:8px 12px;color:var(--text);font-size:13px;box-sizing:border-box">
        </div>
      </div>

      <div style="display:flex;gap:10px;margin-top:20px">
        <button onclick="document.getElementById('modal-editar-custo').remove()"
          style="flex:1;padding:10px;background:var(--bg3);border:1px solid var(--border);border-radius:9px;color:var(--text3);font-size:13px;cursor:pointer">Cancelar</button>
        <button onclick="salvarEdicaoCusto(${id})"
          style="flex:2;padding:10px;background:var(--cart);border:none;border-radius:9px;color:#fff;font-size:13px;font-weight:700;cursor:pointer">Salvar alterações</button>
      </div>
    </div>`;

  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if(e.target===modal) modal.remove(); });
  document.getElementById('ec-desc').focus();
}

async function salvarEdicaoCusto(id){
  const desc  = document.getElementById('ec-desc').value.trim();
  const valor = parseFloat(document.getElementById('ec-valor').value);
  const loja  = document.getElementById('ec-loja').value;
  const area  = document.getElementById('ec-area').value;
  const data  = document.getElementById('ec-data').value;
  const obs   = document.getElementById('ec-obs').value.trim();

  if(!desc || isNaN(valor)){
    alert('Preencha descrição e valor'); return;
  }

  const btn = document.querySelector('#modal-editar-custo button:last-child');
  btn.textContent = 'Salvando...'; btn.disabled = true;

  const r = await fetch(SB_URL+'/rest/v1/custos?id=eq.'+id, {
    method: 'PATCH',
    headers: {'apikey':SB_KEY,'Authorization':'Bearer '+SB_TOKEN,'Content-Type':'application/json'},
    body: JSON.stringify({ descricao:desc, valor, loja, area, data, obs })
  });

  if(r.ok){
    document.getElementById('modal-editar-custo').remove();
    // Atualizar cache local
    const idx = (_custosCache||[]).findIndex(c=>c.id===id);
    if(idx>=0){
      _custosCache[idx] = {..._custosCache[idx], desc, descricao:desc, valor, loja, area, data, obs};
    }
    renderContent();
    mostrarNotif('✅ Custo atualizado');
  } else {
    btn.textContent = 'Salvar alterações'; btn.disabled = false;
    alert('Erro ao salvar — tente novamente');
  }
}


// -- VENDAS COM PRODUTO NAO IDENTIFICADO --------------------------------------
function getVendasSemDeviceDetalhado(){
  const v = filterByPeriod(allVendas);
  return v.filter(x => {
    // _produtos existe mas nenhum e principal -- e FoneNinja diz que tem produtos
    if(x._produtos == null) return false;
    const temPrincipal = x._produtos.some(p => isPrincipal(p));
    const temAcess = x._produtos.some(p => !isPrincipal(p));
    const qtd = parseInt(x.qtd_produtos||0);
    // Suspeito: tem acessorios, sem devices detalhados, e qtd_produtos > 0
    return !temPrincipal && temAcess && qtd > 0;
  }).map(v => ({
    id: v.id,
    data: v.data_saida.slice(0,10),
    loja: v.loja || '—',
    valor: v.valor_total,
    qtd_fn: v.qtd_produtos, // o que FoneNinja diz
    atendente: v.atendente_obs || '—',
    vendedor: v.vendedor_obs || '—',
    produtos: v._produtos.map(p=>p.titulo?.slice(0,20)).join(', ')
  })).sort((a,b)=>a.data.localeCompare(b.data));
}


function abrirModalSemDevice(){
  const lista = getVendasSemDeviceDetalhado();
  const existing = document.getElementById('modal-sem-device');
  if(existing) existing.remove();

  const rows = lista.map(v => `
    <div style="padding:10px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
        <div style="flex:1">
          <div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:3px">
            #${v.id} · ${v.data.slice(5).replace('-','/')} · ${brl(v.valor||0)}
          </div>
          <div style="font-size:11px;color:var(--text4);margin-bottom:3px">
            🏪 ${v.loja} · vendedor: ${v.vendedor} · atendente: ${v.atendente}
          </div>
          <div style="font-size:11px;color:var(--text3)">
            Produtos no FN: <b>${v.qtd_fn}</b> · Identificados: <i>${v.produtos.slice(0,50)}</i>
          </div>
        </div>
        <span style="font-size:10px;padding:2px 8px;border-radius:4px;background:rgba(251,191,36,.12);color:#fbbf24;font-weight:600;flex-shrink:0">sem device</span>
      </div>
    </div>`).join('');

  const modal = document.createElement('div');
  modal.id = 'modal-sem-device';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px)';
  modal.innerHTML = `
    <div style="background:var(--bg2);border:1px solid var(--border2);border-radius:16px;max-width:600px;width:100%;max-height:80vh;display:flex;flex-direction:column">
      <div style="padding:20px 24px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-shrink:0">
        <div>
          <div style="font-size:15px;font-weight:700">🔍 Vendas sem device identificado — ${lista.length}</div>
          <div style="font-size:11px;color:var(--text4);margin-top:3px">Corrija o vínculo do produto no FoneNinja para contabilizar corretamente</div>
        </div>
        <button onclick="document.getElementById('modal-sem-device').remove()" style="background:none;border:none;color:var(--text3);font-size:20px;cursor:pointer">×</button>
      </div>
      <div style="padding:0 24px;overflow-y:auto;flex:1">${rows}</div>
      <div style="padding:14px 24px;border-top:1px solid var(--border);font-size:11px;color:var(--text4);flex-shrink:0">
        💡 O produto foi registrado como acessório no FoneNinja mas deveria ser um device (iPhone/iPad/etc)
      </div>
    </div>`;

  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if(e.target===modal) modal.remove(); });
}


