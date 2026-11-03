"use server";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Result = { error?: string; success?: string };
const MAX_FOLLOWERS = 1_000_000_000;
const validCount = (n: number) => Number.isInteger(n) && n >= 0 && n <= MAX_FOLLOWERS;
const missingTable = (code?: string) => ["42P01", "PGRST205"].includes(String(code));
const errorMessage = (e: { code?: string; message: string }) =>
  missingTable(e.code) ? "Aplique a migração 20261103110000_clt_instagram_followers.sql no Supabase." : e.message;

/** Só o dono da empresa (mesma regra dos públicos/movimentações; RLS reforça). */
async function access(companyId: string) {
  const s = await createSupabaseServerClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) throw Error("Sessão expirada.");
  const { data } = await s.from("clt_companies").select("id").eq("id", companyId).eq("user_id", user.id).maybeSingle();
  if (!data) throw Error("Empresa não encontrada.");
  return { db: s as unknown as SupabaseClient, user };
}

function revalidate() {
  revalidatePath("/trabalho/empresas/[id]", "page");
  revalidatePath("/trabalho/relatorios");
  revalidatePath("/visionario/mkt", "layout");
}

/** Novo registro: data e horário gravados pelo servidor (agora). */
export async function addInstagramFollowersAction(companyId: string, followers: number): Promise<Result> {
  try {
    if (!validCount(followers)) return { error: "Informe um número inteiro de seguidores." };
    const { db, user } = await access(companyId);
    const { error } = await db.from("clt_instagram_followers").insert({ user_id: user.id, company_id: companyId, followers });
    if (error) return { error: errorMessage(error) };
    revalidate();
    return { success: "Seguidores atualizados." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível salvar." };
  }
}

/** Corrige um registro lançado errado (quantidade e, opcionalmente, data/hora). */
export async function updateInstagramFollowersAction(companyId: string, recordId: string, input: { followers: number; recordedAt?: string }): Promise<Result> {
  try {
    if (!validCount(input.followers)) return { error: "Informe um número inteiro de seguidores." };
    const recordedAt = input.recordedAt ? new Date(input.recordedAt) : null;
    if (recordedAt && (Number.isNaN(recordedAt.getTime()) || recordedAt.getTime() > Date.now() + 60_000)) return { error: "Data e horário inválidos." };
    const { db, user } = await access(companyId);
    const values: Record<string, unknown> = { followers: input.followers, updated_at: new Date().toISOString() };
    if (recordedAt) values.recorded_at = recordedAt.toISOString();
    const { data, error } = await db.from("clt_instagram_followers").update(values)
      .eq("id", recordId).eq("company_id", companyId).eq("user_id", user.id).select("id");
    if (error) return { error: errorMessage(error) };
    if (!data?.length) return { error: "Registro não encontrado." };
    revalidate();
    return { success: "Registro corrigido." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível corrigir." };
  }
}
