"use server";

import { revalidatePath } from "next/cache";
import { requirePersonalSpace } from "@/lib/supabase/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { GoalStatus, PersonalWorkTaskPriority, PersonalWorkTaskStatus, TaskPriority, TaskStatus } from "@/types/database.types";

type ActionState = { error?: string; success?: string; id?: string };

/**
 * Tudo aqui é do space Pessoal do usuário autenticado — `requirePersonalSpace()`
 * resolve o space certo (sempre existe, criado no cadastro) e RLS
 * (`user_id = auth.uid()`) é a proteção real; nunca recebe `space_id`/
 * `user_id` do client.
 */

// -----------------------------------------------------------------------------
// Tarefas
// -----------------------------------------------------------------------------

export type TaskFormInput = {
  title: string;
  description?: string;
  dueDate?: string;
  scheduledTime?: string;
  priority: TaskPriority;
  category?: string;
  notes?: string;
};

export async function createTaskAction(input: TaskFormInput): Promise<ActionState> {
  const { profile, space } = await requirePersonalSpace();
  if (!input.title.trim()) return { error: "Título é obrigatório." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      space_id: space.id,
      user_id: profile.id,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      due_date: input.dueDate || null,
      scheduled_time: input.scheduledTime || null,
      priority: input.priority,
      category: input.category?.trim() || null,
      notes: input.notes?.trim() || null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  revalidatePath("/tarefas");
  revalidatePath("/hoje");
  return { success: "Tarefa criada.", id: data.id };
}

export async function updateTaskAction(taskId: string, input: TaskFormInput): Promise<ActionState> {
  const { profile } = await requirePersonalSpace();
  if (!input.title.trim()) return { error: "Título é obrigatório." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("tasks")
    .update({
      title: input.title.trim(),
      description: input.description?.trim() || null,
      due_date: input.dueDate || null,
      scheduled_time: input.scheduledTime || null,
      priority: input.priority,
      category: input.category?.trim() || null,
      notes: input.notes?.trim() || null,
    })
    .eq("id", taskId)
    .eq("user_id", profile.id);

  if (error) return { error: error.message };
  revalidatePath("/tarefas");
  revalidatePath("/hoje");
  return { success: "Tarefa atualizada." };
}

export async function toggleTaskStatusAction(taskId: string, status: TaskStatus): Promise<ActionState> {
  const { profile } = await requirePersonalSpace();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("tasks")
    .update({ status, completed_at: status === "concluida" ? new Date().toISOString() : null })
    .eq("id", taskId)
    .eq("user_id", profile.id);

  if (error) return { error: error.message };
  revalidatePath("/tarefas");
  revalidatePath("/hoje");
  return { success: "Status atualizado." };
}

export async function moveTaskDateAction(taskId: string, dueDate: string): Promise<ActionState> {
  const { profile } = await requirePersonalSpace();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("tasks").update({ due_date: dueDate }).eq("id", taskId).eq("user_id", profile.id);
  if (error) return { error: error.message };
  revalidatePath("/tarefas");
  revalidatePath("/hoje");
  return { success: "Data alterada." };
}

export async function deleteTaskAction(taskId: string): Promise<ActionState> {
  const { profile } = await requirePersonalSpace();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("tasks").delete().eq("id", taskId).eq("user_id", profile.id);
  if (error) return { error: error.message };
  revalidatePath("/tarefas");
  revalidatePath("/hoje");
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
