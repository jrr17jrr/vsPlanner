import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

/**
 * Dívida Ex-sócio G sobre as migrations REAIS do Financeiro (Postgres
 * embutido): reproduz o bug ("Quitar" ligado num pagamento parcial vira
 * desconto), aplica o fix de supabase/fixes e valida pagamentos seguintes,
 * edição e exclusão (desfazer com devolução) — sem tocar em outra cobrança.
 */
const root = join(__dirname, "../..");
const read = (...p: string[]) => readFileSync(join(root, ...p), "utf8");
const FIX = read("supabase/fixes/20261123_divida_ex_socio_g_valor_original.sql");
const JR = "11111111-1111-1111-1111-111111111111";

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
    insert into public.profiles values ('${JR}', 'Ricardo Júnior');
    grant select on public.spaces, public.profiles to authenticated;
  `);
  for (const m of ["007_financial.sql", "023_partner_expenses.sql", "20261110100000_financial_personal_link.sql", "20261111100000_financial_payment_undo.sql", "20261113100000_installments_credit_cards.sql"]) {
    await db.exec(read("supabase/migrations", m));
  }
  const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
  const id = async (sql: string, params: unknown[] = []) => (await q<{ id: string }>(sql, params))[0].id;
  const vd = await id(`insert into spaces (name, slug, type, owner_id) values ('Visionário Dev', 'visionario-dev', 'business', '${JR}') returning id`);
  const caixa = await id(`insert into financial_accounts (space_id, name, initial_balance, initial_balance_date, created_by) values ($1, 'Caixa', 2000, '2026-01-01', '${JR}') returning id`, [vd]);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [JR]);

  const charge = async (description: string, amount: number, due: string) => {
    const origin = await id(`insert into financial_origins (space_id, kind, origin_type, description, created_by) values ($1, 'saida', 'unico', $2, '${JR}') returning id`, [vd, description]);
    return id(`insert into financial_charges (space_id, origin_id, kind, description, original_amount, due_date, created_by) values ($1, $2, 'saida', $3, $4, $5, '${JR}') returning id`, [vd, origin, description, amount, due]);
  };
  const register = (chargeId: string, amount: number, date: string, settle: boolean, account: string | null = null, notes: string | null = null) =>
    q(`select fin_register_payment($1, $2, $3::date, 'pix', $4, $5, $6) as r`, [chargeId, amount, date, account, settle, notes]);
  const state = async (chargeId: string) =>
    (await q<{ original: string; discount: string; amount: string; paid: string; n: number }>(`
      select c.original_amount as original, c.discount_amount as discount, c.amount, coalesce(sum(p.amount), 0) as paid, count(p.id)::int as n
        from financial_charges c left join financial_payments p on p.charge_id = c.id where c.id = $1 group by c.id`, [chargeId]))
      .map((r) => ({ original: Number(r.original), discount: Number(r.discount), amount: Number(r.amount), paid: Number(r.paid), n: r.n }))[0];
  const balance = async () =>
    Number((await q<{ b: string }>(`select a.initial_balance - coalesce(sum(p.amount), 0) as b from financial_accounts a
      left join financial_payments p on p.account_id = a.id where a.id = $1 group by a.id`, [caixa]))[0].b);
  return { db, q, vd, caixa, charge, register, state, balance };
}

describe("dívida Ex-sócio G — bug, correção e próximos pagamentos (Postgres real)", () => {
  it("reproduz o bug, corrige pelo fix e mantém os pagamentos", async () => {
    const t = await setup();
    const debt = await t.charge("Dívida — Ex-sócio G", 1000, "2026-10-20");
    const bill = await t.charge("Internet", 120, "2026-11-10");
    await t.register(debt, 172, "2026-10-20", false, null, "Pagamento anterior");
    await t.register(debt, 353, "2026-11-10", true, t.caixa, "Pix p/ G"); // "Quitar" ligado (padrão antigo)

    expect(await t.state(debt)).toEqual({ original: 1000, discount: 475, amount: 525, paid: 525, n: 2 }); // = tela errada
    const before = await t.q(`select id, amount::text, payment_date::text, notes, account_id from financial_payments where charge_id = $1 order by payment_date`, [debt]);
    const billBefore = await t.q(`select * from financial_charges where id = $1`, [bill]);

    await t.db.exec(FIX);
    expect(await t.state(debt)).toEqual({ original: 1000, discount: 0, amount: 1000, paid: 525, n: 2 });
    // pagamentos idênticos (id, valor, data, observação, conta); só o desconto deles zerou
    expect(await t.q(`select id, amount::text, payment_date::text, notes, account_id from financial_payments where charge_id = $1 order by payment_date`, [debt])).toEqual(before);
    expect((await t.q<{ s: string }>(`select sum(settle_discount) as s from financial_payments where charge_id = $1`, [debt]))[0].s).toBe("0.00");
    expect(await t.q(`select * from financial_charges where id = $1`, [bill])).toEqual(billBefore);

    await t.db.exec(FIX); // idempotente
    expect(await t.state(debt)).toEqual({ original: 1000, discount: 0, amount: 1000, paid: 525, n: 2 });

    // Próximo pagamento é descontado do saldo (R$ 475 → R$ 375); acima do saldo é recusado.
    const caixaAntes = await t.balance();
    const [{ r }] = await t.register(debt, 100, "2026-11-23", false, t.caixa);
    expect(Number((r as { remaining: number }).remaining)).toBe(375);
    expect(await t.balance()).toBe(caixaAntes - 100);
    await expect(t.register(debt, 375.01, "2026-11-23", false, t.caixa)).rejects.toThrow(/maior que o restante/);

    // Editar pagamento (o que updateDebtPaymentAction grava) e excluir com devolução.
    const p100 = (await t.q<{ id: string }>(`select id from financial_payments where charge_id = $1 and amount = 100`, [debt]))[0].id;
    await t.q(`update financial_payments set amount = 80, notes = 'corrigido' where id = $1`, [p100]);
    expect((await t.state(debt)).paid).toBe(605);
    expect(await t.balance()).toBe(caixaAntes - 80);
    await t.q(`select fin_undo_payment($1, true, 'Pagamento excluído no controle de dívidas')`, [p100]);
    expect(await t.state(debt)).toEqual({ original: 1000, discount: 0, amount: 1000, paid: 525, n: 2 });
    expect(await t.balance()).toBe(caixaAntes); // dinheiro voltou para a conta
    expect((await t.q(`select 1 from financial_payment_history where payment_id = $1`, [p100])).length).toBe(1); // histórico preservado

    // Quitação completa.
    await t.register(debt, 475, "2026-11-30", false, t.caixa);
    expect(await t.state(debt)).toMatchObject({ amount: 1000, paid: 1000 });
    await expect(t.register(debt, 1, "2026-12-01", false)).rejects.toThrow(/já está quitada/);
  });
});
