-- =============================================================================
-- VSPlanner — empresas iniciais do MKT (Visionário Dev → MKT)
--
-- RODAR SOMENTE DEPOIS de:
--   1) aplicar supabase/migrations/20261031120000_mkt_module.sql; e
--   2) o código com o isolamento CLT/MKT estar publicado.
--
-- O que faz (idempotente — pode rodar de novo sem duplicar):
--   - Visionário Dev  → empresa própria (sem cliente)
--   - 3D House        → empresa própria (sem cliente)
--   - Semear Comunicação → empresa de cliente: Ponciane
--       * se existir EXATAMENTE um cliente cujo nome começa com "Ponciane" no
--         space da Visionário Dev, vincula pelo client_id (sem alterar o cliente);
--       * senão, guarda só o nome "Ponciane" (nenhum cliente é criado).
--   Todas começam com saldo 0, sem campanhas, tarefas ou resultados.
--
-- Não altera nem apaga nada do CLT (as empresas do CLT têm module = 'clt').
-- =============================================================================
do $$
declare
  -- Mesmo usuário dono do Trabalho / CLT (ver migration 014, "Dados iniciais").
  uid uuid := 'f672e7b6-7a05-41be-8e7a-36a5f1a21acc';
  visionario_space uuid;
  ponciane_id uuid;
  ponciane_count int;
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'clt_companies' and column_name = 'module') then
    raise exception 'Aplique antes a migration 20261031120000_mkt_module.sql';
  end if;
  if not exists (select 1 from public.profiles where id = uid) then
    raise exception 'Perfil % não encontrado — confira o usuário antes de rodar', uid;
  end if;

  select id into visionario_space from public.spaces where slug = 'visionario-dev' limit 1;
  if visionario_space is not null then
    select count(*), min(id::text)::uuid into ponciane_count, ponciane_id
      from public.clients where space_id = visionario_space and name ilike 'ponciane%';
    if ponciane_count <> 1 then ponciane_id := null; end if;
  end if;

  insert into public.clt_companies (user_id, module, company_kind, name, client_id, client_name, current_ad_balance)
  select uid, 'mkt', v.kind, v.name, v.client_id, v.client_name, 0
  from (values
    ('propria', 'Visionário Dev', null::uuid, null::text),
    ('propria', '3D House', null::uuid, null::text),
    ('cliente', 'Semear Comunicação', ponciane_id, 'Ponciane')
  ) as v(kind, name, client_id, client_name)
  where not exists (
    select 1 from public.clt_companies c where c.user_id = uid and c.module = 'mkt' and c.name = v.name
  );

  raise notice 'MKT: empresas garantidas. Ponciane % ', case when ponciane_id is null then 'NÃO vinculada (nome guardado como texto)' else 'vinculada ao cliente ' || ponciane_id end;
end $$;

-- Conferência (somente leitura):
-- select module, company_kind, name, client_name, client_id, current_ad_balance from public.clt_companies order by module, name;
