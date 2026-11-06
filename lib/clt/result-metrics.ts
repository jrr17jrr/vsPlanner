import { formatMoneyPrecise } from "@/lib/format";
/**
 * Métricas de resultado (CLT e MKT) — puro, compartilhado por formulário,
 * telas de anúncio/conjunto/campanha/empresa e relatórios.
 *
 *  - Engajamento: reações, comentários, compartilhamentos, novos seguidores
 *    (ATRIBUÍDOS AOS ANÚNCIOS — não é a contagem total de seguidores do
 *    Instagram, registrada à parte) e cliques no link (nunca conversas).
 *  - Vídeo: visualizações, reproduções de 3s, ThruPlays, 75% e 100%.
 *  - CPC, CTR e CPM: calculados só com os registros em que AS DUAS pontas
 *    foram informadas (ex.: investimento de um período sem cliques
 *    informados não entra no CPC). Sem base suficiente → null ("—").
 */

/** Colunas novas de `clt_ad_period_metrics` (migration 20261106100000). */
export const EXTRA_METRIC_KEYS = ["reactions", "comments", "shares", "new_followers", "video_plays_3s", "video_p75", "video_p100"] as const;
export type ExtraMetricKey = (typeof EXTRA_METRIC_KEYS)[number];
export const EXTRA_COLUMNS = EXTRA_METRIC_KEYS.join(",");

export type MetricSection = "principal" | "engajamento" | "video";
export const SECTION_TITLES: Record<MetricSection, string> = { principal: "Resultados principais", engajamento: "Engajamento", video: "Vídeo" };

export const NEW_FOLLOWERS_LABEL = "Novos seguidores (anúncios)";

/**
 * Base dos indicadores calculados. Cada par só soma registros em que os dois
 * valores foram informados.
 */
export type RatioBase = { cpcSpend: number; cpcClicks: number; cpmSpend: number; cpmImpressions: number; ctrClicks: number; ctrImpressions: number };
export const emptyRatio = (): RatioBase => ({ cpcSpend: 0, cpcClicks: 0, cpmSpend: 0, cpmImpressions: 0, ctrClicks: 0, ctrImpressions: 0 });

/** Base de UM registro; `null` = não informado. */
export function ratioFromValues(spend: number | null, clicks: number | null, impressions: number | null): RatioBase {
  const r = emptyRatio();
  if (spend !== null && clicks !== null) { r.cpcSpend = spend; r.cpcClicks = clicks; }
  if (spend !== null && impressions !== null) { r.cpmSpend = spend; r.cpmImpressions = impressions; }
  if (clicks !== null && impressions !== null) { r.ctrClicks = clicks; r.ctrImpressions = impressions; }
  return r;
}

export function addRatio(a: RatioBase, b: RatioBase): RatioBase {
  return {
    cpcSpend: Math.round((a.cpcSpend + b.cpcSpend) * 100) / 100, cpcClicks: a.cpcClicks + b.cpcClicks,
    cpmSpend: Math.round((a.cpmSpend + b.cpmSpend) * 100) / 100, cpmImpressions: a.cpmImpressions + b.cpmImpressions,
    ctrClicks: a.ctrClicks + b.ctrClicks, ctrImpressions: a.ctrImpressions + b.ctrImpressions,
  };
}

/** CPC = investimento ÷ cliques no link. */
export const cpc = (b: RatioBase) => (b.cpcClicks > 0 && b.cpcSpend > 0 ? b.cpcSpend / b.cpcClicks : null);
/** CTR (%) = cliques no link ÷ impressões × 100. */
export const ctr = (b: RatioBase) => (b.ctrImpressions > 0 ? (b.ctrClicks / b.ctrImpressions) * 100 : null);
/** CPM = investimento ÷ impressões × 1000. */
export const cpm = (b: RatioBase) => (b.cpmImpressions > 0 && b.cpmSpend > 0 ? (b.cpmSpend / b.cpmImpressions) * 1000 : null);

const isRatio = (v: unknown): v is RatioBase => !!v && typeof v === "object" && typeof (v as RatioBase).cpcSpend === "number";

/**
 * Base de uma linha em qualquer formato das telas:
 *  - linha consolidada que já traz `ratio` (períodos somados por campanha);
 *  - linha por período (`unknown` lista o que não foi informado);
 *  - lançamento antigo (guarda 0 quando o campo não foi usado → só conta se > 0).
 */
export function rowRatioBase(r: object): RatioBase {
  const row = r as Record<string, unknown>;
  if (isRatio(row.ratio)) return row.ratio;
  const unknown = Array.isArray(row.unknown) ? (row.unknown as string[]) : null;
  const val = (k: string) => {
    const v = Number(row[k] ?? 0);
    if (unknown) return unknown.includes(k) ? null : v;
    return v > 0 ? v : null;
  };
  return ratioFromValues(val("spent_amount"), val("link_clicks"), val("impressions"));
}

// ----------------------------------------------------------------- formatos

export const fmtMoney = (n: number) => formatMoneyPrecise(n);
export const fmtInt = (n: number) => n.toLocaleString("pt-BR");
export const fmtPct = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
export const fmtRoas = (n: number) => n.toFixed(2).replace(".", ",") + "x";
export type MetricFormat = "money" | "int" | "pct" | "roas";
export function formatMetric(v: number | null, f: MetricFormat): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return f === "money" ? fmtMoney(v) : f === "pct" ? fmtPct(v) : f === "roas" ? fmtRoas(v) : fmtInt(v);
}

// ------------------------------------------------- totais de anúncio/conjunto

/** Chaves de contagem das linhas das telas (`AdLevelRow`/lançamentos). */
export const COUNT_ROW_KEYS = ["messages", "sales", "impressions", "reach", "views", "thruplays", "engagements", "link_clicks", "leads", ...EXTRA_METRIC_KEYS] as const;
export type CountRowKey = (typeof COUNT_ROW_KEYS)[number];

export type LevelTotals = Record<CountRowKey, number> & {
  spent: number; revenue: number;
  /** Custo por conversa: só investimento/conversas elegíveis (mensagens). */
  msgSpent: number; msgMessages: number;
  ratio: RatioBase;
  /** Campos que NENHUMA linha informou. */
  unknown: Set<string>;
};

const unknownOf = (r: object) => new Set("unknown" in r && Array.isArray((r as { unknown: unknown }).unknown) ? ((r as { unknown: string[] }).unknown) : []);

/** Soma linhas de anúncio/conjunto/campanha (sem decidir quais contam — isso é de quem chama). */
export function levelTotals(rows: object[], eligible: (r: object) => boolean = () => false): LevelTotals {
  const t = { spent: 0, revenue: 0, msgSpent: 0, msgMessages: 0, ratio: emptyRatio(), unknown: new Set<string>() } as LevelTotals;
  for (const k of COUNT_ROW_KEYS) t[k] = 0;
  const get = (r: object, k: string) => Number((r as Record<string, unknown>)[k] ?? 0) || 0;
  for (const r of rows) {
    t.spent += get(r, "spent_amount"); t.revenue += get(r, "generated_revenue");
    for (const k of COUNT_ROW_KEYS) t[k] += get(r, k);
    if (eligible(r)) { t.msgSpent += get(r, "spent_amount"); t.msgMessages += get(r, "messages"); }
    t.ratio = addRatio(t.ratio, rowRatioBase(r));
  }
  t.spent = Math.round(t.spent * 100) / 100; t.revenue = Math.round(t.revenue * 100) / 100;
  if (rows.length) {
    const [first, ...rest] = rows.map(unknownOf);
    // Linhas antigas não têm as colunas novas: "não informado" quando nenhuma linha por período as informou.
    const legacyMissing = (k: string) => rows.every((r) => { const u = unknownOf(r); return u.has(k) || (!("unknown" in r) && !(k in r)); });
    t.unknown = new Set([...first].filter((k) => rest.every((s) => s.has(k))));
    for (const k of EXTRA_METRIC_KEYS) if (legacyMissing(k)) t.unknown.add(k);
  } else {
    for (const k of EXTRA_METRIC_KEYS) t.unknown.add(k);
  }
  return t;
}

export type LevelCard = { key: string; label: string; value: string; muted?: boolean };

/** Cards das telas de anúncio/conjunto/campanha, por seção (+ custos e taxas). */
export function levelCards(t: LevelTotals): Record<MetricSection | "custos", LevelCard[]> {
  const na = "não informado";
  const u = (...k: string[]) => k.some((x) => t.unknown.has(x));
  const card = (key: string, label: string, value: string | null): LevelCard => ({ key, label, value: value ?? na, muted: value === null });
  const n = (k: CountRowKey, label: string) => card(k, label, u(k) ? null : fmtInt(t[k]));
  return {
    principal: [
      card("spent", "Investimento", u("spent_amount") ? null : fmtMoney(t.spent)),
      n("messages", "Conversas"),
      card("cpmsg", "Custo por conversa", u("spent_amount", "messages") ? null : t.msgMessages && t.msgSpent ? fmtMoney(t.msgSpent / t.msgMessages) : "—"),
      n("sales", "Vendas"),
      card("revenue", "Faturamento", u("generated_revenue") ? null : fmtMoney(t.revenue)),
      card("roas", "ROAS", u("spent_amount", "generated_revenue") ? null : t.spent ? fmtRoas(t.revenue / t.spent) : "—"),
      n("impressions", "Impressões"),
      n("reach", "Alcance (soma)"),
      n("engagements", "Interações"),
      n("leads", "Leads"),
    ],
    engajamento: [
      n("reactions", "Reações"),
      n("comments", "Comentários"),
      n("shares", "Compartilhamentos"),
      n("new_followers", NEW_FOLLOWERS_LABEL),
      n("link_clicks", "Cliques no link"),
    ],
    video: [
      n("views", "Visualizações"),
      n("video_plays_3s", "Reproduções de 3 segundos"),
      n("thruplays", "ThruPlays"),
      n("video_p75", "Visualizações de 75%"),
      n("video_p100", "Visualizações de 100%"),
      card("cpthru", "Custo por ThruPlay", u("spent_amount", "thruplays") ? null : t.thruplays ? fmtMoney(t.spent / t.thruplays) : "—"),
    ],
    custos: [
      card("cpc", "CPC (custo por clique)", formatMetric(cpc(t.ratio), "money")),
      card("ctr", "CTR (taxa de cliques)", formatMetric(ctr(t.ratio), "pct")),
      card("cpm", "CPM (custo por mil impressões)", formatMetric(cpm(t.ratio), "money")),
    ],
  };
}
