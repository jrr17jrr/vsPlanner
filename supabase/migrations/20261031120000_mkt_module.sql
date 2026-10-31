-- =============================================================================
-- VSPlanner — módulo MKT (Visionário Dev) reaproveitando as tabelas do CLT.
--
-- Isolamento: cada empresa pertence a UM módulo ('clt' ou 'mkt'). Tudo o que
-- pende da empresa (campanhas, conjuntos, anúncios, públicos, métricas,
-- saldos, movimentações, orçamentos, comparativos, importações, revisões)
-- herda o módulo pelo company_id. Tarefas sem empresa ("CLT geral"/"MKT
-- geral") guardam o módulo na própria tarefa.
--
-- Segurança dos dados existentes:
--  - só ADICIONA colunas; o default 'clt' mantém todas as empresas e tarefas
--    atuais no CLT, exatamente como hoje;
--  - nenhuma linha é apagada; nenhum valor financeiro é alterado;
--  - idempotente (pode rodar mais de uma vez).
-- =============================================================================

-- 1) Empresas ----------------------------------------------------------------
alter table public.clt_companies add column if not exists module text not null default 'clt';
alter table public.clt_companies add column if not exists company_kind text;
alter table public.clt_companies add column if not exists client_id uuid references public.clients(id) on delete set null;
alter table public.clt_companies add column if not exists client_name text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clt_companies_module_check' and conrelid = 'public.clt_companies'::regclass) then
    alter table public.clt_companies add constraint clt_companies_module_check check (module in ('clt', 'mkt'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'clt_companies_company_kind_check' and conrelid = 'public.clt_companies'::regclass) then
    alter table public.clt_companies add constraint clt_companies_company_kind_check check (company_kind is null or company_kind in ('propria', 'cliente'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'clt_companies_client_name_length' and conrelid = 'public.clt_companies'::regclass) then
    alter table public.clt_companies add constraint clt_companies_client_name_length check (client_name is null or char_length(client_name) <= 200);
  end if;
end $$;

-- Nome único POR MÓDULO (antes: por usuário). É mais permissivo que a regra
-- atual, então não falha com os dados existentes.
alter table public.clt_companies drop constraint if exists clt_companies_user_id_name_key;
create unique index if not exists clt_companies_user_module_name_key on public.clt_companies (user_id, module, name);
create index if not exists idx_clt_companies_user_module on public.clt_companies (user_id, module);

-- O módulo de uma empresa não muda depois de criada (evita "mover" histórico entre CLT e MKT).
create or replace function public.clt_companies_lock_module()
returns trigger language plpgsql as $$
begin
  if new.module is distinct from old.module then
    raise exception 'O módulo da empresa (CLT/MKT) não pode ser alterado';
  end if;
  return new;
end $$;
drop trigger if exists clt_companies_lock_module on public.clt_companies;
create trigger clt_companies_lock_module before update of module on public.clt_companies
for each row execute function public.clt_companies_lock_module();

-- 2) Tarefas -----------------------------------------------------------------
alter table public.clt_tasks add column if not exists module text not null default 'clt';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clt_tasks_module_check' and conrelid = 'public.clt_tasks'::regclass) then
    alter table public.clt_tasks add constraint clt_tasks_module_check check (module in ('clt', 'mkt'));
  end if;
end $$;
create index if not exists idx_clt_tasks_user_module on public.clt_tasks (user_id, module);

-- Tarefa com empresa sempre fica no módulo da empresa (definido pelo banco).
create or replace function public.clt_tasks_sync_module()
returns trigger language plpgsql as $$
declare company_module text;
begin
  if new.company_id is not null then
    select module into company_module from public.clt_companies where id = new.company_id;
    if company_module is not null then new.module := company_module; end if;
  end if;
  return new;
end $$;
drop trigger if exists clt_tasks_sync_module on public.clt_tasks;
create trigger clt_tasks_sync_module before insert or update of company_id, module on public.clt_tasks
for each row execute function public.clt_tasks_sync_module();

-- 3) Planejamento: item de campanha/tarefa com empresa não pode cruzar módulos
--    (a área 'clt' com empresa do MKT é o planejamento do MKT).
--    Nada muda na tabela; só uma checagem de consistência na gravação.
create or replace function public.planning_items_check_campaign_module()
returns trigger language plpgsql as $$
declare company_module text; campaign_company uuid;
begin
  if new.campaign_id is not null and new.company_id is not null then
    select company_id into campaign_company from public.clt_campaigns where id = new.campaign_id;
    if campaign_company is not null and campaign_company <> new.company_id then
      raise exception 'Campanha de outra empresa vinculada ao planejamento';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists planning_items_check_campaign_module on public.planning_items;
create trigger planning_items_check_campaign_module before insert or update of campaign_id, company_id on public.planning_items
for each row execute function public.planning_items_check_campaign_module();

comment on column public.clt_companies.module is 'Módulo da empresa: clt (Trabalho/CLT) ou mkt (Visionário Dev → MKT). Imutável.';
comment on column public.clt_companies.company_kind is 'MKT: propria (empresa própria) ou cliente (empresa de cliente).';
comment on column public.clt_companies.client_id is 'MKT: cliente da Visionário Dev (clients.id), quando vinculado.';
comment on column public.clt_companies.client_name is 'MKT: nome do cliente exibido no card (preenchido mesmo sem vínculo).';
comment on column public.clt_tasks.module is 'Módulo da tarefa (clt/mkt). Com empresa, é sempre o módulo da empresa.';
