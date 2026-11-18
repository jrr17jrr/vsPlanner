-- =============================================================================
-- VSPlanner — Recorrência MENSAL nas subtarefas (além da semanal/diária).
-- Migration: 20261117100000_subtask_monthly_recurrence.sql
--
-- 100% ADITIVA e idempotente. NENHUM update/delete em registros existentes.
-- Depende de 20261112100000_organizer_tasks_subtask_recurrence.sql.
--
--   - task_subtasks.month_day (1..31): dia do mês da subtarefa mensal. Em
--     meses mais curtos (ex.: dia 31 em novembro) a execução cai no último
--     dia do mês (regra em lib/subtask-recurrence.ts).
--   - recurrence passa a aceitar 'monthly'. As constraints são trocadas por
--     SUPERCONJUNTOS das atuais: toda linha válida hoje continua válida
--     ('none' e 'weekly' com as mesmas exigências de antes).
--   - "Diária" é a semanal com os 7 dias marcados (sem mudança no banco).
--
-- COMO EXECUTAR: Supabase Dashboard → SQL Editor → New query → colar este
-- arquivo inteiro → Run. Seguro para reexecutar.
-- =============================================================================

alter table public.task_subtasks add column if not exists month_day smallint;

comment on column public.task_subtasks.month_day is
  'Dia do mês (1..31) da subtarefa com recurrence = ''monthly''. Mês sem esse dia → último dia do mês.';

alter table public.task_subtasks drop constraint if exists task_subtasks_recurrence_check;
alter table public.task_subtasks add constraint task_subtasks_recurrence_check
  check (recurrence in ('none', 'weekly', 'monthly')) not valid;

alter table public.task_subtasks drop constraint if exists task_subtasks_recurrence_shape_check;
alter table public.task_subtasks add constraint task_subtasks_recurrence_shape_check check (
  recurrence = 'none'
  or (
    recurrence = 'weekly'
    and cardinality(weekdays) > 0
    and weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
    and recurrence_start is not null
    and parent_subtask_id is null
  )
  or (
    recurrence = 'monthly'
    and month_day is not null and month_day between 1 and 31
    and recurrence_start is not null
    and parent_subtask_id is null
  )
) not valid;

create index if not exists idx_task_subtasks_user_recurring_any
  on public.task_subtasks (user_id) where recurrence <> 'none';

comment on column public.task_subtasks.recurrence is
  '''none'' = estado único em is_done; ''weekly'' (dias da semana) ou ''monthly'' (month_day) = estado por dia em task_subtask_occurrences.';
