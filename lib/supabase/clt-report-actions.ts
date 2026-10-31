"use server";
import {revalidatePath} from "next/cache";
import type {SupabaseClient} from "@supabase/supabase-js";
import {createSupabaseServerClient} from "@/lib/supabase/server";
export async function addCltAdAccountMovementAction(input:{companyId:string;date:string;kind:"deposito"|"credito";amount:number;notes?:string}){
 const s=await createSupabaseServerClient();const {data:{user}}=await s.auth.getUser();
 if(!user)return {error:"Faça login."};
 if(!/^\d{4}-\d{2}-\d{2}$/.test(input.date)||!["deposito","credito"].includes(input.kind)||!Number.isFinite(input.amount)||input.amount<=0)return {error:"Confira os dados do lançamento."};
 const {data:company}=await s.from("clt_companies").select("id").eq("id",input.companyId).eq("user_id",user.id).single();
 if(!company)return {error:"Empresa não encontrada."};
 const {error}=await (s as unknown as SupabaseClient).from("clt_ad_account_movements").insert({user_id:user.id,company_id:input.companyId,movement_date:input.date,kind:input.kind,amount:input.amount,notes:input.notes||null});
 if(error)return {error:error.message};revalidatePath("/trabalho/relatorios");revalidatePath("/visionario/mkt","layout");return {success:"Movimentação registrada."};
}
