"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireScopedModulePermission } from "@/lib/supabase/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assertUsableAccount, revalidateFinancialViews } from "@/lib/supabase/finance-core";
import { CARDS_MIGRATION_MESSAGE, isMissingCardsSchema, materializeSubscriptions } from "@/lib/supabase/repositories/credit-cards.repository";
import { planCardPurchase, validateCardInput, type CardOwnership, type CardStatus, type PurchaseType } from "@/lib/finance/credit-card";
import type { InstallmentValueMode } from "@/lib/finance/installments";
import { todayKeySaoPaulo } from "@/lib/format";
import type { FinancialPaymentMethod } from "@/types/database.types";

type ActionState = { error?: string; success?: string; id?: string };

/**
 * Cartões de crédito do Financeiro Pessoal (migration 20261113100000).
 * O space é sempre o Pessoal resolvido no servidor; compras, faturas e
 * assinaturas só mudam pelas funções do banco (transação + regras de
 * fatura paga / sem duplicidade). Comprar no cartão nunca mexe em conta:
 * só o pagamento da fatura (ou ao titular) movimenta dinheiro.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const METHODS: FinancialPaymentMethod[] = ["pix", "dinheiro", "debito", "credito", "boleto", "transferencia", "outro"];

async function ctx(action: "view" | "create" | "edit" | "delete") {
  const { profile, space } = await requireScopedModulePermission("pessoal", "financeiro", action);
  const supabase = (await createSupabaseServerClient()) as unknown as SupabaseClient;
  return { profile, space, supabase };
}

function fail(error: { code?: string; message?: string } | null, fallback = "Não foi possível salvar."): ActionState {
  if (isMissingCardsSchema(error)) return { error: CARDS_MIGRATION_MESSAGE };
  if (error?.code === "23505") return { error: "Já existe um cartão com esse nome." };
  if (error?.code === "23503") return { error: "Este cartão tem compras, faturas ou assinaturas — marque como Inativo em vez de excluir (o histórico fica preservado)." };
  return { error: error?.message ?? fallback };
}

const done = (success: string, id?: string): ActionState => {
  revalidateFinancialViews("pessoal");
  return { success, ...(id ? { id } : {}) };
};

// -----------------------------------------------------------------------------
// Cartões
// -----------------------------------------------------------------------------

export type CardInput = {
  name: string;
  bank?: string;
  holderName?: string;
  ownership: CardOwnership;
  nickname?: string;
  last4?: string;
  creditLimit?: number | null;
  closingDay: number;
  dueDay: number;
  color?: string;
  status: CardStatus;
};

function cardRow(input: CardInput) {
  return {
    name: input.name.trim(),
    bank: input.bank?.trim() || null,
    holder_name: input.holderName?.trim() || null,
    ownership: input.ownership,
    nickname: input.nickname?.trim() || null,
    last4: input.last4?.trim() || null,
    credit_limit: input.creditLimit === null || input.creditLimit === undefined || Number.isNaN(input.creditLimit) ? null : Math.round(input.creditLimit * 100) / 100,
    closing_day: input.closingDay,
    due_day: input.dueDay,
    color: input.color && /^#[0-9a-fA-F]{6}$/.test(input.color) ? input.color : null,
    status: input.status,
  };
}

export async function createCardAction(input: CardInput): Promise<ActionState> {
  const invalid = validateCardInput(input);
  if (invalid) return { error: invalid };
  const { profile, space, supabase } = await ctx("create");
  const { data, error } = await supabase.from("credit_cards").insert({ ...cardRow(input), space_id: space.id, created_by: profile.id }).select("id").single();
  if (error) return fail(error);
  return done("Cartão cadastrado.", data.id);
}

export async function updateCardAction(id: string, input: CardInput): Promise<ActionState> {
  const invalid = validateCardInput(input);
  if (invalid) return { error: invalid };
  const { space, supabase } = await ctx("edit");
  const { data, error } = await supabase.from("credit_cards").update(cardRow(input)).eq("id", id).eq("space_id", space.id).select("id").maybeSingle();
  if (error) return fail(error);
  if (!data) return { error: "Cartão não encontrado." };
  return done("Cartão atualizado. Faturas já pagas não mudam; as futuras seguem os novos dias.");
}

export async function deleteCardAction(id: string): Promise<ActionState> {
  const { space, supabase } = await ctx("delete");
  const { data, error } = await supabase.from("credit_cards").delete().eq("id", id).eq("space_id", space.id).select("id").maybeSingle();
  if (error) return fail(error);
  if (!data) return { error: "Cartão não encontrado." };
  return done("Cartão excluído.");
}

// -----------------------------------------------------------------------------
// Compras
// -----------------------------------------------------------------------------

export type PurchaseInput = {
  cardId: string;
  description: string;
  categoryId?: string | null;
  purchaseDate: string;
  type: Exclude<PurchaseType, "assinatura">;
  mode: InstallmentValueMode;
  amount: number;
  count: number;
  firstInvoiceMonth?: string | null;
  /** Valores individuais editados à mão (opcional). Soma = total da compra. */
  amounts?: number[];
  notes?: string;
};

async function planFor(supabase: SupabaseClient, spaceId: string, input: PurchaseInput) {
  const { data: card } = await supabase.from("credit_cards").select("id, closing_day, due_day, status").eq("id", input.cardId).eq("space_id", spaceId).maybeSingle();
  if (!card) return { error: "Escolha o cartão." } as const;
  const { data: invoices } = await supabase.from("credit_card_invoices").select("reference_month, closing_date").eq("card_id", card.id);
  const plan = planCardPurchase(card, input, invoices ?? []);
  if (plan.error) return { error: plan.error } as const;
  let amounts = plan.items.map((i) => i.amount);
  if (input.amounts?.length) {
    const custom = input.amounts.map((a) => Math.round(a * 100) / 100);
    if (custom.length !== amounts.length || custom.some((a) => !(a > 0))) return { error: "Valores das parcelas inválidos." } as const;
    amounts = custom;
  }
  return { card, plan, amounts } as const;
}

export async function createPurchaseAction(input: PurchaseInput): Promise<ActionState> {
  if (!input.description?.trim()) return { error: "Informe a descrição da compra." };
  if (!DATE_RE.test(input.purchaseDate)) return { error: "Informe a data da compra." };
  const { supabase, space } = await ctx("create");
  const planned = await planFor(supabase, space.id, input);
  if ("error" in planned) return { error: planned.error };
  if (planned.card.status !== "ativo") return { error: "Este cartão está inativo." };
  const { data, error } = await supabase.rpc("card_create_purchase", {
    p_card_id: input.cardId,
    p_description: input.description.trim(),
    p_category_id: input.categoryId || null,
    p_purchase_date: input.purchaseDate,
    p_type: input.type,
    p_amounts: planned.amounts,
    p_first_month: planned.plan.firstInvoiceMonth,
    p_notes: input.notes?.trim() || null,
  });
  if (error) return fail(error);
  const n = planned.amounts.length;
  return done(n > 1 ? `Compra lançada em ${n} faturas. Nenhum saldo mudou: o dinheiro só sai ao pagar a fatura.` : "Compra lançada na fatura. Nenhum saldo mudou: o dinheiro só sai ao pagar a fatura.", data as string);
}

export async function updatePurchaseAction(purchaseId: string, input: PurchaseInput & { replan: boolean }): Promise<ActionState> {
  if (!input.description?.trim()) return { error: "Informe a descrição da compra." };
  const { supabase, space } = await ctx("edit");
  let planned: Awaited<ReturnType<typeof planFor>> | null = null;
  if (input.replan) {
    planned = await planFor(supabase, space.id, input);
    if ("error" in planned) return { error: planned.error };
  }
  const { error } = await supabase.rpc("card_update_purchase", {
    p_purchase_id: purchaseId,
    p_description: input.description.trim(),
    p_category_id: input.categoryId || null,
    p_notes: input.notes?.trim() || null,
    p_replan: input.replan,
    p_card_id: input.replan ? input.cardId : null,
    p_purchase_date: input.replan ? input.purchaseDate : null,
    p_type: input.replan ? input.type : null,
    p_amounts: planned && !("error" in planned) ? planned.amounts : null,
    p_first_month: planned && !("error" in planned) ? planned.plan.firstInvoiceMonth : null,
  });
  if (error) return fail(error);
  return done(input.replan ? "Compra atualizada e relançada nas faturas." : "Compra atualizada.");
}

export async function cancelPurchaseAction(purchaseId: string, note?: string): Promise<ActionState> {
  const { supabase } = await ctx("edit");
  const { data, error } = await supabase.rpc("card_cancel_purchase", { p_purchase_id: purchaseId, p_note: note?.trim() || null });
  if (error) return fail(error);
  const credited = Number((data as { credited?: number } | null)?.credited ?? 0);
  return done(credited > 0
    ? `Compra cancelada. O que já estava em fatura paga (${credited.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}) virou estorno na próxima fatura.`
    : "Compra cancelada e retirada das faturas em aberto.");
}

export async function addCreditAction(purchaseId: string, amount: number, month: string, description?: string): Promise<ActionState> {
  if (!(amount > 0)) return { error: "Informe o valor do estorno." };
  const { supabase } = await ctx("edit");
  const { error } = await supabase.rpc("card_add_credit", {
    p_purchase_id: purchaseId,
    p_amount: Math.round(amount * 100) / 100,
    p_month: DATE_RE.test(month) ? month : todayKeySaoPaulo(),
    p_description: description?.trim() || null,
  });
  if (error) return fail(error);
  return done("Estorno/crédito registrado na fatura em aberto.");
}

// -----------------------------------------------------------------------------
// Pagar ao titular (cartão de terceiro)
// -----------------------------------------------------------------------------

export async function payHolderAction(cardId: string, input: { amount: number; paymentDate: string; paymentMethod: FinancialPaymentMethod; accountId: string; notes?: string }): Promise<ActionState> {
  if (!(input.amount > 0)) return { error: "Informe um valor válido." };
  if (!DATE_RE.test(input.paymentDate)) return { error: "Informe a data." };
  if (!METHODS.includes(input.paymentMethod)) return { error: "Forma de pagamento inválida." };
  const { supabase, space } = await ctx("edit");
  const accountError = await assertUsableAccount(supabase as never, input.accountId, space.id);
  if (accountError) return { error: accountError };
  const { data, error } = await supabase.rpc("card_pay_holder", {
    p_card_id: cardId,
    p_amount: Math.round(input.amount * 100) / 100,
    p_payment_date: input.paymentDate,
    p_payment_method: input.paymentMethod,
    p_account_id: input.accountId,
    p_notes: input.notes?.trim() || null,
  });
  if (error) return fail(error);
  const remaining = Number((data as { remaining?: number } | null)?.remaining ?? 0);
  const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return done(remaining > 0 ? `Pagamento registrado. Ainda pendente com o titular: ${brl(remaining)}.` : "Pagamento registrado. Nada mais pendente com o titular.");
}

// -----------------------------------------------------------------------------
// Assinaturas
// -----------------------------------------------------------------------------

export type SubscriptionInput = {
  cardId: string;
  description: string;
  categoryId?: string | null;
  amount: number;
  billingDay: number;
  startDate: string;
  endDate?: string | null;
  notes?: string;
};

function validateSubscription(input: SubscriptionInput): string | null {
  if (!input.description?.trim()) return "Informe o nome da assinatura.";
  if (!(input.amount > 0)) return "Informe o valor mensal.";
  if (!Number.isInteger(input.billingDay) || input.billingDay < 1 || input.billingDay > 31) return "Dia da cobrança precisa ser de 1 a 31.";
  if (!DATE_RE.test(input.startDate)) return "Informe o início.";
  if (input.endDate && (!DATE_RE.test(input.endDate) || input.endDate < input.startDate)) return "O término precisa ser depois do início.";
  return null;
}

export async function createSubscriptionAction(input: SubscriptionInput): Promise<ActionState> {
  const invalid = validateSubscription(input);
  if (invalid) return { error: invalid };
  const { supabase, space } = await ctx("create");
  const { data, error } = await supabase.rpc("card_create_subscription", {
    p_card_id: input.cardId,
    p_description: input.description.trim(),
    p_category_id: input.categoryId || null,
    p_amount: Math.round(input.amount * 100) / 100,
    p_billing_day: input.billingDay,
    p_start: input.startDate,
    p_end: input.endDate || null,
    p_notes: input.notes?.trim() || null,
  });
  if (error) return fail(error);
  await materializeSubscriptions(space.id, data as string);
  return done("Assinatura criada. As cobranças entram nas faturas a cada mês, uma única vez.", data as string);
}

export async function updateSubscriptionAction(id: string, input: SubscriptionInput): Promise<ActionState> {
  const invalid = validateSubscription(input);
  if (invalid) return { error: invalid };
  const { supabase, space } = await ctx("edit");
  await materializeSubscriptions(space.id, id);
  const { error } = await supabase.rpc("card_update_subscription", {
    p_sub_id: id,
    p_description: input.description.trim(),
    p_category_id: input.categoryId || null,
    p_amount: Math.round(input.amount * 100) / 100,
    p_billing_day: input.billingDay,
    p_end: input.endDate || null,
    p_notes: input.notes?.trim() || null,
    p_card_id: input.cardId,
  });
  if (error) return fail(error);
  return done("Assinatura atualizada. Cobranças já geradas não mudam.");
}

export async function setSubscriptionStatusAction(id: string, status: "ativa" | "pausada" | "cancelada", note?: string): Promise<ActionState> {
  const { supabase, space } = await ctx("edit");
  // Antes de pausar/cancelar, gera o que já venceu (nada se perde nem duplica).
  if (status !== "ativa") await materializeSubscriptions(space.id, id);
  const { error } = await supabase.rpc("card_set_subscription_status", { p_sub_id: id, p_status: status, p_date: todayKeySaoPaulo(), p_note: note?.trim() || null });
  if (error) return fail(error);
  if (status === "ativa") await materializeSubscriptions(space.id, id);
  return done(status === "ativa" ? "Assinatura reativada (os meses pausados não são cobrados)." : status === "pausada" ? "Assinatura pausada." : "Assinatura cancelada. As cobranças antigas continuam no histórico.");
}
