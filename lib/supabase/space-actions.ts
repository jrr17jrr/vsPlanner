"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireActiveProfile } from "@/lib/supabase/dal";
import { listMySpaces } from "@/lib/supabase/repositories/spaces.repository";
import { ACTIVE_SPACE_COOKIE } from "@/lib/supabase/space-context";

export type SpaceActionState = {
  error?: string;
};

/**
 * Troca o espaço ativo (cookie httpOnly). Nunca aceita um `spaceId` sem
 * checar de novo, no servidor, se o usuário logado realmente tem acesso a
 * ele — `listMySpaces()` é filtrado por RLS, então um id de um espaço
 * alheio simplesmente não aparece na lista e a troca é recusada.
 */
export async function setActiveSpaceAction(spaceId: string): Promise<SpaceActionState> {
  await requireActiveProfile();

  const mySpaces = await listMySpaces();
  const allowed = mySpaces.some((s) => s.id === spaceId);

  if (!allowed) {
    return { error: "Você não tem acesso a este espaço." };
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_SPACE_COOKIE, spaceId, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/", "layout");
  return {};
}
