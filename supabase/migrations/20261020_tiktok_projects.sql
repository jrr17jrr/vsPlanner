-- Projetos financeiros independentes do TikTok (Sofia IA / TikTok Real - Maria).
-- Execute uma vez no SQL Editor do Supabase antes de usar a nova tela.
create table if not exists public.tiktok_project_entries (
 id uuid primary key default gen_random_uuid(),
 space_id uuid not null references public.spaces(id) on delete cascade,
 user_id uuid not null references auth.users(id),
 project text not null check (project in ('sofia','maria')),
 entry_date date not null default current_date,
 description text not null,
 kind text not null check (kind in ('entrada','saida')),
 amount numeric(12,2) not null check (amount > 0),
 created_at timestamptz not null default now()
);
create index if not exists tiktok_project_entries_space_project_date_idx on public.tiktok_project_entries(space_id,project,entry_date desc);
alter table public.tiktok_project_entries enable row level security;
drop policy if exists tiktok_entries_read on public.tiktok_project_entries;
create policy tiktok_entries_read on public.tiktok_project_entries for select to authenticated
 using (public.has_module_permission(space_id,'financeiro','view'));
drop policy if exists tiktok_entries_insert on public.tiktok_project_entries;
create policy tiktok_entries_insert on public.tiktok_project_entries for insert to authenticated
 with check (user_id=auth.uid() and public.has_module_permission(space_id,'financeiro','create'));
drop policy if exists tiktok_entries_delete on public.tiktok_project_entries;
create policy tiktok_entries_delete on public.tiktok_project_entries for delete to authenticated
 using (user_id=auth.uid() and public.has_module_permission(space_id,'financeiro','delete'));
