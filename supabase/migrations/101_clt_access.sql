-- CLT access is enabled by default to preserve existing accounts.
alter table public.profiles add column if not exists clt_access boolean not null default true;

-- Admin changes must go through the authenticated server action.
-- Existing RLS policies on profiles remain in effect.
