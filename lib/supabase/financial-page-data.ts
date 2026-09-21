import { requireScopedModulePermission } from "@/lib/supabase/dal";
import { hasModulePermission } from "@/lib/supabase/repositories/permissions.repository";
import {
  listFinancialAccounts,
  listFinancialCategories,
  listFinancialReferenceTypes,
  listFinancialOrigins,
  listFinancialCharges,
  listFinancialPayments,
} from "@/lib/supabase/repositories/financial.repository";
import { listClients, listAllClientServices, listServices } from "@/lib/supabase/repositories/clients.repository";
import { ensureFinancialDefaults, ensureRecurringChargesGenerated } from "@/lib/supabase/financial-actions";
import type { FinancialScope } from "@/lib/space-slugs";

/**
 * Carregamento único do Financeiro, reaproveitado pelas 3 páginas
 * (Visionário Dev, Pessoal, TikTok) — mesma arquitetura (migration 007),
 * só muda o `space` resolvido por `scope`. `clients`/`clientServices`/
 * `services` só existem de verdade no Visionário Dev; nos outros dois
 * espaços voltam vazios naturalmente (a tabela é filtrada por
 * `space_id`), o que já faz o formulário de "Nova movimentação" esconder
 * os campos de cliente/serviço sem nenhum `if (scope === ...)` na UI.
 */
export async function loadFinanceiroPageData(scope: FinancialScope) {
  const { space } = await requireScopedModulePermission(scope, "financeiro", "view");

  await ensureFinancialDefaults(scope);
  await ensureRecurringChargesGenerated(scope);

  const [
    charges,
    payments,
    accounts,
    categories,
    referenceTypes,
    origins,
    clients,
    clientServices,
    services,
    canCreate,
    canEdit,
    canDelete,
  ] = await Promise.all([
    listFinancialCharges(space.id),
    listFinancialPayments(space.id),
    listFinancialAccounts(space.id),
    listFinancialCategories(space.id),
    listFinancialReferenceTypes(space.id),
    listFinancialOrigins(space.id),
    listClients(space.id),
    listAllClientServices(space.id),
    listServices(space.id),
    hasModulePermission(space.id, "financeiro", "create"),
    hasModulePermission(space.id, "financeiro", "edit"),
    hasModulePermission(space.id, "financeiro", "delete"),
  ]);

  return {
    charges,
    payments,
    accounts,
    categories,
    referenceTypes,
    origins,
    clients,
    clientServices,
    services,
    permissions: { canCreate, canEdit, canDelete },
  };
}
