import type {SupabaseClient} from "@supabase/supabase-js";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import {PlanningClient} from "@/components/planejamento/planning-client";
export const dynamic="force-dynamic";
export default async function Page(){
 const s=await createSupabaseServerClient();
 const {data:{user}}=await s.auth.getUser();
 if(!user)return <p>Faça login para acessar o planejamento.</p>;
 const [items,companies]=await Promise.all([(s as unknown as SupabaseClient).from("planning_items").select("*").eq("user_id",user.id).order("created_at",{ascending:false}),s.from("clt_companies").select("id,name,current_ad_balance").eq("user_id",user.id).order("name")]);
 return <PlanningClient initial={items.data||[]} companies={companies.data||[]} loadError={items.error?.message}/>;
}