import {getCltDashboardData} from "@/lib/supabase/repositories/clt.repository";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import {CltAnalytics} from "@/components/trabalho/clt-analytics";
import {CampaignHistory} from "@/components/trabalho/campaign-history";
import type {CltCampaignResultEntry} from "@/types/database.types";
import {withImportedPeriodResults} from "@/lib/supabase/clt-period-results";
import {loadHistoryInput} from "@/lib/supabase/clt-history-data";
import {buildHistoryFacts,messagingPoints} from "@/lib/clt/history";
export default async function Page(){
 const d=await getCltDashboardData();
 const s=await createSupabaseServerClient();
 const ids=d.campaigns.map(c=>c.id);
 const {data,error}=ids.length?await s.from("clt_campaign_result_entries").select("*").in("campaign_id",ids):{data:[],error:null};
 if(error)throw error;
 const merged=await withImportedPeriodResults(s,ids,(data||[]) as CltCampaignResultEntry[]);
 // Histórico mensal/comparação: mesmas campanhas (mesmo módulo e empresas) já carregadas acima.
 const history=await loadHistoryInput(s,d.campaigns.map(c=>({id:c.id,company_id:c.company_id,name:c.name,objective:c.objective,starts_on:c.starts_on,ends_on:c.ends_on,campaign_status:c.campaign_status??null})));
 const messaging=messagingPoints(buildHistoryFacts(history).facts);
 return <div className="space-y-6"><CltAnalytics companies={d.companies} campaigns={d.campaigns} results={merged.results} messaging={messaging}/><CampaignHistory companies={d.companies.map(c=>({id:c.id,name:c.name}))} input={history}/></div>;
}
