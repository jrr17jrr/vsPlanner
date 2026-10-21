create table if not exists public.clt_ad_account_movements (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 company_id uuid not null references public.clt_companies(id) on delete cascade,
 movement_date date not null,
 kind text not null check (kind in ('deposito','credito')),
 amount numeric(14,2) not null check (amount>=0),
 notes text,
 created_at timestamptz not null default now()
);
create index if not exists clt_ad_account_movements_company_date on public.clt_ad_account_movements(company_id,movement_date);
alter table public.clt_ad_account_movements enable row level security;
create policy "owner can read ad movements" on public.clt_ad_account_movements for select using (user_id=auth.uid());
create policy "owner can insert ad movements" on public.clt_ad_account_movements for insert with check (user_id=auth.uid() and exists(select 1 from public.clt_companies c where c.id=company_id and c.user_id=auth.uid()));
create policy "owner can delete ad movements" on public.clt_ad_account_movements for delete using (user_id=auth.uid());
