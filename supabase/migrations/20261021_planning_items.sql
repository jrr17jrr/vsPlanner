create table if not exists public.planning_items (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 area text not null check(area in ('clt','pessoal','rotina','visionario')),
 company_id uuid references public.clt_companies(id) on delete set null,
 title text not null,
 notes text,
 planned_date date,
 scheduled_time time,
 recurrence_weekdays integer[] not null default '{}',
 objective text,
 daily_budget numeric(12,2) not null default 0,
 planned_amount numeric(12,2) not null default 0,
 actual_amount numeric(12,2) not null default 0,
 views integer not null default 0,
 messages integer not null default 0,
 campaign_id uuid references public.clt_campaigns(id) on delete set null,
 completed boolean not null default false,
 created_at timestamptz not null default now(),
 constraint planning_nonnegative check(daily_budget>=0 and planned_amount>=0 and actual_amount>=0 and views>=0 and messages>=0)
);
create index if not exists planning_items_user_date_idx on public.planning_items(user_id,planned_date);
alter table public.planning_items enable row level security;
create policy planning_items_select on public.planning_items for select to authenticated using(user_id=auth.uid());
create policy planning_items_insert on public.planning_items for insert to authenticated with check(user_id=auth.uid());
create policy planning_items_update on public.planning_items for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy planning_items_delete on public.planning_items for delete to authenticated using(user_id=auth.uid());