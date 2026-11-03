-- =============================================================================
-- VSPlanner — configurar o agendador de lembretes em PRODUÇÃO (rodar 1 vez).
-- NÃO é migration. Domínio confirmado em 04/11/2026: https://vs-planner.vercel.app
-- (a rota /api/cron/task-reminders responde 401 sem token, sem redirecionamento).
--
-- ORDEM (importante):
--   1. Publicar o código (commit 8af463a ou posterior) — a rota nova aceita o
--      segredo do Vault. Com o código antigo, só o CRON_SECRET da Vercel vale.
--   2. Rodar a migration 20261104100000_push_cron_selfheal.sql.
--   3. Rodar o bloco abaixo.
-- =============================================================================

-- Grava a URL e um segredo gerado NO BANCO (nenhum segredo neste arquivo) e
-- garante o job a cada minuto. Se a Vercel tiver CRON_SECRET, o próprio app
-- troca este segredo pelo dele na primeira chamada (rota, "Enviar teste" ou
-- "Ativar notificações") — os dois lados ficam sempre iguais.
select public.vsplanner_configure_cron('https://vs-planner.vercel.app', null);

-- Conferência (sem mostrar segredos). Espere 1–2 minutos:
select public.vsplanner_cron_status();
--   esperado: job.active = true, url_configured = true, secret_configured = true,
--   app_host = "vs-planner.vercel.app", last_http[0].status_code = 200.
--
-- Se last_http mostrar 401: o código publicado ainda é o antigo (passo 1).
-- Execuções registradas pela rota:
--   select ran_at, source, local_time, due, sent, failed, no_subscription, errors
--   from public.push_cron_runs order by ran_at desc limit 10;
