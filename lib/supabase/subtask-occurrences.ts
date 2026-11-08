import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { addDaysToKey } from "@/lib/tasks";
import { isRecurringSubtask, SUBTASK_HISTORY_DAYS } from "@/lib/subtask-recurrence";
import type { Subtask, SubtaskOccurrence } from "@/lib/task-schedule";

/** Tabela/coluna ainda não existe (migration 20261112100000 pendente). */
export const isMissingSchema = (e: { code?: string } | null | undefined) => !!e && ["42P01", "PGRST205", "42703", "PGRST204"].includes(String(e.code));

/**
 * Anexa a cada subtarefa RECORRENTE as execuções gravadas da janela recente
 * (uma consulta para todas, sem N+1). Antes da migration nenhuma subtarefa é
 * recorrente, e a tabela ausente é tratada como "sem execuções".
 * Também tira das listas as subtarefas arquivadas (o histórico continua no banco).
 */
export async function attachSubtaskOccurrences(db: SupabaseClient, subtasks: Subtask[], todayKey: string, days = SUBTASK_HISTORY_DAYS): Promise<Subtask[]> {
  const visible = subtasks.filter((s) => !s.archived_at);
  const ids = visible.filter(isRecurringSubtask).map((s) => s.id);
  if (ids.length === 0) return visible;
  const byId = new Map<string, SubtaskOccurrence[]>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await db
      .from("task_subtask_occurrences")
      .select("subtask_id,occurrence_date,status,completed_at,title")
      .in("subtask_id", ids.slice(i, i + 100))
      .gte("occurrence_date", addDaysToKey(todayKey, -days))
      .lte("occurrence_date", todayKey);
    if (error) {
      if (isMissingSchema(error)) break;
      throw error;
    }
    for (const o of (data ?? []) as SubtaskOccurrence[]) (byId.get(o.subtask_id) ?? byId.set(o.subtask_id, []).get(o.subtask_id)!).push(o);
  }
  return visible.map((s) => (isRecurringSubtask(s) ? { ...s, occurrences: byId.get(s.id) ?? [] } : s));
}
