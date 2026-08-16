# Qualificar as conversas — estratégia (16/ago/2026)

Como transformar "a IA atende bem?" numa pergunta com resposta em número, e como usar essa resposta
pra vender mais. Vale pra IA (Maju/Duda) e pros vendedores.

Base de fato: `docs/CHATWOOT-ANALISE.md` (2.000 conversas, 05–10/ago/2026). Ferramenta:
`scripts/chatwoot.js`. Agente: `.claude/agents/analista-conversas.md`.

---

## 1. O processo inteiro da venda — e onde ele é cego

| # | Etapa | Onde vive | Mede? | Número conhecido |
|---|---|---|---|---|
| 1 | Cliente chama (WhatsApp/Instagram) | Chatwoot | ✅ | 1.200 Cart · 800 Urban em 6 dias |
| 2 | IA responde e qualifica | Chatwoot | ✅ | — |
| 3 | IA cota preço | Chatwoot | ✅ | **53,7% Cart · 60,9% Urban** |
| 4 | IA emite cartão e passa pra vendedora | Chatwoot | ✅ | **26,6% Cart · 22,8% Urban** |
| 5 | Vendedora conversa e negocia | **WhatsApp pessoal dela** | ⬛ **CEGO** | zero dado |
| 6 | Cliente vai à loja | — | ⬛ **CEGO** | só "visita agendada" (4,5% / 2,5%) |
| 7 | Venda fechada | FoneNinja → Supabase | ✅ | painel inteiro |
| 8 | Quem vendeu / quem atendeu | **texto da obs** da venda | ⚠️ parseado | `loja_id` 100% vazio |

**A venda inteira fecha dentro do trecho cego.** As etapas 5 e 6 são onde o dinheiro muda de mão, e
não existe um byte sobre elas em lugar nenhum. Tudo que o Chatwoot mostra é o pré-jogo.

## 2. As duas coisas que impedem qualificar hoje

### 2.1 Nenhuma conversa sabe se virou venda

Hoje o funil mede **processo** (cotou preço? emitiu cartão?), não **resultado**. Sem saber qual
conversa virou venda, qualquer "nota de conversa" é opinião com cara de número — e opinião com cara
de número é o jeito mais caro de errar (foi o que aconteceu ao ler cartão como preço em 10/ago, que
inflou "nunca viu preço" de 46% pra 73%).

**Isto é resolvível e é o primeiro passo.** A conversa tem o telefone do cliente; a venda tem o
cliente. Casar os dois dá desfecho — ganhou/perdeu/aberto, com valor e margem.

### 2.2 Metade da conversa não existe

Em 2.000 conversas, David, Isa, Mel, Maria, Pietra e Denilson escreveram **zero** mensagens — apesar
de 617 conversas atribuídas a eles. O handoff vai pro WhatsApp pessoal e o Chatwoot fica cego.

**Não dá pra qualificar vendedor com o dado de hoje.** Não é limitação de código nem de análise: o
dado não existe. Isso é mudança de processo (§6), não de script.

## 3. A estratégia — quatro camadas, nesta ordem

```
Camada 0  Fechar o loop        conversa ──telefone──> venda        → cada conversa ganha desfecho
Camada 1  Régua determinística  16 sinais binários por conversa     → roda em tudo, custo zero
Camada 2  Juiz IA na amostra    lê ~150 conversas e explica o porquê → só onde o número não explica
Camada 3  Loop de melhoria      1 mudança por semana no prompt      → mede a mesma coisa depois
```

A ordem não é negociável. Camada 1 sem camada 0 mede aderência a um roteiro que ninguém provou que
vende. Camada 2 sem camada 1 gasta IA pra contar o que `grep` conta de graça.

### Camada 0 — fechar o loop (lead → venda)

Casar `conversa.telefone` com o cliente da venda. Saída: por conversa, `ganhou | perdeu | aberto`,
com valor e margem quando ganhou.

⚠️ **A armadilha é o nono dígito.** Celular brasileiro anda escrito de quatro jeitos
(`+5511987654321`, `5511987654321`, `11987654321`, `1187654321`) e a FoneNinja e o Chatwoot não
combinaram nada. Casar sem normalizar dá taxa de acerto baixa **em silêncio** — parece que os leads
não convertem, quando na verdade a chave não bateu. `telChave()` em `scripts/chatwoot.js` normaliza
pros 8 últimos dígitos, que é o que sobrevive a todas as variações.

Medir o **acerto do casamento** antes de acreditar em qualquer conversão: se as vendas do período
não casam com ao menos ~70% das conversas ganhas conhecidas, o problema é a chave, não o funil.

### Camada 1 — a régua determinística

16 sinais binários por conversa, casados por texto (`node scripts/chatwoot.js qualificar <loja>`) —
**14 já rodando; 2 dependem de cruzar com o estoque** e ficam pra próxima rodada. Custo zero, roda
nas 49 mil conversas, e o dono confere na mão. Detalhe da régua em §4.

⚠️ **Não invente peso.** A régua da fase 1 mede **frequência** ("a IA pergunta sobre troca em X% das
conversas"), não nota. O peso de cada sinal se **aprende** na fase 2, com a camada 0 pronta:
comparar a taxa de venda das conversas que têm o sinal contra as que não têm. Somar sinais com pesos
chutados produz um ranking bonito e falso.

### Camada 2 — o juiz IA (amostra, não tudo)

IA lendo conversa custa dinheiro e não é determinística — então ela entra só onde o determinístico
já não responde. Três amostras que valem a leitura:

1. **Fez tudo certo e perdeu** — a régua deu verde e não virou venda. É aqui que mora o que a régua
   não sabe medir.
2. **Fez errado e ganhou** — o roteiro talvez esteja pedindo coisa que não importa.
3. **Nunca chegou a preço** (46% Cart / 39% Urban, sem explicação medida até hoje).

Saída **estruturada e taxonomizada**, não texto livre: motivo de perda de uma lista fechada (preço ·
não tinha o modelo · sumiu · só pesquisando · queria parcelar mais · fora da cidade · outro), com o
número da conversa como prova. Taxonomia fechada é o que permite contar; texto livre vira leitura
bonita que ninguém agrega.

### Camada 3 — o loop de melhoria (é aqui que a IA fica melhor)

Toda semana: rodar a régua → pegar **o pior sinal** → virar regra explícita no prompt da IA →
medir o **mesmo** sinal na semana seguinte.

**Uma mudança por vez.** Duas mudanças na mesma semana e não se sabe qual funcionou — e como o
resultado depende de mix de modelo e de estoque, o ruído já é grande sem ajuda.

⚠️ **Datar toda mudança de prompt num changelog.** Nada no dado marca quando o prompt mudou. É
exatamente a armadilha do `vendas.vendedor_id` em ago/2026: o campo trocou de significado, nada no
banco marcou, e quem lê a coluna sem saber mistura duas coisas. Sem changelog datado, comparar
semana com semana compara IAs diferentes achando que é a mesma.

## 4. A régua — o que é conversa bem feita **nesta** operação

Cada item é binário, verificável no texto, e tem dinheiro atrás. Não é coaching de vendas genérico.

### Qualificação — os fatos que decidem a venda

| Sinal | Por que vale dinheiro aqui |
|---|---|
| **Perguntou sobre troca** ⭐ | Aparelho de troca dá **~1,5× a margem** de um comprado de fornecedor — entra pela metade do custo e sai pelo mesmo preço (`docs/ANALISE-JUN-JUL-2026.md`). IA que não pergunta deixa o melhor canal de compra da casa na mesa, **em toda conversa**. |
| **Perguntou forma de pagamento** | Muda o preço (à vista ≠ 12×) e muda a margem: crédito de 6× pra cima saiu do PagBank pro PicPay em ago/2026 justamente porque a taxa comia ~R$ 6,2 mil/mês. |
| **Perguntou cidade / se vem à loja** | A venda fecha presencial. Cliente de fora é outro fluxo — e hoje consome atendimento como se fosse igual. |
| **Perguntou prazo/urgência** | Separa lead quente de curioso. Sem isso, a fila de handoff trata os dois igual. |
| **Identificou modelo + capacidade** | Sem isso não há cotação possível. |

### Oferta

| Sinal | Por que vale dinheiro aqui |
|---|---|
| **Cotou preço** | Já medido: 53,7% / 60,9%. |
| **Cotou algo que existe no estoque** ⭐ ⏳ | Precisa cruzar o modelo citado com `estoque` disponível + `bancada` (aparelho na assistência **não é** venda, e em 12/ago eram 43 aparelhos / R$ 87 mil marcados como disponíveis). Promessa de aparelho que não tem queima o lead duas vezes. |
| **Ofereceu alternativa quando não tinha** ⏳ | É a chance de empurrar o que está **parado** — e parado custa carrego (capital a 3% a.m., `CONTEXT.md`). |
| **Ofereceu acessório** | Attach rate começa na conversa, não no balcão. |

### Fechamento

| Sinal | Por que vale dinheiro aqui |
|---|---|
| **Passou pra humano depois de cotar preço** ⭐⭐ | Falha em **71% (Cart) / 75% (Urban)** das conversas que viram preço. Lead que já passou pela parte difícil e evaporou. |
| **Propôs visita** | Proposta→visita: 24,4% Cart vs 14,8% Urban, mesma IA. |
| **Não morreu no cliente** ⭐ | Última mensagem é do cliente e ninguém respondeu. Dinheiro na mesa, e a lista sai hoje. |
| **Reengajou quem sumiu** | Cliente que viu preço e parou de responder. Follow-up de 24h/72h é mudança de **fluxo**, não de prompt. |

### Higiene

| Sinal | Por que |
|---|---|
| **Mensagem falhou ao enviar** | 148 mensagens, ~3% das conversas — cliente que nunca recebeu resposta. |
| **Ficou sem resposta nenhuma** | Conversa em que a loja não escreveu nada. |

⏳ = especificado, ainda não implementado (depende do cruzamento com o estoque).

### Achado de quebra: a contagem de demanda é piso, não total

O padrão que o `funil` usa pra contar modelo citado **exige a palavra "iphone"** — e no WhatsApp o
cliente escreve *"tem 13 pro?"*. Ou seja, a tabela de demanda de `docs/CHATWOOT-ANALISE.md`
(iPhone 13 com 130 menções na Cart, etc.) conta **menos** do que a procura real, e não dá pra saber
quanto menos sem recontar.

A régua usa um padrão próprio, mais largo (aceita `13 pro`, `11 128gb`, `ip 15`, mas não `dia 13`
nem `R$ 13`). O do `funil` ficou **intocado de propósito** — é dele que saíram os números já
publicados, e mexer sem recontar tudo criaria duas séries incomparáveis chamadas pelo mesmo nome.
Recontar a demanda com o padrão largo é tarefa própria, na próxima rodada com token.

## 5. Os três vazamentos que já dá pra tampar — sem medir mais nada

Estes não dependem da camada 0. São certezas de hoje.

1. **⭐⭐ Preço dado, ninguém avisado — 457 Cart + 367 Urban em 6 dias.** Regra dura no fluxo: *cotou
   preço ⇒ emite cartão*, sem exceção. Hoje a IA cota e segue conversando até a conversa morrer.
2. **⭐ Conversa que morreu no cliente.** Lista acionável hoje (`node scripts/chatwoot.js pendentes`).
   Não precisa de estratégia nenhuma — precisa de alguém respondendo.
3. **⭐ Follow-up de quem viu preço e sumiu.** Nenhum existe hoje. É a mudança de fluxo com maior
   razão valor/esforço da lista, porque atinge exatamente quem já demonstrou interesse e preço.

## 6. Vendedores: o que fazer (e a opção que não funciona)

Qualificar vendedor exige que a conversa dele exista em algum lugar. Três caminhos:

| Caminho | Ganha | Custa |
|---|---|---|
| **A. Handoff dentro do Chatwoot** (WhatsApp oficial, vendedora atende pelo painel) | Conversa inteira medível · tempo de resposta real · histórico não vai embora quando a pessoa sai · lead não se perde em celular pessoal | Mudança de hábito · número oficial · custo por conversa da Meta |
| **B. Vendedora fecha a conversa no Chatwoot com desfecho** | Barato, sem mudar canal | **Depende de disciplina — e o dado já provou que não rola**: `resolutions_count: 0` nas duas instâncias, ninguém fecha uma conversa sequer hoje |
| **C. Deixar como está** | Zero esforço | Continua cego, e o relatório "por agente" do Chatwoot segue medindo a IA e parecendo que mede gente |

**Recomendo A.** B é tentador e é o que costuma ser escolhido por ser barato, mas o próprio Chatwoot
já mostra o resultado dele: zero resoluções em 49 mil conversas. Processo que depende de gente
lembrar de marcar, não acontece.

E vale dizer o que A resolve de quebra: hoje, se uma vendedora sai, **o histórico dos clientes dela
sai junto**, porque está no celular dela.

## 7. O que foi construído agora

`scripts/chatwoot.js` ganhou três comandos (só leitura, como o resto):

```bash
node scripts/chatwoot.js qualificar <cart|urban>   # a régua: frequência dos 16 sinais + os 3 vazamentos
node scripts/chatwoot.js pendentes <cart|urban>    # conversas mortas no cliente, com telefone — lista de hoje
node scripts/chatwoot.js amostra <cart|urban> [n]  # amostra estratificada pro juiz IA (camada 2)
```

`telChave()` (normalização de telefone pra camada 0) está pronto e testado.
Teste: `node test/qualificacao.test.js`.

⚠️ **Os padrões de texto precisam de calibração na primeira rodada.** Foram escritos sem os tokens
do Chatwoot no ambiente, então casam o português esperado, não o português medido. `SINAIS` fica no
topo do script numa tabela única, editável — a primeira rodada real é pra conferir na mão se cada
sinal está pegando o que promete, antes de qualquer número virar decisão.

## 8. O que falta pra continuar

1. **`CHATWOOT_CART_TOKEN` e `CHATWOOT_URBAN_TOKEN`** no ambiente — sem eles não roda nada.
2. **Onde vive o prompt/fluxo da IA** (n8n?). Sem acesso, a camada 3 vira recomendação em vez de
   mudança.
3. **Maju e Duda são a mesma IA em lojas diferentes, ou duas?** A análise de 10/ago só viu
   assinatura "Maju" nas duas instâncias. Se forem duas, comparar Cart×Urban compara IAs
   diferentes — e aí os 10 pontos de diferença em proposta→visita mudam de significado.
