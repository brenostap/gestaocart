-- Fecha o item que docs/PERFIS-E-ACESSO.md listava como aberto desde 13/ago:
-- `estoque.valor_estoque` (custo do aparelho) era alcancavel pela API por
-- qualquer perfil. A tela escondia com money(); o banco, nao.
--
-- RLS e por LINHA, nao por coluna -- entao esconder a coluna exigia trocar a
-- FONTE. Quem nao e socio le agora `v_estoque_vitrine`, que nao tem
-- `valor_estoque` nem `ultimo_fornecedor` (brief §2: colaborador nao ve custo
-- nem fornecedor).
--
-- ⚠️ Esta migration so pode subir JUNTO com o front que troca a fonte
-- (js/data.js -> loadBancadaData). Sozinha, ela deixa a tela do Vitinho vazia.
drop policy if exists estoque_leitura on public.estoque;

create policy estoque_leitura on public.estoque
  for select to authenticated using (public.eh_socio());

comment on policy estoque_leitura on public.estoque is
  'So socio le a tabela. Bancada e comercial leem public.v_estoque_vitrine (sem custo, sem fornecedor).';

-- A vitrine precisa continuar servindo a tela de Assistencia, que trabalha com
-- o aparelho que esta na loja -- mesma condicao que a carga ja usava.
create or replace view public.v_estoque_vitrine as
select e.id, e.titulo, e.serial, e.imei_1, e.bateria,
       e.preco_varejo, e.status, e.observacoes, e.created_at
  from public.estoque e
 where public.tem_perfil() and e.status = 'available';

revoke all on public.v_estoque_vitrine from public, anon;
grant select on public.v_estoque_vitrine to authenticated;

-- ===========================================================================
-- CONFERENCIA (17/ago/2026)
--
--                          | Vitinho (bancada) | socio
--   estoque (TABELA)       |                 0 | 1.722
--   v_estoque_vitrine      |               215 |   215
--   bancada                |               103 |   103
--   estoque_correcoes      |                 0 |     0  (tabela vazia de verdade)
--   estoque_estado         |                 0 |     0  (tabela vazia de verdade)
--   v_minhas_vendas        |               548 |     0  (socio nao tem chave)
--
-- No front, test/perfis.test.js passou a provar que item vindo da view (sem
-- valor_estoque) da custo=null e margem=null -- e NAO custo=0, que viraria
-- "margem = preco cheio", numero inventado esperando alguem mostrar.
-- ===========================================================================
