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
2. ⚠️ **`sync-precos`** aceita qualquer usuário autenticado (além do cron, que usa `x-sync-secret`).
   Quem tiver login pode disparar um sync de preços. Severidade baixa — ele relê a planilha oficial
   e aplica via RPC com guarda, então não dá pra injetar dado: o pior caso é uma re-sincronização
   fora de hora. **A correção é a mesma do `fn`**: depois do `getUser()`, exigir
   `perfis.papel = 'socio'`. Não apliquei junto porque o arquivo tem um regex de caracteres
   invisíveis (`INVIS`) que eu não consigo garantir que retranscrevo byte a byte — vale editar pelo
   painel do Supabase ou pela CLI, com o arquivo original em mãos.

O item 1 exige abrir o console e montar a chamada na mão, e o que vaza é custo de aparelho.

## O proxy `fn` — fechado em 13/ago/2026

Era o buraco grande, e era de **escrita**. A versão 1 fazia duas coisas: conferia que existia
*algum* usuário autenticado (sem olhar papel) e **repassava o método da requisição como veio**
(`init = { method: req.method }`), com o CORS liberando `POST, PUT, PATCH, DELETE`. Traduzindo:
**qualquer pessoa com login no painel podia escrever e apagar qualquer coisa na FoneNinja**, com a
chave da loja. Não vazava — destruía. Só apareceu porque o Vitinho foi o primeiro usuário que não
é sócio.

A versão 2 (`supabase/functions/fn/index.ts`, agora versionada no repo) tem **duas travas, e as
duas precisam passar**:

1. **Papel `socio`** em `perfis` (lido com `service_role`, pelo `user.id` do JWT já verificado).
2. **Rota + método na lista branca** — só o que o painel de fato chama:

   | Método | Rota | Quem usa |
   |---|---|---|
   | GET | `/vendas` | `data.js`, `notificacoes.js` |
   | GET | `/vendas/:id` | detalhe da venda |
   | GET | `/apples` | estoque "fresco" |
   | GET | `/movimentacoes` | acessórios |

   Levantada com `grep -rn "BASE+" js/` — quatro rotas, todas GET. Sem body: a lista só tem GET.

**Tela nova que precise de rota nova entra na lista, de propósito.** Se voltar `403 rota nao
permitida`, é isso — não é bug.

Conferido depois do deploy: sem `Authorization` → **401**; com a chave anon → **401**; `DELETE`
com anon → **401**; `OPTIONS` → **200**. O caminho do sócio não dá pra testar por fora (precisa de
JWT de usuário) — a prova é o painel carregando.

⚠️ Se o `/apples` for negado, o painel **não quebra**: o `loadFromSupabase()` já trata a falha do
estoque fresco e mantém o do Supabase. O sintoma seria estoque de até 1h atrás, não tela em branco.

## Testes

- `node test/perfis.test.js` — prova que o papel `bancada` não vê menu nem número de dinheiro, e
  que as duas telas dele montam. **É a cortina que ele testa, não a fechadura**: teste de front não
  prova RLS nenhum.
- A fechadura se confere no banco: entrar com o usuário e conferir que `custos`, `vendas` e
  `funcionarios_config` voltam vazios.
