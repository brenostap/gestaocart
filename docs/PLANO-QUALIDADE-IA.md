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

### ⚠️ 27/ago: o dono contestou, e ele estava certo em parte

> *"o que faz você pensar que o especialista não chamou esses leads? no Instagram eles continuam
> respondendo no mesmo canal."*

**Verdade, e eu não tinha como saber com o que medi.** `vendedorAtribuido IS NULL` diz que **o fluxo
do n8n não atribuiu**, não que ninguém atendeu. Duas coisas caíram e uma sobreviveu.

**Caiu 1 — o especialista escreve no Instagram, no mesmo canal.** Conv 39778 do Chatwoot:
*"Prazer, meu nome é Isa!… Vamos la!… Nós temos essas duas opções 👆🩷"*. Esses textos **não existem**
no `n8n_chat_histories_instagram` da mesma sessão. É gente. A afirmação de `CHATWOOT-ANALISE.md` de
que **"nenhuma vendedora escreve no Chatwoot" está errada** — no Instagram elas escrevem, e o
Chatwoot não distingue porque tudo da loja chega como `external_echo: true` com `sender: null`.

**Caiu 2 — meu regex de "marcou dia" pega ela PERGUNTANDO.** Em `agiuliabridi` a última mensagem é
*"Pra segunda-feira, que horário você prefere?"* e **o cliente nunca respondeu**. Não é visita
marcada. Os **438** do balde estão inflados por isso — quanto, não medi.

**Sobreviveu — nas conversas que marquei, não há sinal de humano.** Construí o discriminador
(`scripts/separa-ia-vendedor.js`, §3-ter) e rodei em 44 conversas de Instagram:

| grupo | n | com assinatura de humano |
|---|---|---|
| controle: `vendedorAtribuido` preenchido | 4 | **4 (100%)** |
| as que eu marquei: `vendedorAtribuido` nulo | 40 | **0** |

Nas 40, o resíduo não explicado pela IA é de 1 a 3 mensagens e é **sempre cartão de preço** (ponto
cego do instrumento). Nas 4 de controle são 5 a 11 mensagens abrindo com saudação
(*"oii, boa tarde! tudo bem?"*).

**Leitura honesta:** no Instagram, `vendedorAtribuido` **é** um proxy razoável de "humano assumiu" —
4/4 e 0/40. O balde existe, mas **está menor que 1.201** por causa do erro 2, e **o número do
WhatsApp continua sem verificação possível** (lá o especialista usa o número pessoal, invisível).
n=44 é pequeno: rodar o script na janela inteira antes de usar isso pra decidir.

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

## 3-ter. ⭐ O instrumento: separar a IA do vendedor no Instagram

`scripts/separa-ia-vendedor.js`. Nasceu da contestação acima e vale por si — **é a primeira vez que
dá pra ver a metade humana do funil.**

```
Chatwoot                      = TUDO que a loja mandou  (IA + vendedor)
n8n_chat_histories_instagram  = SÓ o que a IA gerou
──────────────────────────────────────────────────────
diferença                     = o vendedor
```

⚠️ **Três armadilhas, todas me pegaram:**

1. **Não subtraia contagem.** A IA quebra a resposta em balões com `|||`: em `ray_pereira58` são
   9 linhas no n8n = **16 balões** contra 13 mensagens no Chatwoot. Subtrair dá "−3 humanos".
2. **Não case por prefixo.** O Chatwoot **também** quebra o que o n8n guarda junto — a IA manda
   *"Justo! Pra eu te passar a melhor avaliação… 🔷 Pré-avaliação Phone Cart…"* como um balão e o
   Instagram entrega como duas mensagens. Isso inflou o teste de **41% pra 82%**. Case por
   **contenção** no texto concatenado da sessão.
3. **Ponto cego: o cartão de preço.** *"iPhone 13 256GB → R$ 1.990 à vista ou 18x de R$ 135,30"*
   aparece no Chatwoot e **não** no n8n. Vira falso "vendedor", 1 a 3 mensagens por conversa.

⭐ **Por isso a assinatura de humano não é "sobrou mensagem":** é **5+ mensagens não explicadas E
uma delas é saudação** (*"oii, boa tarde! tudo bem?"*). Validado 4/4 e 0/40.

⚠️ **Só Instagram.** No WhatsApp o especialista usa o número pessoal e não passa por nenhuma das
duas fontes. Isso só muda com o plano de conectar os números ao Chatwoot (§1).

⚠️ **"Só a IA" não prova abandono** — prova só o contrário: quando bate a assinatura, houve humano.

### ⭐ Rodado na janela inteira (27/ago) — 2.677 conversas de Instagram

Amostra estratificada de ~190 por loja, com o join completo contra o n8n, extrapolada pela
proporção real de cada estrato:

| | Cart | Urban |
|---|---|---|
| conversas de Instagram na janela | 1.520 | 1.157 |
| **com HUMANO escrevendo (estimado)** | **487 · 32,0%** | **302 · 26,1%** |
| com `meta.assignee` no Chatwoot | 502 | 150 |
| **recall do `meta.assignee`** | **88%** | **43%** |
| taxa de humano *dentro* dos atribuídos | 85,7% | 86,7% |
| taxa de humano *fora* dos atribuídos | 5,6% | **17,1%** |

**Duas leituras:**

1. **O humano atende ~1 em cada 3 conversas de Instagram, nas duas lojas.** Muito mais do que
   qualquer fonte dizia — e nada disso era visível antes.
2. ⚠️ **Na Urban o Chatwoot perde 57% dos atendimentos humanos.** É a mesma doença do §6.3 de
   `IAS-E-ESPECIALISTAS.md`, agora quantificada. **Não use `meta.assignee` da Urban pra nada.**
   Na Cart ele é confiável (88%).

**Ordem de confiança da fonte, para "houve humano" no Instagram:**
`contatos*.vendedorAtribuido` > `meta.assignee` da Cart >>> `meta.assignee` da Urban.

⚠️ **Duas armadilhas novas descobertas aqui:**

- **O `session_id` do Instagram da Urban também termina em `-cart`.** O fluxo da Duda foi copiado do
  da Maju e o sufixo veio junto. Filtrar por `-urban` devolve **zero linha, calado**. Já mordeu o
  script uma vez.
- **Saudação não serve de assinatura de humano.** Foi o meu primeiro atalho e ele dobra o número: o
  cartão de handoff da IA começa exatamente com *"Oii, tudo bem? Sou a Mel, especialista da Phone
  Urban…"* — que aparece **71 vezes idêntico**, espaço duplo incluso. Por isso o filtro de template
  (texto que se repete em 5+ conversas) é obrigatório.

**O que isso destrava:** tempo até o vendedor entrar, quantas mensagens ele manda, o que ele diz, e
tudo isso cruzado com venda — por especialista. Era o buraco declarado em `IAS-E-ESPECIALISTAS.md`.

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

---

## 3-quater. ⭐ O roteiro do VENDEDOR — primeira medição que existe (27/ago)

162 conversas de Instagram (78 Cart · 84 Urban) com o vendedor identificado pelo §3-ter.
**Nunca ninguém tinha visto isso**: até hoje o Chatwoot era considerado cego depois do handoff.

⚠️ **Leia o limite antes dos números.** A API do Chatwoot devolve só as **últimas 20 mensagens** por
conversa, e eu não paginei nesta rodada. Então **tudo abaixo é a cauda da conversa**, e todo
percentual é **piso, não taxa**. O script já foi corrigido pra paginar (`before=<id>`); a próxima
rodada dá o número cheio. Dois efeitos concretos:
- **"o vendedor entra na mensagem 1–2"** que eu tinha medido é **artefato** da janela. Descartado.
- contagem de mensagens dele (mediana 8 na Cart, 6 na Urban) é **mínimo**.

### O que ele faz (piso, % das conversas em que aparece)

| | Cart | Urban |
|---|---|---|
| **agendar / vir à loja** (amplo) | **28%** | **17%** |
| ↳ **pede dia ou hora explícito** | **15%** | **2%** |
| cota preço | 44% | 32% |
| fala de troca | 31% | 33% |
| saudação personalizada (usa o nome) | 45% | 54% |
| fecha (*"vai ser esse mesmo?"*, *"posso confirmar?"*) | 12% | 12% |
| fala de bateria | 17% | 12% |
| escala pro gerente | 9% | 4% |
| pede nome completo | 5% | 4% |
| **reserva o aparelho** | **3%** | **1%** |
| **mensagem apagada** (*"This message was deleted"*) | **12%** | **12%** |

### ⭐ A alavanca é a MESMA dos dois lados

`ANALISE-MAJU-AGO-2026.md` mostrou que a alavanca da IA é **ela perguntar o dia** — parada em
16–25% por onze semanas. **O humano faz pior:** pede dia ou hora explícito em **15% (Cart)** e
**2% (Urban)**.

E o padrão de morte também se repete: **41% (Cart) / 44% (Urban) das últimas mensagens do vendedor
terminam com uma pergunta** — a mesma "pergunta pendurada" que mata as conversas da IA. Dessas, só
7 são pergunta de agenda.

**Não é problema de robô. É o roteiro da casa.** Qualquer mudança de prompt que não mude também o
que o humano faz depois resolve metade do funil.

### Os roteiros, lidos

- **Isa (Cart)** — o mais estruturado. Apresenta-se, explica saúde de bateria com transparência
  (*"Eu gosto sempre de ser transparente… explicar de forma sincera como funciona o mercado"*),
  pede nome completo, e propõe *"O que você acha de nós agendarmos um horário pra você?"*.
- **David (Cart)** — tabela de preço em blocos, depois fechamento seco: *"Curtiu os valores?"*,
  *"Vai ser esse modelo mesmo?"*. Usa o gerente como alavanca (*"preciso do print para passar pro
  meu gerente"*).
- **David (Urban)** — tem script de agendamento explícito: *"Nosso atendimento é feito com hora
  marcada, para mais cuidado, segurança e conforto✨ / Vamos agendar um horário para você hoje?"*.
  ⚠️ Meu primeiro regex não pegava *"vamos agendar"* e mediu 5% onde são 17%. Corrigido.
- **Mel (Cart/Urban)** — a mais pessoal, chama pelo nome (*"Bomm dia Gabi! Tudo bem e você?"*) e
  faz follow-up (*"Quando vamos te receber na loja novamente para conseguir finalizar sua compra?"*).

### ⏱️ Tempo de resposta humana — mensurável pela primeira vez

`CHATWOOT-ANALISE.md` diz que *"não dá pra medir tempo de resposta humana com esse dado — nem agora,
nem com sync nenhum"*. **Dá, no Instagram**, porque o Chatwoot carimba cada mensagem.

| IA → 1ª mensagem do vendedor | Cart (n=37) | Urban (n=50) |
|---|---|---|
| mediana | **26 min** | **40 min** |
| p75 | 9h45 | 12h10 |
| p90 | **19h55** | **24h32** |

⚠️ n pequeno e sujeito ao mesmo viés de janela. Mas a **forma** é clara e casa com o que já se sabia
da IA: mediana boa, cauda de um dia inteiro. **Use mediana + p90, nunca média.**

### O que fazer com isso

Entra na **camada 2** (determinístico, custo zero), agora com **duas séries e não uma**: o mesmo
painel de comportamento para a IA e para o vendedor, lado a lado, dentro do mesmo segmento de lead.
A métrica de topo do §6 ganha um par: **% em que alguém — IA ou humano — pediu um dia**.

---

## 3-quinquies. ⭐ O painel da camada 2 rodado — as duas séries lado a lado

`scripts/camada2-painel.js`, sobre 2.677 conversas de Instagram segmentadas por origem × tema do
anúncio. Primeira vez que IA e vendedor aparecem na mesma tabela.

✅ **Números finais, com paginação** (28.153 mensagens da loja na Cart, 16.985 na Urban; até 129
por conversa). A releitura subiu todos os percentuais — eu via só a cauda — e **deixou o achado mais
duro, não mais fraco**.

### ⭐⭐ A leitura que decide: a coluna ALGUÉM não sobe

| segmento | conversas | IA pede o dia | vendedor | **ALGUÉM** | ganho |
|---|---|---|---|---|---|
| Cart · Orgânico | 681 | 37% | 13% | **38%** | +1 |
| Cart · Meta Ads · preço/produto | 428 | 36% | 17% | **36%** | **0** |
| Cart · Meta Ads · aparelho do cliente | 133 | 30% | 12% | **30%** | **0** |
| Urban · Orgânico | 343 | 45% | 5% | **45%** | **0** |
| Urban · Meta Ads · genérico | 280 | 41% | 2% | **41%** | **0** |
| Urban · Meta Ads · preço/produto | 384 | 31% | 4% | **31%** | **0** |

**Em 5 dos 6 segmentos o vendedor acrescenta ZERO.** Quando ele pergunta o dia, a IA já tinha
perguntado — não há cobertura incremental em lugar nenhum.

Isso fecha a discussão de onde mexer: a alavanca do agendamento é **da casa**, não do robô, e hoje
**ninguém** a puxa. Mudar só o prompt da IA move o número de 29% para talvez 40%; mudar o roteiro
dos dois é o que muda o funil.

### A divisão de trabalho, medida

| | IA | vendedor |
|---|---|---|
| **tentou FECHAR** (*"vai ser esse?"*, *"posso confirmar?"*, nome completo) | **2–18%** | **0–25%** |
| **morreu PERGUNTANDO** | **50–69%** | 23–47% |
| falou de TROCA | 81–98% | 16–51% |
| RESERVOU o aparelho | 1–17% | 0–7% |

⭐ **A IA praticamente nunca tenta fechar** (1–8%) e **morre perguntando em 56 a 70%** das conversas
em que fica sozinha. O vendedor fecha 3× mais. **A IA entrega o lead sem nunca ter tentado a venda**
— e em 3 de cada 4 conversas ela nunca entrega.

### ⭐ O segmento de troca é o pior em tudo — inclusive no humano

`Cart · Meta Ads · anúncio: aparelho do cliente`:

| | esse segmento | os outros da Cart |
|---|---|---|
| vendedor apareceu | **13%** | 22–27% |
| **IA → 1ª msg do vendedor (mediana)** | **9h45** | **1 min** |
| IA falou de troca | 98% | 81–86% |
| IA falou de bateria | 62% | 38–46% |

⚠️ n=16 no tempo — direção forte, número frágil.

Não é só que esse lead é menos transferido (§3): **quando é, o vendedor demora meio dia pra
aparecer.** A avaliação de troca consome a conversa na IA *e* atrasa o humano. É o balde onde as
duas metades falham juntas.

### Nota de método

📄 **Fechamento visual da sessão** (para os sócios e para o Dudu):
https://claude.ai/code/artifact/1ceb30eb-7997-4b1d-88c2-641215c5b8ba

A Urban pergunta **bateria** muito mais (52% no Meta Ads/preço contra 27% da Cart) e **fecha muito
menos** (IA 1%). São prompts diferentes; a comparação entre lojas só vale dentro do mesmo segmento,
que é o que esta tabela faz.

---

## 3-sexies. ⭐⭐⭐ Como a Maju poderia fechar melhor — o mecanismo, medido

O objetivo declarado do dono. Sobre 1.291 conversas da Cart e 1.025 da Urban, comparando a forma
do convite dos dois lados.

### A diferença é a FORMA da pergunta, não o assunto

| forma do convite | Cart · IA | Cart · vendedor | Urban · IA | Urban · vendedor |
|---|---|---|---|---|
| **FECHADA** — *"posso confirmar/deixar/separar…"* | **3%** | **12%** | **1%** | **4%** |
| FECHADA — *"te aguardo / te espero"* | 0% | 3% | 0% | 5% |
| **ABERTA** — *"que dia? qual horário?"* | **36%** | 10% | **39%** | 3% |
| ABERTA — *"quer agendar? o que acha?"* | 2% | 10% | 2% | 20% |
| TEMPERATURA — *"curtiu?"* | 2% | 8% | 1% | 10% |
| ASSUMIDO — *"me passa seu nome completo"* | 8% | 5% | 4% | 5% |
| **PESSOAL — chama o cliente pelo nome** | **2%** | **42%** | **0%** | **38%** |

**A matéria-prima já está lá.** A Maju pergunta o dia em 36–39% das conversas — mais que o
vendedor. O que ela não faz é **pedir um sim**: ela pergunta *"Que dia e horário fica bom pra
você?"*, que exige o cliente **planejar**; ele pergunta *"Posso confirmar seu horário para as 14h
então?"*, que exige só **responder**.

### O que ele diz, verbatim

Colhido de 186 mensagens de fechamento em 131 conversas:

> *"Posso confirmar seu horário no dia 24/8 as 16H?"* · *"Posso deixar agendado para as 19:30
> então?"* · *"Posso confirmar sua vinda hoje?😊"* · *"Posso deixar separado então?"*

> *"Curtiu os valores Léo?"* · *"Qual você curtiu mais?"* · *"O branquinho você não curtiu? ✨"*

> *"Me passa seu nome completo pra que possamos agendar um horário"* ·
> *"Te aguardo amanhã 💙"* · *"Perfeito Allan, posso confirmar seu horário?"*

Quatro movimentos, e nenhum deles é insistência:

1. **Permissão fechada** — transforma a decisão num sim/não. É o mais usado dele e o mais raro dela.
2. **Temperatura barata** — *"curtiu?"* não pede compromisso, só mantém a conversa viva.
3. **Fechamento assumido** — pedir o nome completo **pressupõe** que já estão marcando.
4. **Nome próprio** — 42% contra 2%. É de graça: ela **tem** o nome.

### As quatro mudanças propostas, em ordem de custo

| # | mudança | hoje | custo |
|---|---|---|---|
| 1 | **Depois de propor a visita, oferecer um horário concreto** em vez de perguntar qual | 3% | uma frase no prompt |
| 2 | **Chamar o cliente pelo nome** quando ele já se identificou | 2% | grátis, o dado está na sessão |
| 3 | **Perguntar *"curtiu?"* depois de cotar** — abre resposta sem pedir decisão | 2% | uma frase |
| 4 | **Afirmar a presença** (*"te aguardo amanhã"*) em vez de encerrar passivo | 0% | uma frase |

### ⚠️ O que está provado e o que não está

**Provado:** o cliente dar uma data está associado a **14,9% de conversão contra 3,4%**, e ser
transferido a **8,7×** — os dois em coorte madura, medidos duas vezes por caminhos independentes.
**O alvo é certo.**

**Não provado:** que a forma fechada gere mais datas que a aberta. A diferença de forma é **fato
medido**; o efeito dela é **hipótese**. Tentei medir contra venda e não deu: são 11 compradores em
1.242 conversas — e nesse tamanho o teste mostrou coisas obviamente invertidas (*"pede nome
completo"* aparecendo com 7,6% de conversão, que é a venda causando a pergunta, não o contrário).

⚠️ **Duas coisas que a mesma amostra sugere e eu NÃO recomendo agir ainda:** a IA usa
**reserva** (175 conversas) e **urgência/escassez** (148) muito mais que o vendedor, e nenhuma das
duas aparece com retorno — 0,57% e 0,68% contra 0,85–0,95% de quem não usa. Pode ser confundimento
(ela reserva quando o cliente hesita). **Mas se for real, são dois movimentos caros que não pagam.**

**É exatamente isto que o A/B do plano existe pra resolver**, e ele decide em ~10 dias por
comportamento (*"cliente deu data"*), não por venda. Pergunta pro Dudu: dá pra sortear por hash do
telefone no n8n?

### ⚠️ E um risco de calendário

A **Isa sai de vendedora online para a gerência em setembro/2026**
(`docs/funcoes/gerente-de-loja.md`). Ela recebe **32% dos handoffs da Cart** e tem o roteiro mais
estruturado dos quatro. **Não existe documento de função do vendedor online** — é a única função do
time sem um. O roteiro dela está medido aqui; convém virar documento antes de 1º de setembro.
