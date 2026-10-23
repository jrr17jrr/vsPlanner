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
