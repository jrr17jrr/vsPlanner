"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/supabase/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ModulePermissionAction, ModulePermissionModule } from "@/types/database.types";

export type ModulePermissionActionState = {
  error?: string;
  success?: string;
};

/**
 * Sempre grava um override explícito (nunca um estado "herdar da role") —
 * bate com a UI de checkbox simples do Painel Dev. RLS de
 * `space_module_permissions` (migration 003) já exige `is_super_admin()`
 * OU `has_space_role(space_id, 'admin')`; `requireSuperAdmin()` aqui é só
 * porque hoje o Painel Dev (única UI disso) é exclusivo de super_admin —
 * a RLS por trás já é mais permissiva, então uma futura tela de "config
 * do meu space" pra admins comuns não precisaria mexer no banco.
 */
export async function setModulePermissionAction(
  spaceMemberId: string,
  targetUserId: string,
  moduleKey: ModulePermissionModule,
  action: ModulePermissionAction,
  allowed: boolean
): Promise<ModulePermissionActionState> {
  await requireSuperAdmin();

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("space_module_permissions")
    .upsert(
      { space_member_id: spaceMemberId, module: moduleKey, action, allowed },
      { onConflict: "space_member_id,module,action" }
    );

  if (error) return { error: error.message };

  revalidatePath(`/dev/usuarios/${targetUserId}`);
  return { success: "Permissão atualizada." };
}
