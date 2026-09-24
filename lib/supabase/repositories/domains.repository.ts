import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Domain } from "@/types/database.types";

/** Leitura de Domínios (migration 009). RLS via `has_module_permission(space_id, 'sites', 'view')`. */

export async function listDomains(spaceId: string): Promise<Domain[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("domains")
    .select("*")
    .eq("space_id", spaceId)
    .order("renewal_date", { ascending: true, nullsFirst: false })
    .order("domain", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
