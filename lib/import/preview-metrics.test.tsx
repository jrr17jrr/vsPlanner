import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { parseImportInput } from "./parse";
import { validateImport, type ImportPreview } from "./validate";
import type { ExistingSnapshot } from "./types";

/**
 * Prévia da Central de Importação com as métricas detalhadas (caso AIV,
 * 01/10 a 30/10/2026): mostra TODAS as informadas, nunca campos ausentes.
 */
vi.mock("@/lib/supabase/clt-import-actions", () => ({ previewSmartImportAction: async () => ({}), confirmSmartImportAction: async () => ({}) }));
const { MetricsLine, PeriodUpdatePanel } = await import("@/components/trabalho/smart-importer");

const TEXT = `Empresa: AIV
Período: 01/10/2026 a 30/10/2026
Campanha: AIV | Engajamento | video 14/10/26
Anúncio: AIV | Vídeo local | Engajamento

Interações: 2580
Reações à publicação: 2543
Comentários: 5
Compartilhamentos: 13
Novos seguidores: 1
Cliques no link: 16
ThruPlays: 1679
Visualizações de 75%: 1180
Visualizações de 100%: 863`;
const LABELS = ["Interações", "Reações à publicação", "Comentários", "Compartilhamentos", "Novos seguidores", "Cliques no link", "ThruPlays", "Visualizações de 75%", "Visualizações de 100%"];

const snap = (campaignName = "AIV | Engajamento | video 14/10/26"): ExistingSnapshot => ({
  company: { id: "co", name: "AIV" }, audiences: [],
  campaigns: [{ id: "cmp-1", name: campaignName, meta_campaign_id: null }],
  adSets: [{ id: "set-a", campaign_id: "cmp-1", name: "Público local", meta_adset_id: null }],
  ads: [{ id: "ad-1", ad_set_id: "set-a", name: "AIV | Vídeo local | Engajamento", meta_ad_id: null }],
  legacyResultCampaignIds: [], periodMetrics: [],
});
const preview = (s = snap(), text = TEXT) => {
  const p = parseImportInput(text);
  if (!p.ok) throw new Error(p.error);
  return validateImport(p.bundle, s, { today: "2026-11-04" });
};
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("métricas do anúncio na prévia", () => {
  const ad = preview().campaigns[0].adSets[0].ads[0];

  it("mostra as 9 métricas informadas, com valores", () => {
    const t = text(renderToStaticMarkup(<MetricsLine ad={ad} />));
    for (const l of LABELS) expect(t).toContain(l);
    for (const v of ["2.580", "2.543", "1.679", "1.180", "863"]) expect(t).toContain(v);
    expect(t).toContain("Campos que serão atualizados neste anúncio (9)");
  });
  it("não mostra campos ausentes (investimento, conversas…) nem 'não informado'", () => {
    const t = text(renderToStaticMarkup(<MetricsLine ad={ad} />));
    expect(t).not.toContain("Investimento");
    expect(t).not.toContain("Conversas");
    expect(t).not.toContain("Alcance");
    expect(t).not.toContain("não informado");
  });
});

describe("painel de atualização do registro", () => {
  it("lista o registro que será atualizado, as mudanças e as informadas que já estão iguais", () => {
    const p: ImportPreview = {
      ...preview(),
      periodTargets: [{
        creativeId: "ad-1", campaign: "AIV | Engajamento | video 14/10/26", adSet: "Público local", adSetAutoIdentified: true, ad: "AIV | Vídeo local | Engajamento",
        kind: "update_row", message: null, target: { id: "pm-1", start: "2026-10-01", end: "2026-10-30", chosen: false }, options: [],
        changes: [{ key: "engagements", label: "Interações", before: null, after: 2580 }, { key: "link_clicks", label: "Cliques no link", before: 10, after: 16 }],
        same: [{ key: "comments", label: "Comentários", value: 5 }], unchanged: false,
      }],
    };
    const t = text(renderToStaticMarkup(<PeriodUpdatePanel preview={p} targets={{}} onChoose={() => {}} onUsePeriod={() => {}} busy={false} />));
    expect(t).toContain("Atualiza o registro de 01/10/2026 a 30/10/2026");
    expect(t).toContain("Interações não informado 2.580");
    expect(t).toContain("Cliques no link 10 16");
    expect(t).toContain("Informadas e já iguais (não mudam): Comentários 5");
    expect(t).not.toContain("Investimento");
  });
  it("com erros (detalhes do banco indisponíveis), ainda mostra todas as métricas informadas", () => {
    const p = preview();
    const t = text(renderToStaticMarkup(<PeriodUpdatePanel preview={{ ...p, periodTargets: [] }} targets={{}} onChoose={() => {}} onUsePeriod={() => {}} busy={false} />));
    for (const l of LABELS) expect(t).toContain(l);
  });
});

describe("sem campanha duplicada por diferença de nome", () => {
  it("nome que difere só em pontuação/espaços → mesma campanha (atualização, nada criado)", () => {
    const p = preview(snap("AIV - Engajamento - video 14/10/26"));
    expect(p.mode).toBe("period_update");
    expect(p.campaigns[0]).toMatchObject({ action: "update", existingId: "cmp-1", name: "AIV - Engajamento - video 14/10/26" });
    expect(p.counts.campaigns.create + p.counts.adSets.create + p.counts.ads.create).toBe(0);
  });
  it("nome só parecido → aviso que exige confirmação antes de criar campanha nova", () => {
    const p = preview(snap("AIV | Engajamento | video 14/10/26 (cópia)"));
    expect(p.mode).toBe("import");
    const w = p.issues.find((i) => i.id.startsWith("cmp-similar"));
    expect(w).toMatchObject({ level: "warning", requiresConfirmation: true });
    expect(w!.message).toMatch(/será criada uma campanha NOVA/);
  });
});
