# Virada de registro da venda — agosto/2026

Duas mudanças combinadas com o time. Este doc é o estado do que **já chega no banco**,
o que o painel **já lê** e o que ainda **depende do sync** (repo `phonecar-sync`).

---

## 1. Contas de pagamento por loja (já valendo desde 04/ago/2026)

Antes existia uma conta por adquirente, misturando as duas lojas. Agora são quatro,
uma por loja × forma — e o nome da conta carrega a loja:

| Conta (`pagamentos.conta_bancaria`) | Forma (`forma_pagamento`) | Taxa | 1ª venda |
|---|---|---|---|
| `Cart - Mercado Pago` | `Pix/Cart/MercadoPago` | 0% | 04/ago |
| `Cart - PicPay` | `Credito/Cart/Picpay` | tabela PicPay | 04/ago |
| `Urban - PagSeguro` | `Pix/Urban/PagSeguro` | 0% | 04/ago |
| `Urban - PicPay` | `Credito/Urban/Picpay` | tabela PicPay | 04/ago |

**As antigas não sumiram** — e duas continuam ativas:

- `Caixa` / Dinheiro → segue igual, **não separa loja**.
- `PagBank` / Débito (1,09%) → segue igual, **não separa loja**. ⚠️ Não foi criada conta de
  débito por loja: todo débito das duas lojas continua caindo num balde só.
- `MercadoPago` / Pix e `PagBank` / Crédito PagSeguro → **pararam em 03/ago**, ficam no histórico.

### A taxa é a mesma nas duas lojas — e é mais barata que o PagBank

Cart e Urban têm **a mesma tabela** no PicPay (a diferença de % agregado entre elas é só
mix de parcelas, não taxa diferente):

| Parcelas | PicPay (Cart e Urban) | PagBank (antes) | Diferença |
|---|---|---|---|
| 1x | 3,04% | 2,99% | +0,05 |
| 4x | 5,38% | 5,35% | +0,03 |
| 6x | 6,40% | 6,65% | −0,25 |
| 9x | 7,71% | 8,75% | −1,04 |
| 10x | 8,22% | 9,38% | −1,16 |
| 12x | 9,23% | 10,61% | −1,38 |
| 18x | 12,82% | 14,98% | −2,16 |

O PicPay empata até 4x e **ganha de 6x pra cima** — que é onde está o volume.
Aplicando a tabela PicPay ao mix real de crédito de julho/2026 (R$664 mil, R$61.990 de taxa):
**~R$6,2 mil/mês de economia** (estimativa conservadora — 79% do valor tem faixa de parcela
com taxa PicPay já observada; o resto entrou com a própria taxa do PagBank).

> Lembrete que continua valendo: o `lucro` da venda **já é líquido da taxa**. Taxa mais barata
> aparece sozinha no lucro; não há nada a descontar de novo.

### O que mudou no painel

- **Resumo do dia** (faixa entre os dias, tela de Vendas): a seção *Pagamento* continua somando
  por forma (Pix/Crédito/Débito/Dinheiro) e agora **quebra por conta** quando a forma se divide em
  mais de uma — `CART Mercado Pago` / `URBAN PagSeguro` embaixo do Pix, por exemplo. Forma com
  uma conta só (Dinheiro no Caixa) não ganha sublinha. `pagContaInfo()` + `resumoDiaHTML()` (render.js).
- **Tela Contas** e o **filtro por conta** na tela de Vendas montam a lista do próprio dado —
  as quatro contas novas apareceram sozinhas, sem mexer no código.
- Os **badges de forma** (`UI.badgePagto`, `pagFormaInfo`) normalizam por trecho do nome
  (`pix`, `cred`, `deb`, `dinh`) e já leem os nomes novos como Pix/Crédito. ⚠️ Cuidado ao criar
  conta nova: um nome com "pix" e "credito" juntos casaria com o primeiro teste (Pix).

---

## 2. Vendedor no campo, loja na origem, atendente no login (começa 06/ago/2026)

Regra nova combinada com o time — **os três dados saem da obs e viram campo estruturado**:

| O quê | Onde passa a ficar | Onde está hoje |
|---|---|---|
| Quem **vendeu** (Mel, Isa, David…) | campo **vendedor** da FoneNinja → `vendas.vendedor_id` | obs → `vendedor_obs` |
| **Loja** (cart/urban) | **origem do cliente** → `clientes.origem_id` | obs → `vendas.loja` |
| Quem **atendeu** | **perfil logado** ao cadastrar → `contas.raw->cadastrador` | obs → `atendente_obs` |

**Durante a transição o time escreve os dois** (campo + obs). A obs continua sendo a referência
e é ela que paga comissão enquanto a virada não fecha.

### ⚠️ O `vendedor_id` troca de significado no meio do histórico

Até 05/ago o campo vendedor só tinha perfil de **atendente** — por isso batia com o atendente da
obs em 97,3% (jul/2026). Com os perfis dos vendedores online criados, a mesma coluna passa a
significar **vendedor**. Nada no banco marca a virada: quem ler `vendedor_id` sem saber disso
mistura duas coisas.

A **Conferência** (botão na tela de Vendas, `js/conferencia.js`) mede as duas leituras ao mesmo
tempo, sem data de corte:

- **Campo já traz o vendedor** — % das vendas com vendedor na obs cujo campo aponta pra um
  vendedor online. É a **cobertura**: tem que subir até 100%.
- **E acerta quem foi** — dessas, quantas batem com a obs. Tem que ficar em 100%.
- **Campo vendedor = atendente** (regra antiga) — vai **cair** conforme o time adota. É esperado.
- **Cadastrador = atendente** — mede o login. Erra quando alguém usa a máquina do colega
  (90,7% em jul/2026, contra 97,3% do campo).

**Critério pra parar de escrever a obs:** cobertura 100% e acerto 100% por algumas semanas
seguidas, com a Conferência aberta no período do mês.

### Pendente — depende do sync (repo `phonecar-sync`)

1. **Origem do cliente ainda não vira loja.** O sync grava `clientes.origem_id`, mas **não existe
   tabela de origens** — não dá pra saber qual id é "Cart" e qual é "Urban". Falta sincronizar o
   catálogo de origens da FoneNinja.
2. **Origem é atributo do cliente, não da venda.** Cliente que volta e compra na outra loja tem
   uma origem só; se alguém editar a origem dele, a loja de vendas **antigas** mudaria retroativamente.
   Correção: o sync deve **congelar** a origem na venda (coluna nova em `vendas`, gravada no upsert).
   Tamanho do problema hoje: 11 de 2.134 clientes (0,5%) compraram nas duas lojas em 6 meses;
   153 são recorrentes.
3. **Perfis novos precisam aparecer em `funcionarios`.** O `syncFuncionarios()` roda a cada hora e
   traz sozinho — mas até rodar, o nome do vendedor no campo não resolve e a Conferência não conta
   a venda. Em 06/ago a tabela ainda tinha só os 10 perfis antigos (sem Mel, Isa e David).
4. **Cadastrador chega só de carona nas contas a receber** (`contas.raw->cadastrador`) — não tem
   coluna própria em `vendas`. Na prática cobre tudo: 345 de 345 vendas de julho/2026 têm o campo
   (toda venda gera conta a receber). O limite dele não é cobertura, é o que ele mede: o **login
   aberto**, não quem atendeu. Se o atendente virar dado oficial, vale o sync gravar o cadastrador
   numa coluna de `vendas`, em vez de o painel garimpar o jsonb a cada carga.
