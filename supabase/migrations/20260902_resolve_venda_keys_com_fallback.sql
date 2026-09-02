-- ============================================================================
-- As chaves da venda passam a usar os MESMOS DOIS FALLBACKS do painel.
--
-- POR QUE: `resolve_venda_keys` so lia vendedor_obs/atendente_obs. Venda SEM
-- OBS ficava com as duas chaves nulas -- e como v_minhas_vendas filtra por elas,
-- a venda sumia da lista "Minhas vendas" da pessoa, mesmo ela RECEBENDO por
-- aquela venda (a folha vem de fechamentoEquipe(), que faz o fallback).
--
-- Medido em ago/2026: 13 vendas invisiveis para 7 pessoas. A Mel recebia pela
-- venda 40611960 (R$4.850) e nao a via na propria tela. O TOTAL estava certo (vem
-- de folha_mensal congelada); a LISTA e que nao fechava com ele -- que e pior,
-- porque a pessoa soma o que ve e chega num numero menor do que recebeu.
--
-- ⚠️ AS DUAS LISTAS ABAIXO SAO ESPELHO DE js/core.js (VO_KEYS, AT_KEYS,
-- VO_ATENDE_KEYS). Mesmo padrao do at_key_vigente(), que ja inlinava
-- ['david','isa','mel']. Espelho sem guarda diverge calado -- por isso existe o
-- test/chaves-espelho.test.js, que compara este arquivo com o core.js.
-- ============================================================================

create or replace function public.eh_vo_key(p_chave text)
returns boolean language sql immutable as $$
  -- VO_KEYS em core.js: so estes recebem comissao por aparelho.
  select p_chave = any (array['david','isa','mel','pietra','maria']);
$$;

create or replace function public.eh_at_key(p_chave text)
returns boolean language sql immutable as $$
  -- AT_KEYS + VO_ATENDE_KEYS em core.js. A VIGENCIA de david/isa/mel (ago/2026
  -- em diante) fica com at_key_vigente() -- aqui e so "esta chave e de atendente".
  select p_chave = any (array['vitinho','davi','anne','denilson','pietra','leo',
                              'luana','gabi','maria','david','isa','mel']);
$$;

create or replace function public.resolve_venda_keys()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_mes text := to_char((new.data_saida - interval '3 hours'), 'YYYY-MM');
  v_cad text;
begin
  -- 1. A OBS MANDA. Continua sendo a primeira leitura, como sempre foi.
  new.vendedor_key := (
    select a.chave from public.apelidos a
     where a.apelido = lower(trim(coalesce(new.vendedor_obs,'')))
       and a.tipo in ('pessoa','ia'));
  new.atendente_key := (
    select a.chave from public.apelidos a
     where a.apelido = lower(trim(coalesce(new.atendente_obs,'')))
       and a.tipo in ('pessoa','ia'));

  -- 2. VENDEDOR sem obs -> campo `vendedor_nome` da FoneNinja.
  -- ⚠️ So passa quem e VENDEDOR ONLINE de verdade: ate 05/ago/2026 esse campo
  -- carregava o ATENDENTE, e sem este filtro o Vitinho viraria vendedor e
  -- receberia comissao de venda que nao e dele. (campoVendedorVO em equipe.js)
  if new.vendedor_key is null and coalesce(new.vendedor_nome,'') <> '' then
    new.vendedor_key := (
      select a.chave from public.apelidos a
       where a.tipo = 'pessoa' and public.eh_vo_key(a.chave)
         and a.apelido in (lower(trim(new.vendedor_nome)),
                           split_part(lower(trim(new.vendedor_nome)), ' ', 1))
       limit 1);
  end if;

  -- 3. ATENDENTE sem obs -> cadastrador (quem estava LOGADO).
  -- ⚠️ Ele mede o login aberto, nao a pessoa: acerta ~90,7%. Por isso e o
  -- ULTIMO recurso, e a lista vale pelo MES DA VENDA (at_key_vigente), nunca
  -- pelo mes de hoje -- quem virou atendente em ago/2026 nao pode ser atendente
  -- de uma venda de julho. (cadastradorAT em equipe.js)
  if new.atendente_key is null and new.cadastrador_id is not null then
    select f.nome into v_cad from public.funcionarios f where f.id = new.cadastrador_id;
    if coalesce(v_cad,'') <> '' then
      new.atendente_key := (
        select a.chave from public.apelidos a
         where a.tipo = 'pessoa' and public.eh_at_key(a.chave)
           and public.at_key_vigente(a.chave, v_mes)
           and a.apelido in (lower(trim(v_cad)), split_part(lower(trim(v_cad)), ' ', 1))
         limit 1);
    end if;
  end if;

  return new;
end $$;

-- Backfill: o trigger e BEFORE UPDATE, entao um update no-op reprocessa a linha.
-- ⚠️ Nao mexe em nada ja pago: folha_mensal esta congelada e nasce do
-- fechamentoEquipe(), que le a OBS, nunca estas colunas.
update public.vendas set vendedor_obs = vendedor_obs where data_saida >= '2026-01-01';
