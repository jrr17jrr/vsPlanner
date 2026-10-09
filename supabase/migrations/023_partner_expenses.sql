-- VSPlanner: partner expenses tracking
alter table public.financial_payments add column if not exists payer_label text;
