"use server";
import type {SupabaseClient} from "@supabase/supabase-js";
import {revalidatePath} from "next/cache";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import {isMissingDescriptionColumn,pickImportedDescription} from "@/lib/subtask-description";
import {getModuleScope} from "@/lib/supabase/clt-scope";
export type PlanningArea="clt"|"pessoal"|"rotina"|"visionario";
export type PlanningInput={area:PlanningArea;companyId?:string|null;title:string;notes?:string;plannedDate?:string;endsOn?:string;scheduledTime?:string;weekdays?:number[];objective?:string;dailyBudget?:number;plannedAmount?:number;description?:string;descricao?:string;subtasks?:Array<string|{title:string;dueDate?:string;description?:string;descricao?:string;subtasks?:Array<string|{title:string;dueDate?:string;description?:string;descricao?:string}>}>;priority?:"normal"|"importante"};
type NestedSubtask={title:string;dueDate?:string;description?:string;subtasks:Array<{title:string;dueDate?:string;description?:string}>};
/** Insere com descrição; se o banco ainda não tiver a coluna (migration pendente), grava sem ela. */
async function insertSubtaskRows(db:SupabaseClient,rows:Record<string,unknown>[],select:boolean){
 const strip=()=>rows.map(r=>{const c={...r};delete c.description;return c;});
 const run=(r:Record<string,unknown>[])=>select?db.from("task_subtasks").insert(r).select("id").single():db.from("task_subtasks").insert(r);
 let res=await run(rows.some(r=>r.description)?rows:strip());
 if(res.error&&isMissingDescriptionColumn(res.error))res=await run(strip());
 return res as {data:{id:string}|null;error:{message:string}|null};
}
async function context(){const s=await createSupabaseServerClient();const {data:{user}}=await s.auth.getUser();if(!user)throw new Error("Faça login.");return{s,user};}
function refresh(){revalidatePath("/planejamento");revalidatePath("/trabalho/campanhas");revalidatePath("/trabalho");revalidatePath("/visionario/mkt","layout");}
async function insertNestedSubtasks(db:SupabaseClient,userId:string,parentType:"pessoal"|"clt",parentId:string,subtasks:NestedSubtask[]):Promise<string|null>{
 for(let i=0;i<subtasks.length;i++){
  const stage=subtasks[i];
  const {data:root,error}=await insertSubtaskRows(db,[{parent_type:parentType,parent_id:parentId,user_id:userId,title:stage.title.trim(),due_date:stage.dueDate||null,position:i,description:stage.description||null}],true);
  if(error||!root)return "Tarefa criada, mas houve erro nas etapas: "+(error?.message||"Falha ao criar etapa");
  if(stage.subtasks.length){
   const {error:childError}=await insertSubtaskRows(db,stage.subtasks.map((child,j)=>({parent_type:parentType,parent_id:parentId,user_id:userId,parent_subtask_id:root.id,title:child.title.trim(),due_date:child.dueDate||null,position:j,description:child.description||null})),false);
   if(childError)return "Etapa criada, mas falhou ao salvar checklist: "+childError.message;
  }
 }
 return null;
}
export async function importPlanningItemsAction(items:PlanningInput[],module:"clt"|"mkt"="clt"){
 try{
 const {s,user}=await context();
 if(!Array.isArray(items)||items.length<1||items.length>150)return {error:"Selecione de 1 a 150 itens."};
 // Só empresas do módulo da tela (Planejamento geral = CLT; Visionário Dev → MKT = MKT).
 if(module!=="clt"&&module!=="mkt")return {error:"Módulo inválido."};
 const scope=await getModuleScope(s,user.id,module);
 if(module==="mkt"&&!scope.ready)return {error:"O módulo MKT ainda não está ativo no banco (migração pendente)."};
 const allowed=new Set(scope.companyIds);
 if(module==="mkt"&&items.some(i=>i.area!=="clt"))return {error:"No planejamento do MKT, importe apenas itens de MKT (campanhas e tarefas das empresas MKT)."};
 const prepared=[];
 for(const item of items){
 if(!["clt","pessoal","rotina","visionario"].includes(item.area)||typeof item.title!=="string"||!item.title.trim()||item.title.length>240)return {error:"Um item possui título ou área inválida."};
 if(item.companyId&&!allowed.has(item.companyId))return {error:"Empresa não encontrada neste módulo."};
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
 if(item.subtasks!==undefined&&(!Array.isArray(item.subtasks)||item.subtasks.length>50))return {error:"Subtarefas inválidas (máximo 50)."};
 const subtasks:NestedSubtask[]=(item.subtasks||[]).map(raw=>typeof raw==="string"?{title:raw,subtasks:[] as NestedSubtask["subtasks"]}:{
   title:raw.title,dueDate:raw.dueDate,description:pickImportedDescription(raw),subtasks:(raw.subtasks||[]).map(child=>typeof child==="string"?{title:child}:{title:child.title,dueDate:child.dueDate,description:pickImportedDescription(child)})
 });
 if(subtasks.some(t=>typeof t.title!=="string"||!t.title.trim()||t.title.length>300||t.subtasks.length>50||t.subtasks.some(c=>typeof c.title!=="string"||!c.title.trim()||c.title.length>300)))return {error:"Título de subtarefa inválido."};
 if(item.priority && !["normal","importante"].includes(item.priority))return {error:"Prioridade inválida."};
 prepared.push({...item,title:item.title.trim(),description:pickImportedDescription(item),subtasks,dailyBudget:daily,plannedAmount:planned,weekdays,priority:item.priority||"normal"});
 }

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
 const {data:createdTask,error}=await s.from("clt_tasks").insert({user_id:user.id,company_id:companyId,title:item.title,description:item.description||null,kind:item.plannedDate?"dia":"prazo",due_date:weekly?null:item.plannedDate||null,scheduled_time:item.scheduledTime||null,priority:item.priority,notes,recurrence:weekly?"weekly":"none",weekdays:weekly?item.weekdays:[],recurrence_start:weekly?new Date().toLocaleDateString("en-CA",{timeZone:"America/Sao_Paulo"}):null,recurrence_until:null}).select("id").single();
 if(error||!createdTask)return {error:(error?.message||"Falha ao criar tarefa")+" ("+created+" itens já criados)"};
 if(item.subtasks.length){const result=await insertNestedSubtasks(s as unknown as SupabaseClient,user.id,"clt",createdTask.id,item.subtasks);if(result)return {error:result};}
 }
 }else if(item.area==="pessoal"||item.area==="visionario"){
 const {data:existing}=await s.from("tasks").select("id").eq("user_id",user.id).eq("space_id",personalSpace!).eq("title",item.title).limit(1);
 if(existing?.length){skipped++;continue;}
 const weekly=item.weekdays.length>0;
 const {data:createdTask,error}=await s.from("tasks").insert({user_id:user.id,space_id:personalSpace!,title:item.title,description:item.description||null,kind:item.plannedDate?"dia":"prazo",due_date:weekly?null:item.plannedDate||null,scheduled_time:item.scheduledTime||null,priority:item.priority,notes,recurrence:weekly?"weekly":"none",weekdays:weekly?item.weekdays:[],recurrence_start:weekly?new Date().toLocaleDateString("en-CA",{timeZone:"America/Sao_Paulo"}):null,recurrence_until:null}).select("id").single();
 if(error||!createdTask)return {error:(error?.message||"Erro ao criar tarefa")+" ("+created+" itens já criados)"};
 if(item.subtasks.length){const result=await insertNestedSubtasks(s as unknown as SupabaseClient,user.id,"pessoal",createdTask.id,item.subtasks);if(result)return {error:result};}
 }else if(item.area==="rotina"){
 const {data:existing}=await s.from("activities").select("id").eq("user_id",user.id).eq("space_id",personalSpace!).eq("title",item.title).limit(1);
 if(existing?.length){skipped++;continue;}
 if(!item.scheduledTime||!item.weekdays.length){skipped++;continue;}
 const {error}=await s.from("activities").insert({user_id:user.id,space_id:personalSpace!,title:item.title,start_time:item.scheduledTime,weekdays:item.weekdays,notes,is_active:true});
 if(error)return {error:error.message+" ("+created+" itens já criados)"};
 }
 created++;
 }
 ["/planejamento","/trabalho","/trabalho/campanhas","/trabalho/tarefas","/tarefas","/rotina","/hoje"].forEach(p=>revalidatePath(p));revalidatePath("/visionario/mkt","layout");
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
