# Triage Labels

As skills falam em termos de cinco papéis canônicos de triagem. Este arquivo mapeia
esses papéis para os nomes de label realmente usados no issue tracker deste repo.

| Label no mattpocock/skills | Label aqui        | Significado                                     |
| -------------------------- | ----------------- | ----------------------------------------------- |
| `needs-triage`             | `needs-triage`    | Falta o dono avaliar                            |
| `needs-info`               | `needs-info`      | Esperando mais informação de quem abriu         |
| `ready-for-agent`          | `ready-for-agent` | Especificado o bastante pra um agente tocar só  |
| `ready-for-human`          | `ready-for-human` | Precisa de humano                               |
| `wontfix`                  | `wontfix`         | Não vai ser feito                               |

Quando uma skill citar um papel (ex.: "aplique a label de pronto-pro-agente"), usar o
nome da coluna da direita.

Como o tracker aqui é markdown local, "aplicar a label" significa escrever a linha
`Status: <label>` perto do topo do arquivo do ticket — não existe API de label pra chamar.

Pra mudar o vocabulário, editar a coluna da direita.
