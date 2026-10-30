import { describe, expect, it } from "vitest";
import { mergePeriodResults } from "./period-results";

describe("mergePeriodResults", () => {
  const metrics = [
    { campaign_id: "c1", period_start: "2026-09-30", period_end: "2026-10-29", spend: "26.46", conversations: 3, sales: null, revenue: null, impressions: null },
    { campaign_id: "c1", period_start: "2026-09-30", period_end: "2026-10-29", spend: "19.47", conversations: null, sales: null, revenue: null, impressions: null },
    { campaign_id: "c2", period_start: "2026-10-01", period_end: "2026-10-31", spend: 100, conversations: 10, sales: 2, revenue: "500.00", impressions: 1000 },
  ];

  it("soma anúncios por campanha/período, null não soma", () => {
    const r = mergePeriodResults([], metrics);
    expect(r.imported).toHaveLength(2);
    expect(r.imported[0]).toMatchObject({ campaign_id: "c1", entry_date: "2026-10-29", spent_amount: 45.93, messages: 3, sales: 0 });
    expect(r.crossMonthPeriods).toBe(1);
  });

  it("descarta lançamento antigo da mesma campanha dentro do período (não conta duas vezes)", () => {
    const legacy = [
      { campaign_id: "c1", entry_date: "2026-10-15", spent_amount: 45 },
      { campaign_id: "c1", entry_date: "2026-11-02", spent_amount: 10 },
      { campaign_id: "c3", entry_date: "2026-10-15", spent_amount: 7 },
    ];
    const r = mergePeriodResults(legacy, metrics);
    expect(r.legacy.map(x => x.spent_amount)).toEqual([10, 7]);
    expect(r.excludedLegacy).toBe(1);
  });
});
