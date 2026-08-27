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
cliente_nome · cliente_tel        (26/ago/2026 — só quando origem <> estoque)
```

⚠️ **`quem` não é o dono do aparelho** — é o e-mail de quem *registrou* a ida (hoje, sempre o
Vitinho). Até 26/ago/2026 não havia onde guardar o dono: das 168 idas, **13 eram de cliente e 8 de
garantia**, e em nenhuma dava pra dizer de quem era o aparelho. Quem precisa dessa resposta é o
pós-venda (§6 de `docs/funcoes/coordenadora-pos-venda.md`). Agora o formulário pergunta — **só no
caminho "não está no estoque"**, que é o único onde o aparelho tem dono. A busca da tela acha por
nome e por telefone, porque é assim que a pergunta chega: *"cadê o aparelho da Fernanda?"*.

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
3. **Mesma ordem da tela** (`saiu_em` crescente, o mais velho no topo) e **separado por
   assistência**. Conferir a lista colada no grupo contra a tela não pode exigir procurar, e quem
   cobra, cobra uma assistência de cada vez.

Protegido por `node test/bancada.test.js` — inclusive a parte de não vazar `R$`.

## A planilha foi aposentada (15/ago/2026)

A partir daqui **o painel é a fonte**. A planilha do Vitinho foi importada inteira e não deve
mais receber lançamento — manter as duas era garantir que divergissem, e a Conferência passaria
a acusar "falta de registro" que na verdade era falta de sync.

**O que a planilha era:** 5 abas, 3 com dado vivo. `Lucas 2.0` e `Acess 2.0` = o que está fora
agora (linha sem `DATA SAIDA`). `Agosto Baixa` = o que saiu e voltou, com **duas tabelas lado a
lado** (LUCAS nas colunas A–G, ACESS nas I–O). `Lucas` e `Acess` são versões antigas de 4 colunas,
sem data — ignoradas.

⚠️ **A semântica inverte.** Na planilha as datas são do ponto de vista da *assistência*:
`DATA ENTRADA` = entrou lá = **nosso `saiu_em`**. `DATA SAIDA` = saiu de lá = **nosso `voltou_em`**.
Ler ao contrário deixa o controle inteiro de cabeça pra baixo.

**O que entrou:** 103 registros no total (era 40). 41 fora, 62 já com baixa — o histórico de
24/jul a 14/ago que o painel nunca soube que existiu.

| O que | Quantos |
|---|---:|
| Baixas aplicadas (o painel dizia "fora", a planilha já tinha a volta) | 4 |
| Idas novas ainda fora | 7 |
| Histórico de baixas importado | 59 |

**Duas armadilhas que custaram correção manual depois de aplicar:**

1. **A chave de uma ida é `(imei4, saiu_em)` — mas aparelho de cliente não tem IMEI.** Vira
   `'0000'`, e dois clientes que saíram no mesmo dia colidem. Aconteceu duas vezes: um
   "12 Pro Azul" recebeu a baixa que era do "15 preto", e dois clientes de 05/ago viraram uma
   linha só com serviço `"bat / conector"`. **Sem IMEI, o modelo entra na chave.**
2. **As abas se contradizem.** O `12 pro azul E1632` (IMEI ⋯5185) está aberto na `Acess 2.0` e
   baixado na `Agosto Baixa` (voltou 12/ago), mesma data de saída. Regra adotada: **a baixa
   manda** — a aba de baixa é preenchida no ato da volta, a "2.0" é que fica pra trás.

**Sobraram dois casos, de propósito:** o `E1632` acima (aplicado como fechado) e o
`14 Pro Max Roxo Profundo E1618`, que o Vitinho lançou direto no painel e nunca anotou na
planilha — esse é o comportamento novo, e é o certo.

**`apple_id` só quando o casamento é único.** Dos 96 com IMEI, 78 casaram com um aparelho só do
estoque, 16 ficaram ambíguos (4 dígitos colidem) e 2 não têm par. Ambíguo fica **null** — id
errado é pior que id nenhum, e o `imei4` ainda casa como reserva.

Importador em `scripts/bancada-planilha.js`. Ele **não grava**: imprime o SQL pra ser lido antes
de aplicar. Import de histórico é operação de uma vez, e esta precisou de olho duas vezes.

### ⚠️ O serviço veio abreviado — e isso desliga o preço de referência

A planilha escreve `up`, `bat`, `tela`; a nota (`reparos`) escreve `Subida de Bateria`,
`Troca de Tela`. `bncPrecoRef()` casa por **texto exato**, então nos 102 registros importados o
`~R$` de referência **não aparece**. Não quebra nada — a Conferência cruza por *aparelho*, não
por serviço — mas o palpite de preço só volta a funcionar quando o serviço for escolhido na
lista do painel (`BNC_SERVICOS`), que é o que acontece em todo lançamento novo.

### ⚠️ Aparelho de cliente NUNCA tem `apple_id`

Achado na revisão de 15/ago. O import casou um aparelho **de cliente** (IMEI ⋯3059) com o apple
`339662` do nosso estoque — os 4 dígitos batiam. O aparelho do cliente não é nosso, então o
vínculo é falso por definição, e o estrago é sério: aquele aparelho do estoque passaria a exibir
o selo *"Na assistência"* estando na loja. É exatamente o erro que esta tela existe pra impedir,
com o sinal invertido.

**Regra:** `origem = 'cliente'` ⇒ `apple_id` nulo, sempre. O casamento por 4 dígitos só vale para
`estoque` e `garantia`.

## Quatro ajustes pedidos pelo dono — 19/ago/2026

### 1. Três serviços novos na lista

`Câmera frontal`, `Troca de carcaça` e `Botão power / NFC` entraram em `BNC_SERVICOS`. Eles
acontecem na bancada, mas **não apareciam no histórico de `reparos`**: a nota da RR escreve com
outras palavras e a da Access é texto livre. Enquanto não houver 3 notas com esse nome, o `~R$`
de referência fica em branco — que é o certo, 2 amostras não são padrão.

### 2. Mais de um serviço por aparelho

O serviço agora é uma **lista de chips** (marca quantos quiser) + um campo livre pro que não está
na lista. Grava no mesmo campo `servico`, separado por `" + "`.

⚠️ **O formato não foi escolhido à toa: é o que a nota já usa.** `Subida de Bateria + Troca de
Bateria` é uma linha só na nota da RR, e combos são 20 das 175 linhas. Guardar igual é o que faz
o preço de referência continuar existindo pro combo — em vez de virar 20 serviços únicos sem
amostra suficiente.

`bncNormServico()` compara o combo **como conjunto**: `A + B` e `B + A` são o mesmo serviço. Sem
isso a mediana perderia metade das amostras (a nota escreve nas duas ordens).

**Também dá pra editar depois:** a célula de serviço, nas duas abas, virou botão. O motivo é o
caso real: o aparelho sai como *Análise* e a assistência acha mais duas coisas. Sem esse caminho,
registrar o segundo serviço exigiria uma segunda linha — e o mesmo aparelho apareceria duas vezes
fora da loja, que é exatamente o que a tela existe pra evitar. O que não está na lista de chips
(o `up`/`bat`/`NFC` que veio da planilha) volta pro campo livre em vez de sumir.

### 3. Filtro pra achar o aparelho

Busca no topo das abas *Na assistência* e *Voltaram*: IMEI, etiqueta, modelo, serviço, fornecedor.

Duas decisões:

- **O filtro corta a lista, nunca os KPIs.** "Quantos estão fora" e "capital parado" são da
  operação inteira. Filtrar não pode fazer o problema parecer menor.
- **Etiqueta com prefixo é respeitada.** Só cai no casamento por número quando a busca *é* um
  número: digitou `E1030`, não traz o `SP1030` junto (138 aparelhos colidem sem o prefixo). Digitou
  `1030`, traz os dois — aí a pessoa desempata olhando modelo e cor, que é o gesto certo.
- Nas *Voltaram*, o filtro roda **antes** do corte em 100 linhas: procurar um aparelho de junho não
  pode depender de ele estar entre as 100 últimas voltas.

### 4. A lista do que VOLTOU hoje

Botão `✅ Voltaram hoje (N)` no cabeçalho, irmão do `📋 Copiar lista`. Mesma lógica: a baixa
acontece no grupo, não no painel.

```
✅ VOLTOU DA ASSISTÊNCIA — 19/ago

Já pode vender (3):
• 14 Pro 128GB Preto · 2880 — Troca de tela + Face ID
...

Entregar ao dono (1):
• 13 Azul · 2222 — Troca de bateria
```

- **Só aparece quando há o que avisar.** Botão que copia "nada voltou hoje" é ruído no cabeçalho.
- **`estoque` e `cliente/garantia` em blocos separados.** O de garantia voltou pra ser *entregue*,
  não vendido — misturar poria na prateleira aparelho que já tem dono.
- **Sem preço**, igual à outra lista: por isso o papel `bancada` também exporta.

Tudo protegido por `node test/bancada.test.js`.

### Limpeza de duas linhas erradas

Removidas da `bancada` (a pedido do dono, 19/ago): `E1655` ⋯2880 (14 Pro 128, saiu 11/ago, `NFC`)
e `E1618` ⋯6999 (14 Pro Max 256 Roxo, saiu 13/ago, `Face ID`) — não estavam no sistema da
assistência. Sobraram **35 aparelhos fora** de 121 idas no total.

⚠️ **Apagar linha da `bancada` ainda é operação de banco** (policy: só sócio). Não há botão de
excluir na tela, e é de propósito: "Voltou" é o gesto de todo dia e um toque a desfaz; excluir
apaga a história da ida. Se virar rotina, vira botão — atrás de `podeVerMargem()`.

## As duas garantias — 26/ago/2026

O dono leu a coluna Origem e viu que **`Garantia (já vendido)` estava dizendo duas coisas
opostas**:

- **A nossa garantia** — aparelho que vendemos, o cliente teve problema, voltou pra assistência.
- **A garantia da assistência** — serviço que a RR/Access fez, deu problema, e eles refazem
  **sem cobrar**.

São garantias em sentidos contrários e moravam na mesma palavra.

### A prova estava no banco

Das 9 linhas com origem `garantia`, **3 eram de aparelho `available`** — nunca vendido, logo
impossível ser "já vendido". Uma delas foi registrada **no mesmo dia dessa conversa** com
`Garantia assistencia` escrito **na observação, à mão**: o campo não existia e alguém improvisou.

A opção `cliente (serviço pago)` também não descrevia o negócio. **A loja não faz serviço avulso** —
usa a assistência só pros aparelhos dela, seja pra prateleira, seja pra devolver ao cliente. As 12
linhas `cliente` e as 9 `garantia` estavam dizendo a mesma coisa com dois nomes: *tem dono*.

### A decisão: trocar a pergunta, não somar uma

**Saiu** o dropdown de origem. Ele pedia de novo o que o **caminho já tinha respondido**:

| Caminho | O que significa | `origem` gravada |
|---|---|---|
| achou na busca do estoque | é da prateleira (tem `apple_id`, está `available`) | `estoque` |
| usou *"não está no estoque"* | tem dono (já vendido ou do cliente) | `cliente` |

**Entrou** `bancada.retorno_de` — a linha da ida anterior, quando esta é um **retorno**. Mesmo
número de toques no formulário: saiu o campo que ninguém sabia responder, entrou o único que **só
quem está com o aparelho na mão** sabe.

A tela **sugere** (achou uma ida fechada do mesmo aparelho dentro de `BNC_RETORNO_DIAS`, hoje 90) e
a pessoa **confirma**. Lote não pergunta: 26 aparelhos saindo juntos são serviço novo em lote.

⚠️ **A janela de 90 dias é um chute defensável, não um combinado.** Falta confirmar com RR e Access
qual é o prazo real e se a garantia cobre **peça** ou só mão de obra — isso decide se o valor
esperado de um retorno é R$ 0 ou parcial.

### `bncDaPrateleira()` — derivado, com duas guardas

```
linha fechada há mais de um dia  → vale o que foi GRAVADO   (é história)
estoqueItens vazio               → vale o que foi GRAVADO   (guarda)
sem apple_id                     → vale o que foi GRAVADO   (não dá pra derivar)
resto                            → está em estoqueItens? então é da prateleira
```

1. **Só a lista viva deriva.** `estoque.status` é o estado de **hoje**: 35 das 111 linhas fechadas
   são de aparelho consertado e **vendido depois**. Derivar ali diria "do cliente" pra reparo que
   entrou no custo de aquisição. Se um dia quisermos separar *reparo antes da venda* de *garantia
   pós-venda*, o caminho é `saiu_em` contra a data da venda — **nunca** o status.
2. **Sem estoque carregado, não deriva.** `estoqueItens` vazio faria toda linha virar "tem dono" e
   a lista de *"não vender"* sair **vazia** — o balcão venderia aparelho que está fora. É o modo de
   falha do CLAUDE.md: `200` com lista vazia e ninguém desconfia.
3. **Sem `apple_id` não é "tem dono", é "não dá pra derivar".** São 15 linhas importadas da
   planilha com origem `estoque` e sem id; tratá-las como dono tiraria todas da lista de não vender.

De brinde, a derivação **conserta 4 linhas abertas** que estavam marcadas errado, e o aparelho
**vendido enquanto estava fora** cai sozinho no bloco "Entregar ao dono" — era um item aberto de
*conferir com o Vitinho* (`E1655` ⋯2880).

### O que o retorno destrava (e o que ele quebraria se não fosse tratado)

- **KPI Retorno** — quantas idas são refação e a % delas. Conta **de 18/ago pra frente**, o dia em
  que o Vitinho passou a registrar na tela; antes disso a pergunta não existia e o denominador não
  sabia dela. Mesma disciplina da Conferência.
- **Preço de referência** (`bncPrecoRef`) **ignora retorno**. Um R$ 0 na lista puxaria a mediana
  pra baixo e faria a tela acusar "preço fora" em serviço normal. Ausência de preço não é amostra.
- **Conferência não cobra nota de retorno.** Não há **uma única linha de R$ 0,00** nas 205 de
  `reparos`: serviço refeito de graça simplesmente não é faturado. Sem essa exceção, todo retorno
  viraria *"voltou e não apareceu na cobrança"* — o mesmo alarme falso que a conferência já evitou
  ao só cobrar de `criado_em` pra frente.
- **A célula de R$ mostra "grátis"**, não um input vazio. Vazio pediria pra alguém preencher e
  sumiria no meio dos valores que faltam de verdade.

### As 3 refações do histórico, marcadas à mão

Eram 3 e são o histórico inteiro. Da mudança pra frente a tela registra sozinha.

| linha | aparelho | ida anterior | o retorno |
|---|---|---|---|
| 120 | apple 546389 | RR · *toque fantasma, desligou* (13→18/ago) | ACCESS · *Análise* — segunda opinião |
| 145 | ⋯4737 | RR · *vidro da tela + auricular* (21→24/ago) | ACCESS · *Auricular* — **pagamos duas vezes** |
| 152 | ⋯9722 | RR · *troca de bateria* (24/ago) | RR · *troca de bateria* — garantia da RR |

O caso 145 é o que justifica marcar retorno mesmo quando muda de assistência: **é o retrabalho que
custou dinheiro** em vez de ser coberto pela garantia de quem errou.

### Pendências que essa mudança NÃO resolve

- **111 das 111 linhas que voltaram seguem sem `valor_cobrado`.** A coluna R$ manual nunca foi
  usada, e o alerta "sem valor da nota" já nasce saturado. A conta de dinheiro real continua vindo
  de `reparos` (a nota). Vale decidir se essa coluna manual continua existindo.
- **Prazo e cobertura da garantia** com RR e Access (ver acima).

## Auditoria do processo — 26/ago/2026

Feita a pedido do dono, logo depois da mudança das duas garantias. **Duas falhas de código**
(corrigidas no mesmo dia) e **três pendências operacionais** (dependem de gente).

### ❌ Falha 1 — a Conferência só tinha uma borda

`bncDesde()` protege o passado: linha de nota anterior ao livro é história. Faltava a borda de
cima. A nota vem de um arquivo carregado **à mão** (`node scripts/reparos.js`) e **atrasa**.

No dia da auditoria:

| | |
|---|---:|
| O livro da assistência começa em | **13/ago** |
| A última nota carregada era de | **08/ago** |
| Aparelhos acusados de *"voltou e não apareceu na cobrança"* | **40** |
| Quantos eram falsos | **40** |

A janela era **vazia por construção** — não havia um único dia em comum entre as duas fontes — e a
tela mesmo assim cuspia 40 acusações. É exatamente o erro que a borda de baixo tinha evitado
("204 faltas no primeiro dia e ninguém abriria a tela de novo"), entrando pelo outro lado.

**Corrigido:** `bncConciliar()` calcula `ate = bncUltimaNota()` e só cobra nota de quem **voltou
até essa data**. Quando `ate < desde`, a tela mostra **"Falta carregar a nota"** com as duas datas.

⚠️ **O ✅ verde seria pior que os 40 alarmes.** Sem o `janelaVazia`, a correção faria a tela dizer
*"A nota bate com o registro"* justamente quando **nada foi comparado** — uma mentira que não pede
nada de ninguém. Por isso o estado vazio é explícito e nomeado.

### ❌ Falha 2 — o caminho manual estava engolindo aparelho do estoque

Três aparelhos **do estoque** estavam registrados por *"não está no estoque"*, sem `apple_id`:

| linha | aparelho | como se sabe | estava na lista de "não vender"? |
|---|---|---|---|
| 153 | `E1743` · 14 Pro 256 Roxo · R$ 2.200 | etiqueta na obs | sim (origem `estoque`) |
| 156 | `E1739` · 13 Pro Max 256 Azul · R$ 2.110 | modelo + cor | sim |
| **154** | **`SP829` · 15 128 Azul · R$ 2.400** | etiqueta na obs | **NÃO** — origem `garantia` |

O `SP829` estava fisicamente na RR, marcado `available` no Estoque, e **fora do aviso de não
vender**. É o buraco que esta tela existe pra tapar, acontecendo dentro da tela.

**Corrigido:** ao digitar os 4 do IMEI no caminho manual, a tela procura no estoque e **oferece**
o aparelho, com modelo, cor, etiqueta e custo. Aceitar troca pro caminho normal e grava o
`apple_id` — com ele vêm o selo no Estoque, o capital parado e a lista de não vender.

⚠️ **Sugere, NÃO casa sozinho.** O casamento automático por 4 dígitos já colou um aparelho de
cliente no apple `339662` (15/ago) — com o sinal invertido, que é o pior caso. Hoje mesmo há
**dois aparelhos terminando em 8849** no estoque: um 13 Pro Max Azul disponível e um 17 Pro Max
Prateado vendido. Só o olho desempata. As 3 linhas acima foram ligadas à mão.

### ⏳ Pendência 1 — a nota está 18 dias atrasada

`reparos` vai de 06/jul a **08/ago**. Hoje é 26/ago. Enquanto não rodar `node scripts/reparos.js`
com as notas novas, a Conferência não tem o que conferir — agora ela **diz isso** em vez de acusar
o inocente, mas o dado continua faltando.

### ⏳ Pendência 2 — R$ 43.283 em 18 linhas que ninguém dá baixa

Dos **R$ 73.604** parados em 37 aparelhos, **R$ 43.283 estão em 18 linhas importadas da planilha**
— saídas entre 03/jun e 11/ago, e **nenhuma recebeu baixa** desde a importação (14–15/ago). As
linhas que o Vitinho digita na tela (18/ago em diante) recebem baixa normalmente.

Ou esses 18 estão mesmo fora há 15–84 dias, ou voltaram e ninguém fechou a linha. **Duas já têm
nota da assistência depois da saída** — ou seja, voltaram:

- linha 9 · `372` · 15 128 Preto · saiu 14/jul (**43 dias**) · nota de *Troca de Conector* em 14/jul
- linha 19 · 15 Pro Max 256 Titânio Azul · saiu 03/ago (**23 dias**) · nota de *Subida de Bateria* em 08/ago

A mais velha de todas: linha 5, `E1382` · 12 64 Branco · Face ID · **84 dias**.

**Isso é conferência com o Vitinho, não código.** Vale passar a lista das 18 e fechar o que voltou.

### ⏳ Pendência 3 — coisas conhecidas, sem ação urgente

- **20 linhas de `reparos` sem `apple_id`** (R$ 3.290) — todas com `status='revisar'`, ou seja, o
  próprio importador sinalizou. Backlog conhecido, não falha silenciosa.
- **`estoque_estado` tem 8 linhas** (7 `saldao`, 1 `outro`). A tabela funciona; é adoção baixa.
- **111 das 111 linhas que voltaram seguem sem `valor_cobrado`.** Já registrado acima.

### ✅ O que foi conferido e está certo

- **Nenhum aparelho com duas linhas abertas** ao mesmo tempo.
- **Nenhum aparelho vendido** está com linha aberta na assistência (e agora, se acontecer, ele cai
  sozinho no bloco *Entregar ao dono*).
- **Nenhuma linha aberta com `imei4 = '0000'`** — as 5 que existem já foram fechadas.
- Os 3 retornos históricos batem com a ida anterior por aparelho, fornecedor e serviço.

## O histórico de serviço na peça — 26/ago/2026

Pedido do dono: *"no custo do estoque conseguir ver esse adicional com o serviço que teve, se
teve"*. Até aqui o Estoque mostrava o reparo como **uma linha só** — `reparo −R$ 300`, dentro da
margem real. O total, sem dizer o que foi feito, quando nem onde. Pra saber se valia consertar de
novo um aparelho que já tinha voltado duas vezes era preciso **sair do Estoque**, abrir a
Assistência e buscar pelo IMEI.

Agora, abrindo o aparelho na tela de Estoque:

```
Investido        R$ 1.490
                 R$ 1.010 de compra + R$ 480 de reparo

Assistência · R$ 480 em nota · 4 idas registradas
  10/jul→15/jul  RR       Troca de tela           R$ 300
  08/ago         RR       Conector de Carga       R$ 180
  20/ago→21/ago  RR       Subida de bateria       nota não carregada
  22/ago→23/ago  RR       Subida de bateria       ↩ grátis
  25/ago         Access   Face ID                 ainda fora
```

### As duas fontes são costuradas por contenção, nunca por chute

`reparos` é o **dinheiro** (vem da nota, depois do fato); `bancada` é o **paradeiro** (vem da
pessoa, durante). ⚠️ **Somar os totais conta o mesmo conserto duas vezes.**

A nota cai **dentro** de uma ida quando é do **mesmo fornecedor** e a data está **entre `saiu_em` e
`voltou_em`** — uma relação de contenção real, não uma aproximação. O que não encaixa vira linha
própria. Na prática isso é comum: o livro da bancada só começou em 13/ago e as notas vão de 06/jul
a 08/ago, então a maior parte do dinheiro **não tem ida registrada** — e aparece como linha da nota.

O rodapé do bloco diz isso na tela: *"A nota diz o dinheiro; a ida diz o paradeiro. São fontes
diferentes — o total é o da nota, e as idas não se somam a ele."*

### "Sem valor" tem três motivos, e confundi-los é o erro

| na tela | o que é |
|---|---|
| `↩ grátis` | retorno na garantia da assistência — não é cobrado, e está certo |
| `nota não carregada` | a ida é posterior à última nota carregada (`bncUltimaNota()`) |
| `ainda fora` | não voltou; não há o que faturar |
| `sem cobrança` | voltou dentro da janela da nota e não apareceu nela — **esse** é o que merece olhar |

Sem essa separação, os três primeiros virariam "está faltando cobrança" e o dono iria atrás de um
problema que não existe. É a mesma disciplina da Conferência.

### Duas decisões de consistência

1. **O total em nota usa só `apple_id`**, igual à view `v_estoque_margem`. Casar por 4 dígitos aqui
   faria a soma divergir do `reparo −R$X` que a margem real mostra **na mesma tela** — dois números
   diferentes pro mesmo aparelho, e nenhum jeito de saber qual está certo.
2. **`valor_estoque` continua intocado.** O sync reescreve as linhas de hora em hora; o total
   investido (compra + reparo) só existe **somado na tela**, nunca gravado.

### Onde o código mora

O bloco é montado em **`js/bancada.js`** (`bncHistoricoDoApple` / `bncHistoricoHtml`) e a tela de
Estoque só pede — mesmo caminho de `bancadaDoApple()`. É bancada.js que é dona das duas fontes.

⚠️ A carga de `reparos` no Estoque usa **`recarregarUmaVez()`**, obrigatoriamente:
`carregarReparosBancada()` devolve **promise já resolvida** quando já está carregando, que é
exatamente o laço de microtask que congelou o celular do dono em 18/ago.

**Quem vê:** o bloco está atrás de `podeVerCustoServico()` (sócio e bancada). O Vitinho vê as idas
que ele mesmo registrou; o dinheiro da nota é de sócio (`reparos` tem policy `reparos_socio`), e o
campo *Investido* fica atrás de `podeVerMargem()`.

## Carga das notas de agosto — 26/ago/2026

O dono mandou os três fechamentos da RR (03/08, 10/08, 17/08) e as duas notas da Access (10/08 e
17/08). **`reparos` saiu de 205 para 341 linhas**, e a última nota passou de **08/ago para 22/ago**.

| | |
|---|---:|
| Linhas importadas | **136** · R$ 24.970,00 |
| Casadas com aparelho | 112 (82,4%) · R$ 20.825,88 |
| Em `revisar` | 24 · R$ 4.144,12 |
| Reparo embutido no estoque disponível | R$ 10.022 → **R$ 21.234** (44 → **97** aparelhos) |

### ⚠️ Havia DUAS notas da RR para a mesma semana

`RR/fechamento_Cart_03-08-2026.pdf` (74 linhas, R$ 7.630) já estava importada. O dono mandou uma
**segunda nota do mesmo período 03–08/ago** (36 linhas, R$ 9.505). As duas fecham com o próprio
total impresso, e **não têm um único IMEI em comum** — são notas diferentes, não uma revisão. A
segunda nunca tinha sido importada: **R$ 9.505 que não estavam no painel**.

Salva como `fechamento_Cart_03-08-2026-b.pdf`. O `nota_ref` é o nome do arquivo, então o `-b`
é o que impede o upsert de sobrescrever a primeira. **Nome de arquivo aqui é chave, não rótulo.**

### O caminho offline (sem `service_role`)

A chave não estava no ambiente. O import foi feito pelos flags que o próprio script tem:

```
node scripts/reparos.js importar --estoque <snapshot.json> --vendas <vazio> --sql <saida.sql>
```

- **`--estoque`**: snapshot local dos 134 aparelhos cujos 4 últimos do IMEI batem com alguma chave
  das notas. É suficiente: `casar()` indexa por IMEI completo, etiqueta e 4 dígitos — e o conjunto
  dos 4 dígitos das notas cobre os três caminhos.
- **`--sql`**: gera o INSERT em vez de gravar, e o SQL foi aplicado pelo MCP.
- **`tipo` ficou de fora**: sem o mapa de vendas, o script marca tudo como `recondicionamento`.
  Foi zerado e recalculado **no banco**, com a mesma regra (venda depois do serviço =
  recondicionamento; antes = garantia). Resultado: 77 recondicionamento (R$ 14.572), 35 garantia
  (R$ 6.254), 24 indefinido (as em revisão).

⚠️ **Se for repetir isso, prefira exportar `SUPABASE_SERVICE_ROLE_KEY` e rodar `importar` direto.**
O caminho offline funciona, mas move o cálculo do `tipo` pra fora do script — e regra de negócio em
dois lugares é como a comissão errada nasce.

### A Conferência voltou a ter sinal

Antes: janela vazia (livro 13/ago, nota 08/ago) e 40 acusações falsas. Agora a janela é
**13/ago a 22/ago** e o que aparece é real:

| | aparelhos | valor |
|---|---:|---:|
| **Na nota, sem registro — conserto individual** | **22** | **R$ 6.289** |
| Na nota, sem registro — só subida de bateria (R$25) | 34 | R$ 850 |
| Registrado, voltou e não apareceu na cobrança | 11 | — |

Os **34 de subida de bateria são o preparo de lote** — o doc já dizia que esse controle é *por
lote*, não por aparelho, então eles vão aparecer sempre. **Os 22 consertos individuais, R$ 6.289,
são o achado**: saíram da loja e ninguém registrou.

### As 24 linhas em `revisar`

- **9 são lixo de parse do PDF** (cabeçalho vazado, IMEI mascarado com zeros). A trava 1 passa
  porque o total fecha; as linhas sem código simplesmente não casam. Comportamento correto — o
  script **nunca chuta**.
- **11 têm IMEI que não existe no `estoque`** (aparelho de cliente, de outra loja, ou IMEI com 14/16
  dígitos por erro de digitação da RR — ex.: `3561133311854649`, um dígito a mais que `356133311854649`).
- **4 são da Access**: dois lotes de bancada sem aparelho, um sem código, e dois códigos (`2880`,
  `5931`) em que **modelo e cor não bateram** com o candidato — a nota diz "14 preto" e o aparelho
  é um "14 Pro Preto Espacial". Recusar é o certo.

Resolver: `node scripts/reparos.js revisar` lista, e o UPDATE manual está no rodapé da saída.

### O lançamento em `custos` — 26/ago/2026

Carregar `reparos` **não** lança nada no P&L: são camadas diferentes de propósito (`custos` é o
resultado, `reparos` é a mesma despesa aberta por aparelho — **somar as duas conta o dinheiro duas
vezes**). Agosto estava com **zero lançamentos de assistência** enquanto a nota já somava R$ 40 mil.

Lançadas as **8 notas** que faltavam, seguindo exatamente a convenção de jul/2026: uma linha por
nota, pelo **líquido** (o que foi pago), `area='assistencia'`, `loja='ambas'`, e o período na `obs`.

| data | descrição | valor | nota |
|---|---|---:|---|
| 03/08 | Access | 1.700,00 | `access_2026-07-27` (R$1.880 − R$180 Thiago) |
| 08/08 | Access | 3.300,00 | `access_2026-08-03` (R$3.565 − R$265) |
| 08/08 | Assistencia RR | 7.630,00 | `fechamento_Cart_03-08-2026` · 74 aparelhos |
| 08/08 | Assistencia RR | 9.505,00 | `fechamento_Cart_03-08-2026-b` · 36 aparelhos |
| 15/08 | Access | 4.700,00 | `access_2026-08-10` (R$4.985 − R$285) |
| 15/08 | Assistencia RR | 4.525,00 | `fechamento_Cart_10-08-2026` · 56 aparelhos |
| 20/08 | Access | 550,00 | `access_2026-08-17` · 1 serviço |
| 22/08 | Assistencia RR | 5.690,00 | `fechamento_Cart_17-08-2026` · 31 aparelhos |
| | **total** | **37.600,00** | |

**Agosto: R$ 33.950 → R$ 71.550** em custos. (Ainda faltam os outros ~R$ 117 mil/mês de custo que
não são assistência — jun e jul tiveram 65 e 77 lançamentos; agosto tem 19.)

#### Trava 2: o mês fecha, com dois ajustes explicáveis

```
reparos de agosto (por data_servico)      R$ 40.098
 − fechamento_Cart_27-07 (serviço em 01/08,
   mas lançado em custos em 29/07)        − R$  3.945
 + access_2026-07-27 (serviço em julho,
   mas nota fecha em 03/08 e vai inteira)  + R$  1.447
                                          ─────────────
                                          R$ 37.600  = custos de agosto ✅
```

⚠️ **A diferença de R$ 2.498 é só a virada do mês**, não dinheiro perdido. A RR não data serviço por
linha, então a nota que atravessa o mês cai inteira no mês do fechamento — é o mesmo aviso que o
`conciliar` do script imprime. **A conferência é por NOTA, nunca por total do mês.**

#### Uma decisão herdada que vale rever

Todas as notas se chamam `fechamento_**Cart**_...` — são da Cart. Mas o histórico inteiro de
`custos` lança assistência como **`loja='ambas'`**, o que rateia o custo entre as duas lojas.
Segui a convenção pra não mudar o resultado de ninguém por conta própria, **mas isso desloca
margem da Urban pra Cart** (ver `docs/`, societário 55/30/15 vs 50/40/10). Se a assistência é só
da Cart, o certo é `loja='cart'` — e aí os meses anteriores também estão errados.
