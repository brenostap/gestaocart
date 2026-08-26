# Como medir qualidade de lead e qualidade da IA (26/ago/2026)

Plano para responder duas perguntas separadas que hoje vivem misturadas: **o lead era bom?** e
**a IA atendeu bem?** Escrito depois de fechar a cadeia anúncio→lead→conversa→venda
(`docs/IAS-E-ESPECIALISTAS.md`).

---

## 0. A regra que não pode ser quebrada

> **Nunca julgue a IA pela conversão.**

Conversão é **rara** (~1% dos leads), **lenta** (mediana de 8 dias, p75 de 84) e **confundida**
(quando a mídia piora, a conversão cai e a IA parece pior sem ter mudado nada).

Isso não é teoria — me pegou **duas vezes em dois dias**:

1. Li o `assignee` do Chatwoot e concluí que o Instagram da Urban estava quebrado. Era o
   denominador. (`IAS-E-ESPECIALISTAS.md` §4)
2. Concluí que o Instagram transferia menos que o WhatsApp. Controlando pelo **tipo de anúncio**,
   a diferença sumiu: IG com anúncio de preço/produto transfere **25,5%**, WhatsApp **23,1%**.

**Toda métrica de IA tem que ser comparada dentro do mesmo segmento de lead.** É a única defesa.

---

## 1. A decomposição

```
vendas          transferências         vendas
──────    =     ──────────────    ×    ──────────────
 lead                lead              transferência

              ↑                        ↑
       QUALIDADE DA IA           QUALIDADE DO LEAD
       (rápido: n≈150/semana)    (lento: coorte de 60d)
       mede-se DENTRO do segmento (é o teto do segmento)
```

**Por que essa divisão e não outra:** transferência acontece em ~23% dos leads, então dá pra medir
**por anúncio e por semana**. Venda acontece em ~1%, então um anúncio com 150 leads produz ~1,5
vendas — **puro ruído**. Medir anúncio por venda é impossível no volume de vocês; medir por
transferência é trivial.

⚠️ E a segunda metade **não é constante**: 10,2% no WhatsApp contra 2,4% no Instagram. Por isso ela
entra como **peso do segmento**, não como número único.

---

## 2. ⭐ Camada 0 — a IA escreve o próprio veredito (a recomendação principal)

**Não infira o estado da conversa depois. Faça a IA gravar enquanto atende.**

A tabela já existe: **`conversa_estado`** no `supabase-urban`, **1 linha**, com exatamente os
campos certos:

```
fase_atual · proposta_apresentada_em · agendamento_solicitado/data/confirmado
transferido_em · motivo_transferencia · lead_quente · desistiu_em
objecoes_levantadas · mencionou_desconto · mencionou_concorrencia
urgencia · restricao_orcamento · finalidade_uso · observacao_vendedor
+ aparelho desejado e aparelho de troca, campo a campo
```

Isso é **melhor que regex e melhor que juiz LLM**, porque:

- é a própria IA dizendo o que entendeu, no momento em que entendeu — sem reinterpretação posterior;
- custa ~zero (uma chamada de ferramenta no fim do turno, contra 38 mil tokens de prompt que ela já
  gasta por execução);
- `motivo_transferencia` + `desistiu_em` + `objecoes_levantadas` **são literalmente a resposta** pra
  "por que o lead não foi transferido";
- é auditável: dá pra ler a conversa e conferir o campo.

**Pedido pro Dudu, em uma frase:** *ligar a gravação de `conversa_estado` nas duas lojas e nos dois
canais, gravando um registro por sessão e atualizando a cada turno.*

⚠️ Um cuidado: **`motivo_transferencia` é o motivo declarado, não a verdade.** Serve pra segmentar e
pra achar padrão, não pra fechar diagnóstico sozinho. A camada 3 existe pra auditar isso.

---

## 3. Camada 1 — score do lead (SQL, custo zero)

**Objetivo: não é escolher lead. É ser a variável de controle de todo o resto.**

Atributos conhecidos **antes de a IA fazer qualquer coisa**:

| eixo | fonte | tamanho medido do efeito |
|---|---|---|
| **origem** | `contatos*.origem` | Orgânico/WA 8,4% × Meta/IG 0,44% — **19×** |
| **canal** | tabela de origem | WA 10,2% × IG 2,4% pós-transferência |
| **tema do anúncio** | `atribuicao_clique.headline` | ver abaixo — **1,7× na transferência** |
| anúncio específico | `source_id` | 114 anúncios distintos |
| modelo pedido | `iPhoneInteresse` | ⚠️ vazio em 93% |
| tem trade-in | `trade-in`, `tradein_dados` | não medido |
| hora / dia | `created_at` | não medido |

### O que o tema do anúncio já mostra (jun–ago, 8.671 leads com anúncio)

| tipo de criativo | leads | **transferidos** |
|---|---|---|
| B. sobre **preço/produto** (TABELA DE PREÇO, SEMINOVOS, IPHONE 15 PRO MAX) | 2.376 | **25,5%** |
| C. genérico (*Instagram*, *Converse conosco*) | 4.411 | 23,1% |
| **A. sobre o aparelho DO CLIENTE** (POSSUI IPHONE 11, IPHONE 13 - PROCURA-SE) | **1.884** | **14,6%** |

**1.884 leads em três meses entram por anúncio que fala do aparelho que a pessoa já tem, e a IA
transfere quase metade do resto.** Dentro do Instagram, mesmo canal e mesma IA: **14,6% × 25,5%**.

### ⚠️ Li as conversas. Minha hipótese estava ERRADA — e o que tem embaixo é melhor

Eu supus que esses anúncios atraíam quem quer **vender** o aparelho, e que a IA estava certa em não
transferir. **Não é isso.** Lidas 30 conversas de agosto:

O texto que chega como "primeira mensagem do cliente" é o **template pré-preenchido do anúncio** —
*"Quero trocar o meu iPhone 11 usado por um mais atual…"*. Ninguém digitou aquilo. E a mensagem
seguinte, essa sim escrita pela pessoa, é sempre **qual aparelho ela quer comprar**:

> *"Quero o 13 verde de 256gb"* · *"17 Pro Max"* · *"iPhone 14 Pro com 256GB"* · *"15 pro max"*

São **compradores com aparelho de troca** — que é o **melhor canal de margem da loja**
(`docs/ANALISE-JUN-JUL-2026.md`: troca dá ~1,5× a margem de um aparelho comprado de fornecedor).

**E também não é qualidade de lead.** Controlando por engajamento (entrou na avaliação de troca):

| | leads | msgs do cliente | cotou preço | **pediu o dia** | **transferiu** |
|---|---|---|---|---|---|
| A. aparelho do cliente | 715 | 8,9 | 84,6% | **25,3%** | **17,9%** |
| B. preço/produto | 550 | 9,3 | 90,7% | **40,2%** | **34,5%** |

**Mesmo engajamento, mesmo preço cotado — e ela pede o dia 15 pontos menos e transfere 17 pontos
menos.** O problema é o **fechamento**, não o lead.

O mecanismo aparece na leitura: quando há troca, **a avaliação vira o fim da conversa**. Ela entrega
o laudo e emenda numa pergunta lateral em vez de marcar o dia —
*"Avaliação do seu 11 em R$ 150, tudo certo por aí? E qual cor do 14 Pro Max você mais gostou?"*

⚠️ Registro o erro porque ele quase virou decisão de mídia: eu ia recomendar tirar esses criativos
do funil de venda. Seria jogar fora o melhor canal de margem da loja.

### Como virar score

Para cada segmento (origem × canal × tema), sobre coorte de **60+ dias**:

```
valor_esperado_do_lead = P(transferência | segmento)
                       × P(venda | transferido, segmento)
                       × ticket_médio(segmento)
```

Recalcular **mensal**. Usos: (a) variável de controle; (b) priorizar quem recebe re-alerta e
follow-up; (c) decidir verba por criativo.

---

## 3-bis. ⭐⭐ O que a leitura achou de verdade: ela promete um humano e não chama

Procurando o mecanismo do §3 eu tropecei num padrão **maior e que não é dos anúncios de troca** —
é da IA inteira, nos dois canais. Ela **assume um compromisso em nome da loja e não aciona ninguém**.

**Cart, jul+ago/2026, conversas que chegaram a preço:**

| | Instagram | WhatsApp | **total** |
|---|---|---|---|
| leads com preço cotado | 4.102 | 3.516 | 7.618 |
| assumiu compromisso | 1.335 | 1.219 | 2.554 |
| **compromisso assumido e NINGUÉM avisado** | **714** | **487** | **1.201** |
| ↳ disse *"um especialista vai confirmar"* | 447 | 287 | **734** |
| ↳ **marcou dia e hora** | 211 | 227 | **438** |
| ↳ disse que **separou/reservou o aparelho** | 138 | 28 | **166** |

**~600 por mês.** Casos reais lidos, todos sem transferência:

- *"Fiquei com o **17 Pro 256 Titânio Azul separado** aqui **pra sexta às 16h**. Me passa o nome
  completo que eu finalizo."* — aparelho reservado, visita marcada, ninguém sabe.
- *"Pra **segunda-feira**, que horário você prefere? Assim já deixo separado pra você."*
- *"Esse modelo está sujeito à disponibilidade. **Um de nossos especialistas vai confirmar.**"* —
  ela promete o especialista e não chama nenhum.

### Por que este é o melhor primeiro alarme automático

1. **Não precisa de juiz LLM nem de julgamento.** É regex na fala **dela**. Não há ambiguidade: ou
   disse "sexta às 16h", ou não disse.
2. **Não depende de conversão.** É defeito, não métrica — cabe no alarme diário de exceção (§8).
3. **É a promessa quebrada mais cara que existe**: o cliente marcou, e ninguém apareceu.
4. Já dá pra rodar **hoje**, sem o Dudu ligar nada.

**Regra de escalada proposta, em uma frase:** *transferir automaticamente sempre que ela disser um
dia e hora, disser que separou/reservou, ou prometer que um especialista vai confirmar.*

### Quanto vale — com a ressalva na frente

⚠️ **Contrafactual, não medido.** Usando os números da coorte madura de `ANALISE-MAJU-AGO-2026.md`
para o recorte *"cliente deu data"*: transferido converte **15,24%**, não transferido **5,13%**.
Aplicado só às **438 conversas com dia e hora** (o balde menos ambíguo): ~44 vendas em 2 meses,
**~22/mês**.

Três motivos para tratar isso como **teto**: (a) o contrafactual assume que as não transferidas se
comportariam como as transferidas; (b) aqueles 15,24% são de WhatsApp/Cart e o Instagram converte
pior; (c) parte das 438 pode ter sido atendida por fora sem o campo ser gravado. **Um terço disso já
seria a maior alavanca isolada medida até hoje neste projeto.**

---

## 4. Camada 2 — score do atendimento (SQL + regex, custo zero)

Comportamentos **já provados** correlacionados, e todos determinísticos. Base:
`scripts/maju/metricas-semanais.sql` — falta estender pra Instagram e pra Urban.

| item | hoje | por que está na lista |
|---|---|---|
| **perguntou o dia** | **16–25%, parado há 11 semanas** | ⭐ a alavanca; quando pergunta, cliente dá data 43% × 8% |
| cliente deu data | 20,5% | data → conversão 14,9% × 3,4% |
| cotou preço | 54% (Cart) | |
| ofereceu visita | 85% | ⚠️ **igual nos dois grupos** — não discrimina, serve de controle |
| **transferiu** | 21–39% | a métrica de topo |
| morreu com pergunta pendurada | **34% das qualificadas** | 131 conversas/janela |
| *"pode me responder só com…"* | 5% → **18%** | ⚠️ **única métrica que piorou** |
| falha de envio | 0 na amostra de ago | |
| `transfer_falhas` | 14 na Cart, **0 na Urban** | separa "decidiu não transferir" de "quebrou" |
| re-alerta suprimido | **67%** (168 cooldown, 36 sem motivo, 30 cap) | e só 1 alerta/mês no IG |

⚠️ **Sempre estratificado por segmento da camada 1.** Um número agregado sobe e desce com o mix de
mídia e não diz nada.

---

## 5. Camada 3 — juiz LLM (amostra, custo baixo)

Para o que regex não vê: **ela entendeu?** Um `"Não quero compra"` que era *"não [tenho troca],
quero comprar"* (conversa #28397) nenhum regex pega.

### Rubrica proposta — 7 itens, todos binários ou 0–2

1. **Entendeu a intenção** do cliente (comprar / vender / suporte / curioso)?
2. **Respondeu o que foi perguntado**, ou desviou pro script?
3. **Inventou informação** (bateria, disponibilidade, prazo)? *(binário, é o item de risco)*
4. **Cotou preço** quando havia informação suficiente?
5. **Pediu um dia** quando havia sinal de compra?
6. **Deveria ter transferido e não transferiu?** *(o item central)*
7. **Maior oportunidade perdida** — campo livre, uma frase.

Saída estruturada (`output_config.format`), gravada por `session_id`.

### Onde rodar o juiz (não em tudo, e não aleatório)

| população | volume | por quê |
|---|---|---|
| **leads de alto valor que NÃO transferiram** | ~300/mês | é o balde que vocês querem atacar |
| amostra aleatória estratificada | ~200/semana | linha de base, pega o que ninguém procurou |
| **100% de um braço de A/B** | conforme | pra decidir mudança de prompt |

### Custo (6.000 conversas/mês, ~4k tokens de entrada + 500 de saída)

| modelo | mensal | com **Batch API** (−50%) |
|---|---|---|
| Claude Haiku 4.5 | US$ 39 | **US$ 20** (~R$ 110) |
| Claude Sonnet 5 | US$ 78 | **US$ 39** (~R$ 215) |
| Claude Opus 5 | US$ 195 | US$ 98 (~R$ 540) |

**Julgar as 6.000 é barato** — a Maju sozinha gasta **38 mil tokens de prompt por execução** e roda
~18 mil execuções por canal. O juiz lê a conversa **uma vez**.

Recomendação: **Sonnet 5 em Batch pro volume** (juiz ruim = métrica ruim; não é onde economizar) e
**Opus 5 numa amostra de 50/mês pra calibrar o juiz**. Batch API é assíncrono — perfeito, isso roda
de madrugada. Prompt caching ajuda pouco aqui (a rubrica é pequena perto da conversa).

⚠️ **Juiz LLM sem validação é palpite com número.** Ver §7.

---

## 6. A métrica de topo: transferência **padronizada** por mix

O número único que pode ir num painel diário sem mentir:

```
taxa_padronizada = Σ  [ P(transferência | segmento, semana) × peso_fixo(segmento) ]
                 segmentos
```

Os pesos são **congelados** num mês de referência. Assim, se a mídia mudar o mix de leads, a métrica
**não se mexe** — só se mexe se a IA mudar de comportamento dentro de cada segmento.

É exatamente a correção do erro que me pegou duas vezes. Ao lado dela, sempre: **o mix cru**, porque
mudança de mix é notícia de mídia, não da IA.

---

## 7. O loop de validação (sem isso, nada disso vale)

**Trimestral**, em coorte madura de 60+ dias:

1. O score do lead **prevê** conversão? (ordenar segmentos por score previsto × conversão real)
2. O score do juiz **prevê** conversão dentro do mesmo segmento? Se não, **a rubrica está medindo a
   coisa errada** — reescrever, não insistir.
3. Concordância entre juiz LLM e leitura humana em 30 conversas. Abaixo de ~80%, a rubrica está
   ambígua.

⚠️ **Carimbe toda mudança de prompt num changelog.** Hoje as viradas só se descobrem por arqueologia
de série (`ANALISE-MAJU-AGO-2026.md`). Sem data de mudança, série temporal não decide nada.

---

## 8. Como deixar automático

Três peças, e **nenhuma precisa de infra nova**:

| camada | onde roda | cadência |
|---|---|---|
| 0 — `conversa_estado` | **n8n do Dudu**, dentro do fluxo | por turno |
| 1 e 2 — determinístico | **views + `pg_cron`** no Supabase do Dudu, escrevendo `qualidade_diaria` | diário, 4h |
| 3 — juiz LLM | script neste repo + **GitHub Action** (mesmo padrão de `scripts/reparos.js`, `service_role` do ambiente) usando **Batch API** | noturno |
| leitura | tela nova no painel (`UI.*`) + digest semanal | — |

### O que mandar e quando

- **Diário — só alarme de exceção.** Mensagem que falhou, queda abrupta de volume, ela parar de
  cotar preço, ferramenta que sumiu da série, `transfer_falhas` disparando. Coisa que é **defeito**.
  ⚠️ Relatório diário de métrica ninguém abre — já foi decidido em `ANALISE-MAJU-AGO-2026.md`.
- **Semanal (segunda) — a série de comportamento**, sempre a série inteira, nunca o número da
  semana (n≈250 é o menor recorte honesto).
- **Mensal — a régua**: coorte madura, reprecificação dos baldes em R$, **uma** mudança de prompt.
- **Trimestral — a validação** do §7.

---

## 9. Ordem de implementação

1. **Pedir pro Dudu ligar `conversa_estado`** nas duas lojas e dois canais. Destrava tudo e não é
   trabalho nosso. *(camada 0)*
2. ~~Ler 30 conversas dos anúncios "POSSUI / PROCURA-SE"~~ **feito (§3)** — não é funil errado, são
   compradores com troca. Virou o item abaixo.
2b. ⭐⭐ **Ligar o alarme de "compromisso assumido sem ninguém avisado"** (§3-bis). ~600/mês, regex
   na fala dela, roda hoje sem depender de ninguém. *(camada 2)*
3. **Estender `metricas-semanais.sql` pro Instagram e pra Urban** e ligar a taxa padronizada do §6.
   *(camada 2 + métrica de topo)*
4. **Score do lead por segmento**, mensal, na coorte madura. *(camada 1)*
5. **Juiz LLM** só sobre "alto valor, não transferido". *(camada 3)*
6. **A/B por hash de telefone** — pergunta aberta pro Dudu desde `ANALISE-MAJU-AGO-2026.md`.
7. **Changelog de prompt.** Barato e todo mês que passa sem ele custa uma análise.

⚠️ **Não comece pelo juiz LLM.** É o mais divertido e o menos urgente: a camada 0 dá informação
melhor de graça, e sem a camada 1 o juiz não tem contra o que ser comparado.
