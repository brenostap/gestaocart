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
N1  telefone idêntico (últimos 9 dígitos)          → aceita
N2  nome normalizado idêntico                      → aceita
N3  nome com similaridade >= 0,85                  → aceita
N4  nome entre 0,70 e 0,85                         → aceita
N5  nome entre 0,45 e 0,70 COM trava de vendedor   → aceita (ver seção do N5)
    abaixo disso                                   → descarta
```

Mais três travas que hoje não existem:

- **Loja** — o blob de vendas já vem filtrado, então lead da Cart nunca casa com venda
  da Urban.
- **Janela** — o lead precisa existir antes da venda (+1 dia de folga) e a venda precisa
  cair até 45 dias depois da última mensagem dele.
- **Vendedor** — `contatos.vendedorAtribuido` = `vendas.vendedor_obs`, com a
  transferência até 30 dias antes da venda. É o que sustenta o N5.

E o **desempate**: `distinct on (venda_id)` — uma venda, um lead. Ganha o nível mais
forte; empatou, ganha quem falou por último antes da venda.

## Resultado da simulação (17/ago/2026)

⚠️ As duas tabelas abaixo são da cascata **sem o N5** (N1–N4 apenas), sobre **todas** as
vendas da loja. O ganho do N5, medido só nas vendas de VO, está na seção seguinte.

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

## Nível 5: a trava de vendedor (17/ago/2026)

O lead transferido pra um VO grava **`vendedorAtribuido` + `dataTransferencia`**
(1.104 leads de IG e 1.275 de WhatsApp desde julho, na Cart). E o painel grava
**`vendedor_obs`** em 96% das vendas. **Os nomes batem exatamente dos dois lados:
`david`, `isa`, `mel`.**

Isso é uma trava que não existia no cruzamento. Exigir *mesmo vendedor + transferência
até 30 dias antes da venda* reduz tanto o universo de candidatos que o limiar de nome
pode cair de 0,70 pra **0,45 sem gerar um único empate** (medido: 0 empates em
julho/Cart, tanto a 0,55 quanto a 0,45).

**Ganho medido — 188 vendas de VO, Cart, julho/2026:**

| nível | vendas |
|---|---|
| N1 telefone | 57 |
| N2 nome idêntico | 3 |
| N3 nome ≥ 0,85 | 0 |
| N4 nome 0,70–0,85 | 6 |
| **N5 nome 0,45–0,70 + trava de vendedor** | **31** |
| **total** | **97** |

**Cobertura: 35,1% → 51,6%.** E o ganho é quase todo do Instagram — no total o
vencedor é IG em 53 casos contra 44 do WhatsApp. Origem dos 97: Orgânico 58, Meta Ads
17, Google Ads 1, sem origem gravada 21.

⚠️ Zero empate **não é** zero erro — significa que só existe um lead plausível, não que
ele é o certo. O N5 merece uma amostra revisada à mão antes de virar produção.

## O que ainda falta (e o que só parecia faltar)

**Falta de verdade — o telefone do lead de Instagram.** Não é problema de parsing, é de
coleta:

- `contatosInstagram.telefone` guarda **o @**, não o número. Na Cart, 3 leads de IG com
  telefone real em 1.678 de agosto. Na Urban, **1 em 9.749**.
- Dos 58 leads de IG que chegaram a **agendamento** em agosto, **zero** tem telefone.
- Não está nem na conversa: só **80 de 20.887 sessões** de IG têm 8 dígitos seguidos numa
  mensagem do cliente.
- Do lado da venda é pior ainda: `clientes.instagram` tem **3 preenchidos em 4.233**.

**Não falta, e eu não estava usando:**

- **`vendedorAtribuido` + `dataTransferencia`** → virou o N5 acima.
- **A conversa liga no lead sem erro**: `n8n_chat_histories_instagram.session_id` é
  `<@ do instagram>-cart`, e casa com `contatosInstagram.telefone` em **98,8%** dos leads
  de agosto.
- **`atribuicao_clique`** já traz o anúncio (`source_id`, `headline`, `ctwa_clid`) por
  lead — 4.146 leads de WhatsApp e 3.944 de IG na Cart.

**Parecia que ajudaria e não ajuda:**

- **O nome completo que a Maju passou a pedir em agosto não está em coluna nenhuma.** Ela
  pergunta (114 sessões de IG têm "nome completo" numa fala dela), mas a resposta fica só
  no texto da conversa — `contatosInstagram.nome` continua com o *display name* do IG
  (14,1 caracteres em média nos leads com agendamento, contra 13,0 nos demais: sem
  diferença prática). **Gravar essa resposta numa coluna é a mudança mais barata da
  lista** e transformaria o N5 em N2.
- **`agendamentos`** (tabela com `nome_cliente` + `telefone_cliente`) está **parada desde
  11/mai/2026** — 137 linhas, 0 em agosto, e só 17 com telefone. O agendamento novo caiu
  em `contatos*.agendamento` / `data_agendamento`, que não guardam nome nem telefone.
- **`n8n_chat_histories_*`**: 95% das mensagens (207.649 de 218.848) estão **sem
  `created_at`** — a coluna só passou a ser preenchida em 10/ago/2026. Não dá pra usar
  janela temporal sobre o histórico.
- **Modelo**: `iPhoneInteresse` vazio em 93% dos leads. Desempate quando existe, nunca
  chave.
- ⚠️ **`origem_cliente_id` do painel NÃO é canal de marketing** — só diz
  CART/URBAN/ATACADO.
- **Chatwoot não está no Supabase** — fica no Postgres do EasyPanel. O que veio pro
  Supabase foi o histórico de mensagens do n8n.

### As três mudanças de coleta, por custo/benefício

1. **Gravar em coluna o nome completo que a Maju já pede no agendamento.** Custo: um
   campo no fluxo n8n. Vira match N2 (nome idêntico) em vez de N5.
2. **Pedir o telefone no agendamento de Instagram.** Vira match N1 — chave definitiva.
3. **Preencher o @ do cliente na FoneNinja** (`clientes.instagram`). Casaria direto com o
   `session_id`. Depende do atendente, é o mais frágil dos três.

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
