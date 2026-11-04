import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { mergeAdLevelResults, type PeriodMetricFullRow } from "./ad-metrics";
import { currentTotals, planAdResultUpdate, type CountedRow, type UpdateRow } from "./ad-result-update";

/**
 * Migration 20261108100000 (Taxa de Gancho / Taxa de Retenção informadas)
 * sobre as migrations REAIS num Postgres embutido com RLS: aditiva, salva o
 * percentual exato, substitui (não soma) e "Editar período" leva a taxa junto.
 */
const root = join(__dirname, "../..");
const migration = (name: string) => readFileSync(join(root, "supabase/migrations", name), "utf8");
const U1 = "11111111-1111-1111-1111-111111111111";
const NEW = "20261108100000_clt_ad_hook_hold_rates.sql";
const COLS = "id, campaign_id, ad_set_id, creative_id, period_start::text, period_end::text, spend::float8 as spend, conversations, sales, revenue::float8 as revenue, impressions, reach, link_clicks, leads, views, thruplays, engagements, reactions, comments, shares, new_followers, video_plays_3s, video_p75, video_p100, hook_rate::float8 as hook_rate, hold_rate::float8 as hold_rate, source";

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
  await db.exec(migration("014_clt_traffic_management.sql").split("-- Dados iniciais")[0]);
  for (const m of ["025_clt_traffic_management.sql", "20261021_campaign_created_in_meta.sql", "20261030110000_clt_smart_import.sql", "20261104110000_clt_ad_result_updates.sql", "20261105100000_clt_ad_result_period_edit.sql", "20261106100000_clt_ad_engagement_video_metrics.sql"]) await db.exec(migration(m));
  await db.exec(`insert into auth.users values ('${U1}'); insert into public.profiles values ('${U1}', 'Dono');`);
  const company = (await db.query<{ id: string }>(`insert into clt_companies (user_id, name) values ('${U1}', 'AIV') returning id`)).rows[0].id;
  const campaign = (await db.query<{ id: string }>(`insert into clt_campaigns (user_id, company_id, name, objective, starts_on, ends_on, campaign_status) values ('${U1}', '${company}', 'Vídeo', 'visualizacoes', '2026-10-01', '2026-10-31', 'finalizada') returning id`)).rows[0].id;
  const set = (await db.query<{ id: string }>(`insert into clt_ad_sets (user_id, campaign_id, name) values ('${U1}', '${campaign}', 'Conjunto') returning id`)).rows[0].id;
  const ad = (await db.query<{ id: string }>(`insert into clt_ad_creatives (user_id, ad_set_id, name) values ('${U1}', '${set}', 'Vídeo local') returning id`)).rows[0].id;
  // Dado existente ANTES da migration (importado).
  await db.query(`insert into clt_ad_period_metrics (user_id, company_id, campaign_id, ad_set_id, creative_id, period_start, period_end, spend, impressions, reach, thruplays, reactions)
    values ($1, $2, $3, $4, $5, '2026-10-01', '2026-10-15', 150, 40000, 21000, 1500, 900)`, [U1, company, campaign, set, ad]);
  await db.exec(migration(NEW));
  await db.exec(migration(NEW)); // idempotente
  return { db, ad, asUser };
}

const read = (ctx: Ctx) => ctx.asUser(U1, async () => (await ctx.db.query<PeriodMetricFullRow & Record<string, unknown>>(`select ${COLS} from clt_ad_period_metrics where creative_id = $1 order by period_start`, [ctx.ad])).rows);
const totals = async (ctx: Ctx) => currentTotals(mergeAdLevelResults([], await read(ctx)).rows as unknown as CountedRow[]);

async function updateAd(ctx: Ctx, values: Record<string, number | null>, reference: { start: string; end: string }) {
  const period = await read(ctx);
  const rows = mergeAdLevelResults([], period).rows as unknown as CountedRow[];
  const plan = planAdResultUpdate({ rows, updateRows: period.filter((r) => r.source === "manual_update") as unknown as UpdateRow[], values, today: "2026-11-05", reference });
  if ("error" in plan) throw new Error(plan.error);
  await ctx.asUser(U1, () => ctx.db.query("select public.clt_apply_ad_result_update($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, 'Dono')",
    [ctx.ad, plan.metricId, plan.periodStart, plan.periodEnd, JSON.stringify(plan.values), JSON.stringify(plan.previous), JSON.stringify(plan.updated), JSON.stringify(plan.delta)]));
  return plan;
}

describe("migration 20261108100000 — Taxa de Gancho e Taxa de Retenção", () => {
  it("é aditiva: dados existentes intactos e taxas 'não informadas'", async () => {
    const ctx = await setup();
    const [row] = await read(ctx);
    expect(row).toMatchObject({ spend: 150, impressions: 40000, reach: 21000, thruplays: 1500, reactions: 900, hook_rate: null, hold_rate: null, source: "import" });
    const t = await totals(ctx);
    expect(t.hook_rate).toBeNull();
    expect(t.hold_rate).toBeNull();
  });

  it("salva exatamente o percentual informado (35,75%) sem mexer nas outras métricas", async () => {
    const ctx = await setup();
    await updateAd(ctx, { hook_rate: 35.75, hold_rate: 12.4 }, { start: "2026-10-16", end: "2026-10-31" });
    const rows = await read(ctx);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ source: "manual_update", hook_rate: 35.75, hold_rate: 12.4, spend: null, impressions: null, reach: null, thruplays: null, reactions: null });
    expect(rows[0]).toMatchObject({ spend: 150, impressions: 40000, hook_rate: null });
    expect(await totals(ctx)).toMatchObject({ hook_rate: 35.75, hold_rate: 12.4, spend: 150, impressions: 40000, reach: 21000, thruplays: 1500 });
  });

  it("nova taxa SUBSTITUI a anterior (não soma) — no mesmo registro e em registro novo", async () => {
    const ctx = await setup();
    await updateAd(ctx, { hook_rate: 30 }, { start: "2026-10-16", end: "2026-10-31" });
    // Mesmo período: ajusta o registro (valor substituído).
    const adjust = await updateAd(ctx, { hook_rate: 28.5 }, { start: "2026-10-16", end: "2026-10-31" });
    expect(adjust.mode).toBe("ajuste");
    let rows = await read(ctx);
    expect(rows.filter((r) => r.source === "manual_update")).toHaveLength(1);
    expect(rows.find((r) => r.source === "manual_update")!.hook_rate).toBe(28.5);
    // Período novo: registro novo com o valor informado; o total do anúncio é o mais recente (28,5 → 41), nunca 69,5.
    await updateAd(ctx, { hook_rate: 41 }, { start: "2026-11-01", end: "2026-11-04" });
    rows = await read(ctx);
    expect(rows.map((r) => r.hook_rate)).toEqual([null, 28.5, 41]);
    expect((await totals(ctx)).hook_rate).toBe(41);
    const hist = (await ctx.db.query<{ previous: Record<string, number>; updated: Record<string, number>; delta: Record<string, number> }>("select previous, updated, delta from clt_ad_result_updates order by created_at")).rows;
    expect(hist.at(-1)).toMatchObject({ previous: { hook_rate: 28.5 }, updated: { hook_rate: 41 }, delta: { hook_rate: 41 } });
  });

  it("recusa percentual acima de 100 ou negativo (função e constraint)", async () => {
    const ctx = await setup();
    await expect(ctx.asUser(U1, () => ctx.db.query("select public.clt_apply_ad_result_update($1, null, '2026-11-01', '2026-11-02', '{\"hook_rate\": 135}'::jsonb, '{}', '{}', '{}')", [ctx.ad]))).rejects.toThrow(/acima de 100/);
    await expect(ctx.asUser(U1, () => ctx.db.query("select public.clt_apply_ad_result_update($1, null, '2026-11-01', '2026-11-02', '{\"hold_rate\": -1}'::jsonb, '{}', '{}', '{}')", [ctx.ad]))).rejects.toThrow(/negativo/);
    await expect(ctx.db.query("update clt_ad_period_metrics set hook_rate = 100.5")).rejects.toThrow();
  });

  it("Editar período leva a taxa junto (sem somar) e as contagens continuam iguais", async () => {
    const ctx = await setup();
    await updateAd(ctx, { hook_rate: 30, reactions: 1000 }, { start: "2026-10-16", end: "2026-10-31" });
    await updateAd(ctx, { hook_rate: 41, reactions: 1100 }, { start: "2026-11-01", end: "2026-11-04" });
    const before = await totals(ctx);
    const second = (await ctx.db.query<{ id: string }>("select id from clt_ad_result_updates where period_start = '2026-11-01'")).rows[0].id;
    await ctx.asUser(U1, () => ctx.db.query("select public.clt_move_ad_result_update($1, '2026-10-16', '2026-10-31')", [second]));
    const manual = (await read(ctx)).filter((r) => r.source === "manual_update");
    // Fundiu com o registro de 16–31/10: reações somadas pela diferença (100 + 100), taxa SUBSTITUÍDA pela movida.
    expect(manual).toHaveLength(1);
    expect(manual[0]).toMatchObject({ period_start: "2026-10-16", reactions: 200, hook_rate: 41 });
    const after = await totals(ctx);
    expect(after.reactions).toBe(before.reactions);
    expect(after.hook_rate).toBe(41);
  });
});
