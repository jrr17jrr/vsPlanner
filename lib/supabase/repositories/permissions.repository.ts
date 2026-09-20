import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ModulePermissionAction, ModulePermissionModule } from "@/types/database.types";

/**
 * Único ponto de checagem de "permissão por módulo" (migration 003) no
 * lado da aplicação — sempre delega para `has_module_permission()` no
 * Postgres, nunca reimplementa a lógica de owner/admin/member/viewer +
 * overrides aqui. Usado tanto para decidir o que renderizar (não é
 * segurança, só evita mostrar um botão que vai falhar) quanto dentro de
 * `requireModulePermission()` (esse sim, o gate real).
 */
export async function hasModulePermission(
  spaceId: string,
  moduleKey: ModulePermissionModule,
  action: ModulePermissionAction
): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("has_module_permission", {
    p_space_id: spaceId,
    p_module: moduleKey,
    p_action: action,
  });

  if (error) throw error;
  return data === true;
}
