import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { HistoryAdLevelEntry, HistoryAdSet, HistoryCampaign, HistoryCampaignEntry, HistoryInput, HistoryPeriodMetric } from "@/lib/clt/history";

const MISSING = ["42P01", "PGRST205", "PGRST204", "42703"];
const NO_ID = "00000000-0000-0000-0000-000000000000";

/**
 * Carrega, só das campanhas informadas (já filtradas por empresa/módulo),
 * tudo o que o histórico precisa. Tabelas/colunas ainda não criadas
 * (migration pendente) não derrubam a página: o histórico segue com o que existe.
 */
export async function loadHistoryInput(supabase: unknown, campaigns: HistoryCampaign[]): Promise<HistoryInput> {
  const db = supabase as SupabaseClient;
  const ids = campaigns.map(c => c.id);
  if (!ids.length) return { campaigns, adSets: [], campaignEntries: [], adLevelEntries: [], periodMetrics: [] };
  const filter = ids.length ? ids : [NO_ID];
  const [sets, entries, level, period] = await Promise.all([
    // "*" para funcionar antes e depois da coluna result_type existir.
    db.from("clt_ad_sets").select("*").in("campaign_id", filter),
    db.from("clt_campaign_result_entries").select("campaign_id,entry_date,spent_amount,messages,sales,generated_revenue,views,impressions,reach,thruplays,link_clicks,leads,engagements").in("campaign_id", filter),
    db.from("clt_ad_level_results").select("campaign_id,ad_set_id,creative_id,entry_date,spent_amount,messages,sales,generated_revenue,views,impressions,reach,thruplays,link_clicks,leads,engagements").in("campaign_id", filter),
    db.from("clt_ad_period_metrics").select("campaign_id,ad_set_id,creative_id,period_start,period_end,spend,conversations,sales,revenue,impressions,reach,link_clicks,leads").in("campaign_id", filter),
  ]);
  const rows = <T,>(r: { data: unknown; error: { code?: string; message?: string } | null }, label: string): T[] => {
    if (r.error) {
      if (!MISSING.includes(String(r.error.code))) throw new Error(`${label}: ${r.error.message}`);
      return [];
    }
    return (r.data ?? []) as T[];
  };
  return {
    campaigns,
    adSets: rows<HistoryAdSet & { result_type?: string | null }>(sets, "clt_ad_sets").map(s => ({ id: s.id, campaign_id: s.campaign_id, name: s.name, result_type: s.result_type ?? null })),
    campaignEntries: rows<HistoryCampaignEntry>(entries, "clt_campaign_result_entries"),
    adLevelEntries: rows<HistoryAdLevelEntry>(level, "clt_ad_level_results"),
    periodMetrics: rows<HistoryPeriodMetric>(period, "clt_ad_period_metrics"),
  };
}
