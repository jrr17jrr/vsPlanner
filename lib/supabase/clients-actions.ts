"use server";

import { revalidatePath } from "next/cache";
import { requireModulePermission } from "@/lib/supabase/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { VISIONARIO_DEV_SLUG } from "@/lib/space-slugs";
import type { ClientStatus } from "@/types/database.types";

export type ClientActionState = {
  error?: string;
  success?: string;
  clientId?: string;
};

export type ClientFormInput = {
  name: string;
  company?: string;
  status: ClientStatus;
  phone?: string;
  whatsapp?: string;
  email?: string;
  instagram?: string;
  tiktok?: string;
  facebook?: string;
  website?: string;
  notes?: string;
  joinedAt?: string; // yyyy-mm-dd
  responsibleId?: string;
};

/**
 * Mesma convenção de `meetings-actions.ts`: `requireModulePermission()` de
 * novo em cada action (nunca confiar na rota estar escondida), nunca
 * recebe `space_id` do client (sempre resolvido pelo slug + sessão), e
 * usa a sessão normal — a RLS (`has_module_permission`) é a proteção.
 */
export async function createClientAction(input: ClientFormInput): Promise<ClientActionState> {
  const { profile, space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "clientes", "create");

  if (!input.name.trim()) return { error: "Nome é obrigatório." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("clients")
    .insert({
      space_id: space.id,
      name: input.name.trim(),
      company: input.company?.trim() || null,
      status: input.status,
      phone: input.phone?.trim() || null,
      whatsapp: input.whatsapp?.trim() || null,
      email: input.email?.trim() || null,
      instagram: input.instagram?.trim() || null,
      tiktok: input.tiktok?.trim() || null,
      facebook: input.facebook?.trim() || null,
      website: input.website?.trim() || null,
      notes: input.notes?.trim() || null,
      joined_at: input.joinedAt || undefined,
      responsible_id: input.responsibleId || null,
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/visionario/clientes");
  return { success: "Cliente criado.", clientId: data.id };
}

export async function updateClientAction(
  clientId: string,
  input: ClientFormInput
): Promise<ClientActionState> {
  const { space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "clientes", "edit");

  if (!input.name.trim()) return { error: "Nome é obrigatório." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("clients")
    .update({
      name: input.name.trim(),
      company: input.company?.trim() || null,
      status: input.status,
      phone: input.phone?.trim() || null,
      whatsapp: input.whatsapp?.trim() || null,
      email: input.email?.trim() || null,
      instagram: input.instagram?.trim() || null,
      tiktok: input.tiktok?.trim() || null,
      facebook: input.facebook?.trim() || null,
      website: input.website?.trim() || null,
      notes: input.notes?.trim() || null,
      joined_at: input.joinedAt || undefined,
      responsible_id: input.responsibleId || null,
    })
    .eq("id", clientId)
    .eq("space_id", space.id)
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "Cliente não encontrado." };

  revalidatePath("/visionario/clientes");
  revalidatePath(`/visionario/clientes/${clientId}`);
  return { success: "Cliente atualizado." };
}

export async function deleteClientAction(clientId: string): Promise<ClientActionState> {
  const { space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "clientes", "delete");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("clients").delete().eq("id", clientId).eq("space_id", space.id);

  if (error) return { error: error.message };

  revalidatePath("/visionario/clientes");
  return { success: "Cliente excluído." };
}
