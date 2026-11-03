import type { ResultType } from "@/lib/clt/history";

/**
 * "Atualizar resultados" de UM anúncio — puro (sem I/O), usado pela ação do
 * servidor e pelo formulário.
 *
 * A pessoa informa os NOVOS TOTAIS acumulados do anúncio. O total atual vem
 * de todas as linhas que já contam para o anúncio (importadas, atualizações
 * manuais e lançamentos antigos). Gravamos só a DIFERENÇA:
 *  - normalmente num período novo [dia seguinte ao último dado → hoje]
 *    (`source = 'manual_update'`), que entra nos relatórios como qualquer
 *    período importado — sem ratear entre dias, sem mexer no passado;
 *  - se a última atualização manual é de hoje, ela é ajustada (sem criar
 *    outra linha no mesmo dia);
 *  - se algum total DIMINUI (correção), ajustamos a última atualização
 *    manual; se isso deixaria valor negativo, recusamos (a diferença está em
 *    dados importados — corrija reimportando o período).
 * Campo vazio = "não informado": não muda nada.
 */

export type AdMetricKey = "spend" | "conversations" | "sales" | "revenue" | "impressions" | "reach" | "views" | "thruplays" | "engagements" | "link_clicks" | "leads";

export const AD_METRICS: Array<{ key: AdMetricKey; label: string; money?: boolean; rowKey: string }> = [
  { key: "spend", label: "Investimento (R$)", money: true, rowKey: "spent_amount" },
  { key: "conversations", label: "Conversas / mensagens", rowKey: "messages" },
  { key: "sales", label: "Vendas", rowKey: "sales" },
  { key: "revenue", label: "Faturamento (R$)", money: true, rowKey: "generated_revenue" },
  { key: "impressions", label: "Impressões", rowKey: "impressions" },
  { key: "reach", label: "Alcance", rowKey: "reach" },
  { key: "views", label: "Visualizações", rowKey: "views" },
  { key: "thruplays", label: "ThruPlays", rowKey: "thruplays" },
  { key: "engagements", label: "Interações", rowKey: "engagements" },
  { key: "link_clicks", label: "Cliques no link", rowKey: "link_clicks" },
  { key: "leads", label: "Leads", rowKey: "leads" },
];

/** Campos mostrados primeiro conforme o tipo de resultado do conjunto/campanha (os demais ficam em "mais indicadores"). */
export function primaryMetrics(type: ResultType | "misto" | null): AdMetricKey[] {
  const base: AdMetricKey[] = ["spend", "impressions", "reach"];
  const specific: Partial<Record<ResultType, AdMetricKey[]>> = {
    mensagens: ["conversations", "sales", "revenue"],
    vendas: ["sales", "revenue"],
    visualizacoes: ["views", "thruplays"],
    engajamento: ["engagements"],
    trafego: ["link_clicks"],
    leads: ["leads"],
  };
  const extra = type && type !== "misto" ? specific[type] ?? [] : ["conversations", "sales", "revenue"];
  return [...base.slice(0, 1), ...extra, ...base.slice(1)] as AdMetricKey[];
}

export type Totals = Record<AdMetricKey, number | null>;

/** Linha que conta para o anúncio (formato das telas: `AdLevelRow`). */
export type CountedRow = Record<string, unknown> & { entry_date: string; period_start?: string; period_end?: string; source?: string; unknown?: string[] };

const round2 = (n: number) => Math.round(n * 100) / 100;
const isMoney = (k: AdMetricKey) => k === "spend" || k === "revenue";

/** Totais atuais do anúncio; null = nenhuma linha informou aquele campo. */
export function currentTotals(rows: CountedRow[]): Totals {
  const out = Object.fromEntries(AD_METRICS.map((m) => [m.key, null])) as Totals;
  for (const m of AD_METRICS) {
    for (const r of rows) {
      if (r.unknown?.includes(m.rowKey)) continue;
      const v = Number(r[m.rowKey] ?? 0);
      // Lançamentos antigos guardam 0 quando o campo não foi usado: só contam como "informado" se > 0 (exceto investimento/conversas/vendas/faturamento).
      if (!r.period_end && !["spent_amount", "messages", "sales", "generated_revenue"].includes(m.rowKey) && !v) continue;
      out[m.key] = (out[m.key] ?? 0) + v;
    }
    if (out[m.key] !== null && isMoney(m.key)) out[m.key] = round2(out[m.key]!);
  }
  return out;
}

export type UpdateRow = { id: string; period_start: string; period_end: string; source?: string | null } & Partial<Record<AdMetricKey, number | string | null>>;

export type UpdatePlan = {
  mode: "novo_periodo" | "ajuste";
  /** Linha manual a ajustar (modo ajuste). */
  metricId: string | null;
  periodStart: string;
  periodEnd: string;
  /** Valores ABSOLUTOS da linha gravada (null = não informado). */
  values: Record<AdMetricKey, number | null>;
  previous: Partial<Totals>;
  updated: Partial<Record<AdMetricKey, number>>;
  delta: Partial<Record<AdMetricKey, number>>;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const br = (d: string) => d.split("-").reverse().join("/");

/**
 * Período de referência válido? Recusa datas futuras e períodos TOTALMENTE
 * dentro de um período importado do mesmo anúncio (o importado prevalece e o
 * valor sumiria dos totais). Usado também por "Editar período".
 */
export function validateReference(ref: { start: string; end: string }, today: string, rows: CountedRow[]): string | null {
  if (!DATE_RE.test(ref.start) || !DATE_RE.test(ref.end)) return "Escolha o período dos resultados.";
  if (ref.end < ref.start) return "A data final do período não pode ser antes da inicial.";
  if (ref.end > today) return "O período dos resultados não pode terminar no futuro.";
  const imp = rows.find((r) => r.source === "import" && typeof r.period_start === "string" && r.period_end && String(r.period_start) <= ref.start && String(r.period_end) >= ref.end);
  if (imp) return `Esse período está dentro da importação de ${br(String(imp.period_start))} a ${br(String(imp.period_end))}, que prevalece — os valores não contariam. Escolha um período fora dela ou reimporte o arquivo atualizado.`;
  return null;
}

/** "Mês de referência" → do dia 1 até o último dia (ou até hoje, no mês atual). */
export function monthReference(month: string, today: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const last = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
  return { start: `${month}-01`, end: last > today ? today : last };
}

const addDays = (d: string, n: number) => new Date(Date.parse(d + "T12:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
const num = (v: number | string | null | undefined) => (v === null || v === undefined || v === "" ? null : Number(v));

export function planAdResultUpdate(input: {
  /** Linhas que contam hoje para o anúncio (já sem as descartadas). */
  rows: CountedRow[];
  /** Linhas `manual_update` do anúncio (as que podem ser ajustadas). */
  updateRows: UpdateRow[];
  /** Novos totais; undefined/null = não informado (mantém). */
  values: Partial<Record<AdMetricKey, number | null>>;
  today: string;
  campaignStart?: string | null;
  /**
   * Período de REFERÊNCIA (quando os resultados aconteceram), escolhido no
   * formulário. A data do registro fica no histórico (created_at). Sem ele,
   * vale a regra antiga: do dia seguinte ao último dado até hoje.
   */
  reference?: { start: string; end: string } | null;
}): { error: string } | UpdatePlan {
  if (input.reference) {
    const err = validateReference(input.reference, input.today, input.rows);
    if (err) return { error: err };
  }
  const prev = currentTotals(input.rows);
  const delta: Partial<Record<AdMetricKey, number>> = {};
  const updated: Partial<Record<AdMetricKey, number>> = {};
  const previous: Partial<Totals> = {};
  for (const m of AD_METRICS) {
    const v = input.values[m.key];
    if (v === undefined || v === null) continue;
    if (!Number.isFinite(v) || v < 0) return { error: `${m.label}: valor inválido.` };
    if (!isMoney(m.key) && !Number.isInteger(v)) return { error: `${m.label}: use um número inteiro.` };
    const before = prev[m.key];
    const d = isMoney(m.key) ? round2(v - (before ?? 0)) : v - (before ?? 0);
    if (d === 0 && before !== null) continue;
    delta[m.key] = d; updated[m.key] = v; previous[m.key] = before;
  }
  if (!Object.keys(updated).length) return { error: "Nenhum valor mudou." };

  const decreasing = Object.values(delta).some((d) => d! < 0);
  let adjust: UpdateRow | null;
  if (input.reference) {
    // Com período escolhido: só ajusta a atualização do MESMO período (nunca mexe em outro período sem você escolher).
    const ref = input.reference;
    adjust = input.updateRows.find((u) => u.period_start === ref.start && u.period_end === ref.end) ?? null;
    if (!adjust && decreasing) {
      const k = (Object.keys(delta) as AdMetricKey[]).find((x) => delta[x]! < 0)!;
      return { error: `${AD_METRICS.find((m) => m.key === k)!.label}: o novo total é menor do que o atual. Para corrigir para baixo, escolha o MESMO período da atualização que deseja corrigir (ou use "Editar período" no histórico).` };
    }
  } else {
    const latestUpdate = [...input.updateRows].sort((a, b) => b.period_end.localeCompare(a.period_end) || b.id.localeCompare(a.id))[0];
    adjust = latestUpdate && (latestUpdate.period_end === input.today || decreasing) ? latestUpdate : null;
  }

  if (adjust) {
    const values = {} as Record<AdMetricKey, number | null>;
    for (const m of AD_METRICS) {
      const base = num(adjust[m.key]);
      if (delta[m.key] === undefined) { values[m.key] = base; continue; }
      const next = (base ?? 0) + delta[m.key]!;
      if (next < 0) return { error: `${m.label}: o novo total (${updated[m.key]}) é menor do que o já registrado por importações/lançamentos anteriores. Para reduzir, corrija a origem (reimporte o período).` };
      values[m.key] = isMoney(m.key) ? round2(next) : next;
    }
    return { mode: "ajuste", metricId: adjust.id, periodStart: adjust.period_start, periodEnd: adjust.period_end, values, previous, updated, delta };
  }
  if (decreasing) {
    const k = (Object.keys(delta) as AdMetricKey[]).find((x) => delta[x]! < 0)!;
    return { error: `${AD_METRICS.find((m) => m.key === k)!.label}: o novo total é menor do que o já registrado (${prev[k]}). Esses valores vêm de importação ou lançamentos anteriores — corrija a origem (reimporte o período).` };
  }

  if (input.reference) {
    const values = Object.fromEntries(AD_METRICS.map((m) => [m.key, delta[m.key] ?? null])) as Record<AdMetricKey, number | null>;
    return { mode: "novo_periodo", metricId: null, periodStart: input.reference.start, periodEnd: input.reference.end, values, previous, updated, delta };
  }
  // Sem período escolhido: do dia seguinte ao último dado do anúncio até hoje (sem dados: desde o início da campanha).
  const lastDay = input.rows.map((r) => String(r.period_end ?? r.entry_date).slice(0, 10)).sort().at(-1);
  let start = lastDay ? addDays(lastDay, 1) : input.campaignStart && input.campaignStart <= input.today ? input.campaignStart : input.today;
  if (start > input.today) start = input.today;
  const values = Object.fromEntries(AD_METRICS.map((m) => [m.key, delta[m.key] ?? null])) as Record<AdMetricKey, number | null>;
  return { mode: "novo_periodo", metricId: null, periodStart: start, periodEnd: input.today, values, previous, updated, delta };
}
