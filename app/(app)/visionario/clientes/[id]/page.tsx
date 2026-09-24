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
  listFinancialAccounts,
  listFinancialChargesForClient,
  listFinancialOrigins,
  listFinancialPaymentsForCharges,
} from "@/lib/supabase/repositories/financial.repository";
import { prepareFinancialSpace } from "@/lib/supabase/financial-page-data";
import { VISIONARIO_DEV_SLUG } from "@/lib/space-slugs";
import { ClientDetailClient } from "@/components/visionario/clientes/client-detail-client";

/**
 * Cliente 360 — cada bloco extra (trabalhos, financeiro, sites, vendas)
 * só é buscado se o usuário tiver a permissão do módulo correspondente.
 * O resumo financeiro usa as MESMAS cobranças/pagamentos do Financeiro
 * (filtradas por client_id), nunca uma cópia.
 */
export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { profile, space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "clientes", "view");

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
    canEditFinanceiro,
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
    hasModulePermission(space.id, "financeiro", "edit"),
    hasModulePermission(space.id, "sites", "view"),
    hasModulePermission(space.id, "vendedores", "view"),
  ]);

  if (canViewFinanceiro) await prepareFinancialSpace(space, profile.id);

  const [workItems, sites, sales, charges, origins, accounts] = await Promise.all([
    canViewTrabalhos ? listWorkItemsForClient(client.id) : Promise.resolve([]),
    canViewSites ? listClientSitesForClient(client.id) : Promise.resolve([]),
    canViewVendedores ? listSalesForClient(client.id) : Promise.resolve([]),
    canViewFinanceiro ? listFinancialChargesForClient(client.id, space.id) : Promise.resolve([]),
    canViewFinanceiro ? listFinancialOrigins(space.id) : Promise.resolve([]),
    canEditFinanceiro ? listFinancialAccounts(space.id) : Promise.resolve([]),
  ]);

  const payments = canViewFinanceiro ? await listFinancialPaymentsForCharges(charges.map((c) => c.id), space.id) : [];
  const contractIdsWithFinance = origins
    .filter((o) => o.client_service_id && o.is_active)
    .map((o) => o.client_service_id as string);

  return (
    <ClientDetailClient
      client={client}
      contracts={contracts.filter((c) => c.space_id === space.id)}
      services={services}
      meetings={meetings}
      members={members}
      workItems={workItems}
      sites={sites}
      sales={sales}
      charges={charges}
      payments={payments}
      accounts={accounts}
      contractIdsWithFinance={contractIdsWithFinance}
      permissions={{
        canEditClient,
        canDeleteClient,
        canCreateContract,
        canEditContract,
        canDeleteContract,
        canViewTrabalhos,
        canViewFinanceiro,
        canEditFinanceiro,
        canViewSites,
        canViewVendedores,
      }}
    />
  );
}
