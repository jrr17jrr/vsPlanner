import { PageHeader } from "@/components/shared/page-header";
import { CompaniesClient } from "@/components/trabalho/companies-client";
import { getCltDashboardData } from "@/lib/supabase/repositories/clt.repository";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import type {CltCampaignResultEntry} from "@/types/database.types";
export default async function Page(){
 const d=await getCltDashboardData();
 const s=await createSupabaseServerClient();
 const ids=d.campaigns.map(c=>c.id);
 const {data,error}=ids.length?await s.from("clt_campaign_result_entries").select("*").in("campaign_id",ids):{data:[],error:null};
 if(error)throw error;
 return <div className="space-y-4"><PageHeader title="Empresas" description="Cadastre, edite e acompanhe as empresas do Trabalho / CLT."/><CompaniesClient companies={d.companies} responsibles={d.responsibles} campaigns={d.campaigns} results={(data||[]) as CltCampaignResultEntry[]}/></div>;
}