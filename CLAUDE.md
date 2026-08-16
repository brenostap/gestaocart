# Phone Cart — Painel interno das lojas

Painel de gestão das lojas **Phone Cart** e **Urban** (venda de iPhones/acessórios).
Telas: Vendas, Estoque, Tabela de preços, Equipe/Folha, Custos, Dashboard, Movimentações.

## Como rodar / testar
- É um **site estático** (HTML + JS puro, sem build). Pra testar local: servir a pasta
  (`python3 -m http.server 8080`) e abrir no navegador — precisa **login Supabase** (é do dono).
- Deploy: `main` publica (Netlify). Commit na `main` = vai ao ar.
- ⚠️ **Mexeu em `js/` ou `css/`? Rode `./scripts/bump-versao.sh` antes de commitar.** O dono abre
  o painel por um **ícone na tela de início do iPhone**, que roda num WebView com cache próprio e
  ignora o `must-revalidate`: sem URL nova ele serve código velho calado. `js/versao.js` compara a
  versão rodando com a publicada e mostra a faixa "Nova versão" — mas só funciona se o `?v=` mudar.
  - O script usa **carimbo de tempo, não o hash do commit**: o hash só existe depois do commit, e
    rodar antes repete o valor anterior. Aconteceu em 01/ago/2026 — dois deploys com o mesmo `?v=`.
- **Teste do fechamento** (sem browser, sem rede): `node test/fechamento.test.js`. Carrega os
  `js/*.js` reais com stubs e prova que tela e exportação saem do **mesmo** `fechamentoEquipe()`.
  Rodar depois de mexer em comissão, meta, folha ou `calc()`.
- **Teste do registro da venda**: `node test/registro-venda.test.js`. Prova que **a obs manda** e
  que os campos estruturados da FoneNinja (vendedor/origem/cadastrador) só tapam buraco — e que
  atendente no campo vendedor **nunca** vira vendedor. Rodar depois de mexer em `getVendaInfo()`.
  Ele também **chama `renderVendas()`**: em 06/ago/2026 renomear uma chave da Conferência derrubou
  a tela de Vendas inteira e nenhum teste de unidade viu, porque ninguém montava a tela.
- **Teste da régua de conversa**: `node test/qualificacao.test.js` (sem rede, sem token). Protege os
  sinais de `scripts/chatwoot.js` — o vazamento "preço sem handoff", nota interna não contando como
  fala com o cliente, e a normalização do nono dígito do telefone. Ver `docs/QUALIFICACAO-CONVERSAS.md`.

## ⚠️ Arquitetura que quebra fácil (leia antes de mexer em JS)
- **Sem bundler — `<script>` clássicos, um único escopo global.** Todos os `js/*.js` são
  carregados em sequência no `index.html` e **compartilham o mesmo escopo**.
- **NUNCA declare o mesmo nome top-level (`const`/`let`/`class`, ou lexical vs `function`/`var`)
  em dois arquivos.** Isso vira "Identifier already declared" no browser e **derruba o arquivo
  inteiro** que carrega por segundo → várias telas param de abrir de uma vez (o login continua ok).
  - Já aconteceu (`CORES_HEX` em `config.js` + `estoque.js`, jul/2026).
  - `node --check` **NÃO pega** isso (testa arquivo por arquivo). Há um guard em
    `.git/hooks/pre-commit` (local, não versionado) que bloqueia o commit. Reinstale ao trocar de máquina.
- A **ordem de carga** no `index.html` importa (quem carrega por segundo é quem quebra).

## Mapa dos arquivos
- `index.html` — carrega os scripts (ordem importa) e monta o shell.
- `js/config.js` — tokens de estado, constantes globais (ex.: `CORES_HEX`, `corHex`), permissões.
- `js/core.js` `js/data.js` — carga de dados (Supabase via REST; ver `loadFromSupabase`).
- `js/render.js` — dashboard + **tela de Vendas** (`renderVendas`).
- `js/estoque.js` `js/tabela.js` `js/custos.js` `js/equipe.js` `js/movimentacoes.js` — as outras telas.
- `js/bancada.js` — tela **Assistência** (⚠️ chamava-se *Bancada* até 15/ago/2026; **só o rótulo
  mudou** — arquivo, tabela `bancada`, aba `currentTab='bancada'` e funções `bnc*` seguem iguais,
  então procure por "bancada" no código e por "Assistência" na tela) + `bancadaDoApple()`, que é o que
  o `estoque.js` chama pra pôr o selo "Na assistência".
- `js/fechamento.js` — exportação do fechamento (.xlsx, uma aba por colaborador). **Não calcula
  nada**: lê `fechamentoEquipe()` (equipe.js), que lê `calc()` (render.js). Se faltar um número,
  ele nasce em `fechamentoEquipe()`, nunca ali.
- `js/ui.js` — **kit de componentes** (`UI.card/kpi/badge/tabela/...`). Telas pedem componentes, não escrevem HTML na mão.
- `js/auth.js` — login + `sbGet(tabela, params, limit)` (wrapper do Supabase REST).
- `js/shell.js` — navegação, contexto (loja+período), **permissões** (`papelAtual`, `podeVerValor`, `podeVerMargem`).
  - ⚠️ **Barra do celular = 4 fixas + "Mais"**. Até 15/ago/2026 ela mostrava só os 5 slots de
    `NAV_MOBILE` e as outras **6 telas do sócio não existiam no telefone** — sem rolagem, sem
    aviso. `navMobile()` agora devolve `{fixas, mais}`, e o teste garante que **toda** tela do
    papel é alcançável por um dos dois.
- `css/theme.css` (tokens) · `css/components.css` (componentes) · `css/shell.css` (layout).
- `docs/DESIGN-SYSTEM.md` — **regras de UI e mapa** (ler antes de mexer em visual).

## Design system (resumo — detalhe em docs/DESIGN-SYSTEM.md)
- Direção "Calmo", fonte Sora. **Toda tela usa `UI.*` + tokens `var(--…)`** — nunca cor literal nem HTML de card/tabela na mão.
- **Cor = significado** (verde=lucro/ok, âmbar=atenção, vermelho=crítico, violeta=processo). Tint (azul Cart / laranja Urban) só em ação primária.
- **Todo valor em R$ passa por `money()`** (respeita permissão).

## Permissões / perfis
⚠️ **Ler `docs/PERFIS-E-ACESSO.md` antes de mexer em papel, RLS ou login.**
- **Duas camadas, não confundir.** `MATRIZ_ACESSO`/`money()` são **cortina** (escondem menu e
  número). A **fechadura** é o RLS por papel no Postgres. Perfil sem RLS é teatro.
- `papelReal()` (shell.js) lê a tabela **`perfis`** (`user_id` → papel), carregada por
  `carregarMeuPerfil()` **antes** do `enterApp()`. Padrão `'socio'` quando não carrega — é UX, não
  segurança.
- **Papéis com RLS de verdade: `socio` e `bancada`.** `gerente`/`vendedor`/`atendente` continuam
  **só prévia visual** do dono, e o `CHECK` de `perfis` não os aceita: criar um deles hoje daria
  tela aberta lendo zero linha. **Papel novo = escrever o RLS dele junto.**
- `bancada` (o Vitinho) vê só Estoque + Assistência, não entra em `VE_VALOR` nem `VE_MARGEM`, e tem
  carga própria (`loadBancadaData()` em data.js).
- Regra dos perfis comerciais: **colaborador vê o VALOR da venda** (negociou o preço) **mas não vê
  custo/lucro/margem**. `podeVerValor()` e `podeVerMargem()` são os interruptores.
- **Teste**: `node test/perfis.test.js` — prova a cortina, **não** a fechadura.

## Dados
- **Fonte:** Supabase (projeto `pfsfsibgmtbifypuyyqf`). O app **só lê**.
- **Sync FoneNinja→Supabase:** repo separado `brenostap/phonecar-sync` (`sync.js`), GitHub Action **de hora em hora**. Grava vendas, produtos, **pagamentos**, **contas a receber**, estoque, clientes, compras.
- **Preços** vêm do Google Sheets (fonte oficial); FoneNinja ao vivo via Edge Function proxy `fn`.
  - ⚠️ **O `fn` tem lista branca de rota+método e exige papel `socio`** (fechado em 13/ago/2026 —
    antes repassava qualquer método, ou seja, qualquer login escrevia e apagava no ERP). Código em
    `supabase/functions/fn/index.ts`. **Chamada nova = entrada nova na lista**, senão volta 403.
  - **`sync-precos` também exige `socio`** (fechado em 14/ago/2026 — antes bastava estar logado).
    O caminho do cron (`x-sync-secret`) não mudou. Código em
    `supabase/functions/sync-precos/index.ts`. ⚠️ O regex `INVIS` ali está em escapes `\u` de
    propósito: era escrito com os caracteres invisíveis literais e não dava pra editar o arquivo
    sem risco de comer um deles calado. **Não volte pra forma literal.**
- Tabelas principais: `vendas`, `venda_produtos`, `pagamentos`, `contas`, `estoque`, `clientes`, `compras`, `custos`, `reparos`, `bancada`.
- ⚠️ **"O app só lê" vale pros dados da FoneNinja.** As tabelas do próprio painel — `custos`,
  `metas_mensais`, `funcionarios_config`, `tabela_precos`, `bancada` — o browser **grava direto**
  por upsert (`setEquipeExtra()` em `equipe.js` é o modelo). **Mas escrita é por papel**, não é
  `auth_all` como já foi: `custos`, `metas_mensais`, `funcionarios_config` e `tabela_precos` pedem
  `eh_socio()`; `bancada`, `estoque_correcoes` e `estoque_estado` pedem `pode_operar()` (sócio ou
  bancada), e **apagar de `bancada` é só do sócio**. Detalhe em `docs/PERFIS-E-ACESSO.md`.
- **`reparos`** — serviços de bancada por aparelho, carregados das notas das assistências por
  `node scripts/reparos.js` (único **script** do repo que escreve no Supabase; usa `service_role` do
  ambiente, nunca do repo). É **camada analítica, não contábil**: o P&L continua lendo `custos`,
  somar as duas conta o mesmo dinheiro duas vezes. Ler `docs/REPAROS-ATRIBUICAO.md`.
  - As notas ficam em `RR/` e `notas/`, **ambas no `.gitignore`** — têm IMEI de cliente e preço de
    fornecedor, e a Netlify publica a raiz do repo.
- **`bancada`** — uma linha por **ida à assistência**; tela `js/bancada.js`. Existe porque o painel
  não sabia que o aparelho tinha saído: ficava `available`. Em 12/ago/2026 eram **43 aparelhos e
  R$ 87 mil (16% do estoque)** na bancada e marcados como disponíveis. Regras, colunas e rotina em
  `docs/CONTROLE-MANUTENCAO.md`.
  - `reparos` é o **dinheiro** (vem da nota, depois do fato); `bancada` é o **paradeiro e o tempo**
    (vem da pessoa, durante). Não são a mesma coisa e não se somam.
  - **Aba Conferência** (só sócio) cruza os dois: na nota sem registro · registrado sem nota ·
    valor diferente. ⚠️ **Só cobra a partir de `min(saiu_em)` da bancada** — cobrar o passado daria
    204 faltas no primeiro dia e ninguém abriria a tela de novo. Compara **por aparelho, somando**
    (a nota quebra um conserto em várias linhas). Teste: `node test/conferencia-bancada.test.js`.
  - **Preço de referência é aprendido** (mediana do histórico, mín. 3 amostras), **não transcrito
    dos PDFs**: o da RR é Canva com texto glifo a glifo e sai embaralhado — preço errado geraria
    alarme falso toda semana. Pra travar preço combinado, pedir a tabela em texto/planilha.
  - Casa por **`apple_id`**, com os **4 últimos do IMEI** como reserva. **Nunca por etiqueta**:
    `E1030` e `SP1030` colidem sem o prefixo — 138 itens do estoque colidem assim.
  - **Botão "📋 Copiar lista"** (tela Assistência) gera o texto de "não vender" pro grupo do
    WhatsApp: modelo + final do IMEI, **sem preço**, só quem saiu do `estoque` (cliente e garantia
    viram contagem no rodapé). É por não ter preço que o papel `bancada` também exporta — o
    *Exportar WhatsApp* do Estoque continua atrás de `podeVerValor()`.
  - **Teste**: `node test/bancada.test.js`. Monta a tela de Assistência **e a de Estoque** — o selo
    mora no meio da linha do Estoque, então quebrar lá derruba a tela toda.
- **`estoque_correcoes`** — ⚠️ **`estoque` não é editável**: o sync reescreve as 237 linhas de hora
  em hora. Esta tabela guarda o **delta** (`apple_id · campo · valor_novo · valor_fn`), e
  `dadosDoItem()` aplica por cima. **Auto-limpante**: a correção existe enquanto diverge — quando a
  FoneNinja passa a dizer o mesmo, ela some da lista sozinha. É o que impede virar segundo estoque.
  - **IMEI só entra como `tipo='reporte'` e NUNCA substitui** — é a chave de venda/reparo/bancada.
  - `podeCorrigirEstoque()` = sócio e bancada. Teste: `node test/correcoes.test.js`.
  - ⚠️ **Os campos de correção ficam atrás de um botão** ("✎ Corrigir dados do aparelho"). Abrir
    o aparelho mostra só informação. Motivo: abrir é o gesto do dia todo, e etiqueta e **IMEI**
    estavam a um toque de serem trocados sem querer. Fechar a linha esquece a edição
    (`corFecharEdicao`). O **estado da peça** continua à vista — é a marcação corriqueira e um
    toque a desfaz.
  - ⚠️ No banco quem manda é a função **`pode_operar()`** (sócio, bancada), que guarda
    `estoque_correcoes`, `estoque_estado` e `bancada`. **Ela e `podeCorrigirEstoque()` são a mesma
    regra em dois lugares — mudou uma, muda a outra**, senão a tela oferece o botão e a API recusa.
- **`estoque_estado`** — estado operacional marcado à mão: **saldão · precisa reparo · bloqueado ·
  reservado · outro**, mais um campo de **observação** livre (é ela que manda quando o estado é
  *outro*). ⚠️ O conjunto mudou em 15/ago/2026 e o **eixo** mudou junto: o antigo (revisado ·
  avaliar · reparar · peça · sem conserto) descrevia o estado *técnico*; o novo diz **por que este
  aparelho não é uma venda normal agora**, o que inclui motivo comercial. Sem linha = aparelho
  normal. `saldao` **não** conta no KPI "Não prontos" — é o contrário, é pra vender logo
  (`COR_ESTADOS_NAO_VENDE` em `correcoes.js`). Informação **nova**, que a FoneNinja não tem — por isso **não** entra na
  tabela auto-limpante (não teria pra onde convergir). Três coisas separadas de propósito:
  `estoque_correcoes` = delta que converge · `estoque_estado` = informação nossa · `bancada` = saiu
  da loja. `status` (available/sold) continua sendo a venda que decide.
- ⚠️ **Três interruptores de dinheiro, não um.** `podeVerValor()` (valor da venda) ·
  `podeVerMargem()` (custo/lucro/margem) · **`podeVerCustoServico()`** (o que a assistência cobra —
  sócio e bancada). `money()` responde aos dois primeiros; **`moneyServico()`** ao terceiro. O papel
  `bancada` vê custo de serviço e **não** vê custo de aparelho: são dinheiros diferentes.

## Verdades não óbvias (pra não errar)
- O `lucro` da venda **já é líquido da taxa de cartão** (a FoneNinja calcula sobre o `líquido` do pagamento). **Não descontar taxa de novo** — seria dupla contagem.
- O `líquido`/recebimento da FoneNinja **erra em ~9%** das vendas — o lucro dessas não é confiável.
- `taxa` = custo real da maquininha; `taxa_extra` = juros repassados ao cliente (é ganho da loja, já embutido no líquido).
- **Trocas detalhadas JÁ são capturadas** — `venda_trocas` tem uma linha por aparelho entregue,
  100% com título e valor, 96,7% com IMEI, e o total bate com `upgrade_valor`/`upgrade_qtd`
  (213 linhas em jun+jul/2026). Dá pra analisar trade-in por aparelho.
  - **Troca é o melhor canal de compra**: aparelho de troca dá ~1,5× a margem de um comprado de
    fornecedor (entra pela metade do custo, sai pelo mesmo preço). Ver `docs/ANALISE-JUN-JUL-2026.md`.
- **A obs da venda ainda é a fonte de loja, vendedor e atendente** — e continua sendo quem paga
  comissão. `vendas.loja_id` está 100% vazio: `loja`, `vendedor_obs` e `atendente_obs` são todos
  parseados do texto da observação. Tirar a obs hoje quebra as três coisas de uma vez.
  - ⚠️ **Virada em ago/2026 — `vendas.vendedor_id` troca de significado.** Até 05/ago o campo
    vendedor da FoneNinja só tinha perfil de **atendente** (batia com `atendente_obs` em 97,3% de
    julho). Com os perfis dos vendedores online criados, ele passa a ser **quem vendeu**. Nada no
    banco marca a virada — quem ler a coluna sem saber disso mistura duas coisas.
    Regra nova: campo vendedor = vendedor · origem do cliente = loja · login = atendente.
    Ler `docs/REGISTRO-VENDA-2026-08.md` antes de mexer.
  - Os três já vêm **estruturados no payload da venda** e o sync grava em colunas próprias:
    `vendedor_nome`, `origem_cliente_id` (→ loja, via `origens_cliente`), `cadastrador_id`.
    **A obs manda**: `getVendaInfo()` só usa esses campos onde a obs não diz nada — venda sem obs
    sumia da comissão em silêncio. O fallback do vendedor só aceita quem é **VO de verdade**
    (`VO_KEYS`), senão atendente do campo antigo viraria vendedor. Trava protegida por
    `node test/registro-venda.test.js`.
  - `vendedor_nome` **não depende de `funcionarios`** — o perfil dos vendedores online não aparece
    em `/refactored-funcionarios`, só no payload da venda.
  - O `cadastrador` (quem estava **logado**) também vive em `contas.raw->cadastrador`
    (`{id, nome}`, 100% preenchido) — fonte de reserva pras vendas que o sync ainda não tocou.
    O `data.js` puxa só esse recorte via jsonb path (o `raw` inteiro são 14 MB; o recorte, 146 kB).
  - ⚠️ **Cadastrador NÃO é mais exato por ser automático** — ele mede o *login aberto*, não a
    pessoa. Em jul/2026: campo vendedor acerta o atendente em **97,3%**, cadastrador em **90,7%**.
    A **Conferência** (`js/conferencia.js`, botão na tela de Vendas) mede as duas leituras ao mesmo
    tempo — cobertura da regra nova subindo, regra antiga caindo. Ver antes de mexer na comissão.
- **Conta bancária do pagamento** (`pagamentos.conta_bancaria`) já vem do sync e alimenta a tela
  Contas. A lista de contas é montada do próprio dado — conta nova cadastrada na FoneNinja
  aparece sozinha, sem mexer no código.
  - Desde 04/ago/2026 são **4 contas novas** (Cart/Urban × Pix/Crédito) e o **nome da conta carrega
    a loja** ("Cart - PicPay"); `pagContaInfo()` (render.js) separa loja e adquirente. Débito e
    dinheiro **não** foram separados por loja. Crédito saiu do PagBank pro PicPay: mais barato de
    6x pra cima (~R$6,2 mil/mês no mix de julho). Detalhe em `docs/REGISTRO-VENDA-2026-08.md`.

## Caderno de ideias
- `docs/IDEIAS.md` — backlog por área. **Ao começar um trabalho numa área, leia a seção dela** e veja o que encaixa pra fazer junto. Anote ali toda ideia nova que surgir e não for a tarefa do momento.

## Como trabalhar aqui (evita a bagunça de jul/2026)
- 🚨 **Nunca duas sessões editando código ao mesmo tempo** — foi o que causou colisões e git
  embolado. Esta é a única regra dura; as outras são conselho.
- **Salve (commit) entre tarefas** pra cada conversa começar de um estado limpo e conhecido.
- **Conversa longa não é problema; contexto perdido é.** A conversa pode emendar quantos assuntos
  o dono quiser — mudar de assunto **nunca** é motivo pra empurrar ele pra um chat novo. O que
  degrada numa conversa comprida é o detalhe, porque o histórico vai sendo resumido. **A defesa é
  escrever, não encerrar:** decisão vira `docs/`, jeito de trabalhar vira memória, código vira
  commit. Feito isso, começar de novo custa uma frase ("leia `docs/X.md`") e nada se perde.
  - Sugerir conversa nova só quando o **dono** demonstrar que quer virar a página.
- **Toda regra daqui é editável** — inclusive esta. Elas nasceram de um erro específico, não de
  princípio; quando uma atrapalhar em vez de proteger, mude o CLAUDE.md junto com o trabalho.

## Agent skills

### Issue tracker

Markdown local — tarefas em `.scratch/<assunto>/`. O backlog de longo prazo continua
sendo `docs/IDEIAS.md`. Ver `docs/agents/issue-tracker.md`.

### Triage labels

As cinco labels padrão (`needs-triage`, `needs-info`, `ready-for-agent`,
`ready-for-human`, `wontfix`). Ver `docs/agents/triage-labels.md`.

### Domain docs

Contexto único — **`CONTEXT.md` existe** (glossário do domínio: margem bruta/operacional/real,
carrego, reparo, canal de origem, societário). `docs/adr/` ainda não nasceu.
Ver `docs/agents/domain.md`.

⚠️ **Leia `CONTEXT.md` antes de mexer em qualquer cálculo de margem ou lucro.** A "margem" que o
painel mostra hoje é só `preço − custo de aquisição`: falta **carrego** (capital a 3% a.m.),
**reparo** de bancada e **taxa de cartão**. Somam R$ 250–600 por aparelho e pesam mais nos modelos
lentos — usar margem bruta pra decidir compra inverte a decisão.
