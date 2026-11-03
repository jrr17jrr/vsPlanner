import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { mergePeriodResults, periodResultsToEntries, type PeriodEntry, type PeriodMetricRow } from "@/lib/clt/period-results";
import { PERIOD_EXTRA_COLUMNS, selectAdPeriodMetrics } from "@/lib/supabase/clt-period-select";
import type { CltCampaignResultEntry } from "@/types/database.types";

/**
 * Junta os resultados importados por período (nível anúncio) aos
 * lançamentos antigos, no MESMO formato que dashboards, análises e o PDF
 * já usam — sem duplicar (ver lib/clt/period-results.ts). Se a migration
 * do importador ainda não foi aplicada, devolve só os lançamentos antigos.
 */
export async function withImportedPeriodResults(
  supabase: unknown,
  campaignIds: string[],
  legacy: CltCampaignResultEntry[],
): Promise<{ results: PeriodEntry[]; legacyKept: CltCampaignResultEntry[]; excludedLegacy: number; crossMonthPeriods: number; engagementVideo: boolean }> {
  if (!campaignIds.length) return { results: legacy, legacyKept: legacy, excludedLegacy: 0, crossMonthPeriods: 0, engagementVideo: false };
  const db = supabase as SupabaseClient;
  const { data, error, engagementVideo } = await selectAdPeriodMetrics(db, "campaign_id,period_start,period_end,spend,conversations,sales,revenue,impressions,reach,link_clicks,leads", PERIOD_EXTRA_COLUMNS, (q) => q.in("campaign_id", campaignIds), { engagementVideo: true });
  if (error) {
    // 42P01/PGRST205: tabela ainda não existe (migration pendente) — segue sem importados.
    if (!["42P01", "PGRST205", "PGRST204", "42703"].includes(String(error.code))) console.error("clt_ad_period_metrics", error);
    return { results: legacy, legacyKept: legacy, excludedLegacy: 0, crossMonthPeriods: 0, engagementVideo: false };
  }
  const merged = mergePeriodResults(legacy, (data ?? []) as unknown as PeriodMetricRow[]);
  const imported = periodResultsToEntries(merged.imported);
  return { results: [...merged.legacy, ...imported], legacyKept: merged.legacy, excludedLegacy: merged.excludedLegacy, crossMonthPeriods: merged.crossMonthPeriods, engagementVideo };
}
