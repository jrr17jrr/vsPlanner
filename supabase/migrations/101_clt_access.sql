-- CLT access is enabled by default to preserve existing accounts.
alter table public.profiles add column if not exists clt_access boolean not null default true;

-- Admin changes must go through the authenticated server action.
-- Existing RLS policies on profiles remain in effect.

-- Prevent ordinary users from granting themselves CLT access through profiles.update.
create or replace function public.guard_clt_access_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.clt_access is distinct from old.clt_access and not public.is_super_admin() then
    raise exception 'Somente administradores podem alterar acesso CLT';
  end if;
  return new;
end $$;
drop trigger if exists guard_clt_access_change on public.profiles;
create trigger guard_clt_access_change before update of clt_access on public.profiles
for each row execute function public.guard_clt_access_change();
