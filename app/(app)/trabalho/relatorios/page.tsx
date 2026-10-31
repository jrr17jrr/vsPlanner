import {PageHeader} from "@/components/shared/page-header";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import {CltReportClient} from "@/components/trabalho/clt-report-client";
import {withImportedPeriodResults} from "@/lib/supabase/clt-period-results";
import type {CltCampaignResultEntry} from "@/types/database.types";
import {loadHistoryInput} from "@/lib/supabase/clt-history-data";
import {buildHistoryFacts,messagingPoints} from "@/lib/clt/history";
export default async function Page(){
 const s=await createSupabaseServerClient();
 const {data:{user}}=await s.auth.getUser();
 if(!user)return <p>Faça login.</p>;
 const [companies,campaigns,results,movements,comparisons]=await Promise.all([
 s.from("clt_companies").select("id,name,current_ad_balance").eq("user_id",user.id).eq("is_active",true).order("name"),
 s.from("clt_campaigns").select("id,company_id,name,objective,starts_on,ends_on,planned_amount,campaign_status").eq("user_id",user.id),
 s.from("clt_campaign_result_entries").select("campaign_id,entry_date,spent_amount,generated_revenue,views,impressions,thruplays,messages,sales").eq("user_id",user.id),
 s.from("clt_ad_account_movements").select("company_id,movement_date,kind,amount").eq("user_id",user.id),
 s.from("clt_campaign_comparisons").select("company_id,old_campaign_ids,new_campaign_ids").eq("user_id",user.id)
 ]);
 const movementError=movements.error?.message||"";
 // Resultados importados por anúncio/período entram no mês do FIM do período; lançamentos antigos da mesma campanha dentro do período não são somados de novo.
 const merged=await withImportedPeriodResults(s,(campaigns.data||[]).map(c=>c.id),(results.data||[]) as CltCampaignResultEntry[]);
 // Custo por mensagem: só investimento elegível (conjuntos/campanhas de mensagens).
 const history=await loadHistoryInput(s,(campaigns.data||[]).map(c=>({id:c.id,company_id:c.company_id,name:c.name,objective:c.objective,starts_on:c.starts_on,ends_on:c.ends_on,campaign_status:c.campaign_status??null})));
 const messaging=messagingPoints(buildHistoryFacts(history).facts);
 const note=merged.crossMonthPeriods?" Resultados importados por período aparecem no mês em que o período termina.":"";
 return <div className="space-y-5"><PageHeader title="Relatórios CLT" description={"Selecione empresas e mês, registre movimentações e gere um PDF com resultados reais."+note}/><CltReportClient companies={companies.data||[]} campaigns={campaigns.data||[]} results={merged.results} movements={movements.data||[]} movementError={movementError} comparisons={comparisons.data||[]} messaging={messaging}/></div>;
}
