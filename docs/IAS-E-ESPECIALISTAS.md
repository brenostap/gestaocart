# As IAs, os especialistas, e como conversa vira venda (26/ago/2026)

Mapa único do atendimento: quem é robô, quem é gente, qual chave liga uma coisa na outra, e o que
cada relatório que já existe mede. Escrito no dia em que o dono corrigiu uma leitura errada minha —
e a correção destravou a ligação que faltava.

Junta e substitui a parte de "quem é quem" de `docs/CHATWOOT-ANALISE.md`,
`docs/ANALISE-MAJU-AGO-2026.md` e `docs/ATRIBUICAO-LEADS-VENDAS.md`, que continuam valendo para o
resto.

---

## 1. Quem é quem

**Uma IA por loja, atendendo os dois canais.**

| | IA | canais |
|---|---|---|
| **Cart** | **Maju** | WhatsApp + Instagram |
| **Urban** | **Duda** | WhatsApp + Instagram |

A IA atende do começo ao fim e **transfere pro especialista** (vendedor online). Os especialistas:

| especialista | Cart | Urban | onde recebe (medido 12–26/ago) |
|---|---|---|---|
| **David** | sim | sim | IG e WA na Cart · **quase só IG** na Urban |
| **Mel** | sim | sim | quase só IG na Cart · **quase só WA** na Urban |
| **Isa** | **só Cart** | — | IG e WA |
| **Maria** | só Cart | — | **só WA** |

Pietra aparece na Cart como *Suporte*, não como vendas (17 conversas em 14 dias).

### ⚠️ A correção que gerou este documento

A IA **se apresenta com o nome do especialista** no momento do handoff:

> *"Me chamo David, vou dar continuidade no seu atendimento✨🩵"*
> *"Prazer, eu sou a Isa, especialista Apple da Phone Cart e a partir de agora, vou cuidar do seu
> atendimento hoje!"*

Isso **não é** persona alternativa da IA nem vendedora escrevendo no Chatwoot. É a passagem de
bastão. Eu li como "a IA usa 4 nomes diferentes" e estava errado — fica registrado porque o erro é
fácil de repetir: as mensagens saem **sem remetente**, exatamente como as da própria IA.

O que continua verdade de `CHATWOOT-ANALISE.md`: **nenhum humano escreve no Chatwoot**. Depois do
handoff o especialista conversa pelo **WhatsApp pessoal dele** e o Chatwoot fica cego. Todo
relatório "por agente" do Chatwoot mede a IA, não a pessoa.

📌 **Plano do dono:** conectar os números pessoais dos especialistas ao Chatwoot, pra ter também
essa metade. Sem data. É a mudança que mais aumentaria o que dá pra medir aqui.

---

## 2. A chave que liga tudo: o nome do especialista

O mesmo nome (`david`, `mel`, `isa`, `maria`) aparece em **três sistemas independentes**, e é isso
que costura conversa → lead → venda:

| onde | campo | o que significa |
|---|---|---|
| **Painel** (Supabase `pfsfsibgmtbifypuyyqf`) | `vendas.vendedor_obs` | quem fechou a venda |
| **n8n / Dudu** (`supabase-cart`, `supabase-urban`) | `contatos*.vendedorAtribuido` + `dataTransferencia` | pra quem a IA transferiu, e quando |
| **Chatwoot** (as duas instâncias) | `conversations.meta.assignee` | quem ficou como responsável da conversa |

⚠️ **`vendedor_obs` continua vindo da observação da venda** — ver `CLAUDE.md`. E ⚠️ **ter o nome não
é receber comissão**: `maju` e `duda` também aparecem como vendedor (7 e 0 vendas em ago), e não
entram em `VO_KEYS`.

### O Chatwoot dá isso de graça

`meta.assignee` vem **na listagem** de conversas — 1 requisição por 25 conversas, sem precisar
buscar mensagem. É a forma barata de medir handoff por especialista e por canal, e **funciona na
Urban**, que é onde o dado do n8n é mais fraco.

---

## 3. Os relatórios que já existem

### Nossos (neste repo)

| o quê | onde | mede |
|---|---|---|
| Funil do Chatwoot | `scripts/chatwoot.js funil` + `docs/CHATWOOT-ANALISE.md` | etapas, preço, demanda por modelo |
| Preço sem handoff | `scripts/preco-sem-handoff.js` | o balde dos 71% |
| Comportamento da Maju | `scripts/maju/*.sql` + `docs/ANALISE-MAJU-AGO-2026.md` | pergunta o dia, baldes de morte, coorte madura |
| Atribuição lead→venda | `scripts/atribuicao/` + `docs/ATRIBUICAO-LEADS-VENDAS.md` | cascata N0–N5 |
| Agente de análise | `.claude/agents/analista-conversas.md` | — |

### ⭐ Os do Dudu, que nós não sabíamos que existiam

Views e tabelas nos dois projetos do Dudu, **mesmo schema nos dois**, com histórico desde
**27/fev/2026**. Nenhuma estava documentada aqui:

| objeto | tipo | o que é |
|---|---|---|
| **`dash_transfers`** | view | `dia · vendedor · canal · transfers` — transferências por especialista/dia/canal |
| **`dash_vendas_ia`** | view | `dia · canal · id_venda · telefone · vendedor · dia_transf` — venda atribuída ao lead |
| `transfer_retentativas` | tabela | re-alerta do especialista quando o lead volta a falar |
| `relatorioVendas` | tabela | espelho da venda com comissão calculada |
| `v_comissao_por_vendedor`, `v_resumo_mensal`, `v_resumo_diario` | views | agregados |
| `agenda_envios` | tabela | envio da agenda pros vendedores |

⚠️ **`dash_vendas_ia` é a marcação do fluxo (o **N0** do doc de atribuição)** — `contatos*.comprou`
+ `data_compra`. É o **melhor sinal que temos**: medido contra verdade conhecida deu **97,7% de
precisão e 91,7% de recall**, muito acima de qualquer match por nome. **Use ela, não reimplemente
matcher.**

⚠️ **Uma linha por lead, não por venda.** Em ago/Cart são 245 linhas para **172 vendas distintas**,
e **57 vendas são reivindicadas pelos dois canais ao mesmo tempo**. Sempre `count(distinct
id_venda)`; somar linha por canal conta a mesma venda duas vezes.

---

## 4. O que o dado diz — o funil inteiro, por canal

### Etapa 1: a IA transfere? (Chatwoot, 12–26/ago, conversas com atividade)

| | conversas | **com handoff** |
|---|---|---|
| Cart · WhatsApp | 963 | **39,9%** |
| Cart · Instagram | 1.519 | **32,5%** |
| Urban · WhatsApp | 302 | **33,8%** |
| **Urban · Instagram** | **1.003** | **12,4%** |

### Etapa 2: o transferido compra? (n8n, coorte por dia da transferência)

| loja · canal | jun (madura) | jul | ago (imatura) |
|---|---|---|---|
| **Cart · WhatsApp** | **10,2%** | 10,9% | 7,8% |
| Cart · Instagram | 2,4% | 2,5% | 3,3% |
| **Urban · WhatsApp** | **11,9%** | 5,6% | 7,2% |
| Urban · Instagram | 4,4% | 3,3% | 3,1% |

⚠️ Agosto está **imaturo** — a mediana de atraso lead→compra é 8 dias, p75 de 84. Compare junho com
junho.

✅ **Os 10,2% do WhatsApp/Cart batem com os 12,55% medidos por caminho totalmente independente** em
`ANALISE-MAJU-AGO-2026.md` (`n8n_chat_histories_maju_v2`, coorte orgânica). Duas medições
concordando — esse número é sólido.

---

## 5. Os três achados

### ⭐ 5.1 — A Urban perde o Instagram antes de qualquer coisa acontecer

**1.003 conversas de Instagram em 14 dias e 88% nunca chegam a um especialista.** Instagram é
**77% de todo o volume da Urban** e tem **um terço** da taxa de handoff do WhatsApp dela (12,4%
contra 33,8%).

Não é o problema da Cart: lá o Instagram entrega 32,5%, quase o mesmo que o WhatsApp. **Mesma
arquitetura, mesma empresa, mesmo mês** — é diferença de configuração, não de público.

Ordem de grandeza, com a taxa de conversão do próprio IG da Urban (4,4% na coorte madura): levar o
IG da Urban de 12,4% para os 32,5% da Cart seriam ~200 handoffs a mais por 14 dias ≈ **~9 vendas/mês**.
⚠️ Contrafactual, não medido — assume que o lead não transferido se comportaria como o transferido,
e ele é justamente o menos qualificado.

### 5.2 — O Instagram converte 3–4× pior que o WhatsApp, nas duas lojas

Na coorte madura de junho: Cart 10,2% × 2,4%; Urban 11,9% × 4,4%. **Replicou nas duas lojas de
forma independente**, o que torna difícil ser artefato de uma configuração só.

E o Instagram **não é minoria**: recebe ~50% das transferências da Cart e 77% do volume da Urban.

⚠️ **A ressalva é grande e tem que andar junto do número.** `docs/ATRIBUICAO-LEADS-VENDAS.md` mostra
que o lead de Instagram **não tem telefone** (3 em 1.678 na Cart; 1 em 9.749 na Urban) e o
`clientes.instagram` do painel tem 3 preenchidos em 4.233. Ou seja: **venda de origem Instagram é
sistematicamente mais difícil de detectar.** Parte do buraco é conversão pior, parte é medição pior,
e **com o dado de hoje não dá pra separar as duas.**

Dois argumentos de que não é *só* medição: (a) a marcação do fluxo (N0) não depende de telefone — é
o vendedor/n8n marcando, e alcança IG; (b) a duplicação entre canais, quando existe, joga **a
favor** do Instagram (57 vendas de agosto são reivindicadas pelos dois), então o gap medido é se
alguma coisa *subestimado*.

### 5.3 — Na Urban, o Chatwoot e o n8n discordam sobre quem recebeu o lead do Instagram

Mesma janela (12–26/ago), mesmo canal:

| Urban · Instagram | n8n (`dash_transfers`) | Chatwoot (`meta.assignee`) |
|---|---|---|
| Mel | 94 | **2** |
| David | 93 | **118** |

O n8n diz rodízio 50/50; o Chatwoot diz que o David ficou com **98%**. **Na Cart os dois
concordam** (IG: David 103 / Mel 103 / Isa 102 no n8n, 171 / 157 / 161 no Chatwoot — mesmas
proporções), então não é diferença de método, é coisa da Urban.

⚠️ **Isso não é detalhe cosmético.** `vendedorAtribuido` é a **trava de vendedor do N5** da cascata
de atribuição — e o N5 sustenta **13 das 21 vendas casadas da Urban**. Se o campo está apontando
pra pessoa errada no IG da Urban, esses matches estão errados. **Pergunta pro Dudu antes de usar
atribuição da Urban pra decidir dinheiro.**

### Bônus — a máquina de re-alerta não roda no Instagram

`transfer_retentativas`, agosto/Cart: **351 eventos no WhatsApp e 29 no Instagram** (1 alerta
efetivo no IG no mês inteiro). E dos eventos, **67% são suprimidos** (168 cooldown, 36 sem motivo,
30 cap) contra 117 alertados.

O mecanismo é novo (não existia nas análises anteriores) e é uma resposta direta ao balde
"preço dado e ninguém avisado". Só que ele nasceu **só no canal que já era o melhor**.

---

## 6. O quadro que junta tudo

```
             Cart                              Urban
             ────                              ─────
conversa   WA 963 ─── 39,9% ──┐          WA 302 ─── 33,8% ──┐
(14 dias)  IG 1519 ── 32,5% ──┤          IG 1003 ── 12,4% ──┤   ← 5.1: o buraco
                              │                             │
handoff ──────────────────────┤                             │
(nome do especialista =       │                             │
 a chave dos 3 sistemas)      │                             │
                              ▼                             ▼
venda           WA 10,2% · IG 2,4%             WA 11,9% · IG 4,4%
(coorte jun)                    ↑                             ↑
                                └─── 5.2: 3–4× de diferença ──┘
```

O que já se sabia e continua valendo: **ser transferido multiplica a conversão por 8,7×**
(`ANALISE-MAJU-AGO-2026.md`) e **a alavanca de comportamento da IA é ela perguntar o dia** — parada
em 16–25% por onze semanas.

Este documento acrescenta que **a mesma alavanca tem tamanhos muito diferentes por canal e por
loja**, e que o pior lugar do sistema inteiro é o **Instagram da Urban**, que ninguém tinha olhado
separado porque as análises anteriores foram quase todas de WhatsApp/Cart.

---

## 7. O que falta

1. **Perguntar pro Dudu a divergência 5.3** — quem realmente recebe o lead de IG na Urban.
2. **Comparar o prompt/fluxo de handoff da Duda no Instagram com o da Maju.** A diferença de 12,4%
   contra 32,5% tem que estar em configuração — é a coisa mais barata de consertar da lista.
3. **Levar o `transfer_retentativas` pro Instagram** (hoje é 1 alerta/mês lá).
4. **Conectar o WhatsApp pessoal dos especialistas ao Chatwoot** (plano do dono) — é o que abre a
   segunda metade do funil, hoje invisível.
5. Continua da lista antiga: o prompt atual das IAs, quem grava `agendamento`, gasto de mídia por
   canal, e A/B por hash de telefone.

## 8. Como reproduzir

```bash
# handoff por especialista e canal (Chatwoot, barato — assignee vem na listagem)
#   GET /api/v1/accounts/1/conversations?status=all&assignee_type=all&page=N  → meta.assignee.name
#   tokens: ver docs/agents/ e o allowlist do projeto. SÓ GET.
```

```sql
-- funil transferência → venda, por canal e especialista (rodar nos DOIS projetos do Dudu)
with t as (select to_char(dia,'YYYY-MM') mes, lower(vendedor) v, canal, sum(transfers) tr
           from dash_transfers where dia >= '2026-06-01' group by 1,2,3),
     s as (select to_char(dia_transf,'YYYY-MM') mes, lower(vendedor) v, canal, count(*) vd
           from dash_vendas_ia where dia_transf >= '2026-06-01' group by 1,2,3)
select coalesce(t.mes,s.mes) mes, coalesce(t.v,s.v) vendedor, coalesce(t.canal,s.canal) canal,
       t.tr transferencias, coalesce(s.vd,0) vendas,
       round(100.0*coalesce(s.vd,0)/nullif(t.tr,0),2) conv_pct
from t full join s on t.mes=s.mes and t.v=s.v and t.canal=s.canal
order by mes desc, transferencias desc;
```

⚠️ Para contar venda, **sempre** `count(distinct id_venda)` — `dash_vendas_ia` tem uma linha por
lead, e 33% das vendas de agosto são reivindicadas por mais de um.
