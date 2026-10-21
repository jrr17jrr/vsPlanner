import {PageHeader} from "@/components/shared/page-header";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import {CltReportClient} from "@/components/trabalho/clt-report-client";
export default async function Page(){
 const s=await createSupabaseServerClient();
 const {data:{user}}=await s.auth.getUser();
 if(!user)return <p>Faça login.</p>;
 const [companies,campaigns,results,movements]=await Promise.all([
 s.from("clt_companies").select("id,name,current_ad_balance").eq("user_id",user.id).eq("is_active",true).order("name"),
 s.from("clt_campaigns").select("id,company_id,name,starts_on,ends_on,planned_amount").eq("user_id",user.id),
 s.from("clt_campaign_result_entries").select("campaign_id,entry_date,spent_amount,generated_revenue,views,messages,sales").eq("user_id",user.id),
 s.from("clt_ad_account_movements").select("company_id,movement_date,kind,amount").eq("user_id",user.id)
 ]);
 const movementError=movements.error?.message||"";
 return <div className="space-y-5"><PageHeader title="Relatórios CLT" description="Selecione empresas e mês, registre movimentações e gere um PDF com resultados reais."/><CltReportClient companies={companies.data||[]} campaigns={campaigns.data||[]} results={results.data||[]} movements={movements.data||[]} movementError={movementError}/></div>;
}
