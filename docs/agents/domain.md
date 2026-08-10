# Domain Docs

Como as engineering skills devem consumir a documentação de domínio deste repo ao
explorar o código.

## Antes de explorar, ler

- **`CLAUDE.md`** na raiz — neste repo ele já cumpre boa parte do papel de um
  `CONTEXT.md`: mapa dos arquivos, arquitetura que quebra fácil, verdades não óbvias
  do domínio (lucro líquido de taxa, a obs da venda, a virada de ago/2026). **Não criar
  um `CONTEXT.md` duplicando isso** — se um conceito faltar, ele entra no `CLAUDE.md`.
- **`CONTEXT.md`** na raiz, se existir, ou
- **`CONTEXT-MAP.md`** na raiz se existir — aponta pra um `CONTEXT.md` por contexto.
  Ler os relevantes ao assunto.
- **`docs/adr/`** — ler as ADRs que tocam a área onde se vai mexer.
- **`docs/`** — este repo guarda decisões duradouras como arquivos avulsos aqui, sem
  numeração de ADR (ex.: `docs/REGISTRO-VENDA-2026-08.md`, `docs/DESIGN-SYSTEM.md`).
  Valem como ADR pra efeito de "não contradizer em silêncio".

Se algum desses arquivos não existir, **seguir em silêncio**. Não sinalizar a ausência;
não sugerir criá-los de antemão. A skill `/domain-modeling` (alcançada por
`/grill-with-docs` e `/improve-codebase-architecture`) cria os arquivos preguiçosamente,
quando um termo ou uma decisão de fato aparece.

## Estrutura de arquivos

Repo de contexto único (o caso daqui):

```
/
├── CLAUDE.md          ← faz as vezes de CONTEXT.md neste repo
├── CONTEXT.md         ← não existe hoje
├── docs/
│   ├── DESIGN-SYSTEM.md
│   ├── REGISTRO-VENDA-2026-08.md
│   ├── IDEIAS.md
│   └── adr/           ← não existe hoje
├── js/
└── css/
```

Repo multi-contexto (existência de `CONTEXT-MAP.md` na raiz) — **não é o caso aqui**:

```
/
├── CONTEXT-MAP.md
├── docs/adr/                          ← decisões do sistema todo
└── src/
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← decisões daquele contexto
    └── billing/
        ├── CONTEXT.md
        └── docs/adr/
```

## Usar o vocabulário do glossário

Quando a saída nomear um conceito do domínio (título de ticket, proposta de refactor,
hipótese, nome de teste), usar o termo como o `CLAUDE.md` (ou o `CONTEXT.md`, quando
existir) define. Não trocar por sinônimo.

Vocabulário que já tem significado fixo aqui e não deve derivar: **venda**, **obs**,
**vendedor** (quem vendeu) × **atendente** (quem estava logado) × **cadastrador**,
**loja** (Cart / Urban), **líquido**, **taxa** (custo da maquininha) × **taxa_extra**
(juros repassados, é ganho), **upgrade**/**troca**, **conta bancária**.

Se o conceito que você precisa ainda não está escrito em lugar nenhum, isso é um sinal —
ou você está inventando linguagem que o projeto não usa (repensar), ou há um buraco real
(anotar pra `/domain-modeling`).

## Sinalizar conflito com decisão já tomada

Se a sua saída contradiz um arquivo de decisão em `docs/` (ou uma ADR), dizer isso na
cara, em vez de sobrescrever calado:

> _Contradiz `docs/REGISTRO-VENDA-2026-08.md` (a obs manda) — mas vale reabrir porque…_
