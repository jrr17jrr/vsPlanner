import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

/**
 * Migration 20261113100000 (parcelamentos editáveis + cartões de crédito)
 * sobre as migrations REAIS do Financeiro, num Postgres embutido.
 */
const root = join(__dirname, "../..");
const migration = (name: string) => readFileSync(join(root, "supabase/migrations", name), "utf8");
const NEW = "20261113100000_installments_credit_cards.sql";
const JR = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

async function setup() {
  const db = new PGlite();
  await db.exec(`
    create role authenticated nologin; create role anon nologin;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public to authenticated, anon;
    grant usage on schema auth to authenticated, anon;
    create table public.profiles (id uuid primary key, name text not null);
    create table public.spaces (id uuid primary key default gen_random_uuid(), name text not null, slug text not null,
      type text not null, owner_id uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
    create table public.clients (id uuid primary key default gen_random_uuid());
    create table public.client_services (id uuid primary key default gen_random_uuid());
    create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
    create function public.has_module_permission(p uuid, m text, a text) returns boolean language sql stable security definer as $$
      select exists (select 1 from public.spaces where id = p and owner_id = auth.uid()) $$;
    insert into public.profiles values ('${JR}', 'Ricardo Júnior'), ('${OTHER}', 'Outra pessoa');
    grant select on public.spaces, public.profiles to authenticated;
  `);
  for (const m of ["007_financial.sql", "023_partner_expenses.sql", "20261110100000_financial_personal_link.sql", "20261111100000_financial_payment_undo.sql", NEW, NEW]) {
    await db.exec(migration(m));
  }
  // Índice de produção (migration 009): uma cobrança por origem e vencimento.
  await db.exec(`create unique index if not exists uq_financial_charges_origin_due on public.financial_charges (origin_id, due_date);`);

  const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
  const id = async (sql: string, params: unknown[] = []) => (await db.query<{ id: string }>(sql, params)).rows[0].id;
  const pes = await id(`insert into spaces (name, slug, type, owner_id) values ('Pessoal', 'pessoal', 'personal', '${JR}') returning id`);
  const nubank = await id(`insert into financial_accounts (space_id, name, initial_balance, initial_balance_date, created_by) values ($1, 'Nubank', 1000, '2026-01-01', '${JR}') returning id`, [pes]);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [JR]);

  const balance = async (accountId = nubank) =>
    Number((await q<{ b: string }>(`
      select a.initial_balance + coalesce(sum(case when c.kind = 'entrada' then p.amount else -p.amount end), 0) as b
        from financial_accounts a left join financial_payments p on p.account_id = a.id and p.payment_date >= a.initial_balance_date
        left join financial_charges c on c.id = p.charge_id where a.id = $1 group by a.id`, [accountId]))[0].b);

  const card = (name: string, closing = 20, due = 27, ownership = "proprio", holder: string | null = null) =>
    id(`insert into credit_cards (space_id, name, ownership, holder_name, closing_day, due_day, credit_limit, created_by)
        values ($1, $2, $3, $4, $5, $6, 5000, '${JR}') returning id`, [pes, name, ownership, holder, closing, due]);
  const buy = async (cardId: string, description: string, date: string, type: string, amounts: number[], first: string) =>
    (await q<{ id: string }>(`select card_create_purchase($1, $2, null, $3, $4, $5::numeric[], $6) as id`, [cardId, description, date, type, amounts, first]))[0].id;
  const invoices = (cardId: string) =>
    q<{ month: string; due: string; total: number; charge_amount: number | null; status: string | null; paid: number }>(`
      select to_char(i.reference_month, 'YYYY-MM') as month, i.due_date::text as due,
             coalesce((select sum(amount) from credit_card_purchase_items where invoice_id = i.id and status = 'ativo'), 0)::float8 as total,
             c.amount::float8 as charge_amount, c.status, coalesce(fin_charge_paid(c.id), 0)::float8 as paid
        from credit_card_invoices i left join financial_charges c on c.id = i.charge_id where i.card_id = $1 order by i.reference_month`, [cardId]);
  const invoiceCharge = async (cardId: string, month: string) =>
    (await q<{ id: string }>(`select charge_id as id from credit_card_invoices where card_id = $1 and to_char(reference_month, 'YYYY-MM') = $2`, [cardId, month]))[0].id;
  const pay = async (charge: string, amount: number, settle = false) =>
    (await q<{ r: { payment_id: string; remaining: number } }>(`select fin_register_payment($1, $2, '2026-11-25', 'pix', $3, $4) as r`, [charge, amount, nubank, settle]))[0].r;

  /** Parcelamento "à moda antiga" (como createOriginWithCharges grava). */
  const installmentDebt = async (description: string, amounts: number[], dues: string[]) => {
    const origin = await id(`insert into financial_origins (space_id, kind, origin_type, description, installment_count, created_by) values ($1, 'saida', 'parcelado', $2, $3, '${JR}') returning id`, [pes, description, amounts.length]);
    const ids: string[] = [];
    for (let i = 0; i < amounts.length; i++) {
      ids.push(await id(`insert into financial_charges (space_id, origin_id, kind, description, installment_number, installment_total, original_amount, due_date, competency_date, created_by)
        values ($1, $2, 'saida', $3, $4, $5, $6, $7, date_trunc('month', $7::date)::date, '${JR}') returning id`, [pes, origin, `${description} (${i + 1}/${amounts.length})`, i + 1, amounts.length, amounts[i], dues[i]]));
    }
    return { origin, ids };
  };
  const charges = (origin: string) =>
    q<{ n: number; total: number; due: string; amount: number; status: string; description: string }>(`
      select installment_number as n, installment_total as total, due_date::text as due, amount::float8 as amount, status, description
        from financial_charges where origin_id = $1 order by installment_number, status`, [origin]);

  return { db, q, id, pes, nubank, balance, card, buy, invoices, invoiceCharge, pay, installmentDebt, charges };
}

describe("migration 20261113100000 — parcelamentos", () => {
  it("é aditiva: lançamentos, pagamentos e saldo antigos ficam iguais", async () => {
    const { q, installmentDebt, pay, balance, charges } = await setup();
    const { origin, ids } = await installmentDebt("Notebook", [300, 300, 300], ["2026-11-10", "2026-12-10", "2027-01-10"]);
    await pay(ids[0], 300, true);
    const before = await charges(origin);
    expect(await balance()).toBe(700);
    expect((await q(`select count(*)::int n from financial_charges where card_invoice_id is not null`))[0]).toEqual({ n: 0 });
    expect(await charges(origin)).toEqual(before);
  });

  it("vencimento: esta e as próximas reorganiza mantendo a parcela paga; nenhum saldo muda", async () => {
    const { q, installmentDebt, pay, balance, charges } = await setup();
    const { origin, ids } = await installmentDebt("Empréstimo", [100, 100, 100, 100], ["2026-11-10", "2026-12-10", "2027-01-10", "2027-02-10"]);
    await pay(ids[0], 100, true);
    await expect(q(`select fin_reschedule_charges($1, $2::uuid[], $3::date[])`, [origin, [ids[0]], ["2026-12-15"]])).rejects.toThrow(/quitada/);
    // 2/4 passa de 10/12 para 15/12 e as próximas acompanham (troca de datas entre parcelas = duas fases).
    await q(`select fin_reschedule_charges($1, $2::uuid[], $3::date[])`, [origin, ids.slice(1), ["2026-12-15", "2027-01-15", "2027-02-15", "2027-03-15"].slice(0, 3)]);
    expect((await charges(origin)).map((c) => c.due)).toEqual(["2026-11-10", "2026-12-15", "2027-01-15", "2027-02-15"]);
    // Antecipar 3/4 para 10/12 (data que era da 2/4 antes) funciona.
    await q(`select fin_reschedule_charges($1, $2::uuid[], $3::date[])`, [origin, [ids[2]], ["2026-12-20"]]);
    expect((await charges(origin))[2].due).toBe("2026-12-20");
    expect(await balance()).toBe(900);
    expect((await q(`select to_char(competency_date, 'YYYY-MM') c from financial_charges where id = $1`, [ids[1]]))[0]).toEqual({ c: "2026-12" });
    await expect(q(`select fin_reschedule_charges($1, $2::uuid[], $3::date[])`, [origin, [ids[3]], ["2026-12-20"]])).rejects.toThrow(/mesmo vencimento/);
  });

  it("edição completa: 14 → 12 parcelas sem apagar nada, pagas preservadas; não reduz abaixo das pagas", async () => {
    const { q, installmentDebt, pay, balance, charges } = await setup();
    const dues = Array.from({ length: 14 }, (_, i) => `${2026 + Math.floor((10 + i) / 12)}-${String(((10 + i) % 12) + 1).padStart(2, "0")}-05`);
    const { origin, ids } = await installmentDebt("Empréstimo Nubank", Array(14).fill(100), dues);
    await pay(ids[0], 100, true);
    await pay(ids[1], 100, true);
    const rows = Array.from({ length: 12 }, (_, i) => ({ id: ids[i], number: i + 1, amount: i < 2 ? 100 : 120, due_date: dues[i] })); // 1400 − 200 pagos = 1200 em 10 parcelas
    const r = (await q<{ r: { cancelled: number; count: number } }>(`select fin_replan_installments($1, $2::jsonb) as r`, [origin, JSON.stringify(rows)]))[0].r;
    expect(r).toMatchObject({ cancelled: 2, count: 12 });
    const after = await charges(origin);
    expect(after.filter((c) => c.status === "ativo")).toHaveLength(12);
    expect(after.filter((c) => c.status === "cancelado").map((c) => c.n)).toEqual([13, 14]); // canceladas, não apagadas
    expect(after[0]).toMatchObject({ n: 1, total: 12, amount: 100, description: "Empréstimo Nubank (1/12)" });
    expect(after.filter((c) => c.status === "ativo").reduce((s, c) => s + c.amount, 0)).toBeCloseTo(1400, 2);
    expect(await balance()).toBe(800);
    expect((await q(`select installment_count from financial_origins where id = $1`, [origin]))[0]).toEqual({ installment_count: 12 });

    // Não muda o valor de parcela paga, nem remove parcela paga.
    await expect(q(`select fin_replan_installments($1, $2::jsonb)`, [origin, JSON.stringify([{ id: ids[0], number: 1, amount: 50, due_date: dues[0] }])])).rejects.toThrow();
    // Voltar a 14 reativa as canceladas (sem duplicar).
    const back = Array.from({ length: 14 }, (_, i) => ({ id: ids[i], number: i + 1, amount: 100, due_date: dues[i] }));
    await q(`select fin_replan_installments($1, $2::jsonb)`, [origin, JSON.stringify(back)]);
    expect((await charges(origin)).filter((c) => c.status === "ativo")).toHaveLength(14);
    expect((await q(`select count(*)::int n from financial_charges where origin_id = $1`, [origin]))[0]).toEqual({ n: 14 });
  });
});

describe("migration 20261113100000 — cartões de crédito", () => {
  it("compra à vista e parcelada entram nas faturas certas; comprar não mexe no saldo", async () => {
    const { card, buy, invoices, balance } = await setup();
    const nu = await card("Meu Nubank", 20, 27);
    await buy(nu, "Mercado", "2026-11-08", "avista", [150], "2026-11-01");
    await buy(nu, "PS5", "2026-11-21", "parcelada", Array(10).fill(350), "2026-12-01");
    const inv = await invoices(nu);
    expect(inv[0]).toMatchObject({ month: "2026-11", due: "2026-11-27", total: 150, charge_amount: 150 });
    expect(inv[1]).toMatchObject({ month: "2026-12", due: "2026-12-27", total: 350 });
    expect(inv).toHaveLength(11);
    expect(inv[10]).toMatchObject({ month: "2027-09", total: 350 });
    expect(await balance()).toBe(1000);
  });

  it("pagar fatura: parcial, depois o restante quita; desfazer devolve; não paga acima do devido", async () => {
    const { q, card, buy, invoiceCharge, pay, balance, invoices } = await setup();
    const nu = await card("Meu Nubank");
    await buy(nu, "Compras", "2026-11-05", "avista", [850], "2026-11-01");
    const charge = await invoiceCharge(nu, "2026-11");
    const first = await pay(charge, 500);
    expect(first.remaining).toBe(350);
    expect(await balance()).toBe(500);
    await expect(pay(charge, 400)).rejects.toThrow(/maior que o restante/);
    await pay(charge, 350);
    expect((await invoices(nu))[0]).toMatchObject({ paid: 850, charge_amount: 850 });
    expect(await balance()).toBe(150);
    // A fatura é UMA cobrança: a compra no cartão não é uma segunda despesa.
    expect((await q(`select count(*)::int n from financial_charges where kind = 'saida' and status = 'ativo'`))[0]).toEqual({ n: 1 });
    await q(`select fin_undo_payment($1, true, 'teste')`, [first.payment_id]);
    expect(await balance()).toBe(650);
  });

  it("fatura paga não muda: compra retroativa vai para a próxima fatura em aberto", async () => {
    const { card, buy, invoiceCharge, pay, invoices } = await setup();
    const nu = await card("Meu Nubank");
    await buy(nu, "Mercado", "2026-11-05", "avista", [100], "2026-11-01");
    await pay(await invoiceCharge(nu, "2026-11"), 100);
    await buy(nu, "Esquecida", "2026-11-06", "avista", [40], "2026-11-01");
    const inv = await invoices(nu);
    expect(inv[0]).toMatchObject({ month: "2026-11", total: 100, charge_amount: 100, paid: 100 });
    expect(inv[1]).toMatchObject({ month: "2026-12", total: 40 });
  });

  it("estorno e cancelamento: parte paga vira crédito rastreável; parte não paga some da fatura", async () => {
    const { q, card, buy, invoiceCharge, pay, invoices } = await setup();
    const nu = await card("Meu Nubank");
    const ps5 = await buy(nu, "Fone", "2026-11-05", "parcelada", [100, 100, 100], "2026-11-01");
    await pay(await invoiceCharge(nu, "2026-11"), 100);
    await q(`select card_cancel_purchase($1, 'devolvi')`, [ps5]);
    const inv = await invoices(nu);
    expect(inv[0]).toMatchObject({ month: "2026-11", total: 100, paid: 100 }); // fatura paga intacta
    expect(inv[1].total).toBe(-100 + 0); // dez: parcela cancelada + estorno de 100 do que já foi pago
    expect(inv[2]).toMatchObject({ total: 0, status: "cancelado" });
    expect((await q(`select item_type, amount::float8 amount, status from credit_card_purchase_items order by created_at, installment_number`)).map((r) => `${r.item_type}:${r.amount}:${r.status}`))
      .toEqual(["parcela:100:ativo", "parcela:100:cancelado", "parcela:100:cancelado", "estorno:-100:ativo"]);
  });

  it("editar compra: em fatura aberta relança; com parcela em fatura paga, só por estorno", async () => {
    const { q, card, buy, invoiceCharge, pay, invoices } = await setup();
    const nu = await card("Meu Nubank");
    const tv = await buy(nu, "TV", "2026-11-05", "parcelada", [500, 500], "2026-11-01");
    await q(`select card_update_purchase($1, 'TV 50', null, null, true, null, null, 'parcelada', $2::numeric[], '2026-12-01')`, [tv, [250, 250, 250, 250]]);
    expect((await invoices(nu)).map((i) => `${i.month}:${i.total}`)).toEqual(["2026-11:0", "2026-12:250", "2027-01:250", "2027-02:250", "2027-03:250"]);
    await pay(await invoiceCharge(nu, "2026-12"), 250);
    await expect(q(`select card_update_purchase($1, 'TV', null, null, true, null, null, 'parcelada', $2::numeric[], null)`, [tv, [100, 100]])).rejects.toThrow(/fatura paga/);
    await q(`select card_update_purchase($1, 'TV 50 polegadas', null, null, false)`, [tv]);
    expect((await q(`select description from credit_card_purchases where id = $1`, [tv]))[0]).toEqual({ description: "TV 50 polegadas" });
  });

  it("assinatura: cobrança única por data, pausar/reativar pula meses e cancelar mantém o histórico", async () => {
    const { q, card } = await setup();
    const nu = await card("Meu Nubank");
    const sub = (await q<{ id: string }>(`select card_create_subscription($1, 'Netflix', null, 39.9, 15, '2026-09-15') as id`, [nu]))[0].id;
    const charge = (date: string) => q<{ id: string | null }>(`select card_create_purchase($1, 'Netflix', null, $2, 'assinatura', '{39.9}', null, null, $3, $2::date) as id`, [nu, date, sub]);
    await charge("2026-09-15");
    await charge("2026-10-15");
    expect((await charge("2026-10-15"))[0].id).toBeNull(); // não duplica
    await q(`select card_set_subscription_status($1, 'pausada', '2026-10-20')`, [sub]);
    await q(`select card_set_subscription_status($1, 'ativa', '2026-12-01')`, [sub]);
    expect((await q(`select generated_through::text g from credit_card_subscriptions where id = $1`, [sub]))[0]).toEqual({ g: "2026-11-30" });
    await q(`select card_set_subscription_status($1, 'cancelada', '2026-12-05')`, [sub]);
    expect((await q(`select count(*)::int n from credit_card_purchases where subscription_id = $1 and status = 'ativa'`, [sub]))[0]).toEqual({ n: 2 });
    expect((await q(`select action from credit_card_subscription_events where subscription_id = $1 order by created_at`, [sub])).map((r) => r.action))
      .toEqual(["criada", "pausada", "reativada", "cancelada"]);
    await expect(q(`select card_set_subscription_status($1, 'ativa', '2026-12-10')`, [sub])).rejects.toThrow(/cancelada/);
  });

  it("cartão de terceiro: pagar ao titular abate as faturas mais antigas, parcial e sem passar do devido", async () => {
    const { q, card, buy, balance, invoices } = await setup();
    const cunhado = await card("Cartão do cunhado", 5, 12, "terceiro", "Cunhado");
    await buy(cunhado, "Tênis", "2026-11-02", "parcelada", [160, 160], "2026-11-01");
    expect((await q(`select description from financial_charges where card_invoice_id is not null order by due_date limit 1`))[0].description).toMatch(/a pagar para Cunhado/);
    await expect(q(`select card_pay_holder($1, 400, '2026-11-20', 'pix', $2)`, [cunhado, (await q<{ id: string }>(`select id from financial_accounts`))[0].id])).rejects.toThrow(/maior do que você deve/);
    const nubank = (await q<{ id: string }>(`select id from financial_accounts`))[0].id;
    const r = (await q<{ r: { remaining: number } }>(`select card_pay_holder($1, 200, '2026-11-20', 'pix', $2) as r`, [cunhado, nubank]))[0].r;
    expect(Number(r.remaining)).toBe(120);
    expect((await invoices(cunhado)).map((i) => i.paid)).toEqual([160, 40]);
    expect(await balance()).toBe(800);
  });

  it("converter dívida de A pagar em compra no cartão não duplica valores", async () => {
    const { q, card, installmentDebt, pay, charges, invoices } = await setup();
    const nu = await card("Meu Nubank");
    const { origin, ids } = await installmentDebt("Celular", [200, 200, 200], ["2026-11-10", "2026-12-10", "2027-01-10"]);
    await pay(ids[0], 200, true);
    await q(`select fin_convert_origin_to_card($1, $2, '2026-12-01')`, [origin, nu]);
    expect((await charges(origin)).map((c) => c.status)).toEqual(["ativo", "cancelado", "cancelado"]);
    expect((await invoices(nu)).map((i) => `${i.month}:${i.total}`)).toEqual(["2026-12:200", "2027-01:200"]);
    const openSaida = await q<{ total: number }>(`select coalesce(sum(amount), 0)::float8 total from financial_charges where kind = 'saida' and status = 'ativo'`);
    expect(openSaida[0].total).toBe(600); // 200 já pago + 400 nas faturas
    await expect(q(`select fin_convert_origin_to_card($1, $2, '2026-12-01')`, [origin, nu])).rejects.toThrow(/já foi convertida/);
  });

  it("cobrança da fatura é protegida: não muda valor fora do módulo de cartões", async () => {
    const { q, card, buy, invoiceCharge } = await setup();
    const nu = await card("Meu Nubank");
    await buy(nu, "Mercado", "2026-11-05", "avista", [100], "2026-11-01");
    await expect(q(`update financial_charges set original_amount = 1 where id = $1`, [await invoiceCharge(nu, "2026-11")])).rejects.toThrow(/fatura de um cartão/);
  });

  it("mudança de fechamento: só faturas futuras sem pagamento recebem as novas datas", async () => {
    const { q, card, buy, invoiceCharge, pay, invoices } = await setup();
    const nu = await card("Meu Nubank", 20, 27);
    await buy(nu, "Curso", "2030-01-05", "parcelada", [100, 100], "2030-01-01");
    await pay(await invoiceCharge(nu, "2030-01"), 100);
    await q(`update credit_cards set closing_day = 3, due_day = 10 where id = $1`, [nu]);
    expect((await invoices(nu)).map((i) => i.due)).toEqual(["2030-01-27", "2030-02-10"]);
  });

  it("RLS: outra pessoa não vê nem cria nada nos cartões de outro espaço", async () => {
    const { db, q, pes, card, buy } = await setup();
    const nu = await card("Meu Nubank");
    await buy(nu, "Mercado", "2026-11-05", "avista", [100], "2026-11-01");
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [OTHER]);
    await db.exec(`set role authenticated`);
    try {
      expect(await q(`select * from credit_cards`)).toEqual([]);
      expect(await q(`select * from credit_card_purchases`)).toEqual([]);
      expect(await q(`select * from credit_card_invoices`)).toEqual([]);
      await expect(q(`insert into credit_cards (space_id, name, closing_day, due_day, created_by) values ($1, 'x', 1, 10, '${OTHER}')`, [pes])).rejects.toThrow();
      await expect(q(`select card_create_purchase($1, 'x', null, '2026-11-05', 'avista', '{10}', null)`, [nu])).rejects.toThrow(/permissão/);
      await expect(q(`insert into credit_card_purchases (space_id, card_id, description, purchase_date, purchase_type, total_amount, first_invoice_month, created_by)
        values ($1, $2, 'x', '2026-11-05', 'avista', 10, '2026-11-01', '${OTHER}')`, [pes, nu])).rejects.toThrow();
    } finally {
      await db.exec(`reset role`);
    }
  });

  it("não guarda número completo do cartão; fechamento e vencimento distintos", async () => {
    const { q, pes } = await setup();
    await expect(q(`insert into credit_cards (space_id, name, last4, closing_day, due_day, created_by) values ($1, 'x', '1234567812345678', 1, 10, '${JR}')`, [pes])).rejects.toThrow();
    await expect(q(`insert into credit_cards (space_id, name, closing_day, due_day, created_by) values ($1, 'y', 10, 10, '${JR}')`, [pes])).rejects.toThrow();
    await expect(q(`insert into credit_cards (space_id, name, ownership, closing_day, due_day, created_by) values ($1, 'z', 'terceiro', 1, 10, '${JR}')`, [pes])).rejects.toThrow();
  });
});
