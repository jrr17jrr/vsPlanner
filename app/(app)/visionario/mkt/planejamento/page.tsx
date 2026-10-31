import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PlanningClient } from "@/components/planejamento/planning-client";
import { ModulePendingNotice } from "@/components/trabalho/pages/module-pending-notice";
import { getModuleScope, inList } from "@/lib/supabase/clt-scope";
export const dynamic = "force-dynamic";
/** Planejamento do MKT: só itens das empresas do MKT (o planejamento geral não mostra estes). */
export default async function Page() {
  const s = await createSupabaseServerClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return <p>Faça login para acessar o planejamento.</p>;
  const scope = await getModuleScope(s, user.id, "mkt");
  const items = await (s as unknown as SupabaseClient).from("planning_items").select("*").eq("user_id", user.id).in("company_id", inList(scope.companyIds)).order("created_at", { ascending: false });
  const companies = scope.companies.map(c => ({ id: c.id, name: c.name, current_ad_balance: c.current_ad_balance }));
  return <div className="space-y-4"><ModulePendingNotice module="mkt" ready={scope.ready} /><PlanningClient module="mkt" initial={items.data || []} companies={companies} loadError={items.error?.message} /></div>;
}
