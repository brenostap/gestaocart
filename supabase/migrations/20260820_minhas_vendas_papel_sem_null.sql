-- ===========================================================================
-- fui_vendedor / fui_atendente: null = null NAO e "fui eu"  (20/ago/2026)
--
-- `is not distinct from` trata NULL como valor. Pra quem tem `vo_key` nulo
-- (todo atendente puro) e pra venda com `vendedor_key` nulo (~5% das vendas
-- nao tem dono identificado), a comparacao dava TRUE -- e a tela do hibrido
-- (hoje so a Maria) rotularia "Vendi · Atendi" numa venda que ela so atendeu.
--
-- O WHERE da view ja exigia `is not null`; so as duas colunas de ROTULO tinham
-- ficado com a forma frouxa. `IS TRUE` no fim devolve boolean, nunca null.
--
-- Achado ao preparar a entrada dos 4 atendentes de loja: eles nao tem vo_key,
-- entao seriam os primeiros a cair no caso -- e a tela nem mostra o rotulo pra
-- quem tem uma chave so, o que teria escondido o erro por mais um tempo.
-- ===========================================================================
create or replace view public.v_minhas_vendas as
select v.id, v.loja, v.data_saida, v.status,
       v.cliente_nome, v.cliente_tel, v.cliente_cidade,
       v.valor_total, v.desconto, v.qtd_produtos,
       v.upgrade_valor, v.upgrade_qtd,
       v.observacoes, v.vendedor_key, v.atendente_key,
       (v.vendedor_key  is not null and v.vendedor_key  = public.meu_vo_key()) is true as fui_vendedor,
       (v.atendente_key is not null and v.atendente_key = public.meu_at_key()) is true as fui_atendente
  from public.vendas v
 where (v.vendedor_key  is not null and v.vendedor_key  = public.meu_vo_key())
    or (v.atendente_key is not null and v.atendente_key = public.meu_at_key());

comment on view public.v_minhas_vendas is
  'Vendas do usuario logado (como vendedor OU atendente), sem custo e sem lucro. Ver docs/PERFIS-E-ACESSO.md.';

revoke all on public.v_minhas_vendas from public, anon;
grant select on public.v_minhas_vendas to authenticated;

-- Conferido em 20/ago/2026 simulando a Maria (unica com as duas chaves):
--   84 vendas · 81 "vendi" · 7 "atendi" · 4 nas duas pontas
