-- ===========================================================================
-- BRINDE NAO DESCONTA DA COMISSAO  (20/ago/2026, decisao do dono)
--
-- Acessorio entregue com preco 0 e custo > 0 (o "FONE AIRDOTS" de R$11,63 que
-- vai junto pra fechar a venda). Como a comissao do atendente e 25% do LUCRO,
-- o brinde vinha DESCONTANDO de quem entregou -- calado, ate a tela por dia
-- fazer aparecer um dia de "-R$3". Em ago/2026 foram 169 brindes: R$85 da
-- Anne, R$73 do Vitinho, R$53 da Gabi, R$34 do Leo.
--
-- Quem da o brinde e quem fecha a venda. O custo continua da LOJA (o resultado
-- do mes conta ele inteiro); ele so sai da conta de quem recebe.
--
-- ⚠️ Espelho no JS: ehBrinde() / lucroAcessComissao() em js/core.js.
-- Divergir aqui nao quebra tela: paga comissao errada, calada.
-- test/regra-acessorio.test.js prova que os dois concordam.
--
-- ⚠️ A CLASSIFICACAO do item NAO muda: brinde continua sendo acessorio
-- (eh_acessorio), continua contando no attach rate e em acess_qtd. So o
-- dinheiro muda.
--
-- O corpo aplicado esta na migration remota de mesmo nome (as duas views da
-- comissao passaram a somar lucro_acess_comissao no lugar de preco - custo).
-- ===========================================================================

create or replace function public.eh_brinde(p_preco numeric, p_valor numeric)
returns boolean language sql immutable as $$
  select coalesce(p_preco,0) = 0 and coalesce(p_valor,0) > 0;
$$;

comment on function public.eh_brinde is
  'Acessorio entregue de graca (preco 0, custo > 0). Espelho de ehBrinde() em js/core.js.';

-- ⚠️ A ISENCAO TEM DATA: vale de 2026-08 em diante. Regra de comissao sem data
-- reescreve mes JA PAGO -- e a mesma licao das faixas de meta (metaAtFaixas).
-- Medido em 20/ago: aplicar pra tras daria +R$336 em jul/2026 e +R$537 em
-- jun/2026. Espelho do BRINDE_ISENTO_DESDE de js/core.js.
create or replace function public.lucro_acess_comissao(p_preco numeric, p_valor numeric, p_mes text)
returns numeric language sql immutable as $$
  select case when coalesce(p_mes,'9999-99') >= '2026-08' and public.eh_brinde(p_preco, p_valor)
              then 0
              else coalesce(p_preco,0) - coalesce(p_valor,0) end;
$$;

comment on function public.lucro_acess_comissao(numeric, numeric, text) is
  'Lucro de acessorio que forma comissao. Brinde vale 0 a partir de 2026-08. Espelho de lucroAcessComissao() em js/core.js.';

-- v_minha_comissao_dia e v_minha_comissao_mes: `acess_lucro` passa a somar
-- public.lucro_acess_comissao(p.preco, p.valor_estoque). Definicao completa em
-- 20260820_comissao_por_dia_e_brt.sql, com essa unica troca.
