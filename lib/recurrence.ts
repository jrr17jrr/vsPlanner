import type { ClientServiceFrequency, FinancialRecurrenceFrequency } from "@/types/database.types";

/**
 * Datas de recorrência — puro (sem I/O), usado pelo servidor (geração de
 * cobranças) e pelo client (prévia de "próximo vencimento"). Trabalha só
 * com chaves `yyyy-MM-dd`, nunca com `Date` em UTC, pra não existir
 * off-by-one de fuso.
 *
 * Meses são somados com "dia-âncora": um contrato que vence dia 31 vence
 * 28/02 (ou 29) em fevereiro e volta pra 31/03 em março — nunca "escorrega"
 * pra dia 28 pra sempre, nem pula pra 03/03 (bug clássico de
 * `Date.setMonth`).
 */

function daysInMonth(year: number, month1: number): number {
  return new Date(year, month1, 0).getDate();
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function parseDateKey(key: string): { y: number; m: number; d: number } {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m, d };
}

export function makeDateKey(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Soma `months` meses mantendo o dia-âncora (limitado ao último dia do mês). */
export function addMonthsKey(key: string, months: number, anchorDay?: number): string {
  const { y, m, d } = parseDateKey(key);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const day = Math.min(anchorDay ?? d, daysInMonth(ny, nm));
  return makeDateKey(ny, nm, day);
}

export function addDaysKey(key: string, days: number): string {
  const { y, m, d } = parseDateKey(key);
  const date = new Date(y, m - 1, d + days);
  return makeDateKey(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/** Quantos meses (ou null para semanal) cada frequência avança. */
export function frequencyMonths(frequency: FinancialRecurrenceFrequency, interval: number | null): number | null {
  switch (frequency) {
    case "semanal":
      return null;
    case "trimestral":
      return 3;
    case "semestral":
      return 6;
    case "anual":
      return 12;
    case "a_cada_x_meses":
    case "customizado":
      return Math.max(1, interval ?? 1);
    case "mensal":
    default:
      return 1;
  }
}

/** Frequência que usa "a cada N meses" — nas demais o intervalo não existe (null). */
export function usesInterval(frequency: FinancialRecurrenceFrequency | null | undefined): boolean {
  return frequency === "a_cada_x_meses" || frequency === "customizado";
}

/** Intervalo normalizado: só existe para "a cada N meses"; nas outras frequências é sempre null. */
export function normalizedInterval(frequency: FinancialRecurrenceFrequency | null | undefined, interval: number | null | undefined): number | null {
  return usesInterval(frequency) ? Math.max(1, interval ?? 1) : null;
}

/**
 * REGRA CENTRAL da data de início: uma ocorrência só existe se vence no
 * 1º vencimento da recorrência ou depois (o que também garante que a
 * competência nunca é anterior ao mês inicial). Recorrência que começa em
 * 25/10 não tem 25/09 — nem como pendente, nem como atrasada.
 * Toda geração de ocorrência (criação, geração lazy, edição, reativação)
 * passa por aqui.
 */
export function isOnOrAfterRecurrenceStart(dueKey: string, startKey: string | null | undefined): boolean {
  if (!startKey) return true;
  return dueKey >= startKey && competencyOf(dueKey) >= competencyOf(startKey);
}

/** Próxima ocorrência depois de `key`. `anchorDay` = dia do 1º vencimento da série. */
export function nextOccurrence(
  key: string,
  frequency: FinancialRecurrenceFrequency,
  interval: number | null,
  anchorDay?: number
): string {
  const months = frequencyMonths(frequency, interval);
  if (months === null) return addDaysKey(key, 7);
  return addMonthsKey(key, months, anchorDay);
}

/** Dias de `from` até `to` (negativo se `to` for antes). Chaves yyyy-MM-dd, sem fuso. */
export function daysBetweenKeys(from: string, to: string): number {
  const a = parseDateKey(from);
  const b = parseDateKey(to);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000);
}

/** Fator para normalizar um valor recorrente em "por mês" (receita recorrente mensal). */
export function monthlyFactor(frequency: FinancialRecurrenceFrequency | ClientServiceFrequency, interval: number | null = null): number {
  if (frequency === "semanal") return 52 / 12;
  const months = frequencyMonths(frequency, interval) ?? 1;
  return 1 / months;
}

/**
 * Primeiro vencimento de um contrato recorrente com "dia de vencimento"
 * fixo: o primeiro dia `dueDay` que cai em `fromKey` ou depois.
 */
export function firstDueOnOrAfter(fromKey: string, dueDay: number): string {
  const { y, m, d } = parseDateKey(fromKey);
  const thisMonth = makeDateKey(y, m, Math.min(dueDay, daysInMonth(y, m)));
  if (d <= Math.min(dueDay, daysInMonth(y, m))) return thisMonth;
  return addMonthsKey(makeDateKey(y, m, 1), 1, dueDay);
}

/**
 * Primeira ocorrência da série (âncora `seriesStartKey`) que cai em
 * `fromKey` ou depois — usado ao reativar um contrato pausado: retoma na
 * próxima competência, nunca cobra os meses em que ficou pausado.
 */
export function firstOccurrenceOnOrAfter(
  seriesStartKey: string,
  fromKey: string,
  frequency: FinancialRecurrenceFrequency,
  interval: number | null
): string {
  const anchorDay = parseDateKey(seriesStartKey).d;
  let current = seriesStartKey;
  for (let guard = 0; guard < 2000 && current < fromKey; guard++) {
    current = nextOccurrence(current, frequency, interval, anchorDay);
  }
  return current;
}

/** `yyyy-MM-01` do mês da data — competência padrão de uma cobrança. */
export function competencyOf(key: string): string {
  return `${key.slice(0, 7)}-01`;
}

/** Divide um total em N parcelas com arredondamento em centavos (a última absorve a diferença). */
export function splitInstallments(total: number, count: number): number[] {
  const per = Math.round((total / count) * 100) / 100;
  const parts: number[] = [];
  let allocated = 0;
  for (let i = 1; i <= count; i++) {
    const amount = i === count ? Math.round((total - allocated) * 100) / 100 : per;
    allocated = Math.round((allocated + amount) * 100) / 100;
    parts.push(amount);
  }
  return parts;
}
