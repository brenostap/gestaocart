import { createClient } from 'jsr:@supabase/supabase-js@2'

// Le a planilha oficial (CSV) e aplica sobre tabela_precos via RPC sync_precos,
// que roda numa unica transacao com guarda de seguranca.
//
// Autorizado para: PAPEL 'socio' (botao na tela de Tabela de precos) OU o cron
// diario, que envia o header x-sync-secret guardado em app_secrets.
//
// ⚠️ Ate 14/ago/2026 bastava estar autenticado (`permitido = !!user`), sem olhar
// papel: qualquer login do painel disparava um sync de precos fora de hora.
// Apareceu na revisao do acesso do Vitinho (papel `bancada`). A trava e a mesma
// do proxy `fn` -- papel lido com service_role, pelo user.id do JWT ja verificado.
//
// ⚠️ O INVIS abaixo esta em escapes \u DE PROPOSITO. Ele era escrito com os
// caracteres literais, que sao invisiveis: nao dava para reeditar o arquivo sem
// arriscar comer um deles em silencio, e o sync passaria a deixar lixo invisivel
// nos nomes de modelo. Em escape o arquivo e ASCII puro. Nao volte a forma literal.

const SHEET_ID = '1fLCz0FxFOc32raFRr0Od9vkP1cxSJCzwpgAGTE9GaCE'
const SHEET_GID = '1349728231'
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-secret',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

// -- CSV com aspas (o campo de cores tem virgulas dentro) --------------------
function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], field = '', inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else inQ = false }
      else field += c
    } else if (c === '"') inQ = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c !== '\r') field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows
}

// Variation selectors (FE00-FE0F), zero-width space/non-joiner/joiner (200B-200D)
// e BOM (FEFF) -- o que a planilha carrega junto dos emojis do cabecalho.
const INVIS = /[\uFE00-\uFE0F\u200B-\u200D\uFEFF]/g
const limpa = (s: string) =>
  (s ?? '').replace(INVIS, '').replace(/\p{So}/gu, '').replace(/\p{Cf}/gu, '')
           .replace(/\s+/g, ' ').trim()

function preco(s: string): number | null {
  const t = (s ?? '').trim()
  if (!t || t === '-') return null
  const n = parseFloat(t.replace(/R\$/g, '').replace(/\s/g, '').replace(/,/g, ''))
  return isNaN(n) ? null : n
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const svc = createClient(SUPABASE_URL, SERVICE_KEY)

  // -- autorizacao ----------------------------------------------------------
  let permitido = false
  const segredo = req.headers.get('x-sync-secret')
  if (segredo) {
    const { data } = await svc.from('app_secrets').select('value').eq('key', 'sync_secret').single()
    // comparacao de tamanho constante para nao vazar o segredo por timing
    const esperado = data?.value ?? ''
    permitido = esperado.length > 0 && segredo.length === esperado.length &&
      segredo.split('').reduce((acc, c, i) => acc | (c.charCodeAt(0) ^ esperado.charCodeAt(i)), 0) === 0
  }
  if (!permitido) {
    const auth = req.headers.get('Authorization') ?? ''
    const sb = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } })
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return json({ error: 'unauthorized' }, 401)

    // Papel lido com service_role de proposito: o user_id vem do JWT ja
    // verificado acima, entao nao ha o que forjar, e assim nao dependemos do
    // RLS de `perfis`. Mesmo desenho do proxy `fn`.
    const { data: perfil } = await svc.from('perfis')
      .select('papel, ativo').eq('user_id', user.id).maybeSingle()
    if (!perfil || !perfil.ativo || perfil.papel !== 'socio') {
      console.warn(`[sync-precos] negado: ${user.email} papel=${perfil?.papel ?? 'nenhum'}`)
      return json({ error: 'forbidden' }, 403)
    }
    permitido = true
  }
  if (!permitido) return json({ error: 'unauthorized' }, 401)

  try {
    const resp = await fetch(CSV_URL, { redirect: 'follow' })
    if (!resp.ok) throw new Error(`planilha respondeu HTTP ${resp.status}`)
    const texto = await resp.text()
    if (/^\s*<(!doctype|html)/i.test(texto)) {
      throw new Error('planilha nao esta acessivel publicamente (veio HTML no lugar do CSV)')
    }

    const linhas = parseCSV(texto)
    if (!linhas.length) throw new Error('CSV vazio')
    const cab = linhas[0].map((h) => limpa(h).toLowerCase())
    const col = (nome: string) => cab.findIndex((h) => h.startsWith(nome))
    const iCat = col('categoria'), iMod = col('modelo'), iGb = col('gb'),
          iCor = col('cores'), iCond = col('condi'), iUp = col('upgrade'),
          iVar = col('varejo'), iDisp = col('sujeito')
    if (iCat < 0 || iMod < 0 || iCond < 0) throw new Error('colunas esperadas nao encontradas no cabecalho')

    const dados = []
    for (const l of linhas.slice(1)) {
      const categoria = limpa(l[iCat] ?? ''), modelo = limpa(l[iMod] ?? '')
      if (!categoria || !modelo) continue          // linhas separadoras
      const gb = limpa(l[iGb] ?? ''), cores = limpa(l[iCor] ?? '')
      dados.push({
        categoria, modelo,
        capacidade: gb === '-' ? '' : gb,
        cores: cores === '-' ? '' : cores,
        cor: '',                                   // preenchido abaixo
        condicao: limpa(l[iCond] ?? ''),
        preco_upgrade: preco(l[iUp] ?? ''),
        preco_varejo: preco(l[iVar] ?? ''),
        sujeito_disponibilidade: (l[iDisp] ?? '').trim().toUpperCase() === 'TRUE',
      })
    }

    // `cor` so importa quando o preco varia por cor: mesma chave repetida.
    const cont = new Map<string, number>()
    const chave = (d: typeof dados[0]) => [d.categoria, d.modelo, d.capacidade, d.condicao].join('|')
    for (const d of dados) cont.set(chave(d), (cont.get(chave(d)) ?? 0) + 1)
    for (const d of dados) if ((cont.get(chave(d)) ?? 0) > 1) d.cor = d.cores

    const { data, error } = await svc.rpc('sync_precos', { dados })
    if (error) throw new Error(error.message)

    return json({ ok: true, ...data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await svc.from('sync_log').upsert({
      tabela: 'tabela_precos', last_sync: new Date().toISOString(),
      status: 'erro', erro: msg,
    })
    return json({ ok: false, error: msg }, 500)
  }
})
