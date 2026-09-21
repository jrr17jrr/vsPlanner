"use server";

import { revalidatePath } from "next/cache";
import { requireScopedModulePermission } from "@/lib/supabase/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  listFinancialCategories,
  listFinancialReferenceTypes,
  listFinancialOrigins,
  listFinancialChargesByOrigin,
} from "@/lib/supabase/repositories/financial.repository";
import type { FinancialScope } from "@/lib/space-slugs";
import { toDateKey } from "@/lib/format";
import type {
  FinancialChargeStatus,
  FinancialKind,
  FinancialOriginType,
  FinancialPaymentMethod,
  FinancialRecurrenceEndType,
  FinancialRecurrenceFrequency,
} from "@/types/database.types";

type ActionState = { error?: string; success?: string; id?: string };
type Supa = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/**
 * Financeiro é a mesma arquitetura (migration 007) nos três espaços —
 * `scope` decide qual space é resolvido (`requireScopedModulePermission`)
 * e qual rota é revalidada depois de escrever. Nunca hardcoda Visionário
 * Dev: é assim que Financeiro Pessoal e do TikTok reaproveitam o mesmo
 * código sem duplicar uma linha de lógica.
 */
function financialRoutePath(scope: FinancialScope): string {
  if (scope === "pessoal") return "/financeiro";
  if (scope === "tiktok") return "/tiktok/financeiro";
  return "/visionario/financeiro";
}

const DEFAULT_EXPENSE_CATEGORIES = [
  "Hospedagem",
  "Domínios",
  "Ferramentas",
  "Marketing",
  "Equipamentos",
  "Impostos",
  "Comissões",
  "Outros",
];
const DEFAULT_INCOME_CATEGORIES = ["Serviços prestados", "Outros"];
const DEFAULT_REFERENCE_TYPES = [
  "Criação / Implantação",
  "Mensalidade",
  "Manutenção",
  "Renovação",
  "Parcela",
  "Adicional / Extra",
  "Outro",
];

/**
 * Semeia categorias/"referente a" padrão na primeira vez que o Financeiro
 * é aberto num space — idempotente (só insere o que ainda não existe),
 * mesmo espírito do bootstrap automático do Visionário Dev. Você continua
 * podendo editar/desativar/criar outras depois; isto nunca roda de novo se
 * já existir pelo menos uma linha.
 */
export async function ensureFinancialDefaults(scope: FinancialScope): Promise<void> {
  const { profile, space } = await requireScopedModulePermission(scope, "financeiro", "view");
  const supabase = await createSupabaseServerClient();

  const [categories, referenceTypes] = await Promise.all([
    listFinancialCategories(space.id),
    listFinancialReferenceTypes(space.id),
  ]);

  if (categories.length === 0) {
    await supabase.from("financial_categories").insert([
      ...DEFAULT_EXPENSE_CATEGORIES.map((name) => ({
        space_id: space.id,
        kind: "saida" as const,
        name,
        created_by: profile.id,
      })),
      ...DEFAULT_INCOME_CATEGORIES.map((name) => ({
        space_id: space.id,
        kind: "entrada" as const,
        name,
        created_by: profile.id,
      })),
    ]);
  }

  if (referenceTypes.length === 0) {
    await supabase
      .from("financial_reference_types")
      .insert(DEFAULT_REFERENCE_TYPES.map((name) => ({ space_id: space.id, name, created_by: profile.id })));
  }
}

// -----------------------------------------------------------------------------
// Contas / Categorias / Referente a — CRUD simples, mesmo padrão de
// Serviços (FK-restrict tratado com mensagem amigável: desative em vez de
// excluir quando já está em uso).
// -----------------------------------------------------------------------------

function isForeignKeyRestrictError(error: { code?: string } | null): boolean {
  return error?.code === "23503";
}

export async function createFinancialAccountAction(scope: FinancialScope, name: string, initialBalance: number, initialBalanceDate: string): Promise<ActionState> {
  const { profile, space } = await requireScopedModulePermission(scope, "financeiro", "create");
  if (!name.trim()) return { error: "Dê um nome para a conta." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("financial_accounts")
    .insert({ space_id: space.id, name: name.trim(), initial_balance: initialBalance, initial_balance_date: initialBalanceDate, created_by: profile.id })
    .select("id")
    .single();
  if (error) return { error: error.message };
  revalidatePath(financialRoutePath(scope));
  return { success: "Conta criada.", id: data.id };
}

export async function updateFinancialAccountAction(scope: FinancialScope, id: string, name: string, isActive: boolean): Promise<ActionState> {
  const { space } = await requireScopedModulePermission(scope, "financeiro", "edit");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("financial_accounts")
    .update({ name: name.trim(), is_active: isActive })
    .eq("id", id)
    .eq("space_id", space.id);
  if (error) return { error: error.message };
  revalidatePath(financialRoutePath(scope));
  return { success: "Conta atualizada." };
}

export async function deleteFinancialAccountAction(scope: FinancialScope, id: string): Promise<ActionState> {
  const { space } = await requireScopedModulePermission(scope, "financeiro", "delete");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("financial_accounts").delete().eq("id", id).eq("space_id", space.id);
  if (error) {
    if (isForeignKeyRestrictError(error)) return { error: "Esta conta já tem pagamentos registrados — desative em vez de excluir." };
    return { error: error.message };
  }
  revalidatePath(financialRoutePath(scope));
  return { success: "Conta excluída." };
}

export async function createFinancialCategoryAction(scope: FinancialScope, kind: FinancialKind, name: string): Promise<ActionState> {
  const { profile, space } = await requireScopedModulePermission(scope, "financeiro", "create");
  if (!name.trim()) return { error: "Dê um nome para a categoria." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("financial_categories").insert({ space_id: space.id, kind, name: name.trim(), created_by: profile.id });
  if (error) return { error: error.message };
  revalidatePath(financialRoutePath(scope));
  return { success: "Categoria criada." };
}

export async function updateFinancialCategoryAction(scope: FinancialScope, id: string, name: string, isActive: boolean): Promise<ActionState> {
  const { space } = await requireScopedModulePermission(scope, "financeiro", "edit");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("financial_categories").update({ name: name.trim(), is_active: isActive }).eq("id", id).eq("space_id", space.id);
  if (error) return { error: error.message };
  revalidatePath(financialRoutePath(scope));
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
  revalidatePath(financialRoutePath(scope));
  return { success: "Categoria excluída." };
}

export async function createFinancialReferenceTypeAction(scope: FinancialScope, name: string): Promise<ActionState> {
  const { profile, space } = await requireScopedModulePermission(scope, "financeiro", "create");
  if (!name.trim()) return { error: "Dê um nome." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("financial_reference_types").insert({ space_id: space.id, name: name.trim(), created_by: profile.id });
  if (error) return { error: error.message };
  revalidatePath(financialRoutePath(scope));
  return { success: '"Referente a" criado.' };
}

export async function updateFinancialReferenceTypeAction(scope: FinancialScope, id: string, name: string, isActive: boolean): Promise<ActionState> {
  const { space } = await requireScopedModulePermission(scope, "financeiro", "edit");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("financial_reference_types").update({ name: name.trim(), is_active: isActive }).eq("id", id).eq("space_id", space.id);
  if (error) return { error: error.message };
  revalidatePath(financialRoutePath(scope));
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
  revalidatePath(financialRoutePath(scope));
  return { success: "Excluído." };
}

// -----------------------------------------------------------------------------
// Nova movimentação — entrada ou saída, único/parcelado/recorrente.
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

  /** true = já recebido/pago (cria o pagamento junto); false = pendente (conta a receber/pagar). */
  settled: boolean;
  paymentMethod?: FinancialPaymentMethod;
  accountId?: string;

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

function addPeriod(dateStr: string, frequency: FinancialRecurrenceFrequency, interval: number | null): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  switch (frequency) {
    case "semanal":
      date.setDate(date.getDate() + 7);
      break;
    case "trimestral":
      date.setMonth(date.getMonth() + 3);
      break;
    case "semestral":
      date.setMonth(date.getMonth() + 6);
      break;
    case "anual":
      date.setFullYear(date.getFullYear() + 1);
      break;
    case "a_cada_x_meses":
    case "customizado":
      date.setMonth(date.getMonth() + Math.max(1, interval ?? 1));
      break;
    case "mensal":
    default:
      date.setMonth(date.getMonth() + 1);
      break;
  }
  return toDateKey(date);
}

export async function createMovementAction(scope: FinancialScope, input: MovementFormInput): Promise<ActionState> {
  const { profile, space } = await requireScopedModulePermission(scope, "financeiro", "create");

  if (!input.description.trim()) return { error: "Descrição é obrigatória." };
  if (!input.originalAmount || input.originalAmount <= 0) return { error: "Informe um valor válido." };
  if (!input.dueDate) return { error: "Escolha a data da movimentação." };
  if (input.settled && (!input.paymentMethod || !input.accountId)) {
    return { error: "Informe forma de pagamento e conta para uma movimentação já recebida/paga." };
  }
  if (input.tipo === "parcelado" && (!input.installmentCount || input.installmentCount < 2)) {
    return { error: "Parcelamento precisa de pelo menos 2 parcelas." };
  }
  if (input.tipo === "recorrente" && !input.recurrenceFrequency) {
    return { error: "Escolha a frequência da recorrência." };
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

  const discount = input.discountAmount ?? 0;
  const addition = input.additionAmount ?? 0;

  const { data: origin, error: originError } = await supabase
    .from("financial_origins")
    .insert({
      space_id: space.id,
      kind: input.kind,
      origin_type: input.tipo,
      description: input.description.trim(),
      client_id: input.clientId || null,
      client_service_id: input.clientServiceId || null,
      reference_type_id: input.referenceTypeId || null,
      category_id: input.categoryId || null,
      supplier_name: input.kind === "saida" ? input.supplierName?.trim() || null : null,
      installment_count: input.tipo === "parcelado" ? input.installmentCount : null,
      recurrence_frequency: input.tipo === "recorrente" ? input.recurrenceFrequency : null,
      recurrence_interval: input.tipo === "recorrente" ? input.recurrenceInterval ?? null : null,
      recurrence_end_type: input.tipo === "recorrente" ? input.recurrenceEndType ?? "nunca" : null,
      recurrence_end_date: input.tipo === "recorrente" ? input.recurrenceEndDate || null : null,
      recurrence_end_occurrences: input.tipo === "recorrente" ? input.recurrenceEndOccurrences ?? null : null,
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (originError) return { error: originError.message };

  type ChargeInsert = {
    space_id: string;
    origin_id: string;
    kind: FinancialKind;
    description: string;
    client_id: string | null;
    client_service_id: string | null;
    reference_type_id: string | null;
    category_id: string | null;
    supplier_name: string | null;
    installment_number: number | null;
    installment_total: number | null;
    original_amount: number;
    discount_amount: number;
    addition_amount: number;
    due_date: string;
    competency_date: string | null;
    notes: string | null;
    created_by: string;
  };

  const baseCharge: Omit<ChargeInsert, "due_date" | "installment_number" | "installment_total" | "original_amount" | "discount_amount" | "addition_amount" | "competency_date"> = {
    space_id: space.id,
    origin_id: origin.id,
    kind: input.kind,
    description: input.description.trim(),
    client_id: input.clientId || null,
    client_service_id: input.clientServiceId || null,
    reference_type_id: input.referenceTypeId || null,
    category_id: input.categoryId || null,
    supplier_name: input.kind === "saida" ? input.supplierName?.trim() || null : null,
    notes: input.notes?.trim() || null,
    created_by: profile.id,
  };

  const chargesToInsert: ChargeInsert[] = [];

  if (input.tipo === "parcelado") {
    const count = input.installmentCount!;
    const finalTotal = input.originalAmount - discount + addition;
    const perInstallment = Math.round((finalTotal / count) * 100) / 100;
    let allocated = 0;
    let dueDate = input.dueDate;
    for (let i = 1; i <= count; i++) {
      const isLast = i === count;
      const amount = isLast ? Math.round((finalTotal - allocated) * 100) / 100 : perInstallment;
      allocated += amount;
      chargesToInsert.push({
        ...baseCharge,
        description: `${input.description.trim()} (${i}/${count})`,
        installment_number: i,
        installment_total: count,
        original_amount: amount,
        discount_amount: 0,
        addition_amount: 0,
        due_date: dueDate,
        competency_date: input.competencyDate || null,
      });
      dueDate = addPeriod(dueDate, "mensal", null);
    }
  } else {
    // único ou primeira ocorrência de recorrente — as próximas ocorrências
    // são geradas sob demanda por `ensureRecurringChargesGenerated`.
    chargesToInsert.push({
      ...baseCharge,
      installment_number: null,
      installment_total: null,
      original_amount: input.originalAmount,
      discount_amount: discount,
      addition_amount: addition,
      due_date: input.dueDate,
      competency_date: input.competencyDate || null,
    });
  }

  const { data: insertedCharges, error: chargesError } = await supabase
    .from("financial_charges")
    .insert(chargesToInsert)
    .select("id, amount, due_date");

  if (chargesError) {
    await supabase.from("financial_origins").delete().eq("id", origin.id);
    return { error: chargesError.message };
  }

  if (input.settled) {
    // Movimentação já liquidada na criação: só faz sentido pra único (ou a
    // primeira parcela) — registra o pagamento cheio na data informada.
    const first = insertedCharges[0];
    const { error: paymentError } = await supabase.from("financial_payments").insert({
      space_id: space.id,
      charge_id: first.id,
      amount: first.amount,
      payment_date: input.dueDate,
      payment_method: input.paymentMethod!,
      account_id: input.accountId!,
      created_by: profile.id,
    });
    if (paymentError) return { error: paymentError.message };
  }

  revalidatePath(financialRoutePath(scope));
  return { success: "Movimentação criada.", id: origin.id };
}

// -----------------------------------------------------------------------------
// Geração lazy de cobranças recorrentes — idempotente por construção
// (nunca gera antes do último due_date já existente daquela origem), sem
// precisar de cron job. Chamada no carregamento da página do Financeiro.
// -----------------------------------------------------------------------------

export async function ensureRecurringChargesGenerated(scope: FinancialScope, horizonDays = 60): Promise<void> {
  const { profile, space } = await requireScopedModulePermission(scope, "financeiro", "view");
  const supabase = await createSupabaseServerClient();

  const origins = await listFinancialOrigins(space.id);
  const recurringActive = origins.filter((o) => o.origin_type === "recorrente" && o.is_active && o.recurrence_frequency);

  const horizon = new Date();
  horizon.setDate(horizon.getDate() + horizonDays);
  const horizonKey = toDateKey(horizon);

  for (const origin of recurringActive) {
    const existing = await listFinancialChargesByOrigin(origin.id);
    if (existing.length === 0) continue;

    let last = existing[existing.length - 1];
    let occurrenceCount = existing.length;

    for (let guard = 0; guard < 120; guard++) {
      const nextDue = addPeriod(last.due_date, origin.recurrence_frequency!, origin.recurrence_interval);
      if (nextDue > horizonKey) break;
      if (origin.recurrence_end_type === "em_data" && origin.recurrence_end_date && nextDue > origin.recurrence_end_date) break;
      if (
        origin.recurrence_end_type === "apos_ocorrencias" &&
        origin.recurrence_end_occurrences &&
        occurrenceCount >= origin.recurrence_end_occurrences
      )
        break;

      const nextCompetency = last.competency_date
        ? `${nextDue.slice(0, 7)}-01`
        : null;

      const { data: inserted, error } = await supabase
        .from("financial_charges")
        .insert({
          space_id: space.id,
          origin_id: origin.id,
          kind: origin.kind,
          description: origin.description,
          client_id: last.client_id,
          client_service_id: last.client_service_id,
          reference_type_id: last.reference_type_id,
          category_id: last.category_id,
          supplier_name: last.supplier_name,
          original_amount: last.original_amount,
          discount_amount: last.discount_amount,
          addition_amount: last.addition_amount,
          due_date: nextDue,
          competency_date: nextCompetency,
          created_by: profile.id,
        })
        .select("*")
        .single();

      if (error || !inserted) break;
      last = inserted;
      occurrenceCount += 1;
    }
  }
}

// -----------------------------------------------------------------------------
// Pagamentos — registrar recebimento/pagamento (suporta parcial), desfazer.
// -----------------------------------------------------------------------------

export async function registerPaymentAction(
  scope: FinancialScope,
  chargeId: string,
  input: { amount: number; paymentDate: string; paymentMethod: FinancialPaymentMethod; accountId: string; notes?: string }
): Promise<ActionState> {
  const { profile, space } = await requireScopedModulePermission(scope, "financeiro", "edit");
  if (!input.amount || input.amount <= 0) return { error: "Informe um valor válido." };
  if (!input.paymentDate) return { error: "Informe a data do pagamento." };

  const supabase = await createSupabaseServerClient();

  const { data: charge, error: chargeError } = await supabase
    .from("financial_charges")
    .select("id, space_id, status")
    .eq("id", chargeId)
    .eq("space_id", space.id)
    .maybeSingle();
  if (chargeError) return { error: chargeError.message };
  if (!charge) return { error: "Cobrança não encontrada." };
  if (charge.status === "cancelado") return { error: "Esta cobrança foi cancelada." };

  const { error } = await supabase.from("financial_payments").insert({
    space_id: space.id,
    charge_id: chargeId,
    amount: input.amount,
    payment_date: input.paymentDate,
    payment_method: input.paymentMethod,
    account_id: input.accountId,
    notes: input.notes?.trim() || null,
    created_by: profile.id,
  });
  if (error) return { error: error.message };

  revalidatePath(financialRoutePath(scope));
  return { success: "Pagamento registrado." };
}

export async function deletePaymentAction(scope: FinancialScope, paymentId: string): Promise<ActionState> {
  const { space } = await requireScopedModulePermission(scope, "financeiro", "edit");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("financial_payments").delete().eq("id", paymentId).eq("space_id", space.id);
  if (error) return { error: error.message };
  revalidatePath(financialRoutePath(scope));
  return { success: "Pagamento removido." };
}

export async function cancelChargeAction(scope: FinancialScope, chargeId: string): Promise<ActionState> {
  const { space } = await requireScopedModulePermission(scope, "financeiro", "delete");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("financial_charges")
    .update({ status: "cancelado" as FinancialChargeStatus })
    .eq("id", chargeId)
    .eq("space_id", space.id);
  if (error) return { error: error.message };
  revalidatePath(financialRoutePath(scope));
  return { success: "Cobrança cancelada." };
}

// -----------------------------------------------------------------------------
// Edição — "somente este" ou "este e os próximos". Nunca toca em cobrança
// que já tem pagamento registrado (histórico pago é imutável), exceto
// `notes`, que pode sempre ser editada.
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

  const { error } = await supabase.from("financial_charges").update(patch).eq("id", chargeId);
  if (error) return { error: error.message };

  if (applyToFuture) {
    // Todas as cobranças da mesma origem, com vencimento >= esta, que
    // ainda não têm pagamento — nunca as passadas/já pagas.
    const siblings = await listFinancialChargesByOrigin(charge.origin_id);
    const futureSiblingIds: string[] = [];
    for (const sibling of siblings) {
      if (sibling.id === chargeId || sibling.due_date < charge.due_date) continue;
      const { data: siblingPayments } = await supabase.from("financial_payments").select("id").eq("charge_id", sibling.id).limit(1);
      if ((siblingPayments?.length ?? 0) === 0) futureSiblingIds.push(sibling.id);
    }
    if (futureSiblingIds.length > 0) {
      const siblingPatch = {
        ...(updates.description !== undefined && { description: updates.description.trim() }),
        ...(updates.categoryId !== undefined && { category_id: updates.categoryId }),
        ...(updates.referenceTypeId !== undefined && { reference_type_id: updates.referenceTypeId }),
        ...(updates.originalAmount !== undefined && { original_amount: updates.originalAmount }),
        ...(updates.discountAmount !== undefined && { discount_amount: updates.discountAmount }),
        ...(updates.additionAmount !== undefined && { addition_amount: updates.additionAmount }),
        updated_by: profile.id,
      };
      if (Object.keys(siblingPatch).length > 1) {
        await supabase.from("financial_charges").update(siblingPatch).in("id", futureSiblingIds);
      }
    }
  }

  revalidatePath(financialRoutePath(scope));
  return { success: "Cobrança atualizada." };
}
