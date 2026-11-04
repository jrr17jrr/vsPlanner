import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { effectivePeriodRows, isManualUpdate, mergeAdLevelResults, type PeriodMetricFullRow } from "@/lib/clt/ad-metrics";
import { isExtraMetric, planAdResultUpdate, type AdMetricKey, type CountedRow, type UpdatePlan, type UpdateRow } from "@/lib/clt/ad-result-update";
import { EXTRA_COLUMNS } from "@/lib/clt/result-metrics";
import { isRateKey, RATE_COLUMNS } from "@/lib/clt/video-rates";
import { todayKeySaoPaulo } from "@/lib/format";
import type { CltAdLevelResult } from "@/types/database.types";

/**
 * Núcleo do "Atualizar resultados" de UM anúncio — usado pelo formulário
 * manual e pelo Importador (atualização parcial). Lê o estado ATUAL do banco
 * (nunca o que a tela enviou), calcula o plano (lib/clt/ad-result-update.ts)
 * e só grava em `apply()`. Assim o importador pode preparar TODOS os anúncios
 * antes de gravar o primeiro (qualquer erro → nada é gravado).
 */
export const AD_RESULTS_MIGRATION = "Aplique a migração 20261104110000_clt_ad_result_updates.sql no Supabase para atualizar resultados.";
export const AD_RESULTS_MIGRATION_EXTRA = "Para salvar engajamento e vídeo (reações, comentários, compartilhamentos, novos seguidores, reproduções de 3s, 75% e 100%), aplique a migração 20261106100000_clt_ad_engagement_video_metrics.sql no Supabase.";
export const AD_RATES_MIGRATION = "Para salvar a Taxa de Gancho e a Taxa de Retenção, aplique a migração 20261108100000_clt_ad_hook_hold_rates.sql no Supabase.";
const PERIOD_COLUMNS = "id,campaign_id,ad_set_id,creative_id,period_start,period_end,spend,conversations,sales,revenue,impressions,reach,link_clicks,leads,source,views,thruplays,engagements";
export const isMissingSchemaError = (e: { code?: string; message?: string }) => ["42703", "PGRST204", "42P01", "PGRST205", "PGRST202", "42883"].includes(String(e.code));

export type PreparedAdUpdate = { plan: UpdatePlan; apply: () => Promise<{ error?: string }> };

export async function prepareAdResultUpdate(
  db: SupabaseClient,
  userId: string,
  creativeId: string,
  values: Partial<Record<AdMetricKey, number | null>>,
  reference?: { start: string; end: string } | null
): Promise<{ error: string } | PreparedAdUpdate> {
  const { data: ad } = await db.from("clt_ad_creatives").select("id,ad_set_id").eq("id", creativeId).eq("user_id", userId).maybeSingle();
  if (!ad) return { error: "Anúncio não encontrado." };
  const { data: set } = await db.from("clt_ad_sets").select("id,campaign_id").eq("id", ad.ad_set_id).eq("user_id", userId).maybeSingle();
  const { data: campaign } = set ? await db.from("clt_campaigns").select("id,starts_on").eq("id", set.campaign_id).eq("user_id", userId).maybeSingle() : { data: null };
  if (!set || !campaign) return { error: "Campanha do anúncio não encontrada." };

  // Colunas de engajamento/vídeo só existem após a migration 20261106100000: sem ela, segue sem esses campos.
  const readPeriod = async (columns: string): Promise<{ data: unknown[] | null; error: { code?: string; message: string } | null }> =>
    await db.from("clt_ad_period_metrics").select(columns).eq("creative_id", creativeId).eq("user_id", userId);
  const missingCol = (e: { code?: string } | null) => !!e && ["42703", "PGRST204"].includes(String(e.code));
  // Taxas de Gancho/Retenção: migration 20261108100000 (sem ela, segue sem esses campos).
  let period = await readPeriod(`${PERIOD_COLUMNS},${EXTRA_COLUMNS},${RATE_COLUMNS}`);
  const ratesReady = !period.error;
  if (missingCol(period.error)) period = await readPeriod(`${PERIOD_COLUMNS},${EXTRA_COLUMNS}`);
  const extrasReady = !period.error;
  if (missingCol(period.error)) period = await readPeriod(PERIOD_COLUMNS);
  const informed = (pred: (k: AdMetricKey) => boolean) => Object.entries(values).some(([k, v]) => pred(k as AdMetricKey) && v !== null && v !== undefined);
  if (!extrasReady && informed(isExtraMetric)) return { error: AD_RESULTS_MIGRATION_EXTRA };
  if (!ratesReady && informed(isRateKey)) return { error: AD_RATES_MIGRATION };
  const [manual, profile] = await Promise.all([
    db.from("clt_ad_level_results").select("*").eq("creative_id", creativeId).eq("user_id", userId),
    db.from("profiles").select("name").eq("id", userId).maybeSingle(),
  ]);
  if (period.error) return { error: isMissingSchemaError(period.error) ? AD_RESULTS_MIGRATION : period.error.message };
  if (manual.error && !isMissingSchemaError(manual.error)) return { error: manual.error.message };

  const periodRows = (period.data ?? []) as unknown as PeriodMetricFullRow[];
  const rows = mergeAdLevelResults((manual.data ?? []) as CltAdLevelResult[], periodRows).rows.filter((r) => r.creative_id === creativeId) as unknown as CountedRow[];
  const updateRows = effectivePeriodRows(periodRows).filter(isManualUpdate).map((r) => ({ ...r, period_start: String(r.period_start).slice(0, 10), period_end: String(r.period_end).slice(0, 10) })) as unknown as UpdateRow[];

  const plan = planAdResultUpdate({ rows, updateRows, values, today: todayKeySaoPaulo(), campaignStart: campaign.starts_on, reference: reference ?? null });
  if ("error" in plan) return { error: plan.error };

  return {
    plan,
    apply: async () => {
      const { error } = await db.rpc("clt_apply_ad_result_update", {
        p_creative_id: creativeId, p_metric_id: plan.metricId, p_period_start: plan.periodStart, p_period_end: plan.periodEnd,
        p_values: plan.values, p_previous: plan.previous, p_updated: plan.updated, p_delta: plan.delta, p_updated_by_name: profile.data?.name ?? null,
      });
      return error ? { error: isMissingSchemaError(error) ? AD_RESULTS_MIGRATION : error.message } : {};
    },
  };
}
