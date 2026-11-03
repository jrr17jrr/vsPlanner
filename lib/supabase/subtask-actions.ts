"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingDescriptionColumn, MISSING_DESCRIPTION_WARNING, normalizeSubtaskDescription } from "@/lib/subtask-description";
import { isMissingColumnError, MISSING_SCHEDULE_WARNING, stripScheduleColumns, SUBTASK_SCHEDULE_COLUMNS, type Subtask } from "@/lib/task-schedule";
import { subtaskScheduleValues } from "@/lib/supabase/subtask-rows";

export type SubtaskParent = Subtask["parent_type"];
/** Linha de task_subtasks — definição única em lib/task-schedule.ts. */
export type { Subtask };

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
type DbError = { code?: string; message: string } | null;

/**
 * Grava; se o banco ainda não tem as colunas novas (migration 20261102100000),
 * regrava sem elas e devolve o aviso — nunca perde a subtarefa inteira.
 */
async function writeWithScheduleFallback(write: (values: Record<string, unknown>) => PromiseLike<{ error: DbError }>, values: Record<string, unknown>): Promise<{ error: DbError; warning?: string }> {
  const first = await write(values);
  if (!first.error || !isMissingColumnError(first.error) || isMissingDescriptionColumn(first.error)) return { error: first.error };
  const stripped = stripScheduleColumns(values, SUBTASK_SCHEDULE_COLUMNS);
  const second = await write(stripped.values);
  return { error: second.error, warning: stripped.lost ? MISSING_SCHEDULE_WARNING : undefined };
}

async function context(parentType: SubtaskParent, parentId: string) {
  const db = (await createSupabaseServerClient()) as unknown as SupabaseClient;
  const { data: { user } } = await db.auth.getUser();
  if (!user) throw new Error("Sessão expirada.");
  const table = parentType === "pessoal" ? "tasks" : parentType === "clt" ? "clt_tasks" : "work_items";
  const ownerColumn = parentType === "visionario" ? "created_by" : "user_id";
  const { data, error } = await db.from(table).select("id").eq("id", parentId).eq(ownerColumn, user.id).maybeSingle();
  if (error || !data) throw new Error("Tarefa não encontrada ou sem permissão.");
  return { db, user };
}

function refresh() {
  for (const path of ["/tarefas", "/hoje", "/rotina", "/", "/trabalho", "/trabalho/tarefas", "/visionario/trabalhos", "/visionario"]) revalidatePath(path);
  revalidatePath("/visionario/mkt", "layout");
}

export async function listSubtasks(parentType: SubtaskParent, parentId: string): Promise<Subtask[]> {
  const { db } = await context(parentType, parentId);
  const { data, error } = await db.from("task_subtasks").select("*").eq("parent_type", parentType).eq("parent_id", parentId).order("position").order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as Subtask[];
}

export type SubtaskInput = {
  id?: string;
  title: string;
  /** PRAZO final (coluna due_date, como sempre foi). */
  dueDate?: string | null;
  parentSubtaskId?: string | null;
  description?: string | null;
  /** Campos de agenda: `undefined` = não mexe (telas antigas continuam funcionando). */
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  deadlineTime?: string | null;
  priority?: "normal" | "importante";
  reminderOffsets?: number[];
};

export async function saveSubtask(parentType: SubtaskParent, parentId: string, input: SubtaskInput): Promise<{ error?: string; success?: boolean; warning?: string }> {
  const { db, user } = await context(parentType, parentId);
  const title = input.title.trim();
  if (!title || title.length > 300) return { error: "Informe um título de até 300 caracteres." };
  const schedule = subtaskScheduleValues(input);
  if (schedule.error) return { error: schedule.error };
  const description = normalizeSubtaskDescription(input.description);
  if (description.error) return { error: description.error };
  let warning: string | undefined;
  if (input.parentSubtaskId) {
    const { data: parent } = await db.from("task_subtasks").select("id,parent_subtask_id").eq("id",input.parentSubtaskId).eq("parent_type",parentType).eq("parent_id",parentId).eq("user_id",user.id).maybeSingle();
    if (!parent || parent.parent_subtask_id) return { error: "Só é permitido um nível de checklist dentro das etapas." };
  }
  if (input.id) {
    const id = input.id;
    const base = { title, due_date: input.dueDate || null, updated_at: new Date().toISOString() };
    const update = (values: Record<string, unknown>) => db.from("task_subtasks").update(values).eq("id", id).eq("parent_type", parentType).eq("parent_id", parentId).eq("user_id", user.id);
    const withSchedule = await writeWithScheduleFallback(update, { ...base, ...schedule.values, ...(description.value !== undefined ? { description: description.value } : {}) });
    warning = withSchedule.warning;
    let { error } = withSchedule;
    // Banco ainda sem a coluna (migration pendente): salva o resto e avisa.
    if (error && description.value !== undefined && isMissingDescriptionColumn(error)) {
      ({ error } = await writeWithScheduleFallback(update, { ...base, ...schedule.values }));
      if (!error && description.value) warning = MISSING_DESCRIPTION_WARNING;
    }
    if (error) return { error: error.message };
  } else {
    const { data } = await db.from("task_subtasks").select("position").eq("parent_type", parentType).eq("parent_id", parentId).order("position", { ascending: false }).limit(1);
    const row: Record<string, unknown> = { parent_type: parentType, parent_id: parentId, user_id: user.id, title, due_date: input.dueDate || null, parent_subtask_id: input.parentSubtaskId || null, position: (data?.[0]?.position ?? -1) + 1, ...schedule.values };
    const insert = (values: Record<string, unknown>) => db.from("task_subtasks").insert(values);
    // Sem descrição a coluna nem é enviada (funciona antes e depois da migration).
    const first = await writeWithScheduleFallback(insert, description.value ? { ...row, description: description.value } : row);
    warning = first.warning;
    let { error } = first;
    if (error && description.value && isMissingDescriptionColumn(error)) {
      ({ error } = await writeWithScheduleFallback(insert, row));
      if (!error) warning = MISSING_DESCRIPTION_WARNING;
    }
    if (error) return { error: error.message };
  }
  refresh();
  return { success: true, warning };
}

export async function setSubtaskDone(parentType: SubtaskParent, parentId: string, id: string, done: boolean) {
  const { db, user } = await context(parentType, parentId);
  if (done) {
    const { data: children } = await db.from("task_subtasks").select("id,is_done").eq("parent_subtask_id",id).eq("parent_type",parentType).eq("parent_id",parentId);
    if (children?.some(x=>!x.is_done)) return { error: "Conclua os itens do checklist antes de finalizar a etapa." };
  }
  const now = new Date().toISOString();
  const update = (values: Record<string, unknown>) => db.from("task_subtasks").update(values).eq("id", id).eq("parent_type", parentType).eq("parent_id", parentId).eq("user_id", user.id);
  const { error } = await writeWithScheduleFallback(update, { is_done: done, completed_at: done ? now : null, updated_at: now });
  if (error) return { error: error.message };
  refresh();
  return { success: true };
}

export async function deleteSubtask(parentType: SubtaskParent, parentId: string, id: string) {
  const { db, user } = await context(parentType, parentId);
  const { error } = await db.from("task_subtasks").delete().eq("id", id).eq("parent_type", parentType).eq("parent_id", parentId).eq("user_id", user.id);
  if (error) return { error: error.message };
  refresh();
  return { success: true };
}

export async function moveSubtask(parentType: SubtaskParent, parentId: string, id: string, direction: -1 | 1) {
  const { db, user } = await context(parentType, parentId);
  const { data, error } = await db.from("task_subtasks").select("id,position").eq("parent_type", parentType).eq("parent_id", parentId).eq("user_id", user.id).order("position").order("created_at");
  if (error) return { error: error.message };
  const index = (data ?? []).findIndex(x => x.id === id);
  const other = index + direction;
  if (index < 0 || other < 0 || other >= (data?.length ?? 0)) return { success: true };
  const reordered = [...(data ?? [])];
  [reordered[index], reordered[other]] = [reordered[other], reordered[index]];
  for (let i = 0; i < reordered.length; i++) {
    const { error: updateError } = await db.from("task_subtasks").update({ position: i }).eq("id", reordered[i].id).eq("user_id", user.id);
    if (updateError) return { error: updateError.message };
  }
  refresh();
  return { success: true };
}

/** Reprogramar a execução ("fazer no dia") de uma subtarefa. O prazo final não muda. */
export async function rescheduleSubtaskAction(parentType: SubtaskParent, parentId: string, id: string, date: string) {
  const { db, user } = await context(parentType, parentId);
  if (!DATE_KEY.test(date)) return { error: "Data inválida." };
  const { error } = await db.from("task_subtasks").update({ scheduled_date: date, updated_at: new Date().toISOString() }).eq("id", id).eq("parent_type", parentType).eq("parent_id", parentId).eq("user_id", user.id);
  if (error) return { error: isMissingColumnError(error) ? "Reprogramar subtarefas precisa da migração 20261102100000 aplicada no Supabase." : error.message };
  refresh();
  return { success: "Subtarefa reprogramada. O prazo final não mudou." };
}
