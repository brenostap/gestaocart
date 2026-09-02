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

⚠️ **Existem DOIS conjuntos de "venda atribuída", e eles dão respostas muito diferentes.** Confundi-los
foi o meu primeiro erro nesta análise; a diferença é o defeito nº1 do `ATRIBUICAO-LEADS-VENDAS.md`
("o write-back aceita coisa que o matcher não confirmou").

| | o que é | cobertura de agosto | contagem dupla |
|---|---|---:|---:|
| **write-back** (`contatos*.id_venda`) | o fluxo marcando na hora | **235 vendas (61%)** | **87 (23%)** |
| **confirmado** (`match_resultado.confirmado`) | o matcher conservador do Dudu | **133 vendas (35%)** | **5 (1,3%)** |

**A escolha é entre cobertura e limpeza, e não dá pra ter as duas hoje.**

Pelo **confirmado**:

| | Cart real | Urban real | **total** |
|---|---:|---:|---:|
| confirmado nos **dois** bancos | 2 | 3 | **5** |
| só a Cart confirmou | 110 | **6** ⚠️ | 116 |
| só a Urban confirmou | **1** ⚠️ | 11 | 12 |
| **sem confirmação** | 163 | 88 | **251** |

Pelo **write-back**:

| | Cart real | Urban real | **total** |
|---|---:|---:|---:|
| os **dois** bancos reivindicam ⚠️ | 62 | 25 | **87** |
| só a base Cart | 101 | **15** ⚠️ | 116 |
| só a base Urban | **7** ⚠️ | 25 | 32 |
| nenhum lead | 106 | 43 | 149 |

**O que fica de pé nos dois:**

🔴 **O write-back é onde mora o problema.** 87 vendas em dois ROAS e 22 na loja errada — e a Urban
chega a reivindicar 119 vendas num mês em que teve 108. O matcher do Dudu está certo e é
conservador; **quem infla é o que grava por fora dele**. Somar Cart + Urban pelo write-back hoje
infla 23%.

⚠️ **A taxa de confirmação é muito desigual entre as lojas:** a Cart confirma 121 de 251
reivindicadas (48%), a **Urban só 17 de 136 (12,5%)**. Não é a Urban rastrear pior — é que ela
depende mais do Instagram, que casa por @ e nome. A base inteira já mostrava isso: telefone confirma
100%, `nome_instagram` 13–22%.

⚠️ **Entre 149 e 251 vendas do mês não têm lead.** Balcão, indicação, cliente que voltou — ou o
rastro se perdeu. É a maior fatia cega, e ela vale de R$534 mil a R$1,03 milhão.

### Quantas vendas dá pra puxar dos leads, afinal

A resposta é uma escada, e cada degrau tem uma certeza diferente:

| nível | vendas | % das 384 | valor |
|---|---:|---:|---:|
| **as duas fontes curadas concordam** | **80** | 21% | R$ 318.040 |
| pelo menos uma confirmou (a união) | **174** | **45%** | R$ 773.436 |
| algum lead reivindica (inclui write-back) | 235 | 61% | — |
| **nenhum lead, em fonte nenhuma** | **149** | 39% | R$ 534.667 |

⚠️ **As duas fontes curadas concordam em só 60% dos casos.** O `match_resultado` do Dudu confirma
133, o `venda_origem` do painel confirma 121, e a interseção é **80**. Sobram 53 que o Dudu confirmou
e o painel não tem, e 41 que o painel tem e o Dudu não confirmou.

Não é uma delas estar errada — são cascatas diferentes rodadas em momentos diferentes. Mas significa
que **"venda atribuída" não é uma coisa só nesta casa**, e qualquer relatório precisa dizer de qual
está falando. Reconciliar as duas é trabalho pequeno e devolve ~40 vendas de cobertura.

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

⚠️ **Os `% comprou` acima usam o write-back.** Refeitos só com o confirmado, o WhatsApp quase não
se mexe (Orgânico 17/17, Meta Ads 17/18, Instagram Orgânico 24/28) e o **Instagram cai pela metade**
(Orgânico 16→9, Meta Ads 6→3). O motivo é estrutural: WhatsApp casa por telefone, Instagram por @.
Então **o número do Instagram está entre 0,60% e 1,06% — é piso, não medição.** Dá pra afirmar que
ele converte pior; não dá pra afirmar quanto pior.

✅ **As taxas de transferência não dependem de casamento nenhum** — 26,7%, 47,3%, 49,3% são medidas
diretas e valem como estão.

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

**1. Fazer o write-back respeitar o matcher.** Ele marca 87 vendas em dois bancos e 22 na loja
errada; o `match_resultado.confirmado` marca 5 e 7. O matcher já está certo — falta o que grava por
fora dele passar pela cascata. Enquanto isso, **use o confirmado pra dinheiro e o write-back só pra
direção**, e nunca some Cart + Urban pelo write-back.

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
