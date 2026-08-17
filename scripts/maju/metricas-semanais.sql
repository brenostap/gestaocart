-- Métricas semanais do atendimento da Maju — projeto supabase-cart (só leitura).
--
-- Roda como está, sem parâmetro. Devolve uma linha por semana desde 10/jun/2026
-- (início de `n8n_chat_histories_maju_v2`).
--
-- ⚠️ TODA métrica aqui é de COMPORTAMENTO, medível no mesmo dia. Conversão NÃO
-- entra: o lag mediano lead→compra é 8 dias com p75 de 84, então a taxa da
-- semana corrente é sempre uma foto imatura que parece queda. Conversão se mede
-- na consulta irmã, com atraso — ver `conversao-coorte.sql`.
--
-- ⚠️ SEMPRE olhe a SÉRIE, nunca o último número sozinho. Foi a série que
-- revelou a virada do prompt em 27/jul/2026 (escalada 27,6% → 56,5%). Um
-- painel de "número da semana" teria escondido isso.
--
-- Recorte: sessões com preço dado e 5+ mensagens do cliente. É o universo onde
-- escalar faz diferença; conversa de 2 mensagens não tem o que escalar.

with sess as (
  select
    replace(session_id, '-cart', '')                    as tel,
    date_trunc('week', min(created_at))::date           as semana,
    count(*) filter (where message->>'type' = 'human')  as msgs_cliente,
    bool_or(message->>'type' = 'ai'
            and message->>'content' ~ 'R\$')            as deu_preco,
    -- Sinal de compra COMPROMETIDO. `quero` sozinho não serve: pega "quero
    -- saber o preço", que 62% das conversas têm. A negação também precisa sair:
    -- "eu NÃO vou querer comprar não" casava com a forma positiva.
    bool_or(message->>'type' = 'human'
            and lower(message->>'content') ~ '\m(vou querer|vou levar|pode separar|quero comprar|vou ficar com)\M'
            and lower(message->>'content') !~ '\m(n[ãa]o|nem)\M[^.!?]{0,25}(vou querer|vou levar|pode separar|quero comprar)')
                                                        as sinal_compra,
    bool_or(message->>'type' = 'human'
            and lower(message->>'content') ~ '\m(amanh[ãa]|hoje|s[áa]bado|segunda|ter[çc]a|quarta|quinta|sexta|que horas|posso ir|vou passar)\M')
                                                        as falou_dia
  from public.n8n_chat_histories_maju_v2
  group by 1
),
j as (
  select s.*, (c."vendedorAtribuido" is not null) as escalou
  from sess s
  join public."contatosBreno" c on c.telefone = s.tel
  where s.deu_preco and s.msgs_cliente >= 5
)
select
  semana,
  count(*)                                                             as sessoes,
  round(100.0 * count(*) filter (where escalou) / count(*), 1)         as pct_escalou,
  -- Gatilho que já funciona: cliente dá uma data. Estável em ~76% desde junho.
  round(100.0 * count(*) filter (where falou_dia and escalou)
        / nullif(count(*) filter (where falou_dia), 0), 1)             as escala_se_deu_data,
  -- Gatilho que o prompt de 27/jul melhorou: cliente diz que quer comprar mas
  -- não marca dia. Era 30,5%, foi pra 44,5%. É a métrica pra vigiar.
  round(100.0 * count(*) filter (where sinal_compra and not falou_dia and escalou)
        / nullif(count(*) filter (where sinal_compra and not falou_dia), 0), 1)
                                                                       as escala_se_so_quis_comprar,
  -- O vazamento em número absoluto: disse que ia comprar, não marcou dia,
  -- ninguém foi chamado.
  count(*) filter (where sinal_compra and not falou_dia and not escalou) as vazou
from j
group by 1
order by 1;
