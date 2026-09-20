import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Meeting, MeetingParticipant, SpaceMemberProfile } from "@/types/database.types";

/**
 * Leitura de reuniões (migration 003). RLS (`has_module_permission`) já
 * garante que só voltam linhas do space onde o usuário tem `reunioes.view`
 * — nenhuma checagem extra é necessária aqui, mas as páginas ainda
 * confirmam `meeting.space_id` contra o space esperado (ver
 * `app/(app)/visionario/reunioes/[id]/page.tsx`) por clareza/robustez.
 */

export async function listMeetings(spaceId: string): Promise<Meeting[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("meetings")
    .select("*")
    .eq("space_id", spaceId)
    .order("meeting_date", { ascending: false })
    .order("start_time", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getMeeting(id: string): Promise<Meeting | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("meetings")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function listMeetingParticipants(meetingId: string): Promise<MeetingParticipant[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("meeting_participants")
    .select("*")
    .eq("meeting_id", meetingId);

  if (error) throw error;
  return data ?? [];
}

/**
 * Todos os participantes de todas as reuniões do space, de uma vez — usado
 * na listagem pra não disparar uma query por card.
 */
export async function listAllMeetingParticipants(spaceId: string): Promise<MeetingParticipant[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("meeting_participants")
    .select("*")
    .eq("space_id", spaceId);

  if (error) throw error;
  return data ?? [];
}

/**
 * Nome/avatar de quem é membro do space (migration 004) — usado pro
 * seletor de participantes e pra resolver nomes de responsável/
 * participantes na listagem e nos detalhes.
 */
export async function listSpaceMemberProfiles(spaceId: string): Promise<SpaceMemberProfile[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("space_member_profiles", { p_space_id: spaceId });

  if (error) throw error;
  return data ?? [];
}
