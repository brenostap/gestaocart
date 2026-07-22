# Design System — mapa e decisões

O **brief** ([DESIGN-BRIEF.md](DESIGN-BRIEF.md)) diz *o que* queremos.
Este arquivo diz *onde está* e *o que já foi decidido*.

## Decisões fechadas (jul 2026)

| Decisão | Escolha | Por quê |
|---|---|---|
| Direção visual | **A · Calmo** | conteúdo opaco, borda 1px, sombra de papel. Nada compete com o número — é tabela densa o dia inteiro. |
| Fonte | **Sora** (texto) + **Geist Mono** (números, ids, seriais) | testada contra Geist, Manrope, Jakarta, Outfit e Space Grotesk em `direcoes.html` |
| Acento | azul `#3b6fd6` (Cart) / laranja `#F39200` (Urban) | só na ação primária e no estado ativo (Apple HIG) |
| Cor semântica | verde=lucro/ok · âmbar=atenção · vermelho=crítico · violeta=processo | cor = significado, nunca decoração |
| Tema escuro | `prefers-color-scheme` + override manual em `data-theme` | preferência salva em `localStorage.pc_tema` |
| Build | **sem bundler** — `<script>` clássicos | preserva os ~91 `onclick` inline do HTML |

As direções B/C/D (Liquid Glass, Tech, Neon) foram construídas e **descartadas**,
mas seguem em `css/direcoes.css` para comparar de novo se der vontade.

## Onde mora cada coisa

| Arquivo | Papel |
|---|---|
| `css/theme.css` | **tokens** — cores, escala tipográfica, raios, sombras, dark mode |
| `css/components.css` | estilos dos componentes (`.c-card`, `.c-kpi`, `.c-tabela`, `.c-badge`…) |
| `css/shell.css` | layout — sidebar do desktop, bottom-tabs do mobile |
| `css/direcoes.css` | as 4 direções visuais (só o comparador usa) |
| `js/ui.js` | **o kit** — `UI.card/kpi/kpis/badge/tabela/vazio/btn/chip/barra/kv/painel` |
| `js/shell.js` | navegação, contexto (loja + período), matriz de permissão |
| `styleguide.html` | guia vivo — componentes reais, números fictícios |
| `direcoes.html` | comparador das 4 direções lado a lado |

## Regras que não podem quebrar

1. **Tela nova não escreve HTML de card/tabela na mão** — usa `UI.*`. Se falta um
   componente, ele nasce em `js/ui.js` + `css/components.css`, nunca na tela.
2. **Nenhuma cor literal fora de `theme.css`.** Sempre `var(--…)`.
3. **Todo valor em R$ passa por `money()`** (`js/shell.js`), que respeita a permissão.
   Colaborador vê valor de venda; custo e lucro são só do sócio.
4. **Números com `tabular-nums`** e alinhados à direita na tabela.
5. **Estado vazio sempre diz o próximo passo** (brief §7.5).
6. `styleguide.html` e `direcoes.html` são **páginas públicas** — jamais colocar
   número real de faturamento nelas.
