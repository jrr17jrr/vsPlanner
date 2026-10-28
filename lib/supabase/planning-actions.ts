"use server";
import type {SupabaseClient} from "@supabase/supabase-js";
import {revalidatePath} from "next/cache";
import {createSupabaseServerClient} from "@/lib/supabase/server";
export type PlanningArea="clt"|"pessoal"|"rotina"|"visionario";
export type PlanningInput={area:PlanningArea;companyId?:string|null;title:string;notes?:string;plannedDate?:string;endsOn?:string;scheduledTime?:string;weekdays?:number[];objective?:string;dailyBudget?:number;plannedAmount?:number;subtasks?:string[]};
async function context(){const s=await createSupabaseServerClient();const {data:{user}}=await s.auth.getUser();if(!user)throw new Error("Faça login.");return{s,user};}
function refresh(){revalidatePath("/planejamento");revalidatePath("/trabalho/campanhas");revalidatePath("/trabalho");}
export async function importPlanningItemsAction(items:PlanningInput[]){
 try{
 const {s,user}=await context();
 if(!Array.isArray(items)||items.length<1||items.length>150)return {error:"Selecione de 1 a 150 itens."};
 const {data:companies,error:ce}=await s.from("clt_companies").select("id").eq("user_id",user.id);
 if(ce)return {error:ce.message};
 const allowed=new Set((companies||[]).map(c=>c.id));
 const prepared=[];
 for(const item of items){
 if(!["clt","pessoal","rotina","visionario"].includes(item.area)||typeof item.title!=="string"||!item.title.trim()||item.title.length>240)return {error:"Um item possui título ou área inválida."};
 if(item.companyId&&!allowed.has(item.companyId))return {error:"Empresa não encontrada na sua conta."};
 if(item.area==="clt"&&!item.companyId)return {error:"Informe a empresa CLT de cada item."};
 if(item.area!=="clt"&&item.companyId)return {error:"Empresa só pode ser vinculada ao CLT."};
 if(item.plannedDate&&!/^\d{4}-\d{2}-\d{2}$/.test(item.plannedDate))return {error:"Data inválida."};
 if(item.endsOn&&!/^\d{4}-\d{2}-\d{2}$/.test(item.endsOn))return {error:"Data final inválida."};
 if(item.endsOn&&item.plannedDate&&item.endsOn<item.plannedDate)return {error:"Data final anterior ao início."};
 if(item.scheduledTime&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(item.scheduledTime))return {error:"Horário inválido."};
 const daily=Number(item.dailyBudget||0),planned=Number(item.plannedAmount||0);
 if(!Number.isFinite(daily)||daily<0||!Number.isFinite(planned)||planned<0)return {error:"Orçamento inválido."};
 const weekdays=item.weekdays||[];
 if(!Array.isArray(weekdays)||weekdays.some(d=>!Number.isInteger(d)||d<0||d>6))return {error:"Dias da semana inválidos."};
 if(item.subtasks!==undefined&&(!Array.isArray(item.subtasks)||item.subtasks.length>50||item.subtasks.some(t=>typeof t!=="string"||!t.trim()||t.length>300)))return {error:"Subtarefas inválidas (máximo 50, até 300 caracteres cada)."};
 prepared.push({...item,title:item.title.trim(),subtasks:(item.subtasks||[]).map(t=>t.trim()),dailyBudget:daily,plannedAmount:planned,weekdays});
 }
 if(prepared.some(x=>x.area==="visionario"))return {error:"Importação da Visionário Dev ainda não está integrada ao módulo de Trabalhos. Nenhum item foi importado."};
 const {data:spaces,error:se}=await s.from("spaces").select("id,type").eq("owner_id",user.id).eq("type","personal").limit(1);
 if(se&&prepared.some(x=>x.area!=="clt"))return {error:se.message};
 const personalSpace=spaces?.[0]?.id;
 if(prepared.some(x=>x.area!=="clt")&&!personalSpace)return {error:"Espaço pessoal não encontrado. Nenhum item foi importado."};
 let created=0,skipped=0;
 for(const item of prepared){
 const notes=item.notes?.trim().slice(0,4000)||null;
 if(item.area==="clt"){
 const companyId=item.companyId!;
 const isCampaign=item.dailyBudget>0||item.plannedAmount>0||!!item.objective?.trim();
 if(isCampaign){
 if(!item.plannedDate){skipped++;continue;}
 const {data:existing,error:checkError}=await s.from("clt_campaigns").select("id").eq("user_id",user.id).eq("company_id",companyId).ilike("name",item.title).limit(1);
 if(checkError)return {error:checkError.message+" ("+created+" itens já criados)"};
 if(existing?.length){skipped++;continue;}
 const {error}=await s.from("clt_campaigns").insert({user_id:user.id,company_id:companyId,name:item.title,objective:item.objective||"Engajamento",description:notes,starts_on:item.plannedDate,ends_on:item.endsOn||item.plannedDate,budget_type:"daily",daily_budget:item.dailyBudget,planned_amount:item.plannedAmount,campaign_status:"planejada",spent_amount:0,messages:0,sales:0,views:0});
 if(error)return {error:error.message+" ("+created+" itens já criados)"};
 }else{
 const {data:existing,error:checkError}=await s.from("clt_tasks").select("id").eq("user_id",user.id).eq("company_id",companyId).eq("title",item.title).limit(1);
 if(checkError)return {error:checkError.message+" ("+created+" itens já criados)"};
 if(existing?.length){skipped++;continue;}
 const weekly=item.weekdays.length>0;
 const {data:createdTask,error}=await s.from("clt_tasks").insert({user_id:user.id,company_id:companyId,title:item.title,kind:item.plannedDate?"dia":"prazo",due_date:weekly?null:item.plannedDate||null,scheduled_time:item.scheduledTime||null,priority:"normal",notes,recurrence:weekly?"weekly":"none",weekdays:weekly?item.weekdays:[],recurrence_start:weekly?new Date().toLocaleDateString("en-CA",{timeZone:"America/Sao_Paulo"}):null,recurrence_until:null}).select("id").single();
 if(error||!createdTask)return {error:(error?.message||"Falha ao criar tarefa")+" ("+created+" itens já criados)"};
 if(item.subtasks.length){const {error:subError}=await (s as unknown as SupabaseClient).from("task_subtasks").insert(item.subtasks.map((title,position)=>({parent_type:"clt",parent_id:createdTask.id,user_id:user.id,title,position})));if(subError)return {error:"Tarefa criada, mas falhou ao criar subtarefas: "+subError.message};}
 }
 }else if(item.area==="pessoal"){
 const {data:existing}=await s.from("tasks").select("id").eq("user_id",user.id).eq("space_id",personalSpace!).eq("title",item.title).limit(1);
 if(existing?.length){skipped++;continue;}
 const weekly=item.weekdays.length>0;
 const {error}=await s.from("tasks").insert({user_id:user.id,space_id:personalSpace!,title:item.title,kind:item.plannedDate?"dia":"prazo",due_date:weekly?null:item.plannedDate||null,scheduled_time:item.scheduledTime||null,priority:"normal",notes,recurrence:weekly?"weekly":"none",weekdays:weekly?item.weekdays:[],recurrence_start:weekly?new Date().toLocaleDateString("en-CA",{timeZone:"America/Sao_Paulo"}):null,recurrence_until:null});
 if(error)return {error:error.message+" ("+created+" itens já criados)"};
 }else if(item.area==="rotina"){
 const {data:existing}=await s.from("activities").select("id").eq("user_id",user.id).eq("space_id",personalSpace!).eq("title",item.title).limit(1);
 if(existing?.length){skipped++;continue;}
 if(!item.scheduledTime||!item.weekdays.length){skipped++;continue;}
 const {error}=await s.from("activities").insert({user_id:user.id,space_id:personalSpace!,title:item.title,start_time:item.scheduledTime,weekdays:item.weekdays,notes,is_active:true});
 if(error)return {error:error.message+" ("+created+" itens já criados)"};
 }
 created++;
 }
 ["/planejamento","/trabalho","/trabalho/campanhas","/trabalho/tarefas","/tarefas","/rotina","/hoje"].forEach(p=>revalidatePath(p));
 return {success:created+" itens criados nos módulos corretos. "+skipped+" ignorados (duplicados ou incompletos)."};
 }catch(e){return {error:e instanceof Error?e.message:"Erro ao importar."};}
}
export async function updatePlanningItemAction(id:string,patch:{completed?:boolean;actualAmount?:number;views?:number;messages?:number}){
 try{const {s,user}=await context();const values:Record<string,number|boolean>={};
 if(typeof patch.completed==="boolean")values.completed=patch.completed;
 for(const [from,to] of [["actualAmount","actual_amount"],["views","views"],["messages","messages"]] as const){const v=patch[from];if(v!==undefined){if(!Number.isFinite(v)||v<0)return {error:"Valor inválido."};values[to]=v;}}
 if(!Object.keys(values).length)return {error:"Nenhuma alteração."};
 const {error}=await (s as unknown as SupabaseClient).from("planning_items").update(values).eq("id",id).eq("user_id",user.id);
 if(error)return {error:error.message};refresh();return {success:"Atualizado."};
 }catch(e){return {error:e instanceof Error?e.message:"Erro."};}
}
export async function deletePlanningItemAction(id:string){
 const {s,user}=await context();const {error}=await (s as unknown as SupabaseClient).from("planning_items").delete().eq("id",id).eq("user_id",user.id);if(error)return {error:error.message};refresh();return {success:"Excluído."};
}
export async function createCampaignFromPlanningAction(id:string){
 const {s,user}=await context();
 const {data:item,error:e}=await (s as unknown as SupabaseClient).from("planning_items").select("*").eq("id",id).eq("user_id",user.id).single();
 if(e||!item)return {error:"Item não encontrado."};
 if(item.area!=="clt"||!item.company_id)return {error:"Selecione uma empresa CLT para esta campanha."};
 if(item.campaign_id)return {error:"Esta campanha já foi cadastrada."};
 if(!item.planned_date)return {error:"Informe a data planejada antes de criar a campanha."};
 const {data:company}=await s.from("clt_companies").select("id").eq("id",item.company_id).eq("user_id",user.id).single();
 if(!company)return {error:"Empresa não encontrada."};
 const {data:campaign,error}=await s.from("clt_campaigns").insert({user_id:user.id,company_id:item.company_id,name:item.title,objective:item.objective||"Engajamento",starts_on:item.planned_date,ends_on:item.planned_date,budget_type:"total",daily_budget:Number(item.daily_budget)||0,planned_amount:Number(item.planned_amount)||0,campaign_status:"planejada",description:item.notes||null,spent_amount:0,messages:0,sales:0,views:0}).select("id").single();
 if(error||!campaign)return {error:error?.message||"Falha ao criar campanha."};
 const {error:linkError}=await (s as unknown as SupabaseClient).from("planning_items").update({campaign_id:campaign.id,completed:true}).eq("id",id).eq("user_id",user.id).is("campaign_id",null);
 if(linkError)return {error:"Campanha criada, mas falhou ao vincular: "+linkError.message};
 refresh();return {success:"Campanha cadastrada no VSPlanner. Confirme a publicação separadamente no Meta Ads."};
}
