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
| `bancada` | Estoque e Bancada | `bancada` (**sem apagar**), `estoque_correcoes`, `estoque_estado` | ✅ |
| `comercial` | só as **próprias** vendas, pelas views sem custo | nada | ✅ (17/ago/2026) |
| `gerente` · `vendedor` · `atendente` | — | — | ❌ **só prévia do dono** |

### Papel × chaves — dois eixos, não uma escada (17/ago/2026)

`papel` sozinho não descrevia ninguém: o **Vitinho** é `bancada` *e* atende no balcão (52 vendas em
ago/2026), e a **Maria** vende *e* atende. Papel único pediria dois logins ou um papel
`vendedor_atendente`, e o próximo híbrido pediria o terceiro.

```
perfis(user_id, papel, vo_key, at_key, ativo)
                  │      └──────┴── CHAVES: quais LINHAS são minhas
                  └── PAPEL: que menu abre e qual o teto de dinheiro
```

- **`papel`** decide menu e teto: `socio` · `bancada` · `comercial`.
- **`vo_key` / `at_key`** decidem as linhas, e são independentes do papel. O Vitinho tem
  `papel='bancada'` **e** `at_key='vitinho'`.
- **Ter chave não é receber comissão.** Quem paga continua sendo `VO_KEYS`/`AT_KEYS` no
  `js/core.js` — sócios e as IAs (`maju`, `duda`) têm chave e não entram em nenhuma das duas.
- Chave inválida **estoura** (`trg_valida_perfil_keys`), em vez de a pessoa logar e ver zero venda
  sem erro nenhum.

É a mesma regra que `podeCorrigirEstoque()` e `podeVerCustoServico()` já tinham escolhido — *"eixo
próprio, e não um degrau da escada de dinheiro"* —, agora generalizada.

### As views: o colaborador não lê tabela

⚠️ **RLS é por linha, não por coluna.** As linhas que o colaborador precisa (`vendas`,
`venda_produtos`) carregam `custo_total`, `lucro` e `valor_estoque`. Uma policy que libere a linha
entrega o custo junto — a tela esconde com `money()`, a API não.

Por isso o papel `comercial` **não ganhou policy nenhuma nas tabelas**. Ele lê três views, que
rodam com direitos do dono e fazem o próprio filtro por `meu_vo_key()`/`meu_at_key()`:

| View | O que traz | O que **não** traz |
|---|---|---|
| `v_minhas_vendas` | minhas vendas como vendedor **ou** atendente, com `fui_vendedor`/`fui_atendente` | `custo_total`, `lucro`, `recebimento_*` |
| `v_meus_itens` | itens dessas vendas | `valor_estoque`, `lucro` |
| `v_estoque_vitrine` | estoque disponível pra vender | `valor_estoque`, `ultimo_fornecedor` |

Se uma view esquecer o filtro, vaza tudo — por isso o filtro é **sempre a mesma dupla de funções**.

A lista de quem escreve nessas três tabelas é a função **`pode_operar()`** (`socio`,
`bancada`), que espelha `podeCorrigirEstoque()` do `js/shell.js` — **os dois mudam juntos**.
Antes de 14/ago era `tem_perfil()`, ou seja *qualquer* perfil: papel novo já nasceria
escrevendo no controle da bancada sem ninguém ter decidido isso.

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
- **Lança e edita manutenção** (`bancada`), mas **não apaga**: apagar linha é desfazer
  histórico de paradeiro, e fica com o sócio. Não tira nada da tela dele — o front nunca
  apagou de `bancada` (`bncGravar()` faz POST, `bncPatch()` faz PATCH, e é só isso).
- **Corrige aparelho no Estoque** (`estoque_correcoes`) e **marca estado** (`estoque_estado`),
  incluindo desfazer a própria correção — ali apagar é limpar o delta, não histórico.
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

## Estado (14/ago/2026)

RLS por papel **aplicado**. Conferido simulando cada papel no banco, com
`set local role authenticated` + `request.jwt.claims` dentro de transação:

| Papel | estoque | bancada | correções · estado | vendas · custos · folha · compras · preços · reparos |
|---|---:|---:|---:|---:|
| `socio` | 1.702 | ✅ inclusive apagar | ✅ | **tudo** (4.833 vendas) |
| `bancada` | 1.702 | ✅ **menos** apagar | ✅ grava e desfaz | **0 em todos** |
| logado **sem** perfil | 0 | 0 | 0 · INSERT negado | **0 em todos** |

⚠️ **Armadilha ao conferir escrita:** RLS **não dá erro** em UPDATE/DELETE sem policy —
devolve **zero linha em silêncio**. Um teste que só olha "deu erro?" lê isso como
*permitido* e passa batido. Sempre medir com `get diagnostics n = row_count`. Foi assim
que "o Vitinho pode alterar o estoque" apareceu como falso alarme na primeira rodada.

**Prova de que funciona na vida real, não só no teste:** em 13/ago às 23h44 o Vitinho
lançou pelo painel o iPhone 14 Pro Max 256GB Roxo (etiqueta `E1618`) para a RR, serviço
"Face ID" — linha gravada em `bancada` com o e-mail dele em `quem`.

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
   compartilham o mesmo role `authenticated` do Postgres.
   - **Meio caminho andado em 17/ago:** a view existe (`v_estoque_vitrine`, sem `valor_estoque` e
     sem `ultimo_fornecedor`). O que falta é o **front trocar de fonte** — hoje o `estoque.js` lê a
     tabela direto, então apertar `estoque_leitura` para `eh_socio()` agora **derrubaria a tela do
     Vitinho**. Fecha no passo 3 do plano, com as duas pontas na mesma entrega.

Exige abrir o console e montar a chamada na mão, e o que vaza é custo de aparelho.

## Conferência de 17/ago/2026 — papel `comercial` e chaves

Simulado no banco com `set local role authenticated` + `request.jwt.claims` dentro de transação, e
**escrita medida com `get diagnostics row_count`** (a armadilha do topo desta seção):

| | Vitinho (`bancada` + `at_key`) | logado sem perfil | `socio` |
|---|---:|---:|---:|
| `v_minhas_vendas` | **548** | 0 | 0 *(não usa)* |
| `v_meus_itens` | 1.645 | 0 | — |
| `v_estoque_vitrine` | 215 | 0 | — |
| `vendas` (**tabela**) | **0** | 0 | 4.871 |
| `venda_produtos` (**tabela**) | **0** | 0 | 14.897 |
| `pagamentos` (**tabela**) | **0** | 0 | 7.647 |
| `custos` · `compras` · folha | **0** | 0 | tudo |
| `apelidos` | 59 | 0 | 59 |

Escrita como Vitinho: `update vendas` → **0 linhas** · `update apelidos` → **0 linhas** ·
`update estoque` → **0 linhas**.

Colunas de dinheiro fechado presentes nas três views: **zero**.

⚠️ **O front ainda não conhece o papel `comercial`.** O `CHECK` já aceita, mas `MATRIZ_ACESSO`
(shell.js) não tem entrada pra ele — criar um usuário `comercial` **hoje** daria menu de sócio com
zero linha. Não crie perfil comercial antes do passo 3.

*(O `sync-precos` estava aqui como item 2 e foi fechado em 14/ago — ver a seção abaixo.)*

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

## O `sync-precos` — fechado em 14/ago/2026

Até aqui a Edge Function `sync-precos` decidia com `permitido = !!user`: **qualquer login do
painel disparava um sync de preços**. Severidade baixa (relê a planilha oficial e aplica via
RPC com guarda — o pior caso é uma re-sincronização fora de hora), mas não havia motivo pra
deixar aberto. Agora exige **papel `socio`**, no mesmo desenho do `fn`: papel lido com
`service_role`, pelo `user.id` do JWT já verificado.

O caminho do **cron continua igual** — `x-sync-secret` conferido contra `app_secrets`, com
comparação de tempo constante, e nem chega a olhar papel. Esse bloco não foi tocado.

A função agora está **versionada no repo** (`supabase/functions/sync-precos/index.ts`).
O motivo de ela não estar antes era o regex `INVIS`, escrito com os caracteres invisíveis
literais — não dava pra reeditar sem risco de comer um deles em silêncio, e o sync passaria a
deixar lixo invisível nos nomes de modelo. **Agora está em escapes `\uFE00-\uFE0F\u200B-\u200D\uFEFF`**,
que é a mesma coisa (conferido code point a code point nos 1,1 milhão de pontos: **zero
divergência**) e deixa o arquivo editável sem medo. **Não volte pra forma literal.**

⚠️ **O que está rodando ainda tem os literais.** O deploy saiu pela API (MCP), que interpreta o
`\u` no transporte e regrava os caracteres — v3 e v4 saíram com o mesmo hash de bundle, o que
confirma. Não é divergência de comportamento, é de grafia: os dois regex são exatamente o mesmo
conjunto. Pra alinhar o servidor com o repo, redeployar **pela CLI**:
`supabase functions deploy sync-precos --no-verify-jwt` — o `--no-verify-jwt` importa, o cron
chama sem JWT, só com `x-sync-secret`.

Conferido depois do deploy: sem `Authorization` → **401**; com a chave anon → **401**;
`x-sync-secret` errado (mesmo tamanho e tamanho diferente) → **401**; `OPTIONS` → **200**.
O caminho do sócio e o do cron não dão pra testar por fora sem JWT de usuário e sem expor o
segredo — a prova do cron é o `sync_log` marcar `ok` no run diário das 8h. **Confira o
`sync_log` amanhã**: é a única verificação que ficou pendente.

## Testes

- `node test/perfis.test.js` — prova que o papel `bancada` não vê menu nem número de dinheiro, e
  que as duas telas dele montam. **É a cortina que ele testa, não a fechadura**: teste de front não
  prova RLS nenhum.
- A fechadura se confere no banco: entrar com o usuário e conferir que `custos`, `vendas` e
  `funcionarios_config` voltam vazios.
