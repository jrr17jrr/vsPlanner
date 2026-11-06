import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

/**
 * Migration 20261110100000 (Visionário Dev ↔ Financeiro Pessoal) sobre as
 * migrations REAIS do Financeiro (007 + 023) num Postgres embutido.
 */
const root = join(__dirname, "../..");
const migration = (name: string) => readFileSync(join(root, "supabase/migrations", name), "utf8");
const NEW = "20261110100000_financial_personal_link.sql";

const JR = "11111111-1111-1111-1111-111111111111";
const GUI = "22222222-2222-2222-2222-222222222222";

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
    create table public.space_members (space_id uuid, user_id uuid);
    create table public.clients (id uuid primary key default gen_random_uuid());
    create table public.client_services (id uuid primary key default gen_random_uuid());
    create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
    create function public.has_module_permission(p uuid, m text, a text) returns boolean language sql stable as $$
      select exists (select 1 from public.spaces where id = p and owner_id = auth.uid())
          or exists (select 1 from public.space_members where space_id = p and user_id = auth.uid()) $$;
    insert into public.profiles values ('${JR}', 'Ricardo Júnior'), ('${GUI}', 'Guilherme');
  `);
  await db.exec(migration("007_financial.sql"));
  await db.exec(migration("023_partner_expenses.sql"));
  await db.exec(migration(NEW));
  await db.exec(migration(NEW)); // idempotente

  const id = async (sql: string) => (await db.query<{ id: string }>(sql)).rows[0].id;
  const biz = await id(`insert into spaces (name, slug, type, owner_id) values ('Visionário Dev', 'visionario-dev', 'business', '${JR}') returning id`);
  const pjr = await id(`insert into spaces (name, slug, type, owner_id) values ('Pessoal', 'pessoal-jr', 'personal', '${JR}') returning id`);
  const pgui = await id(`insert into spaces (name, slug, type, owner_id) values ('Pessoal', 'pessoal-gui', 'personal', '${GUI}') returning id`);
  await db.exec(`insert into space_members values ('${biz}', '${GUI}')`);
  const nubank = await id(`insert into financial_accounts (space_id, name, initial_balance, initial_balance_date, created_by) values ('${pjr}', 'Nubank', 1000, '2026-01-01', '${JR}') returning id`);
  const inter = await id(`insert into financial_accounts (space_id, name, initial_balance, initial_balance_date, created_by) values ('${pjr}', 'Inter', 500, '2026-01-01', '${JR}') returning id`);
  const guiAcc = await id(`insert into financial_accounts (space_id, name, initial_balance, initial_balance_date, created_by) values ('${pgui}', 'Conta Gui', 0, '2026-01-01', '${GUI}') returning id`);
  const bizAcc = await id(`insert into financial_accounts (space_id, name, initial_balance, initial_balance_date, created_by) values ('${biz}', 'Caixa empresa', 0, '2026-01-01', '${JR}') returning id`);

  const charge = async (description: string, amount: number) => {
    const origin = await id(`insert into financial_origins (space_id, kind, origin_type, description, created_by) values ('${biz}', 'saida', 'unico', '${description}', '${JR}') returning id`);
    return id(`insert into financial_charges (space_id, origin_id, kind, description, original_amount, due_date, created_by) values ('${biz}', '${origin}', 'saida', '${description}', ${amount}, '2026-11-06', '${JR}') returning id`);
  };
  const as = (uid: string) => db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid]);
  const balance = async (accountId: string) =>
    Number((await db.query<{ b: string }>(`
      select a.initial_balance + coalesce(sum(case when c.kind = 'entrada' then p.amount else -p.amount end), 0) as b
        from financial_accounts a
        left join financial_payments p on p.account_id = a.id and p.payment_date >= a.initial_balance_date
        left join financial_charges c on c.id = p.charge_id
       where a.id = $1 group by a.id`, [accountId])).rows[0].b);

  await as(JR);
  return { db, biz, pjr, pgui, nubank, inter, guiAcc, bizAcc, charge, as, balance };
}

describe("migration 20261110100000 — pagamento da Visionário Dev com conta pessoal", () => {
  it("paga a despesa da empresa e desconta da conta pessoal, sem contar duas vezes", async () => {
    const { db, nubank, bizAcc, charge, balance } = await setup();
    const chatgpt = await charge("ChatGPT", 103.4);
    const res = (await db.query<{ r: { payment_id: string } }>(
      `select fin_pay_with_personal_account($1, 103.40, '2026-11-06', 'credito', $2, true) as r`, [chatgpt, nubank])).rows[0].r;

    const bp = (await db.query(`select account_id, payer_label, amount::float8 as amount from financial_payments where id = $1`, [res.payment_id])).rows[0];
    expect(bp).toEqual({ account_id: null, payer_label: "junior", amount: 103.4 });
    expect(await balance(nubank)).toBe(896.6);
    expect(await balance(bizAcc)).toBe(0);

    const personal = (await db.query<{ description: string; category: string }>(`
      select c.description, cat.name as category from financial_charges c join financial_categories cat on cat.id = c.category_id
       where c.space_id <> (select space_id from financial_payments where id = $1)`, [res.payment_id])).rows;
    expect(personal).toEqual([{ description: "Visionário Dev · ChatGPT", category: "Pagamentos da Visionário Dev" }]);

    // Não desconta de novo.
    await expect(db.query(`select fin_link_payment_to_personal_account($1, $2)`, [res.payment_id, nubank])).rejects.toThrow(/já está vinculado/);
    expect(await balance(nubank)).toBe(896.6);
  });

  it("desfazer devolve o valor à MESMA conta, uma única vez, e guarda o histórico", async () => {
    const { db, nubank, inter, charge, balance } = await setup();
    const c = await charge("ChatGPT", 103.4);
    const { payment_id } = (await db.query<{ r: { payment_id: string } }>(
      `select fin_pay_with_personal_account($1, 103.40, '2026-11-06', 'pix', $2, true) as r`, [c, nubank])).rows[0].r;
    expect(await balance(nubank)).toBe(896.6);

    // O lançamento pessoal não some sozinho.
    const personalPayment = (await db.query<{ personal_payment_id: string }>(`select personal_payment_id from financial_personal_links`)).rows[0].personal_payment_id;
    await expect(db.query(`delete from financial_payments where id = $1`, [personalPayment])).rejects.toThrow(/Desfaça o pagamento pela Visionário Dev/);
    await expect(db.query(`update financial_payments set account_id = $2 where id = $1`, [personalPayment, inter])).rejects.toThrow(/vinculado/);

    await db.query(`delete from financial_payments where id = $1`, [payment_id]);
    expect(await balance(nubank)).toBe(1000);
    expect(await balance(inter)).toBe(500);
    const link = (await db.query(`select status, reversed_by is not null as by, amount::float8 as amount, account_name from financial_personal_links`)).rows[0];
    expect(link).toEqual({ status: "estornado", by: true, amount: 103.4, account_name: "Nubank" });
    const pc = (await db.query(`select status from financial_charges where description = 'Visionário Dev · ChatGPT'`)).rows[0];
    expect(pc).toEqual({ status: "cancelado" });
    // Despesa da empresa reaberta (sem pagamentos).
    expect((await db.query(`select count(*)::int as n from financial_payments where charge_id = $1`, [c])).rows[0]).toEqual({ n: 0 });
    // Histórico: pagamento da empresa + débito pessoal.
    expect((await db.query(`select count(*)::int as n from financial_payment_history`)).rows[0]).toEqual({ n: 2 });

    // Estorno duplicado é impossível: nada mais para apagar, saldo intacto.
    await db.query(`delete from financial_payments where id = $1`, [payment_id]);
    expect(await balance(nubank)).toBe(1000);
  });

  it("falha no débito pessoal não deixa a despesa paga na empresa (atômico)", async () => {
    const { db, guiAcc, charge, balance } = await setup();
    const c = await charge("Hostinger", 50);
    await expect(db.query(`select fin_pay_with_personal_account($1, 50, '2026-11-06', 'pix', $2, true)`, [c, guiAcc])).rejects.toThrow(/não pertence ao seu Financeiro Pessoal/);
    expect((await db.query(`select count(*)::int as n from financial_payments`)).rows[0]).toEqual({ n: 0 });
    expect(await balance(guiAcc)).toBe(0);
  });

  it("isolamento: outro membro não desconta da conta pessoal do Júnior", async () => {
    const { db, nubank, charge, as } = await setup();
    const c = await charge("Canva", 30);
    await as(GUI);
    await expect(db.query(`select fin_pay_with_personal_account($1, 30, '2026-11-06', 'pix', $2, true)`, [c, nubank])).rejects.toThrow(/não pertence/);
  });

  it("pagamento antigo: vínculo retroativo, sem recriar o pagamento, e desvincular restaura tudo", async () => {
    const { db, biz, nubank, bizAcc, charge, balance } = await setup();
    const c = await charge("ChatGPT", 103.4);
    const old = (await db.query<{ id: string }>(`insert into financial_payments (space_id, charge_id, amount, payment_date, payment_method, account_id, payer_label, created_by)
      values ('${biz}', '${c}', 103.40, '2026-11-06', 'credito', '${bizAcc}', 'junior', '${JR}') returning id`)).rows[0].id;
    expect(await balance(bizAcc)).toBe(-103.4);

    await expect(db.query(`select fin_link_payment_to_personal_account($1, $2)`, [old, nubank])).rejects.toThrow(/Confirme a remoção/);
    const linkId = (await db.query<{ id: string }>(`select fin_link_payment_to_personal_account($1, $2, null, true) as id`, [old, nubank])).rows[0].id;
    expect(await balance(bizAcc)).toBe(0);
    expect(await balance(nubank)).toBe(896.6);
    expect((await db.query(`select count(*)::int as n from financial_payments where charge_id = $1`, [c])).rows[0]).toEqual({ n: 1 });

    await db.query(`select fin_unlink_personal_account($1)`, [linkId]);
    expect(await balance(nubank)).toBe(1000);
    expect(await balance(bizAcc)).toBe(-103.4);
    await expect(db.query(`select fin_unlink_personal_account($1)`, [linkId])).rejects.toThrow(/já foi desfeito/);
  });

  it("lançamento pessoal já existente: só vincula, não desconta de novo", async () => {
    const { db, biz, pjr, nubank, charge, balance } = await setup();
    const c = await charge("ChatGPT", 103.4);
    const old = (await db.query<{ id: string }>(`insert into financial_payments (space_id, charge_id, amount, payment_date, payment_method, payer_label, created_by)
      values ('${biz}', '${c}', 103.40, '2026-11-06', 'credito', 'junior', '${JR}') returning id`)).rows[0].id;
    const po = (await db.query<{ id: string }>(`insert into financial_origins (space_id, kind, origin_type, description, created_by) values ('${pjr}', 'saida', 'unico', 'ChatGPT', '${JR}') returning id`)).rows[0].id;
    const pc = (await db.query<{ id: string }>(`insert into financial_charges (space_id, origin_id, kind, description, original_amount, due_date, created_by) values ('${pjr}', '${po}', 'saida', 'ChatGPT', 103.40, '2026-11-06', '${JR}') returning id`)).rows[0].id;
    const pp = (await db.query<{ id: string }>(`insert into financial_payments (space_id, charge_id, amount, payment_date, payment_method, account_id, created_by) values ('${pjr}', '${pc}', 103.40, '2026-11-06', 'credito', '${nubank}', '${JR}') returning id`)).rows[0].id;
    expect(await balance(nubank)).toBe(896.6);

    await db.query(`select fin_link_payment_to_personal_account($1, $2, $3)`, [old, nubank, pp]);
    expect(await balance(nubank)).toBe(896.6);
    expect((await db.query(`select count(*)::int as n from financial_payments where space_id = $1`, [pjr])).rows[0]).toEqual({ n: 1 });

    await db.query(`delete from financial_payments where id = $1`, [old]);
    expect(await balance(nubank)).toBe(1000);
  });

  it("não altera dados existentes ao ser aplicada", async () => {
    const db = new PGlite();
    await db.exec(`
      create role authenticated nologin; create role anon nologin; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
      create table public.profiles (id uuid primary key, name text not null);
      create table public.spaces (id uuid primary key default gen_random_uuid(), name text not null, slug text not null, type text not null, owner_id uuid not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
      create table public.clients (id uuid primary key); create table public.client_services (id uuid primary key);
      create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
      create function public.has_module_permission(p uuid, m text, a text) returns boolean language sql stable as $$ select true $$;
      insert into profiles values ('${JR}', 'J');
      insert into spaces (id, name, slug, type, owner_id) values ('${GUI}', 'V', 'v', 'business', '${JR}');
    `);
    await db.exec(migration("007_financial.sql"));
    await db.exec(migration("023_partner_expenses.sql"));
    await db.exec(`
      insert into financial_accounts (id, space_id, name, created_by) values ('${GUI}', '${GUI}', 'Nubank', '${JR}');
      insert into financial_origins (id, space_id, kind, origin_type, description, created_by) values ('${GUI}', '${GUI}', 'saida', 'unico', 'ChatGPT', '${JR}');
      insert into financial_charges (id, space_id, origin_id, kind, description, original_amount, due_date, created_by) values ('${GUI}', '${GUI}', '${GUI}', 'saida', 'ChatGPT', 103.40, '2026-11-06', '${JR}');
      insert into financial_payments (space_id, charge_id, amount, payment_date, payment_method, account_id, payer_label, created_by) values ('${GUI}', '${GUI}', 103.40, '2026-11-06', 'credito', '${GUI}', 'junior', '${JR}');
    `);
    const before = (await db.query(`select to_jsonb(p) - 'updated_at' as row from financial_payments p`)).rows;
    await db.exec(migration(NEW));
    expect((await db.query(`select to_jsonb(p) - 'updated_at' as row from financial_payments p`)).rows).toEqual(before);
  });
});
