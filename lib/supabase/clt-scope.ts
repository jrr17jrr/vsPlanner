import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CltModule } from "@/lib/clt/module";
import type { CltCompany } from "@/types/database.types";

const MISSING_COLUMN = ["42703", "PGRST204"];

export type ModuleScope = {
  module: CltModule;
  /** false = migration do MKT ainda não aplicada (coluna `module` ausente). */
  ready: boolean;
  /** Todas as empresas do módulo (ativas e inativas) — base do isolamento. */
  companies: CltCompany[];
  companyIds: string[];
};

/**
 * Empresas do usuário que pertencem ao módulo. Antes da migration do MKT,
 * todas as empresas são do CLT (comportamento anterior) e o MKT fica vazio.
 */
export async function getModuleScope(supabase: unknown, userId: string, module: CltModule): Promise<ModuleScope> {
  const db = supabase as SupabaseClient;
  const scoped = await db.from("clt_companies").select("*").eq("user_id", userId).eq("module", module).order("name");
  if (!scoped.error) {
    const companies = (scoped.data ?? []) as CltCompany[];
    return { module, ready: true, companies, companyIds: companies.map(c => c.id) };
  }
  if (!MISSING_COLUMN.includes(String(scoped.error.code))) throw scoped.error;
  if (module === "mkt") return { module, ready: false, companies: [], companyIds: [] };
  const all = await db.from("clt_companies").select("*").eq("user_id", userId).order("name");
  if (all.error) throw all.error;
  const companies = (all.data ?? []) as CltCompany[];
  return { module, ready: false, companies, companyIds: companies.map(c => c.id) };
}

/** Garante que a empresa é do usuário E do módulo (para ações de servidor). */
export async function assertCompanyInModule(supabase: unknown, userId: string, companyId: string, module: CltModule): Promise<boolean> {
  const scope = await getModuleScope(supabase, userId, module);
  return scope.companyIds.includes(companyId);
}

/** Lista para `.in(...)` que nunca fica vazia (o PostgREST rejeita `in.()`). */
export const inList = (ids: string[]) => (ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
