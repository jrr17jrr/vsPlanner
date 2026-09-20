-- =============================================================================
-- VSPlanner — Fase B (Reuniões): visibilidade mínima de nome entre membros
-- do mesmo space.
-- Migration: 004_space_member_profile_visibility.sql
--
-- NÃO altera nada das migrations 001/002/003. `profiles_select_own_or_admin`
-- (migration 001) continua exatamente como está — um membro comum ainda
-- não pode fazer `select * from profiles` de outra pessoa.
--
-- O QUE FALTAVA: para o seletor de participantes de uma reunião (e para
-- resolver "responsável"/"participantes" ao exibir uma reunião) mostrar
-- nomes reais, quem está criando/vendo precisa enxergar o `name` de
-- colegas do MESMO space — hoje isso só é possível para super_admin.
--
-- Em vez de afrouxar a RLS de `profiles` (o que exporia phone/status/
-- system_role de todo mundo para todo colega de space), esta migration
-- adiciona uma função `security definer` que devolve só `id`, `name` e
-- `avatar_url` — nunca e-mail, telefone, status ou system_role — e só
-- para quem já é membro do space perguntado (checado dentro da função).
-- Mesmo padrão de `admin_list_users()` (migration 002): escopo estreito,
-- autorização dentro da função, não só no `grant`.
-- =============================================================================

create or replace function public.space_member_profiles(p_space_id uuid)
returns table (
  id uuid,
  name text,
  avatar_url text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.is_space_member(p_space_id) or public.is_super_admin()) then
    raise exception 'Acesso negado: você não é membro deste espaço.';
  end if;

  return query
    select p.id, p.name, p.avatar_url
    from public.profiles p
    join public.space_members sm on sm.user_id = p.id
    where sm.space_id = p_space_id;
end;
$$;

comment on function public.space_member_profiles(uuid) is
  'Nome/avatar (só isso — nunca email/phone/status/system_role) de quem é '
  'membro do space informado. Só retorna algo se quem chamou também for '
  'membro dele (ou super_admin). Usada para resolver nomes de responsável/ '
  'participantes de reuniões e para o seletor de participantes.';

grant execute on function public.space_member_profiles(uuid) to authenticated;

-- =============================================================================
-- Fim da migration 004.
-- =============================================================================
