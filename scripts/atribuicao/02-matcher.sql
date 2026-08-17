-- Passo 2 — a cascata. Roda na base de LEADS (supabase-cart ou supabase-urban).
--
-- SO LEITURA. Nao cria tabela, nao grava, nao mexe em match_resultado nem em
-- contatos*. As conexoes MCP dos dois projetos estao com read_only=true.
--
-- Antes de rodar, duas substituicoes:
--   {{VENDAS}}  -> o blob do passo 01, entre $v$ ... $v$
--   {{LEADS}}   -> Cart = contatosBreno | Urban = contatosWhatsApp
--
-- A cascata, do mais forte pro mais fraco:
--   N1 telefone identico (ultimos 9 digitos)          -> aceita
--   N2 nome normalizado identico                      -> aceita
--   N3 nome com similaridade >= 0,85                  -> aceita
--   N4 nome entre 0,70 e 0,85                         -> aceita
--   N5 nome entre 0,45 e 0,70 COM trava de vendedor   -> aceita
--      nome abaixo de 0,45, ou 0,45-0,70 sem a trava  -> descarta
--
-- Tres travas que hoje nao existem:
--   LOJA     — o blob ja vem filtrado por loja, entao lead da Cart nunca casa com
--              venda da Urban. Hoje casa: a venda 40610383 (urban) esta reivindicada
--              nas duas bases, apontando pra pessoas diferentes.
--   JANELA   — o lead tem que existir antes da venda (+1 dia de folga) e a venda tem
--              que cair ate 45 dias depois da ultima mensagem dele.
--   VENDEDOR — contatos.vendedorAtribuido = vendas.vendedor_obs, com a transferencia
--              ate 30 dias antes da venda. Os nomes batem exatamente dos dois lados
--              (david / isa / mel).
--
-- Por que o N5 existe: o lead de Instagram NAO tem telefone (1 em 9.749 na Urban), e
-- o @ nao existe do lado da venda (clientes.instagram: 3 preenchidos em 4.233). Sobra
-- so o nome, e o nome do IG e apelido — bate baixo. A trava de vendedor+data reduz o
-- universo o suficiente pra baixar o limiar ate 0,45 sem gerar um unico empate
-- (medido: 0 empates em julho/Cart). Ganho medido: +31 vendas, 35,1% -> 51,6%.
--
-- E o desempate (distinct on), que resolve o defeito mais caro: uma venda so pode
-- ter UM lead. Ganha o nivel mais forte; empatou, ganha quem falou por ultimo antes
-- da venda; empatou de novo, a maior similaridade.
--
-- ⚠️ CUIDADO DE PERFORMANCE: os tres caminhos (p_tel, p_nome, p_vo) sao JOINs
-- separados de proposito. Juntar tudo num join so com `similarity(...) >= 0.45` no
-- ON faz o Postgres calcular trigrama em cada par lead x venda (~7 milhoes) e a
-- query estoura o timeout. Cada join aqui comeca por um predicado barato
-- (igualdade de telefone, ou vendedor+data) e so entao mede similaridade.

with vendas_raw as (
  select unnest(string_to_array($v${{VENDAS}}$v$, chr(10))) l
),
v as (
  select
    split_part(l, '|', 1)::bigint            as venda_id,
    nullif(split_part(l, '|', 2), '')        as tel9,
    split_part(l, '|', 3)::date              as data_venda,
    nullif(split_part(l, '|', 4), '')        as vendedor,
    btrim(regexp_replace(regexp_replace(
      translate(split_part(l, '|', 5),
        'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'),
      '[^a-z ]', ' ', 'g'), ' +', ' ', 'g')) as nome
  from vendas_raw
  where l <> ''
),
leads_raw as (
  -- O recorte por ultimaMensagem nao muda o resultado (a janela ja o implica), mas
  -- corta o universo antes do trigrama. Ajuste junto com o periodo do passo 01.
  select 'whatsapp' canal, id lead_id, nome, telefone, created_at, "ultimaMensagem" ult,
         "vendedorAtribuido" vend, "dataTransferencia" dt, origem
    from public."{{LEADS}}"
   where coalesce("ultimaMensagem", created_at) >= '2026-05-10'
  union all
  select 'instagram', id, nome, telefone, created_at, "ultimaMensagem",
         "vendedorAtribuido", "dataTransferencia", origem
    from public."contatosInstagram"
   where coalesce("ultimaMensagem", created_at) >= '2026-05-10'
),
l as (
  select
    canal, lead_id, origem,
    lower(btrim(vend))                              as vend,
    dt,
    created_at::date                                as d_ini,
    coalesce(ult, created_at)::date                 as d_fim,
    right(regexp_replace(coalesce(telefone, ''), '\D', '', 'g'), 9) as tel9,
    btrim(regexp_replace(regexp_replace(
      translate(lower(coalesce(nome, '')),
        'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'),
      '[^a-z ]', ' ', 'g'), ' +', ' ', 'g'))        as nome
  from leads_raw
),
-- N1: telefone. Join barato (igualdade), depois a janela.
p_tel as (
  select v.venda_id, l.lead_id, l.canal, l.origem, l.d_fim, 1 as nivel, 1.0 as sim
  from v join l on l.tel9 <> '' and l.tel9 = v.tel9
  where l.d_ini <= v.data_venda + 1
    and v.data_venda <= l.d_fim + 45
),
-- N2-N4: nome forte. Limiar 0,70 mantem o trigrama caro sob controle.
p_nome as (
  select v.venda_id, l.lead_id, l.canal, l.origem, l.d_fim,
    case when similarity(l.nome, v.nome) = 1    then 2
         when similarity(l.nome, v.nome) >= 0.85 then 3
         else 4 end                              as nivel,
    similarity(l.nome, v.nome)                   as sim
  from v join l on length(l.nome) >= 8 and length(v.nome) >= 8
               and similarity(l.nome, v.nome) >= 0.70
  where l.d_ini <= v.data_venda + 1
    and v.data_venda <= l.d_fim + 45
),
-- N5: nome fraco, mas so quando o vendedor e a data da transferencia batem.
p_vo as (
  select v.venda_id, l.lead_id, l.canal, l.origem, l.d_fim, 5 as nivel,
         similarity(l.nome, v.nome) as sim
  from v join l on l.vend = v.vendedor
               and l.dt between v.data_venda - 30 and v.data_venda + 1
  where similarity(l.nome, v.nome) >= 0.45
    and similarity(l.nome, v.nome) <  0.70
),
todos as (
  select * from p_tel
  union all select * from p_nome
  union all select * from p_vo
),
best as (
  select distinct on (venda_id) *
  from todos
  order by venda_id, nivel, d_fim desc, sim desc
)
select
  venda_id, canal, lead_id, origem, nivel,
  case nivel when 1 then 'telefone'
             when 2 then 'nome identico'
             when 3 then 'nome >= 0,85'
             when 4 then 'nome 0,70-0,85'
             else        'nome fraco + trava de vendedor' end as metodo,
  round(sim, 3) as similaridade
from best
order by venda_id;
