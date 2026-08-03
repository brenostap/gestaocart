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

## Ideia pendente

Virar tela do painel: margem do estoque por modelo, **R$ por aparelho como número
principal**, com alerta de encalhe (dias parados × margem). Hoje o painel mostra o estoque
mas não cruza com a `tabela_precos` — esse número não existe em lugar nenhum pra olhar.
Ver `docs/IDEIAS.md`.
