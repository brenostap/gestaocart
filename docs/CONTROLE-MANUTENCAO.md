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

## O sistema — tela de Bancada no painel

> Correção de 12/ago: eu tinha escrito aqui que o caminho seria Google Sheets → sync. Não é.
> **O painel já escreve no Supabase** — `custos`, `metas_mensais`, `funcionarios_config` e
> `tabela_precos` têm política `auth_all` e gravam por upsert do próprio browser
> (`setEquipeExtra()` em `equipe.js` é o modelo). O "app só lê" do CLAUDE.md vale pros dados da
> FoneNinja, não pras tabelas do próprio painel. Uma tela de Bancada é caminho batido.

### A tabela `bancada`

Uma linha por **ida à assistência** (o mesmo aparelho pode ir várias vezes):

```
id · apple_id · imei4 · etiqueta · modelo_txt · cor_txt
fornecedor (RR|ACCESS) · origem (estoque|cliente|garantia)
servico_pedido · saiu_em · voltou_em · valor_previsto
reparo_id (→ reparos, preenchido na conciliação) · quem · obs
```

Política: `auth_all` pra `authenticated`, igual às outras tabelas do painel.

### A captura — 4 dígitos e 3 toques

Tela aberta no celular do Vitinho:

1. Digita os **4 dígitos** → aparece a lista de candidatos do estoque **com modelo, cor, custo e
   dias de prateleira**. Ele toca no certo.
   - É o olho que desempata, que foi exatamente o que salvou o caso da etiqueta `831`. Câmera/
     leitor de código de barras é enfeite pra depois — não resolve nada que os 4 dígitos não
     resolvam, e adiciona permissão de câmera.
2. Fornecedor: dois botões. Serviço: lista das ~12 mais comuns, tirada do histórico real de
   `reparos`.
3. **SAIU**.

Voltar é 1 toque na lista "Na bancada".

⚠️ **Modo lote é obrigatório, não enfeite.** Em 11/ago saíram **26 aparelhos de uma vez** pra
subida de bateria. Se isso custar 26 × 3 toques, ele para de usar na primeira semana. Marca vários,
um destino, um serviço, um SAIU.

### O que o sistema faz sozinho (é aqui que fica smart)

| | O que faz | Precisa de |
|---|---|---|
| 1 | **Sabe o que é o aparelho** — modelo, cor, custo, origem, dias de prateleira. Nada digitado, nada errado | só a tabela |
| 2 | **Tira do disponível** — selo "Na assistência · N dias" no Estoque | só a tabela |
| 3 | **Cobra sozinho** — passou de 14 dias, aparece no dashboard | só a tabela |
| 4 | **Estima antes de mandar** — "face id 14 Pro Max: RR R$ X · Access R$ Y" | `tabela_servicos` |
| 5 | **Faz a conta que ninguém faz** — margem que sobra depois do reparo + carrego dos dias previstos. Aparelho de R$ 700 com tela de R$ 470 avisa na hora que não fecha | `tabela_servicos` + `tabela_precos` |
| 6 | **Concilia a nota** — casa nota × bancada e dá três alarmes: nota sem linha (saiu sem registro), linha sem nota (não cobrado ou baixa errada), valor ≠ tabela | `reparos.js` |
| 7 | **Mede o prazo real de cada fornecedor** — medido, não prometido, por serviço | histórico |
| 8 | **Alimenta a compra** — reparo/unidade e % de garantia por origem e por modelo | histórico |

Os itens 1 a 3 já pagam a obra: são os R$ 87 mil invisíveis.

### As tabelas de preço viram dados

`tabela_servicos` (`fornecedor · servico · modelo · peca · preco · vigencia`), carregada dos dois
PDFs. É o que destrava os itens 4, 5 e 6 — sem isso, conferir a nota continua sendo trabalho de
olho. A da Access sai limpa do PDF; a da RR é PDF de Canva com texto posicionado glifo a glifo e
vai precisar de conferência manual.

### Ordem

| Fase | O quê | Entrega |
|---|---|---|
| **0** | tabela `bancada` + tela de captura (com lote) + selo no Estoque | mata os R$ 87 mil invisíveis |
| **1** | `tabela_servicos` + conciliação automática na segunda + alerta de 14 dias | a nota confere sozinha |
| **2** | estimativa "vale consertar?", prazo por fornecedor, garantia por modelo | muda decisão de compra |

A planilha continua rodando **em paralelo por uma semana** depois da fase 0 — é ela que prova que
a tela não está perdendo linha. Depois morre.

### O que NÃO fazer smart

Não parsear mensagem de WhatsApp do Vitinho, não adivinhar o serviço pelo texto, não inferir que
o aparelho voltou porque apareceu numa venda. **Sistema smart é o que sabe muito e pergunta pouco
— não o que adivinha.** Um palpite errado aqui lança custo no aparelho errado, em silêncio.

### Perguntar antes de construir

**A FoneNinja tem módulo de assistência / ordem de serviço?** Se tiver, o aparelho muda de status
lá dentro, o `phonecar-sync` traz, e nada disso precisa existir. Vale a pergunta antes da fase 0 —
é a única coisa que pode tornar a obra desnecessária.

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
