import type {SupabaseClient} from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CltCampaign, CltCompany, CltResponsible, CltTask } from "@/types/database.types";
import { withImportedCampaignTotals } from "@/lib/clt/ad-metrics";
import type { CltModule } from "@/lib/clt/module";
import { getModuleScope, inList } from "@/lib/supabase/clt-scope";

export type CltDashboardData = {
  module: CltModule;
  /** false = migration do módulo MKT pendente (o CLT segue como antes; o MKT fica vazio). */
  moduleReady: boolean;
  companies: CltCompany[];
  responsibles: CltResponsible[];
  campaigns: CltCampaign[];
  tasks: CltTask[];
  weeklyReviews: {company_id:string;weekday:number;last_reviewed_on:string|null}[];
  occurrences: { task_id:string; occurrence_date:string; status:string; completed_at:string|null }[];
};

/**
 * Dados do painel de UM módulo (CLT ou MKT). Isolamento:
 *  - empresas: só as do módulo;
 *  - campanhas: só das empresas do módulo (inclusive inativas, como antes);
 *  - tarefas: só do módulo (com empresa → módulo da empresa; sem empresa → coluna `module`);
 *  - ocorrências, revisões semanais e métricas importadas: só dessas tarefas/empresas/campanhas.
 */
export async function getCltDashboardData(module: CltModule = "clt"): Promise<CltDashboardData> {
  const supabase = await createSupabaseServerClient();
  const db = supabase as unknown as SupabaseClient;
  const {data:{user}}=await supabase.auth.getUser();
  if (!user) return { module, moduleReady: false, companies: [], responsibles: [], campaigns: [], tasks: [], weeklyReviews: [], occurrences: [] };
  const scope = await getModuleScope(supabase, user.id, module);
  const ids = inList(scope.companyIds);
  const tasksQuery = scope.ready
    ? db.from("clt_tasks").select("*").eq("module", module).order("due_date", { ascending: true, nullsFirst: false })
    : module === "clt"
      ? db.from("clt_tasks").select("*").order("due_date", { ascending: true, nullsFirst: false })
      : Promise.resolve({ data: [], error: null });
  const [responsibles, campaigns, tasks, occurrences, weeklyReviews] = await Promise.all([
    supabase.from("clt_responsibles").select("*").order("name"),
    supabase.from("clt_campaigns").select("*").in("company_id", ids).order("ends_on"),
    tasksQuery,
    supabase.from("clt_task_occurrences").select("task_id,occurrence_date,status,completed_at").order("occurrence_date",{ascending:false}),
    db.from("clt_weekly_reviews").select("company_id,weekday,last_reviewed_on").eq("user_id",user.id).in("company_id", ids),
  ]);
  for (const result of [responsibles, campaigns, tasks, occurrences, weeklyReviews]) if (result.error) throw result.error;
  const companies = scope.companies.filter(c => c.is_active);
  const taskRows = (tasks.data ?? []) as CltTask[];
  const taskIds = new Set(taskRows.map(t => t.id));
  // A campanha permanece ativa até o fim do dia de encerramento (horário de Brasília).
  // Ao consultar o painel depois da data final, sincroniza o status no banco.
  const today = new Date().toLocaleDateString("en-CA", {timeZone:"America/Sao_Paulo"});
  const campaignRows = (campaigns.data ?? []) as CltCampaign[];
  const expired = campaignRows.filter(c => c.campaign_status === "ativa" && c.ends_on < today);
  if (expired.length) {
    const {error: closeError} = await supabase.from("clt_campaigns")
      .update({campaign_status:"finalizada"})
      .eq("user_id",user.id)
      .eq("campaign_status","ativa")
      .lt("ends_on",today)
      .in("id",expired.map(c=>c.id));
    if (closeError) console.error("Falha ao finalizar campanhas vencidas:",closeError.message);
  }
  const currentCampaigns = campaignRows.map(c =>
    c.campaign_status === "ativa" && c.ends_on < today
      ? {...c,campaign_status:"finalizada" as const}
      : c
  );
  // Métricas importadas por anúncio (clt_ad_period_metrics) entram nos totais da campanha. Sem a migration, segue só com os campos antigos.
  const imported = currentCampaigns.length
    ? await db.from("clt_ad_period_metrics").select("campaign_id,spend,conversations,sales").in("campaign_id", currentCampaigns.map(c => c.id))
    : { data: [], error: null };
  if (imported.error && !["42P01", "PGRST205"].includes(String(imported.error.code))) console.error("clt_ad_period_metrics", imported.error);
  const campaignsWithImported = withImportedCampaignTotals(currentCampaigns, imported.error ? [] : imported.data ?? []);
  return {
    module,
    moduleReady: scope.ready,
    companies,
    responsibles: responsibles.data ?? [],
    campaigns: campaignsWithImported,
    tasks: taskRows,
    weeklyReviews: (weeklyReviews.data ?? []) as CltDashboardData["weeklyReviews"],
    occurrences: (occurrences.data ?? []).filter(o => taskIds.has(o.task_id)),
  };
}
