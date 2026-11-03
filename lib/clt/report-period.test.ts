import { describe, expect, it } from "vitest";
import { change, costPerMessage, periodBounds, periodMetrics, periodMonths, previousPeriod, reportPeriodDates, reportPeriodLabel, spanInPeriod, sumMetrics, validatePeriod, type ReportResult } from "./report-period";
import type { MessagingPoint } from "./history";

const res = (campaign_id: string, entry_date: string, over: Partial<ReportResult> = {}): ReportResult => ({ campaign_id, entry_date, spent_amount: 0, generated_revenue: 0, views: 0, impressions: 0, thruplays: 0, messages: 0, sales: 0, ...over });
const pt = (campaign_id: string, start: string, end: string, spend: number, messages: number): MessagingPoint => ({ campaign_id, company_id: "a", date: end, month: end.slice(0, 7), spend, messages, period_start: start, period_end: end });

describe("períodos do relatório", () => {
  it("datas inicial/final de cada tipo, inclusive fevereiro e virada de ano", () => {
    expect(periodBounds({ kind: "month", month: "2026-02" })).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(periodBounds({ kind: "month", month: "2028-02" })).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(periodBounds({ kind: "months", from: "2026-09", to: "2026-11" })).toEqual({ from: "2026-09-01", to: "2026-11-30" });
    expect(periodBounds({ kind: "year", year: 2026 })).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(reportPeriodDates({ kind: "days", from: "2026-10-10", to: "2026-10-25" })).toBe("10/10/2026 a 25/10/2026");
    expect(reportPeriodLabel({ kind: "months", from: "2026-09", to: "2026-11" })).toBe("Setembro de 2026 a Novembro de 2026");
  });

  it("período anterior equivalente (mesmo tipo e duração)", () => {
    expect(previousPeriod({ kind: "month", month: "2026-01" })).toEqual({ kind: "month", month: "2025-12" });
    expect(previousPeriod({ kind: "months", from: "2026-09", to: "2026-11" })).toEqual({ kind: "months", from: "2026-06", to: "2026-08" });
    expect(previousPeriod({ kind: "months", from: "2026-01", to: "2026-02" })).toEqual({ kind: "months", from: "2025-11", to: "2025-12" });
    expect(previousPeriod({ kind: "year", year: 2026 })).toEqual({ kind: "year", year: 2025 });
    expect(previousPeriod({ kind: "days", from: "2026-10-10", to: "2026-10-25" })).toEqual({ kind: "days", from: "2026-09-24", to: "2026-10-09" });
    expect(previousPeriod({ kind: "days", from: "2026-01-01", to: "2026-01-01" })).toEqual({ kind: "days", from: "2025-12-31", to: "2025-12-31" });
  });

  it("valida o seletor", () => {
    expect(validatePeriod({ kind: "days", from: "2026-10-25", to: "2026-10-10" })).toMatch(/final/);
    expect(validatePeriod({ kind: "days", from: "", to: "2026-10-10" })).toMatch(/inicial/);
    expect(validatePeriod({ kind: "months", from: "2026-09", to: "2026-11" })).toBeNull();
    expect(validatePeriod({ kind: "year", year: 1999 })).toMatch(/ano/);
  });

  it("meses cobertos (evolução) atravessando o ano", () => {
    expect(periodMonths({ kind: "months", from: "2025-11", to: "2026-02" })).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(periodMonths({ kind: "year", year: 2026 })).toHaveLength(12);
  });

  it("inclusão: meses pela data final; intervalo de dias só com período inteiro dentro", () => {
    const crossing = { start: "2026-09-25", end: "2026-10-05" };
    expect(spanInPeriod(crossing, { kind: "month", month: "2026-10" })).toBe("in");
    expect(spanInPeriod(crossing, { kind: "month", month: "2026-09" })).toBe("out");
    expect(spanInPeriod(crossing, { kind: "days", from: "2026-10-01", to: "2026-10-31" })).toBe("partial");
    expect(spanInPeriod(crossing, { kind: "days", from: "2026-09-20", to: "2026-10-10" })).toBe("in");
    expect(spanInPeriod({ start: "2026-10-31", end: "2026-10-31" }, { kind: "days", from: "2026-10-10", to: "2026-10-31" })).toBe("in");
  });
});

describe("indicadores no período", () => {
  const ids = new Set(["c1", "c2"]);
  const results = [
    res("c1", "2026-10-12", { spent_amount: 50, messages: 10, views: 100 }),
    // importado 25/09–05/10 (conta em outubro no mensal; parcial num intervalo de dias de outubro)
    res("c1", "2026-10-05", { spent_amount: 200, messages: 40, period_start: "2026-09-25" }),
    res("c2", "2026-10-20", { spent_amount: 30, sales: 2, generated_revenue: 500 }),
    res("c2", "2026-11-02", { spent_amount: 999 }),
    res("x", "2026-10-15", { spent_amount: 777 }),
  ];
  const messaging = [pt("c1", "2026-10-12", "2026-10-12", 50, 10), pt("c1", "2026-09-25", "2026-10-05", 200, 40), pt("c2", "2026-10-20", "2026-10-20", 30, 0)];
  const movements = [{ company_id: "a", movement_date: "2026-10-01", kind: "deposito", amount: 300 }, { company_id: "a", movement_date: "2026-11-01", kind: "credito", amount: 5 }];

  it("mês: igual ao relatório mensal (importado entra no mês do fim); outra campanha/empresa não entra", () => {
    const m = periodMetrics({ period: { kind: "month", month: "2026-10" }, campaignIds: ids, results, messaging, movements });
    expect([m.gasto, m.messages, m.sales, m.faturamento, m.resultado, m.deposito, m.credito, m.partial]).toEqual([280, 50, 2, 500, 220, 300, 0, 0]);
    // Custo por mensagem usa só os pontos de MENSAGENS recebidos (50 + 200 + 30), nunca o gasto total.
    expect([m.msgSpend, m.msgMessages]).toEqual([280, 50]);
  });

  it("intervalo de dias: não rateia — período importado parcial fica de fora e é avisado", () => {
    const m = periodMetrics({ period: { kind: "days", from: "2026-10-10", to: "2026-10-25" }, campaignIds: ids, results, messaging, movements });
    expect([m.gasto, m.messages, m.views, m.partial, m.deposito]).toEqual([80, 10, 100, 0, 0]);
    const all = periodMetrics({ period: { kind: "days", from: "2026-10-01", to: "2026-10-31" }, campaignIds: ids, results, messaging, movements });
    expect([all.gasto, all.partial]).toEqual([80, 1]);
    expect(costPerMessage(all)).toBe(80 / 10);
  });

  it("intervalo de meses e ano somam sem duplicar", () => {
    const m = periodMetrics({ period: { kind: "months", from: "2026-10", to: "2026-11" }, campaignIds: ids, results, messaging });
    expect(m.gasto).toBe(1279);
    expect(periodMetrics({ period: { kind: "year", year: 2026 }, campaignIds: ids, results, messaging }).gasto).toBe(1279);
  });

  it("planejado por início da campanha; soma de empresas; comparação", () => {
    const m = periodMetrics({ period: { kind: "month", month: "2026-10" }, campaignIds: ids, results: [], messaging: [], campaigns: [{ id: "c1", company_id: "a", starts_on: "2026-10-03", planned_amount: 400 }, { id: "c9", company_id: "a", starts_on: "2026-09-30", planned_amount: 99 }] });
    expect(m.planned).toBe(400);
    expect(sumMetrics([m, m]).planned).toBe(800);
    expect(change(150, 100)).toEqual({ current: 150, previous: 100, diff: 50, pct: 50 });
    expect(change(10, 0).pct).toBeNull();
    expect(change(null, 5).diff).toBeNull();
  });
});
