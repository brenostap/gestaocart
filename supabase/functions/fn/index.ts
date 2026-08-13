import { createClient } from 'jsr:@supabase/supabase-js@2'

// Proxy autenticado para a API FoneNinja. A chave do ERP fica no servidor
// (tabela app_secrets, lida via service_role) e nunca vai para o navegador.
//
// ⚠️ HISTORICO (13/ago/2026) — esta funcao era um buraco de ESCRITA.
// A versao 1 fazia duas coisas: conferia que existia *algum* usuario
// autenticado (sem olhar papel) e repassava o metodo da requisicao como veio
// (`method: req.method`), com o CORS liberando POST/PUT/PATCH/DELETE.
// Traduzindo: qualquer pessoa com login no painel podia escrever e apagar
// qualquer coisa na FoneNinja, com a chave da loja. Nao vazava -- destruia.
// Apareceu quando o Vitinho virou o primeiro usuario que nao e socio.
//
// Agora sao duas travas, e as duas precisam passar:
//   1. ROTA + METODO na lista branca abaixo (so o que o painel de fato chama)
//   2. PAPEL 'socio' na tabela `perfis`
//
// Tela nova que precise de rota nova entra AQUI, de proposito. Se voltar 403,
// e isso: a rota nao esta na lista. Ver docs/PERFIS-E-ACESSO.md.

const FN_BASE = 'https://api.fone.ninja/erp/api/lojas/phone_cart'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Tudo que o painel chama hoje. Levantado com
// `grep -rn "BASE+" js/` em 13/ago/2026 -- 4 rotas, todas GET.
const PERMITIDAS: Array<{ metodo: string; rota: RegExp }> = [
  { metodo: 'GET', rota: /^\/vendas$/ },          // data.js, notificacoes.js
  { metodo: 'GET', rota: /^\/vendas\/\d+$/ },     // detalhe da venda
  { metodo: 'GET', rota: /^\/apples$/ },          // estoque "fresco"
  { metodo: 'GET', rota: /^\/movimentacoes$/ },   // acessorios
]

// O metodo vem da requisicao, mas so os que existem na lista sao aceitos.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

// A funcao fica quente entre chamadas; cacheamos o segredo em memoria.
let cachedKey: string | null = null
async function getFoneKey(svc: ReturnType<typeof createClient>): Promise<string> {
  if (cachedKey) return cachedKey
  const { data, error } = await svc.from('app_secrets').select('value').eq('key', 'foneninja_key').single()
  if (error || !data) throw new Error('segredo foneninja_key ausente')
  cachedKey = data.value as string
  return cachedKey
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  // -- 1. quem e -------------------------------------------------------------
  const authHeader = req.headers.get('Authorization') ?? ''
  const authed = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } })
  const { data: { user } } = await authed.auth.getUser()
  if (!user) return json({ error: 'unauthorized' }, 401)

  // -- 2. que papel ----------------------------------------------------------
  // Lido com service_role de proposito: o user_id vem do JWT ja verificado
  // acima, entao nao ha o que forjar, e assim nao dependemos do RLS de `perfis`.
  const svc = createClient(SUPABASE_URL, SERVICE_KEY)
  const { data: perfil } = await svc.from('perfis')
    .select('papel, ativo').eq('user_id', user.id).maybeSingle()
  if (!perfil || !perfil.ativo || perfil.papel !== 'socio') {
    console.warn(`[fn] negado: ${user.email} papel=${perfil?.papel ?? 'nenhum'} ${req.method} ${req.url}`)
    return json({ error: 'forbidden' }, 403)
  }

  // -- 3. rota + metodo na lista branca --------------------------------------
  const url = new URL(req.url)
  const parts = url.pathname.split('/').filter(Boolean)
  const i = parts.indexOf('fn')
  const sub = '/' + (i >= 0 ? parts.slice(i + 1) : parts).join('/')

  if (!PERMITIDAS.some((p) => p.metodo === req.method && p.rota.test(sub))) {
    console.warn(`[fn] rota fora da lista: ${user.email} ${req.method} ${sub}`)
    return json({ error: 'rota nao permitida', metodo: req.method, rota: sub }, 403)
  }

  // -- 4. encaminha ----------------------------------------------------------
  let key: string
  try {
    key = await getFoneKey(svc)
  } catch (e) {
    return json({ error: String(e) }, 500)
  }

  // Sem body: a lista branca so tem GET. Se um dia entrar POST aqui, o corpo
  // volta -- e ai vale reler o aviso do topo antes.
  const resp = await fetch(FN_BASE + sub + url.search, {
    method: req.method,
    headers: { 'Authorization': 'Bearer ' + key, 'Accept': 'application/json' },
  })
  const body = await resp.text()
  return new Response(body, {
    status: resp.status,
    headers: { ...cors, 'Content-Type': resp.headers.get('Content-Type') ?? 'application/json' },
  })
})
