import { describe, expect, it } from "vitest";
import { monthReference, planAdResultUpdate, validateReference, type CountedRow } from "./ad-result-update";
import { mergeAdLevelResults, type PeriodMetricFullRow } from "./ad-metrics";
import { mergePeriodResults, periodResultsToEntries } from "./period-results";
import { campaignRunSpan, campaignsInPeriod, costPerMessage, periodMetrics, roas, type ReportPeriod } from "./report-period";

/**
 * Data de REFERÊNCIA dos resultados × data do registro, e filtros por
 * período (campanhas em execução, indicadores), no caso real da IG Predial.
 */
const TODAY = "2026-11-03";
const imp = (over: Partial<PeriodMetricFullRow> = {}): PeriodMetricFullRow => ({
  id: "imp", campaign_id: "cabo", ad_set_id: "s1", creative_id: "a1", period_start: "2026-09-30", period_end: "2026-10-29",
  spend: 206.22, conversations: 21, sales: 37, revenue: 9360, impressions: 17981, reach: 8167, link_clicks: null, leads: null, source: "import", ...over,
});
const counted = (rows: PeriodMetricFullRow[]) => mergeAdLevelResults([], rows).rows as unknown as CountedRow[];
const entries = (rows: PeriodMetricFullRow[]) => periodResultsToEntries(mergePeriodResults([], rows).imported).map((e) => ({ ...e, period_start: e.id.split(":")[2] }));
const month = (m: string): ReportPeriod => ({ kind: "month", month: m });
const metrics = (rows: PeriodMetricFullRow[], p: ReportPeriod) => periodMetrics({ period: p, campaignIds: new Set(["cabo"]), results: entries(rows), messaging: [] });

describe("período de referência na atualização", () => {
  it("atualização feita em novembro referente a outubro: grava em outubro (01/10 a 31/10)", () => {
    const ref = monthReference("2026-10", TODAY);
    expect(ref).toEqual({ start: "2026-10-01", end: "2026-10-31" });
    const plan = planAdResultUpdate({ rows: counted([imp()]), updateRows: [], values: { sales: 66, revenue: 16860 }, today: TODAY, reference: ref });
    if ("error" in plan) throw new Error(plan.error);
    expect(plan).toMatchObject({ mode: "novo_periodo", periodStart: "2026-10-01", periodEnd: "2026-10-31", delta: { sales: 29, revenue: 7500 } });
    const rows = [imp(), { ...imp({ id: "u1", period_start: plan.periodStart, period_end: plan.periodEnd, source: "manual_update" }), spend: null, conversations: null, sales: 29, revenue: 7500, impressions: null, reach: null }];
    const oct = metrics(rows, month("2026-10")), nov = metrics(rows, month("2026-11")), all = metrics(rows, { kind: "all" });
    expect([oct.sales, oct.faturamento, oct.gasto, oct.messages]).toEqual([66, 16860, 206.22, 21]);
    expect([nov.sales, nov.faturamento, nov.gasto]).toEqual([0, 0, 0]);
    expect([all.sales, all.faturamento]).toEqual([66, 16860]);
  });

  it("mês atual vai até hoje (nunca termina no futuro)", () => {
    expect(monthReference("2026-11", TODAY)).toEqual({ start: "2026-11-01", end: TODAY });
  });

  it("recusa período dentro da importação (o importado prevaleceria), futuro ou invertido", () => {
    expect(validateReference({ start: "2026-10-15", end: "2026-10-15" }, TODAY, counted([imp()]))).toMatch(/dentro da importação de 30\/09\/2026 a 29\/10\/2026/);
    expect(validateReference({ start: "2026-11-04", end: "2026-11-04" }, TODAY, [])).toMatch(/futuro/);
    expect(validateReference({ start: "2026-10-10", end: "2026-10-01" }, TODAY, [])).toMatch(/antes da inicial/);
    expect(validateReference({ start: "2026-10-01", end: "2026-10-31" }, TODAY, counted([imp()]))).toBeNull();
  });

  it("mesmo período escolhido de novo: ajusta a mesma linha; reduzir em outro período é recusado", () => {
    const rows = [imp(), { ...imp({ id: "u1", period_start: "2026-10-01", period_end: "2026-10-31", source: "manual_update" }), spend: null, conversations: null, sales: 29, revenue: 7500, impressions: null, reach: null }];
    const updateRows = [{ id: "u1", period_start: "2026-10-01", period_end: "2026-10-31", sales: 29, revenue: 7500 }];
    const same = planAdResultUpdate({ rows: counted(rows), updateRows, values: { sales: 70 }, today: TODAY, reference: { start: "2026-10-01", end: "2026-10-31" } });
    expect(same).toMatchObject({ mode: "ajuste", metricId: "u1", values: { sales: 33, revenue: 7500 } });
    const other = planAdResultUpdate({ rows: counted(rows), updateRows, values: { sales: 60 }, today: TODAY, reference: { start: "2026-11-01", end: TODAY } });
    expect("error" in other && other.error).toMatch(/MESMO período/);
  });
});

describe("campanhas e indicadores por período", () => {
  const campaigns = [
    { id: "cabo", starts_on: "2026-10-15", ends_on: "2026-10-29", campaign_status: "finalizada" },
    { id: "cruza", starts_on: "2026-10-25", ends_on: "2026-11-05", campaign_status: "finalizada" },
    { id: "ativa", starts_on: "2026-09-01", ends_on: null, campaign_status: "ativa" },
    { id: "antiga", starts_on: "2026-08-01", ends_on: null, campaign_status: "finalizada" },
    { id: "set", starts_on: "2026-09-10", ends_on: "2026-09-20", campaign_status: "finalizada" },
  ];
  const ids = (p: ReportPeriod) => campaignsInPeriod(campaigns, p, TODAY).map((c) => c.id).sort();

  it("novembro: só as que estiveram em execução em novembro (a que atravessa meses aparece)", () => {
    expect(ids(month("2026-11"))).toEqual(["ativa", "cruza"]);
  });
  it("outubro: inclui a que começou em outubro e terminou em novembro", () => {
    expect(ids(month("2026-10"))).toEqual(["ativa", "cabo", "cruza"]);
  });
  it("empresa só com campanhas finalizadas no mês anterior: 0 no mês atual", () => {
    expect(campaignsInPeriod(campaigns.filter((c) => c.id === "cabo"), month("2026-11"), TODAY)).toHaveLength(0);
  });
  it("sem data final: ativa vai até hoje; finalizada fica só no dia de início (não vira 'ativa para sempre')", () => {
    expect(campaignRunSpan(campaigns[2], TODAY)).toEqual({ start: "2026-09-01", end: TODAY });
    expect(campaignRunSpan(campaigns[3], TODAY)).toEqual({ start: "2026-08-01", end: "2026-08-01" });
  });
  it("todos os períodos: todas as campanhas", () => {
    expect(ids({ kind: "all" })).toHaveLength(5);
  });

  it("campanha que atravessa meses: investimento de cada mês pela data de referência (sem contar em dobro)", () => {
    const rows = [
      imp({ id: "o", campaign_id: "cabo", creative_id: "x1", period_start: "2026-10-25", period_end: "2026-10-31", spend: 70, conversations: 7, sales: 0, revenue: 0 }),
      imp({ id: "n", campaign_id: "cabo", creative_id: "x1", period_start: "2026-11-01", period_end: "2026-11-05", spend: 50, conversations: 5, sales: 0, revenue: 0 }),
    ];
    expect([metrics(rows, month("2026-10")).gasto, metrics(rows, month("2026-11")).gasto, metrics(rows, { kind: "all" }).gasto]).toEqual([70, 50, 120]);
  });

  it("ROAS e custo por mensagem sem divisão por zero; métricas extras somadas", () => {
    const m = metrics([imp({ link_clicks: 40, leads: 3 })], month("2026-10"));
    expect(roas(m)).toBeCloseTo(9360 / 206.22);
    expect([m.reach, m.linkClicks, m.leads]).toEqual([8167, 40, 3]);
    const empty = metrics([imp()], month("2026-11"));
    expect([roas(empty), costPerMessage(empty), empty.gasto]).toEqual([null, null, 0]);
  });
});
