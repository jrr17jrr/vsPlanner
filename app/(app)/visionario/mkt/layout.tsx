import { redirect } from "next/navigation";
import { findOrBootstrapSpace, requireActiveProfile } from "@/lib/supabase/dal";
import { VISIONARIO_DEV_SLUG } from "@/lib/space-slugs";
import { CltModuleProvider } from "@/components/trabalho/module-context";

/**
 * Visionário Dev → MKT. Mesmo sistema do Trabalho / CLT, com dados próprios
 * (empresas com module = 'mkt'). Os registros são do usuário logado, como no
 * CLT; o menu só aparece para quem acessa a Visionário Dev.
 */
export default async function MktLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireActiveProfile();
  const space = await findOrBootstrapSpace(VISIONARIO_DEV_SLUG, profile);
  if (!space) redirect("/hoje");
  return <CltModuleProvider module="mkt">{children}</CltModuleProvider>;
}
