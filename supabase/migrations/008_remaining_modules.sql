-- =============================================================================
-- VSPlanner — módulos restantes: Tarefas, Rotina (+ histórico por
-- ocorrência), Trabalho/CLT pessoal, Metas, Vendedores + Vendas +
-- Comissões, Sites & Domínios.
-- Migration: 008_remaining_modules.sql
--
-- NÃO altera nada das migrations 001-007. Financeiro Pessoal e do TikTok
-- NÃO ganham tabelas novas aqui — reaproveitam `financial_accounts/
-- categories/reference_types/origins/charges/payments` (migration 007) via
-- `space_id`, exatamente como o Financeiro do Visionário Dev. O código de
-- aplicação (lib/supabase/financial-actions.ts) é generalizado para
-- receber o space certo em vez de assumir sempre "Visionário Dev" — isso
-- é refactor de app, não schema novo.
--
-- Duas famílias de tabela aqui, com RLS bem diferente:
--
--   PESSOAIS (tasks, activities, activity_completions, work_tasks, goals):
--   um único dono, sem colaboração — RLS é simplesmente `user_id =
--   auth.uid()`, sem passar por `has_module_permission` (não existe "papel"
--   nem "permissão por módulo" dentro do espaço Pessoal de alguém, cada
--   space Pessoal tem UM membro). Uma trigger (`enforce_personal_owner`)
--   ainda garante que `space_id` seja mesmo o space Pessoal do próprio
--   `user_id` — defesa extra, igual ao resto do projeto, contra um
--   `space_id` forjado.
--
--   COLABORATIVAS DO VISIONÁRIO DEV (vendors, sales, commissions,
--   client_sites): RLS via `has_module_permission(space_id, módulo,
--   ação)` — mesmo padrão de clients/services/meetings/work_items.
--   `vendedores` e `sites` já existem na lista de módulos desde a
--   migration 003 — nenhum módulo novo precisou ser criado.
--
-- Vendas/comissões NÃO criam `financial_charges` automaticamente — ficam
-- ligadas a `client_id`/`client_service_id` quando fizer sentido, mas o
-- lançamento financeiro (se a venda gerar cobrança de verdade) continua
-- sendo um "Nova movimentação" explícito no Financeiro. Isso evita contar
-- a mesma receita duas vezes (uma como venda, outra como cobrança).
--
-- Histórico (Fase 12) NÃO ganha tabela: é derivado por query das tabelas
-- que já existem (tasks concluídas, activity_completions, work_tasks
-- concluídas, meetings realizadas, goals concluídas) — ver
-- lib/supabase/repositories/history.repository.ts.
--
-- COMO EXECUTAR: Supabase Dashboard → SQL Editor → New query → colar este
-- arquivo inteiro → Run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Trigger reutilizável pelas 4 tabelas pessoais: garante que `space_id`
-- seja mesmo o space Pessoal do próprio `user_id` (nunca o de outro
-- usuário nem um space de negócio) — mesma disciplina de
-- enforce_meeting_participant/enforce_work_item_assignee, adaptada pra
-- dados sem colaboração.
-- -----------------------------------------------------------------------------

create or replace function public.enforce_personal_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_type text;
begin
  if new.user_id is distinct from auth.uid() then
    raise exception 'user_id precisa ser o usuário autenticado.';
  end if;

  select owner_id, type into v_owner_id, v_type from public.spaces where id = new.space_id;

  if v_owner_id is null then
    raise exception 'Space não encontrado.';
  end if;

  if v_type <> 'personal' or v_owner_id <> new.user_id then
    raise exception 'space_id precisa ser o space Pessoal do próprio usuário.';
  end if;

  return new;
end;
$$;

comment on function public.enforce_personal_owner() is
  'Trigger de segurança pra tasks/activities/work_tasks/goals: recusa '
  'gravar com user_id diferente do autenticado ou space_id que não seja o '
  'Pessoal do próprio usuário.';

-- -----------------------------------------------------------------------------
-- 1. Tarefas pessoais
-- -----------------------------------------------------------------------------

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,

  title text not null,
  description text,
  due_date date,
  scheduled_time time,
  priority text not null default 'media' check (priority in ('baixa', 'media', 'alta')),
  status text not null default 'pendente' check (status in ('pendente', 'concluida')),
  category text,
  notes text,

  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tasks_user_id on public.tasks (user_id);
create index if not exists idx_tasks_due_date on public.tasks (user_id, due_date);

drop trigger if exists set_updated_at on public.tasks;
create trigger set_updated_at before update on public.tasks for each row execute function public.set_updated_at();
drop trigger if exists enforce_personal_owner on public.tasks;
create trigger enforce_personal_owner before insert or update on public.tasks for each row execute function public.enforce_personal_owner();

alter table public.tasks enable row level security;
drop policy if exists tasks_all on public.tasks;
create policy tasks_all on public.tasks for all using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.tasks to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Rotina — atividades recorrentes por dia da semana + histórico por
-- ocorrência (concluir "hoje" nunca conclui a rotina inteira).
-- -----------------------------------------------------------------------------

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,

  title text not null,
  category text,
  -- 0=domingo .. 6=sábado (mesma convenção de Date.getDay() já usada no app).
  weekdays smallint[] not null default '{}',
  start_time time not null,
  end_time time,
  is_active boolean not null default true,
  sort_order int not null default 0,
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.activities is
  'Rotina recorrente por dia da semana. "Concluída" nunca é campo aqui — '
  'é sempre uma linha em activity_completions por data, então marcar hoje '
  'não afeta ontem nem amanhã.';

create index if not exists idx_activities_user_id on public.activities (user_id);

drop trigger if exists set_updated_at on public.activities;
create trigger set_updated_at before update on public.activities for each row execute function public.set_updated_at();
drop trigger if exists enforce_personal_owner on public.activities;
create trigger enforce_personal_owner before insert or update on public.activities for each row execute function public.enforce_personal_owner();

alter table public.activities enable row level security;
drop policy if exists activities_all on public.activities;
create policy activities_all on public.activities for all using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.activities to authenticated;

create table if not exists public.activity_completions (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  occurrence_date date not null,
  completed_at timestamptz not null default now(),
  unique (activity_id, occurrence_date)
);

create index if not exists idx_activity_completions_activity_id on public.activity_completions (activity_id);
create index if not exists idx_activity_completions_user_date on public.activity_completions (user_id, occurrence_date);

alter table public.activity_completions enable row level security;
drop policy if exists activity_completions_all on public.activity_completions;
create policy activity_completions_all on public.activity_completions for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.activities a where a.id = activity_id and a.user_id = auth.uid())
  );
grant select, insert, update, delete on public.activity_completions to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Trabalho / CLT pessoal — nunca confundir com work_items (Visionário
-- Dev, migration 006). Mesma forma de tasks, tabela própria por clareza
-- semântica (aparece só na seção "Trabalho / CLT", nunca em "Trabalhos").
-- -----------------------------------------------------------------------------

create table if not exists public.personal_work_tasks (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,

  title text not null,
  description text,
  due_date date,
  scheduled_time time,
  priority text not null default 'normal' check (priority in ('baixa', 'normal', 'alta', 'urgente')),
  status text not null default 'pendente' check (status in ('pendente', 'concluida')),
  notes text,

  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_personal_work_tasks_user_id on public.personal_work_tasks (user_id);
create index if not exists idx_personal_work_tasks_due_date on public.personal_work_tasks (user_id, due_date);

drop trigger if exists set_updated_at on public.personal_work_tasks;
create trigger set_updated_at before update on public.personal_work_tasks for each row execute function public.set_updated_at();
drop trigger if exists enforce_personal_owner on public.personal_work_tasks;
create trigger enforce_personal_owner before insert or update on public.personal_work_tasks for each row execute function public.enforce_personal_owner();

alter table public.personal_work_tasks enable row level security;
drop policy if exists personal_work_tasks_all on public.personal_work_tasks;
create policy personal_work_tasks_all on public.personal_work_tasks for all using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.personal_work_tasks to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Metas pessoais — nunca contaminam o Financeiro (valores aqui são só
-- acompanhamento, não geram financial_charges).
-- -----------------------------------------------------------------------------

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,

  title text not null,
  description text,
  category text,
  target_value numeric(12, 2),
  current_value numeric(12, 2) not null default 0,
  target_date date,
  status text not null default 'em_andamento' check (status in ('em_andamento', 'concluida', 'cancelada')),
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_goals_user_id on public.goals (user_id);

drop trigger if exists set_updated_at on public.goals;
create trigger set_updated_at before update on public.goals for each row execute function public.set_updated_at();
drop trigger if exists enforce_personal_owner on public.goals;
create trigger enforce_personal_owner before insert or update on public.goals for each row execute function public.enforce_personal_owner();

alter table public.goals enable row level security;
drop policy if exists goals_all on public.goals;
create policy goals_all on public.goals for all using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.goals to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Vendedores, Vendas e Comissões — colaborativo (Visionário Dev),
-- RLS via has_module_permission(space_id, 'vendedores', ação).
-- -----------------------------------------------------------------------------

create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  name text not null,
  contact_name text,
  whatsapp text,
  email text,
  status text not null default 'ativo' check (status in ('ativo', 'inativo')),
  notes text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_vendors_space_id on public.vendors (space_id);

drop trigger if exists set_updated_at on public.vendors;
create trigger set_updated_at before update on public.vendors for each row execute function public.set_updated_at();

alter table public.vendors enable row level security;
drop policy if exists vendors_select on public.vendors;
create policy vendors_select on public.vendors for select using (public.has_module_permission(space_id, 'vendedores', 'view'));
drop policy if exists vendors_insert on public.vendors;
create policy vendors_insert on public.vendors for insert with check (public.has_module_permission(space_id, 'vendedores', 'create') and created_by = auth.uid());
drop policy if exists vendors_update on public.vendors;
create policy vendors_update on public.vendors for update using (public.has_module_permission(space_id, 'vendedores', 'edit')) with check (public.has_module_permission(space_id, 'vendedores', 'edit'));
drop policy if exists vendors_delete on public.vendors;
create policy vendors_delete on public.vendors for delete using (public.has_module_permission(space_id, 'vendedores', 'delete'));
grant select, insert, update, delete on public.vendors to authenticated;

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  vendor_id uuid not null references public.vendors (id) on delete restrict,
  client_id uuid references public.clients (id) on delete set null,
  service_id uuid references public.services (id) on delete set null,
  amount numeric(12, 2) not null check (amount >= 0),
  sale_date date not null,
  status text not null default 'confirmada' check (status in ('pendente', 'confirmada', 'cancelada')),
  notes text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.sales is
  'Registro comercial da venda — NÃO gera financial_charges automático. '
  'Se a venda também precisar entrar no caixa, isso é uma "Nova '
  'movimentação" explícita no Financeiro, pra nunca contar a receita duas '
  'vezes.';

create index if not exists idx_sales_space_id on public.sales (space_id);
create index if not exists idx_sales_vendor_id on public.sales (vendor_id);

drop trigger if exists set_updated_at on public.sales;
create trigger set_updated_at before update on public.sales for each row execute function public.set_updated_at();

alter table public.sales enable row level security;
drop policy if exists sales_select on public.sales;
create policy sales_select on public.sales for select using (public.has_module_permission(space_id, 'vendedores', 'view'));
drop policy if exists sales_insert on public.sales;
create policy sales_insert on public.sales for insert with check (public.has_module_permission(space_id, 'vendedores', 'create') and created_by = auth.uid());
drop policy if exists sales_update on public.sales;
create policy sales_update on public.sales for update using (public.has_module_permission(space_id, 'vendedores', 'edit')) with check (public.has_module_permission(space_id, 'vendedores', 'edit'));
drop policy if exists sales_delete on public.sales;
create policy sales_delete on public.sales for delete using (public.has_module_permission(space_id, 'vendedores', 'delete'));
grant select, insert, update, delete on public.sales to authenticated;

create table if not exists public.commissions (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  sale_id uuid not null references public.sales (id) on delete cascade,
  vendor_id uuid not null references public.vendors (id) on delete restrict,
  percentage numeric(5, 2),
  amount numeric(12, 2) not null check (amount >= 0),
  status text not null default 'pendente' check (status in ('pendente', 'paga')),
  due_date date,
  paid_date date,
  notes text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_commissions_space_id on public.commissions (space_id);
create index if not exists idx_commissions_vendor_id on public.commissions (vendor_id);
create index if not exists idx_commissions_sale_id on public.commissions (sale_id);

drop trigger if exists set_updated_at on public.commissions;
create trigger set_updated_at before update on public.commissions for each row execute function public.set_updated_at();

alter table public.commissions enable row level security;
drop policy if exists commissions_select on public.commissions;
create policy commissions_select on public.commissions for select using (public.has_module_permission(space_id, 'vendedores', 'view'));
drop policy if exists commissions_insert on public.commissions;
create policy commissions_insert on public.commissions for insert with check (public.has_module_permission(space_id, 'vendedores', 'create') and created_by = auth.uid());
drop policy if exists commissions_update on public.commissions;
create policy commissions_update on public.commissions for update using (public.has_module_permission(space_id, 'vendedores', 'edit')) with check (public.has_module_permission(space_id, 'vendedores', 'edit'));
drop policy if exists commissions_delete on public.commissions;
create policy commissions_delete on public.commissions for delete using (public.has_module_permission(space_id, 'vendedores', 'delete'));
grant select, insert, update, delete on public.commissions to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Sites & Domínios — colaborativo (Visionário Dev), módulo 'sites' já
-- existe desde a migration 003.
-- -----------------------------------------------------------------------------

create table if not exists public.client_sites (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  client_id uuid references public.clients (id) on delete set null,

  project_name text not null,
  url text,
  domain text,
  registrar text,
  hosting_provider text,
  plan text,

  contracted_at date,
  due_date date,
  price numeric(12, 2),

  status text not null default 'ativo' check (
    status in ('ativo', 'desenvolvimento', 'aguardando_cliente', 'vencendo', 'expirado', 'cancelado')
  ),
  notes text,

  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_client_sites_space_id on public.client_sites (space_id);
create index if not exists idx_client_sites_client_id on public.client_sites (client_id);
create index if not exists idx_client_sites_due_date on public.client_sites (space_id, due_date);

drop trigger if exists set_updated_at on public.client_sites;
create trigger set_updated_at before update on public.client_sites for each row execute function public.set_updated_at();

alter table public.client_sites enable row level security;
drop policy if exists client_sites_select on public.client_sites;
create policy client_sites_select on public.client_sites for select using (public.has_module_permission(space_id, 'sites', 'view'));
drop policy if exists client_sites_insert on public.client_sites;
create policy client_sites_insert on public.client_sites for insert with check (public.has_module_permission(space_id, 'sites', 'create') and created_by = auth.uid());
drop policy if exists client_sites_update on public.client_sites;
create policy client_sites_update on public.client_sites for update using (public.has_module_permission(space_id, 'sites', 'edit')) with check (public.has_module_permission(space_id, 'sites', 'edit'));
drop policy if exists client_sites_delete on public.client_sites;
create policy client_sites_delete on public.client_sites for delete using (public.has_module_permission(space_id, 'sites', 'delete'));
grant select, insert, update, delete on public.client_sites to authenticated;

-- =============================================================================
-- Fim da migration 008.
--
-- O que NÃO mudou: nenhuma tabela/policy/trigger/função das migrations
-- 001-007 foi tocada.
--
-- O que isso desbloqueia: Tarefas, Rotina (+ histórico por ocorrência),
-- Trabalho/CLT pessoal e Metas reais para qualquer usuário (space Pessoal
-- já existe desde o cadastro, via handle_new_user); Vendedores/Vendas/
-- Comissões e Sites & Domínios reais no Visionário Dev, com RLS por
-- módulo já existente. Financeiro Pessoal/TikTok não precisam de nada
-- daqui — só o space Pessoal/TikTok resolvido corretamente no código.
-- =============================================================================
