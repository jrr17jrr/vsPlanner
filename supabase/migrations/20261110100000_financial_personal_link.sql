-- =============================================================================
-- VSPlanner — Integração Financeiro Visionário Dev ↔ Financeiro Pessoal
-- Migration: 20261110100000_financial_personal_link.sql
--
-- 100% ADITIVA: não apaga, não zera e não reescreve nenhum dado existente.
-- Cria:
--   1. financial_personal_links   → o vínculo "este pagamento da empresa
--      saiu desta conta pessoal" (com snapshot para histórico/estorno);
--   2. financial_payment_history  → histórico de TODO pagamento desfeito
--      (snapshot da linha removida, quem e quando);
--   3. funções atômicas (RPC) para pagar/vincular/desvincular;
--   4. triggers que garantem a consistência:
--        - desfazer o pagamento da empresa (qualquer caminho, inclusive
--          exclusão em cascata da cobrança) ESTORNA o débito pessoal na
--          MESMA transação, devolvendo o valor à MESMA conta;
--        - o lançamento pessoal vinculado não pode ser apagado/alterado
--          sozinho (evita um financeiro certo e o outro errado).
--
-- Modelo (sem contar duas vezes):
--   - Na Visionário Dev o pagamento fica com payer_label = 'junior' e
--     account_id = NULL → a despesa fica paga, nenhuma conta da empresa
--     é movimentada.
--   - No Pessoal nasce uma saída única "Visionário Dev · <descrição>"
--     (categoria "Pagamentos da Visionário Dev") paga pela conta escolhida
--     → o saldo dessa conta diminui exatamente o valor pago.
--
-- COMO EXECUTAR: Supabase Dashboard → SQL Editor → New query → colar este
-- arquivo inteiro → Run. Pode ser executado mais de uma vez (idempotente).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Vínculo pagamento empresarial ↔ débito pessoal
-- -----------------------------------------------------------------------------

create table if not exists public.financial_personal_links (
  id uuid primary key default gen_random_uuid(),

  business_space_id uuid not null references public.spaces (id) on delete cascade,
  business_charge_id uuid references public.financial_charges (id) on delete set null,
  business_payment_id uuid references public.financial_payments (id) on delete set null,
  -- Vínculo retroativo: conta da EMPRESA que o pagamento movimentava antes
  -- de ser vinculado (restaurada se o vínculo for desfeito).
  business_account_id_before uuid references public.financial_accounts (id) on delete set null,

  personal_space_id uuid not null references public.spaces (id) on delete cascade,
  personal_account_id uuid references public.financial_accounts (id) on delete set null,
  personal_charge_id uuid references public.financial_charges (id) on delete set null,
  personal_payment_id uuid references public.financial_payments (id) on delete set null,

  -- novo       = criado junto com o pagamento;
  -- retroativo = pagamento antigo, débito pessoal criado agora;
  -- existente  = pagamento antigo ligado a um lançamento pessoal que já existia
  --              (nenhum desconto novo).
  link_mode text not null check (link_mode in ('novo', 'retroativo', 'existente')),

  -- Snapshot para histórico (continua legível mesmo após estorno).
  amount numeric(12, 2) not null check (amount > 0),
  payment_date date not null,
  description text not null,
  account_name text not null,

  status text not null default 'ativo' check (status in ('ativo', 'estornado', 'desvinculado')),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  reversed_by uuid references public.profiles (id),
  reversed_at timestamptz,
  reversal_note text
);

comment on table public.financial_personal_links is
  'Pagamento de despesa da Visionário Dev feito com dinheiro pessoal. '
  'Um pagamento empresarial tem no máximo UM vínculo ativo, e um '
  'lançamento pessoal também — impede desconto e estorno duplicados.';

create unique index if not exists uq_fpl_business_payment_active
  on public.financial_personal_links (business_payment_id) where status = 'ativo';
create unique index if not exists uq_fpl_personal_payment_active
  on public.financial_personal_links (personal_payment_id) where status = 'ativo';
create index if not exists idx_fpl_business_space on public.financial_personal_links (business_space_id);
create index if not exists idx_fpl_personal_space on public.financial_personal_links (personal_space_id);

alter table public.financial_personal_links enable row level security;

drop policy if exists financial_personal_links_select on public.financial_personal_links;
create policy financial_personal_links_select on public.financial_personal_links for select
  using (
    public.has_module_permission(business_space_id, 'financeiro', 'view')
    or exists (select 1 from public.spaces s where s.id = personal_space_id and s.owner_id = auth.uid())
  );

-- Escrita SOMENTE pelas funções abaixo (security definer, com checagem de
-- permissão nos dois espaços) — nunca direto pela API.
revoke insert, update, delete on public.financial_personal_links from authenticated;
grant select on public.financial_personal_links to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Histórico de pagamentos desfeitos (todas as telas do Financeiro)
-- -----------------------------------------------------------------------------

create table if not exists public.financial_payment_history (
  id uuid primary key default gen_random_uuid(),
  -- Sem FK de propósito: o histórico sobrevive à remoção da cobrança.
  space_id uuid not null,
  payment_id uuid not null,
  charge_id uuid,
  event text not null default 'desfeito' check (event in ('desfeito')),
  snapshot jsonb not null,
  charge_description text,
  personal_link_id uuid,
  happened_by uuid,
  happened_at timestamptz not null default now()
);

create index if not exists idx_fph_space on public.financial_payment_history (space_id, happened_at desc);

alter table public.financial_payment_history enable row level security;
drop policy if exists financial_payment_history_select on public.financial_payment_history;
create policy financial_payment_history_select on public.financial_payment_history for select
  using (public.has_module_permission(space_id, 'financeiro', 'view'));
revoke insert, update, delete on public.financial_payment_history from authenticated;
grant select on public.financial_payment_history to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Triggers de consistência em financial_payments
-- -----------------------------------------------------------------------------

-- Remove o débito pessoal de um vínculo (já marcado como não-ativo) e
-- cancela a cobrança pessoal se ela ficou sem pagamento — o saldo volta
-- exatamente para a conta de onde saiu (é a própria linha que some).
create or replace function public.fin_release_personal_debit(p_link public.financial_personal_links)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_link.personal_payment_id is not null then
    delete from public.financial_payments where id = p_link.personal_payment_id;
  end if;
  if p_link.personal_charge_id is not null
     and not exists (select 1 from public.financial_payments where charge_id = p_link.personal_charge_id) then
    update public.financial_charges set status = 'cancelado' where id = p_link.personal_charge_id;
  end if;
end;
$$;

revoke execute on function public.fin_release_personal_debit(public.financial_personal_links) from public, authenticated, anon;

create or replace function public.fin_payment_before_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.financial_personal_links;
begin
  -- (a) Pagamento da EMPRESA com débito pessoal ativo → estorna junto.
  update public.financial_personal_links
     set status = 'estornado', reversed_at = now(), reversed_by = auth.uid(),
         reversal_note = coalesce(reversal_note, 'Pagamento desfeito na Visionário Dev')
   where business_payment_id = old.id and status = 'ativo'
   returning * into v_link;

  -- Vale também para o modo 'existente': o lançamento pessoal representa o
  -- MESMO dinheiro, então desfazer o pagamento devolve o valor à conta.
  if v_link.id is not null then
    perform public.fin_release_personal_debit(v_link);
  end if;

  -- (b) Lançamento PESSOAL de um vínculo ativo não pode sumir sozinho.
  if exists (select 1 from public.financial_personal_links where personal_payment_id = old.id and status = 'ativo') then
    raise exception 'Este lançamento pagou uma despesa da Visionário Dev. Desfaça o pagamento pela Visionário Dev (ou desvincule a conta) para devolver o saldo.'
      using errcode = 'P0001';
  end if;

  insert into public.financial_payment_history (space_id, payment_id, charge_id, snapshot, charge_description, personal_link_id, happened_by)
  values (
    old.space_id, old.id, old.charge_id, to_jsonb(old),
    (select description from public.financial_charges where id = old.charge_id),
    coalesce(v_link.id, (select id from public.financial_personal_links where personal_payment_id = old.id order by created_at desc limit 1)),
    auth.uid()
  );

  return old;
end;
$$;

drop trigger if exists fin_payment_before_delete on public.financial_payments;
create trigger fin_payment_before_delete
  before delete on public.financial_payments
  for each row execute function public.fin_payment_before_delete();

create or replace function public.fin_payment_before_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.amount is distinct from old.amount or new.account_id is distinct from old.account_id or new.charge_id is distinct from old.charge_id)
     and exists (
       select 1 from public.financial_personal_links
        where status = 'ativo' and (business_payment_id = old.id or personal_payment_id = old.id)
     ) then
    raise exception 'Pagamento vinculado ao Financeiro Pessoal: desfaça ou desvincule antes de alterar valor, conta ou cobrança.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists fin_payment_before_update on public.financial_payments;
create trigger fin_payment_before_update
  before update on public.financial_payments
  for each row execute function public.fin_payment_before_update();

-- -----------------------------------------------------------------------------
-- 4. Núcleo: cria (ou liga) o débito pessoal de um pagamento empresarial
-- -----------------------------------------------------------------------------

create or replace function public.fin_attach_personal_debit(
  p_business_payment_id uuid,
  p_personal_account_id uuid,
  p_mode text,
  p_existing_personal_payment_id uuid default null,
  p_detach_business_account boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_bp public.financial_payments;
  v_charge public.financial_charges;
  v_business_space public.spaces;
  v_personal_space_id uuid;
  v_account public.financial_accounts;
  v_existing public.financial_payments;
  v_category_id uuid;
  v_origin_id uuid;
  v_pcharge_id uuid;
  v_ppayment_id uuid;
  v_before uuid;
  v_link_id uuid;
begin
  if v_uid is null then
    raise exception 'Sessão expirada. Entre novamente.' using errcode = 'P0001';
  end if;
  if p_mode not in ('novo', 'retroativo', 'existente') then
    raise exception 'Modo de vínculo inválido.' using errcode = 'P0001';
  end if;

  select * into v_bp from public.financial_payments where id = p_business_payment_id for update;
  if v_bp.id is null then
    raise exception 'Pagamento não encontrado.' using errcode = 'P0001';
  end if;
  select * into v_charge from public.financial_charges where id = v_bp.charge_id;
  select * into v_business_space from public.spaces where id = v_bp.space_id;

  if v_business_space.type = 'personal' then
    raise exception 'O pagamento precisa ser de um financeiro empresarial.' using errcode = 'P0001';
  end if;
  if v_charge.kind <> 'saida' then
    raise exception 'Só despesas (saídas) podem ser pagas com dinheiro pessoal.' using errcode = 'P0001';
  end if;
  if not public.has_module_permission(v_bp.space_id, 'financeiro', 'edit') then
    raise exception 'Sem permissão para editar o financeiro da empresa.' using errcode = 'P0001';
  end if;
  if v_bp.payer_label is distinct from 'junior' then
    raise exception 'Somente pagamentos feitos pelo Ricardo Júnior podem descontar de conta pessoal.' using errcode = 'P0001';
  end if;

  -- Sempre o Financeiro Pessoal de QUEM está logado (isolamento).
  select id into v_personal_space_id from public.spaces
   where type = 'personal' and owner_id = v_uid
   order by created_at limit 1;
  if v_personal_space_id is null then
    raise exception 'Financeiro Pessoal não encontrado para este usuário.' using errcode = 'P0001';
  end if;
  if not public.has_module_permission(v_personal_space_id, 'financeiro', 'edit') then
    raise exception 'Sem permissão para editar o Financeiro Pessoal.' using errcode = 'P0001';
  end if;

  select * into v_account from public.financial_accounts
   where id = p_personal_account_id and space_id = v_personal_space_id;
  if v_account.id is null then
    raise exception 'A conta escolhida não pertence ao seu Financeiro Pessoal.' using errcode = 'P0001';
  end if;
  if not v_account.is_active then
    raise exception 'A conta "%" está desativada.', v_account.name using errcode = 'P0001';
  end if;

  if exists (select 1 from public.financial_personal_links where business_payment_id = v_bp.id and status = 'ativo') then
    raise exception 'Este pagamento já está vinculado a uma conta pessoal — nada foi descontado de novo.' using errcode = 'P0001';
  end if;

  -- Pagamento antigo que movimentava uma conta da EMPRESA: deixa de
  -- movimentar (senão o mesmo gasto sairia de duas contas).
  if p_mode <> 'novo' and v_bp.account_id is not null then
    if not p_detach_business_account then
      raise exception 'Este pagamento já desconta de uma conta da Visionário Dev. Confirme a remoção desse desconto para vincular à conta pessoal.' using errcode = 'P0001';
    end if;
    v_before := v_bp.account_id;
    update public.financial_payments set account_id = null where id = v_bp.id;
  end if;

  if p_mode = 'existente' then
    select * into v_existing from public.financial_payments
     where id = p_existing_personal_payment_id and space_id = v_personal_space_id for update;
    if v_existing.id is null then
      raise exception 'Lançamento pessoal não encontrado.' using errcode = 'P0001';
    end if;
    if v_existing.account_id is distinct from v_account.id then
      raise exception 'O lançamento pessoal escolhido é de outra conta.' using errcode = 'P0001';
    end if;
    if v_existing.amount <> v_bp.amount then
      raise exception 'O lançamento pessoal tem valor diferente do pagamento.' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.financial_personal_links where personal_payment_id = v_existing.id and status = 'ativo') then
      raise exception 'Esse lançamento pessoal já está vinculado a outro pagamento.' using errcode = 'P0001';
    end if;
    v_ppayment_id := v_existing.id;
    v_pcharge_id := v_existing.charge_id;
  else
    insert into public.financial_categories (space_id, kind, name, created_by)
    values (v_personal_space_id, 'saida', 'Pagamentos da Visionário Dev', v_uid)
    on conflict (space_id, kind, name) do nothing;
    select id into v_category_id from public.financial_categories
     where space_id = v_personal_space_id and kind = 'saida' and name = 'Pagamentos da Visionário Dev';

    insert into public.financial_origins (space_id, kind, origin_type, description, category_id, supplier_name, created_by)
    values (v_personal_space_id, 'saida', 'unico', v_business_space.name || ' · ' || v_charge.description,
            v_category_id, v_business_space.name, v_uid)
    returning id into v_origin_id;

    insert into public.financial_charges (space_id, origin_id, kind, description, category_id, supplier_name,
                                          original_amount, due_date, competency_date, notes, created_by)
    values (v_personal_space_id, v_origin_id, 'saida', v_business_space.name || ' · ' || v_charge.description,
            v_category_id, v_business_space.name, v_bp.amount, v_bp.payment_date,
            date_trunc('month', v_bp.payment_date)::date,
            'Pagamento de despesa da ' || v_business_space.name || ' feito com dinheiro pessoal.', v_uid)
    returning id into v_pcharge_id;

    insert into public.financial_payments (space_id, charge_id, amount, payment_date, payment_method, account_id, notes, created_by)
    values (v_personal_space_id, v_pcharge_id, v_bp.amount, v_bp.payment_date, v_bp.payment_method, v_account.id,
            'Usado para pagar "' || v_charge.description || '" da ' || v_business_space.name || '.', v_uid)
    returning id into v_ppayment_id;
  end if;

  insert into public.financial_personal_links (
    business_space_id, business_charge_id, business_payment_id, business_account_id_before,
    personal_space_id, personal_account_id, personal_charge_id, personal_payment_id,
    link_mode, amount, payment_date, description, account_name, created_by
  ) values (
    v_bp.space_id, v_charge.id, v_bp.id, v_before,
    v_personal_space_id, v_account.id, v_pcharge_id, v_ppayment_id,
    p_mode, v_bp.amount, v_bp.payment_date, v_charge.description, v_account.name, v_uid
  ) returning id into v_link_id;

  return v_link_id;
end;
$$;

revoke execute on function public.fin_attach_personal_debit(uuid, uuid, text, uuid, boolean) from public, authenticated, anon;

-- -----------------------------------------------------------------------------
-- 5. RPC: "Marcar como pago" pago pelo Júnior descontando de conta pessoal
--    (pagamento da empresa + débito pessoal numa única transação)
-- -----------------------------------------------------------------------------

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
  v_uid uuid := auth.uid();
  v_charge public.financial_charges;
  v_paid numeric(12, 2);
  v_remaining numeric(12, 2);
  v_amount numeric(12, 2) := round(p_amount, 2);
  v_diff numeric(12, 2);
  v_payment_id uuid;
  v_link_id uuid;
begin
  if v_uid is null then
    raise exception 'Sessão expirada. Entre novamente.' using errcode = 'P0001';
  end if;
  if v_amount is null or v_amount <= 0 then
    raise exception 'Informe um valor válido.' using errcode = 'P0001';
  end if;
  if p_payment_date is null then
    raise exception 'Informe a data do pagamento.' using errcode = 'P0001';
  end if;

  select * into v_charge from public.financial_charges where id = p_charge_id for update;
  if v_charge.id is null then
    raise exception 'Cobrança não encontrada.' using errcode = 'P0001';
  end if;
  if not public.has_module_permission(v_charge.space_id, 'financeiro', 'edit') then
    raise exception 'Sem permissão para editar o financeiro da empresa.' using errcode = 'P0001';
  end if;
  if v_charge.status = 'cancelado' then
    raise exception 'Esta cobrança foi cancelada.' using errcode = 'P0001';
  end if;

  select coalesce(sum(amount), 0) into v_paid from public.financial_payments where charge_id = v_charge.id;
  v_remaining := v_charge.amount - v_paid;
  if v_remaining <= 0 then
    raise exception 'Esta cobrança já está quitada.' using errcode = 'P0001';
  end if;
  if not p_settle and v_amount > v_remaining then
    raise exception 'Valor maior que o restante (%). Marque "quitar" para registrar a diferença como acréscimo.', replace(v_remaining::text, '.', ',') using errcode = 'P0001';
  end if;

  if p_settle and v_amount <> v_remaining then
    v_diff := v_amount - v_remaining;
    if v_diff < 0 then
      if v_charge.discount_amount - v_diff > v_charge.original_amount + v_charge.addition_amount then
        raise exception 'Desconto maior que o valor da cobrança.' using errcode = 'P0001';
      end if;
      update public.financial_charges set discount_amount = discount_amount - v_diff, updated_by = v_uid where id = v_charge.id;
    else
      update public.financial_charges set addition_amount = addition_amount + v_diff, updated_by = v_uid where id = v_charge.id;
    end if;
  end if;

  insert into public.financial_payments (space_id, charge_id, amount, payment_date, payment_method, account_id, payer_label, notes, created_by)
  values (v_charge.space_id, v_charge.id, v_amount, p_payment_date, p_payment_method, null, 'junior', nullif(trim(p_notes), ''), v_uid)
  returning id into v_payment_id;

  v_link_id := public.fin_attach_personal_debit(v_payment_id, p_personal_account_id, 'novo');

  return jsonb_build_object('payment_id', v_payment_id, 'link_id', v_link_id);
end;
$$;

grant execute on function public.fin_pay_with_personal_account(uuid, numeric, date, text, uuid, boolean, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. RPC: vincular pagamento ANTIGO a uma conta pessoal (sem recriar o
--    pagamento). p_existing_personal_payment_id = lançamento pessoal que
--    já registrou esse gasto → só liga, NÃO desconta de novo.
-- -----------------------------------------------------------------------------

create or replace function public.fin_link_payment_to_personal_account(
  p_payment_id uuid,
  p_personal_account_id uuid,
  p_existing_personal_payment_id uuid default null,
  p_detach_business_account boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.fin_attach_personal_debit(
    p_payment_id,
    p_personal_account_id,
    case when p_existing_personal_payment_id is null then 'retroativo' else 'existente' end,
    p_existing_personal_payment_id,
    p_detach_business_account
  );
end;
$$;

grant execute on function public.fin_link_payment_to_personal_account(uuid, uuid, uuid, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. RPC: desvincular (mantém a despesa paga na empresa, devolve o saldo
--    pessoal e restaura a conta da empresa de um vínculo retroativo)
-- -----------------------------------------------------------------------------

create or replace function public.fin_unlink_personal_account(p_link_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_link public.financial_personal_links;
begin
  select * into v_link from public.financial_personal_links where id = p_link_id for update;
  if v_link.id is null then
    raise exception 'Vínculo não encontrado.' using errcode = 'P0001';
  end if;
  if v_link.status <> 'ativo' then
    raise exception 'Este vínculo já foi desfeito — nada foi devolvido de novo.' using errcode = 'P0001';
  end if;
  if not public.has_module_permission(v_link.business_space_id, 'financeiro', 'edit') then
    raise exception 'Sem permissão para editar o financeiro da empresa.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.spaces where id = v_link.personal_space_id and owner_id = v_uid) then
    raise exception 'Somente o dono da conta pessoal pode desvincular.' using errcode = 'P0001';
  end if;

  update public.financial_personal_links
     set status = 'desvinculado', reversed_at = now(), reversed_by = v_uid,
         reversal_note = coalesce(nullif(trim(p_note), ''), 'Conta pessoal desvinculada')
   where id = v_link.id;

  if v_link.link_mode <> 'existente' then
    perform public.fin_release_personal_debit(v_link);
  end if;

  if v_link.business_account_id_before is not null and v_link.business_payment_id is not null then
    update public.financial_payments set account_id = v_link.business_account_id_before
     where id = v_link.business_payment_id and account_id is null;
  end if;
end;
$$;

grant execute on function public.fin_unlink_personal_account(uuid, text) to authenticated;

-- =============================================================================
-- Fim. Nada existente foi removido ou alterado: só tabelas, funções e
-- triggers novos. Pagamentos antigos continuam exatamente como estão até
-- serem vinculados manualmente pela tela ("Vincular à conta pessoal").
-- =============================================================================
