import { describe, expect, it } from "vitest";
import {
  DEBT_PREFIX,
  debtDescription,
  debtName,
  debtSummary,
  formatPercent,
  isDebtCharge,
  validateDebtPayment,
  validateDebtTotal,
} from "@/lib/finance/debts";
import { FORMER_PARTNER_DEBT_DESCRIPTION, financialMonthOverview, isOpenEndedDebt } from "@/lib/financial-calc";
import type { FinancialAccount, FinancialCharge, FinancialPayment } from "@/types/database.types";

function charge(over: Partial<FinancialCharge> = {}): FinancialCharge {
  const original = over.original_amount ?? 1000;
  const discount = over.discount_amount ?? 0;
  const addition = over.addition_amount ?? 0;
  return {
    id: "d1", space_id: "s", origin_id: "o", kind: "saida", description: FORMER_PARTNER_DEBT_DESCRIPTION,
    client_id: null, client_service_id: null, reference_type_id: null, category_id: null, supplier_name: "G",
    installment_number: null, installment_total: null, due_date: "2026-10-20", competency_date: null,
    status: "ativo", notes: null, created_by: "u", updated_by: null, created_at: "", updated_at: "",
    ...over,
    original_amount: original, discount_amount: discount, addition_amount: addition,
    amount: original - discount + addition,
  };
}
let seq = 0;
const pay = (amount: number, date: string, over: Partial<FinancialPayment> = {}): FinancialPayment => ({
  id: `p${++seq}`, space_id: "s", charge_id: "d1", amount, payment_date: date, payment_method: "pix",
  account_id: null, notes: null, created_by: "u", created_at: `${date}T12:00:00Z`, updated_at: "", ...over,
});
const view = (s: ReturnType<typeof debtSummary>) => ({ total: s.total, paid: s.paid, remaining: s.remaining, percent: formatPercent(s.percent), status: s.status });

describe("dívidas — cálculo (total = valor original)", () => {
  const debt = charge();
  const p172 = pay(172, "2026-10-20");
  const p353 = pay(353, "2026-11-10");

  it("cenário 1 — sem pagamentos", () => {
    expect(view(debtSummary(debt, []))).toEqual({ total: 1000, paid: 0, remaining: 1000, percent: "0%", status: "pendente" });
  });
  it("cenário 2 — R$ 172", () => {
    expect(view(debtSummary(debt, [p172]))).toEqual({ total: 1000, paid: 172, remaining: 828, percent: "17,2%", status: "pendente" });
  });
  it("cenário 3 — + R$ 353", () => {
    expect(view(debtSummary(debt, [p172, p353]))).toEqual({ total: 1000, paid: 525, remaining: 475, percent: "52,5%", status: "pendente" });
  });
  it("cenário 4 — + R$ 100", () => {
    expect(view(debtSummary(debt, [p172, p353, pay(100, "2026-11-20")]))).toEqual({ total: 1000, paid: 625, remaining: 375, percent: "62,5%", status: "pendente" });
  });
  it("cenário 5 — quitação completa", () => {
    expect(view(debtSummary(debt, [p172, p353, pay(475, "2026-11-25")]))).toEqual({ total: 1000, paid: 1000, remaining: 0, percent: "100%", status: "quitada" });
  });

  it("caso real Ex-sócio G: o 'Quitar' gravou R$ 475 de desconto — o total continua R$ 1.000", () => {
    const corrupted = charge({ discount_amount: 475 });
    expect(corrupted.amount).toBe(525); // o que a tela antiga mostrava como Total
    const s = debtSummary(corrupted, [p172, p353]);
    expect(view(s)).toEqual({ total: 1000, paid: 525, remaining: 475, percent: "52,5%", status: "pendente" });
    expect(s.adjustment).toBe(475); // painel pede "Restaurar valor original"
  });

  it("editar e excluir pagamento recalculam tudo", () => {
    const edited = { ...p353, amount: 300 };
    expect(view(debtSummary(debt, [p172, edited]))).toMatchObject({ paid: 472, remaining: 528, percent: "47,2%" });
    expect(view(debtSummary(debt, [p172]))).toMatchObject({ paid: 172, remaining: 828 });
  });

  it("ignora pagamentos de outras cobranças e ordena o histórico (mais recente primeiro)", () => {
    const other = pay(999, "2026-11-01", { charge_id: "outra" });
    const s = debtSummary(debt, [p172, other, p353]);
    expect(s.paid).toBe(525);
    expect(s.payments.map((p) => p.amount)).toEqual([353, 172]);
  });

  it("centavos sem erro de ponto flutuante", () => {
    const s = debtSummary(charge({ original_amount: 100 }), [pay(33.33, "2026-11-01"), pay(33.33, "2026-11-02"), pay(33.34, "2026-11-03")]);
    expect(s).toMatchObject({ paid: 100, remaining: 0, percent: 100, status: "quitada" });
  });
});

describe("dívidas — validação", () => {
  it("pagamento acima do saldo é recusado (nunca saldo negativo)", () => {
    expect(validateDebtPayment(1000, 525, 475)).toBeNull();
    expect(validateDebtPayment(1000, 525, 475.01)).toMatch(/passa do saldo/);
    expect(validateDebtPayment(1000, 1000, 1)).toMatch(/já está quitada/);
    expect(validateDebtPayment(1000, 0, 0)).toMatch(/maior que zero/);
  });
  it("editar pagamento considera só os DEMAIS pagamentos", () => {
    // 172 + 353 pagos; editar o de 353 para 828 é o máximo permitido.
    expect(validateDebtPayment(1000, 172, 828)).toBeNull();
    expect(validateDebtPayment(1000, 172, 829)).not.toBeNull();
  });
  it("valor original não pode ficar abaixo do já pago", () => {
    expect(validateDebtTotal(1000, 525)).toBeNull();
    expect(validateDebtTotal(500, 525)).toMatch(/menor que o total já pago/);
    expect(validateDebtTotal(0, 0)).not.toBeNull();
  });
});

describe("dívidas — identificação e separação das despesas mensais", () => {
  it("nome ↔ descrição", () => {
    expect(debtName(FORMER_PARTNER_DEBT_DESCRIPTION)).toBe("Ex-sócio G");
    expect(debtDescription("  Empréstimo Ana ")).toBe(`${DEBT_PREFIX}Empréstimo Ana`);
  });
  it("toda 'Dívida — …' de saída é dívida (e fica fora de A pagar)", () => {
    expect(isDebtCharge({ kind: "saida", description: "Dívida — Empréstimo Ana" })).toBe(true);
    expect(isOpenEndedDebt({ kind: "saida", description: FORMER_PARTNER_DEBT_DESCRIPTION })).toBe(true);
    expect(isDebtCharge({ kind: "entrada", description: "Dívida — X" })).toBe(false);
    expect(isDebtCharge({ kind: "saida", description: "Dívidas antigas" })).toBe(false);

    const account = { id: "acc", space_id: "s", name: "Conta", initial_balance: 0, initial_balance_date: "2026-01-01", is_active: true } as FinancialAccount;
    const bill = charge({ id: "bill", description: "Internet", original_amount: 100, due_date: "2026-11-10" });
    const newDebt = charge({ id: "d2", description: "Dívida — Empréstimo Ana", original_amount: 300, due_date: "2026-11-01" });
    const o = financialMonthOverview([account], [bill, newDebt], [], "2026-11-15");
    expect(o.aPagar.total).toBe(100);
  });
});
