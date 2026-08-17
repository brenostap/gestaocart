-- ⚠️⚠️ ESTADO TEMPORARIO -- 17/ago/2026, ~19h50 BRT ⚠️⚠️
--
-- Isto DESFAZ 20260817_estoque_tabela_so_do_socio.sql de proposito, e precisa
-- ser desfeito de volta assim que o deploy da Netlify voltar.
--
-- O QUE ACONTECEU
-- A conta da Netlify estourou o credito de build:
--   error_message: "Skipped due to account credit usage exceeded"
-- O ultimo deploy publicado e de 17:03 UTC (14:03 BRT), commit f073379 -- que
-- nem e do trabalho de perfis. Todo o front novo (Meu dia, Vitrine, leitura por
-- view, telas honestas de erro) esta no GitHub e NAO esta no ar.
--
-- Resultado: banco fechado as 18h + front parado as 14h. O codigo velho le a
-- TABELA `estoque`, que passou a devolver zero linha para bancada e comercial.
-- E RLS nao da erro: devolve 200 com lista vazia. Entao a tela aparecia como
-- "estoque zerado" -- que parece dado, nao parece bug. O Vitinho e o David
-- ficaram sem conseguir trabalhar, e levou uma hora pra achar porque ninguem
-- desconfia de uma lista vazia.
--
-- O CUSTO DE REABRIR, dito na cara
-- `estoque.valor_estoque` (custo do aparelho) volta a ser alcancavel pela API
-- por quem tem perfil. E a mesma exposicao que existia desde 13/ago e que a
-- migration de hoje tinha fechado. Nao vaza na TELA (money() devolve '—' pra
-- quem nao ve margem) -- vaza pra quem abrir o console e montar a chamada.
--
-- COMO DESFAZER (assim que o deploy sair)
--   drop policy if exists estoque_leitura on public.estoque;
--   create policy estoque_leitura on public.estoque
--     for select to authenticated using (public.eh_socio());
--
-- A view `v_estoque_vitrine` continua existindo e funcionando -- ela nao depende
-- desta policy. Quando o front novo subir, ele ja le por ela, e esta linha aqui
-- vira a unica coisa que sobra pra reverter.
--
-- ⚠️ Executado PELO DONO no SQL Editor: a trava automatica do agente recusa
-- afrouxar policy de seguranca, e nesse caso ela esta certa.
drop policy if exists estoque_leitura on public.estoque;

create policy estoque_leitura on public.estoque
  for select to authenticated using (public.tem_perfil());

comment on policy estoque_leitura on public.estoque is
  'TEMPORARIO (17/ago/2026): reaberto porque a Netlify parou de publicar e o front antigo le a tabela. Refechar em eh_socio() assim que o deploy voltar. Ver docs/PERFIS-E-ACESSO.md.';
