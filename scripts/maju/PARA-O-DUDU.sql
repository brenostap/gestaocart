-- ===========================================================================
-- Para o Dudu rodar no projeto supabase-cart (cmzptavlhdfklpfdcynf).
--
-- O quê: cria uma função que devolve as métricas semanais do atendimento da
-- Maju, já agregadas. O painel do Breno chama ela uma vez por semana e guarda
-- o resultado.
--
-- Por quê assim: as conversas ficam no seu projeto e o painel fica no dele.
-- Em vez de dar acesso às tabelas (161 mil mensagens, telefone de cliente),
-- esta função devolve **~10 linhas de número agregado** e nada mais. Nenhuma
-- conversa, nenhum telefone, nenhum nome atravessa a fronteira.
--
-- O que ele precisa depois: uma chave de leitura que consiga chamar
-- SÓ esta função. Se preferir, dá pra restringir por role própria.
-- ===========================================================================

create or replace function public.maju_metricas_semanais()
returns table (
  semana                    date,
  sessoes                   integer,
  pct_escalou               numeric,
  escala_se_deu_data        numeric,
  escala_se_so_quis_comprar numeric,
  vazou                     integer
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with sess as (
    select
      replace(session_id, '-cart', '')                    as tel,
      date_trunc('week', min(created_at))::date           as semana,
      count(*) filter (where message->>'type' = 'human')  as msgs_cliente,
      bool_or(message->>'type' = 'ai'
              and message->>'content' ~ 'R\$')            as deu_preco,
      -- `quero` sozinho não serve: pega "quero saber o preço" (62% das
      -- conversas). E a forma positiva pega negação: "eu NÃO vou querer
      -- comprar não" — daí o segundo filtro.
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
    j.semana,
    count(*)::integer,
    round(100.0 * count(*) filter (where escalou) / count(*), 1),
    round(100.0 * count(*) filter (where falou_dia and escalou)
          / nullif(count(*) filter (where falou_dia), 0), 1),
    round(100.0 * count(*) filter (where sinal_compra and not falou_dia and escalou)
          / nullif(count(*) filter (where sinal_compra and not falou_dia), 0), 1),
    (count(*) filter (where sinal_compra and not falou_dia and not escalou))::integer
  from j
  group by j.semana
  order by j.semana;
$function$;

-- Só leitura, e só desta função.
revoke all on function public.maju_metricas_semanais() from public, anon;
grant execute on function public.maju_metricas_semanais() to authenticated;

-- Conferir:  select * from public.maju_metricas_semanais();
