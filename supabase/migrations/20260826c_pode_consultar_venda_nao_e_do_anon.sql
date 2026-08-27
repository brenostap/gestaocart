-- ===========================================================================
-- REVOGAR DE `anon` NAO TIRA NADA -- o EXECUTE vem de PUBLIC
--
-- No Postgres, funcao nova nasce com EXECUTE concedido a PUBLIC, e `anon`
-- herda dai. A migration de horas atras fez `revoke ... from anon` e o linter
-- continuou apontando: o grant nunca foi do anon, era de PUBLIC.
--
-- ⚠️ A MESMA DIVIDA VALE PRAS FUNCOES ANTIGAS (eh_socio, tem_perfil,
-- pode_operar, meu_vo_key, meu_at_key, papel_do_usuario): 20260820 revogou de
-- `anon` e elas seguem executaveis por PUBLIC. NAO corrigi aqui de proposito --
-- essas seis sao chamadas DENTRO das policies de RLS, e mexer no EXECUTE delas
-- sem um login de verdade pra testar pode derrubar o acesso de todo mundo de
-- uma vez. Fica como tarefa com teste, nao como efeito colateral de outra.
--
-- Esta e segura: `pode_consultar_venda()` nao esta em policy nenhuma, so nas
-- tres views de pos-venda -- e view SECURITY DEFINER chama a funcao com os
-- direitos do dono, nao os do leitor.
-- ===========================================================================

revoke execute on function public.pode_consultar_venda() from public, anon;
grant  execute on function public.pode_consultar_venda() to authenticated;
