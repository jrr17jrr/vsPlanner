"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { todayKeySaoPaulo } from "@/lib/format";
import { parseImportInput } from "@/lib/import/parse";
import { validateImport, type ImportPreview, type MetricChange, type PeriodTargetPreview, type PreviewAd } from "@/lib/import/validate";
import { informedColumns, planRowChanges, resolvePeriodTarget, type PeriodRow } from "@/lib/import/period-target";
import { BASE_TO_AD_KEY, EXTRA_IMPORT_KEYS, EXTRA_IMPORT_LABEL, METRIC_KEYS, hasExtraMetrics, type ImportBundle } from "@/lib/import/types";
import { AD_METRICS, type AdMetricKey } from "@/lib/clt/ad-result-update";
import { AD_RATES_MIGRATION, AD_RESULTS_MIGRATION_EXTRA, prepareAdResultUpdate, type PreparedAdUpdate } from "@/lib/supabase/clt-ad-results-core";

/** Coluna ausente no banco: qual migration falta (taxas → 20261108100000; engajamento/vídeo → 20261106100000). */
const migrationHint = (cols: Record<string, unknown>) => ("hook_rate" in cols || "hold_rate" in cols ? `${AD_RATES_MIGRATION} ${AD_RESULTS_MIGRATION_EXTRA}` : AD_RESULTS_MIGRATION_EXTRA);
import { buildImportPayload } from "@/lib/import/plan";
import { collectInfoTargets, countInfoChanges, INFO_TABLE, planInfoChanges, withoutNewColumns, type InfoTarget } from "@/lib/import/info-plan";
import { INFO_MIGRATION } from "@/lib/clt/registered-info";
import { buildSnapshot } from "@/lib/import/snapshot";
import { assertCompanyInModule } from "@/lib/supabase/clt-scope";

/**
 * Importador Inteligente (públicos + campanhas + conjuntos + anúncios +
 * métricas), JSON ou texto. Fluxo: `preview` (só lê) → usuário revisa e
 * confirma os alertas → `confirm` refaz TODA a leitura e validação no
 * servidor e grava numa única transação (`clt_import_bundle`).
 */

type Period = { start: string; end: string } | null;
/** `module`: quando informado (Central de Importação), a empresa precisa ser desse módulo — CLT e MKT nunca se misturam. */
/** `targets`: registro escolhido por anúncio (creative_id → id do registro) quando há períodos sobrepostos. */
type Input = { companyId: string; content: string; period?: Period; module?: "clt" | "mkt"; targets?: Record<string, string> };

const UUIDISH = /^[0-9a-zA-Z-]{1,64}$/;
function validTargets(t: unknown): Record<string, string> {
  if (!t || typeof t !== "object") return {};
  return Object.fromEntries(Object.entries(t as Record<string, unknown>).filter(([k, v]) => UUIDISH.test(k) && typeof v === "string" && UUIDISH.test(v)) as Array<[string, string]>);
}

const MIGRATION_HINT = "Aplique no Supabase a migration supabase/migrations/20261030110000_clt_smart_import.sql para habilitar o importador.";
const isMissingSchema = (code?: string) => code === "42703" || code === "42P01" || code === "PGRST204" || code === "PGRST205" || code === "PGRST202" || code === "42883";

function validPeriod(period: Period | undefined): Period | undefined {
  if (!period) return undefined;
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(period.start) || !re.test(period.end)) throw new Error("Período inválido.");
  if (period.end < period.start) throw new Error("O fim do período é anterior ao início.");
  return period;
}

async function context(companyId: string, module?: "clt" | "mkt") {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sessão expirada. Entre novamente.");
  const db = supabase as unknown as SupabaseClient;
  const { data: company, error } = await db.from("clt_companies").select("id,name").eq("id", companyId).eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  if (!company) throw new Error("Empresa não encontrada.");
  if (module && !(await assertCompanyInModule(supabase, user.id, companyId, module))) throw new Error("Empresa não encontrada neste módulo.");
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

function refreshImportViews() {
  ["/trabalho", "/trabalho/empresas", "/trabalho/campanhas", "/trabalho/relatorios", "/trabalho/analises", "/importar"].forEach(p => revalidatePath(p));
  revalidatePath("/trabalho/empresas/[id]", "page");
  revalidatePath("/visionario/mkt", "layout");
}

function describeError(e: unknown): string {
  const code = typeof e === "object" && e && "code" in e ? String((e as { code: unknown }).code) : undefined;
  if (isMissingSchema(code)) return MIGRATION_HINT;
  if (code === "23505") return "Registro duplicado (um ID do Meta ou chave já existe em outro lugar). Nada foi gravado.";
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e && "message" in e) return String((e as { message: unknown }).message);
  return "Erro inesperado.";
}

/** Valores informados de um anúncio no formato do "Atualizar resultados" (só o que veio no texto). */
function adValues(ad: PreviewAd): Partial<Record<AdMetricKey, number>> {
  const out: Partial<Record<AdMetricKey, number>> = {};
  for (const k of METRIC_KEYS) if (ad.metrics[k] !== null) out[BASE_TO_AD_KEY[k] as AdMetricKey] = ad.metrics[k]!;
  for (const k of EXTRA_IMPORT_KEYS) { const v = ad.extraMetrics?.[k]; if (v !== null && v !== undefined) out[k as AdMetricKey] = v; }
  return out;
}
const LABEL: Record<string, string> = {
  ...Object.fromEntries(AD_METRICS.map((m) => [m.key, m.label.replace(/ \(R\$\)$/, "")])),
  ...Object.fromEntries(Object.entries(EXTRA_IMPORT_LABEL)),
};

/**
 * Atualização parcial: prepara TODOS os anúncios (lendo os totais atuais do
 * banco) antes de qualquer gravação. "Nenhum valor mudou" não é erro — o
 * anúncio só fica marcado como sem mudanças.
 */
async function prepareMetricsUpdate(db: SupabaseClient, userId: string, preview: ImportPreview) {
  const prepared: PreparedAdUpdate[] = [];
  const changes: MetricChange[] = [];
  for (const c of preview.campaigns) for (const s of c.adSets) for (const ad of s.ads) {
    if (!ad.existingId || !ad.hasMetrics) continue;
    const values = adValues(ad);
    const r = await prepareAdResultUpdate(db, userId, ad.existingId, values, null);
    const base = { creativeId: ad.existingId, campaign: c.name, adSet: s.name, adSetAutoIdentified: !!s.autoIdentified, ad: ad.name };
    const sameOf = (updated: Record<string, unknown>) => (Object.keys(values) as AdMetricKey[]).filter((k) => !(k in updated)).map((k) => ({ key: k, label: LABEL[k] ?? k, value: values[k]! }));
    if ("error" in r) {
      if (r.error === "Nenhum valor mudou.") { changes.push({ ...base, periodStart: null, periodEnd: null, changes: [], same: sameOf({}), unchanged: true }); continue; }
      preview.issues.push({ id: `metrics-plan:${ad.existingId}`, level: "error", path: `${c.name} › ${ad.name}`, message: r.error });
      continue;
    }
    prepared.push(r);
    changes.push({
      ...base, periodStart: r.plan.periodStart, periodEnd: r.plan.periodEnd, unchanged: false, same: sameOf(r.plan.updated),
      changes: (Object.keys(r.plan.updated) as AdMetricKey[]).map((k) => ({ key: k, label: LABEL[k] ?? k, before: r.plan.previous[k] ?? null, after: r.plan.updated[k]! })),
    });
  }
  preview.metricChanges = changes;
  if (!prepared.length && !preview.issues.some((i) => i.level === "error")) {
    preview.issues.push({ id: "metrics-nothing", level: "error", path: "atualização", message: "Nenhuma métrica mudou: os valores informados são iguais aos já registrados. Nada a gravar." });
  }
  preview.canImport = !preview.issues.some((i) => i.level === "error");
  return prepared;
}

type PeriodOp =
  | { kind: "update"; rowId: string; values: Record<string, number>; label: string }
  | { kind: "insert"; row: Record<string, unknown>; label: string };

/**
 * Atualização COM período em anúncios já cadastrados: lê os registros de
 * resultados reais de cada anúncio, escolhe o alvo (lib/import/period-target.ts)
 * e prepara só as colunas informadas. Sobreposição sem escolha válida ou
 * qualquer dúvida → erro e NADA é gravado.
 */
async function preparePeriodUpdate(db: SupabaseClient, userId: string, preview: ImportPreview, targets: Record<string, string>) {
  const period = preview.period!;
  const ads = preview.campaigns.flatMap((c) => c.adSets.flatMap((s) => s.ads.filter((a) => a.existingId && a.hasMetrics).map((a) => ({ c, s, a }))));
  const ids = ads.map((x) => x.a.existingId!);
  const { data, error } = await db.from("clt_ad_period_metrics").select("*").in("creative_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]).eq("user_id", userId);
  if (error) throw error;
  const rows = (data ?? []) as PeriodRow[];
  const ops: PeriodOp[] = [];
  const out: PeriodTargetPreview[] = [];
  for (const { c, s, a } of ads) {
    const id = a.existingId!;
    const base = { creativeId: id, campaign: c.name, adSet: s.name, adSetAutoIdentified: !!s.autoIdentified, ad: a.name };
    const target = resolvePeriodTarget({ rows: rows.filter((r) => r.creative_id === id), period, chosenId: targets[id] ?? null });
    const informed = informedColumns(a);
    if (target.kind === "choose" || target.kind === "blocked") {
      out.push({ ...base, kind: target.kind, message: target.message, target: null, options: target.options, changes: [], unchanged: false });
      preview.issues.push({ id: `period-target:${id}`, level: "error", path: `${c.name} › ${a.name}`, message: target.kind === "choose" ? `${target.message} Escolha o registro na prévia abaixo.` : target.message });
      continue;
    }
    const row = target.kind === "update_row" ? rows.find((r) => r.id === target.rowId)! : null;
    const { changes, same, update } = planRowChanges(row, informed);
    out.push({ ...base, kind: target.kind, message: null, target: { id: target.kind === "update_row" ? target.rowId : null, start: target.start, end: target.end, chosen: target.kind === "update_row" && target.chosen }, options: target.options, changes, same, unchanged: !changes.length });
    if (!changes.length) continue;
    if (target.kind === "update_row") ops.push({ kind: "update", rowId: target.rowId, values: update, label: a.name });
    else ops.push({ kind: "insert", label: a.name, row: { user_id: userId, company_id: preview.companyId, campaign_id: c.existingId, ad_set_id: s.existingId, creative_id: id, period_start: target.start, period_end: target.end, source: preview.sourceFormat, ...update } });
  }
  preview.periodTargets = out;
  if (!ops.length && !preview.issues.some((i) => i.level === "error")) {
    preview.issues.push({ id: "period-nothing", level: "error", path: "atualização", message: "Nenhuma métrica mudou: os valores informados já estão no registro. Nada a gravar." });
  }
  preview.canImport = !preview.issues.some((i) => i.level === "error");
  return ops;
}

/** Linhas atuais (todas as colunas) das campanhas/conjuntos/anúncios com informações na importação. */
async function loadInfoRows(db: SupabaseClient, userId: string, targets: InfoTarget[]) {
  const out: Record<string, Record<string, unknown>> = {};
  for (const level of ["campaign", "adSet", "ad"] as const) {
    const ids = [...new Set(targets.filter((t) => t.level === level && t.id).map((t) => t.id!))];
    if (!ids.length) continue;
    const { data, error } = await db.from(INFO_TABLE[level]).select("*").in("id", ids).eq("user_id", userId);
    if (error) throw error;
    for (const r of (data ?? []) as Array<Record<string, unknown>>) out[String(r.id)] = r;
  }
  return out;
}

/**
 * Prévia das informações cadastradas (atual → novo). Se só elas mudam numa
 * atualização de anúncios existentes, "nenhuma métrica mudou" deixa de ser erro.
 */
async function prepareInfo(db: SupabaseClient, userId: string, preview: ImportPreview) {
  const targets = collectInfoTargets(preview);
  preview.infoChanges = targets.length ? planInfoChanges(targets, await loadInfoRows(db, userId, targets)).changes : [];
  if (countInfoChanges(preview.infoChanges)) {
    preview.issues = preview.issues.filter((i) => i.id !== "metrics-nothing" && i.id !== "period-nothing");
    preview.canImport = !preview.issues.some((i) => i.level === "error");
  }
}

/**
 * Depois de gravar a estrutura/métricas: grava as informações cadastradas
 * informadas (só as colunas informadas e diferentes; `details` mesclado).
 * Sem a migration 20261109100000, grava as colunas antigas e avisa.
 */
async function saveInfo(db: SupabaseClient, userId: string, input: Input, bundle: ImportBundle, company: { id: string; name: string }, period: Period): Promise<{ saved: number; warning: string }> {
  const { snapshot } = await loadSnapshot(db, company);
  const fresh = validateImport(bundle, snapshot, { today: todayKeySaoPaulo(), period: validPeriod(input.period) ?? period });
  const targets = collectInfoTargets(fresh).filter((t) => t.id);
  if (!targets.length) return { saved: 0, warning: "" };
  const { ops } = planInfoChanges(targets, await loadInfoRows(db, userId, targets));
  let saved = 0, warning = "";
  for (const op of ops) {
    const table = INFO_TABLE[op.level];
    let { error } = await db.from(table).update(op.update).eq("id", op.id).eq("user_id", userId);
    if (error && isMissingSchema(error.code)) {
      warning = ` Parte das informações cadastradas não foi gravada: ${INFO_MIGRATION}`;
      const legacy = withoutNewColumns(op.level, op.update);
      error = Object.keys(legacy).length ? (await db.from(table).update(legacy).eq("id", op.id).eq("user_id", userId)).error : null;
    }
    if (error) return { saved, warning: `${warning} Informações cadastradas de "${op.name}" não foram gravadas: ${error.code === "23505" ? "valor já usado em outro registro" : error.message}.` };
    saved++;
  }
  return { saved, warning };
}

async function buildPreview(input: Input) {
  const parsed = parseImportInput(input.content);
  if (!parsed.ok) return { error: parsed.error } as const;
  if (input.module !== undefined && input.module !== "clt" && input.module !== "mkt") return { error: "Módulo inválido." } as const;
  const { db, user, company } = await context(input.companyId, input.module);
  const { snapshot, schemaReady } = await loadSnapshot(db, company);
  const preview = validateImport(parsed.bundle, snapshot, { today: todayKeySaoPaulo(), period: validPeriod(input.period) });
  const prepared = preview.mode === "metrics_update" && preview.canImport && schemaReady ? await prepareMetricsUpdate(db, user.id, preview) : [];
  const periodOps = preview.mode === "period_update" && preview.canImport && schemaReady ? await preparePeriodUpdate(db, user.id, preview, validTargets(input.targets)) : [];
  // A prévia das informações nunca derruba a validação (sem ela, só não há "atual → novo").
  if (schemaReady) await prepareInfo(db, user.id, preview).catch(() => { preview.infoChanges = []; });
  return { preview, detected: parsed.detected, schemaReady, db, user, prepared, periodOps, bundle: parsed.bundle, company } as const;
}

/**
 * Importação por período: o `clt_import_bundle` grava as métricas principais;
 * engajamento/vídeo (mesmas colunas do "Atualizar resultados") entram em
 * seguida na MESMA linha do período, só nas colunas informadas.
 */
async function saveExtraMetrics(db: SupabaseClient, input: Input, bundle: ImportBundle, company: { id: string; name: string }, period: { start: string; end: string }): Promise<string> {
  if (!bundle.campaigns.some((c) => c.adSets.some((s) => s.ads.some((a) => hasExtraMetrics(a.extraMetrics))))) return "";
  const { snapshot } = await loadSnapshot(db, company);
  const fresh = validateImport(bundle, snapshot, { today: todayKeySaoPaulo(), period: validPeriod(input.period) ?? period });
  for (const ad of fresh.campaigns.flatMap((c) => c.adSets.flatMap((s) => s.ads))) {
    if (!ad.existingId || !hasExtraMetrics(ad.extraMetrics)) continue;
    const values = Object.fromEntries(Object.entries(ad.extraMetrics!).filter(([, v]) => v !== null && v !== undefined));
    const { error } = await db.from("clt_ad_period_metrics").update(values).eq("creative_id", ad.existingId).eq("period_start", period.start).eq("period_end", period.end);
    if (error) return ` Engajamento/vídeo não foram gravados: ${isMissingSchema(error.code) ? migrationHint(values) : error.message}`;
  }
  return "";
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

    // Atualização parcial: nada de campanha/conjunto/anúncio é criado ou editado —
    // só a diferença das métricas informadas, como no "Atualizar resultados".
    if (preview.mode === "metrics_update") {
      let done = 0;
      for (const p of r.prepared) {
        const applied = await p.apply();
        if (applied.error) {
          return { error: done ? `${done} anúncio(s) atualizado(s); o seguinte falhou e os demais não foram gravados: ${applied.error}` : `Nada foi gravado: ${applied.error}` };
        }
        done++;
      }
      const info = await saveInfo(db, r.user.id, input, r.bundle, r.company, null);
      refreshImportViews();
      const unchanged = (preview.metricChanges ?? []).filter(m => m.unchanged).length;
      return { success: `Atualização concluída: ${done} anúncio(s) com métricas atualizadas${unchanged ? `, ${unchanged} sem mudanças` : ""}${info.saved ? `; informações cadastradas atualizadas em ${info.saved} registro(s)` : ""}. Nenhuma campanha, conjunto ou anúncio foi criado; orçamento, datas, status e as métricas não informadas ficaram como estavam.${info.warning}`, summary: { ads_updated: done, info_saved: info.saved } };
    }

    // Com período, só itens já cadastrados: atualiza o registro do período (só as colunas informadas).
    if (preview.mode === "period_update") {
      let done = 0;
      for (const op of r.periodOps) {
        const res = op.kind === "update"
          ? await db.from("clt_ad_period_metrics").update({ ...op.values, updated_at: new Date().toISOString() }).eq("id", op.rowId).eq("user_id", r.user.id).select("id")
          : await db.from("clt_ad_period_metrics").insert(op.row).select("id");
        const failed = res.error ?? (op.kind === "update" && !res.data?.length ? { message: "registro não encontrado (recarregue e valide de novo)" } : null);
        if (failed) {
          const reason = "code" in failed && isMissingSchema(String(failed.code)) ? migrationHint(op.kind === "update" ? op.values : op.row) : failed.message;
          return { error: done ? `${done} registro(s) atualizado(s); "${op.label}" falhou e os seguintes não foram gravados: ${reason}` : `Nada foi gravado: ${reason}` };
        }
        done++;
      }
      // Registro da execução (auditoria; não interfere nos resultados).
      await db.from("clt_import_runs").insert({ user_id: r.user.id, company_id: preview.companyId, source_format: preview.sourceFormat, period_start: preview.period!.start, period_end: preview.period!.end, summary: { mode: "period_update", targets: (preview.periodTargets ?? []).map((t) => ({ ad: t.ad, record: t.target, changes: t.changes })) } });
      const info = await saveInfo(db, r.user.id, input, r.bundle, r.company, preview.period);
      refreshImportViews();
      const updated = r.periodOps.filter((o) => o.kind === "update").length, created = done - updated;
      return { success: `Atualização concluída: ${updated} registro(s) de resultados atualizado(s)${created ? ` e ${created} criado(s) (sem sobreposição)` : ""}${info.saved ? `; informações cadastradas atualizadas em ${info.saved} registro(s)` : ""}. Só as métricas e informações informadas mudaram; status, datas, orçamento e as demais métricas ficaram como estavam.${info.warning}`, summary: { records_updated: updated, records_created: created, info_saved: info.saved } };
    }

    const { data, error } = await db.rpc("clt_import_bundle", { p_company_id: preview.companyId, p_payload: buildImportPayload(preview) });
    if (error) return { error: `Importação cancelada, nada foi gravado: ${describeError(error)}` };
    const extraWarning = preview.period ? await saveExtraMetrics(db, input, r.bundle, r.company, preview.period) : "";

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
    const info = await saveInfo(db, r.user.id, input, r.bundle, r.company, preview.period);
    refreshImportViews();
    const s = (data ?? {}) as Record<string, number | string>;
    return {
      success: `Importação concluída: ${s.audiences_created ?? 0} públicos criados e ${s.audiences_updated ?? 0} atualizados; ${s.campaigns_created ?? 0} campanhas criadas e ${s.campaigns_updated ?? 0} atualizadas; ${s.ad_sets_created ?? 0}+${s.ad_sets_updated ?? 0} conjuntos; ${s.ads_created ?? 0}+${s.ads_updated ?? 0} anúncios; ${s.metrics_saved ?? 0} registros de métricas${info.saved ? `; informações cadastradas gravadas em ${info.saved} registro(s)` : ""}.${typeWarning}${extraWarning}${info.warning}`,
      summary: { ...s, info_saved: info.saved },
    };
  } catch (e) {
    return { error: describeError(e) };
  }
}
