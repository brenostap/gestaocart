-- Comportamento semanal da Maju, versão 2 — projeto supabase-cart (só leitura).
--
-- Consulta IRMÃ de `metricas-semanais.sql`. Aquela mede ESCALADA; esta mede
-- AGENDAMENTO e COMO A CONVERSA MORRE, que é onde está a alavanca medida em
-- 20/ago/2026 (ver docs/ANALISE-MAJU-AGO-2026.md).
--
-- ⚠️ TODA métrica aqui é de COMPORTAMENTO, medível no mesmo dia. Conversão NÃO
-- entra — lag mediano lead→compra de 8 dias, p75 de 84. Use `conversao-coorte.sql`.
--
-- ⚠️ SEMPRE olhe a SÉRIE. Com ~36 sessões qualificadas por dia, a taxa DIÁRIA é
-- ruído puro: n≈250 (uma semana) é o menor recorte honesto.
--
-- ⚠️ Ignora o lote de backfill de 10/jun às 20h (1.688 sessões com timestamp
-- achatado, 1.542 delas com todas as mensagens no mesmo instante). "Coorte de
-- junho" não é quem chegou em junho.
--
-- Recorte: sessões com preço dado e 5+ mensagens do cliente.
--
-- Armadilhas de dado embutidas aqui (não remova sem ler o doc):
--   * a fala do cliente vem embrulhada em `message: <texto>\nsessionID: <tel>`;
--   * `content = '[]'` é mensagem só-de-ferramenta, não é fala;
--   * a escalada de verdade é a ferramenta `transfereHumano`, não o campo
--     `vendedorAtribuido` — a ferramenta mede melhor (8,7x contra 5,9x).

with m as (
  select
    session_id                                        as sid,
    id,
    created_at                                        as ts,
    message->>'type'                                  as tipo,
    lower(regexp_replace(coalesce(nullif(message->>'content','[]'),''),
                         E'\nsessionID:.*$',''))      as lc,
    message->'tool_calls'                             as tcs
  from public.n8n_chat_histories_maju_v2
),
s as (
  select session_id as sid, min(created_at) as ini
  from public.n8n_chat_histories_maju_v2 group by 1
),
jan as (
  select sid, (ini at time zone 'America/Sao_Paulo') as ini_sp
  from s
  -- fora o lote migrado
  where not ((ini at time zone 'America/Sao_Paulo') >= '2026-06-10 20:00'
         and (ini at time zone 'America/Sao_Paulo') <  '2026-06-10 21:00')
),
ult as (   -- última fala DELA em cada conversa: é o que classifica a morte
  select distinct on (m.sid) m.sid, m.lc
  from m join jan j on j.sid = m.sid
  where m.tipo = 'ai' and m.lc <> ''
  order by m.sid, m.id desc
),
f as (
  select
    j.sid,
    date_trunc('week', j.ini_sp)::date                                as semana,
    count(*) filter (where m.tipo='human')                            as n_cli,
    bool_or(m.tipo='ai' and m.lc ~ 'r\$')                             as deu_preco,
    -- ordem por `id`: imune ao timestamp achatado do backfill
    min(case when m.tipo='ai'
              and m.lc ~ 'que dia|qual dia|melhor dia|que horas|qual hor[áa]rio'
             then m.id end)                                           as id_pergunta,
    min(case when m.tipo='human'
              and m.lc ~ '\m(amanh[ãa]|hoje|s[áa]bado|segunda|ter[çc]a|quarta|quinta|sexta|posso ir|vou passar)\M'
             then m.id end)                                           as id_data,
    -- sinal de compra COMPROMETIDO, com a negação excluída
    bool_or(m.tipo='human'
       and m.lc ~ '\m(vou querer|vou levar|pode separar|quero comprar|vou ficar com|quero fechar)\M'
       and m.lc !~ '\m(n[ãa]o|nem)\M[^.!?]{0,25}(vou querer|vou levar|pode separar|quero comprar)')
                                                                      as sinal_forte,
    bool_or(exists (select 1 from jsonb_array_elements(coalesce(m.tcs,'[]'::jsonb)) t
                    where t->>'name' = 'transfereHumano'))            as transferiu
  from jan j join m on m.sid = j.sid
  group by 1,2
),
q as (
  select f.*, u.lc as ultima_dela
  from f join ult u using (sid)
  where f.deu_preco and f.n_cli >= 5
)
select
  semana,
  count(*)                                                                    as sessoes,

  -- ⭐ A ALAVANCA. Baseline 24,6% na janela de 10-19/ago/2026.
  round(100.0 * count(*) filter (where id_pergunta is not null) / count(*), 1) as pct_ela_pergunta_o_dia,
  -- ⭐ O RESULTADO da alavanca. Baseline 20,5%.
  round(100.0 * count(*) filter (where id_data is not null) / count(*), 1)     as pct_cliente_da_data,
  -- Ela perguntou ANTES e o cliente respondeu com dia: o cenário que converte 14,9%.
  round(100.0 * count(*) filter (where id_pergunta is not null
                                   and id_data is not null
                                   and id_pergunta < id_data) / count(*), 1)   as pct_perguntou_e_funcionou,

  round(100.0 * count(*) filter (where transferiu) / count(*), 1)              as pct_transferiu,

  -- O vazamento em número absoluto: disse que ia comprar, não marcou dia,
  -- ninguém foi chamado. 53 na janela de 10-19/ago (R$ 239 mil cotados).
  count(*) filter (where sinal_forte and id_data is null and not transferiu)   as vazou,

  -- Os baldes de morte, pela última fala dela. Some A+C+E: é a conversa que
  -- termina com uma pergunta dela pendurada e ninguém acionado (131 de 390).
  count(*) filter (where not transferiu and ultima_dela ~
        'pode me (responder|mandar|dizer|confirmar|falar)( s[óo])?|s[óo] (me )?(confirma|responde|manda)|me manda s[óo]')
                                                                               as balde_a_micro_pergunta,
  count(*) filter (where not transferiu and ultima_dela ~
        'quer (dar uma )?(olhada|passada)|de pertinho|sem compromisso|te esperamos')
                                                                               as balde_c_convite_sem_dia,
  count(*) filter (where not transferiu and ultima_dela ~ '\?')                as balde_e_outra_pergunta
from q
group by 1
order by 1;
