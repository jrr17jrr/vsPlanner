-- VSPlanner — diagnóstico e re-tentativa de lembretes push.
-- ADITIVA: só adiciona colunas/índice; linhas existentes continuam válidas
-- (status 'sent' por padrão = comportamento antigo, sem reenvio).
alter table public.push_delivery_log add column if not exists status text not null default 'sent';
alter table public.push_delivery_log add column if not exists attempts integer not null default 1;
alter table public.push_delivery_log add column if not exists sent_count integer not null default 0;
alter table public.push_delivery_log add column if not exists last_error text;
alter table public.push_delivery_log add column if not exists sent_at timestamptz;
alter table public.push_delivery_log add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'push_delivery_log_status_check') then
    alter table public.push_delivery_log add constraint push_delivery_log_status_check
      check (status in ('sending', 'sent', 'failed', 'no_subscription'));
  end if;
end $$;

create index if not exists push_delivery_log_status_idx on public.push_delivery_log (status, created_at desc);
