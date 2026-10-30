import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { mergePeriodResults, type PeriodMetricRow } from "@/lib/clt/period-results";
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
): Promise<{ results: CltCampaignResultEntry[]; excludedLegacy: number; crossMonthPeriods: number }> {
  if (!campaignIds.length) return { results: legacy, excludedLegacy: 0, crossMonthPeriods: 0 };
  const db = supabase as SupabaseClient;
  const { data, error } = await db
    .from("clt_ad_period_metrics")
    .select("campaign_id,period_start,period_end,spend,conversations,sales,revenue,impressions")
    .in("campaign_id", campaignIds);
  if (error) {
    // 42P01/PGRST205: tabela ainda não existe (migration pendente) — segue sem importados.
    if (!["42P01", "PGRST205", "PGRST204", "42703"].includes(String(error.code))) console.error("clt_ad_period_metrics", error);
    return { results: legacy, excludedLegacy: 0, crossMonthPeriods: 0 };
  }
  const merged = mergePeriodResults(legacy, (data ?? []) as PeriodMetricRow[]);
  const imported: CltCampaignResultEntry[] = merged.imported.map(p => ({
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
  return { results: [...merged.legacy, ...imported], excludedLegacy: merged.excludedLegacy, crossMonthPeriods: merged.crossMonthPeriods };
}
