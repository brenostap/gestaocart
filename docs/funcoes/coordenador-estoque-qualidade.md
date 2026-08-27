# Coordenador de Estoque e Qualidade — Phone Cart

> **Origem:** documento interno criado pelo dono
> (`Coordenador_de_Estoque_e_Qualidade_Phone_Cart_PADRONIZADO.pages`), transcrito aqui em
> 26/ago/2026. O `.pages` não é versionado — a Netlify publica a raiz do repo. Ver [README](README.md).
>
> **Quem ocupa hoje:** Vitinho (Vitor Lima). No painel ele é o papel **`bancada`** (`perfis`), com
> `at_key:'vitinho'` — ele também atende no balcão, por isso tem a tela "Meu dia". No cadastro
> (`FUNC`, `js/config.js`) ainda consta `cargo:'Atendente'`.

---

## 1. Papel do Coordenador de Estoque e Qualidade

Responsável por garantir que **todo produto que entra, permanece ou sai da loja** esteja conferido,
identificado, organizado e funcionando corretamente.

Controle sobre: **Entrada → Conferência → Testes → Etiquetas → Organização → Estoque →
Movimentação → Assistência → Saída → Controle**

O estoque precisa estar sempre organizado e, principalmente, **bater com o sistema e com o estoque
físico da loja**.

## 2. Recebimento e entrada de mercadorias

Sempre que chegar mercadoria:

- Receber e conferir os produtos.
- Conferir quantidade recebida.
- Conferir modelos, cores, armazenamento e demais especificações.
- Conferir **IMEI e número de série** dos aparelhos.
- Verificar se os produtos recebidos correspondem ao que foi comprado.
- Identificar **imediatamente** qualquer produto faltando, trocado ou com divergência.
- Verificar as condições físicas dos produtos e embalagens.
- Realizar a entrada correta dos produtos no sistema.
- Garantir que nenhum produto seja colocado para venda antes de estar conferido e cadastrado.

## 3. Etiquetagem dos aparelhos

- Todos os aparelhos com suas etiquetas corretas.
- Etiquetas com as informações necessárias para identificação.
- IMEI, modelo, armazenamento, cor e demais informações corretos.
- **Nenhum aparelho sem etiqueta no estoque.**
- Etiquetas danificadas ou erradas substituídas.
- O código da etiqueta corresponde ao aparelho cadastrado no sistema.

## 4. Testes e controle de qualidade

Todo aparelho ou produto que precisar de teste passa pelo controle do coordenador:

- Garantir que todos os iPhones sejam testados corretamente.
- Câmera · Face ID ou Touch ID · áudio e microfone · botões · tela e touch · câmeras e flash ·
  carregamento · Wi-Fi e Bluetooth · chip/eSIM quando necessário · saúde da bateria quando aplicável.
- Verificar sinais de manutenção ou problemas no aparelho.
- Identificar qualquer defeito **antes que o produto chegue ao cliente**.
- Registrar aparelhos que apresentarem problemas.
- Separar imediatamente produtos fora do padrão de qualidade da loja.

**O principal:** produto com dúvida ou problema **não vai para venda** até ser verificado.

## 5. Organização do estoque

Diariamente:

- Separar os aparelhos por modelo, armazenamento e demais categorias definidas pela loja.
- Manter produtos de fácil identificação e localização; cada produto com um local definido.
- Não permitir aparelhos ou caixas soltas e fora do lugar.
- Manter o ambiente limpo e organizado.
- Garantir que produtos **vendidos, reservados, em assistência ou com problema** estejam separados
  corretamente.
- Evitar acúmulo de produtos sem definição dentro do estoque.

## 6. Controle de entrada e saída

Saber o que entrou, o que saiu e para onde foi:

- Acompanhar entradas e saídas.
- Conferir aparelhos retirados do estoque para venda.
- Controlar aparelhos **transferidos entre lojas**.
- Controlar produtos separados ou reservados.
- Garantir que toda movimentação tenha registro.
- Investigar **imediatamente** qualquer diferença encontrada.
- Não permitir retirada de produto sem o procedimento correto.

## 7. Produtos enviados para assistência

Todo aparelho que sair para assistência precisa estar sob controle:

- Registrar qual aparelho foi enviado, **IMEI e identificação**, o motivo do envio, a data de saída
  e para qual assistência ou responsável foi.
- Acompanhar aparelhos que estão fora da loja e **cobrar retorno** quando necessário.
- Conferir o aparelho quando retornar e **testar novamente**.
- Atualizar o status do aparelho.
- Garantir que nenhum aparelho fique "perdido" ou sem acompanhamento.

## 8. Conferência de estoque

Conferências frequentes: estoque físico contra o sistema · IMEIs · etiquetas · aparelhos em
assistência · reservados · separados para clientes · transferências entre lojas.

- Identificar produtos que estão **no sistema mas não estão fisicamente** no estoque.
- Identificar produtos físicos que **não estejam corretamente cadastrados** no sistema.
- Comunicar imediatamente qualquer divergência.

**Diferença de estoque nunca deve ser deixada para depois.** Deve ser identificada e investigada.

## 9. Controle de aparelhos vendidos

Antes da entrega ao cliente, garantir que:

- O **IMEI** do aparelho vendido esteja correto.
- O aparelho entregue seja exatamente o registrado na venda.
- A etiqueta e o cadastro correspondam ao produto.
- O aparelho esteja dentro do padrão de qualidade.
- A saída seja registrada corretamente no estoque.

## 10. Responsabilidade sobre o setor

Não é apenas guardar aparelhos ou dar entrada em mercadoria. Ele precisa garantir que **o produto
certo esteja no lugar certo, com a identificação certa, registrado corretamente e funcionando
corretamente**.

Qualquer aparelho que entra, sai, vai para assistência, retorna, é transferido ou apresenta
problema precisa ter controle e acompanhamento.

O estoque é uma das áreas de maior responsabilidade da empresa: qualquer erro pode representar
**perda de produto, prejuízo financeiro, problema com cliente ou diferença de estoque**.

---

## Onde cada item vive no painel hoje

Boa parte deste documento já é exatamente o que o papel `bancada` faz no sistema — o Vitinho é o
único não-sócio com permissão de **escrita** no banco (`pode_operar()`).

| Item do documento | No painel |
|---|---|
| §7 Assistência: registrar aparelho, IMEI, motivo, data de saída, para onde foi, cobrar retorno, conferir na volta | Tela **Assistência** e a tabela `bancada` — uma linha por ida. Existe porque o painel não sabia que o aparelho tinha saído: em 12/ago eram 43 aparelhos e R$ 87 mil marcados como disponíveis. Ver `docs/CONTROLE-MANUTENCAO.md` |
| §8 "no sistema mas não está fisicamente" | O motivo de a `bancada` existir + o botão **📋 Copiar lista** (o "não vender" do grupo, sem preço — por isso o papel `bancada` também exporta) |
| §3 Etiqueta errada, §8 cadastro divergente | `estoque_correcoes` — guarda o **delta** por campo e some sozinha quando a FoneNinja passa a dizer o mesmo. ⚠️ IMEI só entra como `tipo='reporte'` e **nunca** substitui |
| §5 Separar reservado / com problema / fora do padrão | `estoque_estado`: **saldão · precisa reparo · bloqueado · reservado · outro** + observação livre |
| §4 Registrar aparelho com problema | Só o estado `precisa reparo`. **Não existe checklist de teste** (câmera, Face ID, bateria…) — o resultado do teste não fica registrado em lugar nenhum |
| §2 Conferência de entrada (nota × recebido) | **Não existe.** `compras` é read-only do sync; não há tela de recebimento |
| §6 Transferência entre lojas | **Não existe** como movimentação. A tela Movimentações mostra Saídas / Entradas / Clientes, não transferência |
| §9 Conferir IMEI na entrega | **Não existe** como passo no painel |

Três lacunas, portanto: **teste/qualidade (§4)**, **conferência de entrada (§2)** e **transferência
entre lojas (§6/§8)**. Anotadas em `docs/IDEIAS.md`.
