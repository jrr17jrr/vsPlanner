import { parseBrDate, parseBrDateTime, parseBrInteger, parseBrNumber, parseBrPeriod } from "./values";
import {
  emptyMetrics,
  type AudienceType,
  type ImportAd,
  type ImportAdSet,
  type ImportAudience,
  type ImportBundle,
  type ImportCampaign,
  type MetricKey,
  type Metrics,
  type ParseProblem,
  type ReportedTotals,
} from "./types";

/**
 * Normaliza os formatos de JSON aceitos para o modelo único:
 *  - VS Planner v1 (`audiences`/`campaigns`/`ad_sets`/`ads`/`metrics`,
 *    `external_key`, `audience_external_key`, `meta_*_id`);
 *  - formato antigo em português (`publicos`/`campanhas`/`conjuntos`/
 *    `anuncios`/`resultados`);
 *  - arquivos mistos (públicos + campanhas no mesmo JSON).
 * Não valida regras de negócio (isso é `validate.ts`) — só lê com
 * segurança e registra o que não deu para interpretar.
 */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

function pick(o: Obj, keys: string[]): unknown {
  for (const k of keys) if (k in o && o[k] !== undefined) return o[k];
  return undefined;
}
function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}
function arr(o: Obj, keys: string[]): unknown[] | null {
  const v = pick(o, keys);
  return Array.isArray(v) ? v : null;
}

const METRIC_ALIASES: Record<MetricKey, string[]> = {
  spend: ["spend_brl", "spend", "investimento", "gasto", "valor_gasto", "amount_spent", "spent"],
  conversations: ["whatsapp_conversations", "conversations", "conversas", "mensagens", "messages", "messaging_conversations_started"],
  sales: ["sales", "vendas"],
  revenue: ["revenue_brl", "revenue", "faturamento", "receita"],
  impressions: ["impressions", "impressoes", "impressões"],
  reach: ["reach", "alcance"],
  linkClicks: ["link_clicks", "clicks", "cliques", "cliques_no_link"],
  leads: ["leads"],
};
const INTEGER_METRICS = new Set<MetricKey>(["conversations", "sales", "impressions", "reach", "linkClicks", "leads"]);

function readMetrics(source: Obj | null, path: string, problems: ParseProblem[]): Metrics {
  const metrics = emptyMetrics();
  if (!source) return metrics;
  for (const key of Object.keys(METRIC_ALIASES) as MetricKey[]) {
    const raw = pick(source, METRIC_ALIASES[key]);
    if (raw === undefined) continue;
    const value = INTEGER_METRICS.has(key) ? parseBrInteger(raw) : parseBrNumber(raw);
    if (value === undefined) problems.push({ path: `${path}.${key}`, message: `Valor inválido: ${JSON.stringify(raw)}` });
    else metrics[key] = value;
  }
  return metrics;
}

export function mapAudienceType(raw: string | null): AudienceType | null {
  if (!raw) return null;
  const t = raw.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (["saved", "salvo", "saved_audience"].includes(t)) return "saved";
  if (["custom", "personalizado", "custom_audience"].includes(t)) return "custom";
  if (["lookalike", "semelhante", "lal", "lookalike_audience"].includes(t)) return "lookalike";
  return null;
}

export function inferAdFormat(raw: string | null, name: string): ImportAd["format"] {
  const t = (raw ?? name).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (/carrossel|carousel/.test(t)) return "carrossel";
  if (/video|reels?\b/.test(t)) return "video";
  if (/imagem|image|foto|photo|estatico/.test(t)) return "imagem";
  return "outro";
}

function numOrProblem(raw: unknown, path: string, problems: ParseProblem[], integer = false): number | null {
  if (raw === undefined) return null;
  const v = integer ? parseBrInteger(raw) : parseBrNumber(raw);
  if (v === undefined) { problems.push({ path, message: `Valor inválido: ${JSON.stringify(raw)}` }); return null; }
  return v;
}
function dateOrProblem(raw: unknown, path: string, problems: ParseProblem[], withTime = false): string | null {
  if (raw === undefined) return null;
  const v = withTime ? parseBrDateTime(raw) : parseBrDate(raw);
  if (v === undefined) { problems.push({ path, message: `Data inválida: ${JSON.stringify(raw)}` }); return null; }
  return v;
}

const AUDIENCE_KNOWN_KEYS = new Set(["external_key", "name", "nome", "type", "tipo", "company_key", "source", "origem", "targeting_location", "localizacao", "age_range", "idade", "interests", "interesses", "estimated_size", "tamanho_estimado", "notes", "observacoes", "configuracoes"]);

function readAudience(a: Obj, i: number, problems: ParseProblem[]): ImportAudience {
  const path = `audiences[${i}]`;
  const settings = isObj(a.configuracoes) ? a.configuracoes : {};
  const source = isObj(a.source) ? a.source : null;
  const rawType = str(pick(a, ["type", "tipo"]));
  const age = pick(a, ["age_range", "idade"]) ?? pick(settings, ["age_range", "idade"]);
  let ageMin: number | null = null, ageMax: number | null = null;
  if (Array.isArray(age) && age.length === 2) {
    ageMin = numOrProblem(age[0], `${path}.age_range[0]`, problems, true);
    ageMax = numOrProblem(age[1], `${path}.age_range[1]`, problems, true);
  } else if (typeof age === "string") {
    const m = /^(\d{2})\s*(?:-|a|até)\s*(\d{2})\+?$/.exec(age.trim());
    if (m) { ageMin = Number(m[1]); ageMax = Number(m[2]); } else problems.push({ path: `${path}.age_range`, message: `Faixa etária inválida: ${age}` });
  }
  const size = pick(a, ["estimated_size", "tamanho_estimado"]);
  let estimatedSize: [number, number] | null = null;
  if (Array.isArray(size) && size.length === 2) {
    const lo = numOrProblem(size[0], `${path}.estimated_size[0]`, problems, true), hi = numOrProblem(size[1], `${path}.estimated_size[1]`, problems, true);
    if (lo !== null && hi !== null) estimatedSize = [lo, hi];
  }
  const interestsRaw = pick(a, ["interests", "interesses"]) ?? pick(settings, ["interests", "interesses"]);
  const location = pick(a, ["targeting_location", "localizacao"]) ?? pick(settings, ["targeting_location", "localizacao"]);
  const extra: Obj = { ...settings };
  for (const [k, v] of Object.entries(a)) if (!AUDIENCE_KNOWN_KEYS.has(k)) extra[k] = v;
  if (source) extra.source = source;
  return {
    externalKey: str(a.external_key),
    name: str(pick(a, ["name", "nome"])) ?? "",
    type: mapAudienceType(rawType),
    rawType,
    companyKey: str(a.company_key),
    sourceAudienceKey: str(source?.audience_external_key),
    sourceAudienceName: str(a.origem) ?? str(source?.audience_name),
    percentage: numOrProblem(source?.percentage ?? pick(a, ["percentage", "porcentagem"]), `${path}.source.percentage`, problems),
    retentionDays: numOrProblem(source?.retention_days ?? pick(a, ["retention_days", "retencao_dias"]), `${path}.source.retention_days`, problems, true),
    location: isObj(location) ? location : typeof location === "string" ? { descricao: location } : null,
    ageMin, ageMax,
    interests: Array.isArray(interestsRaw) ? interestsRaw.map(String) : null,
    estimatedSize,
    notes: str(pick(a, ["notes", "observacoes"])),
    extra,
  };
}

function readAd(ad: Obj, path: string, problems: ParseProblem[]): ImportAd {
  const name = str(pick(ad, ["name", "nome"])) ?? "";
  const metricSource = pick(ad, ["metrics", "metricas", "resultados"]);
  const extra: Obj = {};
  for (const [k, v] of Object.entries(ad)) if (!["meta_ad_id", "name", "nome", "post_id", "notes", "observacoes", "metrics", "metricas", "resultados", "format", "formato"].includes(k)) extra[k] = v;
  return {
    metaId: str(ad.meta_ad_id),
    name,
    format: inferAdFormat(str(pick(ad, ["format", "formato"])), name),
    postId: str(ad.post_id),
    notes: str(pick(ad, ["notes", "observacoes"])),
    metrics: readMetrics(isObj(metricSource) ? metricSource : null, `${path}.metrics`, problems),
    extra,
  };
}

function readAdSet(set: Obj, path: string, problems: ParseProblem[]): ImportAdSet {
  const ads = arr(set, ["ads", "anuncios", "anúncios"]) ?? [];
  return {
    metaId: str(set.meta_adset_id),
    name: str(pick(set, ["name", "nome"])) ?? "",
    audienceKey: str(set.audience_external_key),
    audienceName: str(pick(set, ["publico", "público", "audience_name"])),
    dailyBudget: numOrProblem(pick(set, ["daily_budget_brl", "daily_budget", "orcamento_diario"]), `${path}.daily_budget_brl`, problems),
    startAt: dateOrProblem(pick(set, ["start_at_local", "inicio", "start"]), `${path}.start_at_local`, problems, true),
    endAt: dateOrProblem(pick(set, ["scheduled_end_at_local", "end_at_local", "fim", "end"]), `${path}.scheduled_end_at_local`, problems, true),
    status: str(pick(set, ["reported_status", "status"])),
    placements: str(set.placements),
    notes: str(pick(set, ["notes", "observacoes"])),
    ads: ads.filter(isObj).map((ad, k) => readAd(ad, `${path}.ads[${k}]`, problems)),
  };
}

function readCampaign(c: Obj, i: number, problems: ParseProblem[]): ImportCampaign {
  const path = `campaigns[${i}]`;
  const sets = arr(c, ["ad_sets", "conjuntos", "adsets"]) ?? [];
  const reportedRaw = isObj(c.campaign_reported_totals_for_reconciliation_only) ? c.campaign_reported_totals_for_reconciliation_only : null;
  let reportedTotals: ReportedTotals | null = null;
  if (reportedRaw) {
    const m = readMetrics(reportedRaw, `${path}.campaign_reported_totals_for_reconciliation_only`, problems);
    reportedTotals = {
      spend: m.spend, conversations: m.conversations, impressions: m.impressions,
      unallocatedSpend: numOrProblem(reportedRaw.unallocated_spend_brl, `${path}.unallocated_spend_brl`, problems),
      unallocatedConversations: numOrProblem(reportedRaw.unallocated_conversations, `${path}.unallocated_conversations`, problems, true),
    };
  } else if (!sets.length) {
    // Formato antigo: métricas só no nível da campanha — viram totais
    // informados (reconciliação), nunca resultado de anúncio inventado.
    const m = readMetrics(c, path, problems);
    if (Object.values(m).some(v => v !== null)) reportedTotals = { spend: m.spend, conversations: m.conversations, impressions: m.impressions, unallocatedSpend: null, unallocatedConversations: null };
  }
  return {
    metaId: str(c.meta_campaign_id),
    name: str(pick(c, ["name", "nome"])) ?? "",
    objective: str(pick(c, ["objective", "objetivo"])),
    dailyBudget: numOrProblem(pick(c, ["daily_budget_brl", "daily_budget", "orcamento_diario"]), `${path}.daily_budget_brl`, problems),
    startsOn: dateOrProblem(pick(c, ["start_date", "starts_on", "inicio", "data_inicio"]), `${path}.start_date`, problems),
    endsOn: dateOrProblem(pick(c, ["end_date", "ends_on", "fim", "data_fim"]), `${path}.end_date`, problems),
    status: str(pick(c, ["status", "reported_status"])),
    notes: str(pick(c, ["notes", "observacoes"])),
    reportedTotals,
    adSets: sets.filter(isObj).map((s, j) => readAdSet(s, `${path}.ad_sets[${j}]`, problems)),
  };
}

export type JsonDetection = { kind: "bundle"; bundle: ImportBundle } | { kind: "planning" } | { kind: "unknown"; message: string };

export function normalizeJson(data: unknown): JsonDetection {
  if (Array.isArray(data) || (isObj(data) && Array.isArray(data.items))) return { kind: "planning" };
  if (!isObj(data)) return { kind: "unknown", message: "O JSON precisa ser um objeto com públicos e/ou campanhas." };
  const audiences = arr(data, ["audiences", "publicos", "públicos"]);
  const campaigns = arr(data, ["campaigns", "campanhas"]);
  if (!audiences && !campaigns) return { kind: "unknown", message: "Não encontrei 'audiences'/'publicos' nem 'campaigns'/'campanhas' no JSON." };

  const problems: ParseProblem[] = [];
  const companyObj = isObj(data.company) ? data.company : null;
  const companyName = str(companyObj?.name) ?? str(pick(data, ["empresa", "company", "nome_empresa"]));
  const periodObj = isObj(data.metrics_period) ? data.metrics_period : null;
  let metricsPeriod: ImportBundle["metricsPeriod"] = null;
  if (periodObj) {
    const start = dateOrProblem(periodObj.start, "metrics_period.start", problems), end = dateOrProblem(periodObj.end, "metrics_period.end", problems);
    if (start && end) metricsPeriod = end >= start ? { start, end } : (problems.push({ path: "metrics_period", message: "Fim do período anterior ao início." }), null);
  } else if (typeof data.periodo === "string") {
    const p = parseBrPeriod(data.periodo);
    if (p === undefined) problems.push({ path: "periodo", message: `Período inválido: ${data.periodo}` }); else metricsPeriod = p;
  }
  const isLegacy = !!pick(data, ["publicos", "campanhas"]) && !data.schema_version;
  return {
    kind: "bundle",
    bundle: {
      sourceFormat: isLegacy ? (campaigns ? "legacy_campanhas" : "legacy_publicos") : "vsplanner_v1",
      company: { name: companyName, externalKey: str(companyObj?.external_key) },
      metricsPeriod,
      timezone: str(data.timezone),
      audiences: (audiences ?? []).filter(isObj).map((a, i) => readAudience(a, i, problems)),
      campaigns: (campaigns ?? []).filter(isObj).map((c, i) => readCampaign(c, i, problems)),
      dataQualityNotes: Array.isArray(data.data_quality_notes) ? data.data_quality_notes.map(String) : [],
      problems,
    },
  };
}
