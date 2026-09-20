"use server";

import { revalidatePath } from "next/cache";
import { requireModulePermission } from "@/lib/supabase/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { VISIONARIO_DEV_SLUG } from "@/lib/space-slugs";
import type {
  ClientServiceBillingType,
  ClientServiceFrequency,
  ClientServiceStatus,
} from "@/types/database.types";

export type ClientServiceActionState = {
  error?: string;
  success?: string;
};

export type ClientServiceFormInput = {
  serviceId: string;
  price: number;
  billingType: ClientServiceBillingType;
  frequency?: ClientServiceFrequency;
  dueDay?: number;
  startDate?: string; // yyyy-mm-dd
  status: ClientServiceStatus;
  notes?: string;
};

function validate(input: ClientServiceFormInput): string | null {
  if (!input.serviceId) return "Escolha um serviço.";
  if (input.price <= 0) return "Valor precisa ser maior que zero.";
  if (input.billingType === "recorrente" && (!input.frequency || !input.dueDay)) {
    return "Cobrança recorrente precisa de frequência e dia de vencimento.";
  }
  return null;
}

/**
 * Contrata um serviço pra um cliente ("client_services" — migration 005).
 * A permissão usada é a de `servicos` (não `clientes`) porque é
 * literalmente sobre gerenciar o catálogo de serviços contratados — mesma
 * convenção da RLS da tabela.
 */
export async function createClientServiceAction(
  clientId: string,
  input: ClientServiceFormInput
): Promise<ClientServiceActionState> {
  const { profile, space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "servicos", "create");

  const validationError = validate(input);
  if (validationError) return { error: validationError };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("client_services").insert({
    client_id: clientId,
    service_id: input.serviceId,
    space_id: space.id,
    price: input.price,
    billing_type: input.billingType,
    frequency: input.billingType === "recorrente" ? input.frequency : null,
    due_day: input.billingType === "recorrente" ? input.dueDay : null,
    start_date: input.startDate || undefined,
    status: input.status,
    notes: input.notes?.trim() || null,
    created_by: profile.id,
  });

  if (error) return { error: error.message };

  revalidatePath(`/visionario/clientes/${clientId}`);
  return { success: "Serviço contratado." };
}

export async function updateClientServiceAction(
  clientServiceId: string,
  clientId: string,
  input: ClientServiceFormInput
): Promise<ClientServiceActionState> {
  const { space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "servicos", "edit");

  const validationError = validate(input);
  if (validationError) return { error: validationError };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("client_services")
    .update({
      service_id: input.serviceId,
      price: input.price,
      billing_type: input.billingType,
      frequency: input.billingType === "recorrente" ? input.frequency : null,
      due_day: input.billingType === "recorrente" ? input.dueDay : null,
      start_date: input.startDate || undefined,
      status: input.status,
      notes: input.notes?.trim() || null,
    })
    .eq("id", clientServiceId)
    .eq("space_id", space.id)
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "Contrato não encontrado." };

  revalidatePath(`/visionario/clientes/${clientId}`);
  return { success: "Contrato atualizado." };
}

export async function deleteClientServiceAction(
  clientServiceId: string,
  clientId: string
): Promise<ClientServiceActionState> {
  const { space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "servicos", "delete");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("client_services")
    .delete()
    .eq("id", clientServiceId)
    .eq("space_id", space.id);

  if (error) return { error: error.message };

  revalidatePath(`/visionario/clientes/${clientId}`);
  return { success: "Serviço removido do cliente." };
}
