import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReminderOccurrence, ReminderPreferences, ReminderTable, ReminderTask } from "@/lib/push/reminders";
import type { ReminderActivityRow, ReminderSubtaskRow, ReminderTaskRow, ScheduleReminderInput } from "@/lib/push/schedule-reminders";
import { resolveNotificationPrefs, type NotificationPrefs } from "@/lib/notification-prefs";
import { expandRecurringSubtaskReminders } from "@/lib/push/recurring-subtask-reminders";
import type { Subtask, SubtaskOccurrence } from "@/lib/task-schedule";

/**
 * Leitura do ESTADO ATUAL dos registros que geram lembretes (usado pela rota
 * do cron e pelo diagnóstico). Concluídas/arquivadas/excluídas ficam de fora
 * na própria consulta — nada é pré-agendado, então editar, remarcar,
 * concluir ou excluir vale na execução seguinte. `userId` limita a um usuário
 * (diagnóstico); sem ele, todos (cron, com service role).
 */

// 42703 = coluna inexistente no Postgres; PGRST204 = coluna fora do cache do PostgREST.
export const isMissingColumn = (code?: string) => code === "42703" || code === "PGRST204";

function shiftDate(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** `select` da tabela, já limitado a um usuário quando `userId` vem (diagnóstico). */
function scoped(db: SupabaseClient, table: string, columns: string, userId?: string) {
  const q = db.from(table).select<string, Record<string, unknown>>(columns);
  return userId ? q.eq("user_id", userId) : q;
}

/** Tarefas pessoais, subtarefas e atividades com lembrete — concluídas ficam de fora. */
export async function loadScheduleSources(db: SupabaseClient, today: string, userId?: string) {
  const from = shiftDate(today, -8);
  const to = shiftDate(today, 1);

  let tasksRes = await scoped(db, "tasks", "*", userId).is("archived_at", null).neq("status", "concluida")
    .or(`recurrence.eq.weekly,and(due_date.gte.${from},due_date.lte.${to}),and(deadline_date.gte.${from},deadline_date.lte.${to})`);
  if (tasksRes.error && isMissingColumn(tasksRes.error.code)) {
    tasksRes = await scoped(db, "tasks", "*", userId).is("archived_at", null).neq("status", "concluida")
      .or(`recurrence.eq.weekly,and(due_date.gte.${from},due_date.lte.${to})`);
  }
  if (tasksRes.error) throw tasksRes.error;
  const tasks = (tasksRes.data ?? []) as ReminderTaskRow[];

  const occRes = await scoped(db, "task_occurrences", "task_id,occurrence_date,status,scheduled_time,title", userId).gte("occurrence_date", today).lte("occurrence_date", to);
  if (occRes.error) throw occRes.error;

  let subRes = await scoped(db, "task_subtasks", "*", userId).eq("is_done", false)
    .or(`and(scheduled_date.gte.${today},scheduled_date.lte.${to}),and(due_date.gte.${from},due_date.lte.${to})`);
  if (subRes.error && isMissingColumn(subRes.error.code)) {
    subRes = await scoped(db, "task_subtasks", "*", userId).eq("is_done", false).gte("due_date", from).lte("due_date", to);
  }
  if (subRes.error) throw subRes.error;
  const rawSubs = (subRes.data ?? []) as Array<ReminderSubtaskRow>;

  // Subtarefas com recorrência própria (migration 20261112100000): uma "linha
  // virtual" por dia de hoje/amanhã com execução ainda não concluída — o resto
  // do agendador trata como uma subtarefa com data. Sem a migration: nada.
  const recRes = await scoped(db, "task_subtasks", "*", userId).eq("recurrence", "weekly").is("archived_at", null);
  if (recRes.error && !isMissingColumn(recRes.error.code)) throw recRes.error;
  const recurringSubs = recRes.error ? [] : ((recRes.data ?? []) as unknown as Subtask[]);
  if (recurringSubs.length) {
    const occ = await db.from("task_subtask_occurrences").select("subtask_id,occurrence_date,status,completed_at").in("subtask_id", recurringSubs.map((s) => s.id)).gte("occurrence_date", today).lte("occurrence_date", to);
    if (occ.error && !["42P01", "PGRST205"].includes(String(occ.error.code))) throw occ.error;
    rawSubs.push(...(expandRecurringSubtaskReminders(recurringSubs, (occ.data ?? []) as SubtaskOccurrence[], [today, to]) as unknown as ReminderSubtaskRow[]));
  }

  // Título e estado da tarefa-pai (subtarefa de tarefa concluída/excluída não notifica).
  const parents = new Map<string, { title: string; closed: boolean }>();
  const PARENT: Record<string, { table: string; closed: (r: Record<string, unknown>) => boolean }> = {
    pessoal: { table: "tasks", closed: (r) => r.status === "concluida" || !!r.archived_at },
    clt: { table: "clt_tasks", closed: (r) => r.status === "concluida" || !!r.archived_at },
    visionario: { table: "work_items", closed: (r) => r.status === "concluido" || r.status === "cancelado" },
  };
  for (const [type, cfg] of Object.entries(PARENT)) {
    const ids = [...new Set(rawSubs.filter((s) => s.parent_type === type).map((s) => s.parent_id))];
    if (!ids.length) continue;
    const res = await db.from(cfg.table).select("*").in("id", ids);
    if (res.error) throw res.error;
    for (const r of (res.data ?? []) as Array<Record<string, unknown>>) parents.set(`${type}:${r.id}`, { title: String(r.title ?? ""), closed: cfg.closed(r) });
  }
  const subtasks: ReminderSubtaskRow[] = rawSubs.map((s) => {
    const parent = parents.get(`${s.parent_type}:${s.parent_id}`);
    return { ...s, parentTitle: parent?.title ?? null, parentClosed: !parent || parent.closed };
  });

  // Rotina: só atividades com lembrete configurado (coluna nova; sem migration = sem lembrete de rotina).
  let activities: ReminderActivityRow[] = [];
  let completions: Array<{ activity_id: string; occurrence_date: string }> = [];
  const actRes = await scoped(db, "activities", "*", userId).eq("is_active", true).not("reminder_offsets", "eq", "{}");
  if (actRes.error && !isMissingColumn(actRes.error.code)) throw actRes.error;
  if (!actRes.error) {
    activities = (actRes.data ?? []) as ReminderActivityRow[];
    const linkedIds = [...new Set(activities.map((a) => a.task_id).filter(Boolean))] as string[];
    if (linkedIds.length) {
      const linked = await db.from("tasks").select("id,title,status,recurrence,archived_at").in("id", linkedIds);
      if (linked.error) throw linked.error;
      const byId = new Map((linked.data ?? []).map((t) => [t.id as string, t]));
      activities = activities.map((a) => {
        const t = a.task_id ? byId.get(a.task_id) : undefined;
        return { ...a, linkedTask: a.task_id ? { title: String(t?.title ?? a.title), closed: !t || !!t.archived_at || (t.recurrence !== "weekly" && t.status === "concluida") } : null };
      });
    }
    if (activities.length) {
      const comp = await db.from("activity_completions").select("activity_id,occurrence_date").in("activity_id", activities.map((a) => a.id)).gte("occurrence_date", today).lte("occurrence_date", to);
      if (comp.error) throw comp.error;
      completions = comp.data ?? [];
    }
  }

  const occurrences = (occRes.data ?? []) as unknown as NonNullable<ScheduleReminderInput["occurrences"]>;
  return { tasks, occurrences, subtasks, activities, completions };
}

/** Tabelas no fluxo antigo (só "no horário"). `tasks` passou para o motor novo. */
export const LEGACY_TABLES: ReminderTable[] = ["personal_work_tasks", "clt_tasks"];
const OCCURRENCE_TABLES: Partial<Record<ReminderTable, string>> = { tasks: "task_occurrences", clt_tasks: "clt_task_occurrences" };

/** Trabalho pessoal e CLT/MKT (lembrete no horário). */
export async function loadLegacyCandidates(db: SupabaseClient, date: string, userId?: string) {
  const tasks: Array<ReminderTask & { table: ReminderTable }> = [];
  const occurrences: Array<ReminderOccurrence & { table: ReminderTable }> = [];
  for (const table of LEGACY_TABLES) {
    const single = await scoped(db, table, "*", userId).eq("due_date", date).not("scheduled_time", "is", null);
    if (single.error) throw single.error;
    for (const row of single.data ?? []) tasks.push({ ...(row as ReminderTask), table });

    const weekly = await scoped(db, table, "*", userId).eq("recurrence", "weekly").not("scheduled_time", "is", null).is("archived_at", null);
    // personal_work_tasks não tem recorrência — coluna ausente não é erro aqui.
    if (weekly.error && !isMissingColumn(weekly.error.code)) throw weekly.error;
    for (const row of weekly.data ?? []) tasks.push({ ...(row as ReminderTask), table });

    const occurrenceTable = OCCURRENCE_TABLES[table];
    if (occurrenceTable) {
      const occ = await scoped(db, occurrenceTable, "*", userId).eq("occurrence_date", date);
      if (occ.error) throw occ.error;
      for (const row of occ.data ?? []) occurrences.push({ ...(row as ReminderOccurrence), table });
    }
  }
  return { tasks, occurrences };
}

/** Preferências de cada usuário (interruptor geral também desliga o fluxo antigo). */
export async function loadPreferences(db: SupabaseClient, userIds: string[]) {
  const legacy = new Map<string, ReminderPreferences>();
  const resolved = new Map<string, NotificationPrefs>();
  if (!userIds.length) return { legacy, resolved };
  const { data, error } = await db.from("profiles").select("id,notification_preferences").in("id", userIds);
  if (error) throw error;
  for (const p of data ?? []) {
    const prefs = resolveNotificationPrefs(p.notification_preferences);
    resolved.set(p.id as string, prefs);
    legacy.set(p.id as string, prefs.enabled ? (p.notification_preferences as ReminderPreferences) : { tasks: false, clt: false });
  }
  return { legacy, resolved };
}
