# Ideias & Backlog — caderno de ideias do projeto

Lugar pra guardar ideias conforme surgem, sem perder no caminho — a gente faz
**uma coisa de cada vez**, então o resto fica anotado aqui. Organizado por área.
Quando formos trabalhar numa área, o Claude **lê a seção dela** e vê o que encaixa
pra fazer junto. Formato livre: título curto + 1 linha. Pode editar à vontade.

Status: 💡 ideia · 🔨 em andamento · ✅ feito · ❄️ pausado · ⭐ = alto valor (recomendação do Claude)

## Tela de Vendas
- ✅ **Master-detail (construído jul/2026)**: linha enxuta (#Venda · Data · Cliente · Loja · Produto · Vendedor · Atendente · Valor · Lucro) + **ficha da venda** docada no desktop / sheet no celular. Blocos: Cliente (cidade/WhatsApp/Instagram) · Aparelhos (IMEI/custo/valor/lucro/origem) · Acessórios · Pagamento por forma (valor·parcelas·taxa·líquido·conta) · Upgrade · Resumo. Clicar seleciona; tocar de novo fecha.
  - Código: `renderVendas`/`fichaVendaHTML` (render.js), `_pagamentos` exposto em data.js, classes `.v-stage`/`.v-ficha`/`.vf-*` em components.css.
  - Mock de referência: claude.ai/code/artifact/19d0055e-6811-4fae-ba82-f000c3c5728c
- ✅ **Ficha abre/fecha (jul/2026)**: fechada, a lista ocupa a largura toda; abre ao clicar, ✕ (ou clicar de novo) fecha; sheet no celular. `selecionarVenda`/`fecharFicha`.
- ✅ **Resumo do dia entre os dias (jul/2026)**: faixa recolhível por dia na lista — peças (total/Cart/Urban), bruto, lucro, acessórios (bruto+lucro); expande p/ vendas+comissão por vendedor, comissão dos atendentes e **quanto entrou por forma de pagamento** (cheio+líquido). `resumoDiaHTML` (render.js). Só na ordem cronológica; ordenar por coluna vira lista plana. ⚠ comissão de vendedor no valor base (R$25/un) — faixa R$35 e metas são mensais (Dashboard).
- ✅ **Resumo do dia quebra o pagamento por conta (06/ago/2026)**: com as 4 contas novas (Cart/Urban × Pix/Crédito, desde 04/ago), a seção *Pagamento* mostra sublinha por conta quando a forma se divide — `CART Mercado Pago` / `URBAN PagSeguro` embaixo do Pix. `pagContaInfo()` + `resumoDiaHTML` (render.js), `.v-dia-sub` (components.css). Débito (PagBank) e dinheiro (Caixa) **não** separam loja — se o dono criar conta de débito por loja, aparece sozinho.
- ✅ **Conferência mede a virada do registro (06/ago/2026)**: além de "quem atendeu", mede a regra nova (campo vendedor = vendedor online) com **cobertura** + **acerto**, lado a lado com a regra antiga que vai cair. `js/conferencia.js`; contexto em `docs/REGISTRO-VENDA-2026-08.md`.
- 💡 Colunas fixas (Data + Cliente) ao arrastar pro lado (a linha enxuta já rola menos; falta o sticky de coluna).
- 💡 Seletor de colunas opcionais na tabela (Taxa/Margem/Parcelas), com o app lembrando a escolha.
- 💡 Filtros: forma de pagamento, status, busca por IMEI.
- 💡 ⭐ Selo nas vendas com "líquido furado" (~9% que a FoneNinja erra) — apontar onde não confiar no lucro.
- 💡 Linha de totais no rodapé; comparar com período anterior.
- 💡 Cartão de venda pensado pro celular (balcão).
- ✅ Badge de forma de pagamento por venda (Pix/Crédito/Débito/Dinheiro).
- ✅ Colunas parcelas/taxa/líquido/margem + toggle "Mais colunas".

## Tabela de preços
- ✅ **Seções empilhadas + linha por modelo (02/ago/2026)**, inspirado na tabela que a loja posta nos
  stories. Antes: chip de condição mostrava **uma** condição por vez e todas as variantes de GB abertas.
  Agora: **Seminovos** primeiro, **Lacrados** abaixo, lista contínua; uma linha por modelo (fechada,
  mostrando cores e **faixa de preço**), que abre nas capacidades. Chip de condição virou `Todas` +
  filtro. Categoria com iPhone na frente (`PRECO_CAT_ORDEM` em tabela.js).
- ⚠️ **No celular a coluna Upgrade sai da tabela** e o valor aparece embaixo do nome. Três colunas de
  número não cabem em 375px sem cortar o Varejo — que é justamente a coluna que se olha.
- 💡 **Mesmo padrão em Vendas** (pedido do dono, ago/2026): linha fechada por venda, expande em linhas.
  Compras já funciona assim (`comprasAbertas`).
- 💡 **Gerar a imagem do story a partir da tabela.** Hoje a arte é feita à mão e os preços são copiados —
  fonte dupla, erra fácil. A tela já tem os dados agrupados do jeito que o story mostra.
- ⚠️ **Dado da planilha:** existem `17 Pro Max` e `17 pro Max` (p minúsculo) em Lacrado — viram **dois
  modelos separados** na tela. É typo na planilha, corrige lá.

## Tela de Compras
- ✅ **Aba Compras (jul/2026)**: espelho de Vendas. Uma compra por linha (ordem de registro = `data_entrada desc`); **clicar expande a linha inline** com os itens um por linha (modelo/série/IMEI/custo). Coluna Fornecedor mostra a qtd de itens; selo **parcial** (itens capturados < `qtd_produtos`) e **sem detalhe** (0 capturado). KPIs (compras/itens/valor), filtros (fornecedor + busca fornecedor/modelo/IMEI via `ilike` no servidor), período do contexto. **Só sócio** (todo valor é custo); **estoque único** — ignora o filtro de loja (a tabela `compras` não tem loja).
  - Código: `renderCompras`/`comprasDetalheHTML`/`alternarCompra` em `js/compras.js` (arquivo novo). **Carga sob demanda**: cabeçalhos `compras` (janela 6m) + contagem leve de `compra_produtos` no 1º open; itens completos só ao expandir. Reusa `.est-detalhe`/`.est-linha.aberta` (Estoque) e `.vf-item` (ficha de Vendas) → zero CSS novo.
- 💡 Cruzar com Estoque (`ultimo_fornecedor`) pra ver o que de cada compra ainda está parado/vendido.

## Tela de Custos
- ✅ **Duas vistas (31/jul/2026)**: a tela deixou de ser tabela plana.
  - **Mês** — KPIs (total · vs mês anterior · maior área), cards **Cart / Urban / Compartilhado**
    (valor próprio + o efetivo com rateio), *Resultado após custos*, **Faltando lançar** e uma
    **seção por área** com barra de participação e %. Dentro da área, uma linha por **grupo**
    (mesma descrição + loja); a linha **expande** e mostra cada lançamento com data, obs e
    editar/remover. Ordenado por valor.
  - **vs mês anterior** — barra divergente por área (linha central = mês passado), `de → para`,
    Δ em R$ e %, ordenado da maior alta pra maior queda + leitura em texto.
  - Código: `renderCustos`/`custoGrupoHTML`/`custoAreaHTML`/`custoComparativoHTML`/`custoFaltandoHTML`
    em `js/custos.js`; classes `.cst-*` em `components.css`. Referência: prints do projeto de custos.
- ✅ **Faltando lançar (31/jul/2026)**: o mês passado vira checklist — o que existia lá e não
  apareceu aqui, com botão **lançar** que abre o modal já preenchido (`repetirCusto`). Enquanto
  houver item na lista, o KPI "vs mês anterior" **perde o verde e fica âmbar**: queda com custo
  por lançar não é economia.
  - Casamento entre meses por `custoChaveGrupo` = descrição normalizada (sem acento/pontuação e
    **sem o que está entre parênteses**) + loja. É o que faz "Salário Leo (20 dias)" casar com
    "Salário Leo". ⚠ Renomear um custo quebra o par (vira "novo" + "faltando").
- 💡 Marcar custo **recorrente** (aluguel, contador, Empire) e gerar/cobrar sozinho no mês novo,
  em vez de depender do checklist.
- 💡 Subgrupos dentro da área (ex.: "Juros de capital" juntando os 4 empréstimos) — hoje cada
  descrição diferente é uma linha.
- 💡 Média dos últimos 3 meses ao lado do mês passado, pra não comparar com um mês atípico.
- 💡 Custo por aparelho vendido (custo total ÷ peças) como termômetro de eficiência.

## Equipe / Metas
- ✅ **Dia de prateleira na Vitrine (26/ago/2026).** `dias_parado` entrou em `v_estoque_vitrine`;
  o cartão traz selo a partir de 60 dias (vermelho aos 90) e há chip de filtro com a contagem.
  Contexto do problema: §10 do
  documento de mídias (`docs/funcoes/midias-e-conteudo.md`) cobra dele visibilidade pro que está
  parado. Medido em 26/ago: dos 232 disponíveis, média **29 dias**, mas **25 passam de 60 dias
  (R$ 56.100)** e 15 passam de 90 — com carrego de 0,1%/dia, 60 dias comem ~6% do custo. `dias
  parado` vem de `v_estoque_margem`, que é `eh_socio()`, e a `v_estoque_vitrine` não traz o campo
  (`estoque.created_at` está **vazio em 100%**, não serve de proxy). Ele só enxerga o estado
  `saldao` (7 aparelhos hoje). **Somar `dias_parado` à `v_estoque_vitrine` resolve** — é dia de
  prateleira, não é custo, então não fere a regra de não mostrar custo pro `comercial`.
- 🔨 **Login de Leo, Gabi e Davi — `scripts/criar-perfil.js` (26/ago/2026), falta rodar.**
  Cria o usuário no Auth e a linha em `perfis` a partir do `FUNC` (sem segunda tabela de gente).
  ⚠️ **Leo e Gabi não têm e-mail no cadastro** — passar `--email`. Contexto: `perfis` tem 7
  linhas: Vitinho (`bancada`), David/Isa/Mel/Maria (`comercial`) e os dois sócios. Dos **seis** com
  `atKey`, só dois abrem a própria comissão. A tela *Meu dia* já existe e já vem da chave
  (`at_key`), não do papel — falta só o perfil. O documento dos atendentes
  (`docs/funcoes/atendente-de-vendas.md`, §14) diz na cara que "os atendentes trabalham com
  comissão" e que oferecer acessório aumenta o resultado deles; sem login, eles não conseguem
  conferir. ⚠️ Papel `comercial` lê só views — criar perfil pra eles é barato, mas conferir antes
  se as views do *Meu dia* cobrem quem é só AT (sem `vo_key`).
- ⚠️ **A obs da venda é regra escrita, e agosto mostrou o custo de errar.** O §7 do documento dos
  atendentes manda conferir "vendedor responsável" e "observações necessárias". Em ago/2026: um
  `Vendedor Davi` (typo de David) que não pagou ninguém em R$3.950 · duas vendas com `vendedor:` em
  branco (R$3.450 cada) · um `venda online` que virou o vendedor e apagou a Mel (R$2.750) · um
  `atendendo - mel` que jogou fora os 25% de uma venda de R$8.000 · 3 vendas na loja errada
  (R$14.710). **O documento agora carrega o formato de três linhas** — vale colar no grupo.
- 💡 **Dois documentos cobram a MESMA lista de testes** (§10 do atendente e §4 do coordenador de
  estoque: tela, Face ID, câmeras, flash, áudio, microfone, botões, carga, Wi-Fi, BT, eSIM,
  bateria) e o resultado não é registrado em lugar nenhum. Se virar campo, tem que servir aos dois
  momentos: o teste da entrada (estoque) e o teste da entrega (balcão, com o cliente na mesa).
- ✅ **Dono do aparelho na assistência (26/ago/2026).** `bancada.cliente_nome` e `cliente_tel`,
  perguntados só no caminho "não está no estoque"; a busca da tela acha por nome e telefone.
  Contexto: `bancada` não tem coluna de
  cliente: o campo `quem` é o e-mail de quem *registrou* (hoje sempre o Vitinho). Das 168 idas,
  **13 são `origem='cliente'` e 8 `garantia`** — em nenhuma dá pra dizer de quem é o aparelho, e é
  a Maria (pós-venda) quem precisa responder isso ao cliente. Duas colunas em `bancada`
  (`cliente_nome`, `cliente_tel`) resolvem, e a tela de Assistência já é do papel `bancada` —
  não precisa de RLS novo. **O buraco mais barato das quatro funções documentadas.**
- ✅ **Tela de Pós-venda (26/ago/2026)**: `js/consulta.js`. Busca única — final do IMEI, nome ou
  telefone — e abre a ficha da venda com os itens, o IMEI e selo de quem está na assistência.
  Antes de qualquer busca ela mostra **quem está esperando aparelho**, com os dias fora.
  Views `v_venda_consulta`, `v_venda_consulta_itens` e `v_assistencia_cliente`.
- 💡 **Continua não existindo controle de CASO** (§8 do documento da Maria): status, data do
  primeiro contato, último retorno dado, próxima ação, data de finalização. Não está no painel nem
  no Chatwoot — lá é conversa, não caso com status. É a diferença entre "o aparelho está na RR" e
  "a cliente está esperando resposta desde terça". Se virar tela, o modelo natural é o mesmo da
  `bancada`: uma linha por caso, aberta e fechada, com `apple_id`/IMEI ligando ao aparelho.
- 💡 **Garantia não tem regra cadastrada.** Dá pra derivar "está no prazo?" da data da venda, mas o
  prazo por tipo de produto não existe em lugar nenhum do sistema. Sem isso o §5 do documento da
  Maria depende de memória.
- 🔨 **Isa vira gerente em setembro/2026** (decidido em 26/ago). Documento da função em
  `docs/funcoes/gerente-de-loja.md`. **Agosto fecha pela regra antiga** — ela segue vendedora
  online, comissão por device e `SALARIOS.isa = 1500`; mês pago não muda de valor depois.
  Três coisas precisam ser decididas ANTES da virada, e nenhuma é automática:
  - **Remuneração de gerente não existe no `equipe.js`.** O `calcComissaoFunc()` só sabe pagar VO
    (device), AT (25% de acessório), bônus de meta e os 5% da Anne. Fixo de gerente + algo atrelado
    ao resultado da loja é regra nova — e mexe na folha, então tem que entrar com o mês certo.
  - **Acesso.** Ela é `comercial`: vê Meu dia / Vitrine / Tabela e lê só views. Metade dos
    indicadores que o documento cobra dela (vendas por vendedor, meta, cancelamentos/trocas,
    resultado vs. mês anterior) está atrás de `eh_socio()`. Papel `gerente` está em `PAPEIS` mas o
    `CHECK` de `perfis` não aceita — **papel novo = escrever o RLS dele junto**, ou ampliar as views
    do `comercial`. A segunda opção é mais barata e não inventa papel.
  - **Meta.** Se ela para de vender no volume de hoje, os 100 aparelhos/mês dela têm que ir pra
    outra pessoa ou sair da conta — senão a meta coletiva da loja encolhe sozinha em setembro.
- 💡 **Dois indicadores do documento de gerência o painel não responde**: *conversão* e *clientes em
  negociação*. Vivem no Chatwoot e nos bancos de lead do Dudu, não aqui. Se a gerência vai ser
  cobrada por eles, ou a Isa abre dois sistemas todo dia, ou o painel puxa as views do Dudu
  (`dash_transfers`, `dash_vendas_ia` — ver `docs/IAS-E-ESPECIALISTAS.md`).
- ✅ **Função do Vitinho documentada (26/ago/2026)**: `docs/funcoes/coordenador-estoque-qualidade.md`.
  O documento é quase o retrato do papel `bancada` — §7 (assistência) é a tabela `bancada`, §3 e §8
  (etiqueta/cadastro divergente) são `estoque_correcoes`, §5 (separar reservado/com problema) é
  `estoque_estado`. **Três itens do documento não têm nada no painel**, listados abaixo.
- 💡 **§4 Testes e qualidade — não existe checklist.** O documento cobra teste de câmera, Face ID,
  áudio, botões, tela, carregamento, Wi-Fi/Bluetooth, eSIM e saúde da bateria antes de o aparelho
  ir pra venda; hoje o resultado disso não fica registrado em lugar nenhum — só o estado
  `precisa reparo` em `estoque_estado`, que diz *que* tem problema, não *o que* foi testado.
  Encaixa em `estoque_estado` (é informação nossa, não converge pra FoneNinja) ou numa tabela
  própria por aparelho. Pensar junto com a ideia de "aparelho pronto pra venda".
- 💡 **§2 Conferência de entrada — não existe.** `compras` é read-only do sync; não há onde marcar
  "conferi a nota contra o que chegou". É o mesmo formato da Conferência da Assistência (na nota
  sem registro · registrado sem nota · valor diferente), aplicado à compra.
- 💡 **§6/§8 Transferência entre lojas — não existe** como movimentação. A tela Movimentações tem
  Saídas / Entradas / Clientes. Aparelho que muda de loja hoje não deixa rastro no painel.
- ✅ **Descrição de função virou documento (26/ago/2026)**: `docs/funcoes/` — um arquivo por
  **função**, não por pessoa (a pessoa sai, a função fica). O primeiro é o de **Gerente de
  Acessórios**, que a Anne ocupa. Só markdown ali: a Netlify publica a raiz, PDF commitado vira URL
  pública. O índice (`docs/funcoes/README.md`) tem o mapa de onde vive cada informação da equipe.
- 💡 **O cargo da Anne no `FUNC` ainda é `Atendente`**, mas ela já recebe como gerente de
  acessórios: `f.bonus` (só ela tem) paga **5% do lucro de acessórios da loja inteira**, não só do
  que ela vendeu — `equipe.js:160`. O cargo aparece na tela de Equipe e no cabeçalho do fechamento;
  trocar pra "Atendente / Gerente de Acessórios" é seguro (só `(saiu)` é interpretado pelo código).
- ⚠️ **Metade do documento da gerente de acessórios não tem dado no painel.** As seções 4, 9 e 10
  (estoque, produtos parados, reposição) pedem quantidade disponível, giro e o que está acabando —
  e o `estoque` do painel tem **232 itens, 230 com IMEI e nenhum acessório** (medido em 26/ago).
  O acessório só existe *depois de vendido*, dentro de `venda_produtos` (`isAcess()`: sem IMEI,
  sem apple_id, < R$200). Dá pra responder "o que vendeu e com que margem"; não dá pra responder
  "o que tem na gaveta" nem "o que está parado". Ver se a FoneNinja expõe esse estoque no `fn`
  antes de pensar em contagem à mão.
- ✅ **Ex-funcionário some das telas (02/ago/2026)**: `saiuDaEquipe(f)` em `core.js` é a **única**
  leitura do marcador `(saiu)` no cargo. Tira a pessoa dos rankings do dashboard, dos **cards da
  Equipe** (era o vazamento: `renderEquipe` montava as listas do `FUNC` cru, então Pietra e Luana
  continuavam aparecendo) e da folha. **O cadastro fica no `FUNC` de propósito** — sem ele, venda
  antiga da pessoa viraria "venda da loja" e o histórico mudaria sozinho.
- 💡 Se um dia quiserem consultar quem saiu, uma seção "Ex-equipe" recolhida na tela de Equipe
  resolve sem sujar a visão do mês.
- ✅ **Faixas de meta coletiva viraram fonte única (31/jul/2026)**: `metasColetivas(ref)` em `core.js`.
  Estavam **copiadas em 6 lugares** (equipe.js ×3, render.js ×2, dash-v2.js ×1) — e um deles
  (o dashboard legado em `render.js`) estava travado no regime antigo. Regra: **nunca retroativa**,
  cada tabela nova é um degrau por mês.
  | vigência | aparelhos | acessórios (bruto) |
  |---|---|---|
  | até mai/2026 | 300→200 · 350→400 · 400→550 | 20k→150 · 25k→200 · 30k→500 |
  | jun/2026 | 350→500 · 400→750 · 450→1000 | 25k→200 · 30k→500 · 40k→750 |
  | jul/2026 + | 400→600 · 450→800 · 500→1000 | 30k→400 · 40k→700 · 50k→1000 |
  - ⚠️ A meta de devices conta **APARELHOS**, não número de vendas (confirmado com o dono em
    31/jul/2026, apesar de a mensagem das metas dizer "400 Vendas").
  - **ago/2026 mantém a mesma tabela coletiva** (decidido em 03/ago/2026).
- ✅ **Meta individual do atendente ganhou degrau de 15k (03/ago/2026)**: `metaAtFaixas(ref)` em
  `core.js`. Também passou a ter **tabela por mês** — antes era lista fixa, porque as faixas nunca
  tinham mudado.

  | vigência | faixas (bruto de acessórios → bônus) |
  |---|---|
  | até jul/2026 | 4k→100 · 6k→300 · 10k→1000 |
  | ago/2026 + | 4k→100 · 6k→300 · 10k→1000 · **15k→1500** |

  - ⚠️ **Não podia entrar sem data**: Anne fez **R$15.830 em mar/2026** e R$13.940 em abr — sem a
    tabela por mês o fechamento de março dela subiria sozinho de R$1.000 para R$1.500, meses depois
    de pago.
  - ⚠️ As telas calculavam a barra de progresso com as faixas **chumbadas na mão**
    (`nextVal/prevVal` 4000/6000/10000 em `render.js`, `nivel===3` em `equipe.js`): quem fizesse 12k
    apareceria como "🏆 meta máxima" e o degrau novo passaria batido. Agora `metaAtendente()`
    devolve `total`/`maxima`/`anterior` e a tela não sabe quantas faixas existem.
  - 💡 **Incentivo marginal cai no degrau novo**: de 6k→10k o bônus sobe R$700 por R$4k vendidos
    (R$175/mil); de 10k→15k sobe R$500 por R$5k (**R$100/mil**). Quem já está em 10k tem menos
    razão pra ir ao 15k do que teve pra sair do 6k. R$1.800 manteria o incentivo constante —
    apontado ao dono em 03/ago/2026, que optou por R$1.500.
- ✅ **Saída de funcionário passou a ter data (03/ago/2026)**: `saiuEm:'YYYY-MM'` no `FUNC`. O
  `(saiu)` sozinho apagava a pessoa de **todos** os meses — Denilson saiu em 31/jul e sumiria de
  julho, que já tem salário, hora extra e o bônus coletivo dele lançados. `AT_LABELS_ALL`/
  `VO_LABELS_ALL` viraram `atLabelsAll()`/`voLabelsAll()`: eram `const` avaliado na carga, não davam
  conta de lista que muda com o período.
- ✅ **Quem está de férias fica fora do rateio do bônus coletivo (03/ago/2026)**:
  `SEM_BONUS_COLETIVO` em `config.js` + `entraNoBonusColetivo()` em `core.js`. O coletivo é pago
  **cheio por cabeça**, então quem passou o mês fora levaria até R$2.000 sem gerar nada. Vale só de
  **ago/2026 em diante** — Anne esteve de férias em jun/2026 e recebeu; aquele fechamento fica como
  está. Folha, resumo de WhatsApp e `.xlsx` dizem quem ficou de fora.
- ✅ **Híbrido (vendedor + atendente) contava só um lado na tela (03/ago/2026)**: `calcComissaoFunc`
  decidia por `if(f.tipo===...)`, e Maria é `tipo:'online'` **com** `atKey` — parava no primeiro
  branch, então o bruto de acessórios dela aparecia **zerado** na tela de Equipe enquanto a folha
  pagava os 25% certinhos. Agora os dois lados são contados independentes, igual `fechamentoEquipe()`
  sempre fez, e quem é os dois entra nos **dois rankings**. Só não tinha estourado porque ela fez
  R$410 de acessório em jul/2026.
- 📌 **Previsão de agosto/2026** (expectativa por pessoa, **não** é configuração — o sistema tem uma
  escada só, igual pra todos):
  - Aparelhos: Mel 150 (já fez 162 e 157) · David 130 (média 128) · Isa 100 (patamar normal;
    julho/72 foi fora da curva) · Maria 55 (SAC primeiro, menos leads).
  - Acessórios: Leo 15k (ele pediu) · Anne 15k (**já fez 15.830 em mar/2026**) · Gabi 8k
    (1º mês cheio) · Vitinho 7k (contrapartida do fixo que subiu pra R$3.000) · Maria sem meta.
  - Soma ≈ 470 aparelhos e 45k de acessórios, contra 366 e 38.345 de julho. Sazonalidade de
    2025 (jul→ago **+18%**) e crescimento anual (**+32%**) apontam os dois para ~430 aparelhos.
- ✅ **Bônus viram lançamento em Custos (decidido em 01/ago/2026).** Antes só o salário entrava;
  o "Resultado após custos" desconta apenas as comissões (`voTot`+`atTot`), então os bônus saíam
  do caixa sem aparecer em lugar nenhum. Agora são **3 lançamentos por mês** na área `funcionario`:
  *Bonus meta coletiva* · *Bonus meta individual* · *Bonus 5% acessorios Anne*. Em jul/2026:
  4.000 + 2.300 + 1.305 = **R$ 7.605**.
  - ⚠️ **Comissão NÃO entra em Custos** — o resultado já a desconta; lançar seria contar duas vezes.
  - ⚠️ O valor dos 5% depende do lucro de acessórios, que muda a cada resync fundo. Em jul/2026 o
    lançamento teve que ser corrigido de 1.287 para 1.305 depois do resync de 45 dias. **Fechar a
    folha só depois de rodar o resync fundo do mês.**
- ✅ ⭐ **Exportação do fechamento — documento de prova por colaborador** (feito em 01/ago/2026).
  Botão *Exportar fechamento* na aba Equipe, gerando um `.xlsx` com **uma aba por colaborador**
  (+ aba Geral). Serve pra resolver questionamento de comissão: abre a aba da pessoa e mostra venda
  por venda. Código em `js/fechamento.js`; teste em `test/fechamento.test.js`.
  - **Como ficou a "fonte única":** `calc()` (render.js) passou a guardar o detalhe **por venda**
    (`voMap[k].linhas` / `atMap[k].linhas`) **dentro do mesmo laço que soma o agregado** — não há
    segunda conta, é a mesma conta guardada em detalhe. Em cima disso nasceu
    **`fechamentoEquipe()`** (equipe.js), de onde saem os 4 consumidores: tabela de fechamento,
    resumos de WhatsApp, card individual e a exportação. Antes eram 3 cópias de `cvF/caF/bmF` +
    lista de pessoas escrita à mão.
  - **Formato: `.xlsx` via SheetJS por CDN, carregado só no clique.** O app não tem bundler; um
    `<script>` fixo custaria ~900KB em toda visita por um botão usado 1×/mês. Carregar sob demanda
    também não mexe na ordem de carga do `index.html`. `.xlsx` (e não CSV/SpreadsheetML) porque
    abre limpo no Numbers, Excel e Google Sheets — e o requisito é *uma aba por pessoa*.
  - **Arredondamento:** a folha paga em reais inteiros. As linhas do atendente são arredondadas pelo
    **maior resto** (`distribuirEmInteiros`), então Σ da coluna = total pago, exato. A comissão da
    linha do vendedor é **o quanto ela acrescentou no acumulado** — assim a curva de 80 un fecha
    exata e a linha onde a taxa vira R$35 fica visível.
  - **Quem entra na folha** agora vem do cadastro (`FUNC` + `VO_KEYS`/`AT_KEYS`, sem `(saiu)`),
    igual aos rankings. Ninguém mais some por lista hardcoded.
  - ⚠️ **Bug corrigido de quebra:** o "Lucro líquido após folha completa" descontava os bônus
    **duas vezes** desde que eles viraram lançamento em Custos (01/ago) — subtraía a área inteira
    de Custos *e* os bônus de novo (−R$7.605 a mais em jul/2026). Agora é
    `lucro − folha − custos fora da área funcionário`.
  - ⚠️ O card individual mostrava número **diferente** da tabela logo abaixo: usava `SALARIOS` em vez
    do lançamento, e no caso híbrido (Maria) ignorava a curva de 80 un. Some com a fonte única.
  - **Faixas de meta individual e curva do vendedor viraram fonte única** em `core.js`
    (`META_AT_FAIXAS`/`metaAtendente()` e `VO_CURVA`/`comissaoVendedor()`) — estavam copiadas em
    **14 lugares** entre equipe.js, render.js e dash-v2.js.
  - **Decisões fechadas com o dono:** recurso do painel, todo mês (não entrega única) · **arquivo é
    só do dono**, não vai pra equipe, então pode mostrar custo/lucro/margem sem restrição ·
    **uma linha por venda** (não por acessório — seriam ~700 linhas/mês) · cada aba leva resumo no
    topo, metas com o quanto faltou, comparativo com o mês anterior, e a lista de vendas · mais uma
    **aba geral** com todos lado a lado e ranking.
  - Colunas: **vendedor** = id · data · cliente · unidades · comissão. **atendente** = id · data ·
    cliente · bruto de acessórios · lucro · os 25%. A soma da coluna tem que bater com o resumo.
  - ⚠️ **Regra inegociável: o arquivo não pode ter cálculo próprio.** Tem que sair do mesmo `calc()`
    (render.js) e do mesmo `gerarResumoEquipe` (equipe.js) que a tela usa. Se divergirem, o
    documento perde a serventia. Refatorar pra expor o número por venda é ok — duas fontes não.
  - ⚠️ **O salário vem dos lançamentos de Custos, não da constante `SALARIOS`** (`salarioFechamento`).
    A constante tem o valor cheio; a folha real tem Vitinho R$2.750 (férias) e Gabi R$1.161
    (proporcional). Sem lançamento no período, cai na constante **e avisa** na aba Geral.
  - 💡 **A aba geral é praticamente a tela de Fechamento**, que hoje é placeholder (`renderFechamento`
    em shell.js diz "não foi construída"). `fechamentoEquipe()` já entrega tudo que ela precisa.
  - **Teste de aceite — julho/2026** ✅ conferido contra o banco em 01/ago/2026 (bate nos 10).
    Estes são os valores **pela regra**; o pago em julho ficou **R$45.296** = 43.096 + R$1.500 de
    hora extra + R$700 do ajuste de meta do Davi (ver "Extras nominais" abaixo):
    Anne 6.643 · Leo 5.786 · Mel 5.125 · Maria 4.694 · Davi 4.615 · David 4.250 · Isa 3.650 ·
    Vitinho 3.169 · Denilson 3.024 · Gabi 2.140 · **total 43.096**. Base: 355 aparelhos ·
    R$38.345 de acessórios (bruto) · R$26.090 de lucro em acessórios · coletiva R$400/pessoa.
    Unidades: Mel 115 · David 90 · Isa 70 · Maria 49. Bruto de acessórios: Leo 11.695 ·
    Anne 10.125 · Davi 9.960 · Gabi 3.315 · Denilson 2.660 · Maria 410 · Vitinho 180.
- ✅ **Extras nominais na folha (01/ago/2026).** Lançamento em Custos na área `funcionario` com o
  campo **`funcionario` preenchido e `fixo=false`** entra na folha como **linha própria com a
  descrição** — hora extra, ajuste de meta, vale. Não incha o salário: o documento de prova precisa
  dizer *por que* aquele valor existe. `remuneracaoFixa()` separa `fixo=true` (salário) de
  `fixo=false` (extras). A coluna "Extras" na tabela só aparece nos meses que têm extra.
  - **Hora extra: R$30/h, hora arredondada pra cima** (decidido em 01/ago/2026). Em jul/2026:
    Anne 18h33→19h · Denilson 14h10→15h · Léo 11h55→12h · Gabi 2h50→3h · Davi 1h. **50h = R$1.500.**
  - **Meta do Davi arredondada** em jul/2026: bruto R$9.960, faltaram R$40 para os R$10k. R$300 pela
    regra + **R$700 de ajuste** = R$1.000. A linha de meta na planilha continua dizendo a verdade
    ("faltaram R$40"); o ajuste aparece como **decisão**, não como regra.
  - ✅ **Campo "Pessoa" no modal de Custos (01/ago/2026).** Dá pra lançar extra pela tela; a lista de
    pessoas sai de `fechamentoPessoas()`, a mesma da folha. Só aceita pessoa quando a área é
    *Funcionários*.
    - ⚠️ Era um **buraco que engolia dinheiro em silêncio**: `saveCustoToSB` gravava
      `funcionario: null` fixo, então um extra lançado pela tela não entrava na folha de ninguém
      **e**, como a área `funcionario` fica fora de `custosForaFolha`, também não aparecia no
      resultado. Sumia dos dois lados da conta.
  - ✅ **Conciliação Custos × folha (01/ago/2026).** `fechamentoEquipe()` compara o total da área
    `funcionario` em Custos com o que a folha calcula (sem a comissão, que de propósito não é
    lançada) e **avisa na tela** — card âmbar "Confira antes de fechar a folha", antes só ia no
    arquivo. Pega três coisas: lançamento sem pessoa, bônus que falta lançar e **bônus com valor
    velho** — que é exatamente o caso do 5% depois do resync fundo (jul/2026: 1.287 → 1.305).
    Julho fecha em R$30.216 dos dois lados.
  - 💡 **Não existe banco de horas no painel** — as horas cruas ficam só na `obs` do lançamento
    ("18h33 → 19h × R$30/h"). Se virar rotina, vale uma tela pra registrar hora por pessoa/dia e o
    valor sair sozinho.
- ✅ **Versão PDF do fechamento (01/ago/2026).** Botão *📄 PDF* na aba Equipe (documento inteiro) e
  no card de cada pessoa (só a folha dela). Uma **folha por colaborador**. Mostra tudo — custo,
  lucro e margem — porque o destino são os sócios (Marcella e Gustavo), o mesmo nível da planilha.
  - **Sem biblioteca nova**: monta o HTML com os componentes normais (`UI.*`) e usa o `window.print()`
    do navegador → "Salvar em PDF" (no iPhone sai pelo share sheet). As regras de papel vivem em
    `css/print.css`.
  - **xlsx e PDF são documentos diferentes, não dois formatos do mesmo.** O xlsx é o instrumento de
    conferência do dono (ordena, filtra, soma); o PDF é o que se entrega. E o PDF individual **não
    leva a folha dos outros** — a planilha inteira vai junto, então mostrar a aba de um expõe todos.
  - ⚠️ `components.css` empilha `.c-tabela` em cartões abaixo de 720px. Imprimindo do celular isso
    valeria **no papel** e 250 linhas de venda virariam 250 cartões. `print.css` desfaz o
    empilhamento; há teste travando isso.
- 💡 As faixas vêm por WhatsApp todo mês — cadastrar na tela em vez de editar `core.js`.

- ✅ **Cruzamento com a lista manual da equipe (01/ago/2026).** A Anne mantém um resumo diário do
  bruto de acessórios por atendente. Cruzado dia a dia contra o painel em jul/2026: lista R$37.560
  vs painel R$38.345 (7 pessoas, a lista não inclui a Maria, que é SAC/online). **33 divergências
  em ~125 células**, das quais 27 são de R$10 a R$150 (ruído de anotação manual). As grandes são
  **atribuição de atendente, não valor** — ex.: a venda `40555563` (R$330, 06/07) está com o Davi
  no sistema e a Anne anotou como dela. Nenhuma muda faixa de meta. **Combinar com a equipe que a
  observação da venda no FoneNinja é a fonte oficial** — é ela que paga a comissão.

## Custo real do aparelho — assistência por IMEI  🔨 **trabalho de agosto/2026**

**O problema:** o conserto do aparelho é lançado na conta da assistência (despesa operacional) e
nunca chega no custo da peça. Resultado: aparelho de troca aparece com custo de R$130 e margem de
85%, e o lucro por aparelho é ficção. Em julho foram **R$24.055** de assistência assim.

**Viabilidade já medida (01/ago/2026):** os fechamentos da LegacyPhone (RR) trazem **IMEI por
aparelho**. Os 4 PDFs de julho foram parseados com `pypdf` e o total bateu **exato** com os
R$20.225 lançados — 101 serviços, 97 aparelhos. Cruzando com o banco:

| | aparelhos | valor |
|---|---|---|
| casou com uma venda | 80 | R$ 15.425 |
| está no estoque hoje | 9 | R$ 3.120 |
| IMEI inválido no PDF | 2 | R$ 450 |
| não encontrado | 6 | R$ 1.230 |

**92% do valor é rastreável até o aparelho.** Nos 80 vendidos: custo hoje R$128.365 · preço
R$189.829 · margem aparente R$61.464 → margem real **R$46.039**. **25% do "lucro" desses aparelhos
é serviço que não está no custo deles.**

**As 4 partes:**
1. Tabela `manutencoes` (imei · data · fornecedor · serviços · valor · fechamento) + importador do
   PDF da LegacyPhone. Parser já validado.
2. Vínculo por IMEI com `venda_produtos` (vendido) e `estoque` (parado).
3. Uso: custo real = compra + manutenções; ficha da venda, lucro real e **ranking de modelos que
   mais consomem assistência** (é isso que muda decisão de compra).
4. Contabilidade: manutenção vinculada **sai** da despesa operacional e vira custo de produto —
   senão o mês é debitado duas vezes.

⚠️ **Não reduz o custo total da loja**, move ~R$20k/mês de despesa operacional para custo de
produto. O ganho real é enxergar a margem por aparelho e por modelo. **Mas tem um efeito legítimo
a favor:** os R$3.120 dos 9 aparelhos ainda em estoque **não são despesa de julho** — são estoque,
e só viram custo quando venderem. Hoje pesam inteiros no resultado do mês.

⚠️ **Access fica de fora da v1**: as notas vêm como texto de WhatsApp com só os 4 últimos dígitos
(`"13 promax azul face id 0315"`). Casar por *últimos 4 + modelo* é arriscado. **Pedir o IMEI
completo pra eles** — aí vira igual à RR. São R$3.830/mês.

### Aparelho na bancada aparece como disponível 🔨 (12/ago/2026)
- ⭐ **Selo "Na assistência · N dias" na tela de Estoque.** Em 12/ago eram **43 aparelhos, R$ 87.461
  (16% do estoque disponível)** fisicamente na bancada e marcados `available` — o mais velho parado
  há **93 dias** (etiqueta `381`, 16 Plus Rosa, R$ 2.782). Vendedor pode prometer o que não tem.
  Fonte = a planilha do Vitinho; caminho mais barato é o que já existe pros preços (Sheets → sync →
  Supabase). Colunas, rotina e provas em **`docs/CONTROLE-MANUTENCAO.md`**.
- 💡 **Alerta de bancada velha** (>14 dias) e **custo de carrego da bancada** — o dia parado na
  assistência custa igual ao dia parado na prateleira (0,1%/dia).
- 💡 **Separar preparo de lote de conserto individual.** Subida de bateria na chegada da remessa é
  **125 das 175 linhas da RR** (48% do valor, R$ 25 fixo): previsível, sai e volta em lote, deveria
  entrar no custo de recebimento sem passar pelo controle aparelho a aparelho.
- ⚠️ **Etiqueta sem prefixo é ambígua**: `E1030` e `SP1030` viram o mesmo "1030" — **138 aparelhos
  do estoque colidem** (67 pares). Casar por etiqueta só com o prefixo junto.

## Dashboard
- ✅ **Modelos mais vendidos (30/jul/2026)**: card no `renderDashV2` (dash-v2.js) — ranking por modelo+GB+cor, filtro Seminovo/Lacrado/Todos, ordena por Volume/Lucro, usa período+loja do contexto e respeita `money()`/permissões. Selo só no Lacrado (sem selo = seminovo). Parsa o `titulo` do FoneNinja (~98,5% identificável). CSS `.d2-mod-*` em dash-v2.css.
- 💡 Quando `venda_trocas` encher: quadro de trocas (o que mais entra de upgrade, valor médio) e cruzar com o modelo vendido. **(31/jul: já encheu — 1.010 vendas cobertas, julho 100%.)**

## Margem do estoque (03/ago/2026)
- 🔨 ⭐ **Tela de margem do estoque** — a métrica principal é **R$ de lucro por aparelho**, não %
  (é a linguagem do dono: ele prevê o mês pelo lucro travado no estoque e calcula quantas vendas
  precisa). Cruza `estoque` × `tabela_precos` por modelo+capacidade+condição, abre por origem
  (fornecedor × troca de cliente) e por modelo, com **alerta de encalhe** (dias parados × margem).
  Método, queries e o retrato de 03/ago em **`docs/ANALISE-MARGEM-ESTOQUE.md`**.
  - ⚠️ **`estoque.preco_varejo` e `estoque.created_at` estão nulos em 100% das linhas.** Preço vem
    da `tabela_precos`; data de entrada vem de `compras.data_entrada` via `compra_produtos.imei_1`.
  - ⚠️ A `tabela_precos` é **snapshot** (só o preço de hoje) — não dá pra reconstruir a tabela
    vigente num mês passado. Comparar venda antiga com tabela atual é aproximação.
  - 💡 **Trocas de cliente rendem R$827/aparelho contra R$597 do fornecedor**, com R$548 menos de
    capital preso. Vale um quadro só delas — e pesa na decisão de quanto dar num upgrade.
  - 💡 **Margem está nos modelos populares** (14/14 Plus/15/13 Pro: 21–26%) e não nos topo de linha
    (16 Pro Max/17 Pro Max: 14–16%). Um ranking por R$/aparelho deixaria isso na cara.
- 🔨 **Painel de canais de compra** — R$/aparelho e dias de giro lado a lado. ⚠️ **Canais não são
  comparáveis entre si**: `STP` são as peças que o próprio dono envia (custo de aquisição, não
  preço de mercado), `DESEJO` é fornecedor de SP em **pronta entrega** (custa R$452/aparelho a mais
  que o STP em 15 de 15 modelos — é o preço da disponibilidade, não má compra), e Erick/Apple
  Show/Grupo são **encomenda** (giro de 0–1 dia, margem 7–10% mas R$500–600/aparelho **sem travar
  capital** — some em qualquer relatório ordenado por %). Detalhe em `docs/ANALISE-MARGEM-ESTOQUE.md`.
  - ⚠️ **`compras.fornecedor_nome` é só um texto** — não diz o que o canal é. Perguntar antes de
    comparar; ranquear os três modelos juntos produz conclusão errada.
  - 🔨 **Dias de cobertura por canal.** Em jul/2026 a remessa do STP (~35% das unidades vendidas)
    entregou **10 itens** e a seguinte chegou em **01/ago com 165**. O mês vendeu 366 contra 453 de
    junho, com lucro por aparelho quase igual (R$558 × R$567) e **CAC 24% maior** — assinatura de
    ruptura de estoque, não de demanda fraca. ~R$53 mil de lucro de diferença. Medir cobertura
    antecipa o buraco em vez de explicá-lo depois.

## Cálculo de lucro (decidido em 31/jul/2026)
- ✅ **FEITO em 02/set/2026 — o painel usa a fórmula A.** `lucroDaVenda()` em `core.js` é a fonte única; os 7 pontos passaram a chamá-la. Medido em ago/2026 nas 384 vendas: o campo dizia R$274.581, a fórmula dá R$278.033 (**+R$3.452, 1,3%**), e **58 vendas (15%) divergiam**. O caso que fechou o argumento: venda `40619619`, iPhone 17 Pro Max de R$7.590 que custou R$7.025, cliente pagou R$8.898 no crédito e caíram R$8.076,72 na conta — o campo dizia **−R$143,63 de prejuízo**. ⚠️ **Não mexeu em comissão**: ela sai do lucro do ITEM (`preco − valor_estoque`), que sempre esteve certo. Teste: `node test/lucro-venda.test.js`. Histórico do que era:
- ~~🔨 ⭐ **Trocar o lucro do painel para a fórmula A.**~~ Hoje 7 pontos do código somam `v.lucro` (campo da FoneNinja): `render.js` 7/403/433/574, `custos.js` 337/338, `dash-v2.js` 380. Esse campo **erra em ~1 de cada 5 vendas** — em jul/2026 mostrava R$228.933 contra R$238.826 reais (R$9.893 a menos). **Fórmula A (adotada):** `(preço − custo dos itens não-cancelados) + taxa_extra`. Ver [[como-calcular-lucro-de-venda]] na memória para as regras completas (item cancelado, troca, taxa de maquininha é GANHO e não custo).
  - ⚠️ Mudança que toca todas as telas de uma vez — conferir um mês inteiro lado a lado antes de trocar de vez.
- 💡 **Fórmula B — pelo caixa: `(líquido + troca) − custo`.** Conceitualmente melhor (o preço é referência, o que entra é fato) e bate mais com a FoneNinja (305 de 337 vendas, contra 262 da A). Em jul/2026 dava R$242.917, R$4.092 acima da A. **Por que ficou de fora:** as duas só divergem quando `líquido + troca ≠ valor_total + taxa_extra`, ou seja, quando o registro da venda está inconsistente — e aí a A é mais conservadora por usar só dados internos da própria venda. **NÃO é por causa do `upgrade_valor`**: ele foi validado em 31/jul e está correto (bate com `venda_trocas` em 984 de 1.010 vendas; em julho, 100% das completadas). Revisitar quando as vendas anômalas estiverem limpas.
- ✅ **Anomalias de julho revisadas (01/ago/2026).** A lista original de 11 vendas era em boa parte
  falso positivo. Depois do resync de 45 dias: a `40573149` normalizou (197% → 102% do recebido) e a
  `40584017` foi de R$31 pra R$321 de lucro. O grupo "margem acima do p99" **não era anomalia de
  venda**: são aparelhos de troca cujo custo de estoque está subvalorizado porque o conserto foi
  lançado na conta da assistência, não no aparelho (iPhone 11 a R$130 de custo que teve R$75 de
  serviço). Isso é o que a seção *Custo real do aparelho* resolve. Sobrou de real: **3 vendas com
  margem < 3% acima de R$2.000** (R$21.460) e **62 vendas sem recebimento gravado** (R$285.695,
  pagamento não sincronizado). Nenhuma venda recebendo menos de 85% do valor.
- ✅ **Parser de observação comia o vendedor — corrigido (31/jul/2026).** `"Atendente Gabi vendedor David venda cart"` virava `vendedor="cart"`: o trecho "venda cart" contém `vend`, caía no ramo do vendedor e sobrescrevia o nome já encontrado quando a linha da loja vinha DEPOIS. Como "cart" está em `SOCIOS_LOJA`, virava ninguém e o vendedor perdia a comissão **em silêncio**. Correção: `NOME_E_LOJA` (`cart/urban/loja/online`) barra esses tokens como nome, no vendedor e no atendente (`parseObs`, equipe.js). Testado em 6 formatos reais de observação. Em julho valia 1 venda (`40585050`, R$2.880 → +1 un e +R$35 pro David).

## Sync / Dados (repo phonecar-sync)
- 🔨 ⭐ **Trocas detalhadas** (jul/2026): captura dos aparelhos que ENTRAM na troca (modelo/IMEI/valor). Tabela `venda_trocas` já existe (`raw` jsonb defensivo) e o app **já consome** via `_trocas` (data.js) + ficha (render.js, bloco Upgrade). ⚠️ **CORREÇÃO (30/jul/2026):** ao contrário do que esta nota dizia antes, o `salvarTrocasVenda()` **nunca existiu** no `phonecar-sync` — só o total (`upgrade_valor/qtd`) era salvo, por isso `venda_trocas` estava zerada. **Patch commitado em 30/jul** (sync.js): `salvarTrocasVenda()` grava `upgrade.produtos[]` + `raw`, chamado no `upsertVenda`; o incremental (janela de 7 dias) pega vendas novas/editadas sozinho. Histórico: `autoBackfillTrocas()` roda **automático no cron**, em lotes de 150 até zerar (sem flag/Actions). ✅ **Mapeamento validado (31/jul/2026)**: 1.094 linhas, **0 sem `titulo`, 0 sem `valor`**, 47 sem `imei_1` (4%) e 21 sem `serial` — 1.047 completas (96%). Não precisa ajustar o `salvarTrocasVenda`. Cobertura: 1.010 de 1.242 vendas com troca (faltam 232, o `autoBackfillTrocas` vai zerando em lotes de 150 por rodada); **julho/2026 está 100%**. O detalhe bate com o `upgrade_valor` do cabeçalho em 984 de 1.010 vendas — as 26 divergentes têm mais aparelhos no detalhe do que o total registrado (em julho são só 2, ambas vendas **canceladas**).
- 🔨 ⭐ **Itens de compra** (30/jul/2026): `compra_produtos` estava **parada desde ~28/mar/2026** — o `syncCompras` só gravava o cabeçalho; os itens vieram de 1 backfill único. **Patch commitado em 30/jul** (sync.js): `salvarProdutosCompra()` + busca `/compras/:id` no `syncCompras` (só das compras novas). Histórico: `autoBackfillCompras()` roda **automático no cron**, em lotes de 150 até zerar (varre os últimos 180 dias — cobre abr→jul + fim de março). Também há flags manuais `BACKFILL_TROCAS/COMPRAS` (o `sync.yml` no repo do sync ainda precisa expor os inputs se quiser rodar manual; o automático dispensa isso).
- ✅ **Vendedor, loja e cadastrador estruturados (06/ago/2026)**: a FoneNinja já mandava os três no payload da venda — `venda.vendedor.nome`, `venda.origem_cliente_id` (já **congelada na venda**, não no cliente) e `venda.cadastrador_id`. O sync grava em `vendas.vendedor_nome/origem_cliente_id/cadastrador_id` e `syncOrigens()` traz o catálogo (`/origem_clientes`, 9 linhas) pra `origens_cliente` com `loja` derivada do nome. ⚠️ O endpoint é `/origem_clientes` — `/origens*` cai no HTML da SPA. ⚠️ O perfil dos vendedores online (Mel, id 6438) **não vem** em `/refactored-funcionarios`: sem `vendedor_nome` eles seriam invisíveis. Sem backfill: só vendas novas + janela de re-sync.
- 💡 Backfill de pagamentos/contas de fev–mai/2026 (pra formas/números aparecerem no histórico).
- 💡 "Visão larga": 1 linha por venda com tudo junto (cliente, produtos, pagamento, troca) — base pra relatórios.
- 💡 Relatório/export sob demanda (planilha) — falta definir o processo (contador? fechamento do mês?).
- ✅ Sync de pagamentos e de contas a receber.

## Perfis / Permissões
- 💡 Fase 2: visão do vendedor/atendente (vê a venda e o valor, **não** vê custo/lucro). Hoje desligado; hooks já existem (`podeVerValor`/`podeVerMargem`).
- ✅ **"Ver como"** (02/ago/2026): seletor no rodapé da sidebar, visível só para `EMAIL_DONO`, que troca
  `papelAtual()` entre sócio/gerente/vendedor/atendente sem deslogar. Faixa âmbar no topo enquanto está
  ligado; se a tela aberta não existe no papel escolhido, cai no Dashboard. Estado em
  `localStorage.pc_papel_preview`.
- ⚠️ **A permissão de hoje é só de tela.** `podeVerValor`/`podeVerMargem` escondem o número no painel, mas
  o RLS libera `select` pra **qualquer usuário autenticado** (política `auth_read`/`auth_all` com
  `using true`, conferido em 02/ago/2026). Pra sócio tanto faz — eles podem ver tudo. **Quando entrar
  vendedor/atendente de verdade, a trava tem que descer pro RLS**, senão basta a chave anon + o login
  dele pra ler custo e lucro direto na API. Provável desenho: tabela `perfis(user_id, papel)` +
  política que confere o papel.
- 💡 Com a tabela `perfis` no ar, `papelReal()` (shell.js) deixa de ser fixo em `'socio'` e passa a ler
  de lá — o "Ver como" continua por cima, só pro dono.

## Atendimento / Chatwoot
Mapa de quem é quem e como conversa vira venda: **`docs/IAS-E-ESPECIALISTAS.md`** (ler primeiro).
Como medir qualidade de lead e da IA: **`docs/PLANO-QUALIDADE-IA.md`**.
Análise e ferramenta: `docs/CHATWOOT-ANALISE.md` · `docs/ANALISE-MAJU-AGO-2026.md` · `scripts/chatwoot.js` · `scripts/maju/` · agente `analista-conversas`.
- ✅ **O portão da transferência: medido e DESCARTADO (02/set/2026).** Ficou 24h de pé. Reproduzido
  na base do n8n (`supabase-cart`), o balde de 438 vale **6**: metade era horário de funcionamento
  da loja, o resto era ela **perguntando** o dia. Onde há compromisso de verdade o portão dispara em
  **97–99%**. Sobrou um padrão real e pequeno: a IA **anuncia** a transferência sem executar a tool
  (3 casos no WhatsApp). Ver `docs/RESPOSTA-DUDU-LABELS-V3.md` e o bloco derrubado no §3-bis do
  `PLANO-QUALIDADE-IA.md`. ⚠️ **A lição vale mais que o achado:** régua larga com magnitude
  plausível engana os dois lados ao mesmo tempo.
- 🗑️ ~~💡 ⭐⭐⭐ **O portão da transferência, pelas duas pontas (01/set/2026).**~~ O Dudu mediu o outro lado
  da ideia abaixo: lead que diz *"bora agendar"* **sem** dar dia e hora não vira nada, porque a
  transferência só dispara com dia+hora+nome fechados (ADR 0011 dele) — **7 em 30 no WhatsApp, 9 em
  30 no Instagram**. Junto com as 438 nossas em que **o dia e a hora existem** e mesmo assim ninguém
  foi chamado, a pergunta deixa de ser "o portão é exigente demais?" e vira **"o portão está
  funcionando?"**. Próximo passo pedido a ele: rodar nos 30 dias cheios, por loja e canal.
  Ver `docs/RESPOSTA-DUDU-LABELS-V2.md` §4.
- 🔨 ⭐⭐⭐ **A IA promete um humano e não chama.** Cart, jul+ago, conversas que chegaram a preço:
  **1.201 com compromisso assumido e ninguém avisado** (~600/mês) — 734 em que ela disse *"um
  especialista vai confirmar"*, **438 em que marcou dia e hora**, 166 em que disse que separou o
  aparelho. Real: *"Fiquei com o 17 Pro 256 Titânio Azul separado aqui pra sexta às 16h"* — sem
  transferência. **É regex na fala dela, não precisa de juiz LLM, e roda hoje.** Regra proposta:
  transferir sempre que disser dia+hora, disser que separou, ou prometer especialista.
  Contrafactual (⚠️ teto): ~22 vendas/mês. `PLANO-QUALIDADE-IA.md` §3-bis.
- ✅ **Anúncios "POSSUI / PROCURA-SE" — investigado, hipótese ERRADA.** Não são pessoas querendo
  vender: o "quero trocar meu iPhone 11" é **template do anúncio**, e a mensagem seguinte diz qual
  aparelho querem **comprar**. São compradores com troca — o melhor canal de margem da loja. E não
  é qualidade de lead: com o mesmo engajamento, ela pede o dia **25,3% × 40,2%** e transfere
  **17,9% × 34,5%**. É fechamento. Quando há troca, **a avaliação vira o fim da conversa**.
  `PLANO-QUALIDADE-IA.md` §3.
- 🔨 ⭐⭐ **Taxa de transferência padronizada por mix de segmento** — o número único que pode ir num
  painel sem mentir. Pesos congelados num mês de referência, então mudança de mídia não mexe nela.
  É a correção do erro que me pegou duas vezes em dois dias. `PLANO-QUALIDADE-IA.md` §6.
- 🔨 **Estender `scripts/maju/metricas-semanais.sql` pro Instagram e pra Urban** — hoje é só
  WhatsApp/Cart, e o buraco mora justamente no Instagram.
- 🔨 **Changelog de versão de prompt.** Barato, e cada mês sem ele custa uma análise de arqueologia
  de série pra descobrir quando algo mudou.
- 💰 ⭐⭐ **O gasto de mídia EXISTE e nunca foi usado**: `meta_spend_diario` (cart + urban) e
  `google_spend_diario` no `supabase-cart`, diários desde 09/jun. Todos os relatórios anteriores
  listavam isso como "o que falta". **Meta Ads/Cart, julho:** R$ 21.672 gastos, 3.915 leads
  (R$ 5,54/lead), 33 vendas atribuídas, CAC R$ 657, ROAS 4,47×, lucro bruto R$ 19.822 — **empate**.
  Ler as três ressalvas em `docs/IAS-E-ESPECIALISTAS.md` §6.2 antes de decidir verba: cobertura de
  atribuição é ~65%, o lucro é bruto (falta carrego/reparo/taxa) e há venda contada em dois canais.
- 🔨 ⭐⭐ **Camada 1 — score do lead é o gargalo agora.** As camadas 2 (painel + etiquetas) estão
  no ar e a 0 foi contornada, mas sem a 1 nenhum número da 2 tem régua: "57% não tentou fechar" é
  ruim ou normal? Depende de que lead era. `PLANO-QUALIDADE-IA.md`, bloco ESTADO.
- 🔨 ⭐ **Etiqueta por especialista** — hoje o lado humano está agregado, e os quatro roteiros são
  bem diferentes. Extensão barata do `tags-atendimento.js`. ⚠️ E urgente por outro motivo: a Isa
  sai dia 1º.
- 🔨 ⭐⭐⭐ **Ninguém pede o dia — nem a IA nem o vendedor.** O painel da camada 2 (rodado em 2.677
  conversas de IG) mostra que a coluna "ALGUÉM pediu um dia" fica em **29–38%**, e o vendedor
  acrescenta **1 a 2 pontos** — na Urban, **zero**. Mudar só o prompt da IA move pouco; o roteiro
  é da casa. `PLANO-QUALIDADE-IA.md` §3-quinquies.
- 🔨 ⭐⭐ **A IA nunca tenta fechar.** Tentativa de fechamento: **IA 1–8%**, vendedor 6–22%. E ela
  **morre perguntando em 56–70%** das conversas em que fica sozinha. Ela entrega o lead sem ter
  tentado a venda — e em 3 de cada 4 não entrega.
- 🔨 ⭐⭐ **No segmento de troca as duas metades falham juntas**: vendedor aparece em **11%** (contra
  22–25%) e, quando aparece, a mediana IA→vendedor é **13h26** contra 1–21 min dos outros segmentos.
  (⚠️ n=12 no tempo.)
- 🔨 ⭐⭐ **A alavanca do "pede o dia" vale pro HUMANO também** — e ele faz pior que a IA: pede dia
  ou hora explícito em **15% (Cart) e 2% (Urban)** das conversas em que aparece, contra 16–25% da
  IA. E **41–44% das últimas mensagens dele terminam com uma pergunta pendurada**, o mesmo padrão
  de morte. Não é problema de robô, é o roteiro da casa. `PLANO-QUALIDADE-IA.md` §3-quater.
- ⏱️ **Tempo de resposta humana é mensurável no Instagram** (o `CHATWOOT-ANALISE.md` dizia que
  nunca seria): mediana **26 min** na Cart e **40 min** na Urban, mas **p90 de 20 a 24 horas**.
- ⚠️ **A API do Chatwoot devolve só as ÚLTIMAS 20 mensagens.** Sem paginar com `before=<id>`, toda
  análise vê só a cauda — e a cauda é onde o vendedor está. Já enviesou uma medição minha. O
  `scripts/separa-ia-vendedor.js` foi corrigido; qualquer coisa nova que leia mensagem tem que paginar.
- ❓ **12% das conversas têm mensagem apagada** ("This message was deleted"), nas duas lojas. Não
  investiguei o que é.
- 🔑 **A `conversa_estado` não nos bloqueia.** As linhas `type:'tool'` do n8n já trazem modelo,
  armazenamento, cor, condição, valor à vista/parcelado, aparelho de troca, bateria e penalidades
  — a maior parte do schema. Só o Dudu tem o **motivo declarado** da transferência, o julgamento
  (`lead_quente`, `desistiu_em`) e o carimbo ao vivo. Construir a camada 2 já.
- 🔨 ⭐⭐ **Pedir pro Dudu ligar `conversa_estado`** (supabase-urban, existe com **1 linha**). O
  schema tem `motivo_transferencia`, `objecoes_levantadas`, `desistiu_em`, `fase_atual` — é
  literalmente "por que o lead não foi transferido", desenhado e nunca ligado. **Fazer isso antes
  de qualquer análise nova do funil.**
- 🔨 ⭐⭐ **O Instagram transfere metade do WhatsApp — nas DUAS lojas**: 21–24% contra 35–39%
  (agosto, por lead criado). Mesma arquitetura → comparar o fluxo/prompt de handoff do IG com o do
  WhatsApp. ⚠️ *Correção de 26/ago: eu tinha escrito que era problema só da Urban (12,4% × 32,5%).
  Era artefato do denominador do Chatwoot. Ver `docs/IAS-E-ESPECIALISTAS.md` §4.*
- 🔨 ⭐ **A versão de Instagram do `preco-sem-handoff.js`** — hoje só existe pro WhatsApp, e o
  buraco é maior no IG.
- 🔨 ⭐ **Levar o `transfer_retentativas` pro Instagram** — em ago/Cart foram 351 eventos no
  WhatsApp e **1 alerta efetivo no Instagram** no mês inteiro. Nasceu só no canal que já era o melhor.
- ⚠️ ~~`transfer_falhas` separa "decidiu não transferir" de "quebrou"~~ — **leitura minha errada**.
  É o **guardrail do handoff** (`node_falho='guardrail_handoff'`, motivos `skip_limpo` e
  `vazou_texto`), 14 eventos em 3 meses. Não mede transferência quebrada.
- 🔑 ⭐⭐ **`contatosFormulario` tem a chave de telefone que a atribuição diz não existir.** 1.726
  linhas, **100% com telefone real**; de jun–ago, **327 de 504 não são lead de WhatsApp**. Ganho
  medido: **+4 vendas, R$ 24.590**, casamento exato (N1). `ATRIBUICAO-LEADS-VENDAS.md` afirma que
  lead de IG não tem telefone — tem, em outra tabela. Entra como **N1-bis** na cascata.
- 🚨 ⭐⭐ **Segundo cálculo de comissão e lucro fora do painel.** `relatorioVendas` (Supabase do
  Dudu) diz julho/Cart = 246 vendas e R$ 170.345 de lucro; o painel diz 261 e R$ 196.395. **13% de
  diferença**, e ele também calcula `comissão_vendedor` e `comissão_atendente`. Pode ser recorte,
  não investiguei — mas regra de dinheiro em dois lugares **paga errado calado**. Conferir.
- 🔨 **`site_eventos` nunca foi olhado**: 19.179 visitantes, **7.337 cliques pro WhatsApp de 5.111
  pessoas**, e **67% dos page_views com `gclid`**. O volume de clique bate com o total de leads de
  WhatsApp da Cart — entender se o site é o caminho de quase todos antes de ler `origem` como
  plataforma.
- ❓ **Divergência Urban/IG**: `dash_transfers` diz rodízio 50/50 Mel/David; o `meta.assignee` do
  Chatwoot diz David com 98%. Na Cart os dois concordam. **Perguntar pro Dudu** — `vendedorAtribuido`
  é a trava do N5, que sustenta 13 das 21 vendas casadas da Urban.
- 🔨 **Conectar o WhatsApp pessoal dos especialistas ao Chatwoot** (plano do dono, sem data). É o
  que abre a segunda metade do funil — hoje o Chatwoot fica cego no handoff.
- ⚠️ **Instagram converte 3–4× pior depois de transferido** (coorte jun: Cart 2,4% × 10,2%,
  Urban 4,4% × 11,9%) — **mas parte disso é medição**: lead de IG não tem telefone (3 em 1.678).
  Não dá pra separar conversão pior de detecção pior com o dado de hoje.
- 🔨 ⭐⭐ **Ela não pergunta o dia** (24,6% das conversas qualificadas). Quando pergunta, o cliente
  dá data em 43% contra 8%; com data a conversão é 14,9% contra 3,4%. **34 conversas da janela de
  ago terminam com convite pra loja sem pedir dia e 0 (zero) foram transferidas.** Detalhe e
  contrafactual em `docs/ANALISE-MAJU-AGO-2026.md`.
- 🔨 ⭐ **Micro-pergunta de último milímetro**: o cliente já disse que quer comprar e ela segura o
  handoff pra saber a cor (*"pode me responder só com 'laranja' ou 'branco'"*). 15 conversas, 6,7%
  de escalada. A cor o vendedor resolve em dez segundos.
- ⚠️ **Follow-up não é o caminho**: 312 leads com 4+ toques produziram 3 vendas (0,96%).
- ⚠️ **1.688 sessões são backfill carimbado em 10/jun 20h**, 1.542 com todas as mensagens no mesmo
  instante. "Coorte de junho" não é quem chegou em junho, e análise por hora do dia ali é lixo.
- ⚠️ **Tempo de resposta da Maju não é mensurável** em `n8n_chat_histories_maju_v2`: cliente e
  resposta gravam com o mesmo timestamp (mediana 0,0s em 5.246 respostas).
- 💡 **Meta Ads é 56% do volume qualificado e converte 2,46%** contra 9,42% do orgânico — mesmo na
  melhor célula (transferida + com data) é 13,3% contra 31,2%. Falta o gasto de mídia pra fechar.
- 🔨 ⭐⭐ **Preço dado e ninguém avisado**: a IA cotou preço e **não passou pra humano nenhum** em
  457 conversas da Cart (71% das que viram preço) e 367 da Urban (75%). Lead que já passou pela
  parte difícil e evaporou por falta de passagem de bastão. Maior buraco conhecido do funil.
- 🔨 ⭐ **Por que ~46% (Cart) / 39% (Urban) nunca chegam a cotar preço.** Sem explicação medida.
  - ⚠️ Não confunda com o item acima: **cartão de handoff ≠ preço**. Ler o cartão como preço
    inflou esse número pra 73%/77% na primeira leitura (10/ago/2026). Preço se mede por `R$`.
- 💡 ⭐ **Cart converte proposta→visita a 24,4% e a Urban a 14,8%** — mesma IA, mesmo script. Achar
  a diferença provavelmente ensina o que consertar na Urban.
- 💡 **Cruzar lead → venda**: a conversa tem o telefone do cliente e a venda tem o cliente. Fecharia
  a conversão de verdade (hoje só se mede até a visita agendada).
- 💡 **Demanda × estoque parado**: cliente da Cart pede Pro Max, o da Urban pede 11/12. Cruzar com
  `docs/ANALISE-MARGEM-ESTOQUE.md` pra ver se a compra está seguindo a procura.
- 💡 **148 mensagens falharam ao enviar** em ~70 conversas (~3%) — cliente que nunca recebeu
  resposta. Suspeita não verificada: janela de 24h do WhatsApp.
- 💡 **Ninguém fecha conversa** (`resolutions_count: 0` nas duas instâncias): todo relatório de
  resolução do Chatwoot vem vazio. Configuração, não performance.
- 💡 **A Urban não usa label nenhuma** (a Cart tem `lead-qualificado`/`suporte`) — sem isso não dá
  pra medir qualificação na Urban pelo caminho nativo.
- ⚠️ **Não dá pra medir desempenho de vendedora pelo Chatwoot**: elas não escrevem lá (0 mensagens
  em 2.000 conversas). Se isso virar necessidade, é mudança de processo, não de código.
- 💡 Se a análise virar rotina, ler o **Postgres do Chatwoot** em vez da API (a API exige 1 chamada
  por conversa; varrer tudo seriam ~50 mil requisições na instância de produção).

## Geral / Infra
- ✅ CLAUDE.md (manual do projeto).
- ✅ Guard de colisão de nomes globais (`.git/hooks/pre-commit`).
- ✅ `_headers` versionado (01/ago/2026) — força revalidação de `js/` e `css/`. Estava só no disco
  desde jul/2026, então nunca tinha sido publicado.
- ⚠️ **PDF saía com blocos pretos e um círculo azul (01/ago/2026).** Duas coisas que o
  `@media print` não pegava, e nenhuma era o documento em si:
  - `html`/`body` têm `background:var(--bg)` (styles.css). No tema escuro isso é `#0f1420`; o
    documento cobria a 1ª página e nas seguintes **o fundo da página aparecia por baixo**.
  - `body::before` é um `position:fixed` com dois `radial-gradient` (o "fundo atmosférico").
    **Pseudo-elemento não é filho**, então `body > *:not(.fp-overlay){display:none}` nunca pegou;
    sendo `fixed`, o Safari repinta em **toda** página. O azul é o `rgba(91,139,245)` = `#5b8bf5`.
  - Diagnóstico: o PDF gerado tinha **duas `/ShadingType 3` (radial) de raio 220pt** e nenhuma
    imagem nem retângulo grande — foi isso que apontou o `body::before` em vez do documento.
  - Correção: `@media print` força `html, body` brancos e mata `body::before/::after`.
- ✅ ⭐ **O ícone na tela de início do iPhone serve versão velha** (resolvido em 01/ago/2026).
  O dono abre o painel por um ícone adicionado à tela de início; isso roda num **WebView standalone
  do iOS, com cache próprio, separado do Safari**, que na prática **ignora o `must-revalidate`** —
  inclusive para o próprio `index.html`. Conferido: servidor manda `max-age=0, must-revalidate` com
  ETag em `/`, `/index.html`, `/js/*` e `/css/*`, e o código novo estava publicado; **no Safari
  privado funcionava e pelo ícone não**. Contorno de hoje: remover o ícone e adicionar de novo.
  - ⚠️ **Não é só chatice — é risco de número errado.** Fechar a folha olhando uma versão velha do
    painel é decisão financeira em cima de dado velho. Já aconteceu duas vezes na mesma tarde.
  - **Feito:** `?v=<versão>` em todo `<script>`/`<link>` local do `index.html` (fonte única) +
    `js/versao.js`, que no boot e ao voltar pro app busca o `index.html` com `cache:'no-store'`,
    lê o `?v=` de lá e, se diferir do que está rodando, mostra a faixa *"Nova versão"*. Atualizar
    recarrega com `?r=<timestamp>` — endereço inédito é o que o WebView não tem em cache.
    A versão sai da URL do próprio `<script>` (`document.currentScript`), então **não há constante
    duplicada**. ⚠️ Só funciona se o `?v=` for bumpado no commit — está no CLAUDE.md.
  - 💡 Alternativa mais automática: `netlify.toml` com um comando que carimba `$COMMIT_REF` no
    `index.html`. Não fiz porque o site hoje **não tem build command** e eu não consigo ler o
    publish dir pela API — mexer nisso às cegas pode derrubar o deploy.
