import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingDescriptionColumn } from "@/lib/subtask-description";
import { isMissingColumnError } from "@/lib/task-schedule";

type Item = { title: string; dueDate?: string; scheduledDate?: string; description?: string; priority?: "normal" | "importante" };
export type NestedSubtask = Item & { subtasks: Item[] };

const OPTIONAL = ["description", "scheduled_date", "priority"] as const;

/**
 * Insere com descrição/"fazer no dia"/prioridade; se o banco ainda não tiver
 * alguma dessas colunas (migration pendente), grava sem elas.
 */
async function insertSubtaskRows(db: SupabaseClient, rows: Record<string, unknown>[], select: boolean) {
  const run = (r: Record<string, unknown>[]) => (select ? db.from("task_subtasks").insert(r).select("id").single() : db.from("task_subtasks").insert(r));
  const strip = (cols: readonly string[]) => rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !cols.includes(k))));
  // Colunas opcionais vazias nem são enviadas.
  const clean = rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k, v]) => !(OPTIONAL as readonly string[]).includes(k) || (v !== null && v !== undefined))));
  let res = await run(clean);
  if (res.error && isMissingDescriptionColumn(res.error)) res = await run(strip(["description"]));
  if (res.error && isMissingColumnError(res.error)) res = await run(strip(OPTIONAL));
  return res as { data: { id: string } | null; error: { message: string } | null };
}

const row = (base: { parentType: string; parentId: string; userId: string; parentSubtaskId?: string | null }, item: Item, position: number) => ({
  parent_type: base.parentType, parent_id: base.parentId, user_id: base.userId, parent_subtask_id: base.parentSubtaskId ?? null,
  title: item.title.trim(), due_date: item.dueDate || null, scheduled_date: item.scheduledDate || null, position,
  description: item.description || null, priority: item.priority ?? null,
});

/**
 * Subtarefas (etapas) e o checklist de cada uma — usado pela Central de
 * Importação e pelo antigo importador do Planejamento. `startPosition`:
 * acrescentar ao final de uma tarefa que já tem subtarefas. Retorna a
 * mensagem de erro (ou null se tudo foi gravado).
 */
export async function insertNestedSubtasks(db: SupabaseClient, userId: string, parentType: "pessoal" | "clt", parentId: string, subtasks: NestedSubtask[], startPosition = 0): Promise<string | null> {
  for (let i = 0; i < subtasks.length; i++) {
    const stage = subtasks[i];
    const { data: root, error } = await insertSubtaskRows(db, [row({ parentType, parentId, userId }, stage, startPosition + i)], true);
    if (error || !root) return "Tarefa salva, mas houve erro nas etapas: " + (error?.message || "Falha ao criar etapa");
    if (stage.subtasks.length) {
      const childError = await insertChecklistItems(db, userId, parentType, parentId, root.id, stage.subtasks, 0);
      if (childError) return childError;
    }
  }
  return null;
}

/** Itens novos no checklist de uma subtarefa (nova ou já existente). */
export async function insertChecklistItems(db: SupabaseClient, userId: string, parentType: "pessoal" | "clt", parentId: string, parentSubtaskId: string, items: Item[], startPosition: number): Promise<string | null> {
  if (!items.length) return null;
  const { error } = await insertSubtaskRows(db, items.map((c, j) => row({ parentType, parentId, userId, parentSubtaskId }, c, startPosition + j)), false);
  return error ? "Etapa salva, mas falhou ao salvar checklist: " + error.message : null;
}
