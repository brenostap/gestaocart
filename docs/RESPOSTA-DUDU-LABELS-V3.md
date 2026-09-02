# O portão dispara — reproduzi na tua base e o meu 438 não sobrevive

**De:** Breno · **Para:** Dudu · **02/set/2026**
**Responde:** *"O portão dispara"* · **Corrige:** `docs/PLANO-QUALIDADE-IA.md` §3-bis

---

## 0. Em uma frase

Você está certo, e eu fui medir com a tua régua na **tua base** — não no meu cache. O balde de
1.201 / 438 / 734 é **artefato de régua**, e some quase inteiro quando se tira o horário de
funcionamento e a forma de pergunta. **Retiro o "o gate está funcionando?".** Onde há compromisso de
verdade, o portão dispara em **97% a 99%**.

Em troca eu te devolvo duas correções: **os teus 60% do Instagram são o mesmo artefato de
denominador** que você me apontou (§3), e a tua régua de promessa está estreita de um jeito que dá
pra medir (§2).

---

## 1. A reprodução, com a régua caindo degrau a degrau

**Onde:** projeto **`supabase-cart`** (nomeando o projeto, pelo teu próprio aviso).
Só leitura, nenhuma escrita. Janela jul+ago/2026, sessões que chegaram a preço.

### WhatsApp — `n8n_chat_histories_maju_v2`, 3.827 sessões com preço

| régua | vazou (sem `transfereHumano`) |
|---|---|
| **ingênua** — dia + hora na fala dela | **233** ← reproduz o nosso 227 |
| − mensagens de **horário de funcionamento** | **110** |
| − mensagens em **forma de pergunta** | **66** |
| **verbo de compromisso + hora** (a tua régua) | **3**, de 326 → **99,1% transfere** |

**Metade do nosso número era horário de loja**, exatamente como você achou do teu lado. O resto era
ela perguntando.

### Instagram — `n8n_chat_histories_instagram` (projeto da Cart), 1.344 sessões com preço

| régua | vazou |
|---|---|
| ingênua | 75 |
| filtrada | 29 |
| **verbo de compromisso** | **3**, de 105 → **97,1% transfere** |

### O que sobra do balde inteiro

| nosso número publicado | o que ele é de verdade |
|---|---|
| **438** "marcou dia e hora" | **6** (3 WhatsApp + 3 Instagram) |
| **1.201** "compromisso e ninguém avisado" | não se sustenta na régua |

⚠️ E tem um terceiro erro no nosso 438 que só apareceu agora: **as duas metades vinham de fontes
diferentes.** O `n8n_chat_histories_instagram` da Cart **começa em 10/08/2026** — não existe julho
ali. Então o "Instagram, jul+ago, 211" do nosso doc saiu do cache do Chatwoot, e foi somado com um
número de WhatsApp vindo do n8n. **Somei duas medições de instrumentos diferentes e apresentei como
uma.**

---

## 2. Os 3 do WhatsApp são reais — e confirmam a TUA leitura, não a minha

| sessão | o que ela disse |
|---|---|
| `5511982591495-cart` | *"seu agendamento é sexta às 13:30, certo? nosso especialista já vai te chamar"* |
| `5521988553767-cart` | *"agendado pra sábado 25/07 às 10h! show! nosso especialista já vai continuar seu atendimento por aqui"* |
| `5511979539179-cart` | *"já deixei tudo registrado: iphone 17 pro max 256gb lacrado, titânio branco. como o expediente já encerrou, o especialista vai te chamar amanhã cedo"* |

Nas três, `transfereHumano` **não rodou**.

⚠️ **Repara no que as três têm em comum: ela anuncia a passagem de bastão.** Não é o portão exigindo
dado que não tem — é a IA **dizendo que transferiu sem ter executado a tool**. Isso é exatamente o
que você chamou de *"defeito de execução do modelo, não do portão"*. As três são a mesma coisa que o
teu caso do 11/07, e é o **único** padrão que sobrou de pé.

### E a tua régua de promessa está estreita — dá pra medir quanto

| | teu número | meu número | fonte |
|---|---|---|---|
| Cart WhatsApp · prometeu contato | 262 | **1.204** | mesma tabela, jul+ago |
| ↳ ninguém avisado | **41** | **45** | — |

**O numerador converge, o denominador não** (4,6×). Ou seja: a gente acha os mesmos vazamentos, e
discorda de quantas promessas existem.

A minha é larga demais e eu sei onde: ela pega **declaração de capacidade**, que não é promessa.
Lidas na mão:

> *"a % exata quem confirma é **o vendedor** quando você estiver aqui"* · *"**o vendedor** consegue
> mandar foto e vídeo antes da visita"* · *"se preferir, **posso te encaminhar** pro especialista"*

Nenhuma dessas é um compromisso. **A tua régua é a certa**; só não sei ainda se ela está estreita
*além* disso — é o que o §3 sugere.

---

## 3. Os teus 60% do Instagram: é o teu próprio artefato de denominador

Você deixou pendurado *"o Instagram vazando 60% na promessa de contato, 9 de 15"*, dizendo que ia
olhar antes de eu perguntar. Olhei junto, **na mesma janela que você usou (10/08 a 31/08) e na mesma
tabela**:

| | prometeu | vazou | taxa |
|---|---|---|---|
| **teu** | 15 | 9 | **60,0%** |
| **meu** | **347** | 15 | **4,3%** |

O numerador é da mesma ordem (9 × 15). **O denominador difere 23×.** Com 15 no denominador, dois
casos a mais ou a menos movem a taxa 13 pontos — é o mesmo mecanismo do *"a magnitude batia e a
magnitude era o artefato"* que você escreveu sobre o meu número, invertido.

**Não estou dizendo que o Instagram está bem.** Estou dizendo que **60% não é um número, é um
intervalo enorme**, e que antes de tratar como "o mais feio de todos" vale rodar a tua régua de
promessa com o denominador aberto. Se der 4%, o Instagram está igual ao WhatsApp.

⚠️ E cuidado com a janela: **a tabela do Instagram da Cart começa em 10/08**. Qualquer comparação
IG × WhatsApp que use julho compara três semanas contra doze.

---

## 4. Uma coisa nova, pequena e que eu não sabia que existia

Procurando os vazamentos apareceu um padrão com nome próprio: a IA fecha o dia prometendo o dia
seguinte.

> *"como o expediente já encerrou, o especialista vai te chamar amanhã cedinho, a partir das 9h"*

| | prometeu "amanhã" | sem ninguém na fila |
|---|---|---|
| WhatsApp | 167 | **4** |
| Instagram | 39 | **2** |

**206 casos, 6 sem transferência.** Ou seja: **não é vazamento** — o portão dispara aqui também, e
eu registro isso a favor da tua tese, não da minha.

Mas fica uma pergunta que não é do portão e sim de gente: **essas 200 viram fila às 9h da manhã
seguinte?** A transferência existe; o que eu não sei é se alguém pega. Isso é SLA humano, e é medível
do teu lado com o `dataTransferencia` contra a primeira fala do vendedor.

---

## 5. Tuas respostas às minhas 7 — o que eu faço com cada uma

| # | tua resposta | do meu lado |
|---|---|---|
| 1 | `match_resultado.telefone` + `id_venda` → `relatorioVendas.loja` | **Aceito, e resolvo o teu lixo.** Aquele `"CART VENDEDOR ISA ATENDENTE ANNE"` é o **nosso formato de observação de venda** — a gente parseia isso há meses (`getVendaInfo()`/`parseObs()`, e a tabela `apelidos` pros typos). **Não parseia `loja` no teu lado**: me manda a lista de `id_venda` e eu te devolvo `id_venda → loja` já normalizado, junto com vendedor e atendente. |
| 2 | trava por `projeto`, join do meu lado | fechado |
| 3 | `vocab_versao` + `avaliado`, e **o denominador no nome da coluna** | fechado — e a regra do denominador é melhor que a minha proposta original |
| 4 | `q_sinal-ignorado` pelo texto do cliente, sem gatilho de parar tudo | **eu mesmo derrubo o gatilho.** Com os números do §1, não há 20% nenhum. Continua valendo medir, com prioridade baixa |
| 5 | calibração primeiro | fechado |
| 6 | `lead-qualificado` → `etapa_transferido` | fechado |
| 7 | não dá por criativo — `origem` só tem canal, `atribuicao_id` em ~50%, base de 35 | **aceito, e ofereço o outro caminho:** do nosso lado o criativo existe pelo `headline` do anúncio (é o que gerou o `lead_score` de 27/ago). Se você me passar as 35 sessões com telefone, eu tento casar com anúncio aqui. Se não casar, morreu — não vale forçar |

---

## 6. O que eu levo desta troca

1. **Régua larga com magnitude plausível é o erro mais caro dos dois.** Nós dois caímos nele em dois
   dias — você nos 237, eu nos 438. O que salvou os dois casos foi **ler seis conversas na mão**.
2. **Somar duas fontes é pior ainda**, e foi o meu terceiro erro: WhatsApp do n8n + Instagram do
   Chatwoot no mesmo total, com janelas diferentes.
3. **Denominador pequeno mente nos dois sentidos** — o teu 60% e o meu 438 são a mesma falha.

Vou corrigir o §3-bis do `PLANO-QUALIDADE-IA.md` com esses números, marcado como **derrubado em
02/set**, e não como reescrita silenciosa: quem leu o número velho precisa ver que ele caiu e por quê.

**O que fica de pé da minha parte inteira:** três conversas em que a IA anunciou a transferência sem
executar a tool. É pouco, é real, e é o teu diagnóstico, não o meu.
