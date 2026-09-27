"use server";

import { revalidatePath } from "next/cache";
import { requirePersonalSpace } from "@/lib/supabase/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { todayKeySaoPaulo } from "@/lib/format";
import { addDaysToKey, isRecurringTask, pastRecurringDates, recurringTaskOccursOn } from "@/lib/tasks";
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

type ActionState = { error?: string; success?: string; id?: string };

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
  /** Prazo (kind 'prazo') ou dia da tarefa (kind 'dia' sem repetição). */
  date?: string;
  time?: string;
  location?: string;
  priority: TaskPriority;
  recurrence: TaskRecurrence;
  weekdays: number[];
  notes?: string;
};

type SupabaseServer = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

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

  const recurring = input.kind === "dia" && input.recurrence === "weekly";
  const weekdays = recurring
    ? [...new Set(input.weekdays)].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort((a, b) => a - b)
    : [];
  if (recurring && weekdays.length === 0) return { error: "Escolha pelo menos um dia da semana." };
  if (input.kind === "dia" && !recurring && !input.date) return { error: "Escolha a data da tarefa." };

  return {
    values: {
      kind: input.kind,
      title,
      description: input.description?.trim() || null,
      due_date: recurring ? null : input.date || null,
      scheduled_time: input.time || null,
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
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      ...values,
      title: values.title ?? input.title.trim(),
      space_id: space.id,
      user_id: profile.id,
      recurrence_start: values.recurrence === "weekly" ? todayKeySaoPaulo() : null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  revalidateTaskPaths();
  return { success: "Tarefa criada.", id: data.id };
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

  const { error } = await supabase.from("tasks").update(update).eq("id", taskId).eq("user_id", profile.id);
  if (error) return { error: error.message };
  revalidateTaskPaths();
  return { success: "Tarefa atualizada." };
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
  weekdays: number[];
  startTime: string;
  endTime?: string;
  notes?: string;
};

export async function createActivityAction(input: ActivityFormInput): Promise<ActionState> {
  const { profile, space } = await requirePersonalSpace();
  if (!input.title.trim()) return { error: "Título é obrigatório." };
  if (input.weekdays.length === 0) return { error: "Escolha pelo menos um dia da semana." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("activities")
    .insert({
      space_id: space.id,
      user_id: profile.id,
      title: input.title.trim(),
      category: input.category?.trim() || null,
      weekdays: input.weekdays,
      start_time: input.startTime,
      end_time: input.endTime || null,
      notes: input.notes?.trim() || null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  revalidatePath("/rotina");
  revalidatePath("/hoje");
  return { success: "Atividade criada.", id: data.id };
}

export async function updateActivityAction(activityId: string, input: ActivityFormInput): Promise<ActionState> {
  const { profile } = await requirePersonalSpace();
  if (!input.title.trim()) return { error: "Título é obrigatório." };
  if (input.weekdays.length === 0) return { error: "Escolha pelo menos um dia da semana." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("activities")
    .update({
      title: input.title.trim(),
      category: input.category?.trim() || null,
      weekdays: input.weekdays,
      start_time: input.startTime,
      end_time: input.endTime || null,
      notes: input.notes?.trim() || null,
    })
    .eq("id", activityId)
    .eq("user_id", profile.id);

  if (error) return { error: error.message };
  revalidatePath("/rotina");
  revalidatePath("/hoje");
  return { success: "Atividade atualizada." };
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
