// Banco de provas do celular (ver proto-mobile.html).
// Repete o html que renderVendas/renderEstoque produzem, com dados falsos.
const money = v => 'R$' + Math.round(v).toLocaleString('pt-BR');
const esc = s => UI.esc(s);

const VENDAS = [
  {id:40590836, data:'01/08', cliente:'Gabrielle Silva', loja:'cart', produto:'15 Plus 128GB Azul SN',
   vend:'Isa', at:'Anne', parc:'10x', valor:3490, taxa:118, lucro:1084, mg:31},
  {id:40590745, data:'01/08', cliente:'Marcos Andrade', loja:'urban', produto:'13 128GB Meia-noite SN',
   vend:'Leo', at:'Anne', parc:'à vista', valor:2650, taxa:0, lucro:640, mg:24, mais:1},
  {id:40590711, data:'01/08', cliente:'Juliana Prado dos Santos', loja:'cart', produto:'16 Pro Max 256GB Titânio LAC',
   vend:'Gustavo', at:'Bia', parc:'12x', valor:9200, taxa:410, lucro:1310, mg:14},
  {id:40590702, data:'01/08', cliente:'Rafael Lima', loja:'cart', produto:'12 64GB Branco SN',
   vend:'Isa', at:'Anne', parc:'à vista', valor:1750, taxa:0, lucro:390, mg:22},
  {id:40590688, data:'31/07', cliente:'Camila Nogueira', loja:'urban', produto:'14 128GB Estelar SN',
   vend:'Leo', at:'Bia', parc:'6x', valor:3100, taxa:96, lucro:720, mg:23},
];

const APARELHOS = [
  {etq:'E1480', mod:'11', cap:'128GB', cor:'Preto', bat:72, imei:'358989499426601', custo:230, venda:1000},
  {etq:'E1614', mod:'11', cap:'256GB', cor:'Preto', bat:75, imei:'355608706937134', custo:250, venda:null},
  {etq:'E1702', mod:'12', cap:'128GB', cor:'Azul', bat:88, imei:'352914771208833', custo:1450, venda:2100},
  {etq:'E1755', mod:'13 Pro', cap:'256GB', cor:'Grafite', bat:83, imei:'351209884471020', custo:2600, venda:3450},
  {etq:'E1801', mod:'15 Pro Max', cap:'512GB', cor:'Titânio Natural', bat:96, imei:'359102773640118', custo:5400, venda:6900},
];

// ── VENDAS ────────────────────────────────────────────────────────────────
function telaVendas(){
  const lojaTag = l => l==='cart' ? UI.badge('Cart','processo') : UI.badge('Urban','alerta');
  const COLS = 10;

  const linha = r => `<tr class="est-linha${r.id===SEL?' sel':''}" onclick="selecionar(${r.id})">
      <td data-rot="Venda"><span class="est-seta">▸</span><span class="est-tag">#${r.id}</span></td>
      <td data-rot="Data"><span class="est-imei">${r.data}</span></td>
      <td data-rot="Cliente" class="forte">${esc(r.cliente)}</td>
      <td data-rot="Loja">${lojaTag(r.loja)}</td>
      <td data-rot="Produto">${esc(r.produto)}${r.mais?` <span class="v-mais">+${r.mais}</span>`:''}</td>
      <td data-rot="Vendedor">${r.vend}</td>
      <td data-rot="Atendente">${r.at}</td>
      <td data-rot="Valor" class="num forte">${money(r.valor)}</td>
      <td data-rot="Lucro" class="num"><span class="est-venda" style="color:var(--success)">${money(r.lucro)}</span></td>
    </tr>` + (r.id===SEL ? fichaInline(r) : '');

  const banda = (data, rows) => `<tr class="v-diaband" onclick="void 0">
    <td colspan="${COLS}">
      <div class="v-dia-head">
        <div class="v-dia-cal"><span class="est-seta">▸</span>
          <span class="v-dia-data">${data}</span>
          <span class="v-dia-cnt">${rows.length} vendas</span></div>
        <div class="v-dia-kpis">
          <span class="v-dia-kpi"><i>peças</i><b>${rows.length+1}</b><em>Cart 9 · Urban 5</em></span>
          <span class="v-dia-kpi"><i>bruto</i><b>${money(rows.reduce((a,r)=>a+r.valor,0))}</b></span>
          <span class="v-dia-kpi"><i>lucro</i><b class="ok">${money(rows.reduce((a,r)=>a+r.lucro,0))}</b></span>
          <span class="v-dia-kpi"><i>acessórios</i><b>R$2.200</b><em>lucro R$1.584</em></span>
        </div>
      </div>
    </td></tr>`;

  const d1 = VENDAS.filter(r=>r.data==='01/08'), d2 = VENDAS.filter(r=>r.data==='31/07');
  const corpo = banda('Sáb, 01/08', d1) + d1.map(linha).join('')
              + banda('Sex, 31/07', d2) + d2.map(linha).join('');

  const tabela = UI.card({titulo:'Pedidos', sub:VENDAS.length+' vendas', flush:true,
    corpo:`<div class="c-tabela-wrap"><table class="c-tabela est-tabela">
      <thead><tr>
        <th>Venda</th><th>Data</th><th>Cliente</th><th>Loja</th><th>Produto</th>
        <th>Vendedor</th><th>Atendente</th><th class="num">Valor</th><th class="num">Lucro</th>
      </tr></thead><tbody>${corpo}</tbody></table></div>`});

  return `
    <div class="pg-head">
      <div>
        <div class="pg-kicker">Operações</div>
        <h1 class="pg-title">Vendas</h1>
        <div class="pg-desc">Pedidos do período, com os aparelhos e acessórios de cada venda.</div>
      </div>
      <div class="pg-acoes">
        ${UI.btn('Resumo do dia',{onclick:'void 0'})}
        ${UI.btn('↻ Atualizar',{onclick:'void 0',variante:'primario'})}
      </div>
    </div>
    ${UI.kpis([
      {rotulo:'Pedidos', valor:16, sub:'no período'},
      {rotulo:'Produtos vendidos', valor:15, sub:'aparelhos, sem acessórios'},
      {rotulo:'Bruto', valor:money(63560), sub:'receita do período'},
      {rotulo:'Lucro', valor:money(11007), tom:'ok', sub:'margem 17%'},
    ])}
    <div class="est-barra">
      <div class="est-busca"><span class="est-busca-ico">⌕</span>
        <input type="text" placeholder="Buscar cliente, produto, vendedor ou etiqueta...">
      </div>
      <label class="est-sel"><span>Loja</span><select><option>Todas</option></select></label>
      <label class="est-sel"><span>Vendedor</span><select><option>Todos</option></select></label>
      <label class="est-sel"><span>Atendente</span><select><option>Todos</option></select></label>
      ${UI.btn('+ Mais colunas',{onclick:'void 0',variante:'sutil',sm:true})}
    </div>
    <div class="v-stage"><div class="v-lista">${tabela}</div></div>`;
}

function fichaInline(r){
  return `<tr class="est-detalhe v-ficha-linha"><td colspan="10">${fichaHTML(r)}</td></tr>`;
}

function fichaHTML(r){
  const lojaBadge = r.loja==='cart' ? UI.badge('Cart','processo') : UI.badge('Urban','alerta');
  return `<div class="v-ficha">
    <div class="vf-head">
      <button class="vf-fechar" onclick="event.stopPropagation();selecionar(null)">✕</button>
      <div class="vf-eyebrow">Ficha da venda</div>
      <div class="vf-title">#${r.id} · ${r.data}/2026</div>
      <div class="vf-chips">${lojaBadge} <span class="vf-chip" data-tom="ok">✓ Concluída</span></div>
    </div>
    <div class="vf-body">
      <div class="vf-blk">
        <div class="vf-blk-t">Cliente</div>
        <div class="vf-item"><div><div class="vf-nm">${esc(r.cliente)}</div>
          <div class="vf-meta">São Paulo</div></div></div>
        <div class="vf-contatos"><a class="vf-cbtn" href="#">WhatsApp</a><a class="vf-cbtn" href="#">Instagram</a>
          ${UI.btn('Resumo da venda',{sm:true,variante:'sutil',onclick:'void 0'})}</div>
      </div>
      <div class="vf-blk">
        <div class="vf-blk-t">Aparelhos <span class="vf-cnt">1</span></div>
        <div class="vf-item">
          <div><div class="vf-nm">${esc(r.produto)}</div>
            <div class="vf-meta">IMEI 358989499426601 · custo ${money(r.valor-r.lucro)}</div></div>
          <div class="vf-v num">${money(r.valor)}<small>lucro ${money(r.lucro)}</small></div>
        </div>
      </div>
      <div class="vf-blk">
        <div class="vf-blk-t">Pagamento</div>
        <div class="vf-pay"><div class="vf-pay-top"><span class="vf-nm">Crédito ${r.parc}</span>
          <span class="vf-v num">${money(r.valor)}</span></div>
          <div class="vf-meta">taxa ${money(r.taxa)} · líquido ${money(r.valor-r.taxa)} · Itaú</div></div>
      </div>
      <div class="vf-blk">
        <div class="vf-blk-t">Resumo</div>
        <div class="vf-kv"><span class="k">Valor da venda</span><span class="vv num">${money(r.valor)}</span></div>
        <div class="vf-kv"><span class="k">Custo da mercadoria</span><span class="vv num">${money(r.valor-r.lucro)}</span></div>
        <div class="vf-kv big"><span class="k">Lucro</span><span class="vv num">${money(r.lucro)} · ${r.mg}%</span></div>
      </div>
    </div>
  </div>`;
}

// ── ESTOQUE ───────────────────────────────────────────────────────────────
function telaEstoque(){
  const bat = b => `<span class="est-bat" data-tom="${b<80?'critico':b<85?'alerta':'ok'}">▮ ${b}%</span>`;

  const linha = d => `<tr class="est-linha${d.etq===ABERTO?' aberta':''}" onclick="abrir('${d.etq}')">
      <td data-rot="Etiqueta"><span class="est-seta">${d.etq===ABERTO?'▾':'▸'}</span><span class="est-tag">${d.etq}</span></td>
      <td data-rot="Produto" class="forte"><span class="est-prod">${d.mod} ${d.cap}</span></td>
      <td data-rot="Cor">${d.cor}</td>
      <td data-rot="Bateria" class="num">${bat(d.bat)}</td>
      <td data-rot="IMEI"><span class="est-imei">${d.imei}</span></td>
      <td data-rot="Custo" class="num">${money(d.custo)}</td>
      <td data-rot="Venda" class="num">${d.venda==null?'<span class="est-sempreco">sem tabela</span>':`<span class="est-venda">${money(d.venda)}</span>`}</td>
    </tr>` + (d.etq===ABERTO ? detalhe(d) : '');

  const detalhe = d => `<tr class="est-detalhe"><td colspan="7">
      <div class="est-det-campos">
        <div><i class="det-rot">Origem</i>Compra · 12/06/2026 · Fornecedor Alpha <span class="est-tag">#3312</span></div>
        <div><i class="det-rot">Fornecedor</i>Alpha Distribuidora</div>
        <div><i class="det-rot">Entrada</i>12/06/2026</div>
        <div><i class="det-rot">Condição</i>${UI.badge('Seminovo')}</div>
        <div><i class="det-rot">IMEI</i><span class="est-imei">${d.imei}</span></div>
        <div><i class="det-rot">Margem</i>${d.venda==null?'—':money(d.venda-d.custo)}</div>
      </div></td></tr>`;

  const tabela = UI.card({titulo:'Aparelhos', sub:'220 unidades', flush:true,
    corpo:`<div class="c-tabela-wrap"><table class="c-tabela est-tabela">
      <thead><tr><th>Etiqueta</th><th>Produto</th><th>Cor</th><th class="num">Bateria</th>
        <th>IMEI</th><th class="num">Custo</th><th class="num">Venda</th></tr></thead>
      <tbody>${APARELHOS.map(linha).join('')}</tbody></table></div>`});

  return `
    <div class="pg-head">
      <div>
        <div class="pg-kicker">Operações</div>
        <h1 class="pg-title">Estoque</h1>
        <div class="pg-desc">Aparelhos disponíveis, com custo, preço de tabela e margem por unidade.</div>
      </div>
      <div class="pg-acoes">
        ${UI.btn('💬 Exportar WhatsApp',{onclick:'void 0'})}
        ${UI.btn('↻ Atualizar',{onclick:'void 0',variante:'primario'})}
      </div>
    </div>
    ${UI.kpis([
      {rotulo:'Aparelhos', valor:220, sub:'em estoque'},
      {rotulo:'Entradas de cliente', valor:38, sub:'17% do estoque'},
      {rotulo:'Capital', valor:money(486300), sub:'custo parado em estoque'},
      {rotulo:'Margem potencial', valor:money(92150), tom:'ok', sub:'188 de 220 com preço na tabela'},
    ])}
    <div class="est-barra">
      <div class="est-busca"><span class="est-busca-ico">⌕</span>
        <input type="text" placeholder="Buscar por modelo, IMEI, etiqueta ou fornecedor...">
      </div>
      <label class="est-sel"><span>Origem</span><select><option>Todos</option></select></label>
      <label class="est-sel"><span>Modelo</span><select><option>Todos</option></select></label>
    </div>
    <div class="est-chips"><span class="est-chips-rot">Capacidade</span>
      ${UI.chip('Todas',true,'void 0')}${UI.chip('64GB',false,'void 0')}${UI.chip('128GB',false,'void 0')}
      ${UI.chip('256GB',false,'void 0')}${UI.chip('512GB',false,'void 0')}</div>
    ${tabela}`;
}

// ── estado do proto ───────────────────────────────────────────────────────
let TELA = 'vendas', SEL = null, ABERTO = null;
function pinta(){ document.getElementById('content').innerHTML = TELA==='vendas' ? telaVendas() : telaEstoque(); }
function selecionar(id){ SEL = (SEL===id ? null : id); pinta(); }
function abrir(etq){ ABERTO = (ABERTO===etq ? null : etq); pinta(); }
document.getElementById('bt-v').onclick = () => { TELA='vendas'; marca(); pinta(); };
document.getElementById('bt-e').onclick = () => { TELA='estoque'; marca(); pinta(); };
function marca(){
  document.getElementById('bt-v').classList.toggle('active', TELA==='vendas');
  document.getElementById('bt-e').classList.toggle('active', TELA==='estoque');
}
pinta();
