import type { CltAdLevelResult } from "@/types/database.types";
import { EXTRA_METRIC_KEYS, type ExtraMetricKey } from "@/lib/clt/result-metrics";

/**
 * Métricas importadas por anúncio e período (`clt_ad_period_metrics`)
 * no formato que as telas de campanha/conjunto/anúncio já usam
 * (`CltAdLevelResult`), sem duplicar:
 *
 *  - cada linha importada vira UMA linha do anúncio, datada no último dia
 *    do período (mesma regra de `period-results.ts`);
 *  - lançamentos antigos (`clt_ad_level_results`) do mesmo anúncio — ou do
 *    conjunto sem anúncio — dentro de um período importado são descartados
 *    (o importado prevalece);
 *  - `null` continua "não informado": soma zero, mas fica listado em
 *    `unknown` para a tela mostrar "não informado" em vez de 0.
 */

export type PeriodMetricFullRow = {
  id: string;
  campaign_id: string;
  ad_set_id: string;
  creative_id: string;
  period_start: string;
  period_end: string;
  spend: number | string | null;
  conversations: number | null;
  sales: number | null;
  revenue: number | string | null;
  impressions: number | null;
  reach: number | null;
  link_clicks: number | null;
  leads: number | null;
  /** Colunas da migration 20261104110000 (ausentes antes dela = não informado). */
  views?: number | null;
  thruplays?: number | null;
  engagements?: number | null;
  /** Engajamento e vídeo — migration 20261106100000 (ausentes antes dela = não informado). */
  reactions?: number | null;
  comments?: number | null;
  shares?: number | null;
  new_followers?: number | null;
  video_plays_3s?: number | null;
  video_p75?: number | null;
  video_p100?: number | null;
  /** 'import' (padrão) ou 'manual_update' ("Atualizar resultados"). */
  source?: string | null;
};

/** Campos de `CltAdLevelResult` que o período nunca traz (sempre "não informado"). */
const NOT_IMPORTED = ["profile_visits", "appointments"] as const;

export type AdLevelRow = CltAdLevelResult & Partial<Record<ExtraMetricKey, number>> & {
  /** Presentes só nas linhas por período (importadas ou atualizações manuais). */
  period_start?: string;
  period_end?: string;
  source?: "import" | "manual_update";
  /** Campos não informados nesta linha. */
  unknown?: string[];
};

/** Atualização manual dos totais ("Atualizar resultados") — é só um acréscimo: nunca esconde outros dados. */
export const isManualUpdate = (m: { source?: string | null }) => m.source === "manual_update";

/**
 * Períodos que CONTAM. O importado é a fonte oficial do período: uma
 * atualização manual do mesmo anúncio totalmente dentro de um período
 * importado deixa de contar (senão o mesmo resultado entraria duas vezes).
 */
export function effectivePeriodRows<T extends { creative_id: string; period_start: string; period_end: string; source?: string | null }>(rows: T[]): T[] {
  const imports = rows.filter((r) => !isManualUpdate(r));
  return rows.filter((r) => !isManualUpdate(r) || !imports.some((i) => i.creative_id === r.creative_id && day(i.period_start) <= day(r.period_start) && day(i.period_end) >= day(r.period_end)));
}

const num = (v: number | string | null | undefined) => (v === null || v === undefined || v === "" ? null : Number(v));
const day = (d: string) => String(d).slice(0, 10);

export function periodRowToLevel(m: PeriodMetricFullRow): AdLevelRow {
  const fields: Array<[keyof CltAdLevelResult | ExtraMetricKey, number | null]> = [
    ["spent_amount", num(m.spend)],
    ["messages", num(m.conversations)],
    ["sales", num(m.sales)],
    ["generated_revenue", num(m.revenue)],
    ["impressions", num(m.impressions)],
    ["reach", num(m.reach)],
    ["link_clicks", num(m.link_clicks)],
    ["leads", num(m.leads)],
    ["views", num(m.views)],
    ["thruplays", num(m.thruplays)],
    ["engagements", num(m.engagements)],
    ...EXTRA_METRIC_KEYS.map((k) => [k, num(m[k])] as [ExtraMetricKey, number | null]),
  ];
  const row = {
    id: `period:${m.id}`,
    user_id: "",
    campaign_id: m.campaign_id,
    ad_set_id: m.ad_set_id,
    creative_id: m.creative_id,
    entry_date: day(m.period_end),
    period_start: day(m.period_start),
    period_end: day(m.period_end),
    source: isManualUpdate(m) ? ("manual_update" as const) : ("import" as const),
    profile_visits: 0, appointments: 0,
    unknown: [...NOT_IMPORTED, ...fields.filter(([, v]) => v === null).map(([k]) => k)],
  } as AdLevelRow;
  for (const [k, v] of fields) (row as Record<string, unknown>)[k] = v ?? 0;
  return row;
}

export function mergeAdLevelResults(legacy: CltAdLevelResult[], period: PeriodMetricFullRow[]): { rows: AdLevelRow[]; excludedLegacy: number } {
  const all = effectivePeriodRows(period).map(periodRowToLevel);
  // Só o IMPORTADO substitui lançamentos antigos; a atualização manual soma a diferença por cima deles.
  const imported = all.filter((p) => p.source === "import");
  const covered = (r: CltAdLevelResult) => imported.some(p =>
    r.entry_date >= p.period_start! && r.entry_date <= p.period_end! &&
    (r.creative_id ? r.creative_id === p.creative_id : r.ad_set_id === p.ad_set_id));
  const kept = legacy.filter(r => !covered(r));
  return { rows: [...kept, ...all], excludedLegacy: legacy.length - kept.length };
}

/** Um campo é "não informado" no total quando TODAS as linhas o deixaram sem valor. */
export function unknownFields(rows: object[]): Set<string> {
  if (!rows.length) return new Set();
  const [first, ...rest] = rows.map(r => new Set("unknown" in r && Array.isArray(r.unknown) ? (r.unknown as string[]) : []));
  return new Set([...first].filter(k => rest.every(s => s.has(k))));
}

/**
 * Totais das campanhas (`clt_campaigns.spent_amount/messages/sales`) para
 * painéis e listas que usam a linha da campanha. A importação nunca grava
 * nesses campos (cria com 0 e não altera nos existentes), então o total é o
 * valor que já estava na campanha + a soma dos anúncios importados.
 */
export function withImportedCampaignTotals<T extends { id: string; spent_amount: number | string; messages: number; sales: number }>(campaigns: T[], period: Array<Pick<PeriodMetricFullRow, "campaign_id" | "spend" | "conversations" | "sales"> & Partial<Pick<PeriodMetricFullRow, "creative_id" | "period_start" | "period_end" | "source">>>): T[] {
  const sums = new Map<string, { spend: number; conversations: number; sales: number }>();
  const counted = period.every((p) => p.creative_id && p.period_start && p.period_end) ? effectivePeriodRows(period as Array<PeriodMetricFullRow>) : period;
  for (const m of counted) {
    const s = sums.get(m.campaign_id) ?? { spend: 0, conversations: 0, sales: 0 };
    s.spend = Math.round((s.spend + (num(m.spend) ?? 0)) * 100) / 100;
    s.conversations += num(m.conversations) ?? 0;
    s.sales += num(m.sales) ?? 0;
    sums.set(m.campaign_id, s);
  }
  return campaigns.map(c => {
    const s = sums.get(c.id);
    if (!s) return c;
    return { ...c, spent_amount: Math.round((Number(c.spent_amount || 0) + s.spend) * 100) / 100, messages: Number(c.messages || 0) + s.conversations, sales: Number(c.sales || 0) + s.sales };
  });
}
