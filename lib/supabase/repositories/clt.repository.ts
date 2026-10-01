import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CltCampaign, CltCompany, CltResponsible, CltTask } from "@/types/database.types";

export type CltDashboardData = {
  companies: CltCompany[];
  responsibles: CltResponsible[];
  campaigns: CltCampaign[];
  tasks: CltTask[];
};

export async function getCltDashboardData(): Promise<CltDashboardData> {
  const supabase = await createSupabaseServerClient();
  const [companies, responsibles, campaigns, tasks] = await Promise.all([
    supabase.from("clt_companies").select("*").eq("is_active", true).order("name"),
    supabase.from("clt_responsibles").select("*").order("name"),
    supabase.from("clt_campaigns").select("*").order("ends_on"),
    supabase.from("clt_tasks").select("*").order("due_date", { ascending: true, nullsFirst: false }),
  ]);
  for (const result of [companies, responsibles, campaigns, tasks]) if (result.error) throw result.error;
  return { companies: companies.data ?? [], responsibles: responsibles.data ?? [], campaigns: campaigns.data ?? [], tasks: tasks.data ?? [] };
}
