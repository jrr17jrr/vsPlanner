"use server";
import {revalidatePath} from "next/cache";
import type {SupabaseClient} from "@supabase/supabase-js";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import {sanitizeReportMetrics} from "@/lib/clt/report-metrics";
export async function addCltAdAccountMovementAction(input:{companyId:string;date:string;kind:"deposito"|"credito";amount:number;notes?:string}){
 const s=await createSupabaseServerClient();const {data:{user}}=await s.auth.getUser();
 if(!user)return {error:"Faça login."};
 if(!/^\d{4}-\d{2}-\d{2}$/.test(input.date)||!["deposito","credito"].includes(input.kind)||!Number.isFinite(input.amount)||input.amount<=0)return {error:"Confira os dados do lançamento."};
 const {data:company}=await s.from("clt_companies").select("id").eq("id",input.companyId).eq("user_id",user.id).single();
 if(!company)return {error:"Empresa não encontrada."};
 const {error}=await (s as unknown as SupabaseClient).from("clt_ad_account_movements").insert({user_id:user.id,company_id:input.companyId,movement_date:input.date,kind:input.kind,amount:input.amount,notes:input.notes||null});
 if(error)return {error:error.message};revalidatePath("/trabalho/relatorios");revalidatePath("/visionario/mkt","layout");return {success:"Movimentação registrada."};
}

/**
 * "Salvar como padrão desta empresa" (Personalizar relatório). Grava só a
 * LISTA de métricas exibidas — nenhum resultado é alterado. Só o dono da
 * empresa (RLS + conferência explícita). Sem a migration 20261106100000,
 * avisa em vez de falhar.
 */
export async function saveCltReportPreferencesAction(companyId:string,metrics:string[]){
 const clean=sanitizeReportMetrics(metrics);
 if(!clean)return {error:"Seleção inválida."};
 const s=await createSupabaseServerClient();const {data:{user}}=await s.auth.getUser();
 if(!user)return {error:"Faça login."};
 const {data:company}=await s.from("clt_companies").select("id").eq("id",companyId).eq("user_id",user.id).maybeSingle();
 if(!company)return {error:"Empresa não encontrada."};
 const {error}=await (s as unknown as SupabaseClient).from("clt_report_preferences").upsert({company_id:companyId,user_id:user.id,metrics:clean,updated_at:new Date().toISOString()},{onConflict:"company_id"});
 if(error)return {error:["42P01","PGRST205"].includes(String(error.code))?"Para salvar preferências por empresa, aplique a migração 20261106100000_clt_ad_engagement_video_metrics.sql no Supabase. A seleção continua valendo para este relatório.":error.message};
 revalidatePath("/trabalho/relatorios");revalidatePath("/visionario/mkt","layout");
 return {success:"Seleção salva como padrão desta empresa.",metrics:clean};
}
