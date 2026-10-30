"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { todayKeySaoPaulo } from "@/lib/format";
import { parseImportInput } from "@/lib/import/parse";
import { validateImport, type ImportPreview } from "@/lib/import/validate";
import { buildImportPayload } from "@/lib/import/plan";
import { buildSnapshot } from "@/lib/import/snapshot";

/**
 * Importador Inteligente (públicos + campanhas + conjuntos + anúncios +
 * métricas), JSON ou texto. Fluxo: `preview` (só lê) → usuário revisa e
 * confirma os alertas → `confirm` refaz TODA a leitura e validação no
 * servidor e grava numa única transação (`clt_import_bundle`).
 */

type Period = { start: string; end: string } | null;
type Input = { companyId: string; content: string; period?: Period };

const MIGRATION_HINT = "Aplique no Supabase a migration supabase/migrations/20261030110000_clt_smart_import.sql para habilitar o importador.";
const isMissingSchema = (code?: string) => code === "42703" || code === "42P01" || code === "PGRST204" || code === "PGRST205" || code === "PGRST202" || code === "42883";

function validPeriod(period: Period | undefined): Period | undefined {
  if (!period) return undefined;
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(period.start) || !re.test(period.end)) throw new Error("Período inválido.");
  if (period.end < period.start) throw new Error("O fim do período é anterior ao início.");
  return period;
}

async function context(companyId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sessão expirada. Entre novamente.");
  const db = supabase as unknown as SupabaseClient;
  const { data: company, error } = await db.from("clt_companies").select("id,name").eq("id", companyId).eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  if (!company) throw new Error("Empresa não encontrada.");
  return { db, user, company: company as { id: string; name: string } };
}

async function loadSnapshot(db: SupabaseClient, company: { id: string; name: string }) {
  const { data: campaigns, error: ce } = await db.from("clt_campaigns").select("id,name,meta_campaign_id").eq("company_id", company.id);
  if (ce) throw ce;
  const campaignIds = (campaigns ?? []).map(c => c.id as string);
  const none = ["00000000-0000-0000-0000-000000000000"];
  const [audiences, adSets, legacy, legacyAd, periodMetrics] = await Promise.all([
    db.from("clt_audiences").select("id,name,audience_type,external_key").eq("company_id", company.id),
    db.from("clt_ad_sets").select("id,campaign_id,name,meta_adset_id").in("campaign_id", campaignIds.length ? campaignIds : none),
    db.from("clt_campaign_result_entries").select("campaign_id").in("campaign_id", campaignIds.length ? campaignIds : none),
    db.from("clt_ad_level_results").select("campaign_id").in("campaign_id", campaignIds.length ? campaignIds : none),
    db.from("clt_ad_period_metrics").select("creative_id,period_start,period_end").eq("company_id", company.id),
  ]);
  for (const r of [audiences, adSets, legacy, legacyAd, periodMetrics]) if (r.error) throw r.error;
  const setIds = (adSets.data ?? []).map(s => s.id as string);
  const ads = await db.from("clt_ad_creatives").select("id,ad_set_id,name,meta_ad_id").in("ad_set_id", setIds.length ? setIds : none);
  if (ads.error) throw ads.error;
  return buildSnapshot({
    company,
    audiences: audiences.data ?? [],
    campaigns: campaigns ?? [],
    adSets: adSets.data ?? [],
    ads: ads.data ?? [],
    legacyResults: [...(legacy.data ?? []), ...(legacyAd.data ?? [])],
    periodMetrics: periodMetrics.data ?? [],
  });
}

function describeError(e: unknown): string {
  const code = typeof e === "object" && e && "code" in e ? String((e as { code: unknown }).code) : undefined;
  if (isMissingSchema(code)) return MIGRATION_HINT;
  if (code === "23505") return "Registro duplicado (um ID do Meta ou chave já existe em outro lugar). Nada foi gravado.";
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e && "message" in e) return String((e as { message: unknown }).message);
  return "Erro inesperado.";
}

async function buildPreview(input: Input) {
  const parsed = parseImportInput(input.content);
  if (!parsed.ok) return { error: parsed.error } as const;
  const { db, user, company } = await context(input.companyId);
  const snapshot = await loadSnapshot(db, company);
  const preview = validateImport(parsed.bundle, snapshot, { today: todayKeySaoPaulo(), period: validPeriod(input.period) });
  return { preview, detected: parsed.detected, db, user } as const;
}

export async function previewSmartImportAction(input: Input): Promise<{ error?: string; preview?: ImportPreview; detected?: "json" | "text" }> {
  try {
    const r = await buildPreview(input);
    if ("error" in r) return { error: r.error };
    return { preview: r.preview, detected: r.detected };
  } catch (e) {
    return { error: describeError(e) };
  }
}

export async function confirmSmartImportAction(input: Input & { confirmed: string[] }): Promise<{ error?: string; success?: string; summary?: Record<string, number | string> }> {
  try {
    const r = await buildPreview(input);
    if ("error" in r) return { error: r.error };
    const { preview, db } = r;
    if (!preview.canImport) return { error: "Há erros na validação. Corrija e valide de novo — nada foi gravado." };
    const confirmed = new Set(Array.isArray(input.confirmed) ? input.confirmed : []);
    const pending = preview.confirmationIds.filter(id => !confirmed.has(id));
    if (pending.length) return { error: `Confirme os ${pending.length} alerta(s) marcados antes de importar.` };

    const { data, error } = await db.rpc("clt_import_bundle", { p_company_id: preview.companyId, p_payload: buildImportPayload(preview) });
    if (error) return { error: `Importação cancelada, nada foi gravado: ${describeError(error)}` };

    ["/trabalho", "/trabalho/empresas", "/trabalho/campanhas", "/trabalho/relatorios", "/trabalho/analises", "/trabalho/importar"].forEach(p => revalidatePath(p));
    revalidatePath("/trabalho/empresas/[id]", "page");
    const s = (data ?? {}) as Record<string, number | string>;
    return {
      success: `Importação concluída: ${s.audiences_created ?? 0} públicos criados e ${s.audiences_updated ?? 0} atualizados; ${s.campaigns_created ?? 0} campanhas criadas e ${s.campaigns_updated ?? 0} atualizadas; ${s.ad_sets_created ?? 0}+${s.ad_sets_updated ?? 0} conjuntos; ${s.ads_created ?? 0}+${s.ads_updated ?? 0} anúncios; ${s.metrics_saved ?? 0} registros de métricas.`,
      summary: s,
    };
  } catch (e) {
    return { error: describeError(e) };
  }
}
