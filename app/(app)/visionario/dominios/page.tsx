import { requireModulePermission } from "@/lib/supabase/dal";
import { hasModulePermission } from "@/lib/supabase/repositories/permissions.repository";
import { listDomains } from "@/lib/supabase/repositories/domains.repository";
import { listClientSites } from "@/lib/supabase/repositories/sites.repository";
import { listClients } from "@/lib/supabase/repositories/clients.repository";
import {
  listFinancialAccounts,
  listFinancialChargesByOrigins,
  listFinancialPaymentsForCharges,
} from "@/lib/supabase/repositories/financial.repository";
import { prepareFinancialSpace } from "@/lib/supabase/financial-page-data";
import { VISIONARIO_DEV_SLUG } from "@/lib/space-slugs";
import { DomainsPageClient } from "@/components/sites/domains-page-client";

export default async function DominiosPage() {
  const { profile, space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "sites", "view");

  const [domains, sites, clients, canCreate, canEdit, canDelete, canViewFinance, canCreateFinance, canEditFinance] =
    await Promise.all([
      listDomains(space.id),
      listClientSites(space.id),
      listClients(space.id),
      hasModulePermission(space.id, "sites", "create"),
      hasModulePermission(space.id, "sites", "edit"),
      hasModulePermission(space.id, "sites", "delete"),
      hasModulePermission(space.id, "financeiro", "view"),
      hasModulePermission(space.id, "financeiro", "create"),
      hasModulePermission(space.id, "financeiro", "edit"),
    ]);

  // Renovações integradas: as cobranças/pagamentos vêm do MESMO Financeiro
  // (nada duplicado aqui) — só lidos se o usuário pode ver o Financeiro.
  if (canViewFinance) await prepareFinancialSpace(space, profile.id);
  const originIds = domains.map((d) => d.financial_origin_id).filter((id): id is string => !!id);
  const charges = canViewFinance ? await listFinancialChargesByOrigins(originIds, space.id) : [];
  const [payments, accounts] = await Promise.all([
    canViewFinance ? listFinancialPaymentsForCharges(charges.map((c) => c.id), space.id) : Promise.resolve([]),
    canEditFinance ? listFinancialAccounts(space.id) : Promise.resolve([]),
  ]);

  return (
    <DomainsPageClient
      domains={domains}
      sites={sites}
      clients={clients}
      charges={charges}
      payments={payments}
      accounts={accounts}
      permissions={{ canCreate, canEdit, canDelete, canViewFinance, canCreateFinance, canEditFinance }}
    />
  );
}
