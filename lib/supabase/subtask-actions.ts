"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SubtaskParent = "pessoal" | "clt" | "visionario";
export type Subtask = { id: string; parent_type: SubtaskParent; parent_id: string; user_id: string; title: string; due_date: string | null; is_done: boolean; position: number };

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
  for (const path of ["/tarefas", "/meu-dia", "/trabalho/tarefas", "/trabalho/meu-dia", "/visionario/trabalhos", "/visionario"]) revalidatePath(path);
}

export async function listSubtasks(parentType: SubtaskParent, parentId: string): Promise<Subtask[]> {
  const { db } = await context(parentType, parentId);
  const { data, error } = await db.from("task_subtasks").select("*").eq("parent_type", parentType).eq("parent_id", parentId).order("position").order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as Subtask[];
}

export async function saveSubtask(parentType: SubtaskParent, parentId: string, input: { id?: string; title: string; dueDate?: string | null }) {
  const { db, user } = await context(parentType, parentId);
  const title = input.title.trim();
  if (!title || title.length > 300) return { error: "Informe um título de até 300 caracteres." };
  if (input.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) return { error: "Data inválida." };
  if (input.id) {
    const { error } = await db.from("task_subtasks").update({ title, due_date: input.dueDate || null, updated_at: new Date().toISOString() }).eq("id", input.id).eq("parent_type", parentType).eq("parent_id", parentId).eq("user_id", user.id);
    if (error) return { error: error.message };
  } else {
    const { data } = await db.from("task_subtasks").select("position").eq("parent_type", parentType).eq("parent_id", parentId).order("position", { ascending: false }).limit(1);
    const { error } = await db.from("task_subtasks").insert({ parent_type: parentType, parent_id: parentId, user_id: user.id, title, due_date: input.dueDate || null, position: (data?.[0]?.position ?? -1) + 1 });
    if (error) return { error: error.message };
  }
  refresh();
  return { success: true };
}

export async function setSubtaskDone(parentType: SubtaskParent, parentId: string, id: string, done: boolean) {
  const { db, user } = await context(parentType, parentId);
  const { error } = await db.from("task_subtasks").update({ is_done: done, updated_at: new Date().toISOString() }).eq("id", id).eq("parent_type", parentType).eq("parent_id", parentId).eq("user_id", user.id);
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
