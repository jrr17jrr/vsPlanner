import { requireActiveProfile, findOrBootstrapSpace } from "@/lib/supabase/dal";
import { hasModulePermission } from "@/lib/supabase/repositories/permissions.repository";
import { listMySpaces } from "@/lib/supabase/repositories/spaces.repository";
import { getNotificationItems } from "@/lib/supabase/notifications";
import { VISIONARIO_DEV_SLUG, TIKTOK_SLUG } from "@/lib/space-slugs";
import { AuthProfileProvider } from "@/components/providers/auth-profile-provider";
import { AppShell } from "@/components/layout/app-shell";
import type { ModulePermissionModule } from "@/types/database.types";

const VISIONARIO_MODULES: ModulePermissionModule[] = [
  "visao_geral",
  "clientes",
  "servicos",
  "trabalhos",
  "reunioes",
  "vendedores",
  "financeiro",
  "sites",
];

/**
 * Server Component — protege TODAS as rotas privadas: sem sessão Supabase
 * válida (ou com `profile.status !== "active"`), `requireActiveProfile()`
 * já redireciona para /login antes de qualquer coisa aqui renderizar.
 * `proxy.ts` faz a checagem otimista; esta é a checagem real, no
 * servidor.
 *
 * Tudo que o shell/menu precisa (espaços, permissão de CADA módulo do
 * Visionário Dev/TikTok, notificações) é resolvido AQUI, uma vez, com a
 * sessão real — e passado pro client via `AuthProfileProvider`. O menu
 * nunca mostra um item cujo módulo o usuário não tem permissão de ver
 * (ex.: Financeiro some para quem só tem Clientes/Reuniões/Trabalhos) —
 * a mesma `has_module_permission` que protege a rota em si.
 */
export default async function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const { profile, email } = await requireActiveProfile();

  const [mySpaces, visionario, tiktok, notifications] = await Promise.all([
    listMySpaces(),
    // `findOrBootstrapSpace` cria os workspaces oficiais automaticamente na
    // primeira vez que o super_admin passa por aqui, se ainda não
    // existirem — sem exigir um clique manual no Painel Dev.
    findOrBootstrapSpace(VISIONARIO_DEV_SLUG, profile),
    findOrBootstrapSpace(TIKTOK_SLUG, profile),
    getNotificationItems(),
  ]);

  const canAccessVisionario = !!visionario;
  const canAccessTiktok = !!tiktok;

  const visionarioModulePermissions: Partial<Record<ModulePermissionModule, boolean>> = {};
  if (visionario) {
    const results = await Promise.all(
      VISIONARIO_MODULES.map((module) => hasModulePermission(visionario.id, module, "view"))
    );
    VISIONARIO_MODULES.forEach((module, i) => {
      visionarioModulePermissions[module] = results[i];
    });
  }

  const tiktokModulePermissions: Partial<Record<ModulePermissionModule, boolean>> = {};
  if (tiktok) {
    tiktokModulePermissions.financeiro = await hasModulePermission(tiktok.id, "financeiro", "view");
  }

  return (
    <AuthProfileProvider
      profile={profile}
      email={email}
      mySpaces={mySpaces}
      canAccessVisionario={canAccessVisionario}
      canAccessTiktok={canAccessTiktok}
      visionarioModulePermissions={visionarioModulePermissions}
      tiktokModulePermissions={tiktokModulePermissions}
      notifications={notifications}
    >
      <AppShell>{children}</AppShell>
    </AuthProfileProvider>
  );
}
