import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isMissingColumnError, type Subtask } from "@/lib/task-schedule";
import type { Activity, ActivityCompletion, Goal, PersonalWorkTask, Task, TaskOccurrence } from "@/types/database.types";

/**
 * Leitura dos módulos pessoais reais (migration 008). RLS é `user_id =
 * auth.uid()` direto em cada tabela — nunca precisa filtrar por usuário
 * aqui de novo (mas o `space_id` do chamador garante que a leitura é
 * sempre do space Pessoal certo).
 */

/**
 * `includeArchived` traz também recorrentes excluídas que tinham histórico
 * (`archived_at`) — só quem monta histórico/ocorrências passadas precisa.
 */
export async function listTasks(spaceId: string, options: { includeArchived?: boolean } = {}): Promise<Task[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase.from("tasks").select("*").eq("space_id", spaceId);
  if (!options.includeArchived) query = query.is("archived_at", null);
  const { data, error } = await query
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Ocorrências (conclusões/pendências gravadas) de tarefas recorrentes num intervalo, inclusive. */
export async function listTaskOccurrences(userId: string, fromDate: string, toDate: string): Promise<TaskOccurrence[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("task_occurrences")
    .select("*")
    .eq("user_id", userId)
    .gte("occurrence_date", fromDate)
    .lte("occurrence_date", toDate);
  if (error) throw error;
  return data ?? [];
}

export async function getTask(id: string): Promise<Task | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("tasks").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function listActivities(spaceId: string): Promise<Activity[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("activities")
    .select("*")
    .eq("space_id", spaceId)
    .order("sort_order", { ascending: true })
    .order("start_time", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Conclusões num intervalo de datas (inclusive) — usado pra expandir ocorrências da rotina. */
export async function listActivityCompletions(
  userId: string,
  fromDate: string,
  toDate: string
): Promise<ActivityCompletion[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("activity_completions")
    .select("*")
    .eq("user_id", userId)
    .gte("occurrence_date", fromDate)
    .lte("occurrence_date", toDate);
  if (error) throw error;
  return data ?? [];
}

export async function listPersonalWorkTasks(spaceId: string): Promise<PersonalWorkTask[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("personal_work_tasks")
    .select("*")
    .eq("space_id", spaceId)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listGoals(spaceId: string): Promise<Goal[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("goals")
    .select("*")
    .eq("space_id", spaceId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Tarefas por id (vínculos da Rotina) — RLS garante que só voltam as do próprio usuário. */
export async function listTasksByIds(ids: string[]): Promise<Task[]> {
  if (ids.length === 0) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("tasks").select("*").in("id", ids.slice(0, 200));
  if (error) throw error;
  return data ?? [];
}

/** Subtarefas (registro original) das tarefas pessoais informadas. */
export async function listPersonalSubtasks(parentIds: string[]): Promise<Subtask[]> {
  if (parentIds.length === 0) return [];
  const supabase = await createSupabaseServerClient();
  // Lotes de 100 ids: evita URL longa demais no PostgREST com muitas tarefas.
  const chunks: string[][] = [];
  for (let i = 0; i < parentIds.length; i += 100) chunks.push(parentIds.slice(i, i + 100));
  const results = await Promise.all(
    chunks.map((ids) =>
      supabase
        .from("task_subtasks" as never)
        .select("*")
        .eq("parent_type", "pessoal")
        .in("parent_id", ids)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true })
    )
  );
  const out: Subtask[] = [];
  for (const { data, error } of results) {
    if (error) throw error;
    out.push(...((data ?? []) as unknown as Subtask[]));
  }
  return out;
}

/**
 * Subtarefas pessoais relevantes para o Meu Dia: programadas para hoje
 * (inclusive concluídas, para mostrar o progresso), prazo hoje, e
 * pendentes com execução ou prazo vencidos. Antes da migration
 * 20261102100000 (sem scheduled_date), cai para o prazo (due_date).
 */
export async function listMyDaySubtasks(userId: string, todayKey: string): Promise<Subtask[]> {
  const supabase = await createSupabaseServerClient();
  const base = () => supabase.from("task_subtasks" as never).select("*").eq("user_id", userId).eq("parent_type", "pessoal");
  const full = await base().or(
    `scheduled_date.eq.${todayKey},and(is_done.eq.false,or(scheduled_date.lt.${todayKey},due_date.lte.${todayKey}))`
  );
  if (!full.error) return (full.data ?? []) as unknown as Subtask[];
  if (!isMissingColumnError(full.error)) throw full.error;
  const legacy = await base().eq("is_done", false).lte("due_date", todayKey);
  if (legacy.error) throw legacy.error;
  return (legacy.data ?? []) as unknown as Subtask[];
}

/**
 * Subtarefas pessoais para as quatro seções do Meu Dia: pendentes com
 * execução ou prazo até `horizonKey` (inclui atrasadas) + concluídas hoje.
 * Antes da migration de agenda: só o prazo (due_date) e sem "concluídas hoje".
 */
export async function listMyDayBoardSubtasks(userId: string, todayKey: string, horizonKey: string): Promise<Subtask[]> {
  const supabase = await createSupabaseServerClient();
  const base = () => supabase.from("task_subtasks" as never).select("*").eq("user_id", userId).eq("parent_type", "pessoal");
  // Meia-noite em São Paulo (UTC-3, sem horário de verão desde 2019).
  const startOfToday = `${todayKey}T03:00:00Z`;
  const full = await base().or(
    `and(is_done.eq.false,or(scheduled_date.lte.${horizonKey},due_date.lte.${horizonKey})),completed_at.gte.${startOfToday}`
  );
  if (!full.error) return (full.data ?? []) as unknown as Subtask[];
  if (!isMissingColumnError(full.error)) throw full.error;
  const legacy = await base().eq("is_done", false).lte("due_date", horizonKey);
  if (legacy.error) throw legacy.error;
  return (legacy.data ?? []) as unknown as Subtask[];
}
