-- ===========================================================================
-- DIARIO DE BORDO — o que foi medido, o que ficou decidido, o que esta em aberto
--
-- POR QUE EXISTE
-- O dono perguntou "o que ficou resolvido nesse chat?". A informacao existia --
-- em commit e em docs/ -- mas nenhuma das duas e escrita pra ele: commit e pra
-- dev, docs/ e pra agente. Faltava o lugar que ele ja abre todo dia.
--
-- ⚠️ E NAO E SO CONVENIENCIA. docs/ANALISE-MAJU-AGO-2026.md pede, com todas as
-- letras: "carimbe toda mudanca de prompt num changelog -- hoje as viradas so
-- se descobrem por arqueologia de serie". Toda a camada 2 do
-- docs/PLANO-QUALIDADE-IA.md depende de saber QUANDO algo mudou, senao se
-- compara antes/depois sem saber onde e o antes. Esta tabela E esse changelog.
--
-- ⚠️ A REGRA QUE IMPEDE ELA DE APODRECER: o diario LINKA, nunca COPIA.
-- O CLAUDE.md marca "regra de dinheiro em dois lugares paga errado calado" como
-- a classe mais cara de bug. Conteudo duplicado de docs/ aqui vira terceira
-- fonte de verdade e diverge. Por isso `docs` e `commits` sao array de
-- ponteiro, e `resumo` e ate 4 bullets do QUE MUDOU -- nunca o conteudo.
--
-- RLS: eh_socio(). O diario carrega decisao de negocio e numero de dinheiro
-- (ROAS, comissao, margem). Nao e do Vitinho nem de quem so atende.
-- ===========================================================================

create table if not exists public.diario (
  id          bigint generated always as identity primary key,
  data        date        not null default (now() at time zone 'America/Sao_Paulo')::date,
  titulo      text        not null,
  -- Ate 4 bullets do que mudou. Se estiver crescendo, e sinal de que virou
  -- copia de docs/ -- corte, nao aumente.
  resumo      text[]      not null default '{}',
  -- Ponteiros. `docs` sao caminhos do repo, `commits` sao hashes curtos,
  -- `links` sao URLs (artifact, dashboard). Nenhum deles guarda conteudo.
  docs        text[]      not null default '{}',
  commits     text[]      not null default '{}',
  links       text[]      not null default '{}',
  -- ⚠️ O carimbo que o changelog exige: 'prompt' marca virada de prompt da IA,
  -- que e o que a analise de serie precisa datar. Os outros sao so cor.
  tipo        text        not null default 'analise'
              check (tipo in ('analise','decisao','prompt','codigo','dado')),
  criado_em   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- ITENS EM ABERTO — a metade de cima da tela, e a que tem valor de verdade.
-- O dono nao precisa de um log; precisa saber o que esta pendente e com quem.
-- ---------------------------------------------------------------------------
create table if not exists public.diario_itens (
  id          bigint generated always as identity primary key,
  diario_id   bigint      references public.diario(id) on delete set null,
  titulo      text        not null,
  detalhe     text,
  -- Quem tem a bola. 'dudu' e externo (dev da Maju), 'nos' e trabalho no painel,
  -- 'dono' e decisao que so ele toma.
  dono        text        not null default 'nos'
              check (dono in ('dudu','nos','dono','equipe')),
  prioridade  smallint    not null default 2 check (prioridade between 1 and 3),
  aberto_em   date        not null default (now() at time zone 'America/Sao_Paulo')::date,
  -- NULL = em aberto. Data = resolvido. Guardar a data (e nao apagar a linha)
  -- e o que permite medir quanto tempo um laco fica aberto.
  fechado_em  date,
  fechado_nota text,
  criado_em   timestamptz not null default now()
);

create index if not exists diario_data_idx        on public.diario (data desc, id desc);
create index if not exists diario_itens_abertos_idx on public.diario_itens (fechado_em, prioridade, aberto_em);

-- ---------------------------------------------------------------------------
-- RLS desde o nascimento. ⚠️ O CLAUDE.md avisa que fechar policy depois e
-- mudanca quebrante: RLS devolve 200 com lista vazia e a tela diz "nao ha
-- registros" sem ninguem desconfiar. Aqui nao ha risco porque nada le ainda.
-- ---------------------------------------------------------------------------
alter table public.diario       enable row level security;
alter table public.diario_itens enable row level security;

drop policy if exists diario_socio       on public.diario;
drop policy if exists diario_itens_socio on public.diario_itens;

create policy diario_socio on public.diario
  for all to authenticated
  using (public.eh_socio()) with check (public.eh_socio());

create policy diario_itens_socio on public.diario_itens
  for all to authenticated
  using (public.eh_socio()) with check (public.eh_socio());

revoke all on public.diario, public.diario_itens from anon;
grant select, insert, update, delete on public.diario, public.diario_itens to authenticated;
