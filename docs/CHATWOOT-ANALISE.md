# Atendimento no Chatwoot — o que o dado diz (10/ago/2026)

> ⚠️ **Leia `docs/IAS-E-ESPECIALISTAS.md` antes deste.** Em 26/ago/2026 o dono corrigiu a leitura de
> quem é quem: **Maju é a IA da Cart e Duda a da Urban, as duas nos dois canais**, e as mensagens
> assinadas *"me chamo David / sou a Isa"* são a **IA fazendo o handoff em nome do especialista** —
> não persona da IA, não vendedora escrevendo. O resto deste documento continua válido; a seção
> "Nenhuma vendedora escreve no Chatwoot" **está ERRADA** — ver abaixo.

Primeira análise das conversas de atendimento, feita no dia em que o acesso à API foi liberado.
Amostra: **1.200 conversas da Cart + 800 da Urban**, com todas as mensagens (≈32 mil), janela de
**05 a 10/ago/2026**. Ferramenta: `scripts/chatwoot.js`. Agente: `.claude/agents/analista-conversas.md`.

## O acesso

Duas instâncias **separadas** do Chatwoot, uma por loja (não é multi-conta dentro de uma só):

| Loja | URL | Inboxes | Conversas no total |
|---|---|---|---|
| Cart | `n8n-chatwoot.3tclbj.easypanel.host` | WhatsApp, Instagram | 37.200 |
| Urban | `chatwoot-chatwoot.3tclbj.easypanel.host` | WhatsApp, Instagram | 12.293 |

⚠️ O subdomínio da Cart começa com `n8n-` mas **é Chatwoot**, não n8n — nome herdado do serviço no
EasyPanel.

Token de administrador por instância, em `CHATWOOT_CART_TOKEN` / `CHATWOOT_URBAN_TOKEN`. **O mesmo
token que lê também manda mensagem pro cliente** — o `scripts/chatwoot.js` só faz `GET`, mas a
restrição é disciplina nossa, não do token.

## ⚠️ A descoberta que invalida os relatórios do Chatwoot

> 🚨 **CORRIGIDO em 27/ago/2026 — esta seção está errada no Instagram.** As especialistas
> **escrevem sim**, no mesmo canal, depois que a IA transfere. O que acontece é que **o Chatwoot não
> consegue atribuí-las**: tudo que a loja manda no Instagram chega como `external_echo: true` com
> `sender: null`, então a mensagem da Maju e a da Isa são indistinguíveis lá dentro — e a contagem
> "por remetente" abaixo mede isso, não a realidade. Prova e instrumento de separação em
> `docs/PLANO-QUALIDADE-IA.md` §3-ter e `scripts/separa-ia-vendedor.js`.
> **No WhatsApp a seção continua valendo**: lá o especialista usa o número pessoal.

**Nenhuma vendedora escreve uma única mensagem no Chatwoot.**

Em 2.000 conversas, as mensagens do lado da loja têm só dois remetentes:

| Remetente | Cart | Urban |
|---|---|---|
| `id=1` "Eduardo" | 4.616 | 1.934 |
| sem remetente | 5.454 | 5.033 |
| David, Isa, Mel, Maria, Pietra, Denilson | **0** | **0** |

**Os dois remetentes são a IA.** As duas assinaturas falam como a Maju ("Oii! Sou a Maju 💙", "O
David já está com seu atendimento"). "Eduardo" é a conta que a automação usa pra escrever — não é a
pessoa. E não é falta de trabalho: 457 conversas da Cart e 160 da Urban estão atribuídas a uma
vendedora com nome.

Ou seja: a IA conversa, qualifica e atribui — e **daí em diante o Chatwoot fica cego**. O handoff
vai pro **WhatsApp pessoal da vendedora**, e a própria IA diz isso ao cliente (conversa 37475):
*"Você está conversando com o David pelo número pessoal dele, né? Se preferir, segue por lá que ele
te responde mais rápido."*

Consequências, todas duras:

- **O relatório "por agente" do Chatwoot é ficção.** Aquele "tempo médio de espera de 21h do David"
  mede a IA em conversas atribuídas a ele, não ele.
- **Não dá pra medir tempo de resposta humana com esse dado** — nem agora, nem com sync nenhum. O
  dado simplesmente não existe do lado de cá.
- Todo gap grande entre mensagem do cliente e resposta da loja é **a IA demorando**, não gente.
  (A IA tem comportamento de "vou pausar nosso atendimento por aqui" — provável causa, não medido.)

## O funil

⚠️ **Armadilha que já custou um diagnóstico errado.** A IA emite **cartão de texto fixo**
(`💼 *PROPOSTA APRESENTADA*`, `🗓️ *VISITA AGENDADA*`, …), e é tentador ler o cartão como "chegou a
preço". **Não é.** O cartão marca o **handoff pro humano**; a IA cota preço o tempo todo sem escalar
ninguém. Medir preço pelo cartão inflou "nunca viu preço" de 46% pra 73% na primeira leitura desta
mesma amostra. Preço se mede procurando `R$` em mensagem **não-privada** da loja.

| | Cart (1.200) | Urban (800) |
|---|---|---|
| Cotou preço | 644 (53,7%) | 487 (60,9%) |
| **Nunca cotou preço** | **556 (46,3%)** | **313 (39,1%)** |

| Cartão de handoff emitido | Cart | Urban |
|---|---|---|
| Proposta apresentada | 167 (13,9%) | 115 (14,4%) |
| Visita agendada | 54 (4,5%) | 20 (2,5%) |
| Sem valor apresentado | 44 (3,7%) | 12 (1,5%) |
| Atendimento transferido | 24 (2,0%) | 14 (1,8%) |
| Verificar estoque | 14 (1,2%) | 6 (0,8%) |
| Produto especial | 12 (1,0%) | 15 (1,9%) |
| Negociar desconto | 3 (0,3%) | 0 |
| Confirmar antes da visita | 1 (0,1%) | 0 |

### ⭐ O buraco maior: preço dado, ninguém avisado

**A IA cotou preço e não passou pra humano nenhum em 457 conversas da Cart (71% das que viram
preço) e 367 da Urban (75%).** O cliente recebeu valor e a conversa morreu ali dentro do Chatwoot,
sem cartão, sem atribuição, sem ninguém saber que existia.

Isso é maior e mais acionável que o "nunca cotou preço": são leads que já passaram pela parte
difícil (chegaram no valor) e evaporaram por falta de passagem de bastão.

**Proposta → visita: 24,4% na Cart, 14,8% na Urban** — dez pontos de diferença com a mesma IA e o
mesmo script. É pista, não ruído.

**~46% (Cart) / 39% (Urban) nunca cotam preço.** Continua sendo bastante gente, e continua **sem
explicação medida**.

## Demanda — o que o cliente pede

Contagem de modelo citado **em mensagem do cliente** (não é o que você vende; é o que ele procura).

| Cart | | Urban | |
|---|---|---|---|
| iPhone 13 | 130 | iPhone 11 | 123 |
| iPhone 11 | 106 | iPhone 12 | 75 |
| iPhone 15 Pro Max | 83 | iPhone 13 | 53 |
| iPhone 14 | 44 | iPhone 17 Pro Max | 36 |
| iPhone 15 | 42 | iPhone 17 Pro | 34 |

**São públicos diferentes.** A Cart tem procura relevante em Pro Max; a Urban concentra em 11/12,
aparelho de entrada. Vale cruzar com a margem do estoque parado de cada loja
(ver `docs/ANALISE-MARGEM-ESTOQUE.md`).

## Problema operacional pequeno e concreto

**148 mensagens falharam ao enviar** (69 Cart, 79 Urban) em ~70 conversas — cliente que nunca
recebeu a resposta. ~3% das conversas. Provavelmente configuração (janela de 24h do WhatsApp?),
não foi investigado.

## Configuração quebrada

- **`resolutions_count: 0` nas duas instâncias.** Ninguém fecha conversa. Todo relatório de
  resolução vem vazio e as dezenas de milhares de conversas "abertas" não significam nada.
- **A Urban não usa label nenhuma.** A Cart tem `lead-qualificado` (556 em 10 dias) e `suporte`;
  na Urban não há como medir qualificação por label.

## Notas de método (pra não repetir erro)

- **Média engana muito aqui.** O atendimento responde em segundos na mediana e tem cauda de horas;
  a média fica parecendo catástrofe. Use mediana + p90 e diga qual é qual.
- A lista de conversas vem ordenada por **última atividade**, então "as primeiras N páginas" é uma
  janela recente — mas as mensagens dentro delas podem ser bem antigas (conversa reativada). Para
  definir janela, olhe `last_activity_at` da conversa, não o `created_at` das mensagens.
- A API do Chatwoot exige **uma chamada por conversa** pra pegar mensagens. Varrer as 49 mil
  conversas seriam ~50 mil requisições contra a instância de produção. Se isso virar rotina, o
  caminho é ler o Postgres do Chatwoot direto, não a API.

---

## O buraco dos 71%: investigado em 17/ago/2026

Script: `node scripts/preco-sem-handoff.js cart`. Roda sobre o mesmo cache do `chatwoot.js`,
sem rede e sem token.

**Ponto de partida:** 457 conversas da Cart (71% das que viram preço) receberam valor e não
geraram cartão de handoff. A pergunta era *por quê*.

### Primeiro: o cartão é NOTA PRIVADA

⚠️ Armadilha que me pegou na primeira rodada. O cartão de handoff avisa a **equipe**, não o
cliente: no cache da Cart, **318 conversas têm o cartão só em nota privada e apenas 1 em mensagem
pública**. `temPreco()` filtra `private` (correto — nota não foi pro cliente); `etapaDe()` **não
filtra** (também correto, pelo mesmo motivo invertido). Filtrar nos dois igual inflou o balde de
457 para 643. As duas funções divergem de propósito.

### A segmentação

| | conversas | |
|---|---|---|
| **o cliente respondeu depois do preço** | **368** | **80,5%** |
| o cliente sumiu (parado há 10 dias na mediana) | 89 | 19,5% |

Ou seja: o balde **não é** gente que sumiu. Em 4 de cada 5 o cliente continuou falando — e mesmo
assim ninguém foi acionado.

### O mecanismo: a IA não trava, ela conversa até acabar

Nessas 368, **a última palavra é da Maju em 365** (99%). Ela responde tudo — garantia (97),
disponibilidade (84), parcelamento (42), troca (31) — e nunca decide que é hora de chamar gente.
A conversa morre com uma pergunta dela pendurada.

⭐ **28 clientes sinalizaram compra explicitamente** ("vou querer", "quero", "pode separar") e
nenhum gerou handoff. Três exemplos lidos:

- **#37346** — Maju cota 15 Pro Max R$ 3.950, cliente responde "Okk / Vou querer". Fim da conversa.
- **#28397** — cliente escreve "Quero comprar um iPhone…", pede 15 Pro Max, e ao ser perguntado se
  tem aparelho de troca responde **"Não quero compra"** (é "não [tenho troca], quero comprar"). A
  Maju lê como desistência: *"Tranquilo, então deixamos o 15 Pro Max de lado"*. Cliente perdido por
  interpretação.
- **#37286** — cliente engajado, sabe o endereço, quer pagar no Pix, R$ 7.450, diz "já está tudo
  certo pro mês que vem". A Maju oferece simular entrada, o cliente aceita ("Pode ser") e ela
  **não simula** — encerra com "quando chegar o mês que vem, me chama".

### E o follow-up também não cobre

Não é só o handoff que falha. Dos leads de WhatsApp da Cart que **não compraram** (jun–ago),
**68,7% nunca receberam nenhum follow-up** (4.667 de 6.797). O fluxo existe — 2.130 têm follow-up
agendado e 1.454 foram reengajados — mas alcança só um terço. **Os dois portões estão fechados ao
mesmo tempo**: ninguém é acionado e ninguém volta depois.

### Quanto isso vale

| grupo | conversas | compraram | taxa |
|---|---|---|---|
| **gerou handoff** | 319 | 11 | **3,4%** |
| **viu preço, sem handoff** | 457 | 1 | **0,2%** |
| nunca viu preço | 424 | 4 | 0,9% |

**Quem passa pelo handoff converte ~16× mais.** Valor cotado nas 364 conversas vivas com aparelho
identificado: **R$ 1,55 milhão**, mediana de **R$ 3.950** por aparelho.

⚠️ Três ressalvas, porque este número vai virar decisão:

1. **As taxas absolutas estão subestimadas** — a coorte é de agosto e a mediana de lag lead→compra
   é 8 dias com p75 de 84 (ver `docs/ATRIBUICAO-LEADS-VENDAS.md`). A **razão entre os grupos** é
   mais confiável que o nível, porque os três têm a mesma maturidade.
2. **Correlação, não causa provada.** O handoff pode ser emitido *porque* o cliente já estava
   quente. O que é evidência direta de perda são os 28 que disseram que iam comprar e não geraram
   handoff — esses não são viés de seleção.
3. O 0,9% do grupo "nunca viu preço" ser maior que o 0,2% do "preço sem handoff" é **ruído** —
   são 4 e 1 conversas. Não construa nada em cima disso.

### ⚠️ Correção: "a Maju aceita a negativa fácil demais" — medido, e é FALSO

Foi o que eu concluí de **uma** conversa (#28397) logo depois da análise acima. Medi antes de
virar mudança de prompt, e o dado desmente.

A Maju emite frase de encerramento ("sem problemas", "tranquilo", "se mudar de ideia me chama")
em **115 conversas**. O que o cliente tinha acabado de dizer:

| o que o cliente disse | conversas | a resposta dela está |
|---|---|---|
| deferiu de verdade ("tenho que ver ainda, mas obrigado") | 70 | certa |
| "não" seco ("não vou ver, qualquer coisa eu aviso") | 26 | certa |
| "tenho aparelho mas não vou dar" | 6 | certa — ela segue a venda sem o upgrade |
| pediu pra não ser mais contatado | 5 | **exemplar** |
| tinha intenção de compra na mesma frase | 4 | passiva, dá pra melhorar |
| era pergunta, não recusa (falso positivo do meu regex) | 4 | — |

**111 das 115 estão corretas.** Em #37411 o cliente escreve *"Ok obg não volte mais!"* e ela
responde *"Tranquilo, não vou mais te chamar"* — exatamente o que tem que fazer.

⚠️ **Não mexa no prompt pra ela insistir mais.** Um prompt que resiste à negativa atropelaria os
26 "não" legítimos e, pior, os 5 pedidos explícitos de parar. O ganho seriam ~4 conversas; o custo
é a loja virar chata e desrespeitar opt-out.

**#28397 é outra coisa, e continua válido**: é falha de *interpretação* de texto ambíguo ("Não
quero compra" = "não [tenho troca], quero comprar"), não de política de insistência. Se for
consertar, é desambiguar resposta curta depois da pergunta de troca — não afrouxar a aceitação do
"não".

O problema de verdade continua sendo o outro: **365 conversas morrem com uma pergunta da Maju
pendurada**, sem escalada e sem follow-up. Esse tem 368 casos, não 4.

## ⚠️ Baixar dado fresco do Chatwoot NÃO dá a coorte madura (17/ago/2026)

A lista da API vem ordenada por **última atividade**. Baixar mais páginas traz mais conversas
*recentes*, não mais antigas. Medido no cache:

| arquivo | conversas | iniciadas em ago | em jun |
|---|---|---|---|
| `cart.json` | 1.200 | **1.101** | 18 |
| `cart-7d.json` | 1.379 | **1.199** | 30 |
| `urban.json` | 800 | **755** | 7 |

Junho aparece a ~2% do fluxo. Para juntar ~500 conversas de junho seriam ~25 mil conversas
baixadas — e a API exige **uma chamada por conversa**, contra a instância de produção. Não vale.

**Os tokens servem para outra coisa:** medir se um conserto funcionou (dado fresco depois da
mudança) e atualizar a Urban. Não para análise de conversão.

### A coorte madura já estava no Supabase

**`n8n_chat_histories_maju_v2`** (projeto `supabase-cart`): 161.053 mensagens, 8.338 sessões,
`created_at` **100% preenchido**, desde **10/jun/2026**. É o WhatsApp da Maju v2.

- `session_id` = `<telefone>-cart`. Tirando o sufixo, **3.674 de 3.674 sessões de junho (100%)
  casam com `contatosBreno.telefone`**. Ligação perfeita com o rótulo `comprou`.
- ⚠️ Só WhatsApp. O Instagram (`n8n_chat_histories_instagram`) continua sem data antes de 10/ago.

**Rodando na coorte de junho (~68 dias de maturação):**

| | sessões | compraram | conversão |
|---|---|---|---|
| **transferidas pra um vendedor** | 1.152 | 131 | **11,37%** |
| **não transferidas** | 2.522 | 49 | **1,94%** |
| total | 3.674 | 180 | 4,90% |

**Ser transferido multiplica a conversão por 5,9×** — medido em coorte madura, com 1.152 contra
2.522 casos. Isso confirma o achado dos 71% com estatística muito melhor que os 11 contra 1 do
Chatwoot de agosto. É o mesmo fato, medido duas vezes por caminhos independentes.

## O gatilho da escalada — coorte de junho, 3.674 sessões (17/ago/2026)

Fonte: `n8n_chat_histories_maju_v2` + `contatosBreno`. Recorte: sessões com preço dado e **5+
mensagens do cliente** — 940 que escalaram contra 1.004 que não. O recorte existe pra tirar o
óbvio da conta: conversa longa escala mais só porque tem mais chance de escalar.

### A diferença sobrevive ao controle de engajamento

| msgs do cliente | com preço | % que escalou | conv. se escalou | conv. se NÃO |
|---|---|---|---|---|
| 0–2 | 192 | 3,6% | 14,29% | 2,16% |
| 3–4 | 537 | 9,9% | 5,66% | 1,45% |
| 5–7 | 910 | 30,8% | 10,00% | 1,27% |
| 8–11 | 632 | 55,2% | 10,60% | 1,77% |
| 12+ | 402 | 77,4% | 16,40% | 2,20% |

**Em toda faixa, escalar separa.** Mesmo entre os mais engajados (12+ mensagens), quem escalou
converteu 16,4% contra 2,2%. Não é só "gente engajada escala e gente engajada compra".

### ⭐ O gatilho não é querer comprar — é falar um dia

| sinal | ESCALOU (940) | vazou (1.004) |
|---|---|---|
| **cliente falou dia/horário** | **35,2%** | **10,2%** |
| cliente sinalizou compra ("vou querer", "vou levar", "pode separar") | 29,7% | **38,5%** |
| cliente pediu endereço | 15,2% | 10,9% |
| cliente falou de troca | 20,7% | 22,9% |
| **IA ofereceu visita** | **84,9%** | **87,1%** |

Duas leituras que saltam:

1. **A IA oferece visita nos dois grupos igualmente** (85% vs 87%). Ela sempre oferece. O que muda
   é o cliente responder com um dia.
2. **As que vazaram têm MAIS sinal de compra que as que escalaram** (38,5% contra 29,7%). A
   escalada é, se alguma coisa, *inversamente* correlacionada com dizer que quer comprar.

**Conclusão: a regra de escalada hoje é de agendamento, não de intenção.** Quem diz "vou querer"
mas não marca dia não aciona ninguém.

### O tamanho disso

**348 conversas** em junho: o cliente sinalizou compra, **não** falou um dia, ninguém foi chamado.
Converteram **0,29% (1 de 348)**. As 177 equivalentes que *escalaram* — mesmo sinal, mesma ausência
de dia — converteram **5,65%**.

Escalar essas 348 ao patamar das 177 daria ~20 vendas em junho, sobre as 180 que aconteceram
(**+11%**).

⚠️ **Não use a taxa da faixa cheia (10–16%) pra dimensionar isso.** Quem sinaliza compra sem marcar
dia converte menos mesmo quando escalado (5,65%), porque está menos comprometido que quem deu data.
Usar 10% infla a promessa em 2×.

⚠️ **Correlação, não causa provada.** O contrafactual assume que as 348 se comportariam como as 177,
e elas podem diferir em algo não medido.

### Nota de método: dois falsos positivos meus

- `\m(quero|queria)\M` pega *"quero saber o preço"*. Inútil como sinal — 62% das conversas têm.
  O recorte que presta é a forma comprometida: `vou querer|vou levar|pode separar|quero comprar`.
- Mesmo essa pega negação: *"eu **não** vou querer comprar não"*. Excluir negação nas 25 letras
  anteriores corrige — mas moveu pouco (389→387 e 283→279), então o achado não dependia disso.
  Ficou no SQL porque na próxima janela pode pesar mais.
