-- Conversão por coorte — projeto supabase-cart (só leitura). Consulta IRMÃ da
-- `metricas-semanais.sql`, e a diferença entre as duas é o ponto todo.
--
-- ⚠️ NUNCA meça conversão na semana corrente. O lag mediano entre o lead
-- chegar e comprar é 8 dias, mas o p75 é 84 e o p90 é 138 — 40% compram depois
-- de 30 dias. A coorte de ontem sempre vai parecer catástrofe, e a de três
-- meses atrás sempre vai parecer ótima. Comparar coortes de maturidades
-- diferentes é a forma mais fácil de concluir que a Maju piorou quando ela só
-- está mais nova. Detalhe em docs/ATRIBUICAO-LEADS-VENDAS.md.
--
-- Por isso esta consulta só devolve coortes com >= 60 dias de estrada, e
-- carimba quantos dias cada uma teve pra amadurecer.
--
-- O rótulo é `contatosBreno.comprou` — medido em 97,7% de precisão contra
-- vendas casadas por telefone (docs/ATRIBUICAO-LEADS-VENDAS.md).

with sess as (
  select
    replace(session_id, '-cart', '')                    as tel,
    date_trunc('month', min(created_at))::date          as coorte,
    min(created_at)::date                               as d_ini,
    count(*) filter (where message->>'type' = 'human')  as msgs_cliente,
    bool_or(message->>'type' = 'ai' and message->>'content' ~ 'R\$') as deu_preco
  from public.n8n_chat_histories_maju_v2
  group by 1
),
j as (
  select s.*,
    (c."vendedorAtribuido" is not null) as escalou,
    coalesce(c.comprou, false)          as comprou
  from sess s
  join public."contatosBreno" c on c.telefone = s.tel
  where s.deu_preco and s.msgs_cliente >= 5
)
select
  coorte,
  (current_date - max(d_ini))                                          as dias_de_maturacao,
  count(*)                                                             as sessoes,
  count(*) filter (where escalou)                                      as escalaram,
  round(100.0 * count(*) filter (where comprou and escalou)
        / nullif(count(*) filter (where escalou), 0), 2)               as conv_se_escalou,
  round(100.0 * count(*) filter (where comprou and not escalou)
        / nullif(count(*) filter (where not escalou), 0), 2)           as conv_se_nao_escalou,
  round(100.0 * count(*) filter (where comprou) / count(*), 2)         as conv_geral
from j
group by 1
having current_date - max(d_ini) >= 60      -- só coorte madura
order by 1;
