import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/database.types";

/**
 * Data Access Layer (Fase 2) — checagem de sessão/autorização real, sempre
 * no servidor. `proxy.ts` faz só a checagem otimista (existe cookie de
 * sessão?); esta função é a checagem "de verdade": confirma o usuário via
 * `auth.getUser()`, garante que o `profile` existe e que `status === "active"`.
 *
 * `cache()` deduplica chamadas dentro do mesmo request (ex: layout de `(app)`
 * + layout de `dev` no mesmo render não disparam duas queries).
 */
export const requireActiveProfile = cache(async (): Promise<{
  profile: Profile;
  email: string | null;
}> => {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw error;

  if (!profile) {
    // Sessão válida no Supabase Auth, mas sem profile correspondente —
    // não deveria acontecer (a trigger `handle_new_user` cria o profile
    // junto com o usuário), mas se acontecer não podemos deixar o usuário
    // em um estado autenticado-mas-sem-perfil: encerra a sessão para não
    // criar um loop de redirecionamento entre /login e as rotas privadas.
    await supabase.auth.signOut();
    redirect("/login?erro=perfil_nao_encontrado");
  }

  if (profile.status !== "active") {
    await supabase.auth.signOut();
    redirect("/login?erro=conta_bloqueada");
  }

  return { profile, email: user.email ?? null };
});
