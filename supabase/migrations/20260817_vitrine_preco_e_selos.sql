-- ===========================================================================
-- A VITRINE DO VENDEDOR
--
-- O papel `comercial` nao le `tabela_precos`, `bancada` nem `estoque_estado` --
-- todas fechadas em eh_socio()/pode_operar(). E ele precisa das tres pra fazer
-- o trabalho dele:
--   preco   -> pra cotar sem chutar
--   bancada -> pra NAO prometer aparelho que esta na assistencia
--   estado  -> pra saber o que e saldao, reservado, bloqueado
--
-- Em vez de abrir as tabelas, a informacao vem mastigada por view.
-- ===========================================================================

-- -- Tabela de precos: a lista de VENDA ---------------------------------------
-- Nao e informacao sensivel para quem vende: e literalmente o que ele cota. Nao
-- ha custo aqui -- `preco_upgrade` e quanto a loja paga na troca, que o vendedor
-- negocia de frente com o cliente.
--
-- ⚠️ ISTO NAO E OPCIONAL: `estoque.preco_varejo` esta VAZIO em 100% dos itens
-- (medido em 17/ago/2026, 218 de 218). Sem esta view o vendedor cotaria R$0.
--
-- Existe como VIEW e nao como policy nova pra manter uma regra so: papel sem
-- margem nao toca tabela. E o front continua usando o MESMO getPrecoVenda() --
-- so muda de onde o cache foi preenchido, nao como o preco e casado.
create or replace view public.v_tabela_precos as
select t.id, t.categoria, t.modelo, t.capacidade, t.cores, t.cor, t.condicao,
       t.preco_upgrade, t.preco_varejo, t.sujeito_disponibilidade, t.ativo, t.updated_at
  from public.tabela_precos t
 where public.tem_perfil() and t.ativo is true;

comment on view public.v_tabela_precos is
  'Tabela de precos de venda para qualquer perfil. Sem custo. O front preenche _precosCache com isto e usa o mesmo getPrecoVenda().';

revoke all on public.v_tabela_precos from public, anon;
grant select on public.v_tabela_precos to authenticated;

-- -- Vitrine: o aparelho, com os dois selos que decidem a conversa -----------
-- `na_assistencia` existe porque em 12/ago/2026 havia 43 aparelhos (R$87 mil,
-- 16% do estoque) fora da loja e marcados como disponiveis. Vendedor prometendo
-- o que nao esta na prateleira e o problema que a tabela `bancada` nasceu pra
-- resolver -- nao adianta resolver so pra quem opera a bancada.
-- Medido hoje: 35 dos 218 aparelhos da vitrine estao na assistencia.
create or replace view public.v_estoque_vitrine as
select e.id, e.titulo, e.serial, e.imei_1, e.bateria,
       e.preco_varejo, e.status, e.observacoes, e.created_at,
       exists (select 1 from public.bancada b
                where b.apple_id = e.id and b.voltou_em is null) as na_assistencia,
       (select s.estado from public.estoque_estado s where s.apple_id = e.id) as estado,
       (select s.obs    from public.estoque_estado s where s.apple_id = e.id) as estado_obs
  from public.estoque e
 where public.tem_perfil() and e.status = 'available';

comment on view public.v_estoque_vitrine is
  'Estoque disponivel sem valor_estoque e sem ultimo_fornecedor, com selo de assistencia e estado operacional. E o que bancada e comercial leem -- nenhum dos dois toca a tabela estoque.';

revoke all on public.v_estoque_vitrine from public, anon;
grant select on public.v_estoque_vitrine to authenticated;

-- ===========================================================================
-- CONFERENCIA COM OS PERFIS REAIS (17/ago/2026)
--
-- Criados: David (vo david), Isa (vo isa), Mel (vo mel), Maria (vo+at maria).
-- Todos papel `comercial`.
--
--   DAVID                              | linhas
--   v_minhas_vendas                    |    889
--   v_estoque_vitrine                  |    218
--   v_tabela_precos                    |    123
--   vendas / venda_produtos (TABELA)   |      0
--   estoque / tabela_precos (TABELA)   |      0
--   bancada / custos / compras / folha |      0
--   perfis                             |      1  (so a propria linha)
--
--   escrita: vendas 0 · estoque 0 · precos 0 · perfis 0  (get diagnostics)
--
--   MARIA (hibrida)                    | linhas
--   v_minhas_vendas                    |     83   (80 vendendo + 7 atendendo,
--                                      |           4 vendas nas duas pontas)
--   base da comissao de ago            | R$738,19 -> 25% = R$184
-- ===========================================================================
