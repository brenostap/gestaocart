# Ideias & Backlog — caderno de ideias do projeto

Lugar pra guardar ideias conforme surgem, sem perder no caminho — a gente faz
**uma coisa de cada vez**, então o resto fica anotado aqui. Organizado por área.
Quando formos trabalhar numa área, o Claude **lê a seção dela** e vê o que encaixa
pra fazer junto. Formato livre: título curto + 1 linha. Pode editar à vontade.

Status: 💡 ideia · 🔨 em andamento · ✅ feito · ❄️ pausado · ⭐ = alto valor (recomendação do Claude)

## Tela de Vendas
- 🔨 **Master-detail**: linha enxuta (#Venda · Data · Cliente · Loja · Produto · Vendedor · Atendente · Valor · Lucro) + **"ficha da venda"** (painel lateral) com todo o detalhe (aparelhos, acessórios, pagamento com valores, troca, cliente, resumo).
- 💡 Colunas fixas (Data + Cliente) ao arrastar pro lado.
- 💡 Seletor de colunas opcionais na tabela (Taxa/Margem/Parcelas), com o app lembrando a escolha.
- 💡 ⭐ Divisória por dia com resumo do dia (nº vendas, faturamento, lucro, mix de pagamento).
- 💡 ⭐ Quanto entrou por forma de pagamento (valor cheio + líquido).
- 💡 Filtros: forma de pagamento, status, busca por IMEI.
- 💡 ⭐ Selo nas vendas com "líquido furado" (~9% que a FoneNinja erra) — apontar onde não confiar no lucro.
- 💡 Linha de totais no rodapé; comparar com período anterior.
- 💡 Cartão de venda pensado pro celular (balcão).
- ✅ Badge de forma de pagamento por venda (Pix/Crédito/Débito/Dinheiro).
- ✅ Colunas parcelas/taxa/líquido/margem + toggle "Mais colunas".

## Sync / Dados (repo phonecar-sync)
- 🔨 ⭐ **Trocas detalhadas**: capturar os aparelhos que ENTRAM na troca (modelo/IMEI/valor) — hoje só guardamos o total. Alimenta a ficha da venda.
- 💡 Backfill de pagamentos/contas de fev–mai/2026 (pra formas/números aparecerem no histórico).
- 💡 "Visão larga": 1 linha por venda com tudo junto (cliente, produtos, pagamento, troca) — base pra relatórios.
- 💡 Relatório/export sob demanda (planilha) — falta definir o processo (contador? fechamento do mês?).
- ✅ Sync de pagamentos e de contas a receber.

## Perfis / Permissões
- 💡 Fase 2: visão do vendedor/atendente (vê a venda e o valor, **não** vê custo/lucro). Hoje desligado; hooks já existem (`podeVerValor`/`podeVerMargem`).

## Geral / Infra
- ✅ CLAUDE.md (manual do projeto).
- ✅ Guard de colisão de nomes globais (`.git/hooks/pre-commit`).
