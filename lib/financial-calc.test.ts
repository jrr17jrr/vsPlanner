import { describe, expect, it } from "vitest";
import {
  FORMER_PARTNER_DEBT_DESCRIPTION,
  cashFlowForecast,
  financialMonthOverview,
  isOpenEndedDebt,
  listChargesForKind,
  pendingTotal,
  upcomingOpenCharges,
} from "./financial-calc";
import type { FinancialAccount, FinancialCharge, FinancialPayment } from "@/types/database.types";

let n = 0;
function charge(over: Partial<FinancialCharge>): FinancialCharge {
  n++;
  return {
    id: over.id ?? `c${n}`, space_id: "vd", origin_id: `o${n}`, kind: "saida", description: `Conta ${n}`, client_id: null, client_service_id: null,
    reference_type_id: null, category_id: null, supplier_name: null, installment_number: null, installment_total: null, original_amount: 0, discount_amount: 0,
    addition_amount: 0, amount: 0, due_date: "2026-11-10", competency_date: null, status: "ativo", notes: null, created_by: "u", updated_by: null, created_at: "", updated_at: "",
    ...over,
  } as FinancialCharge;
}
const pay = (charge_id: string, amount: number, payment_date: string, account_id: string | null = "acc") =>
  ({ id: `p-${charge_id}-${payment_date}`, space_id: "vd", charge_id, amount, payment_date, payment_method: "pix", account_id, notes: null, created_by: "u", created_at: "", updated_at: "" }) as FinancialPayment;
const account = { id: "acc", space_id: "vd", name: "Conta", initial_balance: 1000, initial_balance_date: "2026-01-01", is_active: true } as FinancialAccount;

const TODAY = "2026-11-03";
// Dívida cadastrada em outubro (vencimento = data do cadastro), R$ 172 já pagos.
const debt = charge({ id: "debt", description: FORMER_PARTNER_DEBT_DESCRIPTION, supplier_name: "G", amount: 1000, original_amount: 1000, due_date: "2026-10-20" });
const lateBill = charge({ id: "late", description: "Hospedagem", amount: 50, due_date: "2026-10-28" });
const monthBill = charge({ id: "month", description: "Domínio", amount: 40, due_date: "2026-11-15" });
const income = charge({ id: "in", kind: "entrada", description: "Mensalidade", amount: 500, due_date: "2026-11-05" });
const charges = [debt, lateBill, monthBill, income];
const payments = [pay("debt", 172, "2026-10-20", null), pay("debt", 100, "2026-11-02")];

describe("dívida do ex-sócio fora das contas a pagar", () => {
  it("identifica só a dívida pela descrição fixa (saída)", () => {
    expect(isOpenEndedDebt(debt)).toBe(true);
    expect(isOpenEndedDebt(lateBill)).toBe(false);
    expect(isOpenEndedDebt({ kind: "entrada", description: FORMER_PARTNER_DEBT_DESCRIPTION })).toBe(false);
  });

  it("A pagar e Atrasado incluem as outras contas, mas não o restante da dívida", () => {
    const o = financialMonthOverview([account], charges, payments, TODAY);
    expect(o.aPagar.total).toBe(90); // 50 atrasada + 40 do mês (sem os R$ 728 da dívida)
    expect(o.aPagar.overdue).toBe(50);
    expect(o.aPagar.overdueCount).toBe(1);
    expect(o.aReceber.total).toBe(500);
  });

  it("pagamentos da dívida continuam como saída de caixa (pago, resultado e saldo)", () => {
    const o = financialMonthOverview([account], charges, payments, TODAY);
    expect(o.pago).toBe(100); // pagamento de novembro
    expect(o.resultado).toBe(-100);
    expect(o.saldo).toBe(900); // R$ 172 histórico não tem conta → não mexe no saldo
  });

  it("não aparece como conta atrasada/listada nem em próximos pagamentos ou previsão", () => {
    const rows = listChargesForKind(charges, payments, "saida", TODAY);
    expect(rows.map((r) => r.charge.id)).toEqual(["late", "month"]);
    expect(rows.filter((r) => r.bucket === "atrasadas").map((r) => r.charge.id)).toEqual(["late"]);
    expect(upcomingOpenCharges(charges, payments, "saida", 5, TODAY).map((r) => r.charge.id)).toEqual(["month"]);
    expect(pendingTotal(charges, payments, "saida")).toBe(90);
    expect(cashFlowForecast([account], charges, payments, 30, TODAY).aPagar).toBe(90);
  });
});
