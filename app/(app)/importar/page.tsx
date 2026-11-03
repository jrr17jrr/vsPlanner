import type { SupabaseClient } from "@supabase/supabase-js";
import { ImportCenter } from "@/components/importar/import-center";
import type { LegacyPlanningItem } from "@/components/planejamento/planning-client";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findOrBootstrapSpace, requirePersonalSpace } from "@/lib/supabase/dal";
import { getModuleScope, type ModuleScope } from "@/lib/supabase/clt-scope";
import { VISIONARIO_DEV_SLUG } from "@/lib/space-slugs";
import { parseImportSelection } from "@/lib/import/center";

export const dynamic = "force-dynamic";

/**
 * Central de Importação — substitui os importadores do CLT, do MKT e do
 * Planejamento. Só mostra as áreas que a pessoa pode acessar (mesmas regras
 * do menu) e o servidor confere de novo ao gravar.
 */
export default async function ImportarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { profile } = await requirePersonalSpace();
  const supabase = await createSupabaseServerClient();
  const canClt = profile.system_role === "super_admin" || profile.clt_access !== false;
  const canMkt = !!(await findOrBootstrapSpace(VISIONARIO_DEV_SLUG, profile));

  const empty = (module: "clt" | "mkt"): ModuleScope => ({ module, ready: false, companies: [], companyIds: [] });
  const [clt, mkt] = await Promise.all([
    canClt ? getModuleScope(supabase, profile.id, "clt") : Promise.resolve(empty("clt")),
    canMkt ? getModuleScope(supabase, profile.id, "mkt") : Promise.resolve(empty("mkt")),
  ]);

  // Itens antigos do Planejamento: nada é apagado; aparecem aqui se existirem.
  const legacy = await (supabase as unknown as SupabaseClient).from("planning_items").select("*").eq("user_id", profile.id).order("created_at", { ascending: false });
  const legacyItems = (legacy.error ? [] : (legacy.data ?? [])) as LegacyPlanningItem[];
  const mktIds = new Set(mkt.companyIds);
  const legacyGeneral = legacyItems.filter((i) => !i.company_id || !mktIds.has(i.company_id));
  const legacyMkt = canMkt ? legacyItems.filter((i) => i.company_id && mktIds.has(i.company_id)) : [];

  const params = await searchParams;
  const selection = parseImportSelection(params, { clt: canClt, mkt: canMkt && mkt.ready });

  return (
    <ImportCenter
      access={{ clt: canClt, mkt: canMkt && mkt.ready }}
      mktPending={canMkt && !mkt.ready}
      companies={{ clt: clt.companies.map((c) => ({ id: c.id, name: c.name })), mkt: mkt.companies.map((c) => ({ id: c.id, name: c.name })) }}
      initialArea={selection.area}
      initialType={selection.type}
      legacy={{
        general: legacyGeneral,
        mkt: legacyMkt,
        cltCompanies: clt.companies.map((c) => ({ id: c.id, name: c.name })),
        mktCompanies: mkt.companies.map((c) => ({ id: c.id, name: c.name })),
      }}
    />
  );
}
