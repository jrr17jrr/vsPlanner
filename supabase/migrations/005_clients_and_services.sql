-- =============================================================================
-- VSPlanner — Etapa 2/3 (Visionário Dev colaborativo): Clientes e Serviços
-- reais.
-- Migration: 005_clients_and_services.sql
--
-- NÃO altera nada das migrations 001/002/003/004 (nenhuma tabela/policy/
-- trigger antiga é modificada). Esta versão foi corrigida ANTES da
-- primeira execução (autorizado pelo usuário) para incluir mais duas
-- coisas pequenas, agrupadas aqui em vez de virarem migrations 006/007
-- separadas:
--
--   0a. `unique (slug)` em `spaces` — o bootstrap automático do space
--       "Visionário Dev" (feito em código, ver `ensureVisionarioDevSpace`)
--       depende de nunca poder existir dois spaces com o mesmo slug.
--   0b. `meetings.client_id` — a ligação real Reuniões→Clientes (era a
--       "Etapa 4" do plano original); só podia existir depois de `clients`
--       ser criada, então faz sentido vir na mesma migration que cria
--       `clients`, não numa 006 isolada logo em seguida.
--
-- Fora isso, cria três tabelas novas: `clients`, `services`,
-- `client_services`. Migra os campos ÚTEIS do mock (`types/entities.ts` →
-- `Client`/`Service`/`ClientService`). NÃO traz `dueDay`/`pricingMode`/
-- `packagePrice` do mock `Client` — esses três campos descreviam cobrança
-- (quando vence, se é pacote/individual) num nível que agora pertence a
-- `client_services` (por serviço contratado, não por cliente como um
-- todo — um cliente pode ter um serviço mensal e outro avulso ao mesmo
-- tempo) e, na Etapa 5, a `recurring_financial_rules`. Trazer os três
-- campos antigos criaria duas fontes de verdade pra cobrança.
--
-- RLS usa exatamente `has_module_permission(space_id, 'clientes'|'servicos', ação)`
-- (migration 003) — nenhum sistema de autorização novo.
--
-- COMO EXECUTAR: Supabase Dashboard → SQL Editor → New query → colar este
-- arquivo inteiro → Run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Correções pequenas em cima de tabelas já existentes (001/003)
-- -----------------------------------------------------------------------------

-- 0a. Slug único — sem isso, o bootstrap automático do Visionário Dev
-- (código da aplicação: verifica se já existe, cria se não existir) teria
-- uma janela teórica de corrida (duas requisições simultâneas criando
-- dois spaces "visionario-dev"). Com a constraint, a segunda tentativa
-- simplesmente falha com um erro de unicidade, e o código já trata isso
-- reconsultando em vez de duplicar.
alter table public.spaces
  drop constraint if exists spaces_slug_key;
alter table public.spaces
  add constraint spaces_slug_key unique (slug);

-- -----------------------------------------------------------------------------
-- 1. Clientes
-- -----------------------------------------------------------------------------

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,

  name text not null,
  company text,
  status text not null default 'ativo' check (status in ('ativo', 'inativo')),

  phone text,
  whatsapp text,
  email text,
  instagram text,
  tiktok text,
  facebook text,
  website text,
  notes text,

  joined_at date not null default current_date,
  responsible_id uuid references public.profiles (id),

  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.clients is
  'Clientes do Visionário Dev (ou de qualquer space de negócio). Cobrança/ '
  'recorrência não fica aqui — ver client_services e (Etapa 5) '
  'recurring_financial_rules.';

create index if not exists idx_clients_space_id on public.clients (space_id);

drop trigger if exists set_updated_at on public.clients;
create trigger set_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

alter table public.clients enable row level security;

drop policy if exists clients_select on public.clients;
create policy clients_select
  on public.clients for select
  using (public.has_module_permission(space_id, 'clientes', 'view'));

drop policy if exists clients_insert on public.clients;
create policy clients_insert
  on public.clients for insert
  with check (
    public.has_module_permission(space_id, 'clientes', 'create')
    and created_by = auth.uid()
  );

drop policy if exists clients_update on public.clients;
create policy clients_update
  on public.clients for update
  using (public.has_module_permission(space_id, 'clientes', 'edit'))
  with check (public.has_module_permission(space_id, 'clientes', 'edit'));

drop policy if exists clients_delete on public.clients;
create policy clients_delete
  on public.clients for delete
  using (public.has_module_permission(space_id, 'clientes', 'delete'));

grant select, insert, update, delete on public.clients to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Serviços (catálogo)
-- -----------------------------------------------------------------------------

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,

  name text not null,
  description text,
  default_price numeric(12, 2) not null default 0,
  billing_type text not null check (billing_type in ('unico', 'mensal')),
  status text not null default 'ativo' check (status in ('ativo', 'inativo')),

  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.services is
  'Catálogo de serviços do space (ex: Landing Page, Social Media) — o preço '
  'e a recorrência REAIS de um cliente específico ficam em client_services, '
  'não aqui (default_price é só o valor sugerido ao contratar).';

create index if not exists idx_services_space_id on public.services (space_id);

drop trigger if exists set_updated_at on public.services;
create trigger set_updated_at
  before update on public.services
  for each row execute function public.set_updated_at();

alter table public.services enable row level security;

drop policy if exists services_select on public.services;
create policy services_select
  on public.services for select
  using (public.has_module_permission(space_id, 'servicos', 'view'));

drop policy if exists services_insert on public.services;
create policy services_insert
  on public.services for insert
  with check (
    public.has_module_permission(space_id, 'servicos', 'create')
    and created_by = auth.uid()
  );

drop policy if exists services_update on public.services;
create policy services_update
  on public.services for update
  using (public.has_module_permission(space_id, 'servicos', 'edit'))
  with check (public.has_module_permission(space_id, 'servicos', 'edit'));

drop policy if exists services_delete on public.services;
create policy services_delete
  on public.services for delete
  using (public.has_module_permission(space_id, 'servicos', 'delete'));

grant select, insert, update, delete on public.services to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Serviço contratado pelo cliente (o "contrato")
--
-- `space_id` é preenchido pela trigger abaixo a partir do cliente — nunca
-- escrito manualmente — e a mesma trigger recusa o insert se o serviço
-- referenciado for de outro space (evita misturar clientes/serviços de
-- spaces diferentes por engano).
--
-- Frequência/dia de vencimento só fazem sentido quando `billing_type =
-- 'recorrente'`; quando `'unico'`, ficam null. Isso é o suficiente pra
-- Etapa 5 (Financeiro) materializar cobranças sem duplicar cadastro —
-- `recurring_financial_rules` vai referenciar uma linha daqui em vez de
-- repetir cliente/serviço/valor/frequência.
-- -----------------------------------------------------------------------------

create table if not exists public.client_services (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete restrict,
  space_id uuid not null references public.spaces (id) on delete cascade,

  price numeric(12, 2) not null,
  billing_type text not null check (billing_type in ('unico', 'recorrente')),
  frequency text check (frequency in ('semanal', 'mensal', 'anual')),
  due_day int check (due_day between 1 and 31),
  start_date date not null default current_date,
  status text not null default 'ativo' check (status in ('ativo', 'inativo', 'cancelado')),
  notes text,

  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint client_services_recorrente_tem_frequencia check (
    billing_type <> 'recorrente' or (frequency is not null and due_day is not null)
  )
);

comment on table public.client_services is
  '"Contrato" de um serviço com um cliente — preço, se é único ou '
  'recorrente, frequência e dia de vencimento. `space_id` é sempre uma '
  'cópia do space do cliente (trigger enforce_client_service_space).';

create index if not exists idx_client_services_client_id on public.client_services (client_id);
create index if not exists idx_client_services_service_id on public.client_services (service_id);
create index if not exists idx_client_services_space_id on public.client_services (space_id);

drop trigger if exists set_updated_at on public.client_services;
create trigger set_updated_at
  before update on public.client_services
  for each row execute function public.set_updated_at();

create or replace function public.enforce_client_service_space()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_space_id uuid;
  v_service_space_id uuid;
begin
  select space_id into v_client_space_id from public.clients where id = new.client_id;
  if v_client_space_id is null then
    raise exception 'Cliente não encontrado.';
  end if;

  select space_id into v_service_space_id from public.services where id = new.service_id;
  if v_service_space_id is null then
    raise exception 'Serviço não encontrado.';
  end if;

  if v_service_space_id <> v_client_space_id then
    raise exception 'Cliente e serviço precisam ser do mesmo espaço.';
  end if;

  new.space_id := v_client_space_id;
  return new;
end;
$$;

comment on function public.enforce_client_service_space() is
  'Preenche client_services.space_id a partir do cliente e recusa misturar '
  'cliente e serviço de spaces diferentes.';

drop trigger if exists enforce_client_service_space on public.client_services;
create trigger enforce_client_service_space
  before insert or update on public.client_services
  for each row execute function public.enforce_client_service_space();

alter table public.client_services enable row level security;

drop policy if exists client_services_select on public.client_services;
create policy client_services_select
  on public.client_services for select
  using (public.has_module_permission(space_id, 'servicos', 'view'));

drop policy if exists client_services_insert on public.client_services;
create policy client_services_insert
  on public.client_services for insert
  with check (
    public.has_module_permission(space_id, 'servicos', 'create')
    and created_by = auth.uid()
  );

drop policy if exists client_services_update on public.client_services;
create policy client_services_update
  on public.client_services for update
  using (public.has_module_permission(space_id, 'servicos', 'edit'))
  with check (public.has_module_permission(space_id, 'servicos', 'edit'));

drop policy if exists client_services_delete on public.client_services;
create policy client_services_delete
  on public.client_services for delete
  using (public.has_module_permission(space_id, 'servicos', 'delete'));

grant select, insert, update, delete on public.client_services to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Reuniões → Clientes (a "Etapa 4" original, incorporada aqui)
--
-- `client_name` (migration 003) continua existindo — texto livre,
-- preservado para reuniões antigas e para quando o contato ainda não é um
-- cliente cadastrado. `client_id` é a ligação real, nova, nullable (uma
-- reunião pode não ter cliente). Nenhuma policy de `meetings` muda — RLS
-- continua sendo só `has_module_permission(space_id, 'reunioes', ação)`,
-- e a FK por si só não abre nenhum acesso novo (só é populável com um
-- `client_id` que passe pela RLS de `clients` de qualquer forma).
-- -----------------------------------------------------------------------------

alter table public.meetings
  add column if not exists client_id uuid references public.clients (id) on delete set null;

comment on column public.meetings.client_id is
  'Ligação real com clients (Fase E, incorporada na migration 005). '
  'client_name continua existindo para reuniões sem cliente cadastrado ou '
  'criadas antes desta coluna.';

create index if not exists idx_meetings_client_id on public.meetings (client_id);

-- =============================================================================
-- Fim da migration 005.
--
-- O que NÃO mudou: nenhuma tabela/policy/trigger/função das migrations
-- 001/002/003/004 foi removida ou teve seu comportamento alterado — a
-- única adição a uma tabela já existente é a constraint de slug único em
-- `spaces` e a nova coluna nullable `meetings.client_id`, que não afeta
-- nenhuma policy de RLS existente.
-- =============================================================================
