import "server-only";

import { normalizeSubtaskDescription } from "@/lib/subtask-description";
import { normalizeReminderOffsets } from "@/lib/task-schedule";

/**
 * Validação e montagem de linhas de `task_subtasks` — regra ÚNICA usada por
 * `saveSubtask` (uma subtarefa) e pela criação de tarefa com subtarefas.
 */
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const TIME_KEY = /^\d{2}:\d{2}(:\d{2})?$/;

export type SubtaskScheduleInput = {
  /** PRAZO final (coluna due_date). */
  dueDate?: string | null;
  /** `undefined` = não mexe (telas antigas continuam funcionando). */
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  deadlineTime?: string | null;
  priority?: "normal" | "importante";
  reminderOffsets?: number[];
};

export function subtaskScheduleValues(input: SubtaskScheduleInput): { error?: string; values: Record<string, unknown> } {
  const values: Record<string, unknown> = {};
  if (input.dueDate && !DATE_KEY.test(input.dueDate)) return { error: "Data inválida.", values };
  if (input.scheduledDate !== undefined) {
    if (input.scheduledDate && !DATE_KEY.test(input.scheduledDate)) return { error: "Data de execução inválida.", values };
    values.scheduled_date = input.scheduledDate || null;
  }
  for (const [key, col] of [["scheduledTime", "scheduled_time"], ["deadlineTime", "deadline_time"]] as const) {
    const v = input[key];
    if (v === undefined) continue;
    if (v && !TIME_KEY.test(v)) return { error: "Horário inválido.", values };
    values[col] = v || null;
  }
  if (input.priority !== undefined) {
    if (input.priority !== "normal" && input.priority !== "importante") return { error: "Prioridade inválida.", values };
    values.priority = input.priority;
  }
  if (input.reminderOffsets !== undefined) values.reminder_offsets = normalizeReminderOffsets(input.reminderOffsets);
  if (values.scheduled_date && input.dueDate && input.dueDate < (values.scheduled_date as string)) {
    return { error: "O prazo final não pode ser antes do dia de execução.", values };
  }
  return { values };
}

export type NewSubtaskInput = SubtaskScheduleInput & { title: string; description?: string | null };

/** Linhas prontas para UM insert em lote (todas ou nenhuma), na ordem informada. */
export function buildNewSubtaskRows(
  parent: { parentType: "pessoal" | "clt" | "visionario"; parentId: string; userId: string },
  inputs: NewSubtaskInput[],
): { error: string } | { rows: Record<string, unknown>[] } {
  const rows: Record<string, unknown>[] = [];
  for (const [i, input] of inputs.entries()) {
    const label = inputs.length > 1 ? `Subtarefa ${i + 1}: ` : "";
    const title = input.title.trim();
    if (!title || title.length > 300) return { error: label + "Informe um título de até 300 caracteres." };
    const schedule = subtaskScheduleValues(input);
    if (schedule.error) return { error: label + schedule.error };
    const description = normalizeSubtaskDescription(input.description);
    if (description.error) return { error: label + description.error };
    rows.push({
      parent_type: parent.parentType, parent_id: parent.parentId, user_id: parent.userId, title,
      due_date: input.dueDate || null, parent_subtask_id: null, position: i, ...schedule.values,
      ...(description.value ? { description: description.value } : {}),
    });
  }
  return { rows };
}
