"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
type State={error?:string;success?:string};
async function ctx(){const s=await createSupabaseServerClient();const {data,error}=await s.auth.getUser();if(error||!data.user)throw new Error("Sessão inválida.");return{s,user:data.user};}
function refresh(){["/trabalho","/trabalho/empresas","/trabalho/campanhas","/trabalho/tarefas"].forEach((path) => revalidatePath(path));revalidatePath("/trabalho/empresas/[id]","page")}
export async function saveCltCompanyAction(input:{id?:string;name:string;responsibleId?:string;email?:string;instagram?:string;responsiblePhone?:string;companyPhone?:string;website?:string;notes?:string;currentAdBalance:number}):Promise<State>{const{s,user}=await ctx();if(!input.name.trim())return{error:"Nome é obrigatório."};const values={name:input.name.trim(),responsible_id:input.responsibleId||null,email:input.email?.trim()||null,instagram:input.instagram?.trim()||null,responsible_phone:input.responsiblePhone?.trim()||null,company_phone:input.companyPhone?.trim()||null,website:input.website?.trim()||null,notes:input.notes?.trim()||null,current_ad_balance:Math.max(0,input.currentAdBalance||0)};const q=input.id?s.from("clt_companies").update(values).eq("id",input.id).eq("user_id",user.id):s.from("clt_companies").insert({...values,user_id:user.id});const{error}=await q;if(error)return{error:error.message};refresh();return{success:input.id?"Empresa atualizada.":"Empresa cadastrada."}}

export async function adjustCltCompanyBalancesAction(input: { companyIds: string[]; operation: "add" | "remove" | "set"; amount: number }): Promise<State> {
  const { s, user } = await ctx();
  const ids = [...new Set(input.companyIds)];
  if (!ids.length) return { error: "Selecione pelo menos uma empresa." };
  if (!["add", "remove", "set"].includes(input.operation) || !Number.isFinite(input.amount) || input.amount < 0 || Math.abs(input.amount * 100 - Math.round(input.amount * 100)) > 0.00001) return { error: "Valor inválido." };
  if (input.operation !== "set" && input.amount === 0) return { error: "Informe um valor maior que zero." };
  const { data: companies, error } = await s.from("clt_companies").select("id,name,current_ad_balance").eq("user_id", user.id).eq("is_active", true).in("id", ids);
  if (error) return { error: error.message };
  if (!companies || companies.length !== ids.length) return { error: "Empresa não encontrada." };
  const amountCents = Math.round(input.amount * 100);
  const updates = companies.map(c => {
    const previousCents = Math.round(Number(c.current_ad_balance) * 100);
    const nextCents = input.operation === "set" ? amountCents : previousCents + (input.operation === "add" ? amountCents : -amountCents);
    return { ...c, previousCents, nextCents };
  });
  const insufficient = updates.find(c => c.nextCents < 0);
  if (insufficient) return { error: "Saldo insuficiente em " + insufficient.name + "." };
  let completed = 0;
  for (const c of updates) {
    const { data, error: updateError } = await s.from("clt_companies").update({ current_ad_balance: c.nextCents / 100 }).eq("id", c.id).eq("user_id", user.id).eq("current_ad_balance", c.previousCents / 100).select("id");
    if (updateError || !data?.length) return { error: "Atualizadas " + completed + " de " + updates.length + " empresas. Confira os saldos antes de tentar novamente." };
    completed++;
  }
  refresh();
  return { success: "Saldo atualizado em " + completed + " empresa(s)." };
}

export async function saveCltCampaignAction(input:{companyId:string;name:string;objective?:string;description?:string;startsOn:string;endsOn:string;spentAmount:number;messages:number;sales:number;views:number;generatedRevenue?:number}):Promise<State>{const{s,user}=await ctx();if(!input.companyId||!input.name.trim()||!input.startsOn||!input.endsOn)return{error:"Preencha empresa, campanha, início e encerramento."};const{error}=await s.from("clt_campaigns").insert({user_id:user.id,company_id:input.companyId,name:input.name.trim(),objective:input.objective?.trim()||null,description:input.description?.trim()||null,starts_on:input.startsOn,ends_on:input.endsOn,spent_amount:Math.max(0,input.spentAmount||0),messages:Math.max(0,input.messages||0),sales:Math.max(0,input.sales||0),views:Math.max(0,input.views||0),generated_revenue:input.generatedRevenue||null});if(error)return{error:error.message};refresh();return{success:"Campanha cadastrada."}}
export async function saveCltTaskAction(input:{id?:string;companyId?:string;title:string;kind:"prazo"|"dia";dueDate?:string;time?:string;priority:"normal"|"importante";notes?:string;recurrence:"none"|"weekly";weekdays:number[];recurrenceUntil?:string}):Promise<State>{const{s,user}=await ctx();if(!input.title.trim())return{error:"Título é obrigatório."};if(input.recurrence==="weekly"&&!input.weekdays.length)return{error:"Escolha pelo menos um dia da semana."};if(input.recurrence==="none"&&input.kind==="dia"&&!input.dueDate)return{error:"Informe o dia da tarefa."};const today=new Date().toLocaleDateString("en-CA",{timeZone:"America/Sao_Paulo"});const values={company_id:input.companyId||null,title:input.title.trim(),kind:input.kind,due_date:input.recurrence==="weekly"?null:input.dueDate||null,scheduled_time:input.time||null,priority:input.priority,notes:input.notes?.trim()||null,recurrence:input.recurrence,weekdays:input.recurrence==="weekly"?input.weekdays:[],recurrence_start:input.recurrence==="weekly"?today:null,recurrence_until:input.recurrence==="weekly"&&input.recurrenceUntil?input.recurrenceUntil:null};const q=input.id?s.from("clt_tasks").update(values).eq("id",input.id).eq("user_id",user.id):s.from("clt_tasks").insert({...values,user_id:user.id});const{error}=await q;if(error)return{error:error.message};refresh();revalidatePath("/trabalho/rotina");return{success:input.id?"Tarefa atualizada.":"Tarefa cadastrada."}}

export async function saveCltTasksBatchAction(input:{companyIds:string[];title:string;kind:"prazo"|"dia";dueDate?:string;time?:string;priority:"normal"|"importante";notes?:string;recurrence:"none"|"weekly";weekdays:number[];recurrenceUntil?:string}):Promise<State>{
  const {s,user}=await ctx();
  const ids=[...new Set(input.companyIds)];
  if(!ids.length)return{error:"Selecione pelo menos uma empresa."};
  if(!input.title.trim())return{error:"Informe o título da tarefa."};
  if(input.recurrence==="weekly"&&!input.weekdays.length)return{error:"Escolha os dias da semana."};
  if(input.recurrence==="none"&&input.kind==="dia"&&!input.dueDate)return{error:"Informe a data."};
  const {data:valid,error:checkError}=await s.from("clt_companies").select("id").eq("user_id",user.id).in("id",ids);
  if(checkError)return{error:checkError.message};
  if(!valid||valid.length!==ids.length)return{error:"Uma ou mais empresas não estão disponíveis."};
  const today=new Date().toLocaleDateString("en-CA",{timeZone:"America/Sao_Paulo"});
  const base={user_id:user.id,title:input.title.trim(),kind:input.kind,due_date:input.recurrence==="weekly"?null:input.dueDate||null,scheduled_time:input.time||null,priority:input.priority,notes:input.notes?.trim()||null,recurrence:input.recurrence,weekdays:input.recurrence==="weekly"?input.weekdays:[],recurrence_start:input.recurrence==="weekly"?today:null,recurrence_until:input.recurrence==="weekly"&&input.recurrenceUntil?input.recurrenceUntil:null};
  const {error}=await s.from("clt_tasks").insert(ids.map(company_id=>({...base,company_id})));
  if(error)return{error:error.message};
  refresh();revalidatePath("/trabalho/rotina");
  return{success:`${ids.length} tarefas criadas. Cada empresa pode ser concluída separadamente.`};
}

export async function toggleCltTaskStatusAction(id:string,done:boolean):Promise<State>{const{s,user}=await ctx();const{error}=await s.from("clt_tasks").update({status:done?"concluida":"pendente",completed_at:done?new Date().toISOString():null}).eq("id",id).eq("user_id",user.id);if(error)return{error:error.message};refresh();return{success:"Tarefa atualizada."}}
export async function toggleCltTaskOccurrenceAction(taskId:string,date:string,done:boolean):Promise<State>{const{s,user}=await ctx();if(done){const{error}=await s.from("clt_task_occurrences").upsert({task_id:taskId,user_id:user.id,occurrence_date:date,status:"concluida",completed_at:new Date().toISOString()},{onConflict:"task_id,occurrence_date"});if(error)return{error:error.message}}else{const{error}=await s.from("clt_task_occurrences").delete().eq("task_id",taskId).eq("occurrence_date",date).eq("user_id",user.id);if(error)return{error:error.message}}refresh();revalidatePath("/trabalho/rotina");return{success:"Tarefa atualizada."}}
export async function deleteCltTaskAction(id:string):Promise<State>{const{s,user}=await ctx();const{error}=await s.from("clt_tasks").delete().eq("id",id).eq("user_id",user.id);if(error)return{error:error.message};refresh();revalidatePath("/trabalho/rotina");return{success:"Tarefa excluída."}}
export async function endCltTaskRecurrenceAction(id:string,date:string):Promise<State>{const{s,user}=await ctx();const{error}=await s.from("clt_tasks").update({recurrence_until:date}).eq("id",id).eq("user_id",user.id);if(error)return{error:error.message};refresh();revalidatePath("/trabalho/rotina");return{success:"Repetição encerrada."}}

export async function saveCltMonthlyBudgetAction(input:{companyId:string;month:string;budget:number;reserve:number}):Promise<State>{
 const {s,user}=await ctx();if(!/^\\d{4}-\\d{2}$/.test(input.month)||![input.budget,input.reserve].every(v=>Number.isFinite(v)&&v>=0))return{error:"Valores ou mês inválidos."};
 const {data:company}=await s.from("clt_companies").select("id").eq("id",input.companyId).eq("user_id",user.id).single();if(!company)return{error:"Empresa inválida."};
 const {error}=await s.from("clt_monthly_budgets").upsert({user_id:user.id,company_id:input.companyId,month_key:input.month+"-01",budget_amount:input.budget,reserve_target:input.reserve},{onConflict:"user_id,company_id,month_key"});if(error)return{error:error.message};refresh();return{success:"Orçamento mensal salvo."};
}
export async function saveCltTrafficCampaignAction(input:{id?:string;companyId:string;name:string;objective:string;startsOn:string;endsOn:string;budgetType:"daily"|"total";dailyBudget:number;plannedAmount:number;status:"planejada"|"ativa"|"pausada"|"finalizada";managerUrl?:string;description?:string}):Promise<State>{
 const {s,user}=await ctx();if(!input.name.trim()||!input.startsOn||!input.endsOn||input.endsOn<input.startsOn||!Number.isFinite(input.plannedAmount)||input.plannedAmount<0||!Number.isFinite(input.dailyBudget)||input.dailyBudget<0)return{error:"Confira nome, datas e valores."};
 const {data:company}=await s.from("clt_companies").select("id").eq("id",input.companyId).eq("user_id",user.id).single();if(!company)return{error:"Empresa inválida."};
 const values={name:input.name.trim(),company_id:input.companyId,objective:input.objective,starts_on:input.startsOn,ends_on:input.endsOn,budget_type:input.budgetType,daily_budget:input.budgetType==="daily"?input.dailyBudget:null,planned_amount:input.plannedAmount,campaign_status:input.status,manager_url:input.managerUrl||null,description:input.description||null};
 const q=input.id?s.from("clt_campaigns").update(values).eq("id",input.id).eq("company_id",input.companyId).eq("user_id",user.id):s.from("clt_campaigns").insert({...values,user_id:user.id,spent_amount:0,messages:0,sales:0,views:0});
 const {error}=await q;if(error)return{error:error.message};refresh();return{success:input.id?"Campanha atualizada.":"Campanha criada."};
}
export async function saveCltCampaignResultsAction(input:{campaignId:string;date:string;spent:number;messages:number;sales:number;views:number;appointments:number;impressions:number;reach:number;profileVisits:number;linkClicks:number;engagements:number;thruplays:number;leads:number;revenue:number;notes?:string}):Promise<State>{
 const {s,user}=await ctx();const {data:campaign}=await s.from("clt_campaigns").select("id").eq("id",input.campaignId).eq("user_id",user.id).single();if(!campaign)return{error:"Campanha inválida."};
 if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(input.date)||![input.spent,input.messages,input.sales,input.views,input.appointments,input.impressions,input.reach,input.profileVisits,input.linkClicks,input.engagements,input.thruplays,input.leads,input.revenue].every(v=>Number.isFinite(v)&&v>=0))return{error:"Valores inválidos."};
 const {error}=await s.from("clt_campaign_result_entries").upsert({user_id:user.id,campaign_id:input.campaignId,entry_date:input.date,spent_amount:input.spent,messages:input.messages,sales:input.sales,views:input.views,appointments:input.appointments,impressions:input.impressions,reach:input.reach,profile_visits:input.profileVisits,link_clicks:input.linkClicks,engagements:input.engagements,thruplays:input.thruplays,leads:input.leads,generated_revenue:input.revenue,notes:input.notes||null},{onConflict:"campaign_id,entry_date"});if(error)return{error:error.message};refresh();return{success:"Resultados atualizados."};
}
export async function saveCltAdSetAction(input:{campaignId:string;name:string;audience?:string;location?:string;budget:number;notes?:string}):Promise<State>{
 const {s,user}=await ctx();const {data:campaign}=await s.from("clt_campaigns").select("id").eq("id",input.campaignId).eq("user_id",user.id).single();if(!campaign||!input.name.trim()||!Number.isFinite(input.budget)||input.budget<0)return{error:"Dados inválidos."};
 const {error}=await s.from("clt_ad_sets").insert({user_id:user.id,campaign_id:input.campaignId,name:input.name.trim(),audience:input.audience||null,location:input.location||null,budget_amount:input.budget,notes:input.notes||null});if(error)return{error:error.message};refresh();return{success:"Conjunto cadastrado."};
}
