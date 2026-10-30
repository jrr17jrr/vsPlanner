/**
 * Conversão de valores em pt-BR — puro, compartilhado por JSON e texto.
 * Regra geral: o que não dá para interpretar com segurança vira `undefined`
 * (inválido, a validação acusa) e o que é explicitamente "não informado"
 * vira `null`. Nunca transforma ausência em zero.
 */

const EMPTY_MARKERS = new Set(["", "-", "—", "–", "n/a", "na", "nd", "n/d", "null", "não informado", "nao informado", "sem dados", "?"]);

export function isEmptyMarker(raw: unknown): boolean {
  if (raw === null || raw === undefined) return true;
  if (typeof raw !== "string") return false;
  return EMPTY_MARKERS.has(raw.trim().toLowerCase());
}

/**
 * "R$ 9.360,00" → 9360 · "206,22" → 206.22 · "1.234" → 1234 · "15.5" → 15.5
 * · 37 → 37 · "—" → null · "abc" → undefined.
 */
export function parseBrNumber(raw: unknown): number | null | undefined {
  if (isEmptyMarker(raw)) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : undefined;
  if (typeof raw !== "string") return undefined;
  let s = raw.trim().replace(/^r\$\s*/i, "").replace(/\s+/g, "").replace(/%$/, "");
  if (!s) return null;
  const negative = s.startsWith("-");
  if (negative) s = s.slice(1);
  if (s.includes(",")) {
    if (!/^\d{1,3}(\.\d{3})*,\d+$|^\d+,\d+$/.test(s)) return undefined;
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  } else if (!/^\d+(\.\d+)?$/.test(s)) {
    return undefined;
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return undefined;
  return negative ? -n : n;
}

/** Inteiro não negativo (contagens). Decimal ou negativo → undefined. */
export function parseBrInteger(raw: unknown): number | null | undefined {
  const n = parseBrNumber(raw);
  if (n === null || n === undefined) return n;
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

function pad(n: number) { return String(n).padStart(2, "0"); }

function validYmd(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * "15/10/26", "15/10/2026", "2026-10-15", "15/10/2026 10:20",
 * "2026-10-15T10:20:00" → "2026-10-15". Inválido → undefined; vazio → null.
 */
export function parseBrDate(raw: unknown): string | null | undefined {
  if (isEmptyMarker(raw)) return null;
  if (typeof raw !== "string") return undefined;
  const s = raw.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/.exec(s);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return validYmd(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : undefined;
  }
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})(?:\s+(?:às\s+)?\d{1,2}[:h]\d{2}.*)?$/i.exec(s);
  if (m) {
    const d = Number(m[1]), mo = Number(m[2]);
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return validYmd(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : undefined;
  }
  return undefined;
}

/** Data+hora local ("2026-10-15T10:20:00", "15/10/2026 10:20") → "2026-10-15T10:20:00". */
export function parseBrDateTime(raw: unknown): string | null | undefined {
  if (isEmptyMarker(raw)) return null;
  if (typeof raw !== "string") return undefined;
  const date = parseBrDate(raw);
  if (!date) return date;
  const t = /(\d{1,2})[:h](\d{2})(?::(\d{2}))?/.exec(raw.trim().replace(/^\d{4}-\d{2}-\d{2}/, "").replace(/^\d{1,2}\/\d{1,2}\/\d{2,4}/, ""));
  if (!t) return `${date}T00:00:00`;
  const [h, mi, se] = [Number(t[1]), Number(t[2]), Number(t[3] ?? 0)];
  if (h > 23 || mi > 59 || se > 59) return undefined;
  return `${date}T${pad(h)}:${pad(mi)}:${pad(se)}`;
}

/** "30/09/2026 a 29/10/2026" / "2026-09-30 até 2026-10-29" → período. */
export function parseBrPeriod(raw: unknown): { start: string; end: string } | null | undefined {
  if (isEmptyMarker(raw)) return null;
  if (typeof raw !== "string") return undefined;
  const parts = raw.split(/\s+(?:a|até|ate|-|–|—|to)\s+/i);
  if (parts.length !== 2) return undefined;
  const start = parseBrDate(parts[0]), end = parseBrDate(parts[1]);
  if (!start || !end || end < start) return undefined;
  return { start, end };
}

/** Normaliza para comparação: minúsculas, sem acentos, espaços simples. */
export function normalizeKey(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Comparação de NOMES (exata após normalização de caixa/acento/espaços). */
export function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return normalizeKey(a).replace(/\s*\|\s*/g, "|") === normalizeKey(b).replace(/\s*\|\s*/g, "|");
}
