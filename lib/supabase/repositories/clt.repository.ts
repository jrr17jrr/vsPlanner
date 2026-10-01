import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CltCampaign, CltCompany, CltResponsible, CltTask } from "@/types/database.types";

export type CltDashboardData = {
  companies: CltCompany[];
  responsibles: CltResponsible[];
  campaigns: CltCampaign[];
  tasks: CltTask[];
  occurrences: { task_id:string; occurrence_date:string; status:string; completed_at:string|null }[];
};

export async function getCltDashboardData(): Promise<CltDashboardData> {
  const supabase = await createSupabaseServerClient();
  const [companies, responsibles, campaigns, tasks, occurrences] = await Promise.all([
    supabase.from("clt_companies").select("*").eq("is_active", true).order("name"),
    supabase.from("clt_responsibles").select("*").order("name"),
    supabase.from("clt_campaigns").select("*").order("ends_on"),
    supabase.from("clt_tasks").select("*").order("due_date", { ascending: true, nullsFirst: false }),
    supabase.from("clt_task_occurrences").select("task_id,occurrence_date,status,completed_at").order("occurrence_date",{ascending:false}),
  ]);
  for (const result of [companies, responsibles, campaigns, tasks, occurrences]) if (result.error) throw result.error;
  return { companies: companies.data ?? [], responsibles: responsibles.data ?? [], campaigns: campaigns.data ?? [], tasks: tasks.data ?? [], occurrences: occurrences.data ?? [] };
}
