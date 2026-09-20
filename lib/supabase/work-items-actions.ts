"use server";

import { revalidatePath } from "next/cache";
import { requireModulePermission, requireActiveProfile, findOrBootstrapSpace } from "@/lib/supabase/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasModulePermission } from "@/lib/supabase/repositories/permissions.repository";
import { listSpaceMemberProfiles } from "@/lib/supabase/repositories/meetings.repository";
import { VISIONARIO_DEV_SLUG } from "@/lib/space-slugs";
import { toDateKey } from "@/lib/format";
import type { WorkItem, WorkItemPriority } from "@/types/database.types";

export type WorkItemActionState = {
  error?: string;
  success?: string;
  workItemId?: string;
};

export type WorkItemFormInput = {
  title: string;
  description?: string;
  clientId?: string;
  serviceId?: string;
  dueDate?: string; // yyyy-mm-dd
  priority: WorkItemPriority;
  notes?: string;
  /** Responsáveis reais — 0, 1 ou vários (só Ricardo, só outro, os dois, futuramente mais). */
  assigneeIds: string[];
};

/**
 * Mesma disciplina de `meetings-actions.ts`: toda action chama
 * `requireModulePermission()` de novo, nunca recebe `space_id` do client, e
 * usa a sessão normal (nunca Service Role) — `has_module_permission` na
 * RLS é a proteção real.
 */

function validateInput(input: WorkItemFormInput): string | null {
  if (!input.title.trim()) return "Título é obrigatório.";
  return null;
}

async function assertClientBelongsToSpace(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  clientId: string | undefined,
  spaceId: string
): Promise<string | null> {
  if (!clientId) return null;

  const { data, error } = await supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("space_id", spaceId)
    .maybeSingle();

  if (error) return error.message;
  if (!data) return "Cliente selecionado não pertence a este espaço.";
  return null;
}

async function assertServiceBelongsToSpace(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  serviceId: string | undefined,
  spaceId: string
): Promise<string | null> {
  if (!serviceId) return null;

  const { data, error } = await supabase
    .from("services")
    .select("id")
    .eq("id", serviceId)
    .eq("space_id", spaceId)
    .maybeSingle();

  if (error) return error.message;
  if (!data) return "Serviço selecionado não pertence a este espaço.";
  return null;
}

async function syncAssignees(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  workItemId: string,
  desiredIds: string[]
): Promise<string | null> {
  const desired = new Set(desiredIds);

  const { data: current, error: currentError } = await supabase
    .from("work_item_assignees")
    .select("id, user_id")
    .eq("work_item_id", workItemId);

  if (currentError) return currentError.message;

  const currentIds = new Set((current ?? []).map((a) => a.user_id));
  const toAdd = Array.from(desired).filter((id) => !currentIds.has(id));
  const toRemove = (current ?? []).filter((a) => !desired.has(a.user_id));

  if (toAdd.length > 0) {
    const { error: addError } = await supabase.from("work_item_assignees").upsert(
      toAdd.map((userId) => ({ work_item_id: workItemId, user_id: userId })),
      { onConflict: "work_item_id,user_id", ignoreDuplicates: true }
    );
    if (addError) return addError.message;
  }

  if (toRemove.length > 0) {
    const { error: removeError } = await supabase
      .from("work_item_assignees")
      .delete()
      .in(
        "id",
        toRemove.map((a) => a.id)
      );
    if (removeError) return removeError.message;
  }

  return null;
}

export async function createWorkItemAction(input: WorkItemFormInput): Promise<WorkItemActionState> {
  const { profile, space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "trabalhos", "create");

  const validationError = validateInput(input);
  if (validationError) return { error: validationError };

  const supabase = await createSupabaseServerClient();

  const clientError = await assertClientBelongsToSpace(supabase, input.clientId, space.id);
  if (clientError) return { error: clientError };
  const serviceError = await assertServiceBelongsToSpace(supabase, input.serviceId, space.id);
  if (serviceError) return { error: serviceError };

  const { data: workItem, error } = await supabase
    .from("work_items")
    .insert({
      space_id: space.id,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      client_id: input.clientId || null,
      service_id: input.serviceId || null,
      due_date: input.dueDate || null,
      priority: input.priority,
      notes: input.notes?.trim() || null,
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  if (input.assigneeIds.length > 0) {
    const assigneeError = await syncAssignees(supabase, workItem.id, input.assigneeIds);
    if (assigneeError) return { error: assigneeError };
  }

  revalidatePath("/visionario/trabalhos");
  return { success: "Trabalho criado.", workItemId: workItem.id };
}

/**
 * Cria um trabalho a partir de uma reunião concluída — usado pela seção
 * "Atividades geradas" da tela de reunião. `sourceMeetingId` precisa ser
 * uma reunião do MESMO space (mesma checagem de `assertClientBelongsToSpace`,
 * adaptada). Continua sendo UMA atividade só, com N responsáveis via
 * `work_item_assignees` — nunca duplicada por usuário.
 */
export async function createWorkItemFromMeetingAction(
  sourceMeetingId: string,
  input: WorkItemFormInput
): Promise<WorkItemActionState> {
  const { profile, space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "trabalhos", "create");

  const validationError = validateInput(input);
  if (validationError) return { error: validationError };

  const supabase = await createSupabaseServerClient();

  const { data: meeting, error: meetingError } = await supabase
    .from("meetings")
    .select("id, client_id")
    .eq("id", sourceMeetingId)
    .eq("space_id", space.id)
    .maybeSingle();

  if (meetingError) return { error: meetingError.message };
  if (!meeting) return { error: "Reunião não encontrada neste espaço." };

  const { data: workItem, error } = await supabase
    .from("work_items")
    .insert({
      space_id: space.id,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      client_id: input.clientId || meeting.client_id || null,
      service_id: input.serviceId || null,
      source_meeting_id: sourceMeetingId,
      due_date: input.dueDate || null,
      priority: input.priority,
      notes: input.notes?.trim() || null,
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  if (input.assigneeIds.length > 0) {
    const assigneeError = await syncAssignees(supabase, workItem.id, input.assigneeIds);
    if (assigneeError) return { error: assigneeError };
  }

  revalidatePath("/visionario/trabalhos");
  revalidatePath(`/visionario/reunioes/${sourceMeetingId}`);
  return { success: "Trabalho criado a partir da reunião.", workItemId: workItem.id };
}

export async function updateWorkItemAction(
  workItemId: string,
  input: WorkItemFormInput
): Promise<WorkItemActionState> {
  const { space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "trabalhos", "edit");

  const validationError = validateInput(input);
  if (validationError) return { error: validationError };

  const supabase = await createSupabaseServerClient();

  const clientError = await assertClientBelongsToSpace(supabase, input.clientId, space.id);
  if (clientError) return { error: clientError };
  const serviceError = await assertServiceBelongsToSpace(supabase, input.serviceId, space.id);
  if (serviceError) return { error: serviceError };

  const { data, error } = await supabase
    .from("work_items")
    .update({
      title: input.title.trim(),
      description: input.description?.trim() || null,
      client_id: input.clientId || null,
      service_id: input.serviceId || null,
      due_date: input.dueDate || null,
      priority: input.priority,
      notes: input.notes?.trim() || null,
    })
    .eq("id", workItemId)
    .eq("space_id", space.id)
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "Trabalho não encontrado." };

  const assigneeError = await syncAssignees(supabase, workItemId, input.assigneeIds);
  if (assigneeError) return { error: assigneeError };

  revalidatePath("/visionario/trabalhos");
  return { success: "Trabalho atualizado." };
}

export async function updateWorkItemStatusAction(
  workItemId: string,
  status: WorkItem["status"]
): Promise<WorkItemActionState> {
  const action = status === "concluido" ? "conclude" : "edit";
  const { space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "trabalhos", action);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("work_items")
    .update({ status })
    .eq("id", workItemId)
    .eq("space_id", space.id)
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "Trabalho não encontrado." };

  revalidatePath("/visionario/trabalhos");
  return { success: "Status atualizado." };
}

export async function deleteWorkItemAction(workItemId: string): Promise<WorkItemActionState> {
  const { space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "trabalhos", "delete");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("work_items").delete().eq("id", workItemId).eq("space_id", space.id);

  if (error) return { error: error.message };

  revalidatePath("/visionario/trabalhos");
  return { success: "Trabalho excluído." };
}

/**
 * Trabalhos com prazo hoje em que o usuário atual é responsável — mesmo
 * padrão de `getTodayMeetingsForHoje()`: não redireciona, só devolve lista
 * vazia se não houver Visionário Dev/permissão, pra "Hoje" continuar
 * funcionando pra quem não usa o módulo. Preparado agora; a integração
 * visual em `/hoje` só entra depois que a migration 006 existir de
 * verdade.
 */
export async function getTodayWorkItemsForHoje(): Promise<{
  workItems: WorkItem[];
  assigneeNamesByWorkItem: Record<string, string[]>;
}> {
  const { profile } = await requireActiveProfile();

  const space = await findOrBootstrapSpace(VISIONARIO_DEV_SLUG, profile);
  if (!space) return { workItems: [], assigneeNamesByWorkItem: {} };

  const allowed = await hasModulePermission(space.id, "trabalhos", "view");
  if (!allowed) return { workItems: [], assigneeNamesByWorkItem: {} };

  const supabase = await createSupabaseServerClient();
  const todayKey = toDateKey(new Date());

  const { data: dueTodayItems, error } = await supabase
    .from("work_items")
    .select("*")
    .eq("space_id", space.id)
    .eq("due_date", todayKey)
    .neq("status", "concluido");

  if (error) throw error;
  if (!dueTodayItems || dueTodayItems.length === 0) {
    return { workItems: [], assigneeNamesByWorkItem: {} };
  }

  const { data: myAssignments, error: assignmentError } = await supabase
    .from("work_item_assignees")
    .select("work_item_id")
    .eq("user_id", profile.id)
    .in(
      "work_item_id",
      dueTodayItems.map((w) => w.id)
    );

  if (assignmentError) throw assignmentError;

  const myWorkItemIds = new Set((myAssignments ?? []).map((a) => a.work_item_id));
  const myWorkItems = dueTodayItems.filter((w) => myWorkItemIds.has(w.id));

  if (myWorkItems.length === 0) {
    return { workItems: [], assigneeNamesByWorkItem: {} };
  }

  const [members, assigneesResult] = await Promise.all([
    listSpaceMemberProfiles(space.id),
    supabase
      .from("work_item_assignees")
      .select("work_item_id, user_id")
      .in(
        "work_item_id",
        myWorkItems.map((w) => w.id)
      ),
  ]);

  if (assigneesResult.error) throw assigneesResult.error;

  const nameById = new Map(members.map((m) => [m.id, m.name]));
  const namesByWorkItem: Record<string, string[]> = {};
  for (const a of assigneesResult.data ?? []) {
    const name = nameById.get(a.user_id);
    if (!name) continue;
    namesByWorkItem[a.work_item_id] = [...(namesByWorkItem[a.work_item_id] ?? []), name];
  }

  return { workItems: myWorkItems, assigneeNamesByWorkItem: namesByWorkItem };
}
