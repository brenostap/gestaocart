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

## Dashboard
- ✅ **Modelos mais vendidos (30/jul/2026)**: card no `renderDashV2` (dash-v2.js) — ranking por modelo+GB+cor, filtro Seminovo/Lacrado/Todos, ordena por Volume/Lucro, usa período+loja do contexto e respeita `money()`/permissões. Selo só no Lacrado (sem selo = seminovo). Parsa o `titulo` do FoneNinja (~98,5% identificável). CSS `.d2-mod-*` em dash-v2.css.
- 💡 Quando `venda_trocas` encher: quadro de trocas (o que mais entra de upgrade, valor médio) e cruzar com o modelo vendido.

## Sync / Dados (repo phonecar-sync)
- 🔨 ⭐ **Trocas detalhadas** (jul/2026): captura dos aparelhos que ENTRAM na troca (modelo/IMEI/valor). Tabela `venda_trocas` já existe (`raw` jsonb defensivo) e o app **já consome** via `_trocas` (data.js) + ficha (render.js, bloco Upgrade). ⚠️ **CORREÇÃO (30/jul/2026):** ao contrário do que esta nota dizia antes, o `salvarTrocasVenda()` **nunca existiu** no `phonecar-sync` — só o total (`upgrade_valor/qtd`) era salvo, por isso `venda_trocas` estava zerada. **Patch commitado em 30/jul** (sync.js): `salvarTrocasVenda()` grava `upgrade.produtos[]` + `raw`, chamado no `upsertVenda`; o incremental (janela de 7 dias) pega vendas novas/editadas sozinho. Histórico: `autoBackfillTrocas()` roda **automático no cron**, em lotes de 150 até zerar (sem flag/Actions). **Pendente**: **validar o mapeamento** no `venda_trocas.raw` da 1ª rodada (`titulo/imei_1/valor` best-effort; se vier `null` com dado no `raw`, ajustar o nome no `salvarTrocasVenda`, sem mexer na tabela).
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
