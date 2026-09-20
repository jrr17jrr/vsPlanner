import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/database.types";

/**
 * Camada de acesso a dados real (Supabase), isolada em repositórios para a
 * UI nunca fazer `supabase.from(...)` diretamente.
 */

/**
 * Busca o profile de QUALQUER usuário por id (não só o do usuário logado).
 * Usada pelo Painel Dev — RLS (`profiles_select_own_or_admin`) só deixa
 * isso retornar algo quando quem chama é o dono do profile ou super_admin;
 * não é uma checagem extra, é a mesma policy da migration 001.
 */
export async function getProfileById(id: string): Promise<Profile | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

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

  const { data, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", user.id)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}
