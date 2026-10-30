import type { ExistingSnapshot } from "./types";

/** Linhas cruas lidas do banco (Supabase no servidor ou SQL nos testes). */
export type SnapshotRows = {
  company: { id: string; name: string };
  audiences: Array<{ id: string; name: string; audience_type: string; external_key?: string | null }>;
  campaigns: Array<{ id: string; name: string; meta_campaign_id?: string | null }>;
  adSets: Array<{ id: string; campaign_id: string; name: string; meta_adset_id?: string | null }>;
  ads: Array<{ id: string; ad_set_id: string; name: string; meta_ad_id?: string | null }>;
  legacyResults: Array<{ campaign_id: string }>;
  periodMetrics: Array<{ creative_id: string; period_start: string; period_end: string }>;
};

export function buildSnapshot(rows: SnapshotRows): ExistingSnapshot {
  return {
    company: rows.company,
    audiences: rows.audiences.map(a => ({ id: a.id, name: a.name, audience_type: a.audience_type, external_key: a.external_key ?? null })),
    campaigns: rows.campaigns.map(c => ({ id: c.id, name: c.name, meta_campaign_id: c.meta_campaign_id ?? null })),
    adSets: rows.adSets.map(s => ({ id: s.id, campaign_id: s.campaign_id, name: s.name, meta_adset_id: s.meta_adset_id ?? null })),
    ads: rows.ads.map(a => ({ id: a.id, ad_set_id: a.ad_set_id, name: a.name, meta_ad_id: a.meta_ad_id ?? null })),
    legacyResultCampaignIds: [...new Set(rows.legacyResults.map(r => r.campaign_id))],
    periodMetrics: rows.periodMetrics.map(p => ({ creative_id: p.creative_id, period_start: String(p.period_start).slice(0, 10), period_end: String(p.period_end).slice(0, 10) })),
  };
}
