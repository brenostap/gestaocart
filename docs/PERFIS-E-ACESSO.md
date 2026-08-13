# Perfis e acesso

Quem entra no painel, o que enxerga e **onde a trava mora de verdade**.
Escrito em 13/ago/2026, quando o Vitinho virou o primeiro usuário que não é sócio.

## O que existia antes (e por que não dava pra dar login pro Vitinho)

O painel tinha `papelAtual()`, `MATRIZ_ACESSO`, `podeVerValor()` e `podeVerMargem()` — e **nada
disso era segurança**. O comentário no próprio `shell.js` já dizia: *"é prévia visual, não trava de
segurança"*. `papelReal()` devolvia `'socio'` fixo pra todo mundo.

No banco, **toda** política era `to authenticated using (true)`. Traduzindo: qualquer pessoa com
login lia `custos` (a folha), `funcionarios_config` (pix e salário), `vendas` (lucro e margem),
`compras` (preço de fornecedor). E em `custos`, `metas_mensais`, `funcionarios_config` e
`tabela_precos` também **escrevia e apagava**.

Achado de tabela: as três views `v_vendas_resumo`, `v_ranking_vendedores` e `v_clientes_historico`
**não têm RLS** — view roda com os direitos do dono dela, não do leitor — e estavam com todos os
privilégios pra `authenticated`. Qualquer pessoa logada lia vendas, ranking e clientes inteiros por
elas, **contornando o RLS das tabelas**. Nenhuma é usada pelo app (zero referências em `js/`).

## As duas camadas — não confundir

| | Onde | O que faz | O que **não** faz |
|---|---|---|---|
| **Cortina** | `MATRIZ_ACESSO`, `money()` (js) | esconde menu e número | não impede nada — é HTML no celular da pessoa |
| **Fechadura** | RLS por papel (Postgres) | decide o que a API entrega | não sabe o que a tela mostra |

**Perfil sem RLS é teatro.** Quem quiser, abre o console e chama a API direto.

## Os papéis

| Papel | Vê | Escreve | RLS de verdade? |
|---|---|---|---|
| `socio` | tudo | tudo | ✅ |
| `bancada` | Estoque e Bancada | só `bancada` | ✅ |
| `gerente` · `vendedor` · `atendente` | — | — | ❌ **só prévia do dono** |

⚠️ Os três últimos existem no `MATRIZ_ACESSO` e no seletor **"Ver como"** desde antes, e continuam
sendo só prévia visual. Por isso o `CHECK` da tabela `perfis` **não os aceita**: criar um perfil
`vendedor` hoje daria uma tela de Vendas aberta lendo zero linha — parece bug e não é.
**Criar papel novo = escrever o RLS dele junto.**

### `bancada` — o perfil do Vitinho

- Menu: **Estoque** e **Bancada**. Sem dashboard, vendas, compras, movimentações, equipe, tabela,
  contas, custos, fechamento.
- **Nem `podeVerValor()` nem `podeVerMargem()`** — `money()` devolve `—` em qualquer tela.
  Sem custo, sem preço de venda, sem margem.
- Sidebar sem o seletor de loja/período (nenhuma das duas telas usa).
- Sem o botão *Exportar WhatsApp* do Estoque: mandar a lista inteira é ato comercial.
- Carga própria (`loadBancadaData()`): busca **só** `estoque` e `bancada`. Não é otimização, é
  consequência — o RLS devolve zero linha no resto, e a carga cheia gastaria a franquia do celular
  dele pra montar array vazio. De quebra evita o fetch do estoque "fresco" da FoneNinja.

## Como funciona

```
auth.users  ──1:1──  public.perfis (user_id, email, nome, papel, funcionario_id, ativo)
                                              │
                     papel_do_usuario()  ─────┤  security definer, lê perfis por auth.uid()
                     eh_socio()          ─────┤
                     tem_perfil()        ─────┘  false = logado mas sem perfil = não lê nada
                                              │
                              políticas RLS de todas as tabelas
```

No front, `auth.js:carregarMeuPerfil()` lê a própria linha **antes** do `enterApp()` — é o perfil
que decide o menu que o `renderShell()` desenha. `papelReal()` (shell.js) lê `meuPerfil`.

**Padrão quando o perfil não carrega é `'socio'`** — e isso é escolha de UX, não de segurança.
Quem decide o que o banco entrega é o RLS. Se a leitura falhar por rede, o dono continua com o menu
inteiro; se falhar por falta de perfil, o banco devolve zero linha e as telas ficam vazias, que é o
sintoma certo.

`security definer` nas três funções é necessário: sem isso a política que lê `perfis` chamaria a
função pra decidir se pode ler `perfis`.

## Estado (13/ago/2026)

RLS por papel **aplicado**. Conferido simulando cada papel no banco, com
`set local role authenticated` + `request.jwt.claims` dentro de transação:

| Papel | estoque | bancada | vendas · custos · folha · compras · preços · reparos |
|---|---:|---:|---:|
| `socio` | 1.696 | ✅ | **tudo** (4.815 vendas, 413 custos) |
| `bancada` | 1.696 | ✅ | **0 em todos** |
| logado **sem** perfil | 0 | 0 | **0 em todos** |

⚠️ **Usuário sem linha em `perfis` não lê nada — nem o estoque.** O padrão é negar. Isso vale pra
qualquer conta criada de agora em diante, inclusive a de sócio.

## Criar um usuário novo

1. **Supabase → Authentication → Users → Add user.** E-mail, senha, e marcar
   *Auto Confirm User* (sem isso o login trava em *"E-mail ainda não confirmado"* — a mensagem já
   está tratada no `auth.js`).
2. Dar o papel:
   ```sql
   insert into public.perfis (user_id, email, nome, papel, funcionario_id)
   select id, email, 'Vitinho', 'bancada', 3165 from auth.users where email = '<e-mail>'
   on conflict (user_id) do update set papel = excluded.papel, ativo = true;
   ```
3. **Tirar o acesso** é `update perfis set ativo = false` — não precisa apagar o usuário.
   `tem_perfil()` passa a devolver `false` e ele para de ler qualquer coisa.

⚠️ **Usuário criado sem linha em `perfis` não lê nada.** É de propósito: o padrão é negar.

## O que ainda está aberto (e não resolvi hoje)

Honestidade sobre o tamanho da trava:

1. **`estoque.valor_estoque` continua alcançável pela API** por quem tem papel `bancada`. A tela
   esconde (`money()` devolve `—`), o banco não — RLS é por linha, não por coluna, e todos os papéis
   compartilham o mesmo role `authenticated` do Postgres. Fechar de verdade pede uma **view sem a
   coluna de custo**, com o `estoque.js` lendo a view quando o papel não vê margem.
2. 🚨 **O proxy `fn` é o buraco grande — e é de ESCRITA, não só de leitura.** Li o código da Edge
   Function em 13/ago. Ela faz duas coisas: confere que existe um usuário autenticado (qualquer um,
   sem olhar papel) e **repassa o método da requisição como veio** —
   `init = { method: req.method }`, com o CORS liberando `GET, POST, PUT, PATCH, DELETE`. Ou seja:
   **quem tem login no painel pode escrever e apagar na FoneNinja**, em qualquer endpoint, com a
   chave da loja. O `verify_jwt` da função está desligado; a checagem é a do próprio código.

   Precisa de duas travas: **whitelist de rota + método** (o painel só usa `GET /apples`) e
   **checagem de papel**. Enquanto isso não existir, todo login novo é um login com poder de
   escrita no ERP.

O item 1 exige abrir o console e montar a chamada na mão, e o que vaza é custo de aparelho. **O
item 2 é diferente em grau**: não vaza, destrói. Ficam anotados porque "tem perfil" vai soar como
"está fechado", e não está.

## Testes

- `node test/perfis.test.js` — prova que o papel `bancada` não vê menu nem número de dinheiro, e
  que as duas telas dele montam. **É a cortina que ele testa, não a fechadura**: teste de front não
  prova RLS nenhum.
- A fechadura se confere no banco: entrar com o usuário e conferir que `custos`, `vendas` e
  `funcionarios_config` voltam vazios.
