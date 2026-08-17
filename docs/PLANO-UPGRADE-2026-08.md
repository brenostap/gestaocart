# Plano de upgrade do Cart System — ago/2026

> **O objetivo:** todo colaborador entrar no painel e ver **o que é dele** — meta, comissão,
> estoque pra vender — de um jeito **seguro** (o banco recusa, não só a tela esconde), **leve**
> (celular pessoal, franquia de dados) e que **mude comportamento**, não só informe.
>
> Escrito depois de ler `DESIGN-BRIEF.md`, `DESIGN-SYSTEM.md`, `PERFIS-E-ACESSO.md`, `CONTEXT.md`,
> o `index.html`, `shell.js`, `ui.js`, `config.js`, `data.js`, `render.js`, `equipe.js`, `core.js` e
> de medir a atribuição das vendas direto no Postgres.

---

## 1. O que foi decidido nesta rodada

| Pergunta | Decisão |
|---|---|
| Quem entra | **Sócios** (Gustavo, Marcella) + **vendedores online** (David, Isa, Mel) + **atendentes** (Anne, Davi, Leo, Gabi). Gerente adiado — não há gerente ativo |
| Dinheiro do colaborador | **Valor da venda + comissão própria.** Custo, lucro e margem seguem só do sócio |
| Quais linhas ele vê | **Só as próprias vendas** — e isso vira **RLS de verdade**, não cortina |
| Ranking | **Só posição**, sem R$ do colega |
| Alavancas | Meta/comissão ao vivo · aparelho fora da loja · attach rate de acessórios |
| Formato | **Fases publicáveis**, uma por vez |
| iPad | **Fica no balcão, o time usa** — é tela de operação, não desktop apertado |
| `phonecar-sync` | Pode mexer |

---

## 2. Diagnóstico — os sete achados que mandam no plano

### 2.1 ✅ A atribuição da venda **já existe no banco** — o gargalo é menor do que parecia

O `CLAUDE.md` diz que loja, vendedor e atendente são parseados da observação. São — **mas o sync
já grava o resultado em coluna**. Medido agora:

| Mês | Vendas | `vendedor_obs` | `atendente_obs` | `vendedor_nome` | `origem_cliente_id` |
|---|---:|---:|---:|---:|---:|
| jun/2026 | 433 | 94,7% | 96,3% | 20,1% | 20,1% |
| jul/2026 | 345 | 97,7% | 99,1% | 100% | 100% |
| ago/2026 | 224 | 92,4% | 96,9% | 100% | 100% |

E os valores já vêm como **apelido minúsculo** — `mel`, `david`, `isa`, `anne`, `leo`, `gabi`,
`davi`, `vitinho` — que são exatamente as chaves do `FUNC` em `config.js`.

**Consequência prática:** `using (vendedor_obs = minha_chave() or atendente_obs = minha_chave())` é
uma policy de uma linha. O "só as minhas vendas" **não exige reescrever a atribuição** — exige
*normalizar* e *indexar*. Isso derruba a fase mais cara do plano de semanas para dias.

⚠️ **A sujeira que sobra é a parte que importa.** Em julho apareceram `cart` (7), `urban` (5),
`loja` (2), `online`, `pessoal`, `maju` (18) e o typo `ane` no campo de atendente. Isso é
**~5% das vendas que não pertencem a ninguém** — e venda sem dono é comissão que some **em
silêncio**. O painel do sócio precisa de um contador *"N vendas sem atribuição neste mês"*, senão
o buraco só aparece quando alguém reclamar do pagamento.

### 2.2 ⛔ A comissão **não pode ser calculada** só com as vendas da pessoa

Achado mais importante do diagnóstico, e o que quebraria a implementação no meio.

`fechamentoEquipe()` (equipe.js) depende de três números **da rede inteira**:

- `m.unPrincipal` — total de aparelhos do mês → decide a faixa da **meta coletiva** (400/450/500)
- `m.vendaAcess` — bruto de acessórios da rede → decide a outra faixa coletiva
- `m.lAcess` — lucro de acessórios da rede → é a base dos 5% da Anne

Ou seja: **a comissão do David depende de quanto a loja inteira vendeu.** Se o celular dele só
carrega as vendas dele, o número sai errado — e errado pra menos, que é o pior tipo de erro num
painel de comissão.

Três saídas, e a escolha muda a arquitetura:

| | Como | Custo | Risco |
|---|---|---|---|
| **A. Snapshot no servidor** ✅ recomendado | Edge Function roda **o mesmo `equipe.js`/`fechamento.js`** com `service_role` e grava `folha_mensal(mes, chave, comissão, bônus, meta…)`. O colaborador lê **só a linha dele** | médio | baixo — é a mesma técnica que o `test/fechamento.test.js` já usa (carrega os `js/` reais com stubs) |
| B. Agregados da rede | Uma view devolve só os três totais, sem nome, e o cálculo continua no navegador dele | baixo | expõe o lucro de acessórios da rede a quem não vê lucro |
| C. Recalcular em SQL | Reescrever a folha em Postgres | alto | **dois donos do mesmo número** — viola a regra do repo de fonte única |

A opção A tem um segundo benefício que vale sozinho: **fechamento pago para de mudar de valor.**
Hoje o painel recalcula o passado com as regras de hoje, e o repo inteiro é remendado com "nunca
retroativa" (`metasColetivas`, `metaAtFaixas`, `BONUS_COL_EXCLUI_DESDE`). Um snapshot por mês torna
essa regra estrutural em vez de disciplinar.

### 2.3 O boot é pesado demais pra um celular de colaborador

`loadFromSupabase()` puxa **6 meses de vendas**, depois todos os `venda_produtos` e todos os
`pagamentos` em lotes de 100 — para ~1.800 vendas são **40+ requisições** antes do primeiro número
aparecer, mais `contas`, `venda_trocas`, `estoque` e o estoque "fresco" da FoneNinja.

Pro dono, tudo bem — ele quer a base inteira. Pro David, que quer saber quanto ganhou hoje, é a
franquia de dados dele pagando por uma tela que ele nem pode ver.

O precedente certo já existe: `loadBancadaData()`. Generalizar isso — **cada papel declara a carga
dele** — é a mudança de maior impacto em "leve", e não depende de design nenhum.

### 2.4 Esconder número não desenha tela

Se um vendedor entrar hoje, ele cai no `renderDash()` — o dashboard do sócio, com `money()`
devolvendo `—` em cada KPI. **Uma tela cheia de travessão é pior que uma tela que não existe**: ela
comunica "tem coisa aqui que você não pode ver", que é exatamente a sensação que a gente não quer.

Regra que passa a valer: **papel novo pede home nova.** A cortina (`money()`) serve pra proteger
esquecimento, não pra montar tela.

### 2.5 O design system é lei no papel e exceção no código

`js/ui.js` tem 12 componentes bons, e `docs/DESIGN-SYSTEM.md` proíbe HTML na mão. Mas as telas
grandes (`render.js` 1.334 linhas, `equipe.js` 1.269, `custos.js` 805) ainda escrevem coisas como
`style="background:rgba(255,212,10,.06);border:1px solid rgba(255,212,10,.25);border-radius:12px…"`
no meio do dashboard — cor literal, raio literal, dentro da tela.

Isso não é cosmético: é o motivo de qualquer ajuste visual global custar busca-e-substitui. O kit
precisa dos componentes que faltam (faixa de alerta, tabs, busca, timeline, meta, skeleton) e as
telas precisam de uma varredura.

### 2.6 O painel não tem endereço

`currentTab` vive em memória. Consequências no dia a dia: não dá pra mandar *"olha essa venda"* pra
alguém, o gesto de voltar do iPhone sai do app inteiro, e recarregar sempre cai no Dashboard. Um
roteamento por hash (`#/vendas/1234`) é barato e é metade da sensação de "app de verdade".

### 2.7 O iPad de balcão não existe em nenhum breakpoint

Hoje há dois cortes: 900px (sidebar → bottom tabs) e 720px (tabela → cartão). O iPad em retrato
(768px) cai no mundo do celular; em paisagem (1024px) pega a sidebar densa com alvos de mouse.

**Nenhum dos dois é o balcão**, que tem largura de desktop e dedo de celular. Largura de tela é a
pergunta errada — a certa é `pointer: coarse`.

---

## 3. Arquitetura alvo

Quatro camadas, de baixo pra cima. A regra é que **cada uma resolve o que a de cima não consegue.**

```
┌─ BANCO ─────────────────────────────────────────────────────────────┐
│ perfis.func_key ── RLS por papel ── views sem custo ── folha_mensal │  ← a fechadura
├─ CARGA ─────────────────────────────────────────────────────────────┤
│ loadPorPapel(): cada papel declara o que precisa (já há precedente) │  ← o "leve"
├─ SHELL ─────────────────────────────────────────────────────────────┤
│ nav por papel · contexto · rota no hash · modo denso/toque/bolso    │  ← o "onde estou"
├─ TELAS ─────────────────────────────────────────────────────────────┤
│ uma home por papel, montada só com UI.* e tokens                    │  ← o "o que faço"
└─────────────────────────────────────────────────────────────────────┘
```

### 3.1 Banco — o que precisa nascer

1. **`perfis.func_key text`** — a chave do `FUNC` (`'mel'`, `'anne'`). O `funcionario_id` que já
   existe aponta pra tabela `funcionarios` da FoneNinja, que **não tem os vendedores online** — não
   serve pra isso.
2. **Normalização do apelido no sync** (`phonecar-sync`): mapa único de sinônimos
   (`deni→denilson`, `ane→anne`) gravado em colunas novas `vendedor_key` / `atendente_key`, com
   `null` quando não casar com pessoa nenhuma. ⚠️ **O mapa vive em um lugar só** — o repo já pagou
   caro por lista de gente duplicada (jul/2026, R$ 1.000 a menos na folha).
3. **`CHECK` de `perfis` aceitando `vendedor` e `atendente`** — hoje ele recusa, de propósito,
   porque papel sem RLS é tela aberta lendo zero linha. Muda **junto** com as policies.
4. **Policies** em `vendas`, `venda_produtos`, `pagamentos`, `venda_trocas`:
   `own_row` = a chave bate. Índice em `vendas(vendedor_key)` e `vendas(atendente_key)` —
   sem ele, cada leitura do filho vira varredura.
5. **Views sem coluna de custo** — `v_estoque_vitrine`, `v_minhas_vendas`. Isto fecha o item que o
   `PERFIS-E-ACESSO.md` deixou explicitamente aberto: *RLS é por linha, não por coluna*, então hoje
   o papel `bancada` alcança `estoque.valor_estoque` pela API mesmo com a tela escondendo.
   **Papel sem margem lê view, nunca tabela.**
6. **`folha_mensal`** — o snapshot da §2.2, RLS "só a sua linha", sócio vê tudo.
7. **`funcionarios_config`**: policy de leitura própria (`func_key = minha_chave()`), pra pessoa
   ver o próprio PIX/contato sem enxergar o do colega.

⚠️ **Conferir escrita com `row_count`, não com "deu erro?"** — RLS devolve zero linha em silêncio
em UPDATE/DELETE sem policy. O `PERFIS-E-ACESSO.md` já documenta a armadilha; o roteiro de
conferência de cada papel novo repete o mesmo método.

⚠️ **O "Ver como" passa a mentir.** Com RLS real, o dono em prévia de vendedor vê o **menu** do
vendedor mas continua lendo **todas as linhas** (ele é sócio no banco). A faixa de prévia precisa
dizer isso — *"a prévia mostra as telas, não os dados"* — senão a conferência dá falso positivo.

### 3.2 Carga — `loadPorPapel()`

| Papel | Carrega |
|---|---|
| `socio` | o que carrega hoje |
| `bancada` | `estoque` + `bancada` (já é assim) |
| `vendedor` / `atendente` | **mês corrente**, só as próprias vendas (a RLS já filtra), + `v_estoque_vitrine` + a linha dele em `folha_mensal` |

Alvo: **uma tela útil em menos de 2 s no 4G**, e o boot do colaborador em ~1 requisição em vez de 40.

---

## 4. As páginas — o que cada uma oferece, por papel

### 4.1 Vendedor online (David, Isa, Mel) — vive no celular

| Tela | O que entrega | Por que existe |
|---|---|---|
| **Meu dia** (home) | Uma métrica-herói: **comissão do mês**. Abaixo: aparelhos vendidos, quanto falta pra faixa de 80 un, meta coletiva da rede (barra, sem R$ alheio) | A faixa de 80 unidades é um degrau — saber que faltam 6 aparelhos pra R$ 35/un muda a semana |
| **Vitrine** | Busca de aparelho pra responder cliente **na hora**: modelo, cor, capacidade, bateria, **preço de venda**, selo *na assistência*, selo *saldão*. Sem custo, sem fornecedor | É literalmente o trabalho. Hoje ele pergunta no grupo |
| **Minhas vendas** | Lista + detalhe (pagamento, troca, acessório), sem lucro | Conferir a própria comissão venda a venda |
| **Ranking** | Posição por quantidade, nome dos colegas, **sem R$ deles** | Decisão desta rodada |

**Ação que fecha o ciclo:** botão *compartilhar aparelho no WhatsApp* a partir da Vitrine — o
Estoque já tem o gerador de texto, falta a versão sem preço de custo para o papel novo.

### 4.2 Atendente de loja (Anne, Davi, Leo, Gabi) — iPad no balcão + celular

| Tela | O que entrega |
|---|---|
| **Meu dia** | Comissão do mês (25% do lucro de acessórios) + **attach rate pessoal**: de N vendas que atendi, X levaram acessório. Faixa de meta individual (4k/6k/10k/15k de bruto) com quanto falta |
| **Balcão** | Busca por modelo, **etiqueta e final de IMEI**, alvos grandes, estado do aparelho à vista (*na assistência*, *reservado*, *saldão*) |
| **Minhas vendas** | Igual à do vendedor, do ponto de vista de quem atendeu |

⚠️ **Decisão pequena que ficou aberta:** a comissão dele é 25% de um **lucro** que ele não pode ver.
Comissão que a pessoa não consegue conferir vira desconfiança. Recomendo mostrar a **base agregada
do mês** (soma do lucro de acessórios *das vendas dele*) — é o mínimo pra fechar a conta, e não
abre lucro de aparelho nem de ninguém. Precisa do seu ok.

### 4.3 Bancada (Vitinho) — já funciona, ganha três coisas

- **Prazo**: dias fora da loja por aparelho, e uma lista do que passou do normal. Hoje a tela sabe
  *onde está*, não *há quanto tempo dói*.
- **Modo toque** no iPad — é a tela mais operada em pé de todas.
- Continuar sem preço: é o que já permite a ele exportar a lista do "não vender".

### 4.4 Sócio — onde está o resultado, não o volume

1. **Margem real no Estoque.** O `CONTEXT.md` é direto: a margem que o painel mostra é só
   `preço − custo`, e falta **carrego** (3% a.m.), **reparo** e **taxa** — R$ 250–600 por aparelho,
   pesando mais nos modelos lentos. **Decidir compra pela margem bruta inverte a decisão.**
   Os três números já existem no banco (`bancada`/`reparos`, dias em estoque, `pagamentos.taxa`).
   É o maior ganho de dinheiro do plano inteiro e não depende de perfil nenhum.
2. **Fechamento sai do "em breve".** O cálculo e a exportação existem; falta o fluxo:
   *conferir → travar o mês → exportar*. Travar é o que cria o snapshot da §2.2 — as duas coisas
   são a mesma obra.
3. **"Hoje" no Dashboard** — o que mudou desde ontem, com alertas acionáveis (venda pendente,
   aparelho parado há X dias, venda sem atribuição, aparelho na assistência há muito tempo).
   Um painel que só soma o mês não pede ação nenhuma.

---

## 5. Estrutura e design visual

### 5.1 O que falta no kit (`js/ui.js` + `css/components.css`)

`faixa` (alerta acionável — hoje é HTML inline no dashboard) · `tabs` · `busca` (com voz de
"digite modelo, etiqueta ou IMEI") · `meta` (barra com degraus e "faltam N") · `timeline`
(entrada → assistência → venda → comissão; está no brief §7.4 e nunca foi feito) ·
`skeleton` · `listaCartao` (generalizar o cartão desenhado que hoje só existe em `.est-tabela` e
`.bnc-tabela`) · `sheet` (folha que sobe no celular).

E uma varredura de `style="` nas telas grandes — cada um é uma cor ou raio fora do sistema.

### 5.2 Três modos, não três larguras

```
Denso  → mouse, desktop            densidade atual, tabela de verdade
Toque  → iPad de balcão            alvo ≥ 44px, cartão no lugar de linha, busca fixa no topo
Bolso  → celular                   uma métrica-herói por tela, sheet, bottom-tabs
```

Escolhidos por `(pointer: coarse)` **e** largura — não só por largura — com override manual pra
quem quiser. Isso é o que faz o iPad do balcão parar de ser um desktop apertado.

### 5.3 O que **não** muda

Direção **Calmo**, Sora + Geist Mono, cor = significado, tint só na ação primária, dark mode de
primeira classe, `tabular-nums`, estado vazio que diz o próximo passo. Está certo e está funcionando
— o upgrade é de **estrutura e alcance**, não de repaginada.

---

## 6. As fases (cada uma publicável sozinha)

| # | O que entra | Pronto quando |
|---|---|---|
| **0. Fechadura** | `func_key`, normalização no sync, `CHECK` + policies dos dois papéis novos, índices, views sem custo, roteiro de conferência por papel, `test/perfis.test.js` estendido | Um usuário `vendedor` de teste lê **só** as vendas dele, e `custos`/`compras`/`funcionarios_config` alheio voltam **zero linha** — medido com `row_count` |
| **1. Piloto de um** | `loadPorPapel()`, home **Meu dia** do vendedor, **Minhas vendas**, rota no hash | **Uma** pessoa (sugestão: Mel ou David) usando de verdade por uma semana, com a comissão batendo com a folha |
| **2. Loja** | Home do atendente, attach rate, **modo Toque**, **Balcão**/Vitrine com busca, compartilhar no WhatsApp | O iPad do balcão sendo usado em pé sem ninguém pedir ajuda |
| **3. Kit** | Componentes que faltam, varredura de inline styles, skeletons, timeline | `styleguide.html` mostrando todos, e zero cor literal nas telas grandes |
| **4. Sócio** | Margem real no Estoque, Fechamento de verdade (com travar o mês), "Hoje" | Uma decisão de compra tomada pela margem real |
| **5. Casca** | Versionamento automático no deploy, manifest PWA, ranking | O `bump-versao.sh` deixar de ser obrigatório |

**Ordem tem motivo:** a fase 0 é a única que não dá pra pular — sem ela toda tela nova é teatro. A 1
é deliberadamente **uma pessoa**: se a comissão sair errada, erra com uma pessoa, não com sete.

---

## 7. Riscos e armadilhas

1. **Colisão de nome global.** Telas novas = arquivos novos, e essa é a única regra dura do repo.
   Reinstalar o guard do `.git/hooks/pre-commit` **antes** da fase 1 — `node --check` não pega.
2. **Policy nova quebrando a tela do sócio.** RLS mal escrito devolve zero linha calado. Cada fase
   fecha com o roteiro de conferência dos **quatro** papéis, não só do novo.
3. **Venda sem dono (~5%).** Precisa aparecer como número no painel do sócio desde a fase 0.
4. **`maju` vendeu 18 vezes em julho.** Se a IA fecha venda, ela precisa existir no cadastro — ou
   essas vendas ficam órfãs de comissão e de ranking. Não é bug de código, é decisão sua.
5. **Snapshot de folha divergindo da tela.** Só é seguro porque a Edge Function roda **o mesmo
   arquivo**. Se alguém reescrever a folha em SQL, o repo passa a ter dois donos do mesmo número.
6. **Cache do WebView.** Enquanto a fase 5 não chega, todo commit em `js/`/`css/` continua exigindo
   `./scripts/bump-versao.sh`. Com mais gente usando, versão velha deixa de ser chateação do dono e
   vira comissão errada no celular de outra pessoa.

---

## 8. Ainda em aberto

1. **Franquia de dados** — celular do colaborador é pessoal? Muda o quanto vale investir em carga
   enxuta na fase 1 (e se o manifest PWA sobe de prioridade).
2. **Qual tela você abre 10× por dia, e qual você nunca abre?** Quero ancorar a estrutura no uso
   real antes da fase 4.
3. **Alguém de fora precisa ver algo?** (contador, sócio investidor)
4. **A base da comissão do atendente** (§4.2) — mostrar ou não a soma do lucro de acessórios das
   vendas dele.
5. **`maju`** — a IA entra no cadastro como pessoa?
