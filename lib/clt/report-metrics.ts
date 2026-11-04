import { costPerMessage, costPerSale, cpc, cpm, ctr, roas, type ReportMetrics } from "@/lib/clt/report-period";
import { NEW_FOLLOWERS_LABEL, formatMetric, type MetricFormat } from "@/lib/clt/result-metrics";

/**
 * Catálogo do "Personalizar relatório" (CLT e MKT). A seleção controla SÓ o
 * que aparece na prévia, no PDF, nas tabelas e nas comparações — nenhum
 * resultado cadastrado muda e as métricas ocultas continuam armazenadas.
 */
export type ReportSection = "principal" | "engajamento" | "video" | "custos" | "financeiro" | "conteudo";

export const REPORT_SECTION_TITLES: Record<ReportSection, string> = {
  principal: "Resultados principais",
  engajamento: "Engajamento",
  video: "Vídeo",
  custos: "Custos e taxas",
  financeiro: "Conta de anúncios",
  conteudo: "Blocos do relatório",
};
export const REPORT_SECTIONS = Object.keys(REPORT_SECTION_TITLES) as ReportSection[];

export type ReportMetricDef = {
  id: string;
  label: string;
  /** Título curto para colunas de tabela. */
  short?: string;
  section: ReportSection;
  format?: MetricFormat;
  /** Valor no período; null = sem base ("—"). Sem `value` = bloco (tabela, destaques…). */
  value?: (m: ReportMetrics) => number | null;
  /** Custos: cair é melhor (comparação). */
  lowerIsBetter?: boolean;
  /** Entra nas tabelas por campanha (movimentações/saldo/resultado são da empresa). */
  perCampaign?: boolean;
  /** Entra na comparação com o período anterior. */
  compare?: boolean;
};

const v = (id: string, label: string, section: ReportSection, value: (m: ReportMetrics) => number | null, format: MetricFormat, extra: Partial<ReportMetricDef> = {}): ReportMetricDef =>
  ({ id, label, section, value, format, perCampaign: true, compare: true, ...extra });

export const REPORT_METRICS: ReportMetricDef[] = [
  v("gasto", "Investimento", "principal", (m) => m.gasto, "money"),
  v("messages", "Conversas", "principal", (m) => m.messages, "int"),
  v("sales", "Vendas", "principal", (m) => m.sales, "int"),
  v("faturamento", "Faturamento", "principal", (m) => m.faturamento, "money"),
  v("resultado", "Resultado após anúncios", "principal", (m) => m.resultado, "money", { perCampaign: false }),
  v("impressions", "Impressões", "principal", (m) => m.impressions, "int"),
  v("reach", "Alcance (soma)", "principal", (m) => m.reach, "int", { short: "Alcance" }),
  v("engagements", "Interações", "principal", (m) => m.engagements, "int"),
  v("leads", "Leads", "principal", (m) => m.leads, "int"),

  v("reactions", "Reações à publicação", "engajamento", (m) => m.reactions, "int", { short: "Reações" }),
  v("comments", "Comentários", "engajamento", (m) => m.comments, "int"),
  v("shares", "Compartilhamentos", "engajamento", (m) => m.shares, "int"),
  v("newFollowers", NEW_FOLLOWERS_LABEL, "engajamento", (m) => m.newFollowers, "int", { short: "Novos seguidores (anúncios)" }),
  v("linkClicks", "Cliques no link", "engajamento", (m) => m.linkClicks, "int"),

  v("views", "Visualizações", "video", (m) => m.views, "int"),
  v("video3s", "Reproduções de 3 segundos", "video", (m) => m.video3s, "int", { short: "Reproduções 3s" }),
  v("thruplays", "ThruPlays", "video", (m) => m.thruplays, "int"),
  v("video75", "Visualizações de 75%", "video", (m) => m.video75, "int", { short: "75%" }),
  v("video100", "Visualizações de 100%", "video", (m) => m.video100, "int", { short: "100%" }),
  // Percentuais informados por anúncio: bloco (tabela por anúncio), nunca somados nem em média.
  { id: "taxasVideo", label: "Taxa de Gancho e Taxa de Retenção (por anúncio)", section: "video" },

  v("cpmsg", "Custo por mensagem", "custos", costPerMessage, "money", { short: "Custo/msg", lowerIsBetter: true }),
  v("cpv", "Custo por venda", "custos", costPerSale, "money", { short: "Custo/venda", lowerIsBetter: true }),
  v("cpc", "CPC (custo por clique)", "custos", cpc, "money", { short: "CPC", lowerIsBetter: true }),
  v("ctr", "CTR (taxa de cliques)", "custos", ctr, "pct", { short: "CTR" }),
  v("cpm", "CPM (custo por mil impressões)", "custos", cpm, "money", { short: "CPM", lowerIsBetter: true }),
  v("roas", "ROAS", "custos", roas, "roas"),

  v("deposito", "Depósitos", "financeiro", (m) => m.deposito, "money", { perCampaign: false }),
  v("credito", "Créditos", "financeiro", (m) => m.credito, "money", { perCampaign: false }),
  { id: "saldo", label: "Saldo atual", section: "financeiro" },

  { id: "campanhas", label: "Resultados por campanha", section: "conteudo" },
  { id: "destaques", label: "Destaques automáticos", section: "conteudo" },
  { id: "historico", label: "Evolução mensal (6 meses)", section: "conteudo" },
  { id: "seguidores", label: "Seguidores do Instagram (total, contagem manual)", section: "conteudo" },
];

export const REPORT_METRIC_IDS = new Set(REPORT_METRICS.map((m) => m.id));

/** Seleção padrão (a mesma do relatório de antes). */
export const DEFAULT_REPORT_METRICS = ["gasto", "views", "messages", "cpmsg", "sales", "faturamento", "resultado", "campanhas", "destaques", "seguidores"];

/** Só ids conhecidos, sem repetição, na ordem do catálogo; null se não for uma lista. */
export function sanitizeReportMetrics(ids: unknown): string[] | null {
  if (!Array.isArray(ids)) return null;
  const set = new Set(ids.filter((x): x is string => typeof x === "string"));
  return REPORT_METRICS.filter((m) => set.has(m.id)).map((m) => m.id);
}

/** Métricas com valor selecionadas, na ordem do catálogo. */
export const selectedValueMetrics = (selected: string[], filter: (m: ReportMetricDef) => boolean = () => true) =>
  REPORT_METRICS.filter((m) => m.value && selected.includes(m.id) && filter(m));

export const formatReportValue = (def: ReportMetricDef, m: ReportMetrics) => formatMetric(def.value ? def.value(m) : null, def.format ?? "int");
