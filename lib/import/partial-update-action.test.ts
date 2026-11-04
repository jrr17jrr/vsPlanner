import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Fluxo completo da Central de Importação (prévia → confirmar) com banco em
 * memória: a atualização parcial só chama clt_apply_ad_result_update (mesma
 * função do "Atualizar resultados"), nunca clt_import_bundle, e nenhuma
 * tabela de estrutura (campanha/conjunto/anúncio) é escrita.
 */
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const writes: Array<{ table: string; op: string }> = [];
const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

function query(table: string) {
  const filters: Array<(r: Row) => boolean> = [];
  let single = false;
  const rows = () => (tables[table] ??= []);
  const b = {
    select: () => b,
    insert: () => { writes.push({ table, op: "insert" }); return b; },
    update: () => { writes.push({ table, op: "update" }); return b; },
    delete: () => { writes.push({ table, op: "delete" }); return b; },
    upsert: () => { writes.push({ table, op: "upsert" }); return b; },
    eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return b; },
    in: (c: string, v: unknown[]) => { filters.push((r) => v.includes(r[c])); return b; },
    order: () => b,
    maybeSingle: () => { single = true; return b; },
    then: (resolve: (v: unknown) => void) => {
      const out = rows().filter((r) => filters.every((f) => f(r)));
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
