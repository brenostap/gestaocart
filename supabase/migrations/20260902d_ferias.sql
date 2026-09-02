-- ============================================================================
-- FÉRIAS — uma linha por período GOZADO (ou programado).
--
-- ⚠️ POR QUE ISTO PRECISA EXISTIR, e por que o que havia antes não bastava:
-- até 02/set/2026 o painel só sabia derivar o período AQUISITIVO da data de
-- admissão, e adivinhava o gozo pelo lançamento de férias no `custos`. Isso
-- marca o MÊS em que foi pago, não o período aquisitivo a que pertence nem
-- quantos dias foram — e férias partidas (10 + 10 + 10, que a CLT permite)
-- ficavam indistinguíveis de um período inteiro. Piso, não controle.
--
-- Aqui o gozo vira fato: a que período aquisitivo pertence, de quando a quando,
-- quantos dias, e se houve abono.
--
-- ⚠️ O PERÍODO AQUISITIVO NÃO É COLUNA CALCULADA POR ESTA TABELA. Ele deriva da
-- admissão (`funcionarios_config.data_inicio`), em `rhPeriodosAquisitivos()` no
-- js/rh.js. Guardamos só a DATA DE INÍCIO dele em `aquisitivo_inicio`, que é a
-- chave de agrupamento. Recalcular o período aqui em SQL daria dois donos do
-- mesmo número -- o erro que já custou R$1.000 na folha em jul/2026.
-- ============================================================================

create table if not exists public.ferias (
  id                bigint generated always as identity primary key,
  funcionario_id    text not null references public.funcionarios_config(id) on delete restrict,
  -- A que periodo aquisitivo este gozo pertence (data em que o direito nasceu).
  aquisitivo_inicio date not null,
  inicio            date not null,
  fim               date not null,
  -- CLT conta dia corrido, inclusive fim de semana e feriado.
  dias              integer generated always as ((fim - inicio) + 1) stored,
  -- Abono pecuniario: ate 10 dias vendidos. Nao e dia de descanso, mas CONSOME
  -- o direito -- somar so `dias` faria o saldo nunca fechar em 30.
  abono_dias        integer not null default 0,
  decimo_antecipado boolean not null default false,
  status            text not null default 'gozada',
  obs               text,
  criado_em         timestamptz not null default now(),
  criado_por        text,

  constraint ferias_ordem      check (fim >= inicio),
  constraint ferias_status     check (status in ('programada','gozada','cancelada')),
  constraint ferias_abono      check (abono_dias between 0 and 10),
  -- 30 dias e o teto do periodo; o gozo de UMA linha nunca passa disso.
  constraint ferias_ate_30     check (((fim - inicio) + 1) + abono_dias <= 30)
);

create index if not exists idx_ferias_func on public.ferias (funcionario_id, aquisitivo_inicio);

comment on table public.ferias is
  'Férias por período aquisitivo. O período aquisitivo em si deriva da admissão em js/rh.js — aqui só a data de início dele, como chave. Ver docs/PERFIS-E-ACESSO.md.';

alter table public.ferias enable row level security;

drop policy if exists ferias_socio on public.ferias;
create policy ferias_socio on public.ferias
  for all to authenticated using (public.eh_socio()) with check (public.eh_socio());

-- ⚠️ Mesma regra do cadastro: o RH cria e edita, mas NÃO APAGA. Cancelar é
-- `status='cancelada'` — apagar destrói o histórico, que é a razão da tabela.
drop policy if exists ferias_rh_ler    on public.ferias;
drop policy if exists ferias_rh_criar  on public.ferias;
drop policy if exists ferias_rh_editar on public.ferias;
create policy ferias_rh_ler on public.ferias
  for select to authenticated using (public.eh_rh());
create policy ferias_rh_criar on public.ferias
  for insert to authenticated with check (public.eh_rh());
create policy ferias_rh_editar on public.ferias
  for update to authenticated using (public.eh_rh()) with check (public.eh_rh());

-- ⚠️ O colaborador NÃO lê esta tabela hoje. Se um dia ler, é SÓ a própria linha
-- (padrão do folha_mensal_minha) — férias de colega é dado de outra pessoa.
