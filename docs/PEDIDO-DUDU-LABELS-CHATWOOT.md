# Etiquetagem de leads no Chatwoot — proposta da Phone Cart pro fluxo das IAs

**De:** Breno (painel Phone Cart / Urban) · **Para:** Dudu (n8n + Maju/Duda) · **01/set/2026**

Documento pra ser lido inteiro por quem for implementar (humano ou agente). Ele traz o que
**medimos**, o que **propomos** e o **contrato exato** do que precisamos do lado do n8n. Tudo que
está como número aqui foi medido, não estimado — o método está junto de cada um.

---

## 1. O que a gente quer conseguir responder

Hoje o Chatwoot guarda **conversa**, e o painel guarda **venda**. Falta a camada do meio: *o que
esse lead era*. Três perguntas que hoje ninguém responde sem ler conversa a conversa:

1. **De cada 100 leads de um anúncio, quantos eram compráveis?** (separar mídia ruim de atendimento ruim)
2. **Quando não vira venda, por quê?** — e principalmente: **quanto do funil é gente que queria
   VENDER aparelho, não comprar.**
3. **Quais sinais de qualificação valem dinheiro** — pra cobrar o certo do atendimento em vez de
   cobrar conversão, que é rara (~1%), lenta (mediana de 8 dias) e confundida pela mídia.

A regra que a gente já adotou e não quer quebrar: **nunca julgar a IA pela conversão.** A métrica
tem que ser comparável dentro do mesmo segmento de lead. Label é justamente o que cria esse
segmento.

---

## 2. O que o Chatwoot mostra hoje (medido, não achismo)

**Método:** cache local de **1.379 conversas da Cart** com última atividade entre **08 e
14/ago/2026** (39.775 mensagens; caixas *WhatsApp - Phone Cart* 558 e *phonecartsp* Instagram 821).
Leitura pela API, sem escrever nada em produção. A instância da Urban foi consultada só pra listar
labels.

### 2.1. `lead-qualificado` é uma cópia da transferência

| medida | valor |
|---|---|
| conversas com alguma label | **571** de 1.379 |
| labels aplicadas por | **`Eduardo`** (conta de API) em **100%** dos casos |
| label aplicada **no mesmo segundo** da atribuição ao vendedor | **564** (mediana do intervalo: **0s**, p90 **1s**) |
| label **sem** atribuição | **0** |
| atribuição **sem** label | 7 |

Ou seja: `lead-qualificado` hoje quer dizer *"foi transferido"*. É informação verdadeira e
redundante — o `assignee` já diz isso. **Não é qualificação de lead**, e não dá pra usar pra separar
lead bom de atendimento bom.

Labels que existem hoje: **Cart** → `lead-qualificado`, `suporte`. **Urban** → **nenhuma**
(a instância tem a lista vazia). Sem paridade, os dois números nunca vão comparar.

### 2.2. A boa notícia: a IA **já classifica**, no cartão de handoff

O cartão que o fluxo emite como nota privada já é uma classificação estruturada. Exemplo real:

```
🥊 CONCORRÊNCIA
✨ Interesse: iPhone 15 Plus 128GB seminovo
🎨 Cor: NÃO DEFINIDA — perguntar
💵 À vista: R$ 2.990 | 12x R$ 292,11
🔄 Upgrade: NAO
📦 Como recebe: RETIRADA
📝 Motivo: negociação — cliente trouxe valor de concorrente
💬 Obs: VALOR NA MESA: 2690 · CONCORRENTE: São Bernardo
```

**493 das 1.379 conversas (36%) têm cartão**, em 12 tipos:

| tipo | n | | tipo | n |
|---|---|---|---|---|
| 💼 Proposta apresentada | 237 | | 🔎 Verificar estoque | 22 |
| 🗓️ Visita agendada | 78 | | 📦 Produto especial | 18 |
| 📭 Sem valor apresentado | 71 | | 📋 Atendimento transferido | 16 |
| 📦 Envio — não agendar visita | 25 | | ⚠️ Avaliar aparelho manualmente | 9 |
| 🛠️ Suporte pós-venda | 7 | | 👋 Cliente pediu atendimento | 4 |
| 🥊 Concorrência | 4 | | 💰 Negociar desconto | 2 |

E os campos vêm cheios: `Motivo` 493 · `Upgrade` 456 · `Cor` 453 · `Interesse` 452 · `Como recebe`
420 · `À vista` 336 · `VALOR NA MESA` 48 · `CONCORRENTE` 40.

**Conclusão que orienta toda a proposta:** a maior parte das labels **não precisa de julgamento
novo da IA — precisa de parsing do cartão que ela já escreve.** Custo perto de zero, sem tocar no
prompt de vendas, e cada label fica conferível contra o texto que a gerou.

### 2.3. O buraco real são as **886 conversas sem cartão** (64%)

Essas não têm classificação nenhuma. É aí que mora o motivo de perda — e é a única parte que exige
um ato novo de classificação.

---

## 3. A proposta

Prefixo com `:` porque o Chatwoot tem **um namespace plano, sem exclusividade e sem hierarquia** —
o prefixo é o que faz "dimensão" existir na hora de ler.

### `etapa:` — uma só por conversa, a mais avançada · **derivada do cartão**

`etapa:sem-valor` · `etapa:cotou` · `etapa:proposta` · `etapa:visita-agendada` · `etapa:envio` ·
`etapa:negociar` · `etapa:concorrencia` · `etapa:verificar-estoque` · `etapa:produto-especial` ·
`etapa:avaliar-aparelho` · `etapa:pos-venda`

⚠️ **Vocabulário idêntico ao dos cartões, de propósito.** Um segundo vocabulário aqui divergiria do
primeiro em semanas.

### `q:` — qualificação · acumulam · cada uma é um **fato conferível**, não uma opinião

| label | de onde sai | por que essa |
|---|---|---|
| **`q:deu-data`** ⭐ | cliente citou dia/horário | **único preditor provado do nosso lado**: 14,9% de conversão contra 3,4%, e 8,7× mais transferência (coorte madura, medido por dois caminhos independentes) |
| `q:tem-troca` | `Upgrade: SIM` | aparelho de troca dá ~1,5× a margem de um comprado de fornecedor — é o melhor canal de compra que temos |
| `q:modelo-definido` | campo `Interesse` | separa "quero um iPhone" de "quero o 15 Pro 128" |
| `q:orcamento-na-mesa` | `VALOR NA MESA` | 48 conversas já trazem o número |
| `q:nome-completo` | cliente se identificou | passo de fechamento assumido |

**`lead-qualificado` deixa de ser marcação e vira derivada** (ex.: `q:deu-data` + `etapa:proposta`).
Aí ela vira um número que se audita, em vez de sinônimo de `assignee`.

### `perda:` — motivo · **exclusiva** · só quando o cliente **declarou**

`perda:preco` · `perda:so-pesquisando` · `perda:sem-estoque` · `perda:sem-credito` ·
`perda:fora-de-area` · **`perda:queria-vender`** · `perda:comprou-fora` · `perda:so-assistencia` ·
`perda:nao-e-cliente`

`perda:queria-vender` é a que mais nos interessa: o criativo *"aparelho do cliente"* é o único
segmento que medimos **abaixo do próprio custo** (R$ 1,04 de lucro por lead contra R$ 5,54 de custo
por lead). ⚠️ São **n=3 vendas** — o que está firme é a **posição** (último, com folga), não o
valor. Essa label mede isso semana a semana em vez de uma vez por trimestre.

### `sem-resposta:antes-do-preco` / `sem-resposta:pos-preco` — **não é da IA**

Ela não sabe, no turno em que escreve, que o cliente vai sumir. Isso é regra de tempo, e a gente
roda do nosso lado.

### Valor vai em `custom_attributes`, **não** em label

`modelo` · `capacidade` · `cor` · `valor_proposto` · `tem_troca` · `data_visita` · `concorrente` ·
`valor_na_mesa` — tudo já está no cartão, e hoje o `custom_attributes` das conversas está
**100% vazio**. Label com valor dentro (`modelo:iphone-15-pro-128`) explode a cardinalidade e some
de qualquer relatório.

---

## 4. O que pedimos do lado do n8n — contrato

### Nó A — `etapa:` + `q:`, no handoff (derivado, sem LLM)

Onde o fluxo já monta o cartão, ele já tem os campos em variável. Antes de postar a nota privada,
postar também o conjunto de labels.

```
POST /api/v1/accounts/1/conversations/{conversation_id}/labels
Header: api_access_token: <token da instância>
Body:   { "labels": ["etapa:visita-agendada", "q:deu-data", "q:tem-troca", "q:modelo-definido"] }
```

🚨 **Este endpoint SUBSTITUI o conjunto inteiro de labels da conversa.** Verificado no fonte do
Chatwoot: `LabelConcern#create` → `update_labels(params[:labels])` → `update!(label_list: labels)`.
**Não existe "append" nessa rota.** Mandar só `["perda:preco"]` apaga a `etapa:` e as `q:` sem
nenhum erro. O nó tem que **ler o estado atual** (`GET .../labels`), fundir, e postar o conjunto
completo — ou montar o conjunto completo do zero a cada escrita, que é o que a gente prefere
(ver §6.2).

### Nó B — `perda:`, ao encerrar (chamada de classificação separada)

Uma chamada curta, modelo barato, sobre o transcript, **fora do prompt de vendas**.

Duas razões pra ser separada: (1) prompt que atende e classifica ao mesmo tempo piora nas duas
coisas; (2) mexer no roteiro de vendas é mudança que precisa de janela de comparação, e a gente
não quer que a etiquetagem pague esse custo.

Saída esperada — JSON, e **lista fechada**:

```json
{ "perda": "queria-vender" | "preco" | ... | null,
  "evidencia": "trecho literal do cliente que sustenta a escolha",
  "custom": { "modelo": "...", "valor_proposto": 2990, "data_visita": "2026-09-03" } }
```

⚠️ **O nó tem que descartar qualquer valor fora da lista.** Se a IA puder escrever label livre, ela
inventa `lead-quente-2` e o número se parte em dois sem ninguém perceber. Já vimos isso acontecer em
outro contexto nosso: mapa de nomes duplicado custou R$ 1.000 numa folha.

⚠️ **`perda` = `null` é resposta legítima e importante.** "Não deu pra dizer" tem que ficar sem
label, não virar `perda:so-pesquisando` por eliminação — ver §6.3.

### Nó C — paridade na Urban

Criar as mesmas labels na instância da Urban (hoje: zero) e ligar os mesmos nós. Sem isso a Urban
continua sendo um buraco na medição, como já é na atribuição de anúncio.

---

## 5. O que fica do nosso lado (não depende de você)

- `sem-resposta:*` e **resolver conversa** — script noturno nosso. Hoje `resolutions_count` é **0**
  nas duas instâncias: ninguém fecha conversa, então todo relatório de resolução do Chatwoot vem
  vazio e as dezenas de milhares de conversas "abertas" não significam nada.
- **Leitura e cruzamento com venda** — as labels entram no nosso painel (tela *Diário → Atendimento*),
  junto das etiquetas determinísticas que a gente já deriva do texto.
- **Calibração** (§6.4).

---

## 6. Armadilhas — as quatro que já custaram erro nosso ou estão verificadas no código

### 6.1. Label vira mensagem de atividade — e é assim que se data
Toda label aplicada gera uma mensagem `message_type: 2` (*"Eduardo adicionou lead-qualificado"*),
com hora e autor. **O histórico existe** — o que não existe é no objeto da conversa, que só mostra o
estado atual. Qualquer contagem por período tem que ler a atividade, não o `labels` da conversa.

### 6.2. A conversa é a pessoa, não o atendimento
No Chatwoot a conversa é reaberta quando o cliente volta meses depois. Um `perda:preco` de junho
fica grudado no lead que compra em setembro. Por isso preferimos **reescrever o conjunto completo a
cada rodada** em vez de acumular: o estado atual sempre descreve o atendimento atual, e o histórico
fica na atividade (§6.1).

### 6.3. "Sem label" ≠ "avaliado e sem motivo"
A gente já aplica essa distinção nos dados de origem de venda, e ela é o que permite medir
**cobertura** sem chutar o denominador. Conversa que nunca passou pelo classificador **não pode**
receber label por omissão. Se quiser marcar "avaliei e não deu pra dizer", que seja uma label
explícita (`perda:indefinido`), nunca a ausência.

### 6.4. Toda label da IA tem que ser calibrada antes de virar número
`q:deu-data` **tem que reproduzir os 14,9% de conversão** que já medimos por outro caminho. Se não
reproduzir, quem está errado é a marcação — não a métrica. Vale pra todas: a gente compara a label
da IA contra a etiqueta que derivamos do texto por fora, e publica a taxa de concordância junto do
número. Label de opinião sem calibração registra o erro dela como se fosse fato.

---

## 7. Perguntas abertas pra você

1. **Dá pra postar as labels no mesmo nó que monta o cartão**, ou é melhor um nó separado depois?
2. **As caixas de WhatsApp dos vendedores já estão ligadas?** A instância da Cart tem
   `David - WhatsApp` (183 conversas), `Maria - WhatsApp` (30), `Maria SAC` (19) e `Mel - WhatsApp`
   (14). Se elas estão em uso, as labels precisam valer nelas também — senão o funil fica pela
   metade justamente na parte humana.
3. **`conversa_estado`**: ainda faz sentido ligar, agora que boa parte disso sai do cartão? Pra nós
   o que sobra de valor lá é o **motivo declarado** e o **carimbo ao vivo** — o resto a gente
   consegue derivar.
4. **A/B do fechamento**: dá pra sortear por hash do telefone no n8n? É a única forma de testar a
   hipótese de fechamento (oferecer horário concreto vs. perguntar qual dia) em ~10 dias, decidindo
   por comportamento (*cliente deu data*) em vez de por venda.

---

## Resumo em cinco linhas

1. `lead-qualificado` hoje é sinônimo de "foi transferido" — medido: 564 de 571 no mesmo segundo da atribuição.
2. A IA **já classifica** no cartão de handoff (36% das conversas, 12 tipos, campos cheios) — dá pra derivar label disso sem tocar no prompt.
3. O que falta de verdade é **motivo de perda**, nas 64% que nunca geram cartão.
4. `POST /labels` **substitui tudo** — sempre mandar o conjunto completo.
5. A Urban não tem label nenhuma; sem paridade, nenhum número compara.
