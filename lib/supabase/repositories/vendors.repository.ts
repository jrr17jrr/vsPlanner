import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Commission, Sale, Vendor } from "@/types/database.types";

/** Leitura de Vendedores/Vendas/Comissões (migration 008). RLS via `has_module_permission(space_id, 'vendedores', 'view')`. */

export async function listVendors(spaceId: string): Promise<Vendor[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("vendors").select("*").eq("space_id", spaceId).order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function listSales(spaceId: string): Promise<Sale[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("sales")
    .select("*")
    .eq("space_id", spaceId)
    .order("sale_date", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listSalesForClient(clientId: string): Promise<Sale[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("sales")
    .select("*")
    .eq("client_id", clientId)
    .order("sale_date", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listCommissions(spaceId: string): Promise<Commission[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("commissions")
    .select("*")
    .eq("space_id", spaceId)
    .order("due_date", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data ?? [];
}
