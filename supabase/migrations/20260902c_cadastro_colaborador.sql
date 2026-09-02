-- ============================================================================
-- CADASTRO DO COLABORADOR — os campos que o RH pediu (Nara, 02/set/2026).
--
-- ⚠️ POR QUE AQUI E NAO NUMA TABELA `colaboradores` NOVA:
-- `funcionarios_config` JA E a tabela de "dado editavel da pessoa" (pix,
-- telefone, e-mail, data de inicio, obs) e a tela de Equipe ja le dela por
-- `funcContato()`. Criar uma segunda tabela daria DOIS cadastros da mesma
-- pessoa, e o painel ja pagou esse preco: mapa de gente duplicado custou
-- R$1.000 na folha em jul/2026. O nome da tabela ficou velho -- ela e o
-- cadastro, nao a "config".
--
-- `data_inicio` ja existia e E a data de admissao. Nao criamos `admissao`
-- separada pelo mesmo motivo.
--
-- ⚠️ DADO PESSOAL DE VERDADE (CPF, RG, endereco, nascimento). Tres consequencias:
--   1. So `socio` e `rh` leem -- nenhum outro papel encosta.
--   2. NUNCA entra em docs/, em export publico, nem no repo (a Netlify publica
--      a raiz -- mesma razao de RR/ e notas/ estarem no .gitignore).
--   3. O painel de Equipe (socio) nao mostra estes campos: quem cadastra e o RH.
--
-- ⚠️ O RH PASSA A ESCREVER AQUI. Ate hoje o papel era so leitura (decisao do
-- dono em 02/set). Um cadastro que o RH nao pode preencher nao serve pra nada --
-- quem tem CPF, RG e endereco na mao e a Nara, nao o Breno. A escrita e SO
-- nesta tabela: folha, custos e o resto seguem fechados pra ela.
-- ============================================================================

alter table public.funcionarios_config
  add column if not exists nome_completo   text,
  add column if not exists cpf             text,
  add column if not exists rg              text,
  add column if not exists nascimento      date,
  add column if not exists sexo            text,
  add column if not exists estado_civil    text,
  add column if not exists nacionalidade   text,
  add column if not exists naturalidade    text,
  add column if not exists cargo           text,
  add column if not exists departamento    text,
  add column if not exists desligamento    date,
  add column if not exists motivo_saida    text,
  add column if not exists status          text,
  add column if not exists endereco        text,
  add column if not exists emerg_nome      text,
  add column if not exists emerg_telefone  text,
  add column if not exists emerg_parentesco text,
  add column if not exists atualizado_por  text;

comment on table public.funcionarios_config is
  'CADASTRO do colaborador (o nome da tabela e legado). Dado pessoal: so socio e rh leem. data_inicio = admissao. Ver docs/PERFIS-E-ACESSO.md.';

-- ⚠️ `status` e o registro do RH; quem decide se a pessoa entra na FOLHA
-- continua sendo `saiuEm`/cargo "(saiu)" no FUNC (js/config.js), lido por
-- saiuDaEquipe(). Sao DOIS lugares de proposito -- o RH marca o desligamento no
-- dia em que acontece, o FUNC muda quando o dono fecha o mes -- e por isso a
-- tela do RH ACUSA quando os dois discordam, em vez de escolher um calado.
alter table public.funcionarios_config drop constraint if exists funcionarios_config_status_check;
alter table public.funcionarios_config add constraint funcionarios_config_status_check
  check (status is null or status in ('ativo','ferias','afastado','desligado'));

-- Desligado sem data e um historico que nao serve: o RH pediu o cadastro
-- justamente pra "gerar um historico de pessoas que ja estiveram com voces".
alter table public.funcionarios_config drop constraint if exists funcionarios_config_desligado_com_data;
alter table public.funcionarios_config add constraint funcionarios_config_desligado_com_data
  check (status is distinct from 'desligado' or desligamento is not null);

-- -- ESCRITA DO RH ----------------------------------------------------------
-- Insert e update, nunca delete: desligar e mudar `status`, nao apagar a linha.
-- Apagar destruiria o historico que e a razao de a tabela existir.
drop policy if exists funcionarios_config_rh on public.funcionarios_config;
create policy funcionarios_config_rh_ler on public.funcionarios_config
  for select to authenticated using (public.eh_rh());
create policy funcionarios_config_rh_criar on public.funcionarios_config
  for insert to authenticated with check (public.eh_rh());
create policy funcionarios_config_rh_editar on public.funcionarios_config
  for update to authenticated using (public.eh_rh()) with check (public.eh_rh());
