-- =============================================================================
-- VSPlanner — Supabase Cron para lembretes de tarefas (rodar UMA vez no
-- SQL Editor do Supabase, manualmente). NÃO é migration: depende de
-- segredos que ficam só no Vault, nunca no repositório.
--
-- Por que: o cron da Vercel (vercel.json) roda só 1x/dia no plano Hobby, e
-- a rota olha os últimos 15 min — quase nenhum lembrete saía. Aqui o
-- pg_cron chama a rota A CADA MINUTO via pg_net. O cron só dispara a
-- verificação; quem entrega a notificação é o Web Push da rota.
--
-- Pré-requisitos:
--   1. Database → Extensions: habilitar `pg_cron` e `pg_net`.
--   2. Na Vercel, a variável CRON_SECRET já existe (é a mesma usada pelo
--      cron da Vercel). Copie o MESMO valor no passo 3.
--   3. Guardar URL e segredo no Vault (troque os valores entre <>):
--
--      select vault.create_secret('https://<seu-dominio>', 'vsplanner_app_url');
--      select vault.create_secret('<valor do CRON_SECRET>', 'vsplanner_cron_secret');
--
--   4. Rodar o bloco abaixo.
-- =============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Re-agendar com o mesmo nome substitui o job existente (idempotente).
select cron.schedule(
  'vsplanner-task-reminders',
  '* * * * *',
  $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'vsplanner_app_url') || '/api/cron/task-reminders',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'vsplanner_cron_secret')
    ),
    timeout_milliseconds := 25000
  );
  $$
);

-- -----------------------------------------------------------------------------
-- Diagnóstico (somente leitura)
-- -----------------------------------------------------------------------------
-- Job cadastrado:
--   select jobid, jobname, schedule, active from cron.job where jobname = 'vsplanner-task-reminders';
-- Últimas execuções do cron (o job rodou?):
--   select status, return_message, start_time from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'vsplanner-task-reminders')
--   order by start_time desc limit 20;
-- Respostas HTTP da rota (a rota respondeu 200? quantos enviados?):
--   select status_code, content::text, created from net._http_response order by created desc limit 20;
-- Entregas por lembrete (o push saiu? erro?):
--   select event_key, status, attempts, sent_count, last_error, created_at, sent_at
--   from public.push_delivery_log order by created_at desc limit 50;
--
-- Pausar / remover:
--   select cron.unschedule('vsplanner-task-reminders');
