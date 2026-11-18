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
  /** Programação própria: sem data / data específica (scheduledDate) / repetir (diária = semanal com os 7 dias; semanal; mensal). */
  recurrence: "none" | "weekly" | "monthly";
  /** 0=domingo..6=sábado (só com recurrence 'weekly'). */
  weekdays: number[];
  /** Dia do mês (1..31) — só com recurrence 'monthly'. */
  monthDay: string;
  /** Início/término da repetição (opcionais; início padrão = hoje). */
  recurrenceStart: string;
  recurrenceUntil: string;
  /** Itens do checklist criados junto (subtarefas dentro da subtarefa), com prioridade própria. */
  checklist?: ChecklistDraft[];
};

export type ChecklistDraft = { title: string; priority: "normal" | "importante" };

export const EMPTY_SUBTASK_DRAFT: SubtaskDraft = {
  title: "", description: "", scheduledDate: "", scheduledTime: "", dueDate: "", deadlineTime: "", priority: "normal", reminders: [],
  recurrence: "none", weekdays: [], monthDay: "", recurrenceStart: "", recurrenceUntil: "",
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
  /** Ausente em rascunhos sem repetição de telas antigas: o servidor não mexe. */
  recurrence?: "none" | "weekly" | "monthly";
  weekdays?: number[];
  monthDay?: number | null;
  recurrenceStart?: string | null;
  recurrenceUntil?: string | null;
  checklist?: ChecklistDraft[];
};

/** Erro de preenchimento (mesmas mensagens do servidor) ou null. */
export function validateSubtaskDraft(d: SubtaskDraft): string | null {
  if (!d.title.trim()) return "Informe o título da subtarefa.";
  if (d.title.trim().length > 300) return "Informe um título de até 300 caracteres.";
  if ((d.checklist ?? []).some((c) => c.title.trim().length > 300)) return "Item do checklist com título acima de 300 caracteres.";
  if ((d.checklist ?? []).filter((c) => c.title.trim()).length > 50) return "Máximo de 50 itens de checklist por subtarefa.";
  if (d.recurrence === "monthly") {
    const day = Number(d.monthDay);
    if (!(Number.isInteger(day) && day >= 1 && day <= 31)) return "Escolha o dia do mês (1 a 31) para repetir a subtarefa.";
    if (d.recurrenceStart && d.recurrenceUntil && d.recurrenceUntil < d.recurrenceStart) return "O término da repetição não pode ser antes do início.";
    return null;
  }
  if (d.recurrence === "weekly") {
    if (d.weekdays.length === 0) return "Escolha pelo menos um dia da semana para repetir a subtarefa.";
    if (d.recurrenceStart && d.recurrenceUntil && d.recurrenceUntil < d.recurrenceStart) return "O término da repetição não pode ser antes do início.";
    return null;
  }
  if (d.scheduledDate && d.dueDate && d.dueDate < d.scheduledDate) return "O prazo final não pode ser antes do dia de execução.";
  return null;
}

/**
 * Normaliza: horário só com data (ou repetição), horário limite só com
 * prazo, lembretes só com execução. Repetição semanal não tem data fixa
 * nem prazo final. `includeDescription=false` não mexe na descrição
 * (telas que não mostraram o campo).
 */
export function subtaskDraftToInput(d: SubtaskDraft, includeDescription = true): SubtaskDraftInput {
  const repeats = d.recurrence === "weekly" || d.recurrence === "monthly";
  const weekly = repeats;
  const hasExecution = repeats || !!d.scheduledDate;
  return {
    title: d.title.trim(),
    description: includeDescription ? d.description : undefined,
    dueDate: weekly ? "" : d.dueDate,
    scheduledDate: weekly ? null : d.scheduledDate || null,
    scheduledTime: hasExecution ? d.scheduledTime || null : null,
    deadlineTime: !weekly && d.dueDate ? d.deadlineTime || null : null,
    priority: d.priority,
    reminderOffsets: hasExecution ? d.reminders : [],
    recurrence: d.recurrence,
    weekdays: d.recurrence === "weekly" ? [...new Set(d.weekdays)].sort((a, b) => a - b) : [],
    monthDay: d.recurrence === "monthly" ? Number(d.monthDay) : null,
    recurrenceStart: weekly ? d.recurrenceStart || null : null,
    recurrenceUntil: weekly ? d.recurrenceUntil || null : null,
    ...((d.checklist ?? []).some((c) => c.title.trim()) ? { checklist: (d.checklist ?? []).filter((c) => c.title.trim()).map((c) => ({ title: c.title.trim(), priority: c.priority })) } : {}),
  };
}

/** Rascunho vazio — ignorado ao salvar a tarefa. Datas não contam (podem ter vindo herdadas da tarefa). */
export function isBlankSubtaskDraft(d: SubtaskDraft): boolean {
  return !d.title.trim() && !d.description.trim() && !d.scheduledTime && !d.deadlineTime && d.priority === "normal" && !d.reminders.length && d.recurrence === "none" && !(d.checklist ?? []).some((c) => c.title.trim());
}

/**
 * Nova subtarefa no Criar tarefa herda a data da tarefa principal:
 * tarefa do dia → "fazer no dia"; tarefa com prazo → prazo final.
 */
export function inheritedSubtaskDraft(task: { kind: "dia" | "prazo" | "organizadora"; date: string; recurring: boolean }): SubtaskDraft {
  if (task.recurring || !task.date || task.kind === "organizadora") return { ...EMPTY_SUBTASK_DRAFT };
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
