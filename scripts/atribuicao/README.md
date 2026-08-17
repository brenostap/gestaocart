# Matcher de atribuição (lead → venda)

Diagnóstico, números e decisão: **`docs/ATRIBUICAO-LEADS-VENDAS.md`**. Aqui é só como rodar.

## Onde o resultado mora

**`public.venda_origem`** no Supabase do painel (criada em 17/ago/2026, migration
`cria_venda_origem`). Uma linha por venda **avaliada**:

| coluna | |
|---|---|
| `venda_id` | FK pra `vendas`, chave primária |
| `loja` · `projeto` | de qual base de leads veio o `lead_id` (cart ou urban) |
| `lead_id` | ⚠️ **só resolve dentro do projeto do Dudu indicado em `projeto`** — não há FK possível entre projetos Supabase |
| `canal` · `origem` | whatsapp/instagram · Meta Ads, Google Ads, Orgânico… |
| `nivel` · `metodo` | qual nível da cascata decidiu |
| `confianca` | `confirmado` (N0–N4) · `provavel` (N5, erra 1 em 5) · `sem_origem` |

⚠️ **`sem_origem` não é o mesmo que não ter linha.** Linha com `sem_origem` = o matcher
rodou e não achou. Sem linha = a venda nunca foi avaliada. Manter essa distinção é o que
permite medir cobertura sem chutar o denominador.

RLS: escrita e leitura por `eh_socio()`, igual `custos` e `metas_mensais`.

**Carga atual:** 1 a 15/ago/2026 — 221 vendas, 121 confirmadas, 14 prováveis, 86 sem
origem. Repopular = rodar os passos 1 e 2 abaixo e dar `insert ... on conflict (venda_id)
do update`. O CSV do último run fica em `.scratch/atribuicao/` (fora do git: a Netlify
publica a raiz do repo).

⚠️ **Quem consumir isso num relatório de verba tem que filtrar `confianca='confirmado'`.**
Somar `provavel` junto infla o canal de Instagram com ~20% de erro.

## Como rodar (simulação, só leitura)

1. **`01-vendas-blob.sql`** — roda no Supabase **do painel** (`pfsfsibgmtbifypuyyqf`).
   Ajuste `loja` e o período. Devolve uma coluna `blob`.
2. **`02-matcher.sql`** — roda na base de **leads** do Dudu.
   - `loja='cart'` → projeto `supabase-cart`, `{{LEADS}}` = `contatosBreno`
   - `loja='urban'` → projeto `supabase-urban`, `{{LEADS}}` = `contatosWhatsApp`
   - cole o blob no lugar de `{{VENDAS}}` (fica entre `$v$ ... $v$`)

Devolve uma linha por venda atribuída: `venda_id, canal, lead_id, origem, nivel, metodo,
similaridade`.

⚠️ O blob leva `vendedor_obs` porque o **nível 5** depende dele
(`contatos.vendedorAtribuido` = `vendas.vendedor_obs`). Sem esse campo o N5 não roda e a
cobertura cai de ~52% pra ~35%.

⚠️ Os três caminhos (`p_tel`, `p_nome`, `p_vo`) são JOINs separados de propósito. Juntar
num join só com `similarity(...) >= 0.45` no `ON` faz o Postgres calcular trigrama em
~7 milhões de pares e a query estoura o timeout.

## O que ele NÃO faz

- **Não grava nada.** Nenhum `insert`, `update` ou `create`. As conexões MCP dos dois
  projetos do Dudu estão com `read_only=true`; `match_resultado` e `contatos*` ficam
  intactos.
- Não roda sozinho: não há credencial de service_role neste repo pros projetos do Dudu,
  então hoje é executado à mão (ou via MCP). Virar rotina depende de decidir onde a
  tabela `venda_origem` vai morar — ver o doc.

## Por que blob e não join

Leads e vendas moram em projetos Supabase diferentes e não há dblink entre eles. A venda
é o lado pequeno (centenas por mês), então ela viaja até os leads. O `tel9` (últimos 9
dígitos) existe porque o painel grava `11984216941` e o lead grava `5511984216941`.
