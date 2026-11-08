import { subtaskOccursOn } from "@/lib/subtask-recurrence";
import type { Subtask, SubtaskOccurrence } from "@/lib/task-schedule";

/**
 * Lembretes de subtarefas recorrentes reaproveitam o agendador existente:
 * cada dia (hoje/amanhã) com execução ainda pendente vira uma subtarefa
 * "com data" (scheduled_date = o dia). Dia já concluído não avisa; dia
 * sem execução também não. A chave de deduplicação do agendador inclui a
 * data/hora do aviso, então dois dias nunca se confundem.
 */
export function expandRecurringSubtaskReminders(subtasks: Subtask[], occurrences: SubtaskOccurrence[], dates: string[]): Subtask[] {
  const done = new Set(occurrences.filter((o) => o.status === "concluida").map((o) => `${o.subtask_id}:${o.occurrence_date}`));
  const out: Subtask[] = [];
  for (const s of subtasks) {
    if (s.archived_at || s.parent_subtask_id) continue;
    for (const date of dates) {
      if (!subtaskOccursOn(s, date) || done.has(`${s.id}:${date}`)) continue;
      out.push({ ...s, scheduled_date: date, due_date: null, deadline_time: null, is_done: false });
    }
  }
  return out;
}
