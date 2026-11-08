-- =============================================================================
-- VSPlanner — Tarefas organizadoras + recorrência individual nas subtarefas.
-- Migration: 20261112100000_organizer_tasks_subtask_recurrence.sql
--
-- 100% ADITIVA e idempotente. NENHUM update/delete em registros existentes:
--
--   1. tasks.kind passa a aceitar 'organizadora' — tarefa principal SEM dia
--      fixo e SEM recorrência, que só organiza subtarefas. Não gera
--      execuções, não fica "atrasada" e não aparece em "Com prazo". A troca
--      da constraint aceita um SUPERCONJUNTO dos valores atuais (todas as
--      linhas existentes continuam válidas).
--
--   2. task_subtasks ganha recorrência própria (independente da tarefa
--      principal): recurrence ('none' | 'weekly'), weekdays (0=domingo),
--      recurrence_start, recurrence_until e archived_at (subtarefa
--      recorrente excluída com histórico: some das listas, histórico fica).
--      Subtarefas existentes ficam com recurrence = 'none' (comportamento
--      de hoje, sem mudança nenhuma). A prioridade dos itens de checklist
--      já existe (task_subtasks.priority, default 'normal' — migration
--      20261102100000): itens antigos já são 'normal'.
--
--   3. public.task_subtask_occurrences — estado POR DIA de uma subtarefa
--      recorrente. Concluir segunda NÃO conclui terça. Ocorrências futuras
--      nunca são gravadas (o app calcula pelos weekdays). Só existe linha
--      para dias marcados/desmarcados. unique(subtask_id, occurrence_date)
--      impede duplicação mesmo com dois cliques/abas ao mesmo tempo
--      (o app grava com upsert on conflict).
--
-- COMO EXECUTAR: Supabase Dashboard → SQL Editor → New query → colar este
-- arquivo inteiro → Run. Seguro para reexecutar.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tarefa organizadora
-- -----------------------------------------------------------------------------

alter table public.tasks drop constraint if exists tasks_kind_check;
alter table public.tasks add constraint tasks_kind_check check (kind in ('prazo', 'dia', 'organizadora'));

comment on column public.tasks.kind is
  '''prazo'' = concluir até due_date; ''dia'' = fazer em due_date (ou nos weekdays, se recorrente); '
  '''organizadora'' = sem dia fixo e sem recorrência, só agrupa subtarefas.';

-- -----------------------------------------------------------------------------
-- 2. Recorrência individual nas subtarefas
-- -----------------------------------------------------------------------------

alter table public.task_subtasks add column if not exists recurrence text not null default 'none';
alter table public.task_subtasks add column if not exists weekdays smallint[] not null default '{}';
alter table public.task_subtasks add column if not exists recurrence_start date;
alter table public.task_subtasks add column if not exists recurrence_until date;
alter table public.task_subtasks add column if not exists archived_at timestamptz;

comment on column public.task_subtasks.recurrence is
  '''none'' = estado único em is_done; ''weekly'' = estado por dia em task_subtask_occurrences.';
comment on column public.task_subtasks.recurrence_start is
  'Primeiro dia da recorrência da subtarefa (criação/ativação). Dias anteriores nunca viram pendência.';
comment on column public.task_subtasks.archived_at is
  'Subtarefa recorrente excluída que já tinha histórico: escondida das listas, histórico preservado.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'task_subtasks_recurrence_check' and conrelid = 'public.task_subtasks'::regclass) then
    alter table public.task_subtasks add constraint task_subtasks_recurrence_check
      check (recurrence in ('none', 'weekly')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'task_subtasks_recurrence_shape_check' and conrelid = 'public.task_subtasks'::regclass) then
    alter table public.task_subtasks add constraint task_subtasks_recurrence_shape_check check (
      recurrence = 'none'
      or (
        cardinality(weekdays) > 0
        and weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
        and recurrence_start is not null
        and parent_subtask_id is null
      )
    ) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'task_subtasks_recurrence_until_check' and conrelid = 'public.task_subtasks'::regclass) then
    alter table public.task_subtasks add constraint task_subtasks_recurrence_until_check check (
      recurrence_until is null or recurrence_start is null or recurrence_until >= recurrence_start - 1
    ) not valid;
  end if;
end $$;

create index if not exists idx_task_subtasks_user_recurring
  on public.task_subtasks (user_id) where recurrence = 'weekly';

-- -----------------------------------------------------------------------------
-- 3. Execuções por dia das subtarefas recorrentes
-- -----------------------------------------------------------------------------

create table if not exists public.task_subtask_occurrences (
  id uuid primary key default gen_random_uuid(),
  subtask_id uuid not null references public.task_subtasks (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  occurrence_date date not null,
  status text not null default 'pendente' check (status in ('pendente', 'concluida')),
  completed_at timestamptz,
  -- Snapshot do título no dia: renomear a subtarefa depois não reescreve o histórico.
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subtask_id, occurrence_date)
);

comment on table public.task_subtask_occurrences is
  'Estado por dia de subtarefas recorrentes (concluir segunda não conclui terça). '
  'Nunca guarda dias futuros; só dias marcados/desmarcados.';

create index if not exists idx_task_subtask_occurrences_user_date on public.task_subtask_occurrences (user_id, occurrence_date);

drop trigger if exists set_updated_at on public.task_subtask_occurrences;
create trigger set_updated_at before update on public.task_subtask_occurrences
  for each row execute function public.set_updated_at();

alter table public.task_subtask_occurrences enable row level security;
drop policy if exists task_subtask_occurrences_all on public.task_subtask_occurrences;
-- Mesmo isolamento de task_subtasks: só o dono da subtarefa (que por sua vez
-- só existe em tarefa do próprio usuário — policy de task_subtasks).
create policy task_subtask_occurrences_all on public.task_subtask_occurrences for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.task_subtasks s
      where s.id = subtask_id and s.user_id = auth.uid()
    )
  );
grant select, insert, update, delete on public.task_subtask_occurrences to authenticated;
