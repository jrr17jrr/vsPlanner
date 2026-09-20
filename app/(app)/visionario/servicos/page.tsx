import { requireModulePermission } from "@/lib/supabase/dal";
import { hasModulePermission } from "@/lib/supabase/repositories/permissions.repository";
import { listServices, listAllClientServices } from "@/lib/supabase/repositories/clients.repository";
import { VISIONARIO_DEV_SLUG } from "@/lib/space-slugs";
import { ServicosPageClient } from "@/components/visionario/servicos/servicos-page-client";

export default async function ServicosPage() {
  const { space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "servicos", "view");

  const [services, clientServices, canCreate, canEdit, canDelete] = await Promise.all([
    listServices(space.id),
    listAllClientServices(space.id),
    hasModulePermission(space.id, "servicos", "create"),
    hasModulePermission(space.id, "servicos", "edit"),
    hasModulePermission(space.id, "servicos", "delete"),
  ]);

  return (
    <ServicosPageClient
      services={services}
      clientServices={clientServices}
      permissions={{ canCreate, canEdit, canDelete }}
    />
  );
}
