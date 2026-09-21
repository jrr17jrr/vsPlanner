import { requireModulePermission } from "@/lib/supabase/dal";
import { hasModulePermission } from "@/lib/supabase/repositories/permissions.repository";
import { listClientSites } from "@/lib/supabase/repositories/sites.repository";
import { listClients } from "@/lib/supabase/repositories/clients.repository";
import { VISIONARIO_DEV_SLUG } from "@/lib/space-slugs";
import { SitesPageClient } from "@/components/sites/sites-page-client";

export default async function SitesDominiosPage() {
  const { space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "sites", "view");

  const [sites, clients, canCreate, canEdit, canDelete] = await Promise.all([
    listClientSites(space.id),
    listClients(space.id),
    hasModulePermission(space.id, "sites", "create"),
    hasModulePermission(space.id, "sites", "edit"),
    hasModulePermission(space.id, "sites", "delete"),
  ]);

  return <SitesPageClient sites={sites} clients={clients} permissions={{ canCreate, canEdit, canDelete }} />;
}
