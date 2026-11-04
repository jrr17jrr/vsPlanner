import { localDateTimeParts } from "@/lib/push/reminders";
import { normalizeReminderOffsets, subtaskSchedule, taskSchedule, type Subtask } from "@/lib/task-schedule";
import { activityOccursOn } from "@/lib/routine-real";
import type { NotificationPrefs } from "@/lib/notification-prefs";
import type { Activity, Task } from "@/types/database.types";

/**
 * Lembretes de tarefas pessoais, subtarefas (de qualquer módulo) e
 * atividades da Rotina — puro (sem I/O), usado pelo cron e pelos testes.
 *
 * Princípios:
 *  - A notificação nasce do REGISTRO ORIGINAL (tarefa/subtarefa), nunca da
 *    tela: a mesma tarefa em Rotina, Meu Dia e Tarefas gera UM aviso.
 *  - Nada fica pré-agendado: a cada execução do cron o estado ATUAL é
 *    lido. Concluir = nenhum aviso futuro (inclusive de atraso); reagendar
 *    = chaves novas (data/horário fazem parte da chave), as antigas nunca
 *    mais batem.
 *  - `eventKey` é único por (registro, tipo, data/horário, antecedência) e
 *    trava em push_delivery_log — reenvio do cron nunca duplica.
 *  - `dedupeKey` junta avisos de fontes diferentes do MESMO item no mesmo
 *    minuto (ex.: rotina vinculada + execução da tarefa às 18:00).
 *
 * Horários em São Paulo (sem horário de verão desde 2019).
 */

export type ReminderType = "execution" | "deadline_soon" | "deadline_today" | "overdue" | "routine";

export type ScheduledReminder = {
  userId: string;
  eventKey: string;
  dedupeKey: string;
  type: ReminderType;
  category: "tasks" | "routine" | "clt";
  title: string;
  body: string;
  url: string;
  /** yyyy-MM-ddTHH:mm (São Paulo) */
  fireAt: string;
  /** Antecedência (min) e início do evento (yyyy-MM-ddTHH:mm) — aviso antecipado não sai depois do início. */
  offset?: number;
  startsAt?: string;
  /** Avisos com `fireAt` anterior a isto não saem (registro criado/editado depois do horário). */
  notBefore?: string;
};

export type ReminderTaskRow = Pick<Task, "id" | "user_id" | "title" | "kind" | "due_date" | "scheduled_time" | "status" | "archived_at" | "recurrence" | "weekdays" | "recurrence_start" | "recurrence_until"> &
  Partial<Pick<Task, "deadline_date" | "deadline_time" | "reminder_offsets">>;

export type ReminderSubtaskRow = Subtask & {
  parentTitle: string | null;
  /** Tarefa-pai concluída/arquivada/inexistente → subtarefa não notifica. */
  parentClosed: boolean;
};

export type ReminderActivityRow = Activity & {
  /** Tarefa vinculada (título atual e se está fechada). */
  linkedTask?: { title: string; closed: boolean } | null;
};

export type ScheduleReminderInput = {
  now: Date;
  catchUpMinutes?: number;
  tasks?: ReminderTaskRow[];
  /** task_occurrences de hoje/amanhã das recorrentes. */
  occurrences?: Array<{ task_id: string; occurrence_date: string; status: string | null; scheduled_time?: string | null; title?: string | null }>;
  subtasks?: ReminderSubtaskRow[];
  activities?: ReminderActivityRow[];
  /** activity_completions (sessão do dia já feita → sem aviso). */
  completions?: Array<{ activity_id: string; occurrence_date: string }>;
  prefs: (userId: string) => NotificationPrefs;
};

/** Desloca data/hora local por minutos (aritmética em UTC "ingênuo"). */
export function shiftLocal(date: string, time: string, minutes: number): { date: string; time: string } {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d, hh, mm) + minutes * 60_000);
  return { date: t.toISOString().slice(0, 10), time: t.toISOString().slice(11, 16) };
}

const addDays = (date: string, n: number) => shiftLocal(date, "12:00", n * 1440).date;
const ddmm = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : null);
/** Timestamp ISO → yyyy-MM-ddTHH:mm em São Paulo (null se inválido). */
function localKey(iso: string | null | undefined): string | null {
  const ms = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(ms)) return null;
  const p = localDateTimeParts(new Date(ms));
  return `${p.date}T${p.time}`;
}

function isClosedStatus(status: string | null | undefined) {
  return status === "concluida" || status === "concluido" || status === "completed" || status === "cancelada" || status === "cancelado";
}

/** Texto dos avisos da Minha Rotina ("Hora de começar…", "…começa em 15 minutos"). */
export function routineBody(label: string, time: string, offset: number): string {
  if (offset === 0) return `Hora de começar ${label}.`;
  if (offset === 1440) return `Amanhã às ${time}: ${label}.`;
  return `${label} começa em ${offset === 60 ? "1 hora" : `${offset} minutos`} (às ${time}).`;
}

/** Avisos "1 dia antes" e "no horário" de uma execução. Sem horário: no dia às 08:00 (e véspera no horário do resumo). */
function executionPlans(base: {
  userId: string; src: string; id: string; entity: string; label: string; url: string; category: ScheduledReminder["category"];
  date: string; time: string | null; offsets: number[]; legacyKey?: (date: string, time: string) => string; digestTime: string;
}): ScheduledReminder[] {
  const out: ScheduledReminder[] = [];
  const seen = new Set<string>();
  for (const offset of base.offsets) {
    let fire: { date: string; time: string };
    let effective = offset;
    if (base.time) fire = shiftLocal(base.date, base.time, -offset);
    else if (offset === 1440) fire = { date: addDays(base.date, -1), time: base.digestTime };
    else { fire = { date: base.date, time: "08:00" }; effective = 0; }
    if (seen.has(`${effective}`)) continue;
    seen.add(`${effective}`);
    const at = base.time ? ` às ${base.time}` : "";
    const body = base.category === "routine" && base.time
      ? routineBody(base.label, base.time, effective)
      : effective === 0 ? `${base.label} está programado para hoje${at}.`
      : effective === 1440 ? `Amanhã${at}: ${base.label}.`
      : `Em ${effective === 60 ? "1 hora" : `${effective} min`}: ${base.label}${at}.`;
    const eventKey = effective === 0 && base.time && base.legacyKey
      ? base.legacyKey(base.date, base.time)
      : `exec:${base.src}:${base.id}:${base.date}:${base.time ?? "dia"}:${effective}`;
    out.push({
      userId: base.userId, eventKey, dedupeKey: `${base.userId}|${base.entity}|${fire.date}T${fire.time}`,
      type: "execution", category: base.category, title: base.category === "routine" ? "VS Planner • Minha Rotina" : "VS Planner • Lembrete",
      body, url: base.url, fireAt: `${fire.date}T${fire.time}`,
      ...(base.time ? { offset: effective, startsAt: `${base.date}T${base.time}` } : {}),
    });
  }
  return out;
}

function deadlinePlans(base: {
  userId: string; src: string; id: string; entity: string; label: string; url: string; category: ScheduledReminder["category"];
  date: string; time: string | null; prefs: NotificationPrefs;
}): ScheduledReminder[] {
  const out: ScheduledReminder[] = [];
  const { prefs } = base;
  const common = { userId: base.userId, category: base.category, url: base.url };
  const until = base.time ? ` às ${base.time}` : "";
  if (prefs.deadline) {
    const soon = addDays(base.date, -1);
    out.push({ ...common, type: "deadline_soon", eventKey: `deadline-soon:${base.src}:${base.id}:${base.date}`, dedupeKey: `${base.userId}|${base.entity}|deadline-soon|${base.date}`,
      title: "VS Planner • Prazo amanhã", body: `O prazo de ${base.label} termina amanhã${until}.`, fireAt: `${soon}T${prefs.digestTime}` });
    // Horário limite antes do resumo: avisa 1h antes do limite (sem voltar para o dia anterior).
    let todayTime = prefs.digestTime;
    if (base.time && base.time <= prefs.digestTime) {
      const early = shiftLocal(base.date, base.time, -60);
      todayTime = early.date === base.date ? early.time : "00:00";
    }
    out.push({ ...common, type: "deadline_today", eventKey: `deadline-today:${base.src}:${base.id}:${base.date}`, dedupeKey: `${base.userId}|${base.entity}|deadline-today|${base.date}`,
      title: "VS Planner • Último dia", body: `Último dia para concluir ${base.label}${base.time ? ` (até ${base.time})` : ""}.`, fireAt: `${base.date}T${todayTime}` });
  }
  if (prefs.overdue) {
    // Dia seguinte, +3 e +7 — lembra sem virar spam; concluir para tudo.
    [1, 3, 7].forEach((n, i) => {
      const day = addDays(base.date, n);
      out.push({ ...common, type: "overdue", eventKey: `overdue:${base.src}:${base.id}:${base.date}:${i + 1}`, dedupeKey: `${base.userId}|${base.entity}|overdue|${day}`,
        title: "VS Planner • Atrasada", body: `${base.label} está atrasada (prazo era ${ddmm(base.date)}).`, fireAt: `${day}T${prefs.digestTime}` });
    });
  }
  return out;
}

/** Todos os avisos possíveis dos registros (antes de filtrar pela janela de tempo). */
export function planReminders(input: Omit<ScheduleReminderInput, "now" | "catchUpMinutes">, today: string): ScheduledReminder[] {
  const tomorrow = addDays(today, 1);
  const plans: ScheduledReminder[] = [];
  const occByKey = new Map((input.occurrences ?? []).map((o) => [`${o.task_id}:${o.occurrence_date}`, o]));
  const completed = new Set((input.completions ?? []).map((c) => `${c.activity_id}:${c.occurrence_date}`));

  for (const task of input.tasks ?? []) {
    if (task.archived_at) continue;
    const prefs = input.prefs(task.user_id);
    if (!prefs.enabled || !prefs.tasks) continue;
    const offsets = normalizeReminderOffsets(task.reminder_offsets);
    const legacyKey = (date: string, time: string) => `task-reminder:tasks:${task.id}:${date}:${time}`;
    const base = { userId: task.user_id, src: "task", id: task.id, entity: `task:${task.id}`, category: "tasks" as const, digestTime: prefs.digestTime };

    if (task.recurrence === "weekly") {
      if (!prefs.execution) continue;
      for (const date of [today, tomorrow]) {
        if (!task.recurrence_start || date < task.recurrence_start) continue;
        if (task.recurrence_until && date > task.recurrence_until) continue;
        if (!(task.weekdays ?? []).map(Number).includes(weekdayOf(date))) continue;
        const occ = occByKey.get(`${task.id}:${date}`);
        if (occ && isClosedStatus(occ.status)) continue;
        const time = hhmm(occ?.scheduled_time) ?? hhmm(task.scheduled_time);
        const eff = offsets.length ? offsets : time ? prefs.defaultOffsets : [];
        plans.push(...executionPlans({ ...base, label: occ?.title ?? task.title, url: "/hoje", date, time, offsets: eff, legacyKey }));
      }
      continue;
    }

    if (isClosedStatus(task.status)) continue;
    const s = taskSchedule(task);
    if (s.executionDate && prefs.execution) {
      const eff = offsets.length ? offsets : s.executionTime ? prefs.defaultOffsets : [];
      plans.push(...executionPlans({ ...base, label: task.title, url: "/hoje", date: s.executionDate, time: s.executionTime, offsets: eff, legacyKey }));
    }
    if (s.deadlineDate) plans.push(...deadlinePlans({ ...base, label: task.title, url: "/tarefas", date: s.deadlineDate, time: s.deadlineTime, prefs }));
  }

  for (const sub of input.subtasks ?? []) {
    if (sub.is_done || sub.parentClosed) continue;
    const prefs = input.prefs(sub.user_id);
    const category = sub.parent_type === "clt" ? "clt" : "tasks";
    if (!prefs.enabled || !prefs[category]) continue;
    const label = sub.parentTitle ? `${sub.parentTitle} — ${sub.title}` : sub.title;
    const url = sub.parent_type === "clt" ? "/trabalho" : sub.parent_type === "visionario" ? "/visionario/trabalhos" : "/hoje";
    const s = subtaskSchedule(sub);
    const base = { userId: sub.user_id, src: "sub", id: sub.id, entity: `sub:${sub.id}`, label, category: category as ScheduledReminder["category"], digestTime: prefs.digestTime };
    if (s.executionDate && prefs.execution) {
      const offsets = normalizeReminderOffsets(sub.reminder_offsets);
      const eff = offsets.length ? offsets : s.executionTime ? prefs.defaultOffsets : [];
      plans.push(...executionPlans({ ...base, url, date: s.executionDate, time: s.executionTime, offsets: eff }));
    }
    if (s.deadlineDate) plans.push(...deadlinePlans({ ...base, url: sub.parent_type === "pessoal" ? "/tarefas" : url, date: s.deadlineDate, time: s.deadlineTime, prefs }));
  }

  for (const activity of input.activities ?? []) {
    if (!activity.is_active || activity.linkedTask?.closed) continue;
    const prefs = input.prefs(activity.user_id);
    if (!prefs.enabled || !prefs.routine || !prefs.execution) continue;
    const offsets = normalizeReminderOffsets(activity.reminder_offsets);
    if (!offsets.length) continue;
    const label = activity.linkedTask?.title ?? activity.title;
    const time = activity.start_time.slice(0, 5);
    const notBefore = localKey(activity.updated_at);
    for (const date of [today, tomorrow]) {
      if (!activityOccursOn(activity, date, weekdayOf(date))) continue;
      if (completed.has(`${activity.id}:${date}`)) continue;
      // Tarefa recorrente vinculada já concluída naquele dia → a rotina também não avisa.
      const linkedOcc = activity.task_id ? occByKey.get(`${activity.task_id}:${date}`) : undefined;
      if (linkedOcc && isClosedStatus(linkedOcc.status)) continue;
      plans.push(...executionPlans({
        userId: activity.user_id, src: "routine", id: activity.id, entity: activity.task_id ? `task:${activity.task_id}` : `act:${activity.id}`,
        label, url: "/rotina", category: "routine", date, time, offsets, digestTime: prefs.digestTime,
      }).map((p) => ({ ...p, type: "routine" as const, ...(notBefore ? { notBefore } : {}) })));
    }
  }
  return plans;
}

/** Avisos que devem sair AGORA (janela [agora - catchUp, agora]), já sem duplicatas. */
export function selectScheduledReminders(input: ScheduleReminderInput): ScheduledReminder[] {
  const catchUp = input.catchUpMinutes ?? 15;
  const now = localDateTimeParts(input.now);
  const earliest = localDateTimeParts(new Date(input.now.getTime() - catchUp * 60_000));
  const nowKey = `${now.date}T${now.time}`;
  const fromKey = `${earliest.date}T${earliest.time}`;
  const due = planReminders(input, now.date).filter((p) =>
    p.fireAt >= fromKey && p.fireAt <= nowKey
    // Aviso antecipado atrasado (cron falhou) não sai depois que o evento já começou.
    && !(p.offset && p.startsAt && nowKey >= p.startsAt)
    // Criado/editado depois do horário do aviso: não manda aviso "atrasado" logo após salvar.
    && !(p.notBefore && p.fireAt < p.notBefore));
  const seen = new Set<string>();
  const out: ScheduledReminder[] = [];
  // Execução da própria tarefa vence a da rotina no mesmo minuto (mensagem mais completa).
  for (const r of [...due].sort((a, b) => Number(a.type === "routine") - Number(b.type === "routine"))) {
    if (seen.has(r.dedupeKey)) continue;
    seen.add(r.dedupeKey);
    out.push(r);
  }
  return out;
}
