import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Space, SpaceMember } from "@/types/database.types";

/**
 * Fase 1 — leitura de espaços e membros. O RLS garante que só retornam
 * espaços dos quais o usuário autenticado é membro (ou todos, se
 * super_admin — ver policies em `supabase/migrations/001_initial_auth_spaces.sql`).
 */

/**
 * `cache()` deduplica dentro do mesmo request: o layout de `(app)` (pra
 * decidir o que mostrar no menu) e a página de um módulo do Visionário
 * (pra achar o space certo) chamam isso sem disparar duas queries.
 */
export const listMySpaces = cache(async (): Promise<Space[]> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("spaces")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
});

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

/**
 * Todas as memberships de um usuário específico (não só o logado) — usada
 * no Painel Dev para mostrar a quais espaços um usuário pertence e com
 * qual role. RLS: só retorna algo se quem chama for super_admin ou membro
 * de algum space em comum (ver `space_members_select_member_or_admin`).
 */
export async function listSpaceMembersForUser(userId: string): Promise<SpaceMember[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("space_members")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

/**
 * Todas as memberships de todos os espaços — usada pelo Painel Dev para
 * montar a listagem de usuários (agrupando em memória por `user_id`) sem
 * disparar uma query por usuário. Só retorna algo com RLS liberando (na
 * prática, só o super_admin vê a base inteira).
 */
export async function listAllSpaceMembers(): Promise<SpaceMember[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("space_members").select("*");

  if (error) throw error;
  return data ?? [];
}
