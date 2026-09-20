import { redirect } from "next/navigation";
import { requireActiveProfile } from "@/lib/supabase/dal";

/**
 * Proteção server-side extra do /dev (req. 10) — não é só esconder o link
 * no menu: quem não é `system_role === "super_admin"` é redirecionado
 * antes da página renderizar. `requireActiveProfile()` é `cache()`d, então
 * isso não dispara uma segunda query — reaproveita a checagem já feita em
 * `app/(app)/layout.tsx` no mesmo request.
 */
export default async function DevLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireActiveProfile();

  if (profile.system_role !== "super_admin") {
    redirect("/hoje");
  }

  return <>{children}</>;
}
