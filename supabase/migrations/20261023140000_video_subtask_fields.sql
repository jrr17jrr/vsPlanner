-- Campos de produção audiovisual nas subtarefas, opcionais para todos os outros módulos.
alter table public.task_subtasks add column if not exists script text;
alter table public.task_subtasks add column if not exists reference_url text;
alter table public.task_subtasks add column if not exists production_notes text;
alter table public.task_subtasks add column if not exists production_status text not null default 'roteiro';
alter table public.task_subtasks add constraint task_subtasks_production_status_check check (production_status in ('roteiro','gravacao','edicao','finalizado'));
