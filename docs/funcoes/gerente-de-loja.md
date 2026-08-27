# Treinamento de Gerência — Phone Cart

> **Origem:** documento interno criado pelo dono
> (`Treinamento_de_Gerencia_Phone_Cart_PADRONIZADO.pages`), transcrito aqui em 26/ago/2026.
> O `.pages` não é versionado — a Netlify publica a raiz do repo. Ver [README](README.md).
>
> ⚠️ **Quem ocupa: Isa (Isabella de Almeida Teixeira), a partir de setembro/2026.** Ela está saindo
> do home (vendedora online) para a gerência. **Nada muda em agosto/2026** — ver
> [A transição](#a-transição-de-vendedora-online-para-gerência) no fim.

---

## Papel do gerente

Gerente é a pessoa responsável por **fazer a operação funcionar bem no dia a dia**, garantindo que
equipe, vendas, atendimento, estoque e organização estejam alinhados.

Primeiro passo para se tornar um bom líder é entender sobre pessoas e suas diferenças. Todo mundo
tem qualidades e defeitos; o que queremos na gerência é pegar a qualidade que cada um tem e usar a
favor da empresa. Às vezes a pessoa não sabe da própria qualidade — então a função do líder é
**saber captar isso**.

## Gestão da equipe

- Acompanhar o desempenho de cada vendedor/atendente.
- Distribuir tarefas e responsabilidades.
- Cobrar horários, postura e organização.
- Treinar novos funcionários.
- Fazer reuniões rápidas de alinhamento.
- Corrigir comportamentos inadequados.
- Motivar a equipe e manter o ambiente profissional.
- Identificar quem está performando bem e quem precisa de acompanhamento.
- Resolver conflitos entre funcionários.

## Gestão de vendas

- Acompanhar as vendas diariamente.
- Comparar resultado com a meta.
- Saber quanto cada vendedor vendeu.
- Identificar quem está abaixo da meta **e entender o motivo**.
- Criar estratégias para aumentar conversão; treinar para que o cliente não saia da loja sem comprar.
- Estimular venda de acessórios, iPhones, etc.
- Acompanhar clientes que demonstraram interesse e não compraram.

> O gerente não deve apenas perguntar **"quanto vendeu?"**. Ele precisa entender **"por que vendeu
> ou não vendeu?"**

## Experiência do cliente

- Garantir que o atendimento siga o padrão da empresa.
- Observar como os vendedores abordam os clientes.
- Intervir em situações delicadas.
- Resolver reclamações.
- Garantir que a loja esteja limpa, organizada e apresentável.
- Cuidar para que os funcionários não fiquem em conversas paralelas ou no celular enquanto há
  clientes.

## Indicadores

O gerente precisa acompanhar pelo menos:

- Vendas do dia
- Meta do dia/mês
- Vendas por vendedor
- Conversão
- Cancelamentos/trocas
- Estoque
- Clientes em negociação
- Resultado comparado ao mês anterior

## Operação da loja

É responsabilidade dele garantir que a loja abra e funcione corretamente todos os dias:

- Abertura e fechamento.
- Organização da loja.
- Funcionamento dos equipamentos.
- Distribuição das atividades.
- Conferência de caixa/processos, conforme a estrutura da empresa.
- Resolver problemas operacionais do dia a dia.

## WhatsApp e clientes

- Acompanhar leads.
- Conferir se os vendedores estão respondendo rapidamente.
- Cobrar retorno de clientes.
- Acompanhar negociações importantes.
- Recuperar vendas que estão quase fechando.

## Marketing

O gerente pode ser o **braço da empresa na execução**, mesmo que não seja responsável por criar o
marketing. Por exemplo, no lançamento do iPhone: *marketing cria a campanha → gerente garante que a
equipe execute.*

Ele precisa saber: qual é a campanha · qual é a oferta · qual é o discurso de venda · quais produtos
precisam ser priorizados · como funciona a lista de espera/reserva · quais metas foram estabelecidas.

## Ser uma ponte entre donos e a equipe

Essa talvez seja uma das funções mais importantes. O fluxo ideal seria:

**Dono → Gerente → Equipe**

O gerente recebe as diretrizes da empresa, transforma em ações e acompanha a execução. E depois traz
de volta:

> "Estamos com X vendas, faltam X para a meta, o vendedor X está com dificuldade em conversão,
> tivemos esse problema no estoque e precisamos tomar essa decisão."

## E o que NÃO deveria ser função do gerente?

Isso é muito importante para não transformar o gerente em um "faz tudo". Ele não deveria passar o
dia: limpando a loja · fazendo o trabalho operacional de todos · vendendo o tempo inteiro enquanto
deixa a gestão de lado · resolvendo qualquer problema que o funcionário poderia resolver sozinho ·
fazendo tarefas administrativas que poderiam ser delegadas.

O gerente deve **cobrar, acompanhar, orientar e resolver o que realmente precisa de liderança**.

E o gerente precisa ter **autoridade real**. Se ele é responsável por cobrar a equipe mas não tem
autonomia para tomar decisões ou aplicar as regras estabelecidas, ele acaba virando apenas um
"mensageiro do dono".

---

## A transição: de vendedora online para gerência

**Decidido em 26/ago/2026.** A Isa sai do home e assume a gerência. **A virada é em setembro/2026** —
em agosto **nada muda**:

- Ela continua **vendedora online** (`voKey:'isa'`, comissão por device pela curva do `core.js`:
  R$25/un até 80, R$35 daí pra cima) e com o fixo atual (`SALARIOS.isa = 1500`).
- **O fechamento de agosto sai pela regra antiga.** Mês pago não muda de valor depois — é a regra
  da casa (ver `saiuDaEquipe` / `entraNoBonusColetivo` em `core.js`, e o histórico de Pietra,
  Luana e Denilson).
- Cargo no `FUNC` (`js/config.js`) segue `Vendedora` até a virada.

**O que precisa ser decidido antes de setembro** — nenhuma dessas mudanças é automática:

1. **Remuneração.** Fixo de gerente? Mantém comissão por device? Ganha algo atrelado ao resultado da
   loja (como o `f.bonus` da Anne, que é 5% do lucro de acessórios da loja inteira)? Hoje o
   `equipe.js` só sabe pagar **VO (device)**, **AT (25% de acessório)**, **bônus de meta** e o
   **5% da Anne** — remuneração de gerente é uma regra nova no `calcComissaoFunc()`.
2. **Acesso.** Ela é papel **`comercial`** hoje: vê só *Meu dia*, *Vitrine* e *Tabela de preços*
   (`MATRIZ_ACESSO` em shell.js), e lê **só views** — `vendas`, `venda_produtos`, `estoque` e
   `pagamentos` têm policy `eh_socio()`. Metade dos **Indicadores** deste documento (vendas por
   vendedor, meta, cancelamentos/trocas, resultado vs. mês anterior) está atrás desse RLS.
   ⚠️ **Papel novo = escrever o RLS dele junto** — `gerente` está em `PAPEIS` mas o `CHECK` de
   `perfis` não aceita: criar hoje daria tela aberta lendo zero linha. Ver `docs/PERFIS-E-ACESSO.md`.
3. **Metas.** Se ela deixa de vender no volume de hoje, a meta de aparelhos dela (100/mês) precisa ir
   pra outra pessoa ou sair da conta coletiva — senão a meta da loja "some" sozinha em setembro.

**Dois indicadores do documento o painel não responde hoje:** *conversão* e *clientes em negociação*
não vivem no painel — vivem no Chatwoot e nos bancos de lead do Dudu. Ver
`docs/IAS-E-ESPECIALISTAS.md` e `docs/ATRIBUICAO-LEADS-VENDAS.md`.
