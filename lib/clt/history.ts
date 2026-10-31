/**
 * Histórico mensal e comparação de campanhas Meta Ads (CLT e MKT).
 *
 * Fontes (as mesmas que o sistema já grava — nenhuma tabela nova):
 *  - `clt_ad_period_metrics`  (importado por anúncio e período)      → "importado"
 *  - `clt_ad_level_results`   (lançamento manual por conjunto/anúncio) → "manual_conjunto"
 *  - `clt_campaign_result_entries` (lançamento manual da campanha)   → "manual_campanha"
 *
 * Sem duplicar (mesma hierarquia das telas de campanha):
 *  1. o importado prevalece: lançamentos manuais do mesmo anúncio (ou do
 *     conjunto) com data dentro de um período importado são descartados;
 *  2. num mesmo conjunto e dia, linhas por anúncio substituem a linha do conjunto;
 *  3. o lançamento da campanha é descartado quando, na mesma data, já há
 *     detalhe por conjunto/anúncio, ou quando a data está num período importado.
 *
 * Mês de referência: lançamento manual → mês da data; período importado →
 * mês do ÚLTIMO dia (regra dos relatórios). Períodos que atravessam meses
 * ficam sinalizados (sem dados diários não dá para dividir sem inventar).
 *
 * Custo por mensagem = investimento ELEGÍVEL (fatos do tipo "mensagens")
 * ÷ conversas desses mesmos fatos. ThruPlay/engajamento/etc. nunca entram.
 */

export type ResultType = "mensagens" | "visualizacoes" | "vendas" | "engajamento" | "alcance" | "trafego" | "leads" | "outro";
export type FactType = ResultType | "misto" | null;

export const RESULT_TYPES: { value: ResultType; label: string }[] = [
  { value: "mensagens", label: "Mensagens (WhatsApp/Direct)" },
  { value: "visualizacoes", label: "Visualizações / ThruPlay" },
  { value: "engajamento", label: "Engajamento" },
  { value: "vendas", label: "Vendas / conversões" },
  { value: "leads", label: "Leads / cadastros" },
  { value: "trafego", label: "Tráfego / cliques" },
  { value: "alcance", label: "Alcance / reconhecimento" },
  { value: "outro", label: "Outro" },
];
export const RESULT_TYPE_VALUES = RESULT_TYPES.map(t => t.value);
export const resultTypeLabel = (t: FactType | "sem_classificacao") =>
  t === "misto" ? "Misto (conjuntos com objetivos diferentes)" : t === null || t === "sem_classificacao" ? "Sem classificação" : RESULT_TYPES.find(x => x.value === t)?.label ?? t;

const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Objetivo da campanha (campo estruturado — select do sistema ou objetivo do
 * Meta no JSON importado) → tipo de resultado. NUNCA usa o nome da campanha.
 */
export function normalizeObjective(raw?: string | null): ResultType | null {
  if (!raw || !raw.trim()) return null;
  const s = strip(raw.trim());
  if (/thruplay|video_?view|visualiza|\bviews?\b/.test(s)) return "visualizacoes";
  if (/whats|mensag|messag|\bconversas?\b|direct|messenger|ctwa|click_to_message/.test(s)) return "mensagens";
  if (/venda|sales|purchase|compra|conversion|conversao|catalog/.test(s)) return "vendas";
  if (/lead|cadastro|formulario/.test(s)) return "leads";
  if (/trafego|traffic|link_?click|clique/.test(s)) return "trafego";
  if (/alcance|reach|awareness|reconhecimento/.test(s)) return "alcance";
  if (/engaj|engagement|interac/.test(s)) return "engajamento";
  if (/^outro|^other/.test(s)) return "outro";
  return null;
}

export type MetricKey = "spend" | "messages" | "sales" | "revenue" | "impressions" | "reach" | "views" | "thruplays" | "link_clicks" | "leads" | "engagements";
export const METRIC_KEYS: MetricKey[] = ["spend", "messages", "sales", "revenue", "impressions", "reach", "views", "thruplays", "link_clicks", "leads", "engagements"];
export type Metrics = Record<MetricKey, number | null>;

export type HistoryCampaign = { id: string; company_id: string; name: string; objective: string | null; starts_on: string; ends_on: string; campaign_status?: string | null };
export type HistoryAdSet = { id: string; campaign_id: string; name: string; result_type?: string | null };
type Num = number | string | null | undefined;
export type HistoryCampaignEntry = { campaign_id: string; entry_date: string; spent_amount: Num; messages: Num; sales: Num; generated_revenue: Num; views?: Num; impressions?: Num; reach?: Num; thruplays?: Num; link_clicks?: Num; leads?: Num; engagements?: Num };
export type HistoryAdLevelEntry = HistoryCampaignEntry & { ad_set_id: string; creative_id: string | null };
export type HistoryPeriodMetric = { campaign_id: string; ad_set_id: string; creative_id: string; period_start: string; period_end: string; spend: Num; conversations: Num; sales: Num; revenue: Num; impressions: Num; reach?: Num; link_clicks?: Num; leads?: Num };

export type HistoryInput = {
  campaigns: HistoryCampaign[];
  adSets: HistoryAdSet[];
  campaignEntries: HistoryCampaignEntry[];
  adLevelEntries: HistoryAdLevelEntry[];
  periodMetrics: HistoryPeriodMetric[];
};

export type FactSource = "importado" | "manual_conjunto" | "manual_campanha";
export type TypeOrigin = "conjunto" | "campanha" | "misto" | "sem_classificacao";

export type HistoryFact = {
  campaign_id: string;
  company_id: string;
  ad_set_id: string | null;
  creative_id: string | null;
  /** Data de referência (fim do período, no importado). */
  date: string;
  month: string;
  period_start: string;
  period_end: string;
  source: FactSource;
  type: FactType;
  typeOrigin: TypeOrigin;
  crossMonth: boolean;
  m: Metrics;
};

export type HistoryWarning =
  | { kind: "overlap"; campaign_id: string; creative_id: string; periods: [string, string][] }
  | { kind: "cross_month"; campaign_id: string; period_start: string; period_end: string };

const day = (d: string) => String(d).slice(0, 10);
const toNum = (v: Num): number | null => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Manual: investimento/conversas/vendas/faturamento são campos-base (0 é valor real); os demais só contam quando > 0. */
function manualMetrics(r: HistoryCampaignEntry): Metrics {
  const opt = (v: Num) => { const n = toNum(v); return n && n > 0 ? n : null; };
  return {
    spend: toNum(r.spent_amount) ?? 0,
    messages: toNum(r.messages) ?? 0,
    sales: toNum(r.sales) ?? 0,
    revenue: toNum(r.generated_revenue) ?? 0,
    impressions: opt(r.impressions), reach: opt(r.reach), views: opt(r.views), thruplays: opt(r.thruplays),
    link_clicks: opt(r.link_clicks), leads: opt(r.leads), engagements: opt(r.engagements),
  };
}

/** Importado: null continua "não informado"; visualizações/ThruPlays/interações não vêm na importação. */
function importedMetrics(m: HistoryPeriodMetric): Metrics {
  return {
    spend: toNum(m.spend), messages: toNum(m.conversations), sales: toNum(m.sales), revenue: toNum(m.revenue),
    impressions: toNum(m.impressions), reach: toNum(m.reach), link_clicks: toNum(m.link_clicks), leads: toNum(m.leads),
    views: null, thruplays: null, engagements: null,
  };
}

/**
 * Tipo de resultado de cada conjunto (o do conjunto ou, se vazio, o objetivo
 * da campanha) e do lançamento feito no total da campanha ("misto" quando
 * os conjuntos têm objetivos diferentes). Usado pelo histórico e pelas telas.
 */
export function makeTypeResolver(campaignList: Pick<HistoryCampaign, "id" | "objective">[], adSetList: Pick<HistoryAdSet, "id" | "campaign_id" | "result_type">[]) {
  const campaigns = new Map(campaignList.map(c => [c.id, c]));
  const sets = new Map(adSetList.map(s => [s.id, s]));
  const campaignType = (id: string) => normalizeObjective(campaigns.get(id)?.objective);
  const setType = (id: string): { type: ResultType | null; origin: TypeOrigin } => {
    const s = sets.get(id);
    const own = s?.result_type && (RESULT_TYPE_VALUES as string[]).includes(s.result_type) ? (s.result_type as ResultType) : null;
    if (own) return { type: own, origin: "conjunto" };
    const ct = s ? campaignType(s.campaign_id) : null;
    return { type: ct, origin: ct ? "campanha" : "sem_classificacao" };
  };
  const campaignLevelType = (campaignId: string): { type: FactType; origin: TypeOrigin } => {
    const own = adSetList.filter(s => s.campaign_id === campaignId);
    const types = new Set(own.map(s => setType(s.id).type).filter(Boolean));
    if (types.size > 1) return { type: "misto", origin: "misto" };
    if (types.size === 1) return { type: [...types][0] as ResultType, origin: own.some(s => s.result_type) ? "conjunto" : "campanha" };
    const ct = campaignType(campaignId);
    return { type: ct, origin: ct ? "campanha" : "sem_classificacao" };
  };
  return { setType, campaignLevelType };
}

export function buildHistoryFacts(input: HistoryInput): { facts: HistoryFact[]; warnings: HistoryWarning[] } {
  const campaigns = new Map(input.campaigns.map(c => [c.id, c]));
  const { setType, campaignLevelType } = makeTypeResolver(input.campaigns, input.adSets);
  const companyOf = (campaignId: string) => campaigns.get(campaignId)?.company_id ?? "";

  const facts: HistoryFact[] = [];
  const warnings: HistoryWarning[] = [];

  // 1) Importados por período.
  const imported = input.periodMetrics.filter(m => campaigns.has(m.campaign_id)).map(m => ({ ...m, period_start: day(m.period_start), period_end: day(m.period_end) }));
  for (const m of imported) {
    const t = setType(m.ad_set_id);
    const crossMonth = m.period_start.slice(0, 7) !== m.period_end.slice(0, 7);
    facts.push({ campaign_id: m.campaign_id, company_id: companyOf(m.campaign_id), ad_set_id: m.ad_set_id, creative_id: m.creative_id, date: m.period_end, month: m.period_end.slice(0, 7), period_start: m.period_start, period_end: m.period_end, source: "importado", type: t.type, typeOrigin: t.origin, crossMonth, m: importedMetrics(m) });
  }
  // Períodos sobrepostos (diferentes) do mesmo anúncio — os dois continuam gravados; avisamos.
  const byCreative = new Map<string, typeof imported>();
  for (const m of imported) byCreative.set(m.creative_id, [...(byCreative.get(m.creative_id) ?? []), m]);
  for (const [creative, list] of byCreative) {
    const overlapping = list.filter((a, i) => list.some((b, j) => i !== j && !(a.period_start === b.period_start && a.period_end === b.period_end) && a.period_start <= b.period_end && b.period_start <= a.period_end));
    if (overlapping.length) warnings.push({ kind: "overlap", campaign_id: overlapping[0].campaign_id, creative_id: creative, periods: overlapping.map(o => [o.period_start, o.period_end] as [string, string]) });
  }
  const seenCross = new Set<string>();
  for (const m of imported) {
    const k = `${m.campaign_id}|${m.period_start}|${m.period_end}`;
    if (m.period_start.slice(0, 7) !== m.period_end.slice(0, 7) && !seenCross.has(k)) { seenCross.add(k); warnings.push({ kind: "cross_month", campaign_id: m.campaign_id, period_start: m.period_start, period_end: m.period_end }); }
  }

  // 2) Manual por conjunto/anúncio — descartado se coberto por período importado do mesmo anúncio (ou conjunto).
  const coveredByImport = (r: HistoryAdLevelEntry) => imported.some(p => day(r.entry_date) >= p.period_start && day(r.entry_date) <= p.period_end && (r.creative_id ? r.creative_id === p.creative_id : r.ad_set_id === p.ad_set_id));
  const level = input.adLevelEntries.filter(r => campaigns.has(r.campaign_id) && !coveredByImport(r));
  const adDates = new Set(level.filter(r => r.creative_id).map(r => `${r.ad_set_id}|${day(r.entry_date)}`));
  const levelKept = level.filter(r => r.creative_id || !adDates.has(`${r.ad_set_id}|${day(r.entry_date)}`));
  for (const r of levelKept) {
    const t = setType(r.ad_set_id);
    const d = day(r.entry_date);
    facts.push({ campaign_id: r.campaign_id, company_id: companyOf(r.campaign_id), ad_set_id: r.ad_set_id, creative_id: r.creative_id, date: d, month: d.slice(0, 7), period_start: d, period_end: d, source: "manual_conjunto", type: t.type, typeOrigin: t.origin, crossMonth: false, m: manualMetrics(r) });
  }

  // 3) Manual da campanha — descartado se a data tem detalhe por conjunto ou está num período importado.
  const detailDates = new Set(levelKept.map(r => `${r.campaign_id}|${day(r.entry_date)}`));
  for (const r of input.campaignEntries) {
    if (!campaigns.has(r.campaign_id)) continue;
    const d = day(r.entry_date);
    if (detailDates.has(`${r.campaign_id}|${d}`)) continue;
    if (imported.some(p => p.campaign_id === r.campaign_id && d >= p.period_start && d <= p.period_end)) continue;
    const t = campaignLevelType(r.campaign_id);
    facts.push({ campaign_id: r.campaign_id, company_id: companyOf(r.campaign_id), ad_set_id: null, creative_id: null, date: d, month: d.slice(0, 7), period_start: d, period_end: d, source: "manual_campanha", type: t.type, typeOrigin: t.origin, crossMonth: false, m: manualMetrics(r) });
  }
  facts.sort((a, b) => a.date.localeCompare(b.date) || a.campaign_id.localeCompare(b.campaign_id));
  return { facts, warnings };
}

// ------------------------------------------------------------------ resumo

/** Quantidade de resultados de cada tipo (para "custo por resultado"). */
const RESULT_METRIC: Partial<Record<ResultType, MetricKey[]>> = {
  mensagens: ["messages"],
  visualizacoes: ["thruplays", "views"],
  vendas: ["sales"],
  leads: ["leads"],
  trafego: ["link_clicks"],
  engajamento: ["engagements"],
};
export const resultMetricLabel: Partial<Record<ResultType, string>> = { mensagens: "conversas", visualizacoes: "ThruPlays/visualizações", vendas: "vendas", leads: "leads", trafego: "cliques no link", engajamento: "interações" };

export type HistorySummary = {
  facts: number;
  totals: Metrics;
  /** Investimento dos fatos de mensagens (o único que entra no custo por mensagem). */
  messagingSpend: number;
  messagingMessages: number;
  costPerMessage: number | null;
  /** Conversas registradas em fatos que NÃO são de mensagens (não entram no custo). */
  otherMessages: number;
  costPerSale: number | null;
  roas: number | null;
  /** Alcance só quando há um único registro (não é somável entre anúncios/períodos). */
  reachNotSummable: boolean;
  spendByType: Partial<Record<ResultType | "misto" | "sem_classificacao", number>>;
  primaryType: ResultType | null;
  resultsByType: Partial<Record<ResultType, { spend: number; results: number | null; cost: number | null }>>;
  unclassifiedSpend: number;
  mixedSpend: number;
  crossMonthFacts: number;
};

export function summarize(facts: HistoryFact[]): HistorySummary {
  const totals = Object.fromEntries(METRIC_KEYS.map(k => [k, null])) as Metrics;
  for (const f of facts) for (const k of METRIC_KEYS) {
    const v = f.m[k];
    if (v === null) continue;
    totals[k] = (totals[k] ?? 0) + v;
  }
  if (totals.spend !== null) totals.spend = round2(totals.spend);
  if (totals.revenue !== null) totals.revenue = round2(totals.revenue);
  const withReach = facts.filter(f => f.m.reach !== null);
  const reachNotSummable = withReach.length > 1;
  if (reachNotSummable) totals.reach = null;

  const spendByType: HistorySummary["spendByType"] = {};
  for (const f of facts) {
    const k = f.type ?? "sem_classificacao";
    spendByType[k] = round2((spendByType[k] ?? 0) + (f.m.spend ?? 0));
  }
  const msgFacts = facts.filter(f => f.type === "mensagens");
  const messagingSpend = round2(msgFacts.reduce((a, f) => a + (f.m.spend ?? 0), 0));
  const messagingMessages = msgFacts.reduce((a, f) => a + (f.m.messages ?? 0), 0);
  const otherMessages = facts.filter(f => f.type !== "mensagens").reduce((a, f) => a + (f.m.messages ?? 0), 0);

  const resultsByType: HistorySummary["resultsByType"] = {};
  for (const t of RESULT_TYPE_VALUES) {
    const of = facts.filter(f => f.type === t);
    if (!of.length) continue;
    const spend = round2(of.reduce((a, f) => a + (f.m.spend ?? 0), 0));
    const keys = RESULT_METRIC[t];
    let results: number | null = null;
    if (keys) for (const k of keys) {
      const known = of.filter(f => f.m[k] !== null);
      if (known.length) { results = known.reduce((a, f) => a + (f.m[k] ?? 0), 0); break; }
    }
    resultsByType[t] = { spend, results, cost: results && results > 0 && spend > 0 ? spend / results : null };
  }
  const classified = Object.entries(spendByType).filter(([k]) => (RESULT_TYPE_VALUES as string[]).includes(k)).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
  const spend = totals.spend ?? 0;
  return {
    facts: facts.length,
    totals,
    messagingSpend,
    messagingMessages,
    costPerMessage: messagingMessages > 0 && messagingSpend > 0 ? messagingSpend / messagingMessages : null,
    otherMessages,
    costPerSale: (totals.sales ?? 0) > 0 && spend > 0 ? spend / (totals.sales as number) : null,
    roas: spend > 0 && totals.revenue !== null ? totals.revenue / spend : null,
    reachNotSummable,
    spendByType,
    primaryType: classified.length ? (classified[0][0] as ResultType) : null,
    resultsByType,
    unclassifiedSpend: spendByType.sem_classificacao ?? 0,
    mixedSpend: spendByType.misto ?? 0,
    crossMonthFacts: facts.filter(f => f.crossMonth).length,
  };
}

// --------------------------------------------------------------- períodos

export function monthsWithData(facts: HistoryFact[]): string[] {
  return [...new Set(facts.map(f => f.month))].sort().reverse();
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export type PeriodFilter = { kind: "month"; month: string } | { kind: "range"; from: string; to: string } | { kind: "all" };

/**
 * Filtra por período. Mês: mês de referência (igual aos relatórios).
 * Intervalo personalizado: período importado só entra se estiver TODO dentro
 * do intervalo; os parciais são devolvidos em `partial` (não são rateados).
 */
export function filterFacts(facts: HistoryFact[], period: PeriodFilter): { facts: HistoryFact[]; partial: HistoryFact[] } {
  if (period.kind === "all") return { facts, partial: [] };
  if (period.kind === "month") return { facts: facts.filter(f => f.month === period.month), partial: [] };
  const from = period.from || "0000-01-01", to = period.to || "9999-12-31";
  const inside: HistoryFact[] = [], partial: HistoryFact[] = [];
  for (const f of facts) {
    if (f.period_start >= from && f.period_end <= to) inside.push(f);
    else if (f.period_start <= to && f.period_end >= from) partial.push(f);
  }
  return { facts: inside, partial };
}

export function periodLabel(p: PeriodFilter): string {
  if (p.kind === "all") return "Todo o período";
  if (p.kind === "month") return monthLabel(p.month);
  const br = (d: string) => d ? d.split("-").reverse().join("/") : "…";
  return `${br(p.from)} a ${br(p.to)}`;
}

export function monthLabel(month: string): string {
  const s = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(month + "-01T12:00:00Z"));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Evolução de uma campanha mês a mês (meses com dados). */
export function campaignEvolution(facts: HistoryFact[], campaignId: string): { month: string; summary: HistorySummary }[] {
  const own = facts.filter(f => f.campaign_id === campaignId);
  return monthsWithData(own).reverse().map(month => ({ month, summary: summarize(own.filter(f => f.month === month)) }));
}

// -------------------------------------------------------------- comparação

export type Diff = { abs: number; pct: number | null } | null;
export function diff(base: number | null, value: number | null): Diff {
  if (base === null || value === null) return null;
  return { abs: value - base, pct: base !== 0 ? ((value - base) / Math.abs(base)) * 100 : null };
}

/** Para custos, menor é melhor; para volumes, maior é melhor. */
export const LOWER_IS_BETTER = new Set(["costPerMessage", "costPerSale", "costPerResult"]);

export type ComparisonInsight = {
  objective: ResultType;
  /** Índices com resultados do objetivo. */
  eligible: number[];
  bestCost: number | null;
  bestVolume: number | null;
  lowVolume: number[];
  notes: string[];
};

/**
 * Destaques sem "declarar vencedor" só por gastar menos: considera o
 * objetivo escolhido, exige resultados do objetivo e sinaliza volume baixo
 * (< 30% do maior volume), quando o custo menor é pouco conclusivo.
 */
export function compareInsight(summaries: HistorySummary[], objective: ResultType, labels: string[]): ComparisonInsight {
  const stat = summaries.map(s => s.resultsByType[objective] ?? null);
  const eligible = stat.map((r, i) => (r && r.results && r.results > 0 ? i : -1)).filter(i => i >= 0);
  const notes: string[] = [];
  const unit = resultMetricLabel[objective] ?? "resultados";
  if (eligible.length < 2) {
    notes.push(eligible.length ? `Só uma das seleções tem ${unit} registrados — não há como comparar o custo do objetivo.` : `Nenhuma seleção tem ${unit} registrados para o objetivo escolhido.`);
    return { objective, eligible, bestCost: null, bestVolume: eligible[0] ?? null, lowVolume: [], notes };
  }
  const maxVolume = Math.max(...eligible.map(i => stat[i]!.results!));
  const lowVolume = eligible.filter(i => stat[i]!.results! < maxVolume * 0.3);
  const solid = eligible.filter(i => !lowVolume.includes(i) && stat[i]!.cost !== null);
  const bestCost = solid.length ? solid.reduce((a, b) => (stat[b]!.cost! < stat[a]!.cost! ? b : a)) : null;
  const bestVolume = eligible.reduce((a, b) => (stat[b]!.results! > stat[a]!.results! ? b : a));
  if (bestCost !== null) notes.push(`Menor custo por ${unit.replace(/s$/, "")} com volume relevante: ${labels[bestCost]}.`);
  notes.push(`Maior volume de ${unit}: ${labels[bestVolume]} (${stat[bestVolume]!.results!.toLocaleString("pt-BR")}).`);
  for (const i of lowVolume) notes.push(`${labels[i]} teve volume baixo (${stat[i]!.results!.toLocaleString("pt-BR")} ${unit}) — o custo dela é pouco conclusivo.`);
  if (bestCost !== null && bestCost !== bestVolume) notes.push("O menor custo e o maior volume estão em seleções diferentes: avalie o objetivo do período antes de decidir.");
  return { objective, eligible, bestCost, bestVolume, lowVolume, notes };
}

/** Pontos elegíveis para custo por mensagem (usados pelos painéis/relatórios existentes). */
export type MessagingPoint = { campaign_id: string; company_id: string; date: string; month: string; spend: number; messages: number };
export function messagingPoints(facts: HistoryFact[]): MessagingPoint[] {
  return facts.filter(f => f.type === "mensagens").map(f => ({ campaign_id: f.campaign_id, company_id: f.company_id, date: f.date, month: f.month, spend: f.m.spend ?? 0, messages: f.m.messages ?? 0 }));
}
export function messagingCost(points: MessagingPoint[]): { spend: number; messages: number; cost: number | null } {
  const spend = round2(points.reduce((a, p) => a + p.spend, 0));
  const messages = points.reduce((a, p) => a + p.messages, 0);
  return { spend, messages, cost: messages > 0 && spend > 0 ? spend / messages : null };
}
