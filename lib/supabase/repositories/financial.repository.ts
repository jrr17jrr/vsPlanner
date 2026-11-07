import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  FinancialAccount,
  FinancialCategory,
  FinancialCharge,
  FinancialOrigin,
  FinancialPayment,
  FinancialPaymentReversal,
  FinancialPersonalLink,
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

export async function listFinancialChargesForClient(clientId: string, spaceId: string): Promise<FinancialCharge[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("financial_charges")
    .select("*")
    .eq("client_id", clientId)
    .eq("space_id", spaceId)
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

export async function listFinancialChargesByOrigins(originIds: string[], spaceId: string): Promise<FinancialCharge[]> {
  if (originIds.length === 0) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("financial_charges")
    .select("*")
    .in("origin_id", originIds)
    .eq("space_id", spaceId)
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

export async function listFinancialPaymentsForCharges(chargeIds: string[], spaceId: string): Promise<FinancialPayment[]> {
  if (chargeIds.length === 0) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("financial_payments")
    .select("*")
    .in("charge_id", chargeIds)
    .eq("space_id", spaceId);
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

/** Tabela/função da migration 20261110100000 ainda não aplicada? */
export function isMissingPersonalLinkSchema(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (["42P01", "PGRST205", "PGRST202", "42883"].includes(error.code ?? "")) return true;
  return /financial_personal_links|fin_pay_with_personal_account|fin_link_payment_to_personal_account|fin_unlink_personal_account/.test(error.message ?? "")
    && /does not exist|schema cache|Could not find/i.test(error.message ?? "");
}

/**
 * Vínculos empresa ↔ pessoal em que o space participa (como empresa OU
 * como pessoal). Sem a migration aplicada, volta vazio — as telas seguem
 * funcionando exatamente como antes.
 */
export async function listFinancialPersonalLinks(spaceId: string): Promise<FinancialPersonalLink[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("financial_personal_links" as never)
    .select("*")
    .or(`business_space_id.eq.${spaceId},personal_space_id.eq.${spaceId}`)
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingPersonalLinkSchema(error)) return [];
    throw error;
  }
  return (data ?? []) as FinancialPersonalLink[];
}

/** Pagamentos desfeitos do space (migration 20261111100000). Sem a migration, vazio. */
export async function listFinancialPaymentReversals(spaceId: string): Promise<FinancialPaymentReversal[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await (supabase as unknown as import("@supabase/supabase-js").SupabaseClient)
    .from("financial_payment_reversals")
    .select("*")
    .eq("space_id", spaceId)
    .order("created_at", { ascending: false });
  if (error) {
    if (["42P01", "PGRST205"].includes(String(error.code)) || /financial_payment_reversals/.test(error.message ?? "")) return [];
    throw error;
  }
  return (data ?? []) as FinancialPaymentReversal[];
}
