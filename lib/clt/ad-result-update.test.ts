import { describe, expect, it } from "vitest";
import { currentTotals, planAdResultUpdate, primaryMetrics, type CountedRow, type UpdatePlan } from "./ad-result-update";
import { mergeAdLevelResults, withImportedCampaignTotals, type PeriodMetricFullRow } from "./ad-metrics";
import { mergePeriodResults, periodResultsToEntries } from "./period-results";
import { buildHistoryFacts, messagingPoints, summarize } from "./history";
import { periodMetrics as reportMetrics } from "./report-period";
import type { CltAdLevelResult } from "@/types/database.types";

const TODAY = "2026-11-04";
const period = (over: Partial<PeriodMetricFullRow>): PeriodMetricFullRow => ({
  id: "p1", campaign_id: "c1", ad_set_id: "s1", creative_id: "a1", period_start: "2026-10-01", period_end: "2026-10-31",
  spend: null, conversations: null, sales: null, revenue: null, impressions: null, reach: null, link_clicks: null, leads: null, source: "import", ...over,
});
/** Aplica o plano como o banco faria (insere linha nova ou ajusta a existente). */
function apply(rows: PeriodMetricFullRow[], plan: UpdatePlan, id = `u${rows.length + 1}`): PeriodMetricFullRow[] {
  const v = plan.values;
  const row = { campaign_id: "c1", ad_set_id: "s1", creative_id: "a1", period_start: plan.periodStart, period_end: plan.periodEnd, source: "manual_update",
    spend: v.spend, conversations: v.conversations, sales: v.sales, revenue: v.revenue, impressions: v.impressions, reach: v.reach, link_clicks: v.link_clicks, leads: v.leads, views: v.views, thruplays: v.thruplays, engagements: v.engagements };
  return plan.metricId ? rows.map((r) => (r.id === plan.metricId ? { ...r, ...row } : r)) : [...rows, { id, ...row }];
}
const adRows = (period: PeriodMetricFullRow[], legacy: CltAdLevelResult[] = []) => mergeAdLevelResults(legacy, period).rows.filter((r) => r.creative_id === "a1") as unknown as CountedRow[];
const updates = (rows: PeriodMetricFullRow[]) => rows.filter((r) => r.source === "manual_update").map((r) => ({ ...r, id: r.id })) as never[];
function update(rows: PeriodMetricFullRow[], values: Record<string, number | null>, today = TODAY) {
  const plan = planAdResultUpdate({ rows: adRows(rows), updateRows: updates(rows), values, today, campaignStart: "2026-10-01" });
  if ("error" in plan) throw new Error(plan.error);
  return { plan, rows: apply(rows, plan) };
}

describe("Atualizar resultados: novos totais substituem os anteriores", () => {
  const base = [period({ spend: 100, conversations: 10, sales: 2, revenue: 500 })];

  it("exemplo do pedido: 100/10/2/500 → 150/15/4/900 (grava só a diferença, sem somar em dobro)", () => {
    const { plan, rows } = update(base, { spend: 150, conversations: 15, sales: 4, revenue: 900 });
    expect(plan).toMatchObject({ mode: "novo_periodo", periodStart: "2026-11-01", periodEnd: TODAY });
    expect(plan.delta).toEqual({ spend: 50, conversations: 5, sales: 2, revenue: 400 });
    expect(plan.previous).toEqual({ spend: 100, conversations: 10, sales: 2, revenue: 500 });
    expect(currentTotals(adRows(rows))).toMatchObject({ spend: 150, conversations: 15, sales: 4, revenue: 900 });
  });

  it("não informado continua não informado; preencher depois passa a contar", () => {
    const { rows } = update(base, { spend: 150 });
    expect(currentTotals(adRows(rows))).toMatchObject({ spend: 150, conversations: 10, thruplays: null, views: null });
    const again = update(rows, { thruplays: 300 });
    expect(currentTotals(adRows(again.rows)).thruplays).toBe(300);
  });

  it("atualizar duas vezes no mesmo dia ajusta a mesma linha (não cria outra)", () => {
    const first = update(base, { spend: 150 });
    const second = update(first.rows, { spend: 180 });
    expect(second.plan).toMatchObject({ mode: "ajuste", metricId: "u2" });
    expect(second.rows.filter((r) => r.source === "manual_update")).toHaveLength(1);
    expect(currentTotals(adRows(second.rows)).spend).toBe(180);
  });

  it("dias seguintes: novo período a partir do dia seguinte ao último dado", () => {
    const d1 = update(base, { spend: 150 }, "2026-11-04");
    const d2 = update(d1.rows, { spend: 200 }, "2026-11-10");
    expect(d2.plan).toMatchObject({ mode: "novo_periodo", periodStart: "2026-11-05", periodEnd: "2026-11-10" });
    expect(d2.plan.delta).toEqual({ spend: 50 });
    expect(currentTotals(adRows(d2.rows)).spend).toBe(200);
  });

  it("correção para baixo ajusta a última atualização manual; abaixo do importado é recusada", () => {
    const d1 = update(base, { spend: 150 }, "2026-11-04");
    const fix = update(d1.rows, { spend: 120 }, "2026-11-10");
    expect(fix.plan).toMatchObject({ mode: "ajuste", metricId: "u2" });
    expect(currentTotals(adRows(fix.rows)).spend).toBe(120);
    const below = planAdResultUpdate({ rows: adRows(fix.rows), updateRows: updates(fix.rows), values: { spend: 90 }, today: "2026-11-10" });
    expect("error" in below && below.error).toMatch(/menor do que o já registrado/);
    expect("error" in planAdResultUpdate({ rows: adRows(base), updateRows: [], values: { spend: 90 }, today: TODAY })).toBe(true);
  });

  it("sem dados: o primeiro período começa no início da campanha; nada mudou = erro", () => {
    const plan = planAdResultUpdate({ rows: [], updateRows: [], values: { spend: 80 }, today: TODAY, campaignStart: "2026-10-20" });
    expect(plan).toMatchObject({ periodStart: "2026-10-20", periodEnd: TODAY, values: { spend: 80 } });
    expect(planAdResultUpdate({ rows: adRows(base), updateRows: [], values: { spend: 100 }, today: TODAY })).toEqual({ error: "Nenhum valor mudou." });
    expect("error" in planAdResultUpdate({ rows: [], updateRows: [], values: { conversations: 1.5 }, today: TODAY })).toBe(true);
  });

  it("campos conforme o tipo: mensagens mostra conversas/vendas/faturamento; ThruPlay mostra visualizações/ThruPlays", () => {
    expect(primaryMetrics("mensagens")).toEqual(["spend", "conversations", "sales", "revenue", "impressions", "reach"]);
    expect(primaryMetrics("visualizacoes")).toEqual(["spend", "views", "thruplays", "impressions", "reach"]);
  });
});

describe("consolidação: anúncio → conjunto → campanha → empresa → relatórios, sem dupla contagem", () => {
  const base = [
    period({ spend: 100, conversations: 10, sales: 2, revenue: 500 }),
    period({ id: "p2", creative_id: "a2", spend: 40, conversations: 4 }),
  ];
  const { rows } = update(base, { spend: 150, conversations: 15, sales: 4, revenue: 900 });
  const legacyCampaignEntry = { campaign_id: "c1", entry_date: TODAY, spent_amount: 7 };

  it("campanha (painel) e relatórios somam anúncios uma vez só; lançamento antigo da campanha NÃO some", () => {
    const [campaign] = withImportedCampaignTotals([{ id: "c1", spent_amount: 0, messages: 0, sales: 0 }], rows);
    expect(campaign).toMatchObject({ spent_amount: 190, messages: 19, sales: 4 });
    const merged = mergePeriodResults([legacyCampaignEntry], rows);
    expect(merged.legacy).toHaveLength(1); // atualização manual não esconde o lançamento antigo
    const entries = periodResultsToEntries(merged.imported);
    expect(entries.reduce((a, e) => a + e.spent_amount, 0)).toBe(190);
    expect(entries.find((e) => e.id.startsWith("update:"))).toMatchObject({ spent_amount: 50, messages: 5, entry_date: TODAY });
  });

  it("relatório mensal: outubro continua igual; a diferença entra em novembro", () => {
    const entries = periodResultsToEntries(mergePeriodResults([], rows).imported).map((e) => ({ ...e, period_start: e.id.split(":")[2] }));
    const oct = reportMetrics({ period: { kind: "month", month: "2026-10" }, campaignIds: new Set(["c1"]), results: entries, messaging: [] });
    const nov = reportMetrics({ period: { kind: "month", month: "2026-11" }, campaignIds: new Set(["c1"]), results: entries, messaging: [] });
    expect([oct.gasto, nov.gasto]).toEqual([140, 50]);
  });

  it("importação posterior que cobre a atualização manual prevalece (sem somar duas vezes)", () => {
    const reimported = [...rows, period({ id: "p3", period_start: "2026-10-01", period_end: "2026-11-10", spend: 160, conversations: 16 })];
    const totals = currentTotals(adRows(reimported.filter((r) => r.id !== "p1")));
    expect(totals.spend).toBe(160);
    const [campaign] = withImportedCampaignTotals([{ id: "c1", spent_amount: 0, messages: 0, sales: 0 }], reimported.filter((r) => r.id !== "p1"));
    expect(campaign.spent_amount).toBe(200); // 160 (a1 importado) + 40 (a2) — a atualização coberta não conta
  });

  it("custo por mensagem: só conjuntos de mensagens; ThruPlay/engajamento ficam fora", () => {
    const input = {
      campaigns: [{ id: "c1", company_id: "e1", name: "C", objective: "mensagens", starts_on: "2026-10-01", ends_on: "2026-11-30" }],
      adSets: [{ id: "s1", campaign_id: "c1", name: "Msg", result_type: "mensagens" }, { id: "s2", campaign_id: "c1", name: "Video", result_type: "visualizacoes" }],
      campaignEntries: [], adLevelEntries: [],
      periodMetrics: [...rows, period({ id: "p9", ad_set_id: "s2", creative_id: "v1", spend: 300, conversations: null, thruplays: 900 } as Partial<PeriodMetricFullRow>)] as never,
    };
    const facts = buildHistoryFacts(input).facts;
    expect(facts.filter((f) => f.source === "atualizacao")).toHaveLength(1);
    const s = summarize(facts);
    expect(s.messagingSpend).toBe(190);
    expect(s.messagingMessages).toBe(19);
    expect(s.totals.thruplays).toBe(900);
    expect(messagingPoints(facts).reduce((a, p) => a + p.spend, 0)).toBe(190);
  });

  it("intervalo de dias: a atualização só entra se o período inteiro estiver dentro (sem ratear)", () => {
    const entries = periodResultsToEntries(mergePeriodResults([], rows).imported).map((e) => ({ ...e, period_start: e.id.split(":")[2] }));
    const inside = reportMetrics({ period: { kind: "days", from: "2026-11-01", to: "2026-11-30" }, campaignIds: new Set(["c1"]), results: entries, messaging: [] });
    const partial = reportMetrics({ period: { kind: "days", from: "2026-11-03", to: "2026-11-30" }, campaignIds: new Set(["c1"]), results: entries, messaging: [] });
    expect([inside.gasto, partial.gasto, partial.partial]).toEqual([50, 0, 1]);
  });
});
