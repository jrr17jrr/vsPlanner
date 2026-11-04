import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Fluxo completo da Central de Importação (prévia → confirmar) com banco em
 * memória: a atualização parcial só chama clt_apply_ad_result_update (mesma
 * função do "Atualizar resultados"), nunca clt_import_bundle, e nenhuma
 * tabela de estrutura (campanha/conjunto/anúncio) é escrita.
 */
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const writes: Array<{ table: string; op: string; payload?: Row }> = [];
const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

function query(table: string) {
  const filters: Array<(r: Row) => boolean> = [];
  let single = false;
  let op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  let payload: Row | null = null;
  const rows = () => (tables[table] ??= []);
  const b = {
    select: () => b,
    insert: (p: Row) => { op = "insert"; payload = p; return b; },
    update: (p: Row) => { op = "update"; payload = p; return b; },
    delete: () => { op = "delete"; return b; },
    upsert: (p: Row) => { op = "upsert"; payload = p; return b; },
    eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return b; },
    in: (c: string, v: unknown[]) => { filters.push((r) => v.includes(r[c])); return b; },
    order: () => b,
    maybeSingle: () => { single = true; return b; },
    then: (resolve: (v: unknown) => void) => {
      if (op !== "select") writes.push({ table, op, payload: payload ?? undefined });
      if (op === "insert") { const r = { id: `${table}-new-${rows().length + 1}`, ...payload }; rows().push(r); return resolve({ data: [r], error: null }); }
      const out = rows().filter((r) => filters.every((f) => f(r)));
      if (op === "update") { out.forEach((r) => Object.assign(r, payload)); return resolve({ data: out, error: null }); }
      resolve({ data: single ? out[0] ?? null : out, error: null });
    },
  };
  return b;
}
const USER = "user-1";
const fakeDb = {
  auth: { getUser: async () => ({ data: { user: { id: USER } } }) },
  from: (t: string) => query(t),
  rpc: async (name: string, args: Record<string, unknown>) => { rpcCalls.push({ name, args }); return { data: { metric_id: "m-new" }, error: null }; },
};
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => fakeDb }));
vi.mock("@/lib/supabase/clt-scope", () => ({ assertCompanyInModule: async () => true }));

const { previewSmartImportAction, confirmSmartImportAction } = await import("@/lib/supabase/clt-import-actions");

const TEXT = `Empresa: AIV
Campanha: AIV | Engajamento | video 14/10/26
Anúncio: AIV | Vídeo local | Engajamento
Interações: 2580
Reações à publicação: 2543
Comentários: 5
Compartilhamentos: 13
Novos seguidores: 1
Cliques no link: 16
ThruPlays: 1679
Visualizações de 75%: 1180
Visualizações de 100%: 863`;

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  writes.length = 0; rpcCalls.length = 0;
  tables.clt_companies = [{ id: "co", name: "AIV", user_id: USER }];
  tables.clt_campaigns = [{ id: "cmp-1", company_id: "co", user_id: USER, name: "AIV | Engajamento | video 14/10/26", meta_campaign_id: null, starts_on: "2026-10-14" }];
  tables.clt_ad_sets = [{ id: "set-a", campaign_id: "cmp-1", user_id: USER, name: "Público local", meta_adset_id: null }];
  tables.clt_ad_creatives = [
    { id: "ad-1", ad_set_id: "set-a", user_id: USER, name: "AIV | Vídeo local | Engajamento", meta_ad_id: null },
    { id: "ad-2", ad_set_id: "set-a", user_id: USER, name: "Outro anúncio", meta_ad_id: null },
  ];
  tables.clt_ad_period_metrics = [{
    id: "pm-1", company_id: "co", campaign_id: "cmp-1", ad_set_id: "set-a", creative_id: "ad-1", user_id: USER, period_start: "2026-10-14", period_end: "2026-10-31", source: "import",
    spend: 150, conversations: null, sales: null, revenue: null, impressions: 40000, reach: 21000, link_clicks: 10, leads: null, views: null, thruplays: 1500, engagements: 2000,
    reactions: null, comments: null, shares: null, new_followers: null, video_plays_3s: null, video_p75: null, video_p100: null,
  }];
  tables.profiles = [{ id: USER, name: "Gestor" }];
});

describe("Central de Importação — atualização parcial (AIV)", () => {
  it("prévia: empresa, campanha, conjunto identificado, anúncio e antes → depois só das métricas informadas", async () => {
    const r = await previewSmartImportAction({ companyId: "co", content: TEXT });
    expect(r.error).toBeUndefined();
    expect(r.preview!.mode).toBe("metrics_update");
    expect(r.preview!.canImport).toBe(true);
    expect(r.preview!.companyName).toBe("AIV");
    const [m] = r.preview!.metricChanges!;
    expect(m).toMatchObject({ campaign: "AIV | Engajamento | video 14/10/26", adSet: "Público local", adSetAutoIdentified: true, ad: "AIV | Vídeo local | Engajamento", unchanged: false });
    expect(m.changes.find((c) => c.key === "engagements")).toEqual({ key: "engagements", label: "Interações", before: 2000, after: 2580 });
    expect(m.changes.find((c) => c.key === "link_clicks")).toMatchObject({ before: 10, after: 16 });
    expect(m.changes.map((c) => c.key)).not.toContain("spend");
    expect(m.changes.map((c) => c.key)).not.toContain("impressions");
    expect(writes).toEqual([]);
    expect(rpcCalls).toEqual([]);
  });

  it("confirmar: só a diferença das métricas informadas, nenhum registro de estrutura escrito", async () => {
    const r = await confirmSmartImportAction({ companyId: "co", content: TEXT, confirmed: [] });
    expect(r.error).toBeUndefined();
    expect(r.success).toMatch(/1 anúncio\(s\) com métricas atualizadas/);
    expect(rpcCalls.map((c) => c.name)).toEqual(["clt_apply_ad_result_update"]);
    const args = rpcCalls[0].args;
    expect(args.p_creative_id).toBe("ad-1");
    const values = args.p_values as Record<string, number | null>;
    // Não informados continuam null (investimento, alcance, impressões…).
    expect(values).toMatchObject({ spend: null, impressions: null, reach: null, conversations: null, sales: null, revenue: null, leads: null });
    expect(values).toMatchObject({ engagements: 580, reactions: 2543, link_clicks: 6, thruplays: 179, video_p75: 1180, video_p100: 863 });
    // Nada de campanha/conjunto/anúncio criado ou editado; o outro anúncio não é tocado.
    expect(writes).toEqual([]);
    expect(rpcCalls.some((c) => c.name === "clt_import_bundle")).toBe(false);
  });

  it("valores iguais aos atuais: nada a gravar", async () => {
    const same = `Campanha: AIV | Engajamento | video 14/10/26\nAnúncio: AIV | Vídeo local | Engajamento\nInterações: 2000`;
    const r = await confirmSmartImportAction({ companyId: "co", content: same, confirmed: [] });
    expect(r.error).toMatch(/Há erros na validação/);
    expect(rpcCalls).toEqual([]);
  });

  it("com período igual ao do registro: atualiza SÓ as métricas informadas desse registro", async () => {
    const period = { start: "2026-10-14", end: "2026-10-31" };
    const p = await previewSmartImportAction({ companyId: "co", content: TEXT, period });
    expect(p.preview!.mode).toBe("period_update");
    expect(p.preview!.canImport).toBe(true);
    const [t] = p.preview!.periodTargets!;
    expect(t).toMatchObject({ kind: "update_row", target: { id: "pm-1", start: "2026-10-14", end: "2026-10-31", chosen: false }, adSet: "Público local", adSetAutoIdentified: true });
    expect(t.changes.find((c) => c.key === "engagements")).toEqual({ key: "engagements", label: "Interações", before: 2000, after: 2580 });
    expect(p.preview!.issues.some((i) => /Os dois serão mantidos/.test(i.message))).toBe(false);
    expect(writes).toEqual([]);

    const r = await confirmSmartImportAction({ companyId: "co", content: TEXT, period, confirmed: [] });
    expect(r.error).toBeUndefined();
    expect(r.success).toMatch(/1 registro\(s\) de resultados atualizado/);
    const metricWrites = writes.filter((w) => w.table === "clt_ad_period_metrics");
    expect(metricWrites).toHaveLength(1);
    expect(metricWrites[0].op).toBe("update");
    expect(Object.keys(metricWrites[0].payload!).sort()).toEqual(["comments", "engagements", "link_clicks", "new_followers", "reactions", "shares", "thruplays", "updated_at", "video_p100", "video_p75"]);
    const saved = tables.clt_ad_period_metrics[0];
    expect(saved).toMatchObject({ spend: 150, impressions: 40000, reach: 21000, engagements: 2580, link_clicks: 16, thruplays: 1679 });
    expect(tables.clt_ad_period_metrics).toHaveLength(1);
    // Nada de estrutura; nada de RPC de importação ou de diferença.
    expect(writes.some((w) => ["clt_campaigns", "clt_ad_sets", "clt_ad_creatives"].includes(w.table))).toBe(false);
    expect(rpcCalls).toEqual([]);
  });

  it("depois de salvar, os relatórios somam as métricas novas e mantêm investimento/impressões/alcance", async () => {
    const period = { start: "2026-10-14", end: "2026-10-31" };
    const r = await confirmSmartImportAction({ companyId: "co", content: TEXT, period, confirmed: [] });
    expect(r.error).toBeUndefined();
    const { mergePeriodResults, periodResultsToEntries } = await import("@/lib/clt/period-results");
    const { periodMetrics } = await import("@/lib/clt/report-period");
    const merged = mergePeriodResults([], tables.clt_ad_period_metrics as never);
    const results = periodResultsToEntries(merged.imported);
    const m = periodMetrics({ period: { kind: "month", month: "2026-10" }, campaignIds: new Set(["cmp-1"]), results: results as never, messaging: [] });
    expect(m).toMatchObject({
      engagements: 2580, reactions: 2543, comments: 5, shares: 13, newFollowers: 1, linkClicks: 16, thruplays: 1679, video75: 1180, video100: 863,
      gasto: 150, impressions: 40000, reach: 21000, messages: 0,
    });
  });

  it("período sobreposto e diferente (caso real 14/10 a 30/10): bloqueia, mostra os registros e não cria nada", async () => {
    const period = { start: "2026-10-14", end: "2026-10-30" };
    const p = await previewSmartImportAction({ companyId: "co", content: TEXT, period });
    expect(p.preview!.canImport).toBe(false);
    const [t] = p.preview!.periodTargets!;
    expect(t.kind).toBe("choose");
    expect(t.options).toEqual([expect.objectContaining({ id: "pm-1", start: "2026-10-14", end: "2026-10-31", selectable: true })]);
    const r = await confirmSmartImportAction({ companyId: "co", content: TEXT, period, confirmed: [] });
    expect(r.error).toBeDefined();
    expect(writes).toEqual([]);
    expect(tables.clt_ad_period_metrics).toHaveLength(1);
  });

  it("sobreposto + registro escolhido: atualiza o escolhido, sem somar e sem criar outro", async () => {
    const period = { start: "2026-10-14", end: "2026-10-30" };
    const p = await previewSmartImportAction({ companyId: "co", content: TEXT, period, targets: { "ad-1": "pm-1" } });
    expect(p.preview!.canImport).toBe(true);
    expect(p.preview!.periodTargets![0]).toMatchObject({ kind: "update_row", target: { id: "pm-1", chosen: true, end: "2026-10-31" } });
    const r = await confirmSmartImportAction({ companyId: "co", content: TEXT, period, confirmed: [], targets: { "ad-1": "pm-1" } });
    expect(r.error).toBeUndefined();
    expect(tables.clt_ad_period_metrics).toHaveLength(1);
    expect(tables.clt_ad_period_metrics[0]).toMatchObject({ engagements: 2580, link_clicks: 16, spend: 150 });
  });

  it("período sem nenhum registro sobreposto: cria UM registro só com as métricas informadas", async () => {
    const period = { start: "2026-11-01", end: "2026-11-03" };
    const r = await confirmSmartImportAction({ companyId: "co", content: TEXT, period, confirmed: [] });
    expect(r.error).toBeUndefined();
    expect(tables.clt_ad_period_metrics).toHaveLength(2);
    const created = tables.clt_ad_period_metrics[1];
    expect(created).toMatchObject({ creative_id: "ad-1", campaign_id: "cmp-1", ad_set_id: "set-a", period_start: "2026-11-01", period_end: "2026-11-03", engagements: 2580 });
    expect(created).not.toHaveProperty("spend");
    expect(created).not.toHaveProperty("reach");
  });

  it("reimportar o mesmo texto e período: nada a gravar (sem duplicar)", async () => {
    const period = { start: "2026-10-14", end: "2026-10-31" };
    await confirmSmartImportAction({ companyId: "co", content: TEXT, period, confirmed: [] });
    writes.length = 0;
    const again = await confirmSmartImportAction({ companyId: "co", content: TEXT, period, confirmed: [] });
    expect(again.error).toMatch(/Há erros na validação/);
    expect(writes).toEqual([]);
    expect(tables.clt_ad_period_metrics).toHaveLength(1);
  });

  it("anúncio ambíguo: bloqueado antes de qualquer gravação", async () => {
    tables.clt_ad_sets.push({ id: "set-b", campaign_id: "cmp-1", user_id: USER, name: "Remarketing", meta_adset_id: null });
    tables.clt_ad_creatives.push({ id: "ad-9", ad_set_id: "set-b", user_id: USER, name: "AIV | Vídeo local | Engajamento", meta_ad_id: null });
    const p = await previewSmartImportAction({ companyId: "co", content: TEXT });
    expect(p.preview!.canImport).toBe(false);
    expect(p.preview!.issues.find((i) => i.level === "error")!.message).toMatch(/Há 2 anúncios chamados/);
    const r = await confirmSmartImportAction({ companyId: "co", content: TEXT, confirmed: [] });
    expect(r.error).toBeDefined();
    expect(rpcCalls).toEqual([]);
  });
});
