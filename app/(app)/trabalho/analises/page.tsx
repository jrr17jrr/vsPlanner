import {getCltDashboardData} from "@/lib/supabase/repositories/clt.repository";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import {CltAnalytics} from "@/components/trabalho/clt-analytics";
import type {CltCampaignResultEntry} from "@/types/database.types";
export default async function Page(){
 const d=await getCltDashboardData();
 const s=await createSupabaseServerClient();
 const ids=d.campaigns.map(c=>c.id);
 const {data,error}=ids.length?await s.from("clt_campaign_result_entries").select("*").in("campaign_id",ids):{data:[],error:null};
 if(error)throw error;
 return <CltAnalytics companies={d.companies} campaigns={d.campaigns} results={(data||[]) as CltCampaignResultEntry[]}/>;
}