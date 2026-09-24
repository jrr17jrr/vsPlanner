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
import { renewalRecurrence } from "@/lib/domains";
import { competencyOf } from "@/lib/recurrence";
import { VISIONARIO_DEV_SLUG } from "@/lib/space-slugs";
import { todayKeySaoPaulo } from "@/lib/format";
import type { Domain, DomainStatus } from "@/types/database.types";

type ActionState = { error?: string; success?: string; warning?: string; id?: string };

export type DomainFormInput = {
  domain: string;
  registrar?: string;
  purchaseDate?: string;
  purchasePrice?: number;
  periodMonths: number;
  renewalDate?: string;
  renewalPrice?: number;
  status: DomainStatus;
  notes?: string;
  clientId?: string;
  siteId?: string;
  /** Lançar a renovação em A pagar (Financeiro) como saída recorrente. */
  trackRenewalInFinance: boolean;
};

/**
 * Domínios (migration 009). Permissão = módulo `sites` (mesmo módulo de
 * Sites, já existente). A renovação, quando integrada, é uma origem de
 * SAÍDA recorrente comum do Financeiro (mesma arquitetura de A pagar) —
 * esta tabela nunca guarda pagamento, e o custo nunca é lançado duas vezes.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DOMAIN_RE = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const STATUSES: DomainStatus[] = ["ativo", "expirado", "cancelado", "transferido"];

function normalizeDomain(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

function validate(input: DomainFormInput): string | null {
  const domain = normalizeDomain(input.domain);
  if (!domain) return "Informe o domínio.";
  if (!DOMAIN_RE.test(domain)) return "Domínio inválido (ex.: meusite.com.br).";
  if (!STATUSES.includes(input.status)) return "Status inválido.";
  if (!Number.isInteger(input.periodMonths) || input.periodMonths < 1 || input.periodMonths > 120) return "Período inválido.";
  if (input.purchaseDate && !DATE_RE.test(input.purchaseDate)) return "Data de compra inválida.";
  if (input.renewalDate && !DATE_RE.test(input.renewalDate)) return "Data de renovação inválida.";
  if (input.purchasePrice !== undefined && (!Number.isFinite(input.purchasePrice) || input.purchasePrice < 0)) return "Valor pago inválido.";
  if (input.renewalPrice !== undefined && (!Number.isFinite(input.renewalPrice) || input.renewalPrice < 0)) return "Valor de renovação inválido.";
  if (input.trackRenewalInFinance) {
    if (!input.renewalDate) return "Informe a data de renovação para lançar em A pagar.";
    const price = input.renewalPrice ?? input.purchasePrice;
    if (!price || price <= 0) return "Informe o valor da renovação para lançar em A pagar.";
  }
  return null;
}

async function assertLinksInSpace(supabase: Supa, input: DomainFormInput, spaceId: string): Promise<string | null> {
  if (input.clientId) {
    const { data, error } = await supabase.from("clients").select("id").eq("id", input.clientId).eq("space_id", spaceId).maybeSingle();
    if (error) return error.message;
    if (!data) return "Cliente selecionado não pertence a este espaço.";
  }
  if (input.siteId) {
    const { data, error } = await supabase.from("client_sites").select("id").eq("id", input.siteId).eq("space_id", spaceId).maybeSingle();
    if (error) return error.message;
    if (!data) return "Site selecionado não pertence a este espaço.";
  }
  return null;
}

function toRow(input: DomainFormInput) {
  return {
    domain: normalizeDomain(input.domain),
    registrar: input.registrar?.trim() || null,
    purchase_date: input.purchaseDate || null,
    purchase_price: input.purchasePrice ?? null,
    period_months: input.periodMonths,
    renewal_date: input.renewalDate || null,
    renewal_price: input.renewalPrice ?? null,
    status: input.status,
    notes: input.notes?.trim() || null,
    client_id: input.clientId || null,
    site_id: input.siteId || null,
  };
}

function revalidateDomainViews() {
  revalidatePath("/visionario/dominios");
  revalidatePath("/visionario");
}

async function createRenewalOrigin(supabase: Supa, spaceId: string, profileId: string, domain: Domain): Promise<{ originId?: string; error?: string }> {
  const { frequency, interval } = renewalRecurrence(domain.period_months);
  const { data: category } = await supabase
    .from("financial_categories")
    .select("id")
    .eq("space_id", spaceId)
    .eq("kind", "saida")
    .eq("name", "Domínios")
    .eq("is_active", true)
    .maybeSingle();
  const { data: reference } = await supabase
    .from("financial_reference_types")
    .select("id")
    .eq("space_id", spaceId)
    .eq("name", "Renovação")
    .eq("is_active", true)
    .maybeSingle();

  const created = await createOriginWithCharges(supabase, spaceId, profileId, {
    kind: "saida",
    tipo: "recorrente",
    description: `Renovação do domínio ${domain.domain}`,
    clientId: null,
    categoryId: category?.id ?? null,
    referenceTypeId: reference?.id ?? null,
    supplierName: domain.registrar,
    amount: Number(domain.renewal_price ?? domain.purchase_price ?? 0),
    firstDueDate: domain.renewal_date!,
    recurrenceFrequency: frequency,
    recurrenceInterval: interval,
    recurrenceEndType: "nunca",
  });
  if (created.error || !created.originId) return { error: created.error ?? "Falha ao lançar a renovação." };

  const { error } = await supabase
    .from("domains")
    .update({ financial_origin_id: created.originId })
    .eq("id", domain.id)
    .eq("space_id", spaceId);
  if (error) return { error: error.message };
  return { originId: created.originId };
}

/** Para a renovação no Financeiro: não gera mais competências e cancela as futuras não pagas. */
async function stopRenewalOrigin(supabase: Supa, spaceId: string, originId: string): Promise<void> {
  await supabase.from("financial_origins").update({ is_active: false }).eq("id", originId).eq("space_id", spaceId);
  const today = todayKeySaoPaulo();
  const { data: charges } = await supabase
    .from("financial_charges")
    .select("id, due_date, status")
    .eq("origin_id", originId)
    .eq("space_id", spaceId);
  const futureIds = (charges ?? []).filter((c) => c.status === "ativo" && c.due_date >= today).map((c) => c.id);
  if (futureIds.length === 0) return;
  const { data: paid } = await supabase.from("financial_payments").select("charge_id").in("charge_id", futureIds);
  const paidIds = new Set((paid ?? []).map((p) => p.charge_id));
  const toCancel = futureIds.filter((id) => !paidIds.has(id));
  if (toCancel.length > 0) {
    await supabase.from("financial_charges").update({ status: "cancelado" }).in("id", toCancel).eq("space_id", spaceId);
  }
}

/**
 * Reagenda a série da renovação quando valor/período/data mudam — sem
 * criar outra origem (o histórico pago continua ligado ao domínio).
 */
async function rescheduleRenewalOrigin(supabase: Supa, spaceId: string, profileId: string, before: Domain, after: Domain): Promise<void> {
  const originId = after.financial_origin_id!;
  const { frequency, interval } = renewalRecurrence(after.period_months);
  const amount = Number(after.renewal_price ?? after.purchase_price ?? 0);
  const today = todayKeySaoPaulo();

  await supabase
    .from("financial_origins")
    .update({
      is_active: true,
      recurrence_frequency: frequency,
      recurrence_interval: interval,
      supplier_name: after.registrar,
      description: `Renovação do domínio ${after.domain}`,
    })
    .eq("id", originId)
    .eq("space_id", spaceId);

  const { data: charges } = await supabase
    .from("financial_charges")
    .select("id, due_date, status")
    .eq("origin_id", originId)
    .eq("space_id", spaceId);
  const ids = (charges ?? []).map((c) => c.id);
  const { data: paid } = ids.length > 0 ? await supabase.from("financial_payments").select("charge_id").in("charge_id", ids) : { data: [] };
  const paidIds = new Set((paid ?? []).map((p) => p.charge_id));
  const openFuture = (charges ?? []).filter((c) => c.status === "ativo" && c.due_date >= today && !paidIds.has(c.id));

  const scheduleChanged = before.renewal_date !== after.renewal_date || before.period_months !== after.period_months;
  if (!scheduleChanged) {
    if (openFuture.length > 0) {
      await supabase
        .from("financial_charges")
        .update({ original_amount: amount, updated_by: profileId })
        .in("id", openFuture.map((c) => c.id))
        .eq("space_id", spaceId);
    }
    return;
  }

  if (openFuture.length > 0) {
    await supabase.from("financial_charges").update({ status: "cancelado" }).in("id", openFuture.map((c) => c.id)).eq("space_id", spaceId);
  }
  if (!after.renewal_date) return;
  const existing = (charges ?? []).find((c) => c.due_date === after.renewal_date);
  if (existing) {
    if (!paidIds.has(existing.id)) {
      await supabase
        .from("financial_charges")
        .update({ status: "ativo", original_amount: amount, updated_by: profileId })
        .eq("id", existing.id)
        .eq("space_id", spaceId);
    }
    return;
  }
  await supabase.from("financial_charges").insert({
    space_id: spaceId,
    origin_id: originId,
    kind: "saida",
    description: `Renovação do domínio ${after.domain}`,
    supplier_name: after.registrar,
    original_amount: amount,
    due_date: after.renewal_date,
    competency_date: competencyOf(after.renewal_date),
    created_by: profileId,
  });
}

export async function createDomainAction(input: DomainFormInput): Promise<ActionState> {
  const { profile, space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "sites", "create");
  const validationError = validate(input);
  if (validationError) return { error: validationError };

  const supabase = await createSupabaseServerClient();
  const linkError = await assertLinksInSpace(supabase, input, space.id);
  if (linkError) return { error: linkError };

  const { data: domain, error } = await supabase
    .from("domains")
    .insert({ space_id: space.id, created_by: profile.id, ...toRow(input) })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") return { error: "Este domínio já está cadastrado." };
    return { error: friendlyDbError(error.message) };
  }

  let warning: string | undefined;
  if (input.trackRenewalInFinance && domain.status === "ativo") {
    const canFinance = await hasModulePermission(space.id, "financeiro", "create");
    if (!canFinance) {
      warning = "Domínio salvo, mas você não tem permissão no Financeiro — a renovação não foi lançada em A pagar.";
    } else {
      const result = await createRenewalOrigin(supabase, space.id, profile.id, domain);
      if (result.error) warning = `Domínio salvo, mas a renovação não foi lançada: ${result.error}`;
      else revalidateFinancialViews("visionario");
    }
  }

  revalidateDomainViews();
  return { success: "Domínio cadastrado.", warning, id: domain.id };
}

export async function updateDomainAction(domainId: string, input: DomainFormInput): Promise<ActionState> {
  const { profile, space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "sites", "edit");
  const validationError = validate(input);
  if (validationError) return { error: validationError };

  const supabase = await createSupabaseServerClient();
  const linkError = await assertLinksInSpace(supabase, input, space.id);
  if (linkError) return { error: linkError };

  const { data: before, error: beforeError } = await supabase
    .from("domains")
    .select("*")
    .eq("id", domainId)
    .eq("space_id", space.id)
    .maybeSingle();
  if (beforeError) return { error: beforeError.message };
  if (!before) return { error: "Domínio não encontrado." };

  const wantsFinance = input.trackRenewalInFinance && input.status === "ativo";
  const touchesFinance = wantsFinance || !!before.financial_origin_id;
  const [canCreateFinance, canEditFinance] = touchesFinance
    ? await Promise.all([
        hasModulePermission(space.id, "financeiro", "create"),
        hasModulePermission(space.id, "financeiro", "edit"),
      ])
    : [false, false];

  const { data: after, error } = await supabase
    .from("domains")
    .update(toRow(input))
    .eq("id", domainId)
    .eq("space_id", space.id)
    .select("*")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") return { error: "Este domínio já está cadastrado." };
    return { error: friendlyDbError(error.message) };
  }
  if (!after) return { error: "Domínio não encontrado." };

  let warning: string | undefined;
  if (touchesFinance) {
    if (!canEditFinance || (wantsFinance && !before.financial_origin_id && !canCreateFinance)) {
      warning = "Domínio salvo, mas sem permissão no Financeiro a renovação em A pagar não foi atualizada.";
    } else if (!wantsFinance && before.financial_origin_id) {
      await stopRenewalOrigin(supabase, space.id, before.financial_origin_id);
      revalidateFinancialViews("visionario");
    } else if (wantsFinance && !before.financial_origin_id) {
      const result = await createRenewalOrigin(supabase, space.id, profile.id, after);
      if (result.error) warning = `Domínio salvo, mas a renovação não foi lançada: ${result.error}`;
      revalidateFinancialViews("visionario");
    } else if (wantsFinance && after.financial_origin_id) {
      await rescheduleRenewalOrigin(supabase, space.id, profile.id, before, after);
      revalidateFinancialViews("visionario");
    }
  }

  revalidateDomainViews();
  return { success: "Domínio atualizado.", warning };
}

/**
 * Excluir domínio: se a renovação já tem pagamento, o histórico financeiro
 * é mantido (a série só é encerrada); sem pagamento, a origem sai junto.
 */
export async function deleteDomainAction(domainId: string): Promise<ActionState> {
  const { space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "sites", "delete");
  const supabase = await createSupabaseServerClient();

  const { data: domain, error: domainError } = await supabase
    .from("domains")
    .select("*")
    .eq("id", domainId)
    .eq("space_id", space.id)
    .maybeSingle();
  if (domainError) return { error: domainError.message };
  if (!domain) return { error: "Domínio não encontrado." };

  if (domain.financial_origin_id) {
    const canEditFinance = await hasModulePermission(space.id, "financeiro", "edit");
    if (!canEditFinance) return { error: "A renovação deste domínio está no Financeiro — é preciso permissão no Financeiro para excluí-lo." };
    const { data: charges } = await supabase.from("financial_charges").select("id").eq("origin_id", domain.financial_origin_id).eq("space_id", space.id);
    const ids = (charges ?? []).map((c) => c.id);
    const { count } = ids.length > 0
      ? await supabase.from("financial_payments").select("id", { count: "exact", head: true }).in("charge_id", ids)
      : { count: 0 };
    if ((count ?? 0) > 0) {
      await stopRenewalOrigin(supabase, space.id, domain.financial_origin_id);
    } else {
      const canDeleteFinance = await hasModulePermission(space.id, "financeiro", "delete");
      if (canDeleteFinance) {
        await supabase.from("financial_origins").delete().eq("id", domain.financial_origin_id).eq("space_id", space.id);
      } else {
        await stopRenewalOrigin(supabase, space.id, domain.financial_origin_id);
      }
    }
    revalidateFinancialViews("visionario");
  }

  const { error } = await supabase.from("domains").delete().eq("id", domainId).eq("space_id", space.id);
  if (error) return { error: error.message };

  revalidateDomainViews();
  return { success: "Domínio excluído." };
}
