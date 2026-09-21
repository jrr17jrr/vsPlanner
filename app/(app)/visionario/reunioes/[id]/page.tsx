import { notFound } from "next/navigation";
import { requireModulePermission } from "@/lib/supabase/dal";
import { hasModulePermission } from "@/lib/supabase/repositories/permissions.repository";
import {
  getMeeting,
  listMeetingParticipants,
  listSpaceMemberProfiles,
} from "@/lib/supabase/repositories/meetings.repository";
import { listClients, getClient } from "@/lib/supabase/repositories/clients.repository";
import {
  listWorkItemsForMeeting,
  listWorkItemAssignees,
} from "@/lib/supabase/repositories/work-items.repository";
import { VISIONARIO_DEV_SLUG } from "@/lib/space-slugs";
import { MeetingDetailClient } from "@/components/visionario/reunioes/meeting-detail-client";

export default async function ReuniaoDetalhesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { profile, space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "reunioes", "view");

  const meeting = await getMeeting(id);
  // Além da RLS (que já garante isso), confirmamos aqui que a reunião é
  // mesmo do Visionário Dev deste usuário — nunca confiar num id vindo da
  // URL sem checar contra o space esperado.
  if (!meeting || meeting.space_id !== space.id) {
    notFound();
  }

  const [participants, members, clients, linkedClient, generatedWorkItems, canEdit, canDelete, canConclude, canCreateWorkItem] =
    await Promise.all([
      listMeetingParticipants(meeting.id),
      listSpaceMemberProfiles(space.id),
      listClients(space.id),
      meeting.client_id ? getClient(meeting.client_id) : Promise.resolve(null),
      listWorkItemsForMeeting(meeting.id),
      hasModulePermission(space.id, "reunioes", "edit"),
      hasModulePermission(space.id, "reunioes", "delete"),
      hasModulePermission(space.id, "reunioes", "conclude"),
      hasModulePermission(space.id, "trabalhos", "create"),
    ]);

  const workItemAssigneesLists = await Promise.all(
    generatedWorkItems.map((w) => listWorkItemAssignees(w.id))
  );
  const nameById = new Map(members.map((m) => [m.id, m.name]));
  const assigneeNamesByWorkItem: Record<string, string[]> = {};
  generatedWorkItems.forEach((w, i) => {
    assigneeNamesByWorkItem[w.id] = workItemAssigneesLists[i]
      .map((a) => nameById.get(a.user_id))
      .filter((n): n is string => !!n);
  });

  return (
    <MeetingDetailClient
      meeting={meeting}
      participantUserIds={participants.map((p) => p.user_id)}
      members={members}
      clients={clients}
      linkedClient={linkedClient}
      generatedWorkItems={generatedWorkItems}
      assigneeNamesByWorkItem={assigneeNamesByWorkItem}
      canCreateWorkItem={canCreateWorkItem}
      currentUserId={profile.id}
      permissions={{ canEdit, canDelete, canConclude }}
    />
  );
}
