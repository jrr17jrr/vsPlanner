"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/supabase/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function setUserCltAccessAction(userId: string, enabled: boolean): Promise<{error?: string; success?: string}> {
  const { profile } = await requireSuperAdmin();
  if (userId === profile.id && !enabled) return {error:"Não é possível remover o próprio acesso administrativo ao CLT."};
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("profiles").update({clt_access:enabled}).eq("id",userId).select("id").maybeSingle();
  if (error) return {error:error.message};
  if (!data) return {error:"Usuário não encontrado ou sem permissão para atualizar."};
  revalidatePath("/dev");
  revalidatePath(`/dev/usuarios/${userId}`);
  return {success:enabled?"Acesso CLT liberado.":"Acesso CLT removido."};
}
