import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EMPTY_CARDS_DATA, invoiceMonthForPurchase, pendingSubscriptionCharges, type CardsData } from "@/lib/finance/credit-card";
import { todayKeySaoPaulo } from "@/lib/format";

/**
 * Leitura dos Cartões de crédito (migration 20261113100000). RLS do
 * Financeiro (`has_module_permission`) — só volta o que o usuário pode ver
 * no space. Sem a migration aplicada, `available = false` e o resto do
 * Financeiro segue igual.
 */

export function isMissingCardsSchema(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (["42P01", "PGRST205", "PGRST202", "42883"].includes(String(error.code ?? ""))) return true;
  return /credit_card|card_[a-z_]+|fin_reschedule_charges|fin_replan_installments|fin_convert_origin_to_card/.test(error.message ?? "")
    && /does not exist|schema cache|Could not find/i.test(error.message ?? "");
}

export const CARDS_MIGRATION_MESSAGE =
  "Cartões de crédito ainda não estão ativos: aplique a migration 20261113100000_installments_credit_cards.sql no Supabase (SQL Editor → Run).";

const db = async () => (await createSupabaseServerClient()) as unknown as SupabaseClient;

export async function listCardsData(spaceId: string): Promise<CardsData> {
  const supabase = await db();
  const [cards, invoices, purchases, items, subscriptions, events] = await Promise.all([
    supabase.from("credit_cards").select("*").eq("space_id", spaceId).order("created_at"),
    supabase.from("credit_card_invoices").select("*").eq("space_id", spaceId).order("reference_month"),
    supabase.from("credit_card_purchases").select("*").eq("space_id", spaceId).order("purchase_date", { ascending: false }),
    supabase.from("credit_card_purchase_items").select("*").eq("space_id", spaceId).order("created_at"),
    supabase.from("credit_card_subscriptions").select("*").eq("space_id", spaceId).order("created_at"),
    supabase.from("credit_card_subscription_events").select("*").eq("space_id", spaceId).order("created_at"),
  ]);
  const firstError = [cards, invoices, purchases, items, subscriptions, events].find((r) => r.error)?.error ?? null;
  if (firstError) {
    if (isMissingCardsSchema(firstError)) return EMPTY_CARDS_DATA;
    throw firstError;
  }
  const num = <T extends Record<string, unknown>>(rows: T[], keys: string[]) =>
    rows.map((r) => {
      const out: Record<string, unknown> = { ...r };
      for (const k of keys) if (out[k] !== null && out[k] !== undefined) out[k] = Number(out[k]);
      return out;
    });
  return {
    available: true,
    cards: num(cards.data ?? [], ["credit_limit"]) as CardsData["cards"],
    invoices: (invoices.data ?? []) as CardsData["invoices"],
    purchases: num(purchases.data ?? [], ["total_amount"]) as CardsData["purchases"],
    items: num(items.data ?? [], ["amount"]) as CardsData["items"],
    subscriptions: num(subscriptions.data ?? [], ["amount"]) as CardsData["subscriptions"],
    events: (events.data ?? []) as CardsData["events"],
  };
}

/**
 * Gera as cobranças de assinatura que já venceram (até hoje), uma única
 * vez cada (o banco recusa data repetida). Chamado ao abrir o Financeiro
 * por quem pode criar lançamentos, e antes de pausar/cancelar.
 */
export async function materializeSubscriptions(spaceId: string, onlySubscriptionId?: string): Promise<void> {
  const supabase = await db();
  let query = supabase.from("credit_card_subscriptions").select("*").eq("space_id", spaceId).eq("status", "ativa");
  if (onlySubscriptionId) query = query.eq("id", onlySubscriptionId);
  const { data: subs, error } = await query;
  if (error || !subs?.length) return;
  const today = todayKeySaoPaulo();
  const cardIds = [...new Set(subs.map((s) => s.card_id as string))];
  const [{ data: cards }, { data: invoices }] = await Promise.all([
    supabase.from("credit_cards").select("id, closing_day, due_day").in("id", cardIds),
    supabase.from("credit_card_invoices").select("card_id, reference_month, closing_date").in("card_id", cardIds),
  ]);
  for (const sub of subs) {
    const card = (cards ?? []).find((c) => c.id === sub.card_id);
    if (!card) continue;
    const known = (invoices ?? []).filter((i) => i.card_id === sub.card_id) as { reference_month: string; closing_date: string }[];
    for (const date of pendingSubscriptionCharges({ ...sub, amount: Number(sub.amount) } as never, today).slice(0, 36)) {
      const { error: rpcError } = await supabase.rpc("card_create_purchase", {
        p_card_id: sub.card_id,
        p_description: sub.description,
        p_category_id: sub.category_id,
        p_purchase_date: date,
        p_type: "assinatura",
        p_amounts: [Number(sub.amount)],
        p_first_month: invoiceMonthForPurchase(card as { closing_day: number; due_day: number }, date, known),
        p_notes: null,
        p_subscription_id: sub.id,
        p_subscription_date: date,
      });
      if (rpcError) break;
    }
  }
}
