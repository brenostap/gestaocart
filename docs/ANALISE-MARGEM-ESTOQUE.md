# Análise de margem do estoque — método e queries

Como o dono prevê o mês: **olha o lucro travado no estoque parado, converte em R$ por
aparelho, e daí calcula quantas vendas precisa pra chegar no lucro que quer.**

> **A métrica principal é R$ de lucro por aparelho. O % é secundário.**
> Percentual sobre bases de custo diferentes engana — ver "A armadilha do %" abaixo.

---

## De onde vem cada número

| Dado | Onde está | Cuidado |
|---|---|---|
| Custo do aparelho | `estoque.valor_estoque` | — |
| Preço de venda | `tabela_precos.preco_varejo` | **`estoque.preco_varejo` está NULO em 100% das linhas** — não serve |
| Data de entrada | `compras.data_entrada` via `compra_produtos.imei_1` | `estoque.created_at` também está nulo |
| Disponível | `estoque.status = 'available'` | `sold` é histórico |

O casamento estoque × tabela de preços é por **modelo + capacidade + condição**, extraídos
do `titulo` por regex (`iPhone 14 Pro Max 256GB Preto Espacial Seminovo`). Casou **218 de
222** aparelhos em 03/ago/2026 (98%).

⚠️ **A `tabela_precos` é um snapshot** — só tem o preço de hoje (`updated_at` igual em todas
as linhas). Não dá pra reconstruir a tabela vigente num mês passado. Comparação de venda
antiga contra tabela atual é aproximação, não prova.

## Query base (recortável)

```sql
with pr as (
  select lower(trim(modelo)) modelo, upper(replace(capacidade,' ','')) cap,
         lower(condicao) cond, avg(preco_varejo) preco
  from tabela_precos where ativo and preco_varejo is not null group by 1,2,3
), e as (
  select id, titulo, valor_estoque, imei_1,
    upper(replace((regexp_match(titulo,'(\d+\s?(?:GB|TB))'))[1],' ','')) cap,
    lower(trim(substring(titulo from 'iPhone (.*?)\s+\d+\s?(?:GB|TB)'))) modelo,
    case when titulo ilike '%lacrado%' then 'lacrado' else 'seminovo' end cond
  from estoque where status='available'
), j as (
  select e.*, pr.preco,
    (select max((c.data_entrada at time zone 'America/Sao_Paulo')::date)
       from compra_produtos cp join compras c on c.id=cp.compra_id
      where cp.imei_1 = e.imei_1) entrada
  from e left join pr on pr.modelo=e.modelo and pr.cap=e.cap and pr.cond=e.cond
)
select count(*) qt,
       round(sum(valor_estoque))        custo,
       round(sum(preco))                venda,
       round(sum(preco-valor_estoque))  lucro_total,
       round(avg(preco-valor_estoque))  lucro_por_aparelho,  -- <<< a métrica
       round(avg(valor_estoque))        custo_medio,
       round(100*sum(preco-valor_estoque)/sum(preco),1) margem_pct
from j where preco is not null;
```

Trocar o `select` final por `group by` para abrir por origem (`entrada >= 'data'`,
`entrada is null` = troca de cliente) ou por modelo.

**Margem realizada** (o outro lado): mesma conta em `venda_produtos` com
`is_principal and preco>0 and valor_estoque>0`, juntando `vendas` por `status='completed'`.

## A armadilha do %

Em 03/ago/2026 eu disse que a margem melhor valeria **+R$59 mil** em agosto (6 pontos de
margem sobre o ticket de julho). **O número certo era +R$35 mil.**

O estoque novo é mais barato — custo médio R$2.345 contra R$3.116 do que se vendeu em
julho. Seis pontos percentuais sobre uma base menor rendem menos dinheiro:

| | Julho vendido | Estoque em 03/ago |
|---|---|---|
| Custo médio | R$3.116 | R$2.345 |
| Preço médio | R$3.673 | R$2.991 |
| **Lucro por aparelho** | **R$558** | **R$646** |
| Margem | 15,2% | 21,6% |

Ticket cai 19%, lucro por aparelho sobe 16%. **Só a conta em reais mostra isso.**

E há um terceiro ganho que nem o R$/aparelho mostra: trava-se **R$771 a menos de capital**
por aparelho. Retorno sobre o dinheiro parado por giro: 17,9% → **27,5%**.

## Retrato de 03/ago/2026

**Estoque:** 222 aparelhos · custo R$530.753 · 218 precificados com **R$140.914 de lucro
potencial** = **R$646/aparelho** (21,6%).

| Origem | Qtd | Lucro/aparelho | Custo médio | Margem |
|---|---|---|---|---|
| Trocas de cliente (sem fornecedor) | 51 | **R$827** | R$1.908 | 30,2% |
| Lote 30/jul–03/ago (fornecedor STP) | 143 | R$597 | R$2.456 | 19,6% |
| Estoque anterior | 24 | R$556 | R$2.614 | 17,5% |

- **01/08 entraram 159 aparelhos por R$398.795** (dia normal são 12–15 itens).
- **Trocas de cliente são o produto mais rentável**: R$827/aparelho contra R$597 do
  fornecedor, e com R$548 menos de capital preso. Cada troca vale como ~1,4 aparelho
  comprado — argumento pra ser agressivo na avaliação de upgrade.
- **Julho não teve desconto**: preço praticado ficou em linha com a tabela (−0,5%; 121
  vendas abaixo, 139 acima). Mesmo vendendo tudo a preço cheio, julho daria 15,1%. A
  margem baixa **veio do custo de compra, não da negociação**.
- **Margem está nos modelos populares**: 14 / 14 Plus / 15 / 13 Pro rendem 21–26%;
  16 Pro Max / 17 Pro Max / 15 Pro Max rendem 14–16%.
- **Encalhe caro**: 7× iPhone 14 Pro Max 128GB Preto Espacial, entrada 15–18/jun, ~R$260
  de lucro cada (7,5%). R$20.500 parados pra ganhar R$1.800 — o mesmo capital no lote novo
  daria R$4.900.

**Projeção pelo método:** pra repetir o lucro de aparelhos de julho (355 × R$558 =
R$198 mil) bastam **307 aparelhos** com o mix atual. Batendo os 400 da meta: **R$258 mil**.

---

# Canais de compra — o que cada um é

**Não são "fornecedores" comparáveis entre si.** São três modelos de negócio diferentes, e
misturar os três num ranking só produz conclusão errada (foi o que eu fiz na primeira
passada — ver "O erro que eu cometi" no fim).

| Canal | O que é | Custo | Lucro/aparelho | Dias até vender |
|---|---|---|---|---|
| **STP** | **peças que o próprio dono envia** — não é fornecedor de mercado | mais barato | **R$711** | 23 |
| **Troca de cliente** | upgrade recebido no balcão | R$1.536 | **R$697** | — |
| **DESEJO** | fornecedor em SP, **pronta entrega** | +R$452 vs STP | R$352 | 14 |
| **JAMES / ED** | fornecedores de estoque | intermediário | R$365–523 | 15–20 |
| **Erick, Apple Show, Grupo, Tokyo…** | **encomenda** (cross-docking) | R$5–6 mil | R$451–600 | **0–1** |

⚠️ **O STP não é referência de mercado.** É o canal do próprio dono — o custo ali é o custo
de aquisição dele, não um preço negociado. Serve de piso pra saber quanto o resto custa a
mais, não de prova de que outro fornecedor "cobra caro".

## O prêmio da pronta entrega

DESEJO cobra mais em **15 de 15 modelos comparáveis** (mesmo modelo + capacidade, maio a
julho): de R$180 a R$809, média ponderada de **R$452 por aparelho**. Isso não é defeito —
**é o preço da disponibilidade imediata**, e o dono compra sabendo disso.

A conta certa não é "DESEJO custa R$452 a mais". É:

> **Enquanto o STP não tem, a alternativa à DESEJO não é o STP — é prateleira vazia.**
> R$352 de lucro é infinitamente melhor que R$0. Comprar da DESEJO em julho foi certo.

O prêmio só é desperdício quando se compra da DESEJO **tendo** peça do STP disponível. Ou
seja: **a alavanca é a cadência da remessa, não a negociação com a DESEJO.**

## Julho: o mês em que a remessa não chegou

Entradas do STP por mês — e o que foi vendido dele:

| Mês | Entradas STP | Un. STP vendidas | Vendas totais | Lucro/aparelho |
|---|---|---|---|---|
| abr/2026 | 97 | 134 | 428 | R$608 |
| mai/2026 | 108 | 145 | 445 | R$626 |
| jun/2026 | 148 | 146 | 453 | R$567 |
| **jul/2026** | **10** | **32** | **366** | R$558 |
| ago/2026 (dia 01) | **165** | — | — | — |

**A remessa de julho chegou no dia 1º de agosto.** O mês inteiro rodou sem o canal que
normalmente responde por **~35% das unidades vendidas** (em julho foram 9%).

Três sintomas que batem com ruptura de estoque, não com demanda fraca:
1. **Volume caiu 19%** (453 → 366) enquanto o lucro por aparelho ficou quase igual
   (R$567 → R$558) — falta de mercadoria tira venda, não margem.
2. **CAC subiu 24%** (R$109 → R$135 por venda) com gasto de marketing igual. Pagar o lead e
   não ter o aparelho que o cliente quer é exatamente isso.
3. **Cobertura de entradas caiu** (67% → 61% das unidades vendidas).

Diferença de lucro de aparelhos entre junho e julho: **~R$53 mil**. Não dá pra atribuir tudo
à remessa — mas foi a única mudança estrutural do mês.

**O que medir daqui pra frente:** dias de cobertura de estoque por canal. Se a remessa do STP
tem ciclo de ~30 dias, o pedido tem que sair com folga suficiente pra não abrir buraco no fim
do ciclo — que é exatamente quando se compra caro da DESEJO.

## O buraco que impede fechar a conta: assistência

O conserto é lançado na área `assistencia` como **despesa do mês**, nunca no custo da peça.
Isso infla a margem de todo aparelho que passou pela bancada e some com a diferença entre
canais.

| Mês | Lançamentos | Total | **Com IMEI no texto** |
|---|---|---|---|
| jun/2026 | 5 | R$39.340 | **0** |
| jul/2026 | 6 | R$24.055 | **0** |

**O dado não existe na origem** — são notas fechadas do prestador, não serviço por aparelho.
Não é problema de SQL: o desbloqueio é **combinar com o prestador que cada serviço venha com
o IMEI**. A partir daí o painel já casa por `estoque.imei_1` / `venda_produtos.imei_1`.

Tamanho do erro enquanto isso: R$24.055 ÷ 366 aparelhos = **R$66 por aparelho** em julho,
12% do lucro médio. E é **concentrado**, não diluído — se só 1 em 3 passa pela bancada, são
~R$200 no aparelho que passou. Suficiente pra inverter a ordem entre dois canais parecidos.

**Conclusão prática:** diferenças grandes (os R$452 da DESEJO) sobrevivem à correção.
Diferenças de R$100–150 entre fornecedores **não são conclusivas hoje**.

Ver `docs/IDEIAS.md` → "Custo real do aparelho — assistência por IMEI".

## O erro que eu cometi (pra não repetir)

Na primeira leitura eu ranqueei todos os fornecedores na mesma tabela e concluí que a DESEJO
"cobrava R$452 a mais" — como se fosse má compra. Errado por duas razões:

1. **Usei o STP como régua sem saber que é o canal do próprio dono.** Comparar fornecedor de
   mercado com custo de aquisição próprio não mede nada.
2. **Ignorei o que o preço compra.** Pronta entrega tem valor, e o dono já sabia disso — ele
   escolheu pagar. O número certo a perseguir não era o desconto na DESEJO, era o **timing da
   remessa do STP**.

Regra pro futuro: **antes de comparar canais, perguntar o que cada um é.** O dado não conta
isso — `compras.fornecedor_nome` é só um texto.

## Ideias pendentes

- **Tela de margem do estoque**: por modelo, **R$ por aparelho como número principal**, com
  alerta de encalhe (dias parados × margem). Hoje o painel não cruza estoque com
  `tabela_precos` — o número não existe pra olhar.
- **Painel de canais**: R$/aparelho e dias de giro lado a lado, **separando estoque próprio de
  encomenda**. Encomenda tem margem % péssima (7–10%) e some em qualquer relatório ordenado
  por percentual — mas rende R$500–600 por aparelho **sem travar capital**.
- **Dias de cobertura por canal**, pra antecipar o buraco de remessa antes que ele aconteça.
- **Custo de assistência por IMEI** — pré-requisito de tudo acima.
