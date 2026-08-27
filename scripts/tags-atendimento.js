#!/usr/bin/env node
/**
 * ETIQUETADOR DO ATENDIMENTO — classifica conversa por conversa, POR FORA da IA.
 *
 * ⚠️ POR QUE NÃO DEPENDER DA MAJU MARCAR
 * A `conversa_estado` (camada 0 do docs/PLANO-QUALIDADE-IA.md) é a IA gravando o
 * próprio veredito. É útil, mas tem dois limites que este script não tem:
 *   1. É a **opinião dela**. Se ela entendeu errado, a tag registra o erro dela.
 *   2. Não cobre o **vendedor** — e metade do problema está do lado humano.
 * Aqui a tag é derivada do TEXTO, e **carrega o trecho que a gerou**. Dá pra
 * abrir e conferir. Sem o trecho, tag é opinião com número; com o trecho, é
 * evidência — e é isso que sustenta mexer no roteiro de alguém.
 *
 * ⚠️ E A TAG APONTA PRA UMA MENSAGEM, não pra conversa inteira. "Esta conversa
 * teve encerramento passivo" não se corrige; *"Me chama quando tiver uma noção
 * melhor do horário"* se corrige.
 *
 * ⚠️ MAS TAG DE AUSÊNCIA NÃO TEM PROVA — tem lugar. "Não usou o nome" não é
 * provado por mensagem nenhuma: a evidência é o que NÃO está lá. Nesses casos o
 * trecho é marcado como `onde_caberia` e a tela precisa dizer isso, senão eu
 * estaria mostrando uma frase inocente como se fosse o erro. Foi o primeiro
 * jeito que escrevi, e estava mentindo com fato verdadeiro.
 *
 * ── AS ARMADILHAS (todas medidas na marra — ver PLANO-QUALIDADE-IA §3-ter) ──
 * 1. Chatwoot = IA + vendedor; n8n = só a IA. A diferença é o humano.
 * 2. Casar por CONTENÇÃO, nunca por prefixo (o Chatwoot quebra o que o n8n junta).
 * 3. Filtrar TEMPLATE (texto repetido em 5+ conversas) — senão o cartão de
 *    handoff da IA vira "vendedor" e o número dobra.
 * 4. `session_id` do Instagram termina em `-cart` NAS DUAS LOJAS.
 * 5. Só Instagram: no WhatsApp o especialista usa o número pessoal, invisível.
 *
 * ── COMO RODAR ──────────────────────────────────────────────────────────────
 *   node scripts/separa-ia-vendedor.js colher cart      # 1. cache do Chatwoot
 *   # 2. rode os SQL de ia-texto e segmentos (ver camada2-painel.js --sql)
 *   node scripts/tags-atendimento.js cart               # 3. imprime o resumo
 *   node scripts/tags-atendimento.js cart --sql > t.sql # 4. INSERT pro painel
 *   node scripts/tags-atendimento.js cart --quem        # 5. quebra por especialista
 *
 * ⚠️ O `--quem` SÓ VALE NA CART. A identidade vem do `meta.assignee` do Chatwoot,
 * que na Cart pega 88% dos atendimentos humanos e na Urban só 43% (medido em
 * PLANO-QUALIDADE-IA §3-ter). Quebrar a Urban por pessoa daria retrato de
 * metade do time e pareceria completo.
 */

const fs = require('fs');
const path = require('path');

const CACHE = path.join(__dirname, '..', '.scratch', 'chatwoot');
const N = s => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();

const MIN_MSGS_HUMANO = 3;
const MIN_CONVS_TEMPLATE = 5;

/**
 * ⚠️ TERCEIRO PONTO CEGO, achado em 27/ago: o CARTÃO DE PREÇO.
 * Mensagens como *"iPhone 15 Pro Max 256GB → R$ 3.950 à vista ou 18x"* aparecem
 * no Chatwoot e **não** no `n8n_chat_histories` — outro nó do fluxo as envia. Elas
 * passavam pelo filtro de template (cada uma é única, com preço diferente) e viravam
 * "vendedor". Medido: das 316 conversas que o detector marcava como humano na Cart,
 * **61 eram só isso** — e o retrato delas denunciava (92% cotando preço, 3% fechando,
 * resposta em 0 minuto: comportamento de robô, não de gente).
 *
 * A regra: se quase tudo que sobrou tem R$, é o cartão, não uma pessoa.
 */
const ehCartaoDePreco = msgs => {
  if(!msgs.length) return false;
  const comPreco = msgs.filter(m => /r\$\s?\d/i.test(m.txt)).length;
  return comPreco / msgs.length >= 0.7;
};

/**
 * As etiquetas. Cada uma é uma FALHA CORRIGÍVEL — não uma descrição.
 * `quem` diz de qual lado a falha é; `achar` recebe o contexto e devolve a
 * mensagem que prova a tag (ou null).
 *
 * ⚠️ Ordem importa na leitura, não na execução: as de fechamento primeiro,
 * porque são o alvo declarado do dono.
 */
const TAGS = [
  {
    id: 'convite_aberto',
    quem: 'ia',
    rotulo: 'Convidou mas mandou o cliente escolher o dia',
    conserto: 'Oferecer um horário concreto: "posso confirmar sexta às 16h?"',
    achar: c => c.ia.find(m => /\b(que dia|qual dia|melhor dia|que hor[áa]rio|qual hor[áa]rio)/i.test(m.txt)
                            && !/\bposso (confirmar|deixar|agendar)/i.test(m.txt)),
  },
  {
    id: 'encerramento_passivo',
    quem: 'ia',
    rotulo: 'Devolveu a bola e saiu',
    conserto: 'Afirmar a presença ("te aguardo amanhã") em vez de esperar o cliente chamar',
    achar: c => c.ia.find(m => /\b(me chama quando|s[óo] (me )?chamar|quando (quiser|decidir|tiver)|se mudar de ideia)/i.test(m.txt)),
  },
  {
    id: 'micro_pergunta',
    quem: 'ia',
    rotulo: 'Travou a venda num detalhe trivial',
    conserto: 'Cor e capacidade o vendedor resolve na loja — não segurar o handoff por isso',
    achar: c => c.ia.find(m => /\b(pode me (responder|mandar|dizer|falar)|me (responde|manda|fala)) (s[óo]|apenas)\b/i.test(m.txt)),
  },
  {
    id: 'prometeu_humano_sem_transferir',
    quem: 'ia',
    rotulo: 'Prometeu um especialista e não chamou ninguém',
    conserto: 'Transferir no mesmo turno em que promete',
    achar: c => (c.temHumano || c.transferido) ? null
      : c.ia.find(m => /\b(especialista|vendedor)\b[^.!?]{0,40}\b(vai|ir[áa]|j[áa])\b/i.test(m.txt)),
  },
  {
    id: 'nao_usou_o_nome',
    quem: 'ia',
    prova: false,                       // ⚠️ ausência: o trecho é "onde caberia"
    rotulo: 'Tinha o nome do cliente e não usou',
    conserto: 'Chamar pelo nome — o vendedor faz em 42% das conversas, ela em 2%',
    // Mostra a ABERTURA, que é onde o nome naturalmente entraria — não a última
    // mensagem, que era o que eu fazia e não dizia nada.
    achar: c => {
      const usou = c.ia.some(m => /\b(bo[am]\s+(dia|tarde|noite)|perfeito|beleza|oi+)[ ,!]+[A-Z][a-zà-ú]{2,}/.test(m.txt));
      return (c.ia.length >= 6 && !usou && c.temNome) ? c.ia[0] : null;
    },
  },
  {
    id: 'nao_tentou_fechar',
    quem: 'ia',
    rotulo: 'Cotou preço e nunca tentou fechar',
    conserto: 'Uma pergunta de fechamento depois do preço: "curtiu?" já serve',
    prova: false,                       // ausência: o trecho é o preço, não o erro
    achar: c => {
      if(!c.cotou) return null;
      const tentou = c.ia.some(m => /\b(vai ser (esse|ele)|curtiu|posso (confirmar|separar|deixar)|nome completo|fechamos)/i.test(m.txt));
      return tentou ? null : c.ia.find(m => /r\$\s?\d/i.test(m.txt));
    },
  },
  {
    id: 'morreu_perguntando',
    quem: 'ia',
    rotulo: 'A conversa acabou com ela esperando resposta',
    conserto: 'Se a pergunta ficou pendurada, o follow-up é no mesmo dia — ou escala',
    achar: c => (c.temHumano || !c.ia.length) ? null
      : (/\?\s*$/.test(c.ia[c.ia.length - 1].txt) ? c.ia[c.ia.length - 1] : null),
  },
  // ── lado humano ──────────────────────────────────────────────────────────
  {
    id: 'vendedor_demorou',
    quem: 'vendedor',
    rotulo: 'Demorou mais de 6h pra entrar',
    conserto: 'A IA responde em segundos; o handoff perde o calor em horas',
    achar: c => (c.gapMin != null && c.gapMin > 360) ? c.vend[0] : null,
  },
  {
    id: 'vendedor_convite_aberto',
    quem: 'vendedor',
    rotulo: 'Também mandou o cliente escolher o dia',
    conserto: 'Mesmo conserto do lado da IA — é o roteiro da casa',
    achar: c => c.vend.find(m => /\b(que dia|qual dia|melhor dia|que hor[áa]rio|qual hor[áa]rio)/i.test(m.txt)
                              && !/\bposso (confirmar|deixar|agendar)/i.test(m.txt)),
  },
  {
    id: 'vendedor_morreu_perguntando',
    quem: 'vendedor',
    rotulo: 'Ele acabou com uma pergunta pendurada',
    conserto: 'Follow-up no dia seguinte — a conversa já estava quente',
    achar: c => c.vend.length ? (/\?\s*$/.test(c.vend[c.vend.length - 1].txt) ? c.vend[c.vend.length - 1] : null) : null,
  },
];

function carregar(loja){
  const ler = f => {
    const p = path.join(CACHE, f);
    if(!fs.existsSync(p)){ console.error('falta ' + p + ' — veja o topo do arquivo'); process.exit(1); }
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  };
  return { cw: ler(`chatwoot-ig-${loja}.json`), ia: ler(`ia-texto-${loja}.json`),
           seg: fs.existsSync(path.join(CACHE, `segmentos-${loja}.json`)) ? ler(`segmentos-${loja}.json`) : {} };
}

/** Separa IA de vendedor e monta o contexto que as tags leem. */
function contextos(loja){
  const { cw, ia, seg } = carregar(loja);
  const freq = {};
  for (const v of Object.values(cw))
    for (const m of v.loja_msgs || []){ const k = N(m.txt).slice(0, 80); if(k.length > 25) freq[k] = (freq[k] || 0) + 1; }
  const ehTemplate = t => (freq[N(t).slice(0, 80)] || 0) >= MIN_CONVS_TEMPLATE;

  const out = [];
  for (const [arroba, v] of Object.entries(cw)){
    const texto = N(ia[arroba] || '');
    if(!texto) continue;                                   // sem histórico: não dá pra separar
    const msgs = (v.loja_msgs || []).filter(m => N(m.txt).length >= 15);
    const marc = msgs.map(m => ({ ...m, vend: !texto.includes(N(m.txt).slice(0, 45)) && !ehTemplate(m.txt) }));
    const vend = marc.filter(m => m.vend);
    const temHumano = vend.length >= MIN_MSGS_HUMANO && !ehCartaoDePreco(vend);
    const iaMsgs = temHumano ? marc.filter(m => !m.vend) : marc;   // sem humano, tudo é dela
    let gapMin = null;
    if(temHumano){
      const i = marc.findIndex(m => m.vend);
      const ultIA = marc.slice(0, i).filter(m => !m.vend).pop();
      if(ultIA && marc[i].t && ultIA.t){ const g = Math.round((marc[i].t - ultIA.t) / 60); gapMin = g >= 0 ? g : null; }
    }
    const s = seg[arroba] || {};
    out.push({
      arroba, conv: v.conv, loja, responsavel: v.responsavel,
      origem: s.origem || null, tema: s.tema || null,
      transferido: !!s.transferido, comprou: !!s.comprou,
      temHumano, gapMin,
      ia: iaMsgs, vend: temHumano ? vend : [],
      cotou: iaMsgs.some(m => /r\$\s?\d/i.test(m.txt)),
      // "tinha o nome" = o cliente se identificou em algum momento do Chatwoot
      temNome: !!(v.responsavel || iaMsgs.some(m => /\bnome\b/i.test(m.txt))),
    });
  }
  return out;
}

function etiquetar(loja){
  const ctxs = contextos(loja);
  const achados = [];
  for (const c of ctxs)
    for (const t of TAGS){
      let m = null;
      try { m = t.achar(c); } catch(e){ /* uma tag quebrada não derruba as outras */ }
      if(m) achados.push({ tag: t.id, quem: t.quem, prova: t.prova !== false, loja, conv: c.conv, arroba: c.arroba,
                           origem: c.origem, tema: c.tema, comprou: c.comprou,
                           trecho: m.txt.replace(/\s+/g, ' ').trim().slice(0, 400) });
    }
  return { ctxs, achados };
}

const [loja, flag] = process.argv.slice(2);
if(!loja || !['cart', 'urban'].includes(loja)){
  console.log('uso: node scripts/tags-atendimento.js <cart|urban> [--sql]');
  process.exit(1);
}
const { ctxs, achados } = etiquetar(loja);

if(flag === '--sql'){
  const esc = s => String(s == null ? '' : s).replace(/'/g, "''");
  console.log('-- gerado por scripts/tags-atendimento.js ' + loja);
  console.log('delete from public.atendimento_tags where loja=\'' + loja + '\';');
  // Um exemplo por tag é o que a tela mostra; guardo até 6 pra poder trocar.
  const comHumano = ctxs.filter(c => c.temHumano).length;
  // ⚠️ base diferente por lado: a IA está em todas as conversas, o vendedor só
  // nas que ele assume. Dividir os dois por 1.291 faria ele parecer 4x melhor.
  const base = def => def.quem === 'vendedor' ? comHumano : ctxs.length;
  const porTag = {};
  achados.forEach(a => { (porTag[a.tag] = porTag[a.tag] || []).push(a); });
  const linhas = [];
  for (const [tagId, lista] of Object.entries(porTag)){
    const def = TAGS.find(t => t.id === tagId);
    const exemplos = lista.filter(a => a.trecho.length > 25).slice(0, 3);
    for (const a of exemplos)
      linhas.push(`('${esc(loja)}','${esc(tagId)}','${esc(def.quem)}','${esc(def.rotulo)}','${esc(def.conserto)}',${lista.length},${base(def)},'${esc(a.trecho)}',${a.conv},${def.prova !== false})`);
  }
  console.log('insert into public.atendimento_tags (loja,tag,quem,rotulo,conserto,n_conversas,n_total,trecho,conversa_id,trecho_e_prova) values');
  console.log(linhas.join(',\n') + ';');
} else {
  console.log(`\n${loja.toUpperCase()} — ${ctxs.length} conversas de Instagram etiquetadas`
            + ` (${ctxs.filter(c => c.temHumano).length} com vendedor)\n`);
  const porTag = {};
  achados.forEach(a => { (porTag[a.tag] = porTag[a.tag] || []).push(a); });
  for (const t of TAGS){
    const lista = porTag[t.id] || [];
    const base = t.quem === 'vendedor' ? ctxs.filter(c => c.temHumano).length : ctxs.length;
    const pct = base ? (100 * lista.length / base).toFixed(0) : 0;
    console.log(`${(t.quem === 'ia' ? '🤖' : '👤')} ${t.rotulo}`);
    console.log(`   ${String(lista.length).padStart(4)} conversas  ${String(pct).padStart(3)}%   → ${t.conserto}`);
    if(lista[0]) console.log(`   ex: "${lista[0].trecho.slice(0, 96)}"`);
    console.log('');
  }
}

// ===========================================================================
// --quem : o roteiro de cada especialista, lado a lado.
//
// ⚠️ Base = as conversas DELE, não o total. Cada um recebe um volume diferente
// (rodízio + canal), então comparar sobre o total faria quem recebe menos
// parecer pior em tudo.
//
// ⚠️ E isto é retrato de HÁBITO, não ranking de desempenho: quem converte mais
// depende do lead que recebeu, e a régua disso é a camada 1. Ler junto.
// ===========================================================================
// ⚠️ O despacho do --quem fica no FIM do arquivo, depois desta constante:
// `const` tem zona morta temporal, e chamar porEspecialista() lá em cima
// derrubava com "Cannot access 'POR_QUEM' before initialization".
const POR_QUEM = [
  ['pede o dia ABERTO',   /\b(que dia|qual dia|melhor dia|que hor[áa]rio|qual hor[áa]rio)/i],
  ['pede o dia FECHADO',  /\bposso (confirmar|deixar|agendar|separar)/i],
  ['tenta fechar',        /\b(vai ser (esse|ele)|curtiu|posso (confirmar|separar|deixar)|nome completo|fechamos)/i],
  ['chama pelo nome',     /\b(bo[am]\s+(dia|tarde|noite)|perfeito|beleza|oi+)[ ,!]+[A-Z][a-zà-ú]{2,}/],
  ['cota preço',          /r\$\s?\d/i],
  ['fala de troca',       /\b(troca|upgrade|parte do pagamento|volta (no|pro|do))/i],
  ['manda o endereço',    /\b(rua |endere[çc]o|tatuap[ée]|metr[ôo])/i],
  ['escala pro gerente',  /\bgerente\b/i],
];

function porEspecialista(loja){
  const ctxs = contextos(loja).filter(c => c.temHumano);
  const quem = {};
  for (const c of ctxs){
    const nome = (c.responsavel || '(não identificado)').replace(/ - (Vendas|Suporte)\s*$/, '').trim();
    (quem[nome] = quem[nome] || []).push(c);
  }
  const nomes = Object.keys(quem).filter(n => quem[n].length >= 15).sort((a, b) => quem[b].length - quem[a].length);
  if(!nomes.length){ console.log('sem especialista com 15+ conversas'); return; }

  const col = n => String(n).padStart(7);
  console.log(`\n${loja.toUpperCase()} — roteiro de cada especialista (base: as conversas dele)\n`);
  console.log('comportamento'.padEnd(24) + nomes.map(n => col(n)).join(''));
  console.log('conversas'.padEnd(24) + nomes.map(n => col(quem[n].length)).join(''));
  console.log('-'.repeat(24 + 7 * nomes.length));
  for (const [rot, re] of POR_QUEM){
    const linha = nomes.map(n => {
      const g = quem[n];
      const k = g.filter(c => c.vend.some(m => re.test(m.txt))).length;
      return col(Math.round(100 * k / g.length) + '%');
    }).join('');
    console.log(rot.padEnd(24) + linha);
  }
  // ⚠️ mediana + p90 sempre. A média aqui é catástrofe garantida: a cauda é de um dia.
  console.log('-'.repeat(24 + 7 * nomes.length));
  for (const [rot, f] of [['entra em (mediana)', .5], ['entra em (p90)', .9]]){
    const linha = nomes.map(n => {
      const g = quem[n].map(c => c.gapMin).filter(x => x != null).sort((a, b) => a - b);
      if(g.length < 5) return col('—');
      const m = g[Math.floor(g.length * f)];
      return col(m >= 60 ? Math.round(m / 60) + 'h' : m + 'min');
    }).join('');
    console.log(rot.padEnd(24) + linha);
  }
  const msgs = nomes.map(n => {
    const v = quem[n].map(c => c.vend.length).sort((a, b) => a - b);
    return col(v[Math.floor(v.length / 2)]);
  }).join('');
  console.log('mensagens (mediana)'.padEnd(24) + msgs);
  console.log('\n⚠️ Hábito, não desempenho: quem converte mais depende do lead que recebeu.');
  console.log('   A régua disso é a camada 1 (tabela lead_score).');
}

if(flag === '--quem') porEspecialista(loja);
