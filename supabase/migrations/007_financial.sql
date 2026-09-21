-- =============================================================================
-- VSPlanner — Financeiro real (Visionário Dev): contas, categorias,
-- "referente a", origem (único/parcelado/recorrente), cobrança e pagamento.
-- Migration: 007_financial.sql
--
-- NÃO altera nada das migrations 001-006. Só ADICIONA 6 tabelas novas:
-- `financial_accounts`, `financial_categories`, `financial_reference_types`,
-- `financial_origins`, `financial_charges`, `financial_payments`.
--
-- Por que 6 tabelas e não uma "transactions" só: "o que é devido"
-- (cobrança), "o que entrou/saiu de caixa de fato" (pagamento) e "de onde
-- isso vem" (compra única/parcelamento/recorrência) são três conceitos que
-- mudam em momentos diferentes. Numa tabela só, pagamento parcial não tem
-- onde morar, reajustar um contrato reescreve histórico, e "3x de R$1.000"
-- não tem como ficar ligado à mesma origem sem uma coluna de agrupamento
-- solta. Separado, cada um evolui sem contaminar o outro:
--
--   financial_origins   → a decisão ("Notebook 3x", "Claude R$100/mês",
--                          "Landing Page - criação"). Até uma compra única
--                          tem uma origem, de uma parcela só — sem caso
--                          especial.
--   financial_charges   → cada cobrança individual (1/3, 2/3, 3/3; ou cada
--                          mês de uma mensalidade). Valor CONGELADO no
--                          momento — nunca recalculado do contrato depois.
--   financial_payments  → cada movimento de caixa real. Uma cobrança pode
--                          ter N pagamentos → pagamento parcial "de graça"
--                          (soma dos pagamentos vs. valor da cobrança,
--                          sempre calculado, nunca um status que possa
--                          dessincronizar da realidade).
--
-- `financial_accounts.initial_balance` é atributo da conta, nunca um
-- lançamento — não existe linha de "receita" fake pro saldo inicial; o
-- saldo é sempre calculado (initial_balance + pagamentos daquela conta
-- desde initial_balance_date).
--
-- `financial_categories`/`financial_reference_types` são tabelas de
-- verdade (não enum/check hardcoded) — editáveis pela UI, sem migration.
--
-- Mesma disciplina de client_id em `meetings`/`work_items`: os FKs pra
-- `clients`/`client_services`/`financial_categories`/
-- `financial_reference_types` aqui garantem que o id EXISTE, mas não que é
-- do MESMO space — isso continua sendo responsabilidade da Server Action
-- (mesmo padrão de `assertClientBelongsToSpace`), igual meetings/work_items.
--
-- COMO EXECUTAR: Supabase Dashboard → SQL Editor → New query → colar este
-- arquivo inteiro → Run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Contas financeiras (Nubank, Mercado Pago, Caixa...)
-- -----------------------------------------------------------------------------

create table if not exists public.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  name text not null,
  initial_balance numeric(12, 2) not null default 0,
  initial_balance_date date not null default current_date,
  is_active boolean not null default true,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (space_id, name)
);

comment on table public.financial_accounts is
  'Saldo NUNCA é uma coluna própria — é sempre calculado como '
  'initial_balance + soma de financial_payments.amount daquela conta com '
  'payment_date >= initial_balance_date. Isso evita o saldo inicial '
  'aparecer como "receita" em qualquer relatório.';

create index if not exists idx_financial_accounts_space_id on public.financial_accounts (space_id);

drop trigger if exists set_updated_at on public.financial_accounts;
create trigger set_updated_at
  before update on public.financial_accounts
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 2. Categorias e "Referente a" — tabelas editáveis, não enum fixo
-- -----------------------------------------------------------------------------

create table if not exists public.financial_categories (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  kind text not null check (kind in ('entrada', 'saida')),
  name text not null,
  is_active boolean not null default true,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (space_id, kind, name)
);

create index if not exists idx_financial_categories_space_id on public.financial_categories (space_id);

drop trigger if exists set_updated_at on public.financial_categories;
create trigger set_updated_at
  before update on public.financial_categories
  for each row execute function public.set_updated_at();

create table if not exists public.financial_reference_types (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (space_id, name)
);

comment on table public.financial_reference_types is
  '"Referente a" (Criação/Implantação, Mensalidade, Manutenção, Renovação, '
  'Parcela, Adicional/Extra, Outro) — separado de category e de service: '
  'category é a NATUREZA do gasto/receita (Hospedagem, Marketing...), '
  'reference_type é o MOTIVO da cobrança dentro de um contrato '
  '(mesma Landing Page pode gerar cobrança de criação OU de manutenção).';

create index if not exists idx_financial_reference_types_space_id on public.financial_reference_types (space_id);

drop trigger if exists set_updated_at on public.financial_reference_types;
create trigger set_updated_at
  before update on public.financial_reference_types
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 3. Origem — a decisão financeira em si (único/parcelado/recorrente)
-- -----------------------------------------------------------------------------

create table if not exists public.financial_origins (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,

  kind text not null check (kind in ('entrada', 'saida')),
  origin_type text not null check (origin_type in ('unico', 'parcelado', 'recorrente')),
  description text not null,

  client_id uuid references public.clients (id) on delete set null,
  client_service_id uuid references public.client_services (id) on delete set null,
  reference_type_id uuid references public.financial_reference_types (id) on delete set null,
  category_id uuid references public.financial_categories (id) on delete set null,
  supplier_name text,

  -- Só relevante quando origin_type = 'parcelado'.
  installment_count int,

  -- Só relevante quando origin_type = 'recorrente'.
  recurrence_frequency text check (
    recurrence_frequency in ('semanal', 'mensal', 'a_cada_x_meses', 'trimestral', 'semestral', 'anual', 'customizado')
  ),
  recurrence_interval int,
  recurrence_end_type text check (recurrence_end_type in ('nunca', 'em_data', 'apos_ocorrencias')),
  recurrence_end_date date,
  recurrence_end_occurrences int,

  is_active boolean not null default true,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint financial_origins_supplier_only_saida check (
    (kind = 'entrada' and supplier_name is null) or kind = 'saida'
  )
);

comment on table public.financial_origins is
  'A "compra/contrato" em si. Até uma movimentação única tem uma origem, '
  'de uma parcela só — nunca um caso especial sem origin_id. MRR usa o '
  'estado ATUAL de origins recorrentes ativas (deliberadamente diferente '
  'do valor congelado em financial_charges já geradas): MRR responde '
  '"quanto eu faturaria por mês hoje", não "quanto eu já faturei".';

create index if not exists idx_financial_origins_space_id on public.financial_origins (space_id);
create index if not exists idx_financial_origins_client_id on public.financial_origins (client_id);

drop trigger if exists set_updated_at on public.financial_origins;
create trigger set_updated_at
  before update on public.financial_origins
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 4. Cobrança — cada parcela/ocorrência individual (o "o que é devido")
-- -----------------------------------------------------------------------------

create table if not exists public.financial_charges (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  origin_id uuid not null references public.financial_origins (id) on delete cascade,

  kind text not null check (kind in ('entrada', 'saida')),
  description text not null,

  -- Copiados da origem no momento de gerar a cobrança — nunca lidos "ao
  -- vivo" dela depois. Se o contrato mudar de preço, só cobranças NOVAS
  -- (ainda não geradas) saem com o valor novo.
  client_id uuid references public.clients (id) on delete set null,
  client_service_id uuid references public.client_services (id) on delete set null,
  reference_type_id uuid references public.financial_reference_types (id) on delete set null,
  category_id uuid references public.financial_categories (id) on delete set null,
  supplier_name text,

  -- Só preenchido quando a origem é 'parcelado' (1/3, 2/3, 3/3...).
  installment_number int,
  installment_total int,

  original_amount numeric(12, 2) not null check (original_amount >= 0),
  discount_amount numeric(12, 2) not null default 0 check (discount_amount >= 0),
  addition_amount numeric(12, 2) not null default 0 check (addition_amount >= 0),
  amount numeric(12, 2) generated always as (original_amount - discount_amount + addition_amount) stored,

  due_date date not null,
  -- Competência (ex.: "Setembro/2026") — separado de due_date (vencimento)
  -- e de financial_payments.payment_date (quando foi de fato pago).
  competency_date date,

  -- Pendente/parcial/pago NUNCA é coluna — é sempre calculado a partir da
  -- soma de financial_payments ligados a esta cobrança. `status` aqui só
  -- guarda se a cobrança em si foi anulada (cobrança cancelada não entra
  -- em contas a receber/pagar nem em nenhum relatório).
  status text not null default 'ativo' check (status in ('ativo', 'cancelado')),
  notes text,

  created_by uuid not null references public.profiles (id),
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.financial_charges is
  'Uma linha por cobrança/obrigação individual. Pendente/parcial/pago é '
  'SEMPRE calculado (soma de financial_payments vs. amount), nunca um '
  'campo que possa dessincronizar. "Editar este e os próximos" = update '
  'em charges do mesmo origin_id com due_date >= esta E sem nenhum '
  'pagamento registrado ainda — nunca em cobrança já paga.';

create index if not exists idx_financial_charges_space_id on public.financial_charges (space_id);
create index if not exists idx_financial_charges_origin_id on public.financial_charges (origin_id);
create index if not exists idx_financial_charges_due_date on public.financial_charges (space_id, due_date);
create index if not exists idx_financial_charges_client_id on public.financial_charges (client_id);

drop trigger if exists set_updated_at on public.financial_charges;
create trigger set_updated_at
  before update on public.financial_charges
  for each row execute function public.set_updated_at();

-- `space_id`/`kind` são preenchidos/validados a partir da origem — nunca
-- escritos manualmente, mesma convenção de enforce_meeting_participant.
create or replace function public.enforce_financial_charge_space()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_kind text;
begin
  select space_id, kind into v_space_id, v_kind from public.financial_origins where id = new.origin_id;

  if v_space_id is null then
    raise exception 'Origem financeira não encontrada.';
  end if;

  new.space_id := v_space_id;

  if new.kind is distinct from v_kind then
    raise exception 'O tipo (entrada/saída) da cobrança precisa ser igual ao da origem.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_financial_charge_space on public.financial_charges;
create trigger enforce_financial_charge_space
  before insert or update on public.financial_charges
  for each row execute function public.enforce_financial_charge_space();

-- -----------------------------------------------------------------------------
-- 5. Pagamento — cada movimento de caixa real (o "o que entrou/saiu")
-- -----------------------------------------------------------------------------

create table if not exists public.financial_payments (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  charge_id uuid not null references public.financial_charges (id) on delete cascade,

  amount numeric(12, 2) not null check (amount > 0),
  payment_date date not null,
  payment_method text not null check (
    payment_method in ('pix', 'dinheiro', 'debito', 'credito', 'boleto', 'transferencia', 'outro')
  ),
  account_id uuid not null references public.financial_accounts (id),

  notes text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.financial_payments is
  'Uma cobrança pode ter VÁRIOS pagamentos (recebimento/pagamento '
  'parcial) — soma de amount aqui vs. financial_charges.amount decide '
  'pendente/parcial/pago, sempre calculado. payment_date é a data REAL do '
  'movimento; created_at é só quando foi cadastrado no sistema.';

create index if not exists idx_financial_payments_space_id on public.financial_payments (space_id);
create index if not exists idx_financial_payments_charge_id on public.financial_payments (charge_id);
create index if not exists idx_financial_payments_account_id on public.financial_payments (account_id);
create index if not exists idx_financial_payments_payment_date on public.financial_payments (space_id, payment_date);

drop trigger if exists set_updated_at on public.financial_payments;
create trigger set_updated_at
  before update on public.financial_payments
  for each row execute function public.set_updated_at();

create or replace function public.enforce_financial_payment_space()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
begin
  select space_id into v_space_id from public.financial_charges where id = new.charge_id;

  if v_space_id is null then
    raise exception 'Cobrança financeira não encontrada.';
  end if;

  new.space_id := v_space_id;
  return new;
end;
$$;

drop trigger if exists enforce_financial_payment_space on public.financial_payments;
create trigger enforce_financial_payment_space
  before insert or update on public.financial_payments
  for each row execute function public.enforce_financial_payment_space();

-- -----------------------------------------------------------------------------
-- 6. RLS — as 6 tabelas, todas via has_module_permission(space_id,
-- 'financeiro', ação). Quem não tem `financeiro.view` não lê NENHUMA
-- linha de nenhuma das 6 tabelas, nem por API direta — não é um filtro de
-- UI, é RLS de verdade no Postgres.
-- -----------------------------------------------------------------------------

alter table public.financial_accounts enable row level security;
alter table public.financial_categories enable row level security;
alter table public.financial_reference_types enable row level security;
alter table public.financial_origins enable row level security;
alter table public.financial_charges enable row level security;
alter table public.financial_payments enable row level security;

drop policy if exists financial_accounts_select on public.financial_accounts;
create policy financial_accounts_select on public.financial_accounts for select
  using (public.has_module_permission(space_id, 'financeiro', 'view'));
drop policy if exists financial_accounts_insert on public.financial_accounts;
create policy financial_accounts_insert on public.financial_accounts for insert
  with check (public.has_module_permission(space_id, 'financeiro', 'create') and created_by = auth.uid());
drop policy if exists financial_accounts_update on public.financial_accounts;
create policy financial_accounts_update on public.financial_accounts for update
  using (public.has_module_permission(space_id, 'financeiro', 'edit'))
  with check (public.has_module_permission(space_id, 'financeiro', 'edit'));
drop policy if exists financial_accounts_delete on public.financial_accounts;
create policy financial_accounts_delete on public.financial_accounts for delete
  using (public.has_module_permission(space_id, 'financeiro', 'delete'));

drop policy if exists financial_categories_select on public.financial_categories;
create policy financial_categories_select on public.financial_categories for select
  using (public.has_module_permission(space_id, 'financeiro', 'view'));
drop policy if exists financial_categories_insert on public.financial_categories;
create policy financial_categories_insert on public.financial_categories for insert
  with check (public.has_module_permission(space_id, 'financeiro', 'create') and created_by = auth.uid());
drop policy if exists financial_categories_update on public.financial_categories;
create policy financial_categories_update on public.financial_categories for update
  using (public.has_module_permission(space_id, 'financeiro', 'edit'))
  with check (public.has_module_permission(space_id, 'financeiro', 'edit'));
drop policy if exists financial_categories_delete on public.financial_categories;
create policy financial_categories_delete on public.financial_categories for delete
  using (public.has_module_permission(space_id, 'financeiro', 'delete'));

drop policy if exists financial_reference_types_select on public.financial_reference_types;
create policy financial_reference_types_select on public.financial_reference_types for select
  using (public.has_module_permission(space_id, 'financeiro', 'view'));
drop policy if exists financial_reference_types_insert on public.financial_reference_types;
create policy financial_reference_types_insert on public.financial_reference_types for insert
  with check (public.has_module_permission(space_id, 'financeiro', 'create') and created_by = auth.uid());
drop policy if exists financial_reference_types_update on public.financial_reference_types;
create policy financial_reference_types_update on public.financial_reference_types for update
  using (public.has_module_permission(space_id, 'financeiro', 'edit'))
  with check (public.has_module_permission(space_id, 'financeiro', 'edit'));
drop policy if exists financial_reference_types_delete on public.financial_reference_types;
create policy financial_reference_types_delete on public.financial_reference_types for delete
  using (public.has_module_permission(space_id, 'financeiro', 'delete'));

drop policy if exists financial_origins_select on public.financial_origins;
create policy financial_origins_select on public.financial_origins for select
  using (public.has_module_permission(space_id, 'financeiro', 'view'));
drop policy if exists financial_origins_insert on public.financial_origins;
create policy financial_origins_insert on public.financial_origins for insert
  with check (public.has_module_permission(space_id, 'financeiro', 'create') and created_by = auth.uid());
drop policy if exists financial_origins_update on public.financial_origins;
create policy financial_origins_update on public.financial_origins for update
  using (public.has_module_permission(space_id, 'financeiro', 'edit'))
  with check (public.has_module_permission(space_id, 'financeiro', 'edit'));
drop policy if exists financial_origins_delete on public.financial_origins;
create policy financial_origins_delete on public.financial_origins for delete
  using (public.has_module_permission(space_id, 'financeiro', 'delete'));

drop policy if exists financial_charges_select on public.financial_charges;
create policy financial_charges_select on public.financial_charges for select
  using (public.has_module_permission(space_id, 'financeiro', 'view'));
drop policy if exists financial_charges_insert on public.financial_charges;
create policy financial_charges_insert on public.financial_charges for insert
  with check (public.has_module_permission(space_id, 'financeiro', 'create') and created_by = auth.uid());
drop policy if exists financial_charges_update on public.financial_charges;
create policy financial_charges_update on public.financial_charges for update
  using (public.has_module_permission(space_id, 'financeiro', 'edit'))
  with check (public.has_module_permission(space_id, 'financeiro', 'edit'));
drop policy if exists financial_charges_delete on public.financial_charges;
create policy financial_charges_delete on public.financial_charges for delete
  using (public.has_module_permission(space_id, 'financeiro', 'delete'));

drop policy if exists financial_payments_select on public.financial_payments;
create policy financial_payments_select on public.financial_payments for select
  using (public.has_module_permission(space_id, 'financeiro', 'view'));
-- Registrar um pagamento (marcar como recebido/pago, mesmo que parcial) é
-- tratado como "edit" do financeiro — mesma convenção de
-- meeting_participants_insert (migration 003).
drop policy if exists financial_payments_insert on public.financial_payments;
create policy financial_payments_insert on public.financial_payments for insert
  with check (public.has_module_permission(space_id, 'financeiro', 'edit') and created_by = auth.uid());
drop policy if exists financial_payments_update on public.financial_payments;
create policy financial_payments_update on public.financial_payments for update
  using (public.has_module_permission(space_id, 'financeiro', 'edit'))
  with check (public.has_module_permission(space_id, 'financeiro', 'edit'));
drop policy if exists financial_payments_delete on public.financial_payments;
create policy financial_payments_delete on public.financial_payments for delete
  using (public.has_module_permission(space_id, 'financeiro', 'edit'));

grant select, insert, update, delete on public.financial_accounts to authenticated;
grant select, insert, update, delete on public.financial_categories to authenticated;
grant select, insert, update, delete on public.financial_reference_types to authenticated;
grant select, insert, update, delete on public.financial_origins to authenticated;
grant select, insert, update, delete on public.financial_charges to authenticated;
grant select, insert, update, delete on public.financial_payments to authenticated;

-- =============================================================================
-- Fim da migration 007.
--
-- O que NÃO mudou: nenhuma tabela/policy/trigger/função das migrations
-- 001-006 foi tocada.
--
-- O que isso desbloqueia (implementação de código, só depois de executar):
--   - Financeiro real em /visionario/financeiro (dashboard, Nova
--     movimentação, contas a receber/pagar, previsão de caixa,
--     comparativo mensal) substituindo o mock atual;
--   - Server Actions vão gerar `financial_categories`/
--     `financial_reference_types` padrão (seed por space, na primeira vez
--     que o Financeiro for aberto) — igual ao bootstrap do Visionário Dev,
--     sem exigir passo manual;
--   - geração lazy de cobranças recorrentes (idempotente, sem cron job).
-- =============================================================================
