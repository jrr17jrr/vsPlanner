import { activityOccursOn } from "@/lib/routine-real";
import { subtaskSchedule, taskSchedule, type Subtask } from "@/lib/task-schedule";
import { addDaysToKey, getDayTaskEntries, getMissedDayTaskEntries, isRecurringTask, recurringTaskOccursOn, weekdayOfKey, type DayTaskEntry } from "@/lib/tasks";
import type { Activity, CltTask, CltTaskOccurrence, PersonalWorkTask, Task, TaskOccurrence, WorkItem } from "@/types/database.types";

/**
 * Meu Dia em quatro seções — regra ÚNICA, pura e testada
 * (lib/my-day-board.test.ts):
 *
 *   Hoje       → execução hoje (ou, sem execução, prazo final hoje).
 *   Atrasadas  → prazo final vencido (vermelho) OU execução atrasada
 *                (amarelo). Passou o prazo = só "Prazo vencido", mesmo que a
 *                execução também tenha passado.
 *   Próximas   → programadas para os próximos 7 dias.
 *   Concluídas → concluídas hoje.
 *
 * Cada tarefa/subtarefa aparece UMA vez. Sem data de execução vale o prazo
 * final; sem nenhuma data não é classificada (fica na página Tarefas).
 * Datas são chaves yyyy-MM-dd já calculadas em America/Sao_Paulo.
 */

export type BoardStatus = "hoje" | "execucao_atrasada" | "prazo_vencido" | "proxima" | "concluida";
export type BoardSection = "hoje" | "atrasadas" | "proximas" | "concluidas";

export const UPCOMING_DAYS = 7;
export const SECTION_OF: Record<BoardStatus, BoardSection> = {
  hoje: "hoje",
  execucao_atrasada: "atrasadas",
  prazo_vencido: "atrasadas",
  proxima: "proximas",
  concluida: "concluidas",
};

/** Data (São Paulo) de um timestamp ISO. */
export function spDateKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

export function classifySchedule(
  s: { executionDate: string | null; deadlineDate: string | null; done: boolean; completedOn: string | null },
  todayKey: string,
  horizonKey: string = addDaysToKey(todayKey, UPCOMING_DAYS)
): BoardStatus | null {
  if (s.done) return s.completedOn === todayKey ? "concluida" : null;
  if (s.deadlineDate && s.deadlineDate < todayKey) return "prazo_vencido";
  if (s.executionDate) {
    if (s.executionDate < todayKey) return "execucao_atrasada";
    if (s.executionDate === todayKey) return "hoje";
    return s.executionDate <= horizonKey ? "proxima" : null;
  }
  if (s.deadlineDate) {
    if (s.deadlineDate === todayKey) return "hoje";
    return s.deadlineDate <= horizonKey ? "proxima" : null;
  }
  return null;
}

type Base = {
  key: string;
  status: BoardStatus;
  title: string;
  description: string | null;
  important: boolean;
  executionDate: string | null;
  executionTime: string | null;
  deadlineDate: string | null;
  deadlineTime: string | null;
  /** Data em que foi concluída (Concluídas). */
  completedOn: string | null;
  /** Rótulo da área quando não é Pessoal (CLT, MKT, Visionário). */
  areaLabel: string | null;
  /** Observação curta (ex.: outros dias pendentes de uma repetição). */
  note: string | null;
};

export type BoardItem = Base &
  (
    | { source: "task"; task: Task; entry: DayTaskEntry | null; recurring: boolean }
    | { source: "subtask"; subtask: Subtask; parent: Task }
    | { source: "clt"; cltTask: CltTask; module: "clt" | "mkt"; occurrenceDate: string | null; companyName: string | null }
    | { source: "work"; workItem: WorkItem }
    | { source: "legacy"; workTask: PersonalWorkTask }
  );

export type MyDayBoard = Record<BoardSection, BoardItem[]> & { linkedTaskIds: string[] };

export type BoardInput = {
  todayKey: string;
  tasks: Task[];
  occurrences: TaskOccurrence[];
  subtasks: Subtask[];
  activities: Activity[];
  cltTasks?: { task: CltTask; module: "clt" | "mkt"; companyName: string | null }[];
  cltOccurrences?: CltTaskOccurrence[];
  workItems?: WorkItem[];
  legacyWorkTasks?: PersonalWorkTask[];
  lookbackDays?: number;
};

const time5 = (t: string | null | undefined) => (t ? t.slice(0, 5) : null);
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

function taskItems(input: BoardInput, linked: Set<string>, horizon: string): BoardItem[] {
  const { todayKey, tasks, occurrences } = input;
  const out: BoardItem[] = [];
  const lookback = input.lookbackDays ?? 7;
  const todayEntries = new Map(getDayTaskEntries(tasks, occurrences, todayKey, todayKey).filter((e) => e.recurring).map((e) => [e.task.id, e]));
  const missedByTask = new Map<string, DayTaskEntry[]>();
  for (const e of getMissedDayTaskEntries(tasks, occurrences, todayKey, lookback)) {
    if (!e.recurring) continue;
    (missedByTask.get(e.task.id) ?? missedByTask.set(e.task.id, []).get(e.task.id)!).push(e);
  }

  for (const task of tasks) {
    if (linked.has(task.id)) continue;
    const schedule = taskSchedule(task);
    const common = {
      title: task.title,
      description: task.description,
      important: task.priority === "importante",
      deadlineTime: schedule.deadlineTime,
      areaLabel: null,
    };

    if (isRecurringTask(task)) {
      // Repetição: hoje (pendente ou feita) > dia anterior pendente > próxima ocorrência. Uma vez só.
      const today = todayEntries.get(task.id);
      const missed = missedByTask.get(task.id) ?? []; // mais recente primeiro
      if (today) {
        const extra = missed.length;
        out.push({
          ...common, source: "task", task, entry: today, recurring: true, key: `task:${task.id}`,
          title: today.title, important: today.important,
          status: today.done ? "concluida" : "hoje",
          executionDate: todayKey, executionTime: today.time, deadlineDate: null, deadlineTime: null,
          completedOn: today.done ? todayKey : null,
          note: extra ? `Também ficou pendente em ${missed.map((m) => ddmm(m.date)).slice(0, 3).join(", ")}${extra > 3 ? "…" : ""}` : null,
        });
        continue;
      }
      if (task.archived_at) continue;
      if (missed.length) {
        const latest = missed[0];
        out.push({
          ...common, source: "task", task, entry: latest, recurring: true, key: `task:${task.id}`,
          title: latest.title, important: latest.important, status: "execucao_atrasada",
          executionDate: latest.date, executionTime: latest.time, deadlineDate: null, deadlineTime: null, completedOn: null,
          note: missed.length > 1 ? `${missed.length} dias pendentes na semana` : null,
        });
        continue;
      }
      for (let d = addDaysToKey(todayKey, 1); d <= horizon; d = addDaysToKey(d, 1)) {
        if (!recurringTaskOccursOn(task, d)) continue;
        out.push({
          ...common, source: "task", task, entry: null, recurring: true, key: `task:${task.id}`,
          status: "proxima", executionDate: d, executionTime: time5(task.scheduled_time), deadlineDate: null, deadlineTime: null, completedOn: null, note: null,
        });
        break;
      }
      continue;
    }

    if (task.archived_at) continue;
    const done = task.status === "concluida";
    const completedOn = spDateKey(task.completed_at);
    const status = classifySchedule({ executionDate: schedule.executionDate, deadlineDate: schedule.deadlineDate, done, completedOn }, todayKey, horizon);
    if (!status) continue;
    out.push({
      ...common, source: "task", task, entry: null, recurring: false, key: `task:${task.id}`, status,
      executionDate: schedule.executionDate, executionTime: schedule.executionTime, deadlineDate: schedule.deadlineDate,
      completedOn: done ? completedOn : null, note: null,
    });
  }
  return out;
}

function subtaskItems(input: BoardInput, linked: Set<string>, horizon: string): BoardItem[] {
  const parents = new Map(input.tasks.map((t) => [t.id, t]));
  const out: BoardItem[] = [];
  for (const sub of input.subtasks) {
    const parent = parents.get(sub.parent_id);
    if (!parent || parent.archived_at || linked.has(parent.id)) continue;
    // Tarefa principal concluída: as subtarefas saem do Meu Dia (não ficam "atrasadas").
    if (!isRecurringTask(parent) && parent.status === "concluida") continue;
    const s = subtaskSchedule(sub);
    const completedOn = spDateKey(sub.completed_at ?? null);
    const status = classifySchedule({ executionDate: s.executionDate, deadlineDate: s.deadlineDate, done: sub.is_done, completedOn }, input.todayKey, horizon);
    if (!status) continue;
    out.push({
      source: "subtask", subtask: sub, parent, key: `sub:${sub.id}`, status,
      title: sub.title, description: sub.description ?? null, important: sub.priority === "importante",
      executionDate: s.executionDate, executionTime: s.executionTime, deadlineDate: s.deadlineDate, deadlineTime: s.deadlineTime,
      completedOn: sub.is_done ? completedOn : null, areaLabel: null, note: null,
    });
  }
  return out;
}

const MODULE_LABEL = { clt: "CLT", mkt: "MKT" } as const;

function cltItems(input: BoardInput, horizon: string): BoardItem[] {
  const { todayKey } = input;
  const out: BoardItem[] = [];
  const doneToday = new Set((input.cltOccurrences ?? []).filter((o) => o.occurrence_date === todayKey && o.status === "concluida").map((o) => o.task_id));
  const weekday = weekdayOfKey(todayKey);
  for (const { task, module, companyName } of input.cltTasks ?? []) {
    if (task.archived_at) continue;
    const areaLabel = companyName ? `${MODULE_LABEL[module]} · ${companyName}` : MODULE_LABEL[module];
    const base = { title: task.title, description: task.description, important: task.priority === "importante", areaLabel, deadlineTime: null, note: null, companyName };
    if (task.recurrence === "weekly") {
      // Repetições do CLT/MKT: só a de hoje (os dias anteriores ficam na página de Tarefas do módulo).
      const occurs = task.weekdays.includes(weekday) && (!task.recurrence_start || task.recurrence_start <= todayKey) && (!task.recurrence_until || task.recurrence_until >= todayKey);
      if (!occurs) continue;
      const done = doneToday.has(task.id);
      out.push({ ...base, source: "clt", cltTask: task, module, occurrenceDate: todayKey, key: `clt:${task.id}`, status: done ? "concluida" : "hoje", executionDate: todayKey, executionTime: time5(task.scheduled_time), deadlineDate: null, completedOn: done ? todayKey : null });
      continue;
    }
    const executionDate = task.kind === "dia" ? task.due_date : null;
    const deadlineDate = task.kind === "prazo" ? task.due_date : null;
    const done = task.status === "concluida";
    const completedOn = spDateKey(task.completed_at);
    const status = classifySchedule({ executionDate, deadlineDate, done, completedOn }, todayKey, horizon);
    if (!status) continue;
    out.push({ ...base, source: "clt", cltTask: task, module, occurrenceDate: null, key: `clt:${task.id}`, status, executionDate, executionTime: time5(task.scheduled_time), deadlineDate, completedOn: done ? completedOn : null });
  }
  return out;
}

function otherItems(input: BoardInput): BoardItem[] {
  const out: BoardItem[] = [];
  for (const w of input.workItems ?? []) {
    const done = w.status === "concluido";
    out.push({ source: "work", workItem: w, key: `work:${w.id}`, status: done ? "concluida" : "hoje", title: w.title, description: w.description, important: w.priority === "alta", executionDate: w.due_date, executionTime: null, deadlineDate: null, deadlineTime: null, completedOn: done ? input.todayKey : null, areaLabel: "Visionário Dev", note: null });
  }
  for (const t of input.legacyWorkTasks ?? []) {
    const done = t.status === "concluida";
    const status = classifySchedule({ executionDate: t.due_date, deadlineDate: null, done, completedOn: spDateKey(t.completed_at) }, input.todayKey);
    if (status !== "hoje" && status !== "concluida") continue;
    out.push({ source: "legacy", workTask: t, key: `legacy:${t.id}`, status, title: t.title, description: t.description, important: t.priority === "alta" || t.priority === "urgente", executionDate: t.due_date, executionTime: time5(t.scheduled_time), deadlineDate: null, deadlineTime: null, completedOn: done ? spDateKey(t.completed_at) : null, areaLabel: "Trabalho", note: null });
  }
  return out;
}

const refDate = (i: BoardItem) => i.executionDate ?? i.deadlineDate ?? "9999-12-31";
const byTime = (a: BoardItem, b: BoardItem) => {
  const ta = a.executionTime ?? a.deadlineTime, tb = b.executionTime ?? b.deadlineTime;
  if (ta !== tb) { if (!ta) return 1; if (!tb) return -1; return ta.localeCompare(tb); }
  if (a.important !== b.important) return a.important ? -1 : 1;
  return a.title.localeCompare(b.title, "pt-BR");
};

const SORTERS: Record<BoardSection, (a: BoardItem, b: BoardItem) => number> = {
  hoje: byTime,
  // Prazo vencido primeiro (mais grave), depois o mais antigo.
  atrasadas: (a, b) => (a.status !== b.status ? (a.status === "prazo_vencido" ? -1 : 1) : (a.status === "prazo_vencido" ? (a.deadlineDate ?? "").localeCompare(b.deadlineDate ?? "") : refDate(a).localeCompare(refDate(b))) || byTime(a, b)),
  proximas: (a, b) => refDate(a).localeCompare(refDate(b)) || byTime(a, b),
  concluidas: (a, b) => a.title.localeCompare(b.title, "pt-BR"),
};

/** Subtarefa logo abaixo da tarefa principal quando as duas estão na mesma seção. */
function nestUnderParents(items: BoardItem[]): BoardItem[] {
  const parentKeys = new Set(items.filter((i) => i.source === "task").map((i) => i.key));
  const children = new Map<string, BoardItem[]>();
  const rest: BoardItem[] = [];
  for (const i of items) {
    if (i.source === "subtask" && parentKeys.has(`task:${i.parent.id}`)) (children.get(i.parent.id) ?? children.set(i.parent.id, []).get(i.parent.id)!).push(i);
    else rest.push(i);
  }
  return rest.flatMap((i) => (i.source === "task" ? [i, ...(children.get(i.task.id) ?? [])] : [i]));
}

export function buildMyDayBoard(input: BoardInput): MyDayBoard {
  const { todayKey } = input;
  const horizon = addDaysToKey(todayKey, UPCOMING_DAYS);
  const weekday = weekdayOfKey(todayKey);
  const taskIds = new Set(input.tasks.map((t) => t.id));
  // Tarefa vinculada à Rotina de hoje aparece só no card da Rotina.
  const linked = new Set(
    input.activities.filter((a) => a.is_active && a.task_id && taskIds.has(a.task_id) && activityOccursOn(a, todayKey, weekday)).map((a) => a.task_id!)
  );
  const all = [...taskItems(input, linked, horizon), ...subtaskItems(input, linked, horizon), ...cltItems(input, horizon), ...otherItems(input)];
  const board: MyDayBoard = { hoje: [], atrasadas: [], proximas: [], concluidas: [], linkedTaskIds: [...linked] };
  const seen = new Set<string>();
  for (const item of all) {
    if (seen.has(item.key)) continue; // garantia extra: nunca duas vezes
    seen.add(item.key);
    board[SECTION_OF[item.status]].push(item);
  }
  for (const section of ["hoje", "atrasadas", "proximas", "concluidas"] as const) board[section] = nestUnderParents(board[section].sort(SORTERS[section]));
  return board;
}
