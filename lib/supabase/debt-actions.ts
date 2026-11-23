"use server";

import { requireScopedModulePermission } from "@/lib/supabase/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidateFinancialViews } from "@/lib/supabase/finance-core";
import { createMovementAction, undoPaymentAction } from "@/lib/supabase/financial-actions";
import { debtDescription, isDebtCharge, validateDebtPayment, validateDebtTotal } from "@/lib/finance/debts";
import type { FinancialScope } from "@/lib/space-slugs";
import type { FinancialPaymentMethod } from "@/types/database.types";

/**
 * Gerenciamento de dívidas (lib/finance/debts.ts tem a regra dos números).
 * Tudo usa as tabelas do Financeiro que já existem — nenhuma migration:
 *  - dívida = cobrança de saída "Dívida — <nome>" (origem única);
 *  - pagamento = financial_payments (registrado por registerPaymentAction,
 *    que para dívida força "Quitar" desligado);
 *  - excluir pagamento = undoPaymentAction com devolução (o valor volta à
 *    conta de origem e o registro vai para o histórico do banco).
 * Valores e saldos de contas são sempre DERIVADOS dos pagamentos, então
 * editar/excluir um pagamento atualiza todos os indicadores.
 */

type ActionState = { error?: string; success?: string; id?: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PAYMENT_METHODS: FinancialPaymentMethod[] = ["pix", "dinheiro", "debito", "credito", "boleto", "transferencia", "outro"];
const cents = (v: number) => Math.round(v * 100) / 100;

async function loadDebt(scope: FinancialScope, chargeId: string, level: "edit" | "create" = "edit") {
  const { profile, space } = await requireScopedModulePermission(scope, "financeiro", level);
  const supabase = await createSupabaseServerClient();
  const { data: charge, error } = await supabase
    .from("financial_charges")
    .select("id, origin_id, kind, description, status, original_amount, discount_amount, addition_amount")
    .eq("id", chargeId)
    .eq("space_id", space.id)
    .maybeSingle();
  if (error) return { error: error.message } as const;
  if (!charge || !isDebtCharge(charge)) return { error: "Dívida não encontrada." } as const;
  const { data: payments, error: pErr } = await supabase
    .from("financial_payments")
    .select("id, amount")
    .eq("charge_id", chargeId)
    .eq("space_id", space.id);
  if (pErr) return { error: pErr.message } as const;
  return { profile, space, supabase, charge, payments: payments ?? [] } as const;
}

export async function createDebtAction(
  scope: FinancialScope,
  input: { name: string; originalAmount: number; startDate: string; creditor?: string; notes?: string }
): Promise<ActionState> {
  const name = input.name.trim();
  if (!name) return { error: "Informe o nome da dívida." };
  const totalError = validateDebtTotal(input.originalAmount, 0);
  if (totalError) return { error: totalError };
  if (!DATE_RE.test(input.startDate)) return { error: "Informe a data da dívida." };

  const { space } = await requireScopedModulePermission(scope, "financeiro", "create");
  const supabase = await createSupabaseServerClient();
  const description = debtDescription(name);
  const { data: existing } = await supabase
    .from("financial_charges")
    .select("id")
    .eq("space_id", space.id)
    .eq("kind", "saida")
    .eq("description", description)
    .neq("status", "cancelado")
    .limit(1);
  if (existing?.length) return { error: "Já existe uma dívida com esse nome." };

  const created = await createMovementAction(scope, {
    kind: "saida",
    description,
    supplierName: input.creditor?.trim() || undefined,
    originalAmount: cents(input.originalAmount),
    dueDate: input.startDate,
    tipo: "unico",
    settled: false,
    notes: input.notes?.trim() || undefined,
  });
  if (created.error) return { error: created.error };
  return { success: "Dívida cadastrada.", id: created.id };
}

/**
 * Edita nome e valor ORIGINAL. Também zera desconto/acréscimo gravados por
 * um "Quitar" antigo (o caso da dívida Ex-sócio G: R$ 475 de desconto fazia o
 * total aparecer como R$ 525). Os pagamentos NÃO são alterados — só deixam de
 * carregar o desconto que tinham aplicado.
 */
export async function updateDebtAction(
  scope: FinancialScope,
  chargeId: string,
  input: { name: string; originalAmount: number }
): Promise<ActionState> {
  const loaded = await loadDebt(scope, chargeId);
  if ("error" in loaded) return { error: loaded.error };
  const { supabase, space, profile, charge, payments } = loaded;

  const name = input.name.trim();
  if (!name) return { error: "Informe o nome da dívida." };
  const paid = cents(payments.reduce((s, p) => s + Number(p.amount), 0));
  const totalError = validateDebtTotal(input.originalAmount, paid);
  if (totalError) return { error: totalError };

  const description = debtDescription(name);
  if (description !== charge.description) {
    const { data: clash } = await supabase
      .from("financial_charges")
      .select("id")
      .eq("space_id", space.id)
      .eq("kind", "saida")
      .eq("description", description)
      .neq("id", chargeId)
      .neq("status", "cancelado")
      .limit(1);
    if (clash?.length) return { error: "Já existe uma dívida com esse nome." };
  }

  const { error } = await supabase
    .from("financial_charges")
    .update({ description, original_amount: cents(input.originalAmount), discount_amount: 0, addition_amount: 0, updated_by: profile.id })
    .eq("id", chargeId)
    .eq("space_id", space.id);
  if (error) return { error: error.message };

  // Mantém a origem com o mesmo nome (aparece em Movimentações).
  await supabase.from("financial_origins").update({ description }).eq("id", charge.origin_id).eq("space_id", space.id);

  // O desconto/acréscimo deixou de existir: os pagamentos não podem mais
  // "devolvê-lo" ao serem desfeitos. Coluna da migration 20261111100000 —
  // se ela não existir, não há o que zerar.
  if (Number(charge.discount_amount) !== 0 || Number(charge.addition_amount) !== 0) {
    await supabase
      .from("financial_payments")
      .update({ settle_discount: 0, settle_addition: 0 })
      .eq("charge_id", chargeId)
      .eq("space_id", space.id);
  }

  revalidateFinancialViews(scope);
  return { success: "Dívida atualizada." };
}

export async function updateDebtPaymentAction(
  scope: FinancialScope,
  chargeId: string,
  paymentId: string,
  input: { amount: number; paymentDate: string; paymentMethod: FinancialPaymentMethod; notes?: string }
): Promise<ActionState> {
  const loaded = await loadDebt(scope, chargeId);
  if ("error" in loaded) return { error: loaded.error };
  const { supabase, space, charge, payments } = loaded;

  if (!payments.some((p) => p.id === paymentId)) return { error: "Pagamento não encontrado (recarregue a página)." };
  if (!DATE_RE.test(input.paymentDate)) return { error: "Informe a data do pagamento." };
  if (!PAYMENT_METHODS.includes(input.paymentMethod)) return { error: "Forma de pagamento inválida." };
  const otherPaid = cents(payments.filter((p) => p.id !== paymentId).reduce((s, p) => s + Number(p.amount), 0));
  const amountError = validateDebtPayment(Number(charge.original_amount), otherPaid, input.amount);
  if (amountError) return { error: amountError };

  const { error } = await supabase
    .from("financial_payments")
    .update({ amount: cents(input.amount), payment_date: input.paymentDate, payment_method: input.paymentMethod, notes: input.notes?.trim() || null })
    .eq("id", paymentId)
    .eq("charge_id", chargeId)
    .eq("space_id", space.id);
  // Pagamentos ligados ao Financeiro Pessoal são protegidos por trigger
  // (valor/conta só mudam desfazendo) — a mensagem do banco já explica.
  if (error) return { error: error.message };

  revalidateFinancialViews(scope);
  return { success: "Pagamento atualizado." };
}

export async function deleteDebtPaymentAction(scope: FinancialScope, chargeId: string, paymentId: string): Promise<ActionState> {
  const loaded = await loadDebt(scope, chargeId);
  if ("error" in loaded) return { error: loaded.error };
  if (!loaded.payments.some((p) => p.id === paymentId)) return { error: "Pagamento não encontrado (recarregue a página)." };
  const result = await undoPaymentAction(scope, paymentId, true, "Pagamento excluído no controle de dívidas");
  if (result.error) return { error: result.error };
  return { success: "Pagamento excluído — o valor voltou para a conta de origem (quando havia uma) e o saldo da dívida foi atualizado." };
}
