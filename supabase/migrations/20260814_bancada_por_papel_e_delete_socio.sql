-- ===========================================================================
-- BANCADA E CORREÇÕES POR PAPEL — e o DELETE da bancada volta pro sócio
--
-- ✅ APLICADA em 14/ago/2026, com autorização do dono. Fica aqui pelo rollback
--    do fim do arquivo: se o Vitinho não conseguir mais lançar manutenção, é a
--    primeira coisa a desfazer, e ninguém vai ter calma pra reescrever na hora.
--
-- POR QUE — duas frestas achadas na revisão do acesso do Vitinho:
--
-- 1. `bancada`, `estoque_correcoes` e `estoque_estado` estavam com
--    `for all using (tem_perfil())`: QUALQUER perfil escrevia. Hoje era
--    inofensivo — só existem 'socio' e 'bancada' —, mas o front diz
--    `podeCorrigirEstoque()` = socio+bancada. Papel novo já nasceria escrevendo
--    no controle da bancada sem ninguém ter decidido isso. As tabelas nasceram
--    depois do RLS por papel (13/ago) e herdaram o desenho antigo.
--
-- 2. `bancada` aceitava DELETE em massa por qualquer perfil. Conferido: com o
--    JWT do Vitinho, `delete from bancada` apagava as 40 linhas (num teste com
--    rollback). O front NUNCA apaga de `bancada` — `bncGravar()` faz POST e
--    `bncPatch()` faz PATCH, e é só isso (js/bancada.js). Então fechar o DELETE
--    não tira nada da tela dele. Apagar linha de bancada é desfazer histórico
--    de paradeiro: fica com o sócio.
--
-- O que NÃO muda: `estoque` (SELECT) continua em `tem_perfil()` de propósito —
-- ler o estoque é o mínimo de qualquer perfil que venha a existir. E o DELETE
-- de `estoque_correcoes`/`estoque_estado` continua com quem opera: ali apagar é
-- desfazer a própria correção (o front faz isso), não apagar histórico.
--
-- ⚠️ ARMADILHA na hora de conferir: RLS não dá erro em UPDATE/DELETE sem
-- policy — devolve ZERO LINHA em silêncio. Um teste que só olha "deu erro?"
-- lê isso como "permitido". Sempre medir com `get diagnostics n = row_count`.
--
-- Conferido depois de aplicar, simulando cada papel com
-- `set local role authenticated` + `request.jwt.claims` dentro de transação:
--
--   bancada (Vitinho)  → estoque 1.702 · bancada SELECT 40 · INSERT 1 · UPDATE 1
--                        · DELETE 0 (fechado) · correções e estado: grava e
--                        desfaz normalmente
--   sócio              → bancada DELETE 40 · vendas 4.833 · estado grava
--   logado SEM perfil  → zero em tudo; INSERT negado nas três tabelas
-- ===========================================================================

-- Papel que opera o chão da loja. Espelha `podeCorrigirEstoque()` do
-- js/shell.js; os dois precisam mudar juntos.
create or replace function public.pode_operar()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select public.papel_do_usuario() in ('socio', 'bancada');
$function$;

comment on function public.pode_operar() is
  'Papel que opera o chao da loja (socio, bancada). Espelha podeCorrigirEstoque() em js/shell.js.';

-- -- bancada: lê/cria/edita quem opera; apaga só sócio ----------------------
drop policy if exists bancada_perfil on public.bancada;

create policy bancada_le on public.bancada
  for select to authenticated using (public.pode_operar());

create policy bancada_cria on public.bancada
  for insert to authenticated with check (public.pode_operar());

create policy bancada_edita on public.bancada
  for update to authenticated
  using (public.pode_operar()) with check (public.pode_operar());

create policy bancada_apaga_socio on public.bancada
  for delete to authenticated using (public.eh_socio());

-- -- correções e estado: delta auto-limpante e informação nossa -------------
drop policy if exists correcoes_perfil on public.estoque_correcoes;
create policy correcoes_papel on public.estoque_correcoes
  for all to authenticated
  using (public.pode_operar()) with check (public.pode_operar());

drop policy if exists estado_perfil on public.estoque_estado;
create policy estado_papel on public.estoque_estado
  for all to authenticated
  using (public.pode_operar()) with check (public.pode_operar());


-- ===========================================================================
-- ROLLBACK — volta ao desenho de 13/ago (qualquer perfil escreve e apaga).
-- Só use se a tela de Bancada parar de gravar pro Vitinho e não der pra
-- descobrir o motivo na hora.
-- ===========================================================================
-- drop policy if exists bancada_le          on public.bancada;
-- drop policy if exists bancada_cria        on public.bancada;
-- drop policy if exists bancada_edita       on public.bancada;
-- drop policy if exists bancada_apaga_socio on public.bancada;
-- create policy bancada_perfil on public.bancada
--   for all to authenticated using (tem_perfil()) with check (tem_perfil());
--
-- drop policy if exists correcoes_papel on public.estoque_correcoes;
-- create policy correcoes_perfil on public.estoque_correcoes
--   for all to authenticated using (tem_perfil()) with check (tem_perfil());
--
-- drop policy if exists estado_papel on public.estoque_estado;
-- create policy estado_perfil on public.estoque_estado
--   for all to authenticated using (tem_perfil()) with check (tem_perfil());
