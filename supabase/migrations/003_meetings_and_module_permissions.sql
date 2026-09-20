-- =============================================================================
-- VSPlanner — Fase A (Visionário Dev colaborativo): Reuniões + permissões
-- por módulo.
-- Migration: 003_meetings_and_module_permissions.sql
--
-- NÃO altera nada das migrations 001/002 (tabelas, policies, triggers e
-- funções antigas continuam exatamente como estão). Este arquivo só
-- ADICIONA:
--
--   1. `space_module_permissions` — overrides pontuais de permissão por
--      módulo (clientes, trabalhos, reuniões, financeiro, ...), por
--      membership. Terceiro conceito, separado de `system_role` (migration
--      001) e do `role` bruto do space (owner/admin/member/viewer).
--   2. `default_module_permission()` / `space_role_of()` /
--      `has_module_permission()` — a lógica que decide se um usuário pode
--      view/create/edit/delete/conclude em um módulo de um space: primeiro
--      olha se existe override; se não existir, usa o padrão da role.
--   3. `meetings` + `meeting_participants` — Reuniões reais (Fase B usa
--      isso), já com RLS completo baseado em `has_module_permission`.
--
-- Este script é seguro para reexecutar: usa `create or replace` e
-- `drop ... if exists` em tudo que cria.
--
-- COMO EXECUTAR: Supabase Dashboard → SQL Editor → New query → colar este
-- arquivo inteiro → Run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Permissões por módulo — tabela de overrides
--
-- Guarda só as EXCEÇÕES ao padrão da role. Ausência de linha para
-- (space_member, module, action) = usa `default_module_permission()`. Isso
-- evita a "matriz gigante": não existe uma coluna por ação nem uma linha
-- obrigatória por módulo — só o que realmente foge do padrão.
--
-- FK em `space_members.id` (não em `space_id`+`user_id` soltos): ao
-- revogar o acesso de alguém a um space (deletar a linha em
-- `space_members`), os overrides dela somem junto — se a pessoa for
-- readicionada depois, começa do zero nos padrões da role, sem
-- "ressuscitar" uma permissão antiga por engano.
-- -----------------------------------------------------------------------------

create table if not exists public.space_module_permissions (
  id uuid primary key default gen_random_uuid(),
  space_member_id uuid not null references public.space_members (id) on delete cascade,
  module text not null check (
    module in ('visao_geral', 'clientes', 'servicos', 'trabalhos', 'reunioes', 'vendedores', 'financeiro', 'sites')
  ),
  action text not null check (action in ('view', 'create', 'edit', 'delete', 'conclude')),
  allowed boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (space_member_id, module, action)
);

comment on table public.space_module_permissions is
  'Overrides pontuais de permissão por módulo, por membership. Ausência de '
  'linha para (space_member, module, action) = usa default_module_permission() '
  '— não é preciso popular uma linha por módulo/ação, só as exceções.';

drop trigger if exists set_updated_at on public.space_module_permissions;
create trigger set_updated_at
  before update on public.space_module_permissions
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 2. Funções de permissão
-- -----------------------------------------------------------------------------

-- Role (owner/admin/member/viewer) do usuário autenticado num space, ou
-- null se ele não for membro. Mesma convenção de is_space_member/
-- has_space_role (migration 001): security definer + search_path fixo
-- para evitar recursão de RLS.
create or replace function public.space_role_of(p_space_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.space_members
  where space_id = p_space_id and user_id = auth.uid()
  limit 1;
$$;

comment on function public.space_role_of(uuid) is
  'Role bruta (owner/admin/member/viewer) do usuário autenticado no space, ou null se não for membro.';

-- Padrão por role — puramente lógico, sem acessar tabela nenhuma
-- (immutable). owner/admin sempre true. member: tudo true, exceto
-- "financeiro" (false em qualquer ação) e "delete" (false em qualquer
-- módulo) — dá pra liberar financeiro ou delete pontualmente via override.
-- viewer: só "view", e nem isso em financeiro.
create or replace function public.default_module_permission(p_role text, p_module text, p_action text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case
    when p_role in ('owner', 'admin') then true
    when p_role = 'member' then
      case
        when p_module = 'financeiro' then false
        when p_action = 'delete' then false
        else true
      end
    when p_role = 'viewer' then p_action = 'view' and p_module <> 'financeiro'
    else false
  end;
$$;

comment on function public.default_module_permission(text, text, text) is
  'Permissão padrão de uma role para um módulo/ação, usada quando não há override em space_module_permissions.';

-- Ponto único usado pelas policies de RLS de reuniões (e dos módulos
-- futuros, quando migrarem). super_admin sempre passa (mesma convenção do
-- resto do sistema); quem não é membro do space nunca passa; senão,
-- override específico manda, e na ausência dele cai no padrão da role.
create or replace function public.has_module_permission(p_space_id uuid, p_module text, p_action text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_override boolean;
begin
  if public.is_super_admin() then
    return true;
  end if;

  v_role := public.space_role_of(p_space_id);
  if v_role is null then
    return false;
  end if;

  select smp.allowed into v_override
  from public.space_module_permissions smp
  join public.space_members sm on sm.id = smp.space_member_id
  where sm.space_id = p_space_id
    and sm.user_id = auth.uid()
    and smp.module = p_module
    and smp.action = p_action
  limit 1;

  if v_override is not null then
    return v_override;
  end if;

  return public.default_module_permission(v_role, p_module, p_action);
end;
$$;

comment on function public.has_module_permission(uuid, text, text) is
  'Permissão granular por módulo dentro de um space — terceiro conceito, '
  'separado de system_role (plataforma) e do role bruto do space '
  '(owner/admin/member/viewer). Usado nas policies de RLS de meetings/ '
  'meeting_participants e, quando cada módulo migrar do mock, nas dele.';

grant execute on function public.space_role_of(uuid) to authenticated;
grant execute on function public.default_module_permission(text, text, text) to authenticated;
grant execute on function public.has_module_permission(uuid, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. RLS de space_module_permissions
--
-- Quem gerencia: super_admin OU admin/owner do space em questão (mesma
-- convenção de space_members_insert/update/delete na migration 001 — não
-- é exclusivo do Painel Dev, só é a única UI que existe hoje). Cada membro
-- também pode LER os próprios overrides (pra sistema/UI decidir o que
-- mostrar), mas não os de terceiros.
-- -----------------------------------------------------------------------------

alter table public.space_module_permissions enable row level security;

drop policy if exists space_module_permissions_select on public.space_module_permissions;
create policy space_module_permissions_select
  on public.space_module_permissions for select
  using (
    public.is_super_admin()
    or exists (
      select 1 from public.space_members sm
      where sm.id = space_member_id
        and (sm.user_id = auth.uid() or public.has_space_role(sm.space_id, 'admin'))
    )
  );

drop policy if exists space_module_permissions_insert on public.space_module_permissions;
create policy space_module_permissions_insert
  on public.space_module_permissions for insert
  with check (
    public.is_super_admin()
    or exists (
      select 1 from public.space_members sm
      where sm.id = space_member_id and public.has_space_role(sm.space_id, 'admin')
    )
  );

drop policy if exists space_module_permissions_update on public.space_module_permissions;
create policy space_module_permissions_update
  on public.space_module_permissions for update
  using (
    public.is_super_admin()
    or exists (
      select 1 from public.space_members sm
      where sm.id = space_member_id and public.has_space_role(sm.space_id, 'admin')
    )
  )
  with check (
    public.is_super_admin()
    or exists (
      select 1 from public.space_members sm
      where sm.id = space_member_id and public.has_space_role(sm.space_id, 'admin')
    )
  );

drop policy if exists space_module_permissions_delete on public.space_module_permissions;
create policy space_module_permissions_delete
  on public.space_module_permissions for delete
  using (
    public.is_super_admin()
    or exists (
      select 1 from public.space_members sm
      where sm.id = space_member_id and public.has_space_role(sm.space_id, 'admin')
    )
  );

grant select, insert, update, delete on public.space_module_permissions to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Reuniões
--
-- `client_name` é texto livre de propósito: `clients` ainda é mock (fora
-- do Postgres, migra na Fase E) — não dá pra referenciar com FK real hoje.
-- Quando a Fase E existir, uma migration nova adiciona
-- `client_id uuid references clients(id)` e a UI passa a popular os dois
-- (ou substitui o texto pelo vínculo real).
--
-- `summary`/`decisions`/`final_notes` ficam na própria tabela (não numa
-- `meeting_outcomes` separada): é 1:1 com a reunião, só existe depois de
-- concluída, e não tem motivo pra forçar um JOIN extra em toda leitura só
-- por isso.
-- -----------------------------------------------------------------------------

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,

  title text not null,
  description text,
  agenda text,
  notes text,

  client_name text,
  contact_name text,
  contact_phone text,

  meeting_date date not null,
  start_time time not null,
  end_time time,
  location text,
  meeting_link text,

  status text not null default 'agendada' check (status in ('agendada', 'em_andamento', 'realizada', 'cancelada')),

  responsible_id uuid not null references public.profiles (id),

  -- Só preenchidos ao concluir (status = 'realizada').
  summary text,
  decisions text,
  final_notes text,

  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.meetings is
  'Reuniões de um space (hoje só usado pelo Visionário Dev, sem restrição '
  'rígida a um space específico). Uma linha só por reunião, nunca duplicada '
  'por participante — "Hoje" (Fase C) consulta via meeting_participants.';

comment on column public.meetings.client_name is
  'Texto livre — clients não existe no Postgres ainda (Fase E). Não é FK de propósito.';

create index if not exists idx_meetings_space_id on public.meetings (space_id);
create index if not exists idx_meetings_space_date on public.meetings (space_id, meeting_date);
create index if not exists idx_meetings_responsible_id on public.meetings (responsible_id);

drop trigger if exists set_updated_at on public.meetings;
create trigger set_updated_at
  before update on public.meetings
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 5. Participantes da reunião
--
-- `space_id` é uma cópia de meetings.space_id, preenchida pela trigger
-- abaixo — só para a RLS não precisar de JOIN em toda checagem. A mesma
-- trigger garante a regra de segurança pedida: só entra como participante
-- quem JÁ é membro do space (participar de uma reunião nunca concede
-- acesso a um space por si só).
-- -----------------------------------------------------------------------------

create table if not exists public.meeting_participants (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  space_id uuid not null references public.spaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (meeting_id, user_id)
);

comment on table public.meeting_participants is
  '"space_id" é preenchido automaticamente pela trigger enforce_meeting_participant '
  '— nunca escrever nela manualmente. Relação real com profiles, não nomes em texto.';

create index if not exists idx_meeting_participants_meeting_id on public.meeting_participants (meeting_id);
create index if not exists idx_meeting_participants_user_id on public.meeting_participants (user_id);

create or replace function public.enforce_meeting_participant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
begin
  select space_id into v_space_id from public.meetings where id = new.meeting_id;

  if v_space_id is null then
    raise exception 'Reunião não encontrada.';
  end if;

  new.space_id := v_space_id;

  if not exists (
    select 1 from public.space_members
    where space_id = v_space_id and user_id = new.user_id
  ) then
    raise exception 'Só é possível adicionar como participante quem já tem acesso a este espaço.';
  end if;

  return new;
end;
$$;

comment on function public.enforce_meeting_participant() is
  'Preenche meeting_participants.space_id a partir da reunião e recusa '
  'participante que não seja membro do space — participar de uma reunião '
  'nunca é, por si só, uma forma de ganhar acesso ao space.';

drop trigger if exists enforce_meeting_participant on public.meeting_participants;
create trigger enforce_meeting_participant
  before insert or update on public.meeting_participants
  for each row execute function public.enforce_meeting_participant();

-- O responsável principal de uma reunião também aparece em
-- meeting_participants (pra "Hoje", Fase C, achar as reuniões dele com uma
-- única consulta, sem UNION com meetings.responsible_id). Reatribuir o
-- responsável NÃO remove o participante anterior — só garante que o novo
-- também está na lista.
create or replace function public.sync_meeting_responsible_participant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.meeting_participants (meeting_id, space_id, user_id)
  values (new.id, new.space_id, new.responsible_id)
  on conflict (meeting_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists sync_meeting_responsible_participant on public.meetings;
create trigger sync_meeting_responsible_participant
  after insert or update of responsible_id on public.meetings
  for each row execute function public.sync_meeting_responsible_participant();

-- -----------------------------------------------------------------------------
-- 6. RLS de meetings / meeting_participants
--
-- Tudo baseado em has_module_permission('reunioes', ação) — que já embute
-- "é membro do space?" (retorna false se não for). Isso cobre, ao mesmo
-- tempo: isolamento entre spaces (a linha carrega o space_id real, não dá
-- pra "adivinhar" um id de outro space e ver algo), viewer não conseguir
-- editar (default_module_permission nega tudo que não seja view pra
-- viewer), e quem não tem acesso ao space não conseguir nem consultar.
-- -----------------------------------------------------------------------------

alter table public.meetings enable row level security;

drop policy if exists meetings_select on public.meetings;
create policy meetings_select
  on public.meetings for select
  using (public.has_module_permission(space_id, 'reunioes', 'view'));

drop policy if exists meetings_insert on public.meetings;
create policy meetings_insert
  on public.meetings for insert
  with check (
    public.has_module_permission(space_id, 'reunioes', 'create')
    and created_by = auth.uid()
  );

drop policy if exists meetings_update on public.meetings;
create policy meetings_update
  on public.meetings for update
  using (public.has_module_permission(space_id, 'reunioes', 'edit'))
  with check (public.has_module_permission(space_id, 'reunioes', 'edit'));

drop policy if exists meetings_delete on public.meetings;
create policy meetings_delete
  on public.meetings for delete
  using (public.has_module_permission(space_id, 'reunioes', 'delete'));

alter table public.meeting_participants enable row level security;

drop policy if exists meeting_participants_select on public.meeting_participants;
create policy meeting_participants_select
  on public.meeting_participants for select
  using (public.has_module_permission(space_id, 'reunioes', 'view'));

drop policy if exists meeting_participants_insert on public.meeting_participants;
create policy meeting_participants_insert
  on public.meeting_participants for insert
  with check (public.has_module_permission(space_id, 'reunioes', 'edit'));

drop policy if exists meeting_participants_delete on public.meeting_participants;
create policy meeting_participants_delete
  on public.meeting_participants for delete
  using (public.has_module_permission(space_id, 'reunioes', 'edit'));

-- -----------------------------------------------------------------------------
-- 7. Grants
-- -----------------------------------------------------------------------------

grant select, insert, update, delete on public.meetings to authenticated;
grant select, insert, delete on public.meeting_participants to authenticated;

-- =============================================================================
-- Fim da migration 003.
--
-- O que NÃO mudou: nenhuma tabela/função/policy das migrations 001 e 002
-- foi tocada. `profiles`, `spaces`, `space_members`, autenticação e Painel
-- Dev continuam exatamente como estavam.
--
-- Próximos passos (Fase B, só depois desta migration ser executada):
-- CRUD de reuniões (Server Actions + RLS já pronta acima), participantes,
-- WhatsApp (normalização em app code, não no banco), link "Entrar na
-- reunião", UI em /visionario/reunioes.
-- =============================================================================
