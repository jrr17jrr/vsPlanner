import "server-only";

import { requireScopedModulePermission } from "@/lib/supabase/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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
import { ensureFinancialDefaults, ensureRecurringChargesForSpace } from "@/lib/supabase/finance-core";
import type { FinancialScope } from "@/lib/space-slugs";
import type { Space } from "@/types/database.types";

/**
 * Antes de LER o financeiro de um space: materializa as competências
 * recorrentes que já entraram no horizonte. Só grava quem pode criar no
 * financeiro (a RLS também barraria) — quem só visualiza vê o que já
 * existe. Usado pelo Financeiro, pela Visão Geral e pela ficha do cliente,
 * pra todos enxergarem as mesmas cobranças.
 */
export async function prepareFinancialSpace(space: Space, profileId: string): Promise<void> {
  const canCreate = await hasModulePermission(space.id, "financeiro", "create");
  if (!canCreate) return;
  const supabase = await createSupabaseServerClient();
  await ensureRecurringChargesForSpace(supabase, space.id, profileId);
}

/**
 * Carregamento único do Financeiro, reaproveitado pelas 3 páginas
 * (Visionário Dev, Pessoal, TikTok) — mesma arquitetura, só muda o
 * `space` resolvido por `scope`. `clients`/`clientServices`/`services` só
 * existem de verdade no Visionário Dev; nos outros dois espaços voltam
 * vazios naturalmente (filtro por `space_id` + RLS).
 */
export async function loadFinanceiroPageData(scope: FinancialScope) {
  const { profile, space } = await requireScopedModulePermission(scope, "financeiro", "view");

  const [canCreate, canEdit, canDelete] = await Promise.all([
    hasModulePermission(space.id, "financeiro", "create"),
    hasModulePermission(space.id, "financeiro", "edit"),
    hasModulePermission(space.id, "financeiro", "delete"),
  ]);

  if (canCreate) {
    const supabase = await createSupabaseServerClient();
    await ensureFinancialDefaults(supabase, space.id, profile.id);
    await ensureRecurringChargesForSpace(supabase, space.id, profile.id);
  }

  const [charges, payments, accounts, categories, referenceTypes, origins, clients, clientServices, services] =
    await Promise.all([
      listFinancialCharges(space.id),
      listFinancialPayments(space.id),
      listFinancialAccounts(space.id),
      listFinancialCategories(space.id),
      listFinancialReferenceTypes(space.id),
      listFinancialOrigins(space.id),
      listClients(space.id),
      listAllClientServices(space.id),
      listServices(space.id),
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
