# Issue tracker: Markdown local

As tarefas e specs deste repo vivem como arquivos markdown em `.scratch/`.

## Onde fica o quê (específico deste repo)

- **`docs/IDEIAS.md` é o backlog oficial**, organizado por área, com status
  (💡 ideia · 🔨 andando · ✅ feito · ❄️ pausado · ⭐ alto valor). Ideia nova que não
  é a tarefa do momento vai pra lá, não pro `.scratch/`.
- **`.scratch/` é rascunho de trabalho em andamento** — spec e tickets de uma coisa
  que está sendo feita agora. Quando termina, o resultado vira commit + linha ✅ no
  `docs/IDEIAS.md`, e a pasta pode sumir.
- Decisão que precisa durar vira arquivo em `docs/` (ex.: `docs/REGISTRO-VENDA-2026-08.md`),
  não ticket.

## Convenções

- Um assunto por diretório: `.scratch/<assunto-slug>/`
- A spec é `.scratch/<assunto-slug>/spec.md`
- Tickets de implementação são um arquivo por ticket em
  `.scratch/<assunto-slug>/issues/<NN>-<slug>.md`, numerados a partir de `01` —
  nunca um único arquivo com todos os tickets juntos
- O estado da triagem é uma linha `Status:` perto do topo de cada ticket
  (os nomes dos papéis estão em `triage-labels.md`)
- Comentários e histórico de conversa vão no fim do arquivo, sob um título `## Comments`

## Quando uma skill disser "publicar no issue tracker"

Criar um arquivo novo em `.scratch/<assunto-slug>/` (criando o diretório se preciso).

## Quando uma skill disser "buscar o ticket"

Ler o arquivo no caminho indicado. O dono normalmente passa o caminho ou o número
do ticket direto.

## Operações de wayfinding

Usadas pelo `/wayfinder`. O **mapa** é um arquivo com um **filho** por ticket.

- **Mapa**: `.scratch/<esforço>/map.md` — corpo com Notas / Decisões até aqui / Névoa.
- **Ticket filho**: `.scratch/<esforço>/issues/NN-<slug>.md`, numerado a partir de `01`,
  com a pergunta no corpo. Uma linha `Type:` registra o tipo do ticket
  (`research`/`prototype`/`grilling`/`task`); uma linha `Status:` registra
  `claimed`/`resolved`.
- **Bloqueio**: uma linha `Blocked by: NN, NN` perto do topo. O ticket destrava quando
  todos os arquivos que ele lista estão `resolved`.
- **Fronteira**: varrer `.scratch/<esforço>/issues/` procurando arquivos abertos,
  destravados e sem dono; o menor número ganha.
- **Assumir**: pôr `Status: claimed` e salvar antes de qualquer trabalho.
- **Resolver**: escrever a resposta sob um título `## Answer`, pôr `Status: resolved`,
  e então acrescentar um ponteiro de contexto (resumo + link) nas Decisões até aqui
  do `map.md`.
