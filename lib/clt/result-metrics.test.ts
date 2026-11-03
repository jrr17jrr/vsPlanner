import { describe, expect, it } from "vitest";
import { cpc, cpm, ctr, emptyRatio, formatMetric, levelCards, levelTotals, ratioFromValues, rowRatioBase } from "./result-metrics";
import { mergePeriodResults, periodResultsToEntries, type PeriodMetricRow } from "./period-results";
import { cpc as reportCpc, cpm as reportCpm, ctr as reportCtr, periodMetrics, sumMetrics, type ReportResult } from "./report-period";
import { mergeAdLevelResults, type PeriodMetricFullRow } from "./ad-metrics";
import { currentTotals, planAdResultUpdate, type CountedRow } from "./ad-result-update";
import { DEFAULT_REPORT_METRICS, REPORT_METRICS, sanitizeReportMetrics, selectedValueMetrics } from "./report-metrics";

describe("CPC, CTR e CPM", () => {
  it("calcula com investimento, cliques e impressões", () => {
    const b = ratioFromValues(100, 50, 10_000);
    expect(cpc(b)).toBe(2);
    expect(ctr(b)).toBeCloseTo(0.5);
    expect(cpm(b)).toBe(10);
  });
  it("sem dados suficientes → null ('—')", () => {
    expect(cpc(emptyRatio())).toBeNull();
    expect(ctr(emptyRatio())).toBeNull();
    expect(cpm(emptyRatio())).toBeNull();
    expect(cpc(ratioFromValues(100, null, 1000))).toBeNull(); // cliques não informados
    expect(cpc(ratioFromValues(100, 0, 1000))).toBeNull(); // nenhum clique: sem CPC
    expect(ctr(ratioFromValues(null, 0, 1000))).toBe(0); // 0 cliques informados em 1000 impressões = 0%
    expect(formatMetric(null, "money")).toBe("—");
    expect(formatMetric(1.5, "pct")).toBe("1,50%");
  });
  it("só soma registros com as duas pontas informadas (investimento sem cliques não infla o CPC)", () => {
    const rows = [
      { spent_amount: 100, link_clicks: 50, impressions: 10_000, unknown: [] },
      { spent_amount: 300, link_clicks: 0, impressions: 0, unknown: ["link_clicks", "impressions"] },
    ];
    const t = levelTotals(rows);
    expect(t.spent).toBe(400);
    expect(cpc(t.ratio)).toBe(2); // 100 ÷ 50, não 400 ÷ 50
    expect(cpm(t.ratio)).toBe(10);
  });
  it("lançamento antigo (0 = não usado) e linha consolidada com `ratio`", () => {
    expect(rowRatioBase({ spent_amount: 80, link_clicks: 0, impressions: 4000 })).toMatchObject({ cpcSpend: 0, cpcClicks: 0, cpmSpend: 80, cpmImpressions: 4000 });
    const ratio = ratioFromValues(10, 5, 100);
    expect(rowRatioBase({ spent_amount: 999, ratio })).toBe(ratio);
  });
});

describe("totais e cards por seção", () => {
  const period = (p: Partial<PeriodMetricFullRow>): PeriodMetricFullRow => ({ id: "p", campaign_id: "c", ad_set_id: "s", creative_id: "a", period_start: "2026-10-01", period_end: "2026-10-31", spend: 100, conversations: 10, sales: null, revenue: null, impressions: 10_000, reach: null, link_clicks: 40, leads: null, source: "import", ...p });
  it("métricas novas não informadas aparecem como 'não informado'; informadas somam", () => {
    const rows = mergeAdLevelResults([], [period({ id: "1" }), period({ id: "2", period_start: "2026-11-01", period_end: "2026-11-03", source: "manual_update", reactions: 30, video_p75: 12, spend: null, conversations: null, impressions: null, link_clicks: null })]).rows;
    const t = levelTotals(rows);
    expect(t.reactions).toBe(30);
    expect(t.unknown.has("reactions")).toBe(false);
    expect(t.unknown.has("comments")).toBe(true);
    const cards = levelCards(t);
    expect(cards.engajamento.find((c) => c.key === "comments")?.value).toBe("não informado");
    expect(cards.engajamento.find((c) => c.key === "new_followers")?.label).toBe("Novos seguidores (anúncios)");
    expect(cards.engajamento.some((c) => c.key === "link_clicks")).toBe(true);
    expect(cards.principal.some((c) => c.key === "link_clicks")).toBe(false); // cliques ≠ conversas
    expect(cards.custos.find((c) => c.key === "cpc")?.value).toMatch(/R\$\s?2,50/);
  });
  it("lançamentos antigos sem as colunas novas → 'não informado'", () => {
    const t = levelTotals([{ spent_amount: 10, messages: 1 }]);
    expect(t.unknown.has("shares")).toBe(true);
    expect(levelCards(t).custos.find((c) => c.key === "cpm")?.value).toBe("—");
  });
});

describe("Atualizar resultados com as métricas novas", () => {
  const imp: CountedRow = { entry_date: "2026-10-15", period_start: "2026-10-01", period_end: "2026-10-15", source: "import", spent_amount: 100, messages: 10, link_clicks: 50, unknown: ["reactions", "video_p75"] };
  it("informa os totais e grava só a diferença; campo vazio não muda nada", () => {
    expect(currentTotals([imp]).reactions).toBeNull();
    const plan = planAdResultUpdate({ rows: [imp], updateRows: [], values: { reactions: 30, link_clicks: 70, video_p75: null }, today: "2026-11-05", reference: { start: "2026-10-16", end: "2026-10-31" } });
    if ("error" in plan) throw new Error(plan.error);
    expect(plan.values).toMatchObject({ reactions: 30, link_clicks: 20, video_p75: null, conversations: null });
    expect(plan.delta).toEqual({ reactions: 30, link_clicks: 20 });
  });
  it("recusa número inválido nas métricas novas", () => {
    expect(planAdResultUpdate({ rows: [imp], updateRows: [], values: { shares: 1.5 }, today: "2026-11-05", reference: { start: "2026-10-16", end: "2026-10-31" } })).toEqual({ error: "Compartilhamentos: use um número inteiro." });
  });
});

describe("consolidação e relatórios (sem duplicar)", () => {
  const p = (x: Partial<PeriodMetricRow>): PeriodMetricRow => ({ campaign_id: "c1", creative_id: "a1", period_start: "2026-10-01", period_end: "2026-10-31", spend: 100, conversations: 5, sales: null, revenue: null, impressions: 10_000, link_clicks: 50, source: "import", ...x });
  it("anúncios somados por campanha com engajamento, vídeo e base de CPC; atualização coberta pelo importado não conta", () => {
    const merged = mergePeriodResults([], [
      p({ reactions: 10, video_plays_3s: 300 }),
      p({ creative_id: "a2", spend: 50, impressions: null, link_clicks: 10, reactions: 5 }),
      // Atualização manual dentro do período importado do mesmo anúncio: o importado prevalece.
      p({ period_start: "2026-10-10", period_end: "2026-10-20", source: "manual_update", reactions: 999, spend: 999 }),
    ]);
    const [entry] = periodResultsToEntries(merged.imported.filter((x) => x.source === "import"));
    expect(merged.imported).toHaveLength(1);
    expect(entry).toMatchObject({ spent_amount: 150, reactions: 15, video_plays_3s: 300, link_clicks: 60 });
    expect(entry.ratio).toEqual({ cpcSpend: 150, cpcClicks: 60, cpmSpend: 100, cpmImpressions: 10_000, ctrClicks: 50, ctrImpressions: 10_000 });
  });
  it("relatório do período: novas métricas, CPC/CTR/CPM do período e '—' sem base", () => {
    const entries = periodResultsToEntries(mergePeriodResults([], [p({ reactions: 10, new_followers: 4, video_p100: 7 }), p({ period_start: "2026-11-01", period_end: "2026-11-30", spend: 300, link_clicks: 30, impressions: 20_000 })]).imported) as unknown as ReportResult[];
    const oct = periodMetrics({ period: { kind: "month", month: "2026-10" }, campaignIds: new Set(["c1"]), results: entries, messaging: [] });
    expect(oct).toMatchObject({ gasto: 100, reactions: 10, newFollowers: 4, video100: 7, linkClicks: 50 });
    expect(reportCpc(oct)).toBe(2);
    expect(reportCtr(oct)).toBeCloseTo(0.5);
    expect(reportCpm(oct)).toBe(10);
    const nov = periodMetrics({ period: { kind: "month", month: "2026-11" }, campaignIds: new Set(["c1"]), results: entries, messaging: [] });
    expect(reportCpc(nov)).toBe(10);
    const both = sumMetrics([oct, nov]);
    expect(reportCpc(both)).toBe(5); // 400 ÷ 80
    const none = periodMetrics({ period: { kind: "month", month: "2026-09" }, campaignIds: new Set(["c1"]), results: entries, messaging: [] });
    expect([reportCpc(none), reportCtr(none), reportCpm(none)]).toEqual([null, null, null]);
  });
});

describe("catálogo do relatório", () => {
  it("ids únicos; padrão válido; sanitiza a seleção salva", () => {
    expect(new Set(REPORT_METRICS.map((m) => m.id)).size).toBe(REPORT_METRICS.length);
    expect(sanitizeReportMetrics(DEFAULT_REPORT_METRICS)).toEqual(REPORT_METRICS.map((m) => m.id).filter((id) => DEFAULT_REPORT_METRICS.includes(id)));
    expect(sanitizeReportMetrics(["cpc", "xyz", "gasto", "cpc", 3])).toEqual(["gasto", "cpc"]);
    expect(sanitizeReportMetrics("gasto")).toBeNull();
  });
  it("seguidores totais do Instagram e novos seguidores dos anúncios são itens diferentes", () => {
    const labels = REPORT_METRICS.map((m) => m.label);
    expect(labels).toContain("Novos seguidores (anúncios)");
    expect(labels).toContain("Seguidores do Instagram (total, contagem manual)");
  });
  it("tabelas por campanha não incluem movimentações nem saldo", () => {
    expect(selectedValueMetrics(["gasto", "deposito", "credito", "saldo", "resultado", "cpc"], (d) => !!d.perCampaign).map((d) => d.id)).toEqual(["gasto", "cpc"]);
  });
});
