# Funções da equipe — o que cada papel é responsável por fazer

Documentos de **função** (o que a pessoa faz), separados do **cadastro** (quem ela é, quanto
recebe) e do **acesso** (o que ela enxerga no painel). Os três não são a mesma coisa e vivem em
lugares diferentes — ver o mapa abaixo.

## Documentos

| Função | Quem ocupa hoje | Documento |
|---|---|---|
| Gerente de Acessórios (Phone Cart) | Anne | [gerente-acessorios.md](gerente-acessorios.md) |
| Coordenador de Estoque e Qualidade | Vitinho | [coordenador-estoque-qualidade.md](coordenador-estoque-qualidade.md) |
| Gerência da loja | Isa — **a partir de set/2026** (em ago ainda é vendedora online) | [gerente-de-loja.md](gerente-de-loja.md) |
| Coordenadora de Pós-Venda e Atendimento ao Cliente | Maria | [coordenadora-pos-venda.md](coordenadora-pos-venda.md) |
| Atendente de Vendas | Leo, Gabi e Davi (vale também para o atendimento de Anne e Vitinho) | [atendente-de-vendas.md](atendente-de-vendas.md) |
| Responsável pelas Mídias e Conteúdo Digital | David — **acumula com vendedor online** | [midias-e-conteudo.md](midias-e-conteudo.md) |

## Onde vive cada informação da equipe

| Onde | O que guarda | Quem escreve |
|---|---|---|
| `FUNC` em `js/config.js` | Cadastro-mestre: apelido, nome completo, **cargo**, pix, tipo (online/presencial/sócio), e-mail, `voKey`/`atKey`, `bonus`, `saiuEm` | commit |
| `SALARIOS` em `js/config.js` | Fixo mensal por pessoa | commit |
| `funcionarios_config` (Supabase) | Pix, telefone, e-mail, data de início e **obs livre** — editáveis na tela Equipe | sócio, pela tela |
| `dividas` (Supabase) | Vales e adiantamentos parcelados | sócio, pela tela |
| `perfis` (Supabase) | Login → papel (`socio`/`bancada`), `vo_key`, `at_key`. É o que o RLS lê | sócio, no banco |
| `apelidos` (Supabase) | Apelido/typo → chave canônica (`deni`→`denilson`). Fonte única, vale pro RLS e pro sync | sócio, no banco |
| `funcionarios` (Supabase) | Perfis da FoneNinja (id, nome, cargo, ativo) — usados pra resolver `cadastrador_id` | sync, read-only |
| `docs/funcoes/` | **Descrição da função** — este diretório | commit |

Detalhe de papel e RLS em [`../PERFIS-E-ACESSO.md`](../PERFIS-E-ACESSO.md). Quem paga comissão é o
`core.js` (`VO_KEYS`/`AT_KEYS`), não o cargo.

## Regras deste diretório

- **Um arquivo por função, não por pessoa.** A pessoa sai, a função fica. Quem ocupa vai na tabela
  acima e no `cargo` do `FUNC`.
- **Só markdown.** A Netlify publica a raiz do repo, então PDF/DOCX commitado vira URL pública
  (mesma razão de `RR/` e `notas/` estarem no `.gitignore`). O original fica com o dono; aqui entra
  a transcrição.
- **Sem dado pessoal.** Pix, telefone e e-mail já têm lugar (`funcionarios_config`). Aqui é só o
  que a função exige.
- Mudou o cargo de alguém? Mexa no `cargo` do `FUNC` — ele aparece na tela de Equipe e no cabeçalho
  do fechamento (`js/fechamento.js`). ⚠️ O único trecho de `cargo` que o código interpreta é o
  marcador `(saiu)`, lido por `saiuDaEquipe()` em `core.js`; o resto é texto livre.
