"use server";

import { revalidatePath } from "next/cache";
import { requireScopedModulePermission } from "@/lib/supabase/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseMoneyInput } from "@/lib/format";

export async function addTikTokProjectEntry(form: FormData) {
 const { profile, space } = await requireScopedModulePermission("tiktok", "financeiro", "create");
 const project = String(form.get("project") || "");
 const kind = String(form.get("kind") || "");
 const description = String(form.get("description") || "").trim();
 const entryDate = String(form.get("entryDate") || "");
 const amount = parseMoneyInput(String(form.get("amount") || ""));
 if (!["sofia","maria"].includes(project) || !["entrada","saida"].includes(kind) ||
     !description || !/^\d{4}-\d{2}-\d{2}$/.test(entryDate) ||
     !Number.isFinite(amount) || amount <= 0) return { error: "Confira os dados da movimentação." };
 const supabase = await createSupabaseServerClient();
 const { error } = await supabase.from("tiktok_project_entries").insert({
   space_id:space.id,user_id:profile.id,project,kind,description,entry_date:entryDate,amount
 });
 if (error) return {error:error.message};
 revalidatePath("/tiktok"); revalidatePath("/tiktok/projetos");
 return {success:true};
}

export async function deleteTikTokProjectEntry(id:string) {
 const { profile, space } = await requireScopedModulePermission("tiktok", "financeiro", "delete");
 const supabase = await createSupabaseServerClient();
 const { error } = await supabase.from("tiktok_project_entries").delete().eq("id",id).eq("space_id",space.id).eq("user_id",profile.id);
 if(error) return {error:error.message};
 revalidatePath("/tiktok/projetos");return {success:true};
}
