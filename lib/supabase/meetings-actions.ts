"use server";

import { revalidatePath } from "next/cache";
import { requireModulePermission } from "@/lib/supabase/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { VISIONARIO_DEV_SLUG } from "@/lib/space-slugs";

export type MeetingActionState = {
  error?: string;
  success?: string;
  meetingId?: string;
};

export type MeetingFormInput = {
  title: string;
  description?: string;
  agenda?: string;
  notes?: string;
  clientName?: string;
  contactName?: string;
  contactPhone?: string;
  meetingDate: string; // yyyy-mm-dd
  startTime: string; // HH:mm
  endTime?: string;
  location?: string;
  meetingLink?: string;
  responsibleId: string;
  /** Participantes internos além do responsável (que sempre entra, via trigger). */
  participantIds: string[];
};

/**
 * Todas as actions abaixo:
 *  - chamam `requireModulePermission()` de novo, mesmo que só sejam
 *    acionadas a partir de telas já protegidas — nunca confiar só na rota
 *    estar escondida;
 *  - nunca recebem `space_id` do client: `requireModulePermission()` acha o
 *    Visionário Dev do usuário autenticado e é esse `space.id` que é usado
 *    em toda escrita, então não tem como forjar um `space_id` de outro
 *    space;
 *  - usam a sessão normal (via `createSupabaseServerClient()`), nunca
 *    Service Role — a própria RLS (`has_module_permission`) é a proteção.
 */

function validateInput(input: MeetingFormInput): string | null {
  if (!input.title.trim()) return "Título é obrigatório.";
  if (!input.meetingDate) return "Data é obrigatória.";
  if (!input.startTime) return "Horário inicial é obrigatório.";
  if (!input.responsibleId) return "Escolha um responsável principal.";
  return null;
}

export async function createMeetingAction(input: MeetingFormInput): Promise<MeetingActionState> {
  const { profile, space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "reunioes", "create");

  const validationError = validateInput(input);
  if (validationError) return { error: validationError };

  const supabase = await createSupabaseServerClient();

  const { data: meeting, error } = await supabase
    .from("meetings")
    .insert({
      space_id: space.id,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      agenda: input.agenda?.trim() || null,
      notes: input.notes?.trim() || null,
      client_name: input.clientName?.trim() || null,
      contact_name: input.contactName?.trim() || null,
      contact_phone: input.contactPhone?.trim() || null,
      meeting_date: input.meetingDate,
      start_time: input.startTime,
      end_time: input.endTime || null,
      location: input.location?.trim() || null,
      meeting_link: input.meetingLink?.trim() || null,
      responsible_id: input.responsibleId,
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  const participantIds = Array.from(new Set([input.responsibleId, ...input.participantIds]));
  const { error: participantsError } = await supabase.from("meeting_participants").upsert(
    participantIds.map((userId) => ({ meeting_id: meeting.id, user_id: userId })),
    { onConflict: "meeting_id,user_id", ignoreDuplicates: true }
  );

  if (participantsError) return { error: participantsError.message };

  revalidatePath("/visionario/reunioes");
  return { success: "Reunião criada.", meetingId: meeting.id };
}

export async function updateMeetingAction(
  meetingId: string,
  input: MeetingFormInput
): Promise<MeetingActionState> {
  const { space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "reunioes", "edit");

  const validationError = validateInput(input);
  if (validationError) return { error: validationError };

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("meetings")
    .update({
      title: input.title.trim(),
      description: input.description?.trim() || null,
      agenda: input.agenda?.trim() || null,
      notes: input.notes?.trim() || null,
      client_name: input.clientName?.trim() || null,
      contact_name: input.contactName?.trim() || null,
      contact_phone: input.contactPhone?.trim() || null,
      meeting_date: input.meetingDate,
      start_time: input.startTime,
      end_time: input.endTime || null,
      location: input.location?.trim() || null,
      meeting_link: input.meetingLink?.trim() || null,
      responsible_id: input.responsibleId,
    })
    .eq("id", meetingId)
    .eq("space_id", space.id)
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "Reunião não encontrada." };

  const desired = new Set([input.responsibleId, ...input.participantIds]);

  const { data: current, error: currentError } = await supabase
    .from("meeting_participants")
    .select("id, user_id")
    .eq("meeting_id", meetingId);

  if (currentError) return { error: currentError.message };

  const currentIds = new Set((current ?? []).map((p) => p.user_id));
  const toAdd = Array.from(desired).filter((id) => !currentIds.has(id));
  const toRemove = (current ?? []).filter((p) => !desired.has(p.user_id));

  if (toAdd.length > 0) {
    const { error: addError } = await supabase.from("meeting_participants").upsert(
      toAdd.map((userId) => ({ meeting_id: meetingId, user_id: userId })),
      { onConflict: "meeting_id,user_id", ignoreDuplicates: true }
    );
    if (addError) return { error: addError.message };
  }

  if (toRemove.length > 0) {
    const { error: removeError } = await supabase
      .from("meeting_participants")
      .delete()
      .in(
        "id",
        toRemove.map((p) => p.id)
      );
    if (removeError) return { error: removeError.message };
  }

  revalidatePath("/visionario/reunioes");
  revalidatePath(`/visionario/reunioes/${meetingId}`);
  return { success: "Reunião atualizada." };
}

export async function concludeMeetingAction(
  meetingId: string,
  outcome: { summary?: string; decisions?: string; finalNotes?: string }
): Promise<MeetingActionState> {
  const { space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "reunioes", "conclude");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("meetings")
    .update({
      status: "realizada",
      summary: outcome.summary?.trim() || null,
      decisions: outcome.decisions?.trim() || null,
      final_notes: outcome.finalNotes?.trim() || null,
    })
    .eq("id", meetingId)
    .eq("space_id", space.id)
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "Reunião não encontrada." };

  revalidatePath("/visionario/reunioes");
  revalidatePath(`/visionario/reunioes/${meetingId}`);
  return { success: "Reunião concluída." };
}

export async function cancelMeetingAction(meetingId: string): Promise<MeetingActionState> {
  const { space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "reunioes", "edit");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("meetings")
    .update({ status: "cancelada" })
    .eq("id", meetingId)
    .eq("space_id", space.id)
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "Reunião não encontrada." };

  revalidatePath("/visionario/reunioes");
  revalidatePath(`/visionario/reunioes/${meetingId}`);
  return { success: "Reunião cancelada." };
}

export async function deleteMeetingAction(meetingId: string): Promise<MeetingActionState> {
  const { space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "reunioes", "delete");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("meetings")
    .delete()
    .eq("id", meetingId)
    .eq("space_id", space.id);

  if (error) return { error: error.message };

  revalidatePath("/visionario/reunioes");
  return { success: "Reunião excluída." };
}
