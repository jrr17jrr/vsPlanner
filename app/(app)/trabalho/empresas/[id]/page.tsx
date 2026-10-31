import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, CalendarDays, CheckCircle2, Clock, ExternalLink, Mail, Phone, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCltDashboardData } from "@/lib/supabase/repositories/clt.repository";
import { CompanyDetailTasks } from "@/components/trabalho/company-detail-tasks";
import { CompanyDetailBalance } from "@/components/trabalho/company-detail-balance";
import { CompanyResultsSummary } from "@/components/trabalho/company-results-summary";
import { TrafficManager } from "@/components/trabalho/traffic-manager";
import { AudienceManager, type AudienceUsage } from "@/components/trabalho/audience-manager";
import type { AudienceRecord } from "@/lib/supabase/clt-audience-actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { withImportedPeriodResults } from "@/lib/supabase/clt-period-results";
import { ImportedReconciliation, type ReconciliationRow } from "@/components/trabalho/imported-reconciliation";
import { mergeAdLevelResults, type PeriodMetricFullRow } from "@/lib/clt/ad-metrics";
import { CompanyTabs, isCompanyTab } from "@/components/trabalho/company/company-tabs";
import { OverviewAudiences, OverviewCampaigns, OverviewTasks } from "@/components/trabalho/company/overview-sections";
import { CompanyFinance, type AccountMovement } from "@/components/trabalho/company/company-finance";
import { MonthlyVideoPlanSeeder } from "@/components/trabalho/company/monthly-video-plan-seeder";
import type { CltMonthlyBudget,CltCampaignResultEntry,CltAdSet,CltAdCreative,CltAdLevelResult } from "@/types/database.types";

const money = (n:number) => n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const missingTable = (code?: string) => ["42P01","PGRST205"].includes(String(code));
export default async function CompanyPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{aba?:string|string[]}>}){
 const {id}=await params;
 const {aba}=await searchParams;
 const initialTab=isCompanyTab(aba)?aba:"visao-geral";
 const data=await getCltDashboardData();
 const company=data.companies.find(c=>c.id===id);
 if(!company)notFound();
 const supabase=await createSupabaseServerClient();
 const db=supabase as unknown as SupabaseClient;
 const parts=new Intl.DateTimeFormat("en-US",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit"}).formatToParts(new Date());
 const month=(parts.find(p=>p.type==="year")?.value||"2026")+"-"+(parts.find(p=>p.type==="month")?.value||"01");
 const campaigns=data.campaigns.filter(c=>c.company_id===id);
 const companyCampaignIds=campaigns.map(c=>c.id);
 const campaignFilter=companyCampaignIds.length?companyCampaignIds:["00000000-0000-0000-0000-000000000000"];
 const [budgetQuery,resultsQuery,setsQuery,comparisonQuery,audiencesQuery,levelResultsQuery,periodQuery,reconciliationQuery,movementsQuery]=await Promise.all([
 supabase.from("clt_monthly_budgets").select("*").eq("company_id",id).eq("month_key",month+"-01").maybeSingle(),
 supabase.from("clt_campaign_result_entries").select("*").in("campaign_id",campaignFilter),
 supabase.from("clt_ad_sets").select("*").in("campaign_id",campaignFilter),
 supabase.from("clt_campaign_comparisons").select("old_campaign_ids,new_campaign_ids").eq("company_id",id).maybeSingle(),
 supabase.from("clt_audiences").select("*").eq("company_id",id).order("created_at",{ascending:false}),
 supabase.from("clt_ad_level_results").select("*").in("campaign_id",campaignFilter),
 // Métricas importadas por anúncio/período: alimentam campanha, conjunto e anúncio (o importado prevalece sobre lançamentos antigos do mesmo período).
 db.from("clt_ad_period_metrics").select("id,campaign_id,ad_set_id,creative_id,period_start,period_end,spend,conversations,sales,revenue,impressions,reach,link_clicks,leads").eq("company_id",id),
 db.from("clt_campaign_reconciliations").select("campaign_id,period_start,period_end,reported_spend,reported_conversations,unallocated_spend,unallocated_conversations,notes").eq("company_id",id),
 db.from("clt_ad_account_movements").select("id,movement_date,kind,amount,notes").eq("company_id",id).order("movement_date",{ascending:false}).limit(50),
 ]);
 if(periodQuery.error&&!missingTable(periodQuery.error.code))throw periodQuery.error;
 const setIds=(setsQuery.data||[]).map(s=>s.id);
 const creativesQuery=await supabase.from("clt_ad_creatives").select("*").in("ad_set_id",setIds.length?setIds:["00000000-0000-0000-0000-000000000000"]);
 const mergedResults=await withImportedPeriodResults(supabase,companyCampaignIds,(resultsQuery.data||[]) as CltCampaignResultEntry[]);
 const levelRows=mergeAdLevelResults((levelResultsQuery.data||[]) as CltAdLevelResult[],(periodQuery.error?[]:periodQuery.data||[]) as PeriodMetricFullRow[]).rows;
 const audiences=(audiencesQuery.data||[]) as AudienceRecord[];
 const sets=(setsQuery.data||[]) as CltAdSet[];
 // Vínculos públicos ↔ conjuntos (somente leitura, por saved_audience_id).
 const usage:AudienceUsage={};
 for(const s of sets)if(s.saved_audience_id)(usage[s.saved_audience_id]??=[]).push({set:s.name,campaign:campaigns.find(c=>c.id===s.campaign_id)?.name||"—"});
 const linkedSetCount=Object.fromEntries(Object.entries(usage).map(([k,v])=>[k,v.length]));
 const responsible=data.responsibles.find(r=>r.id===company.responsible_id);
 const tasks=data.tasks.filter(t=>t.company_id===id&&!t.archived_at);
 const occurrences=data.occurrences;
 const pending=tasks.filter(t=>t.status==="pendente").length;
 const spent=campaigns.reduce((a,c)=>a+Number(c.spent_amount||0),0);
 const monthSpent=mergedResults.results.filter(r=>r.entry_date.startsWith(month)).reduce((a,r)=>a+Number(r.spent_amount||0),0);
 const activeCampaigns=campaigns.filter(c=>c.campaign_status==="ativa").length;
 const budget=(budgetQuery.data ?? undefined) as CltMonthlyBudget|undefined;

 const overview=<>
 <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
 {([{label:"Saldo da Meta",value:money(Number(company.current_ad_balance)),icon:Wallet},{label:"Tarefas pendentes",value:String(pending),icon:Clock},{label:"Campanhas cadastradas",value:String(campaigns.length),icon:CalendarDays},{label:"Investimento registrado",value:money(spent),icon:CheckCircle2}]).map(item=><Card key={item.label}><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><item.icon className="h-4 w-4 text-primary"/>{item.label}</div><p className="mt-2 text-xl font-semibold">{item.value}</p></CardContent></Card>)}</div>
 <CompanyResultsSummary results={mergedResults.results}/>
 <ImportedReconciliation rows={(reconciliationQuery.data||[]) as ReconciliationRow[]} campaigns={campaigns.map(c=>({id:c.id,name:c.name}))} excludedLegacy={mergedResults.excludedLegacy}/>
 <div className="space-y-3">
 <OverviewCampaigns campaigns={campaigns}/>
 <OverviewAudiences audiences={audiences} linkedSetCount={linkedSetCount}/>
 <OverviewTasks tasks={tasks} occurrences={occurrences} pending={pending}/>
 </div>
 <CompanyDetailBalance company={company}/>
 <Card><CardContent className="space-y-3 p-4"><h2 className="font-semibold">Dados e contatos</h2><div className="grid gap-3 text-sm sm:grid-cols-2"><p><b>Responsável:</b> {responsible?.name??"Não informado"}</p><p><b>Instagram:</b> {company.instagram||"Não informado"}</p>{company.email&&<a href={"mailto:"+company.email} className="inline-flex items-center gap-2 hover:underline"><Mail className="h-4 w-4"/>{company.email}</a>}{company.company_phone&&<p className="flex items-center gap-2"><Phone className="h-4 w-4"/>{company.company_phone}</p>}{company.responsible_phone&&<p><b>Telefone do responsável:</b> {company.responsible_phone}</p>}{company.website&&<a href={company.website.startsWith("http")?company.website:"https://"+company.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 hover:underline"><ExternalLink className="h-4 w-4"/>Abrir site</a>}</div>{company.notes&&<p className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">{company.notes}</p>}</CardContent></Card>
 </>;

 return <div className="space-y-5">
 <MonthlyVideoPlanSeeder/>
 <Link href="/trabalho/empresas" className="inline-flex min-h-10 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4"/>Voltar para empresas</Link>
 <div className="flex flex-wrap items-start justify-between gap-3">
 <div className="min-w-0"><div className="flex items-center gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Building2 className="h-6 w-6"/></span><div className="min-w-0"><h1 className="break-words text-2xl font-semibold">{company.name}</h1><p className="text-sm text-muted-foreground">Responsável: {responsible?.name??"Não informado"} · Painel individual da empresa</p></div></div>
 <div className="mt-3 flex flex-wrap gap-2">{company.is_active&&<Badge variant="success">Empresa ativa</Badge>}<Badge variant={activeCampaigns?"default":"secondary"}>{activeCampaigns} campanha(s) ativa(s)</Badge>{pending>0&&<Badge variant="warning">{pending} tarefa(s) pendente(s)</Badge>}{Number(company.current_ad_balance)<=0&&<Badge variant="destructive">Sem saldo registrado</Badge>}</div></div>
 <div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link href="/trabalho/tarefas">Todas as tarefas</Link></Button><Button asChild variant="outline"><Link href="/trabalho/campanhas">Todas as campanhas</Link></Button></div>
 </div>
 <CompanyTabs initialTab={initialTab} panels={{
  "visao-geral":overview,
  campanhas:<TrafficManager companyId={id} companyName={company.name} audiences={audiences} month={month} budget={budget} campaigns={campaigns} results={mergedResults.legacyKept} sets={sets} creatives={(creativesQuery.data||[]) as CltAdCreative[]} levelResults={levelRows} comparison={comparisonQuery.data||null}/>,
  publicos:<AudienceManager companyId={id} companyName={company.name} audiences={audiences} usage={usage}/>,
  tarefas:<CompanyDetailTasks companyId={id} tasks={tasks} companies={data.companies} occurrences={occurrences}/>,
  financeiro:<CompanyFinance company={company} month={month} budget={budget} totalSpent={spent} monthSpent={monthSpent} movements={(movementsQuery.error?[]:movementsQuery.data||[]) as AccountMovement[]} movementsAvailable={!movementsQuery.error}/>,
 }}/>
 </div>;
}
