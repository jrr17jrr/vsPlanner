import type {SupabaseClient} from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CltCampaign, CltCompany, CltResponsible, CltTask } from "@/types/database.types";

export type CltDashboardData = {
  companies: CltCompany[];
  responsibles: CltResponsible[];
  campaigns: CltCampaign[];
  tasks: CltTask[];
  weeklyReviews: {company_id:string;weekday:number;last_reviewed_on:string|null}[];
  occurrences: { task_id:string; occurrence_date:string; status:string; completed_at:string|null }[];
};

export async function getCltDashboardData(): Promise<CltDashboardData> {
  const supabase = await createSupabaseServerClient();
  const {data:{user}}=await supabase.auth.getUser();
  const [companies, responsibles, campaigns, tasks, occurrences, weeklyReviews] = await Promise.all([
    supabase.from("clt_companies").select("*").eq("is_active", true).order("name"),
    supabase.from("clt_responsibles").select("*").order("name"),
    supabase.from("clt_campaigns").select("*").order("ends_on"),
    supabase.from("clt_tasks").select("*").order("due_date", { ascending: true, nullsFirst: false }),
    supabase.from("clt_task_occurrences").select("task_id,occurrence_date,status,completed_at").order("occurrence_date",{ascending:false}),
    user?(supabase as unknown as SupabaseClient).from("clt_weekly_reviews").select("company_id,weekday,last_reviewed_on").eq("user_id",user.id):Promise.resolve({data:[],error:null}),
  ]);
  for (const result of [companies, responsibles, campaigns, tasks, occurrences, weeklyReviews]) if (result.error) throw result.error;
  // A campanha permanece ativa até o fim do dia de encerramento (horário de Brasília).
  // Ao consultar o painel depois da data final, sincroniza o status no banco.
  const today = new Date().toLocaleDateString("en-CA", {timeZone:"America/Sao_Paulo"});
  const expired = (campaigns.data ?? []).filter(c => c.campaign_status === "ativa" && c.ends_on < today);
  if (user && expired.length) {
    const {error: closeError} = await supabase.from("clt_campaigns")
      .update({campaign_status:"finalizada"})
      .eq("user_id",user.id)
      .eq("campaign_status","ativa")
      .lt("ends_on",today)
      .in("id",expired.map(c=>c.id));
    if (closeError) console.error("Falha ao finalizar campanhas vencidas:",closeError.message);
  }
  const currentCampaigns = (campaigns.data ?? []).map(c =>
    c.campaign_status === "ativa" && c.ends_on < today
      ? {...c,campaign_status:"finalizada" as const}
      : c
  );
  return { companies: companies.data ?? [], responsibles: responsibles.data ?? [], campaigns: currentCampaigns, tasks: tasks.data ?? [], weeklyReviews: (weeklyReviews.data ?? []) as CltDashboardData["weeklyReviews"], occurrences: occurrences.data ?? [] };
}
