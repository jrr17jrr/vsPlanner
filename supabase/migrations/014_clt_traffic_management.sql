-- =============================================================================
-- VSPlanner — Gestão de empresas e tráfego do Trabalho / CLT
-- Migration 014
-- =============================================================================

create table if not exists public.clt_responsibles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique(user_id, name)
);

create table if not exists public.clt_companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  responsible_id uuid references public.clt_responsibles(id) on delete set null,
  name text not null,
  email text,
  instagram text,
  responsible_phone text,
  company_phone text,
  website text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, name)
);

create table if not exists public.clt_traffic_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  company_id uuid not null references public.clt_companies(id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 0),
  entry_date date not null,
  status text not null default 'pendente' check (status in ('pendente','pago')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clt_campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  company_id uuid not null references public.clt_companies(id) on delete cascade,
  name text not null,
  objective text,
  description text,
  starts_on date not null,
  ends_on date not null,
  spent_amount numeric(12,2) not null default 0 check (spent_amount >= 0),
  messages integer not null default 0 check (messages >= 0),
  sales integer not null default 0 check (sales >= 0),
  views integer not null default 0 check (views >= 0),
  generated_revenue numeric(12,2) check (generated_revenue is null or generated_revenue >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create table if not exists public.clt_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  company_id uuid references public.clt_companies(id) on delete cascade,
  title text not null,
  description text,
  due_date date,
  scheduled_time time,
  priority text not null default 'normal' check (priority in ('normal','importante')),
  status text not null default 'pendente' check (status in ('pendente','concluida')),
  notes text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clt_company_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  company_id uuid not null references public.clt_companies(id) on delete cascade,
  note_date date not null default current_date,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_clt_companies_user on public.clt_companies(user_id);
create index if not exists idx_clt_campaigns_company_dates on public.clt_campaigns(company_id, starts_on, ends_on);
create index if not exists idx_clt_tasks_user_due on public.clt_tasks(user_id, due_date);
create index if not exists idx_clt_entries_company_date on public.clt_traffic_entries(company_id, entry_date);

do $$
declare t text;
begin
  foreach t in array array['clt_responsibles','clt_companies','clt_traffic_entries','clt_campaigns','clt_tasks','clt_company_notes']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_all', t);
    execute format('create policy %I on public.%I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t || '_all', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

drop trigger if exists set_updated_at on public.clt_companies;
create trigger set_updated_at before update on public.clt_companies for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on public.clt_traffic_entries;
create trigger set_updated_at before update on public.clt_traffic_entries for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on public.clt_campaigns;
create trigger set_updated_at before update on public.clt_campaigns for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on public.clt_tasks;
create trigger set_updated_at before update on public.clt_tasks for each row execute function public.set_updated_at();

-- Dados iniciais informados pelo usuário. Inserções idempotentes e somente
-- para o usuário autenticado quando a migration for executada no SQL Editor.
do $$
declare uid uuid := auth.uid(); lenon uuid; ruben uuid; carol uuid;
begin
  if uid is null then return; end if;
  insert into public.clt_responsibles(user_id,name) values(uid,'Lenon') on conflict(user_id,name) do nothing;
  insert into public.clt_responsibles(user_id,name) values(uid,'Ruben Jr') on conflict(user_id,name) do nothing;
  insert into public.clt_responsibles(user_id,name) values(uid,'Carol') on conflict(user_id,name) do nothing;
  select id into lenon from public.clt_responsibles where user_id=uid and name='Lenon';
  select id into ruben from public.clt_responsibles where user_id=uid and name='Ruben Jr';
  select id into carol from public.clt_responsibles where user_id=uid and name='Carol';
  insert into public.clt_companies(user_id,responsible_id,name) values
    (uid,lenon,'SGIV'),(uid,lenon,'IG Predial'),(uid,ruben,'AIV'),(uid,ruben,'SIV'),(uid,ruben,'SGI'),(uid,carol,'COTRAN'),(uid,carol,'Verificar PIV')
  on conflict(user_id,name) do update set responsible_id=excluded.responsible_id;
end $$;
