-- ===========================================================================
-- COMISSAO POR DIA -- e o mes passa a fechar em BRT  (20/ago/2026)
--
-- Pedido do dono: na lista de "Minhas vendas" o numero que importa pra pessoa
-- nao e o valor da venda (um iPhone de R$7 mil no nome dela nao e dinheiro
-- dela) -- e o que aquilo virou de comissao, somado por dia, no formato do
-- "resumo do dia" da tela de Vendas.
--
-- ⚠️ POR QUE POR DIA E NAO POR VENDA. A comissao do atendente e 25% do LUCRO
-- de acessorio. Comissao por venda = lucro por venda = custo por item, que e
-- justamente o que o dono fechou em 17/ago ("a base e a soma do mes, agregada,
-- nao venda a venda"). Medido em jul+ago/2026 nos quatro atendentes:
--
--     por venda: 354 vendas com acessorio, 66 com UM item so  -> 19%
--     por dia:   124 dias  com acessorio,   6 com UM item so  -> 4,8%
--
-- "Um item so" e o caso em que a pessoa deriva o custo exato daquele acessorio
-- (custo = preco - lucro). Agrupar por dia divide a exposicao por 4 e ainda
-- responde a pergunta que ela faz ("quanto eu fiz hoje?").
--
-- ⚠️ E O MES VIRA BRT. `to_char(data_saida,'YYYY-MM')` usa UTC; a folha filtra
-- com toBRT() (core.js: "SEMPRE comparar datas em BRT"). Venda das 21h BRT cai
-- no dia seguinte em UTC -- e no primeiro dia do mes ela mudava de MES. Sao 6
-- vendas em toda a historia (1 com dono, abr/2026), mas e divergencia que so
-- aparece no fechamento, que e quando a pessoa confere contra o extrato.
-- Com o dia em BRT, a soma dos dias fecha com o mes por construcao.
-- ===========================================================================

-- -- Minhas vendas: + aparelhos e + acessorios POR VENDA ---------------------
-- Contagem de pecas e soma de PRECO. Nenhum custo: `acess_bruto` e o que a
-- pessoa vendeu, informacao que ela ja tem -- foi ela que passou no balcao.
create or replace view public.v_minhas_vendas as
select v.id, v.loja, v.data_saida, v.status,
       v.cliente_nome, v.cliente_tel, v.cliente_cidade,
       v.valor_total, v.desconto, v.qtd_produtos,
       v.upgrade_valor, v.upgrade_qtd,
       v.observacoes, v.vendedor_key, v.atendente_key,
       (v.vendedor_key  is not null and v.vendedor_key  = public.meu_vo_key()) is true as fui_vendedor,
       (v.atendente_key is not null and v.atendente_key = public.meu_at_key()) is true as fui_atendente,
       coalesce(i.aparelhos, 0)   as aparelhos,
       coalesce(i.acess_bruto, 0) as acess_bruto
  from public.vendas v
  left join lateral (
    select count(*) filter (where public.eh_principal(p.apple_id, p.imei_1, p.valor_estoque)) as aparelhos,
           coalesce(sum(p.preco) filter (where public.eh_acessorio(p.apple_id, p.imei_1, p.valor_estoque)), 0) as acess_bruto
      from public.venda_produtos p
     where p.venda_id = v.id
  ) i on true
 where (v.vendedor_key  is not null and v.vendedor_key  = public.meu_vo_key())
    or (v.atendente_key is not null and v.atendente_key = public.meu_at_key());

comment on view public.v_minhas_vendas is
  'Vendas do usuario logado (como vendedor OU atendente), sem custo e sem lucro. Ver docs/PERFIS-E-ACESSO.md.';

-- -- A base da comissao, por DIA ---------------------------------------------
-- Mesma conta de v_minha_comissao_mes, com `dia` em BRT no lugar do mes.
create or replace view public.v_minha_comissao_dia as
with minhas as (
  select v.id,
         (v.data_saida - interval '3 hours')::date as dia,
         (v.vendedor_key  is not null and v.vendedor_key  = public.meu_vo_key()) as sou_vendedor,
         (v.atendente_key is not null and v.atendente_key = public.meu_at_key()) as sou_atendente
    from public.vendas v
   where (v.vendedor_key  is not null and v.vendedor_key  = public.meu_vo_key())
      or (v.atendente_key is not null and v.atendente_key = public.meu_at_key())
), cab as (
  select dia,
         count(*) filter (where sou_vendedor)  as vendas_vendidas,
         count(*) filter (where sou_atendente) as vendas_atendidas
    from minhas group by dia
), itens as (
  select m.dia, m.id, m.sou_vendedor, m.sou_atendente,
         coalesce(p.preco, 0) as preco,
         coalesce(p.valor_estoque, 0) as custo,
         public.eh_principal(p.apple_id, p.imei_1, p.valor_estoque) as principal,
         public.eh_acessorio(p.apple_id, p.imei_1, p.valor_estoque) as acessorio
    from minhas m join public.venda_produtos p on p.venda_id = m.id
), agg as (
  select dia,
         count(*) filter (where sou_vendedor and principal) as aparelhos_vendidos,
         count(*) filter (where sou_atendente and acessorio) as acess_qtd,
         coalesce(sum(preco) filter (where sou_atendente and acessorio), 0) as acess_bruto,
         coalesce(sum(preco - custo) filter (where sou_atendente and acessorio), 0) as acess_lucro,
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

-- -- O mes passa a fechar em BRT, igual a folha -------------------------------
create or replace view public.v_minha_comissao_mes as
with minhas as (
  select v.id,
         to_char(v.data_saida - interval '3 hours', 'YYYY-MM') as mes,
         (v.vendedor_key  is not null and v.vendedor_key  = public.meu_vo_key()) as sou_vendedor,
         (v.atendente_key is not null and v.atendente_key = public.meu_at_key()) as sou_atendente
    from public.vendas v
   where (v.vendedor_key  is not null and v.vendedor_key  = public.meu_vo_key())
      or (v.atendente_key is not null and v.atendente_key = public.meu_at_key())
), cab as (
  select mes,
         count(*) filter (where sou_vendedor)  as vendas_vendidas,
         count(*) filter (where sou_atendente) as vendas_atendidas
    from minhas group by mes
), itens as (
  select m.mes, m.id, m.sou_vendedor, m.sou_atendente,
         coalesce(p.preco, 0) as preco,
         coalesce(p.valor_estoque, 0) as custo,
         public.eh_principal(p.apple_id, p.imei_1, p.valor_estoque) as principal,
         public.eh_acessorio(p.apple_id, p.imei_1, p.valor_estoque) as acessorio
    from minhas m join public.venda_produtos p on p.venda_id = m.id
), agg as (
  select mes,
         count(*) filter (where sou_vendedor and principal) as aparelhos_vendidos,
         count(*) filter (where sou_atendente and acessorio) as acess_qtd,
         coalesce(sum(preco) filter (where sou_atendente and acessorio), 0) as acess_bruto,
         coalesce(sum(preco - custo) filter (where sou_atendente and acessorio), 0) as acess_lucro,
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

-- -- A meta da rede tambem fecha em BRT ---------------------------------------
-- Ela decide a faixa do bonus coletivo, que a folha calcula em BRT.
create or replace view public.v_meta_rede_mes as
select to_char(v.data_saida - interval '3 hours', 'YYYY-MM') as mes,
       count(*) filter (where public.eh_principal(p.apple_id, p.imei_1, p.valor_estoque)) as aparelhos,
       coalesce(sum(p.preco) filter (where public.eh_acessorio(p.apple_id, p.imei_1, p.valor_estoque)), 0) as acess_bruto
  from public.vendas v join public.venda_produtos p on p.venda_id = v.id
 where public.tem_perfil()
 group by 1;

revoke all on public.v_minhas_vendas, public.v_minha_comissao_dia,
              public.v_minha_comissao_mes, public.v_meta_rede_mes from public, anon;
grant select on public.v_minhas_vendas, public.v_minha_comissao_dia,
                public.v_minha_comissao_mes, public.v_meta_rede_mes to authenticated;
