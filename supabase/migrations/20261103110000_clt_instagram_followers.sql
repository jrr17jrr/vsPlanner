-- VSPlanner — seguidores do Instagram por empresa (CLT e MKT).
-- ADITIVA e idempotente: só cria a tabela nova; nada existente é alterado.
-- Cada linha é uma contagem num momento (histórico completo). Correção =
-- editar a linha (updated_at registra quando). Sem exclusão pela API.
create table if not exists public.clt_instagram_followers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.clt_companies(id) on delete cascade,
  followers integer not null check (followers >= 0),
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists clt_instagram_followers_company_time on public.clt_instagram_followers (company_id, recorded_at desc);

alter table public.clt_instagram_followers enable row level security;

drop policy if exists "owner can read instagram followers" on public.clt_instagram_followers;
create policy "owner can read instagram followers" on public.clt_instagram_followers
  for select using (user_id = auth.uid());

drop policy if exists "owner can insert instagram followers" on public.clt_instagram_followers;
create policy "owner can insert instagram followers" on public.clt_instagram_followers
  for insert with check (user_id = auth.uid() and exists (select 1 from public.clt_companies c where c.id = company_id and c.user_id = auth.uid()));

drop policy if exists "owner can update instagram followers" on public.clt_instagram_followers;
create policy "owner can update instagram followers" on public.clt_instagram_followers
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.clt_companies c where c.id = company_id and c.user_id = auth.uid()));

grant select, insert, update on public.clt_instagram_followers to authenticated;
