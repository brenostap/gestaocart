-- A META COLETIVA precisa do total da REDE, e o colaborador so enxerga as
-- proprias linhas. Sem isso o "Meu dia" mostrava a comissao SEM o bonus
-- coletivo -- em ago/2026 isso e ~R$1.000 por pessoa que a tela nao contava.
-- Numero de comissao incompleto e pior que numero nenhum: a pessoa descobre a
-- diferenca no dia do pagamento.
--
-- O que sai daqui e volume e bruto: quantos aparelhos a rede vendeu e quanto
-- vendeu de acessorio. **Sem nome, sem lucro, sem dinheiro de ninguem.** Meta de
-- time e informacao de time -- e e a alavanca que o dono escolheu ("meta ao
-- vivo") em 17/ago/2026.
--
-- ⚠️ AS FAIXAS NAO ESTAO AQUI, de proposito. Elas vivem em metasColetivas()
-- (js/core.js), sao por mes e NUNCA retroativas -- ja custaram R$1.000 por
-- pessoa quando estavam copiadas em 6 lugares. Esta view devolve o numero cru;
-- quem aplica a faixa e o front.
create or replace view public.v_meta_rede_mes as
select to_char(v.data_saida,'YYYY-MM') as mes,
       count(*) filter (where public.eh_principal(p.apple_id, p.imei_1, p.valor_estoque)) as aparelhos,
       coalesce(sum(p.preco) filter (where public.eh_acessorio(p.apple_id, p.imei_1, p.valor_estoque)),0) as acess_bruto
  from public.vendas v
  join public.venda_produtos p on p.venda_id = v.id
 where public.tem_perfil()
 group by 1;

comment on view public.v_meta_rede_mes is
  'Total da rede por mes (aparelhos + bruto de acessorios) para a meta coletiva. Sem nome e sem lucro. As faixas ficam em metasColetivas() no js/core.js.';

revoke all on public.v_meta_rede_mes from public, anon;
grant select on public.v_meta_rede_mes to authenticated;

-- ===========================================================================
-- O QUE NAO CABE AQUI, e por que
--
-- A Anne tem 5% do LUCRO de acessorios da rede (`bonus:true` no FUNC). Lucro da
-- rede e dinheiro de terceiros -- nao vai pro navegador de ninguem. A tela dela
-- avisa que esse extra sai no fechamento, em vez de mostrar um total que ela
-- descobriria incompleto depois. Fecha de vez com o snapshot da folha.
--
-- Medido em 17/ago/2026 (mes corrido ate o dia 17):
--   jun/2026  429 aparelhos · R$39.041 de acessorio
--   jul/2026  355 aparelhos · R$38.435
--   ago/2026  232 aparelhos · R$20.760
-- ===========================================================================
