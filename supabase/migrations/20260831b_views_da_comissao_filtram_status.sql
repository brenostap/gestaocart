-- ===========================================================================
-- AS VIEWS DA COMISSAO PRECISAM FILTRAR STATUS  (31/ago/2026)
--
-- `filterByPeriod()` (js/render.js) NUNCA conta venda `canceled` e, por padrao,
-- tambem nao conta `pending` -- e e ela que alimenta o dashboard, a tela de
-- Equipe e a folha exportada. As views do banco nao filtravam status NENHUM.
--
-- O resultado, medido em 31/08 com 14 vendas pendentes no mes:
--   Dashboard do socio ...... 359 aparelhos · R$33.630 de acessorio
--   "Meu dia" do colaborador  373 aparelhos · R$34.980
-- A MESMA meta coletiva, dois numeros. E a comissao propria da pessoa contava
-- venda pendente e cancelada como dela -- sem nada na tela dizendo isso.
--
-- Espelha o JS ao pe da letra: `status not in ('canceled','pending')`, e nao
-- `= 'completed'`. Sao equivalentes hoje (so existem esses tres status), mas se
-- a FoneNinja criar um quarto, o JS passa a conta-lo e o SQL tambem -- em vez
-- de os dois divergirem de novo, calados.
--
-- ⚠️ Isto NAO e mudanca de regra e nao tem vigencia: e a mesma regra que a
-- folha sempre aplicou. O que muda e a tela da pessoa parar de mostrar um
-- numero que a folha nunca pagou.
-- ===========================================================================

create or replace function public.venda_conta(p_status text)
returns boolean language sql immutable as $$
  select coalesce(p_status,'') not in ('canceled','pending');
$$;

comment on function public.venda_conta is
  'A venda entra na conta de dinheiro? Espelho de filterByPeriod() em js/render.js.';

-- -- Meta coletiva da rede ----------------------------------------------------
create or replace view public.v_meta_rede_mes as
select to_char(v.data_saida - interval '3 hours', 'YYYY-MM') as mes,
       count(*) filter (where public.eh_principal(p.apple_id, p.imei_1, p.valor_estoque)) as aparelhos,
       coalesce(sum(p.preco) filter (where public.eh_acessorio(p.apple_id, p.imei_1, p.valor_estoque)), 0) as acess_bruto
  from public.vendas v join public.venda_produtos p on p.venda_id = v.id
 where public.tem_perfil() and public.venda_conta(v.status)
 group by 1;

comment on view public.v_meta_rede_mes is
  'Aparelhos e acessorios da REDE por mes (BRT), so vendas que contam. Decide a faixa do bonus coletivo.';

-- -- A minha lista de vendas --------------------------------------------------
create or replace view public.v_minhas_vendas as
select v.id, v.loja, v.data_saida, v.status, v.cliente_nome, v.cliente_tel,
       v.cliente_cidade, v.valor_total, v.desconto, v.qtd_produtos,
       v.upgrade_valor, v.upgrade_qtd, v.observacoes, v.vendedor_key, v.atendente_key,
       (v.vendedor_key  is not null and v.vendedor_key  = public.meu_vo_key())  is true as fui_vendedor,
       (v.atendente_key is not null and v.atendente_key = public.meu_at_key()
        and public.at_key_vigente(v.atendente_key,
              to_char(v.data_saida - interval '3 hours','YYYY-MM')))            is true as fui_atendente,
       coalesce(i.aparelhos, 0)   as aparelhos,
       coalesce(i.acess_bruto, 0) as acess_bruto
  from public.vendas v
  left join lateral (
    select count(*) filter (where public.eh_principal(p.apple_id, p.imei_1, p.valor_estoque)) as aparelhos,
           coalesce(sum(p.preco) filter (where public.eh_acessorio(p.apple_id, p.imei_1, p.valor_estoque)), 0) as acess_bruto
      from public.venda_produtos p where p.venda_id = v.id) i on true
 where public.venda_conta(v.status)
   and ( (v.vendedor_key  is not null and v.vendedor_key  = public.meu_vo_key())
      or (v.atendente_key is not null and v.atendente_key = public.meu_at_key()
          and public.at_key_vigente(v.atendente_key,
                to_char(v.data_saida - interval '3 hours','YYYY-MM'))) );

comment on view public.v_minhas_vendas is
  'As vendas do usuario logado -- so as que contam (nem cancelada, nem pendente). Sem custo, sem lucro.';

-- -- A base da comissao, por dia e por mes ------------------------------------
create or replace view public.v_minha_comissao_dia as
with minhas as (
  select v.id,
         (v.data_saida - interval '3 hours')::date as dia,
         (v.vendedor_key  is not null and v.vendedor_key  = public.meu_vo_key()) as sou_vendedor,
         (v.atendente_key is not null and v.atendente_key = public.meu_at_key()
          and public.at_key_vigente(v.atendente_key,
                to_char(v.data_saida - interval '3 hours', 'YYYY-MM'))) as sou_atendente
    from public.vendas v
   where public.venda_conta(v.status)
     and ( (v.vendedor_key  is not null and v.vendedor_key  = public.meu_vo_key())
        or (v.atendente_key is not null and v.atendente_key = public.meu_at_key()
            and public.at_key_vigente(v.atendente_key,
                  to_char(v.data_saida - interval '3 hours', 'YYYY-MM'))) )
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

create or replace view public.v_minha_comissao_mes as
with minhas as (
  select v.id,
         to_char(v.data_saida - interval '3 hours', 'YYYY-MM') as mes,
         (v.vendedor_key  is not null and v.vendedor_key  = public.meu_vo_key()) as sou_vendedor,
         (v.atendente_key is not null and v.atendente_key = public.meu_at_key()
          and public.at_key_vigente(v.atendente_key,
                to_char(v.data_saida - interval '3 hours', 'YYYY-MM'))) as sou_atendente
    from public.vendas v
   where public.venda_conta(v.status)
     and ( (v.vendedor_key  is not null and v.vendedor_key  = public.meu_vo_key())
        or (v.atendente_key is not null and v.atendente_key = public.meu_at_key()
            and public.at_key_vigente(v.atendente_key,
                  to_char(v.data_saida - interval '3 hours', 'YYYY-MM'))) )
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
revoke all on public.v_minhas_vendas, public.v_minha_comissao_dia,
              public.v_minha_comissao_mes, public.v_meta_rede_mes from public, anon;
grant select on public.v_minhas_vendas, public.v_minha_comissao_dia,
                public.v_minha_comissao_mes, public.v_meta_rede_mes to authenticated;
