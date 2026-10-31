import type {SupabaseClient} from "@supabase/supabase-js";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import {PlanningClient} from "@/components/planejamento/planning-client";
import {getModuleScope} from "@/lib/supabase/clt-scope";
export const dynamic="force-dynamic";
export default async function Page(){
 const s=await createSupabaseServerClient();
 const {data:{user}}=await s.auth.getUser();
 if(!user)return <p>Faça login para acessar o planejamento.</p>;
 // Planejamento geral (Minha Vida + Trabalho / CLT): só empresas do CLT; itens de empresas do MKT ficam no planejamento do MKT.
 const [items,scope,mkt]=await Promise.all([(s as unknown as SupabaseClient).from("planning_items").select("*").eq("user_id",user.id).order("created_at",{ascending:false}),getModuleScope(s,user.id,"clt"),getModuleScope(s,user.id,"mkt")]);
 const mktIds=new Set(mkt.companyIds);
 const visible=(items.data||[]).filter((i:{company_id:string|null})=>!i.company_id||!mktIds.has(i.company_id));
 const companies=scope.companies.map(c=>({id:c.id,name:c.name,current_ad_balance:c.current_ad_balance}));
 return <PlanningClient initial={visible} companies={companies} loadError={items.error?.message}/>;
}
