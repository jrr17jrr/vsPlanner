import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { mergeAdLevelResults, type PeriodMetricFullRow } from "./ad-metrics";
import { currentTotals, planAdResultUpdate, type CountedRow, type UpdateRow } from "./ad-result-update";

/**
 * Migration 20261117110000 (links das publicações + salvas, 25/50/95% e tempo
 * médio de reprodução) sobre as migrations REAIS num Postgres embutido com RLS.
 */
const root = join(__dirname, "../..");
const migration = (name: string) => readFileSync(join(root, "supabase/migrations", name), "utf8");
const U1 = "11111111-1111-1111-1111-111111111111";
const NEW = "20261117110000_clt_ad_post_links_video_metrics.sql";
const COLS = "id, campaign_id, ad_set_id, creative_id, period_start::text, period_end::text, spend::float8 as spend, conversations, sales, revenue::float8 as revenue, impressions, reach, link_clicks, leads, views, thruplays, engagements, reactions, comments, shares, new_followers, video_plays_3s, video_p75, video_p100, hook_rate::float8 as hook_rate, hold_rate::float8 as hold_rate, saves, video_p25, video_p50, video_p95, avg_watch_time::float8 as avg_watch_time, source";

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
  for (const m of ["025_clt_traffic_management.sql", "20261021_campaign_created_in_meta.sql", "20261030110000_clt_smart_import.sql", "20261104110000_clt_ad_result_updates.sql", "20261105100000_clt_ad_result_period_edit.sql", "20261106100000_clt_ad_engagement_video_metrics.sql", "20261108100000_clt_ad_hook_hold_rates.sql", "20261109100000_clt_registered_info.sql"]) await db.exec(migration(m));
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

describe("migration 20261117110000 — links e novas métricas de vídeo", () => {
  it("é aditiva: dados existentes intactos e métricas novas como não informadas", async () => {
    const ctx = await setup();
    const [row] = await read(ctx);
    expect(row).toMatchObject({ spend: 150, thruplays: 1500, reactions: 900, saves: null, video_p25: null, avg_watch_time: null });
    const t = await totals(ctx);
    expect(t.saves).toBeNull();
    expect(t.avg_watch_time).toBeNull();
  });

  it("contagens novas somam pela diferença; tempo médio é SUBSTITUÍDO (nunca somado)", async () => {
    const ctx = await setup();
    await updateAd(ctx, { saves: 40, video_p25: 900, video_p50: 500, video_p95: 120, avg_watch_time: 6.5 }, { start: "2026-10-16", end: "2026-10-31" });
    await updateAd(ctx, { saves: 55, avg_watch_time: 7.25 }, { start: "2026-11-01", end: "2026-11-04" });
    const rows = await read(ctx);
    expect(rows.map((r) => r.saves)).toEqual([null, 40, 15]);
    expect(rows.map((r) => r.avg_watch_time)).toEqual([null, 6.5, 7.25]);
    expect(await totals(ctx)).toMatchObject({ saves: 55, video_p25: 900, video_p50: 500, video_p95: 120, avg_watch_time: 7.25, spend: 150, thruplays: 1500 });
  });

  it("Editar período move as contagens pela diferença e leva o tempo médio junto", async () => {
    const ctx = await setup();
    await updateAd(ctx, { saves: 10, avg_watch_time: 5 }, { start: "2026-10-16", end: "2026-10-31" });
    await updateAd(ctx, { saves: 25, avg_watch_time: 8 }, { start: "2026-11-01", end: "2026-11-04" });
    const before = await totals(ctx);
    const second = (await ctx.db.query<{ id: string }>("select id from clt_ad_result_updates where period_start = '2026-11-01'")).rows[0].id;
    await ctx.asUser(U1, () => ctx.db.query("select public.clt_move_ad_result_update($1, '2026-10-16', '2026-10-31')", [second]));
    const manual = (await read(ctx)).filter((r) => r.source === "manual_update");
    expect(manual).toHaveLength(1);
    expect(manual[0]).toMatchObject({ saves: 25, avg_watch_time: 8 });
    expect((await totals(ctx)).saves).toBe(before.saves);
  });

  it("links das publicações ficam no próprio anúncio, separados do destino (emojis, hashtags e quebras de linha preservados)", async () => {
    const ctx = await setup();
    const text = "Linha 1 🎉\n#promo acentuação";
    await ctx.asUser(U1, () => ctx.db.query("update clt_ad_creatives set instagram_url = $2, reels_url = $3, facebook_url = $4, destination_url = $5, primary_text = $6 where id = $1",
      [ctx.ad, "https://www.instagram.com/p/ABC/", "https://www.instagram.com/reel/XYZ/", "https://facebook.com/post/1", "https://site.com/oferta", text]));
    const ad = (await ctx.db.query<Record<string, string | null>>("select instagram_url, reels_url, facebook_url, destination_url, destination, primary_text from clt_ad_creatives where id = $1", [ctx.ad])).rows[0];
    expect(ad).toEqual({ instagram_url: "https://www.instagram.com/p/ABC/", reels_url: "https://www.instagram.com/reel/XYZ/", facebook_url: "https://facebook.com/post/1", destination_url: "https://site.com/oferta", destination: null, primary_text: text });
  });

  it("recusa valores negativos nas colunas novas", async () => {
    const ctx = await setup();
    await expect(ctx.db.query("update clt_ad_period_metrics set saves = -1")).rejects.toThrow();
    await expect(ctx.asUser(U1, () => ctx.db.query(`select public.clt_apply_ad_result_update($1, null, '2026-11-01', '2026-11-02', '{"video_p50": -3}'::jsonb, '{}', '{}', '{}')`, [ctx.ad]))).rejects.toThrow(/negativo/);
  });
});
