"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export type VideoStatus = "roteiro"|"gravacao"|"edicao"|"finalizado";
export type VideoData = { id:string;title:string;script:string|null;reference_url:string|null;production_notes:string|null;production_status:VideoStatus;is_done:boolean };
async function auth() {
 const db=(await createSupabaseServerClient()) as unknown as SupabaseClient;
 const {data:{user}}=await db.auth.getUser();
 if(!user)throw new Error("Sessão expirada.");
 return {db,user};
}
export async function listCompanyVideoTasks(parentId:string) {
 const {db,user}=await auth();
 const {data:task}=await db.from("clt_tasks").select("id").eq("id",parentId).eq("user_id",user.id).maybeSingle();
 if(!task)throw new Error("Tarefa não encontrada.");
 const {data,error}=await db.from("task_subtasks").select("id,title,script,reference_url,production_notes,production_status,is_done").eq("parent_type","clt").eq("parent_id",parentId).eq("user_id",user.id).order("position");
 if(error)throw new Error(error.message);
 return (data??[]) as VideoData[];
}
export async function saveVideoDetails(parentId:string,subtaskId:string,input:{script:string;referenceUrl:string;notes:string;status:VideoStatus},targetCompanyIds?:string[]) {
 const {db,user}=await auth();
 const {data:parent}=await db.from("clt_tasks").select("id,company_id,title").eq("id",parentId).eq("user_id",user.id).maybeSingle();
 if(!parent)return {error:"Tarefa não encontrada."};
 const {data:source}=await db.from("task_subtasks").select("id,title").eq("id",subtaskId).eq("parent_id",parentId).eq("parent_type","clt").eq("user_id",user.id).maybeSingle();
 if(!source)return {error:"Vídeo não encontrado."};
 if(input.referenceUrl && !/^https?:\/\/\S+$/i.test(input.referenceUrl))return {error:"Link inválido."};
 if(!["roteiro","gravacao","edicao","finalizado"].includes(input.status))return {error:"Status inválido."};
 const fields={script:input.script,reference_url:input.referenceUrl||null,production_notes:input.notes,production_status:input.status,updated_at:new Date().toISOString()};
 const {error:singleError}=await db.from("task_subtasks").update(fields).eq("id",subtaskId).eq("user_id",user.id);
 if(singleError)return {error:singleError.message};
 if(targetCompanyIds?.length){
  const unique=[...new Set(targetCompanyIds)].filter(id=>id!==parent.company_id).slice(0,100);
  const {data:companies,error:companyError}=await db.from("clt_companies").select("id").eq("user_id",user.id).in("id",unique);
  if(companyError)return {error:companyError.message};
  const ids=(companies??[]).map(c=>c.id);
  if(ids.length){
   const {data:tasks,error:taskError}=await db.from("clt_tasks").select("id,company_id").eq("user_id",user.id).eq("title",parent.title).in("company_id",ids);
   if(taskError)return {error:taskError.message};
   for(const task of tasks??[]){
    const {data:video,error:findError}=await db.from("task_subtasks").select("id").eq("user_id",user.id).eq("parent_type","clt").eq("parent_id",task.id).eq("title",source.title).maybeSingle();
    if(findError)return {error:findError.message};
    if(video){const {error}=await db.from("task_subtasks").update(fields).eq("id",video.id).eq("user_id",user.id);if(error)return {error:error.message};}
   }
  }
 }
 revalidatePath("/trabalho/empresas");
 return {success:true};
}

export async function createMonthlyVideoPlans(month:string) {
 const {db,user}=await auth();
 if(!/^\\d{4}-\\d{2}$/.test(month))return {error:"Mês inválido."};
 const {data:companies,error:companyError}=await db.from("clt_companies").select("id,name").eq("user_id",user.id).eq("is_active",true);
 if(companyError)return {error:companyError.message};
 const included=(companies??[]).filter(c=>!["piv","verificar"].includes(c.name.trim().toLowerCase()));
 const title="Produção de Vídeos | Mensal";
 const labels=["Vídeo 01 — WhatsApp Principal","Vídeo 02 — Engajamento","Vídeo 03 — WhatsApp Teste"];
 let created=0;
 for(const company of included){
  const {data:existing,error:findError}=await db.from("clt_tasks").select("id").eq("user_id",user.id).eq("company_id",company.id).eq("title",title).eq("notes","Plano de vídeos: "+month).limit(1);
  if(findError)return {error:findError.message};
  let id=existing?.[0]?.id as string|undefined;
  if(!id){
   const {data:task,error}=await db.from("clt_tasks").insert({user_id:user.id,company_id:company.id,title,kind:"prazo",priority:"importante",status:"pendente",notes:"Plano de vídeos: "+month,recurrence:"none",weekdays:[]}).select("id").single();
   if(error)return {error:error.message};
   id=task.id;created++;
  }
  const {data:subtasks,error:subError}=await db.from("task_subtasks").select("title").eq("user_id",user.id).eq("parent_type","clt").eq("parent_id",id);
  if(subError)return {error:subError.message};
  const missing=labels.filter(label=>!(subtasks??[]).some(x=>x.title===label));
  if(missing.length){
   const {error}=await db.from("task_subtasks").insert(missing.map((label,index)=>({parent_type:"clt",parent_id:id,user_id:user.id,title:label,position:labels.indexOf(label),production_status:"roteiro"})));
   if(error)return {error:error.message};
  }
 }
 revalidatePath("/trabalho/empresas");revalidatePath("/trabalho/empresas/[id]","page");
 return {success:true,created,companies:included.length};
}
