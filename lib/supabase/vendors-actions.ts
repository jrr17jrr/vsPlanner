"use server";

import { revalidatePath } from "next/cache";
import { requireModulePermission } from "@/lib/supabase/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { VISIONARIO_DEV_SLUG } from "@/lib/space-slugs";
import type { CommissionStatus, SaleStatus, VendorStatus } from "@/types/database.types";

type ActionState = { error?: string; success?: string; id?: string };

function isForeignKeyRestrictError(error: { code?: string } | null): boolean {
  return error?.code === "23503";
}

// -----------------------------------------------------------------------------
// Vendedores
// -----------------------------------------------------------------------------

export type VendorFormInput = {
  name: string;
  contactName?: string;
  whatsapp?: string;
  email?: string;
  notes?: string;
};

export async function createVendorAction(input: VendorFormInput): Promise<ActionState> {
  const { profile, space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "vendedores", "create");
  if (!input.name.trim()) return { error: "Nome é obrigatório." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("vendors")
    .insert({
      space_id: space.id,
      name: input.name.trim(),
      contact_name: input.contactName?.trim() || null,
      whatsapp: input.whatsapp?.trim() || null,
      email: input.email?.trim() || null,
      notes: input.notes?.trim() || null,
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  revalidatePath("/visionario/vendedores");
  return { success: "Vendedor criado.", id: data.id };
}

export async function updateVendorAction(vendorId: string, input: VendorFormInput & { status?: VendorStatus }): Promise<ActionState> {
  const { space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "vendedores", "edit");
  if (!input.name.trim()) return { error: "Nome é obrigatório." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("vendors")
    .update({
      name: input.name.trim(),
      contact_name: input.contactName?.trim() || null,
      whatsapp: input.whatsapp?.trim() || null,
      email: input.email?.trim() || null,
      notes: input.notes?.trim() || null,
      ...(input.status && { status: input.status }),
    })
    .eq("id", vendorId)
    .eq("space_id", space.id);

  if (error) return { error: error.message };
  revalidatePath("/visionario/vendedores");
  return { success: "Vendedor atualizado." };
}

export async function deleteVendorAction(vendorId: string): Promise<ActionState> {
  const { space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "vendedores", "delete");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("vendors").delete().eq("id", vendorId).eq("space_id", space.id);
  if (error) {
    if (isForeignKeyRestrictError(error)) return { error: "Este vendedor já tem vendas registradas — desative em vez de excluir." };
    return { error: error.message };
  }
  revalidatePath("/visionario/vendedores");
  return { success: "Vendedor excluído." };
}

// -----------------------------------------------------------------------------
// Vendas — NUNCA cria financial_charges automaticamente (evita duplicar
// receita entre Vendedores e Financeiro).
// -----------------------------------------------------------------------------

export type SaleFormInput = {
  vendorId: string;
  clientId?: string;
  serviceId?: string;
  amount: number;
  saleDate: string;
  status: SaleStatus;
  notes?: string;
  /** Opcional — se informado, já cria a comissão vinculada junto com a venda. */
  commissionPercentage?: number;
  commissionDueDate?: string;
};

export async function createSaleAction(input: SaleFormInput): Promise<ActionState> {
  const { profile, space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "vendedores", "create");
  if (!input.vendorId) return { error: "Escolha um vendedor." };
  if (!input.amount || input.amount <= 0) return { error: "Informe um valor válido." };
  if (!input.saleDate) return { error: "Informe a data da venda." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("sales")
    .insert({
      space_id: space.id,
      vendor_id: input.vendorId,
      client_id: input.clientId || null,
      service_id: input.serviceId || null,
      amount: input.amount,
      sale_date: input.saleDate,
      status: input.status,
      notes: input.notes?.trim() || null,
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  if (input.commissionPercentage && input.commissionPercentage > 0) {
    const commissionAmount = Math.round(input.amount * (input.commissionPercentage / 100) * 100) / 100;
    const { error: commissionError } = await supabase.from("commissions").insert({
      space_id: space.id,
      sale_id: data.id,
      vendor_id: input.vendorId,
      percentage: input.commissionPercentage,
      amount: commissionAmount,
      due_date: input.commissionDueDate || null,
      created_by: profile.id,
    });
    if (commissionError) return { error: commissionError.message };
  }

  revalidatePath("/visionario/vendedores");
  return { success: "Venda registrada.", id: data.id };
}

export async function updateSaleAction(saleId: string, input: SaleFormInput): Promise<ActionState> {
  const { space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "vendedores", "edit");
  if (!input.amount || input.amount <= 0) return { error: "Informe um valor válido." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("sales")
    .update({
      vendor_id: input.vendorId,
      client_id: input.clientId || null,
      service_id: input.serviceId || null,
      amount: input.amount,
      sale_date: input.saleDate,
      status: input.status,
      notes: input.notes?.trim() || null,
    })
    .eq("id", saleId)
    .eq("space_id", space.id);

  if (error) return { error: error.message };
  revalidatePath("/visionario/vendedores");
  return { success: "Venda atualizada." };
}

export async function deleteSaleAction(saleId: string): Promise<ActionState> {
  const { space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "vendedores", "delete");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("sales").delete().eq("id", saleId).eq("space_id", space.id);
  if (error) return { error: error.message };
  revalidatePath("/visionario/vendedores");
  return { success: "Venda excluída." };
}

// -----------------------------------------------------------------------------
// Comissões
// -----------------------------------------------------------------------------

export type CommissionFormInput = {
  saleId: string;
  vendorId: string;
  percentage?: number;
  amount: number;
  dueDate?: string;
  notes?: string;
};

export async function createCommissionAction(input: CommissionFormInput): Promise<ActionState> {
  const { profile, space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "vendedores", "create");
  if (!input.amount || input.amount <= 0) return { error: "Informe um valor válido." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("commissions")
    .insert({
      space_id: space.id,
      sale_id: input.saleId,
      vendor_id: input.vendorId,
      percentage: input.percentage ?? null,
      amount: input.amount,
      due_date: input.dueDate || null,
      notes: input.notes?.trim() || null,
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  revalidatePath("/visionario/vendedores");
  return { success: "Comissão criada.", id: data.id };
}

export async function markCommissionPaidAction(commissionId: string, paidDate: string): Promise<ActionState> {
  const { space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "vendedores", "edit");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("commissions")
    .update({ status: "paga" as CommissionStatus, paid_date: paidDate })
    .eq("id", commissionId)
    .eq("space_id", space.id);
  if (error) return { error: error.message };
  revalidatePath("/visionario/vendedores");
  return { success: "Comissão marcada como paga." };
}

export async function deleteCommissionAction(commissionId: string): Promise<ActionState> {
  const { space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "vendedores", "delete");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("commissions").delete().eq("id", commissionId).eq("space_id", space.id);
  if (error) return { error: error.message };
  revalidatePath("/visionario/vendedores");
  return { success: "Comissão excluída." };
}
