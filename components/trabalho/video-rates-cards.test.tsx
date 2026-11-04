import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LevelMetricSections } from "./result-metric-sections";
import { levelTotals } from "@/lib/clt/result-metrics";
import { latestRates } from "@/lib/clt/video-rates";

/** Telas de anúncio (taxas informadas) × conjunto/campanha (sem somar percentuais). */
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const rows = [
  { entry_date: "2026-10-15", period_start: "2026-10-01", period_end: "2026-10-15", spent_amount: 150, impressions: 40000, hook_rate: 30, unknown: ["hold_rate"] },
  { entry_date: "2026-10-31", period_start: "2026-10-16", period_end: "2026-10-31", spent_amount: 0, hook_rate: 35.75, hold_rate: 12.4 },
];

describe("cards de vídeo", () => {
  it("anúncio: mostra as taxas informadas do registro mais recente", () => {
    const t = text(renderToStaticMarkup(<LevelMetricSections t={levelTotals(rows)} rates={latestRates(rows)} />));
    expect(t).toContain("Taxa de Gancho (16/10/2026 a 31/10/2026) 35,75%");
    expect(t).toContain("Taxa de Retenção (16/10/2026 a 31/10/2026) 12,40%");
    expect(t).not.toContain("65,75%"); // nunca soma
  });
  it("conjunto/campanha: nenhuma taxa agregada, só a observação", () => {
    const t = text(renderToStaticMarkup(<LevelMetricSections t={levelTotals(rows)} />));
    expect(t).not.toContain("35,75%");
    expect(t).toContain("informadas por anúncio e não são somadas");
  });
});
