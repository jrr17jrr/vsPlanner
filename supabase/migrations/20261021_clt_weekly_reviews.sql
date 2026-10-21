create table if not exists public.clt_weekly_reviews (
 user_id uuid not null references auth.users(id) on delete cascade,
 company_id uuid not null references public.clt_companies(id) on delete cascade,
 weekday integer not null check (weekday between 0 and 6),
 last_reviewed_on date,
 updated_at timestamptz not null default now(),
 primary key(user_id,company_id)
);
alter table public.clt_weekly_reviews enable row level security;
create policy "Manage own CLT weekly reviews" on public.clt_weekly_reviews for all to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);
