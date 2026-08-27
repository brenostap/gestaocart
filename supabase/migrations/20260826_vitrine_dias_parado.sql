-- ===========================================================================
-- DIA DE PRATELEIRA NA VITRINE
--
-- O documento da funcao de midias (docs/funcoes/midias-e-conteudo.md, §10)
-- cobra do responsavel: "quais aparelhos estao parados e precisam de
-- visibilidade?". A resposta existe no banco e NAO chegava nele:
--
--   `dias_parado` mora em `v_estoque_margem`, que e where eh_socio()
--   `estoque.created_at` esta VAZIO em 100% dos itens -- nao serve nem de proxy
--
-- Medido em 26/ago/2026: dos 232 disponiveis, media 29 dias, mas 25 passam de
-- 60 dias (R$56.100 de custo parado) e 15 passam de 90. Com o carrego de 0,1%
-- ao dia (CUSTO_CAPITAL_MES = 3%), 60 dias comem ~6% do custo do aparelho.
--
-- ⚠️ POR QUE ISTO NAO FERE A REGRA DE "colaborador nao ve custo": dia de
-- prateleira e TEMPO, nao dinheiro. Ele diz o que empurrar primeiro sem dizer
-- quanto o aparelho custou. `valor_estoque` e `ultimo_fornecedor` continuam
-- fora da view, como sempre estiveram.
--
-- A conta de entrada e a MESMA de v_estoque_margem (compra ou troca, a mais
-- recente). Se as duas divergirem, o dono e o vendedor discutem numeros
-- diferentes do mesmo aparelho -- por isso a logica esta escrita igual aqui.
-- ===========================================================================

-- create or replace: as colunas antigas ficam na MESMA ordem e as duas novas
-- entram no fim. Assim os grants sobrevivem e o front antigo (que le por nome)
-- continua funcionando enquanto o deploy nao sobe.
create or replace view public.v_estoque_vitrine as
with por_compra as (
  select cp.apple_id, max(c.data_entrada)::date as entrou
    from public.compra_produtos cp
    join public.compras c on c.id = cp.compra_id
   where cp.apple_id is not null
   group by cp.apple_id
), por_troca as (
  select t.apple_id, max(v.data_saida)::date as entrou
    from public.venda_trocas t
    join public.vendas v on v.id = t.venda_id
   where t.apple_id is not null
   group by t.apple_id
)
select e.id,
       e.titulo,
       e.serial,
       e.imei_1,
       e.bateria,
       e.preco_varejo,
       e.status,
       e.observacoes,
       e.created_at,
       (exists (select 1 from public.bancada b
                 where b.apple_id = e.id and b.voltou_em is null)) as na_assistencia,
       (select s.estado from public.estoque_estado s where s.apple_id = e.id) as estado,
       (select s.obs    from public.estoque_estado s where s.apple_id = e.id) as estado_obs,
       coalesce(pc.entrou, pt.entrou)                        as entrou_em,
       current_date - coalesce(pc.entrou, pt.entrou)         as dias_parado
  from public.estoque e
  left join por_compra pc on pc.apple_id = e.id
  left join por_troca  pt on pt.apple_id = e.id
 where public.tem_perfil() and e.status = 'available';

comment on view public.v_estoque_vitrine is
  'Estoque disponivel para quem vende. Sem valor_estoque e sem fornecedor. Traz os selos (assistencia, estado) e o dia de prateleira -- tempo, nao dinheiro.';

revoke all on public.v_estoque_vitrine from public, anon;
grant select on public.v_estoque_vitrine to authenticated;
