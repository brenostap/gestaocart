-- ===========================================================================
-- DE QUEM E O APARELHO QUE ESTA NA ASSISTENCIA
--
-- A tabela `bancada` sabe QUAL aparelho saiu, PARA ONDE foi e HA QUANTOS DIAS
-- esta fora. Nao sabe DE QUEM ele e.
--
-- Medido em 26/ago/2026: das 168 idas, 13 sao origem='cliente' e 8 'garantia'
-- -- 21 aparelhos que tem dono la fora, e em nenhum deles da pra dizer quem e.
-- O campo `quem` nao serve: e o e-mail de quem REGISTROU a ida (hoje, sempre o
-- Vitinho).
--
-- Quem precisa dessa resposta e o pos-venda: o §6 de
-- docs/funcoes/coordenadora-pos-venda.md manda "registrar nome e contato do
-- cliente" e "atualizar o cliente" enquanto o aparelho esta fora. Sem isto, a
-- pergunta "cade o meu iPhone?" nao tem resposta no sistema.
--
-- ⚠️ SO PARA APARELHO COM DONO. Aparelho da prateleira nao tem cliente, e o
-- formulario nem pergunta -- ver bncDaPrateleira() em js/bancada.js. Deixar o
-- campo aparecer sempre convidaria a preencher errado.
--
-- RLS: as policies de `bancada` sao por LINHA (pode_operar()), entao as colunas
-- novas ja nascem protegidas. Quem le fora do papel bancada le pela view
-- v_assistencia_cliente, na migration das views do comercial.
-- ===========================================================================

alter table public.bancada add column if not exists cliente_nome text;
alter table public.bancada add column if not exists cliente_tel  text;

comment on column public.bancada.cliente_nome is
  'Dono do aparelho, quando origem <> estoque. Preenchido a mao no formulario de saida. NULL para aparelho da prateleira.';
comment on column public.bancada.cliente_tel is
  'Telefone/WhatsApp do dono, para o pos-venda avisar quando voltar. NULL para aparelho da prateleira.';
