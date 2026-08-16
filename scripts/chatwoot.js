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
 *   node scripts/chatwoot.js qualificar <loja>         # a régua: frequência dos sinais + vazamentos
 *   node scripts/chatwoot.js pendentes <loja> [n]      # conversas mortas no cliente (lista de hoje)
 *   node scripts/chatwoot.js amostra <loja> [n]        # amostra estratificada pro juiz IA
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

// ===========================================================================
// A RÉGUA — camada 1 da estratégia de qualificação (docs/QUALIFICACAO-CONVERSAS.md)
//
// Sinais binários por conversa, casados por texto. Custo zero, roda em tudo, e
// o dono confere na mão. Cada sinal só entra aqui se tiver dinheiro atrás nesta
// operação — não é coaching de vendas genérico.
//
// ⚠️ ISTO MEDE FREQUÊNCIA, NÃO DÁ NOTA. O peso de cada sinal se aprende
// comparando a taxa de venda de quem tem o sinal contra quem não tem — e isso
// exige a camada 0 (casar conversa com venda). Somar sinais com peso chutado
// produz ranking bonito e falso.
//
// ⚠️ OS PADRÕES PRECISAM DE CALIBRAÇÃO NA PRIMEIRA RODADA. Foram escritos sem
// os tokens no ambiente: casam o português esperado, não o medido. Antes de
// qualquer número virar decisão, leia umas 20 conversas e confira se cada sinal
// pega o que promete. É pra isso que a tabela está toda aqui, num lugar só.
// ===========================================================================

/**
 * `ruim: true` marca sinal onde porcentagem ALTA é problema. Sem isso, um
 * relatório com "morreu no cliente 38%" se lê como conquista.
 */
/**
 * "O cliente disse o que quer?" — padrão PRÓPRIO, diferente do `MODELO` do funil.
 *
 * Duas razões:
 *
 * 1. `MODELO` tem flag /g, e `.test()` em regex global guarda `lastIndex` entre
 *    chamadas: usá-lo aqui daria acerto e erro alternados na MESMA frase.
 * 2. `MODELO` exige a palavra "iphone", e no WhatsApp quase ninguém escreve —
 *    o cliente manda "tem 13 pro?". ⚠️ Isso significa que a contagem de demanda
 *    do `funil` (e a de docs/CHATWOOT-ANALISE.md) é **piso, não total**.
 *
 * Aqui o número solto só vale acompanhado de sufixo (`13 pro`) ou capacidade
 * (`11 128gb`) — sem isso, "dia 13" e "R$ 13" viravam intenção de compra.
 * `MODELO` segue intocado porque é dele que saem os números já publicados.
 */
const MODELO_CITADO = new RegExp(
  '(iphone|ip)\\s*(1[1-9]|xr|xs|se)\\b' +          // iphone 13 · ip 15
  '|\\b1[1-9]\\s*(pro\\s*max|pro|plus|mini)\\b' +  // 13 pro · 15 pro max
  '|\\b1[1-9]\\s*(64|128|256|512)\\s*(gb)?\\b',    // 11 64gb · 13 128
  'i'
);

const SINAIS = [
  // — a loja apareceu?
  ['respondeu', 'a loja respondeu alguma coisa', (c) => c.loja.length > 0],

  // — qualificação: os fatos que decidem a venda
  ['identificou_modelo', 'cliente disse qual aparelho quer', (c) => MODELO_CITADO.test(c.txtCliente)],
  ['perguntou_troca', '⭐ falou de aparelho na troca', (c) => /\btroca(r|ndo)?\b|dar de entrada|aparelho (usado|atual)|seu (aparelho|iphone|celular) (atual|de agora)/i.test(c.txtLoja)],
  ['perguntou_pagamento', 'falou de forma de pagamento', (c) => /parcel|[àa] vista|cart[ãa]o|\bpix\b|financi|quantas vezes/i.test(c.txtLoja)],
  ['perguntou_cidade', 'falou de cidade / vir à loja', (c) => /cidade|onde voc[êe] (est[áa]|mora)|regi[ãa]o|vem at[ée]|passar (aqui|na loja)|endere[çc]o|qual bairro/i.test(c.txtLoja)],
  ['perguntou_prazo', 'falou de prazo / urgência', (c) => /quando (voc[êe] )?(pretende|pensa|quer|planeja)|[ée] (pra|para) (hoje|agora|essa semana)|com que urg[êe]ncia|tem pressa/i.test(c.txtLoja)],

  // — oferta
  ['cotou_preco', 'passou valor pro cliente', (c) => PRECO.test(c.txtLoja)],
  ['ofereceu_acessorio', 'ofereceu capinha/película/carregador', (c) => /capinha|pel[íi]cula|carregador|fone|cabo|acess[óo]rio/i.test(c.txtLoja)],

  // — fechamento
  ['passou_pra_humano', 'emitiu cartão de handoff', (c) => c.etapa !== null],
  ['preco_sem_handoff', '⭐⭐ cotou preço e não avisou ninguém', (c) => PRECO.test(c.txtLoja) && c.etapa === null, true],
  ['propos_visita', 'chegou a visita agendada', (c) => c.etapa === 'visita' || c.etapa === 'confirmar_visita'],
  ['reengajou', 'mandou 2ª mensagem sem o cliente responder', (c) => c.temFollowUp],
  ['morreu_no_cliente', '⭐ última palavra é do cliente, sem resposta', (c) => c.ultimo === CLIENTE, true],
  ['sumiu_apos_preco', '⭐ viu preço e parou de responder', (c) => PRECO.test(c.txtLoja) && c.ultimo === LOJA && !c.temFollowUp, true],

  // — higiene
  ['falha_envio', 'mensagem que não chegou no cliente', (c) => c.falhou, true],
];

/**
 * Dois sinais da régua NÃO estão aqui porque dependem de cruzar com o estoque,
 * que este script não lê: **cotou algo que existe** (o modelo citado está
 * `available` e não está na bancada) e **ofereceu alternativa quando não tinha**.
 * São os dois que ligam a conversa ao aparelho parado — valem a próxima rodada.
 */
const SINAIS_PENDENTES = ['cotou_com_estoque', 'ofereceu_alternativa'];

/** Junta de uma vez tudo que os sinais precisam ler da conversa. */
function contexto(msgs) {
  // Nota interna (`private`) não foi pro cliente — não conta como fala da loja.
  const uteis = msgs.filter((m) => !m.private && (m.message_type === CLIENTE || m.message_type === LOJA));
  const cliente = uteis.filter((m) => m.message_type === CLIENTE);
  const loja = uteis.filter((m) => m.message_type === LOJA);
  const texto = (ms) => ms.map((m) => m.content || '').join('\n');

  // Follow-up = a loja voltou a falar sem o cliente ter respondido no meio.
  // É o que separa "cliente sumiu e ninguém correu atrás" de "sumiu mesmo".
  let temFollowUp = false;
  for (let i = 1; i < uteis.length; i++) {
    if (uteis[i].message_type === LOJA && uteis[i - 1].message_type === LOJA) temFollowUp = true;
  }

  return {
    cliente, loja,
    txtCliente: texto(cliente),
    txtLoja: texto(loja),
    etapa: etapaDe(msgs),
    ultimo: uteis.length ? uteis[uteis.length - 1].message_type : null,
    temFollowUp,
    falhou: msgs.some((m) => m.status === 'failed'),
  };
}

/** Roda a régua numa conversa. Devolve `{sinal: true|false}`. */
function regua(msgs) {
  const c = contexto(msgs);
  const out = {};
  for (const [chave, , testa] of SINAIS) out[chave] = !!testa(c);
  return out;
}

/**
 * Chave de telefone pra casar conversa com venda (camada 0).
 *
 * ⚠️ O nono dígito. Celular brasileiro anda escrito de quatro jeitos
 * (+5511987654321 · 5511987654321 · 11987654321 · 1187654321) e a FoneNinja e o
 * Chatwoot não combinaram nada. Casar sem normalizar erra EM SILÊNCIO: parece
 * que o lead não converteu, quando foi a chave que não bateu.
 *
 * Os 8 últimos dígitos são o que sobrevive a todas as variações. Colidem? Sim,
 * raramente — por isso o casamento final deve conferir também o DDD quando os
 * dois lados tiverem.
 */
function telChave(bruto) {
  const d = String(bruto == null ? '' : bruto).replace(/\D/g, '');
  return d.length >= 8 ? d.slice(-8) : null;
}

/** Telefone do cliente da conversa — o campo muda conforme o canal. */
function telDaConversa(conv) {
  const s = (conv && conv.meta && conv.meta.sender) || {};
  return telChave(s.phone_number || s.identifier || '');
}

function qualificar(nome) {
  const dados = lerCache(nome).filter((d) => d.msgs);
  const soma = new Map(SINAIS.map(([k]) => [k, 0]));
  for (const { msgs } of dados) {
    const r = regua(msgs);
    for (const k of soma.keys()) if (r[k]) soma.set(k, soma.get(k) + 1);
  }

  const n = dados.length;
  const pct = (v) => `${((100 * v) / n).toFixed(1)}%`;
  console.log(`\n${nome.toUpperCase()} — régua em ${n} conversas`);
  console.log(`(⚠️ = porcentagem alta é problema)\n`);
  for (const [k, desc, , ruim] of SINAIS) {
    const v = soma.get(k);
    console.log(`${ruim ? '⚠️ ' : '   '}${k.padEnd(20)} ${String(v).padStart(5)}  ${pct(v).padStart(6)}  ${desc}`);
  }

  console.log(`\nsinais que faltam (dependem de cruzar com o estoque): ${SINAIS_PENDENTES.join(', ')}`);
  console.log(`\nOs três vazamentos — lead que já custou dinheiro pra chegar aqui:`);
  console.log(`  1. preço dado, ninguém avisado ..... ${soma.get('preco_sem_handoff')}`);
  console.log(`  2. morreu no cliente ............... ${soma.get('morreu_no_cliente')}`);
  console.log(`  3. viu preço e sumiu, sem follow-up  ${soma.get('sumiu_apos_preco')}`);
  console.log(`\n⚠️ Frequência, não nota. Peso de sinal se aprende casando conversa com venda`);
  console.log(`   (camada 0) — ver docs/QUALIFICACAO-CONVERSAS.md.`);
}

/** Imprime a conversa em texto legível — pro dono ou pro juiz IA ler. */
function despejar(conv, msgs, marca) {
  const tel = telDaConversa(conv);
  console.log(`## conversa ${conv.id} · inbox ${conv.inbox_id} · ${msgs.length} mensagens` +
    (tel ? ` · tel ...${tel}` : '') + (marca ? ` · ${marca}` : ''));
  for (const m of msgs) {
    if (m.message_type !== CLIENTE && m.message_type !== LOJA) continue;
    if (m.private) continue; // nota interna, não foi pro cliente
    const quem = m.message_type === CLIENTE ? 'CLIENTE' : 'IA';
    console.log(`  [${quem}] ${(m.content || '(anexo)').replace(/\s+/g, ' ').slice(0, 300)}`);
  }
  console.log('');
}

/** Conversas em que a última palavra é do cliente — dinheiro na mesa, hoje. */
function pendentes(nome, quantas) {
  const dados = lerCache(nome)
    .filter((d) => d.msgs && regua(d.msgs).morreu_no_cliente)
    .sort((a, b) => (b.conv.last_activity_at || 0) - (a.conv.last_activity_at || 0));
  console.log(`# ${nome} — ${dados.length} conversas paradas no cliente; mostrando ${Math.min(quantas, dados.length)}`);
  console.log(`# (mais recentes primeiro — só leitura, responder é decisão do dono)\n`);
  for (const { conv, msgs } of dados.slice(0, quantas)) {
    despejar(conv, msgs, regua(msgs).cotou_preco ? 'JÁ VIU PREÇO' : 'sem preço');
  }
}

/**
 * Amostra estratificada pro juiz IA (camada 2). Divide a cota entre os três
 * grupos em que o número determinístico já não explica nada sozinho.
 *
 * ⚠️ Quando a camada 0 existir, trocar estes grupos por "fez certo e perdeu" /
 * "fez errado e ganhou" — que é onde o aprendizado de verdade mora.
 */
function amostra(nome, quantas) {
  const dados = lerCache(nome).filter((d) => d.msgs);
  const grupos = [
    ['sem_preco', (r) => !r.cotou_preco && r.respondeu],
    ['preco_sem_handoff', (r) => r.preco_sem_handoff],
    ['morreu_no_cliente', (r) => r.morreu_no_cliente],
  ];
  const cota = Math.max(1, Math.floor(quantas / grupos.length));
  console.log(`# ${nome} — amostra de ${cota} por grupo\n`);
  for (const [rotulo, filtro] of grupos) {
    // Conversa de uma mensagem só não tem o que explicar — atrapalha mais que ajuda.
    const lote = dados.filter((d) => filtro(regua(d.msgs)) && contexto(d.msgs).cliente.length >= 2);
    console.log(`# ===== ${rotulo} (${lote.length} no total) =====\n`);
    for (const { conv, msgs } of lote.slice(0, cota)) despejar(conv, msgs, rotulo);
  }
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

// A régua é testada sem rede por test/qualificacao.test.js, que carrega este
// arquivo como módulo — por isso o CLI só roda quando ele é o programa.
module.exports = { SINAIS, SINAIS_PENDENTES, regua, contexto, telChave, telDaConversa, etapaDe, temPreco };

if (require.main === module) {
  const [cmd, nome, arg] = process.argv.slice(2);
  const acoes = {
    baixar: () => baixar(nome, Number(arg) || 40),
    funil: () => funil(nome),
    'sem-preco': () => semPreco(nome, Number(arg) || 40),
    qualificar: () => qualificar(nome),
    pendentes: () => pendentes(nome, Number(arg) || 30),
    amostra: () => amostra(nome, Number(arg) || 30),
  };
  if (!acoes[cmd] || !nome) {
    console.error('uso: node scripts/chatwoot.js <baixar|funil|sem-preco|qualificar|pendentes|amostra> <cart|urban> [n]');
    process.exit(1);
  }
  Promise.resolve(acoes[cmd]()).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
