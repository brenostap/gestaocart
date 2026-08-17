-- ===========================================================================
-- MARGEM REAL -- os dois pedacos que o painel nao tinha
--
-- CONTEXT.md: a "margem" que o painel mostra e so `preco - custo de aquisicao`.
-- Faltam carrego, reparo e taxa de cartao -- R$250 a 600 por aparelho, pesando
-- MAIS nos modelos lentos. Decidir compra pela margem bruta INVERTE a decisao.
--
-- Esta view entrega o que so o banco sabe:
--   entrou_em  -> pra contar dias parado (o carrego e custo x dias x taxa)
--   reparo     -> o que ja foi gasto neste aparelho
--
-- A taxa de cartao NAO vem daqui: ela e medida no front a partir dos pagamentos
-- reais que o socio ja carrega (taxaCartaoEfetiva() em js/core.js). Constante
-- chutada envelhece -- em ago/2026 o custo liquido caiu de 3,70% pra 1,92% com
-- a virada do credito pro PicPay, e uma constante teria mentido pra MAIS, que e
-- o lado que trava compra boa.
--
-- ⚠️ E `taxa - taxa_extra`, nao `taxa`: taxa_extra e juro repassado ao cliente,
-- ou seja GANHO da loja. Usar a taxa cheia inflaria o custo em quase metade.
--
-- ⚠️ `estoque.created_at` esta NULO em 100% dos itens disponiveis (215 de 215,
-- medido em 17/ago/2026). Por isso a data de entrada e reconstruida de duas
-- fontes, e as duas juntas cobrem 100%:
--    131 via compra_produtos -> compras.data_entrada
--     84 via venda_trocas    -> vendas.data_saida  (entrou como troca)
--
-- ⚠️ So socio. `reparos` e dinheiro de custo, e a view carrega valor.
create or replace view public.v_estoque_margem as
with por_compra as (
  select cp.apple_id, max(c.data_entrada)::date as entrou
    from public.compra_produtos cp
    join public.compras c on c.id = cp.compra_id
   where cp.apple_id is not null
   group by 1),
por_troca as (
  select t.apple_id, max(v.data_saida)::date as entrou
    from public.venda_trocas t
    join public.vendas v on v.id = t.venda_id
   where t.apple_id is not null
   group by 1),
rep as (
  select apple_id, round(sum(valor_liquido), 2) as reparo
    from public.reparos where apple_id is not null group by 1)
select e.id as apple_id,
       coalesce(pc.entrou, pt.entrou) as entrou_em,
       case when pc.entrou is not null then 'compra'
            when pt.entrou is not null then 'troca' end as origem_entrada,
       (current_date - coalesce(pc.entrou, pt.entrou)) as dias_parado,
       coalesce(r.reparo, 0) as reparo
  from public.estoque e
  left join por_compra pc on pc.apple_id = e.id
  left join por_troca  pt on pt.apple_id = e.id
  left join rep r on r.apple_id = e.id
 where public.eh_socio() and e.status = 'available';

comment on view public.v_estoque_margem is
  'Dias parado e reparo por aparelho disponivel, para a margem real. So socio. estoque.created_at e nulo em 100% dos itens -- a entrada vem de compras ou de venda_trocas.';

revoke all on public.v_estoque_margem from public, anon;
grant select on public.v_estoque_margem to authenticated;

-- ===========================================================================
-- O ESTOQUE DE HOJE (17/ago/2026, medido simulando o socio)
--
--   capital parado ................. R$ 479.305
--   carrego JA acumulado ........... R$  11.013
--   reparo ja gasto nesses 215 ..... R$  11.266
--   dias de prateleira (media) ..... 23
--   parados ha mais de 60 dias ..... 15 aparelhos, R$ 4.400 de carrego
--
-- Custo liquido de cartao medido: 3,38% (jun) · 3,70% (jul) · 1,92% (ago).
-- ===========================================================================
