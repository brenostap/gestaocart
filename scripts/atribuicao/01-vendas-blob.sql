-- Passo 1 — roda no Supabase DO PAINEL (pfsfsibgmtbifypuyyqf).
-- Produz o "blob" de vendas que o passo 2 injeta na base de leads do Dudu.
--
-- Por que blob e nao join: leads e vendas moram em projetos Supabase diferentes
-- (painel x supabase-cart x supabase-urban). Nao ha dblink entre eles. A venda e o
-- lado pequeno (algumas centenas por mes), entao ela viaja ate os leads, e nao o
-- contrario.
--
-- Formato de cada linha:  id | tel9 | data | nome
--   tel9 = ultimos 9 digitos do telefone (o painel grava "11984216941" e o lead
--          grava "5511984216941"; os 9 finais sao o unico pedaco comparavel)
--   nome = minusculo e sem espaco nas pontas (o passo 2 tira acento e pontuacao)
--
-- AJUSTE loja e periodo antes de rodar.

select string_agg(
    id::text
    || '|' || right(regexp_replace(coalesce(cliente_tel, ''), '\D', '', 'g'), 9)
    || '|' || to_char(data_saida, 'YYYY-MM-DD')
    || '|' || lower(btrim(coalesce(cliente_nome, ''))),
    chr(10) order by id
  ) as blob
from public.vendas
where data_saida >= '2026-07-01'
  and data_saida <  '2026-08-01'
  and loja = 'cart';          -- 'cart' -> projeto supabase-cart | 'urban' -> supabase-urban
