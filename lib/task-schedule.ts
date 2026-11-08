import type { Task } from "@/types/database.types";

/**
 * Regra ÚNICA de "execução x prazo final" de tarefas e subtarefas
 * (migration 20261102100000). Nenhuma tela lê `due_date` direto para saber
 * se algo é de hoje ou está atrasado — tudo passa por aqui.
 *
 *   - EXECUÇÃO ("fazer no dia"): quando a pessoa pretende fazer.
 *   - PRAZO FINAL: até quando precisa estar pronto.
 *
 * São independentes: reagendar a execução nunca mexe no prazo. Uma tarefa
 * pode ter só execução, só prazo, ambos ou nenhum.
 *
 * Compatibilidade com registros antigos (sem nenhum update no banco):
 *   tasks kind 'dia'   → due_date/scheduled_time = execução; prazo em deadline_*.
 *   tasks kind 'prazo' → due_date = prazo; scheduled_time antigo = horário limite.
 *   task_subtasks      → due_date = prazo (sempre foi o rótulo "Prazo");
 *                        execução em scheduled_date/scheduled_time.
 */

export const REMINDER_OFFSETS = [0, 15, 30, 60, 1440] as const;
export type ReminderOffset = (typeof REMINDER_OFFSETS)[number];
export const REMINDER_OFFSET_LABELS: Record<ReminderOffset, string> = {
  0: "No horário",
  15: "15 min antes",
  30: "30 min antes",
  60: "1 hora antes",
  1440: "1 dia antes",
};

export function normalizeReminderOffsets(values: unknown): ReminderOffset[] {
  if (!Array.isArray(values)) return [];
  const set = new Set<number>();
  for (const v of values) {
    const n = Number(v);
    if ((REMINDER_OFFSETS as readonly number[]).includes(n)) set.add(n);
  }
  return [...set].sort((a, b) => a - b) as ReminderOffset[];
}

export type SubtaskPriority = "normal" | "importante";

/** Linha de `task_subtasks`. Campos novos são opcionais (antes da migration não vêm). */
export type Subtask = {
  id: string;
  parent_type: "pessoal" | "clt" | "visionario";
  parent_id: string;
  user_id: string;
  title: string;
  /** PRAZO final da subtarefa. */
  due_date: string | null;
  is_done: boolean;
  position: number;
  parent_subtask_id: string | null;
  description?: string | null;
  /** Fazer no dia (execução). */
  scheduled_date?: string | null;
  scheduled_time?: string | null;
  deadline_time?: string | null;
  priority?: SubtaskPriority | null;
  reminder_offsets?: number[] | null;
  completed_at?: string | null;
  /**
   * Recorrência PRÓPRIA da subtarefa (migration 20261112100000) — independente
   * da tarefa principal. 'weekly' = estado por dia em
   * `task_subtask_occurrences` (concluir segunda não conclui terça); `is_done`
   * da linha não é usado. Regra em lib/subtask-recurrence.ts.
   */
  recurrence?: "none" | "weekly" | null;
  weekdays?: number[] | null;
  recurrence_start?: string | null;
  recurrence_until?: string | null;
  archived_at?: string | null;
  /** Execuções gravadas (janela recente) — anexadas pelo servidor, não é coluna. */
  occurrences?: SubtaskOccurrence[];
  /** Calculado para o dia exibido (lib/subtask-recurrence.ts) — não é coluna. */
  day?: SubtaskDayState;
};

/** Linha de `task_subtask_occurrences` (só os campos que o app usa). */
export type SubtaskOccurrence = {
  subtask_id: string;
  occurrence_date: string;
  status: "pendente" | "concluida";
  completed_at: string | null;
  title?: string | null;
};

/** Estado de uma subtarefa recorrente no dia exibido. */
export type SubtaskDayState = {
  date: string;
  /** A definição gera execução nesse dia. */
  occurs: boolean;
  /** Próxima execução a partir do dia (inclusive), para "Próxima: qua 12/11". */
  nextDate: string | null;
};

export type Schedule = {
  executionDate: string | null;
  /** HH:MM */
  executionTime: string | null;
  deadlineDate: string | null;
  /** HH:MM */
  deadlineTime: string | null;
};

const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : null);

/** Execução/prazo de uma tarefa principal. Recorrentes: execução é por ocorrência (lib/tasks.ts), aqui fica null. */
export function taskSchedule(task: Pick<Task, "kind" | "due_date" | "scheduled_time" | "recurrence"> & Partial<Pick<Task, "deadline_date" | "deadline_time">>): Schedule {
  if (task.kind === "prazo") {
    return {
      executionDate: null,
      executionTime: null,
      deadlineDate: task.due_date,
      deadlineTime: hhmm(task.deadline_time) ?? hhmm(task.scheduled_time),
    };
  }
  return {
    executionDate: task.recurrence === "weekly" ? null : task.due_date,
    executionTime: hhmm(task.scheduled_time),
    deadlineDate: task.deadline_date ?? null,
    deadlineTime: hhmm(task.deadline_time),
  };
}

export function subtaskSchedule(s: Pick<Subtask, "due_date"> & Partial<Subtask>): Schedule {
  return {
    executionDate: s.scheduled_date ?? null,
    executionTime: hhmm(s.scheduled_time),
    deadlineDate: s.due_date ?? null,
    deadlineTime: hhmm(s.deadline_time),
  };
}

export type ScheduleState = {
  /** Execução programada para `dateKey`. */
  scheduledOn: boolean;
  /** Execução programada num dia que já passou, sem conclusão. */
  executionOverdue: boolean;
  /** Prazo final passou sem conclusão (com horário limite, conta a hora no dia do prazo). */
  deadlineOverdue: boolean;
  /** Prazo final é hoje (e ainda não venceu). */
  deadlineToday: boolean;
  /** Prazo final é amanhã. */
  deadlineTomorrow: boolean;
};

function nextDayKey(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + 1));
  return date.toISOString().slice(0, 10);
}

/**
 * Estado de uma agenda num dia. `todayKey`/`nowTime` = agora em São Paulo;
 * `dateKey` = dia sendo visualizado (Rotina pode olhar outro dia da semana).
 */
export function scheduleState(schedule: Schedule, done: boolean, opts: { todayKey: string; nowTime?: string; dateKey?: string }): ScheduleState {
  const { todayKey } = opts;
  const dateKey = opts.dateKey ?? todayKey;
  const { executionDate, deadlineDate, deadlineTime } = schedule;
  const deadlinePassedToday = deadlineDate === todayKey && !!deadlineTime && !!opts.nowTime && deadlineTime < opts.nowTime;
  return {
    scheduledOn: executionDate === dateKey,
    executionOverdue: !done && !!executionDate && executionDate < todayKey,
    deadlineOverdue: !done && !!deadlineDate && (deadlineDate < todayKey || deadlinePassedToday),
    deadlineToday: !done && deadlineDate === todayKey && !deadlinePassedToday,
    deadlineTomorrow: !done && !!deadlineDate && deadlineDate === nextDayKey(todayKey),
  };
}

export type SubtaskEntry = {
  subtask: Subtask;
  schedule: Schedule;
  state: ScheduleState;
  /** Título da etapa-pai quando é item de checklist. */
  parentTitle: string | null;
};

export type SubtaskSections = {
  /** 1. PARA FAZER HOJE — programadas para `dateKey` (pendentes primeiro). */
  today: SubtaskEntry[];
  /** 2. ATRASADAS — não concluídas com execução ou prazo vencido (fora de "hoje"). */
  overdue: SubtaskEntry[];
  /** 3. TODAS — lista completa, na ordem da tarefa. */
  all: SubtaskEntry[];
  done: number;
  total: number;
  /** 0-100 */
  progress: number;
};

function byTimeThenPosition(a: SubtaskEntry, b: SubtaskEntry) {
  if (a.subtask.is_done !== b.subtask.is_done) return a.subtask.is_done ? 1 : -1;
  const at = a.schedule.executionTime, bt = b.schedule.executionTime;
  if (at !== bt) {
    if (!at) return 1;
    if (!bt) return -1;
    return at.localeCompare(bt);
  }
  return a.subtask.position - b.subtask.position;
}

/**
 * Agrupa as subtarefas de UMA tarefa nas três seções (ordem fixa: hoje →
 * atrasadas → todas). Uma subtarefa aparece em no máximo uma das duas
 * seções de destaque; "todas" é a lista completa (a tela marca as que já
 * foram destacadas, sem repetir o card inteiro).
 */
export function groupSubtasks(subtasks: Subtask[], opts: { todayKey: string; nowTime?: string; dateKey?: string }): SubtaskSections {
  const titles = new Map(subtasks.map((s) => [s.id, s.title]));
  const all = subtasks.map<SubtaskEntry>((subtask) => {
    const schedule = subtaskSchedule(subtask);
    return {
      subtask,
      schedule,
      state: scheduleState(schedule, subtask.is_done, opts),
      parentTitle: subtask.parent_subtask_id ? titles.get(subtask.parent_subtask_id) ?? null : null,
    };
  });
  const today = all.filter((e) => e.state.scheduledOn).sort(byTimeThenPosition);
  const inToday = new Set(today.map((e) => e.subtask.id));
  const overdue = all
    .filter((e) => !inToday.has(e.subtask.id) && (e.state.executionOverdue || e.state.deadlineOverdue))
    .sort((a, b) => {
      // Prazo vencido pesa mais que execução vencida; depois a data mais antiga.
      if (a.state.deadlineOverdue !== b.state.deadlineOverdue) return a.state.deadlineOverdue ? -1 : 1;
      const ak = (a.state.deadlineOverdue ? a.schedule.deadlineDate : a.schedule.executionDate) ?? "";
      const bk = (b.state.deadlineOverdue ? b.schedule.deadlineDate : b.schedule.executionDate) ?? "";
      return ak.localeCompare(bk);
    });
  // Subtarefa recorrente sem execução no dia exibido (já resolvida por
  // lib/subtask-recurrence.ts) não entra no progresso daquele dia.
  const counted = subtasks.filter((s) => !s.day || s.day.occurs);
  const done = counted.filter((s) => s.is_done).length;
  return { today, overdue, all, done, total: counted.length, progress: counted.length ? Math.round((done / counted.length) * 100) : 0 };
}

/** Erro de coluna inexistente (migration ainda não aplicada). */
export function isMissingColumnError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === "42703" || error.code === "PGRST204" || /column .* does not exist|Could not find the '.*' column/i.test(error.message ?? "");
}

export const MISSING_SCHEDULE_WARNING =
  "Salvo sem as novas datas/lembretes: o banco ainda não tem a atualização de agenda (migration 20261102100000).";

/** Remove do objeto as colunas novas da migration (para regravar antes dela ser aplicada). */
export function stripScheduleColumns<T extends Record<string, unknown>>(values: T, columns: readonly string[]): { values: Partial<T>; lost: boolean } {
  const out: Record<string, unknown> = {};
  let lost = false;
  for (const [k, v] of Object.entries(values)) {
    if (columns.includes(k)) {
      const meaningful = Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined && v !== "normal";
      if (meaningful) lost = true;
      continue;
    }
    out[k] = v;
  }
  return { values: out as Partial<T>, lost };
}

export const TASK_SCHEDULE_COLUMNS = ["deadline_date", "deadline_time", "reminder_offsets"] as const;
export const SUBTASK_SCHEDULE_COLUMNS = ["scheduled_date", "scheduled_time", "deadline_time", "priority", "reminder_offsets", "completed_at"] as const;
export const ACTIVITY_LINK_COLUMNS = ["task_id", "specific_date", "reminder_offsets"] as const;
