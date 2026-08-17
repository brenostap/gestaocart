# Matcher de atribuição (lead → venda)

Diagnóstico, números e decisão: **`docs/ATRIBUICAO-LEADS-VENDAS.md`**. Aqui é só como rodar.

## Como rodar (simulação, só leitura)

1. **`01-vendas-blob.sql`** — roda no Supabase **do painel** (`pfsfsibgmtbifypuyyqf`).
   Ajuste `loja` e o período. Devolve uma coluna `blob`.
2. **`02-matcher.sql`** — roda na base de **leads** do Dudu.
   - `loja='cart'` → projeto `supabase-cart`, `{{LEADS}}` = `contatosBreno`
   - `loja='urban'` → projeto `supabase-urban`, `{{LEADS}}` = `contatosWhatsApp`
   - cole o blob no lugar de `{{VENDAS}}` (fica entre `$v$ ... $v$`)

Devolve uma linha por venda atribuída: `venda_id, canal, lead_id, origem, metodo,
similaridade` — e `id_venda_marcado_hoje` pra comparar com o que já está gravado.

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
