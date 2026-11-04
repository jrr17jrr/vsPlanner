/**
 * Taxa de Gancho (Hook Rate) e Taxa de Retenção (Hold Rate) — INFORMADAS
 * (vêm prontas do Meta Ads). Puro, sem I/O.
 *
 * Regras:
 *  - Nada é calculado: o percentual é salvo exatamente como informado
 *    (até 2 casas decimais, ex.: 35,75%).
 *  - Percentuais NUNCA são somados nem viram média entre anúncios ou
 *    registros. O valor de um anúncio é o do registro mais recente que
 *    informou a taxa; campanhas mostram as taxas por anúncio.
 *  - Não dependem de visualizações de 3 s/15 s nem de outras métricas.
 */
export const RATE_KEYS = ["hook_rate", "hold_rate"] as const;
export type RateKey = (typeof RATE_KEYS)[number];
export const RATE_LABEL: Record<RateKey, string> = { hook_rate: "Taxa de Gancho (%)", hold_rate: "Taxa de Retenção (%)" };
export const RATE_SHORT: Record<RateKey, string> = { hook_rate: "Taxa de Gancho", hold_rate: "Taxa de Retenção" };
export const RATE_COLUMNS = RATE_KEYS.join(",");
export const isRateKey = (k: string): k is RateKey => (RATE_KEYS as readonly string[]).includes(k);

/**
 * "35,75" · "35,75%" · "35.75" · 35.75 → 35.75. Vazio/"—" → null (não
 * informado). Fora de 0–100, mais de 2 casas ou texto inválido → undefined.
 */
export function parseRate(raw: unknown): number | null | undefined {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") {
    const twoDecimals = Number.isFinite(raw) && Math.abs(raw * 100 - Math.round(raw * 100)) < 1e-6;
    return twoDecimals && raw >= 0 && raw <= 100 ? Math.round(raw * 100) / 100 : undefined;
  }
  if (typeof raw !== "string") return undefined;
  const s = raw.trim().replace(/\s+/g, "").replace(/%$/, "");
  if (!s || ["-", "—", "–", "n/a", "na", "nd"].includes(s.toLowerCase())) return null;
  if (!/^\d{1,3}([.,]\d{1,2})?$/.test(s)) return undefined;
  const n = Number(s.replace(",", "."));
  return n >= 0 && n <= 100 ? n : undefined;
}

/** 35.75 → "35,75%" (sempre 2 casas, como informado). */
export const fmtRate = (v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(v) ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";

type RateRow = { entry_date?: string; period_start?: string | null; period_end?: string | null; unknown?: string[] } & Partial<Record<RateKey, number | string | null>>;
export type LatestRate = { value: number; start: string; end: string } | null;

const valueOf = (r: RateRow, k: RateKey) => {
  if (r.unknown?.includes(k)) return null;
  const v = r[k];
  return v === null || v === undefined || v === "" ? null : Number(v);
};
const endOf = (r: RateRow) => String(r.period_end ?? r.entry_date ?? "").slice(0, 10);

/**
 * Taxa ATUAL de um anúncio: a do registro mais recente (fim do período)
 * que a informou — cada taxa independente. Nunca soma nem tira média.
 */
export function latestRates(rows: RateRow[]): Record<RateKey, LatestRate> {
  const out = { hook_rate: null, hold_rate: null } as Record<RateKey, LatestRate>;
  for (const k of RATE_KEYS) {
    for (const r of rows) {
      const v = valueOf(r, k);
      if (v === null || !Number.isFinite(v)) continue;
      const end = endOf(r);
      if (!out[k] || end >= out[k]!.end) out[k] = { value: v, start: String(r.period_start ?? end).slice(0, 10), end };
    }
  }
  return out;
}

export type AdRateRow = RateRow & { creative_id: string; campaign_id: string };
export type AdRatesInPeriod = { creativeId: string; campaignId: string; rates: Record<RateKey, LatestRate> };

/**
 * Relatório: taxas de cada anúncio no período (registros cujo período está
 * dentro do filtro — `inPeriod`), uma linha por anúncio, sem agregar.
 */
/** Linhas da tabela "Taxas por anúncio" de UMA empresa no relatório (ordenadas por campanha e anúncio). */
export function reportRateRows(input: {
  rows: AdRateRow[];
  campaigns: Array<{ id: string; name: string }>;
  adNames: Record<string, string>;
  inPeriod: (span: { start: string; end: string }) => boolean;
}): Array<{ campaign: string; ad: string; hook: LatestRate; hold: LatestRate }> {
  const names = new Map(input.campaigns.map((c) => [c.id, c.name]));
  return adRatesInPeriod(input.rows.filter((r) => names.has(r.campaign_id)), input.inPeriod)
    .map((x) => ({ campaign: names.get(x.campaignId)!, ad: input.adNames[x.creativeId] ?? "Anúncio", hook: x.rates.hook_rate, hold: x.rates.hold_rate }))
    .sort((a, b) => a.campaign.localeCompare(b.campaign, "pt-BR") || a.ad.localeCompare(b.ad, "pt-BR"));
}

export function adRatesInPeriod(rows: AdRateRow[], inPeriod: (span: { start: string; end: string }) => boolean): AdRatesInPeriod[] {
  const byAd = new Map<string, AdRateRow[]>();
  for (const r of rows) {
    const span = { start: String(r.period_start ?? endOf(r)).slice(0, 10), end: endOf(r) };
    if (!inPeriod(span)) continue;
    if (!byAd.has(r.creative_id)) byAd.set(r.creative_id, []);
    byAd.get(r.creative_id)!.push(r);
  }
  return [...byAd.entries()]
    .map(([creativeId, list]) => ({ creativeId, campaignId: list[0].campaign_id, rates: latestRates(list) }))
    .filter((x) => x.rates.hook_rate || x.rates.hold_rate);
}
