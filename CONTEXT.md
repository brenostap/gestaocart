# Contexto — Phone Cart

Glossário do domínio. **Só vocabulário** — nada de implementação (isso é `CLAUDE.md` e `docs/`).

Um termo entra aqui quando duas pessoas usaram a mesma palavra pra coisas diferentes, ou quando o
código chama de X algo que o dono chama de Y.

---

## Margem

Quatro coisas diferentes já foram chamadas de "margem" nesta operação. A distinção nasceu na
análise de jun/jul-2026 (`docs/ANALISE-JUN-JUL-2026.md`), porque a escolha de qual usar **inverte
decisões de compra**.

- **Margem bruta** — `preço − custo de aquisição`. É o que o painel mostra hoje e o que
  `venda_produtos.lucro` contém. **Não é a margem do negócio**: ignora três custos já pagos.
- **Carrego** — custo de o capital ficar preso no aparelho: `custo × dias em estoque × taxa diária`.
  Existe porque o estoque é financiado por empréstimo. Um aparelho que dorme 50 dias custa dinheiro
  mesmo que venda pelo preço cheio.
- **Margem operacional** — `margem bruta − carrego − taxa de cartão`.
- **Margem real** — `margem operacional − reparo`. **É a única que serve pra decidir compra.**

Regra: **margem em R$ por aparelho, nunca em %.** Bases de custo de R$ 700 e R$ 7.000 não se
comparam em percentual — a linha 17 parece péssima a 9% e é o segundo melhor negócio da casa.

## Reparo

Serviço de bancada feito num aparelho. Duas coisas contabilmente opostas caem hoje no mesmo balde
(`custos`, área `assistencia`):

- **Recondicionamento** — conserto **antes** da venda, pra deixar o seminovo vendável. É **custo de
  mercadoria**: pertence ao aparelho e deveria sair da margem daquela unidade.
- **Garantia** — conserto **depois** da venda. É passivo de uma venda passada; não há unidade em
  estoque pra receber o custo.

A **data do reparo** distingue os dois sem precisar perguntar a ninguém.

## Canal de origem

De onde o aparelho entrou no estoque. Não é o mesmo que fornecedor.

- **Troca** — veio do cliente num upgrade (`venda_trocas`). Aparece sem `ultimo_fornecedor`.
  Historicamente o canal mais rentável.
- **Fornecedor** — compra de terceiro (`compras`).
- **STP** — é **o próprio dono importando dos EUA**. Conta como fornecedor de verdade, não é carga
  de estoque, mas tem estrutura de custo própria.

## Loja

**Cart** e **Urban** são duas empresas com sociedade diferente, não duas filiais.

- Cart: Breno 55% · Marcella 30% · Gustavo 15%
- Urban: Gustavo 50% · Breno 40% · Marcella 10%

Consequência: **resultado consolidado não é o resultado de ninguém.** Toda análise financeira tem
que sair por loja, e o número que interessa a um sócio é o resultado da loja × a fatia dele.

## Brinde

Item dado ao cliente como ferramenta de negociação, decidido na hora pelo vendedor. **Não é venda a
preço zero.** Registrar brinde como venda de R$ 2 esconde o custo de aquisição do cliente e
subestima o custo por venda — o brinde pertence à margem da venda em que foi usado.

## Estoque fantasma

Item marcado `available` que já tem venda concluída. Infla o capital declarado e envenena o ranking
de encalhe (o item que "está parado há mais tempo" costuma ser um que já saiu).

## Attach rate

Fração das vendas de aparelho que levaram ao menos um acessório. Medida sobre vendas, não sobre
itens.
