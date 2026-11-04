import { describe, expect, it } from "vitest";
import { informedColumns, planRowChanges, resolvePeriodTarget, type PeriodRow } from "./period-target";
import { parseImportInput } from "./parse";
import { validateImport } from "./validate";
import type { ExistingSnapshot } from "./types";

/** Escolha do registro de resultados numa atualização COM período (caso AIV, 14/10 a 30/10/2026). */
const P = { start: "2026-10-14", end: "2026-10-30" };
const row = (id: string, start: string, end: string, over: Record<string, unknown> = {}): PeriodRow =>
  ({ id, period_start: start, period_end: end, source: "text", spend: 320.5, impressions: 41000, reach: 22000, link_clicks: 10, ...over });

describe("qual registro atualizar", () => {
  it("mesmo período → atualiza esse registro", () => {
    expect(resolvePeriodTarget({ rows: [row("r1", P.start, P.end)], period: P })).toMatchObject({ kind: "update_row", rowId: "r1", chosen: false });
  });
  it("mesmo período vence outros sobrepostos", () => {
    const t = resolvePeriodTarget({ rows: [row("r0", "2026-10-01", "2026-10-31"), row("r1", P.start, P.end)], period: P });
    expect(t).toMatchObject({ kind: "update_row", rowId: "r1" });
  });
  it("nenhum registro sobreposto → cria o do período", () => {
    expect(resolvePeriodTarget({ rows: [row("r0", "2026-09-01", "2026-09-30")], period: P })).toMatchObject({ kind: "insert_row", start: P.start, end: P.end });
    expect(resolvePeriodTarget({ rows: [], period: P }).kind).toBe("insert_row");
  });
  it("sobreposto mas diferente → NÃO cria registro; pede escolha e lista os períodos", () => {
    const t = resolvePeriodTarget({ rows: [row("r1", "2026-10-14", "2026-10-31"), row("r0", "2026-09-01", "2026-09-30")], period: P });
    expect(t.kind).toBe("choose");
    if (t.kind !== "choose") return;
    expect(t.options.map((o) => [o.id, o.start, o.end, o.selectable])).toEqual([["r1", "2026-10-14", "2026-10-31", true]]);
    expect(t.message).toMatch(/14\/10\/2026 a 31\/10\/2026.*nenhum registro novo é criado/);
  });
  it("escolhido pela pessoa → atualiza o registro escolhido (com o período dele)", () => {
    const t = resolvePeriodTarget({ rows: [row("r1", "2026-10-14", "2026-10-31")], period: P, chosenId: "r1" });
    expect(t).toMatchObject({ kind: "update_row", rowId: "r1", start: "2026-10-14", end: "2026-10-31", chosen: true });
  });
  it("escolha que não se sobrepõe/não existe é ignorada (decide de novo)", () => {
    expect(resolvePeriodTarget({ rows: [row("r1", "2026-10-14", "2026-10-31")], period: P, chosenId: "outro" }).kind).toBe("choose");
  });
  it("registro do 'Atualizar resultados' (diferenças) nunca é sobrescrito", () => {
    const manual = row("m1", P.start, P.end, { source: "manual_update" });
    const t = resolvePeriodTarget({ rows: [manual], period: P });
    expect(t.kind).toBe("blocked");
    expect(resolvePeriodTarget({ rows: [manual], period: P, chosenId: "m1" }).kind).toBe("blocked");
  });
  it("dois registros com o mesmo período → bloqueia (não dá para saber qual)", () => {
    const t = resolvePeriodTarget({ rows: [row("a", P.start, P.end), row("b", P.start, P.end)], period: P });
    expect(t).toMatchObject({ kind: "blocked" });
  });
});

describe("só as métricas informadas mudam, sem somar", () => {
  const text = `Empresa: AIV
Campanha: AIV | Engajamento | video 14/10/26
Anúncio: AIV | Vídeo local | Engajamento
Período: 14/10/2026 a 30/10/2026
Interações: 2580
Reações à publicação: 2543
Comentários: 5
Compartilhamentos: 13
Novos seguidores: 1
Cliques no link: 16
ThruPlays: 1679
Visualizações de 75%: 1180
Visualizações de 100%: 863`;
  const parsed = parseImportInput(text);
  if (!parsed.ok) throw new Error(parsed.error);
  const ad = parsed.bundle.campaigns[0].adSets[0].ads[0];

  it("colunas informadas = as do texto; investimento/alcance/impressões não entram", () => {
    const cols = informedColumns(ad);
    expect(Object.keys(cols).sort()).toEqual(["comments", "engagements", "link_clicks", "new_followers", "reactions", "shares", "thruplays", "video_p100", "video_p75"]);
  });
  it("substitui (não soma) e não toca nas outras colunas", () => {
    const existing = row("r1", P.start, P.end, { link_clicks: 10, engagements: null });
    const { update, changes } = planRowChanges(existing, informedColumns(ad));
    expect(update).toEqual({ engagements: 2580, reactions: 2543, comments: 5, shares: 13, new_followers: 1, link_clicks: 16, thruplays: 1679, video_p75: 1180, video_p100: 863 });
    expect(update).not.toHaveProperty("spend");
    expect(update).not.toHaveProperty("reach");
    expect(update).not.toHaveProperty("impressions");
    expect(changes.find((c) => c.key === "link_clicks")).toEqual({ key: "link_clicks", label: "Cliques no link", before: 10, after: 16 });
  });
  it("reimportar os mesmos valores não muda nada (sem duplicar)", () => {
    const filled = row("r1", P.start, P.end, informedColumns(ad));
    expect(planRowChanges(filled, informedColumns(ad))).toEqual({ changes: [], update: {} });
  });
  it("validação: modo de atualização do registro; o alerta antigo de sobreposição some", () => {
    const snap: ExistingSnapshot = {
      company: { id: "co", name: "AIV" }, audiences: [],
      campaigns: [{ id: "cmp-1", name: "AIV | Engajamento | video 14/10/26", meta_campaign_id: null }],
      adSets: [{ id: "set-a", campaign_id: "cmp-1", name: "Local", meta_adset_id: null }],
      ads: [{ id: "ad-1", ad_set_id: "set-a", name: "AIV | Vídeo local | Engajamento", meta_ad_id: null }],
      legacyResultCampaignIds: [], periodMetrics: [{ creative_id: "ad-1", period_start: "2026-10-14", period_end: "2026-10-31" }],
    };
    const p = validateImport(parsed.bundle, snap, { today: "2026-11-04" });
    expect(p.mode).toBe("period_update");
    expect(p.issues.some((i) => /se sobrepõe a este. Os dois serão mantidos/.test(i.message))).toBe(false);
    expect(p.confirmationIds).toEqual([]);
  });
});
