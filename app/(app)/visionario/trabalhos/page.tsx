import { requireModulePermission } from "@/lib/supabase/dal";
import { hasModulePermission } from "@/lib/supabase/repositories/permissions.repository";
import { listWorkItems, listAllWorkItemAssignees } from "@/lib/supabase/repositories/work-items.repository";
import { listSpaceMemberProfiles } from "@/lib/supabase/repositories/meetings.repository";
import { listClients, listServices } from "@/lib/supabase/repositories/clients.repository";
import { VISIONARIO_DEV_SLUG } from "@/lib/space-slugs";
import { TrabalhosPageClient } from "@/components/visionario/trabalhos/trabalhos-page-client";

export default async function TrabalhosPage() {
  const { profile, space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "trabalhos", "view");

  const [workItems, assignees, members, clients, services, canCreate, canEdit, canDelete, canConclude] =
    await Promise.all([
      listWorkItems(space.id),
      listAllWorkItemAssignees(space.id),
      listSpaceMemberProfiles(space.id),
      listClients(space.id),
      listServices(space.id),
      hasModulePermission(space.id, "trabalhos", "create"),
      hasModulePermission(space.id, "trabalhos", "edit"),
      hasModulePermission(space.id, "trabalhos", "delete"),
      hasModulePermission(space.id, "trabalhos", "conclude"),
    ]);

  return (
    <TrabalhosPageClient
      workItems={workItems}
      assignees={assignees}
      members={members}
      clients={clients}
      services={services}
      currentUserId={profile.id}
      permissions={{ canCreate, canEdit, canDelete, canConclude }}
    />
  );
}
