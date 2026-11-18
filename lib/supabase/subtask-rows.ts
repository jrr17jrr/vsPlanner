import "server-only";

import { normalizeSubtaskDescription } from "@/lib/subtask-description";
import { normalizeReminderOffsets } from "@/lib/task-schedule";
import { todayKeySaoPaulo } from "@/lib/format";

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

export type NewSubtaskInput = SubtaskScheduleInput & SubtaskRecurrenceInput & {
  title: string;
  description?: string | null;
  /** Itens do checklist criados junto (um nível, prioridade própria). */
  checklist?: Array<{ title: string; priority?: "normal" | "importante" }>;
};

/** UUID v4 (Node e navegador). As linhas do checklist referenciam a subtarefa no MESMO insert. */
const newId = () => globalThis.crypto.randomUUID();

/**
 * Linhas prontas para UM insert em lote (todas ou nenhuma), na ordem
 * informada: cada subtarefa (com id já gerado) seguida dos itens do seu
 * checklist (`parent_subtask_id` = esse id). O gatilho de aninhamento do
 * banco enxerga as linhas anteriores do mesmo comando, então a ordem basta.
 */
export function buildNewSubtaskRows(
  parent: { parentType: "pessoal" | "clt" | "visionario"; parentId: string; userId: string },
  inputs: NewSubtaskInput[],
): { error: string } | { rows: Record<string, unknown>[] } {
  const rows: Record<string, unknown>[] = [];
  for (const [i, input] of inputs.entries()) {
    const items = (input.checklist ?? []).map((c) => ({ title: String(c.title ?? "").trim(), priority: c.priority === "importante" ? "importante" : "normal" })).filter((c) => c.title);
    if (items.length > 50) return { error: `Subtarefa ${i + 1}: máximo de 50 itens de checklist.` };
    if (items.some((c) => c.title.length > 300)) return { error: `Subtarefa ${i + 1}: item do checklist com título acima de 300 caracteres.` };
    const id = items.length ? newId() : null;
    const label = inputs.length > 1 ? `Subtarefa ${i + 1}: ` : "";
    const title = input.title.trim();
    if (!title || title.length > 300) return { error: label + "Informe um título de até 300 caracteres." };
    const schedule = subtaskScheduleValues(input);
    if (schedule.error) return { error: label + schedule.error };
    // Recorrência só é enviada quando pedida (banco sem a migration continua aceitando o resto).
    const recurrence = input.recurrence === "weekly" || input.recurrence === "monthly" ? subtaskRecurrenceValues(input, todayKeySaoPaulo()) : { values: {} as Record<string, unknown> };
    if (recurrence.error) return { error: label + recurrence.error };
    const description = normalizeSubtaskDescription(input.description);
    if (description.error) return { error: label + description.error };
    rows.push({
      ...(id ? { id } : {}),
      parent_type: parent.parentType, parent_id: parent.parentId, user_id: parent.userId, title,
      due_date: input.dueDate || null, parent_subtask_id: null, position: i, ...schedule.values, ...recurrence.values,
      ...(description.value ? { description: description.value } : {}),
    });
    items.forEach((c, j) => rows.push({ parent_type: parent.parentType, parent_id: parent.parentId, user_id: parent.userId, title: c.title, due_date: null, parent_subtask_id: id, position: j, priority: c.priority }));
  }
  return { rows };
}

export type SubtaskRecurrenceInput = {
  /** `undefined` = não mexe (telas antigas continuam funcionando). */
  recurrence?: "none" | "weekly" | "monthly";
  weekdays?: number[];
  /** Dia do mês (1..31) da repetição mensal. */
  monthDay?: number | null;
  /** Início da repetição (yyyy-MM-dd). Nunca antes de hoje: dias passados não viram pendência. */
  recurrenceStart?: string | null;
  /** Término opcional (último dia com execução). */
  recurrenceUntil?: string | null;
};

/**
 * Colunas de recorrência da subtarefa (migration 20261112100000). Recorrente
 * não tem "fazer no dia" fixo nem prazo final próprio — a execução é por
 * dia da semana; horário e lembretes continuam valendo.
 */
export function subtaskRecurrenceValues(
  input: SubtaskRecurrenceInput & { isChecklistItem?: boolean },
  todayKey: string,
  existing?: { recurrence?: string | null; weekdays?: number[] | null; month_day?: number | null; recurrence_start?: string | null; recurrence_until?: string | null } | null,
): { error?: string; values: Record<string, unknown> } {
  if (input.recurrence === undefined) return { values: {} };
  if (input.recurrence !== "none" && input.recurrence !== "weekly" && input.recurrence !== "monthly") return { error: "Recorrência inválida.", values: {} };
  if (input.recurrence === "none") {
    return { values: { recurrence: "none", weekdays: [], recurrence_start: null, recurrence_until: null } };
  }
  if (input.isChecklistItem) return { error: "Itens de checklist não têm recorrência própria — configure na subtarefa.", values: {} };
  const monthly = input.recurrence === "monthly";
  const monthDay = Number(input.monthDay);
  if (monthly && !(Number.isInteger(monthDay) && monthDay >= 1 && monthDay <= 31)) return { error: "Escolha o dia do mês (1 a 31) para repetir a subtarefa.", values: {} };
  const weekdays = monthly ? [] : [...new Set((input.weekdays ?? []).map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort((a, b) => a - b);
  if (!monthly && weekdays.length === 0) return { error: "Escolha pelo menos um dia da semana para repetir a subtarefa.", values: {} };
  for (const d of [input.recurrenceStart, input.recurrenceUntil]) if (d && !DATE_KEY.test(d)) return { error: "Data inválida.", values: {} };

  const sameDefinition = monthly
    ? existing?.recurrence === "monthly" && existing.month_day === monthDay
    : existing?.recurrence === "weekly" && JSON.stringify([...(existing.weekdays ?? [])].sort((a, b) => a - b)) === JSON.stringify(weekdays);
  const requested = input.recurrenceStart || null;
  let start: string;
  if (sameDefinition && existing?.recurrence_start && (!requested || requested === existing.recurrence_start)) {
    start = existing.recurrence_start; // nada mudou: o histórico continua contando do mesmo início
  } else {
    // Nova definição vale de hoje (ou do início escolhido, se for depois) em diante.
    start = requested && requested > todayKey ? requested : todayKey;
  }
  const until = input.recurrenceUntil || null;
  if (until && until < start) return { error: "O término da repetição não pode ser antes do início.", values: {} };
  // month_day só é enviado na mensal: a semanal continua funcionando antes da migration 20261117100000.
  return { values: { recurrence: monthly ? "monthly" : "weekly", weekdays, ...(monthly ? { month_day: monthDay } : {}), recurrence_start: start, recurrence_until: until, scheduled_date: null, due_date: null, deadline_time: null } };
}

export const SUBTASK_RECURRENCE_COLUMNS = ["recurrence", "weekdays", "recurrence_start", "recurrence_until", "archived_at", "month_day"] as const;

export const MISSING_MONTHLY_ERROR =
  "Repetir subtarefas todo mês precisa da migração 20261117100000_subtask_monthly_recurrence.sql aplicada no Supabase.";

export const MISSING_RECURRENCE_ERROR =
  "Repetir subtarefas precisa da migração 20261112100000_organizer_tasks_subtask_recurrence.sql aplicada no Supabase.";
