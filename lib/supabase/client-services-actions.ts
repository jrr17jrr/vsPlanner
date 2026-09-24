"use server";

import { revalidatePath } from "next/cache";
import { requireModulePermission } from "@/lib/supabase/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasModulePermission } from "@/lib/supabase/repositories/permissions.repository";
import {
  createOriginWithCharges,
  friendlyDbError,
  revalidateFinancialViews,
  type Supa,
} from "@/lib/supabase/finance-core";
import { VISIONARIO_DEV_SLUG } from "@/lib/space-slugs";
import { todayKeySaoPaulo } from "@/lib/format";
import { firstDueOnOrAfter } from "@/lib/recurrence";
import type {
  ClientService,
  ClientServiceBillingType,
  ClientServiceFrequency,
  ClientServiceStatus,
  FinancialOrigin,
} from "@/types/database.types";

export type ClientServiceActionState = {
  error?: string;
  success?: string;
  warning?: string;
};

export type ClientServiceFormInput = {
  serviceId: string;
  /** Recorrente: valor de cada competência. Único: valor. Parcelado: valor TOTAL. */
  price: number;
  billingType: ClientServiceBillingType;
  frequency?: ClientServiceFrequency;
  dueDay?: number;
  installmentCount?: number;
  /** Vencimento do único / 1ª parcela. */
  firstDueDate?: string;
  startDate?: string; // yyyy-mm-dd
  status: ClientServiceStatus;
  notes?: string;
};

/**
 * Contrato (client_services) → Financeiro (financial_origins/charges).
 *
 * O contrato é a fonte da RECEITA RECORRENTE (preço contratado); o
 * Financeiro é a fonte do que é DEVIDO (cobranças por competência) e do
 * que ENTROU (pagamentos). A ligação é `financial_origins.client_service_id`
 * (migration 007) — nenhuma tabela nova, nenhum financeiro paralelo:
 *
 *   - Contratar serviço ativo → cria a origem + 1ª cobrança (único), N
 *     parcelas (parcelado) ou a competência atual (recorrente; as próximas
 *     nascem sob demanda, ver `ensureRecurringChargesForSpace`).
 *   - Pausar/encerrar → a origem para de gerar e as cobranças FUTURAS ainda
 *     não pagas são canceladas. Atrasadas continuam em A receber (é dinheiro
 *     devido de verdade); pagas nunca são tocadas.
 *   - Reativar recorrente → nova série a partir da próxima competência
 *     (nunca cobra os meses em que ficou pausado).
 *   - Mudar preço de recorrente → atualiza só competências em aberto a
 *     partir de hoje; histórico pago fica intacto.
 *   - Mudar agenda (tipo/frequência/dia/parcelas) → encerra a série antiga
 *     (sem apagar histórico) e cria a nova.
 *
 * Permissões: `servicos.*` para o contrato (mesma RLS de client_services)
 * e `financeiro.create/edit` para mexer nas cobranças. Nenhuma escrita
 * aceita space_id do browser.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const BILLING_TYPES: ClientServiceBillingType[] = ["unico", "recorrente", "parcelado"];
const FREQUENCIES: ClientServiceFrequency[] = ["semanal", "mensal", "anual"];
const STATUSES: ClientServiceStatus[] = ["ativo", "inativo", "cancelado"];

function validate(input: ClientServiceFormInput): string | null {
  if (!input.serviceId) return "Escolha um serviço.";
  if (!Number.isFinite(input.price) || input.price <= 0) return "Valor precisa ser maior que zero.";
  if (!BILLING_TYPES.includes(input.billingType)) return "Tipo de cobrança inválido.";
  if (!STATUSES.includes(input.status)) return "Status inválido.";
  if (input.startDate && !DATE_RE.test(input.startDate)) return "Data de início inválida.";
  if (input.billingType === "recorrente") {
    if (!input.frequency || !FREQUENCIES.includes(input.frequency)) return "Escolha a frequência da recorrência.";
    if (!input.dueDay || input.dueDay < 1 || input.dueDay > 31) return "Dia de vencimento precisa ser entre 1 e 31.";
  } else {
    if (!input.firstDueDate || !DATE_RE.test(input.firstDueDate)) {
      return input.billingType === "parcelado" ? "Informe o vencimento da 1ª parcela." : "Informe o vencimento.";
    }
  }
  if (input.billingType === "parcelado" && (!input.installmentCount || input.installmentCount < 2 || input.installmentCount > 120)) {
    return "Parcelamento precisa ter de 2 a 120 parcelas.";
  }
  return null;
}

function toRow(input: ClientServiceFormInput) {
  return {
    service_id: input.serviceId,
    price: Math.round(input.price * 100) / 100,
    billing_type: input.billingType,
    frequency: input.billingType === "recorrente" ? input.frequency! : null,
    due_day: input.billingType === "recorrente" ? input.dueDay! : null,
    installment_count: input.billingType === "parcelado" ? input.installmentCount! : null,
    first_due_date: input.billingType === "recorrente" ? null : input.firstDueDate!,
    status: input.status,
    notes: input.notes?.trim() || null,
  };
}

function revalidateContractViews(clientId: string) {
  revalidatePath(`/visionario/clientes/${clientId}`);
  revalidatePath("/visionario/clientes");
  revalidateFinancialViews("visionario");
}

async function financePermissions(spaceId: string) {
  const [canCreate, canEdit] = await Promise.all([
    hasModulePermission(spaceId, "financeiro", "create"),
    hasModulePermission(spaceId, "financeiro", "edit"),
  ]);
  return { canCreate, canEdit, full: canCreate && canEdit };
}

async function listContractOrigins(supabase: Supa, contractId: string, spaceId: string): Promise<FinancialOrigin[]> {
  const { data, error } = await supabase
    .from("financial_origins")
    .select("*")
    .eq("client_service_id", contractId)
    .eq("space_id", spaceId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Cobranças da origem + ids das que já têm algum pagamento. */
async function originChargesWithPayments(supabase: Supa, originId: string, spaceId: string) {
  const { data: charges, error } = await supabase
    .from("financial_charges")
    .select("id, due_date, status")
    .eq("origin_id", originId)
    .eq("space_id", spaceId);
  if (error) throw error;
  const ids = (charges ?? []).map((c) => c.id);
  let paidIds = new Set<string>();
  if (ids.length > 0) {
    const { data: payments, error: paymentsError } = await supabase.from("financial_payments").select("charge_id").in("charge_id", ids);
    if (paymentsError) throw paymentsError;
    paidIds = new Set((payments ?? []).map((p) => p.charge_id));
  }
  return { charges: charges ?? [], paidIds };
}

/** Cancela cobranças ainda sem pagamento da origem (opcionalmente só as com vencimento a partir de `fromDate`). */
async function cancelUnpaidCharges(supabase: Supa, originId: string, spaceId: string, filter: { after?: string; onOrAfter?: string }) {
  const { charges, paidIds } = await originChargesWithPayments(supabase, originId, spaceId);
  const ids = charges
    .filter((c) => c.status === "ativo" && !paidIds.has(c.id))
    .filter((c) => (filter.after ? c.due_date > filter.after : true))
    .filter((c) => (filter.onOrAfter ? c.due_date >= filter.onOrAfter : true))
    .map((c) => c.id);
  if (ids.length === 0) return;
  const { error } = await supabase.from("financial_charges").update({ status: "cancelado" }).in("id", ids).eq("space_id", spaceId);
  if (error) throw error;
}

async function lookupDefaults(supabase: Supa, spaceId: string, billingType: ClientServiceBillingType) {
  const referenceName = billingType === "recorrente" ? "Mensalidade" : billingType === "parcelado" ? "Parcela" : "Criação / Implantação";
  const [{ data: category }, { data: reference }] = await Promise.all([
    supabase
      .from("financial_categories")
      .select("id")
      .eq("space_id", spaceId)
      .eq("kind", "entrada")
      .eq("name", "Serviços prestados")
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("financial_reference_types")
      .select("id")
      .eq("space_id", spaceId)
      .eq("name", referenceName)
      .eq("is_active", true)
      .maybeSingle(),
  ]);
  return { categoryId: category?.id ?? null, referenceTypeId: reference?.id ?? null };
}

/**
 * Cria a origem financeira do contrato. Recorrente começa na competência
 * de `fromKey` em diante — por padrão o mês atual (ou o início do
 * contrato, se for futuro): nunca gera um "passivo" de meses antigos que
 * provavelmente já foram recebidos fora do sistema.
 */
async function createContractOrigin(
  supabase: Supa,
  spaceId: string,
  profileId: string,
  contract: ClientService,
  fromKey: string
): Promise<string | null> {
  const [{ data: client }, { data: service }] = await Promise.all([
    supabase.from("clients").select("name").eq("id", contract.client_id).eq("space_id", spaceId).maybeSingle(),
    supabase.from("services").select("name").eq("id", contract.service_id).eq("space_id", spaceId).maybeSingle(),
  ]);
  const description = `${service?.name ?? "Serviço"} — ${client?.name ?? "Cliente"}`;
  const defaults = await lookupDefaults(supabase, spaceId, contract.billing_type);

  const base = {
    kind: "entrada" as const,
    description,
    clientId: contract.client_id,
    clientServiceId: contract.id,
    categoryId: defaults.categoryId,
    referenceTypeId: defaults.referenceTypeId,
    amount: Number(contract.price),
  };

  if (contract.billing_type === "recorrente") {
    const from = contract.start_date > fromKey ? contract.start_date : fromKey;
    const created = await createOriginWithCharges(supabase, spaceId, profileId, {
      ...base,
      tipo: "recorrente",
      firstDueDate: firstDueOnOrAfter(from, contract.due_day ?? 1),
      recurrenceFrequency: contract.frequency ?? "mensal",
      recurrenceDay: contract.frequency === "semanal" ? null : contract.due_day,
      recurrenceEndType: "nunca",
    });
    return created.error ?? null;
  }

  const created = await createOriginWithCharges(supabase, spaceId, profileId, {
    ...base,
    tipo: contract.billing_type,
    firstDueDate: contract.first_due_date ?? contract.start_date,
    installmentCount: contract.billing_type === "parcelado" ? contract.installment_count : null,
  });
  return created.error ?? null;
}

function scheduleChanged(before: ClientService, after: ClientService): boolean {
  return (
    before.billing_type !== after.billing_type ||
    before.frequency !== after.frequency ||
    before.due_day !== after.due_day ||
    before.installment_count !== after.installment_count ||
    before.first_due_date !== after.first_due_date
  );
}

async function assertServiceInSpace(supabase: Supa, serviceId: string, spaceId: string): Promise<string | null> {
  const { data, error } = await supabase.from("services").select("id").eq("id", serviceId).eq("space_id", spaceId).maybeSingle();
  if (error) return error.message;
  if (!data) return "Serviço selecionado não pertence a este espaço.";
  return null;
}

export async function createClientServiceAction(
  clientId: string,
  input: ClientServiceFormInput
): Promise<ClientServiceActionState> {
  const { profile, space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "servicos", "create");

  const validationError = validate(input);
  if (validationError) return { error: validationError };

  const supabase = await createSupabaseServerClient();

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("space_id", space.id)
    .maybeSingle();
  if (clientError) return { error: clientError.message };
  if (!client) return { error: "Cliente não encontrado neste espaço." };
  const serviceError = await assertServiceInSpace(supabase, input.serviceId, space.id);
  if (serviceError) return { error: serviceError };

  const { data: contract, error } = await supabase
    .from("client_services")
    .insert({
      client_id: clientId,
      space_id: space.id,
      start_date: input.startDate || todayKeySaoPaulo(),
      created_by: profile.id,
      ...toRow(input),
    })
    .select("*")
    .single();

  if (error) return { error: friendlyDbError(error.message) };

  let warning: string | undefined;
  if (contract.status === "ativo") {
    const finance = await financePermissions(space.id);
    if (!finance.canCreate) {
      warning = "Serviço salvo, mas você não tem permissão no Financeiro — as cobranças não foram geradas.";
    } else {
      const financeError = await createContractOrigin(supabase, space.id, profile.id, contract, `${todayKeySaoPaulo().slice(0, 7)}-01`);
      if (financeError) warning = `Serviço salvo, mas as cobranças não foram geradas: ${financeError}`;
    }
  }

  revalidateContractViews(clientId);
  return { success: "Serviço contratado.", warning };
}

export async function updateClientServiceAction(
  clientServiceId: string,
  clientId: string,
  input: ClientServiceFormInput
): Promise<ClientServiceActionState> {
  const { profile, space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "servicos", "edit");

  const validationError = validate(input);
  if (validationError) return { error: validationError };

  const supabase = await createSupabaseServerClient();

  const { data: before, error: beforeError } = await supabase
    .from("client_services")
    .select("*")
    .eq("id", clientServiceId)
    .eq("space_id", space.id)
    .maybeSingle();
  if (beforeError) return { error: beforeError.message };
  if (!before || before.client_id !== clientId) return { error: "Contrato não encontrado." };
  const serviceError = await assertServiceInSpace(supabase, input.serviceId, space.id);
  if (serviceError) return { error: serviceError };

  const after: ClientService = { ...before, ...toRow(input), start_date: input.startDate || before.start_date };
  const origins = await listContractOrigins(supabase, before.id, space.id);
  const activeOrigin = origins.find((o) => o.is_active) ?? null;
  const financialChange =
    scheduleChanged(before, after) ||
    Number(before.price) !== Number(after.price) ||
    before.status !== after.status ||
    before.service_id !== after.service_id;
  const finance = await financePermissions(space.id);

  if (financialChange && origins.length > 0 && !finance.full) {
    return { error: "Este serviço já tem cobranças no Financeiro — é preciso permissão de criar/editar no Financeiro para alterar valor, cobrança ou status." };
  }

  // Único/parcelado com pagamento: valor/agenda não podem mudar aqui
  // (o histórico pago não pode ser reescrito); o ajuste fica no Financeiro.
  const currentOrigin = activeOrigin ?? origins[0] ?? null;
  if (
    currentOrigin &&
    currentOrigin.origin_type !== "recorrente" &&
    before.billing_type === after.billing_type &&
    (scheduleChanged(before, after) || Number(before.price) !== Number(after.price))
  ) {
    const { paidIds } = await originChargesWithPayments(supabase, currentOrigin.id, space.id);
    if (paidIds.size > 0) {
      return { error: "Este serviço já tem pagamento registrado — ajuste valor/vencimentos direto nas cobranças do Financeiro." };
    }
  }

  const { data: updated, error } = await supabase
    .from("client_services")
    .update({ ...toRow(input), start_date: after.start_date })
    .eq("id", clientServiceId)
    .eq("space_id", space.id)
    .select("*")
    .maybeSingle();
  if (error) return { error: friendlyDbError(error.message) };
  if (!updated) return { error: "Contrato não encontrado." };

  let warning: string | undefined;
  try {
    if (!finance.full) {
      if (updated.status === "ativo" && origins.length === 0) {
        warning = "Serviço salvo, mas sem permissão no Financeiro as cobranças não foram geradas.";
      }
    } else {
      warning = await syncContractFinance(supabase, space.id, profile.id, before, updated, origins);
    }
  } catch (e) {
    warning = `Serviço salvo, mas a sincronização com o Financeiro falhou: ${e instanceof Error ? e.message : String(e)}`;
  }

  revalidateContractViews(clientId);
  return { success: "Serviço atualizado.", warning };
}

async function syncContractFinance(
  supabase: Supa,
  spaceId: string,
  profileId: string,
  before: ClientService,
  after: ClientService,
  origins: FinancialOrigin[]
): Promise<string | undefined> {
  const today = todayKeySaoPaulo();
  const monthStart = `${today.slice(0, 7)}-01`;
  const activeOrigin = origins.find((o) => o.is_active) ?? null;
  const latestOrigin = origins[0] ?? null;

  const deactivate = async (origin: FinancialOrigin) => {
    const { error } = await supabase.from("financial_origins").update({ is_active: false }).eq("id", origin.id).eq("space_id", spaceId);
    if (error) throw error;
  };

  // Contrato legado (criado antes da integração) ou ainda sem cobrança.
  if (origins.length === 0) {
    if (after.status !== "ativo") return undefined;
    const err = await createContractOrigin(supabase, spaceId, profileId, after, monthStart);
    return err ? `Cobranças não geradas: ${err}` : undefined;
  }

  // Pausar / encerrar.
  if (after.status !== "ativo") {
    if (activeOrigin) {
      await deactivate(activeOrigin);
      const shouldCancel = activeOrigin.origin_type === "recorrente" || after.status === "cancelado";
      if (shouldCancel) await cancelUnpaidCharges(supabase, activeOrigin.id, spaceId, { after: today });
    }
    return undefined;
  }

  // A partir daqui o contrato está ATIVO.
  const reactivating = before.status !== "ativo";
  const changedSchedule = scheduleChanged(before, after);

  if (after.billing_type === "recorrente") {
    if (changedSchedule || reactivating || !activeOrigin) {
      // Encerra a série antiga (se ainda ativa) e começa outra da próxima competência.
      if (activeOrigin) {
        await deactivate(activeOrigin);
        await cancelUnpaidCharges(supabase, activeOrigin.id, spaceId, { onOrAfter: today });
      }
      const err = await createContractOrigin(supabase, spaceId, profileId, after, today);
      return err ? `Cobranças não geradas: ${err}` : undefined;
    }
    if (Number(before.price) !== Number(after.price)) {
      // Valor atual da recorrência (migration 011) — próximas competências nascem com ele.
      await setRecurrenceAmount(supabase, spaceId, activeOrigin.id, Number(after.price));
      const { charges, paidIds } = await originChargesWithPayments(supabase, activeOrigin.id, spaceId);
      const ids = charges.filter((c) => c.status === "ativo" && c.due_date >= today && !paidIds.has(c.id)).map((c) => c.id);
      if (ids.length > 0) {
        const { error } = await supabase
          .from("financial_charges")
          .update({ original_amount: Number(after.price), updated_by: profileId })
          .in("id", ids)
          .eq("space_id", spaceId);
        if (error) throw error;
      }
    }
    if (before.service_id !== after.service_id) await renameOrigin(supabase, spaceId, activeOrigin.id, after);
    return undefined;
  }

  // Único / parcelado ATIVO. `current` = a série vigente (ativa, ou a mais
  // recente se o contrato estava pausado/encerrado).
  const typeChanged = before.billing_type !== after.billing_type;
  const priceChanged = Number(before.price) !== Number(after.price);
  const current = activeOrigin ?? latestOrigin;
  if (typeChanged || changedSchedule || priceChanged || !activeOrigin) {
    if (current && current.origin_type === after.billing_type && !typeChanged && !changedSchedule && !priceChanged) {
      // Reativando sem mudança: devolve as parcelas futuras canceladas no encerramento.
      await reactivateOrigin(supabase, spaceId, current, today);
      return undefined;
    }
    if (current) {
      // Nunca deixa duas séries em aberto para o mesmo contrato.
      if (current.is_active) await deactivate(current);
      await cancelUnpaidCharges(supabase, current.id, spaceId, current.origin_type === "recorrente" ? { onOrAfter: today } : {});
    }
    const err = await createContractOrigin(supabase, spaceId, profileId, after, today);
    return err ? `Cobranças não geradas: ${err}` : undefined;
  }

  if (before.service_id !== after.service_id) await renameOrigin(supabase, spaceId, activeOrigin.id, after);
  return undefined;
}

/** Atualiza o valor atual da recorrência; sem a migration 011 a coluna não existe e isto é ignorado. */
async function setRecurrenceAmount(supabase: Supa, spaceId: string, originId: string, amount: number) {
  await supabase.from("financial_origins").update({ recurrence_amount: amount }).eq("id", originId).eq("space_id", spaceId);
}

async function reactivateOrigin(supabase: Supa, spaceId: string, origin: FinancialOrigin, today: string) {
  const { error } = await supabase.from("financial_origins").update({ is_active: true }).eq("id", origin.id).eq("space_id", spaceId);
  if (error) throw error;
  const { charges, paidIds } = await originChargesWithPayments(supabase, origin.id, spaceId);
  const ids = charges.filter((c) => c.status === "cancelado" && c.due_date >= today && !paidIds.has(c.id)).map((c) => c.id);
  if (ids.length > 0) {
    const { error: chargesError } = await supabase.from("financial_charges").update({ status: "ativo" }).in("id", ids).eq("space_id", spaceId);
    if (chargesError) throw chargesError;
  }
}

async function renameOrigin(supabase: Supa, spaceId: string, originId: string, contract: ClientService) {
  const [{ data: client }, { data: service }] = await Promise.all([
    supabase.from("clients").select("name").eq("id", contract.client_id).eq("space_id", spaceId).maybeSingle(),
    supabase.from("services").select("name").eq("id", contract.service_id).eq("space_id", spaceId).maybeSingle(),
  ]);
  const description = `${service?.name ?? "Serviço"} — ${client?.name ?? "Cliente"}`;
  await supabase.from("financial_origins").update({ description }).eq("id", originId).eq("space_id", spaceId);
}

/** Atalho da ficha do cliente: pausar / encerrar / reativar sem abrir o formulário. */
export async function setClientServiceStatusAction(
  clientServiceId: string,
  clientId: string,
  status: ClientServiceStatus
): Promise<ClientServiceActionState> {
  const { space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "servicos", "edit");
  if (!STATUSES.includes(status)) return { error: "Status inválido." };
  const supabase = await createSupabaseServerClient();
  const { data: contract, error } = await supabase
    .from("client_services")
    .select("*")
    .eq("id", clientServiceId)
    .eq("space_id", space.id)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!contract || contract.client_id !== clientId) return { error: "Contrato não encontrado." };

  const result = await updateClientServiceAction(clientServiceId, clientId, {
    serviceId: contract.service_id,
    price: Number(contract.price),
    billingType: contract.billing_type,
    frequency: contract.frequency ?? undefined,
    dueDay: contract.due_day ?? undefined,
    installmentCount: contract.installment_count ?? undefined,
    firstDueDate: contract.first_due_date ?? (contract.billing_type === "recorrente" ? undefined : contract.start_date),
    startDate: contract.start_date,
    status,
    notes: contract.notes ?? undefined,
  });
  if (result.error) return result;
  const label = status === "ativo" ? "Serviço reativado." : status === "inativo" ? "Serviço pausado." : "Serviço encerrado.";
  return { ...result, success: label };
}

/** Contratos antigos (anteriores à integração) — gera as cobranças no Financeiro sob demanda. */
export async function generateContractChargesAction(clientServiceId: string, clientId: string): Promise<ClientServiceActionState> {
  const { profile, space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "servicos", "edit");
  const finance = await financePermissions(space.id);
  if (!finance.canCreate) return { error: "Você não tem permissão para criar lançamentos no Financeiro." };

  const supabase = await createSupabaseServerClient();
  const { data: contract, error } = await supabase
    .from("client_services")
    .select("*")
    .eq("id", clientServiceId)
    .eq("space_id", space.id)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!contract || contract.client_id !== clientId) return { error: "Contrato não encontrado." };
  if (contract.status !== "ativo") return { error: "Reative o serviço antes de gerar cobranças." };

  const origins = await listContractOrigins(supabase, contract.id, space.id);
  if (origins.some((o) => o.is_active)) return { error: "Este serviço já está integrado ao Financeiro." };

  const financeError = await createContractOrigin(supabase, space.id, profile.id, contract, `${todayKeySaoPaulo().slice(0, 7)}-01`);
  if (financeError) return { error: financeError };

  revalidateContractViews(clientId);
  return { success: "Cobranças geradas no Financeiro." };
}

/**
 * Excluir o contrato só é permitido se nenhuma cobrança dele tiver
 * pagamento — senão o histórico financeiro perderia o vínculo. Nesse caso
 * a saída é ENCERRAR. Sem pagamentos, as origens/cobranças dele também
 * saem (nada fica gerando cobrança "órfã").
 */
export async function deleteClientServiceAction(
  clientServiceId: string,
  clientId: string
): Promise<ClientServiceActionState> {
  const { space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "servicos", "delete");

  const supabase = await createSupabaseServerClient();
  const origins = await listContractOrigins(supabase, clientServiceId, space.id);

  if (origins.length > 0) {
    for (const origin of origins) {
      const { paidIds } = await originChargesWithPayments(supabase, origin.id, space.id);
      if (paidIds.size > 0) {
        return { error: "Este serviço já tem pagamentos registrados — encerre em vez de excluir, para manter o histórico." };
      }
    }
    const canDeleteFinance = await hasModulePermission(space.id, "financeiro", "delete");
    if (!canDeleteFinance) return { error: "Este serviço tem cobranças no Financeiro — é preciso permissão de excluir no Financeiro (ou encerre o serviço)." };
    const { error: originsError } = await supabase
      .from("financial_origins")
      .delete()
      .in(
        "id",
        origins.map((o) => o.id)
      )
      .eq("space_id", space.id);
    if (originsError) return { error: originsError.message };
  }

  const { error } = await supabase
    .from("client_services")
    .delete()
    .eq("id", clientServiceId)
    .eq("client_id", clientId)
    .eq("space_id", space.id);

  if (error) return { error: error.message };

  revalidateContractViews(clientId);
  return { success: "Serviço removido do cliente." };
}
