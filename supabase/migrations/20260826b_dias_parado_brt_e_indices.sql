-- ===========================================================================
-- REVISAO DO MESMO DIA: o dia de prateleira estava em UTC e custava caro
--
-- Duas coisas achadas conferindo o que subiu horas antes:
--
-- 1. FUSO. O servidor roda em UTC (`current_setting('TimeZone')` = UTC). Entre
--    21h e meia-noite BRT o `current_date` do banco JA E O DIA SEGUINTE: um
--    aparelho de 59 dias aparecia com 60 (e ganhava selo) durante 3 horas por
--    dia. Vale pra v_estoque_margem tambem, que alimenta o CARREGO da margem
--    real -- 0,1% ao dia sobre o custo. As duas passam a contar em BRT, igual
--    ao resto do projeto (ver 20260820_comissao_por_dia_e_brt.sql).
--
-- 2. CUSTO. A primeira versao agregava `compra_produtos` (3.742), `compras`
--    (1.635), `venda_trocas` (1.216) e `vendas` (4.975) INTEIROS pra descobrir a
--    entrada de 232 aparelhos: 197 ms, crescendo com o historico. Com LATERAL +
--    indice por apple_id, sao 232 buscas indexadas: 47 ms, e agora cresce com o
--    ESTOQUE, nao com o historico. A Vitrine e a tela que o vendedor abre com o
--    cliente na frente -- e o Vitinho carrega a mesma view.
--
-- ⚠️ A SEMANTICA NAO MUDOU e isso foi conferido linha a linha: `coalesce(compra,
-- troca)` -- compra manda, troca so quando nao ha compra. NAO e `greatest()`: a
-- data mais recente daria outro numero, e o objetivo declarado e que Vitrine e
-- margem real digam o MESMO dia do MESMO aparelho. Conferido nos 232: zero
-- divergencia.
-- ===========================================================================

create index if not exists compra_produtos_apple_idx on public.compra_produtos (apple_id) where apple_id is not null;
create index if not exists venda_trocas_apple_idx    on public.venda_trocas   (apple_id) where apple_id is not null;

create or replace view public.v_estoque_vitrine as
select e.id, e.titulo, e.serial, e.imei_1, e.bateria, e.preco_varejo, e.status,
       e.observacoes, e.created_at,
       (exists (select 1 from public.bancada b
                 where b.apple_id = e.id and b.voltou_em is null)) as na_assistencia,
       (select s.estado from public.estoque_estado s where s.apple_id = e.id) as estado,
       (select s.obs    from public.estoque_estado s where s.apple_id = e.id) as estado_obs,
       ent.entrou_em,
       ((now() at time zone 'America/Sao_Paulo')::date - ent.entrou_em) as dias_parado
  from public.estoque e
  left join lateral (
    select coalesce(
      (select max(c.data_entrada)::date
         from public.compra_produtos cp join public.compras c on c.id = cp.compra_id
        where cp.apple_id = e.id),
      (select max(v.data_saida)::date
         from public.venda_trocas t join public.vendas v on v.id = t.venda_id
        where t.apple_id = e.id)
    ) as entrou_em
  ) ent on true
 where public.tem_perfil() and e.status = 'available';

create or replace view public.v_estoque_margem as
select e.id as apple_id,
       ent.entrou_em,
       ent.origem_entrada,
       ((now() at time zone 'America/Sao_Paulo')::date - ent.entrou_em) as dias_parado,
       coalesce((select round(sum(r.valor_liquido), 2) from public.reparos r
                  where r.apple_id = e.id), 0::numeric) as reparo
  from public.estoque e
  left join lateral (
    select coalesce(cp.entrou, pt.entrou) as entrou_em,
           case when cp.entrou is not null then 'compra'
                when pt.entrou is not null then 'troca' end as origem_entrada
      from (select (select max(c.data_entrada)::date
                      from public.compra_produtos cp2 join public.compras c on c.id = cp2.compra_id
                     where cp2.apple_id = e.id) as entrou) cp,
           (select (select max(v.data_saida)::date
                      from public.venda_trocas t join public.vendas v on v.id = t.venda_id
                     where t.apple_id = e.id) as entrou) pt
  ) ent on true
 where public.eh_socio() and e.status = 'available';

-- ⚠️ `from anon, authenticated` -- nunca `public, anon`. View gravavel e bypass
-- de RLS; `create or replace` preserva grants, mas o revoke fica aqui como rede.
revoke all on public.v_estoque_vitrine, public.v_estoque_margem from anon, authenticated;
grant select on public.v_estoque_vitrine, public.v_estoque_margem to authenticated;
