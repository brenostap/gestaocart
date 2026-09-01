#!/usr/bin/env node
// ===========================================================================
// SNAPSHOT DA FOLHA — congela o mês, uma linha por pessoa.
//
//   node scripts/folha-snapshot.js 2026-07            # confere, não grava
//   node scripts/folha-snapshot.js 2026-07 --gravar   # grava em folha_mensal
//
// Precisa de SUPABASE_SERVICE_ROLE_KEY no ambiente (nunca no repo), como o
// scripts/reparos.js.
//
// ⚠️ POR QUE ESTE SCRIPT EXISTE, E POR QUE ELE É EM NODE E NÃO EM SQL:
//
// A comissão não se calcula com as vendas de uma pessoa só — ela depende do
// LUCRO de acessório (que o colaborador não pode ver) e dos totais da REDE
// (faixa da meta coletiva). Alguém tem que calcular do lado de cá.
//
// A tentação era reescrever a folha em SQL. Isso daria DOIS DONOS DO MESMO
// NÚMERO, e este repo já sabe como isso termina: em jul/2026 as faixas de meta
// estavam copiadas em 6 lugares e a folha saiu R$1.000 menor por pessoa.
//
// Então este script carrega os `js/*.js` REAIS — os mesmos que a tela e a
// exportação usam — e chama `fechamentoEquipe()`. Mesma técnica do
// test/fechamento.test.js. Se a regra mudar no equipe.js, muda aqui junto,
// porque é o mesmo arquivo.
//
// O segundo motivo é a regra que o repo tem por disciplina e passa a ter por
// estrutura: **fechamento pago não muda de valor depois.** O painel recalcula o
// passado com as regras de hoje, e em 17/ago o mapa de apelidos novo resgatou
// atendimentos que o código antigo perdia — mês fechado recalculado hoje já dá
// número diferente do que foi pago. Congelar resolve.
// ===========================================================================
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SB_URL = 'https://pfsfsibgmtbifypuyyqf.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const MES = process.argv[2];
const GRAVAR = process.argv.includes('--gravar');

if (!/^\d{4}-\d{2}$/.test(MES || '')) {
  console.error('uso: node scripts/folha-snapshot.js YYYY-MM [--gravar]');
  process.exit(1);
}
if (!KEY) {
  console.error('faltou SUPABASE_SERVICE_ROLE_KEY no ambiente.');
  process.exit(1);
}

// -- REST helpers -----------------------------------------------------------
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };

async function get(tabela, params) {
  const r = await fetch(`${SB_URL}/rest/v1/${tabela}?${params}`, { headers: H });
  if (!r.ok) throw new Error(`${tabela}: HTTP ${r.status} ${await r.text()}`);
  return r.json();
}

async function upsert(tabela, linhas) {
  const r = await fetch(`${SB_URL}/rest/v1/${tabela}`, {
    method: 'POST',
    headers: { ...H, Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(linhas),
  });
  if (!r.ok) throw new Error(`${tabela}: HTTP ${r.status} ${await r.text()}`);
  return r.json();
}

// -- o painel de verdade, num contexto sem browser --------------------------
function montarContexto() {
  const ctx = {
    console,
    window: { supabase: { createClient: () => ({ auth: {} }) }, matchMedia: () => ({ matches: false }) },
    document: {
      getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
      createElement: () => ({ style: {}, addEventListener() {}, remove() {} }),
      documentElement: { getAttribute: () => null, setAttribute() {} },
      body: { appendChild() {}, insertAdjacentHTML() {} },
    },
    localStorage: { getItem: () => null, setItem() {} },
    fetch: () => Promise.reject(new Error('o script busca os dados, o painel nao')),
    alert: m => { throw new Error('alert: ' + m); },
    Date, Math, JSON, Set, Map, Object, Array, String, Number, parseFloat, parseInt,
    isNaN, RegExp, Error, Promise, setTimeout,
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);

  // Mesma ordem do index.html, só o que o fechamento precisa.
  for (const f of ['config.js', 'equipe.js', 'core.js', 'render.js', 'custos.js',
                   'ui.js', 'vendas-extra.js', 'dash-v2.js', 'fechamento.js'])
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'), ctx, { filename: f });

  // O que mora em arquivos que não carregamos (estoque.js, shell.js).
  vm.runInContext(`
    function escapeHtml(s){ return String(s==null?'':s); }
    function money(v){ return brl(v); }
    function podeVerValor(){ return true; }
    function podeVerMargem(){ return true; }
    function podeVerDinheiro(){ return true; }
    function papelAtual(){ return 'socio'; }
    function getPendentes(){ return []; }
  `, ctx);

  return ctx;
}

// -- carga do mês -----------------------------------------------------------
async function carregarMes(mes) {
  const [ano, m] = mes.split('-').map(Number);
  const de = new Date(Date.UTC(ano, m - 1, 1)).toISOString();
  const ate = new Date(Date.UTC(ano, m, 1)).toISOString();

  const vendas = await get('vendas',
    `data_saida=gte.${de}&data_saida=lt.${ate}&order=data_saida.asc&limit=5000`);

  let produtos = [];
  const ids = vendas.map(v => v.id);
  for (let i = 0; i < ids.length; i += 100) {
    const lote = ids.slice(i, i + 100);
    produtos = produtos.concat(await get('venda_produtos',
      `venda_id=in.(${lote.join(',')})&limit=5000`));
  }
  const porVenda = {};
  produtos.forEach(p => { (porVenda[p.venda_id] = porVenda[p.venda_id] || []).push(p); });

  // `custos` alimenta remuneracaoFixa() e a conciliação da folha.
  const custos = await get('custos', `limit=5000`);
  const funcConfig = await get('funcionarios_config', `limit=200`).catch(() => []);

  // ⚠️ AS DUAS CARGAS ABAIXO NAO SAO OPCIONAIS -- sao o fallback do ATENDENTE.
  // `cadastradorAT()` (equipe.js) traduz cadastrador_id -> nome por `funcionariosFN`
  // (tabela `funcionarios`) e por `venda._cadastrador` (recorte de contas.raw). O
  // data.js carrega os dois; ate 01/set/2026 este script nao carregava NENHUM, entao
  // toda venda SEM OBS ficava sem atendente aqui e COM atendente na tela.
  // Medido em ago/2026: Leo perdia R$400 de acessorio, Gabi R$120, Vitinho R$20 --
  // R$112 a menos de comissao numa folha que a tela mostrava certa. Congelar assim
  // gravaria um numero que ninguem consegue reproduzir no painel.
  const funcFN = await get('funcionarios', 'select=id,nome,ativo').catch(() => []);
  let contasCad = [];
  for (let i = 0; i < ids.length; i += 100) {
    const lote = ids.slice(i, i + 100);
    contasCad = contasCad.concat(await get('contas',
      `select=venda_id,cad_id:raw->cadastrador->>id,cad_nome:raw->cadastrador->>nome&venda_id=in.(${lote.join(',')})`
    ).catch(() => []));
  }
  const cadMap = {};
  contasCad.forEach(c => {
    if (c.venda_id && c.cad_nome && !cadMap[c.venda_id])
      cadMap[c.venda_id] = { id: parseInt(c.cad_id) || null, nome: c.cad_nome };
  });

  return {
    vendas: vendas.map(v => ({ ...v, _produtos: porVenda[v.id] || [], _pagamentos: [], _trocas: [],
                               _cadastrador: cadMap[v.id] || null })),
    custos, funcConfig, funcFN,
  };
}

// ---------------------------------------------------------------------------
(async () => {
  console.log(`\nFolha de ${MES} — carregando do Supabase...`);
  const dados = await carregarMes(MES);
  console.log(`  ${dados.vendas.length} vendas · ${dados.custos.length} lançamentos de custo`);

  const ctx = montarContexto();
  vm.runInContext(`
    allVendas = ${JSON.stringify(dados.vendas)};
    allMovs = [];
    _custosCache = ${JSON.stringify(dados.custos)};
    _funcConfigCache = ${JSON.stringify(
      Object.fromEntries((dados.funcConfig || []).map(f => [f.id, f])))};
    funcionariosFN = ${JSON.stringify(dados.funcFN || [])};
    currentStore = 'ambas';
    currentPeriod = '${MES}';
  `, ctx);

  const fech = vm.runInContext('fechamentoEquipe()', ctx);

  console.log(`\nBase da rede: ${fech.base.aparelhos} aparelhos · ` +
              `R$${Math.round(fech.base.acessBruto).toLocaleString('pt-BR')} de acessório`);
  console.log(`Bônus coletivo do mês: R$${fech.bonusCol} por pessoa\n`);

  const linhas = fech.pessoas
    .filter(p => p.tipo !== 'socio')
    .map(p => ({
      mes: MES,
      func_id: p.id,
      nome: p.nome,
      aparelhos: p.units,
      vendas_vendidas: p.pedidos,
      // linhasAt é uma linha por venda atendida COM acessório — é a base do 25%.
      vendas_atendidas: (p.linhasAt || []).length,
      acess_qtd: p.qtAcess,
      acess_bruto: Number(p.brutoAcess.toFixed(2)),
      acess_lucro: Number(p.la.toFixed(2)),
      comissao_vendedor: Math.round(p.commVo),
      comissao_atendente: Math.round(p.commAt),
      bonus_meta: p.bonusMeta,
      bonus_coletivo: p.bonusCol,
      bonus_extra: Math.round(p.bonus5),
      total_variavel: Math.round(p.commVo + p.commAt + p.bonusMeta + p.bonusCol + p.bonus5),
      fechado_por: 'scripts/folha-snapshot.js',
    }))
    // Quem não gerou nada variável no mês não vira linha: snapshot de zero só
    // suja a tela de quem nem trabalhou no período.
    .filter(l => l.total_variavel > 0 || l.aparelhos > 0 || l.vendas_atendidas > 0);

  const w = (s, n) => String(s).padEnd(n);
  const r = (s, n) => String(s).padStart(n);
  console.log(w('pessoa', 12) + r('aparelh', 8) + r('acess R$', 10) + r('comVo', 8) +
              r('comAt', 8) + r('meta', 7) + r('coletivo', 9) + r('5%', 7) + r('TOTAL', 9));
  console.log('-'.repeat(78));
  for (const l of linhas)
    console.log(w(l.func_id, 12) + r(l.aparelhos, 8) + r(Math.round(l.acess_bruto), 10) +
      r(l.comissao_vendedor, 8) + r(l.comissao_atendente, 8) + r(l.bonus_meta, 7) +
      r(l.bonus_coletivo, 9) + r(l.bonus_extra, 7) + r(l.total_variavel, 9));
  console.log('-'.repeat(78));
  console.log(w('', 12) + r('', 8) + r('', 10) + r('', 8) + r('', 8) + r('', 7) + r('', 9) +
              r('', 7) + r(linhas.reduce((a, l) => a + l.total_variavel, 0), 9));

  if (fech.avisos.length) {
    console.log('\nAvisos do fechamento (os mesmos que a tela mostra):');
    fech.avisos.forEach(a => console.log('  · ' + a));
  }

  if (!GRAVAR) {
    console.log(`\n(nada gravado — rode com --gravar para congelar ${MES})`);
    return;
  }

  const salvas = await upsert('folha_mensal', linhas);
  console.log(`\n${salvas.length} linhas gravadas em folha_mensal para ${MES}.`);
})().catch(e => { console.error('\nfalhou:', e.message); process.exit(1); });
