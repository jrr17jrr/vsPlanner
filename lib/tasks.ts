import { classifyDueDate } from "@/lib/due-date";
import { parseLocalDate, toDateKey } from "@/lib/format";
import type { Task, TaskOccurrence } from "@/types/database.types";

/**
 * Regra ÚNICA de "quais tarefas aparecem em qual dia" (migration 013).
 * Meu Dia, Tarefas, Dashboard e Histórico consomem só estas funções —
 * nenhuma tela decide sozinha se uma tarefa é de hoje, se está atrasada
 * ou se uma recorrência cai naquele dia.
 *
 *   - Tarefa com prazo (kind 'prazo'): concluir ATÉ `due_date`. Estado em
 *     `tasks.status`. Atrasada = prazo passou e não concluiu.
 *   - Tarefa do dia (kind 'dia') sem repetição: aparece em `due_date`.
 *     Estado em `tasks.status`. Se o dia passar sem conclusão, continua
 *     visível como pendente — nunca some.
 *   - Tarefa do dia recorrente: a definição fica em `tasks` (weekdays +
 *     recurrence_start/until); cada DIA tem estado próprio em
 *     `task_occurrences`. Ocorrências futuras são sempre calculadas aqui,
 *     nunca gravadas.
 */

/** Ordem de exibição (Seg → Dom) com a convenção 0=domingo de Date.getDay(). */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
export const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

/** Quantos dias para trás o Meu Dia procura ocorrências que ficaram pendentes. */
export const MY_DAY_LOOKBACK_DAYS = 7;
/** Janela da página Tarefas para "ficou pendente". */
export const TASKS_PAGE_LOOKBACK_DAYS = 30;
/** Limite de dias passados congelados no histórico ao editar uma recorrência. */
export const MAX_FREEZE_DAYS = 366;

export function addDaysToKey(dateKey: string, amount: number): string {
  const d = parseLocalDate(dateKey);
  d.setDate(d.getDate() + amount);
  return toDateKey(d);
}

export function weekdayOfKey(dateKey: string): number {
  return parseLocalDate(dateKey).getDay();
}

export function isRecurringTask(task: Pick<Task, "recurrence">): boolean {
  return task.recurrence === "weekly";
}

/** Recorrente cuja repetição já terminou (encerrada ou excluída com histórico). */
export function isRecurrenceEnded(task: Task, todayKey: string): boolean {
  return isRecurringTask(task) && !!task.recurrence_until && task.recurrence_until < todayKey;
}

export function formatWeekdays(weekdays: number[]): string {
  if (weekdays.length === 7) return "Todos os dias";
  return WEEKDAY_ORDER.filter((d) => weekdays.includes(d))
    .map((d) => WEEKDAY_SHORT[d])
    .join(", ");
}

/** A definição ATUAL de uma recorrente gera ocorrência nesse dia? */
export function recurringTaskOccursOn(task: Task, dateKey: string): boolean {
  if (!isRecurringTask(task) || !task.recurrence_start) return false;
  if (dateKey < task.recurrence_start) return false;
  if (task.recurrence_until && dateKey > task.recurrence_until) return false;
  return task.weekdays.includes(weekdayOfKey(dateKey));
}

/** Dias passados (até ontem) em que a definição atual gera ocorrência — usados para congelar o histórico antes de uma edição. */
export function pastRecurringDates(task: Task, todayKey: string, maxDays = MAX_FREEZE_DAYS): string[] {
  if (!isRecurringTask(task) || !task.recurrence_start) return [];
  const yesterday = addDaysToKey(todayKey, -1);
  const last = task.recurrence_until && task.recurrence_until < yesterday ? task.recurrence_until : yesterday;
  const floor = addDaysToKey(todayKey, -maxDays);
  let cursor = task.recurrence_start > floor ? task.recurrence_start : floor;
  const out: string[] = [];
  while (cursor <= last) {
    if (task.weekdays.includes(weekdayOfKey(cursor))) out.push(cursor);
    cursor = addDaysToKey(cursor, 1);
  }
  return out;
}

/** Uma tarefa do dia, já resolvida para um dia específico (com snapshot, se houver). */
export type DayTaskEntry = {
  /** Único por tarefa+dia — chave de React e de estado otimista. */
  key: string;
  task: Task;
  date: string;
  recurring: boolean;
  title: string;
  /** HH:MM ou null. */
  time: string | null;
  location: string | null;
  important: boolean;
  notes: string | null;
  done: boolean;
  /** Dia já passou sem conclusão. */
  overdue: boolean;
};

function occurrenceKey(taskId: string, dateKey: string) {
  return `${taskId}__${dateKey}`;
}

function singleDayEntry(task: Task, todayKey: string): DayTaskEntry {
  const date = task.due_date ?? todayKey;
  const done = task.status === "concluida";
  return {
    key: occurrenceKey(task.id, date),
    task,
    date,
    recurring: false,
    title: task.title,
    time: task.scheduled_time?.slice(0, 5) ?? null,
    location: task.location,
    important: task.priority === "importante",
    notes: task.notes,
    done,
    overdue: !done && date < todayKey,
  };
}

function recurringEntry(task: Task, date: string, occurrence: TaskOccurrence | undefined, todayKey: string): DayTaskEntry {
  // Ocorrência gravada = snapshot daquele dia; editar a recorrência depois não reescreve o passado.
  const done = occurrence?.status === "concluida";
  return {
    key: occurrenceKey(task.id, date),
    task,
    date,
    recurring: true,
    title: occurrence?.title ?? task.title,
    time: (occurrence ? occurrence.scheduled_time : task.scheduled_time)?.slice(0, 5) ?? null,
    location: occurrence ? occurrence.location : task.location,
    important: (occurrence?.priority ?? task.priority) === "importante",
    notes: task.notes,
    done,
    overdue: !done && date < todayKey,
  };
}

export function sortDayEntries(entries: DayTaskEntry[]): DayTaskEntry[] {
  return [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.time !== b.time) {
      if (a.time === null) return 1;
      if (b.time === null) return -1;
      return a.time.localeCompare(b.time);
    }
    return a.title.localeCompare(b.title, "pt-BR");
  });
}

function indexOccurrences(occurrences: TaskOccurrence[]) {
  return new Map(occurrences.map((o) => [occurrenceKey(o.task_id, o.occurrence_date), o]));
}

/**
 * Tarefas do dia de `dateKey`: as não recorrentes marcadas para esse dia +
 * as recorrentes cujo dia da semana cai nele (ou que já têm ocorrência
 * gravada nele — histórico de recorrência encerrada/editada).
 */
export function getDayTaskEntries(
  tasks: Task[],
  occurrences: TaskOccurrence[],
  dateKey: string,
  todayKey: string
): DayTaskEntry[] {
  const byKey = indexOccurrences(occurrences);
  const out: DayTaskEntry[] = [];
  for (const task of tasks) {
    if (task.kind !== "dia") continue;
    if (isRecurringTask(task)) {
      const occurrence = byKey.get(occurrenceKey(task.id, dateKey));
      if (occurrence || recurringTaskOccursOn(task, dateKey)) out.push(recurringEntry(task, dateKey, occurrence, todayKey));
    } else if (!task.archived_at && task.due_date === dateKey) {
      out.push(singleDayEntry(task, todayKey));
    }
  }
  return sortDayEntries(out);
}

/**
 * Tarefas do dia que ficaram pendentes em dias anteriores. Não recorrentes:
 * todas (são finitas e nunca podem sumir). Recorrentes: ocorrências dos
 * últimos `lookbackDays` dias sem conclusão.
 */
export function getMissedDayTaskEntries(
  tasks: Task[],
  occurrences: TaskOccurrence[],
  todayKey: string,
  lookbackDays: number
): DayTaskEntry[] {
  const byKey = indexOccurrences(occurrences);
  const out: DayTaskEntry[] = [];
  const from = addDaysToKey(todayKey, -lookbackDays);

  for (const task of tasks) {
    if (task.kind !== "dia") continue;
    if (isRecurringTask(task)) {
      for (let d = from; d < todayKey; d = addDaysToKey(d, 1)) {
        const occurrence = byKey.get(occurrenceKey(task.id, d));
        if (!occurrence && !recurringTaskOccursOn(task, d)) continue;
        const entry = recurringEntry(task, d, occurrence, todayKey);
        if (!entry.done) out.push(entry);
      }
    } else if (!task.archived_at && task.due_date && task.due_date < todayKey && task.status !== "concluida") {
      out.push(singleDayEntry(task, todayKey));
    }
  }
  // Mais recente primeiro — o que ficou pendente ontem importa mais que semana passada.
  return sortDayEntries(out).reverse();
}

/** Tarefas do dia não recorrentes marcadas para depois de hoje. */
export function getUpcomingDayTaskEntries(tasks: Task[], todayKey: string): DayTaskEntry[] {
  return sortDayEntries(
    tasks
      .filter((t) => t.kind === "dia" && !isRecurringTask(t) && !t.archived_at && !!t.due_date && t.due_date > todayKey && t.status !== "concluida")
      .map((t) => singleDayEntry(t, todayKey))
  );
}

export type DeadlineGroups = {
  overdue: Task[];
  dueToday: Task[];
  upcoming: Task[];
  noDate: Task[];
};

/** Tarefas com prazo pendentes agrupadas — mesma classificação (`classifyDueDate`) do resto do sistema. */
export function groupDeadlineTasks(tasks: Task[], todayKey: string): DeadlineGroups {
  const groups: DeadlineGroups = { overdue: [], dueToday: [], upcoming: [], noDate: [] };
  const pending = tasks
    .filter((t) => t.kind === "prazo" && !t.archived_at && t.status !== "concluida")
    .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
  for (const task of pending) {
    const bucket = classifyDueDate(task.due_date, false, todayKey);
    if (bucket === "atrasado") groups.overdue.push(task);
    else if (bucket === "vence_hoje") groups.dueToday.push(task);
    else if (bucket === "proximo") groups.upcoming.push(task);
    else groups.noDate.push(task);
  }
  return groups;
}

export type MyDayTasks = {
  todayKey: string;
  /** Tarefas do dia de hoje (inclui recorrentes do dia da semana). */
  today: DayTaskEntry[];
  /** Tarefas do dia que ficaram pendentes em dias anteriores. */
  missed: DayTaskEntry[];
  /** Tarefas com prazo vencido ou vencendo hoje. */
  deadlines: { overdue: Task[]; dueToday: Task[] };
};

export function buildMyDayTasks(
  tasks: Task[],
  occurrences: TaskOccurrence[],
  todayKey: string,
  lookbackDays = MY_DAY_LOOKBACK_DAYS
): MyDayTasks {
  const { overdue, dueToday } = groupDeadlineTasks(tasks, todayKey);
  return {
    todayKey,
    today: getDayTaskEntries(tasks, occurrences, todayKey, todayKey),
    missed: getMissedDayTaskEntries(tasks, occurrences, todayKey, lookbackDays),
    deadlines: { overdue, dueToday },
  };
}

export type AttentionTask = {
  id: string;
  label: string;
  title: string;
  meta: string;
  detail: string | null;
  urgent: boolean;
};

/**
 * "Precisa da sua atenção" do Dashboard: SÓ tarefas importantes e SÓ o que
 * é relevante hoje — tarefas do dia de hoje ainda não feitas e prazos
 * importantes vencendo hoje ou vencidos. Tarefas normais ficam no Meu Dia.
 */
export function getImportantAttentionTasks(myDay: MyDayTasks): AttentionTask[] {
  const items: AttentionTask[] = [];
  for (const entry of myDay.today) {
    if (!entry.important || entry.done) continue;
    items.push({
      id: `task-${entry.key}`,
      label: "Tarefa importante hoje",
      title: entry.title,
      meta: entry.time ? `Hoje • ${entry.time}` : "Hoje",
      detail: entry.location,
      urgent: false,
    });
  }
  for (const task of myDay.deadlines.overdue) {
    if (task.priority !== "importante") continue;
    items.push({ id: `task-${task.id}`, label: "Prazo vencido", title: task.title, meta: "atrasada", detail: null, urgent: true });
  }
  for (const task of myDay.deadlines.dueToday) {
    if (task.priority !== "importante") continue;
    items.push({ id: `task-${task.id}`, label: "Prazo termina hoje", title: task.title, meta: "Hoje", detail: null, urgent: false });
  }
  return items;
}
