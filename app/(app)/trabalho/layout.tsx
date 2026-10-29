import { redirect } from "next/navigation";
import { requireActiveProfile } from "@/lib/supabase/dal";

export default async function TrabalhoLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireActiveProfile();
  if (profile.system_role !== "super_admin" && profile.clt_access === false) {
    redirect("/hoje");
  }
  return <>{children}</>;
}
