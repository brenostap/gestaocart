# A jornada do cliente em agosto/2026 — de onde vieram as 384 vendas

Cruzamento do painel (`vendas`, `venda_origem`) com os dois bancos do Dudu
(`supabase-cart`, `supabase-urban`): leads, cliques de anúncio, gasto de mídia e as
**48.010 mensagens** que a Maju trocou no WhatsApp da Cart no mês.

---

## ⚠️ Leia isto antes dos números

**1. Não julgue a IA pela conversão.** Regra do `docs/PLANO-QUALIDADE-IA.md` §0, e ela vale aqui:
conversão é rara (~1% dos leads), lenta (**mediana de 8 dias, p75 de 84**) e confundida — quando a
mídia piora, a conversão cai e a IA parece pior sem ter mudado nada. Toda comparação abaixo é
**dentro do mesmo segmento** (mesmo canal, mesma origem).

**2. A coorte de agosto está imatura.** Com p75 de 84 dias, boa parte dos leads de agosto ainda vai
comprar em outubro. Todo `% comprou` aqui é **piso**, não total.

**3. A atribuição tem contagem dupla conhecida** — `docs/ATRIBUICAO-LEADS-VENDAS.md`, defeito nº2 e
nº3. Medido de novo em agosto e continua: ver a seção seguinte.

---

## 1. O mapa: quantas vendas são rastreáveis

| a venda é reivindicada por… | Cart real | Urban real | **total** | valor |
|---|---:|---:|---:|---:|
| **os DOIS bancos** ⚠️ | 62 | 25 | **87** | R$ 426.414 |
| só a base Cart | 101 | **15** ⚠️ | 116 | R$ 456.651 |
| só a base Urban | **7** ⚠️ | 25 | 32 | R$ 171.662 |
| **nenhum lead** | 106 | 43 | **149** | R$ 534.667 |
| | 276 | 108 | **384** | R$ 1.589.395 |

**Três leituras, em ordem de gravidade:**

🔴 **87 vendas (23%) estão contadas nos dois bancos.** R$426 mil aparecendo em dois ROAS ao mesmo
tempo. Qualquer soma de "vendas atribuídas" feita hoje somando Cart + Urban infla 23%.

🔴 **22 vendas estão na base da loja errada** — 15 vendas Urban reivindicadas só pela base da Cart
e 7 Cart reivindicadas só pela Urban. Não existe trava de loja, e a Urban chega a reivindicar
**119 vendas num mês em que teve 108**.

⚠️ **149 vendas (39%, R$534 mil) não têm lead nenhum.** Balcão, indicação, cliente que voltou. Não é
falha de rastreio necessariamente — é uma fatia grande do faturamento que a mídia não explica.

**O `venda_origem` do painel (a versão curada) é mais conservador e por isso mais confiável:** 121
confirmadas, 14 prováveis, 85 avaliadas sem lead, **164 nunca avaliadas**. Cobertura de 57%.

---

## 2. De onde vieram — as 121 vendas confirmadas

| canal | origem | vendas | valor |
|---|---|---:|---:|
| WhatsApp | Orgânico | 27 | R$ 95.555 |
| WhatsApp | Instagram Orgânico | 22 | R$ 78.860 |
| WhatsApp | Meta Ads | 20 | R$ 103.475 |
| Instagram | (canal sem origem) | 17 | R$ 76.928 |
| Instagram | Orgânico | 15 | R$ 84.620 |
| WhatsApp | (sem origem) | 9 | R$ 32.380 |
| Instagram | Meta Ads | 7 | R$ 46.470 |
| WhatsApp | Google Ads | 4 | R$ 12.990 |

**Orgânico é 64 das 121** (53%). Mídia paga confirmada: 31 vendas (26%).

---

## 3. O funil por segmento — a parte que a IA controla

Leads **criados em agosto**, transferência (rápida, completa) e compra (lenta, piso). Cart:

| canal | origem | leads | transferiu | **% transf** | comprou | % comprou |
|---|---|---:|---:|---:|---:|---:|
| Instagram | Orgânico | 1.512 | 403 | 26,7% | 15 | 1,0% |
| Instagram | Meta Ads | 1.327 | 265 | **20,0%** | 6 | **0,5%** |
| WhatsApp | Meta Ads | 1.027 | 348 | 33,9% | 18 | 1,8% |
| **WhatsApp** | **Instagram Orgânico** | 444 | 210 | **47,3%** | 28 | **6,3%** |
| WhatsApp | Google Ads | 279 | 58 | 20,8% | 3 | 1,1% |
| **WhatsApp** | **Orgânico** | 223 | 110 | **49,3%** | 17 | **7,6%** |

Urban:

| canal | origem | leads | transferiu | % transf | comprou | % comprou |
|---|---|---:|---:|---:|---:|---:|
| Instagram | Meta Ads | 1.263 | 222 | 17,6% | 14 | 1,1% |
| Instagram | Orgânico | 629 | 167 | 26,6% | 8 | 1,3% |
| WhatsApp | Meta Ads | 531 | 186 | 35,0% | 16 | 3,0% |

**Controlando pelo canal — que é a única comparação honesta — orgânico ganha do pago nos dois
lados:** no Instagram da Cart, 26,7% × 20,0% de transferência e 1,0% × 0,5% de compra; no WhatsApp,
49,3% × 33,9% e 7,6% × 1,8%.

⚡ **O caminho mais forte da casa é Instagram → WhatsApp.** 47,3% de transferência e **6,3% de
compra**, contra 1,0% de quem fica no direct do Instagram. E entre as vendas atribuídas a esse
caminho, a **mediana do lead até a compra é 0,4 dia** — o cliente sai do Instagram, chama no
WhatsApp e compra no mesmo dia. Nenhum outro segmento chega perto.

O contraste: quem fica no Instagram compra em mediana **13,5 dias** (orgânico) a **22,8** (Meta Ads).

---

## 4. O dinheiro

| | gasto em ago | leads | R$/lead | vendas (piso) | R$/venda (teto) |
|---|---:|---:|---:|---:|---:|
| Meta **Cart** | R$ 20.688,30 | 2.354 | R$ 8,79 | 24 | R$ 862 |
| Meta **Urban** | R$ 10.402,58 | 1.794 | **R$ 5,80** | 30 | **R$ 347** |
| Google Cart | R$ 1.961,60 | 279 | R$ 7,03 | 3 | R$ 654 |

✅ **Validação:** o gasto do banco do Dudu bate com o que lancei em Custos. Meta Cart R$20.688 +
13,8% de imposto (COFINS+PIS+ISS) ≈ **R$24.166**, exatamente o lançado. Mesma coisa na Urban e no
Google. As duas fontes concordam.

**A mídia da Urban é 2,5× mais barata por venda que a da Cart** — R$347 contra R$862 — mesmo com a
Urban tendo aumentado a verba 33% (R$9k → R$12k). Os dois números são teto: a coorte é imatura.

---

## 5. Como a Maju vendeu — os padrões nas 48.010 mensagens

**A classificação de intenção *é* a transferência.** `motivoContato='compra'` transfere 100% das
vezes; sem essa marca, transfere 0%. 726 dos 1.977 leads do WhatsApp (37%) foram classificados como
compra. **Dos 1.231 sem classificação, 9 compraram assim mesmo** — vieram por fora.

| desfecho | leads | msgs do cliente | msgs da Maju | ferramentas | **% usou ferramenta** |
|---|---:|---:|---:|---:|---:|
| a Maju não transferiu | 1.161 | 5,6 | 8,2 | 1,7 | **65,5%** |
| transferido, sem compra | 627 | 11,7 | 15,7 | 3,7 | **100%** |
| comprou | 66 | 13,7 | 17,7 | 3,8 | 93,9% |

**A conversa que transfere tem o dobro de mensagens do cliente** (11,7 × 5,6). E **100% das
transferidas usaram alguma ferramenta**, contra 65,5% das que morreram. Consultar estoque ou
calcular parcela é o portão.

⚠️ **Mas a conversa transferida-que-comprou é quase idêntica à transferida-que-não-comprou**
(13,7 × 11,7 mensagens). Ou seja: **depois da transferência, a conversa da IA não distingue mais
nada.** Isso confirma a decomposição do plano — o trabalho da IA acaba na transferência, e o que
decide a venda dali pra frente é outra coisa.

**As ferramentas que ela chama:**

| ferramenta | chamadas | leads | % que transferiu |
|---|---:|---:|---:|
| `consulta_produto` | 1.780 | 1.071 | 41,6% |
| `calcula_parcelamento` | 1.550 | 911 | 46,3% |
| `transfereHumano` | 963 | 704 | 97,2% |
| `salvar_aparelho` | 172 | 170 | **51,8%** |
| **`avalia_upgrade`** | **25** | **24** | 45,8% |

---

## 6. O que NÃO teve — e é o mais acionável

🔴 **A Maju pergunta da troca e quase nunca avalia.** **720 dos 1.977 leads (36%)** têm dado de
trade-in coletado. `avalia_upgrade` foi chamada **25 vezes — 1,2% dos leads**.

Isso importa porque **34,1% das vendas de agosto tiveram troca** (131 vendas, R$275.615 em aparelhos
de entrada) e porque, segundo `docs/ANALISE-JUN-JUL-2026.md`, **troca é o melhor canal de compra da
casa: ~1,5× a margem** de um aparelho comprado de fornecedor. Ela entra pela metade do custo e sai
pelo mesmo preço.

O cliente que quer trocar diz isso pra Maju, ela anota — e ele espera o humano pra saber quanto vale.

⚠️ **409 retentativas de transferência em agosto** para 704 leads transferidos: mais da metade das
transferências não pega de primeira. Há ainda 15 falhas silenciosas registradas em
`transfer_falhas` (a tabela existe exatamente porque a Evolution devolve `success` mesmo quando o
número não recebe).

⚠️ **`salvar_aparelho` tem a maior taxa de transferência (51,8%)** e foi chamada em só 170 leads.
Vale entender o que ela faz e por que quem passa por ela converte mais.

---

## 7. O que fazer com isso

**1. Fechar a contagem dupla antes de qualquer decisão de verba.** 87 vendas nos dois bancos e 22 na
loja errada. Enquanto isso não tiver trava, ROAS por loja é ficção. É o defeito nº2/nº3 do
`ATRIBUICAO-LEADS-VENDAS.md`, medido de novo e ainda aberto.

**2. Fazer a Maju avaliar troca.** É a única mudança aqui que mexe em margem, não em volume: 36% dos
leads dão o dado e 1,2% recebem avaliação, num produto que rende 1,5× mais.

**3. Empurrar Instagram → WhatsApp deliberadamente.** 6,3% de compra e mediana de 0,4 dia contra
1,0% e 13,5 dias de quem fica no direct. O caminho já existe e é o melhor da casa; hoje ele acontece
por acaso.

**4. Investigar as 409 retentativas.** Transferência que não pega é lead quente esfriando.

**5. Avaliar as 164 vendas nunca processadas** pelo `scripts/atribuicao/`. São R$682 mil sem
qualquer leitura de origem — a maior fatia cega do mês.

---

*Fontes: `vendas`/`venda_origem` (painel), `contatosBreno`/`contatosInstagram`/`atribuicao_clique`/
`meta_spend_diario`/`google_spend_diario`/`n8n_chat_histories_maju_v2` (supabase-cart),
`contatosWhatsApp`/`contatosInstagram` (supabase-urban). Escrito em 01/set/2026.*
