import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { parseImportInput } from "./parse";
import { validateImport } from "./validate";
import { buildImportPayload } from "./plan";
import { buildSnapshot, type SnapshotRows } from "./snapshot";
import { mergeAdLevelResults, withImportedCampaignTotals, type PeriodMetricFullRow } from "@/lib/clt/ad-metrics";
import { describeAudienceSettings } from "@/lib/clt/audience-summary";
import { mergePeriodResults, periodResultsToEntries, type PeriodMetricRow } from "@/lib/clt/period-results";

/**
 * Integração: roda as migrations REAIS do repositório num Postgres
 * embutido (PGlite), como o papel `authenticated` com RLS ativo, e executa
 * `clt_import_bundle` com os arquivos reais da IG Predial. Nenhum banco
 * de produção é tocado.
 */

const root = join(__dirname, "../..");
const migration = (name: string) => readFileSync(join(root, "supabase/migrations", name), "utf8");
const fixture = (name: string) => readFileSync(join(root, "dados-importacao/ig-predial", name), "utf8");
const U1 = "11111111-1111-1111-1111-111111111111";
const U2 = "22222222-2222-2222-2222-222222222222";
const TODAY = "2026-10-30";

let db: PGlite;
let companyId = "";
let otherCompanyId = "";

async function asUser<T>(uid: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try { return await fn(); } finally { await db.exec("reset role;"); }
}

async function snapshot(uid: string, company: string) {
  return asUser(uid, async () => {
    const q = async <T,>(sql: string) => (await db.query<T>(sql, [company])).rows;
    const rows: SnapshotRows = {
      company: (await q<{ id: string; name: string }>("select id, name from clt_companies where id = $1"))[0],
      audiences: await q("select id, name, audience_type, external_key from clt_audiences where company_id = $1"),
      campaigns: await q("select id, name, meta_campaign_id from clt_campaigns where company_id = $1"),
      adSets: await q("select s.id, s.campaign_id, s.name, s.meta_adset_id from clt_ad_sets s join clt_campaigns c on c.id = s.campaign_id where c.company_id = $1"),
      ads: await q("select a.id, a.ad_set_id, a.name, a.meta_ad_id from clt_ad_creatives a join clt_ad_sets s on s.id = a.ad_set_id join clt_campaigns c on c.id = s.campaign_id where c.company_id = $1"),
      legacyResults: await q("select r.campaign_id from clt_campaign_result_entries r join clt_campaigns c on c.id = r.campaign_id where c.company_id = $1"),
      periodMetrics: await q("select creative_id, period_start::text, period_end::text from clt_ad_period_metrics where company_id = $1"),
    };
    return buildSnapshot(rows);
  });
}

async function importContent(uid: string, company: string, content: string, period?: { start: string; end: string }) {
  const parsed = parseImportInput(content);
  if (!parsed.ok) throw new Error(parsed.error);
  const preview = validateImport(parsed.bundle, await snapshot(uid, company), { today: TODAY, period });
  if (!preview.canImport) throw new Error("preview com erros: " + preview.issues.filter(i => i.level === "error").map(i => i.message).join("; "));
  const payload = buildImportPayload(preview);
  return asUser(uid, async () => (await db.query<{ r: Record<string, number> }>("select public.clt_import_bundle($1, $2::jsonb) as r", [company, JSON.stringify(payload)])).rows[0].r);
}

const count = async (table: string) => Number((await db.query<{ n: number }>(`select count(*)::int as n from ${table}`)).rows[0].n);

beforeAll(async () => {
  db = new PGlite();
  // Ambiente mínimo equivalente ao Supabase (auth.uid(), papel authenticated).
  await db.exec(`
    create role authenticated nologin;
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
  // Migrations reais (014 sem o bloco de dados iniciais, que tem um UUID fixo de produção).
  await db.exec(migration("014_clt_traffic_management.sql").split("-- Dados iniciais")[0]);
  await db.exec(migration("025_clt_traffic_management.sql"));
  await db.exec(migration("20261021_campaign_created_in_meta.sql"));
  await db.exec(migration("20261030110000_clt_smart_import.sql"));
  // Rodar de novo prova que é idempotente.
  await db.exec(migration("20261030110000_clt_smart_import.sql"));

  await db.exec(`insert into auth.users values ('${U1}'), ('${U2}'); insert into public.profiles values ('${U1}', 'Dono'), ('${U2}', 'Outro');`);
  companyId = (await db.query<{ id: string }>(`insert into clt_companies (user_id, name) values ('${U1}', 'IG Predial') returning id`)).rows[0].id;
  otherCompanyId = (await db.query<{ id: string }>(`insert into clt_companies (user_id, name) values ('${U2}', 'IG Predial') returning id`)).rows[0].id;
}, 60_000);

describe("clt_import_bundle (Postgres + RLS)", () => {
  it("importa os 10 públicos da IG Predial", async () => {
    const r = await importContent(U1, companyId, fixture("ig_predial_publicos.json"));
    expect(r).toMatchObject({ audiences_created: 10, audiences_updated: 0 });
    const lal = (await db.query<{ source_ok: boolean }>(`select a.source_audience_id = s.id as source_ok from clt_audiences a join clt_audiences s on s.external_key = 'igp_aud_ig_eng_185d' where a.external_key = 'igp_aud_lookalike_1pct_185d'`)).rows[0];
    expect(lal.source_ok).toBe(true);
  });

  it("importa campanhas, vincula os 8 conjuntos e grava métricas com null preservado", async () => {
    const r = await importContent(U1, companyId, fixture("ig_predial_campanhas.json"));
    expect(r).toMatchObject({ campaigns_created: 7, ad_sets_created: 8, ads_created: 8, metrics_saved: 8, reconciliations_saved: 1 });
    const linked = (await db.query<{ n: number }>(`select count(*)::int n from clt_ad_sets s join clt_audiences a on a.id = s.saved_audience_id where a.company_id = '${companyId}'`)).rows[0].n;
    expect(linked).toBe(8);
    const totals = (await db.query<{ spend: string; conv: number; sales: number; revenue: string; null_conv: number }>(
      `select sum(spend)::text spend, sum(conversations)::int conv, sum(sales)::int sales, sum(revenue)::text revenue, count(*) filter (where conversations is null)::int null_conv from clt_ad_period_metrics`)).rows[0];
    expect(totals).toEqual({ spend: "836.35", conv: 79, sales: 38, revenue: "9610.00", null_conv: 1 });
    const rec = (await db.query<{ unallocated_spend: string; unallocated_conversations: number }>("select unallocated_spend::text, unallocated_conversations from clt_campaign_reconciliations")).rows[0];
    expect(rec).toEqual({ unallocated_spend: "6.82", unallocated_conversations: 1 });
  });

  it("telas: campanha, conjunto e anúncio leem as métricas importadas e o público vinculado", async () => {
    const rows = await asUser(U1, async () => ({
      campaigns: (await db.query<{ id: string; name: string; spent_amount: string; messages: number; sales: number }>("select id, name, spent_amount, messages, sales from clt_campaigns where company_id = $1", [companyId])).rows,
      sets: (await db.query<{ id: string; campaign_id: string; name: string; saved_audience_id: string | null }>("select s.id, s.campaign_id, s.name, s.saved_audience_id from clt_ad_sets s join clt_campaigns c on c.id = s.campaign_id where c.company_id = $1", [companyId])).rows,
      audiences: (await db.query<{ id: string; name: string; settings: Record<string, unknown> }>("select id, name, settings from clt_audiences where company_id = $1", [companyId])).rows,
      period: (await db.query<PeriodMetricFullRow>("select id, campaign_id, ad_set_id, creative_id, period_start::text, period_end::text, spend::text, conversations, sales, revenue::text, impressions, reach, link_clicks, leads from clt_ad_period_metrics where company_id = $1", [companyId])).rows,
    }));
    // Os campos antigos da campanha continuam 0 no banco (a importação não os altera)...
    expect(rows.campaigns.every(c => Number(c.spent_amount) === 0)).toBe(true);
    // ...e a tela soma os anúncios importados.
    const totals = withImportedCampaignTotals(rows.campaigns, rows.period);
    const byCity = (city: string) => totals.find(c => c.name.includes(city))!;
    expect(byCity("Cabo Frio")).toMatchObject({ spent_amount: 206.22, messages: 21, sales: 37 });
    expect(byCity("Araruama").spent_amount).toBe(104.43);
    expect(byCity("Macaé").spent_amount).toBe(104.48);
    expect(byCity("Rio das Ostras").spent_amount).toBe(104.18);

    const level = mergeAdLevelResults([], rows.period).rows;
    const cabo = level.filter(r => r.campaign_id === byCity("Cabo Frio").id);
    expect(cabo).toHaveLength(1);
    expect(cabo[0]).toMatchObject({ entry_date: "2026-10-29", spent_amount: 206.22, messages: 21, sales: 37, generated_revenue: 9360, impressions: 17981 });

    const caboSet = rows.sets.find(s => s.campaign_id === byCity("Cabo Frio").id)!;
    const aud = rows.audiences.find(a => a.id === caboSet.saved_audience_id)!;
    expect(aud.name).toContain("Cabo Frio");
    const info = Object.fromEntries(describeAudienceSettings(aud.settings));
    expect(info["Localização"]).toMatch(/^Cabo Frio \+\d+ km$/);
    expect(info["Idade"]).toBe("20 a 65+ anos");
  });

  it("reimportar os dois arquivos não duplica nada", async () => {
    const before = await Promise.all(["clt_audiences", "clt_campaigns", "clt_ad_sets", "clt_ad_creatives", "clt_ad_period_metrics", "clt_campaign_reconciliations"].map(count));
    const a = await importContent(U1, companyId, fixture("ig_predial_publicos.json"));
    const c = await importContent(U1, companyId, fixture("ig_predial_campanhas.json"));
    expect(a).toMatchObject({ audiences_created: 0, audiences_updated: 10 });
    expect(c).toMatchObject({ campaigns_created: 0, campaigns_updated: 7, ad_sets_created: 0, ad_sets_updated: 8, ads_created: 0, ads_updated: 8 });
    const after = await Promise.all(["clt_audiences", "clt_campaigns", "clt_ad_sets", "clt_ad_creatives", "clt_ad_period_metrics", "clt_campaign_reconciliations"].map(count));
    expect(after).toEqual(before);
  });

  it("valor ausente na reimportação não apaga o valor salvo", async () => {
    const text = `Período: 30/09/2026 a 29/10/2026
Campanha: IG Predial | WhatsApp | Cabo Frio | 15/10/2026
ID da campanha: 120254389360490655
Conjunto: Cabo Frio | Público Amplo | WhatsApp
ID do conjunto: 120254389360460655
Chave do público: igp_aud_cabo_frio_20261015
Anúncio: Imagem 01 | Cabo Frio
ID do anúncio: 120254389360480655
Conversas: 22`;
    await importContent(U1, companyId, text);
    const row = (await db.query<{ spend: string; conversations: number; sales: number }>(`select spend::text, conversations, sales from clt_ad_period_metrics m join clt_ad_creatives a on a.id = m.creative_id where a.meta_ad_id = '120254389360480655'`)).rows[0];
    expect(row).toEqual({ spend: "206.22", conversations: 22, sales: 37 });
    expect(await count("clt_ad_creatives")).toBe(8);
  });

  it("falha no meio desfaz tudo (sem gravação parcial)", async () => {
    const before = await Promise.all(["clt_audiences", "clt_campaigns", "clt_ad_sets", "clt_ad_creatives", "clt_ad_period_metrics"].map(count));
    const payload = {
      source_format: "text", period: { start: "2026-10-01", end: "2026-10-29" },
      audiences: [{ ref: "nova", existing_id: null, name: "Novo público", audience_type: "salvo", external_key: "novo", settings: {}, source_ref: null, source_existing_id: null }],
      campaigns: [{
        existing_id: null, meta_campaign_id: null, name: "Nova campanha", objective: null, notes: null, daily_budget: null, budget_type: "total",
        starts_on: "2026-10-01", ends_on: "2026-10-29", campaign_status: "ativa", status_explicit: true, reconciliation: null,
        ad_sets: [{ existing_id: null, meta_adset_id: null, name: "S", audience_ref: "nova", audience_existing_id: null, daily_budget: null, starts_at: null, ends_at: null, status: null, placements: null, notes: null,
          ads: [{ existing_id: null, meta_ad_id: null, name: "A", format: "imagem", post_id: null, notes: null, metrics: { spend: -5 } }] }],
      }],
    };
    await expect(asUser(U1, () => db.query("select public.clt_import_bundle($1, $2::jsonb)", [companyId, JSON.stringify(payload)]))).rejects.toThrow();
    const after = await Promise.all(["clt_audiences", "clt_campaigns", "clt_ad_sets", "clt_ad_creatives", "clt_ad_period_metrics"].map(count));
    expect(after).toEqual(before);
  });

  it("isolamento: outro usuário não importa na empresa alheia nem usa públicos dela", async () => {
    await expect(asUser(U2, () => db.query("select public.clt_import_bundle($1, '{}'::jsonb)", [companyId]))).rejects.toThrow(/Empresa não encontrada/);
    const foreignAudience = (await db.query<{ id: string }>("select id from clt_audiences limit 1")).rows[0].id;
    const payload = { source_format: "text", period: null, audiences: [], campaigns: [{ existing_id: null, meta_campaign_id: null, name: "X", objective: null, notes: null, daily_budget: null, budget_type: "total", starts_on: "2026-10-01", ends_on: "2026-10-01", campaign_status: "ativa", status_explicit: true, reconciliation: null, ad_sets: [{ existing_id: null, meta_adset_id: null, name: "S", audience_ref: null, audience_existing_id: foreignAudience, daily_budget: null, starts_at: null, ends_at: null, status: null, placements: null, notes: null, ads: [] }] }] };
    await expect(asUser(U2, () => db.query("select public.clt_import_bundle($1, $2::jsonb)", [otherCompanyId, JSON.stringify(payload)]))).rejects.toThrow(/outra empresa/);
    const seen = await asUser(U2, async () => (await db.query<{ n: number }>("select count(*)::int n from clt_ad_period_metrics")).rows[0].n);
    expect(seen).toBe(0); // RLS: U2 não enxerga métricas de U1
  });

  it("arquivo atualizado (conjunto excluído estimado): 80 mensagens, 38 vendas, R$ 9.610,00, R$ 843,17, 48.283 impressões, sem duplicar", async () => {
    const before = await count("clt_ad_period_metrics");
    const r = await importContent(U1, companyId, fixture("ig_predial_campanhas_atualizado_conjunto_excluido.json"));
    expect(r).toMatchObject({ campaigns_created: 0, ad_sets_created: 1, ads_created: 1 });
    expect(await count("clt_ad_period_metrics")).toBe(before + 1);
    const rows = await asUser(U1, async () => (await db.query<PeriodMetricRow>("select campaign_id, period_start::text, period_end::text, spend::text, conversations, sales, revenue::text, impressions from clt_ad_period_metrics where company_id = $1", [companyId])).rows);
    const entries = periodResultsToEntries(mergePeriodResults([], rows).imported);
    const sum = (k: "spent_amount" | "messages" | "sales" | "generated_revenue" | "impressions") => Math.round(entries.reduce((a, e) => a + Number(e[k]), 0) * 100) / 100;
    expect({ spend: sum("spent_amount"), messages: sum("messages"), sales: sum("sales"), revenue: sum("generated_revenue"), impressions: sum("impressions") })
      .toEqual({ spend: 843.17, messages: 80, sales: 38, revenue: 9610, impressions: 48283 });
    // O conjunto estimado não é ligado a nenhum público (o arquivo não informa público).
    const est = (await db.query<{ saved_audience_id: string | null }>("select saved_audience_id from clt_ad_sets where name like $1", ["Conjunto excluído%"])).rows[0];
    expect(est.saved_audience_id).toBeNull();
  });
});
