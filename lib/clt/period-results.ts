import type { CltCampaignResultEntry } from "@/types/database.types";

/**
 * Consolida as métricas importadas por período (`clt_ad_period_metrics`,
 * nível anúncio) com os lançamentos antigos (`clt_campaign_result_entries`,
 * por campanha/dia), SEM contar duas vezes:
 *
 *  - anúncios → somados por campanha e período (só valores informados;
 *    `null` não vira zero na origem, mas não soma nada);
 *  - cada período importado vira UMA linha de resultado da campanha,
 *    datada no ÚLTIMO dia do período (é nesse mês que ela entra nos
 *    relatórios mensais);
 *  - lançamentos antigos da MESMA campanha com data dentro de um período
 *    importado são descartados (o importado prevalece);
 *  - alcance não entra (não é somável entre anúncios).
 */

export type PeriodMetricRow = {
  campaign_id: string;
  period_start: string;
  period_end: string;
  spend: number | string | null;
  conversations: number | null;
  sales: number | null;
  revenue: number | string | null;
  impressions: number | null;
};

export type LegacyResultRow = { campaign_id: string; entry_date: string };

export type PeriodResult = {
  campaign_id: string;
  entry_date: string;
  period_start: string;
  period_end: string;
  spent_amount: number;
  messages: number;
  sales: number;
  generated_revenue: number;
  impressions: number;
  views: number;
  thruplays: number;
  source: "import";
};

const n = (v: number | string | null | undefined) => (v === null || v === undefined || v === "" ? 0 : Number(v));

export function mergePeriodResults<T extends LegacyResultRow>(legacy: T[], periodMetrics: PeriodMetricRow[]) {
  const groups = new Map<string, PeriodResult>();
  for (const m of periodMetrics) {
    const start = String(m.period_start).slice(0, 10), end = String(m.period_end).slice(0, 10);
    const key = `${m.campaign_id}|${start}|${end}`;
    const g = groups.get(key) ?? { campaign_id: m.campaign_id, entry_date: end, period_start: start, period_end: end, spent_amount: 0, messages: 0, sales: 0, generated_revenue: 0, impressions: 0, views: 0, thruplays: 0, source: "import" as const };
    g.spent_amount = Math.round((g.spent_amount + n(m.spend)) * 100) / 100;
    g.messages += n(m.conversations);
    g.sales += n(m.sales);
    g.generated_revenue = Math.round((g.generated_revenue + n(m.revenue)) * 100) / 100;
    g.impressions += n(m.impressions);
    groups.set(key, g);
  }
  const periods = [...groups.values()];
  const covered = (r: LegacyResultRow) => periods.some(p => p.campaign_id === r.campaign_id && r.entry_date >= p.period_start && r.entry_date <= p.period_end);
  const kept = legacy.filter(r => !covered(r));
  return {
    legacy: kept,
    imported: periods,
    excludedLegacy: legacy.length - kept.length,
    crossMonthPeriods: periods.filter(p => p.period_start.slice(0, 7) !== p.period_end.slice(0, 7)).length,
  };
}

/** Períodos importados no formato de `clt_campaign_result_entries` (o que dashboards, análises e o PDF já usam). */
export function periodResultsToEntries(imported: PeriodResult[]): CltCampaignResultEntry[] {
  return imported.map(p => ({
    id: `import:${p.campaign_id}:${p.period_start}:${p.period_end}`,
    user_id: "",
    campaign_id: p.campaign_id,
    entry_date: p.entry_date,
    spent_amount: p.spent_amount,
    messages: p.messages,
    sales: p.sales,
    views: 0,
    appointments: 0,
    impressions: p.impressions,
    reach: 0,
    profile_visits: 0,
    link_clicks: 0,
    engagements: 0,
    thruplays: 0,
    leads: 0,
    generated_revenue: p.generated_revenue,
    notes: `Importado por anúncio — período ${p.period_start} a ${p.period_end} (soma dos valores informados).`,
  }));
}
