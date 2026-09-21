"use server";

import { revalidatePath } from "next/cache";
import { requireModulePermission } from "@/lib/supabase/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { VISIONARIO_DEV_SLUG } from "@/lib/space-slugs";
import type { ClientSiteStatus } from "@/types/database.types";

type ActionState = { error?: string; success?: string; id?: string };

export type ClientSiteFormInput = {
  clientId?: string;
  projectName: string;
  url?: string;
  domain?: string;
  registrar?: string;
  hostingProvider?: string;
  plan?: string;
  contractedAt?: string;
  dueDate?: string;
  price?: number;
  status: ClientSiteStatus;
  notes?: string;
};

export async function createClientSiteAction(input: ClientSiteFormInput): Promise<ActionState> {
  const { profile, space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "sites", "create");
  if (!input.projectName.trim()) return { error: "Nome do projeto é obrigatório." };

  const supabase = await createSupabaseServerClient();

  if (input.clientId) {
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id")
      .eq("id", input.clientId)
      .eq("space_id", space.id)
      .maybeSingle();
    if (clientError) return { error: clientError.message };
    if (!client) return { error: "Cliente selecionado não pertence a este espaço." };
  }

  const { data, error } = await supabase
    .from("client_sites")
    .insert({
      space_id: space.id,
      client_id: input.clientId || null,
      project_name: input.projectName.trim(),
      url: input.url?.trim() || null,
      domain: input.domain?.trim() || null,
      registrar: input.registrar?.trim() || null,
      hosting_provider: input.hostingProvider?.trim() || null,
      plan: input.plan?.trim() || null,
      contracted_at: input.contractedAt || null,
      due_date: input.dueDate || null,
      price: input.price ?? null,
      status: input.status,
      notes: input.notes?.trim() || null,
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  revalidatePath("/visionario/sites");
  return { success: "Site cadastrado.", id: data.id };
}

export async function updateClientSiteAction(siteId: string, input: ClientSiteFormInput): Promise<ActionState> {
  const { space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "sites", "edit");
  if (!input.projectName.trim()) return { error: "Nome do projeto é obrigatório." };

  const supabase = await createSupabaseServerClient();

  if (input.clientId) {
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id")
      .eq("id", input.clientId)
      .eq("space_id", space.id)
      .maybeSingle();
    if (clientError) return { error: clientError.message };
    if (!client) return { error: "Cliente selecionado não pertence a este espaço." };
  }

  const { error } = await supabase
    .from("client_sites")
    .update({
      client_id: input.clientId || null,
      project_name: input.projectName.trim(),
      url: input.url?.trim() || null,
      domain: input.domain?.trim() || null,
      registrar: input.registrar?.trim() || null,
      hosting_provider: input.hostingProvider?.trim() || null,
      plan: input.plan?.trim() || null,
      contracted_at: input.contractedAt || null,
      due_date: input.dueDate || null,
      price: input.price ?? null,
      status: input.status,
      notes: input.notes?.trim() || null,
    })
    .eq("id", siteId)
    .eq("space_id", space.id);

  if (error) return { error: error.message };
  revalidatePath("/visionario/sites");
  return { success: "Site atualizado." };
}

export async function deleteClientSiteAction(siteId: string): Promise<ActionState> {
  const { space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "sites", "delete");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("client_sites").delete().eq("id", siteId).eq("space_id", space.id);
  if (error) return { error: error.message };
  revalidatePath("/visionario/sites");
  return { success: "Site excluído." };
}
