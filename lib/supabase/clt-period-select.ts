import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { EXTRA_COLUMNS } from "@/lib/clt/result-metrics";
import { RATE_COLUMNS } from "@/lib/clt/video-rates";

/**
 * Leitura de `clt_ad_period_metrics` tolerante a migrations pendentes:
 *  1. base + extras + engajamento/vídeo (migration 20261106100000);
 *  2. base + extras (origem e visualizações/ThruPlays/interações — 20261104110000);
 *  3. só base.
 * As telas continuam funcionando em qualquer estágio; `engagementVideo`
 * diz se as colunas novas existem (sem elas, os campos ficam desativados).
 */
const MISSING_COLUMN = ["42703", "PGRST204"];

type Filter = (q: ReturnType<ReturnType<SupabaseClient["from"]>["select"]>) => PromiseLike<{ data: unknown[] | null; error: { code?: string; message: string } | null }>;

export async function selectAdPeriodMetrics(
  db: unknown,
  baseColumns: string,
  extraColumns: string,
  filter: Filter,
  options: { engagementVideo?: boolean } = {},
): Promise<{ data: Record<string, unknown>[]; error: { code?: string; message: string } | null; engagementVideo: boolean; rates: boolean }> {
  const client = db as SupabaseClient;
  // 0. + Taxas de Gancho/Retenção (migration 20261108100000) — sem ela, cai para o nível seguinte.
  const tiers = [...(options.engagementVideo ? [`${baseColumns},${extraColumns},${EXTRA_COLUMNS},${RATE_COLUMNS}`, `${baseColumns},${extraColumns},${EXTRA_COLUMNS}`] : []), `${baseColumns},${extraColumns}`, baseColumns];
  let last: { data: unknown[] | null; error: { code?: string; message: string } | null } = { data: [], error: null };
  for (let i = 0; i < tiers.length; i++) {
    last = await filter(client.from("clt_ad_period_metrics").select(tiers[i]));
    if (!last.error || !MISSING_COLUMN.includes(String(last.error.code))) {
      const ev = !!options.engagementVideo && i <= 1 && !last.error;
      return { data: (last.data ?? []) as Record<string, unknown>[], error: last.error, engagementVideo: ev, rates: ev && i === 0 };
    }
  }
  return { data: (last.data ?? []) as Record<string, unknown>[], error: last.error, engagementVideo: false, rates: false };
}

export const PERIOD_EXTRA_COLUMNS = "creative_id,source,views,thruplays,engagements";
