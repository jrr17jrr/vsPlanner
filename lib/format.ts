export function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  });
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
