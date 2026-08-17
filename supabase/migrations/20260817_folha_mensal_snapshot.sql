-- SNAPSHOT DA FOLHA -- uma linha por pessoa por mes.
--
-- Existe por dois motivos que se resolvem com a mesma tabela:
--
-- 1. O colaborador NAO consegue calcular a propria comissao. Ela depende do
--    LUCRO de acessorio (que ele nao pode ver) e dos totais da REDE. Hoje a tela
--    dele monta o mes corrente com views agregadas; para mes FECHADO, quem
--    manda e este snapshot.
--
-- 2. "Fechamento pago nao muda de valor depois" era so disciplina. O painel
--    recalcula o passado com as regras de hoje, e o codigo esta remendado de
--    "nunca retroativa" em tres lugares (metasColetivas, metaAtFaixas,
--    BONUS_COL_EXCLUI_DESDE). Congelar o mes torna a regra estrutural.
--    Isso ficou urgente em 17/ago: o mapa de apelidos novo resgatou
--    atendimentos que o codigo antigo perdia (typos de "vitinho"), entao mes
--    fechado recalculado hoje da numero diferente do que a folha pagou.
--
-- ⚠️ QUEM ESCREVE AQUI e `scripts/folha-snapshot.js`, que carrega os js/*.js
-- REAIS e chama fechamentoEquipe(). Nao ha calculo de dinheiro nesta tabela nem
-- em nenhuma view -- se alguem reescrever a folha em SQL, o projeto passa a ter
-- dois donos do mesmo numero, que e como a folha saiu R$1.000 menor em jul/2026.
create table if not exists public.folha_mensal (
  mes                text    not null,          -- 'YYYY-MM'
  func_id            text    not null,          -- id do FUNC (= apelidos.chave)
  nome               text,
  aparelhos          integer not null default 0,
  vendas_vendidas    integer not null default 0,
  vendas_atendidas   integer not null default 0,
  acess_qtd          integer not null default 0,
  acess_bruto        numeric not null default 0,
  acess_lucro        numeric not null default 0,
  comissao_vendedor  numeric not null default 0,
  comissao_atendente numeric not null default 0,
  bonus_meta         numeric not null default 0,  -- meta individual de acessorio
  bonus_coletivo     numeric not null default 0,
  bonus_extra        numeric not null default 0,  -- os 5% da Anne sobre o lucro da rede
  total_variavel     numeric not null default 0,
  fechado_em         timestamptz not null default now(),
  fechado_por        text,
  primary key (mes, func_id)
);

comment on table public.folha_mensal is
  'Snapshot da folha por pessoa/mes, gravado por scripts/folha-snapshot.js rodando o fechamentoEquipe() real. Mes fechado nao recalcula. Ver docs/PLANO-UPGRADE-2026-08.md.';

alter table public.folha_mensal enable row level security;

-- Escrita: so socio (o script usa service_role e nem passa por aqui).
drop policy if exists folha_mensal_socio on public.folha_mensal;
create policy folha_mensal_socio on public.folha_mensal
  for all to authenticated using (public.eh_socio()) with check (public.eh_socio());

-- Leitura do colaborador: SO A PROPRIA LINHA. Casa pelas chaves do perfil --
-- id do FUNC e a mesma string da chave (vitinho, anne, david...).
drop policy if exists folha_mensal_minha on public.folha_mensal;
create policy folha_mensal_minha on public.folha_mensal
  for select to authenticated using (
        (public.meu_vo_key() is not null and func_id = public.meu_vo_key())
     or (public.meu_at_key() is not null and func_id = public.meu_at_key()));

create index if not exists idx_folha_mensal_func on public.folha_mensal (func_id, mes desc);

-- ===========================================================================
-- REFERENCIA PRA CONFERIR O PRIMEIRO SNAPSHOT (jul/2026, medido em 17/ago)
--
-- So o que da pra medir em SQL -- faixas de meta e bonus coletivo ficam no JS:
--
--   pessoa     aparelhos vendidos    lucro de acessorio atendido
--   mel                       115                          —
--   david                      88                          —
--   isa                        70                        -26
--   maria                      49                        274
--   maju (IA)                  13                          —
--   duda (IA)                   4                          —
--   anne                        1                      6.751
--   vitinho                     1                         74
--   leo                         0                      8.603
--   davi                        0                      6.661
--   gabi                        0                      2.314
--   denilson                    0                      1.498
--
-- A comissao de atendente tem que sair 25% da coluna da direita.
-- ===========================================================================
