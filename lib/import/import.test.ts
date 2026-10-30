import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseImportInput } from "./parse";
import { validateImport } from "./validate";
import type { ExistingSnapshot, ImportBundle } from "./types";

const fixture = (name: string) => readFileSync(join(__dirname, "../../dados-importacao/ig-predial", name), "utf8");
export const AUDIENCES_JSON = fixture("ig_predial_publicos.json");
export const CAMPAIGNS_JSON = fixture("ig_predial_campanhas.json");

const emptySnapshot = (): ExistingSnapshot => ({
  company: { id: "company-igp", name: "IG Predial" },
  audiences: [], campaigns: [], adSets: [], ads: [], legacyResultCampaignIds: [], periodMetrics: [],
});
const bundleOf = (content: string): ImportBundle => {
  const r = parseImportInput(content);
  if (!r.ok) throw new Error(r.error);
  return r.bundle;
};
const TODAY = "2026-10-30";
const errorsOf = (p: ReturnType<typeof validateImport>) => p.issues.filter(i => i.level === "error");

describe("IG Predial — públicos", () => {
  const preview = validateImport(bundleOf(AUDIENCES_JSON), emptySnapshot(), { today: TODAY });

  it("reconhece os 10 públicos com tipos corretos", () => {
    expect(preview.audiences).toHaveLength(10);
    expect(preview.audiences.filter(a => a.dbType === "salvo")).toHaveLength(8);
    expect(preview.audiences.filter(a => a.dbType === "personalizado")).toHaveLength(1);
    expect(preview.audiences.filter(a => a.dbType === "semelhante")).toHaveLength(1);
    expect(preview.counts.audiences).toEqual({ create: 10, update: 0 });
    expect(errorsOf(preview)).toEqual([]);
    expect(preview.canImport).toBe(true);
  });

  it("preserva os detalhes (localização, raio, idade, interesses, tamanho)", () => {
    const cabo = preview.audiences.find(a => a.externalKey === "igp_aud_cabo_frio_20261015")!;
    expect(cabo.settings).toMatchObject({ targeting_location: { city: "Cabo Frio", radius_km: 10 }, age_range: [20, 65], estimated_size: [258600, 304300], interests: [] });
    const eng = preview.audiences.find(a => a.externalKey === "igp_aud_ig_eng_185d")!;
    expect(eng.settings).toMatchObject({ retention_days: 180, source: { instagram_account: "@ig_predial" } });
  });

  it("vincula o semelhante ao público de origem pela chave", () => {
    const lal = preview.audiences.find(a => a.dbType === "semelhante")!;
    expect(lal.source).toMatchObject({ ref: "igp_aud_ig_eng_185d", inBundle: true });
    expect(lal.settings.percentage).toBe(1);
  });

  it("alerta 185D × 180 dias sem alterar os dados", () => {
    const w = preview.issues.find(i => i.id.startsWith("aud-retention:"));
    expect(w?.level).toBe("warning");
    expect(w?.message).toContain("185");
    expect(preview.audiences.find(a => a.externalKey === "igp_aud_ig_eng_185d")!.name).toBe("IG Predial | Instagram | Engajamento | 185D");
  });

  it("reimportação: casa pela external_key e só atualiza", () => {
    const snap = emptySnapshot();
    snap.audiences = preview.audiences.map((a, i) => ({ id: `aud-${i}`, name: a.name, audience_type: a.dbType!, external_key: a.externalKey }));
    const again = validateImport(bundleOf(AUDIENCES_JSON), snap, { today: TODAY });
    expect(again.counts.audiences).toEqual({ create: 0, update: 10 });
    expect(errorsOf(again)).toEqual([]);
  });
});

describe("IG Predial — campanhas", () => {
  const snapWithAudiences = () => {
    const snap = emptySnapshot();
    const auds = validateImport(bundleOf(AUDIENCES_JSON), emptySnapshot(), { today: TODAY }).audiences;
    snap.audiences = auds.map((a, i) => ({ id: `aud-${i}`, name: a.name, audience_type: a.dbType!, external_key: a.externalKey }));
    return snap;
  };

  it("sem os públicos importados, acusa referência inexistente", () => {
    const p = validateImport(bundleOf(CAMPAIGNS_JSON), emptySnapshot(), { today: TODAY });
    expect(p.issues.filter(i => i.id.startsWith("set-aud-404:"))).toHaveLength(8);
    expect(p.canImport).toBe(false);
  });

  const preview = validateImport(bundleOf(CAMPAIGNS_JSON), snapWithAudiences(), { today: TODAY });

  it("reconhece 7 campanhas, 8 conjuntos e 8 anúncios", () => {
    expect(preview.campaigns).toHaveLength(7);
    expect(preview.counts.adSets.create).toBe(8);
    expect(preview.counts.ads.create).toBe(8);
    expect(preview.period).toEqual({ start: "2026-09-30", end: "2026-10-29" });
    expect(errorsOf(preview)).toEqual([]);
    expect(preview.canImport).toBe(true);
  });

  it("vincula os 8 conjuntos pela audience_external_key", () => {
    const sets = preview.campaigns.flatMap(c => c.adSets);
    expect(sets.every(s => s.audience?.via === "external_key" && s.audience.existingId)).toBe(true);
  });

  it("soma conhecida dos anúncios: R$ 836,35 · 79 conversas · 38 vendas · R$ 9.610,00", () => {
    expect(preview.totals.known.spend).toBe(836.35);
    expect(preview.totals.known.conversations).toBe(79);
    expect(preview.totals.known.sales).toBe(38);
    expect(preview.totals.known.revenue).toBe(9610);
    expect(preview.totals.known.reach).toBeNull(); // alcance não é somado
    expect(preview.totals.unallocatedSpend).toBe(6.82);
    expect(preview.totals.unallocatedConversations).toBe(1);
    expect(Math.round((preview.totals.known.spend! + preview.totals.unallocatedSpend) * 100) / 100).toBe(843.17);
  });

  it("mostra a divergência do Vídeo x Foto sem distribuir", () => {
    const vxf = preview.campaigns.find(c => c.name.includes("Vídeo x Foto"))!;
    expect(vxf.difference).toEqual({ spend: 6.82, conversations: 1 });
    expect(vxf.known.spend).toBe(45.93);
    expect(vxf.adSets.flatMap(s => s.ads).map(a => a.metrics.spend)).toEqual([26.46, 19.47]);
    expect(preview.issues.some(i => i.id.startsWith("cmp-reconcile:") && i.path.includes("Vídeo x Foto"))).toBe(true);
  });

  it("preserva null (conversas do vídeo não viram zero)", () => {
    const video = preview.campaigns.flatMap(c => c.adSets.flatMap(s => s.ads)).find(a => a.name.startsWith("Vídeo 01"))!;
    expect(video.metrics.conversations).toBeNull();
    expect(video.metrics.spend).toBe(19.47);
  });

  it("SG + Niterói: nome sugere semelhante, público é de interesses → exige confirmação", () => {
    const w = preview.issues.find(i => i.id.startsWith("set-aud-mismatch:") && i.path.includes("SG + Niterói"));
    expect(w?.requiresConfirmation).toBe(true);
    expect(preview.confirmationIds).toContain(w!.id);
  });

  it("deriva datas da campanha dos conjuntos", () => {
    const cabo = preview.campaigns.find(c => c.metaId === "120254389360490655")!;
    expect([cabo.startsOn, cabo.endsOn, cabo.datesDerived]).toEqual(["2026-10-15", "2026-11-01", true]);
    expect(cabo.budgetType).toBe("daily");
    expect(cabo.dailyBudget).toBe(15);
  });

  it("vendas > conversas (Cabo Frio) gera aviso", () => {
    expect(preview.issues.some(i => i.id.startsWith("ad-sales-gt-conv:") && i.path.includes("Cabo Frio"))).toBe(true);
  });

  it("reimportação casa pelos IDs do Meta, sem criar nada", () => {
    const snap = snapWithAudiences();
    preview.campaigns.forEach((c, i) => {
      snap.campaigns.push({ id: `c${i}`, name: c.name, meta_campaign_id: c.metaId });
      c.adSets.forEach((s, j) => {
        snap.adSets.push({ id: `s${i}-${j}`, campaign_id: `c${i}`, name: s.name, meta_adset_id: s.metaId });
        s.ads.forEach((a, k) => snap.ads.push({ id: `a${i}-${j}-${k}`, ad_set_id: `s${i}-${j}`, name: a.name, meta_ad_id: a.metaId }));
      });
    });
    const again = validateImport(bundleOf(CAMPAIGNS_JSON), snap, { today: TODAY });
    expect(again.counts.campaigns).toEqual({ create: 0, update: 7 });
    expect(again.counts.adSets).toEqual({ create: 0, update: 8 });
    expect(again.counts.ads).toEqual({ create: 0, update: 8 });
  });

  it("empresa diferente da selecionada exige confirmação", () => {
    const snap = snapWithAudiences();
    snap.company.name = "SGIV";
    const p = validateImport(bundleOf(CAMPAIGNS_JSON), snap, { today: TODAY });
    expect(p.issues.find(i => i.id.startsWith("company-mismatch"))?.requiresConfirmation).toBe(true);
  });
});

describe("texto estruturado", () => {
  const EXAMPLE = `Empresa: IG Predial
Período: 30/09/2026 a 29/10/2026

Campanha: IG Predial | WhatsApp | Cabo Frio

Objetivo: Mensagens no WhatsApp

Público: Cabo Frio | + | 15/10/26

Orçamento diário: R$ 15,00

Anúncio: Imagem 01 | Cabo Frio

Investimento: R$ 206,22

Conversas: 21

Vendas: 37

Faturamento: R$ 9.360,00`;

  it("reconhece o exemplo e transforma em registros", () => {
    const b = bundleOf(EXAMPLE);
    expect(b.sourceFormat).toBe("text");
    expect(b.company.name).toBe("IG Predial");
    expect(b.campaigns).toHaveLength(1);
    const c = b.campaigns[0];
    expect(c.objective).toBe("Mensagens no WhatsApp");
    expect(c.dailyBudget).toBe(15);
    expect(c.adSets[0].audienceName).toBe("Cabo Frio | + | 15/10/26");
    expect(c.adSets[0].nameInferred).toBe(true);
    expect(c.adSets[0].ads[0].metrics).toMatchObject({ spend: 206.22, conversations: 21, sales: 37, revenue: 9360, impressions: null });
  });

  it("vincula o público pelo nome exato e pede confirmação do conjunto inferido e das datas", () => {
    const snap = emptySnapshot();
    snap.audiences = [{ id: "aud-cabo", name: "Cabo Frio | + | 15/10/26", audience_type: "salvo", external_key: "igp_aud_cabo_frio_20261015" }];
    const p = validateImport(bundleOf(EXAMPLE), snap, { today: TODAY });
    expect(p.campaigns[0].adSets[0].audience).toMatchObject({ existingId: "aud-cabo", via: "name" });
    expect(p.confirmationIds.some(id => id.startsWith("set-inferred:"))).toBe(true);
    expect(p.confirmationIds.some(id => id.startsWith("cmp-start-period:"))).toBe(true);
    expect(errorsOf(p)).toEqual([]);
  });

  it("não inventa IDs do Meta", () => {
    const b = bundleOf(EXAMPLE);
    expect(b.campaigns[0].metaId).toBeNull();
    expect(b.campaigns[0].adSets[0].metaId).toBeNull();
    expect(b.campaigns[0].adSets[0].ads[0].metaId).toBeNull();
  });

  it("vários públicos, campanhas, conjuntos e anúncios no mesmo texto", () => {
    const b = bundleOf(`Público salvo: Macaé | + | 19/10/26
Cidade: Macaé
Raio: 10 km
Idade: 20-65
Chave: igp_aud_macae

Público personalizado: Engajamento 180D
Retenção: 180 dias

Público semelhante: LAL 1% Engajamento
Origem: Engajamento 180D
Porcentagem: 1

Campanha: Macaé WhatsApp
Início: 19/10/2026
Fim: 26/10/2026
Conjunto: Macaé | Amplo
Público: Macaé | + | 19/10/26
Orçamento diário: 15
Anúncio: Imagem 01 | Macaé
Investimento: 104,48
Conversas: 11
Anúncio: Vídeo 01 | Macaé
Investimento: 10
Conversas: —
Conjunto: Macaé | LAL
Público: LAL 1% Engajamento
Anúncio: Imagem 02
Investimento: 5

Campanha: Segunda campanha
Início: 01/10/2026
Anúncio: Foto X
Vendas: 2`);
    expect(b.audiences.map(a => a.type)).toEqual(["saved", "custom", "lookalike"]);
    expect(b.audiences[0]).toMatchObject({ externalKey: "igp_aud_macae", ageMin: 20, ageMax: 65, location: { descricao: "Macaé", radius_km: 10 } });
    expect(b.campaigns).toHaveLength(2);
    expect(b.campaigns[0].adSets).toHaveLength(2);
    expect(b.campaigns[0].adSets[0].ads.map(a => a.format)).toEqual(["imagem", "video"]);
    expect(b.campaigns[0].adSets[0].ads[1].metrics.conversations).toBeNull();
    const p = validateImport(b, emptySnapshot(), { today: TODAY, period: { start: "2026-10-01", end: "2026-10-29" } });
    expect(errorsOf(p)).toEqual([]);
    expect(p.campaigns[0].adSets[1].audience).toMatchObject({ inBundle: true, type: "semelhante" });
    expect(p.audiences[2].source).toMatchObject({ inBundle: true, name: "Engajamento 180D" });
  });

  it("dados incompletos: aponta o que falta em vez de inventar", () => {
    const p = validateImport(bundleOf(`Campanha: Sem datas
Anúncio: A1
Investimento: abc
Conversas: 3`), emptySnapshot(), { today: TODAY });
    const ids = errorsOf(p).map(i => i.id.split(":")[0]);
    expect(ids).toContain("parse"); // "abc"
    expect(ids).toContain("cmp-start");
    expect(ids).toContain("period-missing");
    expect(p.canImport).toBe(false);
  });

  it("JSON colado no campo de texto é reconhecido", () => {
    const r = parseImportInput("   " + AUDIENCES_JSON);
    expect(r.ok && r.detected).toBe("json");
  });

  it("JSON de planejamento é encaminhado ao importador certo", () => {
    const r = parseImportInput(JSON.stringify({ items: [{ title: "x" }] }));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.planning).toBe(true);
  });
});

describe("formato antigo em português", () => {
  it("publicos/campanhas/conjuntos/anuncios continuam aceitos", () => {
    const b = bundleOf(JSON.stringify({
      empresa: "IG Predial",
      publicos: [{ nome: "Base", tipo: "personalizado" }, { nome: "LAL Base", tipo: "semelhante", origem: "Base" }],
      campanhas: [{ nome: "C1", conjuntos: [{ nome: "S1", publico: "LAL Base", anuncios: [{ nome: "A1", formato: "video", resultados: { investimento: "1.234,50", conversas: 3 } }] }] }],
    }));
    expect(b.sourceFormat).toBe("legacy_campanhas");
    expect(b.audiences[1].sourceAudienceName).toBe("Base");
    expect(b.campaigns[0].adSets[0].ads[0].metrics.spend).toBe(1234.5);
    const p = validateImport(b, emptySnapshot(), { today: TODAY, period: { start: "2026-10-01", end: "2026-10-31" } });
    expect(p.campaigns[0].adSets[0].audience).toMatchObject({ inBundle: true, via: "name" });
    expect(p.audiences[1].source?.name).toBe("Base");
  });
});
