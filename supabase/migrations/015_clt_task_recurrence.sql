-- VSPlanner — tarefas e rotina próprias do Trabalho / CLT
alter table public.clt_tasks add column if not exists kind text not null default 'prazo' check (kind in ('prazo','dia'));
alter table public.clt_tasks add column if not exists recurrence text not null default 'none' check (recurrence in ('none','weekly'));
alter table public.clt_tasks add column if not exists weekdays integer[] not null default '{}';
alter table public.clt_tasks add column if not exists recurrence_start date;
alter table public.clt_tasks add column if not exists recurrence_until date;
alter table public.clt_tasks add column if not exists archived_at timestamptz;

create table if not exists public.clt_task_occurrences (
 id uuid primary key default gen_random_uuid(),
 task_id uuid not null references public.clt_tasks(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 occurrence_date date not null,
 status text not null default 'pendente' check(status in ('pendente','concluida')),
 completed_at timestamptz,
 created_at timestamptz not null default now(),
 unique(task_id, occurrence_date)
);
alter table public.clt_task_occurrences enable row level security;
drop policy if exists clt_task_occurrences_all on public.clt_task_occurrences;
create policy clt_task_occurrences_all on public.clt_task_occurrences for all using(user_id=auth.uid()) with check(user_id=auth.uid());
grant select,insert,update,delete on public.clt_task_occurrences to authenticated;
create index if not exists idx_clt_occurrences_user_date on public.clt_task_occurrences(user_id,occurrence_date);
