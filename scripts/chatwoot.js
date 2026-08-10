#!/usr/bin/env node
/**
 * Ferramenta de linha de comando pro Chatwoot (CRM das IAs de atendimento).
 *
 * As duas lojas são instâncias SEPARADAS do Chatwoot — não é multi-conta dentro
 * de uma só. Cada uma tem URL e token próprios, lidos do ambiente:
 *
 *   export CHATWOOT_CART_TOKEN=...     # instância n8n-chatwoot (nome herdado do EasyPanel)
 *   export CHATWOOT_URBAN_TOKEN=...    # instância chatwoot-chatwoot
 *
 * Token NÃO entra neste arquivo. Ele é de administrador e dá acesso de escrita
 * (mandar mensagem pro cliente) — aqui só usamos GET, mas o token não sabe disso.
 *
 * Comandos:
 *   node scripts/chatwoot.js baixar <loja> [paginas]   # busca e guarda em cache
 *   node scripts/chatwoot.js funil  <loja>             # etapas + demanda (determinístico)
 *   node scripts/chatwoot.js sem-preco <loja> [n]      # despeja conversas que não chegaram a preço
 *
 * O cache vive em .scratch/chatwoot/ (fora do git — a Netlify publica a raiz do repo).
 */

const fs = require('fs');
const path = require('path');

const LOJAS = {
  cart: {
    base: 'https://n8n-chatwoot.3tclbj.easypanel.host/api/v1/accounts/1',
    env: 'CHATWOOT_CART_TOKEN',
  },
  urban: {
    base: 'https://chatwoot-chatwoot.3tclbj.easypanel.host/api/v1/accounts/1',
    env: 'CHATWOOT_URBAN_TOKEN',
  },
};

const CACHE = path.join(__dirname, '..', '.scratch', 'chatwoot');

// Tipos de mensagem do Chatwoot. Sem isso todo o resto lê errado.
const CLIENTE = 0;
const LOJA = 1;

/**
 * Cartões que a IA emite no handoff. São texto fixo, então classificar a etapa
 * é casar string — não precisa de IA e o resultado é conferível na mão.
 * Ordem importa: a primeira que casar vira a etapa mais avançada da conversa.
 */
const ETAPAS = [
  ['VISITA AGENDADA', 'visita'],
  ['CONFIRMAR ANTES DA VISITA', 'confirmar_visita'],
  ['NEGOCIAR DESCONTO', 'negociar'],
  ['PROPOSTA APRESENTADA', 'proposta'],
  ['VERIFICAR ESTOQUE', 'verificar_estoque'],
  ['PRODUTO ESPECIAL', 'produto_especial'],
  ['SEM VALOR APRESENTADO', 'sem_valor'],
  ['ATENDIMENTO TRANSFERIDO', 'transferido'],
];

function loja(nome) {
  const l = LOJAS[nome];
  if (!l) {
    console.error(`Loja desconhecida: ${nome}. Use: ${Object.keys(LOJAS).join(' | ')}`);
    process.exit(1);
  }
  const token = process.env[l.env];
  if (!token) {
    console.error(`Falta a variável ${l.env}. Sem ela não dá pra falar com o Chatwoot da ${nome}.`);
    process.exit(1);
  }
  return { ...l, token };
}

async function get(l, rota, tentativas = 3) {
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(l.base + rota, { headers: { api_access_token: l.token } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (i === tentativas - 1) throw e;
      await new Promise((ok) => setTimeout(ok, 1500 * (i + 1)));
    }
  }
}

/** Roda `tarefa` sobre `itens` com no máximo `limite` em voo. */
async function emLotes(itens, limite, tarefa) {
  const saida = new Array(itens.length);
  let proximo = 0;
  await Promise.all(
    Array.from({ length: Math.min(limite, itens.length) }, async () => {
      while (proximo < itens.length) {
        const i = proximo++;
        saida[i] = await tarefa(itens[i], i);
      }
    })
  );
  return saida;
}

const arquivo = (nome) => path.join(CACHE, `${nome}.json`);

function lerCache(nome) {
  const f = arquivo(nome);
  if (!fs.existsSync(f)) {
    console.error(`Sem cache da ${nome}. Rode antes: node scripts/chatwoot.js baixar ${nome}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

async function baixar(nome, paginas) {
  const l = loja(nome);
  const convs = [];
  for (let pg = 1; pg <= paginas; pg++) {
    const d = await get(l, `/conversations?status=all&page=${pg}`);
    const lote = d.data.payload;
    convs.push(...lote);
    if (!lote.length) break;
    if (pg % 10 === 0) console.error(`  ...${convs.length} conversas`);
  }
  console.error(`${nome}: ${convs.length} conversas, buscando mensagens`);

  let feitas = 0;
  const dados = await emLotes(convs, 10, async (c) => {
    let msgs = null;
    try {
      msgs = (await get(l, `/conversations/${c.id}/messages`)).payload;
    } catch {
      /* conversa que falhou fica com msgs:null e é ignorada na análise */
    }
    if (++feitas % 200 === 0) console.error(`  ...${feitas}/${convs.length}`);
    return { conv: c, msgs };
  });

  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(arquivo(nome), JSON.stringify(dados));
  const ok = dados.filter((d) => d.msgs).length;
  const msgs = dados.reduce((s, d) => s + (d.msgs ? d.msgs.length : 0), 0);
  console.log(`${nome}: ${ok}/${dados.length} conversas · ${msgs} mensagens → ${arquivo(nome)}`);
}

/** Etapa mais avançada que a conversa alcançou, ou null se nunca gerou cartão. */
function etapaDe(msgs) {
  const texto = msgs
    .filter((m) => m.message_type === LOJA)
    .map((m) => (m.content || '').toUpperCase())
    .join('\n');
  for (const [chave, slug] of ETAPAS) if (texto.includes(chave)) return slug;
  return null;
}

const MODELO = /iphone\s*(1[1-9]|xr|xs|se)\s*(pro\s*max|pro|plus|mini)?/gi;
const PRECO = /R\$\s?\d/;

/**
 * A IA cotou preço pro cliente?
 *
 * ⚠️ Isto é DIFERENTE de ter emitido cartão. O cartão marca o **handoff** pro humano;
 * a IA cota preço o tempo todo sem escalar ninguém. Medir preço pelo cartão inflou
 * "nunca viu preço" de 46% pra 73% na primeira análise (10/ago/2026).
 * Nota interna (`private`) não conta — não foi pro cliente.
 */
function temPreco(msgs) {
  return msgs.some((m) => m.message_type === LOJA && !m.private && PRECO.test(m.content || ''));
}

function funil(nome) {
  const dados = lerCache(nome).filter((d) => d.msgs);
  const etapas = new Map();
  const modelos = new Map();
  let comPreco = 0;
  let precoSemCartao = 0;
  let falhas = 0;

  for (const { msgs } of dados) {
    const e = etapaDe(msgs);
    const preco = temPreco(msgs);
    if (e) etapas.set(e, (etapas.get(e) || 0) + 1);
    if (preco) comPreco++;
    if (preco && !e) precoSemCartao++;
    for (const m of msgs) {
      if (m.status === 'failed') falhas++;
      if (m.message_type !== CLIENTE) continue;
      for (const [, num, sufixo] of (m.content || '').matchAll(MODELO)) {
        const k = `iPhone ${num}${sufixo ? ' ' + sufixo.replace(/\s+/g, ' ') : ''}`.toLowerCase();
        modelos.set(k, (modelos.get(k) || 0) + 1);
      }
    }
  }

  const pct = (n) => `${((100 * n) / dados.length).toFixed(1)}%`;
  console.log(`\n${nome.toUpperCase()} — ${dados.length} conversas\n`);
  console.log(`cotou preço ......... ${String(comPreco).padStart(5)}  ${pct(comPreco)}`);
  console.log(`nunca cotou preço ... ${String(dados.length - comPreco).padStart(5)}  ${pct(dados.length - comPreco)}`);
  console.log(`\ncartão de handoff emitido (a IA passou pra um humano):`);
  for (const [k, v] of [...etapas].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(18)} ${String(v).padStart(5)}  ${pct(v)}`);
  }
  console.log(`\ncotou preço e NÃO passou pra ninguém: ${precoSemCartao}  (${((100 * precoSemCartao) / (comPreco || 1)).toFixed(1)}% das que viram preço)`);

  const prop = (etapas.get('proposta') || 0) + (etapas.get('negociar') || 0);
  const vis = (etapas.get('visita') || 0) + (etapas.get('confirmar_visita') || 0);
  if (prop) console.log(`proposta → visita: ${((100 * vis) / (prop + vis)).toFixed(1)}%`);
  console.log(`mensagens que falharam ao enviar: ${falhas}`);

  console.log('\nmodelos citados pelo cliente:');
  for (const [k, v] of [...modelos].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`  ${String(v).padStart(4)}  ${k}`);
  }
}

/** Despeja as conversas que nunca chegaram a preço, em texto, pro agente ler. */
function semPreco(nome, quantas) {
  const dados = lerCache(nome).filter((d) => d.msgs && !temPreco(d.msgs));
  // Conversa de uma mensagem só não tem o que explicar — atrapalha mais que ajuda.
  const uteis = dados.filter((d) => d.msgs.filter((m) => m.message_type === CLIENTE).length >= 2);
  console.log(`# ${nome} — ${uteis.length} conversas sem preço (de ${dados.length}); mostrando ${Math.min(quantas, uteis.length)}\n`);
  for (const { conv, msgs } of uteis.slice(0, quantas)) {
    console.log(`## conversa ${conv.id} · inbox ${conv.inbox_id} · ${msgs.length} mensagens`);
    for (const m of msgs) {
      if (m.message_type !== CLIENTE && m.message_type !== LOJA) continue;
      if (m.private) continue; // nota interna, não foi pro cliente
      const quem = m.message_type === CLIENTE ? 'CLIENTE' : 'IA';
      console.log(`  [${quem}] ${(m.content || '(anexo)').replace(/\s+/g, ' ').slice(0, 300)}`);
    }
    console.log('');
  }
}

const [cmd, nome, arg] = process.argv.slice(2);
const acoes = {
  baixar: () => baixar(nome, Number(arg) || 40),
  funil: () => funil(nome),
  'sem-preco': () => semPreco(nome, Number(arg) || 40),
};
if (!acoes[cmd] || !nome) {
  console.error('uso: node scripts/chatwoot.js <baixar|funil|sem-preco> <cart|urban> [n]');
  process.exit(1);
}
Promise.resolve(acoes[cmd]()).catch((e) => {
  console.error(e.message);
  process.exit(1);
});
