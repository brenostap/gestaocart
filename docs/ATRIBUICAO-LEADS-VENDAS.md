# Atribuição: de onde a venda veio

De qual lead (e portanto de qual canal/anúncio) veio cada venda. O cruzamento
original é do **Dudu** (dev da Maju), e vive nos projetos Supabase dele:
`supabase-cart` (`cmzptavlhdfklpfdcynf`) e `supabase-urban` (`exhlzstyukhcnrravmoc`).

Este documento é o diagnóstico de 17/ago/2026 e a cascata proposta. O código está em
`scripts/atribuicao/`. **Nada foi gravado em nenhum banco** — a simulação é só `SELECT`.

## A cadeia inteira

```
atribuicao_clique          →  contatos*              →  match_resultado  →  vendas (painel)
(anúncio: source_id,          (lead: nome, telefone,    (o cruzamento)      (valor, lucro,
 headline, ctwa_clid)          igsid, origem)                                produto, loja)
```

Ela já existe ponta a ponta. O elo fraco é só o do meio.

## O que tem hoje

`match_resultado` existe nos dois projetos, mesmo schema:
`id_venda · nome_phoneninja · nome_supabase · telefone · similaridade · tipo_match · confirmado · logged_at`

**`id_venda` é o `vendas.id` do painel** — bate 100%, é a mesma chave da FoneNinja.
O campo `telefone` guarda telefone quando o lead veio do WhatsApp e **@ do Instagram**
quando veio do IG.

| tipo_match | Cart | confirmado | Urban | confirmado |
|---|---|---|---|---|
| telefone | 588 | 588 (100%) | 65 | 65 (100%) |
| nome_instagram | 482 | 104 (22%) | 288 | 37 (13%) |
| nome | 251 | 8 (3%) | 140 | 1 (0,7%) |

⚠️ **O matcher do Dudu é conservador e está certo.** Em julho/Cart ele só confirmou
telefone (105) e nome com similaridade ≥ 0,70 (14). **Nada abaixo de 0,70 virou
`confirmado`.** O problema não está nele.

## Os 3 defeitos (e onde eles moram)

**1. O write-back aceita coisa que o matcher não confirmou.**
Julho/Cart: `contatos*.id_venda` marca **179 vendas**, mas só **115** têm um
`confirmado=true` correspondente em `match_resultado`. As outras **64 vieram de outra
fonte** — provavelmente o n8n marcando na hora, sem passar pela cascata.

**2. Uma venda é reivindicada por vários leads.**
Julho/Cart: 269 linhas de lead marcando 179 vendas → **72 vendas (40%) com mais de um
lead**. Na base inteira da Cart são 331 de 1.124 (29%). Isso é contagem dupla direta no
ROAS. Nada no fluxo obriga "uma venda = um lead".

**3. Não existe trava de loja.**
As duas bases cruzam o mesmo universo de vendas. A venda `40610383` (loja **urban**)
aparece nas duas: na Urban casou 1,00 com o @ certo do cliente, na Cart casou 0,45 por
nome com outra pessoa. Não há nada que impeça.

## A cascata proposta

```
N1  telefone idêntico (últimos 9 dígitos)   → aceita
N2  nome normalizado idêntico               → aceita
N3  nome com similaridade >= 0,85           → aceita
N4  nome entre 0,70 e 0,85                  → revisar
    abaixo de 0,70                          → descarta
```

Mais duas travas que hoje não existem:

- **Loja** — o blob de vendas já vem filtrado, então lead da Cart nunca casa com venda
  da Urban.
- **Janela** — o lead precisa existir antes da venda (+1 dia de folga) e a venda precisa
  cair até 45 dias depois da última mensagem dele.

E o **desempate**: `distinct on (venda_id)` — uma venda, um lead. Ganha o nível mais
forte; empatou, ganha quem falou por último antes da venda.

## Resultado da simulação (17/ago/2026)

**Cart — julho/2026, 261 vendas**

| | cascata | hoje |
|---|---|---|
| vendas atribuídas | 104 (39,8%) | 152 (58,2%) |
| das quais por telefone | 95 | — |
| nome idêntico | 3 | — |
| nome 0,70–0,85 (revisar) | 6 | — |
| **vendas com mais de um lead** | **0** (desempate) | **55** |
| concordam com hoje (mesmo lead) | 97 | — |
| hoje escolhe outro lead | 2 | — |
| só hoje pega | 53 | — |
| só a cascata pega | 5 | — |

**Urban — julho+agosto/2026, 134 vendas**

| | cascata | hoje |
|---|---|---|
| vendas atribuídas | 19 (14,2%) | 51 (38,1%) |
| das quais por telefone | 14 | — |
| nome idêntico | 5 | — |
| **vendas com mais de um lead** | **0** | **13** |
| concordam com hoje | 18 | — |
| hoje escolhe outro lead | 0 | — |
| só hoje pega | 33 | — |
| só a cascata pega | 1 | — |

**Leitura:** a cascata é um subconjunto quase perfeito do que existe hoje — concorda em
97/104 (Cart) e 18/19 (Urban), e **em nenhum caso escolhe um lead diferente por engano**.
Ela entrega menos volume e **zero duplicata**. Os 53+33 que só o método atual pega vêm
justamente das marcações sem `confirmado` e dos nomes abaixo de 0,70.

## Teto de cobertura (o que trava, e não é o algoritmo)

- **Instagram não tem telefone.** Na Urban, 9.749 leads de IG e **1** com telefone. IG é
  80% do volume dela. Enquanto a Maju não pedir o telefone (ou o painel não guardar o @),
  IG só casa por nome. Do lado da venda é pior: `clientes.instagram` tem **3
  preenchidos em 4.233**.
- **Modelo quase não ajuda.** `iPhoneInteresse` vem vazio em 93% dos leads de julho. Fica
  como desempate quando existe, nunca como chave.
- ⚠️ **`origem_cliente_id` do painel NÃO é canal de marketing** — só diz
  CART/URBAN/ATACADO. Não serve pra atribuição.

O que move o ponteiro de verdade é **pedir/registrar o telefone no atendimento de
Instagram**. Sem isso, ~60% das vendas da Urban não têm como ser atribuídas com
confiança, por melhor que seja o matcher.

## O que o painel tem e o cruzamento não usa

| Dado | Cobertura | Pra que |
|---|---|---|
| `vendas.cliente_tel` | 97,5% | chave forte |
| `clientes.telefone` | 98,9% | idem, via `cliente_id` |
| `vendas.loja` | 100% | trava de loja |
| `vendas.data_saida` | 100% | janela lead→venda |
| `valor_total`, `lucro` | 100% | ROAS por anúncio, não contagem de lead |
| `venda_produtos.titulo` | 100% | desempate por modelo (quando o lead informou) |

## Próximo passo proposto

Rodar o cruzamento **no painel** (que já tem venda + produto + cliente + loja) e gravar
uma tabela `venda_origem`:

```
venda_origem(venda_id, loja, canal, campanha, lead_id, projeto, metodo, confianca, decidido_em)
```

Uma linha por venda, auditável, com `metodo` dizendo por que casou. Aí o painel mostra
**receita e lucro por canal**, não contagem de lead. Isso exige espelhar os leads no
painel (ou o Dudu expor uma view), e é decisão a combinar com ele.

⚠️ Antes de gravar qualquer coisa: `venda_origem` seria **tabela do painel**, então
escrita por `eh_socio()` como `custos`/`metas_mensais` (ver `docs/PERFIS-E-ACESSO.md`).
