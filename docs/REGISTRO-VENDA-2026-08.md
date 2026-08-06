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

## 2. Vendedor no campo, loja na origem, atendente no login (desde 06/ago/2026)

Regra nova combinada com o time — **os três dados saem da obs e viram campo estruturado**. A boa
notícia: a FoneNinja **já manda os três dentro do payload da venda**, só não estávamos lendo.

| O quê | De onde vem | Coluna em `vendas` (nova) |
|---|---|---|
| Quem **vendeu** (Mel, Isa, David…) | `venda.vendedor.nome` | `vendedor_nome` |
| **Loja** (cart/urban) | `venda.origem_cliente_id` | `origem_cliente_id` |
| Quem **atendeu** | `venda.cadastrador_id` (quem estava logado) | `cadastrador_id` |

Detalhes que economizam tempo de quem for mexer nisso:

- **A origem vem na VENDA, não só no cliente** — já nasce congelada. O risco que eu tinha levantado
  (editar o cadastro do cliente mudaria a loja de vendas antigas) **não existe** por esse caminho.
- **O catálogo de origens é o endpoint `/origem_clientes`** (não `/origens*`, que caem no HTML da
  SPA). São 9 linhas, sincronizadas por `syncOrigens()` na tabela `origens_cliente`, com a coluna
  `loja` derivada do nome: `CART`, `CART (Anuncio Insta)`, `Outro (Cart)` → `cart`; idem Urban;
  `ATACADO` → sem loja.
- **`vendedor_nome` não depende de `funcionarios`.** O perfil da Mel (id 6438) **não aparece** em
  `/refactored-funcionarios` — só no payload da venda. Se dependêssemos daquela tabela, o vendedor
  online continuaria invisível.
- **`cadastrador_id` acabou com o garimpo:** antes ele só existia dentro de `contas.raw->cadastrador`.
  A fonte antiga continua ligada como reserva pras vendas ainda não re-sincronizadas.

### A obs manda — o campo só tapa buraco

`getVendaInfo()` (equipe.js) usa o campo estruturado **só onde a obs não diz nada**. Se a obs e o
campo discordam, **vence a obs** e a diferença aparece na Conferência. Isso não é preciosismo: a
primeira venda da regra nova (`#40596487`, 06/ago 13:00) já veio **sem observação nenhuma** — sem
esse tapa-buraco ela sumiria da comissão de todo mundo, em silêncio.

⚠️ **O filtro que evita o desastre:** até 05/ago o campo vendedor carregava o **atendente**. O
fallback só aceita nome que seja vendedor online de verdade (`VO_KEYS`) — senão Vitinho viraria
"vendedor" e receberia comissão de venda que não é dele. Mesma trava no cadastrador (`AT_KEYS`).
Protegido por `test/registro-venda.test.js` (`node test/registro-venda.test.js`).

### ⚠️ O `vendedor_id` troca de significado no meio do histórico

Até 05/ago o campo vendedor só tinha perfil de **atendente** — por isso batia com o atendente da
obs em 97,3% (jul/2026). Com os perfis dos vendedores online criados, a mesma coluna passa a
significar **vendedor**. Nada no banco marca a virada: quem ler `vendedor_id` sem saber disso
mistura duas coisas.

A **Conferência** (botão na tela de Vendas, `js/conferencia.js`) mede as leituras ao mesmo tempo,
sem data de corte, sempre contra a **obs pura**:

- **Campo já traz o vendedor** — % das vendas com vendedor na obs cujo campo aponta pra um
  vendedor online. É a **cobertura**: tem que subir até 100%.
- **E acerta quem foi** — dessas, quantas batem com a obs. Tem que ficar em 100%.
- **Origem = loja da obs** — a origem já vinha certa antes da virada: 97,9% em jun/2026 e 95,3% em
  jul/2026. As divergências são, na maioria, cliente **cadastrado no mesmo dia** (erro de quem
  escolheu a origem ou de quem escreveu a obs), não cliente recorrente.
- **Campo vendedor = atendente** (regra antiga) — vai **cair** conforme o time adota. É esperado.
- **Cadastrador = atendente** — mede o login. Erra quando alguém usa a máquina do colega
  (90,7% em jul/2026, contra 97,3% do campo).

**Critério pra parar de escrever a obs:** cobertura 100% e acerto 100% por algumas semanas
seguidas, com a Conferência aberta no período do mês.

### O que ainda merece olho

1. **Débito e dinheiro não separam loja** (parte 1 deste doc) — se quiser, é criar as contas na
   FoneNinja; o painel pega sozinho.
2. **Origem `ATACADO`** não tem loja. Venda de cliente com essa origem e sem obs fica sem loja.
3. **Histórico não foi backfillado**: `origem_cliente_id`, `cadastrador_id` e `vendedor_nome` só
   existem para as vendas que o sync tocar (novas + janela de re-sync). Para o passado, a obs
   continua sendo tudo — e continua funcionando.
