"use server";

import { revalidatePath } from "next/cache";
import { requirePersonalSpace } from "@/lib/supabase/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { todayKeySaoPaulo } from "@/lib/format";
import { addDaysToKey, isRecurringTask, pastRecurringDates, recurringTaskOccursOn } from "@/lib/tasks";
import {
  ACTIVITY_LINK_COLUMNS,
  isMissingColumnError,
  MISSING_SCHEDULE_WARNING,
  normalizeReminderOffsets,
  stripScheduleColumns,
  TASK_SCHEDULE_COLUMNS,
} from "@/lib/task-schedule";
import type {
  Database,
  GoalStatus,
  PersonalWorkTaskPriority,
  PersonalWorkTaskStatus,
  Task,
  TaskKind,
  TaskPriority,
  TaskRecurrence,
  TaskStatus,
} from "@/types/database.types";

type TaskUpdate = Database["public"]["Tables"]["tasks"]["Update"];

type ActionState = { error?: string; success?: string; id?: string; warning?: string };

/**
 * Tudo aqui é do space Pessoal do usuário autenticado — `requirePersonalSpace()`
 * resolve o space certo (sempre existe, criado no cadastro) e RLS
 * (`user_id = auth.uid()`) é a proteção real; nunca recebe `space_id`/
 * `user_id` do client.
 */

// -----------------------------------------------------------------------------
// Tarefas (com prazo / do dia / recorrentes — regra de dia em lib/tasks.ts)
// -----------------------------------------------------------------------------

export type TaskFormInput = {
  kind: TaskKind;
  title: string;
  description?: string;
  /** kind 'dia': dia da EXECUÇÃO (sem repetição). kind 'prazo': o PRAZO final (legado). */
  date?: string;
  /** kind 'dia': horário da execução. kind 'prazo': horário limite (legado). */
  time?: string;
  /** Prazo final independente da execução (kind 'dia'). Em kind 'prazo', se vier, prevalece sobre `date`. */
  deadlineDate?: string;
  deadlineTime?: string;
  /** Lembretes antes da execução (min): 0, 15, 30, 60, 1440. */
  reminderOffsets?: number[];
  location?: string;
  priority: TaskPriority;
  recurrence: TaskRecurrence;
  weekdays: number[];
  notes?: string;
};

type SupabaseServer = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const TIME_KEY = /^\d{2}:\d{2}(:\d{2})?$/;

function revalidateTaskPaths() {
  revalidatePath("/tarefas");
  revalidatePath("/hoje");
  revalidatePath("/");
  revalidatePath("/historico");
}

/** Valida e converte o formulário nas colunas de `tasks` (sem space/user/início da recorrência). */
function normalizeTaskInput(input: TaskFormInput): { error: string } | { values: TaskUpdate } {
  const title = input.title.trim();
  if (!title) return { error: "Título é obrigatório." };
  if (input.kind !== "prazo" && input.kind !== "dia") return { error: "Tipo de tarefa inválido." };
  if (input.priority !== "normal" && input.priority !== "importante") return { error: "Prioridade inválida." };
  if (input.date && !DATE_KEY.test(input.date)) return { error: "Data inválida." };
  if (input.deadlineDate && !DATE_KEY.test(input.deadlineDate)) return { error: "Prazo final inválido." };
  if ((input.time && !TIME_KEY.test(input.time)) || (input.deadlineTime && !TIME_KEY.test(input.deadlineTime))) return { error: "Horário inválido." };

  const recurring = input.kind === "dia" && input.recurrence === "weekly";
  const weekdays = recurring
    ? [...new Set(input.weekdays)].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort((a, b) => a - b)
    : [];
  if (recurring && weekdays.length === 0) return { error: "Escolha pelo menos um dia da semana." };
  if (input.kind === "dia" && !recurring && !input.date) return { error: "Escolha a data da tarefa." };

  // Execução x prazo final (lib/task-schedule.ts). Em kind 'prazo' o prazo
  // continua em due_date (+ scheduled_time como horário limite, para
  // registros/telas antigos); em kind 'dia' vai para deadline_*.
  const isDeadlineKind = input.kind === "prazo";
  const deadlineDate = recurring ? null : (isDeadlineKind ? input.deadlineDate || input.date : input.deadlineDate) || null;
  const deadlineTime = deadlineDate ? (isDeadlineKind ? input.deadlineTime || input.time : input.deadlineTime) || null : null;
  if (!isDeadlineKind && !recurring && deadlineDate && input.date && deadlineDate < input.date) {
    return { error: "O prazo final não pode ser antes do dia de execução." };
  }

  return {
    values: {
      kind: input.kind,
      title,
      description: input.description?.trim() || null,
      due_date: recurring ? null : isDeadlineKind ? deadlineDate : input.date || null,
      scheduled_time: isDeadlineKind ? deadlineTime : input.time || null,
      deadline_date: isDeadlineKind ? null : deadlineDate,
      deadline_time: deadlineTime,
      reminder_offsets: isDeadlineKind ? [] : normalizeReminderOffsets(input.reminderOffsets),
      location: input.kind === "dia" ? input.location?.trim() || null : null,
      priority: input.priority,
      recurrence: recurring ? "weekly" : "none",
      weekdays,
      notes: input.notes?.trim() || null,
    },
  };
}

async function getOwnTask(supabase: SupabaseServer, taskId: string, userId: string): Promise<Task | null> {
  const { data, error } = await supabase.from("tasks").select("*").eq("id", taskId).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

/** Último dia com ocorrência ao encerrar hoje (ontem, ou antes se já estava encerrada) + início ajustado pra respeitar o check do banco. */
function endBoundary(task: Task, todayKey: string): { until: string; start: string | null } {
  const yesterday = addDaysToKey(todayKey, -1);
  const until = task.recurrence_until && task.recurrence_until < yesterday ? task.recurrence_until : yesterday;
  const start = task.recurrence_start && task.recurrence_start > until ? addDaysToKey(until, 1) : task.recurrence_start;
  return { until, start };
}

/**
 * Antes de mudar uma recorrência, grava os dias passados que ainda não têm
 * linha em `task_occurrences` como 'pendente', com o snapshot da definição
 * ANTIGA. Assim a edição vale só daqui pra frente: o histórico (concluídas
 * e as que ficaram pendentes) não é reescrito. `ignoreDuplicates` mantém
 * intactas as ocorrências já gravadas (inclusive as concluídas).
 */
async function freezePastOccurrences(supabase: SupabaseServer, task: Task, todayKey: string): Promise<string | null> {
  const dates = pastRecurringDates(task, todayKey);
  if (dates.length === 0) return null;
  const { error } = await supabase.from("task_occurrences").upsert(
    dates.map((occurrence_date) => ({
      task_id: task.id,
      space_id: task.space_id,
      user_id: task.user_id,
      occurrence_date,
      status: "pendente" as const,
      title: task.title,
      scheduled_time: task.scheduled_time,
      location: task.location,
      priority: task.priority,
    })),
    { onConflict: "task_id,occurrence_date", ignoreDuplicates: true }
  );
  return error?.message ?? null;
}

export async function createTaskAction(input: TaskFormInput): Promise<ActionState> {
  const { profile, space } = await requirePersonalSpace();
  const normalized = normalizeTaskInput(input);
  if ("error" in normalized) return { error: normalized.error };
  const { values } = normalized;

  const supabase = await createSupabaseServerClient();
  const row = {
    ...values,
    title: values.title ?? input.title.trim(),
    space_id: space.id,
    user_id: profile.id,
    recurrence_start: values.recurrence === "weekly" ? todayKeySaoPaulo() : null,
  };
  let warning: string | undefined;
  let { data, error } = await supabase.from("tasks").insert(row).select("id").single();
  // Banco sem a migration de agenda: grava o resto e avisa (nada se perde em silêncio).
  if (error && isMissingColumnError(error)) {
    const stripped = stripScheduleColumns(row, TASK_SCHEDULE_COLUMNS);
    ({ data, error } = await supabase.from("tasks").insert(stripped.values as typeof row).select("id").single());
    if (stripped.lost) warning = MISSING_SCHEDULE_WARNING;
  }

  if (error || !data) return { error: error?.message ?? "Erro ao criar tarefa." };
  revalidateTaskPaths();
  return { success: "Tarefa criada.", id: data.id, warning };
}

export async function updateTaskAction(taskId: string, input: TaskFormInput): Promise<ActionState> {
  const { profile } = await requirePersonalSpace();
  const normalized = normalizeTaskInput(input);
  if ("error" in normalized) return { error: normalized.error };
  const update: TaskUpdate = { ...normalized.values };

  const supabase = await createSupabaseServerClient();
  const existing = await getOwnTask(supabase, taskId, profile.id);
  if (!existing || existing.archived_at) return { error: "Tarefa não encontrada." };

  const todayKey = todayKeySaoPaulo();

  if (isRecurringTask(existing)) {
    if (update.recurrence !== "weekly") {
      return { error: "Tarefa recorrente não deixa de repetir pela edição. Use “Encerrar repetição”." };
    }
    const freezeError = await freezePastOccurrences(supabase, existing, todayKey);
    if (freezeError) return { error: freezeError };
    // Nova definição vale a partir de hoje; o passado já foi congelado acima.
    const start = existing.recurrence_start && existing.recurrence_start > todayKey ? existing.recurrence_start : todayKey;
    update.recurrence_start = start;
    if (existing.recurrence_until && existing.recurrence_until < start) {
      update.recurrence_until = addDaysToKey(start, -1);
    }
  } else if (update.recurrence === "weekly") {
    // Virou recorrente: estado passa a ser por dia, a partir de hoje.
    update.recurrence_start = todayKey;
    update.recurrence_until = null;
    update.status = "pendente";
    update.completed_at = null;
  }

  let warning: string | undefined;
  let { error } = await supabase.from("tasks").update(update).eq("id", taskId).eq("user_id", profile.id);
  if (error && isMissingColumnError(error)) {
    const stripped = stripScheduleColumns(update, TASK_SCHEDULE_COLUMNS);
    ({ error } = await supabase.from("tasks").update(stripped.values).eq("id", taskId).eq("user_id", profile.id));
    if (stripped.lost) warning = MISSING_SCHEDULE_WARNING;
  }
  if (error) return { error: error.message };
  revalidateTaskPaths();
  return { success: "Tarefa atualizada.", warning };
}

/** Conclui/reabre uma tarefa NÃO recorrente (com prazo ou do dia). */
export async function toggleTaskStatusAction(taskId: string, status: TaskStatus): Promise<ActionState> {
  const { profile } = await requirePersonalSpace();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tasks")
    .update({ status, completed_at: status === "concluida" ? new Date().toISOString() : null })
    .eq("id", taskId)
    .eq("user_id", profile.id)
    .eq("recurrence", "none")
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Tarefa não encontrada." };
  revalidateTaskPaths();
  return { success: "Status atualizado." };
}

/**
 * Conclui/reabre UM dia de uma tarefa recorrente — nunca os outros dias,
 * nunca a recorrência inteira. `unique(task_id, occurrence_date)` impede
 * duplicar. Se o dia já tinha linha (snapshot congelado), só o status
 * muda; o snapshot daquele dia é preservado.
 */
export async function toggleTaskOccurrenceAction(taskId: string, occurrenceDate: string, done: boolean): Promise<ActionState> {
  const { profile } = await requirePersonalSpace();
  if (!DATE_KEY.test(occurrenceDate)) return { error: "Data inválida." };
  const todayKey = todayKeySaoPaulo();
  if (occurrenceDate > todayKey) return { error: "Não é possível concluir um dia que ainda não chegou." };

  const supabase = await createSupabaseServerClient();
  const task = await getOwnTask(supabase, taskId, profile.id);
  if (!task || !isRecurringTask(task)) return { error: "Tarefa recorrente não encontrada." };

  const { data: existing, error: existingError } = await supabase
    .from("task_occurrences")
    .select("id")
    .eq("task_id", taskId)
    .eq("occurrence_date", occurrenceDate)
    .maybeSingle();
  if (existingError) return { error: existingError.message };
  if (!existing && !recurringTaskOccursOn(task, occurrenceDate)) return { error: "Esta tarefa não acontece nesse dia." };

  if (!existing) {
    const { error } = await supabase.from("task_occurrences").upsert(
      {
        task_id: task.id,
        space_id: task.space_id,
        user_id: profile.id,
        occurrence_date: occurrenceDate,
        title: task.title,
        scheduled_time: task.scheduled_time,
        location: task.location,
        priority: task.priority,
      },
      { onConflict: "task_id,occurrence_date", ignoreDuplicates: true }
    );
    if (error) return { error: error.message };
  }

  const { error } = await supabase
    .from("task_occurrences")
    .update({ status: done ? "concluida" : "pendente", completed_at: done ? new Date().toISOString() : null })
    .eq("task_id", taskId)
    .eq("occurrence_date", occurrenceDate)
    .eq("user_id", profile.id);
  if (error) return { error: error.message };

  revalidateTaskPaths();
  return { success: done ? "Concluída." : "Reaberta." };
}

/** Para de gerar novas ocorrências a partir de hoje. Histórico (inclusive o de hoje, se já concluído) fica. */
export async function endTaskRecurrenceAction(taskId: string): Promise<ActionState> {
  const { profile } = await requirePersonalSpace();
  const supabase = await createSupabaseServerClient();
  const task = await getOwnTask(supabase, taskId, profile.id);
  if (!task || !isRecurringTask(task)) return { error: "Tarefa recorrente não encontrada." };

  const { until, start } = endBoundary(task, todayKeySaoPaulo());
  const { error } = await supabase
    .from("tasks")
    .update({ recurrence_until: until, recurrence_start: start })
    .eq("id", taskId)
    .eq("user_id", profile.id);
  if (error) return { error: error.message };
  revalidateTaskPaths();
  return { success: "Repetição encerrada. O histórico foi mantido." };
}

/**
 * Muda só o PRAZO FINAL (nunca a execução): kind 'prazo' → due_date;
 * kind 'dia' → deadline_date.
 */
export async function moveTaskDeadlineAction(taskId: string, deadlineDate: string): Promise<ActionState> {
  const { profile } = await requirePersonalSpace();
  if (!DATE_KEY.test(deadlineDate)) return { error: "Data inválida." };
  const supabase = await createSupabaseServerClient();
  const task = await getOwnTask(supabase, taskId, profile.id);
  if (!task || task.archived_at) return { error: "Tarefa não encontrada." };
  if (task.kind === "dia" && task.due_date && deadlineDate < task.due_date) {
    return { error: "O prazo final não pode ser antes do dia de execução." };
  }
  const update: TaskUpdate = task.kind === "prazo" ? { due_date: deadlineDate } : { deadline_date: deadlineDate };
  const { error } = await supabase.from("tasks").update(update).eq("id", taskId).eq("user_id", profile.id);
  if (error) return { error: isMissingColumnError(error) ? MISSING_SCHEDULE_WARNING : error.message };
  revalidateTaskPaths();
  return { success: "Prazo alterado." };
}

/** Reagenda a EXECUÇÃO (kind 'dia') ou o prazo legado (kind 'prazo'). Nunca mexe em deadline_date. */
export async function moveTaskDateAction(taskId: string, dueDate: string): Promise<ActionState> {
  const { profile } = await requirePersonalSpace();
  if (!DATE_KEY.test(dueDate)) return { error: "Data inválida." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("tasks")
    .update({ due_date: dueDate })
    .eq("id", taskId)
    .eq("user_id", profile.id)
    .eq("recurrence", "none");
  if (error) return { error: error.message };
  revalidateTaskPaths();
  return { success: "Data alterada." };
}

/**
 * Não recorrente: exclui de vez (comportamento de sempre). Recorrente que
 * já tem passado (dias anteriores ou ocorrências gravadas): arquiva — some
 * das listas e para de gerar ocorrências, mas o histórico fica.
 */
export async function deleteTaskAction(taskId: string): Promise<ActionState> {
  const { profile } = await requirePersonalSpace();
  const supabase = await createSupabaseServerClient();
  const task = await getOwnTask(supabase, taskId, profile.id);
  if (!task) return { error: "Tarefa não encontrada." };

  if (isRecurringTask(task)) {
    const todayKey = todayKeySaoPaulo();
    const { count, error: countError } = await supabase
      .from("task_occurrences")
      .select("id", { count: "exact", head: true })
      .eq("task_id", taskId);
    if (countError) return { error: countError.message };

    const hasHistory = (count ?? 0) > 0 || (!!task.recurrence_start && task.recurrence_start < todayKey);
    if (hasHistory) {
      const { until, start } = endBoundary(task, todayKey);
      const { error } = await supabase
        .from("tasks")
        .update({ archived_at: new Date().toISOString(), recurrence_until: until, recurrence_start: start })
        .eq("id", taskId)
        .eq("user_id", profile.id);
      if (error) return { error: error.message };
      revalidateTaskPaths();
      return { success: "Tarefa removida. O histórico dos dias anteriores foi mantido." };
    }
  }

  const { error } = await supabase.from("tasks").delete().eq("id", taskId).eq("user_id", profile.id);
  if (error) return { error: error.message };
  revalidateTaskPaths();
  return { success: "Tarefa excluída." };
}

// -----------------------------------------------------------------------------
// Rotina (activities + activity_completions)
// -----------------------------------------------------------------------------

export type ActivityFormInput = {
  title: string;
  category?: string;
  /** Repetição semanal (0=domingo..6=sábado). Ignorado quando `specificDate` vem preenchido. */
  weekdays: number[];
  startTime: string;
  endTime?: string;
  notes?: string;
  /** Vincula uma tarefa existente (nunca cria cópia). */
  taskId?: string | null;
  /** Ocorrência única nesse dia. */
  specificDate?: string | null;
  reminderOffsets?: number[];
};

type ActivityValues = {
  title: string;
  category: string | null;
  weekdays: number[];
  start_time: string;
  end_time: string | null;
  notes: string | null;
  task_id: string | null;
  specific_date: string | null;
  reminder_offsets: number[];
};

const LINK_NEEDS_MIGRATION =
  "Para vincular tarefas ou criar ocorrência única, o banco precisa da atualização de agenda (migration 20261102100000).";

/**
 * Valida o formulário e, se for vínculo, confere que a tarefa é do próprio
 * usuário e que ela ainda não está na rotina no mesmo dia (evita duplicar
 * a mesma tarefa na mesma tela). O título da atividade vinculada é só um
 * rótulo de reserva — a tela sempre mostra o título atual da tarefa.
 */
async function normalizeActivityInput(
  supabase: SupabaseServer,
  userId: string,
  input: ActivityFormInput,
  activityId?: string
): Promise<{ error: string } | { values: ActivityValues }> {
  if (input.specificDate && !DATE_KEY.test(input.specificDate)) return { error: "Data inválida." };
  if (!input.startTime || !TIME_KEY.test(input.startTime)) return { error: "Horário inválido." };
  if (input.endTime && !TIME_KEY.test(input.endTime)) return { error: "Horário de fim inválido." };
  const weekdays = input.specificDate
    ? []
    : [...new Set(input.weekdays)].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort((a, b) => a - b);
  if (!input.specificDate && weekdays.length === 0) return { error: "Escolha pelo menos um dia da semana ou uma data." };

  let title = input.title.trim();
  if (input.taskId) {
    const task = await getOwnTask(supabase, input.taskId, userId);
    if (!task || task.archived_at) return { error: "Tarefa não encontrada." };
    title = task.title;

    const { data: links, error } = await supabase.from("activities").select("id,weekdays,specific_date").eq("user_id", userId).eq("task_id", input.taskId);
    if (error) return { error: isMissingColumnError(error) ? LINK_NEEDS_MIGRATION : error.message };
    const clash = (links ?? []).some((l) => {
      if (l.id === activityId) return false;
      const other = l as { weekdays: number[]; specific_date: string | null };
      if (input.specificDate && other.specific_date) return input.specificDate === other.specific_date;
      if (input.specificDate) return other.weekdays.includes(new Date(`${input.specificDate}T12:00:00Z`).getUTCDay());
      if (other.specific_date) return weekdays.includes(new Date(`${other.specific_date}T12:00:00Z`).getUTCDay());
      return other.weekdays.some((d) => weekdays.includes(d));
    });
    if (clash) return { error: "Essa tarefa já está na rotina em um desses dias. Edite o vínculo existente." };
  }
  if (!title) return { error: "Título é obrigatório." };

  return {
    values: {
      title,
      category: input.category?.trim() || null,
      weekdays,
      start_time: input.startTime,
      end_time: input.endTime || null,
      notes: input.notes?.trim() || null,
      task_id: input.taskId || null,
      specific_date: input.specificDate || null,
      reminder_offsets: normalizeReminderOffsets(input.reminderOffsets),
    },
  };
}

/** Grava a atividade; antes da migration, atividades simples continuam funcionando (vínculo/data única exigem a migration). */
async function writeActivity(
  write: (values: Partial<ActivityValues>) => PromiseLike<{ error: { code?: string; message: string } | null; data?: unknown }>,
  values: ActivityValues
): Promise<{ error?: string; warning?: string; data?: unknown }> {
  const first = await write(values);
  if (!first.error) return { data: first.data };
  if (!isMissingColumnError(first.error)) return { error: first.error.message };
  if (values.task_id || values.specific_date) return { error: LINK_NEEDS_MIGRATION };
  const stripped = stripScheduleColumns(values, ACTIVITY_LINK_COLUMNS);
  const second = await write(stripped.values);
  if (second.error) return { error: second.error.message };
  return { data: second.data, warning: stripped.lost ? MISSING_SCHEDULE_WARNING : undefined };
}

function revalidateRoutinePaths() {
  revalidatePath("/rotina");
  revalidatePath("/hoje");
  revalidatePath("/");
}

export async function createActivityAction(input: ActivityFormInput): Promise<ActionState> {
  const { profile, space } = await requirePersonalSpace();
  const supabase = await createSupabaseServerClient();
  const normalized = await normalizeActivityInput(supabase, profile.id, input);
  if ("error" in normalized) return { error: normalized.error };

  const result = await writeActivity(
    (values) => supabase.from("activities").insert({ ...values, title: values.title ?? normalized.values.title, space_id: space.id, user_id: profile.id } as never).select("id").single(),
    normalized.values
  );
  if (result.error) return { error: result.error };
  revalidateRoutinePaths();
  return { success: input.taskId ? "Tarefa vinculada à rotina." : "Atividade criada.", id: (result.data as { id: string } | undefined)?.id, warning: result.warning };
}

export async function updateActivityAction(activityId: string, input: ActivityFormInput): Promise<ActionState> {
  const { profile } = await requirePersonalSpace();
  const supabase = await createSupabaseServerClient();
  const normalized = await normalizeActivityInput(supabase, profile.id, input, activityId);
  if ("error" in normalized) return { error: normalized.error };

  const result = await writeActivity(
    (values) => supabase.from("activities").update(values as never).eq("id", activityId).eq("user_id", profile.id),
    normalized.values
  );
  if (result.error) return { error: result.error };
  revalidateRoutinePaths();
  return { success: "Atividade atualizada.", warning: result.warning };
}

export async function toggleActivityActiveAction(activityId: string, isActive: boolean): Promise<ActionState> {
  const { profile } = await requirePersonalSpace();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("activities").update({ is_active: isActive }).eq("id", activityId).eq("user_id", profile.id);
  if (error) return { error: error.message };
  revalidatePath("/rotina");
  revalidatePath("/hoje");
  return { success: "Atualizado." };
}

export async function deleteActivityAction(activityId: string): Promise<ActionState> {
  const { profile } = await requirePersonalSpace();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("activities").delete().eq("id", activityId).eq("user_id", profile.id);
  if (error) return { error: error.message };
  revalidatePath("/rotina");
  revalidatePath("/hoje");
  return { success: "Atividade excluída." };
}

/**
 * Marca/desmarca UMA ocorrência (activity_id + data) — nunca a atividade
 * inteira. `unique(activity_id, occurrence_date)` na migration garante
 * que não duplica ao marcar duas vezes.
 */
export async function toggleActivityCompletionAction(activityId: string, occurrenceDate: string, completed: boolean): Promise<ActionState> {
  const { profile } = await requirePersonalSpace();
  const supabase = await createSupabaseServerClient();

  if (completed) {
    const { error } = await supabase
      .from("activity_completions")
      .upsert({ activity_id: activityId, user_id: profile.id, occurrence_date: occurrenceDate }, { onConflict: "activity_id,occurrence_date", ignoreDuplicates: true });
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("activity_completions")
      .delete()
      .eq("activity_id", activityId)
      .eq("user_id", profile.id)
      .eq("occurrence_date", occurrenceDate);
    if (error) return { error: error.message };
  }

  revalidatePath("/rotina");
  revalidatePath("/hoje");
  revalidatePath("/historico");
  return { success: "Ok." };
}

// -----------------------------------------------------------------------------
// Trabalho / CLT pessoal
// -----------------------------------------------------------------------------

export type PersonalWorkTaskFormInput = {
  title: string;
  description?: string;
  dueDate?: string;
  scheduledTime?: string;
  priority: PersonalWorkTaskPriority;
  notes?: string;
};

export async function createPersonalWorkTaskAction(input: PersonalWorkTaskFormInput): Promise<ActionState> {
  const { profile, space } = await requirePersonalSpace();
  if (!input.title.trim()) return { error: "Título é obrigatório." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("personal_work_tasks")
    .insert({
      space_id: space.id,
      user_id: profile.id,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      due_date: input.dueDate || null,
      scheduled_time: input.scheduledTime || null,
      priority: input.priority,
      notes: input.notes?.trim() || null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  revalidatePath("/trabalho");
  revalidatePath("/hoje");
  return { success: "Tarefa criada.", id: data.id };
}

export async function updatePersonalWorkTaskAction(taskId: string, input: PersonalWorkTaskFormInput): Promise<ActionState> {
  const { profile } = await requirePersonalSpace();
  if (!input.title.trim()) return { error: "Título é obrigatório." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("personal_work_tasks")
    .update({
      title: input.title.trim(),
      description: input.description?.trim() || null,
      due_date: input.dueDate || null,
      scheduled_time: input.scheduledTime || null,
      priority: input.priority,
      notes: input.notes?.trim() || null,
    })
    .eq("id", taskId)
    .eq("user_id", profile.id);

  if (error) return { error: error.message };
  revalidatePath("/trabalho");
  revalidatePath("/hoje");
  return { success: "Tarefa atualizada." };
}

export async function togglePersonalWorkTaskStatusAction(taskId: string, status: PersonalWorkTaskStatus): Promise<ActionState> {
  const { profile } = await requirePersonalSpace();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("personal_work_tasks")
    .update({ status, completed_at: status === "concluida" ? new Date().toISOString() : null })
    .eq("id", taskId)
    .eq("user_id", profile.id);

  if (error) return { error: error.message };
  revalidatePath("/trabalho");
  revalidatePath("/hoje");
  return { success: "Status atualizado." };
}

export async function moveWorkTaskDateAction(taskId: string, dueDate: string): Promise<ActionState> {
  const { profile } = await requirePersonalSpace();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("personal_work_tasks").update({ due_date: dueDate }).eq("id", taskId).eq("user_id", profile.id);
  if (error) return { error: error.message };
  revalidatePath("/trabalho");
  revalidatePath("/hoje");
  return { success: "Data alterada." };
}

export async function deletePersonalWorkTaskAction(taskId: string): Promise<ActionState> {
  const { profile } = await requirePersonalSpace();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("personal_work_tasks").delete().eq("id", taskId).eq("user_id", profile.id);
  if (error) return { error: error.message };
  revalidatePath("/trabalho");
  revalidatePath("/hoje");
  return { success: "Tarefa excluída." };
}

// -----------------------------------------------------------------------------
// Metas
// -----------------------------------------------------------------------------

export type GoalFormInput = {
  title: string;
  description?: string;
  category?: string;
  targetValue?: number;
  currentValue?: number;
  targetDate?: string;
  notes?: string;
};

export async function createGoalAction(input: GoalFormInput): Promise<ActionState> {
  const { profile, space } = await requirePersonalSpace();
  if (!input.title.trim()) return { error: "Título é obrigatório." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("goals")
    .insert({
      space_id: space.id,
      user_id: profile.id,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      category: input.category?.trim() || null,
      target_value: input.targetValue ?? null,
      current_value: input.currentValue ?? 0,
      target_date: input.targetDate || null,
      notes: input.notes?.trim() || null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  revalidatePath("/metas");
  return { success: "Meta criada.", id: data.id };
}

export async function updateGoalAction(goalId: string, input: GoalFormInput): Promise<ActionState> {
  const { profile } = await requirePersonalSpace();
  if (!input.title.trim()) return { error: "Título é obrigatório." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("goals")
    .update({
      title: input.title.trim(),
      description: input.description?.trim() || null,
      category: input.category?.trim() || null,
      target_value: input.targetValue ?? null,
      current_value: input.currentValue ?? 0,
      target_date: input.targetDate || null,
      notes: input.notes?.trim() || null,
    })
    .eq("id", goalId)
    .eq("user_id", profile.id);

  if (error) return { error: error.message };
  revalidatePath("/metas");
  return { success: "Meta atualizada." };
}

export async function updateGoalStatusAction(goalId: string, status: GoalStatus): Promise<ActionState> {
  const { profile } = await requirePersonalSpace();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("goals").update({ status }).eq("id", goalId).eq("user_id", profile.id);
  if (error) return { error: error.message };
  revalidatePath("/metas");
  revalidatePath("/historico");
  return { success: "Status atualizado." };
}

/**
 * Ajusta `current_value` (+delta ou -delta) lendo o valor atual antes de
 * gravar — evita corrida entre duas abas abertas. Marca `concluida`
 * automaticamente quando atinge `target_value` (se houver), e desfaz
 * (`em_andamento`) se cair abaixo de novo.
 */
export async function adjustGoalValueAction(goalId: string, delta: number): Promise<ActionState> {
  const { profile } = await requirePersonalSpace();
  const supabase = await createSupabaseServerClient();

  const { data: goal, error: fetchError } = await supabase
    .from("goals")
    .select("current_value, target_value, status")
    .eq("id", goalId)
    .eq("user_id", profile.id)
    .maybeSingle();
  if (fetchError) return { error: fetchError.message };
  if (!goal) return { error: "Meta não encontrada." };

  const nextValue = Math.max(0, goal.current_value + delta);
  const reachedTarget = goal.target_value !== null && nextValue >= goal.target_value;
  const nextStatus: GoalStatus = goal.status === "cancelada" ? "cancelada" : reachedTarget ? "concluida" : "em_andamento";

  const { error } = await supabase
    .from("goals")
    .update({ current_value: nextValue, status: nextStatus })
    .eq("id", goalId)
    .eq("user_id", profile.id);

  if (error) return { error: error.message };
  revalidatePath("/metas");
  return { success: delta >= 0 ? "Valor adicionado." : "Valor removido." };
}

export async function deleteGoalAction(goalId: string): Promise<ActionState> {
  const { profile } = await requirePersonalSpace();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("goals").delete().eq("id", goalId).eq("user_id", profile.id);
  if (error) return { error: error.message };
  revalidatePath("/metas");
  return { success: "Meta excluída." };
}

/**
 * Reprogramar a EXECUÇÃO pelo Meu Dia. Nunca altera o prazo final:
 *  - kind 'dia' (não recorrente): muda só `due_date` (execução);
 *  - kind 'prazo' (só prazo): passa a ter execução nesse dia e o prazo
 *    original vai para `deadline_date` (precisa da migration de agenda).
 * Se o prazo já venceu, continua aparecendo como "Prazo vencido".
 */
export async function rescheduleTaskExecutionAction(taskId: string, date: string): Promise<ActionState> {
  const { profile } = await requirePersonalSpace();
  if (!DATE_KEY.test(date)) return { error: "Data inválida." };
  const supabase = await createSupabaseServerClient();
  const task = await getOwnTask(supabase, taskId, profile.id);
  if (!task || task.archived_at) return { error: "Tarefa não encontrada." };
  if (isRecurringTask(task)) return { error: "Tarefa que se repete: edite a repetição na página Tarefas." };
  const update: TaskUpdate = task.kind === "prazo" ? { kind: "dia", due_date: date, deadline_date: task.due_date } : { due_date: date };
  const { error } = await supabase.from("tasks").update(update).eq("id", taskId).eq("user_id", profile.id);
  if (error) {
    if (isMissingColumnError(error)) return { error: "Para dar uma data de execução a uma tarefa só com prazo, aplique a migração 20261102100000 no Supabase (o prazo não pode se perder)." };
    return { error: error.message };
  }
  revalidateTaskPaths();
  return { success: "Execução reprogramada. O prazo final não mudou." };
}
