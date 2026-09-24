"use server";

import { requireScopedModulePermission } from "@/lib/supabase/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listFinancialChargesByOrigin } from "@/lib/supabase/repositories/financial.repository";
import {
  assertUsableAccount,
  createOriginWithCharges,
  revalidateFinancialViews,
  type Supa,
} from "@/lib/supabase/finance-core";
import type { FinancialScope } from "@/lib/space-slugs";
import { todayKeySaoPaulo } from "@/lib/format";
import type {
  FinancialChargeStatus,
  FinancialKind,
  FinancialOriginType,
  FinancialPaymentMethod,
  FinancialRecurrenceEndType,
  FinancialRecurrenceFrequency,
} from "@/types/database.types";

type ActionState = { error?: string; success?: string; id?: string };

/**
 * Financeiro é a mesma arquitetura (migration 007) nos três espaços —
 * `scope` decide qual space é resolvido (`requireScopedModulePermission`,
 * sempre no servidor) e quais telas são revalidadas. Nenhuma action aceita
 * `space_id` vindo do browser: toda escrita usa o `space.id` resolvido
 * aqui, e todo UPDATE/DELETE filtra por ele além da RLS.
 */

const PAYMENT_METHODS: FinancialPaymentMethod[] = ["pix", "dinheiro", "debito", "credito", "boleto", "transferencia", "outro"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isForeignKeyRestrictError(error: { code?: string } | null): boolean {
  return error?.code === "23503";
}

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

// -----------------------------------------------------------------------------
// Contas / Categorias / Referente a
// -----------------------------------------------------------------------------

export async function createFinancialAccountAction(
  scope: FinancialScope,
  name: string,
  initialBalance: number,
  initialBalanceDate: string
): Promise<ActionState> {
  const { profile, space } = await requireScopedModulePermission(scope, "financeiro", "create");
  if (!name.trim()) return { error: "Dê um nome para a conta." };
  if (!Number.isFinite(initialBalance)) return { error: "Saldo inicial inválido." };
  if (!DATE_RE.test(initialBalanceDate)) return { error: "Data do saldo inicial inválida." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("financial_accounts")
    .insert({
      space_id: space.id,
      name: name.trim(),
      initial_balance: initialBalance,
      initial_balance_date: initialBalanceDate,
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (error) {
    if (isUniqueViolation(error)) return { error: "Já existe uma conta com esse nome neste espaço." };
    return { error: error.message };
  }
  revalidateFinancialViews(scope);
  return { success: "Conta criada.", id: data.id };
}

export async function updateFinancialAccountAction(
  scope: FinancialScope,
  id: string,
  updates: { name?: string; isActive?: boolean; initialBalance?: number; initialBalanceDate?: string }
): Promise<ActionState> {
  const { space } = await requireScopedModulePermission(scope, "financeiro", "edit");
  if (updates.name !== undefined && !updates.name.trim()) return { error: "Dê um nome para a conta." };
  if (updates.initialBalance !== undefined && !Number.isFinite(updates.initialBalance)) return { error: "Saldo inicial inválido." };
  if (updates.initialBalanceDate !== undefined && !DATE_RE.test(updates.initialBalanceDate)) return { error: "Data inválida." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("financial_accounts")
    .update({
      ...(updates.name !== undefined && { name: updates.name.trim() }),
      ...(updates.isActive !== undefined && { is_active: updates.isActive }),
      ...(updates.initialBalance !== undefined && { initial_balance: updates.initialBalance }),
      ...(updates.initialBalanceDate !== undefined && { initial_balance_date: updates.initialBalanceDate }),
    })
    .eq("id", id)
    .eq("space_id", space.id)
    .select("id")
    .maybeSingle();
  if (error) {
    if (isUniqueViolation(error)) return { error: "Já existe uma conta com esse nome neste espaço." };
    return { error: error.message };
  }
  if (!data) return { error: "Conta não encontrada." };
  revalidateFinancialViews(scope);
  return {
    success:
      updates.isActive === undefined ? "Conta atualizada." : updates.isActive ? "Conta ativada." : "Conta desativada.",
  };
}

export async function deleteFinancialAccountAction(scope: FinancialScope, id: string): Promise<ActionState> {
  const { space } = await requireScopedModulePermission(scope, "financeiro", "delete");
  const supabase = await createSupabaseServerClient();

  // Checagem explícita antes do DELETE (a FK de financial_payments.account_id
  // também bloqueia, mas assim a mensagem é clara mesmo sem depender do código de erro).
  const { count, error: countError } = await supabase
    .from("financial_payments")
    .select("id", { count: "exact", head: true })
    .eq("account_id", id)
    .eq("space_id", space.id);
  if (countError) return { error: countError.message };
  if ((count ?? 0) > 0) {
    return { error: `Esta conta tem ${count} movimentação(ões) registrada(s) — desative em vez de excluir.` };
  }

  const { error } = await supabase.from("financial_accounts").delete().eq("id", id).eq("space_id", space.id);
  if (error) {
    if (isForeignKeyRestrictError(error)) return { error: "Esta conta já tem pagamentos registrados — desative em vez de excluir." };
    return { error: error.message };
  }
  revalidateFinancialViews(scope);
  return { success: "Conta excluída." };
}

export async function createFinancialCategoryAction(scope: FinancialScope, kind: FinancialKind, name: string): Promise<ActionState> {
  const { profile, space } = await requireScopedModulePermission(scope, "financeiro", "create");
  if (!name.trim()) return { error: "Dê um nome para a categoria." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("financial_categories").insert({ space_id: space.id, kind, name: name.trim(), created_by: profile.id });
  if (error) {
    if (isUniqueViolation(error)) return { error: "Já existe uma categoria com esse nome." };
    return { error: error.message };
  }
  revalidateFinancialViews(scope);
  return { success: "Categoria criada." };
}

export async function updateFinancialCategoryAction(scope: FinancialScope, id: string, name: string, isActive: boolean): Promise<ActionState> {
  const { space } = await requireScopedModulePermission(scope, "financeiro", "edit");
  if (!name.trim()) return { error: "Dê um nome para a categoria." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("financial_categories").update({ name: name.trim(), is_active: isActive }).eq("id", id).eq("space_id", space.id);
  if (error) return { error: error.message };
  revalidateFinancialViews(scope);
  return { success: "Categoria atualizada." };
}

export async function deleteFinancialCategoryAction(scope: FinancialScope, id: string): Promise<ActionState> {
  const { space } = await requireScopedModulePermission(scope, "financeiro", "delete");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("financial_categories").delete().eq("id", id).eq("space_id", space.id);
  if (error) {
    if (isForeignKeyRestrictError(error)) return { error: "Esta categoria já está em uso — desative em vez de excluir." };
    return { error: error.message };
  }
  revalidateFinancialViews(scope);
  return { success: "Categoria excluída." };
}

export async function createFinancialReferenceTypeAction(scope: FinancialScope, name: string): Promise<ActionState> {
  const { profile, space } = await requireScopedModulePermission(scope, "financeiro", "create");
  if (!name.trim()) return { error: "Dê um nome." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("financial_reference_types").insert({ space_id: space.id, name: name.trim(), created_by: profile.id });
  if (error) {
    if (isUniqueViolation(error)) return { error: "Já existe um item com esse nome." };
    return { error: error.message };
  }
  revalidateFinancialViews(scope);
  return { success: '"Referente a" criado.' };
}

export async function updateFinancialReferenceTypeAction(scope: FinancialScope, id: string, name: string, isActive: boolean): Promise<ActionState> {
  const { space } = await requireScopedModulePermission(scope, "financeiro", "edit");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("financial_reference_types").update({ name: name.trim(), is_active: isActive }).eq("id", id).eq("space_id", space.id);
  if (error) return { error: error.message };
  revalidateFinancialViews(scope);
  return { success: "Atualizado." };
}

export async function deleteFinancialReferenceTypeAction(scope: FinancialScope, id: string): Promise<ActionState> {
  const { space } = await requireScopedModulePermission(scope, "financeiro", "delete");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("financial_reference_types").delete().eq("id", id).eq("space_id", space.id);
  if (error) {
    if (isForeignKeyRestrictError(error)) return { error: 'Este "referente a" já está em uso — desative em vez de excluir.' };
    return { error: error.message };
  }
  revalidateFinancialViews(scope);
  return { success: "Excluído." };
}

// -----------------------------------------------------------------------------
// Nova movimentação / conta a pagar / conta a receber — entrada ou saída,
// único/parcelado/recorrente. Pendente não exige conta; já liquidado exige.
// -----------------------------------------------------------------------------

export type MovementFormInput = {
  kind: FinancialKind;
  description: string;
  clientId?: string;
  clientServiceId?: string;
  referenceTypeId?: string;
  categoryId?: string;
  supplierName?: string;

  originalAmount: number;
  discountAmount?: number;
  additionAmount?: number;

  dueDate: string;
  competencyDate?: string;

  tipo: FinancialOriginType;
  installmentCount?: number;

  recurrenceFrequency?: FinancialRecurrenceFrequency;
  recurrenceInterval?: number;
  recurrenceEndType?: FinancialRecurrenceEndType;
  recurrenceEndDate?: string;
  recurrenceEndOccurrences?: number;

  /** true = já recebido/pago (cria o pagamento junto); false = pendente (A receber / A pagar). */
  settled: boolean;
  paymentMethod?: FinancialPaymentMethod;
  accountId?: string;
  /** Data real do pagamento quando `settled` (padrão: a própria data da movimentação). */
  paymentDate?: string;

  notes?: string;
};

async function assertBelongsToSpace(
  supabase: Supa,
  table: "clients" | "client_services" | "financial_categories" | "financial_reference_types",
  id: string | undefined,
  spaceId: string,
  label: string
): Promise<string | null> {
  if (!id) return null;
  const { data, error } = await supabase.from(table).select("id").eq("id", id).eq("space_id", spaceId).maybeSingle();
  if (error) return error.message;
  if (!data) return `${label} selecionado não pertence a este espaço.`;
  return null;
}

export async function createMovementAction(scope: FinancialScope, input: MovementFormInput): Promise<ActionState> {
  const { profile, space } = await requireScopedModulePermission(scope, "financeiro", "create");

  if (!input.description?.trim()) return { error: "Descrição é obrigatória." };
  if (!Number.isFinite(input.originalAmount) || input.originalAmount <= 0) return { error: "Informe um valor válido." };
  if ((input.discountAmount ?? 0) < 0 || (input.additionAmount ?? 0) < 0) return { error: "Desconto/acréscimo não podem ser negativos." };
  if (input.originalAmount - (input.discountAmount ?? 0) + (input.additionAmount ?? 0) <= 0) {
    return { error: "O valor final precisa ser maior que zero." };
  }
  if (!input.dueDate || !DATE_RE.test(input.dueDate)) return { error: "Escolha a data/vencimento." };
  if (input.tipo === "parcelado" && (!input.installmentCount || input.installmentCount < 2 || input.installmentCount > 120)) {
    return { error: "Parcelamento precisa ter de 2 a 120 parcelas." };
  }
  if (input.tipo === "recorrente" && !input.recurrenceFrequency) return { error: "Escolha a frequência da recorrência." };
  const settled = input.tipo === "parcelado" ? false : input.settled;
  if (settled && (!input.paymentMethod || !PAYMENT_METHODS.includes(input.paymentMethod))) {
    return { error: "Informe a forma de pagamento." };
  }

  const supabase = await createSupabaseServerClient();

  for (const [table, id, label] of [
    ["clients", input.clientId, "Cliente"],
    ["client_services", input.clientServiceId, "Serviço contratado"],
    ["financial_categories", input.categoryId, "Categoria"],
    ["financial_reference_types", input.referenceTypeId, "Referente a"],
  ] as const) {
    const err = await assertBelongsToSpace(supabase, table, id, space.id, label);
    if (err) return { error: err };
  }

  if (settled) {
    const accountError = await assertUsableAccount(supabase, input.accountId, space.id);
    if (accountError) return { error: accountError };
  }

  const created = await createOriginWithCharges(supabase, space.id, profile.id, {
    kind: input.kind,
    tipo: input.tipo,
    description: input.description,
    clientId: input.clientId,
    clientServiceId: input.clientServiceId,
    referenceTypeId: input.referenceTypeId,
    categoryId: input.categoryId,
    supplierName: input.supplierName,
    amount: input.originalAmount,
    discountAmount: input.discountAmount,
    additionAmount: input.additionAmount,
    firstDueDate: input.dueDate,
    competencyDate: input.competencyDate || null,
    installmentCount: input.installmentCount,
    recurrenceFrequency: input.recurrenceFrequency,
    recurrenceInterval: input.recurrenceInterval,
    recurrenceEndType: input.recurrenceEndType,
    recurrenceEndDate: input.recurrenceEndDate,
    recurrenceEndOccurrences: input.recurrenceEndOccurrences,
    notes: input.notes,
  });
  if (created.error || !created.charges) return { error: created.error ?? "Não foi possível criar a movimentação." };

  if (settled) {
    // Único (ou 1ª competência de recorrente) já liquidado na criação.
    const first = created.charges[0];
    const { error: paymentError } = await supabase.from("financial_payments").insert({
      space_id: space.id,
      charge_id: first.id,
      amount: Number(first.amount),
      payment_date: input.paymentDate && DATE_RE.test(input.paymentDate) ? input.paymentDate : input.dueDate,
      payment_method: input.paymentMethod!,
      account_id: input.accountId!,
      created_by: profile.id,
    });
    if (paymentError) {
      revalidateFinancialViews(scope);
      return { error: `Movimentação criada como pendente, mas o pagamento falhou: ${paymentError.message}` };
    }
  }

  revalidateFinancialViews(scope);
  const label = input.kind === "entrada" ? "a receber" : "a pagar";
  return { success: settled ? "Movimentação registrada." : `Lançado em ${label}.`, id: created.originId };
}

// -----------------------------------------------------------------------------
// Pagamentos — "Marcar como recebido/pago" (suporta valor diferente do
// cobrado e pagamento parcial), desfazer.
// -----------------------------------------------------------------------------

export type RegisterPaymentInput = {
  amount: number;
  paymentDate: string;
  paymentMethod: FinancialPaymentMethod;
  accountId: string;
  notes?: string;
  /**
   * true = este pagamento QUITA a cobrança mesmo com valor diferente do
   * restante: a diferença vira desconto (recebeu menos) ou acréscimo
   * (recebeu mais/juros) na própria cobrança — o valor cobrado original
   * continua registrado em `original_amount`. false = pagamento parcial
   * (a cobrança continua em aberto pelo restante).
   */
  settle: boolean;
};

export async function registerPaymentAction(scope: FinancialScope, chargeId: string, input: RegisterPaymentInput): Promise<ActionState> {
  const { profile, space } = await requireScopedModulePermission(scope, "financeiro", "edit");
  if (!Number.isFinite(input.amount) || input.amount <= 0) return { error: "Informe um valor válido." };
  if (!input.paymentDate || !DATE_RE.test(input.paymentDate)) return { error: "Informe a data real do pagamento." };
  if (!PAYMENT_METHODS.includes(input.paymentMethod)) return { error: "Forma de pagamento inválida." };

  const supabase = await createSupabaseServerClient();

  const { data: charge, error: chargeError } = await supabase
    .from("financial_charges")
    .select("id, kind, status, original_amount, discount_amount, addition_amount, amount")
    .eq("id", chargeId)
    .eq("space_id", space.id)
    .maybeSingle();
  if (chargeError) return { error: chargeError.message };
  if (!charge) return { error: "Cobrança não encontrada." };
  if (charge.status === "cancelado") return { error: "Esta cobrança foi cancelada." };

  const accountError = await assertUsableAccount(supabase, input.accountId, space.id);
  if (accountError) return { error: accountError };

  const { data: existingPayments, error: paymentsError } = await supabase
    .from("financial_payments")
    .select("amount")
    .eq("charge_id", chargeId);
  if (paymentsError) return { error: paymentsError.message };

  const cents = (v: number) => Math.round(v * 100) / 100;
  const paid = cents((existingPayments ?? []).reduce((s, p) => s + Number(p.amount), 0));
  const remaining = cents(Number(charge.amount) - paid);
  if (remaining <= 0) return { error: "Esta cobrança já está quitada." };

  const amount = cents(input.amount);
  if (!input.settle && amount > remaining) {
    return { error: `Valor maior que o restante (${remaining.toFixed(2).replace(".", ",")}). Marque "quitar" para registrar a diferença como acréscimo.` };
  }

  if (input.settle && amount !== remaining) {
    const diff = cents(amount - remaining);
    const patch =
      diff < 0
        ? { discount_amount: cents(Number(charge.discount_amount) + -diff) }
        : { addition_amount: cents(Number(charge.addition_amount) + diff) };
    if (diff < 0 && cents(Number(charge.discount_amount) - diff) > Number(charge.original_amount) + Number(charge.addition_amount)) {
      return { error: "Desconto maior que o valor da cobrança." };
    }
    const { error: adjustError } = await supabase
      .from("financial_charges")
      .update({ ...patch, updated_by: profile.id })
      .eq("id", chargeId)
      .eq("space_id", space.id);
    if (adjustError) return { error: adjustError.message };
  }

  const { error } = await supabase.from("financial_payments").insert({
    space_id: space.id,
    charge_id: chargeId,
    amount,
    payment_date: input.paymentDate,
    payment_method: input.paymentMethod,
    account_id: input.accountId,
    notes: input.notes?.trim() || null,
    created_by: profile.id,
  });
  if (error) return { error: error.message };

  revalidateFinancialViews(scope);
  const verb = charge.kind === "entrada" ? "Recebimento" : "Pagamento";
  const partial = !input.settle && amount < remaining;
  return { success: partial ? `${verb} parcial registrado.` : `${verb} registrado.` };
}

export async function deletePaymentAction(scope: FinancialScope, paymentId: string): Promise<ActionState> {
  const { space } = await requireScopedModulePermission(scope, "financeiro", "edit");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("financial_payments")
    .delete()
    .eq("id", paymentId)
    .eq("space_id", space.id)
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Pagamento não encontrado." };
  revalidateFinancialViews(scope);
  return { success: "Pagamento desfeito — a cobrança voltou a ficar em aberto." };
}

export async function cancelChargeAction(scope: FinancialScope, chargeId: string): Promise<ActionState> {
  const { space } = await requireScopedModulePermission(scope, "financeiro", "delete");
  const supabase = await createSupabaseServerClient();
  const { data: payments } = await supabase.from("financial_payments").select("id").eq("charge_id", chargeId).limit(1);
  if ((payments?.length ?? 0) > 0) return { error: "Esta cobrança já tem pagamento — desfaça o pagamento antes de cancelar." };
  const { error } = await supabase
    .from("financial_charges")
    .update({ status: "cancelado" as FinancialChargeStatus })
    .eq("id", chargeId)
    .eq("space_id", space.id);
  if (error) return { error: error.message };
  revalidateFinancialViews(scope);
  return { success: "Cobrança cancelada." };
}

/**
 * Encerra uma recorrência (ex.: cancelou a assinatura): para de gerar
 * novas competências e cancela as futuras ainda não pagas. Competências já
 * pagas/atrasadas continuam como estão (histórico e dívidas reais).
 */
export async function stopRecurrenceAction(scope: FinancialScope, originId: string): Promise<ActionState> {
  const { space } = await requireScopedModulePermission(scope, "financeiro", "edit");
  const supabase = await createSupabaseServerClient();

  const { data: origin, error } = await supabase
    .from("financial_origins")
    .select("id, client_service_id, origin_type")
    .eq("id", originId)
    .eq("space_id", space.id)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!origin || origin.origin_type !== "recorrente") return { error: "Recorrência não encontrada." };
  if (origin.client_service_id) {
    // Contrato e financeiro precisam continuar coerentes: o controle é pelo serviço do cliente.
    return { error: "Esta recorrência vem de um serviço contratado — pause ou encerre o serviço na ficha do cliente." };
  }

  const { error: stopError } = await supabase
    .from("financial_origins")
    .update({ is_active: false })
    .eq("id", originId)
    .eq("space_id", space.id);
  if (stopError) return { error: stopError.message };

  const today = todayKeySaoPaulo();
  const siblings = await listFinancialChargesByOrigin(originId);
  const futureIds = siblings.filter((c) => c.status === "ativo" && c.due_date > today).map((c) => c.id);
  if (futureIds.length > 0) {
    const { data: paid } = await supabase.from("financial_payments").select("charge_id").in("charge_id", futureIds);
    const paidIds = new Set((paid ?? []).map((p) => p.charge_id));
    const toCancel = futureIds.filter((id) => !paidIds.has(id));
    if (toCancel.length > 0) {
      await supabase.from("financial_charges").update({ status: "cancelado" }).in("id", toCancel).eq("space_id", space.id);
    }
  }

  revalidateFinancialViews(scope);
  return { success: "Recorrência encerrada. Nenhuma nova competência será gerada." };
}

// -----------------------------------------------------------------------------
// Edição — "somente este" ou "este e os próximos". Nunca toca em valor/data
// de cobrança que já tem pagamento registrado.
// -----------------------------------------------------------------------------

export async function updateChargeAction(
  scope: FinancialScope,
  chargeId: string,
  updates: {
    description?: string;
    categoryId?: string | null;
    referenceTypeId?: string | null;
    originalAmount?: number;
    discountAmount?: number;
    additionAmount?: number;
    dueDate?: string;
    competencyDate?: string | null;
    notes?: string;
  },
  applyToFuture: boolean
): Promise<ActionState> {
  const { profile, space } = await requireScopedModulePermission(scope, "financeiro", "edit");
  const supabase = await createSupabaseServerClient();

  const { data: charge, error: chargeError } = await supabase
    .from("financial_charges")
    .select("*")
    .eq("id", chargeId)
    .eq("space_id", space.id)
    .maybeSingle();
  if (chargeError) return { error: chargeError.message };
  if (!charge) return { error: "Cobrança não encontrada." };

  for (const [table, id, label] of [
    ["financial_categories", updates.categoryId ?? undefined, "Categoria"],
    ["financial_reference_types", updates.referenceTypeId ?? undefined, "Referente a"],
  ] as const) {
    const err = await assertBelongsToSpace(supabase, table, id, space.id, label);
    if (err) return { error: err };
  }

  const { data: payments } = await supabase.from("financial_payments").select("id").eq("charge_id", chargeId).limit(1);
  const hasPayment = (payments?.length ?? 0) > 0;

  const touchesAmountOrDate =
    updates.originalAmount !== undefined ||
    updates.discountAmount !== undefined ||
    updates.additionAmount !== undefined ||
    updates.dueDate !== undefined;

  if (hasPayment && touchesAmountOrDate) {
    return { error: "Esta cobrança já tem pagamento registrado — não é possível alterar valor/data. Só observações podem ser editadas." };
  }

  const patch = {
    ...(updates.description !== undefined && { description: updates.description.trim() }),
    ...(updates.categoryId !== undefined && { category_id: updates.categoryId }),
    ...(updates.referenceTypeId !== undefined && { reference_type_id: updates.referenceTypeId }),
    ...(updates.originalAmount !== undefined && { original_amount: updates.originalAmount }),
    ...(updates.discountAmount !== undefined && { discount_amount: updates.discountAmount }),
    ...(updates.additionAmount !== undefined && { addition_amount: updates.additionAmount }),
    ...(updates.dueDate !== undefined && { due_date: updates.dueDate }),
    ...(updates.competencyDate !== undefined && { competency_date: updates.competencyDate }),
    ...(updates.notes !== undefined && { notes: updates.notes.trim() || null }),
    updated_by: profile.id,
  };

  const { error } = await supabase.from("financial_charges").update(patch).eq("id", chargeId).eq("space_id", space.id);
  if (error) {
    if (isUniqueViolation(error)) return { error: "Já existe uma cobrança desta série nesse vencimento." };
    return { error: error.message };
  }

  if (applyToFuture) {
    const siblings = await listFinancialChargesByOrigin(charge.origin_id);
    const candidateIds = siblings
      .filter((s) => s.id !== chargeId && s.due_date >= charge.due_date && s.status === "ativo")
      .map((s) => s.id);
    if (candidateIds.length > 0) {
      const { data: paidRows } = await supabase.from("financial_payments").select("charge_id").in("charge_id", candidateIds);
      const paidIds = new Set((paidRows ?? []).map((p) => p.charge_id));
      const futureSiblingIds = candidateIds.filter((id) => !paidIds.has(id));
      const siblingPatch = {
        ...(updates.description !== undefined && { description: updates.description.trim() }),
        ...(updates.categoryId !== undefined && { category_id: updates.categoryId }),
        ...(updates.referenceTypeId !== undefined && { reference_type_id: updates.referenceTypeId }),
        ...(updates.originalAmount !== undefined && { original_amount: updates.originalAmount }),
        ...(updates.discountAmount !== undefined && { discount_amount: updates.discountAmount }),
        ...(updates.additionAmount !== undefined && { addition_amount: updates.additionAmount }),
        updated_by: profile.id,
      };
      if (futureSiblingIds.length > 0 && Object.keys(siblingPatch).length > 1) {
        await supabase.from("financial_charges").update(siblingPatch).in("id", futureSiblingIds).eq("space_id", space.id);
      }
    }
  }

  revalidateFinancialViews(scope);
  return { success: "Cobrança atualizada." };
}
