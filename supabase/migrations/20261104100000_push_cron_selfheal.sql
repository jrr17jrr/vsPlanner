-- =============================================================================
-- VSPlanner — lembretes push: agendamento que se configura sozinho + diagnóstico.
--
-- Causa do problema: o job do pg_cron depende de dois segredos no Vault
-- (vsplanner_app_url e vsplanner_cron_secret) que eram um passo MANUAL. Sem
-- eles, public.vsplanner_dispatch_task_reminders() não chama nada; só o cron
-- diário da Vercel (09:00 em São Paulo, janela de 15 min) chamava a rota.
-- Por isso prazo/atraso (enviados às 09:00) chegavam e lembretes de horário
-- (09:19, 10:23...) nunca saíam. O sino não depende do cron (é calculado na
-- tela), então continuava mostrando tudo.
--
-- Esta migration (ADITIVA e idempotente; não altera dados existentes):
--   1. garante pg_cron, pg_net, a função de disparo e o job a cada minuto;
--   2. vsplanner_configure_cron(url, segredo): o próprio servidor (service
--      role, só em produção) grava/atualiza URL e segredo no Vault e reativa o
--      job — sem passo manual e sem segredo no repositório;
--   3. vsplanner_cron_check_token(token): a rota confere o token do pg_cron
--      sem nunca ler o segredo;
--   4. vsplanner_cron_status(): saúde do agendador SEM valores de segredos;
--   5. push_cron_runs: registro de cada execução (encontrados, enviados ao
--      serviço de push, falhas e motivos). Só a service role acessa.
-- Nenhuma dessas funções pode ser chamada por anon/authenticated.
-- =============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Disparo (mesma função de 20261103100000) + cabeçalho de origem para o diagnóstico.
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
    headers := jsonb_build_object('Authorization', 'Bearer ' || cron_secret, 'x-vsplanner-source', 'supabase-cron'),
    timeout_milliseconds := 25000
  );
end;
$$;

create or replace function public.vsplanner_configure_cron(p_url text, p_secret text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text := rtrim(btrim(coalesce(p_url, '')), '/');
  v_id uuid;
  v_old text;
  v_url_state text := 'ok';
  v_secret_state text := 'ok';
  v_job text := 'ok';
  v_command constant text := 'select public.vsplanner_dispatch_task_reminders()';
begin
  if v_url !~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?$' then
    raise exception 'vsplanner_configure_cron: URL inválida (use https://dominio, sem caminho)';
  end if;

  select id, decrypted_secret into v_id, v_old from vault.decrypted_secrets where name = 'vsplanner_app_url' limit 1;
  if v_id is null then
    perform vault.create_secret(v_url, 'vsplanner_app_url'); v_url_state := 'criado';
  elsif v_old is distinct from v_url then
    perform vault.update_secret(v_id, v_url); v_url_state := 'atualizado';
  end if;

  v_id := null; v_old := null;
  select id, decrypted_secret into v_id, v_old from vault.decrypted_secrets where name = 'vsplanner_cron_secret' limit 1;
  if coalesce(p_secret, '') <> '' then
    if length(p_secret) < 16 then raise exception 'vsplanner_configure_cron: segredo curto demais'; end if;
    if v_id is null then
      perform vault.create_secret(p_secret, 'vsplanner_cron_secret'); v_secret_state := 'criado';
    elsif v_old is distinct from p_secret then
      perform vault.update_secret(v_id, p_secret); v_secret_state := 'atualizado';
    end if;
  elsif v_id is null then
    -- Sem CRON_SECRET na Vercel: gera um segredo só do banco (a rota confere via vsplanner_cron_check_token).
    perform vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'vsplanner_cron_secret');
    v_secret_state := 'gerado';
  end if;

  if not exists (select 1 from cron.job where jobname = 'vsplanner-task-reminders' and active and schedule = '* * * * *' and command = v_command) then
    if exists (select 1 from cron.job where jobname = 'vsplanner-task-reminders') then
      perform cron.unschedule('vsplanner-task-reminders');
    end if;
    perform cron.schedule('vsplanner-task-reminders', '* * * * *', v_command);
    v_job := 'agendado';
  end if;

  return jsonb_build_object('url', v_url_state, 'secret', v_secret_state, 'job', v_job);
end;
$$;

create or replace function public.vsplanner_cron_check_token(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(length(p_token) >= 16, false) and exists (
    select 1 from vault.decrypted_secrets where name = 'vsplanner_cron_secret' and decrypted_secret = p_token
  );
$$;

create or replace function public.vsplanner_cron_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'job', (select jsonb_build_object('active', j.active, 'schedule', j.schedule) from cron.job j where j.jobname = 'vsplanner-task-reminders' limit 1),
    'url_configured', exists (select 1 from vault.decrypted_secrets where name = 'vsplanner_app_url' and coalesce(decrypted_secret, '') <> ''),
    'secret_configured', exists (select 1 from vault.decrypted_secrets where name = 'vsplanner_cron_secret' and coalesce(decrypted_secret, '') <> ''),
    -- Só o domínio (não é segredo): confirma para onde o pg_cron está chamando.
    'app_host', (select substring(decrypted_secret from '^https://([^/]+)') from vault.decrypted_secrets where name = 'vsplanner_app_url' limit 1),
    'last_runs', coalesce((
      select jsonb_agg(r order by r.start_time desc) from (
        select d.status, d.start_time, left(d.return_message, 200) as message
        from cron.job_run_details d
        where d.jobid = (select jobid from cron.job where jobname = 'vsplanner-task-reminders' limit 1)
        order by d.start_time desc limit 5
      ) r), '[]'::jsonb),
    'last_http', coalesce((
      select jsonb_agg(h order by h.created desc) from (
        select x.status_code, x.created, x.timed_out, left(x.error_msg, 200) as error
        from net._http_response x order by x.created desc limit 5
      ) h), '[]'::jsonb)
  );
$$;

revoke all on function public.vsplanner_dispatch_task_reminders() from public, anon, authenticated;
revoke all on function public.vsplanner_configure_cron(text, text) from public, anon, authenticated;
revoke all on function public.vsplanner_cron_check_token(text) from public, anon, authenticated;
revoke all on function public.vsplanner_cron_status() from public, anon, authenticated;
grant execute on function public.vsplanner_configure_cron(text, text) to service_role;
grant execute on function public.vsplanner_cron_check_token(text) to service_role;
grant execute on function public.vsplanner_cron_status() to service_role;

-- Registro de cada execução da rota (heartbeat + contagens + motivos de erro).
create table if not exists public.push_cron_runs (
  id bigserial primary key,
  ran_at timestamptz not null default now(),
  source text not null default 'desconhecido',
  local_time text,
  candidates integer not null default 0,
  due integer not null default 0,
  sent integer not null default 0,
  failed integer not null default 0,
  skipped integer not null default 0,
  no_subscription integer not null default 0,
  retried integer not null default 0,
  duration_ms integer,
  errors jsonb not null default '[]'::jsonb
);
create index if not exists push_cron_runs_ran_at_idx on public.push_cron_runs (ran_at desc);
alter table public.push_cron_runs enable row level security;
-- Sem policies: só a service role (rota do servidor) lê e grava.
revoke all on public.push_cron_runs from anon, authenticated;

-- Job a cada minuto (idempotente). Os segredos chegam pelo próprio servidor.
select cron.schedule('vsplanner-task-reminders', '* * * * *', 'select public.vsplanner_dispatch_task_reminders()');
