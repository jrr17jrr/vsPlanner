-- Comparativos opcionais entre campanhas antigas e campanhas atuais.
create table if not exists public.clt_campaign_comparisons (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 company_id uuid not null references public.clt_companies(id) on delete cascade,
 old_campaign_ids uuid[] not null default '{}',
 new_campaign_ids uuid[] not null default '{}',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(user_id,company_id),
 check (cardinality(old_campaign_ids)>0 and cardinality(new_campaign_ids)>0)
);
create index if not exists clt_campaign_comparisons_company_idx on public.clt_campaign_comparisons(company_id);
alter table public.clt_campaign_comparisons enable row level security;
create policy "Users manage own CLT campaign comparisons" on public.clt_campaign_comparisons for all to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);
