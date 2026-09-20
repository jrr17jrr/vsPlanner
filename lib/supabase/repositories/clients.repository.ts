import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Client, ClientService, Meeting, Service } from "@/types/database.types";

/**
 * Leitura de clients/services/client_services (migration 005). RLS
 * (`has_module_permission(space_id, 'clientes'|'servicos', 'view')`) já
 * garante que só voltam linhas do space onde o usuário tem permissão —
 * nenhuma checagem extra é necessária aqui.
 */

export async function listClients(spaceId: string): Promise<Client[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("space_id", spaceId)
    .order("name", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function getClient(id: string): Promise<Client | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("clients").select("*").eq("id", id).maybeSingle();

  if (error) throw error;
  return data;
}

export async function listServices(spaceId: string): Promise<Service[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("services")
    .select("*")
    .eq("space_id", spaceId)
    .order("name", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function getService(id: string): Promise<Service | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("services").select("*").eq("id", id).maybeSingle();

  if (error) throw error;
  return data;
}

export async function listClientServices(clientId: string): Promise<ClientService[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("client_services")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

/** Todos os contratos do space, de uma vez — usado na listagem de clientes pra evitar N+1. */
export async function listAllClientServices(spaceId: string): Promise<ClientService[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("client_services")
    .select("*")
    .eq("space_id", spaceId);

  if (error) throw error;
  return data ?? [];
}

/** Histórico de reuniões de um cliente (Etapa 4/8 — meetings.client_id). */
export async function listMeetingsForClient(clientId: string): Promise<Meeting[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("meetings")
    .select("*")
    .eq("client_id", clientId)
    .order("meeting_date", { ascending: false })
    .order("start_time", { ascending: false });

  if (error) throw error;
  return data ?? [];
}
