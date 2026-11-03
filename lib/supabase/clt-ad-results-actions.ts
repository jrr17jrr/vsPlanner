"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { effectivePeriodRows, isManualUpdate, mergeAdLevelResults, type PeriodMetricFullRow } from "@/lib/clt/ad-metrics";
import { planAdResultUpdate, validateReference, type AdMetricKey, type CountedRow, type UpdateRow } from "@/lib/clt/ad-result-update";
import { todayKeySaoPaulo } from "@/lib/format";
import type { CltAdLevelResult } from "@/types/database.types";

type State = { error?: string; success?: string };
const MIGRATION = "Aplique a migração 20261104110000_clt_ad_result_updates.sql no Supabase para atualizar resultados.";
const missing = (e: { code?: string; message?: string }) => ["42703", "PGRST204", "42P01", "PGRST205", "PGRST202", "42883"].includes(String(e.code));

function refreshViews() {
  for (const path of ["/trabalho", "/trabalho/empresas", "/trabalho/campanhas", "/trabalho/analises", "/trabalho/relatorios"]) revalidatePath(path);
  revalidatePath("/trabalho/empresas/[id]", "page");
  revalidatePath("/visionario/mkt", "layout");
}

/**
 * "Editar período" de uma atualização já registrada: só muda QUANDO os
 * resultados contam (o total do anúncio não muda; nada é somado de novo).
 * Tudo no banco, numa transação (clt_move_ad_result_update), com auditoria.
 */
export async function moveCltAdResultUpdatePeriodAction(updateId: string, reference: { start: string; end: string }): Promise<State> {
  try {
    const supabase = await createSupabaseServerClient();
    const db = supabase as unknown as SupabaseClient;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Sessão expirada." };
    const { data: update } = await db.from("clt_ad_result_updates").select("id,creative_id").eq("id", updateId).eq("user_id", user.id).maybeSingle();
    if (!update) return { error: "Atualização não encontrada." };
    const period = await db.from("clt_ad_period_metrics").select("id,campaign_id,ad_set_id,creative_id,period_start,period_end,spend,conversations,sales,revenue,impressions,reach,link_clicks,leads,source").eq("creative_id", update.creative_id).eq("user_id", user.id);
    if (period.error) return { error: missing(period.error) ? MIGRATION : period.error.message };
    const rows = mergeAdLevelResults([], (period.data ?? []) as PeriodMetricFullRow[]).rows as unknown as CountedRow[];
    const invalid = validateReference(reference, todayKeySaoPaulo(), rows);
    if (invalid) return { error: invalid };
    const { data: profile } = await db.from("profiles").select("name").eq("id", user.id).maybeSingle();
    const { error } = await db.rpc("clt_move_ad_result_update", { p_update_id: updateId, p_start: reference.start, p_end: reference.end, p_actor_name: profile?.name ?? null });
    if (error) return { error: missing(error) ? "Aplique a migração 20261105100000_clt_ad_result_period_edit.sql no Supabase para editar períodos." : error.message };
    refreshViews();
    return { success: "Período corrigido. Os totais do anúncio continuam os mesmos; relatórios e indicadores já usam o novo período." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível editar o período." };
  }
}

/**
 * "Atualizar resultados" de um anúncio: recebe os NOVOS TOTAIS acumulados e
 * grava só a diferença (lib/clt/ad-result-update.ts). O total atual é
 * recalculado AQUI, a partir do banco — nunca do que a tela enviou. Só o dono
 * do anúncio/empresa (RLS + conferência explícita); vale para CLT e MKT.
 */
export async function updateCltAdResultsAction(creativeId: string, values: Partial<Record<AdMetricKey, number | null>>, reference?: { start: string; end: string } | null): Promise<State> {
  try {
    const supabase = await createSupabaseServerClient();
    const db = supabase as unknown as SupabaseClient;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Sessão expirada." };

    const { data: ad } = await db.from("clt_ad_creatives").select("id,ad_set_id").eq("id", creativeId).eq("user_id", user.id).maybeSingle();
    if (!ad) return { error: "Anúncio não encontrado." };
    const { data: set } = await db.from("clt_ad_sets").select("id,campaign_id").eq("id", ad.ad_set_id).eq("user_id", user.id).maybeSingle();
    const { data: campaign } = set ? await db.from("clt_campaigns").select("id,starts_on").eq("id", set.campaign_id).eq("user_id", user.id).maybeSingle() : { data: null };
    if (!set || !campaign) return { error: "Campanha do anúncio não encontrada." };

    const [period, manual, profile] = await Promise.all([
      db.from("clt_ad_period_metrics").select("id,campaign_id,ad_set_id,creative_id,period_start,period_end,spend,conversations,sales,revenue,impressions,reach,link_clicks,leads,source,views,thruplays,engagements").eq("creative_id", creativeId).eq("user_id", user.id),
      db.from("clt_ad_level_results").select("*").eq("creative_id", creativeId).eq("user_id", user.id),
      db.from("profiles").select("name").eq("id", user.id).maybeSingle(),
    ]);
    if (period.error) return { error: missing(period.error) ? MIGRATION : period.error.message };
    if (manual.error && !missing(manual.error)) return { error: manual.error.message };

    const periodRows = (period.data ?? []) as PeriodMetricFullRow[];
    const rows = mergeAdLevelResults((manual.data ?? []) as CltAdLevelResult[], periodRows).rows.filter((r) => r.creative_id === creativeId) as unknown as CountedRow[];
    const updateRows = effectivePeriodRows(periodRows).filter(isManualUpdate).map((r) => ({ ...r, period_start: String(r.period_start).slice(0, 10), period_end: String(r.period_end).slice(0, 10) })) as unknown as UpdateRow[];

    // Período de REFERÊNCIA (quando os resultados aconteceram); a data do registro é o created_at do histórico.
    const plan = planAdResultUpdate({ rows, updateRows, values, today: todayKeySaoPaulo(), campaignStart: campaign.starts_on, reference: reference ?? null });
    if ("error" in plan) return { error: plan.error };

    const { error } = await db.rpc("clt_apply_ad_result_update", {
      p_creative_id: creativeId, p_metric_id: plan.metricId, p_period_start: plan.periodStart, p_period_end: plan.periodEnd,
      p_values: plan.values, p_previous: plan.previous, p_updated: plan.updated, p_delta: plan.delta, p_updated_by_name: profile.data?.name ?? null,
    });
    if (error) return { error: missing(error) ? MIGRATION : error.message };

    refreshViews();
    return { success: plan.mode === "ajuste" ? "Resultados atualizados (ajuste da última atualização)." : "Resultados atualizados. Conjunto, campanha, empresa e relatórios já refletem os novos totais." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível atualizar os resultados." };
  }
}
