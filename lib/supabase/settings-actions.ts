"use server";

import { revalidatePath } from "next/cache";
import { requireActiveProfile } from "@/lib/supabase/dal";
import { updateMyProfile } from "@/lib/supabase/repositories/profiles.repository";

type ActionState = { error?: string; success?: string };

export async function updateProfileAction(name: string, phone: string): Promise<ActionState> {
  await requireActiveProfile();
  if (!name.trim()) return { error: "Nome é obrigatório." };

  try {
    await updateMyProfile({ name: name.trim(), phone: phone.trim() || null });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível salvar." };
  }

  revalidatePath("/configuracoes");
  return { success: "Perfil atualizado." };
}
