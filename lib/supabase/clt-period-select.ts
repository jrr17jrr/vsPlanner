import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Leitura de `clt_ad_period_metrics` com as colunas da migration
 * 20261104110000 (origem e visualizações/ThruPlays/interações). Antes dela,
 * a consulta é refeita sem essas colunas — as telas continuam funcionando,
 * só sem as atualizações manuais.
 */
const MISSING_COLUMN = ["42703", "PGRST204"];

export async function selectAdPeriodMetrics(
  db: unknown,
  baseColumns: string,
  extraColumns: string,
  filter: (q: ReturnType<ReturnType<SupabaseClient["from"]>["select"]>) => PromiseLike<{ data: unknown[] | null; error: { code?: string; message: string } | null }>,
): Promise<{ data: Record<string, unknown>[]; error: { code?: string; message: string } | null }> {
  const client = db as SupabaseClient;
  const first = await filter(client.from("clt_ad_period_metrics").select(`${baseColumns},${extraColumns}`));
  if (!first.error || !MISSING_COLUMN.includes(String(first.error.code))) return { data: (first.data ?? []) as Record<string, unknown>[], error: first.error };
  const second = await filter(client.from("clt_ad_period_metrics").select(baseColumns));
  return { data: (second.data ?? []) as Record<string, unknown>[], error: second.error };
}

export const PERIOD_EXTRA_COLUMNS = "creative_id,source,views,thruplays,engagements";
