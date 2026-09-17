import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Space, SpaceMember } from "@/types/database.types";

/**
 * Fase 1 — leitura de espaços e membros. O RLS garante que só retornam
 * espaços dos quais o usuário autenticado é membro (ou todos, se
 * super_admin — ver policies em `supabase/migrations/001_initial_auth_spaces.sql`).
 * Ainda não é chamada por nenhuma tela.
 */

export async function listMySpaces(): Promise<Space[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("spaces")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function getSpace(spaceId: string): Promise<Space | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("spaces")
    .select("*")
    .eq("id", spaceId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function listSpaceMembers(spaceId: string): Promise<SpaceMember[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("space_members")
    .select("*")
    .eq("space_id", spaceId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}
