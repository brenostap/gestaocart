# Phone Cart — Painel interno das lojas

Painel de gestão das lojas **Phone Cart** e **Urban** (venda de iPhones/acessórios).
Telas: Vendas, Estoque, Tabela de preços, Equipe/Folha, Custos, Dashboard, Movimentações.

## Como rodar / testar
- É um **site estático** (HTML + JS puro, sem build). Pra testar local: servir a pasta
  (`python3 -m http.server 8080`) e abrir no navegador — precisa **login Supabase** (é do dono).
- Deploy: `main` publica (Netlify). ⚠️ **`git push` NÃO é deploy** — em 17/ago/2026 a conta estourou
  o crédito de build (`Skipped due to account credit usage exceeded`) e o site ficou **4 horas**
  servindo código velho enquanto os pushes entravam normalmente. Nada avisa. **Confira o deploy**
  (Netlify → Deploys) antes de tratar a mudança como no ar — e principalmente antes de mexer em RLS.
  - ⚠️ **Fechar policy é mudança quebrante pra quem está com código antigo.** Suba o front, confirme
    que está no ar, **e só então** feche o banco. Na ordem inversa, RLS devolve `200` com lista
    vazia — a tela diz "estoque zerado" e ninguém desconfia. Ver `docs/PERFIS-E-ACESSO.md`.
- ⚠️ **Mexeu em `js/` ou `css/`? Rode `./scripts/bump-versao.sh` antes de commitar.** O dono abre
  o painel por um **ícone na tela de início do iPhone**, que roda num WebView com cache próprio e
  ignora o `must-revalidate`: sem URL nova ele serve código velho calado. `js/versao.js` compara a
  versão rodando com a publicada e mostra a faixa "Nova versão" — mas só funciona se o `?v=` mudar.
  - O script usa **carimbo de tempo, não o hash do commit**: o hash só existe depois do commit, e
    rodar antes repete o valor anterior. Aconteceu em 01/ago/2026 — dois deploys com o mesmo `?v=`.
- **Teste do fechamento** (sem browser, sem rede): `node test/fechamento.test.js`. Carrega os
  `js/*.js` reais com stubs e prova que tela e exportação saem do **mesmo** `fechamentoEquipe()`.
  Rodar depois de mexer em comissão, meta, folha ou `calc()`.
- **Congelar o mês (fechamento pago)**: `node scripts/folha-snapshot.js YYYY-MM` confere e
  `--gravar` escreve em `folha_mensal`, uma linha por pessoa. Precisa de `SUPABASE_SERVICE_ROLE_KEY`
  no ambiente (nunca no repo, e **nunca num arquivo na raiz** — a Netlify publica a raiz).
  Ele carrega os `js/*.js` REAIS e chama `fechamentoEquipe()`, então é também a única forma de
  perguntar "de quem é esta venda?" fora do browser. ⚠️ Em 01/set/2026 `folha_mensal` ainda estava
  **vazia**: nenhum mês foi congelado, e o painel recalcula o passado com as regras de hoje.
- **Teste do registro da venda**: `node test/registro-venda.test.js`. Prova que **a obs manda** e
  que os campos estruturados da FoneNinja (vendedor/origem/cadastrador) só tapam buraco — e que
  atendente no campo vendedor **nunca** vira vendedor. Rodar depois de mexer em `getVendaInfo()`.
  Ele também **chama `renderVendas()`**: em 06/ago/2026 renomear uma chave da Conferência derrubou
  a tela de Vendas inteira e nenhum teste de unidade viu, porque ninguém montava a tela.
- **Teste do laço de render**: `node test/estoque-render-loop.test.js`. ⚠️ **Gancho de
  "carrega e redesenha" tem que ser guardado no REDESENHO, não no fetch.** Em 18/ago/2026 o
  Estoque congelou o celular do dono: `carregarBancada()` tem guard contra fetch duplicado, mas
  quando já está carregando devolve **promise já resolvida** — e `.then(renderContent)` virou
  laço de microtask, que tem prioridade sobre callback de rede, então **o fetch nunca resolvia**.
  1.502 renders/s, e 3.241 chamadas a `fotos_modelos` em 5 min (contra 4 do resto). Use
  `recarregarUmaVez()` em `estoque.js` pra qualquer gancho novo desse tipo.
- **Teste do estoque "fresco"**: `node test/estoque-fresco.test.js`. Prova que a resposta da
  FoneNinja **nunca encolhe nem apaga campo** do estoque. Até 18/ago/2026 a carga fazia
  `estoqueItens = ae` — trocava a lista inteira pelo payload do ERP, e campo que ele não traz
  (`valor_estoque`, `ultimo_fornecedor`) sumia calado. Hoje é merge por id, e nunca remove.
- **Teste da margem real**: `node test/margem-real.test.js`. Protege **o número que decide compra**.
  Fixa três coisas que erram calado e pro lado errado: a taxa de cartão é `taxa − taxa_extra` (a
  extra é **ganho**), parcela ausente **não vira zero**, e o carrego cresce com o tempo — no teste,
  o mesmo aparelho vale **R$845 com 5 dias e −R$40 com 300**. Rodar depois de mexer em
  `margemRealDoItem()`, `taxaCartaoEfetiva()` ou `CUSTO_CAPITAL_*`.
- **Teste do "Meu dia"**: `node test/meudia.test.js`. Prova que a tela vem da **chave**
  (`vo_key`/`at_key`), não do papel — o Vitinho é `bancada` e precisa dela —, que o sócio **não**
  ganha a tela, que o HTML não vaza campo de custo, e que a comissão bate com a curva do `core.js`.
- **Teste do espelho da regra de item**: `node test/regra-acessorio.test.js`. A classificação
  principal/acessório/cancelado existe em **dois lugares** (`js/equipe.js` e as funções
  `eh_*` no Postgres) porque o sócio calcula no navegador e o colaborador **não pode receber os
  itens** (`valor_estoque` é custo). Divergir ali não quebra tela: **paga comissão errada, calada.**
- **Teste do VO que atende**: `node test/atendente-vigencia.test.js`. Desde **31/ago/2026** o
  vendedor online que fecha a venda direto **é o atendente dela** e leva os 25% do lucro de
  acessório (`VO_ATENDE_KEYS` em `core.js`, espelho `at_key_vigente()` no Postgres). ⚠️ **Tem
  data**: abr–jul já foram pagos, e regra de comissão sem vigência reescreve mês pago em silêncio.
  Todo lugar que pergunta "esta chave é de atendente?" passa por `atKeysVigentes(ref)` — `AT_KEYS`
  cru só responde pelo regime antigo.
- **Teste da origem da venda**: `node test/venda-origem.test.js`. Monta o dashboard e prova que a
  seção "De onde vieram as vendas" **não soma o `provavel`** no dinheiro (o nível 5 erra 1 em 5) e
  que a **cobertura aparece na tela** — o número é piso, não total, e esconder o denominador seria
  mentir com fato. Rodar depois de mexer em `venda_origem` ou na seção de origem do dashboard.

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
- `js/render.js` — **tela de Vendas** (`renderVendas`) + `calc()`, a conta que a folha inteira lê.
  - ⚠️ O **dashboard saiu daqui em 20/ago/2026**: `renderDash()` (o legado, 466 linhas com 92
    estilos na mão) foi aposentado e o **`js/dash-v2.js` é o dashboard**. Três seções só existiam
    no legado — *De onde vieram as vendas*, *Cart vs Urban* e os alertas de margem — e como o V2
    era o padrão, estavam **invisíveis na prática**. Foram migradas no kit.
- `js/estoque.js` `js/tabela.js` `js/custos.js` `js/equipe.js` `js/movimentacoes.js` — as outras telas.
- `js/bancada.js` — tela **Assistência** (⚠️ chamava-se *Bancada* até 15/ago/2026; **só o rótulo
  mudou** — arquivo, tabela `bancada`, aba `currentTab='bancada'` e funções `bnc*` seguem iguais,
  então procure por "bancada" no código e por "Assistência" na tela) + `bancadaDoApple()`, que é o que
  o `estoque.js` chama pra pôr o selo "Na assistência".
- `js/fechamento.js` — exportação do fechamento (.xlsx, uma aba por colaborador). **Não calcula
  nada**: lê `fechamentoEquipe()` (equipe.js), que lê `calc()` (render.js). Se faltar um número,
  ele nasce em `fechamentoEquipe()`, nunca ali.
- `js/consulta.js` — tela **Pós-venda** (só `comercial`): acha a venda pelo final do IMEI, nome ou
  telefone e mostra quem está esperando aparelho na assistência. Lê **só views**
  (`v_venda_consulta*`, `v_assistencia_cliente`) — sem custo, lucro ou valor de serviço.
- `js/diario.js` — tela **Diário** (só sócio): o que foi medido, o que ficou decidido e **o que
  está em aberto, com quem**. Nasceu em 27/ago/2026 porque commit é pra dev e `docs/` é pra agente
  — faltava o lugar que o dono já abre. ⚠️ **Também é o changelog que a análise de série exige**
  (`docs/ANALISE-MAJU-AGO-2026.md`: *"carimbe toda mudança de prompt"*) — daí o tipo `prompt`.
  ⚠️ **O diário LINKA, nunca COPIA**: `resumo` são bullets do que mudou, `docs`/`commits`/`links`
  são ponteiro. Copiar conteúdo de `docs/` aqui cria terceira fonte de verdade e diverge.
  Teste: `node test/diario.test.js`.
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
- **Papéis com RLS de verdade: `socio`, `bancada` e `comercial`** — os três que o `CHECK` de
  `perfis` aceita (`PAPEIS_COM_RLS` em shell.js). `comercial` (David, Isa, Mel, Maria) lê
  **só views**, nunca as tabelas: `vendas`, `venda_produtos`, `estoque` e `pagamentos` têm
  policy `eh_socio()` e devolvem zero linha pra ele — é assim que tem que ser, ver
  `loadComercialData()` em data.js. `gerente`/`vendedor`/`atendente` seguem **só prévia
  visual** do dono e o `CHECK` não os aceita: criar um deles hoje daria tela aberta lendo
  zero linha. **Papel novo = escrever o RLS dele junto.**
- `bancada` (o Vitinho) vê só Estoque + Assistência, não entra em `VE_VALOR` nem `VE_MARGEM`, e tem
  carga própria (`loadBancadaData()` em data.js).
- Regra dos perfis comerciais: **colaborador vê o VALOR da venda** (negociou o preço) **mas não vê
  custo/lucro/margem**. `podeVerValor()` e `podeVerMargem()` são os interruptores.
- ⚠️ **View nova = `revoke all from anon, authenticated` + `grant select`.** Nunca só o grant, e
  nunca `from public, anon` — o Supabase concede ALL em objeto novo pra `authenticated` por
  default privilege, e `public` não alcança isso. **View não tem RLS e roda com os direitos do
  dono**: view gravável é bypass de RLS. Aconteceu em 20/ago e de novo em 26/ago.
- **Teste**: `node test/perfis.test.js` — prova a cortina, **não** a fechadura.

## Dados
- **Fonte:** Supabase (projeto `pfsfsibgmtbifypuyyqf`). O app **só lê**.
- **Sync FoneNinja→Supabase:** repo separado `brenostap/phonecar-sync` (`sync.js`), GitHub Action.
  Grava vendas, produtos, **pagamentos**, **contas a receber**, estoque, clientes, compras.
  - ⚠️ **O cron diz `0 * * * *`, mas o GitHub NÃO roda de hora em hora.** Medido em 31/ago/2026:
    as rodadas saem a cada **2–5h**, com vãos de 8h de madrugada — GitHub atrasa e pula cron
    agendado. As 2.049 execuções estão **todas verdes**: não é o job falhando, é o agendador.
    ⚠️ **`synced_at` engana pra baixo** — ele só muda quando a linha muda, então parece um vão de
    12h onde houve 4 rodadas. Pra saber se o sync rodou, olhe **Actions**, não `synced_at`.
  - ⚠️ **A rodada normal só relê os últimos 7 dias.** Correção feita na FoneNinja em venda mais
    velha que isso **nunca chega sozinha** — nem status, nem obs. É o que aconteceu em 31/ago: o
    dono concluiu 14 vendas pendentes de 03 a 29/08 e só as 4 da última semana entraram.
  - **No dia do fechamento, use o RUN FUNDO**: Actions → *Sync FoneNinja → Supabase* →
    **Run workflow** com **`resync_produtos = true`**. Ele abre a janela longa (~45 dias) e leva
    ~7min. O rótulo do input já diz isso certo ("abre a janela longa das VENDAS e dos produtos");
    até 01/set/2026 ele falava só em "produtos/acessórios" e escondia o efeito que importa.
    Rodar com `false` (o padrão) é a rodada normal, e não alcança o mês inteiro.
  - Por que não roda fundo sempre: ~7min × 24 × 30 = 5.000min/mês e o plano free dá 2.000.
    O `sync.js` já resolve isso — a rodada das 05h UTC abre a janela longa 1×/dia.
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
  `metas_mensais`, `funcionarios_config`, `tabela_precos`, `bancada`, `diario`/`diario_itens` — o browser **grava direto**
  por upsert (`setEquipeExtra()` em `equipe.js` é o modelo). **Mas escrita é por papel**, não é
  `auth_all` como já foi: `custos`, `metas_mensais`, `funcionarios_config` e `tabela_precos` pedem
  `eh_socio()`; `bancada`, `estoque_correcoes` e `estoque_estado` pedem `pode_operar()` (sócio ou
  bancada), e **apagar de `bancada` é só do sócio**. Detalhe em `docs/PERFIS-E-ACESSO.md`.
  - ⚠️ **`metas_mensais` é tabela MORTA — não cadastre meta ali achando que muda algo.** Ela tem
    uma única linha (2026-04) e **nenhum `js/*.js` lê ela**: as faixas da meta coletiva e da meta
    individual vivem em `metasColetivas()` e `metaAtFaixas()` no `core.js`, com vigência por mês.
    Medido em 01/set/2026. Mudar meta = editar o `core.js` e criar um degrau novo, nunca retroagir.
- **`reparos`** — serviços de bancada por aparelho, carregados das notas das assistências por
  `node scripts/reparos.js` (um dos dois **scripts** do repo que escrevem no Supabase — o outro é
  `scripts/folha-snapshot.js`; ambos usam `service_role` do ambiente, nunca do repo). É **camada analítica, não contábil**: o P&L continua lendo `custos`,
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
  - ⚠️ **Duas garantias, não uma** (26/ago/2026). `Garantia (já vendido)` queria dizer ao mesmo
    tempo *a nossa garantia pro cliente* e *a garantia que a assistência nos dá do serviço dela* —
    3 das 9 linhas `garantia` eram de aparelho `available`, e uma trazia "Garantia assistencia"
    escrito na **observação**. O dropdown de origem **saiu do formulário**: o caminho já responde
    (achou na busca = prateleira; *"não está no estoque"* = tem dono), e `bncDaPrateleira()` deriva.
    A segunda garantia virou coluna própria, **`bancada.retorno_de`**.
    - ⚠️ **A derivação tem três guardas e todas importam**: linha fechada há mais de um dia vale o
      gravado (status é o estado de HOJE — 35 linhas fechadas são de aparelho vendido *depois*);
      `estoqueItens` vazio **não deriva** (senão a lista de "não vender" sai vazia e o balcão vende
      aparelho que está fora); sem `apple_id` vale o gravado (são 15 linhas da planilha).
    - **Retorno não aparece na nota**: não há **uma única linha de R$ 0,00** nas 205 de `reparos`.
      Por isso ele fica fora do preço de referência (`bncPrecoRef`) e fora do `semNota` da
      Conferência — sem isso, toda refação viraria alarme falso.
  - ⚠️ **A Conferência tem DUAS bordas, e a de cima é a última nota carregada.** `reparos` vem de
    um script rodado à mão e **atrasa**: em 26/ago o livro começava em 13/ago e a nota parava em
    08/ago — janela vazia, e a tela acusava **40 aparelhos falsos**. Hoje `bncConciliar()` só cobra
    de quem voltou até `bncUltimaNota()`, e quando não há período em comum a tela diz *"Falta
    carregar a nota"*. **Nunca deixe o ✅ verde aparecer com janela vazia** — "nada foi comparado"
    não é "tudo bate", e a mentira silenciosa é pior que o alarme falso.
  - ⚠️ **O caminho "não está no estoque" oferece o aparelho do estoque.** Estava engolindo
    aparelho da prateleira: em 26/ago o `SP829` (15 Azul, R$ 2.400, `available`) estava na RR e
    **fora da lista de "não vender"**. A tela **sugere e a pessoa confirma olhando** — casar por 4
    dígitos sozinho já colou aparelho de cliente num apple do estoque, e há **dois 8849** hoje.
  - **O histórico de serviço aparece dentro do aparelho, na tela de Estoque** (26/ago/2026):
    campo **Investido** (compra + reparo) e o bloco *Assistência*, com data, fornecedor, serviço e
    R$ por ida. Montado por `bncHistoricoHtml()` em `js/bancada.js` — a tela de Estoque só pede,
    mesmo caminho de `bancadaDoApple()`.
    - ⚠️ **`reparos` e `bancada` não se somam.** A nota cai **dentro** de uma ida por contenção
      (mesmo fornecedor, data entre `saiu_em` e `voltou_em`); o que não encaixa vira linha própria.
      O total exibido é **só o da nota**, e por `apple_id` apenas — casar por 4 dígitos ali faria
      divergir do `reparo −R$X` da margem real, na mesma tela.
    - ⚠️ **"Sem valor" tem quatro motivos e só um é problema**: `↩ grátis` (retorno), `nota não
      carregada`, `ainda fora` e `sem cobrança`. Confundi-los manda o dono atrás de cobrança que
      não existe.
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
- **`venda_origem`** — de qual lead veio cada venda, e por qual método. Tabela **do painel**,
  populada **à mão** por `scripts/atribuicao/` (não vem do sync). Alimenta a seção "De onde vieram
  as vendas" do dashboard. Ler `docs/ATRIBUICAO-LEADS-VENDAS.md` antes de mexer.
  - ⚠️ **`confianca` não é enfeite.** `confirmado` (níveis 0–4) pode somar; **`provavel` (nível 5)
    erra 1 em cada 5** e fica fora de qualquer conta de dinheiro; `sem_origem` = avaliada e sem
    lead. **Venda sem linha ≠ venda com `sem_origem`** — a primeira nunca foi avaliada, e é essa
    diferença que permite medir cobertura sem chutar o denominador.
  - ⚠️ **`lead_id` só resolve dentro do projeto Supabase indicado em `projeto`** (cart ou urban, os
    bancos do Dudu). Não há FK possível entre projetos: o lead 16582 da Cart e o da Urban são
    pessoas diferentes.
  - A cobertura é parcial de propósito (só o período já processado) e **a tela mostra isso**. O
    número é piso, não total, e a falta pesa mais no Instagram — dá pra comparar canais, não pra
    afirmar quanto o Meta Ads devolveu.
- ⚠️ **Venda da IA não é venda da loja** (31/ago/2026). `maju` e `duda` fecham venda sozinhas
  (16 em jun/2026, 17 em jul, 9 em ago) e **não recebem comissão** — nisso são iguais à casa.
  Mas o balde é separado: `IA_KEYS`/`ehIA()` em `core.js`, `calc().iaMap` por chave em
  `render.js`, e linha própria no dashboard (*Maju (IA · Cart)*, *Duda (IA · Urban)*).
  Juntar com "Loja (casa)" apagava **quantas vendas o atendimento automático fechou e de qual
  loja** — que é o número que cruza com o lead depois. Espelho no banco: `apelidos.tipo='ia'`,
  e `vendas.vendedor_key` já grava `maju`/`duda` desde 17/ago (o dado existia, ninguém lia).
  Teste: a seção 5 de `node test/venda-origem.test.js`.
- ⚠️ **Quatro interruptores de dinheiro, não um.** `podeVerValor()` (valor da venda) ·
  `podeVerMargem()` (custo/lucro/margem) · **`podeVerCustoServico()`** (o que a assistência cobra —
  sócio e bancada) · **`podeVerBaseComissao()`** (a base da *própria* comissão — quem tem `at_key`).
  `money()` responde aos dois primeiros; **`moneyServico()`** ao terceiro. O papel
  `bancada` vê custo de serviço e **não** vê custo de aparelho: são dinheiros diferentes.
  - O quarto nasceu em 17/ago/2026 e é o mais fácil de confundir com `podeVerMargem()`. **Não é.**
    Ele mostra a soma **agregada do mês** do lucro de acessórios **das vendas da própria pessoa**,
    porque a comissão dela é 25% disso — e comissão que a pessoa não consegue conferir vira
    desconfiança. Nunca item a item; aí seria custo de produto.

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
  - ⚠️ **O apelido vira pessoa em UM lugar: a tabela `apelidos`** (17/ago/2026). `deni→denilson`,
    `ane→anne`, `viitnho→vitinho`… O `ALIASES` de `js/core.js` **não é mais a fonte** — o mapa
    precisa valer também pro RLS e pro sync, e mapa de gente duplicado já custou R$1.000 na folha
    em jul/2026. `vendas.vendedor_key`/`atendente_key` são preenchidas por **trigger no banco**
    (`resolve_venda_keys`), então valem pra qualquer caminho de escrita.
    - ✅ **Desde 02/set/2026 o trigger faz os MESMOS DOIS FALLBACKS do painel**: obs sem vendedor
      cai no campo `vendedor_nome` (só se for VO de verdade), obs sem atendente cai no
      `cadastrador_id`, respeitando `at_key_vigente()`. Antes disso, venda **sem obs** ficava com
      as duas chaves nulas e **sumia da lista "Minhas vendas" da pessoa, embora ela recebesse por
      ela** — 13 vendas em ago/2026, a maior de R$4.850 da Mel. Total certo, lista errada, que é
      pior: a pessoa soma o que vê e não bate. Migration
      `supabase/migrations/20260902_resolve_venda_keys_com_fallback.sql`.
      - ⚠️ `eh_vo_key()`/`eh_at_key()` são **espelho de `VO_KEYS`/`AT_KEYS`+`VO_ATENDE_KEYS`** do
        `core.js`. Mexeu num, mexe no outro — `node test/chaves-espelho.test.js` compara os dois.
      - ⚠️ O trigger lê `vendedor_obs`/`atendente_obs`, que o **sync** preenche. Obs de mês velho
        mal parseada pelo sync antigo **não se conserta sozinha**: só quando a linha for re-lida da
        FoneNinja. Em 02/set sobravam 6 assim em mai/jun, fora da janela de 45 dias.
    - ⚠️ **Mas o parser do trigger é MAIS FRACO que o do painel — não confira comissão por essas
      colunas.** Ele não resolve `Atendente. Anne` (ponto), `Atendente; Vitinho` (ponto e vírgula)
      nem `atendendo - mel`, que o `getVendaInfo()`/`parseObs()` (equipe.js) resolvem sem esforço.
      Em ago/2026 eram **16 vendas** com `atendente_key` NULL que a tela atribui normalmente. Quem
      lê a coluna acha venda órfã que não existe: aconteceu em 01/set/2026, e o número errado
      ("R$1.025 de acessório sem dono") só não foi pra frente porque o dono desconfiou.
      **Pra saber de quem é a venda, rode o `getVendaInfo()` real** (`scripts/folha-snapshot.js`
      mostra como carregar os `js/*.js` num vm), nunca a coluna.
      - ✅ **Consertado em 01/set/2026** no `sync.js` (repo `phonecar-sync`): os dois parsers
        agora batem em **1.000/1.000** vendas. Mas seguem sendo **espelho em repos
        diferentes** — mexeu num, mexa no outro e rode
        `node scripts/compara-parsers.js ../phonecar-sync/sync.js`, que tem que dar
        **DIVERGEM 0**. ⚠️ As colunas só ficam certas nas vendas **re-sincronizadas depois
        disso**: pro passado é preciso um RUN FUNDO.
    - **Ter chave ≠ receber comissão.** Sócios e as IAs (`maju` da Cart, `duda` da Urban) têm
      chave e não entram em `VO_KEYS`/`AT_KEYS`. Quem paga continua sendo o `core.js`.
    - `NULL` é resposta legítima: nome de loja no campo de gente, sobra de parsing, ou não
      identificado. **Venda sem dono tem que aparecer, não ser chutada pra alguém.**
    - ⚠️ Corrigir o mapa **mexe em mês já pago**: os typos resgatados são de mar–jun/2026. Hoje
      não quebra nada (nenhuma tela lê as colunas), mas o snapshot da folha tem que congelar os
      meses fechados **antes** de o front trocar de fonte. Ver `docs/PLANO-UPGRADE-2026-08.md`.
  - ⚠️ **Virada em ago/2026 — `vendas.vendedor_id` troca de significado.** Até 05/ago o campo
    vendedor da FoneNinja só tinha perfil de **atendente** (batia com `atendente_obs` em 97,3% de
    julho). Com os perfis dos vendedores online criados, ele passa a ser **quem vendeu**. Nada no
    banco marca a virada — quem ler a coluna sem saber disso mistura duas coisas.
    - **Medido em 17/ago: a virada não terminou.** `vendedor_nome` bate com o *atendente* em 94%
      de junho e 96% de julho, e com o *vendedor* em só **63% de agosto** — subindo por semana
      (6% → 53% → 85%). **Não serve como segunda fonte confiável ainda**; a obs continua mandando.
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
- `docs/PLANO-QUALIDADE-IA.md` — **como medir qualidade de lead e da IA.** ⚠️ Começa por um bloco
  **ESTADO** que diz o que já está pronto — leia esse bloco antes do plano, porque a arquitetura
  mudou em 27/ago e o corpo do doc ainda descreve a ordem antiga. Instrumentos:
  `scripts/separa-ia-vendedor.js` (separa IA de vendedor no Instagram),
  `scripts/camada2-painel.js` (as duas séries por segmento) e **`scripts/tags-atendimento.js`**
  (etiqueta a falha, com a frase que a gerou e o conserto). ⚠️ **Os três carregam armadilhas de
  medição no cabeçalho — todas custaram um erro meu. Ler antes de mexer.**
- `docs/IAS-E-ESPECIALISTAS.md` — **quem é IA e quem é gente no atendimento** (Maju=Cart, Duda=Urban;
  David/Mel/Isa/Maria são os especialistas), a chave que liga conversa→lead→venda, e o mapa de
  **todos** os relatórios das IAs — inclusive as views do Dudu (`dash_transfers`, `dash_vendas_ia`)
  que respondem o funil sem bater na produção. Ler antes de qualquer análise de atendimento.
- `docs/PEDIDO-DUDU-LABELS-CHATWOOT.md` + **`docs/RESPOSTA-DUDU-LABELS-V2.md`** — etiquetar lead no
  Chatwoot. ⚠️ **Leia o bloco ESTADO do primeiro e depois o segundo**: a proposta original caiu na
  verificação do Dudu, e as três coisas que ela derrubou valem pra qualquer análise de atendimento:
  - 🚨 **O cartão de handoff é texto que o MODELO escreveu**, parseado por regex no n8n — **só nome e
    telefone são apurados** (vêm do `BuscaLead`). `Interesse`, `Cor`, `À vista`, `Upgrade`,
    `Como recebe`, `Motivo` e `Obs` saem todos de string livre. Já mentiu: upgrade **inventado em
    39%** das conversas, cor do 16e errada em 52 sessões, cabeçalho errado por 10 semanas. **Não
    tratar cartão como dado.** A régua é: *tool call que executou* e *texto literal do cliente* são
    fato; **texto do modelo é opinião**.
  - 🚨 **Tabela com o MESMO NOME existe nos dois projetos do Dudu, com conteúdo diferente** —
    `n8n_chat_histories_instagram` (241.688 × 141.876 linhas), `match_resultado` (1.431 × 553).
    Consultar "a tabela do Instagram" sem nomear o projeto **devolve número errado sem dar erro**.
    Mesma classe do `lead_id`, que só resolve dentro do projeto indicado.
  - ⚠️ **Label do Chatwoot não aceita `:`** — o model `Label` valida
    `\A[\p{L}\p{N}]+[\p{L}\p{N}_-]+\z` e faz `downcase`. É esse model que carrega `color` e
    `show_on_sidebar`, então prefixo com `:` **não tem cor nem barra lateral**. Separador é `_`.
- `docs/funcoes/` — **o que cada papel da equipe é responsável por fazer** (um arquivo por
  função, não por pessoa). O `README.md` de lá tem o mapa de onde vive cada informação de
  colaborador: cadastro (`FUNC`), dados editáveis (`funcionarios_config`), acesso (`perfis`),
  apelidos (`apelidos`) e folha (`SALARIOS`). ⚠️ Só markdown ali — a Netlify publica a raiz.
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
