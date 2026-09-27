-- =============================================================================
-- VSPlanner — Tarefas com prazo x Tarefas do dia (+ recorrência semanal).
-- Migration: 013_day_tasks_and_occurrences.sql
--
-- Reaproveita `public.tasks` (migration 008) — nenhuma tarefa existente é
-- apagada ou muda de comportamento:
--
--   1. tasks.kind            'prazo' (concluir ATÉ uma data) | 'dia' (fazer
--                            NAQUELE dia). Tudo que já existe vira 'prazo'
--                            (era o significado de `due_date` até aqui).
--   2. tasks.location        local opcional.
--   3. tasks.priority        passa a ser 'normal' | 'importante'.
--                            Conversão: 'alta' → 'importante';
--                            'baixa'/'media' → 'normal'.
--   4. tasks.recurrence      'none' | 'weekly' (só para kind = 'dia').
--      tasks.weekdays        0=domingo..6=sábado (mesma convenção da Rotina).
--      tasks.recurrence_start 1º dia em que a recorrência vale. Ao editar uma
--                            recorrente, o app grava as ocorrências passadas
--                            (histórico) e move este início para hoje — a
--                            alteração vale só daqui pra frente.
--      tasks.recurrence_until último dia com ocorrência (encerrar repetição).
--      tasks.archived_at     recorrente excluída que já tinha histórico: some
--                            das listas, mas o histórico continua.
--
--   5. public.task_occurrences — estado POR DIA de uma tarefa recorrente
--      (concluída/pendente) com snapshot de título/horário/local/prioridade.
--      Ocorrências futuras NUNCA são criadas: a definição fica em `tasks` e
--      o app calcula em que dias ela aparece (lib/tasks.ts). Só existe linha
--      aqui quando o dia foi concluído, ou quando um dia passado sem
--      conclusão precisou ser "congelado" no histórico antes de uma edição.
--      unique(task_id, occurrence_date) impede duplicação.
--
-- Tarefas não recorrentes continuam usando tasks.status/completed_at.
--
-- COMO EXECUTAR: Supabase Dashboard → SQL Editor → New query → colar este
-- arquivo inteiro → Run. Seguro para reexecutar. Requer a migration 008.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Novas colunas em tasks
-- -----------------------------------------------------------------------------

alter table public.tasks add column if not exists kind text not null default 'prazo';
alter table public.tasks add column if not exists location text;
alter table public.tasks add column if not exists recurrence text not null default 'none';
alter table public.tasks add column if not exists weekdays smallint[] not null default '{}';
alter table public.tasks add column if not exists recurrence_start date;
alter table public.tasks add column if not exists recurrence_until date;
alter table public.tasks add column if not exists archived_at timestamptz;

comment on column public.tasks.kind is
  '''prazo'' = concluir até due_date; ''dia'' = fazer em due_date (ou nos weekdays, se recorrente).';
comment on column public.tasks.recurrence_start is
  'Primeiro dia da recorrência. Antes dele, o histórico vem só de task_occurrences.';
comment on column public.tasks.recurrence_until is
  'Último dia com ocorrência (null = sem fim).';
comment on column public.tasks.archived_at is
  'Recorrente excluída com histórico: escondida das listas, histórico preservado.';

-- -----------------------------------------------------------------------------
-- 2. Prioridade: baixa/media/alta → normal/importante
-- -----------------------------------------------------------------------------

-- Os triggers ficam desligados só durante a conversão: enforce_personal_owner
-- exige auth.uid() (nulo no SQL Editor) e set_updated_at mudaria o
-- updated_at de todas as tarefas (usado no Histórico).
alter table public.tasks drop constraint if exists tasks_priority_check;
alter table public.tasks disable trigger enforce_personal_owner;
alter table public.tasks disable trigger set_updated_at;
update public.tasks set priority = 'importante' where priority = 'alta';
update public.tasks set priority = 'normal' where priority in ('baixa', 'media');
alter table public.tasks enable trigger set_updated_at;
alter table public.tasks enable trigger enforce_personal_owner;
alter table public.tasks alter column priority set default 'normal';
alter table public.tasks
  add constraint tasks_priority_check check (priority in ('normal', 'importante'));

-- -----------------------------------------------------------------------------
-- 3. Regras de consistência
-- -----------------------------------------------------------------------------

alter table public.tasks drop constraint if exists tasks_kind_check;
alter table public.tasks add constraint tasks_kind_check check (kind in ('prazo', 'dia'));

alter table public.tasks drop constraint if exists tasks_recurrence_check;
alter table public.tasks add constraint tasks_recurrence_check check (recurrence in ('none', 'weekly'));

-- Recorrência só em tarefa do dia, com pelo menos um dia da semana válido e
-- data de início.
alter table public.tasks drop constraint if exists tasks_recurrence_shape_check;
alter table public.tasks add constraint tasks_recurrence_shape_check check (
  recurrence = 'none'
  or (
    kind = 'dia'
    and cardinality(weekdays) > 0
    and weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
    and recurrence_start is not null
  )
);

-- Tarefa do dia sem repetição precisa de data.
alter table public.tasks drop constraint if exists tasks_day_date_check;
alter table public.tasks add constraint tasks_day_date_check check (
  kind <> 'dia' or recurrence <> 'none' or due_date is not null
);

alter table public.tasks drop constraint if exists tasks_recurrence_until_check;
alter table public.tasks add constraint tasks_recurrence_until_check check (
  recurrence_until is null or recurrence_start is null or recurrence_until >= recurrence_start - 1
);

create index if not exists idx_tasks_space_kind on public.tasks (space_id, kind) where archived_at is null;

-- -----------------------------------------------------------------------------
-- 4. Ocorrências de tarefas recorrentes
-- -----------------------------------------------------------------------------

create table if not exists public.task_occurrences (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  space_id uuid not null references public.spaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,

  occurrence_date date not null,
  status text not null default 'pendente' check (status in ('pendente', 'concluida')),
  completed_at timestamptz,

  -- Snapshot do dia: editar a recorrência depois não reescreve o passado.
  title text not null,
  scheduled_time time,
  location text,
  priority text not null default 'normal' check (priority in ('normal', 'importante')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (task_id, occurrence_date)
);

comment on table public.task_occurrences is
  'Estado por dia de tarefas recorrentes (concluir segunda não conclui quarta). '
  'Nunca guarda ocorrências futuras — só dias concluídos ou dias passados '
  'congelados no histórico antes de uma edição.';

create index if not exists idx_task_occurrences_user_date on public.task_occurrences (user_id, occurrence_date);
create index if not exists idx_task_occurrences_task on public.task_occurrences (task_id);

drop trigger if exists set_updated_at on public.task_occurrences;
create trigger set_updated_at before update on public.task_occurrences
  for each row execute function public.set_updated_at();

-- Mesma defesa das outras tabelas pessoais: user_id = autenticado e
-- space_id = space Pessoal dele.
drop trigger if exists enforce_personal_owner on public.task_occurrences;
create trigger enforce_personal_owner before insert or update on public.task_occurrences
  for each row execute function public.enforce_personal_owner();

alter table public.task_occurrences enable row level security;
drop policy if exists task_occurrences_all on public.task_occurrences;
create policy task_occurrences_all on public.task_occurrences for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.tasks t
      where t.id = task_id
        and t.user_id = auth.uid()
        and t.space_id = task_occurrences.space_id
        and t.recurrence = 'weekly'
    )
  );
grant select, insert, update, delete on public.task_occurrences to authenticated;
