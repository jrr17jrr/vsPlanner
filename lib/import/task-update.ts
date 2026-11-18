import { sameName } from "./values";
import type { DraftSubtask, TaskDraft } from "./tasks";

/**
 * "Atualizar tarefa existente" na Central de Importação — plano PURO (sem
 * I/O), o mesmo no navegador (prévia) e no servidor (confirmação).
 *
 * Regras:
 *  - Nada é apagado nem substituído sem escolha explícita: subtarefas e
 *    itens de checklist só são ACRESCENTADOS (o que já existe com o mesmo
 *    título fica como está — sem duplicar).
 *  - Campos da tarefa principal só mudam se marcados em `fields`. Campo
 *    vazio na tarefa existente pode ser preenchido; campo com valor só é
 *    substituído se a pessoa marcar (a prévia mostra "atual → novo").
 *  - Hierarquia: tarefa → subtarefa → itens do checklist (o banco guarda
 *    esses níveis; o que vier mais fundo já chega como item do checklist,
 *    com aviso na leitura).
 */

export type UpdatableField = "description" | "priority" | "notes" | "executionDate" | "deadlineDate" | "time";
export const UPDATABLE_FIELDS: UpdatableField[] = ["description", "priority", "executionDate", "deadlineDate", "time", "notes"];
export const FIELD_LABEL: Record<UpdatableField, string> = {
  description: "Descrição", priority: "Prioridade", notes: "Observações", executionDate: "Data de execução", deadlineDate: "Prazo final", time: "Horário",
};

/** Tarefa existente no formato comum (Pessoal e CLT/MKT). */
export type ExistingTask = {
  id: string;
  title: string;
  companyId: string | null;
  recurring: boolean;
  /** Campos atuais (null = vazio). Ausente = o tipo de tarefa não tem esse campo. */
  values: Partial<Record<UpdatableField, string | null>>;
};
export type ExistingSubtask = { id: string; title: string; parent_subtask_id: string | null };

export type FieldChange = { field: UpdatableField; label: string; before: string | null; after: string; overwrite: boolean };
export type TaskUpdatePlan = {
  /** Subtarefas novas (com os itens de checklist). */
  newSubtasks: DraftSubtask[];
  /** Itens de checklist novos em subtarefas que JÁ existem. */
  newChecklist: Array<{ subtaskId: string; subtaskTitle: string; items: DraftSubtask["children"] }>;
  /** Já existiam (não serão duplicados). */
  existingSubtasks: string[];
  existingChecklist: string[];
  /** Mudanças possíveis nos campos (aplicadas só as escolhidas). */
  fieldChanges: FieldChange[];
  chosenChanges: FieldChange[];
  empty: boolean;
};

const PRIORITY_LABEL = { normal: "Normal", importante: "Importante" } as const;
function draftValue(d: TaskDraft, f: UpdatableField): string | null {
  switch (f) {
    case "description": return d.description?.trim() || null;
    case "notes": return d.notes?.trim() || null;
    case "priority": return d.recognized.includes("Prioridade") ? d.priority : null;
    case "executionDate": return d.weekdays.length ? null : d.executionDate ?? null;
    case "deadlineDate": return d.weekdays.length ? null : d.deadlineDate ?? null;
    case "time": return d.time ?? null;
  }
}
export const fieldDisplay = (f: UpdatableField, v: string | null) =>
  v === null ? "vazio" : f === "priority" ? PRIORITY_LABEL[v as "normal" | "importante"] ?? v : f === "executionDate" || f === "deadlineDate" ? v.split("-").reverse().join("/") : v;

/** Campos marcados por padrão: só os que PREENCHEM um campo vazio (nunca os que substituem). */
export function defaultFields(changes: FieldChange[]): UpdatableField[] {
  return changes.filter((c) => !c.overwrite).map((c) => c.field);
}

export function planTaskUpdate(draft: TaskDraft, target: ExistingTask, subtasks: ExistingSubtask[], fields: UpdatableField[] | undefined): TaskUpdatePlan {
  const roots = subtasks.filter((s) => !s.parent_subtask_id);
  const newSubtasks: DraftSubtask[] = [];
  const newChecklist: TaskUpdatePlan["newChecklist"] = [];
  const existingSubtasks: string[] = [];
  const existingChecklist: string[] = [];
  const seen = new Set<string>();
  for (const s of draft.subtasks) {
    const key = s.title.trim().toLocaleLowerCase("pt-BR");
    if (seen.has(key)) continue; // repetida no próprio arquivo
    seen.add(key);
    const hit = roots.find((r) => sameName(r.title, s.title));
    if (!hit) { newSubtasks.push(s); continue; }
    existingSubtasks.push(hit.title);
    const items = subtasks.filter((c) => c.parent_subtask_id === hit.id);
    const fresh = s.children.filter((c, i) => !items.some((x) => sameName(x.title, c.title)) && s.children.findIndex((y) => sameName(y.title, c.title)) === i);
    existingChecklist.push(...s.children.filter((c) => items.some((x) => sameName(x.title, c.title))).map((c) => `${hit.title} › ${c.title}`));
    if (fresh.length) newChecklist.push({ subtaskId: hit.id, subtaskTitle: hit.title, items: fresh });
  }
  const fieldChanges: FieldChange[] = [];
  for (const f of UPDATABLE_FIELDS) {
    if (!(f in target.values)) continue;
    if (target.recurring && (f === "executionDate" || f === "deadlineDate")) continue; // repetição: datas são por dia
    const after = draftValue(draft, f);
    if (after === null) continue;
    const before = target.values[f] ?? null;
    if (before !== null && before === after) continue;
    fieldChanges.push({ field: f, label: FIELD_LABEL[f], before, after, overwrite: before !== null });
  }
  const chosen = new Set(fields ?? defaultFields(fieldChanges));
  const chosenChanges = fieldChanges.filter((c) => chosen.has(c.field));
  return {
    newSubtasks, newChecklist, existingSubtasks, existingChecklist, fieldChanges, chosenChanges,
    empty: !newSubtasks.length && !newChecklist.length && !chosenChanges.length,
  };
}

/** Resumo curto da prévia ("2 subtarefas novas · 3 itens de checklist · 1 campo"). */
export function planSummary(p: TaskUpdatePlan): string {
  const parts: string[] = [];
  if (p.newSubtasks.length) parts.push(`${p.newSubtasks.length} subtarefa(s) nova(s)`);
  const items = p.newChecklist.reduce((a, c) => a + c.items.length, 0) + p.newSubtasks.reduce((a, s) => a + s.children.length, 0);
  if (items) parts.push(`${items} item(ns) de checklist`);
  if (p.chosenChanges.length) parts.push(`${p.chosenChanges.length} campo(s) atualizado(s)`);
  return parts.length ? parts.join(" · ") : "Nada a acrescentar";
}
