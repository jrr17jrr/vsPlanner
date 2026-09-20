import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { VISIONARIO_DEV_SLUG } from "@/lib/space-slugs";
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

/**
 * Garante que o workspace oficial "Visionário Dev" existe — sem exigir um
 * clique manual no Painel Dev. Idempotente: se já existe (por qualquer
 * dono), só retorna ele, nunca cria um segundo. Só cria quando quem está
 * navegando é super_admin — um membro comum sendo o primeiro a visitar uma
 * página do Visionário antes do space existir NÃO deve virar dono do
 * workspace da empresa sem querer.
 *
 * Usa `spaces_insert_own` (migration 001, `owner_id = auth.uid()`) — a
 * mesma RLS normal, sessão do usuário, nunca Service Role. Depois da
 * migration 005 (constraint `unique(slug)`), uma corrida entre duas
 * requisições simultâneas faz a segunda falhar por violação de unicidade
 * em vez de duplicar; o catch abaixo já trata isso reconsultando em vez de
 * propagar o erro.
 */
export async function ensureVisionarioDevSpace(
  actingProfileId: string,
  isSuperAdmin: boolean
): Promise<Space | null> {
  const supabase = await createSupabaseServerClient();

  const { data: existing, error: findError } = await supabase
    .from("spaces")
    .select("*")
    .eq("slug", VISIONARIO_DEV_SLUG)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (findError) throw findError;
  if (existing) return existing;
  if (!isSuperAdmin) return null;

  const { data: created, error: createError } = await supabase
    .from("spaces")
    .insert({ name: "Visionário Dev", slug: VISIONARIO_DEV_SLUG, type: "business", owner_id: actingProfileId })
    .select("*")
    .single();

  if (createError) {
    // Possível corrida com outra requisição criando ao mesmo tempo —
    // reconsulta antes de propagar o erro.
    const { data: raceWinner } = await supabase
      .from("spaces")
      .select("*")
      .eq("slug", VISIONARIO_DEV_SLUG)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (raceWinner) return raceWinner;
    throw createError;
  }

  const { error: memberError } = await supabase
    .from("space_members")
    .insert({ space_id: created.id, user_id: actingProfileId, role: "owner" });

  if (memberError) {
    // Não deixa um space sem a membership do próprio dono — desfaz.
    await supabase.from("spaces").delete().eq("id", created.id);
    throw memberError;
  }

  return created;
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
