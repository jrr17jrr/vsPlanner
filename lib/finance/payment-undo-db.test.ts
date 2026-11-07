import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

/**
 * Migration 20261111100000 (quitar com desconto/acréscimo + desfazer com ou
 * sem devolução) sobre as migrations REAIS do Financeiro num Postgres embutido.
 */
const root = join(__dirname, "../..");
const migration = (name: string) => readFileSync(join(root, "supabase/migrations", name), "utf8");
const LINK = "20261110100000_financial_personal_link.sql";
const NEW = "20261111100000_financial_payment_undo.sql";
const JR = "11111111-1111-1111-1111-111111111111";

async function setup() {
  const db = new PGlite();
  await db.exec(`
    create role authenticated nologin; create role anon nologin;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public to authenticated, anon;
    create table public.profiles (id uuid primary key, name text not null);
    create table public.spaces (id uuid primary key default gen_random_uuid(), name text not null, slug text not null,
      type text not null, owner_id uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
    create table public.clients (id uuid primary key default gen_random_uuid());
    create table public.client_services (id uuid primary key default gen_random_uuid());
    create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
    create function public.has_module_permission(p uuid, m text, a text) returns boolean language sql stable as $$
      select exists (select 1 from public.spaces where id = p and owner_id = auth.uid()) $$;
    insert into public.profiles values ('${JR}', 'Ricardo Júnior');
  `);
  for (const m of ["007_financial.sql", "023_partner_expenses.sql", LINK, NEW, NEW]) await db.exec(migration(m));

  const id = async (sql: string, params: unknown[] = []) => (await db.query<{ id: string }>(sql, params)).rows[0].id;
  const biz = await id(`insert into spaces (name, slug, type, owner_id) values ('Visionário Dev', 'visionario-dev', 'business', '${JR}') returning id`);
  const pes = await id(`insert into spaces (name, slug, type, owner_id) values ('Pessoal', 'pessoal', 'personal', '${JR}') returning id`);
  const nubank = await id(`insert into financial_accounts (space_id, name, initial_balance, initial_balance_date, created_by) values ($1, 'Nubank', 1000, '2026-01-01', '${JR}') returning id`, [pes]);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [JR]);

  const bill = async (space: string, description: string, amount: number, origin?: string, due = "2026-11-10") => {
    const o = origin ?? (await id(`insert into financial_origins (space_id, kind, origin_type, description, created_by) values ($1, 'saida', 'unico', $2, '${JR}') returning id`, [space, description]));
    return id(`insert into financial_charges (space_id, origin_id, kind, description, original_amount, due_date, created_by) values ($1, $2, 'saida', $3, $4, $5, '${JR}') returning id`, [space, o, description, amount, due]);
  };
  const pay = async (charge: string, amount: number, settle: boolean, account: string | null = nubank) =>
    (await db.query<{ r: { payment_id: string; discount: number; addition: number; remaining: number } }>(
      `select fin_register_payment($1, $2, '2026-11-06', 'pix', $3, $4) as r`, [charge, amount, account, settle])).rows[0].r;
  const undo = (payment: string, refund: boolean) => db.query(`select fin_undo_payment($1, $2, 'teste') as r`, [payment, refund]);
  const chargeState = async (charge: string) =>
    (await db.query(`select amount::float8 as amount, discount_amount::float8 as discount, addition_amount::float8 as addition,
       (select coalesce(sum(p.amount), 0)::float8 from financial_payments p where p.charge_id = c.id) as paid from financial_charges c where id = $1`, [charge])).rows[0];
  const balance = async (accountId: string) =>
    Number((await db.query<{ b: string }>(`
      select a.initial_balance + coalesce(sum(case when c.kind = 'entrada' then p.amount else -p.amount end), 0) as b
        from financial_accounts a left join financial_payments p on p.account_id = a.id and p.payment_date >= a.initial_balance_date
        left join financial_charges c on c.id = p.charge_id where a.id = $1 group by a.id`, [accountId])).rows[0].b);
  return { db, biz, pes, nubank, bill, pay, undo, chargeState, balance, id };
}

describe("migration 20261111100000 — quitar com desconto/acréscimo e desfazer pagamento", () => {
  it("pagamento integral e desfazer COM devolução", async () => {
    const { pes, nubank, bill, pay, undo, chargeState, balance } = await setup();
    const seguro = await bill(pes, "Seguro da moto", 144);
    const r = await pay(seguro, 144, true);
    expect(r).toMatchObject({ discount: 0, addition: 0, remaining: 0 });
    expect(await balance(nubank)).toBe(856);
    await undo(r.payment_id, true);
    expect(await chargeState(seguro)).toEqual({ amount: 144, discount: 0, addition: 0, paid: 0 });
    expect(await balance(nubank)).toBe(1000);
  });

  it("quitar com valor menor vira desconto; desfazer devolve o pago e reverte o desconto", async () => {
    const { db, pes, nubank, bill, pay, undo, chargeState, balance } = await setup();
    const seguro = await bill(pes, "Seguro da moto", 144);
    const r = await pay(seguro, 124, true);
    expect(r).toMatchObject({ discount: 20, addition: 0, remaining: 0 });
    expect(await chargeState(seguro)).toEqual({ amount: 124, discount: 20, addition: 0, paid: 124 });
    expect(await balance(nubank)).toBe(876); // só o valor realmente pago sai da conta

    await undo(r.payment_id, true);
    expect(await chargeState(seguro)).toEqual({ amount: 144, discount: 0, addition: 0, paid: 0 });
    expect(await balance(nubank)).toBe(1000);
    const rev = (await db.query(`select mode, amount::float8 as amount, discount_reverted::float8 as d, account_name from financial_payment_reversals`)).rows;
    expect(rev).toEqual([{ mode: "devolvido", amount: 124, d: 20, account_name: "Nubank" }]);
    await expect(undo(r.payment_id, true)).rejects.toThrow(/já foi desfeito/);
    expect(await balance(nubank)).toBe(1000);
  });

  it("quitar com valor maior vira acréscimo", async () => {
    const { pes, nubank, bill, pay, chargeState, balance } = await setup();
    const c = await bill(pes, "Conta de luz", 144);
    const r = await pay(c, 150, true);
    expect(r).toMatchObject({ discount: 0, addition: 6, remaining: 0 });
    expect(await chargeState(c)).toEqual({ amount: 150, discount: 0, addition: 6, paid: 150 });
    expect(await balance(nubank)).toBe(850);
  });

  it("sem quitar: pagamento parcial, restante em aberto e nenhum desconto", async () => {
    const { pes, bill, pay, chargeState } = await setup();
    const c = await bill(pes, "Seguro da moto", 144);
    const r = await pay(c, 124, false);
    expect(r).toMatchObject({ discount: 0, addition: 0, remaining: 20 });
    expect(await chargeState(c)).toEqual({ amount: 144, discount: 0, addition: 0, paid: 124 });
    await expect(pay(c, 50, false)).rejects.toThrow(/maior que o restante/);
  });

  it("recorrente: quitar com desconto um mês não mexe nos outros meses", async () => {
    const { db, pes, bill, pay, chargeState, id } = await setup();
    const origin = await id(`insert into financial_origins (space_id, kind, origin_type, description, recurrence_frequency, created_by) values ($1, 'saida', 'recorrente', 'Internet', 'mensal', '${JR}') returning id`, [pes]);
    const nov = await bill(pes, "Internet", 100, origin, "2026-11-10");
    const dez = await bill(pes, "Internet", 100, origin, "2026-12-10");
    await pay(nov, 90, true);
    expect(await chargeState(nov)).toEqual({ amount: 90, discount: 10, addition: 0, paid: 90 });
    expect(await chargeState(dez)).toEqual({ amount: 100, discount: 0, addition: 0, paid: 0 });
    expect((await db.query(`select count(*)::int as n from financial_charges where origin_id = $1`, [origin])).rows[0]).toEqual({ n: 2 });
  });

  it("desfazer SEM devolução: reabre a cobrança, saldo igual, lançamento rastreado e travado", async () => {
    const { db, pes, nubank, bill, pay, undo, chargeState, balance } = await setup();
    const seguro = await bill(pes, "Seguro da moto", 144);
    const r = await pay(seguro, 124, true);
    await undo(r.payment_id, false);

    expect(await chargeState(seguro)).toEqual({ amount: 144, discount: 0, addition: 0, paid: 0 }); // reaberta
    expect(await balance(nubank)).toBe(876); // dinheiro NÃO volta
    const adj = (await db.query<{ id: string; description: string; category: string; paid: number }>(`
      select c.id, c.description, cat.name as category, (select sum(amount)::float8 from financial_payments where charge_id = c.id) as paid
        from financial_charges c join financial_categories cat on cat.id = c.category_id where c.description like 'Sem devolução%'`)).rows[0];
    expect(adj).toMatchObject({ description: "Sem devolução · Seguro da moto", category: "Pagamentos desfeitos sem devolução", paid: 124 });
    // O mesmo lançamento (não um novo): continua sendo 1 pagamento no total.
    expect((await db.query(`select count(*)::int as n from financial_payments`)).rows[0]).toEqual({ n: 1 });
    const rev = (await db.query(`select mode, adjustment_charge_id = $1 as ok from financial_payment_reversals`, [adj.id])).rows;
    expect(rev).toEqual([{ mode: "sem_devolucao", ok: true }]);

    // Nunca devolvido depois por outro caminho.
    await expect(undo(r.payment_id, true)).rejects.toThrow(/já foi desfeito/);
    await expect(db.query(`delete from financial_payments where id = $1`, [r.payment_id])).rejects.toThrow(/SEM devolução/);
    await expect(db.query(`delete from financial_charges where id = $1`, [adj.id])).rejects.toThrow(/SEM devolução/);
    await expect(db.query(`update financial_payments set amount = 1 where id = $1`, [r.payment_id])).rejects.toThrow(/SEM devolução/);
    expect(await balance(nubank)).toBe(876);

    // A cobrança reaberta pode ser paga de novo normalmente.
    await pay(seguro, 144, true);
    expect(await balance(nubank)).toBe(732);
  });

  it("vínculo Visionário Dev: só desfaz pela empresa, devolve UMA vez à conta pessoal de origem", async () => {
    const { db, biz, nubank, bill, undo, balance } = await setup();
    const c = await bill(biz, "Chat GPT", 103.4);
    const { payment_id } = (await db.query<{ r: { payment_id: string } }>(
      `select fin_pay_with_personal_account($1, 100, '2026-11-06', 'credito', $2, true) as r`, [c, nubank])).rows[0].r;
    expect((await db.query(`select settle_discount::float8 as d from financial_payments where id = $1`, [payment_id])).rows[0]).toEqual({ d: 3.4 });
    expect(await balance(nubank)).toBe(900);
    const personalPayment = (await db.query<{ id: string }>(`select personal_payment_id as id from financial_personal_links`)).rows[0].id;

    await expect(undo(personalPayment, true)).rejects.toThrow(/Desfaça o pagamento pela Visionário Dev/);
    await expect(undo(payment_id, false)).rejects.toThrow(/sempre volta/);
    await undo(payment_id, true);
    expect(await balance(nubank)).toBe(1000);
    expect((await db.query(`select discount_amount::float8 as d from financial_charges where id = $1`, [c])).rows[0]).toEqual({ d: 0 });
    expect((await db.query(`select status from financial_personal_links`)).rows[0]).toEqual({ status: "estornado" });
    await expect(undo(payment_id, true)).rejects.toThrow(/já foi desfeito/);
    expect(await balance(nubank)).toBe(1000);
  });

  it("pagamento antigo (sem rastreio) é desfeito sem mexer no desconto que já existia", async () => {
    const { db, pes, nubank, bill, undo, chargeState, balance } = await setup();
    const c = await bill(pes, "Plano", 100);
    await db.query(`update financial_charges set discount_amount = 10 where id = $1`, [c]);
    const old = (await db.query<{ id: string }>(`insert into financial_payments (space_id, charge_id, amount, payment_date, payment_method, account_id, created_by)
      values ($1, $2, 90, '2026-11-01', 'pix', $3, '${JR}') returning id`, [pes, c, nubank])).rows[0].id;
    await undo(old, true);
    expect(await chargeState(c)).toEqual({ amount: 90, discount: 10, addition: 0, paid: 0 });
    expect(await balance(nubank)).toBe(1000);
  });
});
