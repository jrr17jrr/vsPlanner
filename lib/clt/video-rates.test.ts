import { describe, expect, it } from "vitest";
import { fmtRate, latestRates, parseRate, reportRateRows } from "./video-rates";
import { currentTotals, planAdResultUpdate, type CountedRow } from "./ad-result-update";

/** Taxa de Gancho / Taxa de Retenção INFORMADAS: sem cálculo, sem soma, sem média. */
describe("parseRate / fmtRate", () => {
  it("aceita decimais com vírgula ou ponto e com %", () => {
    expect(parseRate("35,75")).toBe(35.75);
    expect(parseRate("35,75%")).toBe(35.75);
    expect(parseRate(" 35.75 % ")).toBe(35.75);
    expect(parseRate("0")).toBe(0);
    expect(parseRate("100")).toBe(100);
    expect(parseRate(12.4)).toBe(12.4);
  });
  it("vazio = não informado; inválido/fora de 0–100/mais de 2 casas = recusado", () => {
    expect(parseRate("")).toBeNull();
    expect(parseRate("—")).toBeNull();
    expect(parseRate(null)).toBeNull();
    for (const bad of ["135", "-1", "35,755", "abc", "1.234,5"]) expect(parseRate(bad)).toBeUndefined();
    expect(parseRate(35.755)).toBeUndefined();
  });
  it("formata exatamente com 2 casas", () => {
    expect(fmtRate(35.75)).toBe("35,75%");
    expect(fmtRate(12.4)).toBe("12,40%");
    expect(fmtRate(null)).toBe("—");
  });
});

describe("valor atual do anúncio = registro mais recente (nunca soma nem média)", () => {
  const rows = [
    { entry_date: "2026-10-15", period_start: "2026-10-01", period_end: "2026-10-15", hook_rate: 30, hold_rate: null },
    { entry_date: "2026-10-31", period_start: "2026-10-16", period_end: "2026-10-31", hook_rate: 40, hold_rate: 12.5 },
    { entry_date: "2026-11-04", period_start: "2026-11-01", period_end: "2026-11-04", hook_rate: null, hold_rate: null, unknown: ["hook_rate", "hold_rate"] },
  ];
  it("cada taxa independente, do registro mais recente que a informou", () => {
    expect(latestRates(rows)).toEqual({
      hook_rate: { value: 40, start: "2026-10-16", end: "2026-10-31" },
      hold_rate: { value: 12.5, start: "2026-10-16", end: "2026-10-31" },
    });
  });
  it("currentTotals usa a mais recente (não 70 = 30 + 40, nem 35 de média)", () => {
    expect(currentTotals(rows as unknown as CountedRow[])).toMatchObject({ hook_rate: 40, hold_rate: 12.5 });
  });
  it("sem nenhuma taxa: não informado", () => {
    expect(latestRates([{ entry_date: "2026-10-01", hook_rate: null }])).toEqual({ hook_rate: null, hold_rate: null });
  });
});

describe("Atualizar resultados com taxas", () => {
  const rows = [{ entry_date: "2026-10-15", period_start: "2026-10-01", period_end: "2026-10-15", source: "import", spent_amount: 150, impressions: 40000, hook_rate: 30 }] as unknown as CountedRow[];
  it("substitui a taxa, valor absoluto no registro; nenhuma outra métrica entra", () => {
    const plan = planAdResultUpdate({ rows, updateRows: [], values: { hook_rate: 35.75, hold_rate: 12.4 }, today: "2026-11-04", reference: { start: "2026-10-16", end: "2026-10-31" } });
    if ("error" in plan) throw new Error(plan.error);
    expect(plan.values).toMatchObject({ hook_rate: 35.75, hold_rate: 12.4, spend: null, impressions: null, reach: null });
    expect(plan.delta).toEqual({ hook_rate: 35.75, hold_rate: 12.4 });
    expect(plan.previous).toEqual({ hook_rate: 30, hold_rate: null });
  });
  it("taxa menor que a anterior não é tratada como redução de total", () => {
    const plan = planAdResultUpdate({ rows, updateRows: [], values: { hook_rate: 20 }, today: "2026-11-04" });
    expect("error" in plan).toBe(false);
  });
  it("mesmo valor: nada muda; fora de 0–100: recusado", () => {
    expect(planAdResultUpdate({ rows, updateRows: [], values: { hook_rate: 30 }, today: "2026-11-04" })).toEqual({ error: "Nenhum valor mudou." });
    expect(planAdResultUpdate({ rows, updateRows: [], values: { hook_rate: 135 }, today: "2026-11-04" })).toMatchObject({ error: expect.stringMatching(/entre 0 e 100/) });
  });
  it("não exige visualizações de 3 s ou 15 s", () => {
    const plan = planAdResultUpdate({ rows: [], updateRows: [], values: { hold_rate: 9.99 }, today: "2026-11-04" });
    expect("error" in plan).toBe(false);
  });
});

describe("relatório: uma linha por anúncio, sem agregar", () => {
  it("dois anúncios da mesma campanha aparecem separados; registros fora do período não entram", () => {
    const rows = [
      { creative_id: "a1", campaign_id: "c1", period_start: "2026-10-01", period_end: "2026-10-15", hook_rate: 30, hold_rate: 10 },
      { creative_id: "a1", campaign_id: "c1", period_start: "2026-10-16", period_end: "2026-10-31", hook_rate: 35.75, hold_rate: null },
      { creative_id: "a2", campaign_id: "c1", period_start: "2026-10-01", period_end: "2026-10-31", hook_rate: 50, hold_rate: 20 },
      { creative_id: "a3", campaign_id: "c1", period_start: "2026-09-01", period_end: "2026-09-30", hook_rate: 99, hold_rate: 99 },
      { creative_id: "x", campaign_id: "outra-empresa", period_start: "2026-10-01", period_end: "2026-10-31", hook_rate: 1, hold_rate: 1 },
    ];
    const list = reportRateRows({ rows, campaigns: [{ id: "c1", name: "AIV | Vídeo" }], adNames: { a1: "Vídeo local", a2: "Vídeo praia", a3: "Antigo" }, inPeriod: (s) => s.start >= "2026-10-01" && s.end <= "2026-10-31" });
    expect(list.map((r) => [r.ad, r.hook?.value ?? null, r.hold?.value ?? null])).toEqual([
      ["Vídeo local", 35.75, 10],
      ["Vídeo praia", 50, 20],
    ]);
  });
});
