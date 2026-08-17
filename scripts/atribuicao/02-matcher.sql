-- Passo 2 — a cascata. Roda na base de LEADS (supabase-cart ou supabase-urban).
--
-- SO LEITURA. Nao cria tabela, nao grava, nao mexe em match_resultado nem em
-- contatos*. As conexoes MCP dos dois projetos estao com read_only=true.
--
-- Antes de rodar, duas substituicoes:
--   {{VENDAS}}  -> o blob do passo 01, entre $v$ ... $v$
--   {{LEADS}}   -> ver bloco leads_raw abaixo; o nome da tabela de WhatsApp muda
--                  de projeto: Cart = "contatosBreno", Urban = "contatosWhatsApp"
--
-- A cascata, do mais forte pro mais fraco:
--   N1 telefone identico (ultimos 9 digitos)          -> aceita
--   N2 nome normalizado identico                      -> aceita
--   N3 nome com similaridade >= 0,85                  -> aceita
--   N4 nome entre 0,70 e 0,85                         -> marca pra revisao
--   abaixo de 0,70                                    -> descarta (e o ruido)
--
-- Duas travas que hoje nao existem:
--   LOJA   — o blob ja vem filtrado por loja, entao lead da Cart nunca casa com
--            venda da Urban. Hoje casa: a venda 40610383 (urban) esta reivindicada
--            nas duas bases, apontando pra pessoas diferentes.
--   JANELA — o lead tem que existir antes da venda (+1 dia de folga) e a venda tem
--            que cair ate 45 dias depois da ultima mensagem dele. Sem isso, lead de
--            out/2025 casa com venda de ago/2026 por acaso de nome.
--
-- E o desempate (distinct on), que resolve o defeito mais caro: uma venda so pode
-- ter UM lead. Ganha o nivel mais forte; empatou, ganha quem falou por ultimo antes
-- da venda; empatou de novo, a maior similaridade.

with vendas_raw as (
  select unnest(string_to_array($v${{VENDAS}}$v$, chr(10))) l
),
v as (
  select
    split_part(l, '|', 1)::bigint            as venda_id,
    nullif(split_part(l, '|', 2), '')        as tel9,
    split_part(l, '|', 3)::date              as data_venda,
    btrim(regexp_replace(regexp_replace(
      translate(split_part(l, '|', 4),
        'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'),
      '[^a-z ]', ' ', 'g'), ' +', ' ', 'g')) as nome
  from vendas_raw
  where l <> ''
),
leads_raw as (
  -- Cart:  public."contatosBreno"      + public."contatosInstagram"
  -- Urban: public."contatosWhatsApp"   + public."contatosInstagram"
  select 'whatsapp' canal, id lead_id, nome, telefone, created_at,
         "ultimaMensagem" ult, origem, id_venda
    from public."{{LEADS}}"
  union all
  select 'instagram', id, nome, telefone, created_at,
         "ultimaMensagem", origem, id_venda
    from public."contatosInstagram"
),
l as (
  select
    canal, lead_id, origem,
    id_venda                                        as hoje,
    created_at::date                                as d_ini,
    coalesce(ult, created_at)::date                 as d_fim,
    right(regexp_replace(coalesce(telefone, ''), '\D', '', 'g'), 9) as tel9,
    btrim(regexp_replace(regexp_replace(
      translate(lower(coalesce(nome, '')),
        'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'),
      '[^a-z ]', ' ', 'g'), ' +', ' ', 'g'))        as nome
  from leads_raw
),
par as (
  select
    v.venda_id, v.data_venda, l.canal, l.lead_id, l.origem, l.d_ini, l.d_fim, l.hoje,
    (l.tel9 <> '' and l.tel9 = v.tel9)              as tel_bate,
    similarity(l.nome, v.nome)                      as sim,
    (l.d_ini <= v.data_venda + 1
     and v.data_venda <= l.d_fim + 45)              as na_janela
  from v
  join l on (
        (l.tel9 <> '' and l.tel9 = v.tel9)
     or (length(l.nome) >= 8 and length(v.nome) >= 8
         and similarity(l.nome, v.nome) >= 0.70)
  )
),
cand as (
  select *,
    case when tel_bate then 1
         when sim = 1    then 2
         when sim >= 0.85 then 3
         else 4 end as nivel
  from par
  where na_janela
),
best as (
  select distinct on (venda_id) *
  from cand
  order by venda_id, nivel, d_fim desc, sim desc
)
select
  venda_id, data_venda, canal, lead_id, origem,
  nivel,
  case nivel when 1 then 'telefone'
             when 2 then 'nome identico'
             when 3 then 'nome >= 0,85'
             else        'revisar (0,70-0,85)' end as metodo,
  round(sim, 3) as similaridade,
  hoje                                              as id_venda_marcado_hoje
from best
order by venda_id;
