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
