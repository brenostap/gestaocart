# Auditoria Diagnóstica — gestaocart

## Resumo executivo

O sistema está **funcional mas frágil**, com boa cobertura de regras de negócio que já foram alvo de retrabalho para "bater" entre telas — mas sem nenhuma fonte única de verdade. A saúde geral é **amarela**: nenhum defeito derruba o app hoje de forma garantida, porém há erros de cálculo de folha que produzem valores errados e comunicados a funcionários, além de vetores de XSS reais no painel do sócio. Os três temas dominantes: (1) **XSS por falta de escape** no dashboard e vários modais que injetam dado de banco/usuário via `innerHTML`; (2) **cálculo de remuneração incorreto ou incoerente** (bônus descontado/pago em duplicidade, salários faltando); (3) **duplicação massiva de regras de domínio** (curva de comissão, tiers de meta, tabela de salários e o classificador `isCancelado` reescritos em 4-8 lugares, alguns já divergentes). A verificação adversarial rebaixou os dois achados "critical" para high/medium — não há defeito ativo de severidade crítica.

---

## 🔴 Critical

Nenhum achado permaneceu como crítico após a verificação adversarial. Os dois candidatos ("regras de comissão sem fonte única" e "isCancelado reimplementado") foram rebaixados: o primeiro por ser dívida de manutenção sem output errado hoje (→ medium), o segundo por impacto financeiro real porém estreito (→ high, listado abaixo).

## 🟠 High

- **XSS no dashboard do sócio (nome do cliente, título de produto e vendedor sem escape)** — `js/render.js:490`, `:457`, `:543` — `renderDash()` concatena `venda.cliente_nome`, `prodStr`/`p.titulo`, `x.modelo`, `vendedor` e `mov.aparelho` cru em HTML atribuído a `c.innerHTML` (`render.js:114`); um nome/título como `<img/src=x/onerror=...>` executa script na sessão autenticada e lê o token do Supabase em `localStorage` (`persistSession:true`), permitindo sequestro de sessão. `renderVendas` já escapa esses mesmos campos — é omissão, não convenção. Aplicar `escapeHtml()` em todos os campos de banco/usuário em `renderDash`.
- **Bônus 5% da Anne descontado duas vezes no lucro líquido** — `js/equipe.js:338` — `atTotF` já inclui `Math.round(lAcess*0.05)` via `calcCommAtF('anne')` e a linha 338 subtrai o mesmo valor de novo; o líquido da aba Equipe fica ~R$2.000 (a 5% de lAcess) abaixo do dashboard. Fazer `atTotF` usar só `la*0.25` e manter o desconto único, como em `render.js`.
- **Bônus de meta coletiva pago cheio para cada pessoa** — `js/equipe.js:419` (e card em `:577`) — `bonusColPorPessoa` é o montante único da empresa mas é somado ao total de **cada** colaborador nos resumos de WhatsApp; com 11 pessoas e bônus R$500, prometem-se R$5.500 enquanto o fechamento abateu R$500. Dividir pelo nº de pessoas ou remover a soma per-pessoa.
- **Salário de Leo, Luana e Maria ausente no card individual** — `js/equipe.js:548` — o mapa `salarios` omite os três, então `sal=0`; ao abrir o perfil da Maria (ativa) o card e a mensagem mostram "sem salário fixo" e omitem R$3.000 do total, divergindo do fechamento. Adicionar `leo:2250, maria:3000, luana:2250` (ou reusar a const `sal`).
- **Tabela de salários duplicada em 4-5 lugares e já divergente** — `js/custos.js:21` (e `:96`), `js/equipe.js:310/396/548` — a geração automática de custos e o card individual param em 8 pessoas; o fechamento tem 11. Resultado: ~R$7.500/mês de salário (Leo/Luana/Maria) nunca é lançado no Supabase pela rotina, mas aparece na folha da tela — folha exibida e base do lucro líquido usam conjuntos diferentes. Uma única const `SALARIOS` (ou coluna no roster `FUNC`).
- **Falha ao buscar estoque "fresco" descarta toda a carga do Supabase e pode deslogar** — `js/data.js:82` — o `fetch`/`json` de `fn/apples` (nice-to-have) não tem try/catch próprio; timeout/cold-start cai no `catch(sbErr)` que zera `allVendas/allMovs/estoqueItens` e força o caminho lento FoneNinja; se o mesmo proxy seguir instável, cai em "Erro" + `doLogout()` em 3s. Envolver as linhas 81-85 em try/catch que só loga e mantém o estoque já carregado.
- **`isCancelado` reimplementado em `render.js` com regra diferente da canônica** — `js/render.js:18` vs `js/equipe.js:939` — dashboard usa `valor_estoque===0 && (imei_1 || preco>=200)`; o resto do sistema usa `valor_estoque===0 && !!imei_1`. Um acessório com estoque zerado e preço ≥200 some do dashboard mas paga comissão 25% na aba Equipe — divergência financeira silenciosa. Ter uma única definição canônica (em `core.js`) e remover a local.

## 🟡 Medium

**Cálculo / domínio (verificados, rebaixados de high)**
- **Rateio de custos e lucro por loja usa `v.loja` inexistente** — `js/custos.js:276/296` (também `render.js:140`) — vendas não têm coluna `loja` (deriva de `getVendaInfo().loja`); logo `pctCart/pctUrban=0`, os cards "Cart/Urban (efetivo)" nunca recebem fração dos custos "ambas" e mostram "0% das ambas". (Os totais gerais permanecem corretos; `lucroCart/liqCart` são código morto.) Trocar todo acesso a `v.loja` por `getVendaInfo(x).loja`.
- **Estoque não "fecha": Entradas vêm de snapshot `available`, Saídas de `allVendas`** — `js/movimentacoes.js:243` — aparelho já vendido nunca aparece como entrada; "Total entradas" subestima o fluxo (100 entraram, 90 vendidos → mostra ~10 vs 90 saídas). Buscar entradas de compras/movimentações históricas ou renomear o KPI para deixar explícito que conta só o estoque atual.

**Arquitetura (verificados, rebaixados de high/critical — dívida de manutenção, sem output errado hoje)**
- **Regras de comissão/meta/salário sem fonte única** — `js/equipe.js:90` (curva `>80un` em 8 lugares; tiers e bônus AT em 4-8) — hoje as cópias são idênticas; risco de drift a cada edição de política. Extrair `comissao.js`.
- **Comissão recalculada por 3 motores independentes** (`calcComissaoFunc`, `calc()`, `calcMes`) — `js/equipe.js:481` — só um usa `acessParaComissao` (regime novo/legado), abrindo divergência condicional em meses antigos entre card e dashboard. Motor único `agregarPeriodo()`.
- **Bloco `pessoas[]` da folha duplicado** entre `renderEquipe` e `gerarResumoEquipe` — `js/equipe.js:320` vs `:407` — a folha exibida e a comunicada podem discordar (a diferença do bônus coletivo já é uma). Extrair `calcularFolha(periodo)`.
- **`render.js` é god file: `renderDash` ~415 linhas** — `js/render.js:134` — mistura rateio, tiers de meta, curva de comissão (`calcCommVoDash` redeclarada = cópia de `calcCommVo`), rankings e HTML inline; regra não testável sem instanciar HTML. Separar dados/view.
- **Estado global mutável em ~25 `let` soltos sem invalidação coordenada** — `js/config.js:13` — `setPeriod` chama `updateStatusBar()` 4x por medo de esquecer; caches paralelos por módulo. Centralizar em `STATE` com setters que disparam um único `render()`.

**XSS adicionais (candidatos, mesmo padrão do dashboard)**
- **desc/obs de custo sem escape** — `js/custos.js:403` — texto livre do usuário injetado via `innerHTML`, persistido no Supabase. Escapar.
- **Nome/cidade/instagram de cliente sem escape** — `js/movimentacoes.js:111` (e título/serial/fornecedor em `:215/:318`) — stored XSS na aba Clientes. Escapar.
- **desc/obs de custo em `value="..."` sem escape** — `js/vendas-extra.js:214` — aspas quebram o atributo e injetam handler; valores legítimos com aspas também corrompem. Usar `UI.esc()`.
- **`item.serial` sem escape** — `js/tabela.js:116` — único campo não escapado numa função que escapa todo o resto.

**Error handling / dados**
- **`sbGet` com `limit=2000` fixo trunca vendas/estoque silenciosamente** — `js/auth.js:93` — acima de 2000 linhas o dashboard subconta faturamento/lucro sem aviso, mesmo com `count=exact` disponível. Paginar ou comparar o count com o array.
- **Fallback FoneNinja não checa `r.ok`: 401/erro vira array vazio "com sucesso"** — `js/data.js:101` — token capturado uma vez pode expirar no meio do loop; app parece "pronto" com dados faltando. Checar status por fetch e renovar token.
- **Boot sem try/catch → tela em branco offline** — `js/boot.js:6` — `getSession()`/`loadAllData()` sem catch; login nunca aparece. Envolver em try/catch com fallback de UI.
- **Venda nova entra em `allVendas` sem `_produtos`** — `js/notificacoes.js:43` — some da aba Saídas e conta 0 produtos até reload. Empurrar o objeto detalhado.
- **`perPage=5` perde vendas em dias movimentados** — `js/notificacoes.js:25` — >5 vendas entre polls somem permanentemente (baseline pula para o topo). Paginar por `id > _lastVendaId`.

**Cálculo de negócio (candidatos)**
- **Linhas de comissão do "Resultado financeiro" podem não fechar com o líquido** — `js/render.js:388` — `voTot/atTot` recomputados sobre LABELS vs `calc()` sobre KEYS; usar uma única fonte.
- **Dois conceitos de "lucro" somados no mesmo demonstrativo** — `js/custos.js:380` — `venda.lucro` (FoneNinja) como bruto, mas comissões calculadas sobre `preco-valor_estoque`; bases incoerentes. Definir fonte canônica.
- **Comissão de acessório sem invariante de custo** — `js/equipe.js:128` — acessório com `valor_estoque=0` gera lucro = preço cheio → 25% inflado (infla também o bônus 5% da Anne). Tratar custo 0/ausente como desconhecido.
- **ID de salário excede `MAX_SAFE_INTEGER` + gerador duplicado** — `js/custos.js:44` — `id = id_base*10000+mesNum` ≈9e16 arredonda; dedup por id não confiável. Remover `gerarSalariosDoMes` ou trocar esquema de id.

**Date / UI**
- **Data de origem com off-by-one de fuso** — `js/estoque.js:357` — `new Date('YYYY-MM-DD')` volta um dia em BRT; fatiar a string como `dataEntradaFmt`.
- **Estado vazio enganoso ao filtrar por origem/modelo/capacidade** — `js/estoque.js:291` — mostra "Estoque vazio" quando só o filtro não casou. Usar `filtrosAtivos`.
- **Busca de origem correlaciona por id errado** — `js/estoque.js:327` — usa `item.id` como `apple_id`; pode sempre retornar "sem registro". Passar `d.item.apple_id`.
- **Valor do prejuízo do device nunca é exibido (condição impossível)** — `js/vendas-extra.js:104` — `prejuizo` é sempre negativo, guarda é `>0`. Armazenar como absoluto.
- **`data_saida` null em venda pending derruba o modal de incompletas** — `js/vendas-extra.js:52` — `.slice(0,10)` de null lança TypeError. Proteger com `(v.data_saida||'')`.
- **`fetch` sem try/catch trava botão em "Salvando..."** — `js/vendas-extra.js:270` — falha de rede deixa o modal preso. Envolver em try/catch.

**Arquitetura adicional**
- **Filtro por período copiado 3x** — `js/core.js:158` — extrair `rangeDoPeriodo()`.
- **Rosters (VO/AT/sócios/loja) redeclarados dentro das views** — `js/render.js:42` — derivar de `FUNC`.
- **Ordem dos `<script>` frágil e implícita** — `index.html:67` — documentar grafo ou migrar para módulos ES.
- **`equipe.js` (946 linhas) e `loadAllData` (dois backends + efeitos de UI) são god functions** — `js/equipe.js:141`, `js/data.js:63` — fatiar domínio/comissão/persistência/view.

**Design / acessibilidade**
- **`--text4 (#9aa3b2)` falha contraste AA** (~2.56:1) em rótulos/captions em toda a UI — `css/theme.css:57` — escurecer o token (o brief exige AA).
- **Login sem `<label for>` e fora de `<form>`** — `index.html:24` — placeholder não é nome acessível; enfraquece autofill.
- **Controles removem outline de foco sem indicador visível** — `css/styles.css:221` — `.cselect`/`.pill` sem `:focus`; adotar `:focus-visible` com anel.
- **Tabelas legadas em grid fixo não reflowam no mobile** — `css/styles.css:190` (`.vrow`, `.crow`) — migrar para `.c-tabela`.
- **~34 hex e 45 rgba literais fora de `theme.css`** — `css/styles.css:205` — viola a regra do DS e não adapta ao dark mode; promover a tokens.
- **`styleguide.html` carrega Geist, não Sora** — `styleguide.html:9` — a "fonte da verdade visual" renderiza em fallback e rotula errado.
- **KPIs calculados antes do filtro de loja e nunca usados** — `js/render.js:568` — código morto que, se reusado, ignora `currentStore`. Remover.

## 🟢 Low

- **XSS refletido self-only**: `escapeHtml` não escapa aspas e `vendasSearch` é refletido em `value="..."` — `js/estoque.js:102` + `render.js:723`; estender o helper para `"` e `'`. loja/vendedor/título no modal de incompletas sem escape — `js/vendas-extra.js:110`.
- **Classificadores divergentes**: `isPrinc` local na notificação difere do canônico — `js/notificacoes.js:70`. Usar `isPrincipal`/`isAcess`.
- **Baseline zero mostra vendas antigas como novas** — `js/notificacoes.js:11` — só fixar baseline sem notificar quando `_lastVendaId===0`.
- **Casos de borda de custos**: rateio "ambas" zera sem venda de device (`custos.js:278`, cair para 50/50); `id:Date.now()` pode colidir (`custos.js:256`); `liqCart/liqUrban` e lucros por loja calculados e nunca usados (`custos.js:300`).
- **Async mal tratado**: `carregarTabelaPrecos()` sem `.catch` re-dispara a cada render (`estoque.js:188`, `data.js:67`, `core.js:110`); `de.payload?.data` estoura se `de` for null (`data.js:84`); `doLogin` lê `data.session.access_token` sem checar sessão → mensagem enganosa (`auth.js:34`).
- **Código morto**: fluxo de edição/dívidas órfão (`equipe.js:826`), `bonusCol = lAcessMes*0` (`equipe.js:506`), fetch de fotos p/ subsistema morto (`estoque.js:208`), funções de cor nunca chamadas (`estoque.js:8`), `movsCache` lido mas nunca escrito (`movimentacoes.js:5`), `renderMovsEstoque` sem call-site (`movimentacoes.js:337`).
- **Fragilidades menores**: `copiarTextoWa` depende de `window.event` depreciado (`estoque.js:585`); `precoTabela===0` gera `null%` (`tabela.js:24`); `gerarOpcoesMeses` usa Date local, não BRT (`core.js:247`); cache de preços vazio re-dispara fetch (`core.js:110`).
- **Domínio/modelagem**: "margem" sobrecarregada (R$ vs %) — `estoque.js:161`; margem potencial soma negativos e sempre exibe verde — `estoque.js:213`; "dias parado" só existe pós-venda, não há aging de estoque atual — `estoque.js:226`.
- **Card "Acessórios" rotula custos operacionais como "Custo lançado"** — `js/render.js:241` — mostra `custosMes` (deturpa a margem). Rotular como operacionais ou usar o custo real dos acessórios.
- **Dados pessoais (CPF/PIX/e-mails) hardcoded no JS do cliente** — `js/config.js:37` — visível a qualquer usuário autenticado, fora do RLS. Mover para tabela protegida.
- **A11y**: botões só-ícone sem `aria-label` (`ui.js:117`, `index.html:47`); `<th>` sem `scope="col"` (`ui.js:67`); CSS morto substancial em `styles.css:358`.

---

## Recomendação de sequência

1. **Escapar todo dado de banco/usuário no dashboard** (`render.js` linhas 457/490/543) — corrige os XSS de maior impacto (roubo de token na sessão do sócio) com o mesmo `escapeHtml` já existente. Em seguida os demais pontos de `innerHTML` sem escape (custos.js:403, movimentacoes.js:111, vendas-extra.js:214, tabela.js:116).
2. **Corrigir os três erros de folha** que produzem números errados comunicados a funcionários: bônus da Anne 2x (`equipe.js:338`), bônus coletivo cheio per-pessoa (`equipe.js:419/577`) e salários Leo/Luana/Maria ausentes (`equipe.js:548`).
3. **Blindar a carga de dados** (`data.js:82`): try/catch no estoque "fresco" para não descartar a carga do Supabase nem deslogar; e checar `r.ok` no fallback FoneNinja (`data.js:101`) + boot com try/catch (`boot.js:6`).
4. **Unificar `isCancelado`** (mover para `core.js`, remover a cópia de `render.js:18`) — elimina a divergência financeira silenciosa entre dashboard e Equipe.
5. **Consolidar a tabela de salários** numa única const/coluna em `FUNC` (`custos.js:21`, `equipe.js:310/396/548`) para folha e rotina automática iterarem o mesmo conjunto de pessoas.
6. **Corrigir o rateio por loja** trocando `v.loja` por `getVendaInfo(x).loja` (`custos.js:276`, `render.js:140`).
7. **Iniciar a extração da fonte única de comissão** (`comissao.js`: curva VO, tiers de meta, bônus AT) para estancar o drift antes de qualquer ajuste futuro de política — pré-requisito para colapsar os 3 motores de cálculo em um só.

---

## Anexo — achados refutados na verificação adversarial

- **ID de salario usa indice do array FILTRADO, quebra regeneracao** `js/custos.js:126`
  - A mecânica parcial da alegação é verdadeira: em js/custos.js:126 o id de fato usa o índice `i` do array JÁ FILTRADO (js/custos.js:123-124), então ao deletar um funcionário que não seja o de índice 0 (ex.: vitinho, id X+8) a regeneração gera id X+1, que colide com o primeiro config (pietra), e o POST com `Prefer: resolution=ignore-duplicates` (js/custos.js:145) descarta a linha no banco. Logo, no BANCO o salário deletado realmente não volta.\n\nMas o DANO observável afirmado — "custos de funcionário ficam subestimados no resultado líquido" — NÃO se sustenta no código real. Após o POST, js/custos.js:149-157 executa, dentro de `if(res.ok)`, `novos.forEach(n => _custosCache.unshift({...}))`. Com ignore-duplicates o PostgREST retorna 201/OK mesmo descartando a linha, então `res.ok` é true e o vitinho é RE-ADICIONADO incondicionalmente ao cache em memória a cada load (com o id colidente X+1 e valor 2250). O renderCustos lê os totais de getCustos()→_custosCache (js/custos.js:271,6) e `totalGeral` (js/custos.js:292) soma todos os c.valor, contando tanto pietra (X+1, 4500) quanto o vitinho re-adicionado (X+1, 2250). O "Resultado líquido real" (js/custos.js:384) usa esse totalGeral. Portanto o custo do funcionário deletado É contabilizado no resultado líquido em toda sessão — não há subestimação.\n\nOs defeitos reais aqui são outros: (a) a linha nunca é re-persistida no banco, e (b) o cache local passa a ter id duplicado (X+1 compartilhado por pietra e vitinho), o que só quebraria em um cenário DIFERENTE (ex.: deletar pietra depois removeria ambos do cache por filtrar id X+1). Nenhum corresponde à falha alegada. Como o cenário de falha concreto descrito (subestimação no resultado líquido) não se sustenta no código real, refuto. Observação adicional: gerarSalariosDoMes (js/custos.js:16-67) é código morto/legado que usa outro esquema de id (id_base*10000+mesNum) e não é chamado por loadCustosFromSB (js/custos.js:88), então não participa do fluxo.

- **Zona morta na classificacao device/acessorio: itens com custo em [200,250) nao sao nem principal nem acessorio** `js/equipe.js:942`
  - The arithmetic gap between the two helpers is real: js/equipe.js:933 isAcess requires valor_estoque<200 while js/equipe.js:942-944 isPrincipal requires apple_id||imei_1||valor_estoque>=250, leaving [200,250) with no id satisfying neither. But the described consequence (silent disappearance from unPrincipal, all product/accessory KPIs, attendant commission, and revenue/cost aggregations) does NOT hold against the authoritative engine calc() in js/render.js, which does not use isAcess/isPrincipal as mutual complements. (1) acPeriod (render.js:19-24) buckets _produtos accessories as !isPrincipal(p)&&!isCancelado(p) — a catch-all complement, so a non-cancelled gap item is classified as an accessory and counted in unAcess/vendaAcess/lAcess and the attendant atMap 25% commission (render.js:36-39,78-84). (2) prPeriod (render.js:25-30) partitions the movimentações path as !isAcess vs isAcess with no gap. (3) The equipe.js month-closing/payroll table consumes this same engine via const m2=calc() (equipe.js:307) using m2.unPrincipal/atMap/voMap/lAcess, so the real paid numbers include the item. (4) Top-line bruto/lucro come from sale-level valor_total/lucro (render.js:6-7), independent of classification, so revenue/cost cannot vanish. The only real effect of the 200/250 mismatch is inside equipe.js calcComissaoFunc, where getAcess (line 85, strict isAcess) and contarIphones (line 76, isPrincipal) power the per-employee PREVIEW cards; a gap item is omitted there, a minor display divergence from the authoritative fechamento table — not the claimed high-severity silent loss from every KPI and commission. The reviewer evaluated the two helpers in isolation and missed the complement-based bucketing in the engine that actually drives the dashboard and payroll. Per adversarial guidance, the specific failure scenario does not survive contact with the real code.

- **Duas politicas de acesso a dados concorrentes: sbGet (renova token) vs fetch cru com SB_TOKEN global velho** `js/equipe.js:10`
  - The claim's exploitable scenario ("numa aba aberta ha horas, salvar divida/custo falha 401 em silencio") does not hold in the real code. The global SB_TOKEN read by the raw-fetch writes in js/equipe.js (lines 12,24,29,45,50) is kept continuously fresh by three mechanisms the reviewer overlooked: (1) js/boot.js:3-5 sb.auth.onAuthStateChange updates SB_TOKEN on every auth event including Supabase TOKEN_REFRESHED, so background token rotation updates the global immediately; (2) js/config.js:11 creates the client with autoRefreshToken:true (proactive refresh before expiry); (3) js/auth.js:14-17 iniciarTokenKeepAlive runs sbAuthToken() every 60s, wired into both login (auth.js:35) and session restore (boot.js:9). The keep-alive comment at auth.js:11-12 explicitly states its job is to keep SB_TOKEN valid for 'escritas de custos, precos, equipe' — the exact writes flagged. The warning comment the reviewer cited (auth.js:66-76) describes the bug in the PAST tense ('era o que fazia o polling levar 401 em silencio') — i.e. the problem these mechanisms already fixed, not a live defect. On a long-open tab SB_TOKEN is at most ~60s stale vs getSession(), far within the ~1h token lifetime, so writes will not 401. The literal observation that two patterns coexist (sbGet vs raw fetch on the global) is true but is a deliberate supported design, not the 'silent 401 on writes' failure asserted. The only residual gap (no explicit 401 handling on writes) bites solely in the truly-dead-session edge case, which the next read/poll surfaces via sessaoExpirou() — not the routine long-tab failure claimed. Preferring refuted per instructions since the high-severity impact is not observable.
