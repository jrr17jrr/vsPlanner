import { describe, expect, it } from "vitest";
import { parseImportInput } from "./parse";
import { validateImport } from "./validate";
import { buildImportPayload } from "./plan";
import type { ExistingSnapshot, ImportBundle } from "./types";
import { planAdResultUpdate } from "@/lib/clt/ad-result-update";

/**
 * Importador de campanhas — métricas de engajamento/vídeo, atualização
 * parcial de anúncio existente, conjunto identificado automaticamente e
 * prevenção de duplicatas. Caso real: AIV.
 */
const TODAY = "2026-11-04";
const AIV_TEXT = `Empresa: AIV
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

const snapshot = (over: Partial<ExistingSnapshot> = {}): ExistingSnapshot => ({
  company: { id: "co-aiv", name: "AIV" },
  audiences: [],
  campaigns: [{ id: "cmp-1", name: "AIV | Engajamento | video 14/10/26", meta_campaign_id: null }, { id: "cmp-2", name: "AIV | Mensagens", meta_campaign_id: null }],
  adSets: [
    { id: "set-a", campaign_id: "cmp-1", name: "Público local 20-65", meta_adset_id: null },
    { id: "set-b", campaign_id: "cmp-1", name: "Remarketing", meta_adset_id: null },
    { id: "set-c", campaign_id: "cmp-2", name: "WhatsApp", meta_adset_id: null },
  ],
  ads: [
    { id: "ad-1", ad_set_id: "set-a", name: "AIV | Vídeo local | Engajamento", meta_ad_id: null },
    { id: "ad-2", ad_set_id: "set-b", name: "AIV | Carrossel | Remarketing", meta_ad_id: null },
    // Mesmo nome, mas em OUTRA campanha: não conta.
    { id: "ad-3", ad_set_id: "set-c", name: "AIV | Vídeo local | Engajamento", meta_ad_id: null },
  ],
  legacyResultCampaignIds: [], periodMetrics: [],
  ...over,
});
const bundleOf = (content: string): ImportBundle => {
  const r = parseImportInput(content);
  if (!r.ok) throw new Error(r.error);
  return r.bundle;
};
const run = (text: string, snap = snapshot(), period?: { start: string; end: string }) => validateImport(bundleOf(text), snap, { today: TODAY, period });
const errors = (p: ReturnType<typeof run>) => p.issues.filter(i => i.level === "error");

describe("reconhecimento das métricas do formulário manual", () => {
  it("todas as métricas do exemplo AIV, sem 'Campo desconhecido'", () => {
    const b = bundleOf(AIV_TEXT);
    expect(b.problems.filter(p => /desconhecido/.test(p.message))).toEqual([]);
    const ad = b.campaigns[0].adSets[0].ads[0];
    expect(ad.extraMetrics).toEqual({ engagements: 2580, reactions: 2543, comments: 5, shares: 13, new_followers: 1, thruplays: 1679, video_p75: 1180, video_p100: 863 });
    expect(ad.metrics.linkClicks).toBe(16);
    // Nada de investimento/alcance/impressões inventado.
    expect(ad.metrics).toMatchObject({ spend: null, reach: null, impressions: null, conversations: null });
  });
  it("aceita variações de acentos, caixa e nomes", () => {
    const b = bundleOf(`Campanha: X\nConjunto: S\nAnúncio: A\nINTERACOES: 1\nreacoes a publicacao: 2\nComentarios: 3\nCOMPARTILHAMENTOS: 4\nseguidores ganhos: 5\nclique no link: 6\nThruPlay: 7\nvisualizações 75%: 8\nVisualizacoes de 100%: 9\nVisualizações: 10\nReproduções de 3 segundos: 11`);
    expect(b.problems.filter(p => /desconhecido/.test(p.message))).toEqual([]);
    const ad = b.campaigns[0].adSets[0].ads[0];
    expect(ad.extraMetrics).toEqual({ engagements: 1, reactions: 2, comments: 3, shares: 4, new_followers: 5, thruplays: 7, video_p75: 8, video_p100: 9, views: 10, video_plays_3s: 11 });
    expect(ad.metrics.linkClicks).toBe(6);
  });
  it("'Publicações guardadas' é reconhecido, mas avisado como não suportado (sem coluna nova)", () => {
    const b = bundleOf(`Campanha: X\nConjunto: S\nAnúncio: A\nPublicações guardadas: 12`);
    expect(b.problems).toEqual([expect.objectContaining({ level: "warning", message: expect.stringContaining("ainda não é registrado") })]);
  });
  it("JSON também lê as métricas novas", () => {
    const b = bundleOf(JSON.stringify({ format: "vsplanner_v1", campaigns: [{ name: "X", ad_sets: [{ name: "S", ads: [{ name: "A", metrics: { thruplays: 5, reactions: "1.234", video_p100: 3 } }] }] }] }));
    expect(b.campaigns[0]?.adSets[0]?.ads[0]?.extraMetrics).toMatchObject({ thruplays: 5, reactions: 1234, video_p100: 3 });
  });
});

describe("atualização parcial do anúncio AIV", () => {
  const p = run(AIV_TEXT);

  it("modo 'atualização de métricas', sem erro de período", () => {
    expect(p.mode).toBe("metrics_update");
    expect(errors(p)).toEqual([]);
    expect(p.canImport).toBe(true);
  });
  it("localiza campanha, conjunto (automaticamente) e o anúncio certos", () => {
    expect(p.campaigns).toHaveLength(1);
    expect(p.campaigns[0]).toMatchObject({ action: "update", existingId: "cmp-1" });
    expect(p.campaigns[0].adSets).toHaveLength(1);
    expect(p.campaigns[0].adSets[0]).toMatchObject({ action: "update", existingId: "set-a", name: "Público local 20-65", autoIdentified: true });
    expect(p.campaigns[0].adSets[0].ads).toEqual([expect.objectContaining({ action: "update", existingId: "ad-1", hasMetrics: true })]);
  });
  it("não cria campanha, conjunto nem anúncio (nada de conjunto com o nome da campanha)", () => {
    expect(p.counts.campaigns.create + p.counts.adSets.create + p.counts.ads.create).toBe(0);
    expect(p.campaigns[0].adSets.some(s => s.name === "AIV | Engajamento | video 14/10/26")).toBe(false);
    expect(p.issues.some(i => i.id.startsWith("set-inferred"))).toBe(false);
  });
  it("só as métricas informadas mudam: investimento, alcance, impressões e o resto ficam (regra do 'Atualizar resultados')", () => {
    const rows = [{ entry_date: "2026-10-14", period_start: "2026-10-14", period_end: "2026-10-31", source: "import", spent_amount: 150, impressions: 40000, reach: 21000, link_clicks: 10, engagements: 2000, thruplays: 1500 }];
    const values = { engagements: 2580, reactions: 2543, comments: 5, shares: 13, new_followers: 1, link_clicks: 16, thruplays: 1679, video_p75: 1180, video_p100: 863 };
    const plan = planAdResultUpdate({ rows, updateRows: [], values, today: TODAY });
    if ("error" in plan) throw new Error(plan.error);
    expect(plan.values).toMatchObject({ spend: null, impressions: null, reach: null, conversations: null, sales: null, revenue: null, leads: null });
    expect(plan.delta).toEqual({ engagements: 580, reactions: 2543, comments: 5, shares: 13, new_followers: 1, link_clicks: 6, thruplays: 179, video_p75: 1180, video_p100: 863 });
    expect(plan.updated).toEqual(values);
    expect(plan.periodStart).toBe("2026-11-01"); // dia seguinte ao último dado → hoje
  });
  it("orçamento/datas/status no texto não são aplicados (avisado)", () => {
    const q = run(AIV_TEXT.replace("Anúncio:", "Orçamento diário: R$ 50,00\nStatus: Pausada\nAnúncio:"));
    expect(q.mode).toBe("metrics_update");
    expect(q.issues.find(i => i.id.startsWith("partial-ignored"))?.message).toMatch(/orçamento, status/);
  });
  it("nome existente é preservado (diferença só de caixa não reescreve)", () => {
    const q = run(AIV_TEXT.replace("Anúncio: AIV | Vídeo local | Engajamento", "Anúncio: aiv | VÍDEO LOCAL | engajamento"));
    expect(q.campaigns[0].adSets[0].ads[0]).toMatchObject({ existingId: "ad-1", name: "AIV | Vídeo local | Engajamento" });
  });
});

describe("identificação de anúncios e ambiguidade", () => {
  it("dois anúncios com o mesmo nome na campanha: bloqueia e pede identificação", () => {
    const snap = snapshot({ ads: [...snapshot().ads, { id: "ad-4", ad_set_id: "set-b", name: "AIV | Vídeo local | Engajamento", meta_ad_id: null }] });
    const p = run(AIV_TEXT, snap);
    expect(p.canImport).toBe(false);
    expect(errors(p)[0].message).toMatch(/Há 2 anúncios chamados .*"Público local 20-65", "Remarketing".*Informe "Conjunto:" ou "ID do anúncio:"/);
  });
  it("com 'Conjunto:' a ambiguidade se resolve", () => {
    const snap = snapshot({ ads: [...snapshot().ads, { id: "ad-4", ad_set_id: "set-b", name: "AIV | Vídeo local | Engajamento", meta_ad_id: null }] });
    const p = run(AIV_TEXT.replace("Anúncio:", "Conjunto: Remarketing\nAnúncio:"), snap);
    expect(errors(p)).toEqual([]);
    expect(p.campaigns[0].adSets[0]).toMatchObject({ existingId: "set-b" });
    expect(p.campaigns[0].adSets[0].autoIdentified).toBeFalsy();
    expect(p.mode).toBe("metrics_update");
    expect(p.campaigns[0].adSets[0].ads[0].existingId).toBe("ad-4");
  });
  it("com 'ID do anúncio:' também", () => {
    const snap = snapshot({ ads: [{ id: "ad-1", ad_set_id: "set-a", name: "AIV | Vídeo local | Engajamento", meta_ad_id: "111" }, { id: "ad-4", ad_set_id: "set-b", name: "AIV | Vídeo local | Engajamento", meta_ad_id: "222" }] });
    const p = run(AIV_TEXT.replace("\n\nInterações", "\nID do anúncio: 222\nInterações"), snap);
    expect(errors(p)).toEqual([]);
    expect(p.campaigns[0].adSets[0]).toMatchObject({ existingId: "set-b", autoIdentified: true });
  });
  it("anúncio inexistente numa campanha existente sem 'Conjunto:': erro, nada é criado", () => {
    const p = run(AIV_TEXT.replace("Anúncio: AIV | Vídeo local | Engajamento", "Anúncio: Outro anúncio"));
    expect(p.canImport).toBe(false);
    expect(errors(p)[0].message).toMatch(/não encontrado na campanha.*Nada será criado/);
  });
  it("duas campanhas com o mesmo nome: bloqueia", () => {
    const snap = snapshot({ campaigns: [...snapshot().campaigns, { id: "cmp-9", name: "AIV | Engajamento | video 14/10/26", meta_campaign_id: null }] });
    const p = run(AIV_TEXT, snap);
    expect(p.canImport).toBe(false);
    expect(errors(p).some(e => e.id.startsWith("cmp-ambiguous"))).toBe(true);
  });
  it("vários anúncios da mesma campanha em conjuntos diferentes: cada um no seu conjunto", () => {
    const p = run(`${AIV_TEXT}\nAnúncio: AIV | Carrossel | Remarketing\nComentários: 2`);
    expect(errors(p)).toEqual([]);
    expect(p.campaigns[0].adSets.map(s => [s.existingId, s.ads.map(a => a.existingId)])).toEqual([["set-a", ["ad-1"]], ["set-b", ["ad-2"]]]);
  });
});

describe("compatibilidade e prevenção de duplicatas", () => {
  it("campanha NOVA sem 'Conjunto:' continua exigindo confirmação do conjunto provisório", () => {
    const p = run(AIV_TEXT.replace("AIV | Engajamento | video 14/10/26", "Campanha nova"), snapshot(), { start: "2026-10-01", end: "2026-10-31" });
    expect(p.mode).toBe("import");
    expect(p.issues.some(i => i.id.startsWith("set-inferred") && i.requiresConfirmation)).toBe(true);
  });
  it("campanha nova com métricas e sem período: continua pedindo o período", () => {
    const p = run(AIV_TEXT.replace("AIV | Engajamento | video 14/10/26", "Campanha nova"));
    expect(errors(p).some(e => e.id === "period-missing:period")).toBe(true);
  });
  it("com período e só itens existentes: vira atualização do registro do período (sem importação de estrutura)", () => {
    const p = run(AIV_TEXT, snapshot(), { start: "2026-10-14", end: "2026-10-31" });
    expect(p.mode).toBe("period_update");
    expect(errors(p)).toEqual([]);
    expect(p.counts.campaigns.create + p.counts.adSets.create + p.counts.ads.create).toBe(0);
    // O payload de estrutura continua sem tocar em nada que não veio no texto (caso seja usado).
    const payload = buildImportPayload(p);
    const set = payload.campaigns[0].ad_sets[0];
    expect(set).toMatchObject({ existing_id: "set-a", name: "Público local 20-65", daily_budget: null, starts_at: null, ends_at: null, status: null });
    expect(set.ads[0]).toMatchObject({ existing_id: "ad-1" });
    // Métricas principais ausentes seguem null (o banco faz coalesce e não apaga nada).
    expect(set.ads[0].metrics).toMatchObject({ spend: null, impressions: null, reach: null, linkClicks: 16 });
    // Status da campanha existente não muda sem "Status:".
    expect(payload.campaigns[0]).toMatchObject({ existing_id: "cmp-1", status_explicit: false, daily_budget: null, starts_on: null, ends_on: null });
  });
  it("arquivo com estrutura nova (Conjunto informado e inexistente) não vira atualização parcial", () => {
    const p = run(AIV_TEXT.replace("Anúncio:", "Conjunto: Conjunto novo\nAnúncio:"));
    expect(p.mode).toBe("import");
    expect(errors(p).some(e => e.id === "period-missing:period")).toBe(true);
  });
});
