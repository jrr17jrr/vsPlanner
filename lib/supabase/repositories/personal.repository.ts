import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Activity, ActivityCompletion, Goal, PersonalWorkTask, Task } from "@/types/database.types";

/**
 * Leitura dos módulos pessoais reais (migration 008). RLS é `user_id =
 * auth.uid()` direto em cada tabela — nunca precisa filtrar por usuário
 * aqui de novo (mas o `space_id` do chamador garante que a leitura é
 * sempre do space Pessoal certo).
 */

export async function listTasks(spaceId: string): Promise<Task[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("space_id", spaceId)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
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
