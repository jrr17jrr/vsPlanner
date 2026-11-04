import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Central de Importação (prévia → confirmar) com banco em memória: as
 * informações cadastradas informadas são gravadas no registro certo, só nas
 * colunas informadas, sem tocar em métricas; sem a migration nova, as
 * colunas antigas (ex.: link) ainda são gravadas e o aviso aparece.
 */
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const writes: Array<{ table: string; op: string; payload?: Row }> = [];
const rpcCalls: string[] = [];
let missingColumns = new Set<string>();

function query(table: string) {
  const filters: Array<(r: Row) => boolean> = [];
  let single = false;
  let op: "select" | "insert" | "update" = "select";
  let payload: Row | null = null;
  const rows = () => (tables[table] ??= []);
  const b = {
    select: () => b,
    insert: (p: Row) => { op = "insert"; payload = p; return b; },
    update: (p: Row) => { op = "update"; payload = p; return b; },
    eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return b; },
    in: (c: string, v: unknown[]) => { filters.push((r) => v.includes(r[c])); return b; },
    order: () => b,
    maybeSingle: () => { single = true; return b; },
    then: (resolve: (v: unknown) => void) => {
      if (op === "update" && Object.keys(payload ?? {}).some((k) => missingColumns.has(k))) return resolve({ data: null, error: { code: "42703", message: "column does not exist" } });
      if (op !== "select") writes.push({ table, op, payload: payload ?? undefined });
      if (op === "insert") { const r = { id: `${table}-new`, ...payload }; rows().push(r); return resolve({ data: [r], error: null }); }
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
  rpc: async (name: string) => { rpcCalls.push(name); return { data: { metric_id: "m-new", campaigns_updated: 1 }, error: null }; },
};
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => fakeDb }));
vi.mock("@/lib/supabase/clt-scope", () => ({ assertCompanyInModule: async () => true }));
const { previewSmartImportAction, confirmSmartImportAction } = await import("@/lib/supabase/clt-import-actions");

const INFO_ONLY = `Campanha: SGIV | WhatsApp
Estratégia de lances: Volume mais alto
Conjunto: Conjunto A
Idioma: Português
Anúncio: Vídeo 01
ID do anúncio: 120212345678901234
Link: https://www.instagram.com/p/ABC/
Chamada para ação: Enviar mensagem`;

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  writes.length = 0; rpcCalls.length = 0; missingColumns = new Set();
  tables.clt_companies = [{ id: "co", name: "SGIV", user_id: USER }];
  tables.clt_campaigns = [{ id: "cmp-1", company_id: "co", user_id: USER, name: "SGIV | WhatsApp", meta_campaign_id: null, description: "Obs antiga", bid_strategy: null, details: {} }];
  tables.clt_ad_sets = [{ id: "set-1", campaign_id: "cmp-1", user_id: USER, name: "Conjunto A", meta_adset_id: null, languages: null, placements: "Feed", details: {} }];
  tables.clt_ad_creatives = [{ id: "ad-1", ad_set_id: "set-1", user_id: USER, name: "Vídeo 01", meta_ad_id: null, asset_url: null, primary_text: "Texto que já existia", call_to_action: null, details: {} }];
  tables.clt_ad_period_metrics = [];
});

describe("informações cadastradas pela Central de Importação", () => {
  it("prévia: atual → novo por registro, nada gravado", async () => {
    const r = await previewSmartImportAction({ companyId: "co", content: INFO_ONLY });
    expect(r.error).toBeUndefined();
    expect(r.preview!.canImport).toBe(true);
    const ad = r.preview!.infoChanges!.find((c) => c.level === "ad")!;
    expect(ad.changes.map((c) => [c.column, c.before, c.after])).toEqual([["meta_ad_id", null, "120212345678901234"], ["asset_url", null, "https://www.instagram.com/p/ABC/"], ["call_to_action", null, "Enviar mensagem"]]);
    expect(r.preview!.infoChanges!.find((c) => c.level === "campaign")!.changes).toEqual([{ column: "bid_strategy", label: "Estratégia de lances", before: null, after: "Volume mais alto" }]);
    expect(writes).toEqual([]);
  });

  it("confirmar: grava só as colunas informadas; o que foi omitido (texto principal, observações) fica", async () => {
    const r = await confirmSmartImportAction({ companyId: "co", content: INFO_ONLY, confirmed: [] });
    expect(r.error).toBeUndefined();
    expect(r.success).toMatch(/informações cadastradas gravadas em 3 registro\(s\)/);
    expect(tables.clt_ad_creatives[0]).toMatchObject({ meta_ad_id: "120212345678901234", asset_url: "https://www.instagram.com/p/ABC/", call_to_action: "Enviar mensagem", primary_text: "Texto que já existia" });
    expect(tables.clt_campaigns[0]).toMatchObject({ bid_strategy: "Volume mais alto", description: "Obs antiga" });
    expect(tables.clt_ad_sets[0]).toMatchObject({ languages: "Português", placements: "Feed" });
    expect(writes.some((w) => w.table === "clt_ad_period_metrics")).toBe(false);
    // Reimportar o mesmo texto não regrava nada.
    writes.length = 0;
    await confirmSmartImportAction({ companyId: "co", content: INFO_ONLY, confirmed: [] });
    expect(writes.filter((w) => w.table !== "clt_import_runs")).toEqual([]);
  });

  it("junto com métricas (atualização parcial): métrica pela função de sempre + informações no anúncio", async () => {
    tables.clt_ad_period_metrics = [{ id: "pm-1", company_id: "co", campaign_id: "cmp-1", ad_set_id: "set-1", creative_id: "ad-1", user_id: USER, period_start: "2026-10-01", period_end: "2026-10-31", source: "import", spend: 100, conversations: 5 }];
    tables.profiles = [{ id: USER, name: "Gestor" }];
    const r = await confirmSmartImportAction({ companyId: "co", content: "Campanha: SGIV | WhatsApp\nAnúncio: Vídeo 01\nConversas: 9\nDestino: WhatsApp", confirmed: [] });
    expect(r.error).toBeUndefined();
    expect(rpcCalls).toEqual(["clt_apply_ad_result_update"]);
    expect(writes).toEqual([{ table: "clt_ad_creatives", op: "update", payload: { destination: "WhatsApp" } }]);
  });

  it("sem a migration 20261109100000: grava o link (coluna antiga) e avisa o que ficou pendente", async () => {
    missingColumns = new Set(["bid_strategy", "languages", "call_to_action"]);
    const r = await confirmSmartImportAction({ companyId: "co", content: INFO_ONLY, confirmed: [] });
    expect(r.success).toMatch(/20261109100000_clt_registered_info\.sql/);
    expect(tables.clt_ad_creatives[0]).toMatchObject({ asset_url: "https://www.instagram.com/p/ABC/", meta_ad_id: "120212345678901234", call_to_action: null });
  });
});
