export function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  });
}

/**
 * Lê um valor digitado em pt-BR ("1.234,56", "400,50", "99") ou com ponto
 * decimal ("400.50"). Retorna NaN se não for número.
 */
export function parseMoneyInput(value: string): number {
  const normalized = value.trim().replace(/\s|R\$/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  if (normalized === "") return NaN;
  return Number(normalized);
}

export function formatCurrencyCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `R$ ${(value / 1_000).toFixed(1)}mil`;
  return formatCurrency(value);
}

export function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? parseLocalDate(date) : date;
  return d.toLocaleDateString("pt-BR");
}

export function formatDateLong(date: string | Date): string {
  const d = typeof date === "string" ? parseLocalDate(date) : date;
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function formatDateShort(date: string | Date): string {
  const d = typeof date === "string" ? parseLocalDate(date) : date;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export function formatTime(time: string): string {
  return time;
}

export function formatPercent(value: number, decimals = 0): string {
  return `${value.toFixed(decimals)}%`;
}

export function formatMonthYear(date: string | Date): string {
  const d = typeof date === "string" ? parseLocalDate(date) : date;
  const s = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Parses a `yyyy-MM-dd` string as a local date (avoids UTC off-by-one). */
export function parseLocalDate(date: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, m, d] = date.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(date);
}

export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * "Hoje" no fuso de São Paulo, sempre — nunca depende do TZ do processo
 * Node (que localmente é America/Sao_Paulo, mas em produção na Vercel é
 * UTC por padrão, salvo configuração explícita). `toDateKey(new Date())`
 * é correto só quando o processo já está no fuso certo; esta função é
 * correta em qualquer ambiente, porque `Intl` sempre conhece as regras do
 * fuso IANA independente do TZ do processo. Único helper central de
 * "hoje" pro lado do servidor — Hoje, Reuniões, Trabalhos, Financeiro e
 * vencimentos em geral usam esta função, nunca `toDateKey(new Date())`
 * diretamente, pra nunca haver um bug de "hoje errado" perto da meia-noite.
 */
export function todayKeySaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Data (yyyy-MM-dd) de um timestamp ISO no fuso de São Paulo. */
export function dateKeyInSaoPaulo(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** Mês atual (yyyy-MM) no fuso de São Paulo — mesma razão de `todayKeySaoPaulo`. */
export function currentMonthKeySaoPaulo(): string {
  return todayKeySaoPaulo().slice(0, 7);
}

export function toCompetencia(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

const WEEKDAY_LABELS = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];

export function weekdayLabel(dayIndex: number): string {
  return WEEKDAY_LABELS[dayIndex];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
