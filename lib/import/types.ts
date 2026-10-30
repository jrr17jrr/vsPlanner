/**
 * Modelo normalizado do Importador Inteligente (JSON e texto passam pelo
 * MESMO modelo, validação e persistência). `null` = não informado;
 * `0` = zero confirmado.
 */

export type AudienceType = "saved" | "custom" | "lookalike";

/** Valores do banco (`clt_audiences.audience_type`). */
export const AUDIENCE_DB_TYPE: Record<AudienceType, "salvo" | "personalizado" | "semelhante"> = {
  saved: "salvo",
  custom: "personalizado",
  lookalike: "semelhante",
};
export const AUDIENCE_LABEL: Record<AudienceType, string> = { saved: "Salvo", custom: "Personalizado", lookalike: "Semelhante" };

export type MetricKey = "spend" | "conversations" | "sales" | "revenue" | "impressions" | "reach" | "linkClicks" | "leads";
export type Metrics = Record<MetricKey, number | null>;
export const METRIC_KEYS: MetricKey[] = ["spend", "conversations", "sales", "revenue", "impressions", "reach", "linkClicks", "leads"];
export const MONEY_METRICS = new Set<MetricKey>(["spend", "revenue"]);
/** Métricas que NÃO podem ser somadas entre anúncios (pessoas únicas). */
export const NON_ADDITIVE_METRICS = new Set<MetricKey>(["reach"]);
export const METRIC_LABEL: Record<MetricKey, string> = {
  spend: "Investimento", conversations: "Conversas", sales: "Vendas", revenue: "Faturamento",
  impressions: "Impressões", reach: "Alcance", linkClicks: "Cliques no link", leads: "Leads",
};

export const emptyMetrics = (): Metrics => ({ spend: null, conversations: null, sales: null, revenue: null, impressions: null, reach: null, linkClicks: null, leads: null });

/** Campo inválido detectado na leitura (valor que não deu para interpretar). */
export type ParseProblem = { path: string; message: string; level?: "error" | "warning" };

export type ImportAudience = {
  externalKey: string | null;
  name: string;
  type: AudienceType | null;
  rawType: string | null;
  companyKey: string | null;
  sourceAudienceKey: string | null;
  sourceAudienceName: string | null;
  percentage: number | null;
  retentionDays: number | null;
  location: Record<string, unknown> | null;
  ageMin: number | null;
  ageMax: number | null;
  interests: string[] | null;
  estimatedSize: [number, number] | null;
  notes: string | null;
  /** Demais detalhes informados (preservados em `settings`). */
  extra: Record<string, unknown>;
};

export type ImportAd = {
  metaId: string | null;
  name: string;
  format: "imagem" | "video" | "carrossel" | "outro";
  postId: string | null;
  notes: string | null;
  metrics: Metrics;
  extra: Record<string, unknown>;
};

export type ImportAdSet = {
  metaId: string | null;
  name: string;
  /** Nome inventado pelo parser (texto sem "Conjunto:") — exige revisão. */
  nameInferred?: boolean;
  audienceKey: string | null;
  audienceName: string | null;
  dailyBudget: number | null;
  startAt: string | null;
  endAt: string | null;
  status: string | null;
  placements: string | null;
  notes: string | null;
  ads: ImportAd[];
};

export type ReportedTotals = {
  spend: number | null;
  conversations: number | null;
  impressions: number | null;
  unallocatedSpend: number | null;
  unallocatedConversations: number | null;
};

export type ImportCampaign = {
  metaId: string | null;
  name: string;
  objective: string | null;
  dailyBudget: number | null;
  startsOn: string | null;
  endsOn: string | null;
  status: string | null;
  notes: string | null;
  reportedTotals: ReportedTotals | null;
  adSets: ImportAdSet[];
};

export type ImportSourceFormat = "vsplanner_v1" | "legacy_publicos" | "legacy_campanhas" | "text";

export type ImportBundle = {
  sourceFormat: ImportSourceFormat;
  company: { name: string | null; externalKey: string | null };
  metricsPeriod: { start: string; end: string } | null;
  timezone: string | null;
  audiences: ImportAudience[];
  campaigns: ImportCampaign[];
  dataQualityNotes: string[];
  problems: ParseProblem[];
};

/** Registros já existentes na empresa (para casar novo × existente). */
export type ExistingSnapshot = {
  company: { id: string; name: string };
  audiences: Array<{ id: string; name: string; audience_type: string; external_key: string | null }>;
  campaigns: Array<{ id: string; name: string; meta_campaign_id: string | null }>;
  adSets: Array<{ id: string; campaign_id: string; name: string; meta_adset_id: string | null }>;
  ads: Array<{ id: string; ad_set_id: string; name: string; meta_ad_id: string | null }>;
  /** Campanhas com resultados lançados nas tabelas antigas (diárias/agregadas). */
  legacyResultCampaignIds: string[];
  /** Métricas por período já gravadas (para não duplicar nem sobrepor períodos). */
  periodMetrics: Array<{ creative_id: string; period_start: string; period_end: string }>;
};
