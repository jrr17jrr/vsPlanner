import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildNewSubtaskRows, type NewSubtaskInput } from "@/lib/supabase/subtask-rows";

/**
 * Subtarefas (e o checklist de cada uma) criadas JUNTO com a(s) tarefa(s)
 * — a mesma regra no Pessoal e no CLT/MKT. UM insert (todas ou nenhuma);
 * se falhar, desfaz as tarefas recém-criadas: nunca fica tarefa pela metade.
 * `defaultToNull: false`: coluna ausente numa linha usa o padrão do banco
 * (ex.: recorrência 'none'), mesmo com subtarefas de tipos diferentes no lote.
 */
export async function insertSubtasksOrRollback(
  db: SupabaseClient,
  userId: string,
  parent: { type: "pessoal" | "clt"; table: "tasks" | "clt_tasks" },
  taskIds: string[],
  inputs: NewSubtaskInput[],
): Promise<string | null> {
  if (!inputs.length || !taskIds.length) return null;
  const rows: Record<string, unknown>[] = [];
  for (const id of taskIds) {
    const built = buildNewSubtaskRows({ parentType: parent.type, parentId: id, userId }, inputs);
    if ("error" in built) return built.error;
    rows.push(...built.rows);
  }
  const { error } = await db.from("task_subtasks").insert(rows, { defaultToNull: false });
  if (!error) return null;
  const undo = await db.from(parent.table).delete().in("id", taskIds).eq("user_id", userId);
  return undo.error
    ? "As subtarefas não foram salvas (" + error.message + ") e a tarefa criada não pôde ser desfeita automaticamente. Confira a lista de tarefas."
    : "Nada foi salvo: erro ao gravar as subtarefas (" + error.message + "). Tente novamente.";
}

/** Valida as subtarefas ANTES de criar a tarefa. */
export function checkNewSubtasks(userId: string, parentType: "pessoal" | "clt", inputs: NewSubtaskInput[] | undefined): string | null {
  if (!inputs?.length) return null;
  if (inputs.length > 50) return "Máximo de 50 subtarefas por vez.";
  const r = buildNewSubtaskRows({ parentType, parentId: "", userId }, inputs);
  return "error" in r ? r.error : null;
}
