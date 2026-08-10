# Atendimento no Chatwoot — o que o dado diz (10/ago/2026)

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
