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

/**
 * `schemaReady=false`: a migration do importador ainda não foi aplicada.
 * A prévia continua funcionando (lendo só as colunas antigas, vínculo por
 * nome exato), mas a gravação fica bloqueada até aplicar a migration.
 */
async function loadSnapshot(db: SupabaseClient, company: { id: string; name: string }, schemaReady = true): Promise<{ snapshot: ReturnType<typeof buildSnapshot>; schemaReady: boolean }> {
  const cols = (full: string, legacy: string) => (schemaReady ? full : legacy);
  const { data: campaigns, error: ce } = await db.from("clt_campaigns").select(cols("id,name,meta_campaign_id", "id,name")).eq("company_id", company.id);
  if (ce) { if (schemaReady && isMissingSchema(ce.code)) return loadSnapshot(db, company, false); throw ce; }
  const campaignRows = (campaigns ?? []) as unknown as Array<{ id: string; name: string; meta_campaign_id?: string | null }>;
  const campaignIds = campaignRows.map(c => c.id);
  const none = ["00000000-0000-0000-0000-000000000000"];
  const [audiences, adSets, legacy, legacyAd, periodMetrics] = await Promise.all([
    db.from("clt_audiences").select(cols("id,name,audience_type,external_key", "id,name,audience_type")).eq("company_id", company.id),
    db.from("clt_ad_sets").select(cols("id,campaign_id,name,meta_adset_id", "id,campaign_id,name")).in("campaign_id", campaignIds.length ? campaignIds : none),
    db.from("clt_campaign_result_entries").select("campaign_id").in("campaign_id", campaignIds.length ? campaignIds : none),
    db.from("clt_ad_level_results").select("campaign_id").in("campaign_id", campaignIds.length ? campaignIds : none),
    schemaReady ? db.from("clt_ad_period_metrics").select("creative_id,period_start,period_end").eq("company_id", company.id) : Promise.resolve({ data: [], error: null }),
  ]);
  for (const r of [audiences, adSets, legacy, legacyAd, periodMetrics]) if (r.error) {
    if (schemaReady && isMissingSchema(r.error.code)) return loadSnapshot(db, company, false);
    throw r.error;
  }
  const setIds = ((adSets.data ?? []) as unknown as Array<{ id: string }>).map(s => s.id);
  const ads = await db.from("clt_ad_creatives").select(cols("id,ad_set_id,name,meta_ad_id", "id,ad_set_id,name")).in("ad_set_id", setIds.length ? setIds : none);
  if (ads.error) { if (schemaReady && isMissingSchema(ads.error.code)) return loadSnapshot(db, company, false); throw ads.error; }
  type Rows = Parameters<typeof buildSnapshot>[0];
  const snapshot = buildSnapshot({
    company,
    audiences: (audiences.data ?? []) as unknown as Rows["audiences"],
    campaigns: campaignRows,
    adSets: (adSets.data ?? []) as unknown as Rows["adSets"],
    ads: (ads.data ?? []) as unknown as Rows["ads"],
    legacyResults: [...(legacy.data ?? []), ...(legacyAd.data ?? [])] as Rows["legacyResults"],
    periodMetrics: (periodMetrics.data ?? []) as Rows["periodMetrics"],
  });
  return { snapshot, schemaReady };
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
  const { snapshot, schemaReady } = await loadSnapshot(db, company);
  const preview = validateImport(parsed.bundle, snapshot, { today: todayKeySaoPaulo(), period: validPeriod(input.period) });
  return { preview, detected: parsed.detected, schemaReady, db, user } as const;
}

export async function previewSmartImportAction(input: Input): Promise<{ error?: string; preview?: ImportPreview; detected?: "json" | "text"; schemaReady?: boolean; migrationHint?: string }> {
  try {
    const r = await buildPreview(input);
    if ("error" in r) return { error: r.error };
    return { preview: r.preview, detected: r.detected, schemaReady: r.schemaReady, migrationHint: r.schemaReady ? undefined : MIGRATION_HINT };
  } catch (e) {
    return { error: describeError(e) };
  }
}

export async function confirmSmartImportAction(input: Input & { confirmed: string[] }): Promise<{ error?: string; success?: string; summary?: Record<string, number | string> }> {
  try {
    const r = await buildPreview(input);
    if ("error" in r) return { error: r.error };
    const { preview, db } = r;
    if (!r.schemaReady) return { error: `Nada foi gravado. ${MIGRATION_HINT}` };
    if (!preview.canImport) return { error: "Há erros na validação. Corrija e valide de novo — nada foi gravado." };
    const confirmed = new Set(Array.isArray(input.confirmed) ? input.confirmed : []);
    const pending = preview.confirmationIds.filter(id => !confirmed.has(id));
    if (pending.length) return { error: `Confirme os ${pending.length} alerta(s) marcados antes de importar.` };

    const { data, error } = await db.rpc("clt_import_bundle", { p_company_id: preview.companyId, p_payload: buildImportPayload(preview) });
    if (error) return { error: `Importação cancelada, nada foi gravado: ${describeError(error)}` };

    // Tipo de resultado por conjunto (opcional no JSON): só preenche quem veio no arquivo, sem tocar em métricas.
    const typed = preview.campaigns.flatMap(c => c.adSets.filter(s => s.resultType).map(s => ({ campaign: c, set: s })));
    let typeWarning = "";
    if (typed.length) {
      const { data: rows } = await db.from("clt_ad_sets").select("id,name,meta_adset_id,campaign_id,clt_campaigns!inner(company_id,name,meta_campaign_id)").eq("clt_campaigns.company_id", preview.companyId);
      for (const { campaign, set } of typed) {
        const match = (rows ?? []).find((r: { name: string; meta_adset_id: string | null; clt_campaigns: unknown }) => {
          const cmp = (Array.isArray(r.clt_campaigns) ? r.clt_campaigns[0] : r.clt_campaigns) as { name: string; meta_campaign_id: string | null };
          const sameCampaign = campaign.metaId ? cmp.meta_campaign_id === campaign.metaId : cmp.name === campaign.name;
          return sameCampaign && (set.metaId ? r.meta_adset_id === set.metaId : r.name === set.name);
        }) as { id: string } | undefined;
        if (!match) continue;
        const { error: typeError } = await db.from("clt_ad_sets").update({ result_type: set.resultType }).eq("id", match.id);
        if (typeError) { typeWarning = " O tipo de resultado dos conjuntos não foi gravado (atualização do banco pendente: clt_ad_sets.result_type)."; break; }
      }
    }
    ["/trabalho", "/trabalho/empresas", "/trabalho/campanhas", "/trabalho/relatorios", "/trabalho/analises", "/trabalho/importar"].forEach(p => revalidatePath(p));
    revalidatePath("/trabalho/empresas/[id]", "page");
    revalidatePath("/visionario/mkt", "layout");
    const s = (data ?? {}) as Record<string, number | string>;
    return {
      success: `Importação concluída: ${s.audiences_created ?? 0} públicos criados e ${s.audiences_updated ?? 0} atualizados; ${s.campaigns_created ?? 0} campanhas criadas e ${s.campaigns_updated ?? 0} atualizadas; ${s.ad_sets_created ?? 0}+${s.ad_sets_updated ?? 0} conjuntos; ${s.ads_created ?? 0}+${s.ads_updated ?? 0} anúncios; ${s.metrics_saved ?? 0} registros de métricas.${typeWarning}`,
      summary: s,
    };
  } catch (e) {
    return { error: describeError(e) };
  }
}
