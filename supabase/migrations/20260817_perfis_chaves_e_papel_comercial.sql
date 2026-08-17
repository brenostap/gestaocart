-- PAPEL x CHAVES (docs/PLANO-UPGRADE-2026-08.md §2.8)
--   papel  = que menu abre e qual o teto de dinheiro
--   chaves = quais LINHAS sao minhas
-- Sao eixos independentes: o Vitinho e `bancada` E tem at_key (atende no balcao);
-- a Maria e `comercial` e tem as DUAS chaves (vende e atende).
alter table public.perfis add column if not exists vo_key text;
alter table public.perfis add column if not exists at_key text;

comment on column public.perfis.vo_key is 'Chave de VENDEDOR desta pessoa (apelidos.chave). NULL = nao vende.';
comment on column public.perfis.at_key is 'Chave de ATENDENTE desta pessoa (apelidos.chave). NULL = nao atende.';

-- `comercial` cobre vendedor, atendente e quem faz as duas coisas. Um papel so,
-- em vez de tres + um hibrido: quem faz o que e decidido pelas chaves acima.
alter table public.perfis drop constraint if exists perfis_papel_check;
alter table public.perfis add constraint perfis_papel_check
  check (papel in ('socio','bancada','comercial'));

-- Chave errada no perfil = pessoa logando e vendo ZERO venda, sem erro nenhum.
-- E o tipo de falha silenciosa que esta casa ja pagou caro; entao estoura na cara.
create or replace function public.valida_perfil_keys()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.vo_key is not null and not exists (
       select 1 from public.apelidos where chave = new.vo_key and tipo = 'pessoa') then
    raise exception 'vo_key "%" nao existe como pessoa em public.apelidos', new.vo_key;
  end if;
  if new.at_key is not null and not exists (
       select 1 from public.apelidos where chave = new.at_key and tipo = 'pessoa') then
    raise exception 'at_key "%" nao existe como pessoa em public.apelidos', new.at_key;
  end if;
  return new;
end $$;

drop trigger if exists trg_valida_perfil_keys on public.perfis;
create trigger trg_valida_perfil_keys
  before insert or update on public.perfis
  for each row execute function public.valida_perfil_keys();

-- As duas chaves de quem esta logado. STABLE + security definer, no mesmo
-- desenho de eh_socio()/tem_perfil().
create or replace function public.meu_vo_key()
returns text language sql stable security definer set search_path = public as $$
  select vo_key from public.perfis where user_id = auth.uid() and ativo;
$$;

create or replace function public.meu_at_key()
returns text language sql stable security definer set search_path = public as $$
  select at_key from public.perfis where user_id = auth.uid() and ativo;
$$;

comment on function public.meu_vo_key() is 'Chave de vendedor do usuario logado. NULL = nao vende. Usada pelas views v_minhas_*.';
comment on function public.meu_at_key() is 'Chave de atendente do usuario logado. NULL = nao atende. Usada pelas views v_minhas_*.';

-- O Vitinho atende no balcao (52 vendas em ago/2026). A chave e dado verdadeiro
-- e nenhuma tela le ainda -- gravar agora nao muda nada e deixa o passo 3 pronto.
update public.perfis set at_key = 'vitinho' where email = 'vitorgsc31@gmail.com';
