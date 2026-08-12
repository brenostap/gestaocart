# Controle de manutenção — o livro da bancada

Plano de registro das manutenções com o Vitinho. Escrito em 12/ago/2026, a partir da planilha
que ele começou em 11/ago e do cruzamento com `estoque`/`reparos` no Supabase.

> Irmão deste doc: **`REPAROS-ATRIBUICAO.md`** — lá é como a *nota* vira custo por aparelho
> (depois do fato). Aqui é como o *aparelho* é acompanhado enquanto está fora (durante o fato).
> Um mede dinheiro, o outro mede tempo e paradeiro.

## O buraco em uma frase

**O painel não sabe que o aparelho saiu da loja.** Ele fica `available` até voltar.

Retrato de hoje (12/ago), cruzando a planilha do Vitinho com o `estoque`:

| | |
|---|---:|
| Aparelhos na bancada agora | **43** |
| Capital parado neles | **R$ 87.461** |
| Fatia do estoque disponível | **16%** (de R$ 553.297) |
| O mais velho | **93 dias** — etiqueta `381`, iPhone 16 Plus Rosa, R$ 2.782, saiu 11/mai |

Todos os 43 aparecem como **disponíveis** na tela de Estoque. Um vendedor pode prometer qualquer
um deles hoje e não ter o aparelho pra entregar.

E o carrego (3% a.m., ver `CONTEXT.md`) corre o tempo todo: só o que já se acumulou nesses 43
até hoje passa de R$ 700, e o 16 Plus sozinho já queimou **R$ 259** de capital parado na bancada.

## São duas coisas diferentes na mesma planilha

Isso é o que faz a lista parecer bagunçada quando não é.

| | **Preparo de lote** | **Conserto individual** |
|---|---|---|
| O que é | subida de bateria na chegada da remessa | tela, face id, placa, conector |
| Ritmo | sai junto, volta junto (26 no dia 11/ago) | um a um, imprevisível |
| Preço | R$ 25 fixo na RR | R$ 160 a R$ 1.005 |
| Volume | **125 das 175 linhas da RR** (48% do valor) | o resto |
| Risco | ~nenhum: previsível e barato | **é ele que trava capital** |
| Controle certo | por **lote** (uma linha, N aparelhos) | por **aparelho** |

Misturar os dois é o que faz 27 linhas iguais de um dia esconderem o 16 Plus parado há 93 dias.

## A regra única

> **Aparelho não sai da loja sem linha. Não volta sem baixa.**

Todo o resto é detalhe dessa frase. Se o Vitinho só fizer isso, já resolve 80%.

## As colunas da planilha

Mesma planilha, colunas fixas. Quase tudo é lista suspensa — digitar é o que quebra.

| Coluna | Preenche | Regra |
|---|---|---|
| `SAIU` | na hora | data |
| `ONDE` | na hora | **RR** ou **Access** (lista) |
| `IMEI4` | na hora | **últimos 4 dígitos do IMEI — obrigatório, sempre** |
| `MODELO` | na hora | modelo + cor |
| `ETIQUETA` | na hora | **com o prefixo**: `E1585`, `SP1047`, `381`. Vazio se não tiver |
| `ORIGEM` | na hora | **Estoque · Cliente · Garantia** (lista) |
| `SERVIÇO` | na hora | texto curto |
| `VOLTOU` | na volta | data — **é essa coluna que mede tudo** |
| `R$` | na segunda | valor da nota, conferido linha a linha |
| `OBS` | quando precisar | |

Duas vistas: **Na bancada** (filtro `VOLTOU` vazio, ordenado por `SAIU`) e **Fechadas**.

### Por que `IMEI4` é obrigatório — a prova

Na planilha de 11/ago, a coluna ETIQUETA tem **duas numerações diferentes misturadas**: as
etiquetas de estoque (`E1670`, `E1655`) e uns números de 3 dígitos do lote novo (`821`, `831`,
`853`…). Cruzando com o banco:

- planilha: `831` → *17 preto (3514)*
- estoque: `SP831` → **iPhone 15 128GB Azul, já vendido**

Se o importador tivesse casado por etiqueta, teria lançado o reparo no **aparelho errado**. O que
salvou foi o `(3514)` que o Vitinho escreveu entre parênteses — o fim do IMEI. Os 26 aparelhos
daquele lote casam **100%** por IMEI4, com modelo e cor batendo.

### Por que a etiqueta vai **com prefixo**

`E1030` (16 Rosa, disponível) e `SP1030` (16 Preto, vendido) viram o mesmo "1030" se você joga o
prefixo fora. **138 aparelhos do estoque colidem assim** (67 pares). O prefixo custa dois
caracteres e resolve.

### Por que `ORIGEM` é uma coluna e não uma observação

É o que separa **custo** de **despesa**, e hoje isso está errado no resultado do mês:

| Origem | O que é | Onde o dinheiro deve ir |
|---|---|---|
| **Estoque** | recondicionamento antes de vender | custo **daquele aparelho** |
| **Garantia** | aparelho já vendido, voltou | despesa do mês (provisão) — não pertence a aparelho nenhum |
| **Cliente** | serviço pago pelo dono do aparelho | não é nosso custo — é receita |

Hoje **45% do valor** (R$ 15.178 de R$ 36.685) é garantia, e mesmo assim tudo entra igual. Sem
essa coluna, o custo por modelo continua torto — e é o custo por modelo que decide a compra.

## A rotina

**Todo dia — Vitinho, 30 segundos por aparelho**
1. Entregou na assistência → uma linha (`SAIU`…`SERVIÇO`).
2. Recebeu de volta → `VOLTOU`.

**Toda segunda — Vitinho, 15 minutos.** A nota chega segunda, cobrindo seg–sáb da semana anterior.
3. Confere a nota **linha a linha** contra a planilha e preenche o `R$`. Três perguntas:
   - Tem linha na **nota** que não está na planilha? → **saiu aparelho sem registro**.
   - Tem linha marcada como voltou que não está na nota? → serviço não cobrado, ou baixa errada.
   - O valor bate com a tabela do fornecedor? → aba `Tabela`.
4. Olha a vista **Na bancada** e cobra tudo que passou de 7 dias.

**Todo mês — Breno**
5. `node scripts/reparos.js importar` + `conciliar AAAA-MM` (ver `REPAROS-ATRIBUICAO.md`).
   Com a planilha no formato fixo, a Access para de ser texto livre e casa igual à RR.

## O placar do Vitinho — 3 números

Só isso. Se os três estão bons, a bancada está sob controle.

| Número | Hoje | Meta |
|---|---:|---|
| Aparelhos na bancada · R$ parado | 43 · R$ 87.461 | cair |
| O mais velho | **93 dias** | **nada acima de 14** |
| Linhas da nota sem par na planilha | ? | **zero** |

## Onde isso encosta no painel (fase 2, não agora)

A fase 1 é só planilha — ela precisa rodar sozinha algumas semanas antes de virar código.

Quando virar, o caminho mais barato é o que **já existe pros preços**: Google Sheets é a fonte,
uma sync leva pro Supabase. Aí a tela de Estoque ganha um selo **"Na assistência · 12 dias"** e o
aparelho para de aparecer como disponível. Não depende de ninguém lembrar de mexer na FoneNinja.

⚠️ Não somar `reparos` com `custos` — ver o aviso de dupla contagem em `REPAROS-ATRIBUICAO.md`.

## O que pedir pros fornecedores

Já estava no `REPAROS-ATRIBUICAO.md`; a planilha dá força pro pedido porque agora dá pra provar
o que falta.

- **RR / LegacyPhone** — **data do serviço por linha**. Hoje a nota traz só o período, e a que
  atravessa o mês cai inteira no mês do fechamento. É a última aproximação que sobrou.
- **Access** — **formato fixo, uma linha por aparelho**: `IMEI4 | ETIQUETA | modelo | cor |
  serviço | valor`. Hoje vem texto de WhatsApp e é a fonte mais frágil das duas.

## As duas tabelas de preço

`Manutenção Lojistas - 2026.pdf` é a da **Access**; `TABELA LOJISTA - LEGACYPHONE` é a da
**RR (Lucas)**. Valem numa aba `Tabela` da planilha, lado a lado — é o que permite conferir a
nota e escolher onde mandar.

Um caso já claro: **subida de bateria**. A Access cobra por faixa (R$ 30 do 11 ao 12 Pro Max,
R$ 35 do 13 ao 14 Pro Max, R$ 40 do 15 ao 15 Pro Max); a **RR cobra R$ 25 fixo**, em qualquer
modelo — e as 125 subidas de bateria do período foram **todas** na RR. Está certo como está.

⚠️ Comparar tela é mais delicado: a Access separa **Original × Importada OLED × Genuína × S/MSG**
e a RR trabalha com "sem mensagem". Não são a mesma peça — comparar preço sem comparar a peça
inverte a decisão.
