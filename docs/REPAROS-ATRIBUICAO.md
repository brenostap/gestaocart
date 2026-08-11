# Atribuição de reparo ao aparelho

Como a cobrança semanal das assistências vira custo por aparelho. Processo mensal,
não arqueologia. Escrito em 11/ago/2026.

## Por que

R$ 63 mil em jun+jul estavam lançados agregados em `custos` (área `assistencia`), sem ligação com
nenhum aparelho. Consequência: a margem por modelo estava superestimada, e mais nos modelos velhos —
justamente os que quebram. E **metade desse dinheiro nem é custo de mercadoria: é garantia de
aparelho já vendido**, que não pertence a aparelho nenhum em estoque.

## Uso

```sh
export SUPABASE_SERVICE_ROLE_KEY=...          # nunca no repo: a Netlify publica a raiz

node scripts/reparos.js ler      RR/*.pdf notas/*.txt   # só parseia + trava 1
node scripts/reparos.js importar RR/*.pdf notas/*.txt   # parseia, casa, grava
node scripts/reparos.js revisar                          # o que não casou
node scripts/reparos.js conciliar 2026-08                # trava 2
```

As notas ficam em `RR/` (PDF) e `notas/` (texto). **As duas pastas estão no `.gitignore`** —
elas têm IMEI de cliente e preço de fornecedor, e commitar deixaria tudo baixável em
`cartsystem.phonestp.com/RR/<arquivo>.pdf`.

Sem a chave, dá pra rodar contra um retrato local e gerar SQL pra revisar antes:

```sh
node scripts/reparos.js importar RR/*.pdf notas/*.txt \
  --estoque estoque.json --vendas vendas.json --sql saida.sql
```

## As duas fontes

| | RR / LegacyPhone | Access |
|---|---|---|
| Formato | **PDF do Legacy OS**, tabela rígida | texto do WhatsApp, formato livre |
| Identificação | **IMEI completo (15 dígitos)** | 4 dígitos (etiqueta ou fim do IMEI) |
| Casamento | **~91%** automático | **100%** com as três chaves |
| Fragilidade | baixa — sai de sistema | **alta** — muda toda semana |

Ambas fecham na segunda-feira, cobrindo seg–sáb da semana anterior. **A nota atravessa o mês**
(a de 27/07 vai até 01/08), por isso `data_servico` é separado de `data_fechamento`.

> **O ponto de alavanca da Access é pedir formato fixo**, não escrever parser melhor:
> uma linha por aparelho, `ETIQUETA | modelo | cor | serviço | valor`, com o prefixo
> (`E1585`, `SP1047`). É o que a RR já faz.

## As três chaves de casamento

Nesta ordem. **Nunca chuta**: o que não resolve vai pra `status='revisar'`.

1. **IMEI completo** — 15 dígitos não colidem. Só a RR manda.
2. **Etiqueta** — comparando só os dígitos, então `1585` casa com `E1585` e `1047` com `sp1047`.
   É um match **completo** de 4 dígitos, não um pedaço — evidência mais forte que sufixo de IMEI.
3. **Últimos 4 do IMEI** — colide em **14% dos aparelhos**; só vale com o modelo junto.
4. **Empate entre 2 e 3 → a cor decide.** Se a cor não bate em nenhum, é erro de digitação.

Provas de que a ordem importa:
- `1650` só casou por etiqueta (`E1650` = 13 Azul, cor confere). Pelo IMEI apontava pra um **12 Pro**.
- `1472` a cor apontou pro IMEI (14 Pro **Roxo**), não pra etiqueta `e1472` (14 Pro **Dourado**).

### O prefixo do serial diz a origem

| Prefixo | Itens | O que é |
|---|---:|---|
| `E####` | 535 | **entrada/troca** (95,5%) |
| `sp###` | 292 | fornecedor (100%) |
| `j##` | 42 | fornecedor (100%) — provavelmente JAMES |
| só número | 423 | fornecedor (99,8%) |

Serve de terceira conferência: candidato com serial `sp` provavelmente não é leitura de etiqueta.

## As duas travas

Este projeto quebra em silêncio. As travas existem pra ele quebrar alto.

- **Trava 1 — a nota fecha.** Soma dos líquidos == total impresso. Se não fecha, **aborta e não
  grava nada**. Foi assim que apareceu o IMEI de 16 dígitos da RR (a soma dava R$ 820 a menos).
- **Trava 2 — o mês fecha.** Soma dos reparos == lançamentos de `assistencia` em `custos` do mês.

O desconto ("Desconto Thiago") é rateado proporcional, com a sobra do arredondamento indo pra maior
linha — senão a soma fica R$ 0,01 fora e a trava 2 acusa falso positivo todo mês.

## ⚠️ Não contar duas vezes

`reparos` é **camada analítica, não contábil**. O P&L continua lendo `custos`. Somar as duas conta o
mesmo dinheiro duas vezes.

Se um dia quiser CMV exato, as duas metades vão pra lugares diferentes:

| Metade | Onde deve ir |
|---|---|
| **Recondicionamento** (reparo antes da venda) | custo **daquele aparelho** — é decisão de compra |
| **Garantia** (reparo depois da venda) | **provisão por venda** — o aparelho já foi embora |

`tipo` é **derivado** de `data_servico` vs data da venda. Ninguém classifica à mão.

## Estado da carga (11/ago/2026)

205 linhas, R$ 36.685. Casadas: 185 (90,2%).

| Mês | Reparos | Custos/assistência | Diferença |
|---|---:|---:|---:|
| jun/2026 | — | R$ 39.340 | **−39.340** — notas de junho não existem |
| jul/2026 | R$ 21.557 | R$ 24.055 | −2.498 — a nota de 27/07 cai em agosto |
| ago/2026 | R$ 15.128 | — | ainda não lançado |

Três coisas a resolver, todas apontadas pela trava 2:

1. **Junho não tem nota nenhuma.** R$ 39.340 lançados em bloco no dia 30/06, sem detalhe. Se as
   notas existirem, vale importar; senão junho fica cego pra sempre.
2. **A RR não data serviço por linha**, só o período. Nota que atravessa o mês cai toda no mês do
   fechamento. É a única aproximação que sobrou — **pedir data por linha resolve.**
3. **Agosto ainda não foi lançado em `custos`.**

### Linhas em revisão (20, R$ 3.290)

- **13 da RR**: IMEI que não existe no estoque. Quatro deles são erro de digitação da própria nota
  (três com 16 dígitos, um com 14) — **mandar pra RR conferir**.
- **3 lotes "sub bat" da Access**: serviço de bancada em lote, sem aparelho. Correto ficarem sem
  `apple_id`.
- **1 linha da Access sem código**: `16/07 · 12 verde · carcaça + bateria + tela importada + face id
  · R$ 930` — a maior linha sem identificação da base.

## O que a atribuição revelou

Reparo medido por origem do aparelho, contra as unidades vendidas em jun+jul:

| Origem | Vendidas | Serviços | Bancada | **Reparo/un** | % garantia |
|---|---:|---:|---:|---:|---:|
| **TROCA** | 187 | 99 | 21.034 | **R$ 112** | 44% |
| **STP** | 148 | 72 | 8.844 | **R$ 60** | 34% |
| **DESEJO** | 113 | **4** | 563 | **R$ 5** | 100% |
| JAMES | 21 | 2 | 1.215 | 58 | 100% |
| ED | 22 | 4 | 764 | 35 | 18% |
| **ERICK, GRUPO, APPLE SHOW, TM** (lacrado) | 31 | **0** | **0** | **R$ 0** | — |

Três conclusões, agora medidas em vez de estimadas:

1. **A troca continua ganhando, mesmo carregando a bancada mais cara.** R$ 112/un de conserto contra
   R$ 60 do STP e R$ 5 da DESEJO — e ainda assim é a melhor margem real.
2. **A DESEJO entrega aparelho que não quebra (4 serviços em 113 unidades), e isso não salva o
   preço dela.** Economiza ~R$ 55/un de bancada contra o STP e cobra R$ 286 a mais.
3. **Lacrado: zero reparo, zero capital.** Confirma que o "9% de margem" da linha 17 é enganoso.

Margem real por origem (bruta − carrego − reparo medido − taxa 3,5%):

| Origem | Bruta | −carrego | −reparo | −taxa | **Real** |
|---|---:|---:|---:|---:|---:|
| **TROCA** | 724 | −16 | −112 | −80 | **R$ 516** |
| **STP** | 652 | −30 | −60 | −116 | **R$ 446** |
| GRUPO (lacrado) | 744 | 0 | 0 | −240 | **R$ 504** |
| ERICK (lacrado) | 528 | 0 | 0 | −221 | **R$ 307** |
| JAMES | 508 | −35 | −58 | −119 | **R$ 296** |
| ED | 368 | −10 | −35 | −70 | **R$ 253** |
| **DESEJO** | 350 | −45 | −5 | −115 | **R$ 185** |

⚠️ O gasto de bancada cobre jun–ago; as unidades vendidas, jun–jul. O reparo por unidade é uma
aproximação até fechar um mês inteiro com nota e venda no mesmo período.
