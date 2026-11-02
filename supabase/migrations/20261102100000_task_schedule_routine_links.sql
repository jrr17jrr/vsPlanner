-- =============================================================================
-- VSPlanner — Execução x Prazo final em tarefas e subtarefas + vínculo da
-- Rotina com tarefas existentes.
-- Migration: 20261102100000_task_schedule_routine_links.sql
--
-- 100% ADITIVA e idempotente: só adiciona colunas (todas opcionais ou com
-- default), índices, constraints `not valid` (não revalida linhas antigas)
-- e troca a policy de `activities` por uma equivalente + checagem do
-- vínculo. NENHUM update/delete em registros existentes.
--
-- Compatibilidade com registros antigos (regra em lib/task-schedule.ts):
--   tasks.kind = 'dia'   → due_date/scheduled_time continuam sendo a
--                          EXECUÇÃO ("fazer no dia"); prazo final novo em
--                          deadline_date/deadline_time.
--   tasks.kind = 'prazo' → due_date continua sendo o PRAZO FINAL (sem
--                          execução), exatamente como hoje.
--   task_subtasks.due_date continua sendo o PRAZO (era o rótulo na tela);
--                          execução nova em scheduled_date/scheduled_time.
--
-- COMO EXECUTAR: Supabase Dashboard → SQL Editor → New query → colar este
-- arquivo inteiro → Run. Seguro para reexecutar.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tarefas: prazo final independente da execução + lembretes
-- -----------------------------------------------------------------------------

alter table public.tasks add column if not exists deadline_date date;
alter table public.tasks add column if not exists deadline_time time;
-- Minutos de antecedência em relação à execução: 0 = no horário, 15, 30, 60, 1440 (1 dia).
alter table public.tasks add column if not exists reminder_offsets smallint[] not null default '{}';

comment on column public.tasks.deadline_date is
  'Prazo final de tarefas com execução (kind = dia). Em kind = prazo o prazo continua em due_date.';
comment on column public.tasks.reminder_offsets is
  'Lembretes antes da execução, em minutos (0, 15, 30, 60, 1440).';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_reminder_offsets_check' and conrelid = 'public.tasks'::regclass) then
    alter table public.tasks add constraint tasks_reminder_offsets_check
      check (reminder_offsets <@ array[0, 15, 30, 60, 1440]::smallint[]) not valid;
  end if;
end $$;

create index if not exists idx_tasks_user_deadline on public.tasks (user_id, deadline_date) where deadline_date is not null;

-- -----------------------------------------------------------------------------
-- 2. Subtarefas: execução, horários, prioridade, lembretes, data de conclusão
-- -----------------------------------------------------------------------------

alter table public.task_subtasks add column if not exists scheduled_date date;
alter table public.task_subtasks add column if not exists scheduled_time time;
alter table public.task_subtasks add column if not exists deadline_time time;
alter table public.task_subtasks add column if not exists priority text not null default 'normal';
alter table public.task_subtasks add column if not exists reminder_offsets smallint[] not null default '{}';
alter table public.task_subtasks add column if not exists completed_at timestamptz;

comment on column public.task_subtasks.scheduled_date is 'Fazer no dia (execução). O prazo final continua em due_date.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'task_subtasks_priority_check' and conrelid = 'public.task_subtasks'::regclass) then
    alter table public.task_subtasks add constraint task_subtasks_priority_check
      check (priority in ('normal', 'importante')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'task_subtasks_reminder_offsets_check' and conrelid = 'public.task_subtasks'::regclass) then
    alter table public.task_subtasks add constraint task_subtasks_reminder_offsets_check
      check (reminder_offsets <@ array[0, 15, 30, 60, 1440]::smallint[]) not valid;
  end if;
end $$;

create index if not exists idx_task_subtasks_user_scheduled on public.task_subtasks (user_id, scheduled_date) where scheduled_date is not null;
create index if not exists idx_task_subtasks_user_due on public.task_subtasks (user_id, due_date) where due_date is not null;

-- -----------------------------------------------------------------------------
-- 3. Rotina: vínculo com tarefa existente (sem duplicar), ocorrência única,
-- lembretes
-- -----------------------------------------------------------------------------

alter table public.activities add column if not exists task_id uuid references public.tasks (id) on delete cascade;
alter table public.activities add column if not exists specific_date date;
alter table public.activities add column if not exists reminder_offsets smallint[] not null default '{}';

comment on column public.activities.task_id is
  'Tarefa original vinculada (nunca uma cópia). Status/subtarefas vêm sempre de tasks/task_subtasks.';
comment on column public.activities.specific_date is
  'Ocorrência única nesse dia (ignora weekdays). Null = repete nos weekdays.';

create index if not exists idx_activities_task_id on public.activities (task_id) where task_id is not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'activities_schedule_check' and conrelid = 'public.activities'::regclass) then
    alter table public.activities add constraint activities_schedule_check
      check (specific_date is not null or cardinality(weekdays) > 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'activities_reminder_offsets_check' and conrelid = 'public.activities'::regclass) then
    alter table public.activities add constraint activities_reminder_offsets_check
      check (reminder_offsets <@ array[0, 15, 30, 60, 1440]::smallint[]) not valid;
  end if;
end $$;

-- Mesma regra de antes (user_id = auth.uid()) + a tarefa vinculada precisa
-- ser do próprio usuário: ninguém vincula tarefa de outra pessoa.
drop policy if exists activities_all on public.activities;
create policy activities_all on public.activities for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (task_id is null or exists (select 1 from public.tasks t where t.id = task_id and t.user_id = auth.uid()))
  );
