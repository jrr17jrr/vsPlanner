"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/supabase/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SpaceRole, SpaceType } from "@/types/database.types";

export type AdminActionState = {
  error?: string;
  success?: string;
};

/**
 * `spaces_insert_own` (migration 001) só permite `owner_id = auth.uid()` —
 * nem super_admin tem bypass nessa policy (de propósito: criar um space
 * "para" outra pessoa não é algo que exista hoje). Por isso quem chama
 * esta action sempre vira o dono do space criado. Depois do insert em
 * `spaces`, criamos também a membership 'owner' correspondente — sem ela,
 * `space_role_of()`/`has_module_permission()` não encontrariam role
 * nenhuma para o próprio dono. Se esse segundo insert falhar, desfazemos o
 * space pra não deixar um registro órfão.
 */
export async function createSpaceAction(input: {
  name: string;
  slug: string;
  type: SpaceType;
}): Promise<AdminActionState & { spaceId?: string }> {
  const { profile } = await requireSuperAdmin();

  const name = input.name.trim();
  const slug = input.slug.trim().toLowerCase();

  if (!name) return { error: "Nome é obrigatório." };
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return { error: "Slug deve conter só letras minúsculas, números e hífen (ex: visionario-dev)." };
  }

  const supabase = await createSupabaseServerClient();

  const { data: space, error } = await supabase
    .from("spaces")
    .insert({ name, slug, type: input.type, owner_id: profile.id })
    .select("id")
    .single();

  if (error) return { error: error.message };

  const { error: memberError } = await supabase
    .from("space_members")
    .insert({ space_id: space.id, user_id: profile.id, role: "owner" });

  if (memberError) {
    await supabase.from("spaces").delete().eq("id", space.id);
    return { error: memberError.message };
  }

  revalidatePath("/dev/spaces");
  return { success: "Espaço criado.", spaceId: space.id };
}

/**
 * Conceder acesso é um upsert em `space_members` (unique em
 * `space_id, user_id` — migration 001): se o usuário já tem membership
 * naquele space, atualiza a role; senão, cria. RLS (`is_super_admin()` já
 * embutido nas policies de INSERT/UPDATE) permite isso via a sessão normal
 * do super_admin — nenhuma chave especial envolvida. Se o resultado
 * deixaria o space sem nenhum owner, a trigger `prevent_last_owner_removal`
 * (migration 002) nem chega a ser relevante aqui (ela trava remoção/
 * rebaixamento, não concessão) — mas ela SIM entra em revoke/changeRole
 * abaixo.
 */
export async function grantSpaceAccessAction(
  spaceId: string,
  userId: string,
  role: SpaceRole
): Promise<AdminActionState> {
  await requireSuperAdmin();

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("space_members")
    .upsert({ space_id: spaceId, user_id: userId, role }, { onConflict: "space_id,user_id" });

  if (error) return { error: error.message };

  revalidatePath(`/dev/spaces/${spaceId}`);
  revalidatePath(`/dev/usuarios/${userId}`);
  return { success: "Acesso concedido." };
}

export async function revokeSpaceAccessAction(
  spaceId: string,
  userId: string
): Promise<AdminActionState> {
  await requireSuperAdmin();

  const supabase = await createSupabaseServerClient();
  // A trigger prevent_last_owner_removal (migration 002) bloqueia isto com
  // uma exceção (que vira `error.message` aqui) se for o owner_id
  // canônico do space ou o último owner restante.
  const { error } = await supabase
    .from("space_members")
    .delete()
    .eq("space_id", spaceId)
    .eq("user_id", userId);

  if (error) return { error: error.message };

  revalidatePath(`/dev/spaces/${spaceId}`);
  revalidatePath(`/dev/usuarios/${userId}`);
  return { success: "Acesso removido." };
}

export async function changeSpaceMemberRoleAction(
  spaceId: string,
  userId: string,
  role: SpaceRole
): Promise<AdminActionState> {
  await requireSuperAdmin();

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("space_members")
    .update({ role })
    .eq("space_id", spaceId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "Este usuário não é membro deste espaço." };

  revalidatePath(`/dev/spaces/${spaceId}`);
  revalidatePath(`/dev/usuarios/${userId}`);
  return { success: "Role no espaço atualizada." };
}
