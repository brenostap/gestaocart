-- vendedor_key / atendente_key: a pessoa canonica de cada venda, resolvida pelo
-- mapa `apelidos`. E o que vai permitir "so as minhas vendas" virar RLS -- ate
-- aqui a atribuicao so existia como texto livre parseado no navegador.
--
-- NULL de proposito quando o campo traz nome de loja ("cart"), sobra de parsing
-- ("do") ou algo nao identificado: venda sem dono tem que ser VISIVEL, nao
-- chutada para alguem.
alter table public.vendas add column if not exists vendedor_key  text;
alter table public.vendas add column if not exists atendente_key text;

comment on column public.vendas.vendedor_key  is 'Pessoa canonica que vendeu, resolvida de vendedor_obs via public.apelidos. NULL = sem dono identificado.';
comment on column public.vendas.atendente_key is 'Pessoa canonica que atendeu, resolvida de atendente_obs via public.apelidos. NULL = sem dono identificado.';

-- A resolucao mora no banco, e nao no sync, por um motivo: assim vale para
-- QUALQUER caminho de escrita (sync horario, correcao manual, backfill futuro)
-- sem precisar lembrar de repetir a regra em cada um.
create or replace function public.resolve_venda_keys()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.vendedor_key := (
    select a.chave from public.apelidos a
     where a.apelido = lower(trim(coalesce(new.vendedor_obs,'')))
       and a.tipo in ('pessoa','ia'));
  new.atendente_key := (
    select a.chave from public.apelidos a
     where a.apelido = lower(trim(coalesce(new.atendente_obs,'')))
       and a.tipo in ('pessoa','ia'));
  return new;
end $$;

drop trigger if exists trg_resolve_venda_keys on public.vendas;
create trigger trg_resolve_venda_keys
  before insert or update on public.vendas
  for each row execute function public.resolve_venda_keys();

-- Backfill de toda a historia.
update public.vendas v
   set vendedor_key = (select a.chave from public.apelidos a
                        where a.apelido = lower(trim(coalesce(v.vendedor_obs,''))) and a.tipo in ('pessoa','ia')),
       atendente_key = (select a.chave from public.apelidos a
                        where a.apelido = lower(trim(coalesce(v.atendente_obs,''))) and a.tipo in ('pessoa','ia'));

-- Parciais: a policy so pergunta por chave preenchida, e ~3% das linhas sao NULL.
create index if not exists idx_vendas_vendedor_key  on public.vendas (vendedor_key)  where vendedor_key  is not null;
create index if not exists idx_vendas_atendente_key on public.vendas (atendente_key) where atendente_key is not null;

-- ===========================================================================
-- CONFERENCIA (rodada em 17/ago/2026, so leitura)
--
-- Cobertura -- % de vendas com pelo menos um dono identificado:
--   mar 97,7 · abr 99,0 · mai 99,5 · jun 97,7 · jul 99,1 · ago 97,4
--
-- SQL vs JS -- 45 dos 59 apelidos resolvem igual. As 14 divergencias vao TODAS
-- na mesma direcao (o SQL sabe mais) e nenhuma reatribui venda de ninguem:
--   - 6 tokens que o JS devolvia crus e nao casavam com VO_KEYS/AT_KEYS
--     (be, gu, do, sem, pessoal, malu) -- mesmo resultado pratico: ninguem.
--   - 8 linhas RESGATADAS que caiam no chao: 6 atendimentos do Vitinho
--     (itinho, viitinho, viitnho x2, vitino, vitnhio), 1 venda do David (dvid)
--     e 7 atendimentos da Pietra (pietr).
--
-- ⚠️ As linhas resgatadas sao de mar/abr/mai/jun -- MESES JA PAGOS. Em dinheiro
-- da ~R$12 pro Vitinho e ~R$44 pra Pietra (que ja saiu). Nada quebra hoje,
-- porque nenhuma tela le estas colunas ainda. Mas quando o front passar a ler,
-- o fechamento desses meses muda de valor -- e a regra desta casa e que
-- fechamento pago NAO muda depois. Por isso o snapshot da folha
-- (docs/PLANO-UPGRADE-2026-08.md §2.2) tem que ser gerado dos meses fechados
-- ANTES de o front trocar de fonte.
-- ===========================================================================
