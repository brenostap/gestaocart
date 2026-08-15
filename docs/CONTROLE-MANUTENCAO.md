# Controle de manutenção — o livro da bancada

Plano de registro das manutenções com o Vitinho. Escrito em 12/ago/2026, a partir da planilha
que ele começou em 11/ago e do cruzamento com `estoque`/`reparos` no Supabase.

> ⚠️ **A tela se chama "Assistência" desde 15/ago/2026** (era "Bancada"). Mudou **só o rótulo**:
> a tabela `bancada`, o arquivo `js/bancada.js`, a aba `currentTab='bancada'` e as funções `bnc*`
> continuam com o nome antigo. Este doc usa os dois: "bancada" quando fala de código e dados,
> "Assistência" quando fala do que o usuário vê.
>
> A tela também exporta a lista de "não vender" pro grupo do WhatsApp — ver
> *Exportar pro grupo*, no fim.

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

Política (desde 14/ago/2026): escrita por **`pode_operar()`** — sócio ou bancada —, e **apagar é
só do sócio**. Não é mais `auth_all`. Ver `docs/PERFIS-E-ACESSO.md`.

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
| ✅ **0** | tabela `bancada` + tela de captura (com lote) + selo no Estoque | mata os R$ 87 mil invisíveis |
| ✅ **1** | conciliação `reparos` × `bancada` + preço de referência aprendido | a nota confere sozinha |
| **2** | estimativa "vale consertar?", prazo por fornecedor, garantia por modelo | muda decisão de compra |

### ✅ Fase 0 — no ar em 12/ago/2026

- Tabela `bancada` no Supabase (policy `auth_all`), `js/bancada.js`, `css/bancada.css`.
- Menu **Operações › Bancada**. Visível pra **todos os papéis**, inclusive vendedor e atendente —
  quem atende precisa saber que o aparelho não está na prateleira **antes** de prometer.
- Captura: busca por 4 dígitos / etiqueta / modelo → marca um ou vários → fornecedor, serviço,
  origem → **Registrar saída**. Lote grava as N linhas de uma vez com o mesmo `lote`.
- Aparelho que não está no estoque (do cliente) entra pelo link *"não está no estoque"*.
- Baixa é 1 toque em **Voltou**, e tem **desfazer** na aba *Voltaram*.
- Estoque ganhou o KPI **Na assistência** e o selo **🔧 Na assistência · N d** na linha.
- Protegido por `node test/bancada.test.js` — que monta a tela de Bancada **e a de Estoque**.

**Ainda não tem** (é a fase 1): valor da nota, conciliação automática e a `tabela_servicos`. Por
enquanto o `R$` continua sendo conferido na planilha na segunda.

### ✅ Correções de estoque — 13/ago/2026

O estoque estava com **57% sem etiqueta e 45% sem bateria** (136 e 106 de 237). Quem tem essa
informação é quem mexe no aparelho, e ele não tinha onde botar.

⚠️ **Não dá pra editar `estoque` no Supabase.** O sync reescreve as 237 linhas de hora em hora —
conferido em 13/ago: 237 de 237 tocadas nas últimas 2h. Editar ali é escrever na areia.

Por isso é uma **camada de correções (`estoque_correcoes`), não um espelho.** Guarda só o delta —
`apple_id · campo · valor_novo · valor_fn · quem` — e o painel mostra o valor corrigido por cima.

**A propriedade que faz isso não apodrecer: a correção é auto-limpante.** Ela existe enquanto
DIVERGE. Quando a FoneNinja passa a dizer o mesmo valor, ela some da lista sozinha, no próprio
sync. Ninguém marca como resolvida, ninguém limpa nada — e é isso que impede a tabela de virar um
segundo estoque com a pergunta semanal de "qual dos dois está certo?".

| Campo | Como entra |
|---|---|
| **Bateria** | correção — substitui o valor exibido |
| **Etiqueta** | correção — substitui o valor exibido |
| **IMEI** | **só reporte** — nunca substitui |

O IMEI é a chave que liga venda, reparo e bancada (`bancada` casa por `apple_id` + 4 dígitos).
Trocar sozinho quebraria o casamento de tudo; ele só levanta a mão e um sócio decide.

Quem corrige: `podeCorrigirEstoque()` = **sócio e bancada**. É eixo próprio, não um degrau da
escada de dinheiro — o `bancada` corrige e continua sem ver um R$ sequer.

O sócio vê o KPI **"A corrigir na FoneNinja"** e um **✎** na linha que ainda diverge — é a lista
do que precisa ser digitado no ERP.

Protegido por `node test/correcoes.test.js`.

### ✅ Estado da peça — 13/ago/2026

O buraco entre **"chegou"** e **"foi pra assistência"**: o aparelho pode estar na loja e quebrado,
ou esperando peça, sem ter saído. O painel dizia que estava disponível.

`estoque_estado` — um estado por aparelho, marcado à mão. Cinco valores, e só:

| | |
|---|---|
| ✓ **Revisado** | pronto pra vender |
| ? **Avaliar** | ninguém olhou ainda |
| ! **Precisa reparo** | tem defeito, vai pra bancada |
| ⏳ **Aguardando peça** | parado esperando |
| ✕ **Sem conserto** | não vale a pena |

Tocar no mesmo chip desmarca. O sócio vê o KPI **"Não prontos"** — na loja e não dá pra vender.

Três coisas separadas, que é o que impede virar bagunça:

| | O que é | Converge pra quê |
|---|---|---|
| `estoque_correcoes` | **delta** do que a FoneNinja diz errado | some quando o ERP concorda |
| `estoque_estado` | informação **nova**, que o ERP não tem | não converge — é nossa |
| `bancada` | o aparelho **saiu** da loja | fecha quando volta |

Por isso o estado **não** entra na tabela auto-limpante: não teria pra onde convergir. E quando o
aparelho está fora, o selo da Bancada manda — o estado nem aparece na linha, senão dois selos
brigam dizendo onde ele está.

> **`status` da FoneNinja continua fora.** `available → sold` é a venda que decide; ninguém marca
> à mão. O que você pediu — "marcar que está na assistência" — já era a Bancada, e ela é melhor:
> carrega a data de saída e o fornecedor.

### ✅ Custo do serviço na Bancada — 13/ago/2026

`bancada.valor_cobrado` — o que a nota cobrou de fato (o `valor_previsto` era a estimativa antes de
mandar). Editável **nas duas abas**, porque o valor chega na nota de segunda, sempre depois do
aparelho voltar. O card *Voltaram* mostra quantos ainda estão **sem valor da nota** — é a lista de
trabalho da conferência.

KPI **"Serviço no mês"** soma o que foi lançado.

**Novo interruptor: `podeVerCustoServico()` = sócio e bancada.** É eixo próprio, não um degrau da
escada de dinheiro:

| | `bancada` vê? |
|---|---|
| custo de **serviço** (o que a assistência cobra) | ✅ |
| custo do **aparelho**, preço, margem, capital parado | ❌ |

O motivo é prático: ele leva os aparelhos e recebe as notas — já vê esses números no papel.
Esconder no painel só impediria ele de fazer a conferência de segunda, que é o trabalho.
`moneyServico()` é o irmão de `money()` com esse interruptor.

## ✅ Fase 1 — a conferência (13/ago/2026)

Aba **Conferência** na Bancada, **só sócio** (`reparos` tem policy `reparos_socio`; conferir a
nota é controle financeiro, não trabalho de bancada). Cruza as duas metades:

> `reparos` é o **dinheiro** (vem da nota, depois do fato, via `scripts/reparos.js`).
> `bancada` é o **paradeiro** (vem da pessoa, durante).

Três alarmes:

| | O que significa |
|---|---|
| **Na nota, sem registro aqui** | o aparelho saiu da loja e ninguém registrou |
| **Registrado, sem nota** | voltou e não apareceu na cobrança — ou a baixa está errada |
| **Valor diferente da nota** | o que foi lançado não bate com o que foi cobrado |

### As três decisões que impedem alarme falso

Sem elas a tela apontaria dezenas de "problemas" na primeira semana e ninguém abriria de novo.

1. **Só cobra a partir do dia em que o LIVRO começou** — `min(criado_em)`, **não** `min(saiu_em)`.
   Em 13/ago a `bancada` tinha 1 registro e `reparos` tinha 205 linhas de jul+ago: cobrar tudo daria
   204 faltas. **Falta de registro antes do primeiro registro não é falha, é história** — e a tela
   diz isso em cima.
   ⚠️ A diferença entre os dois campos custou um susto: ao importar os 38 abertos da planilha, a
   saída mais antiga era de **11/mai**. Com `saiu_em`, a conferência passaria a comparar julho
   inteiro contra um livro que só existe desde agora. `criado_em` diz a verdade — o registro passou
   a ser confiável quando foi **feito**, não quando o aparelho saiu.
2. **Compara por aparelho, somando.** A nota quebra um conserto em várias linhas (tela + vidro +
   bateria). Comparar linha a linha inventaria divergência que não existe.
3. **Só cobra nota de quem já voltou.** O que ainda está fora não foi faturado.

Linha com `status='revisar'` fica de fora: o próprio importador não confia nela.

### Preço de referência — aprendido, não transcrito

A mediana do que a loja **já pagou** por aquele serviço naquele fornecedor (de `reparos` +
`bancada.valor_cobrado`), com **mínimo de 3 amostras** — duas não são padrão. Aparece como `~R$X`
ao lado do campo, e o campo fica âmbar quando foge mais de 35%.

⚠️ **Por que não veio dos PDFs das tabelas.** A da Access sai limpa do PDF; a da RR é um PDF do
Canva com o texto posicionado **glifo a glifo**, e sai embaralhado — modelo e preço em listas
separadas. Transcrever à mão é onde entra o erro, e **preço de referência errado gera alarme falso
toda semana**, que é pior que não ter alarme nenhum. O histórico real da loja não tem esse
problema: começa vazio e vai ficando certo sozinho.

Se um dia valer travar o preço combinado (e não o praticado), o caminho é **pedir a tabela em
texto ou planilha** ao fornecedor — não OCR de PDF de Canva.

Protegido por `node test/conferencia-bancada.test.js`.

## Carga da planilha — 13/ago/2026

**38 aparelhos abertos** importados da planilha do Vitinho pra dentro da `bancada`.

| | |
|---|---:|
| Registros abertos | **38** |
| Casaram com um aparelho do estoque | **35** |
| Capital parado | **R$ 75.527** |
| O mais velho | **94 dias** (etiqueta `381`, 16 Plus Rosa, saiu 11/mai) |

Os 3 sem aparelho são **de cliente** (não existem no estoque, e é correto ficarem sem `apple_id`).

**O casamento não foi por etiqueta.** Foi por **IMEI4 primeiro**, com a etiqueta desempatando quando
o IMEI colidia. Prova de que a ordem importa: a linha `16 plus rosa · 7808 · etiqueta 737` — pela
etiqueta, `737` é um **16 Pro Max Preto já vendido**; pelo IMEI, é o 16 Plus Rosa certo. Cinco
linhas tinham IMEI ambíguo (2 candidatos) e foram resolvidas pela etiqueta com prefixo; duas foram
resolvidas por **modelo + cor** (`9890` → 14 Plus Azul, não o 14 Pro Max Preto vendido).

Na `bancada`, `etiqueta` guarda o **serial de verdade do estoque**; o número que estava escrito na
planilha vai pra `obs` como *rótulo*. Assim a coluna não mistura as duas numerações.

### Três coisas pra conferir com o Vitinho

1. **`E1655` / IMEI `2880`** — está na bancada e o aparelho consta como **vendido**. Ou voltou de
   garantia (e a origem devia ser `garantia`, não `estoque`), ou foi vendido enquanto estava fora.
2. **`E1682` / IMEI `9893`** — a planilha diz *"14 pm branco"*, mas IMEI **e** etiqueta apontam pro
   mesmo aparelho: um **15 Pro Max Titânio Branco**. Erro de digitação do modelo na planilha.
3. **`E1632` / IMEI `5185`** — aparece **aberto** na aba da Access **e fechado** (saída 12/08) na
   tabela de concluídos. Como havia data de saída explícita, **não** foi importado como aberto.

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

## Exportar pro grupo — o botão "📋 Copiar lista"

Existe porque **a baixa acontece no grupo, não no painel**. Quem está no balcão não abre a tela
de Assistência, mas lê o grupo do WhatsApp — então a lista precisa ir até lá. O botão fica no
cabeçalho da tela, ao lado de *+ Registrar saída*, e copia um texto pronto pra colar:

```
🔧 NA ASSISTÊNCIA — 15/ago
Não vender, estão fora da loja (33):

• iPhone 11 128GB Preto · final 6601
• iPhone 12 Pro 128GB Azul Pacífico · final 2422
...

+ 6 de cliente/garantia (não são do estoque).
```

Três decisões que não são óbvias:

1. **Sem preço nenhum, de propósito.** É aviso operacional ("não venda isto"), não lista
   comercial. É exatamente por isso que o papel `bancada` também exporta — o *Exportar WhatsApp*
   do Estoque, que manda preço, continua atrás de `podeVerValor()`.
2. **Só quem saiu do `estoque`.** Aparelho de cliente e de garantia também está fora da loja, mas
   não há o que dar baixa: nunca esteve disponível pra venda, e os de cliente nem IMEI têm
   (`imei4 = '0000'`). Em vez de sumirem calados, viram a linha de contagem do rodapé.
3. **Ordenado por modelo, não por data de saída.** A tela ordena por tempo, porque lá o que
   importa é o que está atrasado; o grupo procura pelo aparelho. São leituras diferentes da
   mesma lista.

Protegido por `node test/bancada.test.js` — inclusive a parte de não vazar `R$`.
