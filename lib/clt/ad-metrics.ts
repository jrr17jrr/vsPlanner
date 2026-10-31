import type { CltAdLevelResult } from "@/types/database.types";

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
};

/** Campos de `CltAdLevelResult` que a importação não traz (sempre "não informado"). */
const NOT_IMPORTED = ["views", "engagements", "thruplays", "profile_visits", "appointments"] as const;

export type AdLevelRow = CltAdLevelResult & {
  /** Presentes só nas linhas importadas por período. */
  period_start?: string;
  period_end?: string;
  source?: "import";
  /** Campos não informados nesta linha. */
  unknown?: string[];
};

const num = (v: number | string | null | undefined) => (v === null || v === undefined || v === "" ? null : Number(v));
const day = (d: string) => String(d).slice(0, 10);

export function periodRowToLevel(m: PeriodMetricFullRow): AdLevelRow {
  const fields: Array<[keyof CltAdLevelResult, number | null]> = [
    ["spent_amount", num(m.spend)],
    ["messages", num(m.conversations)],
    ["sales", num(m.sales)],
    ["generated_revenue", num(m.revenue)],
    ["impressions", num(m.impressions)],
    ["reach", num(m.reach)],
    ["link_clicks", num(m.link_clicks)],
    ["leads", num(m.leads)],
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
    source: "import" as const,
    views: 0, engagements: 0, thruplays: 0, profile_visits: 0, appointments: 0,
    unknown: [...NOT_IMPORTED, ...fields.filter(([, v]) => v === null).map(([k]) => k)],
  } as AdLevelRow;
  for (const [k, v] of fields) (row as Record<string, unknown>)[k] = v ?? 0;
  return row;
}

export function mergeAdLevelResults(legacy: CltAdLevelResult[], period: PeriodMetricFullRow[]): { rows: AdLevelRow[]; excludedLegacy: number } {
  const imported = period.map(periodRowToLevel);
  const covered = (r: CltAdLevelResult) => imported.some(p =>
    r.entry_date >= p.period_start! && r.entry_date <= p.period_end! &&
    (r.creative_id ? r.creative_id === p.creative_id : r.ad_set_id === p.ad_set_id));
  const kept = legacy.filter(r => !covered(r));
  return { rows: [...kept, ...imported], excludedLegacy: legacy.length - kept.length };
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
export function withImportedCampaignTotals<T extends { id: string; spent_amount: number | string; messages: number; sales: number }>(campaigns: T[], period: Array<Pick<PeriodMetricFullRow, "campaign_id" | "spend" | "conversations" | "sales">>): T[] {
  const sums = new Map<string, { spend: number; conversations: number; sales: number }>();
  for (const m of period) {
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
