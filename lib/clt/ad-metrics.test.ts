import { describe, expect, it } from "vitest";
import type { CltAdLevelResult } from "@/types/database.types";
import { mergeAdLevelResults, unknownFields, withImportedCampaignTotals, type PeriodMetricFullRow } from "./ad-metrics";
import { describeAudienceSettings } from "./audience-summary";

const period = (over: Partial<PeriodMetricFullRow> = {}): PeriodMetricFullRow => ({
  id: "p1", campaign_id: "c1", ad_set_id: "s1", creative_id: "a1", period_start: "2026-09-30", period_end: "2026-10-29",
  spend: "206.22", conversations: 21, sales: 37, revenue: "9360.00", impressions: 17981, reach: 8167, link_clicks: null, leads: null, ...over,
});
const legacy = (over: Partial<CltAdLevelResult>): CltAdLevelResult => ({
  id: "l1", user_id: "u", campaign_id: "c1", ad_set_id: "s1", creative_id: "a1", entry_date: "2026-10-10", spent_amount: 50, messages: 5, sales: 1,
  generated_revenue: 0, views: 0, impressions: 0, reach: 0, engagements: 0, link_clicks: 0, thruplays: 0, leads: 0, profile_visits: 0, appointments: 0, ...over,
});

describe("mergeAdLevelResults", () => {
  it("converte a linha importada mantendo os números e marcando os não informados", () => {
    const { rows } = mergeAdLevelResults([], [period()]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entry_date: "2026-10-29", spent_amount: 206.22, messages: 21, sales: 37, generated_revenue: 9360, source: "import" });
    expect(rows[0].unknown).toEqual(expect.arrayContaining(["link_clicks", "leads", "views"]));
    expect(rows[0].unknown).not.toContain("spent_amount");
  });

  it("não duplica: lançamento antigo do mesmo anúncio (ou do conjunto) dentro do período sai", () => {
    const old = [
      legacy({ id: "dentro" }),
      legacy({ id: "conjunto-dentro", creative_id: null }),
      legacy({ id: "fora", entry_date: "2026-09-01" }),
      legacy({ id: "outro-anuncio", creative_id: "a2", ad_set_id: "s2" }),
    ];
    const r = mergeAdLevelResults(old, [period()]);
    expect(r.excludedLegacy).toBe(2);
    expect(r.rows.map(x => x.id).sort()).toEqual(["fora", "outro-anuncio", "period:p1"]);
  });

  it("null não vira zero na exibição: campo é 'não informado' só quando nenhuma linha informou", () => {
    const { rows } = mergeAdLevelResults([], [period({ id: "a", conversations: null }), period({ id: "b", creative_id: "a2", conversations: null })]);
    expect(unknownFields(rows).has("messages")).toBe(true);
    const mixed = mergeAdLevelResults([], [period({ id: "a", conversations: null }), period({ id: "b", creative_id: "a2" })]).rows;
    expect(unknownFields(mixed).has("messages")).toBe(false);
    expect(unknownFields([...rows, legacy({})]).size).toBe(0);
  });
});

describe("withImportedCampaignTotals", () => {
  it("soma os anúncios importados aos campos da campanha sem tocar nas outras", () => {
    const out = withImportedCampaignTotals(
      [{ id: "c1", spent_amount: 0, messages: 0, sales: 0 }, { id: "c2", spent_amount: 10, messages: 1, sales: 0 }],
      [period(), period({ id: "p2", creative_id: "a2", spend: "6.78", conversations: null, sales: null })],
    );
    expect(out[0]).toMatchObject({ spent_amount: 213, messages: 21, sales: 37 });
    expect(out[1]).toEqual({ id: "c2", spent_amount: 10, messages: 1, sales: 0 });
  });
});

describe("describeAudienceSettings", () => {
  it("formato do importador", () => {
    const d = Object.fromEntries(describeAudienceSettings({
      external_key: "x", import_platform: "meta_ads", targeting_location: { city: "Macaé", radius_km: 10 }, age_range: [20, 65],
      interests: [], estimated_size: [374000, 440000], created_at_local: "2026-10-19T14:05:00", language: "pt_BR",
    }));
    expect(d).toEqual({
      "Localização": "Macaé +10 km", "Idade": "20 a 65+ anos", "Interesses": "nenhum",
      "Tamanho estimado": "374.000 a 440.000 pessoas", "Idioma": "pt_BR", "Criado em": "19/10/2026 14:05",
    });
  });

  it("público personalizado mostra retenção e fonte; cadastro antigo continua legível", () => {
    const custom = Object.fromEntries(describeAudienceSettings({ retention_days: 180, source: { instagram_account: "@ig_predial", event: "instagram_engagement", retention_days: 180 } }));
    expect(custom["Retenção"]).toBe("180 dias");
    expect(custom["Fonte"]).toBe("instagram_account: @ig_predial · event: instagram_engagement");
    const old = Object.fromEntries(describeAudienceSettings({ localizacao: "São Gonçalo +15 km", idade_minima: 20, idade_maxima: "65+", genero: "todos" }));
    expect(old).toEqual({ "Localização": "São Gonçalo +15 km", "Idade": "20 a 65+ anos", "Gênero": "todos" });
  });

  it("não inventa nada quando não há configurações", () => {
    expect(describeAudienceSettings({})).toEqual([]);
    expect(describeAudienceSettings(null)).toEqual([]);
  });
});
