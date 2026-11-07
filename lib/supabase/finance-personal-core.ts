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
  /** Categoria da saída no Financeiro Pessoal (vazio = "Pagamentos da Visionário Dev"). */
  personalCategoryId?: string;
};

type Db = SupabaseClient;

/**
 * Troca SÓ a categoria de uma saída do Financeiro Pessoal (cobrança e sua
 * origem de lançamento único). Nunca toca em financial_payments: valor,
 * conta, data e vínculo com a empresa ficam exatamente como estão.
 */
export async function setPersonalChargeCategory(
  db: Db,
  personalSpaceId: string,
  chargeId: string,
  categoryId: string
): Promise<{ error?: string }> {
  const { data: charge, error: chargeError } = await db
    .from("financial_charges")
    .select("id, kind, origin_id, status")
    .eq("id", chargeId)
    .eq("space_id", personalSpaceId)
    .maybeSingle();
  if (chargeError) return { error: chargeError.message };
  if (!charge) return { error: "Lançamento não encontrado no seu Financeiro Pessoal." };
  if (charge.kind !== "saida") return { error: "Só despesas (saídas) têm categoria de gasto." };

  const { data: category, error: categoryError } = await db
    .from("financial_categories")
    .select("id, kind")
    .eq("id", categoryId)
    .eq("space_id", personalSpaceId)
    .maybeSingle();
  if (categoryError) return { error: categoryError.message };
  if (!category || category.kind !== "saida") return { error: "Categoria inválida para despesas do Financeiro Pessoal." };

  const { data: updated, error } = await db
    .from("financial_charges")
    .update({ category_id: categoryId })
    .eq("id", chargeId)
    .eq("space_id", personalSpaceId)
    .select("id");
  if (error) return { error: error.message };
  if (!updated?.length) return { error: "Não foi possível confirmar a alteração. Recarregue a página." };

  // Origem de lançamento ÚNICO = a mesma despesa; mantém as duas coerentes.
  await db.from("financial_origins").update({ category_id: categoryId })
    .eq("id", charge.origin_id).eq("space_id", personalSpaceId).eq("origin_type", "unico");
  return {};
}

/** Categoria escolhida para o débito pessoal recém-criado de um pagamento da empresa. */
export async function applyCategoryToLinkedDebit(db: Db, businessPaymentId: string, categoryId: string): Promise<{ error?: string }> {
  const { data: link, error } = await db
    .from("financial_personal_links")
    .select("personal_space_id, personal_charge_id, link_mode")
    .eq("business_payment_id", businessPaymentId)
    .eq("status", "ativo")
    .maybeSingle();
  if (error) return { error: error.message };
  const l = link as { personal_space_id: string; personal_charge_id: string | null; link_mode: string } | null;
  if (!l?.personal_charge_id || l.link_mode === "existente") return {};
  return setPersonalChargeCategory(db, l.personal_space_id, l.personal_charge_id, categoryId);
}

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
  const paymentId = (data as { payment_id?: string } | null)?.payment_id;
  if (input.personalCategoryId && paymentId) {
    const cat = await applyCategoryToLinkedDebit(supabase as unknown as SupabaseClient, paymentId, input.personalCategoryId);
    if (cat.error) {
      return {
        success: `Pagamento registrado e descontado da conta pessoal, na categoria "Pagamentos da Visionário Dev" (não foi possível aplicar a categoria escolhida: ${cat.error}). Você pode trocá-la pela movimentação no Financeiro Pessoal.`,
        id: paymentId,
      };
    }
  }
  return { success: "Pagamento registrado e descontado da conta pessoal.", id: paymentId };
}

