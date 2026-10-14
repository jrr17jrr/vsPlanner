-- VSPlanner CLT traffic management: additive migration; preserves existing rows.
create table if not exists public.clt_monthly_budgets (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 company_id uuid not null references public.clt_companies(id) on delete cascade,
 month_key date not null,
 budget_amount numeric(12,2) not null default 0 check (budget_amount >= 0),
 reserve_target numeric(12,2) not null default 0 check (reserve_target >= 0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (user_id, company_id, month_key)
);
alter table public.clt_monthly_budgets enable row level security;
create policy "Own monthly budgets" on public.clt_monthly_budgets for all to authenticated using (user_id=auth.uid() and exists(select 1 from public.clt_companies c where c.id=company_id and c.user_id=auth.uid())) with check (user_id=auth.uid() and exists(select 1 from public.clt_companies c where c.id=company_id and c.user_id=auth.uid()));
alter table public.clt_campaigns add column if not exists budget_type text not null default 'total' check (budget_type in ('daily','total'));
alter table public.clt_campaigns add column if not exists planned_amount numeric(12,2) not null default 0 check (planned_amount>=0);
alter table public.clt_campaigns add column if not exists daily_budget numeric(12,2) check (daily_budget>=0);
alter table public.clt_campaigns add column if not exists campaign_status text not null default 'finalizada' check (campaign_status in ('planejada','ativa','pausada','finalizada'));
alter table public.clt_campaigns add column if not exists manager_url text;
alter table public.clt_campaigns add column if not exists appointments integer not null default 0 check (appointments>=0);
alter table public.clt_campaigns add column if not exists impressions integer not null default 0 check (impressions>=0);
alter table public.clt_campaigns add column if not exists reach integer not null default 0 check (reach>=0);
alter table public.clt_campaigns add column if not exists profile_visits integer not null default 0 check (profile_visits>=0);
alter table public.clt_campaigns add column if not exists link_clicks integer not null default 0 check (link_clicks>=0);
alter table public.clt_campaigns add column if not exists engagements integer not null default 0 check (engagements>=0);
alter table public.clt_campaigns add column if not exists thruplays integer not null default 0 check (thruplays>=0);
alter table public.clt_campaigns add column if not exists leads integer not null default 0 check (leads>=0);
create table if not exists public.clt_ad_sets (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 campaign_id uuid not null references public.clt_campaigns(id) on delete cascade,
 name text not null, audience text, location text, budget_amount numeric(12,2) not null default 0 check (budget_amount>=0),
 notes text, created_at timestamptz not null default now()
);
alter table public.clt_ad_sets enable row level security;
create policy "Own ad sets" on public.clt_ad_sets for all to authenticated using (user_id=auth.uid() and exists(select 1 from public.clt_campaigns c where c.id=campaign_id and c.user_id=auth.uid())) with check (user_id=auth.uid() and exists(select 1 from public.clt_campaigns c where c.id=campaign_id and c.user_id=auth.uid()));
create table if not exists public.clt_ad_creatives (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 ad_set_id uuid not null references public.clt_ad_sets(id) on delete cascade,
 name text not null, format text not null default 'imagem', asset_url text, notes text, created_at timestamptz not null default now()
);
alter table public.clt_ad_creatives enable row level security;
create policy "Own creatives" on public.clt_ad_creatives for all to authenticated using (user_id=auth.uid() and exists(select 1 from public.clt_ad_sets a where a.id=ad_set_id and a.user_id=auth.uid())) with check (user_id=auth.uid() and exists(select 1 from public.clt_ad_sets a where a.id=ad_set_id and a.user_id=auth.uid()));
create table if not exists public.clt_campaign_result_entries (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 campaign_id uuid not null references public.clt_campaigns(id) on delete cascade,
 entry_date date not null,
 spent_amount numeric(12,2) not null default 0 check (spent_amount>=0),
 messages integer not null default 0, sales integer not null default 0, views integer not null default 0,
 appointments integer not null default 0, impressions integer not null default 0, reach integer not null default 0,
 profile_visits integer not null default 0, link_clicks integer not null default 0, engagements integer not null default 0,
 thruplays integer not null default 0, leads integer not null default 0,
 generated_revenue numeric(12,2) not null default 0, notes text, created_at timestamptz not null default now(),
 unique (campaign_id,entry_date)
);
alter table public.clt_campaign_result_entries enable row level security;
create policy "Own result entries" on public.clt_campaign_result_entries for all to authenticated using (user_id=auth.uid() and exists(select 1 from public.clt_campaigns c where c.id=campaign_id and c.user_id=auth.uid())) with check (user_id=auth.uid() and exists(select 1 from public.clt_campaigns c where c.id=campaign_id and c.user_id=auth.uid()));
create index if not exists clt_campaign_result_entries_date_idx on public.clt_campaign_result_entries(entry_date,campaign_id);
create index if not exists clt_monthly_budgets_company_month_idx on public.clt_monthly_budgets(company_id,month_key);
