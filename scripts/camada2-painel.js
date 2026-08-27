#!/usr/bin/env node
/**
 * CAMADA 2 do `docs/PLANO-QUALIDADE-IA.md`: o painel de comportamento do atendimento,
 * **determinístico** (regex na fala, zero IA, custo zero) e com **duas séries lado a lado** —
 * o que a IA faz e o que o VENDEDOR faz depois dela.
 *
 * ⚠️ A REGRA QUE ORGANIZA TUDO (§0 do plano): **nunca julgue pela conversão.** Conversão é rara
 * (~1% dos leads), lenta (mediana 8 dias, p75 84) e confundida — quando a mídia piora, a conversão
 * cai e o atendimento parece pior sem ter mudado nada. Por isso **toda linha aqui sai quebrada por
 * SEGMENTO de lead** (origem × canal × tema do anúncio). Comparar fora do segmento já me enganou
 * duas vezes em dois dias.
 *
 * ── ARMADILHAS, todas medidas na marra (não remova nenhuma sem reler o §3-ter/§3-quater) ──
 *
 * 1. **Chatwoot = IA + vendedor; n8n = só a IA.** A diferença é o humano. No Instagram o
 *    especialista responde no mesmo canal e o Chatwoot **não consegue atribuí-lo** (tudo da loja
 *    chega como `external_echo` com `sender: null`).
 * 2. **Case por CONTENÇÃO, nunca por prefixo.** A IA quebra a resposta em balões com `|||` e o
 *    Chatwoot quebra o que o n8n guarda junto. Casar os 60 primeiros caracteres inflou um teste
 *    meu de 41% pra 82%.
 * 3. **Filtre TEMPLATE.** O cartão de handoff *"Oii, tudo bem? Sou a Mel, especialista da Phone
 *    Urban…"* aparece **71 vezes idêntico** — espaço duplo incluso. Sem filtrar, o handoff da IA
 *    vira "vendedor" e o número dobra. Template = texto repetido em 5+ conversas do corpus.
 * 4. **Saudação NÃO é assinatura de humano** — o cartão da IA começa exatamente com "Oii, tudo bem?".
 * 5. **O `session_id` do Instagram da URBAN também termina em `-cart`** (fluxo copiado do da Maju).
 *    Filtrar por `-urban` devolve zero linha, calado.
 * 6. **Pagine as mensagens do Chatwoot.** `/messages` devolve só as 20 últimas; sem `before=<id>`
 *    você vê só a cauda — e a cauda é onde o vendedor está. Já enviesou uma medição minha.
 * 7. **`pediu o dia` precisa pegar "vamos agendar um horário"** — é o script do David na Urban.
 *    Meu primeiro regex não pegava e mediu 5% onde eram 17%.
 * 8. **Só Instagram.** No WhatsApp o especialista atende pelo número pessoal (`vendedores.telefone`)
 *    e não passa por Chatwoot nem n8n. Lá só dá pra medir a IA.
 *
 * ── COMO RODAR ────────────────────────────────────────────────────────────────
 *
 *   node scripts/separa-ia-vendedor.js colher cart      # 1. Chatwoot  → cache
 *   # 2. rode os 2 SQL que este arquivo imprime com `sql`, salve os JSON indicados
 *   node scripts/camada2-painel.js cart                 # 3. o painel
 *   node scripts/camada2-painel.js cart --sql           #    (só imprime os SQL)
 */

const fs = require('fs');
const path = require('path');

const CACHE = path.join(__dirname, '..', '.scratch', 'chatwoot');
const norm = s => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();

const MIN_MSGS_HUMANO = 3;     // calibrado em 378 conversas: 4/4 e 0/40
const MIN_CONVS_TEMPLATE = 5;

/**
 * O painel. Cada item vale para os DOIS lados — é essa simetria que revelou que a alavenca
 * do "pede o dia" é da casa, não do robô (IA 16–25%, humano 15% Cart / 2% Urban).
 */
const COMPORTAMENTOS = [
  ['pediu o DIA (explícito)', /\b(que dia|qual dia|melhor dia|que hor[áa]rio|qual hor[áa]rio|dia \d)/i],
  ['convidou/agendou (amplo)', /\b(agendar|agendamos|hora marcada|marcar (um )?hor[áa]rio|consegue (vir|passar)|pode (vir|passar)|vir at[ée]|receber na loja|dar uma olhada)/i],
  ['cotou PREÇO',             /r\$\s?\d/i],
  ['falou de TROCA',          /\b(troca|upgrade|parte do pagamento|avalia|volta (no|pro|do))/i],
  ['falou de PARCELAMENTO',   /\b(\d{1,2}x |parcel|[àa] vista|pix|entrada de)/i],
  ['falou de GARANTIA',       /garantia/i],
  ['falou de BATERIA',        /bateria/i],
  ['tentou FECHAR',           /\b(vai ser (esse|ele)|curtiu|posso (confirmar|separar|deixar)|fechamos|nome completo)/i],
  ['RESERVOU o aparelho',     /\b(separad|separar|reserv)/i],
];

/** ⚠️ A "pergunta pendurada": como a conversa morre. Vale para os dois lados. */
const TERMINA_PERGUNTANDO = /\?\s*$/;

function carregar(loja) {
  const ler = f => {
    const p = path.join(CACHE, f);
    if (!fs.existsSync(p)) { console.error(`falta ${p} — rode o passo anterior (veja o topo do arquivo)`); process.exit(1); }
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  };
  return {
    cw: ler(`chatwoot-ig-${loja}.json`),
    ia: ler(`ia-texto-${loja}.json`),
    seg: fs.existsSync(path.join(CACHE, `segmentos-${loja}.json`)) ? ler(`segmentos-${loja}.json`) : {},
  };
}

/** Separa, mensagem a mensagem, o que é da IA e o que é do vendedor. Ver armadilhas 1-4. */
function separar(cw, ia) {
  const freq = {};
  for (const v of Object.values(cw))
    for (const m of v.loja_msgs || []) {
      const k = norm(m.txt).slice(0, 80);
      if (k.length > 25) freq[k] = (freq[k] || 0) + 1;
    }
  const ehTemplate = t => (freq[norm(t).slice(0, 80)] || 0) >= MIN_CONVS_TEMPLATE;

  const out = {};
  for (const [arroba, v] of Object.entries(cw)) {
    const texto = norm(ia[arroba] || '');
    if (!texto) continue;                                    // sem histórico no n8n: não dá pra decidir
    const msgs = (v.loja_msgs || []).filter(m => norm(m.txt).length >= 15);
    const marcadas = msgs.map(m => ({
      ...m,
      vend: !texto.includes(norm(m.txt).slice(0, 45)) && !ehTemplate(m.txt),
    }));
    const doVend = marcadas.filter(m => m.vend);
    const temHumano = doVend.length >= MIN_MSGS_HUMANO;
    out[arroba] = {
      conv: v.conv,
      responsavel: v.responsavel,
      temHumano,
      msgsIA: marcadas.filter(m => !m.vend).map(m => m.txt),
      // ⚠️ se não bate a assinatura, o resíduo é cartão de preço — NÃO conte como vendedor
      msgsVend: temHumano ? doVend.map(m => m.txt) : [],
      gapMin: (() => {
        if (!temHumano) return null;
        const i = marcadas.findIndex(m => m.vend);
        const ultIA = marcadas.slice(0, i).filter(m => !m.vend).pop();
        if (!ultIA || !marcadas[i].t || !ultIA.t) return null;
        const g = Math.round((marcadas[i].t - ultIA.t) / 60);
        return g >= 0 ? g : null;
      })(),
    };
  }
  return out;
}

const pct = (n, d) => d ? (100 * n / d).toFixed(0).padStart(3) + '%' : '  —';

function painel(loja) {
  const { cw, ia, seg } = carregar(loja);
  const convs = separar(cw, ia);
  const todas = Object.entries(convs);
  const semSegmento = Object.keys(seg).length === 0;

  if (semSegmento)
    console.log(`⚠️  sem segmentos-${loja}.json — saindo AGREGADO. Ver §0: número agregado sobe e desce`
              + `\n    com o mix de mídia e não diz nada sobre o atendimento. Rode o SQL de segmentos.\n`);

  // agrupa por segmento de lead (ou tudo num balde só)
  const grupos = {};
  for (const [arroba, c] of todas) {
    const s = seg[arroba];
    const chave = semSegmento ? 'TODAS' : `${s?.origem || '(sem origem)'} · ${s?.tema || '(sem anúncio)'}`;
    (grupos[chave] = grupos[chave] || []).push(c);
  }

  for (const [chave, cs] of Object.entries(grupos).sort((a, b) => b[1].length - a[1].length)) {
    if (cs.length < 20) continue;                            // n<20 é ruído, não série
    const comH = cs.filter(c => c.temHumano);
    console.log(`\n${'='.repeat(78)}\n${loja.toUpperCase()} · ${chave}`);
    console.log(`${cs.length} conversas · vendedor apareceu em ${comH.length} (${pct(comH.length, cs.length).trim()})`);
    console.log(`${''.padEnd(28)}${'IA'.padStart(6)}   ${'VENDEDOR'.padStart(8)}   ${'ALGUÉM'.padStart(7)}`);

    for (const [nome, re] of COMPORTAMENTOS) {
      const nIA = cs.filter(c => c.msgsIA.some(m => re.test(m))).length;
      const nV = comH.filter(c => c.msgsVend.some(m => re.test(m))).length;
      const nQualquer = cs.filter(c => c.msgsIA.concat(c.msgsVend).some(m => re.test(m))).length;
      const estrela = /DIA/.test(nome) ? '⭐ ' : '   ';
      console.log(estrela + nome.padEnd(25) + pct(nIA, cs.length) + '   ' + pct(nV, comH.length).padStart(8) + '   ' + pct(nQualquer, cs.length).padStart(7));
    }

    // ⚠️ a "pergunta pendurada" — o padrão de morte, e ele é igual dos dois lados
    const mortIA = cs.filter(c => !c.temHumano && TERMINA_PERGUNTANDO.test(c.msgsIA.at(-1) || '')).length;
    const mortV = comH.filter(c => TERMINA_PERGUNTANDO.test(c.msgsVend.at(-1) || '')).length;
    console.log('   ' + 'morreu PERGUNTANDO'.padEnd(25) + pct(mortIA, cs.length - comH.length) + '   ' + pct(mortV, comH.length).padStart(8));

    const g = comH.map(c => c.gapMin).filter(x => x != null).sort((a, b) => a - b);
    if (g.length >= 8) {
      const q = p => g[Math.floor(g.length * p)];
      const fmt = m => m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m}min`;
      // ⚠️ mediana + p90 sempre. Média aqui é catástrofe garantida: cauda de um dia inteiro.
      console.log(`   IA → 1ª do vendedor:      mediana ${fmt(q(.5))} · p90 ${fmt(q(.9))}   (n=${g.length})`);
    }
  }
}

function sql(loja) {
  console.log(`-- 1) TEXTO DA IA. ⚠️ o sufixo é '-cart' NAS DUAS LOJAS (armadilha 5).
--    Salve o retorno como .scratch/chatwoot/ia-texto-${loja}.json
select json_object_agg(arroba, txt)::text from (
  select replace(h.session_id, '-cart', '') as arroba,
         lower(regexp_replace(string_agg(regexp_replace(h.message->>'content', E'\\\\nsessionID:.*$',''), ' ~~ '), '\\s+', ' ', 'g')) as txt
  from n8n_chat_histories_instagram h
  where h.message->>'type' = 'ai' and coalesce(h.message->>'content','') not in ('','[]')
  group by 1
) t;

-- 2) SEGMENTO DE LEAD (§0: sem isto o painel não vale nada).
--    Salve como .scratch/chatwoot/segmentos-${loja}.json
select json_object_agg(telefone, json_build_object('origem', origem, 'tema', tema, 'transferido', transferido))::text from (
  select c.telefone,
         coalesce(c.origem, '(sem origem)') as origem,
         case when a.headline ~* 'POSSUI|PROCURA-SE'          then 'anuncio: aparelho do cliente'
              when a.headline ~* 'TABELA|SEMINOVOS|IPHONE'     then 'anuncio: preco/produto'
              when a.headline is not null                      then 'anuncio: generico'
              else '(sem anuncio)' end as tema,
         (c."vendedorAtribuido" is not null) as transferido
  from "contatosInstagram" c
  left join atribuicao_clique a on a.id = c.atribuicao_id
) t;`);
}

const [loja, flag] = process.argv.slice(2);
if (!loja || !['cart', 'urban'].includes(loja)) {
  console.log('uso: node scripts/camada2-painel.js <cart|urban> [--sql]');
  process.exit(1);
}
if (flag === '--sql') sql(loja); else painel(loja);
