-- =============================================================================
-- VSPlanner — Fase 1: Fundação do backend (Supabase)
-- Migration: 001_initial_auth_spaces.sql
--
-- Cria: profiles, spaces, space_members, RLS, policies, triggers e funções
-- auxiliares de segurança (is_super_admin, is_space_member, has_space_role).
--
-- COMO EXECUTAR: Supabase Dashboard → SQL Editor → New query → colar este
-- arquivo inteiro → Run. Veja SUPABASE_SETUP.md para o passo a passo
-- completo (criação do projeto, variáveis de ambiente, criação do seu
-- usuário, promoção a super_admin, testes de RLS).
--
-- Este script é seguro para reexecutar: usa `if not exists`, `or replace`
-- e `drop ... if exists` em tudo que cria.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Extensões
-- -----------------------------------------------------------------------------
create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 2. Tabelas
-- -----------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  avatar_url text,
  phone text,
  system_role text not null default 'user' check (system_role in ('super_admin', 'user')),
  status text not null default 'active' check (status in ('active', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Perfil de cada usuário autenticado. system_role é a permissão GLOBAL do '
  'sistema — não confundir com o role dentro de um space (space_members.role).';
comment on column public.profiles.system_role is 'Permissão global: super_admin (acessa /dev) ou user.';

create table if not exists public.spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  type text not null check (type in ('personal', 'business', 'tiktok', 'other')),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.spaces is
  'Espaços (Pessoal, Visionário Dev, TikTok, ...). Um usuário pode pertencer a vários.';

create table if not exists public.space_members (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member', 'viewer')),
  created_at timestamptz not null default now(),
  unique (space_id, user_id)
);

comment on table public.space_members is
  'Vínculo usuário <-> space, com o role DENTRO daquele space (diferente do system_role global).';

-- -----------------------------------------------------------------------------
-- 3. Índices
-- -----------------------------------------------------------------------------
create index if not exists idx_spaces_owner_id on public.spaces (owner_id);
create index if not exists idx_space_members_space_id on public.space_members (space_id);
create index if not exists idx_space_members_user_id on public.space_members (user_id);

-- -----------------------------------------------------------------------------
-- 4. updated_at automático
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_updated_at on public.profiles;
create trigger set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.spaces;
create trigger set_updated_at
  before update on public.spaces
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 5. Funções auxiliares de segurança (SECURITY DEFINER, search_path fixo)
--
-- Usadas dentro das policies de RLS abaixo. SECURITY DEFINER é necessário
-- para evitar recursão infinita: uma policy de space_members que consultasse
-- a própria space_members via uma subquery normal reavaliaria a mesma policy
-- em loop. Rodando a consulta dentro de uma função SECURITY DEFINER (dona =
-- quem aplicou a migration, que não sofre RLS por ser owner da tabela), o
-- loop é evitado. search_path é fixado explicitamente (todas as referências
-- também são qualificadas com "public.") para impedir sequestro de
-- search_path. Funções STABLE (não alteram dados) e mínimas.
-- -----------------------------------------------------------------------------

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and system_role = 'super_admin'
  );
$$;

comment on function public.is_super_admin() is
  'true se o usuário autenticado tem system_role = super_admin. Nunca confiar '
  'apenas na UI para essa checagem — o front também deve validar, mas quem '
  'garante de verdade é o RLS usando esta função.';

create or replace function public.is_space_member(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.space_members
    where space_id = p_space_id and user_id = auth.uid()
  );
$$;

create or replace function public.has_space_role(p_space_id uuid, p_min_role text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_rank int;
  v_min_rank int;
begin
  select role into v_role
  from public.space_members
  where space_id = p_space_id and user_id = auth.uid();

  if v_role is null then
    return false;
  end if;

  v_rank := array_position(array['viewer', 'member', 'admin', 'owner'], v_role);
  v_min_rank := array_position(array['viewer', 'member', 'admin', 'owner'], p_min_role);

  return v_rank is not null and v_min_rank is not null and v_rank >= v_min_rank;
end;
$$;

comment on function public.has_space_role(uuid, text) is
  'true se o usuário autenticado tem, no space informado, um role >= p_min_role '
  '(ordem: viewer < member < admin < owner).';

-- -----------------------------------------------------------------------------
-- 6. Criação automática de profile (+ space pessoal) ao registrar usuário
--
-- Dispara em auth.users (insert). SECURITY DEFINER porque, nesse momento,
-- as policies normais de INSERT de profiles/spaces/space_members não
-- liberariam essa gravação. Função mínima, valida só o necessário,
-- search_path fixo. NUNCA promove ninguém a super_admin automaticamente.
-- -----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
begin
  insert into public.profiles (id, name, system_role, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    'user',
    'active'
  )
  on conflict (id) do nothing;

  insert into public.spaces (name, slug, type, owner_id)
  values ('Pessoal', 'pessoal-' || left(new.id::text, 8), 'personal', new.id)
  returning id into v_space_id;

  insert into public.space_members (space_id, user_id, role)
  values (v_space_id, new.id, 'owner');

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Ao criar um usuário em auth.users: cria profile (system_role=user, '
  'status=active) e um space Pessoal com o usuário como owner.';

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 7. Trava contra escalada de privilégio em profiles
--
-- A policy de UPDATE (seção 8) permite que o próprio usuário edite seu
-- profile (nome, avatar, telefone). Sem esta trigger, nada impediria a
-- mesma requisição de também mudar system_role/status. Bloqueado aqui no
-- banco — não só escondido na UI — para quem não for super_admin.
--
-- IMPORTANTE: a checagem só se aplica quando auth.uid() não é nulo, ou seja,
-- quando a alteração vem de uma requisição autenticada via API (PostgREST).
-- Quando auth.uid() é nulo (SQL rodado diretamente no SQL Editor, contexto
-- já totalmente confiável — é assim que a primeira promoção a super_admin é
-- feita, ver SUPABASE_SETUP.md), a trigger não bloqueia. Isso é seguro:
-- RLS não bloqueia o dono das tabelas, mas TRIGGERS sempre disparam
-- independentemente disso — sem esse `auth.uid() is not null`, nem o
-- SQL Editor conseguiria promover o primeiro super_admin.
-- -----------------------------------------------------------------------------

create or replace function public.prevent_profile_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.system_role is distinct from old.system_role or new.status is distinct from old.status)
     and auth.uid() is not null
     and not public.is_super_admin() then
    raise exception 'Apenas super_admin pode alterar system_role ou status.';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_profile_privilege_escalation on public.profiles;
create trigger prevent_profile_privilege_escalation
  before update on public.profiles
  for each row execute function public.prevent_profile_privilege_escalation();

-- -----------------------------------------------------------------------------
-- 8. Row Level Security
-- -----------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.spaces enable row level security;
alter table public.space_members enable row level security;

-- profiles -------------------------------------------------------------------
drop policy if exists profiles_select_own_or_admin on public.profiles;
create policy profiles_select_own_or_admin
  on public.profiles for select
  using (id = auth.uid() or public.is_super_admin());

drop policy if exists profiles_update_own_or_admin on public.profiles;
create policy profiles_update_own_or_admin
  on public.profiles for update
  using (id = auth.uid() or public.is_super_admin())
  with check (id = auth.uid() or public.is_super_admin());

-- Sem policy de INSERT/DELETE em profiles: a criação é só via trigger
-- (handle_new_user, SECURITY DEFINER) e a exclusão acompanha auth.users
-- (on delete cascade). Isso é intencional — ninguém insere/apaga profile
-- diretamente pela API.

-- spaces -----------------------------------------------------------------
-- (owner_id = auth.uid() cobre o caso em que o space acabou de ser criado
-- e o usuário ainda não tem linha em space_members — sem isso, o próprio
-- dono não conseguiria ver o space que acabou de criar.)
drop policy if exists spaces_select_owner_member_or_admin on public.spaces;
create policy spaces_select_owner_member_or_admin
  on public.spaces for select
  using (owner_id = auth.uid() or public.is_space_member(id) or public.is_super_admin());

drop policy if exists spaces_insert_own on public.spaces;
create policy spaces_insert_own
  on public.spaces for insert
  with check (owner_id = auth.uid());

drop policy if exists spaces_update_owner_or_admin on public.spaces;
create policy spaces_update_owner_or_admin
  on public.spaces for update
  using (owner_id = auth.uid() or public.is_super_admin())
  with check (owner_id = auth.uid() or public.is_super_admin());

drop policy if exists spaces_delete_owner_or_admin on public.spaces;
create policy spaces_delete_owner_or_admin
  on public.spaces for delete
  using (owner_id = auth.uid() or public.is_super_admin());

-- space_members ------------------------------------------------------
drop policy if exists space_members_select_member_or_admin on public.space_members;
create policy space_members_select_member_or_admin
  on public.space_members for select
  using (public.is_space_member(space_id) or public.is_super_admin());

-- Insert liberado para: admin/owner do space (gerenciando membros), o
-- próprio dono do space se inserindo como 'owner' (bootstrap — primeira
-- linha de membership daquele space), ou super_admin.
drop policy if exists space_members_insert on public.space_members;
create policy space_members_insert
  on public.space_members for insert
  with check (
    public.has_space_role(space_id, 'admin')
    or public.is_super_admin()
    or (
      role = 'owner'
      and exists (select 1 from public.spaces s where s.id = space_id and s.owner_id = auth.uid())
    )
  );

drop policy if exists space_members_update on public.space_members;
create policy space_members_update
  on public.space_members for update
  using (public.has_space_role(space_id, 'admin') or public.is_super_admin())
  with check (public.has_space_role(space_id, 'admin') or public.is_super_admin());

-- Delete liberado para admin/owner do space, super_admin, ou o próprio
-- usuário saindo do space (removendo a própria linha).
drop policy if exists space_members_delete on public.space_members;
create policy space_members_delete
  on public.space_members for delete
  using (
    public.has_space_role(space_id, 'admin')
    or public.is_super_admin()
    or user_id = auth.uid()
  );

-- -----------------------------------------------------------------------------
-- 9. Grants
--
-- RLS restringe LINHAS; ainda é preciso conceder o privilégio de tabela em
-- si para o role authenticated. O Supabase já faz isso por padrão para
-- tabelas em public, mas deixamos explícito para a migration não depender
-- de configuração implícita do projeto.
-- -----------------------------------------------------------------------------

grant usage on schema public to authenticated;

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.spaces to authenticated;
grant select, insert, update, delete on public.space_members to authenticated;

grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.is_space_member(uuid) to authenticated;
grant execute on function public.has_space_role(uuid, text) to authenticated;

-- =============================================================================
-- Fim da migration 001.
--
-- Próximos passos: SUPABASE_SETUP.md (criar seu usuário, promover para
-- super_admin via SQL controlado — NUNCA automático — e testar RLS).
-- =============================================================================
