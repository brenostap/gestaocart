# As IAs, os especialistas, e como conversa vira venda (26/ago/2026)

Mapa único do atendimento: quem é robô, quem é gente, qual chave liga uma coisa na outra, o
**inventário completo** de tudo que existe de dado, e o que já dá pra conectar ponta a ponta.

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

A IA atende do começo ao fim e **transfere pro especialista** (vendedor online):

| especialista | Cart | Urban |
|---|---|---|
| **David** | sim | sim |
| **Mel** | sim | sim |
| **Isa** | **só Cart** | — |
| **Maria** | só Cart (só WhatsApp) | — |

Pietra aparece na Cart como *Suporte*, não vendas.

### ⚠️ A correção que gerou este documento

A IA **se apresenta com o nome do especialista** no handoff:

> *"Me chamo David, vou dar continuidade no seu atendimento✨🩵"*

Isso **não é** persona alternativa da IA nem vendedora escrevendo. É a passagem de bastão. Eu li
como "a IA usa 4 nomes diferentes" e estava errado — as mensagens saem **sem remetente**,
exatamente como as da própria IA, e é fácil repetir o erro.

### ⚠️ E uma segunda correção, de 27/ago: depende do CANAL

Eu escrevi aqui (e `CHATWOOT-ANALISE.md` escreveu em 10/ago) que **nenhum humano escreve no
Chatwoot**. **Isso vale só no WhatsApp.**

| canal | onde o especialista atende | dá pra ver? |
|---|---|---|
| **WhatsApp** | **número pessoal dele** (`vendedores.telefone`) | ❌ invisível — não passa por Chatwoot nem n8n |
| **Instagram** | **o mesmo canal**, logo depois do handoff | ✅ **está no Chatwoot** |

No Instagram o Chatwoot **recebe** as mensagens dele — só não consegue **atribuir**: tudo que a loja
manda por lá chega como `external_echo: true` com `sender: null`, então a fala da Maju e a da Isa
são indistinguíveis. Foi isso que produziu o "zero mensagens de vendedora" de 10/ago.

Dá pra separar cruzando com o n8n (`scripts/separa-ia-vendedor.js`, e leia as três armadilhas no
topo do arquivo). Conv 39778: *"Prazer, meu nome é Isa!… Vamos la!… Nós temos essas duas opções
👆🩷"* — no Chatwoot, **ausente** do n8n. É gente.

📌 **Plano do dono:** conectar os números pessoais dos especialistas ao Chatwoot. Fecharia o buraco
que sobra — o do WhatsApp. **Os números já estão em `vendedores`** (Supabase da Cart).

---

## 2. A chave que liga tudo

O nome do especialista aparece em **três sistemas independentes**:

| onde | campo |
|---|---|
| **Painel** (`pfsfsibgmtbifypuyyqf`) | `vendas.vendedor_obs` |
| **n8n / Dudu** (`supabase-cart`, `supabase-urban`) | `contatos*.vendedorAtribuido` + `dataTransferencia` |
| **Chatwoot** (2 instâncias) | `conversations.meta.assignee` |

⚠️ **Ter o nome não é receber comissão**: `maju` e `duda` também aparecem como vendedor no painel
(7 e 0 vendas em ago) e não entram em `VO_KEYS`.

⚠️ **O `meta.assignee` do Chatwoot não é confiável na Urban** — ver §6.3. Para taxa de
transferência, a fonte boa é `contatos*.vendedorAtribuido`.

✅ **E ela é boa mesmo:** testado em 44 conversas de Instagram da Cart, `vendedorAtribuido` acertou
**4 de 4** dos handoffs conhecidos e **0 de 40** dos não-transferidos deram sinal de humano
(`PLANO-QUALIDADE-IA.md` §3-bis).

---

## 3. Inventário completo do que existe (26/ago/2026)

### 3.1 Supabase do Dudu — `supabase-cart` (`cmzptavlhdfklpfdcynf`)

| objeto | linhas | o que é | usado? |
|---|---|---|---|
| `n8n_chat_histories_instagram` | 220.769 | conversa da Maju no IG | sim |
| `n8n_chat_histories_maju_v2` | 158.951 | conversa da Maju no WhatsApp | sim |
| `n8n_chat_histories` | 61.615 | histórico antigo | — |
| **`site_eventos`** | **45.203** | **eventos do site** com `utm_*`, `fbclid`, `gclid`, `produto_id`, `valor` | ❌ **nunca usado** |
| `contatosInstagram` | 22.707 | lead de IG | sim |
| `contatosBreno` | 15.779 | lead de WhatsApp | sim |
| `atribuicao_clique` | 10.859 | anúncio de origem (`source_id`, `headline`, `ctwa_clid`) | pouco |
| `relatorioVendas` | 2.786 | espelho da venda com comissão | ❌ |
| `contatosFormulario` | 1.726 | lead de formulário, com dados de trade-in | ❌ |
| `match_resultado` | 1.389 | o matcher do Dudu | sim |
| `transfer_retentativas` | 392 | re-alerta do vendedor | ❌ novo |
| **`meta_spend_diario`** | **155** | **gasto Meta por dia e conta** (cart + urban) | ❌ **nunca usado** |
| **`google_spend_diario`** | **78** | **gasto Google por dia** | ❌ **nunca usado** |
| `agendamentos` | 133 | ⚠️ **morta desde 11/mai/2026** | — |
| **`transfer_falhas`** | **14** | **falha técnica na transferência** (`node_falho`, `motivo`) | ❌ |
| `n8n_chat_histories_cartinho` | 110 | outro bot | — |
| views | — | `dash_transfers`, `dash_vendas_ia`, `dash_leads_dia/hora`, `dash_modelos`, `leads_por_origem`, `v_google_ads_*` (4), `v_resumo_*`, `v_comissao_*`, `v_ranking_*` | ❌ quase nenhuma |

### 3.2 Supabase do Dudu — `supabase-urban` (`exhlzstyukhcnrravmoc`)

**Muito menos construído.** Não tem `site_eventos`, `meta_spend_diario`, `google_spend_diario`,
`contatosFormulario`, `relatorioVendas`, `agendamentos`, nem as views `v_*`.

| objeto | linhas | observação |
|---|---|---|
| `n8n_chat_histories_instagram` | 133.924 | |
| **`uso_tokens`** | **92.902** | **custo da IA por execução** (`modelo`, `prompt_tokens`, `output_tokens`, `agente`, `canal`). ❌ nunca usado, e **não existe na Cart** |
| `n8n_chat_histories_whats_v2` | 50.891 | |
| `contatosInstagram` | 10.320 | |
| `contatosWhatsApp` | 2.695 | ⚠️ nome diferente da Cart (`contatosBreno`) |
| `precos_referencia` · `custos_pecas` · `produtos_estoque` · `produtos_unidades` | 128/145/91/— | catálogo próprio da Duda |
| **`conversa_estado`** | **1** | ver abaixo ⭐ |
| `transfer_falhas` | **0** | nunca gravou nada |

### ⚠️ 3.2-bis Correções ao inventário acima (27/ago, segunda varredura)

Reli tudo com cuidado e **três leituras minhas estavam erradas**:

| eu disse | é na verdade |
|---|---|
| `uso_tokens` "só existe na Urban" | Mora no projeto da Urban mas **loga as duas IAs**: Maju/Cart **60.175 execuções · 2,1 bilhões de tokens**; Duda/Urban 32.854 · 1,2 bi. **O custo da Maju É medido.** |
| `transfer_falhas` = "falha técnica na transferência" | É o **guardrail do handoff** (`node_falho='guardrail_handoff'`), motivos `skip_limpo` (11) e `vazou_texto` (3). 14 eventos em 3 meses. **Não** mede transferência quebrada. |
| `conversa_estado` "construída e nunca ligada" | Correto, e pior: a única linha é de **22/abr/2026**, `fase_atual='qualificacao'`, session de **WhatsApp**, `loja='Cart'` — num projeto da Urban. Protótipo testado uma vez, parado há 4 meses. |

⭐ **E 99% do gasto de token é PROMPT.** Maju/WhatsApp: 689M de prompt contra 5,8M de saída (0,85%).
São ~38 mil tokens por execução — a conversa inteira reenviada a cada turno. Se o provedor tiver
prompt caching, é aí que mora a economia; se não tiver, é aí que mora a conta.

### 3.2-ter O que a varredura achou de novo

**⭐ `contatosFormulario` — a chave de telefone que "não existe".**
1.726 linhas, **100% com telefone real e 100% com dados de troca**. É o formulário de pré-avaliação
que a IA manda. De jun a ago são 504, e **327 (65%) não são lead de WhatsApp** — ou seja, gente que
chegou por outro canal e **deixou o telefone**.

⚠️ `docs/ATRIBUICAO-LEADS-VENDAS.md` afirma que *"o buraco inteiro é Instagram, e lá não existe
chave"* (3 leads de IG com telefone em 1.678). **Existe, em outra tabela.** Ganho medido cruzando
esses 327 com `vendas.cliente_tel`: **+4 vendas, R$ 24.590**, casamento **exato** (nível N1, a
certeza mais alta da cascata). Modesto no volume, mas é o único caminho de telefone para lead
não-WhatsApp — e ninguém tinha olhado.

**`site_eventos` — o site é uma landing de Google Ads, e ninguém mediu.**
19.179 visitantes desde 04/jun · 11.648 `view_content` · **7.337 `whatsapp_click` de 5.111 pessoas**.
E **17.607 dos 26.367 page_views (67%) carregam `gclid`** contra 641 com `fbclid`.
⚠️ O volume de `whatsapp_click` (~1.700/mês) é da mesma ordem do total de leads de WhatsApp da Cart
(~1.685/mês) — vale entender se o site é o caminho de quase todos eles antes de ler `origem` como
"plataforma de origem".

**🚨 `relatorioVendas` — existe um SEGUNDO cálculo de comissão e lucro fora do painel, e ele diverge.**

| julho/2026 · Cart | `relatorioVendas` | painel |
|---|---|---|
| vendas | 246 | 261 |
| lucro | R$ 170.345 | R$ 196.395 |
| comissão vendedor + atendente | R$ 6.425 + R$ 5.002 | (a folha calcula por outro caminho) |

13% de diferença no lucro. **Não investiguei a causa** — pode ser recorte (cancelada, acessório) e
não erro. Mas é exatamente a classe de problema que o `CLAUDE.md` marca como a mais cara: regra de
dinheiro em dois lugares **paga errado calado**. **Conferir antes de qualquer um dos dois virar
decisão.**

**`vendedores` (Cart) — tem o WhatsApp dos especialistas.** Uma linha por pessoa **por loja**:
David é o mesmo número nas duas; **Mel tem número diferente em cada loja**; Isa e Maria só Cart.
É o insumo pronto pro plano de conectar os números ao Chatwoot (§1).

**Vazias ou mortas:** `clientesBreno` (0), `agenda_envios` (0), `agendamentos` (parada desde
11/mai), `n8n_chat_histories` (67.423 linhas, **sem coluna de data**).

**`dash_leads_hora`** — o lead chega concentrado entre **10h e 16h**, pico às 12h. Serve pra escala
de plantão; não olhei mais fundo.

### ⭐ 3.3 `conversa_estado` — o instrumento certo, construído e vazio

Existe **só na Urban**, com **1 linha**, e o schema é exatamente o que responderia a pergunta que
você quer responder:

```
fase_atual · proposta_apresentada_em · agendamento_solicitado/data/confirmado
transferido_em · motivo_transferencia · lead_quente
objecoes_levantadas · mencionou_desconto · mencionou_concorrencia · urgencia
restricao_orcamento · finalidade_uso · desistiu_em
tentativas_reengajamento · ultimo_reengajamento_em · observacao_vendedor
+ o aparelho desejado e o de troca, campo a campo
```

**`motivo_transferencia`, `objecoes_levantadas` e `desistiu_em` são literalmente "por que não
transferiu".** A tabela foi desenhada, criada, e nunca ligada. **Ligar ela é o caminho mais curto
pro seu objetivo** — e é pedido pro Dudu, não trabalho nosso.

### 3.4 Chatwoot — é osso

| | Cart | Urban |
|---|---|---|
| labels | 2 (`lead-qualificado`, `suporte`) | **0** |
| times | 0 | 0 |
| regras de automação | 0 | 0 |
| respostas prontas | 0 | 0 |
| campanhas | 0 | 0 |
| agentes | 7 | 5 |

**Fora conversa + `assignee` + as 2 labels da Cart, não há nada no Chatwoot.** Não vale construir
análise em cima dele; o valor dele é ser a única fonte que vê **a conversa como o cliente viu**.

### 3.5 Nosso lado

- **Painel** (`pfsfsibgmtbifypuyyqf`): `vendas`, `venda_produtos`, `venda_trocas`, `pagamentos`,
  `contas`, `estoque`, `clientes`, `compras`, `custos`, `reparos`, `bancada`, `venda_origem`.
- **FoneNinja**: chega no painel pelo sync horário (`brenostap/phonecar-sync`).

---

## 4. ⚠️ Correção: o achado "o Instagram da Urban está quebrado" NÃO se sustenta

Ontem eu escrevi que a Urban transferia só **12,4%** das conversas de Instagram contra **32,5%** da
Cart, e que isso era problema de configuração da Urban. **Medi de novo pela fonte certa e está
errado.**

O 12,4% veio do `meta.assignee` do **Chatwoot**, contando *conversas com atividade em 14 dias* —
denominador que enche de conversa velha reativada, e que na Urban ainda sofre do bug do §6.3.
Contando **lead criado no mês** com `vendedorAtribuido`, que é a fonte que o próprio fluxo grava:

**Agosto/2026, leads criados no mês:**

| loja · canal | leads | transferidos | **%** |
|---|---|---|---|
| Cart · WhatsApp | 1.685 | 655 | **38,9%** |
| Urban · WhatsApp | 472 | 165 | **35,0%** |
| Cart · Instagram | 2.424 | 592 | **24,4%** |
| Urban · Instagram | 1.587 | 336 | **21,2%** |

**A Urban não é o problema.** As duas lojas transferem ~35–39% no WhatsApp e ~21–24% no Instagram.
O problema é **o Instagram, nas duas**, e ele é consistente demais para ser configuração de uma
loja — é do canal.

Fica registrado porque o erro foi meu e teria mandado trabalho pro lugar errado.

---

## 5. O funil inteiro, e onde o lead se perde

### 5.1 Cart, agosto/2026, por origem × canal

| origem | canal | leads | **transferidos** | **compraram** |
|---|---|---|---|---|
| Orgânico | WhatsApp | 190 | **54,7%** | **8,42%** |
| Instagram Orgânico | WhatsApp | 377 | **47,2%** | **5,57%** |
| Meta Ads | WhatsApp | 888 | 35,8% | 1,46% |
| Orgânico | Instagram | 1.282 | 27,3% | 0,86% |
| Google Ads | WhatsApp | 226 | 24,3% | 1,33% |
| **Meta Ads** | **Instagram** | **1.139** | **21,2%** | **0,44%** |

**Não é "Instagram converte mal" — é que o Instagram é onde o Meta Ads entrega.** As duas variáveis
andam juntas e a origem manda mais que o canal: *Instagram Orgânico* que chega no WhatsApp
converte **5,57%**, doze vezes o *Meta Ads* que chega no Instagram.

E a diferença **já aparece na transferência**, antes de qualquer humano tocar: a IA transfere 55%
do lead orgânico e 21% do lead de Meta Ads/IG. Ou ela está qualificando certo (o lead é pior
mesmo), ou o fluxo de IG trata pior — **é essa a pergunta a responder**, e §3.3 é o instrumento.

### 5.2 Depois de transferido — coorte madura de junho

| loja · canal | conversão de quem foi transferido |
|---|---|
| Cart · WhatsApp | **10,2%** |
| Urban · WhatsApp | **11,9%** |
| Urban · Instagram | 4,4% |
| Cart · Instagram | 2,4% |

✅ Os 10,2% batem com os **12,55%** medidos por caminho independente em `ANALISE-MAJU-AGO-2026.md`.

⚠️ **Parte do gap do Instagram é medição, não conversão.** Lead de IG **não tem telefone** (3 em
1.678 na Cart; 1 em 9.749 na Urban), então venda de origem IG é sistematicamente mais difícil de
detectar. Com o dado de hoje **não dá pra separar** as duas coisas.

### 5.3 O efeito composto

Ponta a ponta na Cart em agosto: **Orgânico/WhatsApp entrega uma venda a cada 12 leads. Meta
Ads/Instagram, uma a cada 228.**

---

## 6. ⭐ O que dá pra conectar HOJE, de agosto — e o resultado

**Dá, e a cadeia fecha inteira.** Testado em 26/ago:

```
meta_spend_diario ─┐
                   ├→ atribuicao_clique → contatos*(lead) → n8n_chat_histories(conversa)
google_spend_diario┘                            │
                                                ├→ vendedorAtribuido → especialista
                                                │
                                                └→ id_venda ──→ PAINEL: vendas
                                                                 ├ valor_total, lucro
                                                                 ├ venda_produtos (modelo)
                                                                 ├ venda_trocas (trade-in)
                                                                 └ pagamentos (conta, taxa)
```

**Os 67 `id_venda` de agosto do banco do Dudu resolvem 100% em `vendas.id` do painel.** Não há elo
faltando — é a mesma chave da FoneNinja.

### 6.1 O número que nunca tinha sido possível calcular

`meta_spend_diario` e `google_spend_diario` existem desde 09/jun e **nunca foram usados**. "Gasto de
mídia por canal" estava listado como *o que falta* em `ANALISE-MAJU-AGO-2026.md`. Não falta.

**Meta Ads · Cart · julho/2026** (coorte madura, 57 dias, vendas da Cart apenas):

| | |
|---|---|
| gasto | **R$ 21.672** |
| leads | 3.915 |
| custo por lead | R$ 5,54 |
| vendas atribuídas | 33 |
| CAC | R$ 657 |
| faturamento | R$ 96.920 |
| ROAS | 4,47× |
| **lucro bruto** | **R$ 19.822** |
| **lucro − gasto** | **− R$ 1.850** |

**Agosto** (imaturo): R$ 16.730 gastos, 2.027 leads, 16 vendas, R$ 60.190 de faturamento,
R$ 11.021 de lucro bruto. Urban: R$ 8.668 em ago, R$ 9.637 em jul. Google/Cart: R$ 1.611 e R$ 1.962.

### 6.2 ⚠️ Como NÃO ler esse número

Três correções obrigatórias, e elas puxam para lados opostos:

1. **A atribuição cobre ~70%, não 100%.** Vendas atribuídas ÷ vendas do painel: jun 70,4%
   (228/324), jul 68,6% (179/261), ago 70,8% (172/243). Descontando os ~7,5% de venda da Urban que
   vazam pra base da Cart, a cobertura real é **~65%**. Corrigindo, julho teria ~50 vendas de Meta
   Ads e ~R$ 30 mil de lucro bruto → **positivo**.
2. **`lucro` é margem bruta.** Falta **carrego**, **reparo** e **taxa de cartão** — R$ 250–600 por
   aparelho (`CONTEXT.md`). Em 50 aparelhos são R$ 12–30 mil → **volta pro vermelho**.
3. **Uma venda é reivindicada por vários leads.** Em ago/Cart são 245 linhas para **172 vendas
   distintas**, e **57 vendas são reivindicadas pelos dois canais**. Sempre
   `count(distinct id_venda)`.

**Conclusão honesta: o Meta Ads da Cart está em torno do empate, e não dá pra afirmar de que lado.**
O que mudou é que agora **existe a pergunta com dado dos dois lados** — antes não existia.

### 6.3 A divergência da Urban, que continua de pé

Mesma janela (12–26/ago), Urban · Instagram:

| | n8n (`dash_transfers`) | Chatwoot (`meta.assignee`) |
|---|---|---|
| Mel | 94 | **2** |
| David | 93 | **118** |

Na **Cart os dois concordam** (IG: 103/103/102 no n8n; 171/161/157 no Chatwoot — mesmas
proporções). É coisa da Urban.

⚠️ Importa porque `vendedorAtribuido` é a **trava do N5** da cascata de atribuição, que sustenta
**13 das 21 vendas casadas da Urban**. **Perguntar pro Dudu antes de usar atribuição da Urban pra
decidir dinheiro.**

**✅ Medido em 27/ago — o culpado é o Chatwoot, não o n8n.** Separando IA de humano nas 2.677
conversas de Instagram (`PLANO-QUALIDADE-IA.md` §3-ter):

| recall do `meta.assignee` | Cart | Urban |
|---|---|---|
| conversas com humano (estimado) | 487 | 302 |
| que o `assignee` marca | 430 | 130 |
| **recall** | **88%** | **43%** |

**Na Urban o Chatwoot deixa de atribuir 57% dos atendimentos humanos.** O `vendedorAtribuido` do
n8n, esse, bate (21,2% de transferência contra 26,1% de humano medido — ordens compatíveis).
**Conclusão: use o n8n; o `meta.assignee` da Urban não serve.**

### 6.4 O que ainda NÃO conecta

| buraco | tamanho |
|---|---|
| **Telefone do lead de Instagram** | 3 em 1.678 (Cart), 1 em 9.749 (Urban). É a causa raiz dos ~30% não atribuídos |
| **A conversa do especialista** | 100% invisível — vai pro WhatsApp pessoal dele |
| **Motivo de não-transferência** | `conversa_estado` responderia; tem 1 linha (§3.3) |
| `n8n_chat_histories_*` sem `created_at` | 95% das mensagens; a coluna só começou em 10/ago/2026 |
| `agendamentos` | morta desde 11/mai/2026 |
| **Custo da IA na Cart** | `uso_tokens` só existe na Urban |
| `transfer_falhas` | 14 linhas na Cart, **0** na Urban — instrumento certo, praticamente desligado |

---

## 7. O caminho pro objetivo (por que o lead não é transferido)

Em ordem de custo:

1. **Pedir pro Dudu ligar `conversa_estado`** — `motivo_transferencia`, `objecoes_levantadas`,
   `desistiu_em`. Existe, está vazia, e responde a pergunta direto. **Fazer isso antes de qualquer
   análise nova.**
2. **Comparar o fluxo/prompt de handoff do Instagram com o do WhatsApp** (nas duas lojas — o gap é
   do canal, não da loja). 21–24% contra 35–39%, e a arquitetura é a mesma.
3. **Ler conversa de IG não-transferida na mão** — `n8n_chat_histories_instagram`, filtrando lead
   com `vendedorAtribuido IS NULL` e preço citado. É o que `preco-sem-handoff.js` já faz pro
   WhatsApp; falta a versão de IG.
4. **Ligar `transfer_falhas` na Urban** (hoje 0 linhas) — separa "a IA decidiu não transferir" de
   "a transferência quebrou".
5. Continua valendo de `ANALISE-MAJU-AGO-2026.md`: **a alavanca é a IA perguntar o dia**, parada em
   16–25% por onze semanas.

---

## 8. Como reproduzir

```sql
-- taxa de transferência por origem x canal (rodar nos DOIS projetos do Dudu;
-- na Urban, contatosBreno chama-se contatosWhatsApp)
with l as (
  select 'instagram' canal, origem, "vendedorAtribuido" v, comprou, id_venda
  from "contatosInstagram" where created_at >= '2026-08-01' and created_at < '2026-09-01'
  union all
  select 'whatsapp', origem, "vendedorAtribuido", comprou, id_venda
  from "contatosBreno"    where created_at >= '2026-08-01' and created_at < '2026-09-01'
)
select origem, canal, count(*) leads,
       round(100.0*count(*) filter (where v is not null)/count(*),1) pct_transf,
       round(100.0*count(*) filter (where comprou)/count(*),2) pct_venda,
       string_agg(distinct id_venda::text,',') filter (where comprou) ids
from l group by 1,2 order by 3 desc;

-- gasto de mídia
select conta, sum(spend) from meta_spend_diario where data >= '2026-08-01' group by 1;
```

Os `ids` vão direto em `vendas.id` do painel (`pfsfsibgmtbifypuyyqf`) para faturamento e lucro.

⚠️ Leads com `origem IS NULL` e `comprou = true` em 100% são **backfill**, não lead do mês.
Excluir sempre.

⚠️ Para contar venda, **sempre** `count(distinct id_venda)`.
