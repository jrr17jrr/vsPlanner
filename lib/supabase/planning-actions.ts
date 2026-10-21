"use server";
import type {SupabaseClient} from "@supabase/supabase-js";
import {revalidatePath} from "next/cache";
import {createSupabaseServerClient} from "@/lib/supabase/server";
export type PlanningArea="clt"|"pessoal"|"rotina"|"visionario";
export type PlanningInput={area:PlanningArea;companyId?:string|null;title:string;notes?:string;plannedDate?:string;scheduledTime?:string;weekdays?:number[];objective?:string;dailyBudget?:number;plannedAmount?:number};
async function context(){const s=await createSupabaseServerClient();const {data:{user}}=await s.auth.getUser();if(!user)throw new Error("Faça login.");return{s,user};}
function refresh(){revalidatePath("/planejamento");revalidatePath("/trabalho/campanhas");revalidatePath("/trabalho");}
export async function importPlanningItemsAction(items:PlanningInput[]){
 try{
 const {s,user}=await context();
 if(!Array.isArray(items)||items.length<1||items.length>150)return {error:"Selecione de 1 a 150 itens."};
 const {data:companies,error:ce}=await s.from("clt_companies").select("id").eq("user_id",user.id);
 if(ce)return {error:ce.message};
 const allowed=new Set((companies||[]).map(c=>c.id));
 const rows=[];
 for(const item of items){
 if(!["clt","pessoal","rotina","visionario"].includes(item.area)||typeof item.title!=="string"||!item.title.trim()||item.title.length>240)return {error:"Um item possui título ou área inválida."};
 if(item.companyId&&!allowed.has(item.companyId))return {error:"Empresa não encontrada na sua conta."};
 if(item.area!=="clt"&&item.companyId)return {error:"Empresa só pode ser vinculada ao CLT."};
 if(item.plannedDate&&!/^\d{4}-\d{2}-\d{2}$/.test(item.plannedDate))return {error:"Data inválida."};
 if(item.scheduledTime&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(item.scheduledTime))return {error:"Horário inválido."};
 const daily=Number(item.dailyBudget||0),planned=Number(item.plannedAmount||0);
 if(!Number.isFinite(daily)||daily<0||!Number.isFinite(planned)||planned<0)return {error:"Orçamento inválido."};
 const weekdays=item.weekdays||[];
 if(!Array.isArray(weekdays)||weekdays.some(d=>!Number.isInteger(d)||d<0||d>6))return {error:"Dias da semana inválidos."};
 rows.push({user_id:user.id,area:item.area,company_id:item.companyId||null,title:item.title.trim(),notes:item.notes?.slice(0,4000)||null,planned_date:item.plannedDate||null,scheduled_time:item.scheduledTime||null,recurrence_weekdays:weekdays,objective:item.objective?.slice(0,200)||null,daily_budget:daily,planned_amount:planned});
 }
 const {error}=await (s as unknown as SupabaseClient).from("planning_items").insert(rows);
 if(error)return {error:error.message};
 refresh();return {success:`${rows.length} itens importados.`};
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
