"use server";
import {revalidatePath} from "next/cache";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import type {SupabaseClient} from "@supabase/supabase-js";
export async function saveCltWeeklyDayAction(companyId:string,weekday:number){
 const s=await createSupabaseServerClient();const {data:{user}}=await s.auth.getUser();
 if(!user)return {error:"Faça login novamente."};
 if(!Number.isInteger(weekday)||weekday < -1||weekday>6)return {error:"Dia inválido."};
 const {data:company}=await s.from("clt_companies").select("id").eq("id",companyId).single();
 if(!company)return {error:"Empresa não encontrada."};
 const {error}=await (s as unknown as SupabaseClient).from("clt_weekly_reviews").upsert({user_id:user.id,company_id:companyId,weekday:weekday===-1?null:weekday,updated_at:new Date().toISOString()},{onConflict:"user_id,company_id"});
 if(error)return {error:error.message};revalidatePath("/trabalho");return {success:"Dia salvo."};
}
export async function markCltWeeklyReviewAction(companyId:string,reviewed:boolean){
 const s=await createSupabaseServerClient();const {data:{user}}=await s.auth.getUser();
 if(!user)return {error:"Faça login novamente."};
 const {data:company}=await s.from("clt_companies").select("id").eq("id",companyId).single();
 if(!company)return {error:"Empresa não encontrada."};
 const db=s as unknown as SupabaseClient;
 const {data:existing}=await db.from("clt_weekly_reviews").select("weekday").eq("user_id",user.id).eq("company_id",companyId).maybeSingle();
 const {error}=await db.from("clt_weekly_reviews").upsert({user_id:user.id,company_id:companyId,weekday:existing?.weekday??null,last_reviewed_on:reviewed?new Date().toLocaleDateString("en-CA",{timeZone:"America/Sao_Paulo"}):null,updated_at:new Date().toISOString()},{onConflict:"user_id,company_id"});
 if(error)return {error:error.message};revalidatePath("/trabalho");return {success:reviewed?"Acompanhamento concluído.":"Acompanhamento reaberto."};
}
