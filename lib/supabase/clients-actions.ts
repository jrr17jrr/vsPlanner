"use server";

import { revalidatePath } from "next/cache";
import { requireModulePermission } from "@/lib/supabase/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasModulePermission } from "@/lib/supabase/repositories/permissions.repository";
import { revalidateFinancialViews } from "@/lib/supabase/finance-core";
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

  // O financeiro do cliente (origens/cobranças) usa `on delete set null` —
  // excluir o cliente sem cuidar disso deixaria recorrências "órfãs"
  // gerando cobrança. Com pagamento registrado, o histórico precisa ficar:
  // a saída é inativar o cliente.
  const [canViewFinance, canDeleteFinance] = await Promise.all([
    hasModulePermission(space.id, "financeiro", "view"),
    hasModulePermission(space.id, "financeiro", "delete"),
  ]);
  if (!canViewFinance) {
    const { count } = await supabase
      .from("client_services")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .eq("space_id", space.id);
    if ((count ?? 0) > 0) {
      return { error: "Este cliente tem serviços contratados — inative o cliente (ou peça a alguém com acesso ao Financeiro para excluir)." };
    }
  } else {
    const { data: origins, error: originsError } = await supabase
      .from("financial_origins")
      .select("id")
      .eq("client_id", clientId)
      .eq("space_id", space.id);
    if (originsError) return { error: originsError.message };
    if ((origins ?? []).length > 0) {
      const { data: charges } = await supabase.from("financial_charges").select("id").eq("client_id", clientId).eq("space_id", space.id);
      const chargeIds = (charges ?? []).map((c) => c.id);
      if (chargeIds.length > 0) {
        const { count } = await supabase
          .from("financial_payments")
          .select("id", { count: "exact", head: true })
          .in("charge_id", chargeIds);
        if ((count ?? 0) > 0) {
          return { error: "Este cliente tem pagamentos registrados — inative o cliente em vez de excluir, para manter o histórico financeiro." };
        }
      }
      if (!canDeleteFinance) return { error: "Este cliente tem cobranças no Financeiro — é preciso permissão de excluir no Financeiro." };
      const { error: deleteOriginsError } = await supabase
        .from("financial_origins")
        .delete()
        .in(
          "id",
          (origins ?? []).map((o) => o.id)
        )
        .eq("space_id", space.id);
      if (deleteOriginsError) return { error: deleteOriginsError.message };
    }
  }

  const { error } = await supabase.from("clients").delete().eq("id", clientId).eq("space_id", space.id);

  if (error) return { error: error.message };

  revalidatePath("/visionario/clientes");
  revalidateFinancialViews("visionario");
  return { success: "Cliente excluído." };
}
