-- =============================================================================
-- VSPlanner — Parcelamentos editáveis + Cartões de crédito (Financeiro Pessoal)
-- Migration: 20261113100000_installments_credit_cards.sql
-- Requer: 007_financial.sql, 20261111100000_financial_payment_undo.sql (já aplicadas).
--
-- ADITIVA e idempotente. Não apaga, não recalcula e não altera nenhum
-- lançamento, pagamento ou saldo existente:
--   * fin_reschedule_charges: muda vencimentos de parcelas (somente esta /
--     esta e as próximas) numa transação, sem tocar em valores/pagamentos;
--   * fin_replan_installments: edição completa do parcelamento (quantidade,
--     valores, vencimentos). Parcela com pagamento mantém o valor; parcela
--     removida é CANCELADA (nunca apagada);
--   * Cartões: credit_cards, credit_card_invoices, credit_card_purchases,
--     credit_card_purchase_items, credit_card_subscriptions (+ eventos).
--
-- Como o dinheiro anda (sem dupla contagem):
--   * comprar no cartão NÃO mexe em conta: a compra vira item da fatura;
--   * cada fatura tem UMA cobrança em financial_charges (card_invoice_id),
--     com vencimento = vencimento da fatura → aparece em A pagar, calendário,
--     notificações e relatórios como qualquer conta;
--   * pagar a fatura = financial_payments nessa cobrança (fin_register_payment),
--     então só o pagamento sai da conta, uma única vez; desfazer usa o
--     fin_undo_payment existente (com ou sem devolução);
--   * cartão de terceiro: a "fatura" é só a SUA parte; "Pagar ao titular"
--     abate as faturas mais antigas primeiro.
--
-- COMO EXECUTAR: Supabase Dashboard → SQL Editor → New query → colar → Run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Parcelamentos: mudar vencimentos (somente esta / esta e as próximas)
-- -----------------------------------------------------------------------------

create or replace function public.fin_charge_paid(p_charge_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(amount), 0)::numeric(12, 2) from public.financial_payments where charge_id = p_charge_id
$$;

create or replace function public.fin_reschedule_charges(p_origin_id uuid, p_ids uuid[], p_dates date[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_origin public.financial_origins;
  v_charge public.financial_charges;
  v_n integer := coalesce(array_length(p_ids, 1), 0);
  v_old_due date[] := '{}';
  v_old_comp date[] := '{}';
  i integer;
begin
  if v_uid is null then raise exception 'Sessão expirada. Entre novamente.' using errcode = 'P0001'; end if;
  if v_n = 0 then return 0; end if;
  if v_n <> coalesce(array_length(p_dates, 1), 0) then raise exception 'Lista de vencimentos inválida.' using errcode = 'P0001'; end if;

  select * into v_origin from public.financial_origins where id = p_origin_id for update;
  if v_origin.id is null then raise exception 'Parcelamento não encontrado.' using errcode = 'P0001'; end if;
  if not public.has_module_permission(v_origin.space_id, 'financeiro', 'edit') then
    raise exception 'Sem permissão para editar este financeiro.' using errcode = 'P0001';
  end if;

  for i in 1..v_n loop
    select * into v_charge from public.financial_charges where id = p_ids[i] for update;
    if v_charge.id is null or v_charge.origin_id <> p_origin_id then raise exception 'Parcela não pertence a este parcelamento.' using errcode = 'P0001'; end if;
    if v_charge.card_invoice_id is not null then raise exception 'Fatura de cartão: o vencimento segue o cartão.' using errcode = 'P0001'; end if;
    if v_charge.status = 'cancelado' then raise exception 'A parcela % foi cancelada.', coalesce(v_charge.installment_number::text, '') using errcode = 'P0001'; end if;
    if p_dates[i] is null then raise exception 'Informe todas as datas.' using errcode = 'P0001'; end if;
    if v_charge.amount > 0 and public.fin_charge_paid(v_charge.id) >= v_charge.amount then
      raise exception 'A parcela % já está quitada — o vencimento dela não muda.', coalesce(v_charge.installment_number::text, '') using errcode = 'P0001';
    end if;
    v_old_due := v_old_due || v_charge.due_date;
    v_old_comp := v_old_comp || v_charge.competency_date;
  end loop;

  -- Duas fases: o índice único (origem, vencimento) não aceita trocar datas entre parcelas diretamente.
  for i in 1..v_n loop
    update public.financial_charges set due_date = date '2999-01-01' + i where id = p_ids[i];
  end loop;
  begin
    for i in 1..v_n loop
      update public.financial_charges
         set due_date = p_dates[i],
             -- Competência automática (mês do vencimento) acompanha a nova data; a escolhida à mão é mantida.
             competency_date = case when v_old_comp[i] is null or v_old_comp[i] = date_trunc('month', v_old_due[i])::date
                                    then date_trunc('month', p_dates[i])::date else v_old_comp[i] end,
             updated_by = v_uid
       where id = p_ids[i];
    end loop;
  exception when unique_violation then
    raise exception 'Duas parcelas deste parcelamento ficariam com o mesmo vencimento. Escolha outra data.' using errcode = 'P0001';
  end;
  return v_n;
end;
$$;

grant execute on function public.fin_reschedule_charges(uuid, uuid[], date[]) to authenticated;
grant execute on function public.fin_charge_paid(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Parcelamentos: edição completa (quantidade, valores, vencimentos)
--    p_rows = [{ "id": uuid|null, "number": int, "amount": numeric, "due_date": date }]
--    Parcelas ativas fora da lista são CANCELADAS (só se não tiverem pagamento).
-- -----------------------------------------------------------------------------

create or replace function public.fin_replan_installments(p_origin_id uuid, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_origin public.financial_origins;
  v_template public.financial_charges;
  v_charge public.financial_charges;
  v_row jsonb;
  v_count integer := jsonb_array_length(coalesce(p_rows, '[]'::jsonb));
  v_id uuid;
  v_number integer;
  v_amount numeric(12, 2);
  v_due date;
  v_paid numeric(12, 2);
  v_base text;
  v_listed uuid[] := '{}';
  v_created integer := 0;
  v_updated integer := 0;
  v_cancelled integer := 0;
  v_k integer := 0;
  v_old jsonb := '{}'::jsonb;
begin
  if v_uid is null then raise exception 'Sessão expirada. Entre novamente.' using errcode = 'P0001'; end if;
  if v_count < 1 or v_count > 120 then raise exception 'O parcelamento precisa ter de 1 a 120 parcelas.' using errcode = 'P0001'; end if;

  select * into v_origin from public.financial_origins where id = p_origin_id for update;
  if v_origin.id is null then raise exception 'Parcelamento não encontrado.' using errcode = 'P0001'; end if;
  if v_origin.origin_type <> 'parcelado' then raise exception 'Só parcelamentos podem ser reorganizados assim.' using errcode = 'P0001'; end if;
  if not public.has_module_permission(v_origin.space_id, 'financeiro', 'edit') then
    raise exception 'Sem permissão para editar este financeiro.' using errcode = 'P0001';
  end if;

  select * into v_template from public.financial_charges where origin_id = p_origin_id order by installment_number nulls last, due_date limit 1;
  v_base := regexp_replace(coalesce(v_template.description, v_origin.description), '\s*\(\d+/\d+\)\s*$', '');

  -- Validação completa antes de qualquer escrita.
  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_id := nullif(v_row ->> 'id', '')::uuid;
    v_number := (v_row ->> 'number')::integer;
    v_amount := round((v_row ->> 'amount')::numeric, 2);
    v_due := (v_row ->> 'due_date')::date;
    if v_number is null or v_number < 1 or v_due is null or v_amount is null or v_amount <= 0 then
      raise exception 'Parcela inválida na lista.' using errcode = 'P0001';
    end if;
    if v_id is not null then
      select * into v_charge from public.financial_charges where id = v_id for update;
      if v_charge.id is null or v_charge.origin_id <> p_origin_id then raise exception 'Parcela não pertence a este parcelamento.' using errcode = 'P0001'; end if;
      v_paid := public.fin_charge_paid(v_id);
      if v_paid > 0 and v_amount <> v_charge.amount then
        raise exception 'A parcela % já tem pagamento — o valor dela não muda.', v_charge.installment_number using errcode = 'P0001';
      end if;
      if v_paid > 0 and v_paid >= v_charge.amount and v_due <> v_charge.due_date then
        raise exception 'A parcela % já está quitada — o vencimento dela não muda.', v_charge.installment_number using errcode = 'P0001';
      end if;
      v_listed := v_listed || v_id;
      v_old := v_old || jsonb_build_object(v_id::text, v_charge.due_date);
    end if;
  end loop;

  if exists (
    select 1 from public.financial_charges c
     where c.origin_id = p_origin_id and c.status = 'ativo' and not (c.id = any (v_listed))
       and public.fin_charge_paid(c.id) > 0
  ) then
    raise exception 'Não é possível remover parcelas que já têm pagamento. Desfaça o pagamento primeiro.' using errcode = 'P0001';
  end if;

  -- Remove (cancela) as ativas fora da lista e libera as datas da lista (duas fases).
  update public.financial_charges set status = 'cancelado', updated_by = v_uid
   where origin_id = p_origin_id and status = 'ativo' and not (id = any (v_listed));
  get diagnostics v_cancelled = row_count;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_id := nullif(v_row ->> 'id', '')::uuid;
    if v_id is not null then
      v_k := v_k + 1;
      update public.financial_charges set due_date = date '2999-01-01' + v_k where id = v_id and due_date <> (v_row ->> 'due_date')::date;
    end if;
  end loop;

  begin
    for v_row in select * from jsonb_array_elements(p_rows) loop
      v_id := nullif(v_row ->> 'id', '')::uuid;
      v_number := (v_row ->> 'number')::integer;
      v_amount := round((v_row ->> 'amount')::numeric, 2);
      v_due := (v_row ->> 'due_date')::date;
      if v_id is not null then
        select * into v_charge from public.financial_charges where id = v_id;
        update public.financial_charges
           set due_date = v_due,
               competency_date = case when v_charge.competency_date is null or v_charge.competency_date = date_trunc('month', (v_old ->> v_id::text)::date)::date
                                      then date_trunc('month', v_due)::date else v_charge.competency_date end,
               -- Valor de parcela sem pagamento: o desconto/acréscimo dela é mantido.
               original_amount = case when public.fin_charge_paid(v_id) > 0 then original_amount
                                      else greatest(v_amount + discount_amount - addition_amount, 0) end,
               installment_number = v_number,
               installment_total = v_count,
               description = v_base || ' (' || v_number || '/' || v_count || ')',
               status = 'ativo',
               updated_by = v_uid
         where id = v_id;
        v_updated := v_updated + 1;
      else
        insert into public.financial_charges (space_id, origin_id, kind, description, client_id, client_service_id, reference_type_id,
          category_id, supplier_name, installment_number, installment_total, original_amount, discount_amount, addition_amount,
          due_date, competency_date, notes, created_by)
        values (v_origin.space_id, p_origin_id, v_origin.kind, v_base || ' (' || v_number || '/' || v_count || ')', v_origin.client_id,
          v_origin.client_service_id, coalesce(v_template.reference_type_id, v_origin.reference_type_id),
          coalesce(v_template.category_id, v_origin.category_id), coalesce(v_template.supplier_name, v_origin.supplier_name),
          v_number, v_count, v_amount, 0, 0, v_due, date_trunc('month', v_due)::date, v_template.notes, v_uid);
        v_created := v_created + 1;
      end if;
    end loop;
  exception when unique_violation then
    raise exception 'Duas parcelas ficariam com o mesmo vencimento (inclusive uma parcela cancelada antes). Ajuste o vencimento.' using errcode = 'P0001';
  end;

  update public.financial_origins set installment_count = v_count where id = p_origin_id;
  return jsonb_build_object('created', v_created, 'updated', v_updated, 'cancelled', v_cancelled, 'count', v_count);
end;
$$;

grant execute on function public.fin_replan_installments(uuid, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Cartões de crédito
-- -----------------------------------------------------------------------------

create table if not exists public.credit_cards (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  bank text,
  holder_name text,
  ownership text not null default 'proprio' check (ownership in ('proprio', 'terceiro')),
  nickname text,
  -- Só os 4 últimos dígitos: o número completo, CVV e senha NUNCA são guardados.
  last4 text check (last4 is null or last4 ~ '^[0-9]{4}$'),
  credit_limit numeric(12, 2) check (credit_limit is null or credit_limit >= 0),
  closing_day integer not null check (closing_day between 1 and 31),
  due_day integer not null check (due_day between 1 and 31),
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  status text not null default 'ativo' check (status in ('ativo', 'inativo')),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint credit_cards_days_distinct check (closing_day <> due_day),
  constraint credit_cards_third_party_holder check (ownership = 'proprio' or length(trim(coalesce(holder_name, ''))) > 0)
);
create unique index if not exists uq_credit_cards_space_name on public.credit_cards (space_id, lower(name));
create index if not exists idx_credit_cards_space on public.credit_cards (space_id);
drop trigger if exists set_updated_at on public.credit_cards;
create trigger set_updated_at before update on public.credit_cards for each row execute function public.set_updated_at();

create table if not exists public.credit_card_invoices (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  card_id uuid not null references public.credit_cards (id) on delete restrict,
  -- Mês do VENCIMENTO da fatura (yyyy-MM-01).
  reference_month date not null check (reference_month = date_trunc('month', reference_month)::date),
  -- Datas gravadas na criação: mudar o fechamento do cartão não reescreve fatura com pagamento.
  closing_date date not null,
  due_date date not null,
  charge_id uuid references public.financial_charges (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (card_id, reference_month)
);
create index if not exists idx_credit_card_invoices_space on public.credit_card_invoices (space_id);
create index if not exists idx_credit_card_invoices_charge on public.credit_card_invoices (charge_id);
drop trigger if exists set_updated_at on public.credit_card_invoices;
create trigger set_updated_at before update on public.credit_card_invoices for each row execute function public.set_updated_at();

alter table public.financial_charges add column if not exists card_invoice_id uuid references public.credit_card_invoices (id) on delete set null;
create unique index if not exists uq_financial_charges_card_invoice on public.financial_charges (card_invoice_id) where card_invoice_id is not null;
comment on column public.financial_charges.card_invoice_id is
  'Cobrança que representa uma fatura de cartão (migration 20261113100000). Valor/vencimento só mudam pelas funções card_*.';

create table if not exists public.credit_card_subscriptions (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  card_id uuid not null references public.credit_cards (id) on delete restrict,
  description text not null check (length(trim(description)) > 0),
  category_id uuid references public.financial_categories (id) on delete set null,
  amount numeric(12, 2) not null check (amount > 0),
  billing_day integer not null check (billing_day between 1 and 31),
  start_date date not null,
  end_date date,
  status text not null default 'ativa' check (status in ('ativa', 'pausada', 'cancelada')),
  -- Última data de cobrança já considerada: nada até ela é gerado de novo.
  generated_through date,
  notes text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint credit_card_subscriptions_end check (end_date is null or end_date >= start_date)
);
create index if not exists idx_credit_card_subscriptions_space on public.credit_card_subscriptions (space_id);
drop trigger if exists set_updated_at on public.credit_card_subscriptions;
create trigger set_updated_at before update on public.credit_card_subscriptions for each row execute function public.set_updated_at();

create table if not exists public.credit_card_subscription_events (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.credit_card_subscriptions (id) on delete cascade,
  space_id uuid not null references public.spaces (id) on delete cascade,
  action text not null check (action in ('criada', 'pausada', 'reativada', 'cancelada', 'valor_alterado', 'editada')),
  effective_date date not null,
  note text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index if not exists idx_credit_card_subscription_events_sub on public.credit_card_subscription_events (subscription_id, created_at);

create table if not exists public.credit_card_purchases (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  card_id uuid not null references public.credit_cards (id) on delete restrict,
  description text not null check (length(trim(description)) > 0),
  category_id uuid references public.financial_categories (id) on delete set null,
  purchase_date date not null,
  purchase_type text not null check (purchase_type in ('avista', 'parcelada', 'assinatura')),
  total_amount numeric(12, 2) not null check (total_amount > 0),
  installment_count integer not null default 1 check (installment_count between 1 and 120),
  first_invoice_month date not null,
  subscription_id uuid references public.credit_card_subscriptions (id) on delete set null,
  subscription_date date,
  status text not null default 'ativa' check (status in ('ativa', 'cancelada')),
  notes text,
  converted_from_origin_id uuid references public.financial_origins (id) on delete set null,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Uma única cobrança por assinatura e data: nunca cobra o mesmo mês duas vezes.
create unique index if not exists uq_credit_card_purchases_subscription_date
  on public.credit_card_purchases (subscription_id, subscription_date) where subscription_id is not null;
create index if not exists idx_credit_card_purchases_space on public.credit_card_purchases (space_id, purchase_date desc);
create index if not exists idx_credit_card_purchases_card on public.credit_card_purchases (card_id);
drop trigger if exists set_updated_at on public.credit_card_purchases;
create trigger set_updated_at before update on public.credit_card_purchases for each row execute function public.set_updated_at();

create table if not exists public.credit_card_purchase_items (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  purchase_id uuid not null references public.credit_card_purchases (id) on delete restrict,
  invoice_id uuid not null references public.credit_card_invoices (id) on delete restrict,
  item_type text not null default 'parcela' check (item_type in ('parcela', 'estorno', 'ajuste')),
  installment_number integer,
  installment_total integer,
  amount numeric(12, 2) not null check (amount <> 0),
  description text,
  status text not null default 'ativo' check (status in ('ativo', 'cancelado')),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint credit_card_items_sign check ((item_type = 'parcela' and amount > 0) or (item_type = 'estorno' and amount < 0) or item_type = 'ajuste')
);
create unique index if not exists uq_credit_card_items_installment
  on public.credit_card_purchase_items (purchase_id, installment_number) where item_type = 'parcela' and status = 'ativo';
create index if not exists idx_credit_card_items_invoice on public.credit_card_purchase_items (invoice_id);
create index if not exists idx_credit_card_items_space on public.credit_card_purchase_items (space_id);

-- RLS: mesma regra do Financeiro (has_module_permission do space).
alter table public.credit_cards enable row level security;
alter table public.credit_card_invoices enable row level security;
alter table public.credit_card_subscriptions enable row level security;
alter table public.credit_card_subscription_events enable row level security;
alter table public.credit_card_purchases enable row level security;
alter table public.credit_card_purchase_items enable row level security;

drop policy if exists credit_cards_select on public.credit_cards;
create policy credit_cards_select on public.credit_cards for select using (public.has_module_permission(space_id, 'financeiro', 'view'));
drop policy if exists credit_cards_insert on public.credit_cards;
create policy credit_cards_insert on public.credit_cards for insert
  with check (public.has_module_permission(space_id, 'financeiro', 'create') and created_by = auth.uid());
drop policy if exists credit_cards_update on public.credit_cards;
create policy credit_cards_update on public.credit_cards for update
  using (public.has_module_permission(space_id, 'financeiro', 'edit'))
  with check (public.has_module_permission(space_id, 'financeiro', 'edit'));
drop policy if exists credit_cards_delete on public.credit_cards;
create policy credit_cards_delete on public.credit_cards for delete using (public.has_module_permission(space_id, 'financeiro', 'delete'));

drop policy if exists credit_card_invoices_select on public.credit_card_invoices;
create policy credit_card_invoices_select on public.credit_card_invoices for select using (public.has_module_permission(space_id, 'financeiro', 'view'));
drop policy if exists credit_card_subscriptions_select on public.credit_card_subscriptions;
create policy credit_card_subscriptions_select on public.credit_card_subscriptions for select using (public.has_module_permission(space_id, 'financeiro', 'view'));
drop policy if exists credit_card_subscription_events_select on public.credit_card_subscription_events;
create policy credit_card_subscription_events_select on public.credit_card_subscription_events for select using (public.has_module_permission(space_id, 'financeiro', 'view'));
drop policy if exists credit_card_purchases_select on public.credit_card_purchases;
create policy credit_card_purchases_select on public.credit_card_purchases for select using (public.has_module_permission(space_id, 'financeiro', 'view'));
drop policy if exists credit_card_purchase_items_select on public.credit_card_purchase_items;
create policy credit_card_purchase_items_select on public.credit_card_purchase_items for select using (public.has_module_permission(space_id, 'financeiro', 'view'));

grant select, insert, update, delete on public.credit_cards to authenticated;
-- Faturas, compras, itens e assinaturas só mudam pelas funções abaixo (transação + regras).
grant select on public.credit_card_invoices, public.credit_card_subscriptions, public.credit_card_subscription_events,
  public.credit_card_purchases, public.credit_card_purchase_items to authenticated;
revoke insert, update, delete on public.credit_card_invoices, public.credit_card_subscriptions, public.credit_card_subscription_events,
  public.credit_card_purchases, public.credit_card_purchase_items from authenticated, anon;

-- Valor/vencimento da cobrança de uma fatura só muda pelas funções do cartão.
create or replace function public.fin_card_invoice_charge_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(old.card_invoice_id, new.card_invoice_id) is not null
     and coalesce(current_setting('app.card_sync', true), '') <> '1'
     and (new.original_amount is distinct from old.original_amount
          or new.due_date is distinct from old.due_date
          or new.card_invoice_id is distinct from old.card_invoice_id
          or new.status is distinct from old.status) then
    raise exception 'Esta cobrança é a fatura de um cartão: altere as compras pelo módulo Cartões de crédito.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists fin_card_invoice_charge_guard on public.financial_charges;
create trigger fin_card_invoice_charge_guard before update on public.financial_charges
  for each row execute function public.fin_card_invoice_charge_guard();

-- -----------------------------------------------------------------------------
-- 4. Funções internas do cartão
-- -----------------------------------------------------------------------------

create or replace function public.card_last_day(p_month date)
returns integer
language sql
immutable
as $$ select extract(day from (date_trunc('month', p_month) + interval '1 month - 1 day'))::integer $$;

-- Fechamento/vencimento da fatura do mês (mês do vencimento). Mesma regra de lib/finance/credit-card.ts.
create or replace function public.card_cycle_dates(p_month date, p_closing integer, p_due integer, out closing_date date, out due_date date)
language plpgsql
immutable
as $$
declare
  m date := date_trunc('month', p_month)::date;
  cm date;
begin
  due_date := m + (least(p_due, public.card_last_day(m)) - 1);
  cm := case when p_closing < p_due then m else (m - interval '1 month')::date end;
  closing_date := cm + (least(p_closing, public.card_last_day(cm)) - 1);
end;
$$;

create or replace function public.card_invoice_paid(p_invoice_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select c.status = 'ativo' and c.amount > 0 and public.fin_charge_paid(c.id) >= c.amount
      from public.credit_card_invoices i join public.financial_charges c on c.id = i.charge_id
     where i.id = p_invoice_id), false)
$$;

create or replace function public.card_invoice_for(p_card_id uuid, p_month date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card public.credit_cards;
  v_id uuid;
  v_dates record;
  m date := date_trunc('month', p_month)::date;
begin
  select id into v_id from public.credit_card_invoices where card_id = p_card_id and reference_month = m;
  if v_id is not null then return v_id; end if;
  select * into v_card from public.credit_cards where id = p_card_id;
  select * into v_dates from public.card_cycle_dates(m, v_card.closing_day, v_card.due_day);
  insert into public.credit_card_invoices (space_id, card_id, reference_month, closing_date, due_date)
  values (v_card.space_id, p_card_id, m, v_dates.closing_date, v_dates.due_date)
  on conflict (card_id, reference_month) do nothing
  returning id into v_id;
  if v_id is null then select id into v_id from public.credit_card_invoices where card_id = p_card_id and reference_month = m; end if;
  return v_id;
end;
$$;

-- Primeira fatura a partir do mês que ainda aceita lançamentos (não quitada).
create or replace function public.card_open_month_from(p_card_id uuid, p_month date)
returns date
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  m date := date_trunc('month', p_month)::date;
  v_inv uuid;
  k integer := 0;
begin
  loop
    select id into v_inv from public.credit_card_invoices where card_id = p_card_id and reference_month = m;
    exit when v_inv is null or not public.card_invoice_paid(v_inv) or k > 36;
    m := (m + interval '1 month')::date;
    k := k + 1;
  end loop;
  return m;
end;
$$;

-- Mantém a cobrança da fatura igual à soma dos itens ativos.
create or replace function public.card_sync_invoice(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.credit_card_invoices;
  v_card public.credit_cards;
  v_charge public.financial_charges;
  v_total numeric(12, 2);
  v_paid numeric(12, 2);
  v_new_amount numeric(12, 2);
  v_cat uuid;
  v_cat_name text;
  v_origin uuid;
  v_desc text;
begin
  select * into v_inv from public.credit_card_invoices where id = p_invoice_id for update;
  select * into v_card from public.credit_cards where id = v_inv.card_id;
  select coalesce(sum(amount), 0) into v_total from public.credit_card_purchase_items where invoice_id = p_invoice_id and status = 'ativo';
  perform set_config('app.card_sync', '1', true);

  v_desc := case when v_card.ownership = 'terceiro'
    then coalesce(nullif(trim(v_card.nickname), ''), v_card.name) || ' · a pagar para ' || coalesce(v_card.holder_name, 'titular') || ' · ' || to_char(v_inv.reference_month, 'MM/YYYY')
    else 'Fatura ' || coalesce(nullif(trim(v_card.nickname), ''), v_card.name) || ' · ' || to_char(v_inv.reference_month, 'MM/YYYY') end;

  if v_inv.charge_id is not null then select * into v_charge from public.financial_charges where id = v_inv.charge_id for update; end if;

  if v_charge.id is null then
    if v_total <= 0 then return; end if;
    v_cat_name := case when v_card.ownership = 'terceiro' then 'Cartões de terceiros' else 'Fatura de cartão' end;
    insert into public.financial_categories (space_id, kind, name, created_by) values (v_inv.space_id, 'saida', v_cat_name, coalesce(v_uid, v_card.created_by))
    on conflict (space_id, kind, name) do nothing;
    select id into v_cat from public.financial_categories where space_id = v_inv.space_id and kind = 'saida' and name = v_cat_name;
    insert into public.financial_origins (space_id, kind, origin_type, description, category_id, supplier_name, created_by)
    values (v_inv.space_id, 'saida', 'unico', v_desc, v_cat, coalesce(case when v_card.ownership = 'terceiro' then v_card.holder_name end, v_card.bank), coalesce(v_uid, v_card.created_by))
    returning id into v_origin;
    insert into public.financial_charges (space_id, origin_id, kind, description, category_id, supplier_name, original_amount, due_date,
                                          competency_date, card_invoice_id, notes, created_by)
    values (v_inv.space_id, v_origin, 'saida', v_desc, v_cat, coalesce(case when v_card.ownership = 'terceiro' then v_card.holder_name end, v_card.bank),
            v_total, v_inv.due_date, v_inv.reference_month, p_invoice_id, 'Gerada pelo módulo Cartões de crédito.', coalesce(v_uid, v_card.created_by))
    returning * into v_charge;
    update public.credit_card_invoices set charge_id = v_charge.id where id = p_invoice_id;
    return;
  end if;

  v_paid := public.fin_charge_paid(v_charge.id);
  v_new_amount := greatest(v_total, 0) - v_charge.discount_amount + v_charge.addition_amount;
  if v_paid > 0 and v_new_amount < v_paid then
    raise exception 'A fatura % já tem % pago: o total não pode ficar abaixo disso. Registre o crédito numa fatura futura.',
      to_char(v_inv.reference_month, 'MM/YYYY'), replace(v_paid::text, '.', ',') using errcode = 'P0001';
  end if;
  update public.financial_charges
     set original_amount = greatest(v_total, 0),
         due_date = v_inv.due_date,
         description = v_desc,
         status = case when v_total <= 0 and v_paid = 0 then 'cancelado' else 'ativo' end,
         updated_by = coalesce(v_uid, updated_by)
   where id = v_charge.id;
end;
$$;

create or replace function public.card_assert(p_card_id uuid, p_action text)
returns public.credit_cards
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_card public.credit_cards;
begin
  if auth.uid() is null then raise exception 'Sessão expirada. Entre novamente.' using errcode = 'P0001'; end if;
  select * into v_card from public.credit_cards where id = p_card_id;
  if v_card.id is null then raise exception 'Cartão não encontrado.' using errcode = 'P0001'; end if;
  if not public.has_module_permission(v_card.space_id, 'financeiro', p_action) then
    raise exception 'Sem permissão neste financeiro.' using errcode = 'P0001';
  end if;
  return v_card;
end;
$$;

-- Lança as parcelas da compra a partir do 1º mês, pulando faturas já quitadas (nunca altera fatura paga).
create or replace function public.card_insert_items(p_purchase public.credit_card_purchases, p_amounts numeric[])
returns date
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first date := public.card_open_month_from(p_purchase.card_id, p_purchase.first_invoice_month);
  v_n integer := array_length(p_amounts, 1);
  v_inv uuid;
  i integer;
begin
  for i in 1..v_n loop
    v_inv := public.card_invoice_for(p_purchase.card_id, (v_first + make_interval(months => i - 1))::date);
    if public.card_invoice_paid(v_inv) then
      raise exception 'A fatura de % já está paga e não recebe lançamentos novos.', to_char((v_first + make_interval(months => i - 1))::date, 'MM/YYYY') using errcode = 'P0001';
    end if;
    insert into public.credit_card_purchase_items (space_id, purchase_id, invoice_id, item_type, installment_number, installment_total, amount, created_by)
    values (p_purchase.space_id, p_purchase.id, v_inv, 'parcela', i, v_n, round(p_amounts[i], 2), auth.uid());
    perform public.card_sync_invoice(v_inv);
  end loop;
  return v_first;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. RPCs do cartão (chamadas pelas Server Actions)
-- -----------------------------------------------------------------------------

create or replace function public.card_create_purchase(
  p_card_id uuid,
  p_description text,
  p_category_id uuid,
  p_purchase_date date,
  p_type text,
  p_amounts numeric[],
  p_first_month date,
  p_notes text default null,
  p_subscription_id uuid default null,
  p_subscription_date date default null,
  p_converted_from uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card public.credit_cards := public.card_assert(p_card_id, 'create');
  v_purchase public.credit_card_purchases;
  v_n integer := coalesce(array_length(p_amounts, 1), 0);
  v_total numeric(12, 2);
  v_first date;
begin
  if v_card.status <> 'ativo' and p_subscription_id is null and p_converted_from is null then
    raise exception 'Este cartão está inativo.' using errcode = 'P0001';
  end if;
  if p_type not in ('avista', 'parcelada', 'assinatura') then raise exception 'Tipo de compra inválido.' using errcode = 'P0001'; end if;
  if v_n < 1 or v_n > 120 or (p_type = 'parcelada' and v_n < 2 and p_converted_from is null) or (p_type <> 'parcelada' and v_n <> 1) then
    raise exception 'Quantidade de parcelas inválida.' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(p_amounts) a where a is null or round(a, 2) <= 0) then raise exception 'Cada parcela precisa ter valor maior que zero.' using errcode = 'P0001'; end if;
  if p_purchase_date is null then raise exception 'Informe a data da compra.' using errcode = 'P0001'; end if;
  if p_category_id is not null and not exists (select 1 from public.financial_categories where id = p_category_id and space_id = v_card.space_id) then
    raise exception 'Categoria não pertence a este espaço.' using errcode = 'P0001';
  end if;
  if p_subscription_id is not null then
    if not exists (select 1 from public.credit_card_subscriptions where id = p_subscription_id and card_id = p_card_id) then
      raise exception 'Assinatura não pertence a este cartão.' using errcode = 'P0001';
    end if;
    -- Cobrança da assinatura nesta data já existe: não duplica.
    if exists (select 1 from public.credit_card_purchases where subscription_id = p_subscription_id and subscription_date = p_subscription_date) then
      update public.credit_card_subscriptions set generated_through = greatest(coalesce(generated_through, p_subscription_date), p_subscription_date) where id = p_subscription_id;
      return null;
    end if;
  end if;
  select round(sum(round(a, 2)), 2) into v_total from unnest(p_amounts) a;

  insert into public.credit_card_purchases (space_id, card_id, description, category_id, purchase_date, purchase_type, total_amount, installment_count,
    first_invoice_month, subscription_id, subscription_date, notes, converted_from_origin_id, created_by)
  values (v_card.space_id, p_card_id, trim(p_description), p_category_id, p_purchase_date, p_type, v_total, v_n,
    date_trunc('month', coalesce(p_first_month, p_purchase_date))::date, p_subscription_id, p_subscription_date, nullif(trim(p_notes), ''), p_converted_from, auth.uid())
  returning * into v_purchase;

  v_first := public.card_insert_items(v_purchase, p_amounts);
  if v_first <> v_purchase.first_invoice_month then
    update public.credit_card_purchases set first_invoice_month = v_first where id = v_purchase.id;
  end if;
  if p_subscription_id is not null then
    update public.credit_card_subscriptions set generated_through = greatest(coalesce(generated_through, p_subscription_date), p_subscription_date) where id = p_subscription_id;
  end if;
  return v_purchase.id;
end;
$$;

-- Edição: descrição/categoria/observações sempre; valores, parcelas, data, cartão e 1ª fatura
-- só se nenhuma parcela estiver em fatura já paga (senão: estorno/crédito rastreável).
create or replace function public.card_update_purchase(
  p_purchase_id uuid,
  p_description text,
  p_category_id uuid,
  p_notes text,
  p_replan boolean,
  p_card_id uuid default null,
  p_purchase_date date default null,
  p_type text default null,
  p_amounts numeric[] default null,
  p_first_month date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p public.credit_card_purchases;
  v_card public.credit_cards;
  v_new_card public.credit_cards;
  v_inv uuid;
  v_n integer := coalesce(array_length(p_amounts, 1), 0);
  v_first date;
begin
  select * into v_p from public.credit_card_purchases where id = p_purchase_id for update;
  if v_p.id is null then raise exception 'Compra não encontrada.' using errcode = 'P0001'; end if;
  v_card := public.card_assert(v_p.card_id, 'edit');
  if v_p.status = 'cancelada' then raise exception 'Esta compra foi cancelada.' using errcode = 'P0001'; end if;
  if p_category_id is not null and not exists (select 1 from public.financial_categories where id = p_category_id and space_id = v_p.space_id) then
    raise exception 'Categoria não pertence a este espaço.' using errcode = 'P0001';
  end if;
  update public.credit_card_purchases set description = coalesce(nullif(trim(p_description), ''), description), category_id = p_category_id,
         notes = nullif(trim(p_notes), '') where id = p_purchase_id;
  if not p_replan then return jsonb_build_object('replanned', false); end if;

  if exists (select 1 from public.credit_card_purchase_items it where it.purchase_id = p_purchase_id and it.status = 'ativo' and public.card_invoice_paid(it.invoice_id)) then
    raise exception 'Parte desta compra já está em fatura paga: valores e datas não mudam. Use "Estorno/crédito" para corrigir.' using errcode = 'P0001';
  end if;
  if v_n < 1 or v_n > 120 or exists (select 1 from unnest(p_amounts) a where a is null or round(a, 2) <= 0) then
    raise exception 'Parcelas inválidas.' using errcode = 'P0001';
  end if;
  if p_type is not null and p_type not in ('avista', 'parcelada', 'assinatura') then raise exception 'Tipo de compra inválido.' using errcode = 'P0001'; end if;
  if p_card_id is not null and p_card_id <> v_p.card_id then
    v_new_card := public.card_assert(p_card_id, 'edit');
    if v_new_card.space_id <> v_p.space_id then raise exception 'Cartão de outro espaço.' using errcode = 'P0001'; end if;
  end if;

  -- Cancela os itens atuais (ficam no histórico) e relança.
  for v_inv in select distinct invoice_id from public.credit_card_purchase_items where purchase_id = p_purchase_id and status = 'ativo' loop
    update public.credit_card_purchase_items set status = 'cancelado' where purchase_id = p_purchase_id and invoice_id = v_inv and status = 'ativo';
    perform public.card_sync_invoice(v_inv);
  end loop;

  update public.credit_card_purchases
     set card_id = coalesce(p_card_id, card_id),
         purchase_date = coalesce(p_purchase_date, purchase_date),
         purchase_type = coalesce(p_type, purchase_type),
         total_amount = (select round(sum(round(a, 2)), 2) from unnest(p_amounts) a),
         installment_count = v_n,
         first_invoice_month = date_trunc('month', coalesce(p_first_month, first_invoice_month))::date
   where id = p_purchase_id
  returning * into v_p;
  v_first := public.card_insert_items(v_p, p_amounts);
  if v_first <> v_p.first_invoice_month then update public.credit_card_purchases set first_invoice_month = v_first where id = p_purchase_id; end if;
  return jsonb_build_object('replanned', true, 'first_invoice_month', v_first);
end;
$$;

-- Estorno/crédito: valor negativo numa fatura em aberto (a do mês informado ou a próxima não quitada).
create or replace function public.card_add_credit(p_purchase_id uuid, p_amount numeric, p_month date, p_description text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p public.credit_card_purchases;
  v_card public.credit_cards;
  v_amount numeric(12, 2) := round(p_amount, 2);
  v_month date;
  v_inv uuid;
  v_id uuid;
  v_credits numeric(12, 2);
  k integer := 0;
begin
  select * into v_p from public.credit_card_purchases where id = p_purchase_id for update;
  if v_p.id is null then raise exception 'Compra não encontrada.' using errcode = 'P0001'; end if;
  v_card := public.card_assert(v_p.card_id, 'edit');
  if v_amount is null or v_amount <= 0 then raise exception 'Informe o valor do estorno.' using errcode = 'P0001'; end if;
  select coalesce(-sum(amount), 0) into v_credits from public.credit_card_purchase_items where purchase_id = p_purchase_id and status = 'ativo' and item_type = 'estorno';
  if v_credits + v_amount > v_p.total_amount then
    raise exception 'O estorno total não pode passar do valor da compra.' using errcode = 'P0001';
  end if;
  v_month := public.card_open_month_from(v_p.card_id, coalesce(p_month, current_date));
  loop
    v_inv := public.card_invoice_for(v_p.card_id, v_month);
    -- Fatura com pagamento parcial que ficaria abaixo do já pago: crédito vai para a próxima.
    exit when not exists (
      select 1 from public.credit_card_invoices i join public.financial_charges c on c.id = i.charge_id
       where i.id = v_inv and public.fin_charge_paid(c.id) > 0
         and (select coalesce(sum(amount), 0) from public.credit_card_purchase_items where invoice_id = v_inv and status = 'ativo') - v_amount < public.fin_charge_paid(c.id)
    ) or k > 24;
    v_month := public.card_open_month_from(v_p.card_id, (v_month + interval '1 month')::date);
    k := k + 1;
  end loop;
  insert into public.credit_card_purchase_items (space_id, purchase_id, invoice_id, item_type, amount, description, created_by)
  values (v_p.space_id, v_p.id, v_inv, 'estorno', -v_amount, coalesce(nullif(trim(p_description), ''), 'Estorno · ' || v_p.description), auth.uid())
  returning id into v_id;
  perform public.card_sync_invoice(v_inv);
  return v_id;
end;
$$;

-- Cancelar compra: some das faturas não pagas; o que já estava em fatura paga vira estorno rastreável.
create or replace function public.card_cancel_purchase(p_purchase_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p public.credit_card_purchases;
  v_card public.credit_cards;
  v_inv uuid;
  v_paid_part numeric(12, 2);
  v_credit_id uuid;
begin
  select * into v_p from public.credit_card_purchases where id = p_purchase_id for update;
  if v_p.id is null then raise exception 'Compra não encontrada.' using errcode = 'P0001'; end if;
  v_card := public.card_assert(v_p.card_id, 'edit');
  if v_p.status = 'cancelada' then raise exception 'Esta compra já foi cancelada.' using errcode = 'P0001'; end if;

  select coalesce(sum(it.amount), 0) into v_paid_part from public.credit_card_purchase_items it
   where it.purchase_id = p_purchase_id and it.status = 'ativo' and public.card_invoice_paid(it.invoice_id);

  for v_inv in select distinct invoice_id from public.credit_card_purchase_items it
                where it.purchase_id = p_purchase_id and it.status = 'ativo' and not public.card_invoice_paid(it.invoice_id) loop
    update public.credit_card_purchase_items set status = 'cancelado' where purchase_id = p_purchase_id and invoice_id = v_inv and status = 'ativo';
    perform public.card_sync_invoice(v_inv);
  end loop;

  if v_paid_part > 0 then
    v_credit_id := public.card_add_credit(p_purchase_id, v_paid_part, current_date, 'Estorno · cancelamento de ' || v_p.description);
  end if;
  update public.credit_card_purchases set status = 'cancelada',
         notes = concat_ws(E'\n', notes, 'Cancelada em ' || to_char(current_date, 'DD/MM/YYYY') || coalesce(': ' || nullif(trim(p_note), ''), '')) where id = p_purchase_id;
  return jsonb_build_object('credited', v_paid_part, 'credit_item_id', v_credit_id);
end;
$$;

-- Cartão de terceiro: "Pagar ao titular" — um só valor abatendo as faturas mais antigas primeiro.
create or replace function public.card_pay_holder(p_card_id uuid, p_amount numeric, p_payment_date date, p_payment_method text, p_account_id uuid, p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card public.credit_cards := public.card_assert(p_card_id, 'edit');
  v_amount numeric(12, 2) := round(p_amount, 2);
  v_left numeric(12, 2);
  v_owed numeric(12, 2);
  v_part numeric(12, 2);
  v_row record;
  v_payments jsonb := '[]'::jsonb;
  v_res jsonb;
begin
  if v_amount is null or v_amount <= 0 then raise exception 'Informe um valor válido.' using errcode = 'P0001'; end if;
  select coalesce(sum(greatest(c.amount - public.fin_charge_paid(c.id), 0)), 0) into v_owed
    from public.credit_card_invoices i join public.financial_charges c on c.id = i.charge_id
   where i.card_id = p_card_id and c.status = 'ativo';
  if v_amount > v_owed then
    raise exception 'Valor maior do que você deve ao titular (%).', replace(v_owed::text, '.', ',') using errcode = 'P0001';
  end if;
  v_left := v_amount;
  for v_row in
    select c.id, greatest(c.amount - public.fin_charge_paid(c.id), 0) as remaining
      from public.credit_card_invoices i join public.financial_charges c on c.id = i.charge_id
     where i.card_id = p_card_id and c.status = 'ativo' and c.amount - public.fin_charge_paid(c.id) > 0
     order by i.due_date
  loop
    exit when v_left <= 0;
    v_part := least(v_left, v_row.remaining);
    v_res := public.fin_register_payment(v_row.id, v_part, p_payment_date, p_payment_method, p_account_id, false,
               coalesce(nullif(trim(p_notes), ''), 'Pagamento ao titular ' || coalesce(v_card.holder_name, '')), null);
    v_payments := v_payments || jsonb_build_array(v_res ->> 'payment_id');
    v_left := v_left - v_part;
  end loop;
  return jsonb_build_object('paid', v_amount, 'remaining', v_owed - v_amount, 'payments', v_payments);
end;
$$;

-- Assinaturas
create or replace function public.card_create_subscription(p_card_id uuid, p_description text, p_category_id uuid, p_amount numeric,
  p_billing_day integer, p_start date, p_end date default null, p_notes text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card public.credit_cards := public.card_assert(p_card_id, 'create');
  v_id uuid;
begin
  if coalesce(trim(p_description), '') = '' then raise exception 'Informe o nome da assinatura.' using errcode = 'P0001'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Informe o valor mensal.' using errcode = 'P0001'; end if;
  if p_category_id is not null and not exists (select 1 from public.financial_categories where id = p_category_id and space_id = v_card.space_id) then
    raise exception 'Categoria não pertence a este espaço.' using errcode = 'P0001';
  end if;
  insert into public.credit_card_subscriptions (space_id, card_id, description, category_id, amount, billing_day, start_date, end_date, notes, created_by)
  values (v_card.space_id, p_card_id, trim(p_description), p_category_id, round(p_amount, 2), p_billing_day, p_start, p_end, nullif(trim(p_notes), ''), auth.uid())
  returning id into v_id;
  insert into public.credit_card_subscription_events (subscription_id, space_id, action, effective_date, created_by)
  values (v_id, v_card.space_id, 'criada', p_start, auth.uid());
  return v_id;
end;
$$;

create or replace function public.card_update_subscription(p_sub_id uuid, p_description text, p_category_id uuid, p_amount numeric,
  p_billing_day integer, p_end date, p_notes text, p_card_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.credit_card_subscriptions;
  v_card public.credit_cards;
begin
  select * into v_sub from public.credit_card_subscriptions where id = p_sub_id for update;
  if v_sub.id is null then raise exception 'Assinatura não encontrada.' using errcode = 'P0001'; end if;
  v_card := public.card_assert(v_sub.card_id, 'edit');
  if p_card_id is not null and p_card_id <> v_sub.card_id then
    if (public.card_assert(p_card_id, 'edit')).space_id <> v_sub.space_id then raise exception 'Cartão de outro espaço.' using errcode = 'P0001'; end if;
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Informe o valor mensal.' using errcode = 'P0001'; end if;
  if p_end is not null and p_end < v_sub.start_date then raise exception 'O término precisa ser depois do início.' using errcode = 'P0001'; end if;
  if p_category_id is not null and not exists (select 1 from public.financial_categories where id = p_category_id and space_id = v_sub.space_id) then
    raise exception 'Categoria não pertence a este espaço.' using errcode = 'P0001';
  end if;
  -- Só as próximas cobranças mudam; as já geradas ficam como estão.
  update public.credit_card_subscriptions set description = coalesce(nullif(trim(p_description), ''), description), category_id = p_category_id,
         amount = round(p_amount, 2), billing_day = p_billing_day, end_date = p_end, notes = nullif(trim(p_notes), ''),
         card_id = coalesce(p_card_id, card_id) where id = p_sub_id;
  insert into public.credit_card_subscription_events (subscription_id, space_id, action, effective_date, note, created_by)
  values (p_sub_id, v_sub.space_id, case when round(p_amount, 2) <> v_sub.amount then 'valor_alterado' else 'editada' end, current_date,
          case when round(p_amount, 2) <> v_sub.amount then 'De ' || replace(v_sub.amount::text, '.', ',') || ' para ' || replace(round(p_amount, 2)::text, '.', ',') end, auth.uid());
end;
$$;

create or replace function public.card_set_subscription_status(p_sub_id uuid, p_status text, p_date date, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.credit_card_subscriptions;
  v_card public.credit_cards;
begin
  select * into v_sub from public.credit_card_subscriptions where id = p_sub_id for update;
  if v_sub.id is null then raise exception 'Assinatura não encontrada.' using errcode = 'P0001'; end if;
  v_card := public.card_assert(v_sub.card_id, 'edit');
  if p_status not in ('ativa', 'pausada', 'cancelada') then raise exception 'Status inválido.' using errcode = 'P0001'; end if;
  if v_sub.status = 'cancelada' then raise exception 'Assinatura cancelada não pode ser alterada (o histórico fica preservado).' using errcode = 'P0001'; end if;
  if v_sub.status = p_status then return; end if;
  if p_status = 'ativa' then
    -- Reativar: os meses em que ficou pausada não são cobrados.
    update public.credit_card_subscriptions set status = 'ativa', generated_through = greatest(coalesce(generated_through, p_date - 1), p_date - 1) where id = p_sub_id;
  elsif p_status = 'pausada' then
    update public.credit_card_subscriptions set status = 'pausada' where id = p_sub_id;
  else
    update public.credit_card_subscriptions set status = 'cancelada', end_date = least(coalesce(end_date, p_date), p_date) where id = p_sub_id;
  end if;
  insert into public.credit_card_subscription_events (subscription_id, space_id, action, effective_date, note, created_by)
  values (p_sub_id, v_sub.space_id, case p_status when 'ativa' then 'reativada' when 'pausada' then 'pausada' else 'cancelada' end, p_date, nullif(trim(p_note), ''), auth.uid());
end;
$$;

-- Converter um parcelamento já cadastrado em compra no cartão (sem duplicar):
-- as parcelas SEM pagamento são canceladas no A pagar e viram parcelas do cartão;
-- as com pagamento ficam como estão.
create or replace function public.fin_convert_origin_to_card(p_origin_id uuid, p_card_id uuid, p_first_month date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_origin public.financial_origins;
  v_card public.credit_cards := public.card_assert(p_card_id, 'create');
  v_amounts numeric[];
  v_ids uuid[];
  v_purchase uuid;
begin
  select * into v_origin from public.financial_origins where id = p_origin_id for update;
  if v_origin.id is null or v_origin.space_id <> v_card.space_id then raise exception 'Dívida não encontrada neste espaço.' using errcode = 'P0001'; end if;
  if v_origin.kind <> 'saida' then raise exception 'Só despesas podem virar compra no cartão.' using errcode = 'P0001'; end if;
  if not public.has_module_permission(v_origin.space_id, 'financeiro', 'edit') then raise exception 'Sem permissão.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.financial_charges where origin_id = p_origin_id and card_invoice_id is not null) then
    raise exception 'Esta cobrança já é uma fatura de cartão.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.credit_card_purchases where converted_from_origin_id = p_origin_id and status = 'ativa') then
    raise exception 'Esta dívida já foi convertida em compra no cartão.' using errcode = 'P0001';
  end if;
  select array_agg(c.amount order by c.due_date), array_agg(c.id order by c.due_date) into v_amounts, v_ids
    from public.financial_charges c where c.origin_id = p_origin_id and c.status = 'ativo' and public.fin_charge_paid(c.id) = 0;
  if v_ids is null then raise exception 'Não há parcelas pendentes sem pagamento para converter.' using errcode = 'P0001'; end if;

  update public.financial_charges set status = 'cancelado', updated_by = auth.uid(),
         notes = concat_ws(E'\n', notes, 'Convertida em compra no cartão ' || v_card.name || '.') where id = any (v_ids);
  v_purchase := public.card_create_purchase(p_card_id, regexp_replace(v_origin.description, '\s*\(\d+/\d+\)\s*$', ''), v_origin.category_id,
    current_date, case when array_length(v_amounts, 1) > 1 then 'parcelada' else 'avista' end, v_amounts, p_first_month,
    'Convertida de A pagar.', null, null, p_origin_id);
  return v_purchase;
end;
$$;

-- Mudança de fechamento/vencimento do cartão: só faturas futuras sem pagamento recebem as datas novas.
create or replace function public.card_refresh_future_invoices()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.credit_card_invoices;
  v_dates record;
begin
  if new.closing_day = old.closing_day and new.due_day = old.due_day then return new; end if;
  for v_inv in select * from public.credit_card_invoices i
                where i.card_id = new.id and i.closing_date >= current_date
                  and (i.charge_id is null or public.fin_charge_paid(i.charge_id) = 0) loop
    select * into v_dates from public.card_cycle_dates(v_inv.reference_month, new.closing_day, new.due_day);
    update public.credit_card_invoices set closing_date = v_dates.closing_date, due_date = v_dates.due_date where id = v_inv.id;
    perform public.card_sync_invoice(v_inv.id);
  end loop;
  return new;
end;
$$;
drop trigger if exists card_refresh_future_invoices on public.credit_cards;
create trigger card_refresh_future_invoices after update of closing_day, due_day on public.credit_cards
  for each row execute function public.card_refresh_future_invoices();

grant execute on function public.card_create_purchase(uuid, text, uuid, date, text, numeric[], date, text, uuid, date, uuid) to authenticated;
grant execute on function public.card_update_purchase(uuid, text, uuid, text, boolean, uuid, date, text, numeric[], date) to authenticated;
grant execute on function public.card_add_credit(uuid, numeric, date, text) to authenticated;
grant execute on function public.card_cancel_purchase(uuid, text) to authenticated;
grant execute on function public.card_pay_holder(uuid, numeric, date, text, uuid, text) to authenticated;
grant execute on function public.card_create_subscription(uuid, text, uuid, numeric, integer, date, date, text) to authenticated;
grant execute on function public.card_update_subscription(uuid, text, uuid, numeric, integer, date, text, uuid) to authenticated;
grant execute on function public.card_set_subscription_status(uuid, text, date, text) to authenticated;
grant execute on function public.fin_convert_origin_to_card(uuid, uuid, date) to authenticated;
grant execute on function public.card_cycle_dates(date, integer, integer) to authenticated;

-- Funções internas: não chamáveis direto pela API.
revoke execute on function public.card_sync_invoice(uuid) from public, anon, authenticated;
revoke execute on function public.card_invoice_for(uuid, date) from public, anon, authenticated;
revoke execute on function public.card_insert_items(public.credit_card_purchases, numeric[]) from public, anon, authenticated;

-- =============================================================================
-- Fim. Nenhum lançamento existente foi alterado: só coluna nova (nula),
-- tabelas, índices, triggers e funções novos.
-- =============================================================================
