-- VSPlanner: subtarefas integradas às tarefas existentes, sem alterar tabelas legadas.
create table if not exists public.task_subtasks (
 id uuid primary key default gen_random_uuid(),
 parent_type text not null check (parent_type in ('pessoal','clt','visionario')),
 parent_id uuid not null,
 user_id uuid not null references auth.users(id) on delete cascade,
 title text not null check (length(trim(title)) > 0),
 due_date date,
 is_done boolean not null default false,
 position integer not null default 0,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists idx_task_subtasks_parent on public.task_subtasks(parent_type,parent_id,position);
alter table public.task_subtasks enable row level security;
create policy "Subtarefas pessoais do usuario" on public.task_subtasks for all to authenticated
using (user_id=auth.uid() and (
 (parent_type='pessoal' and exists(select 1 from public.tasks t where t.id=parent_id and t.user_id=auth.uid()))
 or (parent_type='clt' and exists(select 1 from public.clt_tasks t where t.id=parent_id and t.user_id=auth.uid()))
 or (parent_type='visionario' and exists(select 1 from public.work_items w where w.id=parent_id and w.created_by=auth.uid()))
))
with check (user_id=auth.uid() and (
 (parent_type='pessoal' and exists(select 1 from public.tasks t where t.id=parent_id and t.user_id=auth.uid()))
 or (parent_type='clt' and exists(select 1 from public.clt_tasks t where t.id=parent_id and t.user_id=auth.uid()))
 or (parent_type='visionario' and exists(select 1 from public.work_items w where w.id=parent_id and w.created_by=auth.uid()))
));
