import { requireScopedModulePermission } from "@/lib/supabase/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TikTokProjectsClient } from "@/components/tiktok/projects-client";

export default async function TikTokProjectsPage(){
 const {space}=await requireScopedModulePermission("tiktok","financeiro","view");
 const supabase=await createSupabaseServerClient();
 const {data,error}=await supabase.from("tiktok_project_entries").select("*").eq("space_id",space.id).order("entry_date",{ascending:false});
 if(error) return <div className="rounded-lg border border-border p-5 text-sm">Para ativar os projetos, execute a migration <code>20261020_tiktok_projects.sql</code> no Supabase. Detalhes: {error.message}</div>;
 return <TikTokProjectsClient entries={data??[]}/>;
}
