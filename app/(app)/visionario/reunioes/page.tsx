import { requireModulePermission } from "@/lib/supabase/dal";
import { hasModulePermission } from "@/lib/supabase/repositories/permissions.repository";
import {
  listMeetings,
  listAllMeetingParticipants,
  listSpaceMemberProfiles,
} from "@/lib/supabase/repositories/meetings.repository";
import { listClients } from "@/lib/supabase/repositories/clients.repository";
import { VISIONARIO_DEV_SLUG } from "@/lib/space-slugs";
import { ReunioesPageClient } from "@/components/visionario/reunioes/reunioes-page-client";

export default async function ReunioesPage() {
  const { profile, space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "reunioes", "view");

  const [meetings, participants, members, clients, canCreate, canEdit, canDelete, canConclude] =
    await Promise.all([
      listMeetings(space.id),
      listAllMeetingParticipants(space.id),
      listSpaceMemberProfiles(space.id),
      // RLS de `clients` (clientes.view) filtra sozinha — se o usuário não
      // tiver acesso a Clientes, isto volta vazio e o seletor de cliente
      // no formulário simplesmente não aparece (só "avulso").
      listClients(space.id),
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
      clients={clients}
      currentUserId={profile.id}
      permissions={{ canCreate, canEdit, canDelete, canConclude }}
    />
  );
}
