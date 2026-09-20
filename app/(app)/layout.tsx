import { requireActiveProfile } from "@/lib/supabase/dal";
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

  return (
    <AuthProfileProvider profile={profile} email={email}>
      <AppShell>{children}</AppShell>
    </AuthProfileProvider>
  );
}
