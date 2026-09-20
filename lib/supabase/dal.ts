import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listMySpaces } from "@/lib/supabase/repositories/spaces.repository";
import { hasModulePermission } from "@/lib/supabase/repositories/permissions.repository";
import type { ModulePermissionAction, ModulePermissionModule, Profile, Space } from "@/types/database.types";

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

/**
 * Guard para tudo que é administrativo (Painel Dev): páginas E Server
 * Actions. Nunca confiar em `/dev` estar "escondida" — toda action
 * privilegiada chama isto de novo, no servidor, antes de mexer em
 * qualquer dado de outro usuário.
 */
export async function requireSuperAdmin(): Promise<{
  profile: Profile;
  email: string | null;
}> {
  const result = await requireActiveProfile();
  if (result.profile.system_role !== "super_admin") {
    redirect("/hoje");
  }
  return result;
}

/**
 * Guard de módulo (Fase B — Reuniões e módulos seguintes): acha o space
 * pelo `slug` (nunca um UUID fixo — `listMySpaces()` já é filtrado por RLS,
 * então um slug de um space ao qual o usuário não pertence simplesmente não
 * aparece na lista) e confere `has_module_permission()` no servidor antes
 * de deixar renderizar. Sem a permissão pedida (`view` por padrão),
 * redireciona — nunca deixa a página nem tentar buscar dados.
 */
export async function requireModulePermission(
  spaceSlug: string,
  moduleKey: ModulePermissionModule,
  action: ModulePermissionAction = "view"
): Promise<{ profile: Profile; email: string | null; space: Space }> {
  const { profile, email } = await requireActiveProfile();

  const mySpaces = await listMySpaces();
  const space = mySpaces.find((s) => s.slug === spaceSlug);

  if (!space) {
    redirect("/hoje");
  }

  const allowed = await hasModulePermission(space.id, moduleKey, action);
  if (!allowed) {
    redirect("/visionario");
  }

  return { profile, email, space };
}
