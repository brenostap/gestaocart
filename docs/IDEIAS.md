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

## Dashboard
- ✅ **Modelos mais vendidos (30/jul/2026)**: card no `renderDashV2` (dash-v2.js) — ranking por modelo+GB+cor, filtro Seminovo/Lacrado/Todos, ordena por Volume/Lucro, usa período+loja do contexto e respeita `money()`/permissões. Selo só no Lacrado (sem selo = seminovo). Parsa o `titulo` do FoneNinja (~98,5% identificável). CSS `.d2-mod-*` em dash-v2.css.
- 💡 Quando `venda_trocas` encher: quadro de trocas (o que mais entra de upgrade, valor médio) e cruzar com o modelo vendido. **(31/jul: já encheu — 1.010 vendas cobertas, julho 100%.)**

## Cálculo de lucro (decidido em 31/jul/2026)
- 🔨 ⭐ **Trocar o lucro do painel para a fórmula A.** Hoje 7 pontos do código somam `v.lucro` (campo da FoneNinja): `render.js` 7/403/433/574, `custos.js` 337/338, `dash-v2.js` 380. Esse campo **erra em ~1 de cada 5 vendas** — em jul/2026 mostrava R$228.933 contra R$238.826 reais (R$9.893 a menos). **Fórmula A (adotada):** `(preço − custo dos itens não-cancelados) + taxa_extra`. Ver [[como-calcular-lucro-de-venda]] na memória para as regras completas (item cancelado, troca, taxa de maquininha é GANHO e não custo).
  - ⚠️ Mudança que toca todas as telas de uma vez — conferir um mês inteiro lado a lado antes de trocar de vez.
- 💡 **Fórmula B — pelo caixa: `(líquido + troca) − custo`.** Conceitualmente melhor (o preço é referência, o que entra é fato) e bate mais com a FoneNinja (305 de 337 vendas, contra 262 da A). Em jul/2026 dava R$242.917, R$4.092 acima da A. **Por que ficou de fora:** as duas só divergem quando `líquido + troca ≠ valor_total + taxa_extra`, ou seja, quando o registro da venda está inconsistente — e aí a A é mais conservadora por usar só dados internos da própria venda. **NÃO é por causa do `upgrade_valor`**: ele foi validado em 31/jul e está correto (bate com `venda_trocas` em 984 de 1.010 vendas; em julho, 100% das completadas). Revisitar quando as vendas anômalas estiverem limpas.
- 💡 **Anomalias de julho/2026 pendentes de análise** (11 vendas): recebimento fora do padrão (`40573149` recebeu 197% do valor da venda, `40570274` só 77%), prejuízo (`40551264`, `40564245`, `40587358`), margem ~0 em venda grande (`40584017` R$5.150 → R$31, `40574479` R$4.540 → R$78), margem acima do p99 (`40570372`, `40585200`, `40568109`, `40565662`). Régua: margem normal de venda com aparelho é p25=12% · mediana=18% · p75=27% · p95=56%.
- 💡 **Parser de observação come o vendedor** quando a linha da loja vem depois: `"Atendente Gabi vendedor David venda cart"` → `"venda cart"` contém `vend`, vira "vendedor = cart" e sobrescreve o David (venda `40585050`, R$2.880 sem comissão). Corrigir `parseObs` (equipe.js) para ignorar `venda <loja>` quando já achou vendedor nomeado. Só 1 venda em julho, mas é silencioso.

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
