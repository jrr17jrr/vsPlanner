"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RESULT_TYPE_VALUES } from "@/lib/clt/history";

/**
 * Define (ou limpa) o tipo de resultado de um conjunto — usado para o custo
 * por mensagem considerar só o investimento elegível. Só altera a coluna
 * nova `result_type`; nenhum resultado ou gasto é modificado.
 */
export async function setCltAdSetResultTypeAction(adSetId: string, resultType: string | null): Promise<{ error?: string; success?: string }> {
  const s = await createSupabaseServerClient();
  const { data: auth, error: authError } = await s.auth.getUser();
  if (authError || !auth.user) return { error: "Sessão inválida." };
  if (resultType !== null && !(RESULT_TYPE_VALUES as string[]).includes(resultType)) return { error: "Tipo de resultado inválido." };
  const { data: set } = await s.from("clt_ad_sets").select("id").eq("id", adSetId).eq("user_id", auth.user.id).maybeSingle();
  if (!set) return { error: "Conjunto não encontrado." };
  const { error } = await (s as unknown as SupabaseClient).from("clt_ad_sets").update({ result_type: resultType }).eq("id", adSetId).eq("user_id", auth.user.id);
  if (error) {
    if (["42703", "PGRST204"].includes(String(error.code))) return { error: "A classificação de conjuntos ainda não está disponível: falta aplicar a atualização do banco (clt_ad_sets.result_type)." };
    return { error: error.message };
  }
  for (const p of ["/trabalho/analises", "/trabalho/relatorios", "/trabalho/empresas", "/visionario/mkt/analises", "/visionario/mkt/relatorios", "/visionario/mkt/empresas"]) revalidatePath(p);
  revalidatePath("/trabalho/empresas/[id]", "page");
  return { success: "Classificação salva." };
}
