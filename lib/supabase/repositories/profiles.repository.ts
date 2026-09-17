import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/database.types";

/**
 * Fase 1 — camada de acesso a dados real (Supabase), isolada em
 * repositórios para a UI nunca fazer `supabase.from(...)` diretamente
 * (ver seção 30 do pedido). Ainda não é chamada por nenhuma tela.
 */

export async function getMyProfile(): Promise<Profile | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function updateMyProfile(
  patch: Partial<Pick<Profile, "name" | "avatar_url" | "phone">>
): Promise<Profile> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Usuário não autenticado.");

  // Cast explícito: esta versão do @supabase/postgrest-js não infere o tipo
  // de `Update` corretamente a partir do `Database` genérico neste ponto
  // específico (select/insert inferem bem; só este `update` encadeado não).
  // `patch` já é tipado por `Partial<Pick<Profile, ...>>` na assinatura desta
  // função, então o cast aqui não perde segurança de tipos.
  const { data, error } = await supabase
    .from("profiles")
    .update(patch as never)
    .eq("id", user.id)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}
