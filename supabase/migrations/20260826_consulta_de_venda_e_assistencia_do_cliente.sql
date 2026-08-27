-- ===========================================================================
-- AS DUAS PERGUNTAS DO POS-VENDA
--
-- docs/funcoes/coordenadora-pos-venda.md pede duas coisas que o painel nao
-- respondia pra quem nao e socio:
--
--   §2/§3  "consultar as informacoes da venda ANTES de dar uma orientacao"
--   §6/§9  "onde esta o aparelho do cliente e quando ele volta"
--
-- A primeira mora em `vendas`/`venda_produtos`, fechadas em eh_socio(). A
-- segunda mora em `bancada`, fechada em pode_operar(). A Maria e `comercial`:
-- nao le nenhuma das tres. Ela ve so as PROPRIAS vendas (v_minhas_vendas), e
-- pos-venda e sobre a venda dos outros.
--
-- ⚠️ ISTO AMPLIA O ACESSO, DE PROPOSITO E COM LIMITE.
-- Ate aqui o papel `comercial` so enxergava linha que era dele. Estas views
-- entregam QUALQUER venda a QUALQUER perfil comercial -- inclusive nome e
-- telefone do cliente. E o preco de ter pos-venda: quem atende um problema
-- precisa achar a venda de quem esta na frente dele. O que continua fora:
--
--   custo_total · lucro · recebimento_total · recebimento_liquido   (venda)
--   valor_estoque                                                   (item)
--   valor_previsto · valor_cobrado                                  (assistencia)
--
-- Ou seja: ganha-se "de quem foi essa venda e o que ela levou", nunca "quanto
-- a loja ganhou nela". A regra dos quatro interruptores continua de pe --
-- podeVerValor() sim, podeVerMargem() nao, podeVerCustoServico() nao.
--
-- `bancada` NAO ganhou policy nova. Nenhuma tabela ganhou. Como sempre neste
-- projeto: papel sem margem nao toca tabela, le view.
--
-- ⚠️ REVOKE E DE `anon, authenticated` -- NAO de `public, anon`. O Supabase
-- concede ALL em objeto novo do schema public pra `authenticated` por DEFAULT
-- PRIVILEGE, e `public` nao alcanca esse grant. View nao tem RLS e roda com os
-- direitos do DONO: uma view gravavel e um bypass de RLS com a chave do dono na
-- fechadura. Ja aconteceu -- ver 20260820_view_nao_escreve.sql -- e aconteceu de
-- novo aqui, na primeira escrita desta migration, pego na conferencia dos grants.
-- ===========================================================================

-- Quem alcanca a consulta: socio e comercial. `bancada` fica fora de proposito
-- -- o Vitinho nao entra em VE_VALOR, e valor de venda e exatamente o que estas
-- views carregam. Ele ja tem a tela de Assistencia inteira, com mais dados.
create or replace function public.pode_consultar_venda()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.papel_do_usuario() in ('socio', 'comercial');
$$;

comment on function public.pode_consultar_venda() is
  'Quem pode procurar a venda de OUTra pessoa (pos-venda): socio e comercial. Nao inclui bancada -- valor de venda nao e do papel dele.';

-- -- A venda, sem o dinheiro da loja -----------------------------------------
-- `loja` da FoneNinja so vem preenchida em 61% das linhas (3.031 de 4.975), por
-- isso `observacoes` vai junto: e dela que o front tira loja/vendedor/atendente
-- com o mesmo getVendaInfo() de sempre. As chaves normalizadas
-- (vendedor_key/atendente_key) vem prontas pra exibir "quem vendeu".
create or replace view public.v_venda_consulta as
select v.id,
       v.data_saida,
       v.status,
       v.loja,
       v.cliente_nome,
       v.cliente_tel,
       v.cliente_cidade,
       v.cliente_insta,
       v.valor_total,
       v.desconto,
       v.qtd_produtos,
       v.upgrade_valor,
       v.upgrade_qtd,
       v.observacoes,
       v.vendedor_key,
       v.atendente_key
  from public.vendas v
 where public.pode_consultar_venda();

comment on view public.v_venda_consulta is
  'Cabecalho da venda para o pos-venda achar o caso do cliente. Sem custo, lucro ou recebimento.';

revoke all on public.v_venda_consulta from anon, authenticated;
grant select on public.v_venda_consulta to authenticated;

-- -- Os itens da venda, sem o custo ------------------------------------------
-- E por aqui que se acha a venda pelo IMEI, que e como o cliente chega: ele tem
-- o aparelho na mao, nao o numero do pedido.
create or replace view public.v_venda_consulta_itens as
select p.id,
       p.venda_id,
       p.apple_id,
       p.titulo,
       p.serial,
       p.imei_1,
       p.preco,
       p.desconto,
       p.quantidade
  from public.venda_produtos p
 where public.pode_consultar_venda();

comment on view public.v_venda_consulta_itens is
  'Itens da venda para busca por IMEI/etiqueta no pos-venda. Sem valor_estoque.';

revoke all on public.v_venda_consulta_itens from anon, authenticated;
grant select on public.v_venda_consulta_itens to authenticated;

-- -- O aparelho do cliente que esta fora -------------------------------------
-- So aparelho COM DONO (origem <> 'estoque'). Aparelho da prateleira e assunto
-- do estoque, nao do pos-venda -- e mostrar tudo aqui esconderia os 21 que
-- importam no meio de 147 que nao.
--
-- ⚠️ SEM VALOR. O que a assistencia cobra e podeVerCustoServico() -- socio e
-- bancada. O pos-venda precisa saber ONDE esta e HA QUANTOS DIAS, nao quanto
-- custou.
create or replace view public.v_assistencia_cliente as
select b.id,
       b.apple_id,
       b.imei4,
       b.etiqueta,
       b.modelo_txt,
       b.fornecedor,
       b.origem,
       b.servico,
       b.saiu_em,
       b.voltou_em,
       b.retorno_de,
       b.obs,
       b.cliente_nome,
       b.cliente_tel,
       (current_date - b.saiu_em) as dias_fora
  from public.bancada b
 where public.pode_consultar_venda()
   and coalesce(b.origem, 'estoque') <> 'estoque';

comment on view public.v_assistencia_cliente is
  'Aparelhos de CLIENTE (e de garantia) na assistencia, para o pos-venda responder "onde esta o meu iPhone". Sem valor de servico.';

revoke all on public.v_assistencia_cliente from anon, authenticated;
grant select on public.v_assistencia_cliente to authenticated;

-- A funcao de filtro tambem nao e do `anon`: ela so faz sentido com sessao.
revoke execute on function public.pode_consultar_venda() from anon;
