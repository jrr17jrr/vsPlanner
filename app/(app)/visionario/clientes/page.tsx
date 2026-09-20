import { requireModulePermission } from "@/lib/supabase/dal";
import { hasModulePermission } from "@/lib/supabase/repositories/permissions.repository";
import {
  listClients,
  listAllClientServices,
  listServices,
} from "@/lib/supabase/repositories/clients.repository";
import { listSpaceMemberProfiles } from "@/lib/supabase/repositories/meetings.repository";
import { VISIONARIO_DEV_SLUG } from "@/lib/space-slugs";
import { ClientesPageClient } from "@/components/visionario/clientes/clientes-page-client";

export default async function ClientesPage() {
  const { space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "clientes", "view");

  const [clients, clientServices, services, members, canCreate] = await Promise.all([
    listClients(space.id),
    listAllClientServices(space.id),
    listServices(space.id),
    listSpaceMemberProfiles(space.id),
    hasModulePermission(space.id, "clientes", "create"),
  ]);

  return (
    <ClientesPageClient
      clients={clients}
      clientServices={clientServices}
      services={services}
      members={members}
      permissions={{ canCreate }}
    />
  );
}
