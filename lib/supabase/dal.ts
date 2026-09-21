import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listMySpaces, ensureBusinessSpace, getPersonalSpace } from "@/lib/supabase/repositories/spaces.repository";
import { hasModulePermission } from "@/lib/supabase/repositories/permissions.repository";
import { VISIONARIO_DEV_SLUG, TIKTOK_SLUG, type FinancialScope } from "@/lib/space-slugs";
import type { ModulePermissionAction, ModulePermissionModule, Profile, Space } from "@/types/database.types";

const BOOTSTRAPPABLE_SLUGS = new Set([VISIONARIO_DEV_SLUG, TIKTOK_SLUG]);

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
 * Acha um space pelo `slug` (nunca um UUID fixo — `listMySpaces()` já é
 * filtrado por RLS, então um slug de um space ao qual o usuário não
 * pertence simplesmente não aparece na lista). Para os workspaces
 * oficiais (Visionário Dev, TikTok): se ainda não existir, tenta criar
 * automaticamente (`ensureBusinessSpace` — só funciona se quem está
 * navegando for super_admin; para qualquer outra pessoa, continua
 * simplesmente não encontrando nada). Isso elimina a necessidade de criar
 * o space manualmente pelo Painel Dev.
 */
async function resolveSpaceBySlug(
  spaceSlug: string,
  profile: Profile
): Promise<Space | undefined> {
  const mySpaces = await listMySpaces();
  const found = mySpaces.find((s) => s.slug === spaceSlug);
  if (found) return found;

  if (BOOTSTRAPPABLE_SLUGS.has(spaceSlug)) {
    const bootstrapped = await ensureBusinessSpace(
      spaceSlug,
      profile.id,
      profile.system_role === "super_admin"
    );
    if (bootstrapped) return bootstrapped;
  }

  return undefined;
}

/**
 * Guard de módulo (Fase B — Reuniões e módulos seguintes): resolve o space
 * (com bootstrap automático do Visionário Dev quando aplicável) e confere
 * `has_module_permission()` no servidor antes de deixar renderizar. Sem a
 * permissão pedida (`view` por padrão), redireciona — nunca deixa a
 * página nem tentar buscar dados.
 */
export async function requireModulePermission(
  spaceSlug: string,
  moduleKey: ModulePermissionModule,
  action: ModulePermissionAction = "view"
): Promise<{ profile: Profile; email: string | null; space: Space }> {
  const { profile, email } = await requireActiveProfile();

  const space = await resolveSpaceBySlug(spaceSlug, profile);

  if (!space) {
    redirect("/hoje");
  }

  const allowed = await hasModulePermission(space.id, moduleKey, action);
  if (!allowed) {
    redirect("/visionario");
  }

  return { profile, email, space };
}

/**
 * Igual a `resolveSpaceBySlug`, mas exportado pra quem só precisa achar o
 * space (com bootstrap) sem exigir uma permissão específica — hoje usado
 * pelo layout (pra decidir o que mostrar no menu) e pelo "Hoje" (pra saber
 * se existe Visionário Dev antes de buscar reuniões do dia).
 */
export async function findOrBootstrapSpace(
  spaceSlug: string,
  profile: Profile
): Promise<Space | undefined> {
  return resolveSpaceBySlug(spaceSlug, profile);
}

/**
 * O space Pessoal do usuário autenticado — sempre existe (criado no
 * cadastro, migration 001), nunca precisa de bootstrap nem de slug fixo.
 * Redireciona pro login só no caso teoricamente impossível de faltar
 * (sessão válida sem o space que `handle_new_user` deveria ter criado).
 */
export async function requirePersonalSpace(): Promise<{ profile: Profile; email: string | null; space: Space }> {
  const { profile, email } = await requireActiveProfile();
  const space = await getPersonalSpace(profile.id);
  if (!space) {
    redirect("/login?erro=espaco_pessoal_nao_encontrado");
  }
  return { profile, email, space };
}

/**
 * Financeiro é a MESMA arquitetura (migration 007) nos três espaços —
 * só muda qual space é resolvido. Visionário Dev e TikTok passam pelo
 * guard normal de módulo (`has_module_permission`, com bootstrap
 * automático); Pessoal não tem colaboração nem papéis, então só confirma
 * que o space é mesmo o do usuário (`requirePersonalSpace`) — ainda assim
 * chama `has_module_permission` por defesa em profundidade, embora
 * owner/space-de-um-membro-só sempre retorne `true`.
 */
export async function requireScopedModulePermission(
  scope: FinancialScope,
  moduleKey: ModulePermissionModule,
  action: ModulePermissionAction = "view"
): Promise<{ profile: Profile; email: string | null; space: Space }> {
  if (scope === "pessoal") {
    const { profile, email, space } = await requirePersonalSpace();
    const allowed = await hasModulePermission(space.id, moduleKey, action);
    if (!allowed) redirect("/hoje");
    return { profile, email, space };
  }

  const slug = scope === "visionario" ? VISIONARIO_DEV_SLUG : TIKTOK_SLUG;
  return requireModulePermission(slug, moduleKey, action);
}
