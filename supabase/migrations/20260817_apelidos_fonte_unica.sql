-- Mapa de apelido -> pessoa. FONTE UNICA da normalizacao de quem vendeu e quem
-- atendeu. Nasceu em 17/ago/2026 a partir dos 51 tokens distintos que ja
-- apareceram em vendas.vendedor_obs / vendas.atendente_obs desde 2025.
--
-- POR QUE NO BANCO: ate aqui o mapa vivia so em js/core.js (ALIASES), fora do
-- alcance do RLS e do sync. Copiar para o SQL seria repetir o erro de jul/2026,
-- quando lista de gente duplicada em 4 arrays fez a folha sair R$1.000 menor.
-- Agora ha um lugar so: o RLS le daqui, o sync le daqui, o front le daqui.
--
-- tipo:
--   pessoa  = gente de verdade (pode ter login, pode receber comissao)
--   ia      = Maju (Cart) e Duda (Urban). Vendem, nao recebem, nao tem login.
--   loja    = nome de loja escrito no campo de gente ("cart", "urban", "loja")
--   lixo    = sobra de parsing da observacao ("do", "sem", "de")
--   duvida  = nao identificado. chave NULL de proposito -- NAO chutar.
--
-- ⚠️ Ter chave AQUI nao significa receber comissao. Quem recebe segue decidido
-- por VO_KEYS / AT_KEYS em js/core.js -- socios e IAs tem chave e nao entram em
-- nenhuma das duas listas.
create table if not exists public.apelidos (
  apelido       text primary key,
  chave         text,
  tipo          text not null check (tipo in ('pessoa','ia','loja','lixo','duvida')),
  obs           text,
  atualizado_em timestamptz not null default now()
);

comment on table public.apelidos is
  'Apelido escrito na obs da venda -> chave canonica da pessoa. Fonte unica: RLS, sync e front leem daqui. Ver docs/PLANO-UPGRADE-2026-08.md.';

alter table public.apelidos enable row level security;

-- Leitura: qualquer perfil (o front normaliza nome na tela).
-- Escrita: so socio -- mexer aqui muda a quem a venda pertence.
drop policy if exists apelidos_leitura on public.apelidos;
create policy apelidos_leitura on public.apelidos
  for select to authenticated using (public.tem_perfil());

drop policy if exists apelidos_escrita on public.apelidos;
create policy apelidos_escrita on public.apelidos
  for all to authenticated using (public.eh_socio()) with check (public.eh_socio());

insert into public.apelidos (apelido, chave, tipo, obs) values
  -- ---- pessoas (o apelido ja e a chave) ----
  ('david','david','pessoa',null),
  ('mel','mel','pessoa',null),
  ('isa','isa','pessoa',null),
  ('anne','anne','pessoa',null),
  ('davi','davi','pessoa',null),
  ('vitinho','vitinho','pessoa',null),
  ('denilson','denilson','pessoa','saiu 31/07/2026'),
  ('pietra','pietra','pessoa','saiu 15/06/2026'),
  ('leo','leo','pessoa',null),
  ('maria','maria','pessoa','vende e atende'),
  ('gabi','gabi','pessoa',null),
  ('luana','luana','pessoa','saiu jun/2026'),
  ('gustavo','gustavo','pessoa','socio -- aparece como vendedor, nao comissiona'),
  ('marcella','marcella','pessoa','socia'),
  ('breno','breno','pessoa','socio -- aparece como vendedor, nao comissiona'),
  ('xavier','xavier','pessoa','ex-funcionario, ultima venda fev/2026'),
  -- ---- apelidos e erros de digitacao ----
  ('deni','denilson','pessoa',null),
  ('deno','denilson','pessoa',null),
  ('denilsom','denilson','pessoa',null),
  ('vitor','vitinho','pessoa',null),
  ('victor','vitinho','pessoa',null),
  ('citinho','vitinho','pessoa',null),
  ('vitinh','vitinho','pessoa',null),
  ('vitonho','vitinho','pessoa',null),
  ('vitinhi','vitinho','pessoa',null),
  ('vitinhoi','vitinho','pessoa',null),
  ('viitnho','vitinho','pessoa','achado em 17/ago -- nao estava no ALIASES'),
  ('viitinho','vitinho','pessoa','achado em 17/ago -- nao estava no ALIASES'),
  ('vitnhio','vitinho','pessoa','achado em 17/ago -- nao estava no ALIASES'),
  ('itinho','vitinho','pessoa','achado em 17/ago -- nao estava no ALIASES'),
  ('vitino','vitinho','pessoa','achado em 17/ago -- nao estava no ALIASES'),
  ('ane','anne','pessoa',null),
  ('anen','anne','pessoa',null),
  ('dvid','david','pessoa','achado em 17/ago -- nao estava no ALIASES'),
  ('davii','davi','pessoa',null),
  ('pietr','pietra','pessoa','achado em 17/ago -- nao estava no ALIASES'),
  ('pe','pietra','pessoa',null),
  ('leonardo','leo','pessoa','nome do perfil FoneNinja'),
  ('madu','maria','pessoa',null),
  ('gabrielli','gabi','pessoa','nome do perfil FoneNinja'),
  ('gabrieli','gabi','pessoa',null),
  ('melissa','mel','pessoa',null),
  ('mell','mel','pessoa',null),
  ('isabella','isa','pessoa',null),
  ('marcela','marcella','pessoa',null),
  ('gu','gustavo','pessoa',null),
  ('be','breno','pessoa','achado em 17/ago -- provavel apelido do Breno. Socio, nao comissiona'),
  -- ---- IAs ----
  ('maju','maju','ia','IA da Cart'),
  ('duda','duda','ia','IA da Urban'),
  -- ---- nome de loja no campo de gente ----
  ('cart','cart','loja',null),
  ('urban','urban','loja',null),
  ('loja','loja','loja',null),
  ('online','online','loja',null),
  ('pessoal','pessoal','loja',null),
  -- ---- sobra de parsing ----
  ('do','do','lixo',null),
  ('sem','sem','lixo',null),
  ('de','de','lixo',null),
  -- 'malu' entrou como tipo 'duvida' com chave NULL (nao chutar quem e gente).
  -- O dono confirmou em 17/ago que e typo de 'maju', e virou IA.
  ('malu','maju','ia','typo de maju (IA da Cart) -- confirmado pelo dono em 17/ago/2026')
on conflict (apelido) do update
  set chave = excluded.chave, tipo = excluded.tipo, obs = excluded.obs, atualizado_em = now();

-- O acento do 'leo' entra a parte: escrever caractere acentuado no meio de uma
-- lista longa e onde some sem ninguem ver.
insert into public.apelidos (apelido, chave, tipo, obs)
values (lower('L' || chr(233) || 'o'), 'leo', 'pessoa', 'com acento')
on conflict (apelido) do update set chave = excluded.chave, tipo = excluded.tipo;
