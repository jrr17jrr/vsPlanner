import type { Subtask } from "@/lib/task-schedule";

/**
 * Prioridade individual dos itens de checklist (Normal / Importante).
 * A coluna é `task_subtasks.priority` (default 'normal' — itens antigos já
 * são Normal). A prioridade do item NUNCA muda a da subtarefa nem a da
 * tarefa principal: é só filtro/ordem de exibição.
 */
export type ChecklistFilter = {
  priority: "todos" | "importante" | "normal";
  /** Importantes primeiro (mantém a ordem manual dentro de cada grupo). */
  importantFirst: boolean;
};

export const itemPriority = (s: Pick<Subtask, "priority">): "normal" | "importante" => (s.priority === "importante" ? "importante" : "normal");

export function filterChecklist<T extends Pick<Subtask, "priority" | "position">>(items: T[], filter: ChecklistFilter): T[] {
  const kept = filter.priority === "todos" ? [...items] : items.filter((i) => itemPriority(i) === filter.priority);
  if (!filter.importantFirst) return kept;
  // sort estável: a ordem manual (position) é preservada dentro de cada prioridade.
  return kept.sort((a, b) => Number(itemPriority(b) === "importante") - Number(itemPriority(a) === "importante"));
}

/** Progresso de um checklist ("2/5 concluídos"). */
export function checklistProgress(items: Array<Pick<Subtask, "is_done">>): { done: number; total: number; label: string } {
  const done = items.filter((i) => i.is_done).length;
  return { done, total: items.length, label: `${done}/${items.length} concluído${items.length === 1 ? "" : "s"}` };
}
