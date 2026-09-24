-- =============================================================================
-- VSPlanner — Contratos ↔ Financeiro, trava de cobrança duplicada e Domínios.
-- Migration: 009_contracts_finance_domains.sql
--
-- NÃO altera nenhuma das migrations 001-008 (os arquivos continuam como
-- estão). Tudo aqui é ADITIVO e seguro para dados existentes:
--
--   1. `client_services` ganha suporte a contrato PARCELADO
--      (`billing_type = 'parcelado'` + `installment_count`) e um
--      `first_due_date` (vencimento de contrato único/parcelado — o
--      recorrente continua usando `due_day`). Sem isso não existe onde
--      guardar "3x" nem "vence em 15/10" no contrato: a check de 005 só
--      aceita 'unico'/'recorrente'. Status NÃO muda: 'inativo' é exibido
--      como "Pausado" e 'cancelado' como "Encerrado" (mesmos valores).
--
--      A ligação contrato → financeiro NÃO precisa de coluna nova:
--      `financial_origins.client_service_id` (migration 007) já existe e é
--      exatamente isso. Nenhuma tabela financeira paralela é criada.
--
--   2. Índice único `financial_charges (origin_id, due_date)` — impede que
--      a geração lazy de recorrências (duas abas abertas ao mesmo tempo)
--      crie a mesma competência duas vezes. Só é criado se ainda não
--      houver duplicatas (não apaga nada; se houver, avisa via NOTICE).
--
--   3. `domains` — domínios que VOCÊ possui/administra (diferente de
--      `client_sites`, que é o projeto/site). Não há onde guardar data de
--      compra, valor pago, período e renovação de um domínio sem site hoje.
--      RLS usa o módulo 'sites' que já existe desde a migration 003
--      (Sites e Domínios continuam sendo a mesma permissão) — nenhum
--      módulo novo, nenhuma alteração na check de space_module_permissions.
--      A renovação, quando integrada ao financeiro, é uma
--      `financial_origins` normal (saída recorrente) referenciada por
--      `financial_origin_id` — mesma arquitetura de A pagar, sem cobrança
--      duplicada.
--
-- Sem seed: nenhum dado de exemplo é inserido.
--
-- COMO EXECUTAR: Supabase Dashboard → SQL Editor → New query → colar este
-- arquivo inteiro → Run. Seguro para reexecutar.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. client_services: parcelado + parcelas + primeiro vencimento
-- -----------------------------------------------------------------------------

-- A check inline de `billing_type` (migration 005) tem nome gerado pelo
-- Postgres; localiza pelo conteúdo em vez de assumir o nome, e nunca toca
-- em `client_services_recorrente_tem_frequencia`.
do $$
declare
  v_name text;
begin
  for v_name in
    select conname
    from pg_constraint
    where conrelid = 'public.client_services'::regclass
      and contype = 'c'
      and conname not in (
        'client_services_recorrente_tem_frequencia',
        'client_services_billing_type_check_v2',
        'client_services_parcelado_tem_parcelas'
      )
      and pg_get_constraintdef(oid) ilike '%billing_type%'
      and pg_get_constraintdef(oid) ilike '%unico%'
  loop
    execute format('alter table public.client_services drop constraint %I', v_name);
  end loop;
end;
$$;

alter table public.client_services
  drop constraint if exists client_services_billing_type_check_v2;
alter table public.client_services
  add constraint client_services_billing_type_check_v2
  check (billing_type in ('unico', 'recorrente', 'parcelado'));

alter table public.client_services
  add column if not exists installment_count int;
alter table public.client_services
  add column if not exists first_due_date date;

alter table public.client_services
  drop constraint if exists client_services_installment_count_range;
alter table public.client_services
  add constraint client_services_installment_count_range
  check (installment_count is null or installment_count between 2 and 120);

alter table public.client_services
  drop constraint if exists client_services_parcelado_tem_parcelas;
alter table public.client_services
  add constraint client_services_parcelado_tem_parcelas
  check (billing_type <> 'parcelado' or installment_count is not null);

comment on column public.client_services.installment_count is
  'Só para billing_type = parcelado: quantidade de parcelas (price = valor TOTAL do contrato).';
comment on column public.client_services.first_due_date is
  'Vencimento (único) ou 1º vencimento (parcelado). Recorrente usa due_day a partir de start_date.';
comment on column public.client_services.status is
  'ativo | inativo (exibido como "Pausado") | cancelado (exibido como "Encerrado").';

-- Busca "qual origem financeira pertence a este contrato".
create index if not exists idx_financial_origins_client_service_id
  on public.financial_origins (client_service_id);

-- -----------------------------------------------------------------------------
-- 2. Trava contra cobrança duplicada na mesma competência
-- -----------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from public.financial_charges
    group by origin_id, due_date
    having count(*) > 1
  ) then
    raise notice 'financial_charges possui cobranças duplicadas (mesma origem e vencimento). Índice único NÃO criado — revise os dados e reexecute esta migration.';
  else
    create unique index if not exists uq_financial_charges_origin_due
      on public.financial_charges (origin_id, due_date);
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Domínios
-- -----------------------------------------------------------------------------

create table if not exists public.domains (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,

  domain text not null,
  registrar text,
  purchase_date date,
  purchase_price numeric(12, 2) check (purchase_price is null or purchase_price >= 0),
  -- Período de renovação em meses (12 = anual, 24 = 2 anos...).
  period_months int not null default 12 check (period_months between 1 and 120),
  renewal_date date,
  renewal_price numeric(12, 2) check (renewal_price is null or renewal_price >= 0),
  status text not null default 'ativo' check (status in ('ativo', 'expirado', 'cancelado', 'transferido')),
  notes text,

  client_id uuid references public.clients (id) on delete set null,
  site_id uuid references public.client_sites (id) on delete set null,
  -- Renovação integrada ao financeiro (A pagar) — uma origem de saída
  -- recorrente comum; as cobranças/pagamentos continuam no Financeiro.
  financial_origin_id uuid references public.financial_origins (id) on delete set null,

  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.domains is
  'Domínios que o space possui/administra. Custos de renovação ficam no '
  'Financeiro (financial_origin_id) — esta tabela nunca guarda pagamento.';

create unique index if not exists uq_domains_space_domain on public.domains (space_id, lower(domain));
create index if not exists idx_domains_space_id on public.domains (space_id);
create index if not exists idx_domains_renewal on public.domains (space_id, renewal_date);
create index if not exists idx_domains_client_id on public.domains (client_id);
create index if not exists idx_domains_site_id on public.domains (site_id);
create index if not exists idx_domains_financial_origin_id on public.domains (financial_origin_id);

drop trigger if exists set_updated_at on public.domains;
create trigger set_updated_at before update on public.domains
  for each row execute function public.set_updated_at();

-- Cliente/site/origem vinculados precisam ser do MESMO space do domínio —
-- a FK só garante que o id existe.
create or replace function public.enforce_domain_space()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.client_id is not null and not exists (
    select 1 from public.clients where id = new.client_id and space_id = new.space_id
  ) then
    raise exception 'Cliente precisa ser do mesmo espaço do domínio.';
  end if;

  if new.site_id is not null and not exists (
    select 1 from public.client_sites where id = new.site_id and space_id = new.space_id
  ) then
    raise exception 'Site precisa ser do mesmo espaço do domínio.';
  end if;

  if new.financial_origin_id is not null and not exists (
    select 1 from public.financial_origins where id = new.financial_origin_id and space_id = new.space_id
  ) then
    raise exception 'Origem financeira precisa ser do mesmo espaço do domínio.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_domain_space on public.domains;
create trigger enforce_domain_space before insert or update on public.domains
  for each row execute function public.enforce_domain_space();

alter table public.domains enable row level security;

drop policy if exists domains_select on public.domains;
create policy domains_select on public.domains for select
  using (public.has_module_permission(space_id, 'sites', 'view'));
drop policy if exists domains_insert on public.domains;
create policy domains_insert on public.domains for insert
  with check (public.has_module_permission(space_id, 'sites', 'create') and created_by = auth.uid());
drop policy if exists domains_update on public.domains;
create policy domains_update on public.domains for update
  using (public.has_module_permission(space_id, 'sites', 'edit'))
  with check (public.has_module_permission(space_id, 'sites', 'edit'));
drop policy if exists domains_delete on public.domains;
create policy domains_delete on public.domains for delete
  using (public.has_module_permission(space_id, 'sites', 'delete'));

grant select, insert, update, delete on public.domains to authenticated;

-- =============================================================================
-- Fim da migration 009.
-- =============================================================================
