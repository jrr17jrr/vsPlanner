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
export async function setCltCampaignCreatedInMetaAction(id:string,created:boolean):Promise<State>{
 const {s,user}=await ctx();
 const {error}=await s.from("clt_campaigns").update({created_in_meta:created}).eq("id",id).eq("user_id",user.id);
 if(error)return {error:error.message};refresh();return {success:created?"Marcada como criada no Meta Ads.":"Marcada como ainda não criada no Meta Ads."};
}
export async function saveCltTrafficCampaignAction(input:{id?:string;companyId:string;name:string;objective:string;startsOn:string;endsOn:string;budgetType:"daily"|"total";dailyBudget:number;plannedAmount:number;status:"planejada"|"ativa"|"pausada"|"finalizada";managerUrl?:string;description?:string}):Promise<State>{
 const {s,user}=await ctx();if(!input.name.trim()||!input.startsOn||!input.endsOn||input.endsOn<input.startsOn||!Number.isFinite(input.plannedAmount)||input.plannedAmount<0||!Number.isFinite(input.dailyBudget)||input.dailyBudget<0)return{error:"Confira nome, datas e valores."};
 const {data:company}=await s.from("clt_companies").select("id").eq("id",input.companyId).eq("user_id",user.id).single();if(!company)return{error:"Empresa inválida."};
 const values={name:input.name.trim(),company_id:input.companyId,objective:input.objective,starts_on:input.startsOn,ends_on:input.endsOn,budget_type:input.budgetType,daily_budget:input.dailyBudget,planned_amount:input.plannedAmount,campaign_status:input.status,manager_url:input.managerUrl||null,description:input.description||null};
 const q=input.id?s.from("clt_campaigns").update(values).eq("id",input.id).eq("company_id",input.companyId).eq("user_id",user.id):s.from("clt_campaigns").insert({...values,user_id:user.id,spent_amount:0,messages:0,sales:0,views:0});
 const {data:saved,error}=await q.select("id,daily_budget").single();if(error)return{error:error.message};if(!saved)return{error:"Não foi possível confirmar a atualização da campanha."};refresh();return{success:input.id?"Campanha atualizada.":"Campanha criada."};
}
export async function deleteCltTrafficCampaignAction(id:string,companyId:string):Promise<State>{
 const {s,user}=await ctx();
 const {data:campaign,error:lookupError}=await s.from("clt_campaigns").select("id").eq("id",id).eq("company_id",companyId).eq("user_id",user.id).maybeSingle();
 if(lookupError)return{error:lookupError.message};
 if(!campaign)return{error:"Campanha não encontrada."};
 const {error}=await s.from("clt_campaigns").delete().eq("id",id).eq("company_id",companyId).eq("user_id",user.id);
 if(error)return{error:"Não foi possível excluir a campanha: "+error.message};
 refresh();return{success:"Campanha excluída."};
}
export async function saveCltCampaignResultsAction(input:{campaignId:string;date:string;spent:number;messages:number;sales:number;views:number;appointments:number;impressions:number;reach:number;profileVisits:number;linkClicks:number;engagements:number;thruplays:number;leads:number;revenue:number;notes?:string}):Promise<State>{
 const {s,user}=await ctx();const {data:campaign}=await s.from("clt_campaigns").select("id").eq("id",input.campaignId).eq("user_id",user.id).single();if(!campaign)return{error:"Campanha inválida."};
 if(!/^\d{4}-\d{2}-\d{2}$/.test(input.date)||![input.spent,input.messages,input.sales,input.views,input.appointments,input.impressions,input.reach,input.profileVisits,input.linkClicks,input.engagements,input.thruplays,input.leads,input.revenue].every(v=>Number.isFinite(v)&&v>=0))return{error:"Valores inválidos."};
 const {error}=await s.from("clt_campaign_result_entries").upsert({user_id:user.id,campaign_id:input.campaignId,entry_date:input.date,spent_amount:input.spent,messages:input.messages,sales:input.sales,views:input.views,appointments:input.appointments,impressions:input.impressions,reach:input.reach,profile_visits:input.profileVisits,link_clicks:input.linkClicks,engagements:input.engagements,thruplays:input.thruplays,leads:input.leads,generated_revenue:input.revenue,notes:input.notes||null},{onConflict:"campaign_id,entry_date"});if(error)return{error:error.message};refresh();return{success:"Resultados atualizados."};
}
export async function saveCltAdSetAction(input:{campaignId:string;name:string;audience?:string;savedAudienceId?:string;location?:string;budget:number;notes?:string}):Promise<State>{
 const {s,user}=await ctx();const {data:campaign}=await s.from("clt_campaigns").select("id").eq("id",input.campaignId).eq("user_id",user.id).single();if(!campaign||!input.name.trim()||!Number.isFinite(input.budget)||input.budget<0)return{error:"Dados inválidos."};
 if(input.savedAudienceId){const {data:a}=await s.from("clt_audiences").select("id").eq("id",input.savedAudienceId).eq("audience_type","salvo").eq("user_id",user.id).maybeSingle();if(!a)return{error:"Público salvo inválido."};}
 const {error}=await s.from("clt_ad_sets").insert({user_id:user.id,campaign_id:input.campaignId,name:input.name.trim(),saved_audience_id:input.savedAudienceId||null,audience:input.audience||null,location:input.location||null,budget_amount:input.budget,notes:input.notes||null});if(error)return{error:error.message};refresh();return{success:"Conjunto cadastrado."};
}


export async function importCltCampaignJsonAction(input:{companyId:string;date:string;campaigns:{name:string;spent:number|null;messages:number|null;views:number|null;sales:number|null;revenue:number|null;status?:string;publicos?:{nome:string;tipo:string;configuracoes?:Record<string,unknown>;origem?:string;incluidos?:string[];excluidos?:string[]}[];sets?:{name:string;publico?:string;ads:{name:string;format:string;spent:number|null;messages:number|null;views:number|null;sales:number|null;revenue:number|null}[]}[]}[]}):Promise<State>{
 const {s,user}=await ctx();
 if(!/^\d{4}-\d{2}-\d{2}$/.test(input.date)||!Array.isArray(input.campaigns)||!input.campaigns.length||input.campaigns.length>50)return {error:"Arquivo inválido ou com mais de 50 campanhas."};
 const {data:company}=await s.from("clt_companies").select("id").eq("id",input.companyId).eq("user_id",user.id).single();
 if(!company)return {error:"Empresa não encontrada."};
 const valid=(n:number|null)=>n===null||(typeof n==="number"&&Number.isFinite(n)&&n>=0);
 if(input.campaigns.some(c=>!c.name?.trim()||c.name.length>160||![c.spent,c.messages,c.views,c.sales,c.revenue].every(valid)))return {error:"Existem campanhas com valores inválidos."};
 const {data:existing,error:readError}=await s.from("clt_campaigns").select("id,name").eq("company_id",input.companyId).eq("user_id",user.id);
 if(readError)return {error:readError.message};
 const normalize=(v:string)=>v.trim().toLocaleLowerCase("pt-BR");
 const existingByName=new Map((existing||[]).map(c=>[normalize(c.name),c]));
 const unique=new Set<string>();
 if(input.campaigns.some(c=>{const n=normalize(c.name);if(unique.has(n))return true;unique.add(n);return false;}))return {error:"O arquivo contém campanhas duplicadas."};
 let created=0,updated=0;
 // Import audiences first, so ad sets can reference newly created audiences.
 const {data:existingAudiences,error:audReadError}=await s.from("clt_audiences").select("id,name,audience_type").eq("company_id",input.companyId).eq("user_id",user.id);
 if(audReadError)return {error:audReadError.message};
 const audienceByName=new Map((existingAudiences||[]).map(a=>[normalize(a.name),a]));
 const incoming=input.campaigns.flatMap(c=>c.publicos||[]);
 if(incoming.length>100)return {error:"Máximo de 100 públicos por arquivo."};
 for(const a of incoming){
  if(!a.nome?.trim()||!["personalizado","semelhante","salvo"].includes(a.tipo))return {error:"Público inválido no JSON."};
 }
 for(const kind of ["personalizado","semelhante","salvo"]){
  for(const a of incoming.filter(a=>a.tipo===kind)){
   const key=normalize(a.nome),oldAudience=audienceByName.get(key);
   if(oldAudience&&oldAudience.audience_type!==kind)return {error:"Tipo de público divergente: "+a.nome};
   const resolve=(n:string)=>audienceByName.get(normalize(n))?.id;
   const source=a.origem?resolve(a.origem):null;
   const included=(a.incluidos||[]).map(resolve),excluded=(a.excluidos||[]).map(resolve);
   if(kind==="semelhante"&&!source)return {error:"Origem não encontrada: "+a.nome};
   if([...included,...excluded].some(id=>!id))return {error:"Referência de público não encontrada: "+a.nome};
   const isId=(id:string|undefined):id is string=>typeof id==="string";
   const values={name:a.nome.trim(),audience_type:kind,settings:a.configuracoes||{},source_audience_id:kind==="semelhante"?source??null:null,included_audience_ids:kind==="salvo"?included.filter(isId):[],excluded_audience_ids:kind==="salvo"?excluded.filter(isId):[]};
   const q=oldAudience?s.from("clt_audiences").update(values).eq("id",oldAudience.id).eq("user_id",user.id):s.from("clt_audiences").insert({...values,user_id:user.id,company_id:input.companyId});
   const {data:saved,error:audError}=await q.select("id").single();
   if(audError||!saved)return {error:"Erro no público "+a.nome+": "+(audError?.message||"Falha")};
   audienceByName.set(key,{id:saved.id,name:a.nome,audience_type:kind});
  }
 }
 const fields=[["spent","spent_amount"],["messages","messages"],["views","views"],["sales","sales"],["revenue","generated_revenue"]] as const;
 for(const c of input.campaigns){
  const old=existingByName.get(normalize(c.name));
  if(c.sets?.length){
   let campaignId=old?.id;
   if(!campaignId){
    const {data:newCampaign,error:campaignError}=await s.from("clt_campaigns").insert({user_id:user.id,company_id:input.companyId,name:c.name.trim(),objective:"mensagens",starts_on:input.date,ends_on:input.date,budget_type:"total",daily_budget:0,planned_amount:0,campaign_status:"finalizada",spent_amount:0,messages:0,sales:0,views:0,description:"Estrutura importada de JSON. Datas reais da campanha não confirmadas."}).select("id").single();
    if(campaignError||!newCampaign)return {error:campaignError?.message||"Erro ao criar campanha."};
    campaignId=newCampaign.id;created++;
   }else updated++;
   const {data:oldSets,error:setsError}=await s.from("clt_ad_sets").select("id,name").eq("campaign_id",campaignId).eq("user_id",user.id);
   if(setsError)return {error:setsError.message};
   for(const setInput of c.sets){
    if(!setInput.name.trim()||!setInput.ads?.length)return {error:"Conjunto sem nome ou anúncios."};
    let setId=oldSets?.find(x=>normalize(x.name)===normalize(setInput.name))?.id;
    const audienceName=setInput.publico?.trim();
    const audienceRef=audienceName?audienceByName.get(normalize(audienceName)):null;
    if(audienceName&&!audienceRef)return {error:"Público não encontrado: "+audienceName};
    if(audienceRef&&audienceRef.audience_type!=="salvo")return {error:"O conjunto precisa de um público salvo: "+audienceName};
    if(setId&&audienceRef){const {error:linkError}=await s.from("clt_ad_sets").update({saved_audience_id:audienceRef.id}).eq("id",setId).eq("user_id",user.id);if(linkError)return {error:linkError.message};}
    if(!setId){
     const {data:newSet,error:setError}=await s.from("clt_ad_sets").insert({user_id:user.id,campaign_id:campaignId,name:setInput.name.trim(),budget_amount:0,saved_audience_id:audienceRef?.id||null}).select("id").single();
     if(setError||!newSet)return {error:setError?.message||"Erro ao criar conjunto."};
     setId=newSet.id;
    }
    const {data:oldAds,error:adsError}=await s.from("clt_ad_creatives").select("id,name").eq("ad_set_id",setId).eq("user_id",user.id);
    if(adsError)return {error:adsError.message};
    for(const adInput of setInput.ads){
     if(!adInput.name.trim()||!["imagem","video","carrossel","outro"].includes(adInput.format)||![adInput.spent,adInput.messages,adInput.views,adInput.sales,adInput.revenue].every(valid))return {error:"Anúncio inválido."};
     let adId=oldAds?.find(x=>normalize(x.name)===normalize(adInput.name))?.id;
     if(!adId){
      const {data:newAd,error:adError}=await s.from("clt_ad_creatives").insert({user_id:user.id,ad_set_id:setId,name:adInput.name.trim(),format:adInput.format}).select("id").single();
      if(adError||!newAd)return {error:adError?.message||"Erro ao criar anúncio."};
      adId=newAd.id;
     }
     if([adInput.spent,adInput.messages,adInput.views,adInput.sales,adInput.revenue].every(v=>v===null))continue;
     // A legacy campaign entry on a different date would be counted twice.
     const {data:legacy,error:legacyError}=await s.from("clt_campaign_result_entries").select("entry_date,spent_amount,messages,sales,generated_revenue").eq("campaign_id",campaignId).eq("user_id",user.id);
     if(legacyError)return {error:legacyError.message};
     if((legacy||[]).some(x=>x.entry_date!==input.date&&(Number(x.spent_amount||0)>0||Number(x.messages||0)>0||Number(x.sales||0)>0||Number(x.generated_revenue||0)>0)))return {error:"Há resultados antigos em outra data. Selecione a data do lançamento existente para evitar duplicação."};
     const {data:previous,error:previousError}=await s.from("clt_ad_level_results").select("id").eq("ad_set_id",setId).eq("creative_id",adId).eq("entry_date",input.date).eq("user_id",user.id).maybeSingle();
     if(previousError)return {error:previousError.message};
     const values={user_id:user.id,campaign_id:campaignId,ad_set_id:setId,creative_id:adId,entry_date:input.date,spent_amount:adInput.spent??0,messages:adInput.messages??0,views:adInput.views??0,sales:adInput.sales??0,generated_revenue:adInput.revenue??0};
     const {error:resultError}=previous?await s.from("clt_ad_level_results").update(values).eq("id",previous.id).eq("user_id",user.id):await s.from("clt_ad_level_results").insert(values);
     if(resultError)return {error:resultError.message};
    }
   }
   continue;
  }
  if(old){
   const changes:Partial<{spent_amount:number;messages:number;views:number;sales:number;generated_revenue:number}>={};
   for(const [source,target] of fields){if(c[source]!==null)changes[target]=c[source] as number;}
   if(!Object.keys(changes).length)continue;
   const {data:entries,error:entriesError}=await s.from("clt_campaign_result_entries").select("id,entry_date").eq("campaign_id",old.id).eq("user_id",user.id).eq("entry_date",input.date).order("id",{ascending:true});
   if(entriesError)return {error:"Erro ao localizar resultados de "+c.name+": "+entriesError.message};
   if((entries||[]).length>1)return {error:"Há vários registros na mesma data para "+c.name+". Atualize manualmente para evitar inconsistências."};
   if(entries?.length){
    const {error}=await s.from("clt_campaign_result_entries").update(changes).eq("id",entries[0].id).eq("user_id",user.id);
    if(error)return {error:"Erro ao atualizar "+c.name+": "+error.message};
   }else{
    const {error}=await s.from("clt_campaign_result_entries").insert({user_id:user.id,campaign_id:old.id,entry_date:input.date,spent_amount:c.spent??0,messages:c.messages??0,views:c.views??0,sales:c.sales??0,generated_revenue:c.revenue??0,notes:"Atualização parcial via JSON. Campos não informados não foram alterados nos registros anteriores."});
    if(error)return {error:"Erro ao registrar atualização de "+c.name+": "+error.message};
   }
   updated++;continue;
  }
  const {data:campaign,error}=await s.from("clt_campaigns").insert({user_id:user.id,company_id:input.companyId,name:c.name.trim(),objective:"mensagens",starts_on:input.date,ends_on:input.date,budget_type:"total",daily_budget:0,planned_amount:0,campaign_status:c.status==="em_andamento"?"ativa":"finalizada",spent_amount:0,messages:0,sales:0,views:0,description:"Importada de JSON. Data de referência do arquivo; período real da campanha não informado."}).select("id").single();
  if(error||!campaign)return {error:"Criadas "+created+" e atualizadas "+updated+" campanhas antes de um erro: "+(error?.message||"Falha ao criar campanha")};
  const {error:resultError}=await s.from("clt_campaign_result_entries").insert({user_id:user.id,campaign_id:campaign.id,entry_date:input.date,spent_amount:c.spent??0,messages:c.messages??0,views:c.views??0,sales:c.sales??0,generated_revenue:c.revenue??0,notes:"Importação JSON: campos ausentes foram registrados como zero, sem confirmação de resultado zero."});
  if(resultError)return {error:"Campanha "+c.name+" criada, mas resultados não foram salvos: "+resultError.message};
  created++;
 }
 refresh();revalidatePath("/trabalho/relatorios");
 return {success:created+" campanhas criadas e "+updated+" campanhas atualizadas."};
}

export async function saveCltCampaignComparisonAction(input:{companyId:string;oldIds:string[];newIds:string[]}):Promise<State>{
 const {s,user}=await ctx();
 const oldIds=[...new Set(input.oldIds)],newIds=[...new Set(input.newIds)];
 if(!input.companyId||!oldIds.length||!newIds.length||oldIds.some(id=>newIds.includes(id)))return {error:"Selecione campanhas antigas e novas diferentes."};
 const {data:campaigns,error:readError}=await s.from("clt_campaigns").select("id,company_id,objective").eq("user_id",user.id).eq("company_id",input.companyId).in("id",[...oldIds,...newIds]);
 if(readError)return {error:readError.message};
 if(!campaigns||campaigns.length!==oldIds.length+newIds.length)return {error:"Campanhas inválidas ou de outra empresa."};
 if(campaigns.some(c=>!String(c.objective||"").toLowerCase().includes("mensag")))return {error:"Compare apenas campanhas com objetivo de mensagens."};
 const {error}=await s.from("clt_campaign_comparisons").upsert({user_id:user.id,company_id:input.companyId,old_campaign_ids:oldIds,new_campaign_ids:newIds,updated_at:new Date().toISOString()},{onConflict:"user_id,company_id"});
 if(error)return {error:error.message};refresh();revalidatePath("/trabalho/relatorios");return {success:"Comparativo salvo."};
}
export async function deleteCltCampaignComparisonAction(companyId:string):Promise<State>{
 const {s,user}=await ctx();
 const {error}=await s.from("clt_campaign_comparisons").delete().eq("user_id",user.id).eq("company_id",companyId);
 if(error)return {error:error.message};refresh();revalidatePath("/trabalho/relatorios");return {success:"Comparativo removido."};
}

export async function saveCltAdCreativeAction(input:{adSetId:string;name:string;format:string;assetUrl?:string;notes?:string}):Promise<State>{
 const {s,user}=await ctx();
 const name=input.name.trim();
 if(!name||name.length>160||!["imagem","video","carrossel","outro"].includes(input.format))return{error:"Nome ou formato inválido."};
 const {data:set}=await s.from("clt_ad_sets").select("id,campaign_id").eq("id",input.adSetId).eq("user_id",user.id).single();
 if(!set)return{error:"Conjunto não encontrado."};
 const {data:campaign}=await s.from("clt_campaigns").select("id").eq("id",set.campaign_id).eq("user_id",user.id).single();
 if(!campaign)return{error:"Campanha não encontrada."};
 const {error}=await s.from("clt_ad_creatives").insert({user_id:user.id,ad_set_id:input.adSetId,name,format:input.format,asset_url:input.assetUrl?.trim()||null,notes:input.notes?.trim()||null});
 if(error)return{error:error.message};refresh();return{success:"Anúncio cadastrado."};
}

export async function saveCltCreativeDetailsAction(input:{creativeId:string;creativeLabel:string;adCopy:string}):Promise<State>{
 const {s,user}=await ctx();
 const label=input.creativeLabel.trim(),copy=input.adCopy.trim();
 if(label.length>180||copy.length>10000)return{error:"Identificação ou texto do anúncio muito longo."};
 const {data:ad,error:lookupError}=await s.from("clt_ad_creatives").select("id,ad_set_id").eq("id",input.creativeId).eq("user_id",user.id).maybeSingle();
 if(lookupError||!ad)return{error:"Anúncio não encontrado."};
 const {data:set}=await s.from("clt_ad_sets").select("campaign_id").eq("id",ad.ad_set_id).eq("user_id",user.id).maybeSingle();
 if(!set)return{error:"Conjunto não encontrado."};
 const {data:campaign}=await s.from("clt_campaigns").select("id").eq("id",set.campaign_id).eq("user_id",user.id).maybeSingle();
 if(!campaign)return{error:"Campanha não encontrada."};
 const {error}=await s.from("clt_ad_creatives").update({creative_label:label||null,ad_copy:copy||null}).eq("id",ad.id).eq("user_id",user.id);
 if(error)return{error:error.message};refresh();return{success:"Identificação e texto do anúncio salvos."};
}

export async function saveCltAdLevelResultAction(input:{campaignId:string;adSetId:string;creativeId?:string;date:string;spent:number;messages:number;sales:number;revenue:number;views:number;impressions?:number;reach?:number;engagements?:number;linkClicks?:number;thruplays?:number;leads?:number;profileVisits?:number;appointments?:number}):Promise<State>{
 const {s,user}=await ctx();
 if(!/^\d{4}-\d{2}-\d{2}$/.test(input.date)||[input.spent,input.messages,input.sales,input.revenue,input.views].some(v=>!Number.isFinite(v)||v<0)||[input.messages,input.sales,input.views].some(v=>!Number.isInteger(v)))return{error:"Resultados inválidos."};
 const {data:set}=await s.from("clt_ad_sets").select("id,campaign_id").eq("id",input.adSetId).eq("campaign_id",input.campaignId).eq("user_id",user.id).maybeSingle();
 if(!set)return{error:"Conjunto não encontrado."};
 if(input.creativeId){const {data:ad}=await s.from("clt_ad_creatives").select("id").eq("id",input.creativeId).eq("ad_set_id",input.adSetId).eq("user_id",user.id).maybeSingle();if(!ad)return{error:"Anúncio não encontrado."};}
 const {error}=await s.from("clt_ad_level_results").upsert({user_id:user.id,campaign_id:input.campaignId,ad_set_id:input.adSetId,creative_id:input.creativeId||null,entry_date:input.date,spent_amount:input.spent,messages:input.messages,sales:input.sales,generated_revenue:input.revenue,views:input.views,impressions:input.impressions||0,reach:input.reach||0,engagements:input.engagements||0,link_clicks:input.linkClicks||0,thruplays:input.thruplays||0,leads:input.leads||0,profile_visits:input.profileVisits||0,appointments:input.appointments||0},{onConflict:"ad_set_id,creative_id,entry_date"});
 if(error)return{error:error.message};refresh();return{success:"Resultados salvos."};
}
