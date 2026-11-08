import type { FinancialCategory, FinancialCharge, FinancialOrigin, FinancialPayment } from "@/types/database.types";

/**
 * Gastos por categoria do Meu Dinheiro — puro, testado em
 * category-spending.test.ts. Regras:
 *  - Só DESPESAS (kind 'saida'); receitas nunca entram.
 *  - Cobrança cancelada não conta. Cada cobrança conta uma vez (pagamento
 *    parcial não duplica no modo competência).
 *  - Base "competencia" (padrão, igual aos gráficos atuais): data de
 *    competência ou vencimento da cobrança, valor da cobrança.
 *    Base "pago": data real de cada pagamento, valor pago.
 *  - Transferência entre contas próprias não é gasto: o sistema não tem
 *    esse lançamento, mas se alguém usa uma categoria "Transferência entre
 *    contas"/"Transferência interna", ela fica de fora do total.
 *  - Nada é gravado: editar/excluir um lançamento muda os totais na hora.
 */

export type SpendingBasis = "competencia" | "pago";
export type OriginTypeFilter = "todos" | "unico" | "parcelado" | "recorrente";

export type SpendingFilters = {
  /** yyyy-MM-dd, inclusive */
  from: string;
  to: string;
  basis: SpendingBasis;
  categoryId?: string | null;
  originType?: OriginTypeFilter;
};

export type SpendingEntry = {
  charge: FinancialCharge;
  /** Data considerada (competência/vencimento ou pagamento). */
  date: string;
  amount: number;
  paymentMethods: string[];
};

export type CategoryTotal = {
  /** null = sem categoria */
  categoryId: string | null;
  name: string;
  total: number;
  /** 0-100 */
  pct: number;
  count: number;
  previousTotal: number;
  /** Variação % vs. período de comparação (null = sem base). */
  change: number | null;
};

export type SpendingSummary = {
  total: number;
  previousTotal: number;
  change: number | null;
  categories: CategoryTotal[];
  entries: SpendingEntry[];
  excludedTransfers: number;
};

export const UNCATEGORIZED = "__sem_categoria__";
const TRANSFER_RE = /transfer[êe]ncia(s)?\s+(entre\s+contas|interna)/i;

const round = (n: number) => Math.round(n * 100) / 100;

export function isInternalTransferCategory(name: string | null | undefined): boolean {
  return !!name && TRANSFER_RE.test(name);
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

/** Lançamentos de despesa do período (antes de agrupar). */
export function spendingEntries(
  input: { charges: FinancialCharge[]; payments: FinancialPayment[]; categories: FinancialCategory[]; origins?: FinancialOrigin[] },
  filters: SpendingFilters
): { entries: SpendingEntry[]; excludedTransfers: number } {
  const categoryById = new Map(input.categories.map((c) => [c.id, c]));
  const originType = new Map((input.origins ?? []).map((o) => [o.id, o.origin_type]));
  const methodsByCharge = new Map<string, Set<string>>();
  for (const p of input.payments) {
    if (!methodsByCharge.has(p.charge_id)) methodsByCharge.set(p.charge_id, new Set());
    methodsByCharge.get(p.charge_id)!.add(p.payment_method);
  }
  const expenses = input.charges.filter((c) => {
    if (c.kind !== "saida" || c.status === "cancelado") return false;
    if (filters.originType && filters.originType !== "todos" && originType.get(c.origin_id) !== filters.originType) return false;
    return true;
  });

  let excludedTransfers = 0;
  const entries: SpendingEntry[] = [];
  const keep = (charge: FinancialCharge, date: string, amount: number) => {
    if (date < filters.from || date > filters.to) return;
    if (isInternalTransferCategory(charge.category_id ? categoryById.get(charge.category_id)?.name : null)) {
      excludedTransfers = round(excludedTransfers + amount);
      return;
    }
    if (filters.categoryId) {
      const key = charge.category_id ?? UNCATEGORIZED;
      if (key !== filters.categoryId) return;
    }
    entries.push({ charge, date, amount: round(amount), paymentMethods: [...(methodsByCharge.get(charge.id) ?? [])] });
  };

  if (filters.basis === "competencia") {
    for (const c of expenses) keep(c, c.competency_date ?? c.due_date, Number(c.amount));
  } else {
    const byId = new Map(expenses.map((c) => [c.id, c]));
    for (const p of input.payments) {
      const charge = byId.get(p.charge_id);
      if (charge) keep(charge, p.payment_date, Number(p.amount));
    }
  }
  entries.sort((a, b) => (a.date === b.date ? b.amount - a.amount : b.date.localeCompare(a.date)));
  return { entries, excludedTransfers };
}

/** Totais por categoria do período, com comparação contra `compare` (mesmos filtros, outro intervalo). */
export function summarizeSpending(
  input: { charges: FinancialCharge[]; payments: FinancialPayment[]; categories: FinancialCategory[]; origins?: FinancialOrigin[] },
  filters: SpendingFilters,
  compare: { from: string; to: string } | null
): SpendingSummary {
  const current = spendingEntries(input, filters);
  const previous = compare ? spendingEntries(input, { ...filters, ...compare }) : { entries: [], excludedTransfers: 0 };
  const nameOf = new Map(input.categories.map((c) => [c.id, c.name]));

  const group = (entries: SpendingEntry[]) => {
    const map = new Map<string, { total: number; count: number }>();
    for (const e of entries) {
      const key = e.charge.category_id ?? UNCATEGORIZED;
      const g = map.get(key) ?? { total: 0, count: 0 };
      g.total = round(g.total + e.amount);
      g.count += 1;
      map.set(key, g);
    }
    return map;
  };
  const cur = group(current.entries);
  const prev = group(previous.entries);
  const total = round(current.entries.reduce((s, e) => s + e.amount, 0));
  const previousTotal = round(previous.entries.reduce((s, e) => s + e.amount, 0));

  const keys = new Set([...cur.keys(), ...prev.keys()]);
  const categories: CategoryTotal[] = [...keys].map((key) => {
    const c = cur.get(key) ?? { total: 0, count: 0 };
    const p = prev.get(key)?.total ?? 0;
    return {
      categoryId: key === UNCATEGORIZED ? null : key,
      name: key === UNCATEGORIZED ? "Sem categoria" : nameOf.get(key) ?? "Categoria removida",
      total: c.total,
      pct: total > 0 ? round((c.total / total) * 100) : 0,
      count: c.count,
      previousTotal: p,
      change: compare ? pctChange(c.total, p) : null,
    };
  });
  categories.sort((a, b) => b.total - a.total || b.previousTotal - a.previousTotal || a.name.localeCompare(b.name, "pt-BR"));

  return { total, previousTotal, change: compare ? pctChange(total, previousTotal) : null, categories, entries: current.entries, excludedTransfers: current.excludedTransfers };
}

// ---------------------------------------------------------------------------
// Períodos
// ---------------------------------------------------------------------------

export type PeriodMode = "mes" | "ano" | "personalizado";

export function monthRange(monthKey: string): { from: string; to: string } {
  const [y, m] = monthKey.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${monthKey}-01`, to: `${monthKey}-${String(last).padStart(2, "0")}` };
}

export function yearRange(year: number): { from: string; to: string } {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

export function shiftMonth(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

/** Período anterior do mesmo tamanho (personalizado) — termina no dia antes de `from`. */
export function previousRange(from: string, to: string): { from: string; to: string } {
  const day = 86_400_000;
  const f = Date.parse(`${from}T00:00:00Z`);
  const t = Date.parse(`${to}T00:00:00Z`);
  const len = Math.round((t - f) / day) + 1;
  const prevTo = new Date(f - day);
  const prevFrom = new Date(f - len * day);
  return { from: prevFrom.toISOString().slice(0, 10), to: prevTo.toISOString().slice(0, 10) };
}

export const SUGGESTED_EXPENSE_CATEGORIES = ["Alimentação", "Cursos", "Transporte", "Assinaturas", "Saúde", "Lazer", "Compras", "Moradia", "Outros"] as const;

// ---------------------------------------------------------------------------
// Cartões de crédito (migration 20261113100000) — sem dupla contagem
// ---------------------------------------------------------------------------

/** Lançamento sintético de compra no cartão (não é editável como cobrança). */
export const CARD_ITEM_PREFIX = "card-item:";

type CardSpendingData = {
  invoices: { id: string; reference_month: string; due_date: string; charge_id: string | null }[];
  purchases: { id: string; description: string; category_id: string | null; status: string; purchase_type: string }[];
  items: { id: string; purchase_id: string; invoice_id: string; item_type: string; installment_number: number | null; installment_total: number | null; amount: number; description: string | null; status: string; created_by: string; created_at: string }[];
};

/**
 * Base "competência": a fatura do cartão (cobrança única no A pagar) é
 * trocada pelas COMPRAS que a compõem, cada uma na categoria dela e no mês
 * da fatura em que entrou (parcelas mês a mês; estorno abate). Base "pago":
 * fica o pagamento real da fatura (dinheiro que saiu da conta). Assim o
 * mesmo gasto nunca aparece duas vezes.
 */
export function cardAwareCharges(charges: FinancialCharge[], cards: CardSpendingData | null | undefined, basis: SpendingBasis): FinancialCharge[] {
  if (!cards || basis !== "competencia" || cards.items.length === 0) return charges;
  const invoiceById = new Map(cards.invoices.map((i) => [i.id, i]));
  const purchaseById = new Map(cards.purchases.map((p) => [p.id, p]));
  const invoiceCharges = new Set([...cards.invoices.map((i) => i.charge_id).filter(Boolean), ...charges.filter((c) => c.card_invoice_id).map((c) => c.id)]);
  const synthetic: FinancialCharge[] = [];
  for (const it of cards.items) {
    if (it.status !== "ativo") continue;
    const inv = invoiceById.get(it.invoice_id);
    const p = purchaseById.get(it.purchase_id);
    if (!inv || !p || p.status !== "ativa") continue;
    const suffix = it.item_type === "parcela" && (it.installment_total ?? 1) > 1 ? ` (${it.installment_number}/${it.installment_total})` : "";
    synthetic.push({
      id: `${CARD_ITEM_PREFIX}${it.id}`,
      space_id: "",
      origin_id: `card-purchase:${p.id}`,
      kind: "saida",
      description: `${it.item_type === "parcela" ? p.description : it.description ?? `Estorno · ${p.description}`}${suffix} · cartão`,
      client_id: null,
      client_service_id: null,
      reference_type_id: null,
      category_id: p.category_id,
      supplier_name: null,
      installment_number: it.installment_number,
      installment_total: it.installment_total,
      original_amount: Number(it.amount),
      discount_amount: 0,
      addition_amount: 0,
      amount: Number(it.amount),
      due_date: inv.due_date,
      competency_date: inv.reference_month,
      status: "ativo",
      notes: null,
      created_by: it.created_by,
      updated_by: null,
      created_at: it.created_at,
      updated_at: it.created_at,
    });
  }
  return [...charges.filter((c) => !invoiceCharges.has(c.id)), ...synthetic];
}
