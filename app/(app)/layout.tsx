import { requireActiveProfile, findOrBootstrapSpace } from "@/lib/supabase/dal";
import { hasModulePermission } from "@/lib/supabase/repositories/permissions.repository";
import { VISIONARIO_DEV_SLUG } from "@/lib/space-slugs";
import { AuthProfileProvider } from "@/components/providers/auth-profile-provider";
import { AppShell } from "@/components/layout/app-shell";

/**
 * Server Component — protege TODAS as rotas privadas (req. 8 e 16): sem
 * sessão Supabase válida (ou com `profile.status !== "active"`),
 * `requireActiveProfile()` já redireciona para /login antes de qualquer
 * coisa aqui renderizar. `proxy.ts` faz a checagem otimista; esta é a
 * checagem real, no servidor.
 */
export default async function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const { profile, email } = await requireActiveProfile();

  // Só pra decidir se o item "Reuniões" aparece no menu — não é a proteção
  // real (essa é `requireModulePermission()` na própria rota + RLS).
  // `findOrBootstrapSpace` cria o Visionário Dev automaticamente na
  // primeira vez que o super_admin passa por aqui, se ele ainda não
  // existir — sem exigir um clique manual no Painel Dev.
  let canViewVisionarioReunioes = false;
  const visionario = await findOrBootstrapSpace(VISIONARIO_DEV_SLUG, profile);
  if (visionario) {
    canViewVisionarioReunioes = await hasModulePermission(visionario.id, "reunioes", "view");
  }

  return (
    <AuthProfileProvider
      profile={profile}
      email={email}
      canViewVisionarioReunioes={canViewVisionarioReunioes}
    >
      <AppShell>{children}</AppShell>
    </AuthProfileProvider>
  );
}
