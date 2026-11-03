import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { mergeAdLevelResults, type PeriodMetricFullRow } from "./ad-metrics";
import { currentTotals, planAdResultUpdate, type CountedRow, type UpdateRow } from "./ad-result-update";

/**
 * "Atualizar resultados" com as migrations REAIS num Postgres embutido, como
 * `authenticated` com RLS: mesma sequência da ação do servidor (ler linhas →
 * planejar → clt_apply_ad_result_update).
 */
const root = join(__dirname, "../..");
const migration = (name: string) => readFileSync(join(root, "supabase/migrations", name), "utf8");
const U1 = "11111111-1111-1111-1111-111111111111";
const U2 = "22222222-2222-2222-2222-222222222222";
let db: PGlite;
let ad = "", otherAd = "";

async function asUser<T>(uid: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try { return await fn(); } finally { await db.exec("reset role;"); }
}
const COLS = "id, campaign_id, ad_set_id, creative_id, period_start::text, period_end::text, spend::float8 as spend, conversations, sales, revenue::float8 as revenue, impressions, reach, link_clicks, leads, views, thruplays, engagements, source";

async function updateAd(uid: string, creative: string, values: Record<string, number | null>, today: string) {
  return asUser(uid, async () => {
    const period = (await db.query<PeriodMetricFullRow>(`select ${COLS} from clt_ad_period_metrics where creative_id = $1`, [creative])).rows;
    const rows = mergeAdLevelResults([], period).rows as unknown as CountedRow[];
    const plan = planAdResultUpdate({ rows, updateRows: period.filter((r) => r.source === "manual_update") as unknown as UpdateRow[], values, today, campaignStart: "2026-10-01" });
    if ("error" in plan) throw new Error(plan.error);
    await db.query("select public.clt_apply_ad_result_update($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9)",
      [creative, plan.metricId, plan.periodStart, plan.periodEnd, JSON.stringify(plan.values), JSON.stringify(plan.previous), JSON.stringify(plan.updated), JSON.stringify(plan.delta), "Dono"]);
    return plan;
  });
}
const totals = (uid: string, creative: string) => asUser(uid, async () =>
  currentTotals(mergeAdLevelResults([], (await db.query<PeriodMetricFullRow>(`select ${COLS} from clt_ad_period_metrics where creative_id = $1`, [creative])).rows).rows as unknown as CountedRow[]));

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role authenticated nologin; create role anon nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
    grant usage on schema public to authenticated;
    alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
    create table public.profiles (id uuid primary key references auth.users(id), name text not null);
    create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
  `);
  await db.exec(migration("014_clt_traffic_management.sql").split("-- Dados iniciais")[0]);
  await db.exec(migration("025_clt_traffic_management.sql"));
  await db.exec(migration("20261021_campaign_created_in_meta.sql"));
  await db.exec(migration("20261030110000_clt_smart_import.sql"));
  await db.exec(migration("20261104110000_clt_ad_result_updates.sql"));
  await db.exec(migration("20261104110000_clt_ad_result_updates.sql")); // idempotente

  await db.exec(`insert into auth.users values ('${U1}'), ('${U2}'); insert into public.profiles values ('${U1}', 'Dono'), ('${U2}', 'Outro');`);
  const make = async (uid: string) => {
    const company = (await db.query<{ id: string }>(`insert into clt_companies (user_id, name) values ('${uid}', 'Empresa') returning id`)).rows[0].id;
    const campaign = (await db.query<{ id: string }>(`insert into clt_campaigns (user_id, company_id, name, objective, starts_on, ends_on, campaign_status) values ('${uid}', '${company}', 'Msg', 'mensagens', '2026-10-01', '2026-10-31', 'finalizada') returning id`)).rows[0].id;
    const set = (await db.query<{ id: string }>(`insert into clt_ad_sets (user_id, campaign_id, name) values ('${uid}', '${campaign}', 'Conjunto') returning id`)).rows[0].id;
    const creative = (await db.query<{ id: string }>(`insert into clt_ad_creatives (user_id, ad_set_id, name) values ('${uid}', '${set}', 'Anúncio') returning id`)).rows[0].id;
    await db.query(`insert into clt_ad_period_metrics (user_id, company_id, campaign_id, ad_set_id, creative_id, period_start, period_end, spend, conversations, sales, revenue)
      values ($1, $2, $3, $4, $5, '2026-10-01', '2026-10-31', 100, 10, 2, 500)`, [uid, company, campaign, set, creative]);
    return creative;
  };
  ad = await make(U1);
  otherAd = await make(U2);
}, 60_000);

describe("clt_apply_ad_result_update (Postgres + RLS)", () => {
  it("campanha finalizada: 100/10/2/500 → 150/15/4/900 grava a diferença e o histórico juntos", async () => {
    await updateAd(U1, ad, { spend: 150, conversations: 15, sales: 4, revenue: 900 }, "2026-11-04");
    expect(await totals(U1, ad)).toMatchObject({ spend: 150, conversations: 15, sales: 4, revenue: 900 });
    const rows = (await db.query<{ source: string; period_start: string; spend: number }>(`select source, period_start::text, spend::float8 as spend from clt_ad_period_metrics where creative_id = $1 order by period_start`, [ad])).rows;
    expect(rows).toEqual([{ source: "import", period_start: "2026-10-01", spend: 100 }, { source: "manual_update", period_start: "2026-11-01", spend: 50 }]);
    const history = (await db.query<{ mode: string; previous: Record<string, number>; updated: Record<string, number>; updated_by_name: string }>("select mode, previous, updated, updated_by_name from clt_ad_result_updates where creative_id = $1", [ad])).rows;
    expect(history).toEqual([{ mode: "novo_periodo", previous: { spend: 100, conversations: 10, sales: 2, revenue: 500 }, updated: { spend: 150, conversations: 15, sales: 4, revenue: 900 }, updated_by_name: "Dono" }]);
  });

  it("mesmo dia: ajusta a mesma linha e registra outro histórico ('ajuste')", async () => {
    await updateAd(U1, ad, { spend: 170 }, "2026-11-04");
    expect((await totals(U1, ad)).spend).toBe(170);
    expect(Number((await db.query<{ n: number }>("select count(*)::int as n from clt_ad_period_metrics where creative_id = $1 and source = 'manual_update'", [ad])).rows[0].n)).toBe(1);
    expect((await db.query<{ mode: string }>("select mode from clt_ad_result_updates where creative_id = $1 order by created_at desc, mode limit 1", [ad])).rows[0].mode).toBe("ajuste");
  });

  it("isolamento: outro usuário não atualiza nem vê o anúncio/histórico", async () => {
    await expect(asUser(U2, () => db.query("select public.clt_apply_ad_result_update($1, null, '2026-11-01', '2026-11-04', '{\"spend\": 1}'::jsonb, '{}', '{}', '{}')", [ad]))).rejects.toThrow(/Anúncio não encontrado/);
    expect(await asUser(U2, async () => (await db.query("select * from clt_ad_result_updates")).rows.length)).toBe(0);
    await updateAd(U2, otherAd, { spend: 120 }, "2026-11-04");
    expect((await totals(U1, ad)).spend).toBe(170);
    expect((await totals(U2, otherAd)).spend).toBe(120);
  });

  it("não ajusta linha importada, não aceita negativo, e o histórico não pode ser alterado", async () => {
    const importId = (await db.query<{ id: string }>("select id from clt_ad_period_metrics where creative_id = $1 and source = 'import'", [ad])).rows[0].id;
    await expect(asUser(U1, () => db.query("select public.clt_apply_ad_result_update($1, $2, '2026-10-01', '2026-10-31', '{\"spend\": 1}'::jsonb, '{}', '{}', '{}')", [ad, importId]))).rejects.toThrow(/Atualização anterior não encontrada/);
    await expect(asUser(U1, () => db.query("select public.clt_apply_ad_result_update($1, null, '2026-11-05', '2026-11-05', '{\"spend\": -5}'::jsonb, '{}', '{}', '{}')", [ad]))).rejects.toThrow(/negativo/);
    await expect(asUser(U1, () => db.query("update clt_ad_result_updates set updated = '{}'"))).rejects.toThrow();
    await expect(asUser(U1, () => db.query("delete from clt_ad_result_updates"))).rejects.toThrow();
  });
});
