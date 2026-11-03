import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingDescriptionColumn } from "@/lib/subtask-description";

export type NestedSubtask = { title: string; dueDate?: string; description?: string; subtasks: Array<{ title: string; dueDate?: string; description?: string }> };

/** Insere com descrição; se o banco ainda não tiver a coluna (migration pendente), grava sem ela. */
async function insertSubtaskRows(db: SupabaseClient, rows: Record<string, unknown>[], select: boolean) {
  const strip = () => rows.map((r) => { const c = { ...r }; delete c.description; return c; });
  const run = (r: Record<string, unknown>[]) => (select ? db.from("task_subtasks").insert(r).select("id").single() : db.from("task_subtasks").insert(r));
  let res = await run(rows.some((r) => r.description) ? rows : strip());
  if (res.error && isMissingDescriptionColumn(res.error)) res = await run(strip());
  return res as { data: { id: string } | null; error: { message: string } | null };
}

/**
 * Subtarefas (etapas) e o checklist de cada uma — usado pela Central de
 * Importação e pelo antigo importador do Planejamento. Retorna a mensagem de
 * erro (ou null se tudo foi gravado).
 */
export async function insertNestedSubtasks(db: SupabaseClient, userId: string, parentType: "pessoal" | "clt", parentId: string, subtasks: NestedSubtask[]): Promise<string | null> {
  for (let i = 0; i < subtasks.length; i++) {
    const stage = subtasks[i];
    const { data: root, error } = await insertSubtaskRows(db, [{ parent_type: parentType, parent_id: parentId, user_id: userId, title: stage.title.trim(), due_date: stage.dueDate || null, position: i, description: stage.description || null }], true);
    if (error || !root) return "Tarefa criada, mas houve erro nas etapas: " + (error?.message || "Falha ao criar etapa");
    if (stage.subtasks.length) {
      const { error: childError } = await insertSubtaskRows(db, stage.subtasks.map((child, j) => ({ parent_type: parentType, parent_id: parentId, user_id: userId, parent_subtask_id: root.id, title: child.title.trim(), due_date: child.dueDate || null, position: j, description: child.description || null })), false);
      if (childError) return "Etapa criada, mas falhou ao salvar checklist: " + childError.message;
    }
  }
  return null;
}
