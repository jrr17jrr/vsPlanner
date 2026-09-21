import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  FinancialAccount,
  FinancialCategory,
  FinancialCharge,
  FinancialOrigin,
  FinancialPayment,
  FinancialReferenceType,
} from "@/types/database.types";

/**
 * Leitura do Financeiro (migration 007). RLS (`has_module_permission`)
 * garante que só voltam linhas do space onde o usuário tem
 * `financeiro.view` — quem não tem essa permissão não lê nenhuma linha de
 * nenhuma destas 6 tabelas, nem por aqui nem por API direta.
 */

export async function listFinancialAccounts(spaceId: string): Promise<FinancialAccount[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("financial_accounts")
    .select("*")
    .eq("space_id", spaceId)
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function listFinancialCategories(spaceId: string): Promise<FinancialCategory[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("financial_categories")
    .select("*")
    .eq("space_id", spaceId)
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function listFinancialReferenceTypes(spaceId: string): Promise<FinancialReferenceType[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("financial_reference_types")
    .select("*")
    .eq("space_id", spaceId)
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function listFinancialOrigins(spaceId: string): Promise<FinancialOrigin[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("financial_origins").select("*").eq("space_id", spaceId);
  if (error) throw error;
  return data ?? [];
}

export async function getFinancialOrigin(id: string): Promise<FinancialOrigin | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("financial_origins").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

/** Todas as cobranças do space, ativas ou canceladas — o dashboard/listas filtram depois. */
export async function listFinancialCharges(spaceId: string): Promise<FinancialCharge[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("financial_charges")
    .select("*")
    .eq("space_id", spaceId)
    .order("due_date", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getFinancialCharge(id: string): Promise<FinancialCharge | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("financial_charges").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function listFinancialChargesForClient(clientId: string): Promise<FinancialCharge[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("financial_charges")
    .select("*")
    .eq("client_id", clientId)
    .order("due_date", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listFinancialChargesByOrigin(originId: string): Promise<FinancialCharge[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("financial_charges")
    .select("*")
    .eq("origin_id", originId)
    .order("due_date", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Todos os pagamentos do space — o cálculo (lib/financial-calc.ts) cruza com as cobranças. */
export async function listFinancialPayments(spaceId: string): Promise<FinancialPayment[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("financial_payments")
    .select("*")
    .eq("space_id", spaceId)
    .order("payment_date", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function listFinancialPaymentsForCharges(chargeIds: string[]): Promise<FinancialPayment[]> {
  if (chargeIds.length === 0) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("financial_payments").select("*").in("charge_id", chargeIds);
  if (error) throw error;
  return data ?? [];
}

export async function listFinancialPaymentsByCharge(chargeId: string): Promise<FinancialPayment[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("financial_payments")
    .select("*")
    .eq("charge_id", chargeId)
    .order("payment_date", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
