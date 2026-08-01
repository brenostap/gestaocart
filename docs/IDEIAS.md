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
- 💡 Colunas fixas (Data + Cliente) ao arrastar pro lado (a linha enxuta já rola menos; falta o sticky de coluna).
- 💡 Seletor de colunas opcionais na tabela (Taxa/Margem/Parcelas), com o app lembrando a escolha.
- 💡 Filtros: forma de pagamento, status, busca por IMEI.
- 💡 ⭐ Selo nas vendas com "líquido furado" (~9% que a FoneNinja erra) — apontar onde não confiar no lucro.
- 💡 Linha de totais no rodapé; comparar com período anterior.
- 💡 Cartão de venda pensado pro celular (balcão).
- ✅ Badge de forma de pagamento por venda (Pix/Crédito/Débito/Dinheiro).
- ✅ Colunas parcelas/taxa/líquido/margem + toggle "Mais colunas".

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
    31/jul/2026, apesar de a mensagem das metas dizer "400 Vendas"). Metas individuais de
    atendente (4k→100 · 6k→300 · 10k→1000) **não mudaram**.
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
  - **Teste de aceite — julho/2026** ✅ conferido contra o banco em 01/ago/2026 (bate nos 10):
    Anne 6.643 · Leo 5.786 · Mel 5.125 · Maria 4.694 · Davi 4.615 · David 4.250 · Isa 3.650 ·
    Vitinho 3.169 · Denilson 3.024 · Gabi 2.140 · **total 43.096**. Base: 355 aparelhos ·
    R$38.345 de acessórios (bruto) · R$26.090 de lucro em acessórios · coletiva R$400/pessoa.
    Unidades: Mel 115 · David 90 · Isa 70 · Maria 49. Bruto de acessórios: Leo 11.695 ·
    Anne 10.125 · Davi 9.960 · Gabi 3.315 · Denilson 2.660 · Maria 410 · Vitinho 180.
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

## Dashboard
- ✅ **Modelos mais vendidos (30/jul/2026)**: card no `renderDashV2` (dash-v2.js) — ranking por modelo+GB+cor, filtro Seminovo/Lacrado/Todos, ordena por Volume/Lucro, usa período+loja do contexto e respeita `money()`/permissões. Selo só no Lacrado (sem selo = seminovo). Parsa o `titulo` do FoneNinja (~98,5% identificável). CSS `.d2-mod-*` em dash-v2.css.
- 💡 Quando `venda_trocas` encher: quadro de trocas (o que mais entra de upgrade, valor médio) e cruzar com o modelo vendido. **(31/jul: já encheu — 1.010 vendas cobertas, julho 100%.)**

## Cálculo de lucro (decidido em 31/jul/2026)
- 🔨 ⭐ **Trocar o lucro do painel para a fórmula A.** Hoje 7 pontos do código somam `v.lucro` (campo da FoneNinja): `render.js` 7/403/433/574, `custos.js` 337/338, `dash-v2.js` 380. Esse campo **erra em ~1 de cada 5 vendas** — em jul/2026 mostrava R$228.933 contra R$238.826 reais (R$9.893 a menos). **Fórmula A (adotada):** `(preço − custo dos itens não-cancelados) + taxa_extra`. Ver [[como-calcular-lucro-de-venda]] na memória para as regras completas (item cancelado, troca, taxa de maquininha é GANHO e não custo).
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
- 💡 Backfill de pagamentos/contas de fev–mai/2026 (pra formas/números aparecerem no histórico).
- 💡 "Visão larga": 1 linha por venda com tudo junto (cliente, produtos, pagamento, troca) — base pra relatórios.
- 💡 Relatório/export sob demanda (planilha) — falta definir o processo (contador? fechamento do mês?).
- ✅ Sync de pagamentos e de contas a receber.

## Perfis / Permissões
- 💡 Fase 2: visão do vendedor/atendente (vê a venda e o valor, **não** vê custo/lucro). Hoje desligado; hooks já existem (`podeVerValor`/`podeVerMargem`).

## Geral / Infra
- ✅ CLAUDE.md (manual do projeto).
- ✅ Guard de colisão de nomes globais (`.git/hooks/pre-commit`).
