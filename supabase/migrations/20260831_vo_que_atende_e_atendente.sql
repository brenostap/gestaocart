-- ===========================================================================
-- VENDEDOR ONLINE QUE ATENDE DIRETO E ATENDENTE  (31/ago/2026, decisao do dono)
--
-- Venda em que Isa ou Mel aparecem no campo ATENDENTE e venda direta: elas
-- atenderam. Ate aqui o nome nao casava com a lista de atendentes e o lucro de
-- acessorio dessas vendas nao ia pra ninguem -- 7 vendas em ago/2026, ~R$33 mil
-- em valor. A Maria ja era assim desde jun/2026; isto estende a mesma regra
-- pros outros tres vendedores online.
--
-- ⚠️ A ISENCAO TEM DATA: vale de 2026-08 em diante, igual lucro_acess_comissao.
-- abr–jul ja foram pagos; aplicar pra tras mudaria fechamento fechado (+R$130
-- em abr, +R$35 em jun, −R$7 em jul, medidos no banco em 31/08).
--
-- ⚠️ Espelho no JS: VO_ATENDE_KEYS / VO_ATENDE_DESDE / atKeysVigentes() em
-- js/core.js. Divergir aqui nao quebra tela: o painel do socio e a tela da
-- propria pessoa passam a mostrar comissoes diferentes, calado.
-- test/atendente-vigencia.test.js prova o lado JS.
-- ===========================================================================

create or replace function public.at_key_vigente(p_chave text, p_mes text)
returns boolean language sql immutable as $$
  select case
    when p_chave = any (array['david','isa','mel'])   -- VO_ATENDE_KEYS
      then coalesce(p_mes,'9999-99') >= '2026-08'     -- VO_ATENDE_DESDE
    else true
  end;
$$;

comment on function public.at_key_vigente is
  'Esta chave conta como ATENDENTE neste mes (YYYY-MM)? Espelho de atKeysVigentes() em js/core.js.';

-- -- Por DIA -----------------------------------------------------------------
create or replace view public.v_minha_comissao_dia as
with minhas as (
  select v.id,
         (v.data_saida - interval '3 hours')::date as dia,
         (v.vendedor_key  is not null and v.vendedor_key  = public.meu_vo_key()) as sou_vendedor,
         (v.atendente_key is not null and v.atendente_key = public.meu_at_key()
          and public.at_key_vigente(v.atendente_key,
                to_char(v.data_saida - interval '3 hours', 'YYYY-MM'))) as sou_atendente
    from public.vendas v
   where (v.vendedor_key  is not null and v.vendedor_key  = public.meu_vo_key())
      or (v.atendente_key is not null and v.atendente_key = public.meu_at_key()
          and public.at_key_vigente(v.atendente_key,
                to_char(v.data_saida - interval '3 hours', 'YYYY-MM')))
), cab as (
  select dia,
         count(*) filter (where sou_vendedor)  as vendas_vendidas,
         count(*) filter (where sou_atendente) as vendas_atendidas
    from minhas group by dia
), itens as (
  select m.dia, m.id, m.sou_vendedor, m.sou_atendente,
         coalesce(p.preco, 0) as preco,
         public.lucro_acess_comissao(p.preco, p.valor_estoque, to_char(m.dia::timestamptz, 'YYYY-MM')) as lucro_com,
         public.eh_principal(p.apple_id, p.imei_1, p.valor_estoque) as principal,
         public.eh_acessorio(p.apple_id, p.imei_1, p.valor_estoque) as acessorio
    from minhas m join public.venda_produtos p on p.venda_id = m.id
), agg as (
  select dia,
         count(*) filter (where sou_vendedor and principal) as aparelhos_vendidos,
         count(*) filter (where sou_atendente and acessorio) as acess_qtd,
         coalesce(sum(preco)     filter (where sou_atendente and acessorio), 0) as acess_bruto,
         coalesce(sum(lucro_com) filter (where sou_atendente and acessorio), 0) as acess_lucro,
         count(distinct id) filter (where sou_atendente and acessorio) as vendas_com_acessorio
    from itens group by dia
)
select c.dia, c.vendas_vendidas,
       coalesce(a.aparelhos_vendidos, 0)   as aparelhos_vendidos,
       c.vendas_atendidas,
       coalesce(a.vendas_com_acessorio, 0) as vendas_com_acessorio,
       coalesce(a.acess_qtd, 0)            as acess_qtd,
       coalesce(a.acess_bruto, 0)          as acess_bruto,
       coalesce(a.acess_lucro, 0)          as acess_lucro
  from cab c left join agg a using (dia);

comment on view public.v_minha_comissao_dia is
  'A base da comissao do usuario logado, por DIA (BRT). Agregada: nunca item a item. Ver docs/PERFIS-E-ACESSO.md.';

-- -- Por MES -----------------------------------------------------------------
create or replace view public.v_minha_comissao_mes as
with minhas as (
  select v.id,
         to_char(v.data_saida - interval '3 hours', 'YYYY-MM') as mes,
         (v.vendedor_key  is not null and v.vendedor_key  = public.meu_vo_key()) as sou_vendedor,
         (v.atendente_key is not null and v.atendente_key = public.meu_at_key()
          and public.at_key_vigente(v.atendente_key,
                to_char(v.data_saida - interval '3 hours', 'YYYY-MM'))) as sou_atendente
    from public.vendas v
   where (v.vendedor_key  is not null and v.vendedor_key  = public.meu_vo_key())
      or (v.atendente_key is not null and v.atendente_key = public.meu_at_key()
          and public.at_key_vigente(v.atendente_key,
                to_char(v.data_saida - interval '3 hours', 'YYYY-MM')))
), cab as (
  select mes,
         count(*) filter (where sou_vendedor)  as vendas_vendidas,
         count(*) filter (where sou_atendente) as vendas_atendidas
    from minhas group by mes
), itens as (
  select m.mes, m.id, m.sou_vendedor, m.sou_atendente,
         coalesce(p.preco, 0) as preco,
         public.lucro_acess_comissao(p.preco, p.valor_estoque, m.mes) as lucro_com,
         public.eh_principal(p.apple_id, p.imei_1, p.valor_estoque) as principal,
         public.eh_acessorio(p.apple_id, p.imei_1, p.valor_estoque) as acessorio
    from minhas m join public.venda_produtos p on p.venda_id = m.id
), agg as (
  select mes,
         count(*) filter (where sou_vendedor and principal) as aparelhos_vendidos,
         count(*) filter (where sou_atendente and acessorio) as acess_qtd,
         coalesce(sum(preco)     filter (where sou_atendente and acessorio), 0) as acess_bruto,
         coalesce(sum(lucro_com) filter (where sou_atendente and acessorio), 0) as acess_lucro,
         count(distinct id) filter (where sou_atendente and acessorio) as vendas_com_acessorio
    from itens group by mes
)
select c.mes, c.vendas_vendidas,
       coalesce(a.aparelhos_vendidos, 0)   as aparelhos_vendidos,
       c.vendas_atendidas,
       coalesce(a.vendas_com_acessorio, 0) as vendas_com_acessorio,
       coalesce(a.acess_qtd, 0)            as acess_qtd,
       coalesce(a.acess_bruto, 0)          as acess_bruto,
       coalesce(a.acess_lucro, 0)          as acess_lucro
  from cab c left join agg a using (mes);

comment on view public.v_minha_comissao_mes is
  'A base da comissao do usuario logado, por MES (BRT). Agregada: nunca item a item. Ver docs/PERFIS-E-ACESSO.md.';

-- ⚠️ View nao tem RLS e roda com os direitos do dono: view gravavel e bypass.
-- `create or replace` preserva o ACL, mas repetimos por disciplina -- nunca
-- deixar `anon` nem `public` alcancar.
revoke all on public.v_minha_comissao_dia, public.v_minha_comissao_mes from public, anon;
grant select on public.v_minha_comissao_dia, public.v_minha_comissao_mes to authenticated;
