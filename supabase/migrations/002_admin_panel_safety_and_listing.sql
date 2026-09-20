-- =============================================================================
-- VSPlanner — Fase 3: Painel Dev real (administração de usuários e spaces)
-- Migration: 002_admin_panel_safety_and_listing.sql
--
-- NÃO altera nada da migration 001 (tabelas, policies e funções antigas
-- continuam exatamente como estão). Este arquivo só ADICIONA:
--
--   1. `admin_list_users()` — função para o Painel Dev listar usuários reais
--      com e-mail e último acesso (dados que só existem em `auth.users`,
--      inacessível diretamente pelo client mesmo com RLS).
--   2. Trigger que impede remover/rebaixar o ÚLTIMO `owner` de um space
--      (ou o dono "canônico" de `spaces.owner_id`), evitando um space órfão.
--   3. Trigger que impede remover/bloquear o ÚLTIMO `super_admin` ativo do
--      sistema, evitando ficar sem nenhuma conta administrativa.
--
-- Este script é seguro para reexecutar: usa `create or replace` e
-- `drop trigger/function if exists` em tudo que cria.
--
-- COMO EXECUTAR: Supabase Dashboard → SQL Editor → New query → colar este
-- arquivo inteiro → Run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Listagem administrativa de usuários (com e-mail e último acesso)
--
-- `profiles` não guarda e-mail nem `last_sign_in_at` — isso vive em
-- `auth.users`, schema que o PostgREST não expõe e que o client não
-- consegue ler mesmo sendo super_admin (RLS só existe em `public`). Em vez
-- de usar a Service Role no browser (proibido) ou no server para uma
-- simples listagem, expomos só os campos necessários via uma função
-- SECURITY DEFINER: ela roda com o dono da função (que tem acesso a
-- `auth.users`), mas SÓ retorna algo se quem chamou for super_admin —
-- reforçado dentro da própria função, não apenas pelo `grant execute`.
-- -----------------------------------------------------------------------------

create or replace function public.admin_list_users()
returns table (
  id uuid,
  name text,
  avatar_url text,
  phone text,
  system_role text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  email text,
  last_sign_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Acesso negado: apenas super_admin pode listar usuários.';
  end if;

  return query
    select
      p.id, p.name, p.avatar_url, p.phone, p.system_role, p.status,
      p.created_at, p.updated_at,
      u.email::text, u.last_sign_in_at
    from public.profiles p
    join auth.users u on u.id = p.id
    order by p.created_at asc;
end;
$$;

comment on function public.admin_list_users() is
  'Lista todos os usuários (profiles + email/last_sign_in_at de auth.users). '
  'Só retorna algo se o chamador for super_admin — checado dentro da função, '
  'não apenas pelo grant. Usada exclusivamente pelo Painel Dev.';

grant execute on function public.admin_list_users() to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Nunca deixar um space sem nenhum owner
--
-- Duas situações a evitar:
--   a) remover ou rebaixar a membership do usuário que é `spaces.owner_id`
--      (o "dono canônico" do space, coluna separada de `space_members`);
--   b) remover ou rebaixar a ÚLTIMA linha com role = 'owner' em
--      `space_members` (caso o space já tenha sido compartilhado com mais
--      de um owner).
-- -----------------------------------------------------------------------------

create or replace function public.prevent_last_owner_removal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid := coalesce(old.space_id, new.space_id);
  v_canonical_owner_id uuid;
  v_remaining_owners int;
  v_is_removal_or_demotion boolean :=
    TG_OP = 'DELETE' or (TG_OP = 'UPDATE' and new.role is distinct from 'owner');
begin
  if not v_is_removal_or_demotion then
    return new;
  end if;

  select owner_id into v_canonical_owner_id
  from public.spaces
  where id = v_space_id;

  if old.user_id = v_canonical_owner_id then
    raise exception 'Não é possível remover ou rebaixar o proprietário original do espaço (spaces.owner_id). Transfira a propriedade antes.';
  end if;

  if old.role = 'owner' then
    select count(*) into v_remaining_owners
    from public.space_members
    where space_id = v_space_id and role = 'owner' and id <> old.id;

    if v_remaining_owners = 0 then
      raise exception 'Não é possível remover ou rebaixar o último owner do espaço.';
    end if;
  end if;

  if TG_OP = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

comment on function public.prevent_last_owner_removal() is
  'Bloqueia DELETE/UPDATE em space_members que deixaria um space sem '
  'nenhum owner, ou que removeria a membership do owner_id canônico.';

drop trigger if exists prevent_last_owner_removal on public.space_members;
create trigger prevent_last_owner_removal
  before update or delete on public.space_members
  for each row execute function public.prevent_last_owner_removal();

-- -----------------------------------------------------------------------------
-- 3. Nunca deixar o sistema sem nenhum super_admin ativo
--
-- Bloqueia rebaixar system_role ou bloquear status de um profile quando
-- ele é o ÚLTIMO super_admin com status = 'active'. Complementa (não
-- substitui) a trigger `prevent_profile_privilege_escalation` da migration
-- 001, que já impede um usuário comum de se autopromover.
-- -----------------------------------------------------------------------------

create or replace function public.prevent_last_super_admin_demotion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining_admins int;
begin
  if old.system_role = 'super_admin' and old.status = 'active'
     and (new.system_role is distinct from 'super_admin' or new.status is distinct from 'active') then

    select count(*) into v_remaining_admins
    from public.profiles
    where system_role = 'super_admin' and status = 'active' and id <> old.id;

    if v_remaining_admins = 0 then
      raise exception 'Não é possível remover ou bloquear o último super_admin ativo do sistema.';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.prevent_last_super_admin_demotion() is
  'Bloqueia rebaixar/bloquear o último super_admin ativo, para o sistema '
  'nunca ficar sem nenhuma conta administrativa.';

drop trigger if exists prevent_last_super_admin_demotion on public.profiles;
create trigger prevent_last_super_admin_demotion
  before update on public.profiles
  for each row execute function public.prevent_last_super_admin_demotion();

-- =============================================================================
-- Fim da migration 002.
--
-- O que NÃO mudou (continua 100% da migration 001, sem alteração):
--   - Tabelas profiles/spaces/space_members e suas colunas.
--   - Todas as RLS policies (profiles/spaces/space_members).
--   - is_super_admin(), is_space_member(), has_space_role(), handle_new_user(),
--     prevent_profile_privilege_escalation(), set_updated_at().
--
-- Por que nenhuma policy de RLS precisou mudar: as policies de UPDATE/INSERT/
-- DELETE de profiles e space_members já usam `or public.is_super_admin()`,
-- então o super_admin já consegue (usando a própria sessão autenticada,
-- SEM Service Role) editar qualquer profile e gerenciar qualquer
-- space_members — administrar usuários/espaços já era possível com a
-- migration 001. O que faltava era só: (1) enxergar e-mail/último acesso
-- (função acima) e (2) travas de segurança extras contra remover o último
-- owner/super_admin.
-- =============================================================================
