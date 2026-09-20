import { requireSuperAdmin } from "@/lib/supabase/dal";
import { DevSubnav } from "@/components/dev/dev-subnav";

/**
 * Proteção server-side extra do /dev — não é só esconder o link no menu:
 * quem não é `system_role === "super_admin"` é redirecionado antes de
 * qualquer página do painel renderizar. `requireSuperAdmin()` usa
 * `requireActiveProfile()` internamente, que é `cache()`d — não dispara
 * uma segunda query além da já feita em `app/(app)/layout.tsx`.
 */
export default async function DevLayout({ children }: { children: React.ReactNode }) {
  await requireSuperAdmin();

  return (
    <div className="flex flex-col gap-4">
      <DevSubnav />
      {children}
    </div>
  );
}
