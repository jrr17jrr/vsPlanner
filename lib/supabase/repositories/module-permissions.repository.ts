import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SpaceModulePermission } from "@/types/database.types";

/**
 * Overrides pontuais de `space_module_permissions` (migration 003) para
 * UMA membership específica — usado pelo Painel Dev para pré-popular os
 * checkboxes de permissão de um usuário num space. RLS: só retorna algo
 * se quem chama for super_admin ou admin/owner daquele space (mesma regra
 * de quem pode gerenciar isso).
 */
export async function listModulePermissionOverrides(
  spaceMemberId: string
): Promise<SpaceModulePermission[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("space_module_permissions")
    .select("*")
    .eq("space_member_id", spaceMemberId);

  if (error) throw error;
  return data ?? [];
}
