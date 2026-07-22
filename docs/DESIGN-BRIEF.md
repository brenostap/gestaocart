# Cart System — Design Brief & Handoff

> **Fonte da verdade de DESIGN.** O código é a fonte da verdade da implementação; este
> documento é o norte visual/UX. Leia antes de escrever qualquer tela.
> Negócio: **phonestp.com** · Versão: v1 · jul 2026.

---

## 0. Como usar este documento (Claude Code)

Antes de implementar, faça um **diagnóstico do repositório atual** e me devolva:

1. Stack e lib de UI (React/Vue/SwiftUI/etc.) e se já existe sistema de tema/tokens.
2. Como está a autenticação/perfis hoje — dá pra amarrar a regra de permissão nela?
3. Estrutura do Supabase (schema de estoque, tabela de modelos/cor/fotos).
4. Quais telas/rotas já existem e o que diverge deste brief.

Só depois disso, proponha um **plano de integração** (tema central → camada de
permissão → primeira tela). Não comece a codar sem alinhar.

---

## 1. O produto

Dashboard de gestão para **duas lojas de celulares**, com base de dados única:

| Loja | Cor-tema | Foco | Peso |
|------|----------|------|------|
| **Phone Cart** | azul `#3b6fd6` | Revenda de iPhones (novos + seminovos), ticket médio ~R$ 3,3k | ~75% dos dispositivos |
| **Urban** | laranja `#F39200` | Loja irmã, foco em acessórios + volume complementar | ~25% |

**Princípio-chave:** estoque e base de dados são **únicos e compartilhados**. O sistema
separa por loja apenas na *leitura* (relatórios, metas, rateio de custos) — nunca em silos.

---

## 2. A regra de ouro — permissão por perfil

A interface **se adapta ao papel**: seções aparecem/somem por perfil. Não é esconder
campos numa tela única — a navegação em si é ciente de permissão.

> **Vendedor NUNCA vê R$ de receita. Gerente NUNCA vê lucro, margem, custo ou salário/comissão alheia.**

| Perfil | Pessoas | O que vê |
|--------|---------|----------|
| **Sócio** | Breno, Gustavo, Marcella | **Tudo**: receita, lucro, margem, custos, rateio, comissão de todos, fechamento |
| **Gerente** | Pietra | Operação e equipe. **Sem** receita R$, lucro, margem, custo, salário alheio. Vê quantidades e metas |
| **Vendedor / Atendente** | David, Mel, Isa, Anne… | Só o **próprio**: comissão e meta pessoais, ranking por quantidade, estoque sem custo/fornecedor |

### Matriz de acesso por seção

| Seção | Sócio | Gerente | Vendedor/Atendente |
|-------|:-----:|:-------:|:------------------:|
| Dashboard | tudo | só quantidades | home pessoal |
| Vendas | com R$ | qtd, sem receita | só as minhas, sem R$ |
| Estoque | com custo | sem preço de custo | sem custo e sem fornecedor |
| Equipe | comissões de todos | ranking, metas | minha meta/comissão |
| Custos | + rateio | — | — |
| Tabela de preços | ✓ | — | — |
| Movimentações | ✓ | ✓ | — |
| Fechamento | completo | só devices/acessórios | — |

---

## 3. Regras de negócio

- **Comissão vendedor:** R$ 35 por dispositivo, na faixa > 80 unidades/mês.
- **Comissão atendente:** 25% do lucro de acessórios + bônus por meta + eventuais extras individuais.
- **Metas coletivas** geram bônus dividido quando a rede bate a meta.
- **Custos** rateados entre lojas por participação (ex.: 75% Cart / 25% Urban).
- **Unidade de estoque** tem: modelo, geração, capacidade, cor, serial, % de bateria,
  condição (lacrado/seminovo), status (disponível/reservado/lacrado/em trânsito),
  origem/fornecedor (**visível só a sócio**) e **histórico** (entrada → disponibilizada →
  reservada → vendida).
- **Estoque** é listado **agrupado por geração de iPhone** (15 · 14 · 13 · 12 e anteriores).

### Números de referência (maio/2026, ambas as lojas)
- 419 dispositivos (Cart 313 · Urban 104)
- Receita bruta R$ 1.386.867 · ticket médio R$ 3.310
- Lucro bruto R$ 301.543 · margem 21,7%
- Resultado líquido R$ 229.443 · custos R$ 72.100
- Acessórios: bruto R$ 37.305

---

## 4. Design tokens

### Cores
```
/* Marca (tint por loja) */
--cart-blue:      #3b6fd6;   --cart-blue-light:  #5b8bf5;
--urban-orange:   #F39200;   --urban-orange-dk:  #c47600;

/* Base */
--ink:            #1a1f36;   /* texto primário / superfícies escuras */
--text-secondary: #5b6475;
--text-muted:     #9aa3b2;
--bg:             #f6f9fc;
--border:         #e2e6ec;

/* Semânticas (cor = significado, nunca decoração) */
--success:        #0a7c3e;   --success-bg: #d4f7e0;   /* lucro / ok */
--warning:        #b54708;   --warning-bg: #fef0c7;   /* atenção */
--danger:         #b42318;   --danger-bg:  #fee4e2;   /* crítico */
--process:        #5b53e8;   --process-bg: #ecebfd;   /* processo / fechamento */
```

### Tipografia
- Família: **Geist** (Google Fonts). Mono: **Geist Mono** para rótulos, ids, %, seriais.
- Sempre `font-variant-numeric: tabular-nums` em qualquer número financeiro.
- Escala (inspirada na HIG): Display ~46 / Title ~28 / Headline ~15–17 / Body 13–14 / Caption 11–12.

### Forma
- Raio de card: **12–16px**. Borda `#e2e6ec` 1px. Sombra sutil `0 1px 2px rgba(0,0,0,.04)`.
- Conteúdo (KPIs, tabelas, cards) é **opaco**. Material translúcido só na navegação.

---

## 5. Navegação — "sidebar híbrida"

- **Desktop:** sidebar fixa agrupada por domínio:
  - **Operação:** Dashboard · Vendas · Estoque · Movimentações
  - **Gestão:** Equipe · Tabela de preços
  - **Financeiro:** Custos · Fechamento
  - Seletor de **loja** (Ambas / Phone Cart / Urban) + **período** no topo da sidebar, **persistentes** entre telas.
- **Mobile:** bottom-tab de 4–5 slots, na **cor do perfil**. Contexto loja+período idêntico web/mobile.
- Itens de nav só aparecem conforme a matriz de permissão (§2).

---

## 6. Inspirações (o que roubar de cada)

- **Apple (HIG · Liquid Glass · Materials) — acabamento.** Material translúcido só na
  navegação (sidebar/tabs), toque que responde, escala tipográfica, cor com propósito,
  **tint só na ação primária**, acessibilidade nativa (Reduce Transparency / Increase
  Contrast / Reduce Motion). Se o app for SwiftUI nativo, use `glassEffect` — não recrie
  o material à mão; se for web, aproxime com `backdrop-filter: blur()` + tint/sombra adaptativos.
- **Stripe — cérebro financeiro.** Densidade calma, hierarquia de número (valor grande +
  apoio cinza), tabelas que respiram com badge de status, **timeline de eventos**, painel
  lateral em vez de troca de página, estados vazios/erro bem tratados, faixa de aviso em ambiente de teste.
- **Shopify Polaris — operação.** Padrões de listagem de produto, status badges, estados
  vazios, tom de voz de lojista.
- **Linear — velocidade.** Navegação rápida, busca/command-palette global, microinterações
  discretas, dark mode impecável.

---

## 7. Destaques de UX (princípios não-negociáveis)

1. **Deferência ao conteúdo** — hierarquia por peso e espaço, não por borda em tudo.
2. **Contexto persistente** — loja + período vivem no chrome, iguais em web e mobile; nunca reiniciam ao trocar de seção.
3. **Painel lateral > nova página** — clicar numa linha abre detalhe à direita sem perder a lista.
4. **Timeline de ciclo de vida** — unidade e venda contam sua história (entrada → reserva → venda → comissão).
5. **Estados vazios com propósito** — "sem vendas no mês", "estoque zerado", "pagamento falhou" sempre dizem o próximo passo.
6. **Mobile-first pra equipe** — vendedor/atendente vivem no celular: alvos ≥ 44px, sheets que sobem, uma métrica-herói por tela.
7. **Acessibilidade** — Dynamic Type, contraste AA, suporte a Reduce Transparency / Increase Contrast.
8. **Dark mode** como cidadão de primeira classe desde o início.

---

## 8. Status das telas

**Prontas (hi-fi, no protótipo):**
- Home do Sócio — desktop + mobile
- Home do Gerente
- Home Vendedor / Atendente — mobile
- Estoque — desktop (com custo) + mobile (sem custo) + painel de detalhe

**A fazer:**
- Detalhe de Venda + timeline de pagamento (estilo Stripe)
- Fotos reais por modelo (integração Supabase — tabela modelo/cor/foto)
- Variação Liquid-Glass da sidebar/tabs (nativo se SwiftUI, CSS se web)
- Fluxo de pagamento Stripe (PDV no balcão e/ou checkout)
- Este pacote de handoff aplicado tela a tela

---

## 9. Norte em uma frase

> Um painel que faz um dado financeiro complexo parecer **calmo e óbvio** — tech,
> preciso e respeitoso com quem está olhando.
