import { addMonthsKey, makeDateKey, parseDateKey } from "@/lib/recurrence";
import { cents, installmentAmounts, type InstallmentValueMode } from "@/lib/finance/installments";

/**
 * Cartões de crédito — regras PURAS (sem I/O): ciclo de fatura, em qual
 * fatura cada compra/parcela entra, cobranças de assinatura e totais das
 * faturas. O servidor usa as mesmas funções para gravar; o banco só
 * garante consistência (fatura única por mês, fatura paga não recebe
 * lançamento novo, cobrança de assinatura única por data).
 *
 * Convenções:
 *  - A fatura é identificada pelo MÊS DO VENCIMENTO (`yyyy-MM-01`).
 *  - Fechamento: se o dia de fechamento é anterior ao de vencimento, fecha
 *    no mesmo mês do vencimento; senão, no mês anterior (ex.: fecha 28 e
 *    vence 5 → a fatura de dezembro fecha em 28/11).
 *  - Mês curto: dia 31 vira o último dia do mês (28/29 em fevereiro).
 *  - Compra NO dia do fechamento entra na fatura que está fechando; compra
 *    DEPOIS do fechamento entra no ciclo seguinte.
 *  - Fatura já criada guarda as próprias datas: mudar o dia de fechamento
 *    do cartão só vale para faturas novas (nunca altera faturas passadas).
 */

export type CardOwnership = "proprio" | "terceiro";
export type CardStatus = "ativo" | "inativo";
export type PurchaseType = "avista" | "parcelada" | "assinatura";
export type SubscriptionStatus = "ativa" | "pausada" | "cancelada";
export type CardItemType = "parcela" | "estorno" | "ajuste";

export type CreditCard = {
  id: string;
  space_id: string;
  name: string;
  bank: string | null;
  holder_name: string | null;
  ownership: CardOwnership;
  nickname: string | null;
  last4: string | null;
  credit_limit: number | null;
  closing_day: number;
  due_day: number;
  color: string | null;
  status: CardStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type CardInvoice = {
  id: string;
  space_id: string;
  card_id: string;
  reference_month: string;
  closing_date: string;
  due_date: string;
  charge_id: string | null;
  created_at: string;
  updated_at: string;
};

export type CardPurchase = {
  id: string;
  space_id: string;
  card_id: string;
  description: string;
  category_id: string | null;
  purchase_date: string;
  purchase_type: PurchaseType;
  total_amount: number;
  installment_count: number;
  first_invoice_month: string;
  subscription_id: string | null;
  subscription_date: string | null;
  status: "ativa" | "cancelada";
  notes: string | null;
  converted_from_origin_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type CardPurchaseItem = {
  id: string;
  space_id: string;
  purchase_id: string;
  invoice_id: string;
  item_type: CardItemType;
  installment_number: number | null;
  installment_total: number | null;
  amount: number;
  description: string | null;
  status: "ativo" | "cancelado";
  created_by: string;
  created_at: string;
};

export type CardSubscription = {
  id: string;
  space_id: string;
  card_id: string;
  description: string;
  category_id: string | null;
  amount: number;
  billing_day: number;
  start_date: string;
  end_date: string | null;
  status: SubscriptionStatus;
  generated_through: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type CardSubscriptionEvent = {
  id: string;
  subscription_id: string;
  space_id: string;
  action: "criada" | "pausada" | "reativada" | "cancelada" | "valor_alterado" | "editada";
  effective_date: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

export type CardsData = {
  available: boolean;
  cards: CreditCard[];
  invoices: CardInvoice[];
  purchases: CardPurchase[];
  items: CardPurchaseItem[];
  subscriptions: CardSubscription[];
  events: CardSubscriptionEvent[];
};

export const EMPTY_CARDS_DATA: CardsData = { available: false, cards: [], invoices: [], purchases: [], items: [], subscriptions: [], events: [] };

const daysIn = (y: number, m: number) => new Date(y, m, 0).getDate();
const clampDay = (y: number, m: number, d: number) => makeDateKey(y, m, Math.min(Math.max(1, d), daysIn(y, m)));

export function monthKeyOf(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function shiftMonth(monthKey: string, delta: number): string {
  return addMonthsKey(monthKeyOf(monthKey), delta, 1);
}

/** Datas de fechamento e vencimento da fatura do mês `referenceMonth` (mês do vencimento). */
export function invoiceCycleDates(referenceMonth: string, closingDay: number, dueDay: number): { closingDate: string; dueDate: string } {
  const { y, m } = parseDateKey(monthKeyOf(referenceMonth));
  const dueDate = clampDay(y, m, dueDay);
  const closeMonth = closingDay < dueDay ? monthKeyOf(referenceMonth) : shiftMonth(referenceMonth, -1);
  const c = parseDateKey(closeMonth);
  return { closingDate: clampDay(c.y, c.m, closingDay), dueDate };
}

type CycleCard = Pick<CreditCard, "closing_day" | "due_day">;
type KnownInvoice = Pick<CardInvoice, "reference_month" | "closing_date">;

/** Fechamento da fatura do mês: o gravado na fatura, se já existe; senão, o calculado pelo cartão. */
function closingFor(card: CycleCard, month: string, known: Map<string, string>): string {
  return known.get(month) ?? invoiceCycleDates(month, card.closing_day, card.due_day).closingDate;
}

/** Fatura (mês do vencimento) em que uma compra feita em `purchaseDate` entra. */
export function invoiceMonthForPurchase(card: CycleCard, purchaseDate: string, invoices: KnownInvoice[] = []): string {
  const known = new Map(invoices.map((i) => [monthKeyOf(i.reference_month), i.closing_date]));
  // O fechamento da fatura do mês anterior é sempre antes do mês da compra:
  // a primeira fatura (a partir do mês da compra) que fecha em/após a compra é a certa.
  let month = monthKeyOf(purchaseDate);
  for (let guard = 0; guard < 4 && purchaseDate > closingFor(card, month, known); guard++) month = shiftMonth(month, 1);
  return month;
}

export type PlannedCardItem = { number: number; total: number; invoiceMonth: string; amount: number };

export type CardPurchasePlanInput = {
  type: PurchaseType;
  mode: InstallmentValueMode;
  /** Total (mode=total) ou valor de cada parcela (mode=parcela). À vista/assinatura: o valor. */
  amount: number;
  count: number;
  purchaseDate: string;
  /** Primeira fatura escolhida manualmente (mês). Vazio = calculada pelo fechamento. */
  firstInvoiceMonth?: string | null;
};

export function planCardPurchase(card: CycleCard, input: CardPurchasePlanInput, invoices: KnownInvoice[] = []): { items: PlannedCardItem[]; total: number; firstInvoiceMonth: string; error?: string } {
  const fail = (error: string) => ({ items: [], total: 0, firstInvoiceMonth: "", error });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.purchaseDate)) return fail("Informe a data da compra.");
  if (!Number.isFinite(input.amount) || input.amount <= 0) return fail("Informe um valor válido.");
  const count = input.type === "parcelada" ? Math.trunc(input.count) : 1;
  if (input.type === "parcelada" && (!(count >= 2) || count > 120)) return fail("Compra parcelada precisa ter de 2 a 120 parcelas.");
  const first = input.firstInvoiceMonth ? monthKeyOf(input.firstInvoiceMonth) : invoiceMonthForPurchase(card, input.purchaseDate, invoices);
  const amounts = count === 1 ? [cents(input.amount)] : installmentAmounts({ mode: input.mode, amount: input.amount, count });
  const items = amounts.map((amount, i) => ({ number: i + 1, total: count, invoiceMonth: shiftMonth(first, i), amount }));
  return { items, total: cents(amounts.reduce((s, a) => s + a, 0)), firstInvoiceMonth: first };
}

/** Datas de cobrança de uma assinatura: todo mês no dia `billing_day` (mês curto → último dia). */
export function subscriptionBillingDates(sub: Pick<CardSubscription, "billing_day" | "start_date" | "end_date">, from: string, to: string): string[] {
  const out: string[] = [];
  const start = sub.start_date;
  let month = monthKeyOf(start);
  for (let guard = 0; guard < 600; guard++) {
    const { y, m } = parseDateKey(month);
    const date = clampDay(y, m, sub.billing_day);
    if (date > to || (sub.end_date && date > sub.end_date)) break;
    if (date >= start && date >= from) out.push(date);
    month = shiftMonth(month, 1);
  }
  return out;
}

/**
 * Cobranças da assinatura que ainda faltam gerar até `today`. Só gera
 * depois de `generated_through` (o que já foi gerado nunca é refeito) e só
 * enquanto ativa — pausada/cancelada não gera nada.
 */
export function pendingSubscriptionCharges(sub: Pick<CardSubscription, "billing_day" | "start_date" | "end_date" | "status" | "generated_through">, today: string): string[] {
  if (sub.status !== "ativa") return [];
  const from = sub.generated_through ? addDay(sub.generated_through) : sub.start_date;
  return subscriptionBillingDates(sub, from, today);
}

export function nextSubscriptionCharge(sub: Pick<CardSubscription, "billing_day" | "start_date" | "end_date" | "status" | "generated_through">, today: string): string | null {
  if (sub.status === "cancelada") return null;
  const from = [sub.generated_through ? addDay(sub.generated_through) : sub.start_date, addDay(today)].sort().pop()!;
  const horizon = addMonthsKey(from, 2, 31);
  return subscriptionBillingDates(sub, from, horizon)[0] ?? null;
}

function addDay(key: string): string {
  const { y, m, d } = parseDateKey(key);
  const date = new Date(y, m - 1, d + 1);
  return makeDateKey(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

// -----------------------------------------------------------------------------
// Faturas: totais, pago, restante e status
// -----------------------------------------------------------------------------

export type InvoiceStatus = "aberta" | "fechada" | "vencida" | "parcial" | "paga" | "sem_lancamentos" | "futura";

export type InvoiceView = {
  invoice: CardInvoice | null;
  month: string;
  closingDate: string;
  dueDate: string;
  items: CardPurchaseItem[];
  total: number;
  /** Valor devido (total ± desconto/acréscimo aplicados ao pagar). */
  due: number;
  paid: number;
  remaining: number;
  status: InvoiceStatus;
};

export type ChargeMoney = { id: string; amount: number; status?: string };
export type PaymentMoney = { charge_id: string; amount: number };

export function invoiceStatus(v: Pick<InvoiceView, "total" | "due" | "paid" | "closingDate" | "dueDate">, today: string): InvoiceStatus {
  if (v.total <= 0 && v.paid <= 0) return "sem_lancamentos";
  if (v.paid > 0 && cents(v.paid) >= cents(v.due)) return "paga";
  if (today > v.dueDate) return "vencida";
  if (v.paid > 0) return "parcial";
  if (today > v.closingDate) return "fechada";
  return "aberta";
}

export function buildInvoiceView(
  card: CycleCard & { id: string },
  month: string,
  data: { invoices: CardInvoice[]; items: CardPurchaseItem[] },
  charges: ChargeMoney[],
  payments: PaymentMoney[],
  today: string
): InvoiceView {
  const invoice = data.invoices.find((i) => i.card_id === card.id && monthKeyOf(i.reference_month) === monthKeyOf(month)) ?? null;
  const dates = invoice ? { closingDate: invoice.closing_date, dueDate: invoice.due_date } : invoiceCycleDates(month, card.closing_day, card.due_day);
  const items = invoice ? data.items.filter((it) => it.invoice_id === invoice.id && it.status === "ativo") : [];
  const total = cents(items.reduce((s, it) => s + Number(it.amount), 0));
  const charge = invoice?.charge_id ? charges.find((c) => c.id === invoice.charge_id) : undefined;
  const paid = charge ? cents(payments.filter((p) => p.charge_id === charge.id).reduce((s, p) => s + Number(p.amount), 0)) : 0;
  const due = charge && charge.status !== "cancelado" ? cents(Number(charge.amount)) : Math.max(0, total);
  const view = { invoice, month: monthKeyOf(month), ...dates, items, total, due, paid, remaining: Math.max(0, cents(due - paid)) };
  return { ...view, status: invoiceStatus(view, today) };
}

/** Fatura "atual" do cartão: a que recebe compras feitas hoje. */
export function currentInvoiceMonth(card: CycleCard, today: string, invoices: KnownInvoice[] = []): string {
  return invoiceMonthForPurchase(card, today, invoices);
}

export type CardSummary = {
  current: InvoiceView;
  next: InvoiceView;
  /** Compras feitas no mês corrente (pela data da compra). */
  spentThisMonth: number;
  limit: number | null;
  /** Limite comprometido: tudo o que ainda não foi pago (faturas abertas + parcelas futuras). */
  limitUsed: number;
  limitAvailable: number | null;
  activeInstallmentPurchases: number;
  activeSubscriptions: number;
  nextDueDate: string | null;
  owed: number;
  paidTotal: number;
};

export function cardSummary(
  card: CreditCard,
  data: CardsData,
  charges: ChargeMoney[],
  payments: PaymentMoney[],
  today: string
): CardSummary {
  const cardInvoices = data.invoices.filter((i) => i.card_id === card.id);
  const currentMonth = currentInvoiceMonth(card, today, cardInvoices);
  const current = buildInvoiceView(card, currentMonth, data, charges, payments, today);
  const next = buildInvoiceView(card, shiftMonth(currentMonth, 1), data, charges, payments, today);
  const views = cardInvoices.map((i) => buildInvoiceView(card, i.reference_month, data, charges, payments, today));
  const owed = cents(views.reduce((s, v) => s + v.remaining, 0));
  const paidTotal = cents(views.reduce((s, v) => s + v.paid, 0));
  const monthKey = today.slice(0, 7);
  const purchases = data.purchases.filter((p) => p.card_id === card.id && p.status === "ativa");
  const spentThisMonth = cents(purchases.filter((p) => p.purchase_date.startsWith(monthKey)).reduce((s, p) => s + Number(p.total_amount), 0));
  const openViews = views.filter((v) => v.remaining > 0).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const installmentsActive = purchases.filter((p) => {
    if (p.purchase_type !== "parcelada") return false;
    const invIds = new Set(data.items.filter((it) => it.purchase_id === p.id && it.status === "ativo").map((it) => it.invoice_id));
    return views.some((v) => v.invoice && invIds.has(v.invoice.id) && v.status !== "paga");
  }).length;
  const limit = card.credit_limit === null || card.credit_limit === undefined ? null : Number(card.credit_limit);
  return {
    current,
    next,
    spentThisMonth,
    limit,
    limitUsed: owed,
    limitAvailable: limit === null ? null : cents(limit - owed),
    activeInstallmentPurchases: installmentsActive,
    activeSubscriptions: data.subscriptions.filter((s) => s.card_id === card.id && s.status === "ativa").length,
    nextDueDate: openViews[0]?.dueDate ?? null,
    owed,
    paidTotal,
  };
}

/** Pagamento ao titular (cartão de terceiro): abate as faturas mais antigas primeiro. */
export function allocateHolderPayment(open: { chargeId: string; dueDate: string; remaining: number }[], amount: number): { allocations: { chargeId: string; amount: number }[]; error?: string } {
  const total = cents(open.reduce((s, o) => s + o.remaining, 0));
  const value = cents(amount);
  if (!(value > 0)) return { allocations: [], error: "Informe um valor válido." };
  if (value > total) return { allocations: [], error: `Valor maior do que você deve ao titular (${total.toFixed(2).replace(".", ",")}).` };
  let left = value;
  const allocations: { chargeId: string; amount: number }[] = [];
  for (const o of [...open].sort((a, b) => a.dueDate.localeCompare(b.dueDate))) {
    if (left <= 0) break;
    const part = cents(Math.min(left, o.remaining));
    if (part > 0) allocations.push({ chargeId: o.chargeId, amount: part });
    left = cents(left - part);
  }
  return { allocations };
}

/**
 * Relatório do mês sem dupla contagem:
 *  - compras: consumo no cartão pela data da compra (estornos abatem);
 *  - pagamentos de fatura: dinheiro que saiu das contas para pagar faturas;
 *  - saídas efetivas: todo dinheiro que saiu das contas no mês (inclui o
 *    pagamento das faturas, NÃO as compras no cartão);
 *  - dívidas futuras: faturas ainda não pagas com vencimento depois de hoje.
 */
export function cardMonthReport(
  monthKey: string,
  data: CardsData,
  charges: (ChargeMoney & { kind: string; due_date: string; card_invoice_id?: string | null })[],
  payments: (PaymentMoney & { payment_date: string })[],
  today: string
) {
  const bought = data.purchases.filter((p) => p.status === "ativa" && p.purchase_date.startsWith(monthKey)).reduce((s, p) => s + Number(p.total_amount), 0);
  const activePurchase = new Set(data.purchases.filter((p) => p.status === "ativa").map((p) => p.id));
  const credits = data.items.filter((it) => it.status === "ativo" && it.item_type !== "parcela" && activePurchase.has(it.purchase_id) && it.created_at.slice(0, 7) === monthKey).reduce((s, it) => s + Number(it.amount), 0);
  const purchases = cents(bought + credits);
  const invoiceChargeIds = new Set([
    ...data.invoices.map((i) => i.charge_id).filter((id): id is string => !!id),
    ...charges.filter((c) => c.card_invoice_id).map((c) => c.id),
  ]);
  const kindById = new Map(charges.map((c) => [c.id, c.kind]));
  const inMonth = payments.filter((p) => p.payment_date.startsWith(monthKey));
  const invoicePayments = cents(inMonth.filter((p) => invoiceChargeIds.has(p.charge_id)).reduce((s, p) => s + Number(p.amount), 0));
  const cashOut = cents(inMonth.filter((p) => kindById.get(p.charge_id) === "saida").reduce((s, p) => s + Number(p.amount), 0));
  const paidBy = new Map<string, number>();
  for (const p of payments) paidBy.set(p.charge_id, cents((paidBy.get(p.charge_id) ?? 0) + Number(p.amount)));
  const futureDebt = cents(
    charges
      .filter((c) => invoiceChargeIds.has(c.id) && c.status !== "cancelado" && c.due_date > today)
      .reduce((s, c) => s + Math.max(0, cents(Number(c.amount) - (paidBy.get(c.id) ?? 0))), 0)
  );
  return { purchases, invoicePayments, cashOut, futureDebt };
}

export const CARD_COLORS = ["#8b5cf6", "#ec4899", "#f97316", "#eab308", "#10b981", "#06b6d4", "#3b82f6", "#64748b"];

export function cardLabel(card: Pick<CreditCard, "name" | "nickname" | "last4">): string {
  const base = card.nickname?.trim() || card.name;
  return card.last4 ? `${base} •••• ${card.last4}` : base;
}

export function validateCardInput(input: { name: string; ownership: string; closingDay: number; dueDay: number; last4?: string | null; creditLimit?: number | null; holderName?: string | null }): string | null {
  if (!input.name.trim()) return "Informe o nome do cartão.";
  if (input.ownership !== "proprio" && input.ownership !== "terceiro") return "Escolha se o cartão é próprio ou de terceiro.";
  if (!Number.isInteger(input.closingDay) || input.closingDay < 1 || input.closingDay > 31) return "Dia de fechamento precisa ser de 1 a 31.";
  if (!Number.isInteger(input.dueDay) || input.dueDay < 1 || input.dueDay > 31) return "Dia de vencimento precisa ser de 1 a 31.";
  if (input.closingDay === input.dueDay) return "Fechamento e vencimento precisam ser em dias diferentes.";
  if (input.last4 && !/^\d{4}$/.test(input.last4)) return "Informe só os 4 últimos dígitos (nunca o número completo).";
  if (input.creditLimit !== null && input.creditLimit !== undefined && (!Number.isFinite(input.creditLimit) || input.creditLimit < 0)) return "Limite inválido.";
  if (input.ownership === "terceiro" && !input.holderName?.trim()) return "Informe o titular do cartão de terceiro.";
  return null;
}
