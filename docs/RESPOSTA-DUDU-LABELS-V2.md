# Resposta ao Dudu — o que cai, o que seguro, e o pedido invertido

**De:** Breno (painel Phone Cart / Urban) · **Para:** Dudu · **01/set/2026**
**Responde:** a verificação dos 4 confere / 3 corrige / 1 cai · **Substitui:** `docs/PEDIDO-DUDU-LABELS-CHATWOOT.md`

---

> 🚫 **A §4 desta resposta caiu em 02/set/2026.** Os 1.201 / 438 / 734 são artefato de régua:
> reproduzidos na base do n8n, o balde de 438 vale **6**, e o portão dispara em 97–99% quando há
> compromisso de verdade. Ver **`docs/RESPOSTA-DUDU-LABELS-V3.md`**. O resto do documento segue
> valendo — inclusive o contrato de leitura da §5, que o Dudu aceitou inteiro.

## 0. Em uma frase

Você tem razão no que importa: **o cartão é texto que o modelo escreveu**, e passar regex nele não
transforma opinião em fato. O desenho muda pro teu — verdade no banco, label como espelho — e o meu
contrato de escrita cai junto. **O pedido vira outro: em vez de "escreva label", é "publica a view
e me dá `select`".**

Sobram três discordâncias pequenas e **um número teu que eu acho maior que tudo que nós dois
escrevemos** (§4).

---

## 1. O que cai do meu lado — sem ressalva

| o que eu afirmei | por que cai |
|---|---|
| *"parsing do cartão, custo perto de zero, **conferível**"* | O cartão é string do modelo, parseada por regex no `setDados`. Chamei de conferível uma coisa que **ainda não tinha sido conferida**. Pela minha própria régua — a do `tags-atendimento.js`, onde a evidência é a fala **do cliente** — o cartão reprova. |
| *"a IA já classifica"* | Ela já **escreve**. Não é a mesma coisa, e a diferença é justamente a que eu cobro de todo mundo. |
| **família por cor** (`etapa:` violeta, `q:` verde…) | Não é implementável. Verifiquei (§2). |
| **contrato de escrita no n8n** (Nós A, B, C) | Teu argumento de reprocessabilidade vence: recalcular uma view é uma query; recalcular 18.432 conversas é um projeto. **Label errada gravada não volta.** Aceito inteiro, inclusive a consequência de que o meu Nó A vira opcional e o Nó B sai do n8n. |
| `valor_proposto: 2990` **número** no JSON | Descuido meu, e você já pagou por isso duas vezes em produção. **Contrato 100% string**, cast do nosso lado. |
| *"`resolutions_count` = 0 nas duas"* | Vale 30 dias. A Urban resolveu 4 vezes em mai–jun. Corrigido. |
| *"conversão ~1%"* | Era atalho pra lead→venda, e ficou parecendo constante. Ver §3.3. |
| **8,7× de transferência** pro `q:deu-data` | Contaminado pelo portão do ADR 0011. Ver §3.1. |

E a autocorreção das classes A/B/C/D é melhor que a análise original: você derrubou dois campos que
tinha acabado de aceitar, pelo mesmo critério com que recusou os meus. **Adoto a régua** — nada que
o modelo tenha escrito vira label na v1.

---

## 2. Confirmei o `:`, e é pior do que você contou

Fui no fonte da mesma versão:

```ruby
# lib/regex_helper.rb
UNICODE_CHARACTER_NUMBER_HYPHEN_UNDERSCORE = Regexp.new('\A[\p{L}\p{N}]+[\p{L}\p{N}_-]+\z')
```

Dois detalhes a mais, que reforçam a tua conclusão:

1. **`color`, `description` e `show_on_sidebar` moram no model `Label`** — a rota que rejeita.
   Então uma label com `:` criada por tagging existiria **sem cor, sem descrição e fora da barra
   lateral**, que era exatamente pra que eu queria a família. A cor não é "difícil": é impossível.
2. O model faz **`title.downcase` antes de validar**. Maiúscula também não é opção.

**`_` adotado**, e o dicionário da tua §06 vale como está: `etapa_` · `q_` · `perda_` ·
`classificado_` · `sit_` fora da v1.

Concordo também com deixar `classificado_sim` fora da família `perda_`, e pelo teu motivo:
`perda_indefinido` acabaria somado dentro do total de perdas em algum relatório. É questão de tempo.

---

## 3. As três que eu seguro

### 3.1 O `q_deu-data` é tautológico **pela metade**

Aceito o teu ponto no **8,7× de transferência**: se a transferência só dispara com dia, hora e nome
fechados, "deu data" contém "transferido" e o número mede o próprio portão. Esse eu retiro.

Mas os **14,9% contra 3,4%** são **conversão lead→venda**, não transferência. A contaminação ali é
indireta — passa pelo portão, não é o portão. Fica **mais fraco do que eu vendi, não zero**.

E a consequência prática é tua, não minha: se o portão é o que produz o sinal, **o valor está no
negativo do portão** — que é a tua próxima seção.

### 3.2 Os teus 53% e os nossos R$ 1,04 não somam

Você escreveu *"se o criativo 'aparelho do cliente' está queimando verba, ele está concentrado numa
loja"*. São populações diferentes:

| | nosso número | teu número |
|---|---|---|
| **o que é** | criativo *"aparelho do cliente"* | trocas que pediram avaliação e nunca cotaram |
| **onde** | **Cart · Instagram** | **Urban · WhatsApp** |
| **tamanho** | 824 leads, 15,5% transf., R$ 1,04/lead (n=3 vendas) | 23 de 43 |

Cada um vale por si. **Um não confirma o outro**, e juntar os dois é exatamente o erro de comparar
fora do segmento que a gente combinou de não cometer. Se der pra você quebrar o `perda_queria-vender`
**por criativo** (não só por canal), aí sim os dois se encontram.

### 3.3 Conversão: você corrige o atalho, não a leitura

O "~1%" era lead→venda global e ficou parecendo constante — culpa minha, o documento estava
preguiçoso. Mas o nosso `lead_score` **já separa canal** desde 27/ago: o mesmo lead orgânico vale
**R$ 52,68 no WhatsApp e R$ 9,60 no Instagram**, 5,5×. O teu split confirma mais do que corrige.

⚠️ **E os dois números não se substituem**: você mede **sessão**, a gente mede **lead**. Denominador
diferente. Quando isso virar view, é bom o nome da coluna dizer qual dos dois é.

---

## 4. O número que você enterrou

> *"Quando o lead diz 'bora agendar' sem dar dia e hora, não acontece nada. A gente mediu: 7 em 30 no
> WhatsApp e 9 em 30 no Instagram."*

Isso é **23% a 30% de gente que sinalizou intenção e caiu no vão do portão**. Se segurar no volume
cheio, é maior que toda a conversa sobre criativo, maior que qualquer label, e — diferente da mídia —
**é consequência de uma decisão nossa** (ADR 0011), não do mercado.

**Isso não é uma etiqueta. É um vazamento.** O `q_sinal-ignorado` deveria ser o primeiro a rodar, e
sozinho: dá pra medir em 30 dias sem esperar vocabulário, sem esperar calibração, e sem escrever nada
em lugar nenhum.

### ⚠️ E eu tenho a outra metade dessa medida, medida por fora

Do lado de cá, olhando só a **fala da IA** nas conversas da Cart que chegaram a preço (jul+ago):
**1.201 conversas com compromisso assumido e ninguém avisado** — 734 em que ela disse *"um
especialista vai confirmar"*, **438 em que ela marcou dia e hora**, 166 em que disse que separou o
aparelho. Real: *"Fiquei com o 17 Pro 256 Titânio Azul separado aqui pra sexta às 16h"* — sem
transferência.

**São as duas pontas do mesmo portão**, medidas por caminhos independentes: você viu o lead
sinalizando e nada acontecendo; eu vi a IA prometendo e ninguém sendo chamado. Em 438 delas **o dia
e a hora existem** — então nesses casos não é o portão faltando dado, é o portão não disparando.
Isso muda a pergunta de *"o gate é exigente demais?"* para *"o gate está funcionando?"*.

**Pedido concreto:** roda o `q_sinal-ignorado` nos 30 dias cheios, quebrado por loja e canal. Se
aquilo virar 20%+ das 6.136 sessões, a gente para tudo e olha o portão.

---

## 5. O pedido invertido — o que eu preciso agora

Aceito que a verdade mora no teu banco. Então **o meu contrato deixa de ser de escrita e passa a ser
de leitura**, e é bem menor:

**Uma view, grão de sessão, e `select` pra um role read-only nosso.** Colunas que eu preciso:

| coluna | por quê |
|---|---|
| `projeto` (`cart`\|`urban`) | ⚠️ **não derivável do sufixo**: o `session_id` do Instagram termina em `-cart` **nas duas lojas**. |
| `sessao_id` · `lead_id` · `canal` · `criado_em` | grão e período |
| **chave pra casar com venda** | é o buraco: do nosso lado a venda tem **telefone e obs**, não tem `session_id`. Telefone normalizado é o único candidato que enxergo — confirma? |
| `segmento` (origem × canal × tema) | pra comparar dentro do segmento, que é a regra que nos protege |
| as labels derivadas + **a classe de cada uma** (A/B/C/D) | sem a classe eu volto a tratar D como fato |
| `derivado_em` + **`vocab_versao`** | você mesmo disse que vocabulário muda. Se muda, a linha precisa dizer **qual versão a gerou**, senão série temporal quebra calada |
| `avaliado` (bool) | ⚠️ pra distinguir **"não avaliado"** de **"avaliado e sem motivo"** — a §6.3 do meu doc, que você aceitou. Sem essa coluna a cobertura vira chute. |

⚠️ **E a trava de loja tem que estar dentro da view.** Registro do nosso lado: das 78 vendas que a
base da Urban reivindicava numa janela madura, **44 eram vendas da Cart**. Qualquer número que
atravesse os dois projetos sem `where projeto` sai 2× inflado — e não dá erro.

Sobre a label no Chatwoot como espelho: **concordo, e ela deixa de ser problema meu.** Só uma
pergunta de arrumação — a `lead-qualificado` atual **aposenta ou redefine?** Enquanto ela existir
querendo dizer "foi transferido", alguém vai ler como qualificação. Foi o que eu fiz.

---

## 6. A lista de `perda_` é tua, não minha

Eu inventei nove motivos numa mesa. O `conversa_estado` tem os de verdade, escritos durante o
atendimento:

> *"achou o preço alto"* · *"comparou com a concorrência"* · *"avaliacao do aparelho baixa"* ·
> *"parcela de 282 fugiu do orçamento"* · *"reclamou que propaganda é falsa"* · *"gap acima da alçada"*

**A v1 do dicionário de perda sai daí**, mesmo com 17 linhas de cobertura. Vocabulário observado
ganha de vocabulário inventado, e cobertura conserta com tempo — nome errado não.

Duas dessas eu não teria escrito, e as duas apontam pra coisa nossa, não do lead:
**"propaganda é falsa"** (mídia) e **"gap acima da alçada"** (alçada de desconto). Se essas duas
tiverem volume, são as mais acionáveis da lista inteira.

---

## 7. O conserto do cartão é outro projeto — e vem antes

Isto aqui saiu da conversa de label e virou coisa maior:

- cabeçalho errado por **dez semanas**;
- retorno de upgrade **inventado em 39%** das conversas, com o número memorizado do exemplo do prompt;
- cor do 16e errada em **52 sessões**, nos quatro agentes;
- **quatro lugares** montando o cartão (223, 223, 220 e 147 linhas), já divergidos;
- Urban com 11 tipos, sem o 📦 Envio.

⚠️ **Quem lê essa ficha é o vendedor, pra separar aparelho.** Upgrade inventado e cor errada não são
ruído de medição — são o cara indo buscar o aparelho errado na prateleira. Isso deveria estar
ranqueado **acima** do projeto de label, e a calibração que você propõe na tua §08 (contar quantas
vezes a ficha diz `Upgrade: SIM` e a `avalia_upgrade` rodou) **responde as duas coisas com o mesmo
dia de trabalho**.

Do meu lado eu não consigo confirmar os 11 tipos da Urban: o cartão é **nota privada** e o meu cache
do Instagram só guardou mensagem pública. Fica como teu, não conferido por mim.

---

## 8. As 886 sem cartão

Concordo com esperar. E o teu primeiro corte de graça é bom: se `consulta_produto` roda em 58,7%,
**41,3% nunca consultaram produto nenhum** — classificar motivo de perda de quem não falou nada
fabrica `perda_so-pesquisando` por eliminação, que é exatamente o que a minha §6.3 avisa.

Antes de gastar LLM ali, o que eu quero saber é mais simples: **dessas, quantas o cliente mandou
duas mensagens ou mais?** Quem mandou uma e sumiu não tem motivo de perda — tem ausência.

---

## 9. Perguntas novas

1. **Qual view, e qual a chave pra casar com venda do nosso lado?** Telefone normalizado é o único
   candidato que eu enxergo — confirma, ou tem coisa melhor?
2. **A trava de loja está dentro da view?** (o 44 de 78 acima)
3. **`vocab_versao` e `avaliado` entram como coluna?** São as duas que impedem erro silencioso depois.
4. **O `q_sinal-ignorado` nos 30 dias cheios, por loja e canal** — dá pra rodar essa semana?
5. **A calibração do cartão** (ficha diz `SIM` × tool rodou) entra antes do vocabulário?
6. **`lead-qualificado`: aposenta ou redefine?**
7. **Dá pra quebrar `perda_queria-vender` por criativo**, não só por canal? É o que fecha o §3.2.

---

## 10. Onde eu concordo sem precisar de discussão

**Calibração é portão, não dívida** — nenhum número dessas labels entra em relatório antes da taxa de
concordância publicada. Você chegou nisso pelo mesmo caminho que eu, e é a única defesa contra
repetir a `lead-qualificado`.

E obrigado pelo aviso do `n8n_chat_histories_instagram` existir nos dois projetos com conteúdos
diferentes (241.688 × 141.876), e do `match_resultado` (1.431 × 553). **Consulta sem nomear o projeto
devolve número errado sem devolver erro** — é a mesma classe do `lead_id` que só resolve dentro do
projeto certo. Já está anotado do nosso lado.
