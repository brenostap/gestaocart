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
- `js/fechamento.js` — exportação do fechamento (.xlsx, uma aba por colaborador). **Não calcula
  nada**: lê `fechamentoEquipe()` (equipe.js), que lê `calc()` (render.js). Se faltar um número,
  ele nasce em `fechamentoEquipe()`, nunca ali.
- `js/ui.js` — **kit de componentes** (`UI.card/kpi/badge/tabela/...`). Telas pedem componentes, não escrevem HTML na mão.
- `js/auth.js` — login + `sbGet(tabela, params, limit)` (wrapper do Supabase REST).
- `js/shell.js` — navegação, contexto (loja+período), **permissões** (`papelAtual`, `podeVerValor`, `podeVerMargem`).
- `css/theme.css` (tokens) · `css/components.css` (componentes) · `css/shell.css` (layout).
- `docs/DESIGN-SYSTEM.md` — **regras de UI e mapa** (ler antes de mexer em visual).

## Design system (resumo — detalhe em docs/DESIGN-SYSTEM.md)
- Direção "Calmo", fonte Sora. **Toda tela usa `UI.*` + tokens `var(--…)`** — nunca cor literal nem HTML de card/tabela na mão.
- **Cor = significado** (verde=lucro/ok, âmbar=atenção, vermelho=crítico, violeta=processo). Tint (azul Cart / laranja Urban) só em ação primária.
- **Todo valor em R$ passa por `money()`** (respeita permissão).

## Permissões / perfis
- Hoje é **admin (dono) — vê tudo**. `papelAtual()` (shell.js) devolve o papel; perfis reais estão planejados mas **desligados**.
- Regra dos perfis: **colaborador vê o VALOR da venda** (negociou o preço) **mas não vê custo/lucro/margem**. `podeVerValor()` e `podeVerMargem()` são os interruptores.

## Dados
- **Fonte:** Supabase (projeto `pfsfsibgmtbifypuyyqf`). O app **só lê**.
- **Sync FoneNinja→Supabase:** repo separado `brenostap/phonecar-sync` (`sync.js`), GitHub Action **de hora em hora**. Grava vendas, produtos, **pagamentos**, **contas a receber**, estoque, clientes, compras.
- **Preços** vêm do Google Sheets (fonte oficial); FoneNinja ao vivo via Edge Function proxy `fn`.
- Tabelas principais: `vendas`, `venda_produtos`, `pagamentos`, `contas`, `estoque`, `clientes`, `compras`, `custos`.

## Verdades não óbvias (pra não errar)
- O `lucro` da venda **já é líquido da taxa de cartão** (a FoneNinja calcula sobre o `líquido` do pagamento). **Não descontar taxa de novo** — seria dupla contagem.
- O `líquido`/recebimento da FoneNinja **erra em ~9%** das vendas — o lucro dessas não é confiável.
- `taxa` = custo real da maquininha; `taxa_extra` = juros repassados ao cliente (é ganho da loja, já embutido no líquido).
- **Trocas detalhadas** (quais aparelhos o cliente entregou, IMEI/valor) **ainda não são capturadas** — só o total (`upgrade_valor`/`upgrade_qtd`).
- **A obs da venda é a ÚNICA fonte de loja, vendedor e atendente.** `vendas.loja_id` está 100%
  vazio e não existe campo de vendedor-nome: `loja`, `vendedor_obs` e `atendente_obs` são todos
  parseados do texto da observação. Tirar a obs quebra as três coisas de uma vez.
  - `vendas.vendedor_id` é **quem cadastrou** (o perfil FoneNinja de quem digitou) e casa com
    `funcionarios.id` → nome. Ele **não** é o vendedor: é o **atendente**, e bate com
    `atendente_obs` em ~96% de julho/2026. Os ~4% que erram são atendente usando o login do
    colega — justamente o caso em que a comissão sairia errada.
  - O **vendedor online** (Mel, Isa, David) não tem perfil na FoneNinja — não cadastra venda.
    Pra ele a obs é insubstituível.
  - Existe uma **terceira fonte**, o `cadastrador` (quem estava **logado** ao lançar). A FoneNinja
    só manda esse campo junto das **contas a receber**: ele vive em `contas.raw->cadastrador`
    (`{id, nome}`), 100% preenchido, e **não tem coluna própria** em `vendas`. O `data.js` puxa
    só esse recorte via jsonb path (o `raw` inteiro são 14 MB; o recorte, 146 kB).
  - ⚠️ **Cadastrador NÃO é mais exato por ser automático** — ele mede o *login aberto*, não a
    pessoa. Em jul/2026: campo vendedor acerta o atendente em **97,3%**, cadastrador em **90,7%**.
    Quando os dois discordam, quem acerta é o campo vendedor. Ver a Conferência (`js/conferencia.js`,
    botão na tela de Vendas) antes de propor trocar a regra de registro do time.
- **Conta bancária do pagamento** (`pagamentos.conta_bancaria`) já vem do sync e alimenta a tela
  Contas. A lista de contas é montada do próprio dado — conta nova cadastrada na FoneNinja
  aparece sozinha, sem mexer no código.

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
