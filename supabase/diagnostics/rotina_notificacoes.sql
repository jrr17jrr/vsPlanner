-- =============================================================================
-- VSPlanner — diagnóstico das notificações da Minha Rotina (SOMENTE LEITURA).
-- Rode no SQL Editor do Supabase. Nada aqui altera dados nem mostra segredos.
-- Horários convertidos para America/Sao_Paulo.
-- =============================================================================

-- 1) As colunas necessárias existem? (migrations 20261102100000 e 20261107100000)
--    Esperado: reminder_offsets, specific_date, task_id e skipped_dates.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'activities'
  and column_name in ('reminder_offsets', 'specific_date', 'task_id', 'skipped_dates')
order by column_name;

-- 2) Atividades com notificação configurada (o que o cron enxerga).
--    weekdays: 0=dom, 1=seg … 6=sáb. reminder_offsets em minutos (0 = no horário).
select a.title, a.weekdays, a.specific_date, to_char(a.start_time, 'HH24:MI') as inicio,
       a.reminder_offsets, a.is_active, a.skipped_dates,
       to_char(a.updated_at at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as editada_em
from public.activities a
where a.reminder_offsets <> '{}'
order by a.start_time;

-- 3) Atividades SEM notificação (se esperava aviso de alguma, edite e marque as opções).
select title, weekdays, to_char(start_time, 'HH24:MI') as inicio, is_active
from public.activities
where reminder_offsets = '{}'
order by start_time;

-- 4) Agendador (pg_cron + pg_net): job ativo, URL e segredo configurados, últimas chamadas.
--    Esperado: job.active = true e last_http[0].status_code = 200.
select public.vsplanner_cron_status();

-- 5) Últimas execuções do cron registradas pela rota (a cada minuto).
select to_char(ran_at at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI:SS') as quando, source, local_time,
       candidates, due, sent, failed, skipped, no_subscription, retried, errors
from public.push_cron_runs
order by ran_at desc
limit 15;

-- 6) Lembretes da Rotina já processados (deduplicação: 1 linha por ocorrência + antecedência).
--    event_key = exec:routine:<atividade>:<data>:<hora>:<antecedência>.
--    status: sent = aceito pelo serviço de push (Apple/Google); failed = nova tentativa
--    automática (até 3); no_subscription = nenhum aparelho inscrito.
select to_char(l.created_at at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as quando,
       a.title, l.event_key, l.status, l.attempts, l.sent_count, l.last_error
from public.push_delivery_log l
left join public.activities a on a.id::text = split_part(l.event_key, ':', 3)
where l.event_key like 'exec:routine:%'
order by l.created_at desc
limit 30;

-- 7) Aparelhos inscritos (sem endpoint completo).
select user_id, split_part(endpoint, '/', 3) as servico, created_at
from public.push_subscriptions
order by created_at desc;
