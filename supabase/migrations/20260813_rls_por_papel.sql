-- ===========================================================================
-- RLS POR PAPEL — a parte que TROCA as políticas permissivas
--
-- ✅ APLICADA em 13/ago/2026, com autorização do dono. Fica aqui pelo rollback
--    do fim do arquivo: se o painel parar, ninguém vai ter calma pra reescrever
--    isto na hora.
--
-- A parte aditiva (tabela `perfis`, funções `papel_do_usuario/eh_socio/
-- tem_perfil`, e o seed dos usuários existentes como 'socio') foi aplicada
-- antes, e não mudava comportamento nenhum sozinha.
--
-- Conferido depois de aplicar, simulando cada papel com
-- `set local role authenticated` + `request.jwt.claims` dentro de transação:
--
--   sócio            → vendas 4.815 · custos 413 · estoque 1.696 · folha ok
--   bancada          → estoque 1.696 · bancada ok · vendas/custos/folha/
--                      compras/preços/reparos = 0 · só o próprio perfil
--   logado SEM perfil→ zero em tudo, inclusive estoque
--
-- O que muda aqui:
--   antes  — qualquer pessoa logada LÊ tudo (folha, custo, lucro, fornecedor)
--            e ESCREVE/APAGA custos, metas_mensais, funcionarios_config e
--            tabela_precos.
--   depois — 'socio' faz tudo; 'bancada' lê só `estoque` e mexe só em
--            `bancada`; logado sem perfil não lê nada.
--
-- Contexto: docs/PERFIS-E-ACESSO.md
-- ===========================================================================

begin;

-- -- o que o papel `bancada` precisa ----------------------------------------
drop policy if exists bancada_auth_all on public.bancada;
create policy bancada_perfil on public.bancada for all to authenticated
  using (public.tem_perfil()) with check (public.tem_perfil());

drop policy if exists auth_read       on public.estoque;
drop policy if exists estoque_leitura on public.estoque;
create policy estoque_leitura on public.estoque for select to authenticated
  using (public.tem_perfil());

drop policy if exists auth_all       on public.fotos_modelos;
drop policy if exists fotos_leitura  on public.fotos_modelos;
drop policy if exists fotos_socio    on public.fotos_modelos;
create policy fotos_leitura on public.fotos_modelos for select to authenticated
  using (public.tem_perfil());
create policy fotos_socio on public.fotos_modelos for all to authenticated
  using (public.eh_socio()) with check (public.eh_socio());

-- -- todo o resto: só sócio --------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'vendas','venda_produtos','venda_trocas','pagamentos','contas','clientes',
    'compras','compra_produtos','custos','dividas','funcionarios',
    'funcionarios_config','funcionarios_dividas','funcionarios_extra',
    'metas_mensais','tabela_precos','origens_cliente','reparos','sync_log',
    'ajustes_acessorios'
  ] loop
    execute format('drop policy if exists auth_read on public.%I', t);
    execute format('drop policy if exists auth_all  on public.%I', t);
    execute format('drop policy if exists reparos_leitura_autenticada on public.%I', t);
    execute format('drop policy if exists %I_socio on public.%I', t, t);
    execute format($f$create policy %I_socio on public.%I for all to authenticated
                      using (public.eh_socio()) with check (public.eh_socio())$f$, t, t);
  end loop;
end $$;

-- -- buraco que não tem nada a ver com perfil --------------------------------
-- As três views NÃO têm RLS (view roda com os direitos do dono dela, não do
-- leitor) e estavam com TODOS os privilégios pra `authenticated`: qualquer
-- pessoa logada lia vendas/ranking/clientes inteiros por elas, contornando o
-- RLS das tabelas. Nenhuma é usada pelo app — zero referências em js/.
revoke all on public.v_vendas_resumo,
              public.v_ranking_vendedores,
              public.v_clientes_historico from anon, authenticated;

commit;

-- ===========================================================================
-- ROLLBACK — volta ao estado de 12/ago (todo mundo logado lê e escreve tudo).
-- Guardado aqui porque, se o painel parar depois de aplicar, ninguém vai ter
-- calma pra reescrever isto na hora.
-- ===========================================================================
-- begin;
-- do $$
-- declare t text;
-- begin
--   foreach t in array array[
--     'vendas','venda_produtos','venda_trocas','pagamentos','contas','clientes',
--     'compras','compra_produtos','custos','dividas','funcionarios',
--     'funcionarios_config','funcionarios_dividas','funcionarios_extra',
--     'metas_mensais','tabela_precos','origens_cliente','reparos','sync_log',
--     'ajustes_acessorios','estoque','fotos_modelos','bancada'
--   ] loop
--     execute format('drop policy if exists %I_socio on public.%I', t, t);
--     execute format('drop policy if exists auth_all on public.%I', t);
--     execute format($f$create policy auth_all on public.%I for all to authenticated
--                       using (true) with check (true)$f$, t);
--   end loop;
-- end $$;
-- drop policy if exists estoque_leitura on public.estoque;
-- drop policy if exists fotos_leitura   on public.fotos_modelos;
-- drop policy if exists bancada_perfil  on public.bancada;
-- commit;
