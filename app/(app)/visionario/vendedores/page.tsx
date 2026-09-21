import { requireModulePermission } from "@/lib/supabase/dal";
import { hasModulePermission } from "@/lib/supabase/repositories/permissions.repository";
import { listVendors, listSales, listCommissions } from "@/lib/supabase/repositories/vendors.repository";
import { listClients, listServices } from "@/lib/supabase/repositories/clients.repository";
import { VISIONARIO_DEV_SLUG } from "@/lib/space-slugs";
import { VendedoresPageClient } from "@/components/vendedores/vendedores-page-client";

export default async function VendedoresPage() {
  const { space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "vendedores", "view");

  const [vendors, sales, commissions, clients, services, canCreate, canEdit, canDelete] = await Promise.all([
    listVendors(space.id),
    listSales(space.id),
    listCommissions(space.id),
    listClients(space.id),
    listServices(space.id),
    hasModulePermission(space.id, "vendedores", "create"),
    hasModulePermission(space.id, "vendedores", "edit"),
    hasModulePermission(space.id, "vendedores", "delete"),
  ]);

  return (
    <VendedoresPageClient
      vendors={vendors}
      sales={sales}
      commissions={commissions}
      clients={clients}
      services={services}
      permissions={{ canCreate, canEdit, canDelete }}
    />
  );
}
