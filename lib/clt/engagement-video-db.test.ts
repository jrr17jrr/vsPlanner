import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { mergeAdLevelResults, type PeriodMetricFullRow } from "./ad-metrics";
import { currentTotals, planAdResultUpdate, type CountedRow, type UpdateRow } from "./ad-result-update";

/**
 * Migration 20261106100000 (engajamento/vídeo + preferências do relatório)
 * com as migrations REAIS num Postgres embutido e RLS: dados existentes
 * preservados, "Atualizar resultados" e "Editar período" levando as métricas
 * novas, e preferências isoladas por dono.
 */
const root = join(__dirname, "../..");
const migration = (name: string) => readFileSync(join(root, "supabase/migrations", name), "utf8");
const U1 = "11111111-1111-1111-1111-111111111111";
const U2 = "22222222-2222-2222-2222-222222222222";
const NEW = "20261106100000_clt_ad_engagement_video_metrics.sql";
const COLS = "id, campaign_id, ad_set_id, creative_id, period_start::text, period_end::text, spend::float8 as spend, conversations, sales, revenue::float8 as revenue, impressions, reach, link_clicks, leads, views, thruplays, engagements, reactions, comments, shares, new_followers, video_plays_3s, video_p75, video_p100, source";

type Ctx = { db: PGlite; ad: string; company: string; otherCompany: string; asUser: <T>(uid: string, fn: () => Promise<T>) => Promise<T> };

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
  for (const m of ["025_clt_traffic_management.sql", "20261021_campaign_created_in_meta.sql", "20261030110000_clt_smart_import.sql", "20261104110000_clt_ad_result_updates.sql", "20261105100000_clt_ad_result_period_edit.sql"]) await db.exec(migration(m));
  await db.exec(`insert into auth.users values ('${U1}'), ('${U2}'); insert into public.profiles values ('${U1}', 'Dono'), ('${U2}', 'Outro');`);
  const company = (await db.query<{ id: string }>(`insert into clt_companies (user_id, name) values ('${U1}', 'Empresa') returning id`)).rows[0].id;
  const otherCompany = (await db.query<{ id: string }>(`insert into clt_companies (user_id, name) values ('${U2}', 'Outra') returning id`)).rows[0].id;
  const campaign = (await db.query<{ id: string }>(`insert into clt_campaigns (user_id, company_id, name, objective, starts_on, ends_on, campaign_status) values ('${U1}', '${company}', 'Vídeo', 'visualizacoes', '2026-10-01', '2026-10-31', 'finalizada') returning id`)).rows[0].id;
  const set = (await db.query<{ id: string }>(`insert into clt_ad_sets (user_id, campaign_id, name) values ('${U1}', '${campaign}', 'Conjunto') returning id`)).rows[0].id;
  const ad = (await db.query<{ id: string }>(`insert into clt_ad_creatives (user_id, ad_set_id, name) values ('${U1}', '${set}', 'Anúncio') returning id`)).rows[0].id;
  // Dado existente ANTES da migration nova (importado de outubro).
  await db.query(`insert into clt_ad_period_metrics (user_id, company_id, campaign_id, ad_set_id, creative_id, period_start, period_end, spend, conversations, sales, revenue, impressions, link_clicks, views)
    values ($1, $2, $3, $4, $5, '2026-10-01', '2026-10-15', 100, 10, 2, 500, 10000, 50, 3000)`, [U1, company, campaign, set, ad]);
  await db.exec(migration(NEW));
  await db.exec(migration(NEW)); // idempotente
  return { db, ad, company, otherCompany, asUser };
}

async function updateAd(ctx: Ctx, values: Record<string, number | null>, reference: { start: string; end: string }) {
  return ctx.asUser(U1, async () => {
    const period = (await ctx.db.query<PeriodMetricFullRow>(`select ${COLS} from clt_ad_period_metrics where creative_id = $1`, [ctx.ad])).rows;
    const rows = mergeAdLevelResults([], period).rows as unknown as CountedRow[];
    const plan = planAdResultUpdate({ rows, updateRows: period.filter((r) => r.source === "manual_update") as unknown as UpdateRow[], values, today: "2026-11-05", reference });
    if ("error" in plan) throw new Error(plan.error);
    await ctx.db.query("select public.clt_apply_ad_result_update($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, 'Dono')",
      [ctx.ad, plan.metricId, plan.periodStart, plan.periodEnd, JSON.stringify(plan.values), JSON.stringify(plan.previous), JSON.stringify(plan.updated), JSON.stringify(plan.delta)]);
    return plan;
  });
}
const totals = (ctx: Ctx) => ctx.asUser(U1, async () => currentTotals(mergeAdLevelResults([], (await ctx.db.query<PeriodMetricFullRow>(`select ${COLS} from clt_ad_period_metrics where creative_id = $1`, [ctx.ad])).rows).rows as unknown as CountedRow[]));

describe("migration 20261106100000 — engajamento e vídeo", () => {
  it("preserva os dados existentes: valores iguais e colunas novas como 'não informado'", async () => {
    const ctx = await setup();
    const row = (await ctx.db.query<Record<string, unknown>>(`select ${COLS} from clt_ad_period_metrics`)).rows;
    expect(row).toHaveLength(1);
    expect(row[0]).toMatchObject({ spend: 100, conversations: 10, sales: 2, revenue: 500, impressions: 10000, link_clicks: 50, views: 3000, reactions: null, comments: null, shares: null, new_followers: null, video_plays_3s: null, video_p75: null, video_p100: null, source: "import" });
    const t = await totals(ctx);
    expect(t.reactions).toBeNull();
    expect(t.video_p75).toBeNull();
    expect(t.link_clicks).toBe(50);
  });

  it("Atualizar resultados grava reações, cliques e vídeo (só a diferença) e o histórico", async () => {
    const ctx = await setup();
    await updateAd(ctx, { reactions: 120, comments: 8, shares: 5, new_followers: 14, link_clicks: 80, video_plays_3s: 2500, video_p75: 700, video_p100: 400 }, { start: "2026-10-16", end: "2026-10-31" });
    const t = await totals(ctx);
    expect(t).toMatchObject({ reactions: 120, comments: 8, shares: 5, new_followers: 14, link_clicks: 80, video_plays_3s: 2500, video_p75: 700, video_p100: 400, conversations: 10 });
    const manual = (await ctx.db.query<Record<string, unknown>>(`select link_clicks, reactions, conversations from clt_ad_period_metrics where source = 'manual_update'`)).rows[0];
    // Cliques: só a diferença (80 − 50); conversas não informadas continuam nulas (cliques ≠ conversas).
    expect(manual).toEqual({ link_clicks: 30, reactions: 120, conversations: null });
    const hist = (await ctx.db.query<{ delta: Record<string, number> }>("select delta from clt_ad_result_updates")).rows[0].delta;
    expect(hist).toMatchObject({ reactions: 120, video_p100: 400, link_clicks: 30 });
    // Valor negativo é barrado pela função.
    await expect(ctx.asUser(U1, () => ctx.db.query("select public.clt_apply_ad_result_update($1, null, '2026-11-01', '2026-11-02', '{\"reactions\": -1}'::jsonb, '{}', '{}', '{}')", [ctx.ad]))).rejects.toThrow(/negativo/);
  });

  it("Editar período leva as métricas novas junto, sem mudar o total", async () => {
    const ctx = await setup();
    await updateAd(ctx, { reactions: 40, video_p75: 90 }, { start: "2026-10-16", end: "2026-10-31" });
    await updateAd(ctx, { reactions: 100, video_p75: 150, shares: 3 }, { start: "2026-11-01", end: "2026-11-04" });
    const before = await totals(ctx);
    const second = (await ctx.db.query<{ id: string }>("select id from clt_ad_result_updates where period_start = '2026-11-01'")).rows[0].id;
    await ctx.asUser(U1, () => ctx.db.query("select public.clt_move_ad_result_update($1, '2026-10-16', '2026-10-31')", [second]));
    expect(await totals(ctx)).toEqual(before);
    const manual = (await ctx.db.query<Record<string, unknown>>("select period_start::text, reactions, video_p75, shares from clt_ad_period_metrics where source = 'manual_update'")).rows;
    expect(manual).toEqual([{ period_start: "2026-10-16", reactions: 100, video_p75: 150, shares: 3 }]);
  });
});

describe("clt_report_preferences (Personalizar relatório)", () => {
  it("dono salva e lê; outro usuário não vê nem grava para a empresa; anon sem acesso", async () => {
    const ctx = await setup();
    await ctx.asUser(U1, () => ctx.db.query("insert into clt_report_preferences (company_id, user_id, metrics) values ($1, $2, $3) on conflict (company_id) do update set metrics = excluded.metrics", [ctx.company, U1, ["gasto", "cpc"]]));
    await ctx.asUser(U1, () => ctx.db.query("insert into clt_report_preferences (company_id, user_id, metrics) values ($1, $2, $3) on conflict (company_id) do update set metrics = excluded.metrics", [ctx.company, U1, ["gasto", "ctr"]]));
    expect(await ctx.asUser(U1, async () => (await ctx.db.query<{ metrics: string[] }>("select metrics from clt_report_preferences")).rows)).toEqual([{ metrics: ["gasto", "ctr"] }]);
    expect(await ctx.asUser(U2, async () => (await ctx.db.query("select * from clt_report_preferences")).rows.length)).toBe(0);
    await expect(ctx.asUser(U2, () => ctx.db.query("insert into clt_report_preferences (company_id, user_id, metrics) values ($1, $2, '{}')", [ctx.company, U2]))).rejects.toThrow();
    await expect(ctx.asUser(U1, () => ctx.db.query("insert into clt_report_preferences (company_id, user_id, metrics) values ($1, $2, '{}')", [ctx.otherCompany, U1]))).rejects.toThrow();
    expect((await ctx.db.query<{ ok: boolean }>("select has_table_privilege('anon', 'public.clt_report_preferences', 'select') ok")).rows[0].ok).toBe(false);
    // Resultados intactos: preferências não tocam em clt_ad_period_metrics.
    expect((await ctx.db.query<{ n: number }>("select count(*)::int n from clt_ad_period_metrics")).rows[0].n).toBe(1);
  });
});
