"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireScopedModulePermission } from "@/lib/supabase/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidateFinancialViews } from "@/lib/supabase/finance-core";
import { CARDS_MIGRATION_MESSAGE, isMissingCardsSchema } from "@/lib/supabase/repositories/credit-cards.repository";
import {
  followCompetency,
  planReplan,
  planReschedule,
  type ExistingInstallment,
  type ReplanInput,
  type RescheduleMode,
} from "@/lib/finance/installments";
import type { FinancialScope } from "@/lib/space-slugs";

type ActionState = { error?: string; success?: string };

/**
 * Parcelamentos já cadastrados: mudar vencimentos (somente esta / esta e as
 * próximas) e edição completa (quantidade, valores, vencimentos). Só mexe
 * em cobranças — nunca em pagamentos ou saldos. O plano é calculado aqui
 * (mesma função da prévia na tela) e gravado numa transação no banco.
 */

async function loadInstallments(supabase: SupabaseClient, spaceId: string, originId: string) {
  const { data: origin } = await supabase.from("financial_origins").select("id, origin_type, space_id").eq("id", originId).eq("space_id", spaceId).maybeSingle();
  if (!origin) return { error: "Parcelamento não encontrado." } as const;
  const { data: charges, error } = await supabase
    .from("financial_charges")
    .select("id, installment_number, due_date, amount, status, competency_date, description, card_invoice_id")
    .eq("origin_id", originId)
    .eq("space_id", spaceId);
  if (error) return { error: error.message } as const;
  const ids = (charges ?? []).map((c) => c.id as string);
  const { data: payments } = ids.length ? await supabase.from("financial_payments").select("charge_id, amount").in("charge_id", ids) : { data: [] };
  const paid = new Map<string, number>();
  for (const p of payments ?? []) paid.set(p.charge_id, Math.round(((paid.get(p.charge_id) ?? 0) + Number(p.amount)) * 100) / 100);
  const installments: ExistingInstallment[] = (charges ?? []).map((c, i) => ({
    id: c.id,
    number: c.installment_number ?? i + 1,
    dueDate: c.due_date,
    amount: Number(c.amount),
    paid: paid.get(c.id) ?? 0,
    cancelled: c.status === "cancelado",
  }));
  return { origin, charges: charges ?? [], installments } as const;
}

export async function rescheduleInstallmentsAction(scope: FinancialScope, chargeId: string, newDate: string, mode: RescheduleMode): Promise<ActionState> {
  const { profile, space } = await requireScopedModulePermission(scope, "financeiro", "edit");
  const supabase = (await createSupabaseServerClient()) as unknown as SupabaseClient;
  const { data: charge } = await supabase.from("financial_charges").select("id, origin_id, card_invoice_id").eq("id", chargeId).eq("space_id", space.id).maybeSingle();
  if (!charge) return { error: "Parcela não encontrada." };
  if (charge.card_invoice_id) return { error: "Esta cobrança é a fatura de um cartão: o vencimento segue o cartão." };
  const loaded = await loadInstallments(supabase, space.id, charge.origin_id);
  if ("error" in loaded) return { error: loaded.error };
  const plan = planReschedule(loaded.installments, chargeId, newDate, mode);
  if (plan.error) return { error: plan.error };
  if (plan.changes.length === 0) return { success: "Nenhum vencimento mudou." };

  const { error } = await supabase.rpc("fin_reschedule_charges", {
    p_origin_id: charge.origin_id,
    p_ids: plan.changes.map((c) => c.id),
    p_dates: plan.changes.map((c) => c.to),
  });
  if (error) {
    if (!isMissingCardsSchema(error)) return { error: error.message };
    // Sem a migration: grava uma a uma, numa ordem que não colide (adiar: da última para a primeira).
    const later = plan.changes[0].to > plan.changes[0].from;
    const ordered = [...plan.changes].sort((a, b) => (later ? b.number - a.number : a.number - b.number));
    const byId = new Map(loaded.charges.map((c) => [c.id as string, c]));
    for (const c of ordered) {
      const old = byId.get(c.id)!;
      const { error: upError } = await supabase
        .from("financial_charges")
        .update({ due_date: c.to, competency_date: followCompetency(c.from, old.competency_date, c.to), updated_by: profile.id })
        .eq("id", c.id)
        .eq("space_id", space.id);
      if (upError) {
        revalidateFinancialViews(scope);
        return { error: /duplicate|unique/i.test(upError.message) ? "Duas parcelas ficariam com o mesmo vencimento. Escolha outra data." : upError.message };
      }
    }
  }
  revalidateFinancialViews(scope);
  return { success: plan.changes.length === 1 ? "Vencimento alterado." : `${plan.changes.length} vencimentos reorganizados.` };
}

export async function replanInstallmentsAction(scope: FinancialScope, originId: string, input: ReplanInput): Promise<ActionState> {
  const { space } = await requireScopedModulePermission(scope, "financeiro", "edit");
  const supabase = (await createSupabaseServerClient()) as unknown as SupabaseClient;
  const loaded = await loadInstallments(supabase, space.id, originId);
  if ("error" in loaded) return { error: loaded.error };
  if (loaded.origin.origin_type !== "parcelado") return { error: "Só parcelamentos podem ser editados assim." };
  const plan = planReplan(loaded.installments, input);
  if (plan.error) return { error: plan.error };

  const rows = plan.rows
    .filter((r) => r.action !== "removida")
    .map((r) => ({ id: r.id ?? null, number: r.number, amount: r.toAmount, due_date: r.toDue }));
  const { data, error } = await supabase.rpc("fin_replan_installments", { p_origin_id: originId, p_rows: rows });
  if (error) return { error: isMissingCardsSchema(error) ? CARDS_MIGRATION_MESSAGE.replace("Cartões de crédito ainda não estão ativos", "A edição completa do parcelamento ainda não está ativa") : error.message };
  revalidateFinancialViews(scope);
  const r = (data ?? {}) as { created?: number; cancelled?: number; count?: number };
  const extra = [r.created ? `${r.created} nova(s)` : "", r.cancelled ? `${r.cancelled} removida(s) (canceladas, sem apagar histórico)` : ""].filter(Boolean).join(" · ");
  return { success: `Parcelamento atualizado: ${r.count ?? rows.length} parcelas${extra ? ` · ${extra}` : ""}.` };
}

/** Converte as parcelas pendentes (sem pagamento) de uma dívida em compra no cartão — sem duplicar valores. */
export async function convertOriginToCardAction(originId: string, cardId: string, firstInvoiceMonth: string): Promise<ActionState> {
  await requireScopedModulePermission("pessoal", "financeiro", "edit");
  const supabase = (await createSupabaseServerClient()) as unknown as SupabaseClient;
  const { error } = await supabase.rpc("fin_convert_origin_to_card", { p_origin_id: originId, p_card_id: cardId, p_first_month: firstInvoiceMonth });
  if (error) return { error: isMissingCardsSchema(error) ? CARDS_MIGRATION_MESSAGE : error.message };
  revalidateFinancialViews("pessoal");
  return { success: "Dívida convertida: as parcelas pendentes agora estão nas faturas do cartão (nada foi duplicado)." };
}

