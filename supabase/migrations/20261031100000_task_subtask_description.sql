-- VSPlanner — descrição opcional (expansível) em subtarefas e itens de checklist.
-- Aditiva e idempotente: não altera nem apaga registros existentes
-- (todas as subtarefas atuais ficam com description = null).
alter table public.task_subtasks add column if not exists description text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'task_subtasks_description_length'
      and conrelid = 'public.task_subtasks'::regclass
  ) then
    alter table public.task_subtasks
      add constraint task_subtasks_description_length
      check (description is null or char_length(description) <= 10000);
  end if;
end $$;

comment on column public.task_subtasks.description is
  'Descrição opcional da etapa/item de checklist — exibida recolhida por padrão.';
