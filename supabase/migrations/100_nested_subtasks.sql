-- Enable one nested checklist level for existing subtasks.
alter table public.task_subtasks
  add column if not exists parent_subtask_id uuid references public.task_subtasks(id) on delete cascade;
create index if not exists task_subtasks_parent_subtask_idx
  on public.task_subtasks(parent_subtask_id);
create or replace function public.validate_task_subtask_nesting()
returns trigger language plpgsql as $$
declare parent_row public.task_subtasks%rowtype;
begin
  if new.parent_subtask_id is null then return new; end if;
  if new.id = new.parent_subtask_id then raise exception 'Uma subtarefa não pode ser pai dela mesma'; end if;
  select * into parent_row from public.task_subtasks where id = new.parent_subtask_id;
  if not found or parent_row.parent_subtask_id is not null
     or parent_row.parent_id <> new.parent_id
     or parent_row.parent_type <> new.parent_type
     or parent_row.user_id <> new.user_id then
    raise exception 'Checklist deve pertencer a uma etapa da mesma tarefa';
  end if;
  if exists(select 1 from public.task_subtasks where parent_subtask_id = new.id) then
    raise exception 'Uma etapa com checklist não pode se tornar item de outra etapa';
  end if;
  return new;
end $$;
drop trigger if exists task_subtask_nesting_guard on public.task_subtasks;
create trigger task_subtask_nesting_guard before insert or update of parent_subtask_id on public.task_subtasks
for each row execute function public.validate_task_subtask_nesting();
