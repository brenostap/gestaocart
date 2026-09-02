-- ============================================================================
-- PAPEL `rh` — folha e cadastro das pessoas, NADA da loja.
--
-- A Nara e de uma empresa terceirizada (contrato assinado, 02/set/2026). O
-- pedido do dono: "nao quero que ela veja numeros da loja como lucro e tudo
-- mais. Somente as partes dos funcionarios".
--
-- ⚠️ POR QUE ELA NAO GANHA A TELA DE EQUIPE, que ja mostra a folha:
-- `fechamentoEquipe()` CALCULA a folha no navegador, e pra isso precisa de
-- TODAS as vendas e TODOS os venda_produtos -- inclusive `valor_estoque`, que e
-- o CUSTO DO APARELHO. A tela nao mostra, mas a API entregaria. Dar Equipe pra
-- ela seria abrir o custo do estoque inteiro. Cortina nao e fechadura.
--
-- A saida foi a `folha_mensal`, congelada em 01/set/2026: ela tem nome, comissao,
-- bonus e total, e NENHUM custo de aparelho. Ela LE o resultado em vez de
-- recalcular -- e por isso nao precisa de acesso nenhum a vendas.
-- ============================================================================

create or replace function public.eh_rh()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.papel_do_usuario() = 'rh';
$$;

alter table public.perfis drop constraint if exists perfis_papel_check;
alter table public.perfis add constraint perfis_papel_check
  check (papel in ('socio','bancada','comercial','rh'));

drop policy if exists folha_mensal_rh on public.folha_mensal;
create policy folha_mensal_rh on public.folha_mensal
  for select to authenticated using (public.eh_rh());

drop policy if exists funcionarios_config_rh on public.funcionarios_config;
create policy funcionarios_config_rh on public.funcionarios_config
  for select to authenticated using (public.eh_rh());

-- ⚠️ O filtro `area = 'funcionario'` E A TRAVA. Sem ele ela veria marketing,
-- juros de emprestimo, assistencia e o resto do P&L -- exatamente o que o dono
-- disse pra nao mostrar. Policies permissivas se somam com OR, entao esta nao
-- afrouxa a do socio nem e afrouxada por ela.
drop policy if exists custos_rh on public.custos;
create policy custos_rh on public.custos
  for select to authenticated using (public.eh_rh() and area = 'funcionario');

drop policy if exists perfis_rh on public.perfis;
create policy perfis_rh on public.perfis
  for select to authenticated using (public.eh_rh() and user_id = (select auth.uid()));
