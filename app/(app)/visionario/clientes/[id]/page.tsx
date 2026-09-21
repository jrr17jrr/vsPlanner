import { notFound } from "next/navigation";
import { requireModulePermission } from "@/lib/supabase/dal";
import { hasModulePermission } from "@/lib/supabase/repositories/permissions.repository";
import {
  getClient,
  listClientServices,
  listServices,
  listMeetingsForClient,
} from "@/lib/supabase/repositories/clients.repository";
import { listSpaceMemberProfiles } from "@/lib/supabase/repositories/meetings.repository";
import { listWorkItemsForClient } from "@/lib/supabase/repositories/work-items.repository";
import { listClientSitesForClient } from "@/lib/supabase/repositories/sites.repository";
import { listSalesForClient } from "@/lib/supabase/repositories/vendors.repository";
import {
  listFinancialChargesForClient,
  listFinancialPaymentsForCharges,
} from "@/lib/supabase/repositories/financial.repository";
import { VISIONARIO_DEV_SLUG } from "@/lib/space-slugs";
import { ClientDetailClient } from "@/components/visionario/clientes/client-detail-client";

/**
 * Cliente 360 — cada bloco extra (trabalhos, financeiro, sites, vendas)
 * só é buscado se o usuário tiver a permissão do módulo correspondente.
 * Sem `financeiro.view`, os dados financeiros do cliente nem chegam a
 * ser consultados aqui.
 */
export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "clientes", "view");

  const client = await getClient(id);
  if (!client || client.space_id !== space.id) {
    notFound();
  }

  const [
    contracts,
    services,
    meetings,
    members,
    canEditClient,
    canDeleteClient,
    canCreateContract,
    canEditContract,
    canDeleteContract,
    canViewTrabalhos,
    canViewFinanceiro,
    canViewSites,
    canViewVendedores,
  ] = await Promise.all([
    listClientServices(client.id),
    listServices(space.id),
    listMeetingsForClient(client.id),
    listSpaceMemberProfiles(space.id),
    hasModulePermission(space.id, "clientes", "edit"),
    hasModulePermission(space.id, "clientes", "delete"),
    hasModulePermission(space.id, "servicos", "create"),
    hasModulePermission(space.id, "servicos", "edit"),
    hasModulePermission(space.id, "servicos", "delete"),
    hasModulePermission(space.id, "trabalhos", "view"),
    hasModulePermission(space.id, "financeiro", "view"),
    hasModulePermission(space.id, "sites", "view"),
    hasModulePermission(space.id, "vendedores", "view"),
  ]);

  const [workItems, sites, sales] = await Promise.all([
    canViewTrabalhos ? listWorkItemsForClient(client.id) : Promise.resolve([]),
    canViewSites ? listClientSitesForClient(client.id) : Promise.resolve([]),
    canViewVendedores ? listSalesForClient(client.id) : Promise.resolve([]),
  ]);

  const charges = canViewFinanceiro ? await listFinancialChargesForClient(client.id) : [];
  const payments = canViewFinanceiro ? await listFinancialPaymentsForCharges(charges.map((c) => c.id)) : [];

  return (
    <ClientDetailClient
      client={client}
      contracts={contracts}
      services={services}
      meetings={meetings}
      members={members}
      workItems={workItems}
      sites={sites}
      sales={sales}
      charges={charges}
      payments={payments}
      permissions={{
        canEditClient,
        canDeleteClient,
        canCreateContract,
        canEditContract,
        canDeleteContract,
        canViewTrabalhos,
        canViewFinanceiro,
        canViewSites,
        canViewVendedores,
      }}
    />
  );
}
