import { requireModulePermission } from "@/lib/supabase/dal";
import { hasModulePermission } from "@/lib/supabase/repositories/permissions.repository";
import {
  listClients,
  listAllClientServices,
  listServices,
} from "@/lib/supabase/repositories/clients.repository";
import { listSpaceMemberProfiles } from "@/lib/supabase/repositories/meetings.repository";
import {
  listFinancialAccounts,
  listFinancialCharges,
  listFinancialPayments,
} from "@/lib/supabase/repositories/financial.repository";
import { prepareFinancialSpace } from "@/lib/supabase/financial-page-data";
import { VISIONARIO_DEV_SLUG } from "@/lib/space-slugs";
import { ClientesPageClient } from "@/components/visionario/clientes/clientes-page-client";

/**
 * Situação financeira dos cards vem das MESMAS cobranças/pagamentos do
 * Financeiro — só consultadas se o usuário tiver `financeiro.view`.
 */
export default async function ClientesPage() {
  const { profile, space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "clientes", "view");

  const [clients, clientServices, services, members, canCreate, canViewFinance, canEditFinance] = await Promise.all([
    listClients(space.id),
    listAllClientServices(space.id),
    listServices(space.id),
    listSpaceMemberProfiles(space.id),
    hasModulePermission(space.id, "clientes", "create"),
    hasModulePermission(space.id, "financeiro", "view"),
    hasModulePermission(space.id, "financeiro", "edit"),
  ]);

  if (canViewFinance) await prepareFinancialSpace(space, profile.id);

  const [charges, payments, accounts] = await Promise.all([
    canViewFinance ? listFinancialCharges(space.id) : Promise.resolve([]),
    canViewFinance ? listFinancialPayments(space.id) : Promise.resolve([]),
    canEditFinance ? listFinancialAccounts(space.id) : Promise.resolve([]),
  ]);

  return (
    <ClientesPageClient
      clients={clients}
      clientServices={clientServices}
      services={services}
      members={members}
      charges={charges.filter((c) => c.kind === "entrada" && c.client_id)}
      payments={payments}
      accounts={accounts}
      permissions={{ canCreate, canViewFinance, canEditFinance }}
    />
  );
}
