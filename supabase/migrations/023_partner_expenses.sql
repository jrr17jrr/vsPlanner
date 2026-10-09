-- Identificacao de pagamentos por socio (apenas Visionario Dev).
alter table public.financial_payments add column if not exists payer_label text;
alter table public.financial_payments alter column account_id drop not null;
alter table public.financial_payments drop constraint if exists financial_payments_payer_label_check;
alter table public.financial_payments add constraint financial_payments_payer_label_check
  check (payer_label is null or payer_label in ('junior', 'guilherme', 'empresa'));
create index if not exists idx_financial_payments_partner on public.financial_payments (space_id, payer_label, payment_date);
