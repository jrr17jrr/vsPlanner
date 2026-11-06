"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireScopedModulePermission, requirePersonalSpace } from "@/lib/supabase/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidateFinancialViews } from "@/lib/supabase/finance-core";
import { isMissingPersonalLinkSchema } from "@/lib/supabase/repositories/financial.repository";
import { PERSONAL_LINK_MIGRATION_MESSAGE, canPayWithPersonalAccounts, findPersonalDuplicateCandidates } from "@/lib/finance/personal-link";
import { listFinancialAccounts, listFinancialCharges, listFinancialPayments } from "@/lib/supabase/repositories/financial.repository";
import { accountBalance } from "@/lib/financial-calc";
import type { PersonalAccountOption } from "@/types/database.types";
import { payChargeWithPersonalAccountCore, type PersonalPaymentInput } from "@/lib/supabase/finance-personal-core";
import type { FinancialScope } from "@/lib/space-slugs";

/**
 * Pagamentos da empresa feitos com dinheiro pessoal. TODA escrita passa
 * pelas funções do banco (migration 20261110100000), que fazem pagamento +
 * débito pessoal (ou estorno) numa única transação e validam permissão nos
 * dois financeiros — nada aqui escreve direto em financial_payments.
 */

type ActionState = { error?: string; success?: string; id?: string };

function rpcError(error: { code?: string; message?: string } | null): string {
  if (isMissingPersonalLinkSchema(error)) return PERSONAL_LINK_MIGRATION_MESSAGE;
  return error?.message ?? "Não foi possível concluir. Nada foi alterado.";
}

function revalidateBoth(scope: FinancialScope) {
  revalidateFinancialViews(scope);
  revalidateFinancialViews("pessoal");
}

/**
 * Contas ATIVAS do Financeiro Pessoal de quem está logado, com saldo atual
 * (as mesmas contas já cadastradas — nunca cria conta). Só para o próprio
 * Ricardo Júnior; para os demais volta `allowed: false`.
 */
export async function listMyPersonalAccountsAction(scope: FinancialScope): Promise<{ allowed: boolean; accounts: PersonalAccountOption[]; error?: string }> {
  if (scope === "pessoal") return { allowed: false, accounts: [] };
  const { profile, space } = await requireScopedModulePermission(scope, "financeiro", "edit");
  if (!canPayWithPersonalAccounts(profile, space)) return { allowed: false, accounts: [] };
  const { space: personal } = await requirePersonalSpace();
  try {
    const [accounts, charges, payments] = await Promise.all([
      listFinancialAccounts(personal.id),
      listFinancialCharges(personal.id),
      listFinancialPayments(personal.id),
    ]);
    const kinds = new Map(charges.map((c) => [c.id, c.kind]));
    return {
      allowed: true,
      accounts: accounts
        .filter((a) => a.is_active)
        .map((a) => ({ id: a.id, name: a.name, balance: accountBalance(a, payments, kinds), initial_balance_date: a.initial_balance_date })),
    };
  } catch (e) {
    return { allowed: true, accounts: [], error: e instanceof Error ? e.message : "Não foi possível carregar as contas pessoais." };
  }
}

export async function payChargeWithPersonalAccountAction(scope: FinancialScope, chargeId: string, input: PersonalPaymentInput): Promise<ActionState> {
  if (scope === "pessoal") return { error: "Disponível apenas no financeiro da empresa." };
  const { space } = await requireScopedModulePermission(scope, "financeiro", "edit");
  await requirePersonalSpace();
  const supabase = await createSupabaseServerClient();
  const { data: charge } = await supabase.from("financial_charges").select("id").eq("id", chargeId).eq("space_id", space.id).maybeSingle();
  if (!charge) return { error: "Cobrança não encontrada." };
  const result = await payChargeWithPersonalAccountCore(chargeId, input);
  if (!result.error) revalidateBoth(scope);
  return result;
}

export type PersonalDuplicateCandidate = { id: string; amount: number; payment_date: string; description: string };

/**
 * Pagamento antigo → antes de descontar, procura no Pessoal (mesma conta,
 * mesmo valor, data próxima) um lançamento que já registre esse gasto.
 */
export async function findPersonalDuplicatesAction(
  scope: FinancialScope,
  businessPaymentId: string,
  personalAccountId: string
): Promise<{ error?: string; alreadyLinked?: boolean; candidates?: PersonalDuplicateCandidate[] }> {
  if (scope === "pessoal") return { error: "Disponível apenas no financeiro da empresa." };
  const { space } = await requireScopedModulePermission(scope, "financeiro", "edit");
  const { space: personal } = await requirePersonalSpace();
  const supabase = await createSupabaseServerClient();

  const { data: bp, error: bpError } = await supabase
    .from("financial_payments")
    .select("id, amount, payment_date")
    .eq("id", businessPaymentId)
    .eq("space_id", space.id)
    .maybeSingle();
  if (bpError) return { error: bpError.message };
  if (!bp) return { error: "Pagamento não encontrado." };

  const { data: linkRows, error: linksError } = await (supabase as unknown as SupabaseClient)
    .from("financial_personal_links")
    .select("business_payment_id, personal_payment_id")
    .eq("status", "ativo")
    .or(`personal_space_id.eq.${personal.id},business_payment_id.eq.${businessPaymentId}`);
  if (linksError) return { error: rpcError(linksError) };
  const links = (linkRows ?? []) as { business_payment_id: string | null; personal_payment_id: string | null }[];
  if (links.some((l) => l.business_payment_id === businessPaymentId)) return { alreadyLinked: true, candidates: [] };

  const { data: personalPayments, error: ppError } = await supabase
    .from("financial_payments")
    .select("id, amount, payment_date, account_id, charge_id")
    .eq("space_id", personal.id)
    .eq("account_id", personalAccountId);
  if (ppError) return { error: ppError.message };

  const linked = new Set(links.map((l) => l.personal_payment_id).filter((v): v is string => !!v));
  const found = findPersonalDuplicateCandidates(
    { amount: Number(bp.amount), payment_date: bp.payment_date },
    personalAccountId,
    (personalPayments ?? []).map((p) => ({ ...p, amount: Number(p.amount) })),
    linked
  );
  if (found.length === 0) return { candidates: [] };

  const { data: charges } = await supabase
    .from("financial_charges")
    .select("id, description, kind")
    .in("id", found.map((p) => p.charge_id));
  const chargeById = new Map((charges ?? []).map((c) => [c.id, c]));
  return {
    candidates: found
      .filter((p) => chargeById.get(p.charge_id)?.kind === "saida")
      .map((p) => ({ id: p.id, amount: p.amount, payment_date: p.payment_date, description: chargeById.get(p.charge_id)?.description ?? "Lançamento" })),
  };
}

/**
 * Vincula um pagamento JÁ registrado (sem recriá-lo) a uma conta pessoal.
 * `existingPersonalPaymentId` = só liga ao lançamento pessoal que já existe
 * (não desconta de novo). `detachBusinessAccount` = o pagamento antigo
 * movimentava uma conta da empresa e deixa de movimentar.
 */
export async function linkPaymentToPersonalAccountAction(
  scope: FinancialScope,
  businessPaymentId: string,
  personalAccountId: string,
  options: { existingPersonalPaymentId?: string; detachBusinessAccount?: boolean } = {}
): Promise<ActionState> {
  if (scope === "pessoal") return { error: "Disponível apenas no financeiro da empresa." };
  const { space } = await requireScopedModulePermission(scope, "financeiro", "edit");
  await requirePersonalSpace();
  const supabase = await createSupabaseServerClient();
  const { data: bp } = await supabase.from("financial_payments").select("id").eq("id", businessPaymentId).eq("space_id", space.id).maybeSingle();
  if (!bp) return { error: "Pagamento não encontrado." };

  const { error } = await (supabase as unknown as SupabaseClient).rpc("fin_link_payment_to_personal_account", {
    p_payment_id: businessPaymentId,
    p_personal_account_id: personalAccountId,
    p_existing_personal_payment_id: options.existingPersonalPaymentId ?? null,
    p_detach_business_account: options.detachBusinessAccount === true,
  });
  if (error) return { error: rpcError(error) };
  revalidateBoth(scope);
  return {
    success: options.existingPersonalPaymentId
      ? "Pagamento vinculado ao lançamento pessoal existente — nada foi descontado de novo."
      : "Pagamento vinculado e descontado da conta pessoal.",
  };
}

/** Desfaz só o vínculo: a despesa continua paga, o saldo pessoal volta. */
export async function unlinkPersonalAccountAction(scope: FinancialScope, linkId: string): Promise<ActionState> {
  if (scope === "pessoal") return { error: "Desvincule pelo financeiro da empresa." };
  await requireScopedModulePermission(scope, "financeiro", "edit");
  const supabase = await createSupabaseServerClient();
  const { error } = await (supabase as unknown as SupabaseClient).rpc("fin_unlink_personal_account", { p_link_id: linkId, p_note: null });
  if (error) return { error: rpcError(error) };
  revalidateBoth(scope);
  return { success: "Conta pessoal desvinculada — o valor voltou para a conta de origem." };
}
