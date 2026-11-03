import { describe, expect, it } from "vitest";
import { followerGrowth, followerPeriodSummary, followerSnapshot, formatFollowerDiff, formatFollowerPct, monthBounds, type FollowerRecord } from "./followers";

const rec = (id: string, followers: number, recorded_at: string, company_id = "a"): FollowerRecord => ({ id, company_id, followers, recorded_at });

describe("seguidores do Instagram", () => {
  it("233 → 234: +1 (+0,43%)", () => {
    const s = followerSnapshot([rec("1", 233, "2026-11-02T13:00:00Z"), rec("2", 234, "2026-11-03T13:00:00Z")]);
    expect(s.current?.followers).toBe(234);
    expect(s.previous?.followers).toBe(233);
    expect(formatFollowerDiff(s.growth!.diff)).toBe("+1");
    expect(formatFollowerPct(s.growth!.pct)).toBe("+0,43%");
  });

  it("queda aparece como negativa", () => {
    const g = followerGrowth(230, 234);
    expect(formatFollowerDiff(g.diff)).toBe("−4");
    expect(formatFollowerPct(g.pct)).toBe("−1,71%");
  });

  it("um registro só: sem anterior nem crescimento; base 0 sem percentual", () => {
    expect(followerSnapshot([rec("1", 233, "2026-11-02T13:00:00Z")]).growth).toBeNull();
    expect(followerGrowth(10, 0).pct).toBeNull();
    expect(formatFollowerPct(null)).toBe("—");
  });

  it("relatório mensal: início = último antes do mês, final = último do mês (233 → 250, +17, +7,30%)", () => {
    const records = [
      rec("o1", 220, "2026-10-10T15:00:00Z"),
      rec("o2", 233, "2026-10-31T20:00:00Z"),
      rec("n1", 240, "2026-11-10T15:00:00Z"),
      rec("n2", 250, "2026-11-28T15:00:00Z"),
      rec("d1", 260, "2026-12-02T15:00:00Z"),
    ];
    const { from, to } = monthBounds("2026-11");
    const s = followerPeriodSummary(records, from, to);
    expect([s.start?.followers, s.end?.followers]).toEqual([233, 250]);
    expect(s.growth?.diff).toBe(17);
    expect(formatFollowerPct(s.growth!.pct)).toBe("+7,30%");
  });

  it("usa o fuso de São Paulo (23:30 de 31/10 local ainda é outubro)", () => {
    const s = followerPeriodSummary([rec("a", 100, "2026-11-01T02:30:00Z"), rec("b", 110, "2026-11-05T12:00:00Z")], "2026-11-01", "2026-11-30");
    expect(s.start?.id).toBe("a"); // registro de outubro serve de início
    expect(s.growth?.diff).toBe(10);
  });

  it("sem histórico suficiente não inventa número", () => {
    const { from, to } = monthBounds("2026-11");
    expect(followerPeriodSummary([], from, to)).toMatchObject({ start: null, end: null, growth: null, enough: false });
    const one = followerPeriodSummary([rec("1", 233, "2026-11-10T15:00:00Z")], from, to);
    expect(one).toMatchObject({ enough: false, growth: null });
    expect(one.end?.followers).toBe(233);
    // Só registros antigos: nada no período → sem final.
    expect(followerPeriodSummary([rec("1", 233, "2026-09-10T15:00:00Z")], from, to).end).toBeNull();
  });

  it("primeiro registro dentro do mês vira o início quando não há anterior", () => {
    const s = followerPeriodSummary([rec("1", 233, "2026-11-03T15:00:00Z"), rec("2", 250, "2026-11-20T15:00:00Z")], "2026-11-01", "2026-11-30");
    expect(s.growth?.diff).toBe(17);
  });

  it("monthBounds respeita meses curtos", () => {
    expect(monthBounds("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });
});
