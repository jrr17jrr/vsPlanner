import { describe, expect, it } from "vitest";
import {
  allocateHolderPayment,
  buildInvoiceView,
  cardMonthReport,
  cardSummary,
  invoiceCycleDates,
  invoiceMonthForPurchase,
  nextSubscriptionCharge,
  pendingSubscriptionCharges,
  planCardPurchase,
  validateCardInput,
  type CardInvoice,
  type CardPurchase,
  type CardPurchaseItem,
  type CardsData,
  type CreditCard,
} from "./credit-card";

const card = (over: Partial<CreditCard> = {}): CreditCard => ({
  id: "nu", space_id: "s", name: "Meu Nubank", bank: "Nubank", holder_name: null, ownership: "proprio", nickname: null, last4: null,
  credit_limit: 5000, closing_day: 20, due_day: 27, color: null, status: "ativo", created_by: "u", created_at: "", updated_at: "", ...over,
});

describe("12–13. cadastro de cartões", () => {
  it("12. próprio: válido sem titular; só 4 dígitos", () => {
    expect(validateCardInput({ name: "Meu Nubank", ownership: "proprio", closingDay: 20, dueDay: 27 })).toBeNull();
    expect(validateCardInput({ name: "Meu Nubank", ownership: "proprio", closingDay: 20, dueDay: 27, last4: "1234567812345678" })).toMatch(/4 últimos/);
    expect(validateCardInput({ name: "x", ownership: "proprio", closingDay: 20, dueDay: 20 })).toMatch(/diferentes/);
    expect(validateCardInput({ name: "x", ownership: "proprio", closingDay: 32, dueDay: 2 })).toMatch(/fechamento/);
  });
  it("13. terceiro exige titular", () => {
    expect(validateCardInput({ name: "Cartão do cunhado", ownership: "terceiro", closingDay: 5, dueDay: 12 })).toMatch(/titular/);
    expect(validateCardInput({ name: "Cartão do cunhado", ownership: "terceiro", closingDay: 5, dueDay: 12, holderName: "Cunhado" })).toBeNull();
  });
});

describe("17–20. ciclo da fatura", () => {
  it("17–18. fecha 20 e vence 27: compra até o dia 20 entra na fatura do mês; depois, na seguinte", () => {
    expect(invoiceCycleDates("2026-11-01", 20, 27)).toEqual({ closingDate: "2026-11-20", dueDate: "2026-11-27" });
    expect(invoiceMonthForPurchase(card(), "2026-11-20")).toBe("2026-11-01");
    expect(invoiceMonthForPurchase(card(), "2026-11-21")).toBe("2026-12-01");
    expect(invoiceMonthForPurchase(card(), "2026-12-31")).toBe("2027-01-01");
  });

  it("fecha 28 e vence 5: a fatura de dezembro fecha em 28/11", () => {
    const c = card({ closing_day: 28, due_day: 5 });
    expect(invoiceCycleDates("2026-12-01", 28, 5)).toEqual({ closingDate: "2026-11-28", dueDate: "2026-12-05" });
    expect(invoiceMonthForPurchase(c, "2026-11-15")).toBe("2026-12-01");
    expect(invoiceMonthForPurchase(c, "2026-11-29")).toBe("2027-01-01");
    expect(invoiceMonthForPurchase(c, "2026-12-01")).toBe("2027-01-01");
  });

  it("19. meses com 28, 29, 30 e 31 dias", () => {
    expect(invoiceCycleDates("2027-02-01", 30, 31)).toEqual({ closingDate: "2027-02-28", dueDate: "2027-02-28" });
    expect(invoiceCycleDates("2028-02-01", 31, 10)).toEqual({ closingDate: "2028-01-31", dueDate: "2028-02-10" });
    expect(invoiceCycleDates("2028-03-01", 31, 10)).toEqual({ closingDate: "2028-02-29", dueDate: "2028-03-10" });
    expect(invoiceCycleDates("2026-04-01", 25, 31)).toEqual({ closingDate: "2026-04-25", dueDate: "2026-04-30" });
    expect(invoiceMonthForPurchase(card({ closing_day: 31, due_day: 10 }), "2028-02-29")).toBe("2028-03-01");
  });

  it("fatura já criada mantém o próprio fechamento mesmo se o cartão mudar", () => {
    const changed = card({ closing_day: 10, due_day: 17 });
    expect(invoiceMonthForPurchase(changed, "2026-11-15")).toBe("2026-12-01");
    expect(invoiceMonthForPurchase(changed, "2026-11-15", [{ reference_month: "2026-11-01", closing_date: "2026-11-20" }])).toBe("2026-11-01");
  });

  it("14–15–20. à vista em uma fatura; parcelada distribui nas faturas futuras; 1ª fatura manual", () => {
    expect(planCardPurchase(card(), { type: "avista", mode: "total", amount: 150, count: 1, purchaseDate: "2026-11-08" }).items).toEqual([{ number: 1, total: 1, invoiceMonth: "2026-11-01", amount: 150 }]);
    const ps5 = planCardPurchase(card(), { type: "parcelada", mode: "parcela", amount: 350, count: 10, purchaseDate: "2026-11-21" });
    expect(ps5.total).toBe(3500);
    expect(ps5.items.map((i) => i.invoiceMonth)).toEqual(["2026-12-01", "2027-01-01", "2027-02-01", "2027-03-01", "2027-04-01", "2027-05-01", "2027-06-01", "2027-07-01", "2027-08-01", "2027-09-01"]);
    const manual = planCardPurchase(card(), { type: "parcelada", mode: "total", amount: 1000, count: 3, purchaseDate: "2026-11-08", firstInvoiceMonth: "2027-01-01" });
    expect(manual.items.map((i) => [i.invoiceMonth, i.amount])).toEqual([["2027-01-01", 333.33], ["2027-02-01", 333.33], ["2027-03-01", 333.34]]);
  });
});

describe("16, 25–26. assinaturas", () => {
  const sub = { billing_day: 31, start_date: "2026-01-31", end_date: null, status: "ativa" as const, generated_through: null };
  it("16. cobra todo mês no dia (mês curto → último dia)", () => {
    expect(pendingSubscriptionCharges(sub, "2026-04-15")).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  });
  it("26. não gera de novo o que já foi gerado", () => {
    expect(pendingSubscriptionCharges({ ...sub, generated_through: "2026-02-28" }, "2026-04-15")).toEqual(["2026-03-31"]);
    expect(pendingSubscriptionCharges({ ...sub, generated_through: "2026-03-31" }, "2026-04-15")).toEqual([]);
  });
  it("25. pausada/cancelada não gera; término respeitado; próxima cobrança", () => {
    expect(pendingSubscriptionCharges({ ...sub, status: "pausada" }, "2026-04-15")).toEqual([]);
    expect(pendingSubscriptionCharges({ ...sub, status: "cancelada" }, "2026-04-15")).toEqual([]);
    expect(pendingSubscriptionCharges({ ...sub, end_date: "2026-02-28" }, "2026-04-15")).toEqual(["2026-01-31", "2026-02-28"]);
    expect(nextSubscriptionCharge({ ...sub, generated_through: "2026-03-31" }, "2026-04-15")).toBe("2026-04-30");
    expect(nextSubscriptionCharge({ ...sub, status: "cancelada" }, "2026-04-15")).toBeNull();
  });
});

describe("21–24, 27–28. faturas, pagamentos e relatórios", () => {
  const inv = (id: string, month: string, charge: string | null): CardInvoice => {
    const d = invoiceCycleDates(month, 20, 27);
    return { id, space_id: "s", card_id: "nu", reference_month: month, closing_date: d.closingDate, due_date: d.dueDate, charge_id: charge, created_at: "", updated_at: "" };
  };
  const item = (id: string, invoice: string, amount: number, purchase = "p1", type: CardPurchaseItem["item_type"] = "parcela"): CardPurchaseItem => ({ id, space_id: "s", purchase_id: purchase, invoice_id: invoice, item_type: type, installment_number: 1, installment_total: 1, amount, description: null, status: "ativo", created_by: "u", created_at: "2026-11-08T12:00:00Z" });
  const purchase: CardPurchase = { id: "p1", space_id: "s", card_id: "nu", description: "Compras", category_id: null, purchase_date: "2026-11-08", purchase_type: "avista", total_amount: 850, installment_count: 1, first_invoice_month: "2026-11-01", subscription_id: null, subscription_date: null, status: "ativa", notes: null, converted_from_origin_id: null, created_by: "u", created_at: "", updated_at: "" };
  const data: CardsData = { available: true, cards: [card()], invoices: [inv("i1", "2026-11-01", "ch1"), inv("i2", "2026-12-01", "ch2")], purchases: [purchase], items: [item("a", "i1", 850), item("b", "i2", 200, "p2")], subscriptions: [], events: [] };
  const charges = [{ id: "ch1", amount: 850, status: "ativo", kind: "saida", due_date: "2026-11-27", card_invoice_id: "i1" }, { id: "ch2", amount: 200, status: "ativo", kind: "saida", due_date: "2026-12-27", card_invoice_id: "i2" }];

  it("22. pagamento parcial: 850 − 500 = 350 restante; 21. integral quita", () => {
    const partial = buildInvoiceView(card(), "2026-11-01", data, charges, [{ charge_id: "ch1", amount: 500 }], "2026-11-25");
    expect(partial).toMatchObject({ total: 850, paid: 500, remaining: 350, status: "parcial" });
    const full = buildInvoiceView(card(), "2026-11-01", data, charges, [{ charge_id: "ch1", amount: 500 }, { charge_id: "ch1", amount: 350 }], "2026-11-25");
    expect(full).toMatchObject({ remaining: 0, status: "paga" });
    expect(buildInvoiceView(card(), "2026-11-01", data, charges, [], "2026-11-28").status).toBe("vencida");
    expect(buildInvoiceView(card(), "2026-11-01", data, charges, [], "2026-11-10").status).toBe("aberta");
    expect(buildInvoiceView(card(), "2026-11-01", data, charges, [], "2026-11-22").status).toBe("fechada");
  });

  it("23. estorno abate a fatura", () => {
    const withCredit = { ...data, items: [...data.items, item("c", "i1", -50, "p1", "estorno")] };
    expect(buildInvoiceView(card(), "2026-11-01", withCredit, [{ id: "ch1", amount: 800 }], [], "2026-11-10").total).toBe(800);
  });

  it("limite: usado = tudo que ainda não foi pago; disponível = limite − usado", () => {
    const s = cardSummary(card(), data, charges, [{ charge_id: "ch1", amount: 500 }], "2026-11-10");
    expect(s).toMatchObject({ limitUsed: 550, limitAvailable: 4450, owed: 550, paidTotal: 500, nextDueDate: "2026-11-27" });
    expect(s.current.month).toBe("2026-11-01");
    expect(s.next.month).toBe("2026-12-01");
    expect(s.spentThisMonth).toBe(850);
  });

  it("24. pagar ao titular: abate a fatura mais antiga primeiro, parcial, nunca acima do devido", () => {
    const open = [{ chargeId: "b", dueDate: "2026-12-12", remaining: 160 }, { chargeId: "a", dueDate: "2026-11-12", remaining: 160 }];
    expect(allocateHolderPayment(open, 200).allocations).toEqual([{ chargeId: "a", amount: 160 }, { chargeId: "b", amount: 40 }]);
    expect(allocateHolderPayment(open, 400).error).toMatch(/maior do que você deve/);
  });

  it("27–28. compra no cartão não é saída de dinheiro; o pagamento da fatura é (uma vez só)", () => {
    const payments = [{ charge_id: "ch1", amount: 500, payment_date: "2026-11-25" }, { charge_id: "luz", amount: 120, payment_date: "2026-11-10" }];
    const r = cardMonthReport("2026-11", data, [...charges, { id: "luz", amount: 120, status: "ativo", kind: "saida", due_date: "2026-11-10" }], payments, "2026-11-26");
    expect(r).toEqual({ purchases: 850, invoicePayments: 500, cashOut: 620, futureDebt: 200 + 350 });
  });
});
