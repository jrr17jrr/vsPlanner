import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { WorkItem, WorkItemAssignee } from "@/types/database.types";

/**
 * Leitura de trabalhos (migration 006). RLS (`has_module_permission`)
 * já garante que só voltam linhas do space onde o usuário tem
 * `trabalhos.view` — mesma convenção de `meetings.repository.ts`.
 */

export async function listWorkItems(spaceId: string): Promise<WorkItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("work_items")
    .select("*")
    .eq("space_id", spaceId)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getWorkItem(id: string): Promise<WorkItem | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("work_items").select("*").eq("id", id).maybeSingle();

  if (error) throw error;
  return data;
}

export async function listWorkItemsForClient(clientId: string): Promise<WorkItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("work_items")
    .select("*")
    .eq("client_id", clientId)
    .order("due_date", { ascending: true, nullsFirst: false });

  if (error) throw error;
  return data ?? [];
}

export async function listWorkItemsForMeeting(meetingId: string): Promise<WorkItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("work_items")
    .select("*")
    .eq("source_meeting_id", meetingId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function listWorkItemAssignees(workItemId: string): Promise<WorkItemAssignee[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("work_item_assignees")
    .select("*")
    .eq("work_item_id", workItemId);

  if (error) throw error;
  return data ?? [];
}

/**
 * Todos os responsáveis de todos os trabalhos do space, de uma vez — usado
 * na listagem pra não disparar uma query por card (mesma ideia de
 * `listAllMeetingParticipants`).
 */
export async function listAllWorkItemAssignees(spaceId: string): Promise<WorkItemAssignee[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("work_item_assignees")
    .select("*")
    .eq("space_id", spaceId);

  if (error) throw error;
  return data ?? [];
}
