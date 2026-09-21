import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ClientSite } from "@/types/database.types";

/** Leitura de Sites & Domínios (migration 008). RLS via `has_module_permission(space_id, 'sites', 'view')`. */

export async function listClientSites(spaceId: string): Promise<ClientSite[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("client_sites")
    .select("*")
    .eq("space_id", spaceId)
    .order("due_date", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data ?? [];
}

export async function listClientSitesForClient(clientId: string): Promise<ClientSite[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("client_sites")
    .select("*")
    .eq("client_id", clientId)
    .order("due_date", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data ?? [];
}
