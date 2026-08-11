# Análise de vendas e custos — junho e julho de 2026

> Escrito em 11/ago/2026. Fonte: Supabase `pfsfsibgmtbifypuyyqf` (vendas, venda_produtos,
> pagamentos, estoque, compras, compra_produtos, venda_trocas, custos) + `meta_spend_diario` /
> `google_spend_diario` no projeto do CRM. Todas as queries foram rodadas contra o dado real.

## O que ler primeiro

1. **Julho não caiu por demanda nem por descontrole de custo.** Caiu porque faltou aparelho: o
   fornecedor STP (importação própria) atrasou e entregou 10 peças em julho contra 148 em junho.
   Agosto já entrou com 165 peças. **Isso se resolve sozinho.**
2. **O maior vazamento da operação é o fornecedor DESEJO.** Ele é o mais caro em **9 de 9**
   comparações diretas contra outra fonte do mesmo modelo. Sobrepreço estimado: **~R$ 45 mil no
   bimestre** (~R$ 270 mil/ano). É maior que qualquer corte de despesa disponível.
3. **Troca do cliente é o melhor canal de compra**, ~1,5× a margem de fornecedor. O aparelho
   entra mais barato e sai pelo mesmo preço.
4. **A margem que o painel mostra hoje não é a margem.** Faltam três custos que você já paga:
   carrego do capital, reparo de bancada e taxa de cartão. Somam R$ 250–600 por aparelho e pesam
   mais nos modelos velhos e lentos — exatamente onde a decisão de compra é tomada.
5. **Maio é o mês a copiar, não junho.** Maio deu 21,5% de margem; junho vendeu R$ 190 mil mais e
   lucrou R$ 12 mil menos.

---

## Premissas carimbadas

Estas premissas sustentam conclusões. Se alguma estiver errada, o número muda.

| Premissa | Valor usado | Confiança |
|---|---|---|
| Custo do capital | **3% a.m.** (informado) → **0,1%/dia** de carrego | ✅ informado |
| Principal implícito | R$ 19.700 ÷ 3% = **R$ 656.667** | 🟡 derivado |
| Taxa de cartão por unidade | **~3,5% do preço** (taxa líquida ÷ volume pago) | ✅ medido |
| Custo médio de reparo | **R$ 238/aparelho** (R$ 24.055 ÷ 101 aparelhos, julho) | 🟡 média, não atribuível ainda |
| Reparo: recondicionamento vs garantia | assumido **80/20** — não medido | 🔴 a descobrir |
| Societário Cart | Breno 55% · Marcella 30% · Gustavo 15% | ✅ informado |
| Societário Urban | Gustavo 50% · **Breno 40%** · Marcella 10% | ✅ informado |
| Empréstimos | assumidos **em nome do Breno, financiando as duas lojas** | 🔴 **verificar** |

### Vocabulário (novo)

- **Margem bruta** — `preço − custo de aquisição`. É o que o painel mostra hoje.
- **Margem operacional** — `margem bruta − carrego − taxa de cartão`.
- **Margem real** — `margem operacional − reparo`. É a única que serve pra decidir compra.
- **Carrego** — custo de o capital ficar preso no aparelho: `custo × dias em estoque × 0,1%`.

### Até onde o dado aguenta

| O que olhar | Confiável desde | Por quê |
|---|---|---|
| Faturamento, lucro, ticket, margem | **set/2025** | `lucro` preenchido ~100% |
| Por loja / por vendedor | **jan/2026** | loja vem da obs; 0,6% de cobertura até nov/25 |
| Custos e P&L completo | **mar/2026** | tabela começa em fev/26 e fev está pela metade |

---

## 1. P&L em cascata

### Consolidado

| Linha | jun/2026 | jul/2026 | Δ |
|---|---:|---:|---|
| Faturamento | 1.576.592 | 1.342.768 | −14,8% |
| Vendas | 428 | 340 | −20,6% |
| Aparelhos principais | 428 | 355 | −17,1% |
| Ticket médio | 3.684 | 3.949 | +7,2% |
| **Lucro bruto** | **286.344** | **240.620** | **−16,0%** |
| − Folha + comissão + bônus | −52.854¹ | −45.226 | |
| − Custos operacionais (fora folha) | −130.738 | −110.797 | |
| ↳ dos quais marketing | (46.525) | (45.785) | |
| ↳ dos quais assistência | (39.340) | (24.055) | |
| ↳ dos quais juros | (19.700) | (19.700) | |
| **= Resultado** | **102.752** | **84.597** | **−17,7%** |
| Margem líquida s/ faturamento | 6,52% | 6,30% | |
| Custo total / faturamento | 11,64% | 11,62% | −0,02 pp |

¹ A folha real de junho é **R$ 50.604** — Gabi entrou em julho e o painel usa o fallback da
constante `SALARIOS` para junho, inflando R$ 2.250 que não foram pagos.

**Leitura:** o custo acompanhou a queda quase perfeitamente (−0,02 pp de custo/faturamento).
Julho não teve descontrole de despesa. Julho teve menos aparelho.

### Por loja

| | Cart jun | Cart jul | Urban jun | Urban jul |
|---|---:|---:|---:|---:|
| Faturamento | 1.105.380 | 917.374 | 457.507 | 422.514 |
| Vendas | 322 | 259 | 97 | 80 |
| Ticket médio | 3.422 | 3.539 | **4.717** | **5.281** |
| Lucro bruto | 213.754 | 183.378 | 70.873 | 56.580 |
| **Margem bruta** | **19,3%** | **20,0%** | **15,5%** | **13,4%** |
| − Custos operacionais (rateados) | −91.965 | −81.943 | −38.773 | −28.854 |
| − Folha (rateada) | −39.952 | −34.110 | −12.902 | −11.116 |
| **= Resultado** | **81.837** | **67.325** | **19.198** | **16.610** |
| Custo por venda | 410 | 448 | **533** | **500** |
| Taxa de cartão / faturamento | 4,56% | 4,43% | 4,04% | **5,05%** |

**A Urban vende mais caro e ganha menos, e a distância está aumentando.** Ticket 49% maior que a
Cart, margem bruta 6,6 pontos menor e caindo (15,5% → 13,4%) enquanto a Cart subiu (19,3% → 20,0%).
Custo por venda maior. Em julho pagou proporcionalmente mais taxa de cartão que a Cart.

### O resultado que é seu

| | jun | jul |
|---|---:|---:|
| Cart × 55% | 45.010 | 37.029 |
| Urban × 40% | 7.679 | 6.644 |
| **Seu bolso** | **52.689** | **43.673** |
| Gustavo (Urban 50% + Cart 15%) | 21.874 | 18.404 |
| Marcella (Cart 30% + Urban 10%) | 26.471 | 21.859 |

**A Urban é 24,6% dos aparelhos vendidos e 15,2% do seu bolso.** Ela consome o mesmo capital, a
mesma bancada de assistência e a mesma equipe da Cart.

> 🔴 **Verificar:** se os empréstimos estão no seu nome e financiam o estoque das duas lojas, você
> paga 3% a.m. sobre o capital que gira na Urban e recebe 40% do resultado dela. Sobre os ~R$ 106
> mil de estoque proporcional à Urban isso é ~R$ 3,2 mil/mês de juro, dos quais ~R$ 1,9 mil/mês
> (~**R$ 23 mil/ano**) é subsídio seu aos outros dois sócios. Se a dívida for da Cart e o rateio
> não existir, é a mesma coisa por outro caminho.

---

## 2. A matriz modelo × fornecedor × margem — o núcleo

Unidades vendidas em jun+jul com origem identificada (n ≥ 3 por combinação). Cobertura: 551 das
783 unidades do bimestre (70%). **Margem operacional** = bruta − carrego − taxa. O reparo ainda não
é atribuível por unidade; onde ele se aplica, subtraia ~R$ 238.

| Modelo | Fornecedor | Un | Custo | Preço | Bruta | Dias | Carrego | Taxa | **Operacional** |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 16 Pro Max | **STP** | 13 | 4.073 | 5.203 | 1.131 | 3,0 | −12 | −182 | **937** 🥇 |
| 15 Pro Max | **STP** | 7 | 3.095 | 4.130 | 1.035 | 5,0 | −15 | −145 | **875** |
| 12 Pro Max | TROCA | 5 | 1.108 | 2.110 | 1.002 | 17,9 | −20 | −74 | **908** |
| 13 Pro Max | TROCA | 12 | 1.879 | 2.807 | 928 | 17,2 | −32 | −98 | **798** |
| 17 Pro Max | **STP** | 9 | 6.514 | 7.606 | 1.091 | 6,9 | −45 | −266 | **780** |
| 14 Pro | TROCA | 7 | 2.171 | 3.047 | 876 | 6,9 | −15 | −107 | **754** |
| 12 | TROCA | 30 | 630 | 1.340 | 710 | 6,0 | −4 | −47 | 659 |
| 14 Pro Max | TROCA | 9 | 2.577 | 3.370 | 793 | 8,9 | −23 | −118 | 652 |
| 11 Pro Max | TROCA | 3 | 753 | 1.467 | 713 | 17,1 | −13 | −51 | 649 |
| 15 Pro | **STP** | 8 | 2.665 | 3.456 | 791 | 11,2 | −30 | −121 | 640 |
| 14 | TROCA | 6 | 1.438 | 2.157 | 718 | 4,5 | −6 | −75 | 637 |
| 13 | TROCA | 42 | 1.137 | 1.845 | 708 | 6,1 | −7 | −65 | 636 |
| 16 | **STP** | 3 | 3.037 | 3.823 | 786 | 10,2 | −31 | −134 | 621 |
| 14 Pro Max | **STP** | 7 | 2.463 | 3.240 | 777 | 19,8 | −49 | −113 | 615 |
| 15 | TROCA | 4 | 2.048 | 2.740 | 693 | 2,5 | −5 | −96 | 592 |
| 11 | TROCA | 19 | 333 | 954 | 621 | 4,2 | −1 | −33 | 587 |
| 12 Pro | TROCA | 14 | 1.061 | 1.708 | 646 | 10,4 | −11 | −60 | 575 |
| 15 Pro Max | TROCA | 6 | 3.560 | 4.277 | 717 | 3,5 | −12 | −150 | 555 |
| 13 Pro | TROCA | 6 | 1.762 | 2.397 | 636 | 7,0 | −12 | −84 | 540 |
| 14 Pro | **STP** | 11 | 2.245 | 2.895 | 651 | 9,8 | −22 | −101 | 528 |
| 15 | **STP** | 12 | 1.973 | 2.601 | 628 | 19,0 | −37 | −91 | 500 |
| 14 Plus | ED | 3 | 1.800 | 2.390 | 590 | 15,7 | −28 | −84 | 478 |
| 16 | TROCA | 3 | 2.777 | 3.377 | 600 | 2,3 | −6 | −118 | 476 |
| 15 Plus | **STP** | 12 | 2.215 | 2.847 | 632 | 28,5 | −63 | −100 | 469 |
| 15 Pro | TROCA | 5 | 2.746 | 3.342 | 596 | 7,8 | −21 | −117 | 458 |
| 15 Pro | JAMES | 4 | 2.825 | 3.418 | 593 | 5,2 | −15 | −120 | 458 |
| 16 Pro Max | TROCA | 8 | 4.589 | 5.238 | 649 | 3,9 | −18 | −183 | 448 |
| 15 Plus | JAMES | 6 | 2.307 | 2.867 | 560 | 14,8 | −34 | −100 | 426 |
| 16 Pro | **STP** | 4 | 3.361 | 3.983 | 622 | 20,3 | −68 | −139 | 415 |
| 13 Pro | **STP** | 6 | 1.995 | 2.508 | 514 | 8,0 | −16 | −88 | 410 |
| 17 Pro Max | ERICK | 5 | 6.828 | 7.490 | 662 | 0,1 | −1 | −262 | 399 |
| 17 Pro Max | APPLE SHOW | 3 | 7.003 | 7.660 | 657 | 0,1 | −1 | −268 | 388 |
| 17 Pro Max | GRUPO | 5 | 6.999 | 7.654 | 655 | 0,0 | 0 | −268 | 387 |
| 14 | ED | 7 | 1.729 | 2.173 | 444 | 1,9 | −3 | −76 | 365 |
| 15 | JAMES | 3 | 2.167 | 2.623 | 457 | 0,0 | 0 | −92 | 365 |
| 16 Plus | DESEJO | 7 | 3.636 | 4.171 | 536 | 10,7 | −39 | −146 | 351 |
| 14 | **STP** | 14 | 1.720 | 2.104 | 384 | 4,4 | −8 | −74 | 302 |
| 15 Pro Max | DESEJO | 13 | 3.792 | 4.248 | 455 | 2,1 | −8 | −149 | 298 |
| 13 Pro Max | **STP** | 7 | 2.268 | 2.709 | 441 | 21,9 | −50 | −95 | 296 |
| 14 | DESEJO | 5 | 1.800 | 2.166 | 366 | 11,4 | −21 | −76 | 269 |
| 13 | **STP** | 17 | 1.492 | 1.827 | 335 | 4,0 | −6 | −64 | 265 |
| 12 Pro | **STP** | 8 | 1.496 | 1.828 | 332 | 5,9 | −9 | −64 | 259 |
| 14 Pro | DESEJO | 9 | 2.583 | 2.954 | 371 | 7,2 | −18 | −103 | 250 |
| 14 Pro Max | DESEJO | 12 | 2.996 | 3.380 | 384 | 10,9 | −33 | −118 | **233** |
| 12 Pro | ED | 7 | 1.400 | 1.690 | 290 | 0,2 | 0 | −59 | 231 |
| 14 Plus | DESEJO | 3 | 2.000 | 2.340 | 340 | 18,8 | −38 | −82 | 220 |
| 15 Plus | DESEJO | 14 | 2.582 | 2.896 | 314 | 6,6 | −17 | −101 | 196 |
| 16 | DESEJO | 8 | 3.469 | 3.851 | 383 | 16,6 | −58 | −135 | 190 |
| 13 | ED | 4 | 1.600 | 1.850 | 250 | 2,4 | −4 | −65 | 181 |
| 15 Pro | DESEJO | 23 | 3.124 | 3.449 | 325 | 13,8 | −43 | −121 | **161** |
| 15 | DESEJO | 7 | 2.486 | 2.690 | 204 | 6,7 | −17 | −94 | **93** |
| 13 Pro Max | DESEJO | 12 | 2.583 | 2.813 | 229 | 29,2 | −76 | −98 | **55** ⚠️ |

### O padrão DESEJO

**Em toda comparação direta, a DESEJO é a fonte mais cara do mesmo modelo:**

| Modelo | DESEJO | Melhor alternativa | Sobrepreço/un | Un DESEJO | Perda |
|---|---:|---|---:|---:|---:|
| 15 Pro | 3.124 | STP 2.665 | 459 | 23 | 10.557 |
| 15 Pro Max | 3.792 | STP 3.095 | 697 | 13 | 9.061 |
| 14 Pro Max | 2.996 | STP 2.463 | 533 | 12 | 6.396 |
| 15 Plus | 2.582 | STP 2.215 | 367 | 14 | 5.138 |
| 13 Pro Max | 2.583 | STP 2.268 | 315 | 12 | 3.780 |
| 15 | 2.486 | STP 1.973 | 513 | 7 | 3.591 |
| 16 | 3.469 | STP 3.037 | 432 | 8 | 3.456 |
| 14 Pro | 2.583 | STP 2.245 | 338 | 9 | 3.042 |
| 14 | 1.800 | STP 1.720 | 80 | 5 | 400 |
| | | | | **103** | **≈ 45.421** |

**~R$ 45 mil em dois meses. ~R$ 270 mil por ano.** A DESEJO foi seu 2º maior fornecedor do bimestre
(R$ 264.750). O caso extremo é o **13 Pro Max**: DESEJO entrega a R$ 2.583 e ele ainda fica **29
dias** na prateleira — sobra R$ 55 de margem operacional, e se passar pela bancada fica negativo.
Contra a mesma peça vinda de troca (R$ 1.879, R$ 798 de operacional), é 14× menos rentável.

> ⚠️ **Ressalva honesta:** essa comparação assume **mesmo grau/condição de aparelho**. Se a DESEJO
> entrega grade melhor (menos reparo, bateria melhor), parte do sobrepreço se justifica — e é
> exatamente isso que o reparo por IMEI vai provar ou refutar. Mas 9 de 9 é padrão, não sorte, e a
> DESEJO também perde para **JAMES** e **ED** nos modelos onde os três aparecem.

### As regras que a matriz produz

1. **Modelo antigo (11, 12, 12 Pro, 13) só por troca.** Comprar de fornecedor destrói a margem:
   o 13 dá R$ 636 vindo de troca e R$ 265 vindo do STP, R$ 181 vindo da ED.
2. **Topo de linha (16 Pro Max, 17 Pro Max, 15 Pro Max) importado pelo STP.** É onde estão as três
   melhores margens operacionais da casa (R$ 937, R$ 780, R$ 875).
3. **17 Pro Max: comprar do STP, não do mercado interno.** STP R$ 780 vs ERICK R$ 399, APPLE SHOW
   R$ 388, GRUPO R$ 387. **Dobro da margem.**
4. **Parar de comprar da DESEJO** nos 9 modelos acima, ou renegociar preço com esta tabela na mão.
5. **Cortar o 13 Pro Max de fornecedor** (DESEJO e STP): 29 e 22 dias de prateleira, margem
   operacional de R$ 55 e R$ 296. Só vale por troca.

---

## 3. Canal de origem — troca vs fornecedor

| Canal | Un | Custo médio | Preço médio | Bruta | Carrego | Reparo | Taxa | **Real** |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| **Troca (cliente)** | 187 | 1.573 | 2.297 | **724** | −16 | −238 | −80 | **R$ 390** |
| Fornecedor | 364 | 3.122 | 3.631 | **509** | −31 | −100 | −127 | **R$ 251** |

Margem bruta: 31,5% na troca contra 14,0% no fornecedor. **Mesmo depois de descontar o reparo
integral na troca e apenas R$ 100 no fornecedor, a troca ganha 1,55×.** O aparelho de troca custa
metade e sai pelo mesmo preço.

Volume de troca: R$ 162.365 (103 un) em junho, R$ 191.120 (107 un) em julho — **subindo enquanto a
venda caía**. Isso é bom, não ruim.

**Consequência prática:** cada real de desconto que você dá pra fechar uma troca compra margem mais
barata que cada real gasto com fornecedor. Vale ser mais agressivo na avaliação de trade-in,
**exceto** nos modelos que empacam (13 Pro Max, 14 Pro Max em cores escuras, 16 Pro, 14 Plus).

---

## 4. Estoque hoje (10/ago/2026)

### Estoque fantasma — corrigir antes de usar o número

**12 dos 197 itens marcados `available` já têm venda concluída.** São R$ 27.222 (5,9%) de capital
que não existe, e eles contaminam o topo do ranking de "parado há mais tempo": dos 13 itens com
mais de 60 dias, **8 já foram vendidos**.

| | Como está na tabela | **Real** |
|---|---:|---:|
| Itens | 197 | **185** |
| Capital | R$ 457.444 | **R$ 430.222** |
| Dias médios | 18,4 | **13,4** |
| Capital > 60 dias | R$ 28.846 | **R$ 9.132 (2,1%)** |

**O estoque está saudável.** 2,1% acima de 60 dias é bom para o ramo. O problema não é volume de
encalhe — é concentração.

### Concentração e ruptura

**14 Pro Max = 23 unidades, R$ 59.626, 13,9% do capital, a maior idade média da casa (29,7 dias).**
Origem: 10 de troca (R$ 2.297 médio), 7 DESEJO (R$ 2.936), 5 STP (R$ 2.665), 1 JAMES. As três
unidades da DESEJO paradas há 53 dias já queimaram ~R$ 154 de carrego cada.

Ao mesmo tempo, ruptura seca nos campeões (a maior parte já resolvida pela chegada do STP em agosto):

| SKU | Vendidos em 61 d | Estoque | Cobertura | Margem operacional |
|---|---:|---:|---:|---:|
| 17 256GB | 48 | 0 | 0 dias | — |
| 17 Pro 256GB | 27 | 0 | 0 dias | — |
| 15 Plus 256 / 15 Pro Max 512 | 19 | 0 | 0 dias | — |
| 17 Pro Max 256GB | **69** | 5 | **4,4 dias** | ~780 |

No extremo oposto, mais de 25 dias de cobertura: 14 128GB (19 un), 13 Pro Max 128 (7), 14 Pro 256
(6), 12 Pro 256 (7), 13 Pro 256 (5).

---

## 5. Acessórios

| Categoria | Un | Receita | Custo | Margem | % | Margem/un |
|---|---:|---:|---:|---:|---:|---:|
| **Fonte/carregador** | 217 | 37.433 | 13.100 | **24.333** | 65,0% | **112** |
| Case/capa | 542 | 15.163 | 4.014 | 11.149 | 73,5% | 21 |
| Cabo | 162 | 14.978 | 5.330 | 9.649 | 64,4% | 60 |
| Película | 507 | 8.781 | 2.125 | 6.657 | 75,8% | 13 |
| Fone/AirPods | 94 | 5.110 | 4.775 | **335** | 6,6% | **4** |

- Acessório é **2,5–2,9% da receita mas 9,3–11,6% do lucro** dos itens. Margem 64,5% → 68,0%.
- **Attach rate: 75,1% (jun) → 79,9% (jul).** Quando leva, leva 2,6 acessórios. Urban chegou a
  **88,3%** em julho — a Urban vende acessório melhor que a Cart (77,3%).
- **Fonte é o produto**: 217 unidades, R$ 112 de margem cada, R$ 24,3 mil no bimestre. As Kaidi dão
  82–85% de margem contra 62% da Apple e vendem 1/3 do volume — **há espaço pra empurrar a Kaidi**.
- **Película é volume sem lucro**: 507 unidades gerando R$ 13 cada. É serviço de fidelização, não
  produto. Tratar como isca é correto; contar como margem, não.
- **89 SKUs de case para 542 unidades** — catálogo fragmentado, giro individual irrelevante.

### O buraco do brinde

**84 unidades de FONE AIRDOTS saíram a R$ 2 com custo de R$ 1.122 → prejuízo de R$ 972.** Mesmo
padrão no Carregador de Indução (20 un, R$ 480 de receita, R$ 640 de custo) e em 6 itens com preço
zero e custo positivo.

Você comprou esses fones **para serem brinde**, e brinde é ferramenta de negociação decidida na
hora — isso está certo. O problema é de **medição**, não de política: brinde lançado como venda de
R$ 2 não aparece em lugar nenhum como custo de aquisição de cliente, e o custo por venda fica
subestimado. **Recomendação: manter o brinde, parar de registrá-lo como venda.** Lançar a saída
pelo custo, ou como desconto na venda do aparelho — aí ele entra na margem daquela venda, que é
onde a decisão foi tomada, e você consegue medir quanto de brinde cada vendedor usa pra fechar.

---

## 6. Onde cortar

Custos operacionais são **maiores que o seu resultado** (R$ 130,7 mil e R$ 110,8 mil contra R$ 102,8
mil e R$ 84,6 mil). Cada real cortado aqui é um real de lucro.

| Linha | jun | jul | Diagnóstico |
|---|---:|---:|---|
| **Juros** | 19.700 | 19.700 | R$ 656 mil de principal contra R$ 430 mil de estoque — **R$ 226 mil não está girando**, custando R$ 6,8 mil/mês |
| **Assistência** | 39.340 | 24.055 | É custo de mercadoria lançado como despesa. Ver §7 |
| **Marketing** | 46.525 | 45.785 | Lançado R$ 3.293 **acima** do medido nas plataformas em julho (+10,6%) |
| Agências de tráfego | 9.220 | 9.220 | Empire + Mighty, fixo nas duas lojas — R$ 110 mil/ano |
| Sacolas | 5.653 | — | Um lançamento só, em junho |
| Motoboy | 2.605 | 3.250 | +25% |
| Plataformas | 1.990 | 4.057 | +104% (Manutenção Maju 1.700 → 2.700, Fone Ninja 1.067 novo) |
| Folha + comissão | 52.854 | 45.226 | 18,5% → 18,8% do lucro bruto — **estável e saudável** |

**Prioridade de corte, por tamanho:**

1. **Sobrepreço da DESEJO — ~R$ 22,5 mil/mês.** Não é um corte de despesa, é uma renegociação de
   compra. Maior que todos os outros itens somados.
2. **R$ 226 mil de empréstimo fora do estoque — R$ 6,8 mil/mês.** Se esse dinheiro é caixa de
   segurança, ok — mas ele custa 3% a.m. Se é sobra, amortizar paga 36% a.a.
3. **Marketing lançado acima do medido — R$ 3,3 mil/mês.** Conciliar `custos` com
   `meta_spend_diario`/`google_spend_diario` todo mês. A diferença pode ser as agências dentro do
   mesmo lançamento; se for, separar.
4. **Agências R$ 9,2 mil/mês fixos.** Meta + Google medidos foram R$ 33,3 mil em julho — a agência
   custa 28% do que ela gerencia. Vale a pergunta.

### Marketing — custo por venda

| | jun | jul |
|---|---:|---:|
| Marketing lançado | 46.525 | 45.785 |
| Medido nas plataformas | 25.626 (22 de 30 dias) | 33.272 |
| **Custo de marketing por venda** | **R$ 109** | **R$ 135** (+24%) |

⚠️ A série de spend **começa em 09/06/2026** — junho tem 22 de 30 dias. Não é comparável direto.
Julho custou 24% mais por venda que junho, e isso é consequência da queda de volume, não de
aumento de verba (a verba caiu 1,6%).

---

## 7. O buraco crítico: reparo não chega no aparelho

**Isto é o achado mais importante para as decisões futuras**, porque contamina todos os números
acima.

R$ 63.395 em dois meses (Assistência RR / LegacyPhone R$ 53.345 + Access R$ 10.050) são
**manutenções feitas nos aparelhos** — peça e serviço para deixar o seminovo vendável. Hoje isso é
lançado como despesa operacional agregada. Consequência:

- O `valor_estoque` do aparelho **não inclui o reparo**. A margem por unidade está superestimada.
- A superestimação **não é uniforme**: concentra nos modelos que quebram — os velhos, que são
  justamente os que vêm de troca e os que giram devagar.
- **Julho: 101 aparelhos passaram pela RR contra 107 trocas que entraram.** Praticamente todo
  aparelho de troca vai pra bancada. R$ 24.055 ÷ 101 = **R$ 238/aparelho**.
- R$ 238 sobre um iPhone 13 (margem operacional R$ 636) é 37% da margem. Sobre um 13 Pro Max da
  DESEJO (R$ 55) o resultado fica **negativo**.

### O que já dá pra fazer

A granularidade **já existe em parte**, e melhorou em julho:

| Fonte | R$ bimestre | Granularidade hoje |
|---|---:|---|
| **Access** | 10.050 | ✅ **Itemizado**: `"07/07: 12 promax prata placa 6790 (500), 13 rosa vidro traseiro+bateria+flash 8792 (450)"` — modelo, cor, 4 dígitos do IMEI, serviço e valor |
| **Assistência RR / LegacyPhone** | 53.345 | ⚠️ Só agregado: `"fechamento LegacyPhone · periodo 22/07 · 25 aparelhos"` — tem a contagem, não tem quais |
| Junho (ambas) | 39.340 | ❌ Lançado em bloco no dia 30/06, sem obs |

### A chave de casamento (medida)

| Chave | Itens ambíguos | % |
|---|---:|---:|
| Últimos 4 dígitos sozinhos | 230 de 1.634 | **14,1%** ❌ |
| Últimos 4 dígitos **+ modelo** | 17 de 1.634 | **1,0%** ✅ |

**Últimos 4 dígitos sozinhos colidem em 1 de cada 7 aparelhos.** A chave tem que ser
**4 dígitos + modelo** — e a obs da Access já traz modelo e cor, o que leva o erro perto de zero.

### Plano

1. **Pedir à RR o fechamento no formato que a Access já usa** — 4 dígitos + modelo + cor + serviço
   + valor por linha. É 79% do dinheiro e o caminho mais barato de longe. **Fazer isto primeiro**;
   construir rateio para um custo que o fornecedor pode simplesmente detalhar é resolver o problema
   errado.
2. **Tabela `reparos` no Supabase** (imei4, modelo, cor, data, serviço, valor, fornecedor) +
   camada calculada que soma o reparo ao custo do item. **Não sobrescrever `estoque.valor_estoque`**
   — o sync da FoneNinja apaga por cima de hora em hora. O custo real tem que ser uma **camada
   derivada**, nunca uma edição do dado sincronizado.
3. **A data do reparo resolve de graça a distinção recondicionamento vs garantia**: reparo antes da
   venda é custo de mercadoria, depois é garantia. Não precisa descobrir o 80/20 — o dado conta.
4. Corrigir retroativamente as vendas de aparelhos que tiveram reparo, como você propôs. Junho não
   é recuperável (lançamento em bloco, sem obs); de julho em diante é.

> ⚠️ O item 2 seria a **primeira escrita do painel no Supabase** — hoje o app só lê. Isso é decisão
> de arquitetura (permissão, RLS, conflito com o sync) e merece um ADR antes de virar código.

---

## 8. O que fazer em agosto e setembro

**Contexto:** o STP voltou com 165 peças / R$ 379.575 em agosto — mais que junho. Capital custa 3%
a.m. O gargalo é capital e giro.

### Compra

1. **Priorizar 16 Pro Max, 15 Pro Max e 17 Pro Max via STP.** Melhores margens operacionais da casa
   (R$ 937, R$ 875, R$ 780) com giro de 3 a 7 dias. Carrego quase zero, sem bancada.
2. **17 Pro Max: só STP.** R$ 780 contra R$ 387–399 do mercado interno. Se faltar, comprar interno
   é melhor que não ter — mas sabendo que rende metade.
3. **Zerar compra de 11, 12, 12 Pro e 13 de fornecedor.** Esses modelos só compensam por troca
   (R$ 587–659 de operacional vs R$ 181–265 de fornecedor).
4. **Renegociar ou sair da DESEJO** nos 9 modelos da tabela do §2, com os números na mão.
5. **Não comprar 13 Pro Max nem 16 Pro de fornecedor.** 29 e 20 dias de prateleira, R$ 55 e R$ 415
   de operacional.

### Preço e margem

6. **Subir preço do 17 e do 17 Pro Max.** Giram em 0,1 dia e vivem em ruptura — o preço está abaixo
   do que o mercado aceita. Um teste de +2% no 17 Pro Max (R$ 152) vale R$ 10,5 mil/mês no volume
   de 69 unidades/bimestre. Giro instantâneo é sinal de preço baixo, não de acerto.
7. **Ser mais agressivo no trade-in** dos modelos que giram (13, 12, 14, 15 Pro Max). Cada real de
   desconto na troca compra margem mais barata que cada real de fornecedor.
8. **Ser mais duro no trade-in** de 13 Pro Max, 14 Pro Max em cores escuras (Roxo Profundo,
   Dourado), 16 Pro e 14 Plus.
9. **Empurrar fonte Kaidi** (82–85% de margem) sobre a Apple (62%). Fonte já é R$ 24,3 mil de
   margem no bimestre com 217 unidades.

### Estrutura

10. **Decidir sobre a Urban.** 24,6% dos aparelhos, 15,2% do seu bolso, margem caindo, e você
    provavelmente financia o capital dela. Não é "fechar" — é decidir se ela sobe de margem ou se o
    capital vai pra Cart.
11. **Amortizar parte dos R$ 226 mil de empréstimo que não está em estoque**, se não for reserva
    necessária. Rende 36% a.a. garantidos.
12. **Copiar maio.** Foi 21,5% de margem, o melhor mês do ano, com o menor faturamento desde
    fevereiro. Vale reconstruir o que o mix de maio tinha de diferente.

---

## 9. Consertos de dado e processo

| # | Problema | Impacto |
|---|---|---|
| 1 | **12 itens `available` já vendidos** (R$ 27.222) | Infla o capital em 5,9% e distorce o ranking de encalhe |
| 2 | **`estoque.created_at` NULL em 1.630 de 1.630** | Não existe data de entrada nativa; todo cálculo de dias é reconstruído por join (cobre 99% do estoque, 64–79% das vendas) |
| 3 | **`estoque.preco_varejo` = 0 em 100%** | Preço só existe no Google Sheets |
| 4 | **7 áreas legadas em `custos`** (`assistencia`, `financeiro`, `outros`, `salario`, `ia`, `contabilidade`, `operacional`) fora do dropdown `AREAS` | 114 lançamentos. As duas maiores áreas depois de marketing não são selecionáveis num lançamento novo |
| 5 | **Mesmo custo com área diferente entre meses** (Motoboy já foi `logistica`, `operacional` e `outro`) | **Quebra a comparação por área entre meses** |
| 6 | **Bônus de junho nunca lançado em `custos`** (R$ 15.450) | Conciliação de junho fecha em −R$ 15.797; julho fecha em R$ 0,00 |
| 7 | **Os 3 bônus de julho estão com `funcionario = NULL`** | R$ 7.605 que não chegam em ninguém na folha nem em `custosForaFolha` |
| 8 | Gabi sem salário lançado em junho | Folha de junho infla R$ 2.250 pelo fallback de `SALARIOS` |
| 9 | Meta coletiva zerou em julho | 355 aparelhos contra faixa mínima de 400 → bônus caiu de R$ 1.250 para R$ 400/pessoa **no mês em que faltou aparelho pra vender** — incentivo pró-ciclíco, pune a equipe por falha de suprimento |
| 10 | 10 vendas sem loja (R$ 16.585) | Fora do rateio por loja |
| 11 | `recebimento_liquido` divergente em 33% e ausente em 100% de junho | Campo não confiável; usar `Σ pagamentos.liquido` |
| 12 | **`CLAUDE.md` diz que trocas detalhadas não são capturadas** | **Está desatualizado**: `venda_trocas` tem 213 linhas em jun+jul, 96,7% com IMEI, total batendo com `upgrade_valor` |

---

## Apêndice: fórmulas usadas

```
margem bruta       = preço − custo de aquisição            (= venda_produtos.lucro)
carrego            = custo × dias em estoque × 0,001       (3% a.m. ÷ 30)
taxa por unidade   = preço × 0,035                         (taxa líquida ÷ volume pago)
margem operacional = margem bruta − carrego − taxa
margem real        = margem operacional − reparo           (reparo ≈ R$ 238 quando aplicável)

lucro da venda     = Σ pagamentos.liquido + upgrade_valor − custo_total
                     (confere em 99,1% de junho e 98,5% de julho — e já é líquido da taxa)
```

**Não descontar taxa de cartão duas vezes.** `vendas.lucro` já é líquido dela;
`venda_produtos.lucro` não é. Os dois não reconciliam de propósito.
