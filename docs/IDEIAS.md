# Ideias & Backlog — caderno de ideias do projeto

Lugar pra guardar ideias conforme surgem, sem perder no caminho — a gente faz
**uma coisa de cada vez**, então o resto fica anotado aqui. Organizado por área.
Quando formos trabalhar numa área, o Claude **lê a seção dela** e vê o que encaixa
pra fazer junto. Formato livre: título curto + 1 linha. Pode editar à vontade.

Status: 💡 ideia · 🔨 em andamento · ✅ feito · ❄️ pausado · ⭐ = alto valor (recomendação do Claude)

## Tela de Vendas
- 🔨 **Master-detail (APROVADO no mock, pronto pra construir)**: 
  - **Linha enxuta:** #Venda · Data · Cliente · Loja (badge Cart/Urban) · Produto · Vendedor · Atendente · Valor · Lucro. Cor só onde significa (loja, lucro verde). #Venda no começo.
  - **Data + Cliente fixas** ao arrastar; clique na linha abre a ficha.
  - **Ficha da venda (painel lateral)** com blocos, texto limpo (sem etiqueta colorida demais): **Cliente** (contato/cidade/WhatsApp) · **Aparelhos** (modelo/IMEI/custo/valor/lucro/origem) · **Acessórios** (nome+valor) · **Pagamento** (por forma: valor·parcelas·taxa·líquido·conta) · **Upgrade** (aparelhos de troca + valor) · **Resumo** (valor/custo/taxa/lucro/margem).
  - Rótulo do bloco de troca = **"Upgrade"** (termo do sistema), não "Troca recebida".
  - Acessórios e pagamento moram NA FICHA, não na linha. Seletor de colunas vira coisa pequena (opcionais Taxa/Margem/Parcelas).
  - Mock de referência: claude.ai/code/artifact/19d0055e-6811-4fae-ba82-f000c3c5728c
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
