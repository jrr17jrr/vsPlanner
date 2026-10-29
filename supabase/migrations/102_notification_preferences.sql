alter table public.profiles add column if not exists notification_preferences jsonb not null default '{"tasks":true,"routine":true,"meetings":true,"finance":true,"clt":true}'::jsonb;
