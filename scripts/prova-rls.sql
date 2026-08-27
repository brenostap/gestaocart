-- ===========================================================================
-- A PROVA DA FECHADURA — o que cada papel REALMENTE alcança
--
-- POR QUE EXISTE: em 6 dias o mesmo erro apareceu duas vezes. Em 20/ago a
-- auditoria achou views GRAVÁVEIS (bypass de RLS com a chave do dono na
-- fechadura); em 26/ago as três views novas nasceram com o MESMO defeito,
-- porque `revoke ... from public, anon` não alcança `authenticated`. As duas
-- vezes foi conferência manual que pegou. Manual não pega na terceira.
--
-- Ler a policy não prova nada. O que prova é VIRAR A PESSOA: este script assume
-- a sessão de cada perfil ativo (request.jwt.claims + role) e mede. Nada é
-- alterado: as escritas são tentadas com `where false`.
--
-- ⚠️ ISTO NÃO É `test/perfis.test.js`. Aquele prova a CORTINA (menu e money());
-- este prova a FECHADURA (o que a API entrega). Um pode passar com o outro
-- quebrado -- foi exatamente o que aconteceu nas duas vezes acima.
--
-- USO: cole no SQL Editor do Supabase, como dono do projeto.
-- QUANDO: depois de criar/alterar QUALQUER view ou policy, e ao criar perfil.
-- ===========================================================================

create temp table if not exists _prova(papel text, quem text, item text, resultado text, veredito text);
truncate _prova;
grant all on _prova to authenticated;

do $$
declare
  p record; n int; t text; alvo text; ok boolean;
  -- A ESPECIFICAÇÃO, em uma tabela: quem pode ler linha em cada tabela crua.
  -- Qualquer coisa fora disto é falha. `perfis` fica de fora: todo mundo lê a
  -- PRÓPRIA linha, por desenho (policy perfis_leitura).
  pode_ler_tabela jsonb := '{
    "vendas":              ["socio"],
    "venda_produtos":      ["socio"],
    "pagamentos":          ["socio"],
    "estoque":             ["socio"],
    "custos":              ["socio"],
    "compras":             ["socio"],
    "tabela_precos":       ["socio"],
    "funcionarios_config": ["socio"],
    "bancada":             ["socio","bancada"],
    "estoque_estado":      ["socio","bancada"],
    "estoque_correcoes":   ["socio","bancada"]
  }'::jsonb;
begin
  for p in select user_id, nome, papel from public.perfis where ativo order by papel, nome loop
    perform set_config('request.jwt.claims',
              json_build_object('sub', p.user_id, 'role','authenticated')::text, true);
    perform set_config('role', 'authenticated', true);

    -- 1. As views que o app usa: quanto cada papel enxerga (informativo)
    for t in select unnest(array['v_estoque_vitrine','v_tabela_precos','v_minhas_vendas',
                                 'v_minha_comissao_mes','v_venda_consulta','v_venda_consulta_itens',
                                 'v_assistencia_cliente','v_estoque_margem']) loop
      begin
        execute format('select count(*) from public.%I', t) into n;
        insert into _prova values (p.papel, p.nome, 'lê '||t, n::text, 'informativo');
      exception when others then
        insert into _prova values (p.papel, p.nome, 'lê '||t, 'negado', 'informativo');
      end;
    end loop;

    -- 2. Tabelas cruas: comparado com a especificação acima
    for t in select jsonb_object_keys(pode_ler_tabela) loop
      ok := (pode_ler_tabela -> t) ? p.papel;
      begin
        execute format('select count(*) from public.%I', t) into n;
        -- ⚠️ `0 linhas` NÃO é falta de permissão: pode ser tabela vazia
        -- (`estoque_correcoes` é auto-limpante e fica em zero quando nada
        -- diverge da FoneNinja). Falta de permissão vira exceção, tratada
        -- abaixo. Confundir os dois daria alarme falso todo dia.
        insert into _prova values (p.papel, p.nome, 'TABELA '||t, n::text,
          case when n > 0 and not ok then '⚠️ LEU O QUE NÃO PODE' else 'ok' end);
      exception when others then
        insert into _prova values (p.papel, p.nome, 'TABELA '||t, 'negado',
          case when ok then '⚠️ NÃO LÊ O QUE PRECISA' else 'ok' end);
      end;
    end loop;

    -- 3. Escrita pelas views: NENHUM papel pode, nem o sócio.
    --    View gravável roda com os direitos do DONO e ignora RLS.
    for t in select unnest(array['v_estoque_vitrine','v_tabela_precos','v_minhas_vendas',
                                 'v_meus_itens','v_venda_consulta','v_venda_consulta_itens',
                                 'v_assistencia_cliente','v_estoque_margem']) loop
      begin
        execute format('delete from public.%I where false', t);
        insert into _prova values (p.papel, p.nome, 'ESCREVE em '||t, 'passou', '⚠️ VIEW GRAVÁVEL');
      exception when others then
        insert into _prova values (p.papel, p.nome, 'ESCREVE em '||t, 'bloqueado', 'ok');
      end;
    end loop;

    perform set_config('role', 'postgres', true);
  end loop;
end $$;

-- 1) O VEREDITO. Se esta consulta voltar vazia, a fechadura está certa.
select '⚠️ REVISAR' as atencao, papel, quem, item, resultado, veredito
  from _prova where veredito like '⚠️%' order by papel, quem, item;

-- 2) O retrato: quanto cada papel enxerga em cada view.
select papel, quem, item, resultado from _prova
 where item like 'lê %' order by papel, quem, item;
