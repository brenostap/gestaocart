# A Maju em 10 dias — o que dá pra consertar (20/ago/2026)

Análise da janela **10 a 19/ago/2026** (10 dias completos; 20/ago ficou de fora porque conversa de
hoje ainda está viva e contaminaria a leitura de "morreu"). Fonte: `n8n_chat_histories_maju_v2` +
`contatosBreno`, projeto `supabase-cart`. Só WhatsApp, só Cart, só `SELECT`.

**Recorte de trabalho:** sessão com preço dado e 5+ mensagens do cliente. 666 sessões novas na
janela, **390 no recorte**. É o mesmo recorte de `scripts/maju/metricas-semanais.sql`, então tudo
aqui compara com o que já foi medido antes.

---

## ⭐ O resumo, se você só ler uma coisa

**131 das 390 conversas qualificadas (34%) morrem com uma pergunta da Maju pendurada e ninguém
acionado.** E o balde mais gritante: **34 conversas em que a última coisa que ela faz é convidar
pra loja sem pedir um dia — dessas, 0 (zero) foram transferidas.** Nenhuma.

A alavanca com melhor evidência não é insistir mais nem escalar mais: é **ela perguntar o dia**.
Hoje ela pergunta em 24,6% das conversas qualificadas. Quando pergunta, o cliente dá uma data em
43% dos casos contra 8% quando ela não pergunta — e conversa com data marcada converte 14,9%
contra 3,4%.

---

## O que mudou desde julho (série, não foto)

Mesma regex nas quatro coortes — é assim que se separa "mudou o comportamento" de "meu regex é
diferente do relatório antigo".

| coorte | sessões | convidou p/ loja | perguntou o dia | cliente deu data | **transferiu** |
|---|---|---|---|---|---|
| jun (prompt antigo) | 1.993 | **89,1%** | 27,1% | 22,2% | 48,0% |
| jul até 26 (o fundo) | 1.558 | 83,2% | 18,3% | 17,3% | 36,1% |
| 27/jul–09/ago | 702 | 62,0% | 22,2% | 19,9% | 50,4% |
| **10–19/ago (janela)** | **390** | **59,2%** | 24,6% | 20,5% | **54,4%** |

**A transferência subiu 18 pontos desde o fundo de julho — e o convite pra loja caiu 30.** O prompt
novo trocou convite por handoff. Não é necessariamente errado, mas é uma troca que ninguém decidiu
explicitamente, e o agendamento não acompanhou: `contatosBreno.agendamento` fica **plano em 6–7%**
desde junho, sem tendência.

⚠️ **Ressalva no agendamento:** esse campo é preenchido pelo fluxo da Maju, não pela vendedora. Se
o humano marca a visita pelo WhatsApp pessoal, nunca é registrado. A linha plana pode ser buraco de
medição, não fato de negócio. **Não decida em cima dela sem confirmar com o Dudu quem grava esse
campo.**

## Datando as mudanças de prompt pelo próprio dado

Não precisamos depender de memória pra saber o que comparar com o quê. As chamadas de ferramenta
por semana marcam as viradas:

| virada | evidência |
|---|---|
| **~06/jul** | `Think` cai de 10–32% pra 0,2% das sessões |
| **27/jul** | `transfereHumano` salta 20,5% → 34,1%; `salvar_aparelho` dobra (4,1% → 8,2%) |
| **~01–03/ago** | avaliação de troca migra de `avalia_upgrade` pra dentro do `calcula_parcelamento` |

⚠️ **O terceiro NÃO é regressão, é refactor.** `avalia_upgrade` desabou de 8,7% pra 0,2% das
sessões e parecia ferramenta morta. É consolidação: as chamadas de `calcula_parcelamento` que
carregam o aparelho do cliente saltaram de 0,6% pra 35,2% na mesma semana. Falso alarme, descartado.

## As regras que o comportamento dela revela

Não li o prompt. Isto é dedução a partir do que ela faz, com a força de cada evidência — pro Dudu e
o Vitor conferirem contra o prompt real. **Onde não bater é o mais interessante:** ou a regra existe
e ela não obedece, ou não existe e ela inventou.

| regra deduzida | evidência |
|---|---|
| "Pergunte se tem aparelho pra dar na troca" — **incondicional** | 67% de todas as sessões, texto quase idêntico |
| "Ofereça visita/loja" — **enfraquecida no prompt novo** | 89% (jun) → 59% (ago) |
| "Escale quando o cliente marcar dia" — **regra forte** | transfere em 86,2% quando o cliente dá data |
| "Peça um detalhe faltante antes de seguir" — **regra forte e cara** | ver o balde A abaixo |
| "Não invente a saúde da bateria; passe pro vendedor" — **regra boa** | 10 de 16 desvios viram transferência |
| "Aceite a negativa do cliente" — **continua correta** | confirmado em jul/2026, não mexa |

## Como as conversas morrem (janela, 390 sessões)

Classificação pela **última mensagem dela** em cada conversa:

| último movimento dela | sessões | transferiu |
|---|---|---|
| F. informou e parou (maioria já tinha transferido antes) | 222 | 82,4% |
| **E. terminou com outra pergunta** | **76** | **17,1%** |
| **C. convidou pra loja sem pedir dia** | **34** | **0,0%** |
| B. encerramento passivo ("me chama quando quiser") | 33 | 42,4% |
| **A. micro-pergunta de último milímetro** | **15** | **6,7%** |
| D. pediu o dia | 6 | 0,0% |

**131 conversas (A+C+E+D) terminam com ela segurando uma pergunta, e só 14 delas foram escaladas.**

### O balde A é o mais didático

Seis exemplos lidos na mão, todos com a mesma construção — o cliente **já disse que quer comprar** e
ela trava num detalhe trivial:

- **5511918423082** — *"pode me mandar só 'sim' que eu sigo com a finalização do seu iPhone 14 Pro
  Max roxo profundo à vista."* Modelo, cor e preço já acertados. O "sim" nunca veio, ninguém foi
  chamado.
- **5511960611456** — *"pode me responder só com 'laranja' ou 'branco' que eu já sigo com o pedido."*
- **5511981535793** — *"pode me dizer só uma cor que você gosta, ou eu sigo com as opções."*
- **5511978854830** — *"pode me mandar só uma foto da tela de armazenamento do seu iPhone 13."*
- **5511961228261** — *"pode me responder só com um período, como 'sábado à tarde'."*
- **5519982252262** — *"pode me responder só com '15' ou '16' que eu já sigo."*

A cor do aparelho é uma pergunta que o **vendedor** resolve em dez segundos. Segurar o handoff por
ela custa o lead inteiro.

### O balde C é o mais caro

34 conversas em que ela convida pra loja (*"quer dar uma olhada nele de pertinho, sem compromisso?"*)
e **não pergunta quando**. Zero transferências. O convite sem data é um beco.

---

## O dinheiro — coorte madura

⚠️ **Achado de qualidade de dado que afeta os relatórios anteriores.** 1.688 sessões estão
carimbadas em **10/jun às 20h**, e **1.542 delas têm todas as mensagens no mesmo instante**: é
backfill de migração, com o timestamp achatado. Consequências:

- **"Coorte de junho" não é quem chegou em junho.** Essas conversas podem ser bem mais antigas.
  O nível absoluto de conversão de junho é teto, não medida.
- **Análise por hora do dia em junho é lixo.** 57% das sessões "começam" às 20h. Descartei.
- **A ordem das mensagens sobrevive** (o `id` é sequencial), então tudo que depende de "quem falou
  primeiro" continua válido.
- As tabelas abaixo usam **só dado orgânico, 11/jun a 10/jul**, fora do lote migrado.

### Transferir é o que separa

| grupo | sessões | compraram | conversão |
|---|---|---|---|
| transferiu | 956 | 120 | **12,55%** |
| não transferiu | 1.037 | 15 | **1,45%** |

**8,7×.** Maior que os 5,9× do relatório antigo, porque a ferramenta `transfereHumano` mede melhor
que o campo `vendedorAtribuido`.

### O vazamento, dimensionado

| grupo | transferiu | sessões | compraram | conversão |
|---|---|---|---|---|
| sinal forte + deu data | não | 39 | 2 | 5,13% |
| sinal forte + deu data | **sim** | 105 | 16 | **15,24%** |
| **sinal forte, SEM data** | **não** | **376** | **1** | **0,27%** |
| sinal forte, SEM data | **sim** | 185 | 10 | **5,41%** |
| só deu data | sim | 237 | 54 | **22,78%** |
| nem sinal nem data | não | 560 | 7 | 1,25% |

Os 5,41% replicam quase exato os 5,65% medidos em julho por outro caminho. **Duas medições
independentes concordando.**

**Na janela de agosto o mesmo balde tem 53 conversas em 10 dias, com R$ 239.543 cotados e mediana
de R$ 4.190 por aparelho.**

Contrafactual, com as ressalvas na frente: 53 vazamentos/10 dias ≈ 160/mês. Escalados ao patamar
medido (5,41% contra os 0,27% de hoje) seriam **~8 vendas/mês**, ~R$ 34 mil de faturamento bruto.

⚠️ **Não use a taxa da faixa cheia (12,55%) pra dimensionar isso.** Quem sinaliza compra sem marcar
dia converte 5,41% mesmo quando escalado, porque está menos comprometido. Usar 12% infla a promessa
em 2×. E é correlação: o contrafactual assume que os 376 se comportariam como os 185.

---

## ⭐ A alavanca: ela perguntar o dia

Coorte orgânica 11/jun–10/jul, ordenada por `id` (imune ao backfill):

| cenário | sessões | transferiu | conversão |
|---|---|---|---|
| 1. ela não perguntou / cliente não deu data | **1.192** | 35,4% | **3,36%** |
| 2. cliente deu data espontânea | 102 | 60,8% | 16,67% |
| 3. ela perguntou, cliente **não** deu data | 161 | 41,6% | 1,24% |
| 4. ela perguntou **antes** → cliente deu data | 121 | 86,8% | **14,88%** |
| 5. cliente deu data antes da pergunta | 79 | 82,3% | 21,52% |

**Perguntar está associado a 5,4× mais datas** (43% contra 8%), e data está associada a 4–6× mais
conversão. O cenário 1 — onde ela nunca pergunta e o cliente nunca oferece — é **72% da coorte**, e
na janela de agosto continua sendo **67,6%**. A alavanca está inteira.

⚠️ **Duas honestidades obrigatórias aqui.**

1. **Não é causa provada.** Ela pode perguntar justamente quando a conversa já vai bem. Só um A/B
   separa as duas coisas — ver a seção do plano.
2. **Eu errei uma vez nesta mesma análise.** No dado contaminado pelo backfill, o cenário 3 dava
   4,78% e eu ia escrever que "perguntar é de graça". No dado limpo dá 1,24%, abaixo do cenário 1.
   Com 2 compras em 161 sessões a diferença não é significativa, então o correto é: **o custo de
   perguntar é inconclusivo**, não zero.

## Canal — Meta Ads é 56% do volume e converte 2,46%

| origem | sessões | transferiu | conversão |
|---|---|---|---|
| Instagram Orgânico | 113 | 54,0% | **14,16%** |
| Orgânico | 520 | 54,0% | 9,42% |
| Google Ads | 66 | 34,8% | 4,55% |
| **Meta Ads** | **936** | 36,5% | **2,46%** |

É qualidade de lead, não comportamento dela — na melhor célula possível (transferida **e** com
data), orgânico converte **31,19%** e Meta Ads **13,33%**. Mesmo tratamento, 2,3× de diferença.

Isso não é problema de prompt. É pergunta de mídia, e falta o dado do gasto pra fechar (ver o que
preciso, no fim).

## Follow-up — a máquina roda e rende quase nada

| follow-ups | não transferidos | compraram | conversão |
|---|---|---|---|
| 0 | 563 | 8 | 1,42% |
| 1 | 28 | 0 | 0,00% |
| 2–3 | 31 | 0 | 0,00% |
| **4+** | **312** | **3** | **0,96%** |

**312 leads levaram 4 ou mais toques e produziram 3 vendas.**

⚠️ **Confundimento real:** o lead recebe follow-up *porque* não converteu, então a comparação com o
grupo "0 follow-ups" é enviesada contra o follow-up. O que **não** depende do contrafactual é o
número absoluto: 4+ toques em 312 leads, 3 vendas. Seja qual for a comparação, o rendimento é ínfimo.

Isso derruba a hipótese de trabalho anterior de que, sem fila humana, o resgate deveria morar no
follow-up. **A máquina de follow-up, do jeito que está, não é o caminho.**

## O guarda-corpo passou

Escalar mais poderia estar despejando lead ruim na equipe. Medido com maturação normalizada em
21 dias (única forma honesta de comparar coortes de idades diferentes):

| fase | sessões | transferiu | conversão em 21d **se escalou** |
|---|---|---|---|
| antes de 27/jul | 2.601 | 40,3% | **9,63%** |
| 27/jul em diante | 223 | 43,9% | **9,18%** |

**A qualidade da escalada se manteve enquanto o volume subiu.** Recomendar mais escalada não está
diluindo o lead. ⚠️ n=223 do lado novo (só 27–30/jul cabem em 21 dias de maturação) — reconfirmar
no fim de setembro.

## Pistas investigadas e ENCERRADAS

Registro pra ninguém gastar tempo de novo:

- **"A bateria é um bloqueio."** Não é. A regex de bateria confunde o cliente perguntando a bateria
  *do aparelho da loja* com o cliente informando a do *próprio* aparelho no formulário de troca.
  Quando é bloqueio de verdade, a resposta dela é boa (*"varia conforme a unidade, quem confirma é
  o vendedor — quer que eu já adiante com ele?"*) e vira transferência em 10 de 16.
- **"O formulário de troca de 8 campos derruba a conversa."** Metade abandona (215 de 425), mas
  abandonar **não muda a conversão**: 7,27% quem abandona contra 7,03% quem completa. Não é buraco.
- **"Completar a avaliação faz ela escalar menos."** Era artefato do meu marcador de texto. Com a
  ferramenta como referência a inversão some (52,4% contra 44,7%).
- **"`avalia_upgrade` morreu."** Refactor, não regressão.
- **"Ela demora pra responder."** ⚠️ **Não é mensurável nesta tabela.** O n8n grava a mensagem do
  cliente e a resposta dela com o **mesmo timestamp** — mediana e p90 de 0,0s em 5.246 respostas.
  Latência só pelo log de execução do n8n ou pelo Chatwoot.

## Armadilhas novas de dado (some às do CHATWOOT-ANALISE)

- **A mensagem do cliente vem embrulhada:** `message: <texto>\nsessionID: <telefone>`. Limpe com
  `regexp_replace(..., E'\\nsessionID:.*$','')` antes de qualquer regex.
- **`content = '[]'`** é mensagem só-de-ferramenta. Não conte como fala.
- **`|||`** é separador de mensagens dela (ela quebra em vários balões no WhatsApp).
- **`quero` + modelo** (*"quero o 12 pro"*) é sinal legítimo de escolha de produto, mas **não** é o
  mesmo que "vou querer". Trate como sinal médio, separado. A versão larga (`quero` + artigo em 18
  caracteres) pega *"quero saber o preço"* e *"quero ver o catálogo"* — conferi na mão, é lixo.

---

# O plano de avaliação contínua

## A mudança que eu proporia primeiro (uma só)

**Quando o cliente já recebeu preço e sinalizou interesse, a Maju pergunta o dia — e escala se
qualquer resposta vier, mesmo sem data.** Corrige os três baldes de uma vez: o convite sem dia (34,
0% de escalada), a micro-pergunta de último milímetro (15) e parte das 76 que terminam perguntando.

Métrica de comportamento pra vigiar, medível no mesmo dia: **% de conversas qualificadas em que ela
pergunta o dia** (hoje 24,6%) e **% em que o cliente responde com data** (hoje 20,5%).
Guarda-corpo: conversão em 21 dias de quem foi escalado não pode cair abaixo de ~8%.

## O A/B — e por que agora ele vale a pena

A/B é sortear, pelo hash do telefone, metade dos clientes pro prompt atual e metade pro novo. Serve
porque hoje a comparação é antes/depois, e entre o antes e o depois muda tudo junto — anúncio,
semana do mês, estoque. Foi exatamente isso que me mordeu no cenário 3.

**Dimensionamento no volume de vocês** (≈390 conversas qualificadas por 10 dias):

| detectar | tempo |
|---|---|
| mudança grande (+15pp em "cliente deu data") | ~10 dias |
| mudança fina (+5 a 8pp) | ~1 mês |
| **conversão em venda** | inviável — meses |

A/B decide comportamento rápido. Conversão continua sendo coorte madura, com atraso. **Pergunta pro
Dudu: dá pra dividir por hash do telefone no n8n?** Não é pré-requisito pra começar.

## As cadências

**Semanal (segunda)** — a série de comportamento. `metricas-semanais.sql` mais as métricas novas
(pergunta o dia, cliente dá data, os 5 baldes de morte, escalada por canal). Sempre a série inteira,
nunca o número da semana: n≈250 é o menor recorte honesto, e com n≈36/dia a taxa diária é ruído.
Junto, leitura de 30–50 conversas com foco rotativo, citando o número da conversa.

**Mensal** — a régua. Coorte madura (60+ dias), reprecificação dos baldes em R$, e **uma** mudança
de prompt escolhida pro mês.

**Diário** — só **alarme de exceção**, não relatório: mensagem que falhou, queda abrupta de volume,
ela parar de cotar preço, ferramenta que some da série. Coisa que é defeito, não métrica.
Sem dono pra trabalhar fila de lead, mandar lista todo dia é relatório que ninguém abre.

**A cada mudança de prompt** — carimba a data num changelog, congela, espera ~2 semanas de
comportamento antes de julgar. Conversão dessa mudança, só 60 dias depois.

## O que falta pra fechar

1. **O prompt atual da Maju** (Dudu/Vitor) — pra conferir contra as regras deduzidas acima.
2. **Quem grava `contatosBreno.agendamento`** — determina se a linha plana de 6–7% é fato ou buraco.
3. **Gasto de mídia por canal** — sem isso não dá pra dizer se Meta Ads a 2,46% se paga.
4. **A/B por hash de telefone no n8n é possível?**
5. **Changelog de versões do prompt** — hoje as viradas só se descobrem por arqueologia de série.
