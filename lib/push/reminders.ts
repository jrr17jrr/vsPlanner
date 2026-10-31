/**
 * Seleção de lembretes de tarefas — puro (sem I/O), usado pela rota
 * `/api/cron/task-reminders` e pelos testes. Trabalha com chaves
 * `yyyy-MM-dd` e `HH:mm` no fuso de São Paulo, nunca com `Date` em UTC.
 *
 * Regras:
 *  - só tarefas com horário (`scheduled_time`) e não arquivadas;
 *  - tarefa única: `due_date` = hoje e status diferente de `concluida`;
 *  - recorrente semanal: hoje está em `weekdays`, dentro de
 *    `recurrence_start`/`recurrence_until`, e a ocorrência de hoje não está
 *    concluída;
 *  - o horário precisa estar na janela `[agora - catchUpMinutes, agora]`
 *    (recupera execuções do cron que atrasaram ou falharam, sem disparar
 *    lembretes antigos);
 *  - respeita `notification_preferences` (categoria `tasks` ou `clt`).
 */

export const REMINDER_TIME_ZONE = "America/Sao_Paulo";

export type ReminderTable = "tasks" | "personal_work_tasks" | "clt_tasks";

export type ReminderTask = {
  id: string;
  user_id: string;
  title: string;
  due_date: string | null;
  scheduled_time: string | null;
  status: string | null;
  archived_at?: string | null;
  recurrence?: string | null;
  /** clt_tasks: módulo (clt/mkt) — define a tela aberta pelo lembrete. */
  module?: string | null;
  weekdays?: number[] | null;
  recurrence_start?: string | null;
  recurrence_until?: string | null;
};

export type ReminderOccurrence = { task_id: string; occurrence_date: string; status: string | null; scheduled_time?: string | null; title?: string | null };

export type ReminderPreferences = Partial<Record<"tasks" | "clt", boolean>> | null | undefined;

export type DueReminder = {
  table: ReminderTable;
  taskId: string;
  userId: string;
  title: string;
  date: string;
  time: string;
  eventKey: string;
  url: string;
};

export function localDateTimeParts(now: Date, timeZone = REMINDER_TIME_ZONE): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const part = (key: string) => parts.find((p) => p.type === key)?.value ?? "";
  return { date: `${part("year")}-${part("month")}-${part("day")}`, time: `${part("hour")}:${part("minute")}` };
}

function weekdayOfKey(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function isDone(status: string | null | undefined): boolean {
  return status === "concluida" || status === "concluido" || status === "completed" || status === "cancelada" || status === "cancelado";
}

export function preferenceCategory(table: ReminderTable): "tasks" | "clt" {
  return table === "clt_tasks" ? "clt" : "tasks";
}

/**
 * Lista os lembretes que devem sair agora. `windowStart`/`windowEnd` vêm de
 * `reminderWindow()`; quando a janela atravessa a meia-noite, só o dia de
 * `windowEnd` é considerado (tarefas de 23:5x do dia anterior são raras e
 * não justificam reenvio no dia seguinte).
 */
export function selectDueReminders(input: {
  now: Date;
  catchUpMinutes?: number;
  tasks: Array<ReminderTask & { table: ReminderTable }>;
  occurrences?: Array<ReminderOccurrence & { table: ReminderTable }>;
  preferences?: Map<string, ReminderPreferences>;
}): DueReminder[] {
  const catchUp = input.catchUpMinutes ?? 15;
  const { date, time } = localDateTimeParts(input.now);
  const earliest = localDateTimeParts(new Date(input.now.getTime() - catchUp * 60_000));
  const fromTime = earliest.date === date ? earliest.time : "00:00";
  const weekday = weekdayOfKey(date);
  const occurrenceByTask = new Map<string, ReminderOccurrence>();
  for (const o of input.occurrences ?? []) if (o.occurrence_date === date) occurrenceByTask.set(`${o.table}:${o.task_id}`, o);

  const out: DueReminder[] = [];
  for (const task of input.tasks) {
    if (task.archived_at) continue;
    const prefs = input.preferences?.get(task.user_id);
    if (prefs && prefs[preferenceCategory(task.table)] === false) continue;

    const recurring = task.recurrence === "weekly";
    const occurrence = occurrenceByTask.get(`${task.table}:${task.id}`);
    let scheduled = task.scheduled_time;
    let title = task.title;
    if (recurring) {
      if (!task.recurrence_start || date < task.recurrence_start) continue;
      if (task.recurrence_until && date > task.recurrence_until) continue;
      if (!(task.weekdays ?? []).map(Number).includes(weekday)) continue;
      if (occurrence && isDone(occurrence.status)) continue;
      // O snapshot do dia (se existir) prevalece sobre a definição atual.
      if (occurrence?.scheduled_time) scheduled = occurrence.scheduled_time;
      if (occurrence?.title) title = occurrence.title;
    } else {
      if (task.due_date !== date || isDone(task.status)) continue;
    }
    if (!scheduled) continue;
    const hhmm = scheduled.slice(0, 5);
    if (hhmm < fromTime || hhmm > time) continue;
    out.push({
      table: task.table,
      taskId: task.id,
      userId: task.user_id,
      title,
      date,
      time: hhmm,
      eventKey: `task-reminder:${task.table}:${task.id}:${date}:${hhmm}`,
      url: task.table === "clt_tasks" ? (task.module === "mkt" ? "/visionario/mkt/tarefas" : "/trabalho") : "/hoje",
    });
  }
  return out;
}

export const MAX_DELIVERY_ATTEMPTS = 3;
