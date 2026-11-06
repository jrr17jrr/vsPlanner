import type { SupabaseClient } from "@supabase/supabase-js";
import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isMissingPersonalLinkSchema } from "@/lib/supabase/repositories/financial.repository";
import { PERSONAL_LINK_MIGRATION_MESSAGE } from "@/lib/finance/personal-link";
import type { FinancialPaymentMethod } from "@/types/database.types";

/**
 * Núcleo (não é Server Action): pagamento da empresa + débito pessoal numa
 * única transação, via fin_pay_with_personal_account (migration
 * 20261110100000). Quem chama já resolveu space + permissão; o banco
 * valida de novo nos dois financeiros.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PAYMENT_METHODS: FinancialPaymentMethod[] = ["pix", "dinheiro", "debito", "credito", "boleto", "transferencia", "outro"];

export type PersonalPaymentInput = {
  amount: number;
  paymentDate: string;
  paymentMethod: FinancialPaymentMethod;
  personalAccountId: string;
  settle: boolean;
  notes?: string;
};

export async function payChargeWithPersonalAccountCore(chargeId: string, input: PersonalPaymentInput): Promise<{ error?: string; success?: string; id?: string }> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) return { error: "Informe um valor válido." };
  if (!input.paymentDate || !DATE_RE.test(input.paymentDate)) return { error: "Informe a data do pagamento." };
  if (!PAYMENT_METHODS.includes(input.paymentMethod)) return { error: "Forma de pagamento inválida." };
  if (!input.personalAccountId) return { error: "Escolha a conta pessoal de onde o valor saiu." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await (supabase as unknown as SupabaseClient).rpc("fin_pay_with_personal_account", {
    p_charge_id: chargeId,
    p_amount: Math.round(input.amount * 100) / 100,
    p_payment_date: input.paymentDate,
    p_payment_method: input.paymentMethod,
    p_personal_account_id: input.personalAccountId,
    p_settle: input.settle,
    p_notes: input.notes?.trim() || null,
  });
  if (error) return { error: isMissingPersonalLinkSchema(error) ? PERSONAL_LINK_MIGRATION_MESSAGE : error.message };
  return { success: "Pagamento registrado e descontado da conta pessoal.", id: (data as { payment_id?: string } | null)?.payment_id };
}

