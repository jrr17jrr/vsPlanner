import type { Domain, FinancialCharge, FinancialPayment, FinancialRecurrenceFrequency } from "@/types/database.types";
import { nextRenewalFromCharges } from "@/lib/financial-calc";

/** Regras puras de Domínios — usadas pela página Domínios e pela Visão Geral. */

export function renewalRecurrence(periodMonths: number): { frequency: FinancialRecurrenceFrequency; interval: number | null } {
  if (periodMonths === 1) return { frequency: "mensal", interval: null };
  if (periodMonths === 12) return { frequency: "anual", interval: null };
  return { frequency: "a_cada_x_meses", interval: periodMonths };
}

export function periodLabel(periodMonths: number): string {
  if (periodMonths === 1) return "Mensal";
  if (periodMonths === 12) return "Anual";
  if (periodMonths % 12 === 0) return `${periodMonths / 12} anos`;
  return `${periodMonths} meses`;
}

/**
 * Próxima renovação "de verdade": se a renovação está integrada ao
 * Financeiro, vem das cobranças (a próxima em aberto; se todas pagas, a
 * seguinte da série) — assim pagar a renovação empurra a data sozinha,
 * sem duas fontes de verdade. Sem integração, vale o `renewal_date`
 * cadastrado.
 */
export function effectiveRenewalDate(
  domain: Domain,
  chargesByOrigin: Map<string, FinancialCharge[]>,
  payments: FinancialPayment[]
): string | null {
  if (!domain.financial_origin_id) return domain.renewal_date;
  const originCharges = chargesByOrigin.get(domain.financial_origin_id);
  if (!originCharges || originCharges.length === 0) return domain.renewal_date;
  return nextRenewalFromCharges(originCharges, payments, domain.period_months, domain.renewal_date);
}

/** Total realmente gasto: valor de compra cadastrado + renovações efetivamente pagas no Financeiro. */
export function domainTotalSpent(
  domain: Domain,
  chargesByOrigin: Map<string, FinancialCharge[]>,
  payments: FinancialPayment[]
): number {
  const purchase = Number(domain.purchase_price ?? 0);
  if (!domain.financial_origin_id) return purchase;
  const chargeIds = new Set((chargesByOrigin.get(domain.financial_origin_id) ?? []).map((c) => c.id));
  const renewals = payments.filter((p) => chargeIds.has(p.charge_id)).reduce((s, p) => s + Number(p.amount), 0);
  return purchase + renewals;
}

/**
 * O domínio gera uma renovação prevista (gasto futuro)? Só se estiver
 * ATIVO e marcado para renovar. `will_renew` ausente (migration 010 ainda
 * não aplicada) conta como true — mesmo default do banco.
 */
export function isPlannedRenewal(domain: Pick<Domain, "status" | "will_renew">): boolean {
  return domain.status === "ativo" && domain.will_renew !== false;
}

/** Soma de `renewal_price` dos domínios com renovação prevista. */
export function plannedRenewalsTotal(domains: Pick<Domain, "status" | "will_renew" | "renewal_price">[]): number {
  const total = domains.filter(isPlannedRenewal).reduce((s, d) => s + Number(d.renewal_price ?? 0), 0);
  return Math.round(total * 100) / 100;
}

export function groupChargesByOrigin(charges: FinancialCharge[]): Map<string, FinancialCharge[]> {
  const map = new Map<string, FinancialCharge[]>();
  for (const c of charges) {
    const list = map.get(c.origin_id) ?? [];
    list.push(c);
    map.set(c.origin_id, list);
  }
  return map;
}
