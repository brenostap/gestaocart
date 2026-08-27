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
| `v_estoque_vitrine` | estoque disponível pra vender, com selos e **dia de prateleira** (`dias_parado`, 26/ago/2026) | `valor_estoque`, `ultimo_fornecedor` |

Se uma view esquecer o filtro, vaza tudo — por isso o filtro é **sempre a mesma dupla de funções**.

### As views do pós-venda (26/ago/2026)

O papel `comercial` via só as **próprias** vendas — e pós-venda é sobre a venda **dos outros**.
Decidido pelo dono em 26/ago: qualquer perfil comercial consulta qualquer venda.

| View | O que traz | O que **não** traz |
|---|---|---|
| `v_venda_consulta` | qualquer venda: cliente, telefone, valor, quem vendeu/atendeu | `custo_total`, `lucro`, `recebimento_*` |
| `v_venda_consulta_itens` | itens dessas vendas (é por aqui que se acha pelo IMEI) | `valor_estoque` |
| `v_assistencia_cliente` | aparelho **de cliente** na assistência, com dono e dias fora | `valor_previsto`, `valor_cobrado` |

O filtro das três é a função **`pode_consultar_venda()`** = `socio` ou `comercial`. **`bancada`
fica fora de propósito**: o Vitinho não entra em `VE_VALOR`, e valor de venda é exatamente o que
essas views carregam.

⚠️ **Isto ampliou o acesso, e vale saber o tamanho.** Até aqui um colaborador só enxergava linha
que era dele. Agora David, Isa, Mel e Maria alcançam nome e telefone de qualquer cliente. O que
continua fechado é o dinheiro da loja — os quatro interruptores seguem de pé: `podeVerValor()` sim,
`podeVerMargem()` não, `podeVerCustoServico()` não. Nenhuma **tabela** ganhou policy nova.

⚠️ **As três nasceram graváveis — de novo.** Na primeira escrita da migration o revoke foi
`from public, anon`, que **não alcança `authenticated`**: as views saíram com INSERT/UPDATE/DELETE
para qualquer pessoa logada, que é exatamente o bypass de RLS que a auditoria de 20/ago/2026 já
tinha achado e corrigido (`20260820_view_nao_escreve.sql`). Pego na conferência dos grants, no
mesmo dia, antes de qualquer uso. **A regra vale sempre e é fácil de errar porque o padrão antigo
das migrations de 17/ago está escrito do jeito errado:**

```sql
revoke all on public.<view> from anon, authenticated;   -- nunca `public, anon`
grant select on public.<view> to authenticated;
```

Conferir depois de criar view:
`select table_name, privilege_type from information_schema.role_table_grants
 where grantee='authenticated' and table_name like 'v_%'` — só pode aparecer `SELECT`.

### A prova, simulando a sessão da Maria (26/ago/2026)

Não dá pra confiar em leitura de policy: o jeito de saber é **virar a pessoa**. Rodado com
`set_config('request.jwt.claims', ...)` + `set_config('role','authenticated')` no `user_id` real
dela:

| O que ela tentou | Resultado |
|---|---|
| `v_venda_consulta` | **4.977** vendas ✅ |
| `v_venda_consulta_itens` | **15.210** itens ✅ |
| `v_assistencia_cliente` | **21** aparelhos de cliente ✅ |
| `v_estoque_vitrine` | **231** aparelhos ✅ |
| `v_minhas_vendas` | **87** — só as dela ✅ |
| **tabela** `vendas` | **0 linhas** — RLS segurando 🔒 |
| **tabela** `bancada` | **0 linhas** — RLS segurando 🔒 |
| `update` pela view | *permission denied* 🔒 |
| `delete` pela view | *permission denied* 🔒 |

⚠️ **Dívida herdada, não corrigida:** `eh_socio()`, `tem_perfil()`, `pode_operar()`,
`meu_vo_key()`, `meu_at_key()` e `papel_do_usuario()` continuam executáveis por `anon` — a
migration de 20/ago revogou de `anon`, mas o `EXECUTE` vem de **PUBLIC**, e revogar de anon não
tira o que nunca foi dele. As seis são chamadas dentro das policies de RLS: mexer nelas sem um
login real para testar pode derrubar o acesso de todos de uma vez. **Tarefa com teste, não efeito
colateral.** O risco hoje é baixo (as seis devolvem `null`/`false` para quem não tem sessão).

⚠️ **`dias_parado` é tempo, não dinheiro** — por isso pôde entrar. Ele diz o que empurrar
primeiro sem dizer quanto o aparelho custou. A conta de entrada é a **mesma** de
`v_estoque_margem` (compra ou troca, a mais recente): se as duas divergirem, dono e vendedor
discutem números diferentes do mesmo aparelho.

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

⚠️ **Nunca apague e recrie o usuário no Auth pra "resetar a senha".** `perfis.user_id` é
`on delete cascade`: apagar o usuário **apaga o perfil junto, em silêncio**, e o `user_id` novo não
tem perfil nenhum. Pra trocar senha use **Reset password** no dashboard, que preserva o `user_id`.
Aconteceu em 17/ago/2026 — a pessoa entrou e viu **o menu inteiro de admin com zero em tudo**.

### Sem perfil ≠ falha de leitura (corrigido em 17/ago/2026)

O padrão `'socio'` do `papelReal()` existia por um motivo bom — o dono não pode ficar travado por uma
queda de rede — mas cobria **duas ausências muito diferentes**:

| O que aconteceu | Antes | Agora |
|---|---|---|
| A leitura de `perfis` **falhou** (rede) | `'socio'` | `'socio'` — mantido, é o caso que o padrão protege |
| A leitura **funcionou e não veio linha** | `'socio'` ❌ | `'nenhum'` → tela *"Acesso não liberado"* |

O dado nunca esteve exposto: o RLS devolvia zero em tudo. **Quem mentia era a tela** — e ver Custos,
Equipe e Compras no menu faz a pessoa concluir que é admin, ou que o painel quebrou. `js/auth.js`
marca `perfilLidoSemLinha` e `papelReal()` decide com isso. Protegido por `test/perfis.test.js`.

⚠️ **Usuário criado sem linha em `perfis` não lê nada.** É de propósito: o padrão é negar.

## Os 4 atendentes de loja — preparado em 20/ago/2026

Anne, Davi, Leo e Gabi. **Papel `comercial`, só `at_key`** (não vendem aparelho; quando vendem, a
comissão é R$25/un flat, e `mdComissaoVendedor()` já trata isso pela chave).

O que eles alcançam: **Meu dia** + **Vitrine**. Nada de dashboard, vendas, custos ou estoque cru —
é a mesma matriz do David, e a informação da Vitrine chega mastigada pelas views.

**Não há tela nova a construir.** O caminho do atendente já roda desde 13/ago com o Vitinho
(`at_key` sozinho) e desde 17/ago com a Maria (as duas chaves). O que faltava era cadastro.

### Passo a passo

1. **Auth → Add user** para cada um, com *Auto Confirm* (§ *Criar um usuário novo*).
2. Rodar o insert dos quatro de uma vez — casa por e-mail, não inventa `user_id`:

```sql
insert into public.perfis (user_id, email, nome, papel, at_key)
select u.id, u.email, x.nome, 'comercial', x.at_key
  from (values
    ('alauanyramosdecampos@gmail.com', 'Anne', 'anne'),
    ('pacheco.2016.com@gmail.com',     'Davi', 'davi')
    -- Leo e Gabi: e-mail ainda não existe no cadastro (20/ago/2026)
  ) as x(email, nome, at_key)
  join auth.users u on u.email = x.email
on conflict (user_id) do update
   set papel = excluded.papel, at_key = excluded.at_key, nome = excluded.nome, ativo = true;
```

⚠️ **Confira o número de linhas.** O `join` com `auth.users` significa que e-mail digitado
diferente do que está no Auth **não dá erro — dá zero linha**, e a pessoa entra vendo
*"Acesso não liberado"*. Esperado: **uma linha por e-mail da lista**.

### O que eles vão ver (medido em 20/ago/2026, dados reais de agosto)

| | vendas atendidas | levaram acessório | vendido em acessório | comissão (25%) |
|---|---:|---:|---:|---:|
| Anne | 64 | 89% | R$ 5.870 | R$ 1.014 |
| Leo | 62 | 71% | R$ 8.265 | R$ 1.559 |
| Gabi | 60 | 90% | R$ 4.955 | R$ 984 |
| Davi | 0 | — | R$ 0 | R$ 0 |

**O Davi está de férias o mês inteiro** (`SEM_BONUS_COLETIVO['2026-08']`) — a tela dele vem vazia
**e diz por quê**. Não é bug; é o mês dele.

### Duas coisas que a preparação achou, e que valiam mais que o cadastro

1. **A promessa da meta do time aparecia pra quem está fora do rateio.** O aviso de férias
   dependia de já haver faixa batida (`bonusSeEntrasse > 0`). No começo do mês nenhuma caiu ainda
   — em 20/ago a rede tinha 268 de 400 aparelhos —, então o Davi leria *"faltam 132 aparelhos pro
   time liberar R$600 pra cada um"* como se fosse com ele. Agora o aviso vem **no topo do card**,
   sempre que a pessoa está fora, e a frase vira *"pra cada um do rateio"*. Teste novo em
   `test/meudia.test.js` com os números reais de agosto.
2. **`fui_vendedor` dizia "Vendi" em venda sem vendedor.** `is not distinct from` trata `NULL`
   como valor: atendente puro (`vo_key` nulo) + venda sem dono (~5%) dava `true`. Hoje só a Maria
   vê o rótulo (ele só aparece pra quem tem as duas chaves) e ela não tem nenhuma venda assim em
   agosto — mas era erro esperando o primeiro caso. Corrigido em
   `supabase/migrations/20260820_minhas_vendas_papel_sem_null.sql`.

### A lista de vendas mostra a COMISSÃO, por dia (20/ago/2026)

Pedido do dono: o valor da venda não é o número da pessoa — um iPhone de R$7 mil no nome dela não
é dinheiro dela. Agora cada dia tem um **resumo** (como o "resumo do dia" da tela de Vendas do
sócio) e o valor em destaque é **a comissão daquele dia**.

⚠️ **Por que a comissão fecha no DIA e não na venda.** A do vendedor até poderia ser por venda —
é aparelho × taxa, conta que não usa custo. A do atendente é **25% do lucro de acessório**:
comissão por venda = lucro por venda = **custo por item**, exatamente o que foi fechado em 17/ago
("a base é a soma do mês, agregada, não venda a venda"). Medido em jul+ago/2026 nos quatro
atendentes:

| Agrupamento | Casos com **um único item** de acessório | O que isso significa |
|---|---:|---|
| por venda | 66 de 354 (**19%**) | a pessoa deriva o custo exato daquele acessório |
| por dia | 6 de 124 (**4,8%**) | mesma derivação, 4× menos frequente |

Por dia divide a exposição por 4 **e** responde melhor à pergunta que ela faz ("quanto eu fiz
hoje?"). Na linha da venda o atendente vê o que **vendeu** de acessório (preço, não custo —
informação que ele já tem, foi ele que passou no balcão), rotulado *acess.* pra não ser lido como
comissão. Vendedor vê a comissão exata da venda, pelo quanto ela **acrescentou no acumulado** do
mês (mesma técnica do `.xlsx` do fechamento — é o que faz a 81ª unidade aparecer valendo R$35).

Views novas/alteradas em `supabase/migrations/20260820_comissao_por_dia_e_brt.sql`.

⚠️ **O mês passou a fechar em BRT.** `to_char(data_saida,'YYYY-MM')` usava UTC; a folha filtra com
`toBRT()` (core.js: *"SEMPRE comparar datas em BRT"*). Venda das 21h BRT cai no dia seguinte em UTC
— e no dia 1º do mês, mudava de **mês**. São 6 vendas em toda a história (1 com dono, abr/2026),
mas é divergência que só aparece no fechamento, que é exatamente quando a pessoa confere contra o
extrato. Com dia e mês em BRT, **a soma dos dias fecha com o mês por construção** (conferido: 30
aparelhos e R$738,19 de lucro na Maria, ago/2026).

### 🎁 O brinde sai da comissão de quem entregou — e agora aparece

Acessório dado como brinde entra com **preço 0 e custo > 0** (`FONE AIRDOTS`, R$11,63). Como a
comissão é 25% do *lucro*, o brinde **reduz** a comissão de quem atendeu. Isso sempre foi assim na
folha; o que muda é que agora **dá pra ver**: um dia só de brinde aparece como `−R$3`.

Agosto/2026 até o dia 20 — **169 brindes**:

| | brindes | custo | tira da comissão |
|---|---:|---:|---:|
| Anne | 56 | R$ 339 | R$ 85 |
| Vitinho | 50 | R$ 293 | R$ 73 |
| Gabi | 37 | R$ 212 | R$ 53 |
| Leo | 23 | R$ 137 | R$ 34 |

**Decisão do dono, no mesmo dia: o brinde NÃO desconta mais.** Quem dá o brinde é quem fecha a
venda. O custo continua inteiro no resultado da loja; ele sai só da conta de quem recebe.

- JS: `ehBrinde()` / `lucroAcessComissao()` em `core.js` — **a única** definição do lado do navegador.
- SQL: `eh_brinde()` / `lucro_acess_comissao()` — espelho, provado por `test/regra-acessorio.test.js`.
- A **classificação não muda**: brinde continua sendo acessório, continua contando no attach rate e
  em `acess_qtd`. Só o dinheiro muda.

⚠️ **E tem vigência: `BRINDE_ISENTO_DESDE = '2026-08'`.** Regra de comissão sem data reescreve mês
já pago — é a mesma lição das faixas de meta. Aplicar pra trás daria **+R$336 em jul/2026** e
**+R$537 em jun/2026** (maiores: Denilson R$134 e R$123, Anne R$106 e R$92, Vitinho R$16 e R$147).
Se você quiser pagar essa diferença, é uma decisão sua — e o caminho é lançar como *extra nominal*
em Custos, não mexer na data.

Dia negativo ainda pode aparecer, agora só por **acessório vendido abaixo do custo** — que é venda
de verdade e continua descontando. A tela escreve `−R$3` (não `R$-3`) e diz o motivo no toque.

### ⚠️ Antes de todo mundo entrar: congelar os meses fechados

`folha_mensal` está **vazia** (medido em 20/ago). O snapshot existe, o script existe, e nunca
rodou com `--gravar`:

```
node scripts/folha-snapshot.js 2026-07            # confere, não grava
node scripts/folha-snapshot.js 2026-07 --gravar   # congela
```

Sem isso o card *"Meses fechados"* não aparece pra ninguém — inclusive pros quatro que já entraram.
E **recalcular julho hoje dá número diferente do que foi pago**: medido, o bruto de acessórios do
Leo em julho é R$ 11.755 contra os R$ 11.695 da folha (uma capa de R$60 de 25/jul, +R$15 de
comissão); Anne, Davi e Gabi batem exato. Rodar o dry-run e olhar a diferença **antes** de gravar é
o passo que impede a tela de discordar do extrato da pessoa.

## O que ainda está aberto (e não resolvi hoje)

Honestidade sobre o tamanho da trava:

✅ **Fechado em 17/ago/2026** — era `estoque.valor_estoque` alcançável pela API por qualquer perfil.
A tela escondia com `money()`; o banco, não. Como **RLS é por linha, não por coluna**, esconder a
coluna exigiu trocar a **fonte**: `estoque_leitura` agora é `eh_socio()`, e quem não é sócio lê
`v_estoque_vitrine`. As duas pontas subiram juntas — a migration sozinha deixaria a tela do Vitinho
vazia.

Conferido: Vitinho lê **0** na tabela e **215** na view; sócio segue com **1.722**.

Sobrou um detalhe de front que virou regra: **campo ausente não é zero.** Item vindo da view não tem
custo, e `custo = 0` viraria `margem = preço cheio` — número inventado esperando alguém mostrar.
`dadosDoItem()` devolve `null` nos dois, e `origemDoItem()` deixou de carimbar *"Entrada (cliente)"*
em quem simplesmente não recebeu o campo. Protegido por `test/perfis.test.js`.

## ⚠️ Deploy e RLS andam juntos — lição de 17/ago/2026

**Fechar uma policy é mudança quebrante para todo cliente que está rodando código antigo.** E o
código antigo pode estar rodando por dois motivos independentes:

1. **Cache do WebView** — o problema que o `js/versao.js` já trata.
2. **O deploy simplesmente não saiu** — foi o caso aqui, e não havia nada avisando: `git push` deu
   certo, e o site continuou servindo a versão de quatro horas antes.

⚠️ **`git push` não é deploy.** Confirmar o push e dizer "publicado" foi o erro que fez isso demorar
uma hora pra aparecer. **Confira o deploy** (Netlify → Deploys, ou a API) antes de tratar qualquer
mudança de policy como no ar.

Regra prática daqui pra frente: quando a mudança fechar acesso, **suba o front primeiro, confirme
que está no ar, e só então feche o banco.** A ordem inversa deixa todo mundo parado — e o sintoma
(`200` com lista vazia) não parece erro.

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
