/**
 * Rascunho de subtarefa (formulário) — regra ÚNICA usada pelo formulário de
 * subtarefas (PC inline, celular em diálogo) e pela seção "Subtarefas" do
 * Criar tarefa. Converte para o `SubtaskInput` gravado pelo servidor.
 */
export type SubtaskDraft = {
  title: string;
  description: string;
  /** Fazer no dia (execução). */
  scheduledDate: string;
  scheduledTime: string;
  /** Prazo final (coluna due_date). */
  dueDate: string;
  deadlineTime: string;
  priority: "normal" | "importante";
  reminders: number[];
};

export const EMPTY_SUBTASK_DRAFT: SubtaskDraft = {
  title: "", description: "", scheduledDate: "", scheduledTime: "", dueDate: "", deadlineTime: "", priority: "normal", reminders: [],
};

/** Mesmo formato de `SubtaskInput` (lib/supabase/subtask-actions.ts), sem id/parentSubtaskId. */
export type SubtaskDraftInput = {
  title: string;
  description: string | undefined;
  dueDate: string;
  scheduledDate: string | null;
  scheduledTime: string | null;
  deadlineTime: string | null;
  priority: "normal" | "importante";
  reminderOffsets: number[];
};

/** Erro de preenchimento (mesmas mensagens do servidor) ou null. */
export function validateSubtaskDraft(d: SubtaskDraft): string | null {
  if (!d.title.trim()) return "Informe o título da subtarefa.";
  if (d.title.trim().length > 300) return "Informe um título de até 300 caracteres.";
  if (d.scheduledDate && d.dueDate && d.dueDate < d.scheduledDate) return "O prazo final não pode ser antes do dia de execução.";
  return null;
}

/**
 * Normaliza: horário só com data, horário limite só com prazo, lembretes só
 * com dia de execução. `includeDescription=false` não mexe na descrição
 * (telas que não mostraram o campo).
 */
export function subtaskDraftToInput(d: SubtaskDraft, includeDescription = true): SubtaskDraftInput {
  return {
    title: d.title.trim(),
    description: includeDescription ? d.description : undefined,
    dueDate: d.dueDate,
    scheduledDate: d.scheduledDate || null,
    scheduledTime: d.scheduledDate ? d.scheduledTime || null : null,
    deadlineTime: d.dueDate ? d.deadlineTime || null : null,
    priority: d.priority,
    reminderOffsets: d.scheduledDate ? d.reminders : [],
  };
}

/** Rascunho vazio — ignorado ao salvar a tarefa. Datas não contam (podem ter vindo herdadas da tarefa). */
export function isBlankSubtaskDraft(d: SubtaskDraft): boolean {
  return !d.title.trim() && !d.description.trim() && !d.scheduledTime && !d.deadlineTime && d.priority === "normal" && !d.reminders.length;
}

/**
 * Nova subtarefa no Criar tarefa herda a data da tarefa principal:
 * tarefa do dia → "fazer no dia"; tarefa com prazo → prazo final.
 */
export function inheritedSubtaskDraft(task: { kind: "dia" | "prazo"; date: string; recurring: boolean }): SubtaskDraft {
  if (task.recurring || !task.date) return { ...EMPTY_SUBTASK_DRAFT };
  return task.kind === "dia" ? { ...EMPTY_SUBTASK_DRAFT, scheduledDate: task.date } : { ...EMPTY_SUBTASK_DRAFT, dueDate: task.date };
}

/** Prepara os rascunhos para enviar: tira os vazios e valida o resto. */
export function prepareSubtaskDrafts(drafts: SubtaskDraft[]): { error: string } | { inputs: SubtaskDraftInput[] } {
  const filled = drafts.filter((d) => !isBlankSubtaskDraft(d));
  for (const [i, d] of filled.entries()) {
    const err = validateSubtaskDraft(d);
    if (err) return { error: `Subtarefa ${i + 1}: ${err}` };
  }
  return { inputs: filled.map((d) => subtaskDraftToInput(d)) };
}
