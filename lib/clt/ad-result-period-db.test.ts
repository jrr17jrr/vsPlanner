import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

/**
 * "Editar período" (clt_move_ad_result_update) e a correção pontual da IG
 * Predial, com as migrations REAIS num Postgres embutido e RLS.
 */
const root = join(__dirname, "../..");
const migration = (name: string) => readFileSync(join(root, "supabase/migrations", name), "utf8");
const fixSql = readFileSync(join(root, "supabase/fixes/20261105_ig_predial_periodo_outubro.sql"), "utf8");
const fixBlock = fixSql.slice(fixSql.indexOf("do $$"), fixSql.indexOf("end $$;") + "end $$;".length);
const U1 = "11111111-1111-1111-1111-111111111111";
const U2 = "22222222-2222-2222-2222-222222222222";
const CAMPAIGN = "IG Predial | WhatsApp | Cabo Frio | 15/10/2026";

type Ctx = { db: PGlite; ad: string; asUser: <T>(uid: string, fn: () => Promise<T>) => Promise<T> };

async function setup(): Promise<Ctx> {
  const db = new PGlite();
  const asUser = async <T,>(uid: string, fn: () => Promise<T>) => {
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
    try { return await fn(); } finally { await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false);"); }
  };
  await db.exec(`
    create role authenticated nologin; create role anon nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    grant usage on schema public to authenticated, anon;
    alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
    create table public.profiles (id uuid primary key references auth.users(id), name text not null);
    create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
  `);
  for (const m of ["025_clt_traffic_management.sql", "20261021_campaign_created_in_meta.sql", "20261030110000_clt_smart_import.sql", "20261104110000_clt_ad_result_updates.sql", "20261105100000_clt_ad_result_period_edit.sql"]) {
    if (m === "025_clt_traffic_management.sql") await db.exec(migration("014_clt_traffic_management.sql").split("-- Dados iniciais")[0]);
    await db.exec(migration(m));
  }
  await db.exec(migration("20261105100000_clt_ad_result_period_edit.sql")); // idempotente
  await db.exec(`insert into auth.users values ('${U1}'), ('${U2}'); insert into public.profiles values ('${U1}', 'Dono'), ('${U2}', 'Outro');`);
  const company = (await db.query<{ id: string }>(`insert into clt_companies (user_id, name) values ('${U1}', 'IG Predial') returning id`)).rows[0].id;
  const campaign = (await db.query<{ id: string }>(`insert into clt_campaigns (user_id, company_id, name, objective, starts_on, ends_on, campaign_status) values ('${U1}', '${company}', '${CAMPAIGN}', 'mensagens', '2026-10-15', '2026-10-29', 'finalizada') returning id`)).rows[0].id;
  const set = (await db.query<{ id: string }>(`insert into clt_ad_sets (user_id, campaign_id, name) values ('${U1}', '${campaign}', 'Conjunto') returning id`)).rows[0].id;
  const ad = (await db.query<{ id: string }>(`insert into clt_ad_creatives (user_id, ad_set_id, name) values ('${U1}', '${set}', 'Anúncio') returning id`)).rows[0].id;
  await db.query(`insert into clt_ad_period_metrics (user_id, company_id, campaign_id, ad_set_id, creative_id, period_start, period_end, spend, conversations, sales, revenue)
    values ($1, $2, $3, $4, $5, '2026-09-30', '2026-10-29', 206.22, 21, 37, 9360)`, [U1, company, campaign, set, ad]);
  return { db, ad, asUser };
}

/** Atualização como a do dia 03/11: +29 vendas, +R$ 7.500 no período 30/10–03/11. */
async function realUpdate(ctx: Ctx, start = "2026-10-30", end = "2026-11-03", delta = { sales: 29, revenue: 7500 }, updated = { sales: 66, revenue: 16860 }) {
  const values = { spend: null, conversations: null, impressions: null, reach: null, link_clicks: null, leads: null, views: null, thruplays: null, engagements: null, ...delta };
  await ctx.asUser(U1, () => ctx.db.query("select public.clt_apply_ad_result_update($1, null, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, 'Dono')",
    [ctx.ad, start, end, JSON.stringify(values), JSON.stringify({ sales: 37, revenue: 9360 }), JSON.stringify(updated), JSON.stringify(delta)]));
  await ctx.db.exec("update clt_ad_result_updates set created_at = '2026-11-03 14:00:00-03'");
  return (await ctx.db.query<{ id: string }>("select id from clt_ad_result_updates where period_start = $1 and period_end = $2 and mode = 'novo_periodo'", [start, end])).rows[0].id;
}
const sums = async (ctx: Ctx) => (await ctx.db.query<{ spend: number; conv: number; sales: number; revenue: number }>(
  "select sum(spend)::float8 spend, sum(conversations)::int conv, sum(sales)::int sales, sum(revenue)::float8 revenue from clt_ad_period_metrics where creative_id = $1", [ctx.ad])).rows[0];
const byMonth = async (ctx: Ctx, month: string) => (await ctx.db.query<{ sales: number; revenue: number; spend: number }>(
  "select coalesce(sum(sales),0)::int sales, coalesce(sum(revenue),0)::float8 revenue, coalesce(sum(spend),0)::float8 spend from clt_ad_period_metrics where creative_id = $1 and to_char(period_end,'YYYY-MM') = $2", [ctx.ad, month])).rows[0];

describe("correção da IG Predial (SQL pontual)", () => {
  it("move +29 vendas/+R$ 7.500 de novembro para outubro; totais e investimento intactos; auditoria registrada", async () => {
    const ctx = await setup();
    const id = await realUpdate(ctx);
    const before = await sums(ctx);
    expect(await byMonth(ctx, "2026-11")).toEqual({ sales: 29, revenue: 7500, spend: 0 });
    await ctx.db.exec(fixBlock);
    expect(await sums(ctx)).toEqual(before);
    expect(before).toEqual({ spend: 206.22, conv: 21, sales: 66, revenue: 16860 });
    expect(await byMonth(ctx, "2026-10")).toEqual({ sales: 66, revenue: 16860, spend: 206.22 });
    expect(await byMonth(ctx, "2026-11")).toEqual({ sales: 0, revenue: 0, spend: 0 });
    const u = (await ctx.db.query<{ period_start: string; period_end: string }>("select period_start::text, period_end::text from clt_ad_result_updates where id = $1", [id])).rows[0];
    expect(u).toEqual({ period_start: "2026-10-01", period_end: "2026-10-31" });
    const audit = (await ctx.db.query<Record<string, string>>("select old_start::text, old_end::text, new_start::text, new_end::text, changed_by_name from clt_ad_result_period_changes")).rows;
    expect(audit).toEqual([{ old_start: "2026-10-30", old_end: "2026-11-03", new_start: "2026-10-01", new_end: "2026-10-31", changed_by_name: "Correção pontual (SQL)" }]);
    expect(Number((await ctx.db.query<{ n: number }>("select count(*)::int n from clt_ad_result_updates")).rows[0].n)).toBe(1); // nenhuma atualização nova
    // Rodar de novo não acha mais a atualização (já corrigida) e não muda nada.
    await expect(ctx.db.exec(fixBlock)).rejects.toThrow(/encontrei 0/);
    expect(await sums(ctx)).toEqual(before);
  });

  it("ambiguidade (duas atualizações iguais): aborta sem alterar nada", async () => {
    const ctx = await setup();
    await realUpdate(ctx);
    await ctx.db.exec(`insert into clt_ad_result_updates (user_id, company_id, campaign_id, ad_set_id, creative_id, period_metric_id, period_start, period_end, mode, previous, updated, delta, created_at)
      select user_id, company_id, campaign_id, ad_set_id, creative_id, period_metric_id, period_start, period_end, mode, previous, updated, delta, created_at from clt_ad_result_updates`);
    const before = await byMonth(ctx, "2026-11");
    await expect(ctx.db.exec(fixBlock)).rejects.toThrow(/encontrei 2/);
    expect(await byMonth(ctx, "2026-11")).toEqual(before);
    expect(Number((await ctx.db.query<{ n: number }>("select count(*)::int n from clt_ad_result_period_changes")).rows[0].n)).toBe(0);
  });
});

describe("clt_move_ad_result_update (Editar período)", () => {
  it("pelo dono: move; outro usuário não consegue; anon não executa; auditoria não editável", async () => {
    const ctx = await setup();
    const id = await realUpdate(ctx);
    await expect(ctx.asUser(U2, () => ctx.db.query("select public.clt_move_ad_result_update($1, '2026-10-01', '2026-10-31')", [id]))).rejects.toThrow(/não encontrada/);
    expect((await ctx.db.query<{ ok: boolean }>("select has_function_privilege('anon', 'public.clt_move_ad_result_update(uuid,date,date,text,text)', 'execute') ok")).rows[0].ok).toBe(false);
    await ctx.asUser(U1, () => ctx.db.query("select public.clt_move_ad_result_update($1, '2026-10-01', '2026-10-31', 'Dono')", [id]));
    expect(await byMonth(ctx, "2026-10")).toMatchObject({ sales: 66, revenue: 16860 });
    await expect(ctx.asUser(U1, () => ctx.db.query("delete from clt_ad_result_period_changes"))).rejects.toThrow();
    await expect(ctx.asUser(U1, () => ctx.db.query("insert into clt_ad_result_period_changes (user_id, company_id, update_id, creative_id, old_start, old_end, new_start, new_end) select user_id, company_id, update_id, creative_id, old_start, old_end, new_start, new_end from clt_ad_result_period_changes"))).rejects.toThrow();
    expect(await ctx.asUser(U2, async () => (await ctx.db.query("select * from clt_ad_result_period_changes")).rows.length)).toBe(0);
  });

  it("recusa período dentro da importação, futuro e igual ao atual", async () => {
    const ctx = await setup();
    const id = await realUpdate(ctx);
    const move = (s: string, e: string) => ctx.asUser(U1, () => ctx.db.query("select public.clt_move_ad_result_update($1, $2, $3)", [id, s, e]));
    await expect(move("2026-10-10", "2026-10-20")).rejects.toThrow(/período importado/);
    await expect(move("2099-01-01", "2099-01-31")).rejects.toThrow(/futuro/);
    await expect(move("2026-10-30", "2026-11-03")).rejects.toThrow(/igual ao atual/);
  });

  it("mover para um período que já tem atualização: soma naquela linha e remove a antiga, sem mudar o total", async () => {
    const ctx = await setup();
    await realUpdate(ctx, "2026-10-01", "2026-10-31", { sales: 10, revenue: 1000 } as never, { sales: 47, revenue: 10360 } as never);
    const second = await realUpdate(ctx, "2026-11-01", "2026-11-03", { sales: 19, revenue: 6500 } as never, { sales: 66, revenue: 16860 } as never);
    const before = await sums(ctx);
    const r = await ctx.asUser(U1, () => ctx.db.query<{ r: { merged: boolean } }>("select public.clt_move_ad_result_update($1, '2026-10-01', '2026-10-31') r", [second]));
    expect(r.rows[0].r.merged).toBe(true);
    expect(await sums(ctx)).toEqual(before);
    const manual = (await ctx.db.query<{ period_start: string; sales: number; revenue: number }>("select period_start::text, sales, revenue::float8 revenue from clt_ad_period_metrics where source = 'manual_update'")).rows;
    expect(manual).toEqual([{ period_start: "2026-10-01", sales: 29, revenue: 7500 }]);
  });

  it("linha com mais de uma atualização (ajuste): move só a diferença daquela atualização", async () => {
    const ctx = await setup();
    await realUpdate(ctx, "2026-10-30", "2026-11-03", { sales: 20, revenue: 5000 } as never, { sales: 57, revenue: 14360 } as never);
    // Ajuste no mesmo período (+9 vendas, +2.500) — mesma linha.
    const metricId = (await ctx.db.query<{ id: string }>("select id from clt_ad_period_metrics where source = 'manual_update'")).rows[0].id;
    await ctx.asUser(U1, () => ctx.db.query("select public.clt_apply_ad_result_update($1, $2, '2026-10-30', '2026-11-03', $3::jsonb, '{}', '{}', $4::jsonb)",
      [ctx.ad, metricId, JSON.stringify({ sales: 29, revenue: 7500 }), JSON.stringify({ sales: 9, revenue: 2500 })]));
    const adjustId = (await ctx.db.query<{ id: string }>("select id from clt_ad_result_updates where mode = 'ajuste'")).rows[0].id;
    const before = await sums(ctx);
    await ctx.asUser(U1, () => ctx.db.query("select public.clt_move_ad_result_update($1, '2026-10-01', '2026-10-31')", [adjustId]));
    expect(await sums(ctx)).toEqual(before);
    expect(await byMonth(ctx, "2026-11")).toMatchObject({ sales: 20, revenue: 5000 });
    expect((await ctx.db.query<{ sales: number }>("select sales from clt_ad_period_metrics where source = 'manual_update' and period_start = '2026-10-01'")).rows[0].sales).toBe(9);
  });
});
