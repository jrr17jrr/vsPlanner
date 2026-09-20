"use server";

import { revalidatePath } from "next/cache";
import { requireModulePermission } from "@/lib/supabase/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { VISIONARIO_DEV_SLUG } from "@/lib/space-slugs";
import type { ServiceBillingType, ServiceStatus } from "@/types/database.types";

export type ServiceActionState = {
  error?: string;
  success?: string;
  serviceId?: string;
};

export type ServiceFormInput = {
  name: string;
  description?: string;
  defaultPrice: number;
  billingType: ServiceBillingType;
  status: ServiceStatus;
};

export async function createServiceAction(input: ServiceFormInput): Promise<ServiceActionState> {
  const { profile, space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "servicos", "create");

  if (!input.name.trim()) return { error: "Nome é obrigatório." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("services")
    .insert({
      space_id: space.id,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      default_price: input.defaultPrice,
      billing_type: input.billingType,
      status: input.status,
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/visionario/servicos");
  return { success: "Serviço criado.", serviceId: data.id };
}

export async function updateServiceAction(
  serviceId: string,
  input: ServiceFormInput
): Promise<ServiceActionState> {
  const { space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "servicos", "edit");

  if (!input.name.trim()) return { error: "Nome é obrigatório." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("services")
    .update({
      name: input.name.trim(),
      description: input.description?.trim() || null,
      default_price: input.defaultPrice,
      billing_type: input.billingType,
      status: input.status,
    })
    .eq("id", serviceId)
    .eq("space_id", space.id)
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "Serviço não encontrado." };

  revalidatePath("/visionario/servicos");
  return { success: "Serviço atualizado." };
}

/**
 * `services_delete` RLS permite, mas a FK de `client_services.service_id`
 * é `on delete restrict` (migration 005) — apagar um serviço contratado
 * por algum cliente falha com erro de integridade referencial, não com
 * silêncio. A UI trata isso como "desative em vez de excluir".
 */
export async function deleteServiceAction(serviceId: string): Promise<ServiceActionState> {
  const { space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "servicos", "delete");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("services")
    .delete()
    .eq("id", serviceId)
    .eq("space_id", space.id);

  if (error) {
    if (error.code === "23503") {
      return {
        error: "Este serviço está contratado por algum cliente — desative em vez de excluir.",
      };
    }
    return { error: error.message };
  }

  revalidatePath("/visionario/servicos");
  return { success: "Serviço excluído." };
}
