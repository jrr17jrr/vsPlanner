import { describe, expect, it } from "vitest";
import { SMART_EXAMPLES } from "./examples";
import { parseImportInput } from "./parse";
import { validateImport } from "./validate";
import type { ExistingSnapshot } from "./types";

const snapshot = (): ExistingSnapshot => ({
  company: { id: "co", name: "SGIV" },
  audiences: [], campaigns: [], adSets: [], ads: [], legacyResultCampaignIds: [], periodMetrics: [],
});

describe("exemplos da Central (campanhas, públicos, resultados)", () => {
  for (const [type, ex] of Object.entries(SMART_EXAMPLES)) {
    for (const [format, content] of Object.entries(ex)) {
      it(`${type} em ${format}: lê e valida sem erro`, () => {
        const r = parseImportInput(content);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.detected).toBe(format === "json" ? "json" : "text");
        const p = validateImport(r.bundle, snapshot(), { today: "2026-11-02" });
        expect(p.issues.filter((i) => i.level === "error").map((i) => `${i.path}: ${i.message}`)).toEqual([]);
        if (type === "publicos") expect(p.audiences.length).toBeGreaterThanOrEqual(2);
        else expect(p.campaigns.length).toBe(1);
      });
    }
  }
});
