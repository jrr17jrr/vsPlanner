import { METRIC_KEYS } from "./types";
import type { ImportPreview } from "./validate";

/**
 * Converte a prévia validada no payload de `clt_import_bundle()` (uma única
 * transação no Postgres). Só leva o que foi informado: `null` continua
 * `null` e não sobrescreve dados existentes.
 */
export type ImportPayload = ReturnType<typeof buildImportPayload>;

export function buildImportPayload(preview: ImportPreview) {
  return {
    source_format: preview.sourceFormat,
    period: preview.period,
    audiences: preview.audiences.map(a => ({
      ref: a.ref,
      existing_id: a.existingId,
      name: a.name,
      audience_type: a.dbType,
      external_key: a.externalKey,
      settings: a.settings,
      source_ref: a.source?.inBundle ? a.source.ref : null,
      source_existing_id: a.source && !a.source.inBundle ? a.source.existingId : null,
    })),
    campaigns: preview.campaigns.map(c => ({
      existing_id: c.existingId,
      meta_campaign_id: c.metaId,
      name: c.name,
      objective: c.objective,
      notes: c.notes,
      daily_budget: c.dailyBudget,
      budget_type: c.budgetType,
      starts_on: c.startsOn,
      ends_on: c.endsOn,
      campaign_status: c.status,
      // Status só é alterado em campanha existente se veio explícito no arquivo.
      status_explicit: c.action === "create" || c.statusExplicit,
      reconciliation: c.reported ? {
        reported_spend: c.reported.spend,
        reported_conversations: c.reported.conversations,
        reported_impressions: c.reported.impressions,
        unallocated_spend: c.difference?.spend ?? c.reported.unallocatedSpend,
        unallocated_conversations: c.difference?.conversations ?? c.reported.unallocatedConversations,
      } : null,
      ad_sets: c.adSets.map(s => ({
        existing_id: s.existingId,
        meta_adset_id: s.metaId,
        name: s.name,
        audience_ref: s.audience?.inBundle ? s.audience.ref : null,
        audience_existing_id: s.audience && !s.audience.inBundle ? s.audience.existingId : null,
        daily_budget: s.dailyBudget,
        starts_at: s.startAt,
        ends_at: s.endAt,
        status: s.status,
        placements: s.placements,
        notes: s.notes,
        ads: s.ads.map(ad => ({
          existing_id: ad.existingId,
          meta_ad_id: ad.metaId,
          name: ad.name,
          format: ad.format,
          post_id: ad.postId,
          creative_label: ad.creativeLabel,
          ad_copy: ad.adCopy,
          notes: ad.notes,
          metrics: ad.hasMetrics ? Object.fromEntries(METRIC_KEYS.map(k => [k, ad.metrics[k]])) : null,
        })),
      })),
    })),
  };
}
