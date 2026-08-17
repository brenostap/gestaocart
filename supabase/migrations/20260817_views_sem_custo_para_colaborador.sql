-- ===========================================================================
-- VIEWS DO COLABORADOR
--
-- POR QUE VIEW E NAO POLICY: RLS e por LINHA, nao por coluna. As linhas que o
-- colaborador precisa ver (`vendas`, `venda_produtos`) carregam `custo_total`,
-- `lucro` e `valor_estoque` na mesma linha. Uma policy que libere a linha
-- entrega o custo junto -- a tela esconde com money(), a API nao. Era o item
-- que docs/PERFIS-E-ACESSO.md deixou explicitamente em aberto.
--
-- Estas views rodam com os direitos do DONO (sem security_invoker) e fazem o
-- proprio filtro por chave. Consequencia: o colaborador NAO ganha policy nenhuma
-- nas tabelas -- ele nao le tabela, le view. Se a view esquecer o filtro, vaza
-- tudo, entao o filtro e sempre a mesma dupla meu_vo_key()/meu_at_key().
-- ===========================================================================

-- -- Minhas vendas ----------------------------------------------------------
-- Sem custo_total e sem lucro. Valor da venda fica: ele negociou o preco.
create or replace view public.v_minhas_vendas as
select v.id, v.loja, v.data_saida, v.status,
       v.cliente_nome, v.cliente_tel, v.cliente_cidade,
       v.valor_total, v.desconto, v.qtd_produtos,
       v.upgrade_valor, v.upgrade_qtd,
       v.observacoes, v.vendedor_key, v.atendente_key,
       (v.vendedor_key  is not distinct from public.meu_vo_key()) as fui_vendedor,
       (v.atendente_key is not distinct from public.meu_at_key()) as fui_atendente
  from public.vendas v
 where (v.vendedor_key  is not null and v.vendedor_key  = public.meu_vo_key())
    or (v.atendente_key is not null and v.atendente_key = public.meu_at_key());

comment on view public.v_minhas_vendas is
  'Vendas do usuario logado (como vendedor OU atendente), sem custo e sem lucro. Ver docs/PERFIS-E-ACESSO.md.';

-- -- Itens das minhas vendas -------------------------------------------------
-- Sem valor_estoque e sem lucro. Serve pra conferir o que foi vendido, nao a margem.
create or replace view public.v_meus_itens as
select p.id, p.venda_id, p.apple_id, p.titulo, p.serial, p.imei_1,
       p.preco, p.desconto, p.quantidade, p.is_principal
  from public.venda_produtos p
 where exists (
   select 1 from public.vendas v
    where v.id = p.venda_id
      and ((v.vendedor_key  is not null and v.vendedor_key  = public.meu_vo_key())
        or (v.atendente_key is not null and v.atendente_key = public.meu_at_key())));

comment on view public.v_meus_itens is
  'Itens das vendas do usuario logado, sem valor_estoque e sem lucro.';

-- -- Vitrine do estoque -------------------------------------------------------
-- O que da pra vender AGORA, sem custo e sem fornecedor (brief §2). Qualquer
-- perfil ativo enxerga: e a tela que o vendedor abre pra responder o cliente.
create or replace view public.v_estoque_vitrine as
select e.id, e.titulo, e.serial, e.imei_1, e.bateria,
       e.preco_varejo, e.status, e.observacoes, e.created_at
  from public.estoque e
 where public.tem_perfil() and e.status = 'available';

comment on view public.v_estoque_vitrine is
  'Estoque disponivel sem valor_estoque e sem ultimo_fornecedor. E o que o papel comercial le -- ele nao toca a tabela estoque.';

-- Views nao herdam RLS da tabela: o acesso e o GRANT. anon nunca.
revoke all on public.v_minhas_vendas, public.v_meus_itens, public.v_estoque_vitrine from public, anon;
grant select on public.v_minhas_vendas, public.v_meus_itens, public.v_estoque_vitrine to authenticated;

-- ===========================================================================
-- CONFERENCIA (17/ago/2026) -- simulando cada papel com set local role
-- authenticated + request.jwt.claims dentro de transacao, e medindo ESCRITA
-- com get diagnostics row_count (RLS nao da erro em update sem policy).
--
--                              | Vitinho (bancada+at_key) | sem perfil | socio
--   v_minhas_vendas            |                      548 |          0 |     0 (nao usa)
--   v_meus_itens               |                    1.645 |          0 |     -
--   v_estoque_vitrine          |                      215 |          0 |     -
--   vendas (TABELA)            |                        0 |          0 | 4.871
--   venda_produtos (TABELA)    |                        0 |          0 | 14.897
--   pagamentos (TABELA)        |                        0 |          0 | 7.647
--   custos / compras / folha   |                        0 |          0 | tudo
--   apelidos                   |                       59 |          0 |    59
--
--   escrita como Vitinho: update vendas -> 0 linhas
--                         update apelidos -> 0 linhas
--                         update estoque -> 0 linhas
--
--   colunas de dinheiro fechado nas 3 views: ZERO
--   (custo_total, lucro, valor_estoque, ultimo_fornecedor, recebimento_*)
--
-- ⚠️ AINDA ABERTO, de proposito: `estoque_leitura` continua `tem_perfil()`, entao
-- a TABELA estoque (com valor_estoque) segue alcancavel por bancada/comercial
-- pela API. Fechar agora quebraria a tela do Vitinho, que le a tabela direto.
-- Fecha no passo 3, junto com o front trocando para v_estoque_vitrine.
-- ===========================================================================
