import { messagingCost, monthLabel, shiftMonth, type MessagingPoint } from "@/lib/clt/history";
import { EXTRA_METRIC_KEYS, addRatio, cpc as cpcOf, cpm as cpmOf, ctr as ctrOf, emptyRatio, rowRatioBase, type ExtraMetricKey, type RatioBase } from "@/lib/clt/result-metrics";

/**
 * Períodos dos Relatórios (CLT e MKT) — puro, usado pela prévia e pelo PDF.
 *
 * Regra de inclusão dos dados (sem ratear nada entre dias):
 *  - Períodos alinhados a meses (mês, intervalo de meses, ano): igual ao
 *    relatório mensal de sempre — cada dado entra pela DATA FINAL (o
 *    importado por período entra no mês em que termina).
 *  - Intervalo de dias: só entra o dado cujo período inteiro está dentro do
 *    intervalo. Importados que cruzam o início/fim ficam de fora e são
 *    contados em `partial` para o relatório avisar a limitação.
 * Cada dado entra no máximo uma vez (sem dupla contagem).
 */
export type ReportPeriod =
  | { kind: "month"; month: string }
  | { kind: "days"; from: string; to: string }
  | { kind: "months"; from: string; to: string }
  | { kind: "year"; year: number }
  /** Todo o histórico (sem limite de datas). */
  | { kind: "all" };

/** Limites de "Todos os períodos". */
export const ALL_FROM = "0000-01-01";
export const ALL_TO = "9999-12-31";

const DAY_MS = 86_400_000;
const addDays = (date: string, n: number) => new Date(Date.parse(date + "T12:00:00Z") + n * DAY_MS).toISOString().slice(0, 10);
const lastDayOf = (month: string) => { const [y, m] = month.split("-").map(Number); return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`; };
const br = (d: string) => d.split("-").reverse().join("/");
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;

/** Datas inicial e final (inclusivas, yyyy-MM-dd). */
export function periodBounds(p: ReportPeriod): { from: string; to: string } {
  switch (p.kind) {
    case "month": return { from: `${p.month}-01`, to: lastDayOf(p.month) };
    case "months": return { from: `${p.from}-01`, to: lastDayOf(p.to) };
    case "year": return { from: `${p.year}-01-01`, to: `${p.year}-12-31` };
    case "days": return { from: p.from, to: p.to };
    case "all": return { from: ALL_FROM, to: ALL_TO };
  }
}

/** Erro de preenchimento do seletor, ou null. */
export function validatePeriod(p: ReportPeriod): string | null {
  if (p.kind === "all") return null;
  if (p.kind === "month") return MONTH.test(p.month) ? null : "Escolha o mês.";
  if (p.kind === "year") return Number.isInteger(p.year) && p.year >= 2000 && p.year <= 2100 ? null : "Escolha o ano.";
  const re = p.kind === "days" ? DATE : MONTH;
  if (!re.test(p.from) || !re.test(p.to)) return p.kind === "days" ? "Escolha a data inicial e a final." : "Escolha o mês inicial e o final.";
  if (p.to < p.from) return "A data final não pode ser antes da inicial.";
  return null;
}

export function reportPeriodLabel(p: ReportPeriod): string {
  if (p.kind === "all") return "Todos os períodos";
  if (p.kind === "month") return monthLabel(p.month);
  if (p.kind === "year") return String(p.year);
  if (p.kind === "months") return p.from === p.to ? monthLabel(p.from) : `${monthLabel(p.from)} a ${monthLabel(p.to)}`;
  return `${br(p.from)} a ${br(p.to)}`;
}

/** "01/10/2026 a 31/10/2026". */
export function reportPeriodDates(p: ReportPeriod): string {
  if (p.kind === "all") return "todo o histórico";
  const { from, to } = periodBounds(p);
  return `${br(from)} a ${br(to)}`;
}

/** Período anterior equivalente (mesmo tipo e duração, imediatamente antes). */
/** Período anterior equivalente. "Todos os períodos" não tem anterior (devolve ele mesmo; a tela esconde a comparação). */
export function previousPeriod(p: ReportPeriod): ReportPeriod {
  if (p.kind === "all") return p;
  if (p.kind === "month") return { kind: "month", month: shiftMonth(p.month, -1) };
  if (p.kind === "year") return { kind: "year", year: p.year - 1 };
  if (p.kind === "months") {
    const [fy, fm] = p.from.split("-").map(Number), [ty, tm] = p.to.split("-").map(Number);
    const n = (ty - fy) * 12 + (tm - fm) + 1;
    return { kind: "months", from: shiftMonth(p.from, -n), to: shiftMonth(p.from, -1) };
  }
  const days = Math.round((Date.parse(p.to) - Date.parse(p.from)) / DAY_MS) + 1;
  return { kind: "days", from: addDays(p.from, -days), to: addDays(p.from, -1) };
}

/** Meses (yyyy-MM) cobertos pelo período — base da "Evolução mensal". */
export function periodMonths(p: ReportPeriod): string[] {
  if (p.kind === "all") return [];
  const { from, to } = periodBounds(p);
  const out: string[] = [];
  for (let m = from.slice(0, 7); m <= to.slice(0, 7); m = shiftMonth(m, 1)) out.push(m);
  return out;
}

export type Span = { start: string; end: string };

/** O dado entra no período? (ver regra no topo). `partial` = cruza a borda de um intervalo de dias. */
export function spanInPeriod(span: Span, p: ReportPeriod): "in" | "out" | "partial" {
  const { from, to } = periodBounds(p);
  if (p.kind === "all") return "in";
  if (p.kind !== "days") return span.end >= from && span.end <= to ? "in" : "out";
  if (span.start >= from && span.end <= to) return "in";
  return span.start <= to && span.end >= from ? "partial" : "out";
}

// ------------------------------------------------------------------ dados

export type ReportResult = { campaign_id: string; entry_date: string; spent_amount: number; generated_revenue: number; views: number; impressions: number; thruplays: number; messages: number; sales: number; period_start?: string | null; reach?: number | null; link_clicks?: number | null; leads?: number | null; engagements?: number | null; ratio?: RatioBase } & Partial<Record<ExtraMetricKey, number | null>>;
export type ReportMovement = { company_id: string; movement_date: string; kind: string; amount: number };
export type ReportCampaign = { id: string; company_id: string; starts_on: string; planned_amount: number | null | undefined };

/** Intervalo real de um resultado (importado por período ou lançamento de um dia). */
export const resultSpan = (r: ReportResult): Span => ({ start: (r.period_start || r.entry_date).slice(0, 10), end: r.entry_date.slice(0, 10) });
const pointSpan = (p: MessagingPoint): Span => ({ start: (p.period_start || p.date).slice(0, 10), end: (p.period_end || p.date).slice(0, 10) });

export type ReportMetrics = {
  gasto: number; faturamento: number; resultado: number; views: number; impressions: number; thruplays: number; messages: number; sales: number;
  /** Alcance é somado entre registros (não é alcance único). */
  reach: number; linkClicks: number; leads: number; engagements: number;
  /** Engajamento e vídeo (novos seguidores = atribuídos aos anúncios; não é o total do Instagram). */
  reactions: number; comments: number; shares: number; newFollowers: number; video3s: number; video75: number; video100: number;
  deposito: number; credito: number; planned: number;
  /** Custo por mensagem: só investimento/conversas de campanhas/conjuntos de MENSAGENS. */
  msgSpend: number; msgMessages: number;
  /** Resultados importados que cruzam a borda de um intervalo de dias (não incluídos). */
  partial: number;
} & RatioBase;

export const EMPTY_METRICS: ReportMetrics = { gasto: 0, faturamento: 0, resultado: 0, views: 0, impressions: 0, thruplays: 0, messages: 0, sales: 0, reach: 0, linkClicks: 0, leads: 0, engagements: 0, reactions: 0, comments: 0, shares: 0, newFollowers: 0, video3s: 0, video75: 0, video100: 0, deposito: 0, credito: 0, planned: 0, msgSpend: 0, msgMessages: 0, partial: 0, ...emptyRatio() };

/** Campo de `ReportMetrics` de cada coluna nova. */
const EXTRA_TO_METRIC: Record<ExtraMetricKey, keyof ReportMetrics> = { reactions: "reactions", comments: "comments", shares: "shares", new_followers: "newFollowers", video_plays_3s: "video3s", video_p75: "video75", video_p100: "video100" };

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Indicadores de um conjunto de campanhas no período. `campaignIds` já vem
 * sem as campanhas "antigas" do comparativo manual (como antes).
 */
export function periodMetrics(input: {
  period: ReportPeriod;
  campaignIds: Set<string>;
  results: ReportResult[];
  messaging: MessagingPoint[];
  movements?: ReportMovement[];
  campaigns?: ReportCampaign[];
}): ReportMetrics {
  const { period } = input;
  const { from, to } = periodBounds(period);
  const out = { ...EMPTY_METRICS };
  for (const r of input.results) {
    if (!input.campaignIds.has(r.campaign_id)) continue;
    const where = spanInPeriod(resultSpan(r), period);
    if (where === "partial") { out.partial++; continue; }
    if (where === "out") continue;
    out.gasto += Number(r.spent_amount || 0); out.faturamento += Number(r.generated_revenue || 0);
    out.views += Number(r.views || 0); out.impressions += Number(r.impressions || 0); out.thruplays += Number(r.thruplays || 0);
    out.messages += Number(r.messages || 0); out.sales += Number(r.sales || 0);
    out.reach += Number(r.reach || 0); out.linkClicks += Number(r.link_clicks || 0); out.leads += Number(r.leads || 0); out.engagements += Number(r.engagements || 0);
    for (const k of EXTRA_METRIC_KEYS) out[EXTRA_TO_METRIC[k]] += Number(r[k] || 0);
    Object.assign(out, addRatio(out, rowRatioBase(r)));
  }
  const elig = messagingCost(input.messaging.filter((p) => input.campaignIds.has(p.campaign_id) && spanInPeriod(pointSpan(p), period) === "in"));
  out.msgSpend = elig.spend; out.msgMessages = elig.messages;
  for (const m of input.movements ?? []) {
    if (m.movement_date < from || m.movement_date > to) continue;
    if (m.kind === "deposito") out.deposito += Number(m.amount || 0);
    if (m.kind === "credito") out.credito += Number(m.amount || 0);
  }
  // Planejado: campanhas informadas (todas da empresa, como sempre) que começam no período.
  out.planned = (input.campaigns ?? []).filter((c) => c.starts_on.slice(0, 10) >= from && c.starts_on.slice(0, 10) <= to).reduce((a, c) => a + Number(c.planned_amount || 0), 0);
  for (const k of ["gasto", "faturamento", "deposito", "credito", "planned", "cpcSpend", "cpmSpend"] as const) out[k] = round2(out[k]);
  out.resultado = round2(out.faturamento - out.gasto);
  return out;
}

export function sumMetrics(list: ReportMetrics[]): ReportMetrics {
  const out = { ...EMPTY_METRICS };
  for (const m of list) for (const k of Object.keys(out) as (keyof ReportMetrics)[]) out[k] += m[k];
  for (const k of ["gasto", "faturamento", "resultado", "deposito", "credito", "planned", "msgSpend", "cpcSpend", "cpmSpend"] as const) out[k] = round2(out[k]);
  return out;
}

export const costPerMessage = (m: ReportMetrics) => (m.msgMessages > 0 && m.msgSpend > 0 ? m.msgSpend / m.msgMessages : null);
export const costPerSale = (m: ReportMetrics) => (m.sales > 0 && m.gasto > 0 ? m.gasto / m.sales : null);
/** ROAS = faturamento atribuído ÷ investimento (sem investimento, não há ROAS). */
export const roas = (m: ReportMetrics) => (m.gasto > 0 ? m.faturamento / m.gasto : null);
/** CPC, CTR (%) e CPM do período — só com registros que informaram as duas pontas; sem base → null ("—"). */
export const cpc = (m: ReportMetrics) => cpcOf(m);
export const ctr = (m: ReportMetrics) => ctrOf(m);
export const cpm = (m: ReportMetrics) => cpmOf(m);

// ------------------------------------------------------------- campanhas

export type PeriodCampaign = { id: string; starts_on: string; ends_on?: string | null; campaign_status?: string | null };

/**
 * Período em que a campanha esteve EM EXECUÇÃO (datas reais, nunca a data de
 * cadastro). Sem data final: ativa/pausada vai até hoje; planejada/finalizada
 * fica só no dia de início — nunca se presume que uma campanha antiga segue ativa.
 */
export function campaignRunSpan(c: PeriodCampaign, today: string): Span {
  const start = c.starts_on.slice(0, 10);
  let end = c.ends_on ? c.ends_on.slice(0, 10) : c.campaign_status === "ativa" || c.campaign_status === "pausada" ? today : start;
  if (end < start) end = start;
  return { start, end };
}

/** Campanhas que estiveram em execução em algum dia do período (atravessar meses = aparece nos dois). */
export function campaignsInPeriod<T extends PeriodCampaign>(campaigns: T[], p: ReportPeriod, today: string): T[] {
  if (p.kind === "all") return campaigns;
  const { from, to } = periodBounds(p);
  return campaigns.filter((c) => { const s = campaignRunSpan(c, today); return s.start <= to && s.end >= from; });
}

/** Atalhos "Este mês" / "Mês passado" (São Paulo). */
export const thisMonthPeriod = (today: string): ReportPeriod => ({ kind: "month", month: today.slice(0, 7) });
export const lastMonthPeriod = (today: string): ReportPeriod => ({ kind: "month", month: shiftMonth(today.slice(0, 7), -1) });

export type Change = { current: number | null; previous: number | null; diff: number | null; pct: number | null };
/** Diferença absoluta e % (null quando não há base para comparar). */
export function change(current: number | null, previous: number | null): Change {
  if (current === null || previous === null) return { current, previous, diff: null, pct: null };
  const diff = current - previous;
  return { current, previous, diff, pct: previous !== 0 ? (diff / Math.abs(previous)) * 100 : null };
}
