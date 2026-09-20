-- =============================================================================
-- VSPlanner — Trabalhos/Atividades reais (Visionário Dev), com múltiplos
-- responsáveis.
-- Migration: 006_work_items.sql
--
-- NÃO altera nada das migrations 001-005. Só ADICIONA duas tabelas novas:
-- `work_items` e `work_item_assignees`.
--
-- Mesma arquitetura de `meetings`/`meeting_participants` (migration 003):
-- um "responsável" não é uma lista de nomes em texto, é uma relação real
-- com `profiles` numa tabela de junção, com a mesma trigger de segurança
-- (só entra quem já é membro do space) e o mesmo `space_id` denormalizado
-- pra RLS não precisar de JOIN.
--
-- Diferente de `meetings` (que nasceu antes de `clients`/`services`
-- existirem e por isso tem `client_name` em texto livre), `work_items` já
-- nasce com `client_id`/`service_id` como FK real — migration 005 já
-- existe.
--
-- `source_meeting_id` é o que permite "atividades geradas pela reunião":
-- ao concluir uma reunião, o app pode criar `work_items` com
-- `source_meeting_id` apontando pra ela — sem duplicar a atividade por
-- usuário (cada work_item é uma linha só, com N responsáveis via
-- `work_item_assignees`, igual reuniões).
--
-- COMO EXECUTAR: Supabase Dashboard → SQL Editor → New query → colar este
-- arquivo inteiro → Run.
-- =============================================================================

create table if not exists public.work_items (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,

  title text not null,
  description text,

  client_id uuid references public.clients (id) on delete set null,
  service_id uuid references public.services (id) on delete set null,
  source_meeting_id uuid references public.meetings (id) on delete set null,

  due_date date,
  priority text not null default 'media' check (priority in ('baixa', 'media', 'alta')),
  status text not null default 'pendente'
    check (status in ('pendente', 'em_andamento', 'aguardando_cliente', 'concluido')),
  notes text,

  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.work_items is
  'Trabalhos/atividades do Visionário Dev. "Responsáveis" não é coluna '
  'nenhuma aqui — é a relação real em work_item_assignees (múltiplos, '
  'igual meeting_participants). source_meeting_id liga a reunião que '
  'gerou este trabalho, quando aplicável.';

create index if not exists idx_work_items_space_id on public.work_items (space_id);
create index if not exists idx_work_items_client_id on public.work_items (client_id);
create index if not exists idx_work_items_due_date on public.work_items (space_id, due_date);
create index if not exists idx_work_items_source_meeting on public.work_items (source_meeting_id);

drop trigger if exists set_updated_at on public.work_items;
create trigger set_updated_at
  before update on public.work_items
  for each row execute function public.set_updated_at();

alter table public.work_items enable row level security;

drop policy if exists work_items_select on public.work_items;
create policy work_items_select
  on public.work_items for select
  using (public.has_module_permission(space_id, 'trabalhos', 'view'));

drop policy if exists work_items_insert on public.work_items;
create policy work_items_insert
  on public.work_items for insert
  with check (
    public.has_module_permission(space_id, 'trabalhos', 'create')
    and created_by = auth.uid()
  );

drop policy if exists work_items_update on public.work_items;
create policy work_items_update
  on public.work_items for update
  using (public.has_module_permission(space_id, 'trabalhos', 'edit'))
  with check (public.has_module_permission(space_id, 'trabalhos', 'edit'));

drop policy if exists work_items_delete on public.work_items;
create policy work_items_delete
  on public.work_items for delete
  using (public.has_module_permission(space_id, 'trabalhos', 'delete'));

grant select, insert, update, delete on public.work_items to authenticated;

-- -----------------------------------------------------------------------------
-- Responsáveis (múltiplos) — mesma arquitetura de meeting_participants.
-- -----------------------------------------------------------------------------

create table if not exists public.work_item_assignees (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references public.work_items (id) on delete cascade,
  space_id uuid not null references public.spaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (work_item_id, user_id)
);

comment on table public.work_item_assignees is
  '"space_id" é preenchido automaticamente pela trigger '
  'enforce_work_item_assignee — nunca escrever nela manualmente. Relação '
  'real com profiles, não nomes em texto.';

create index if not exists idx_work_item_assignees_work_item_id on public.work_item_assignees (work_item_id);
create index if not exists idx_work_item_assignees_user_id on public.work_item_assignees (user_id);

create or replace function public.enforce_work_item_assignee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
begin
  select space_id into v_space_id from public.work_items where id = new.work_item_id;

  if v_space_id is null then
    raise exception 'Trabalho não encontrado.';
  end if;

  new.space_id := v_space_id;

  if not exists (
    select 1 from public.space_members
    where space_id = v_space_id and user_id = new.user_id
  ) then
    raise exception 'Só é possível atribuir quem já tem acesso a este espaço.';
  end if;

  return new;
end;
$$;

comment on function public.enforce_work_item_assignee() is
  'Preenche work_item_assignees.space_id a partir do trabalho e recusa '
  'atribuir quem não é membro do space — mesma regra de segurança de '
  'enforce_meeting_participant (migration 003).';

drop trigger if exists enforce_work_item_assignee on public.work_item_assignees;
create trigger enforce_work_item_assignee
  before insert or update on public.work_item_assignees
  for each row execute function public.enforce_work_item_assignee();

alter table public.work_item_assignees enable row level security;

drop policy if exists work_item_assignees_select on public.work_item_assignees;
create policy work_item_assignees_select
  on public.work_item_assignees for select
  using (public.has_module_permission(space_id, 'trabalhos', 'view'));

drop policy if exists work_item_assignees_insert on public.work_item_assignees;
create policy work_item_assignees_insert
  on public.work_item_assignees for insert
  with check (public.has_module_permission(space_id, 'trabalhos', 'edit'));

drop policy if exists work_item_assignees_delete on public.work_item_assignees;
create policy work_item_assignees_delete
  on public.work_item_assignees for delete
  using (public.has_module_permission(space_id, 'trabalhos', 'edit'));

grant select, insert, delete on public.work_item_assignees to authenticated;

-- =============================================================================
-- Fim da migration 006.
--
-- O que NÃO mudou: nenhuma tabela/policy/trigger/função das migrations
-- 001-005 foi alterada.
--
-- O que isso desbloqueia (próxima fase de implementação, depois de você
-- executar esta migration):
--   - /visionario/trabalhos real, com responsáveis múltiplos de verdade;
--   - "Hoje" ganha uma segunda integração (igual a de reuniões): work_items
--     com due_date = hoje onde sou assignee;
--   - ao concluir uma reunião, criar work_items com source_meeting_id
--     apontando pra ela (a seção "Atividades geradas", hoje um placeholder
--     na tela da reunião, passa a listar de verdade).
-- =============================================================================
