-- ============================================================================
-- APAGAR DA BANCADA deixa de ser só do sócio (02/set/2026, decisão do dono).
--
-- ⚠️ ERA SÓ DO SÓCIO DE PROPÓSITO. A linha da `bancada` é o registro de que o
-- aparelho SAIU DA LOJA, e sumir com ela calada é exatamente o buraco que a
-- tabela nasceu pra fechar: em 12/ago/2026 eram 43 aparelhos e R$87 mil
-- marcados `available` estando fisicamente na assistência.
--
-- Por que mudou: quem registra a saída é o Vitinho, e quem percebe o registro
-- errado é ele, na hora. Mandar o erro pro dono resolver deixa a lista de "não
-- vender" errada no meio-tempo — e essa lista é o que impede o balcão de vender
-- aparelho que está fora.
--
-- ⚠️ NÃO HÁ TRAVA POR VALOR, e é bom saber por quê: `bancada.valor_cobrado`
-- está NULO nas 187 linhas. O dinheiro mora em `reparos`, casado por contenção
-- no JS — então "só apaga o que não tem valor" não protegeria nada.
-- A proteção real é a Conferência: apagar a ida não apaga a nota, e a nota
-- reaparece como "na nota sem registro". Fica visível, não some.
--
-- ⚠️ `pode_operar()` é a MESMA regra que guarda estoque_correcoes e
-- estoque_estado, e o espelho no JS é `podeCorrigirEstoque()` (shell.js),
-- lido por `bncPodeExcluir()`. Mudou uma, muda a outra: senão a tela oferece
-- o botão e a API devolve 403.
-- ============================================================================
drop policy if exists bancada_apaga_socio on public.bancada;
create policy bancada_apaga_opera on public.bancada
  for delete to authenticated using (public.pode_operar());

-- ⚠️ O "desfazer" da aba Voltaram apagava `voltou_em` SEM GUARDAR O VALOR.
-- Um toque errado no celular reabria a ida, e o aparelho voltava pra lista de
-- "não vender" do grupo -- a loja para de vender um aparelho que está na
-- prateleira. Aconteceu com o dono em 02/set/2026, e nem o log da API guarda o
-- corpo do PATCH: a data era irrecuperável. Agora ela vem pra cá, e o desfazer
-- pode ser desfeito pra sempre (não por 10 segundos de toast).
alter table public.bancada add column if not exists voltou_em_anterior date;
comment on column public.bancada.voltou_em_anterior is
  'A data que o desfazer apagou. Ver bncDesfazerBaixa/bncRefazerBaixa em js/bancada.js.';
