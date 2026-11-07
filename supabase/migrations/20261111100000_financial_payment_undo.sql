-- =============================================================================
-- VSPlanner — Quitar com desconto/acréscimo rastreável e "Desfazer pagamento"
-- com ou sem devolução do dinheiro à conta.
-- Migration: 20261111100000_financial_payment_undo.sql
-- Requer: 20261110100000_financial_personal_link.sql (já aplicada).
--
-- ADITIVA e idempotente. Não apaga nem reescreve nenhum lançamento:
--   * financial_payments ganha settle_discount/settle_addition (padrão 0):
--     quanto de desconto/acréscimo AQUELE pagamento aplicou na cobrança ao
--     "quitar". Pagamentos antigos ficam com 0 (nada é recalculado);
--   * financial_payment_reversals: histórico de cada pagamento desfeito
--     (com ou sem devolução), um único registro por pagamento;
--   * fin_register_payment: registrar pagamento (com quitar) numa transação;
--   * fin_undo_payment: desfazer um pagamento numa transação.
--
-- "Desfazer SEM devolver o dinheiro" (ex.: pagou a conta errada e o valor
-- não volta): a cobrança original é reaberta e o MESMO lançamento de caixa
-- passa para uma saída própria "Sem devolução · <descrição>" (categoria
-- "Pagamentos desfeitos sem devolução"). O saldo da conta não muda, o
-- dinheiro continua contabilizado como saída real (sem dinheiro fictício,
-- sem lançamento órfão) e esse lançamento fica TRAVADO: não pode ser
-- desfeito/apagado/alterado depois, então o valor nunca volta à conta por
-- outro caminho.
--
-- COMO EXECUTAR: Supabase Dashboard → SQL Editor → New query → colar → Run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Desconto/acréscimo aplicado por cada pagamento
-- -----------------------------------------------------------------------------

alter table public.financial_payments add column if not exists settle_discount numeric(12, 2) not null default 0;
alter table public.financial_payments add column if not exists settle_addition numeric(12, 2) not null default 0;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'financial_payments_settle_nonneg' and conrelid = 'public.financial_payments'::regclass) then
    alter table public.financial_payments add constraint financial_payments_settle_nonneg check (settle_discount >= 0 and settle_addition >= 0);
  end if;
end $$;

comment on column public.financial_payments.settle_discount is
  'Desconto que ESTE pagamento aplicou na cobrança ao quitar com valor menor (revertido se o pagamento for desfeito). 0 em pagamentos anteriores a esta versão.';
comment on column public.financial_payments.settle_addition is
  'Acréscimo que ESTE pagamento aplicou na cobrança ao quitar com valor maior.';

-- -----------------------------------------------------------------------------
-- 2. Histórico de pagamentos desfeitos
-- -----------------------------------------------------------------------------

create table if not exists public.financial_payment_reversals (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  charge_id uuid references public.financial_charges (id) on delete set null,
  -- Sem FK: com devolução, a linha do pagamento deixa de existir.
  payment_id uuid not null,
  mode text not null check (mode in ('devolvido', 'sem_devolucao')),
  amount numeric(12, 2) not null,
  payment_date date not null,
  payment_method text,
  account_id uuid references public.financial_accounts (id) on delete set null,
  account_name text,
  charge_description text,
  discount_reverted numeric(12, 2) not null default 0,
  addition_reverted numeric(12, 2) not null default 0,
  -- Sem devolução: a saída que passou a guardar o lançamento de caixa.
  adjustment_charge_id uuid references public.financial_charges (id) on delete set null,
  personal_link_id uuid references public.financial_personal_links (id) on delete set null,
  note text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

-- Um pagamento só pode ser desfeito UMA vez (nem devolvido duas vezes).
create unique index if not exists uq_financial_payment_reversals_payment on public.financial_payment_reversals (payment_id);
create index if not exists idx_financial_payment_reversals_charge on public.financial_payment_reversals (charge_id);
create index if not exists idx_financial_payment_reversals_space on public.financial_payment_reversals (space_id, created_at desc);
create index if not exists idx_financial_payment_reversals_adjustment on public.financial_payment_reversals (adjustment_charge_id) where adjustment_charge_id is not null;

alter table public.financial_payment_reversals enable row level security;
drop policy if exists financial_payment_reversals_select on public.financial_payment_reversals;
create policy financial_payment_reversals_select on public.financial_payment_reversals for select
  using (public.has_module_permission(space_id, 'financeiro', 'view'));
revoke insert, update, delete on public.financial_payment_reversals from authenticated, anon;
grant select on public.financial_payment_reversals to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Trava do lançamento "sem devolução"
-- -----------------------------------------------------------------------------

create or replace function public.fin_payment_adjustment_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.financial_payment_reversals r
     where r.mode = 'sem_devolucao' and r.adjustment_charge_id = old.charge_id
  ) then
    if tg_op = 'DELETE'
       or new.amount is distinct from old.amount
       or new.account_id is distinct from old.account_id
       or new.charge_id is distinct from old.charge_id
       or new.payment_date is distinct from old.payment_date then
      raise exception 'Este lançamento registra um pagamento desfeito SEM devolução: o dinheiro não voltou para a conta, então ele não pode ser desfeito nem alterado.'
        using errcode = 'P0001';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists fin_payment_adjustment_guard on public.financial_payments;
create trigger fin_payment_adjustment_guard
  before update or delete on public.financial_payments
  for each row execute function public.fin_payment_adjustment_guard();

-- -----------------------------------------------------------------------------
-- 4. RPC: registrar pagamento (com "quitar a dívida com este pagamento")
-- -----------------------------------------------------------------------------

create or replace function public.fin_register_payment(
  p_charge_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_payment_method text,
  p_account_id uuid,
  p_settle boolean,
  p_notes text default null,
  p_payer_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_charge public.financial_charges;
  v_paid numeric(12, 2);
  v_remaining numeric(12, 2);
  v_amount numeric(12, 2) := round(p_amount, 2);
  v_diff numeric(12, 2) := 0;
  v_discount numeric(12, 2) := 0;
  v_addition numeric(12, 2) := 0;
  v_payment_id uuid;
begin
  if v_uid is null then raise exception 'Sessão expirada. Entre novamente.' using errcode = 'P0001'; end if;
  if v_amount is null or v_amount <= 0 then raise exception 'Informe um valor válido.' using errcode = 'P0001'; end if;
  if p_payment_date is null then raise exception 'Informe a data do pagamento.' using errcode = 'P0001'; end if;

  select * into v_charge from public.financial_charges where id = p_charge_id for update;
  if v_charge.id is null then raise exception 'Cobrança não encontrada.' using errcode = 'P0001'; end if;
  if not public.has_module_permission(v_charge.space_id, 'financeiro', 'edit') then
    raise exception 'Sem permissão para registrar pagamentos neste financeiro.' using errcode = 'P0001';
  end if;
  if v_charge.status = 'cancelado' then raise exception 'Esta cobrança foi cancelada.' using errcode = 'P0001'; end if;

  if p_account_id is not null and not exists (
    select 1 from public.financial_accounts where id = p_account_id and space_id = v_charge.space_id and is_active
  ) then
    raise exception 'Conta financeira inválida ou inativa neste espaço.' using errcode = 'P0001';
  end if;

  select coalesce(sum(amount), 0) into v_paid from public.financial_payments where charge_id = v_charge.id;
  v_remaining := v_charge.amount - v_paid;
  if v_remaining <= 0 then raise exception 'Esta cobrança já está quitada.' using errcode = 'P0001'; end if;
  if not p_settle and v_amount > v_remaining then
    raise exception 'Valor maior que o restante (%). Marque "Quitar a dívida com este pagamento" para registrar a diferença como acréscimo.', replace(v_remaining::text, '.', ',') using errcode = 'P0001';
  end if;

  if p_settle and v_amount <> v_remaining then
    v_diff := v_amount - v_remaining;
    if v_diff < 0 then
      v_discount := -v_diff;
      if v_charge.discount_amount + v_discount > v_charge.original_amount + v_charge.addition_amount then
        raise exception 'Desconto maior que o valor da cobrança.' using errcode = 'P0001';
      end if;
      update public.financial_charges set discount_amount = discount_amount + v_discount, updated_by = v_uid where id = v_charge.id;
    else
      v_addition := v_diff;
      update public.financial_charges set addition_amount = addition_amount + v_addition, updated_by = v_uid where id = v_charge.id;
    end if;
  end if;

  insert into public.financial_payments (space_id, charge_id, amount, payment_date, payment_method, account_id, payer_label,
                                         notes, settle_discount, settle_addition, created_by)
  values (v_charge.space_id, v_charge.id, v_amount, p_payment_date, p_payment_method, p_account_id, p_payer_label,
          nullif(trim(p_notes), ''), v_discount, v_addition, v_uid)
  returning id into v_payment_id;

  return jsonb_build_object('payment_id', v_payment_id, 'discount', v_discount, 'addition', v_addition,
                            'remaining', greatest(v_remaining - v_discount + v_addition - v_amount, 0));
end;
$$;

grant execute on function public.fin_register_payment(uuid, numeric, date, text, uuid, boolean, text, text) to authenticated;

-- Pagamento pelo Júnior com conta pessoal: passa a guardar o desconto/acréscimo também.
create or replace function public.fin_pay_with_personal_account(
  p_charge_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_payment_method text,
  p_personal_account_id uuid,
  p_settle boolean,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res jsonb;
  v_link_id uuid;
begin
  v_res := public.fin_register_payment(p_charge_id, p_amount, p_payment_date, p_payment_method, null, p_settle, p_notes, 'junior');
  v_link_id := public.fin_attach_personal_debit((v_res ->> 'payment_id')::uuid, p_personal_account_id, 'novo');
  return v_res || jsonb_build_object('link_id', v_link_id);
end;
$$;

grant execute on function public.fin_pay_with_personal_account(uuid, numeric, date, text, uuid, boolean, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. RPC: desfazer UM pagamento (com ou sem devolução)
-- -----------------------------------------------------------------------------

create or replace function public.fin_undo_payment(p_payment_id uuid, p_refund boolean, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_payment public.financial_payments;
  v_charge public.financial_charges;
  v_space public.spaces;
  v_account_name text;
  v_blink public.financial_personal_links;
  v_disc numeric(12, 2);
  v_add numeric(12, 2);
  v_cat_name text;
  v_category_id uuid;
  v_origin_id uuid;
  v_adj_id uuid;
begin
  if v_uid is null then raise exception 'Sessão expirada. Entre novamente.' using errcode = 'P0001'; end if;

  select * into v_payment from public.financial_payments where id = p_payment_id for update;
  if v_payment.id is null then
    if exists (select 1 from public.financial_payment_reversals where payment_id = p_payment_id) then
      raise exception 'Este pagamento já foi desfeito — nada foi devolvido de novo.' using errcode = 'P0001';
    end if;
    raise exception 'Pagamento não encontrado.' using errcode = 'P0001';
  end if;
  select * into v_charge from public.financial_charges where id = v_payment.charge_id for update;
  select * into v_space from public.spaces where id = v_payment.space_id;
  if not public.has_module_permission(v_payment.space_id, 'financeiro', 'edit') then
    raise exception 'Sem permissão para desfazer pagamentos neste financeiro.' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.financial_payment_reversals where payment_id = v_payment.id) then
    raise exception 'Este pagamento já foi desfeito — nada foi devolvido de novo.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.financial_payment_reversals where mode = 'sem_devolucao' and adjustment_charge_id = v_charge.id) then
    raise exception 'Este lançamento registra um pagamento desfeito SEM devolução e não pode ser desfeito.' using errcode = 'P0001';
  end if;

  -- Débito pessoal que pagou despesa da Visionário Dev: só pela empresa.
  if exists (select 1 from public.financial_personal_links where personal_payment_id = v_payment.id and status = 'ativo') then
    raise exception 'Este lançamento pagou uma despesa da Visionário Dev. Desfaça o pagamento pela Visionário Dev — o valor volta para esta mesma conta, uma única vez.' using errcode = 'P0001';
  end if;
  select * into v_blink from public.financial_personal_links where business_payment_id = v_payment.id and status = 'ativo';
  if v_blink.id is not null and not p_refund then
    raise exception 'Pagamento feito com a conta pessoal %: ao desfazer, o valor sempre volta para ela. Para manter o dinheiro fora da conta, use "Desvincular conta pessoal".', v_blink.account_name using errcode = 'P0001';
  end if;

  select name into v_account_name from public.financial_accounts where id = v_payment.account_id;

  -- Reverte só o desconto/acréscimo que ESTE pagamento aplicou ao quitar.
  v_disc := least(v_payment.settle_discount, v_charge.discount_amount);
  v_add := least(v_payment.settle_addition, v_charge.addition_amount);
  if v_disc > 0 or v_add > 0 then
    update public.financial_charges
       set discount_amount = discount_amount - v_disc, addition_amount = addition_amount - v_add, updated_by = v_uid
     where id = v_charge.id;
  end if;

  if p_refund then
    insert into public.financial_payment_reversals (space_id, charge_id, payment_id, mode, amount, payment_date, payment_method,
      account_id, account_name, charge_description, discount_reverted, addition_reverted, personal_link_id, note, created_by)
    values (v_payment.space_id, v_charge.id, v_payment.id, 'devolvido', v_payment.amount, v_payment.payment_date, v_payment.payment_method,
      v_payment.account_id, coalesce(v_account_name, v_blink.account_name), v_charge.description, v_disc, v_add, v_blink.id,
      nullif(trim(p_note), ''), v_uid);
    -- O trigger de exclusão estorna o débito pessoal vinculado (mesma conta) e grava o histórico.
    delete from public.financial_payments where id = v_payment.id;
  else
    v_cat_name := case when v_charge.kind = 'saida' then 'Pagamentos desfeitos sem devolução' else 'Recebimentos desfeitos sem devolução' end;
    insert into public.financial_categories (space_id, kind, name, created_by)
    values (v_payment.space_id, v_charge.kind, v_cat_name, v_uid)
    on conflict (space_id, kind, name) do nothing;
    select id into v_category_id from public.financial_categories where space_id = v_payment.space_id and kind = v_charge.kind and name = v_cat_name;

    insert into public.financial_origins (space_id, kind, origin_type, description, category_id, supplier_name, created_by)
    values (v_payment.space_id, v_charge.kind, 'unico', 'Sem devolução · ' || v_charge.description, v_category_id,
            case when v_charge.kind = 'saida' then v_charge.supplier_name end, v_uid)
    returning id into v_origin_id;

    insert into public.financial_charges (space_id, origin_id, kind, description, category_id, supplier_name, original_amount,
                                          due_date, competency_date, notes, created_by)
    values (v_payment.space_id, v_origin_id, v_charge.kind, 'Sem devolução · ' || v_charge.description, v_category_id,
            case when v_charge.kind = 'saida' then v_charge.supplier_name end, v_payment.amount, v_payment.payment_date,
            date_trunc('month', v_payment.payment_date)::date,
            'Pagamento de "' || v_charge.description || '" desfeito sem devolver o dinheiro à conta.' ||
              coalesce(' Motivo: ' || nullif(trim(p_note), ''), ''), v_uid)
    returning id into v_adj_id;

    insert into public.financial_payment_reversals (space_id, charge_id, payment_id, mode, amount, payment_date, payment_method,
      account_id, account_name, charge_description, discount_reverted, addition_reverted, adjustment_charge_id, note, created_by)
    values (v_payment.space_id, v_charge.id, v_payment.id, 'sem_devolucao', v_payment.amount, v_payment.payment_date, v_payment.payment_method,
      v_payment.account_id, v_account_name, v_charge.description, v_disc, v_add, v_adj_id, nullif(trim(p_note), ''), v_uid);

    -- O MESMO lançamento de caixa (mesmo valor, conta e data) passa para a saída própria.
    update public.financial_payments set charge_id = v_adj_id, settle_discount = 0, settle_addition = 0 where id = v_payment.id;
  end if;

  return jsonb_build_object('mode', case when p_refund then 'devolvido' else 'sem_devolucao' end,
                            'discount_reverted', v_disc, 'addition_reverted', v_add, 'adjustment_charge_id', v_adj_id);
end;
$$;

grant execute on function public.fin_undo_payment(uuid, boolean, text) to authenticated;

-- =============================================================================
-- Fim. Nenhum lançamento existente foi alterado: só colunas (com 0),
-- tabela, trigger e funções novos.
-- =============================================================================
