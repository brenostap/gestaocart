// ===========================================================================
// Teste da régua de qualificação de conversa — roda com:
//   node test/qualificacao.test.js
//
// O que este teste protege, em ordem de importância:
//
// 1. **`preco_sem_handoff` é o vazamento de R$ mais caro conhecido** (457 Cart +
//    367 Urban em 6 dias). Se ele parar de acusar, o painel de atendimento passa
//    a dizer que está tudo bem enquanto o lead evapora.
// 2. **Nota interna (`private`) não conta como fala com o cliente.** Foi o erro
//    que já mediu handoff como preço em 10/ago/2026. Nota interna não foi pro
//    cliente: não cota preço, não responde, não salva a conversa.
// 3. **`telChave` normaliza o nono dígito.** É a chave que vai casar conversa
//    com venda (camada 0). Errar aqui não dá erro — dá conversão baixa em
//    silêncio, que é pior.
// 4. **Regex global não vaza `lastIndex`.** `MODELO` tem /g; usar `.test()` nele
//    acerta e erra alternadamente na mesma frase. O bug some da vista porque a
//    primeira conversa passa.
//
// Contexto: docs/QUALIFICACAO-CONVERSAS.md
// ===========================================================================
const { regua, contexto, telChave, SINAIS } = require('../scripts/chatwoot.js');

let falhas = 0;
function ok(certo, oque) {
  console.log(`${certo ? '  ok  ' : ' FALHA'} ${oque}`);
  if (!certo) falhas++;
}

// message_type: 0 = cliente, 1 = loja. Helpers pra conversa caber numa linha.
const cli = (content) => ({ message_type: 0, content });
const ia = (content) => ({ message_type: 1, content });
const nota = (content) => ({ message_type: 1, content, private: true });

// --- 1. o vazamento principal ---------------------------------------------
{
  const cotouESumiu = [
    cli('oi, tem iphone 13 128?'),
    ia('Oii! Sou a Maju 💙 Temos sim! Fica R$ 2.890 à vista'),
    cli('vou pensar'),
  ];
  const r = regua(cotouESumiu);
  ok(r.cotou_preco, 'cotou_preco pega R$ em mensagem da loja');
  ok(r.preco_sem_handoff, 'preco_sem_handoff acusa preço sem cartão  ← o vazamento');
  ok(!r.passou_pra_humano, 'sem cartão, não passou pra humano');

  const cotouEPassou = [...cotouESumiu, ia('💼 *PROPOSTA APRESENTADA* — o David assume daqui')];
  const r2 = regua(cotouEPassou);
  ok(r2.passou_pra_humano, 'cartão de texto fixo marca o handoff');
  ok(!r2.preco_sem_handoff, 'com cartão, o vazamento não acusa');
}

// --- 2. nota interna não é conversa ----------------------------------------
{
  const soNota = [cli('quanto custa o 15 pro max?'), nota('R$ 5.200 é o piso, não desce')];
  const r = regua(soNota);
  ok(!r.cotou_preco, 'R$ em nota interna NÃO conta como preço cotado');
  ok(!r.respondeu, 'nota interna não conta como ter respondido o cliente');
  ok(r.morreu_no_cliente, 'com só nota interna, a conversa morreu no cliente');
}

// --- 3. morreu no cliente vs cliente sumiu ---------------------------------
{
  const lojaCalou = [cli('oi'), ia('Oii! Sou a Maju 💙'), cli('tem 11 64gb?')];
  ok(regua(lojaCalou).morreu_no_cliente, 'última palavra do cliente = morreu no cliente');

  const clienteCalou = [cli('tem 11 64gb?'), ia('Tem sim! R$ 1.450')];
  const r = regua(clienteCalou);
  ok(!r.morreu_no_cliente, 'última palavra da loja não é morrer no cliente');
  ok(r.sumiu_apos_preco, 'viu preço e parou de responder, sem follow-up');

  const comFollowUp = [...clienteCalou, ia('Oi! Ainda tem interesse? Consigo segurar hoje 💙')];
  const r2 = regua(comFollowUp);
  ok(r2.reengajou, 'duas mensagens da loja seguidas = follow-up');
  ok(!r2.sumiu_apos_preco, 'com follow-up, não conta como sumiu sem ninguém correr atrás');
}

// --- 4. os sinais de qualificação que valem dinheiro aqui ------------------
{
  const completa = [
    cli('queria um 13 pro'),
    ia('Tem sim! Você tem algum aparelho pra dar na troca? É onde a gente consegue o melhor valor'),
    cli('tenho um 11'),
    ia('Show! E prefere à vista no pix ou parcelado no cartão?'),
    cli('parcelado'),
    ia('Fechado. Você é de qual cidade? Consegue passar na loja?'),
    cli('sim, sou daqui'),
    ia('Perfeito! Fica R$ 3.400. Leva capinha e película por mais R$ 80?'),
    ia('🗓️ *VISITA AGENDADA*'),
  ];
  const r = regua(completa);
  ok(r.perguntou_troca, 'perguntou_troca pega a pergunta de troca  ← canal de 1,5× margem');
  ok(r.perguntou_pagamento, 'perguntou_pagamento pega pix/parcelado');
  ok(r.perguntou_cidade, 'perguntou_cidade pega cidade / passar na loja');
  ok(r.ofereceu_acessorio, 'ofereceu_acessorio pega capinha/película');
  ok(r.propos_visita, 'propos_visita pega o cartão de visita agendada');
  ok(r.identificou_modelo, 'identificou_modelo lê o MODELO na fala do CLIENTE');

  const seca = [cli('quanto o 12?'), ia('R$ 2.100')];
  const r2 = regua(seca);
  ok(!r2.perguntou_troca && !r2.perguntou_pagamento && !r2.perguntou_cidade,
     'conversa seca não marca sinal de qualificação nenhum');
  ok(!r2.ofereceu_acessorio, 'conversa seca não ofereceu acessório');
}

// --- 5. o cliente escreve "13 pro", não "iphone 13 pro" --------------------
{
  const pega = (txt) => regua([cli(txt), ia('opa')]).identificou_modelo;
  ok(pega('queria um 13 pro'), 'pega modelo sem a palavra iphone  ← é assim que o cliente escreve');
  ok(pega('tem iphone 11?') && pega('ip 15 pro max') && pega('11 128gb ainda tem?'),
     'pega iphone 11 · ip 15 pro max · 11 128gb');
  ok(!pega('consigo pagar até dia 13') && !pega('fica R$ 13 a mais'),
     'número solto sem sufixo nem capacidade NÃO vira intenção de compra');

  // O bug do /g: .test() em regex global avança lastIndex e a chamada seguinte
  // falha na MESMA frase. Rodar a mesma conversa 4x tem que dar sempre igual.
  const conv = [cli('tenho interesse no iphone 15 pro max'), ia('Temos!')];
  const vezes = [0, 1, 2, 3].map(() => regua(conv).identificou_modelo);
  ok(vezes.every((v) => v === true), 'identificou_modelo é estável em chamadas repetidas');
}

// --- 6. telChave — o nono dígito -------------------------------------------
{
  const formas = ['+5511987654321', '5511987654321', '11987654321', '+55 11 98765-4321'];
  const chaves = formas.map(telChave);
  ok(new Set(chaves).size === 1 && chaves[0] === '87654321',
     'as quatro formas do celular viram a mesma chave  ← camada 0 depende disso');
  ok(telChave('1187654321') === '87654321', 'número sem o 9 casa com o mesmo cliente');
  ok(telChave('') === null && telChave(null) === null && telChave('123') === null,
     'lixo e telefone curto viram null em vez de casar com qualquer um');
}

// --- 7. contexto e integridade da tabela -----------------------------------
{
  const c = contexto([cli('oi'), ia('oi!'), nota('cliente chato'), cli('e aí?')]);
  ok(c.cliente.length === 2 && c.loja.length === 1, 'contexto separa cliente/loja e descarta nota');
  ok(c.ultimo === 0, 'contexto sabe de quem foi a última palavra');

  const chaves = SINAIS.map(([k]) => k);
  ok(new Set(chaves).size === chaves.length, 'nenhum sinal repetido na tabela SINAIS');
  ok(SINAIS.every(([k, desc, f]) => k && desc && typeof f === 'function'),
     'todo sinal tem chave, descrição e teste');
  ok(SINAIS.filter(([, , , ruim]) => ruim).length === 4,
     'os 4 sinais "ruins" seguem marcados (alto = problema, não conquista)');
}

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
