#!/usr/bin/env node
/**
 * Separa, numa conversa de INSTAGRAM, o que a IA escreveu do que o VENDEDOR escreveu.
 *
 * ⚠️ POR QUE ISSO PRECISA EXISTIR
 *
 * No Instagram o especialista responde **no mesmo canal** depois que a IA transfere.
 * E o Chatwoot **não consegue distinguir os dois**: tudo que a loja manda chega como
 * `external_echo: true` com `sender: null` — a mensagem da Maju e a do David são
 * indistinguíveis lá dentro. Foi isso que fez `docs/CHATWOOT-ANALISE.md` concluir
 * "nenhuma vendedora escreve no Chatwoot" (10/ago/2026). **Elas escrevem.**
 *
 * A separação sai de cruzar duas fontes:
 *
 *   Chatwoot  = TUDO que a loja mandou   (IA + vendedor)
 *   n8n_chat_histories_instagram = SÓ o que a IA gerou
 *   ─────────────────────────────────────────────────────
 *   diferença = o vendedor
 *
 * ⚠️ **Não conte mensagem — e não case por prefixo. Case por CONTENÇÃO no texto inteiro.**
 * Duas armadilhas, as duas já me pegaram:
 *   1. A IA quebra a resposta em balões com `|||`: 1 linha no n8n vira 3 mensagens no
 *      Chatwoot. Em ray_pereira58 são 9 linhas = 16 balões contra 13 mensagens. Subtrair
 *      contagem dá "−3 humanos".
 *   2. O Chatwoot **também** quebra o que o n8n guarda junto: a IA manda
 *      *"Justo! Pra eu te passar a melhor avaliação... 🔷 Pré-avaliação Phone Cart..."*
 *      como UM balão, e o Instagram entrega como DUAS mensagens. Casar os 60 primeiros
 *      caracteres marca a segunda como "vendedor". Foi o que inflou o teste de 41% pra 82%.
 * Por isso: concatena todo o texto da IA da sessão e pergunta se a mensagem do Chatwoot
 * **está contida** ali.
 *
 * ⚠️ **Ponto cego conhecido: o cartão de preço.** Mensagens do tipo
 * *"iPhone 13 256GB → R$ 1.990 à vista ou 18x de R$ 135,30"* aparecem no Chatwoot e **não**
 * no `n8n_chat_histories_instagram` — provavelmente outro nó do fluxo as envia. Elas viram
 * falso "vendedor". Por isso a assinatura de humano de verdade não é "sobrou 1 mensagem":
 *
 *   ⭐ **Humano = 5+ mensagens não explicadas E uma delas é saudação**
 *      (*"oii, boa tarde! tudo bem?"*, *"boa noite ray, tudo bem?"*).
 *      Medido: 4 de 4 handoffs conhecidos batem; 0 de 40 conversas sem `vendedorAtribuido`
 *      batem — nessas o resíduo é 1 a 3 mensagens e é **sempre** cartão de preço.
 *
 * ⚠️ **Só funciona no Instagram.** No WhatsApp o especialista atende pelo número pessoal
 * dele, que não passa nem pelo Chatwoot nem pelo n8n. Lá continua invisível.
 *
 * ── COMO RODAR ────────────────────────────────────────────────────────────────
 *
 *   # 1. colhe o lado Chatwoot (precisa de CHATWOOT_CART_TOKEN / CHATWOOT_URBAN_TOKEN)
 *   node scripts/separa-ia-vendedor.js colher cart [paginas]
 *
 *   # 2. rode o SQL que ele imprime, no Supabase do Dudu, e salve o resultado em
 *   #    .scratch/chatwoot/ia-texto-<loja>.json
 *
 *   # 3. compara
 *   node scripts/separa-ia-vendedor.js comparar cart
 *
 * O cache vive em .scratch/chatwoot/ (fora do git — a Netlify publica a raiz do repo).
 * Só GET. O mesmo token manda mensagem pro cliente; nunca use POST/PUT/DELETE aqui.
 */

const fs = require('fs');
const path = require('path');

const LOJAS = {
  cart:  { base: 'https://n8n-chatwoot.3tclbj.easypanel.host', env: 'CHATWOOT_CART_TOKEN',  igInbox: 3, sufixo: '-cart' },
  // ⚠️ sufixo '-cart' nas DUAS: o fluxo da Duda foi copiado do da Maju e o sufixo
  // do session_id veio junto. Usar '-urban' aqui devolve zero linha, calado.
  urban: { base: 'https://chatwoot-chatwoot.3tclbj.easypanel.host', env: 'CHATWOOT_URBAN_TOKEN', igInbox: 2, sufixo: '-cart' },
};

const CACHE = path.join(__dirname, '..', '.scratch', 'chatwoot');

/** Normalização usada dos dois lados. Emoji e espaço duplo não podem decidir nada. */
const norm = s => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();

function loja(nome) {
  const l = LOJAS[nome];
  if (!l) { console.error('loja tem que ser cart ou urban'); process.exit(1); }
  const token = process.env[l.env];
  if (!token) { console.error(`falta ${l.env} no ambiente — peça ao dono, nunca escreva token em arquivo`); process.exit(1); }
  return { ...l, token };
}

async function colher(nome, paginas) {
  const l = loja(nome);
  const h = { api_access_token: l.token };
  const convs = {};

  for (let pg = 1; pg <= paginas; pg++) {
    let r;
    try {
      r = await fetch(`${l.base}/api/v1/accounts/1/conversations?status=all&assignee_type=all&page=${pg}`, { headers: h }).then(x => x.json());
    } catch (e) { continue; }                        // falha de rede não mata a varredura
    if (!r?.data?.payload?.length) break;

    for (const c of r.data.payload) {
      if (c.inbox_id !== l.igInbox) continue;        // só Instagram: ver o aviso no topo
      const extra = c.meta?.sender?.additional_attributes || {};
      const arroba = extra.social_instagram_user_name || extra.social_profiles?.instagram;
      if (!arroba || convs[arroba]) continue;
      convs[arroba] = {
        conv: c.id,
        responsavel: c.meta?.assignee?.name || null,
        ultima_atividade: c.last_activity_at,
      };
    }
    process.stderr.write(`\rpagina ${pg} · ${Object.keys(convs).length} conversas de IG`);
  }
  process.stderr.write('\n');

  for (const [arroba, info] of Object.entries(convs)) {
    try {
      const m = await fetch(`${l.base}/api/v1/accounts/1/conversations/${info.conv}/messages`, { headers: h }).then(x => x.json());
      const msgs = (Array.isArray(m) ? m : m.payload || [])
        .filter(x => x.message_type === 1 && !x.private && (x.content || '').trim());
      info.loja_msgs = msgs.map(x => ({ t: x.created_at, txt: (x.content || '').slice(0, 300) }));
    } catch (e) { info.loja_msgs = []; }
  }

  fs.mkdirSync(CACHE, { recursive: true });
  const arq = path.join(CACHE, `chatwoot-ig-${nome}.json`);
  fs.writeFileSync(arq, JSON.stringify(convs));
  console.log(`\n${Object.keys(convs).length} conversas salvas em ${arq}\n`);

  const handles = Object.keys(convs).map(a => `'${a.replace(/'/g, "''")}'`).join(',');
  console.log(`Agora rode este SQL no Supabase do Dudu (projeto ${nome}) e salve o retorno`);
  console.log(`como um JSON {arroba: texto} em ${path.join(CACHE, `ia-texto-${nome}.json`)}:\n`);
  console.log(`select json_object_agg(arroba, txt)::text from (
  select replace(h.session_id, '${l.sufixo}', '') as arroba,
         lower(regexp_replace(string_agg(regexp_replace(h.message->>'content', E'\\\\nsessionID:.*$',''), ' ~~ '), '\\s+', ' ', 'g')) as txt
  from n8n_chat_histories_instagram h
  where h.message->>'type' = 'ai'
    and coalesce(h.message->>'content','') not in ('','[]')
    and replace(h.session_id, '${l.sufixo}', '') in (${handles})
  group by 1
) t;`);
}

// ⚠️ Saudação NÃO serve de assinatura — foi o primeiro atalho que tentei e falha:
// o cartão de handoff da IA começa exatamente com "Oii, tudo bem?".
/**
 * ⭐ Assinatura de humano, calibrada em 378 conversas (27/ago): **3+ mensagens que não estão no
 * n8n E não são template**. Template = texto que se repete em 5+ conversas do corpus — é assim que
 * se descarta o cartão de handoff ("Oii, tudo bem? Sou a Mel, especialista da Phone Urban…", que
 * aparece 71 vezes **idêntico**, espaço duplo incluso). Sem esse filtro o handoff da IA vira
 * "humano" e o número dobra.
 */
const MIN_MSGS_HUMANO = 3;
const MIN_CONVS_TEMPLATE = 5;

function comparar(nome) {
  const cw = JSON.parse(fs.readFileSync(path.join(CACHE, `chatwoot-ig-${nome}.json`), 'utf8'));
  const iaTexto = JSON.parse(fs.readFileSync(path.join(CACHE, `ia-texto-${nome}.json`), 'utf8'));

  // Frequência de cada texto no corpus inteiro — é o que separa template de fala.
  const freq = {};
  for (const info of Object.values(cw))
    for (const m of info.loja_msgs || []) {
      const k = norm(m.txt).slice(0, 80);
      if (k.length > 25) freq[k] = (freq[k] || 0) + 1;
    }
  const ehTemplate = t => (freq[norm(t).slice(0, 80)] || 0) >= MIN_CONVS_TEMPLATE;

  let comVendedor = 0, soIA = 0, semHistorico = 0;
  const linhas = [];

  for (const [arroba, info] of Object.entries(cw)) {
    const texto = norm(iaTexto[arroba] || '');
    if (!texto) { semHistorico++; continue; }         // lead sem histórico no n8n: não dá pra decidir

    const msgs = (info.loja_msgs || []).filter(m => norm(m.txt).length >= 15);  // "ok"/emoji não decide nada
    const doVendedor = msgs.filter(m => !texto.includes(norm(m.txt).slice(0, 45)) && !ehTemplate(m.txt));
    const temHumano = doVendedor.length >= MIN_MSGS_HUMANO;
    if (temHumano) comVendedor++; else soIA++;

    linhas.push({
      arroba,
      conv: info.conv,
      responsavel: info.responsavel,
      humano: temHumano,
      msgs_loja: msgs.length,
      msgs_ia: msgs.length - doVendedor.length,
      msgs_vendedor: doVendedor.length,
      primeira_do_vendedor: doVendedor[0]?.txt || null,
    });
  }

  linhas.sort((a, b) => b.msgs_vendedor - a.msgs_vendedor);
  for (const l of linhas.filter(x => x.msgs_vendedor)) {
    console.log(`${l.humano ? '👤' : '  '} @${l.arroba.padEnd(24)} conv ${String(l.conv).padStart(6)} · resp ${String(l.responsavel || '-').padEnd(16)} · loja ${String(l.msgs_loja).padStart(3)} = IA ${String(l.msgs_ia).padStart(3)} + nao-explicadas ${String(l.msgs_vendedor).padStart(3)}`);
    if (l.primeira_do_vendedor) console.log(`     1ª: ${l.primeira_do_vendedor.replace(/\n/g, ' ').slice(0, 105)}`);
  }

  const total = comVendedor + soIA;
  console.log(`\n${total} conversas comparáveis (${semHistorico} sem histórico no n8n, ignoradas)`);
  console.log(`  👤 vendedor atendeu no canal: ${comVendedor} (${(100 * comVendedor / total).toFixed(1)}%)`);
  console.log(`     só a IA                  : ${soIA} (${(100 * soIA / total).toFixed(1)}%)`);
  console.log(`\n⚠️ "só a IA" NÃO prova abandono — o vendedor pode ter chamado por fora (WhatsApp pessoal),`);
  console.log(`   e o cartão de preço não está no n8n, então 1-3 mensagens não explicadas é normal.`);
  console.log(`   Prova só o contrário: quando bate a assinatura, houve atendimento humano.`);
}

const [cmd, nome, arg] = process.argv.slice(2);
if (cmd === 'colher') colher(nome, Number(arg) || 100);
else if (cmd === 'comparar') comparar(nome);
else {
  console.log('uso: node scripts/separa-ia-vendedor.js colher <cart|urban> [paginas]');
  console.log('     node scripts/separa-ia-vendedor.js comparar <cart|urban>');
  process.exit(1);
}
