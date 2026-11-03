-- =============================================================================
-- VSPlanner — agendamento automático dos lembretes push (Supabase Cron).
--
-- Causa do problema: o job do pg_cron nunca foi registrado (cron.job = []).
-- Sem ele, só o cron da Vercel chamava /api/cron/task-reminders, 1x por dia
-- (12:00 UTC, limite do plano Hobby), e a rota só olha os últimos 15 min —
-- quase nenhum lembrete de execução/prazo/atraso caía nessa janela.
--
-- O que esta migration faz (ADITIVA, idempotente, sem tocar em dados):
--   1. habilita pg_cron e pg_net;
--   2. cria public.vsplanner_dispatch_task_reminders(): lê URL e segredo do
--      Supabase Vault NA HORA e chama a rota via pg_net. Sem segredos no
--      Vault, não faz nada (só um aviso no log) — nunca quebra;
--   3. registra o job 'vsplanner-task-reminders' a cada minuto.
--
-- Segredos NUNCA ficam no repositório. Depois de aplicar, rode UMA vez no
-- SQL Editor (valores reais no lugar de <>; veja supabase/cron/task_reminders.sql):
--   select vault.create_secret('https://<domínio de produção>', 'vsplanner_app_url');
--   select vault.create_secret('<mesmo valor do CRON_SECRET da Vercel>', 'vsplanner_cron_secret');
-- =============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.vsplanner_dispatch_task_reminders()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_url text;
  cron_secret text;
begin
  select rtrim(decrypted_secret, '/') into app_url
    from vault.decrypted_secrets where name = 'vsplanner_app_url' limit 1;
  select decrypted_secret into cron_secret
    from vault.decrypted_secrets where name = 'vsplanner_cron_secret' limit 1;

  if coalesce(app_url, '') = '' or coalesce(cron_secret, '') = '' then
    raise warning 'vsplanner-task-reminders: configure vsplanner_app_url e vsplanner_cron_secret no Vault';
    return null;
  end if;

  return net.http_get(
    url := app_url || '/api/cron/task-reminders',
    headers := jsonb_build_object('Authorization', 'Bearer ' || cron_secret),
    timeout_milliseconds := 25000
  );
end;
$$;

-- Só o próprio banco (pg_cron, como postgres) executa: nada exposto à API.
revoke all on function public.vsplanner_dispatch_task_reminders() from public;
revoke all on function public.vsplanner_dispatch_task_reminders() from anon, authenticated;

-- Re-agendar com o mesmo nome substitui o job existente (idempotente).
select cron.schedule(
  'vsplanner-task-reminders',
  '* * * * *',
  'select public.vsplanner_dispatch_task_reminders()'
);
