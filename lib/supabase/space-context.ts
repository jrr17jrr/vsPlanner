import "server-only";

import { cookies } from "next/headers";
import { requireActiveProfile } from "@/lib/supabase/dal";
import { listMySpaces } from "@/lib/supabase/repositories/spaces.repository";
import type { Space } from "@/types/database.types";

/**
 * Contexto de "espaço ativo" (cookie) — usado pelo Painel Dev pra saber
 * qual space o super_admin está inspecionando.
 *
 * `listMySpaces()` já é filtrado por RLS: para um usuário comum, só os
 * spaces dos quais ele é dono/membro; a validação de "o cookie aponta pra
 * um space que o usuário realmente pode acessar" vem de graça disso — não
 * é preciso reimplementar checagem de posse aqui.
 */
export const ACTIVE_SPACE_COOKIE = "vsplanner_active_space";

export async function getActiveSpace(): Promise<{ space: Space; mySpaces: Space[] }> {
  const { profile } = await requireActiveProfile();
  const mySpaces = await listMySpaces();

  const cookieStore = await cookies();
  const activeId = cookieStore.get(ACTIVE_SPACE_COOKIE)?.value;

  const active =
    (activeId ? mySpaces.find((s) => s.id === activeId) : undefined) ??
    mySpaces.find((s) => s.type === "personal" && s.owner_id === profile.id) ??
    mySpaces[0];

  if (!active) {
    // Não deveria acontecer: handle_new_user (migration 001) sempre cria
    // um space Pessoal junto com o profile.
    throw new Error("Usuário não pertence a nenhum espaço.");
  }

  return { space: active, mySpaces };
}
