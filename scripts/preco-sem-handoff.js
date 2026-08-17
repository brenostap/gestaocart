#!/usr/bin/env node
// ===========================================================================
// Por que a IA cotou preço e não passou pra ninguém?
//
//   node scripts/preco-sem-handoff.js <cart|urban>
//
// Contexto: `chatwoot.js funil` mede QUANTAS conversas viram preço sem gerar
// cartão de handoff — 71% das que viram preço na Cart (10/ago/2026). Isso é o
// "quanto". Este script responde o "por quê", separando o balde em causas que
// pedem ações diferentes:
//
//   cliente sumiu     -> a última palavra foi da loja e o cliente não voltou.
//                        Problema de follow-up, não de atendimento.
//   cliente respondeu -> o cliente falou DEPOIS do preço e mesmo assim ninguém
//                        foi acionado. É aqui que mora o vazamento de verdade.
//   sem resposta ainda-> conversa recente demais pra saber. Não é perda.
//
// Só lê o cache de .scratch/chatwoot/ (mesmo cache do chatwoot.js). Não tem
// rede: não bate na instância de produção e não precisa de token.
// ===========================================================================
const fs = require('fs');
const path = require('path');

const CLIENTE = 0, LOJA = 1;
const PRECO = /R\$\s?\d/;
const ETAPAS = ['VISITA AGENDADA','CONFIRMAR ANTES DA VISITA','NEGOCIAR DESCONTO',
  'PROPOSTA APRESENTADA','VERIFICAR ESTOQUE','PRODUTO ESPECIAL','SEM VALOR APRESENTADO',
  'ATENDIMENTO TRANSFERIDO'];

const nome = process.argv[2] || 'cart';
const arq = path.join(__dirname, '..', '.scratch', 'chatwoot', nome + '.json');
if (!fs.existsSync(arq)) { console.error('sem cache: ' + arq); process.exit(1); }
const bruto = JSON.parse(fs.readFileSync(arq, 'utf8'));
const dados = (Array.isArray(bruto) ? bruto : (bruto.conversas || [])).filter(d => d.msgs);

const daLoja = m => m.message_type === LOJA && !m.private;

// ⚠️ O cartão de handoff é NOTA PRIVADA — ele avisa a equipe, não o cliente.
// Medido no cache da Cart: 318 conversas têm o cartão só em nota privada e
// apenas 1 em mensagem pública. Por isso aqui NÃO se filtra `private`, ao
// contrário de temPreco(), onde privada não conta porque não foi pro cliente.
// Filtrar nos dois lugares igual infla este balde em ~40%.
const temCartao = msgs => {
  const t = msgs.filter(m => m.message_type === LOJA)
                .map(m => (m.content||'').toUpperCase()).join('\n');
  return ETAPAS.some(e => t.includes(e));
};

// -- o balde: viu preço e ninguém foi acionado ------------------------------
const casos = [];
for (const { conv, msgs } of dados) {
  const ordenadas = [...msgs].sort((a,b) => a.created_at - b.created_at);
  const iPreco = ordenadas.findIndex(m => daLoja(m) && PRECO.test(m.content||''));
  if (iPreco < 0) continue;              // nunca viu preço
  if (temCartao(ordenadas)) continue;    // teve handoff, não é o balde

  const depois = ordenadas.slice(iPreco + 1);
  const respostasCliente = depois.filter(m => m.message_type === CLIENTE);
  const ultima = ordenadas[ordenadas.length - 1];
  const horasParado = (Date.now()/1000 - ultima.created_at) / 3600;

  casos.push({
    id: conv?.id ?? ordenadas[0].conversation_id,
    status: conv?.status || '?',
    msgs: ordenadas.length,
    preco: (ordenadas[iPreco].content || '').replace(/\s+/g,' ').trim(),
    respostasCliente: respostasCliente.length,
    msgsDepois: depois.length,
    ultimaEhCliente: ultima.message_type === CLIENTE,
    horasParado,
    textoCliente: respostasCliente.map(m => (m.content||'').replace(/\s+/g,' ').trim()),
  });
}

// -- segmentação -----------------------------------------------------------
// 48h é o corte de "recente demais pra chamar de perda". Não é lei: é a janela
// em que um cliente ainda responde sem que ninguém tenha errado.
const RECENTE_H = 48;
const seg = c =>
  c.respostasCliente > 0                    ? 'cliente_respondeu' :
  c.horasParado < RECENTE_H                 ? 'recente_ainda_pode_voltar' :
                                              'cliente_sumiu';

const grupos = {};
casos.forEach(c => { (grupos[seg(c)] = grupos[seg(c)] || []).push(c); });

const pct = n => casos.length ? ((100*n)/casos.length).toFixed(1) + '%' : '—';
console.log(`\n${nome.toUpperCase()} — ${dados.length} conversas no cache`);
console.log(`viu preço e NÃO gerou handoff: ${casos.length}\n`);
console.log('por que ninguém foi acionado:');
for (const [k, v] of Object.entries(grupos).sort((a,b) => b[1].length - a[1].length)) {
  console.log(`  ${k.padEnd(28)} ${String(v.length).padStart(4)}  ${pct(v.length)}`);
}

// -- o grupo que importa: o cliente falou e ninguém veio --------------------
const vivos = grupos.cliente_respondeu || [];
if (vivos.length) {
  console.log(`\n--- os ${vivos.length} em que o CLIENTE RESPONDEU depois do preço ---`);
  const media = vivos.reduce((a,c) => a+c.respostasCliente, 0) / vivos.length;
  console.log(`respostas do cliente depois do preço: média ${media.toFixed(1)}`);
  console.log(`conversas ainda abertas: ${vivos.filter(c => c.status === 'open').length}`);
  console.log(`terminaram com o cliente falando: ${vivos.filter(c => c.ultimaEhCliente).length}`);

  // O que o cliente diz depois do preço, agrupado por intenção. Palavra-chave
  // resolve a maior parte e é conferível na mão; o resto vira "outro" e vai
  // pra leitura.
  const INTENCAO = [
    [/\b(vou pensar|penso|depois eu|mais pra frente|semana que vem)\b/i, 'vou pensar'],
    [/\b(caro|muito alto|salgado|acima|abaixar|desconto|melhora|ultimo preço|último preço)\b/i, 'achou caro / pediu desconto'],
    [/\b(parcel|vezes|x de|cart[ãa]o|entrada|financia)\b/i, 'perguntou parcelamento'],
    [/\b(troca|meu aparelho|meu iphone|dou o meu|avalia)\b/i, 'quer dar aparelho na troca'],
    [/\b(endere[çc]o|onde fica|loja|hor[áa]rio|aberto|amanh[ãa]|hoje)\b/i, 'perguntou loja / horário'],
    [/\b(tem|dispon[íi]vel|estoque|chegou|outra cor|mem[óo]ria|gb)\b/i, 'perguntou disponibilidade'],
    [/\b(garantia|nota|bateria|lacrado|seminovo|procedencia|procedência)\b/i, 'perguntou garantia / estado'],
    [/\b(quero|vou querer|fechado|pode separar|reserva)\b/i, '⭐ SINALIZOU COMPRA'],
  ];
  const cont = new Map();
  const exemplos = new Map();
  for (const c of vivos) {
    const txt = c.textoCliente.join(' | ');
    let achou = false;
    for (const [re, rot] of INTENCAO) {
      if (re.test(txt)) {
        cont.set(rot, (cont.get(rot)||0)+1);
        if (!exemplos.has(rot)) exemplos.set(rot, { id: c.id, txt: txt.slice(0,110) });
        achou = true;
      }
    }
    if (!achou) { cont.set('outro', (cont.get('outro')||0)+1);
      if (!exemplos.has('outro')) exemplos.set('outro', { id: c.id, txt: txt.slice(0,110) }); }
  }
  console.log('\no que o cliente disse depois do preço (uma conversa pode contar em mais de um):');
  for (const [k,v] of [...cont].sort((a,b)=>b[1]-a[1])) {
    const ex = exemplos.get(k);
    console.log(`  ${String(v).padStart(4)}  ${k}`);
    if (ex) console.log(`        ex. #${ex.id}: "${ex.txt}"`);
  }
}

// -- e os que sumiram: quanto tempo o preço ficou sem resposta -------------
const sumiram = grupos.cliente_sumiu || [];
if (sumiram.length) {
  const dias = sumiram.map(c => c.horasParado/24).sort((a,b)=>a-b);
  const p = q => dias[Math.floor(dias.length*q)].toFixed(0);
  console.log(`\n--- os ${sumiram.length} em que o cliente sumiu depois do preço ---`);
  console.log(`parados há: mediana ${p(0.5)} dias · p90 ${p(0.9)} dias`);
  console.log(`ainda com status "open": ${sumiram.filter(c=>c.status==='open').length}`);
}
