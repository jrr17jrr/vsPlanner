"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingDescriptionColumn, MISSING_DESCRIPTION_WARNING, normalizeSubtaskDescription } from "@/lib/subtask-description";
import { isMissingColumnError, MISSING_SCHEDULE_WARNING, stripScheduleColumns, SUBTASK_SCHEDULE_COLUMNS, type Subtask } from "@/lib/task-schedule";
import { MISSING_RECURRENCE_ERROR, SUBTASK_RECURRENCE_COLUMNS, subtaskRecurrenceValues, subtaskScheduleValues } from "@/lib/supabase/subtask-rows";
import { attachSubtaskOccurrences, isMissingSchema } from "@/lib/supabase/subtask-occurrences";
import { isRecurringSubtask, subtaskHistory, subtaskOccursOn } from "@/lib/subtask-recurrence";
import { todayKeySaoPaulo } from "@/lib/format";
import { addDaysToKey } from "@/lib/tasks";

export type SubtaskParent = Subtask["parent_type"];
/** Linha de task_subtasks — definição única em lib/task-schedule.ts. */
export type { Subtask };

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
type DbError = { code?: string; message: string } | null;

/**
 * Grava; se o banco ainda não tem as colunas novas (migration 20261102100000),
 * regrava sem elas e devolve o aviso — nunca perde a subtarefa inteira.
 * Colunas de recorrência (migration 20261112100000): sem a migration,
 * "não repetir" é gravado sem elas (é o comportamento antigo); pedir
 * repetição devolve um erro claro em vez de salvar errado.
 */
async function writeWithScheduleFallback(write: (values: Record<string, unknown>) => PromiseLike<{ error: DbError }>, values: Record<string, unknown>): Promise<{ error: DbError; warning?: string }> {
  const first = await write(values);
  if (!first.error || !isMissingColumnError(first.error) || isMissingDescriptionColumn(first.error)) return { error: first.error };
  const hasRecurrence = SUBTASK_RECURRENCE_COLUMNS.some((c) => c in values);
  if (hasRecurrence) {
    if (values.recurrence === "weekly") return { error: { message: MISSING_RECURRENCE_ERROR } };
    const withoutRecurrence = Object.fromEntries(Object.entries(values).filter(([k]) => !(SUBTASK_RECURRENCE_COLUMNS as readonly string[]).includes(k)));
    const retry = await write(withoutRecurrence);
    if (!retry.error || !isMissingColumnError(retry.error) || isMissingDescriptionColumn(retry.error)) return { error: retry.error };
    values = withoutRecurrence;
  }
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
  for (const path of ["/tarefas", "/hoje", "/rotina", "/", "/trabalho", "/trabalho/tarefas", "/visionario/trabalhos", "/visionario", "/historico"]) revalidatePath(path);
  revalidatePath("/visionario/mkt", "layout");
}

async function getOwnSubtask(db: SupabaseClient, parentType: SubtaskParent, parentId: string, id: string, userId: string): Promise<Subtask | null> {
  const { data, error } = await db.from("task_subtasks").select("*").eq("id", id).eq("parent_type", parentType).eq("parent_id", parentId).eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Subtask | null) ?? null;
}

/**
 * Antes de mudar a definição de uma subtarefa recorrente, grava os dias
 * passados (janela do histórico) que ainda não têm linha como 'pendente' —
 * a mudança vale daqui pra frente, o passado não é reescrito.
 * `ignoreDuplicates` mantém intactas as execuções já gravadas (inclusive concluídas).
 */
async function freezePastSubtaskOccurrences(db: SupabaseClient, s: Subtask, todayKey: string): Promise<string | null> {
  if (!isRecurringSubtask(s)) return null;
  const past = subtaskHistory(s, addDaysToKey(todayKey, -1)).filter((h) => !s.occurrences?.some((o) => o.occurrence_date === h.date));
  if (past.length === 0) return null;
  const { error } = await db.from("task_subtask_occurrences").upsert(
    past.map((h) => ({ subtask_id: s.id, user_id: s.user_id, occurrence_date: h.date, status: "pendente", title: s.title })),
    { onConflict: "subtask_id,occurrence_date", ignoreDuplicates: true },
  );
  return error && !isMissingSchema(error) ? error.message : null;
}

export async function listSubtasks(parentType: SubtaskParent, parentId: string): Promise<Subtask[]> {
  const { db } = await context(parentType, parentId);
  const { data, error } = await db.from("task_subtasks").select("*").eq("parent_type", parentType).eq("parent_id", parentId).order("position").order("created_at");
  if (error) throw new Error(error.message);
  return attachSubtaskOccurrences(db, (data ?? []) as Subtask[], todayKeySaoPaulo());
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
  /** Programação própria (independente da tarefa principal). `undefined` = não mexe. */
  recurrence?: "none" | "weekly";
  weekdays?: number[];
  recurrenceStart?: string | null;
  recurrenceUntil?: string | null;
};

export async function saveSubtask(parentType: SubtaskParent, parentId: string, input: SubtaskInput): Promise<{ error?: string; success?: boolean; warning?: string }> {
  const { db, user } = await context(parentType, parentId);
  const title = input.title.trim();
  if (!title || title.length > 300) return { error: "Informe um título de até 300 caracteres." };
  const schedule = subtaskScheduleValues(input);
  if (schedule.error) return { error: schedule.error };
  const description = normalizeSubtaskDescription(input.description);
  if (description.error) return { error: description.error };
  const todayKey = todayKeySaoPaulo();
  let warning: string | undefined;
  if (input.parentSubtaskId) {
    const { data: parent } = await db.from("task_subtasks").select("id,parent_subtask_id").eq("id",input.parentSubtaskId).eq("parent_type",parentType).eq("parent_id",parentId).eq("user_id",user.id).maybeSingle();
    if (!parent || parent.parent_subtask_id) return { error: "Só é permitido um nível de checklist dentro das etapas." };
  }
  if (input.id) {
    const id = input.id;
    const existing = await getOwnSubtask(db, parentType, parentId, id, user.id);
    if (!existing) return { error: "Subtarefa não encontrada." };
    const [withHistory] = await attachSubtaskOccurrences(db, [existing], todayKey);
    const recurrence = subtaskRecurrenceValues({ ...input, isChecklistItem: !!existing.parent_subtask_id }, todayKey, existing);
    if (recurrence.error) return { error: recurrence.error };
    const wasRecurring = isRecurringSubtask(existing);
    const definitionChanged = wasRecurring && input.recurrence !== undefined && (recurrence.values.recurrence !== "weekly" || recurrence.values.recurrence_start !== existing.recurrence_start || (recurrence.values.recurrence_until ?? null) !== (existing.recurrence_until ?? null));
    if (definitionChanged) {
      const freezeError = await freezePastSubtaskOccurrences(db, withHistory ?? existing, todayKey);
      if (freezeError) return { error: freezeError };
    }
    const base: Record<string, unknown> = { title, due_date: input.dueDate || null, updated_at: new Date().toISOString() };
    // Virou rotina: o estado passa a ser por dia — o "concluída" único não vale mais.
    if (!wasRecurring && recurrence.values.recurrence === "weekly") Object.assign(base, { is_done: false, completed_at: null });
    const update = (values: Record<string, unknown>) => db.from("task_subtasks").update(values).eq("id", id).eq("parent_type", parentType).eq("parent_id", parentId).eq("user_id", user.id);
    // Sem mudança de recorrência pedida e linha não recorrente: nem envia as colunas (funciona antes da migration).
    const recurrenceValues = recurrence.values.recurrence === "none" && !wasRecurring ? {} : recurrence.values;
    const withSchedule = await writeWithScheduleFallback(update, { ...base, ...schedule.values, ...recurrenceValues, ...(description.value !== undefined ? { description: description.value } : {}) });
    warning = withSchedule.warning;
    let { error } = withSchedule;
    // Banco ainda sem a coluna (migration pendente): salva o resto e avisa.
    if (error && description.value !== undefined && isMissingDescriptionColumn(error)) {
      ({ error } = await writeWithScheduleFallback(update, { ...base, ...schedule.values, ...recurrenceValues }));
      if (!error && description.value) warning = MISSING_DESCRIPTION_WARNING;
    }
    if (error) return { error: error.message };
  } else {
    const recurrence = input.recurrence === "weekly" ? subtaskRecurrenceValues({ ...input, isChecklistItem: !!input.parentSubtaskId }, todayKey) : { values: {} as Record<string, unknown> };
    if (recurrence.error) return { error: recurrence.error };
    const { data } = await db.from("task_subtasks").select("position").eq("parent_type", parentType).eq("parent_id", parentId).order("position", { ascending: false }).limit(1);
    const row: Record<string, unknown> = { parent_type: parentType, parent_id: parentId, user_id: user.id, title, due_date: input.dueDate || null, parent_subtask_id: input.parentSubtaskId || null, position: (data?.[0]?.position ?? -1) + 1, ...schedule.values, ...recurrence.values };
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

/** Itens do checklist ainda abertos (validação de conclusão da etapa). */
async function pendingChecklist(db: SupabaseClient, parentType: SubtaskParent, parentId: string, id: string): Promise<string[]> {
  const { data: children } = await db.from("task_subtasks").select("id,is_done").eq("parent_subtask_id",id).eq("parent_type",parentType).eq("parent_id",parentId);
  return (children ?? []).filter((x) => !x.is_done).map((x) => x.id as string);
}

export async function setSubtaskDone(parentType: SubtaskParent, parentId: string, id: string, done: boolean): Promise<{ error?: string; success?: boolean; pendingChecklist?: string[] }> {
  const { db, user } = await context(parentType, parentId);
  if (done) {
    const pending = await pendingChecklist(db, parentType, parentId, id);
    if (pending.length) return { error: "Conclua os itens do checklist antes de finalizar a etapa.", pendingChecklist: pending };
  }
  const now = new Date().toISOString();
  const update = (values: Record<string, unknown>) => db.from("task_subtasks").update(values).eq("id", id).eq("parent_type", parentType).eq("parent_id", parentId).eq("user_id", user.id);
  const { error } = await writeWithScheduleFallback(update, { is_done: done, completed_at: done ? now : null, updated_at: now });
  if (error) return { error: error.message };
  refresh();
  return { success: true };
}

/**
 * Conclui/reabre UM dia de uma subtarefa recorrente — nunca os outros dias.
 * `unique(subtask_id, occurrence_date)` + upsert impedem duplicar mesmo com
 * dois cliques/abas ao mesmo tempo. Desmarcar mantém a linha como
 * 'pendente' (o histórico do dia continua).
 */
export async function setSubtaskOccurrenceDone(parentType: SubtaskParent, parentId: string, id: string, occurrenceDate: string, done: boolean): Promise<{ error?: string; success?: boolean; pendingChecklist?: string[] }> {
  const { db, user } = await context(parentType, parentId);
  if (!DATE_KEY.test(occurrenceDate)) return { error: "Data inválida." };
  const todayKey = todayKeySaoPaulo();
  if (occurrenceDate > todayKey) return { error: "Não é possível concluir um dia que ainda não chegou." };
  const sub = await getOwnSubtask(db, parentType, parentId, id, user.id);
  if (!sub || !isRecurringSubtask(sub)) return { error: "Subtarefa recorrente não encontrada." };
  const { data: existing, error: existingError } = await db.from("task_subtask_occurrences").select("id").eq("subtask_id", id).eq("occurrence_date", occurrenceDate).maybeSingle();
  if (existingError) return { error: isMissingSchema(existingError) ? MISSING_RECURRENCE_ERROR : existingError.message };
  if (!existing && !subtaskOccursOn(sub, occurrenceDate)) return { error: "Esta subtarefa não acontece nesse dia." };
  if (done) {
    const pending = await pendingChecklist(db, parentType, parentId, id);
    if (pending.length) return { error: "Conclua os itens do checklist antes de finalizar a etapa.", pendingChecklist: pending };
  }
  const { error } = await db.from("task_subtask_occurrences").upsert(
    { subtask_id: id, user_id: user.id, occurrence_date: occurrenceDate, status: done ? "concluida" : "pendente", completed_at: done ? new Date().toISOString() : null, title: sub.title },
    { onConflict: "subtask_id,occurrence_date" },
  );
  if (error) return { error: isMissingSchema(error) ? MISSING_RECURRENCE_ERROR : error.message };
  refresh();
  return { success: true };
}

/** Só a prioridade (Normal/Importante) de um item ou subtarefa — não mexe na prioridade da tarefa principal. */
export async function setSubtaskPriority(parentType: SubtaskParent, parentId: string, id: string, priority: "normal" | "importante") {
  const { db, user } = await context(parentType, parentId);
  if (priority !== "normal" && priority !== "importante") return { error: "Prioridade inválida." };
  const { error } = await db.from("task_subtasks").update({ priority, updated_at: new Date().toISOString() }).eq("id", id).eq("parent_type", parentType).eq("parent_id", parentId).eq("user_id", user.id);
  if (error) return { error: isMissingColumnError(error) ? "Prioridade nos itens precisa da migração 20261102100000 aplicada no Supabase." : error.message };
  refresh();
  return { success: true };
}

/**
 * Exclui. Subtarefa recorrente que já tem execuções gravadas é ARQUIVADA
 * (some das listas, para de gerar dias) para não apagar o histórico.
 */
export async function deleteSubtask(parentType: SubtaskParent, parentId: string, id: string) {
  const { db, user } = await context(parentType, parentId);
  const sub = await getOwnSubtask(db, parentType, parentId, id, user.id);
  if (sub && isRecurringSubtask(sub)) {
    const { count, error: countError } = await db.from("task_subtask_occurrences").select("id", { count: "exact", head: true }).eq("subtask_id", id);
    if (countError && !isMissingSchema(countError)) return { error: countError.message };
    if ((count ?? 0) > 0) {
      const todayKey = todayKeySaoPaulo();
      const until = addDaysToKey(todayKey, -1);
      const start = sub.recurrence_start && sub.recurrence_start > until ? addDaysToKey(until, 1) : sub.recurrence_start;
      const { error } = await db.from("task_subtasks").update({ archived_at: new Date().toISOString(), recurrence_until: until, recurrence_start: start }).eq("id", id).eq("user_id", user.id);
      if (error) return { error: error.message };
      refresh();
      return { success: true };
    }
  }
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
