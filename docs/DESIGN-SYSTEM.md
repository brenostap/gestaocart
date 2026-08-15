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
| Cor de forma de pagamento | eixo próprio `--pay-*` (Pix=teal · Crédito=rosa · Débito=ardósia · Dinheiro=bronze) via `UI.badgePagto` | **exceção consciente**: forma é categoria, não estado. Tons calmos que **não** reusam os semânticos (verde=lucro/âmbar=urban/violeta=cart); forma desconhecida cai no badge neutro |
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
| `css/print.css` | **documento de fechamento** — preview + regras de papel (quebra de página, tema claro forçado, tabela que não empilha). Carrega por último de propósito: vence o `@media (max-width:720px)` de `components.css` |
| `js/ui.js` | **o kit** — `UI.card/kpi/kpis/badge/tabela/vazio/btn/chip/barra/kv/painel` |
| `js/shell.js` | navegação, contexto (loja + período), matriz de permissão |
| `styleguide.html` | guia vivo — componentes reais, números fictícios |
| `direcoes.html` | comparador das 4 direções lado a lado |

## Mobile: dois níveis de tabela (ago/2026)

No celular (`≤720px`) tabela não rola: cada linha vira cartão. Há **dois** tratamentos, e
saber qual está em jogo evita mexer no lugar errado:

| | Onde | O que faz |
|---|---|---|
| **Genérico** | `.c-tabela` em `components.css` | rede de segurança: cada célula vira `RÓTULO ⋯⋯ valor`. Serve qualquer tabela, não sabe o que é importante |
| **Cartão desenhado** | `.est-tabela` e `.bnc-tabela` | 2–3 linhas com hierarquia: título forte, meta em mono apagado, número ancorado à direita |

O genérico é honesto mas caro nas telas de lista: 9 células viravam 9 linhas, um aparelho
ocupava ~250px e o modelo — o que a pessoa procura — competia com "ORIGEM" e "COR". Sete
aparelhos davam 1.750px de rolagem. No Estoque a primeira célula é a **etiqueta**, então o
cartão abria pelo código e o aparelho vinha depois.

**Como o desenhado funciona:** cada `<td>` recebeu um `data-campo` no JS; o CSS só decide
`order` e onde quebrar. As quebras são `tr::before` e `tr::after` com `flex-basis:100%` —
**duas réguas, no máximo três linhas**. Mexer numa `order` sem olhar as réguas embaralha o
cartão. O markup do desktop segue intocado (lá continua `table-row`).

Três decisões que valem para cartão novo:

1. **Rótulo some.** No cartão a informação se explica pela forma (`E1381` é etiqueta, `88%` é
   bateria, `⋯3324` é final de IMEI). Campo que *precisa* de rótulo não pertence ao cartão —
   pertence ao detalhe que abre no toque.
2. **Estado repetido não é informação.** O badge `Estoque` aparecia em 33 dos 39: virou ruído.
   Só a exceção (`Garantia`, `Cliente`) fica visível.
3. **Alerta que pinta tudo para de alertar.** Com 16% do estoque na assistência, o fundo âmbar
   virava o fundo da tela — passou a ser uma barra de 3px na lateral.

Conferir mudança de mobile com screenshot de viewport real (Puppeteer), **não** com
`chrome --headless --window-size`: ele renderiza numa largura e corta noutra, e inventa um
overflow que não existe.

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
