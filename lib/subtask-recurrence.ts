import { addDaysToKey, weekdayOfKey } from "@/lib/tasks";
import type { Subtask, SubtaskOccurrence } from "@/lib/task-schedule";

/**
 * Regra ÚNICA da recorrência individual das subtarefas (migration
 * 20261112100000). Puro e testado (lib/subtask-recurrence.test.ts).
 *
 *   - Subtarefa sem recorrência: estado único em `task_subtasks.is_done`
 *     (checklists de melhorias continuam pendentes até serem concluídos).
 *   - Subtarefa recorrente ('weekly'): a definição (weekdays + início/fim)
 *     fica na linha; cada DIA tem estado próprio em
 *     `task_subtask_occurrences`. Concluir segunda não conclui terça, e
 *     dias futuros nunca são gravados.
 *   - Dias antes de `recurrence_start` nunca viram pendência: criar uma
 *     subtarefa nova não reabre nem "suja" execuções antigas.
 *
 * A recorrência da subtarefa é independente da tarefa principal: funciona
 * dentro de tarefa organizadora, com prazo, do dia ou recorrente.
 */

/** Quantos dias para trás uma execução recorrente pendente ainda aparece como atrasada (mesmo valor das tarefas no Meu Dia). */
export const SUBTASK_LOOKBACK_DAYS = 7;
/** Janela de execuções carregadas junto com as subtarefas (histórico na tela). */
export const SUBTASK_HISTORY_DAYS = 60;

export function isRecurringSubtask(s: Pick<Subtask, "recurrence">): boolean {
  return s.recurrence === "weekly";
}

/** A definição ATUAL da subtarefa recorrente gera execução nesse dia? */
export function subtaskOccursOn(s: Subtask, dateKey: string): boolean {
  if (!isRecurringSubtask(s) || !s.recurrence_start) return false;
  if (dateKey < s.recurrence_start) return false;
  if (s.recurrence_until && dateKey > s.recurrence_until) return false;
  return (s.weekdays ?? []).includes(weekdayOfKey(dateKey));
}

/** Próximo dia (a partir de `fromKey`, inclusive) com execução — no máximo 7 dias à frente. */
export function nextSubtaskOccurrence(s: Subtask, fromKey: string): string | null {
  for (let i = 0, d = fromKey; i < 8; i++, d = addDaysToKey(d, 1)) if (subtaskOccursOn(s, d)) return d;
  return null;
}

function occurrenceOn(s: Subtask, dateKey: string): SubtaskOccurrence | undefined {
  return s.occurrences?.find((o) => o.occurrence_date === dateKey);
}

/** Execução daquele dia concluída? (Só vale para recorrentes.) */
export function subtaskDoneOn(s: Subtask, dateKey: string): boolean {
  return occurrenceOn(s, dateKey)?.status === "concluida";
}

/**
 * Subtarefa como ela "é" no dia exibido. Recorrente → `is_done` = execução
 * DAQUELE dia, `scheduled_date` = o dia (se tem execução nele) ou a próxima
 * execução, e `day` com o estado calculado. Não recorrente → igual.
 * As telas (agrupamento, progresso, Meu Dia) trabalham com o resultado,
 * então nenhuma delas precisa saber de recorrência.
 */
export function resolveSubtaskForDay(s: Subtask, dateKey: string): Subtask {
  if (!isRecurringSubtask(s)) return s;
  const occurs = subtaskOccursOn(s, dateKey);
  const occ = occurrenceOn(s, dateKey);
  const nextDate = occurs ? dateKey : nextSubtaskOccurrence(s, dateKey);
  return {
    ...s,
    is_done: occurs || !!occ ? occ?.status === "concluida" : false,
    completed_at: occ?.status === "concluida" ? occ.completed_at : null,
    scheduled_date: nextDate,
    // Rotina recorrente não tem prazo final próprio: nunca fica "prazo vencido".
    due_date: null,
    day: { date: dateKey, occurs: occurs || !!occ, nextDate },
  };
}

export function resolveSubtasksForDay(subtasks: Subtask[], dateKey: string): Subtask[] {
  return subtasks.filter((s) => !s.archived_at).map((s) => resolveSubtaskForDay(s, dateKey));
}

/** Entra no progresso do dia? Recorrente sem execução no dia não conta (nem como pendente). */
export function countsForDayProgress(s: Subtask): boolean {
  return !s.day || s.day.occurs;
}

/**
 * Execuções recorrentes que ficaram pendentes antes de `todayKey` (janela
 * de `lookbackDays`), mais recente primeiro. Só dias em que a definição
 * gerava execução (ou com linha gravada como pendente) — nunca antes do
 * início da recorrência.
 */
export function missedSubtaskDates(s: Subtask, todayKey: string, lookbackDays = SUBTASK_LOOKBACK_DAYS): string[] {
  if (!isRecurringSubtask(s) || s.archived_at) return [];
  const out: string[] = [];
  for (let d = addDaysToKey(todayKey, -1), i = 0; i < lookbackDays; i++, d = addDaysToKey(d, -1)) {
    const occ = occurrenceOn(s, d);
    if (occ ? occ.status !== "concluida" : subtaskOccursOn(s, d)) out.push(d);
  }
  return out;
}

export type SubtaskHistoryEntry = { date: string; done: boolean; completedAt: string | null; title: string };

/**
 * Histórico de execuções (mais recente primeiro) até `todayKey`, inclusive:
 * dias gravados + dias em que a definição gerava execução e ficaram sem
 * marcação (pendentes). Nada é inventado antes do início da recorrência.
 */
export function subtaskHistory(s: Subtask, todayKey: string, days = SUBTASK_HISTORY_DAYS): SubtaskHistoryEntry[] {
  if (!isRecurringSubtask(s)) return [];
  const out: SubtaskHistoryEntry[] = [];
  for (let d = todayKey, i = 0; i < days; i++, d = addDaysToKey(d, -1)) {
    const occ = occurrenceOn(s, d);
    if (!occ && !subtaskOccursOn(s, d)) continue;
    out.push({ date: d, done: occ?.status === "concluida", completedAt: occ?.completed_at ?? null, title: occ?.title || s.title });
  }
  return out;
}

/** Normaliza os dias da semana (0=domingo..6=sábado), sem repetição, em ordem. */
export function normalizeWeekdays(values: unknown): number[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort((a, b) => a - b);
}
