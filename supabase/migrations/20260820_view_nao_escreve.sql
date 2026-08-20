-- ===========================================================================
-- ⚠️ AUDITORIA 20/ago/2026 -- VIEW GRAVAVEL ERA UM BYPASS DE RLS
--
-- MEDIDO simulando o David (papel `comercial`, que nao escreve em lugar
-- nenhum). Pela API REST ele conseguia:
--
--   update v_tabela_precos   -> ESCREVEU 1 linha em `tabela_precos`  (eh_socio)
--   update v_estoque_vitrine -> ESCREVEU 1 linha em `estoque`        (eh_socio)
--   delete v_meus_itens      -> APAGOU  1 linha em `venda_produtos`  (eh_socio)
--
-- (o teste desfez tudo num sub-bloco plpgsql; nenhuma linha ficou alterada)
--
-- CAUSA RAIZ, e vale pra QUALQUER view que nascer aqui: o Supabase concede ALL
-- em objeto novo do schema `public` para `authenticated` por DEFAULT PRIVILEGE.
-- As migrations faziam `revoke all from public, anon` -- que NAO alcanca
-- `authenticated` -- e `grant select`, que nao tira nada. VIEW NAO TEM RLS, e
-- view sem `security_invoker` roda com os direitos do DONO, que ignora RLS.
-- A view era uma porta lateral com a chave do dono na fechadura.
--
-- A LEITURA estava certa (conferido no mesmo teste): v_estoque_margem devolve
-- 0 linha pro colaborador (tem `eh_socio()` dentro) e v_vendas_resumo,
-- v_ranking_vendedores e v_clientes_historico ja negavam permissao.
--
-- ⚠️ REGRA NOVA: view nova = `revoke all from anon, authenticated` + `grant
-- select`. Nunca so o grant.
--
-- Conferido depois de aplicar, nos tres papeis:
--   David (comercial): le 123 precos, 213 do estoque, 899 vendas dele, 2.942
--     itens, comissao e meta -- e as tres escritas viraram "bloqueado".
--   Breno (socio): le tudo e continua escrevendo em custos e bancada.
--   Vitinho (bancada): 213 do estoque, 121 da bancada, 167 dias de comissao,
--     escreve em bancada; `estoque` e `v_estoque_margem` seguem em 0.
-- ===========================================================================

do $$
declare v record;
begin
  for v in select c.relname from pg_class c
            join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
           where c.relkind = 'v'
  loop
    execute format('revoke all on public.%I from anon, authenticated', v.relname);
  end loop;
end $$;

grant select on public.v_estoque_vitrine, public.v_tabela_precos,
                public.v_minhas_vendas, public.v_meus_itens,
                public.v_minha_comissao_mes, public.v_minha_comissao_dia,
                public.v_meta_rede_mes, public.v_estoque_margem
  to authenticated;

-- v_vendas_resumo (custo_total, lucro e telefone de toda venda),
-- v_ranking_vendedores (lucro por vendedor) e v_clientes_historico (a base de
-- clientes inteira) continuam SEM grant pra authenticated -- nenhuma tela le.

-- feedbacks: pesquisa de jun/2026, 0 linhas, aberta pro `anon` em leitura E
-- escrita (policies com `using(true)` valendo pra PUBLIC).
drop policy if exists "Allow select" on public.feedbacks;
drop policy if exists "Allow anonymous inserts" on public.feedbacks;
create policy feedbacks_socio on public.feedbacks
  for all to authenticated using (public.eh_socio()) with check (public.eh_socio());

-- RPC que dispara trabalho sem login: `disparar_sync_precos()` e SECURITY
-- DEFINER e estava executavel pelo `anon`. O front nao chama RPC nenhum.
revoke execute on function public.disparar_sync_precos() from anon, authenticated;
revoke execute on function public.resolve_venda_keys() from anon, authenticated;
revoke execute on function public.valida_perfil_keys() from anon, authenticated;
revoke execute on function public.eh_socio(), public.tem_perfil(), public.pode_operar(),
                            public.meu_vo_key(), public.meu_at_key(), public.papel_do_usuario()
  from anon;

-- search_path fixo: funcao usada dentro de policy nao pode depender do
-- search_path de quem chama (lint 0011).
alter function public.eh_acessorio(bigint, text, numeric)  set search_path = public;
alter function public.eh_principal(bigint, text, numeric)  set search_path = public;
alter function public.eh_cancelado(bigint, text, numeric)  set search_path = public;
alter function public.eh_brinde(numeric, numeric)          set search_path = public;
alter function public.lucro_acess_comissao(numeric, numeric, text) set search_path = public;
