import { localDateTimeParts } from "@/lib/push/reminders";

/**
 * Seguidores do Instagram por empresa — puro (sem I/O), usado pelo card da
 * empresa e pelos relatórios. Cada registro é uma "foto" da contagem num
 * momento; nada é estimado entre registros.
 */
export type FollowerRecord = { id: string; company_id: string; followers: number; recorded_at: string };

export type FollowerGrowth = { diff: number; pct: number | null };

/** Diferença e percentual (null quando a base é 0: não há como calcular %). */
export function followerGrowth(current: number, previous: number): FollowerGrowth {
  const diff = current - previous;
  return { diff, pct: previous > 0 ? (diff / previous) * 100 : null };
}

/** Mais recente primeiro (desempate pelo id para ser estável). */
export function sortFollowerRecords<T extends FollowerRecord>(records: T[]): T[] {
  return [...records].sort((a, b) => b.recorded_at.localeCompare(a.recorded_at) || b.id.localeCompare(a.id));
}

/** Atual × anterior de uma empresa. */
export function followerSnapshot(records: FollowerRecord[]) {
  const [current, previous] = sortFollowerRecords(records);
  return {
    current: current ?? null,
    previous: previous ?? null,
    growth: current && previous ? followerGrowth(current.followers, previous.followers) : null,
  };
}

/** Data local (São Paulo) de um registro. */
export const followerLocalDate = (recordedAt: string) => localDateTimeParts(new Date(recordedAt)).date;

export type FollowerPeriodSummary = {
  /** Contagem no início: último registro ANTES do período; sem ele, o primeiro DENTRO do período. */
  start: FollowerRecord | null;
  /** Último registro até o fim do período. */
  end: FollowerRecord | null;
  growth: FollowerGrowth | null;
  /** false = menos de dois registros distintos para comparar (não inventa número). */
  enough: boolean;
};

/**
 * Crescimento num período `[from, to]` (datas yyyy-MM-dd, São Paulo).
 * Exemplo: 233 no fim de outubro e 250 no último registro de novembro →
 * novembro: início 233, final 250, +17 (+7,30%).
 */
export function followerPeriodSummary(records: FollowerRecord[], from: string, to: string): FollowerPeriodSummary {
  const asc = sortFollowerRecords(records).reverse().map((r) => ({ r, day: followerLocalDate(r.recorded_at) }));
  const before = asc.filter((x) => x.day < from).at(-1)?.r ?? null;
  const inside = asc.filter((x) => x.day >= from && x.day <= to).map((x) => x.r);
  const start = before ?? inside[0] ?? null;
  const end = inside.at(-1) ?? null;
  const enough = !!start && !!end && start.id !== end.id;
  return { start, end, growth: enough ? followerGrowth(end!.followers, start!.followers) : null, enough };
}

export type CompanyFollowerOverview = {
  /** Último registro disponível (independente do período). */
  latest: FollowerRecord | null;
  /** Variação dentro do período (null = sem comparação possível). */
  growth: FollowerGrowth | null;
};

/** Card da empresa: contagem atual + variação no período `[from, to]`. Nunca mistura empresas. */
export function companyFollowerOverview(records: FollowerRecord[], companyId: string, from: string, to: string): CompanyFollowerOverview {
  const own = records.filter((r) => r.company_id === companyId);
  return { latest: sortFollowerRecords(own)[0] ?? null, growth: followerPeriodSummary(own, from, to).growth };
}

/** Período de um mês yyyy-MM. */
export function monthBounds(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

/** "+1", "−3", "0". */
export const formatFollowerDiff = (diff: number) => (diff > 0 ? "+" : diff < 0 ? "−" : "") + Math.abs(diff).toLocaleString("pt-BR");

/** "+0,43%", "−1,20%", "—" (sem base). */
export const formatFollowerPct = (pct: number | null) =>
  pct === null ? "—" : (pct > 0 ? "+" : pct < 0 ? "−" : "") + Math.abs(pct).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
