import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isLegacyAudienceFile, isLegacyCampaignFile } from "./legacy-detect";
import { parseImportInput } from "./parse";

const fixture = (name: string) => readFileSync(`dados-importacao/ig-predial/${name}`, "utf8");

describe("roteamento dos importadores da página da empresa", () => {
  it("arquivos novos da IG Predial vão para o importador inteligente", () => {
    for (const f of ["ig_predial_publicos.json", "ig_predial_campanhas.json"]) {
      expect(isLegacyAudienceFile(fixture(f))).toBe(false);
      expect(isLegacyCampaignFile(fixture(f))).toBe(false);
    }
  });

  it("ig_predial_publicos.json: 10 públicos reconhecidos (audiences)", () => {
    const r = parseImportInput(fixture("ig_predial_publicos.json"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.bundle.audiences).toHaveLength(10);
    expect(r.bundle.campaigns).toHaveLength(0);
  });

  it("ig_predial_campanhas.json: campaigns/ad_sets/ads com audience_external_key", () => {
    const r = parseImportInput(fixture("ig_predial_campanhas.json"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.bundle.campaigns).toHaveLength(7);
    const sets = r.bundle.campaigns.flatMap(c => c.adSets);
    expect(sets).toHaveLength(8);
    expect(sets.flatMap(s => s.ads)).toHaveLength(8);
    expect(sets.every(s => !!s.audienceKey)).toBe(true);
  });

  it("formato antigo exato continua no fluxo antigo", () => {
    expect(isLegacyAudienceFile('{"publicos":[{"nome":"A","tipo":"salvo"}]}')).toBe(true);
    expect(isLegacyCampaignFile('{"campanhas":[{"nome":"C"}]}')).toBe(true);
    // Arquivo antigo com públicos + campanhas: o de campanhas trata os dois.
    expect(isLegacyAudienceFile('{"publicos":[{"nome":"A"}],"campanhas":[{"nome":"C"}]}')).toBe(false);
  });

  it("texto, JSON inválido e formato novo não são tratados como antigo", () => {
    expect(isLegacyAudienceFile("Público salvo: Cabo Frio")).toBe(false);
    expect(isLegacyAudienceFile("{publicos")).toBe(false);
    expect(isLegacyAudienceFile('{"schema_version":"1.0","publicos":[{"nome":"A"}]}')).toBe(false);
    expect(isLegacyCampaignFile('{"campaigns":[],"campanhas":[{"nome":"C"}]}')).toBe(false);
  });
});
