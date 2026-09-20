import { requireModulePermission } from "@/lib/supabase/dal";
import { hasModulePermission } from "@/lib/supabase/repositories/permissions.repository";
import {
  listMeetings,
  listAllMeetingParticipants,
  listSpaceMemberProfiles,
} from "@/lib/supabase/repositories/meetings.repository";
import { VISIONARIO_DEV_SLUG } from "@/lib/space-slugs";
import { ReunioesPageClient } from "@/components/visionario/reunioes/reunioes-page-client";

export default async function ReunioesPage() {
  const { profile, space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "reunioes", "view");

  const [meetings, participants, members, canCreate, canEdit, canDelete, canConclude] = await Promise.all([
    listMeetings(space.id),
    listAllMeetingParticipants(space.id),
    listSpaceMemberProfiles(space.id),
    hasModulePermission(space.id, "reunioes", "create"),
    hasModulePermission(space.id, "reunioes", "edit"),
    hasModulePermission(space.id, "reunioes", "delete"),
    hasModulePermission(space.id, "reunioes", "conclude"),
  ]);

  return (
    <ReunioesPageClient
      meetings={meetings}
      participants={participants}
      members={members}
      currentUserId={profile.id}
      permissions={{ canCreate, canEdit, canDelete, canConclude }}
    />
  );
}
