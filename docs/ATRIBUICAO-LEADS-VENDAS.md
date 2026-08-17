# Atribuição: de onde a venda veio

De qual lead (e portanto de qual canal/anúncio) veio cada venda. O cruzamento
original é do **Dudu** (dev da Maju), e vive nos projetos Supabase dele:
`supabase-cart` (`cmzptavlhdfklpfdcynf`) e `supabase-urban` (`exhlzstyukhcnrravmoc`).

Este documento é o diagnóstico de 17/ago/2026 e a cascata proposta. O código está em
`scripts/atribuicao/`. **Nada foi gravado em nenhum banco** — a simulação é só `SELECT`.

## A cadeia inteira

```
atribuicao_clique          →  contatos*              →  match_resultado  →  vendas (painel)
(anúncio: source_id,          (lead: nome, telefone,    (o cruzamento)      (valor, lucro,
 headline, ctwa_clid)          igsid, origem)                                produto, loja)
```

Ela já existe ponta a ponta. O elo fraco é só o do meio.

## O que tem hoje

`match_resultado` existe nos dois projetos, mesmo schema:
`id_venda · nome_phoneninja · nome_supabase · telefone · similaridade · tipo_match · confirmado · logged_at`

**`id_venda` é o `vendas.id` do painel** — bate 100%, é a mesma chave da FoneNinja.
O campo `telefone` guarda telefone quando o lead veio do WhatsApp e **@ do Instagram**
quando veio do IG.

| tipo_match | Cart | confirmado | Urban | confirmado |
|---|---|---|---|---|
| telefone | 588 | 588 (100%) | 65 | 65 (100%) |
| nome_instagram | 482 | 104 (22%) | 288 | 37 (13%) |
| nome | 251 | 8 (3%) | 140 | 1 (0,7%) |

⚠️ **O matcher do Dudu é conservador e está certo.** Em julho/Cart ele só confirmou
telefone (105) e nome com similaridade ≥ 0,70 (14). **Nada abaixo de 0,70 virou
`confirmado`.** O problema não está nele.

## Os 3 defeitos (e onde eles moram)

**1. O write-back aceita coisa que o matcher não confirmou.**
Julho/Cart: `contatos*.id_venda` marca **179 vendas**, mas só **115** têm um
`confirmado=true` correspondente em `match_resultado`. As outras **64 vieram de outra
fonte** — provavelmente o n8n marcando na hora, sem passar pela cascata.

**2. Uma venda é reivindicada por vários leads.**
Julho/Cart: 269 linhas de lead marcando 179 vendas → **72 vendas (40%) com mais de um
lead**. Na base inteira da Cart são 331 de 1.124 (29%). Isso é contagem dupla direta no
ROAS. Nada no fluxo obriga "uma venda = um lead".

**3. Não existe trava de loja.**
As duas bases cruzam o mesmo universo de vendas. A venda `40610383` (loja **urban**)
aparece nas duas: na Urban casou 1,00 com o @ certo do cliente, na Cart casou 0,45 por
nome com outra pessoa. Não há nada que impeça.

## A cascata proposta

```
N1  telefone idêntico (últimos 9 dígitos)          → aceita
N2  nome normalizado idêntico                      → aceita
N3  nome com similaridade >= 0,85                  → aceita
N4  nome entre 0,70 e 0,85                         → aceita
N5  nome entre 0,45 e 0,70 COM trava de vendedor   → aceita (ver seção do N5)
    abaixo disso                                   → descarta
```

Mais três travas que hoje não existem:

- **Loja** — o blob de vendas já vem filtrado, então lead da Cart nunca casa com venda
  da Urban.
- **Janela** — o lead precisa existir antes da venda (+1 dia de folga) e a venda precisa
  cair até 45 dias depois da última mensagem dele.
- **Vendedor** — `contatos.vendedorAtribuido` = `vendas.vendedor_obs`, com a
  transferência até 30 dias antes da venda. É o que sustenta o N5.

E o **desempate**: `distinct on (venda_id)` — uma venda, um lead. Ganha o nível mais
forte; empatou, ganha quem falou por último antes da venda.

## Resultado da simulação (17/ago/2026)

⚠️ As duas tabelas abaixo são da cascata **sem o N5** (N1–N4 apenas), sobre **todas** as
vendas da loja. O ganho do N5, medido só nas vendas de VO, está na seção seguinte.

**Cart — julho/2026, 261 vendas**

| | cascata | hoje |
|---|---|---|
| vendas atribuídas | 104 (39,8%) | 152 (58,2%) |
| das quais por telefone | 95 | — |
| nome idêntico | 3 | — |
| nome 0,70–0,85 (revisar) | 6 | — |
| **vendas com mais de um lead** | **0** (desempate) | **55** |
| concordam com hoje (mesmo lead) | 97 | — |
| hoje escolhe outro lead | 2 | — |
| só hoje pega | 53 | — |
| só a cascata pega | 5 | — |

**Urban — julho+agosto/2026, 134 vendas**

| | cascata | hoje |
|---|---|---|
| vendas atribuídas | 19 (14,2%) | 51 (38,1%) |
| das quais por telefone | 14 | — |
| nome idêntico | 5 | — |
| **vendas com mais de um lead** | **0** | **13** |
| concordam com hoje | 18 | — |
| hoje escolhe outro lead | 0 | — |
| só hoje pega | 33 | — |
| só a cascata pega | 1 | — |

**Leitura:** a cascata é um subconjunto quase perfeito do que existe hoje — concorda em
97/104 (Cart) e 18/19 (Urban), e **em nenhum caso escolhe um lead diferente por engano**.
Ela entrega menos volume e **zero duplicata**. Os 53+33 que só o método atual pega vêm
justamente das marcações sem `confirmado` e dos nomes abaixo de 0,70.

## Nível 5: a trava de vendedor (17/ago/2026)

O lead transferido pra um VO grava **`vendedorAtribuido` + `dataTransferencia`**
(1.104 leads de IG e 1.275 de WhatsApp desde julho, na Cart). E o painel grava
**`vendedor_obs`** em 96% das vendas. **Os nomes batem exatamente dos dois lados:
`david`, `isa`, `mel`.**

Isso é uma trava que não existia no cruzamento. Exigir *mesmo vendedor + transferência
até 30 dias antes da venda* reduz tanto o universo de candidatos que o limiar de nome
pode cair de 0,70 pra **0,45 sem gerar um único empate** (medido: 0 empates em
julho/Cart, tanto a 0,55 quanto a 0,45).

**Ganho medido — 188 vendas de VO, Cart, julho/2026:**

| nível | vendas |
|---|---|
| N1 telefone | 57 |
| N2 nome idêntico | 3 |
| N3 nome ≥ 0,85 | 0 |
| N4 nome 0,70–0,85 | 6 |
| **N5 nome 0,45–0,70 + trava de vendedor** | **31** |
| **total** | **97** |

**Cobertura: 35,1% → 51,6%.** E o ganho é quase todo do Instagram — no total o
vencedor é IG em 53 casos contra 44 do WhatsApp. Origem dos 97: Orgânico 58, Meta Ads
17, Google Ads 1, sem origem gravada 21.

⚠️ Zero empate **não é** zero erro — significa que só existe um lead plausível, não que
ele é o certo. O N5 merece uma amostra revisada à mão antes de virar produção.

## Onde chegamos SEM mudar nada na coleta — 1 a 15/ago/2026

Cascata completa (N1–N5), as duas lojas, sem nenhuma das três mudanças de coleta:

| | Cart | Urban | total |
|---|---|---|---|
| vendas | 168 | 53 | **221** |
| **casadas** | 80 | 21 | **101 (45,7%)** |
| **não casadas** | 88 | 32 | **120** |
| N1 telefone | 51 | 6 | 57 |
| N2 nome idêntico | 6 | 2 | 8 |
| N4 nome 0,70–0,85 | 7 | 0 | 7 |
| N5 trava de vendedor | 16 | 13 | 29 |

Canal do vencedor: WhatsApp 62, Instagram 39. Origem: Orgânico 59, Meta Ads 35,
Google Ads 2, sem origem gravada 5.

**Sem o N5 seriam 72 de 221 (32,6%).** A trava de vendedor sozinha responde por 29 das
101 — e é o que segura a Urban de pé (13 dos 21 dela).

### O nome do Instagram é o display name do perfil — e um quarto dele é inútil

`contatosInstagram.nome` **não** é o @ nem um nome informado: é o **nome de exibição do
perfil**, o que a pessoa escolheu mostrar. Dos 1.679 leads de IG de agosto (Cart):

| | leads | % |
|---|---|---|
| parece "nome sobrenome" | 1.048 | 62% |
| só um nome, sem sobrenome | 326 | 19% |
| tem dígito ou símbolo no meio | 218 | 13% |
| **vira string vazia ao normalizar** | **142** | **8,5%** |
| **fica com menos de 8 letras → excluído do match** | **396** | **23,6%** |
| fonte matemática Unicode (𝔐𝔞𝔱𝔥𝔢𝔲𝔰) | 93 | 5,5% |
| letras espaçadas (`K A R O L`) | 14 | 0,8% |

Exemplos reais: `Lane Alves` e `Hiago Teixeira` casam bem; `Evelyn` e `level A` são
parciais; `𝖇𝖎𝖆𝖟𝖎𝖓𝖍𝖆.🦋`, `🌀`, `.` e `LGND #63259# Adriano` não casam com nada.

**Correção aplicada em 17/ago:** o matcher agora dobra as fontes Unicode de volta pra
a-z (`𝔐𝔞𝔱𝔥𝔢𝔲𝔰 𝔭𝔞𝔰𝔰𝔬𝔰` → `matheus passos`, que antes virava string vazia), junta letras
espaçadas, e no N5 aceita nome a partir de 4 letras (a trava de vendedor protege).
**Ganho medido: 80 → 82 vendas na Cart de agosto (47,6% → 48,8%), e 2 empates novos no
N5.** Pouco, mas é grátis e para de destruir nome válido em silêncio.

### Por que cada venda não cruzou — Cart, 1–15/ago, 168 vendas

Lista venda a venda em `.scratch/atribuicao/cart-2026-08-01-a-15.csv` (gitignored: a
Netlify publica a raiz do repo).

| balde | vendas | % | é teto ou é recuperável? |
|---|---|---|---|
| **CASOU** | 82 | 48,8% | — |
| **C. vendedor online vendeu, nenhum lead achado** | **58** | **34,5%** | **recuperável — o lead existe** |
| D. venda de loja (vendedor não é VO) | 14 | 8,3% | teto legítimo |
| A. venda sem telefone no painel | 8 | 4,8% | teto |
| B. tem lead no WhatsApp, fora da janela | 6 | 3,6% | recuperável (ajuste de janela) |

⚠️ **O balde C é o achado.** Se David, Isa, Mel ou Maria fecharam a venda, **houve
conversa** — esses quatro só atendem online. Logo o lead existe e nós não achamos. Não é
venda de balcão, é falha de cruzamento.

⚠️ **Correção de 17/ago, depois do teste do N6:** eu tinha escrito aqui que o teto real
seria 87% (82 + 58 + 6). **Isso não se sustenta.** O balde C não prova que o lead está lá
— prova só que o nome não bateu, e o nome tem 23% de recall mesmo em par verdadeiro (ver
a seção do N6). Do balde C, **15 vendas foram recuperadas pela marcação do fluxo (N0)**;
as outras 43 continuam sem forma conhecida de decidir. Trate o balde C como
**"não sabemos"**, não como "recuperável".

### O caminho pra atacar o balde C: o modelo negociado na conversa

O que ainda não foi usado: **84% das conversas de Instagram (17.512 de 20.894) citam um
modelo de iPhone**. E `venda_produtos.titulo` diz o modelo comprado em 100% das vendas.

Isso é um segundo eixo, independente do nome:

```
N6  mesmo vendedor + janela apertada (±2 dias)
    + modelo citado na conversa == modelo comprado na venda
    → aceita mesmo com nome fraco ou ausente
```

Por que funciona: cada VO recebe **11 a 20 leads por dia** (David 20,3 · Isa 15,9 ·
Mel 13,9 · Maria 11,0). Numa janela de ±2 dias são ~60 candidatos; filtrando pelo modelo
negociado, cai pra poucas unidades. O nome fraco então vira desempate, não chave.

Ordem sugerida:

1. **Extrair o modelo citado por sessão** de `n8n_chat_histories_*` (regex simples resolve
   a maior parte: `iPhone 13`, `13 Pro`, `15 Pro Max`). Guardar por `session_id`.
2. **Ligar sessão → lead**: `session_id = contatosInstagram.telefone || '-cart'`, casa em
   98,8%.
3. **Rodar o N6** só sobre o balde C e medir empates, do mesmo jeito que foi feito no N5.
4. Se o N6 fechar bem, o mesmo pipeline de leitura de conversa já serve pro objetivo
   maior — analisar atendimento e padrão de venda.

⚠️ Limite conhecido: `n8n_chat_histories_instagram` tem `created_at` só desde 10/ago
(95% das mensagens sem data). Pra período anterior, a data vem do lead, não da mensagem.

## N6 foi implementado e testado — não funciona (17/ago/2026)

Rodado sobre as 56 vendas do balde C que têm iPhone (2 são só acessório).
Script: mesma estrutura do `02-matcher.sql`, com o modelo extraído da conversa.

| teste | resolvidas sem ambiguidade |
|---|---|
| modelo da conversa, janela 7 dias | **1** de 45 com candidato |
| modelo, janela 2 dias | 10 |
| modelo dito pelo cliente (não pela Maju) | 10 |
| modelo + nome como desempate, margem ≥ 0,15 | **1** |
| modelo do **trade-in** (11 vendas com troca) | 1 |
| trade-in + armazenamento | 2 |

Média de **9,7 candidatos por venda** depois do filtro de modelo. O motivo é simples:
o modelo tem pouca variedade. Metade das vendas é 13 / 14 / 15 / 15 Pro Max, e metade
dos leads do dia negociou justamente esses. Filtrar por modelo corta o universo pela
metade, não por vinte.

### O que o teste do N6 revelou de mais importante

Para desempatar eu usei o nome — e aí medi uma coisa que muda a leitura de tudo.

**Controle contra a verdade conhecida:** peguei 43 vendas casadas por **telefone**
(par certo, sem dúvida) e medi a similaridade entre o nome do lead e o nome do comprador:

| similaridade do par CORRETO | vendas |
|---|---|
| ≥ 0,70 | 2 |
| 0,45 – 0,70 | 7 |
| 0,30 – 0,45 | 8 |
| **< 0,30** | **27 (61%)** |

**Mediana: 0,212.** O nome do WhatsApp/Instagram é o nome do perfil — apelido, só o
primeiro nome, "Mãe", emoji. Ele quase nunca parece com o nome registrado na venda.

**Consequência 1 — o N5 medido de verdade.** Rodando o N5 nessas 43 vendas de verdade
conhecida, ignorando o telefone: ele dá palpite em 10, **acerta 8 e erra 2**.
→ **precisão 80%, recall 23%.** Dos 29 matches de N5 em agosto, uns 6 devem estar errados.

**Consequência 2 — o balde C não prova ausência.** Com 23% de recall, o esperado é mesmo
que a maioria dos pares verdadeiros não seja encontrada por nome. ⚠️ **A estimativa de
"teto de 87%" que estava aqui antes não se sustenta** — o balde C é "não sabemos", não
"recuperável comprovado". O lead pode estar lá; nós é que não temos como provar.

**Consequência 3 — o caminho por atributo está esgotado.** Modelo, armazenamento, troca e
nome foram todos testados. Todos têm entropia baixa demais para identificar uma pessoa
dentro dos ~60 leads que um vendedor recebe em dois dias.

## O que funcionou: a marcação do próprio fluxo (N0)

Das 58 vendas do balde C, **15 já estão marcadas em `contatos.id_venda`** — 9 pelo
Instagram, 10 pelo WhatsApp, 4 com mais de um lead reivindicando (precisa desempate).

Essa marcação vem do fluxo do n8n / do vendedor, **não do matcher**. Foi ela que eu tinha
tratado como ruído no diagnóstico inicial, por causa da duplicação. O problema dela é
duplicar, não estar errada — e ela alcança exatamente onde nenhum algoritmo alcança:
Instagram sem telefone.

**Ordem correta da cascata:**

```
N0  marcação do fluxo (contatos.id_venda), desduplicada  ← primeiro, é testemunho
N1  telefone idêntico
N2  nome idêntico
N3  nome >= 0,85
N4  nome 0,70-0,85
N5  nome fraco + trava de vendedor   (precisão 80% — marcar como "provável")
```

### N0 medido contra a verdade — é o melhor sinal que existe

Mesmo teste do N5: 48 vendas casadas por **telefone** (par certo), perguntando o que o N0
diria sem olhar o telefone.

| | N0 | N5 |
|---|---|---|
| dá palpite em | 44 de 48 | 10 de 43 |
| acerta | **43** | 8 |
| erra | **1** | 2 |
| **precisão** | **97,7%** | 80% |
| **recall** | **91,7%** | 23% |

9 dessas 48 tinham **mais de um lead reivindicando** e o desempate (ganha quem falou por
último) resolveu — 43 de 44 certos apesar da duplicata. ⚠️ **A duplicação nunca foi o
problema que eu diagnostiquei no começo.** Ela é ruído de apresentação, não de conteúdo;
o conteúdo é o melhor que temos.

⚠️ Um detalhe que quase custou o N0: o recorte `ultimaMensagem >= '2026-05-10'` que existia
em `leads_raw` (posto lá só para acelerar o trigrama) **corta leads antigos que carregam
`id_venda`**. O N0 roda sem recorte de data.

### Resultado final — 1 a 15 de agosto, cascata N0–N5

| | Cart | Urban | total |
|---|---|---|---|
| vendas | 168 | 53 | **221** |
| **casadas** | **109** | **26** | **135 (61,1%)** |
| não casadas | 59 | 27 | 86 |
| *antes do N0* | *82* | *21* | *101 (45,7%)* |

Ganho do N0: **+34 vendas**, de 45,7% para **61,1%**.

Na Urban o N0 chega a absorver todo o N1 — as vendas que o telefone acharia já estavam
marcadas pelo fluxo. Composição da Urban: N0 22, N5 4.

### Quanto disso é teto e quanto é falha

Dos 168 da Cart:

- **62 têm telefone que já apareceu no WhatsApp** alguma vez. O matcher pegou **51**
  — 82% do que era possível. Os 11 restantes caem fora da janela de 45 dias.
- **97 nunca apareceram no WhatsApp.** Ou vieram pelo Instagram (invisível, porque IG não
  tem telefone) ou é venda de loja pura, sem conversa nenhuma. **Com o dado de hoje não
  dá pra separar as duas coisas** — e é aí que moram quase todos os 88 não casados.
- 9 não têm telefone no painel.

Ou seja: **no WhatsApp já estamos perto do teto (82%). O buraco inteiro é Instagram**, e
lá o problema não é o algoritmo — é que não existe chave.

## O que ainda falta (e o que só parecia faltar)

**Falta de verdade — o telefone do lead de Instagram.** Não é problema de parsing, é de
coleta:

- `contatosInstagram.telefone` guarda **o @**, não o número. Na Cart, 3 leads de IG com
  telefone real em 1.678 de agosto. Na Urban, **1 em 9.749**.
- Dos 58 leads de IG que chegaram a **agendamento** em agosto, **zero** tem telefone.
- Não está nem na conversa: só **80 de 20.887 sessões** de IG têm 8 dígitos seguidos numa
  mensagem do cliente.
- Do lado da venda é pior ainda: `clientes.instagram` tem **3 preenchidos em 4.233**.

**Não falta, e eu não estava usando:**

- **`vendedorAtribuido` + `dataTransferencia`** → virou o N5 acima.
- **A conversa liga no lead sem erro**: `n8n_chat_histories_instagram.session_id` é
  `<@ do instagram>-cart`, e casa com `contatosInstagram.telefone` em **98,8%** dos leads
  de agosto.
- **`atribuicao_clique`** já traz o anúncio (`source_id`, `headline`, `ctwa_clid`) por
  lead — 4.146 leads de WhatsApp e 3.944 de IG na Cart.

**Parecia que ajudaria e não ajuda:**

- **O nome completo que a Maju passou a pedir em agosto não está em coluna nenhuma.** Ela
  pergunta (114 sessões de IG têm "nome completo" numa fala dela), mas a resposta fica só
  no texto da conversa — `contatosInstagram.nome` continua com o *display name* do IG
  (14,1 caracteres em média nos leads com agendamento, contra 13,0 nos demais: sem
  diferença prática). **Gravar essa resposta numa coluna é a mudança mais barata da
  lista** e transformaria o N5 em N2.
- **`agendamentos`** (tabela com `nome_cliente` + `telefone_cliente`) está **parada desde
  11/mai/2026** — 137 linhas, 0 em agosto, e só 17 com telefone. O agendamento novo caiu
  em `contatos*.agendamento` / `data_agendamento`, que não guardam nome nem telefone.
- **`n8n_chat_histories_*`**: 95% das mensagens (207.649 de 218.848) estão **sem
  `created_at`** — a coluna só passou a ser preenchida em 10/ago/2026. Não dá pra usar
  janela temporal sobre o histórico.
- **Modelo**: `iPhoneInteresse` vazio em 93% dos leads. Desempate quando existe, nunca
  chave.
- ⚠️ **`origem_cliente_id` do painel NÃO é canal de marketing** — só diz
  CART/URBAN/ATACADO.
- **Chatwoot não está no Supabase** — fica no Postgres do EasyPanel. O que veio pro
  Supabase foi o histórico de mensagens do n8n.

### As três mudanças de coleta, por custo/benefício

1. **Gravar em coluna o nome completo que a Maju já pede no agendamento.** Custo: um
   campo no fluxo n8n. Vira match N2 (nome idêntico) em vez de N5.
2. **Pedir o telefone no agendamento de Instagram.** Vira match N1 — chave definitiva.
3. **Preencher o @ do cliente na FoneNinja** (`clientes.instagram`). Casaria direto com o
   `session_id`. Depende do atendente, é o mais frágil dos três.

## O que o painel tem e o cruzamento não usa

| Dado | Cobertura | Pra que |
|---|---|---|
| `vendas.cliente_tel` | 97,5% | chave forte |
| `clientes.telefone` | 98,9% | idem, via `cliente_id` |
| `vendas.loja` | 100% | trava de loja |
| `vendas.data_saida` | 100% | janela lead→venda |
| `valor_total`, `lucro` | 100% | ROAS por anúncio, não contagem de lead |
| `venda_produtos.titulo` | 100% | desempate por modelo (quando o lead informou) |

## Onde o resultado ficou gravado (17/ago/2026)

**`public.venda_origem`** no painel — migration `cria_venda_origem`, RLS por `eh_socio()`.
Estrutura e regra de uso em `scripts/atribuicao/README.md`.

Carga de 1 a 15/ago: **221 vendas avaliadas, 121 confirmadas, 14 prováveis, 86 sem
origem.** Primeira leitura de negócio possível — só as **confirmadas**:

| origem | vendas | receita | lucro |
|---|---|---|---|
| Orgânico | 42 | R$ 180.175 | R$ 30.994 |
| Meta Ads | 27 | R$ 149.945 | R$ 23.683 |
| (lead sem origem gravada) | 26 | R$ 109.308 | R$ 18.662 |
| Instagram Orgânico | 22 | R$ 78.860 | R$ 16.814 |
| Google Ads | 4 | R$ 12.990 | R$ 2.936 |

⚠️ Isso é **piso, não total**: 86 vendas ficaram sem origem e a falta pesa mais no
Instagram. Serve pra comparar canais entre si, não pra afirmar quanto o Meta Ads deu.

⚠️ Os 26 "lead sem origem gravada" são leads reais cujo campo `origem` está vazio no
`contatos*` — buraco do lado do Dudu, não nosso.

### Próxima melhoria fácil: usar `vendedor_key` em vez de `vendedor_obs`

Outra sessão criou em 17/ago a tabela **`apelidos`** e as colunas
`vendas.vendedor_key`/`atendente_key`, preenchidas por trigger no banco — elas resolvem
apelido (`deni→denilson`, `viitnho→vitinho`). Medido em agosto: **198 de 221 vendas têm
`vendedor_key`**, contra 190 com `vendedor_obs`, e as duas divergem em 2 casos.

A trava do N5 hoje usa `vendedor_obs` cru. Trocar por `vendedor_key` deixa o N5 imune a
typo no nome do vendedor dentro da observação. Ver `CLAUDE.md` e
`docs/PLANO-UPGRADE-2026-08.md`.

## ⚠️ Para analisar CONVERSA, a direção é outra — e tem uma armadilha

O matcher responde *"de onde veio esta venda"*. Analisar conversa para melhorar
conversão pergunta o contrário: *"este lead virou venda?"* — e essa resposta **já existe
e é boa**: `contatos.comprou` + `id_venda`, os mesmos campos do N0, com **97,7% de
precisão** medida. Em agosto, `comprou` e `id_venda` estão **100% consistentes** entre si
(zero divergência nos 2.588 leads do período). Não é preciso cruzar nada para rotular
conversa: o rótulo está no lead.

**A armadilha é o tempo de maturação.** Lag entre o lead chegar e comprar (740 compras
com data medida, desde jun/2026):

| lag | compras | |
|---|---|---|
| mesmo dia | 91 | 12% |
| 1 a 3 dias | 105 | 14% |
| 4 a 7 dias | 47 | 6% |
| 8 a 30 dias | 81 | 11% |
| **31 a 90 dias** | **129** | **17%** |
| **mais de 90 dias** | **167** | **23%** |

**Mediana 8 dias, p75 84 dias, p90 138 dias. 40% compram depois de 30 dias.**

Consequência direta: os leads de 1–15/ago aparecem hoje com **1,9% de conversão** (50 de
2.588). Isso **não é a taxa de conversão** — é a foto de 15 dias de uma curva que leva
três meses. Marcar essas conversas como "não converteu" e treinar a Maju em cima disso
seria aprender o padrão errado, porque metade dos "perdidos" ainda vai comprar.

**Regra para a análise de conversa:**

1. **Coorte madura**: analisar leads com pelo menos ~90 dias de estrada. Hoje isso
   significa **maio e junho**, não agosto.
2. **Ou métrica de janela fixa**: "converteu em até 7 dias" é estável e comparável entre
   meses, ao custo de ignorar a cauda longa.
3. Nunca comparar coortes de maturidades diferentes na mesma tabela.

⚠️ E o limite do histórico de conversa: `n8n_chat_histories_instagram` só tem
`created_at` desde **10/ago** (95% das mensagens sem data). Coorte madura tem conversa,
mas **sem carimbo de tempo por mensagem** — dá para ler o conteúdo, não para medir tempo
de resposta.

## Próximo passo proposto

Rodar o cruzamento **no painel** (que já tem venda + produto + cliente + loja) e gravar
uma tabela `venda_origem`:

```
venda_origem(venda_id, loja, canal, campanha, lead_id, projeto, metodo, confianca, decidido_em)
```

Uma linha por venda, auditável, com `metodo` dizendo por que casou. Aí o painel mostra
**receita e lucro por canal**, não contagem de lead. Isso exige espelhar os leads no
painel (ou o Dudu expor uma view), e é decisão a combinar com ele.

⚠️ Antes de gravar qualquer coisa: `venda_origem` seria **tabela do painel**, então
escrita por `eh_socio()` como `custos`/`metas_mensais` (ver `docs/PERFIS-E-ACESSO.md`).
