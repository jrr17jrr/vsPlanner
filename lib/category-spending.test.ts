import { describe, expect, it } from "vitest";
import { isInternalTransferCategory, monthRange, previousRange, shiftMonth, summarizeSpending, UNCATEGORIZED, yearRange } from "./category-spending";
import type { FinancialCategory, FinancialCharge, FinancialOrigin, FinancialPayment } from "@/types/database.types";

const cat = (id: string, name: string, kind: "entrada" | "saida" = "saida") => ({ id, name, kind, space_id: "pessoal", is_active: true, created_by: "u", created_at: "", updated_at: "" }) as FinancialCategory;
let n = 0;
function charge(over: Partial<FinancialCharge>): FinancialCharge {
  n++;
  return {
    id: over.id ?? `c${n}`, space_id: "pessoal", origin_id: over.origin_id ?? `o${n}`, kind: "saida", description: `Despesa ${n}`, client_id: null, client_service_id: null,
    reference_type_id: null, category_id: null, supplier_name: null, installment_number: null, installment_total: null, original_amount: 0, discount_amount: 0,
    addition_amount: 0, amount: 0, due_date: "2026-10-10", competency_date: null, status: "ativo", notes: null, created_by: "u", updated_by: null, created_at: "", updated_at: "",
    ...over,
  } as FinancialCharge;
}
const pay = (charge_id: string, amount: number, payment_date: string, payment_method = "pix") => ({ id: `p-${charge_id}-${payment_date}`, space_id: "pessoal", charge_id, amount, payment_date, payment_method, account_id: "a", notes: null, created_by: "u", created_at: "", updated_at: "" }) as FinancialPayment;

const categories = [cat("ali", "Alimentação"), cat("cur", "Cursos"), cat("tra", "Transferência entre contas"), cat("sal", "Salário", "entrada")];
const OCT = monthRange("2026-10"), NOV = monthRange("2026-11");

const charges = [
  charge({ id: "rest", description: "Restaurante", category_id: "ali", amount: 40, due_date: "2026-10-03" }),
  charge({ id: "lanche", description: "Lanche", category_id: "ali", amount: 25, due_date: "2026-10-15" }),
  charge({ id: "merc", description: "Mercado", category_id: "ali", amount: 150, due_date: "2026-10-20" }),
  charge({ id: "curso", description: "Curso", category_id: "cur", amount: 120, due_date: "2026-10-05", origin_id: "rec" }),
  charge({ id: "sal", kind: "entrada", description: "Salário", category_id: "sal", amount: 5000, due_date: "2026-10-05" }),
  charge({ id: "canc", description: "Cancelada", category_id: "ali", amount: 999, due_date: "2026-10-06", status: "cancelado" }),
  charge({ id: "transf", description: "Para poupança", category_id: "tra", amount: 1000, due_date: "2026-10-07" }),
  charge({ id: "semcat", description: "Sem categoria", amount: 10, due_date: "2026-10-08" }),
  charge({ id: "nov-ali", description: "Mercado nov", category_id: "ali", amount: 300, due_date: "2026-11-02" }),
  charge({ id: "comp", description: "Fatura de outubro paga em novembro", category_id: "cur", amount: 80, due_date: "2026-11-10", competency_date: "2026-10-01" }),
];
const payments = [pay("rest", 40, "2026-10-03", "debito"), pay("merc", 100, "2026-10-21"), pay("merc", 50, "2026-11-01", "credito"), pay("comp", 80, "2026-11-10")];
const origins = [{ id: "rec", origin_type: "recorrente" }] as FinancialOrigin[];
const input = { charges, payments, categories, origins };

describe("gastos por categoria — exemplo do pedido", () => {
  const s = summarizeSpending(input, { ...OCT, basis: "competencia" }, NOV);
  it("Alimentação = R$215 (40 + 25 + 150), cancelada fora", () => {
    expect(s.categories.find((c) => c.categoryId === "ali")?.total).toBe(215);
  });
  it("Curso de R$120 entra em Cursos (+ R$80 de competência outubro)", () => {
    expect(s.categories.find((c) => c.categoryId === "cur")?.total).toBe(200);
  });
  it("receitas nunca entram; transferência entre contas fica fora e é informada", () => {
    expect(s.total).toBe(215 + 200 + 10);
    expect(s.categories.some((c) => c.categoryId === "sal" || c.categoryId === "tra")).toBe(false);
    expect(s.excludedTransfers).toBe(1000);
  });
  it("percentuais somam 100% e a ordem é do maior para o menor", () => {
    const visible = s.categories.filter((c) => c.total > 0);
    expect(visible.map((c) => c.categoryId)).toEqual(["ali", "cur", null]);
    expect(Math.round(visible.reduce((a, c) => a + c.pct, 0))).toBe(100);
  });
  it("sem categoria aparece agrupado", () => {
    expect(s.categories.find((c) => c.categoryId === null)?.name).toBe("Sem categoria");
  });
});

describe("filtros", () => {
  it("mês: outubro x novembro com comparação", () => {
    const nov = summarizeSpending(input, { ...NOV, basis: "competencia" }, OCT);
    expect(nov.total).toBe(300);
    expect(nov.previousTotal).toBe(425);
    const ali = nov.categories.find((c) => c.categoryId === "ali")!;
    expect(ali.previousTotal).toBe(215);
    expect(ali.change).toBeCloseTo(((300 - 215) / 215) * 100);
  });
  it("somente pagas: pela data do pagamento, sem duplicar pagamento parcial em competência", () => {
    const paidOct = summarizeSpending(input, { ...OCT, basis: "pago" }, null);
    expect(paidOct.total).toBe(140); // 40 restaurante + 100 da 1ª parte do mercado
    const paidNov = summarizeSpending(input, { ...NOV, basis: "pago" }, null);
    expect(paidNov.total).toBe(130); // 50 resto do mercado + 80 fatura
    const comp = summarizeSpending(input, { ...OCT, basis: "competencia" }, null);
    expect(comp.entries.filter((e) => e.charge.id === "merc")).toHaveLength(1);
    expect(comp.entries.find((e) => e.charge.id === "merc")?.paymentMethods.sort()).toEqual(["credito", "pix"]);
  });
  it("categoria e tipo de lançamento", () => {
    expect(summarizeSpending(input, { ...OCT, basis: "competencia", categoryId: "ali" }, null).total).toBe(215);
    expect(summarizeSpending(input, { ...OCT, basis: "competencia", categoryId: UNCATEGORIZED }, null).total).toBe(10);
    expect(summarizeSpending(input, { ...OCT, basis: "competencia", originType: "recorrente" }, null).total).toBe(120);
  });
  it("ano e período personalizado", () => {
    expect(summarizeSpending(input, { ...yearRange(2026), basis: "competencia" }, null).total).toBe(725);
    expect(summarizeSpending(input, { from: "2026-10-01", to: "2026-10-10", basis: "competencia" }, null).total).toBe(40 + 120 + 10 + 80);
  });
  it("editar ou excluir um lançamento muda o total na hora (nada fica gravado)", () => {
    const edited = charges.map((c) => (c.id === "lanche" ? { ...c, amount: 35 } : c)).filter((c) => c.id !== "rest");
    const s = summarizeSpending({ ...input, charges: edited }, { ...OCT, basis: "competencia" }, null);
    expect(s.categories.find((c) => c.categoryId === "ali")?.total).toBe(185);
  });
});

describe("períodos", () => {
  it("monthRange respeita meses de 28-31 dias", () => {
    expect(monthRange("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(monthRange("2026-10").to).toBe("2026-10-31");
  });
  it("shiftMonth e período anterior do mesmo tamanho", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(previousRange("2026-10-11", "2026-10-20")).toEqual({ from: "2026-10-01", to: "2026-10-10" });
  });
  it("só nomes explícitos de transferência interna são excluídos", () => {
    expect(isInternalTransferCategory("Transferência entre contas")).toBe(true);
    expect(isInternalTransferCategory("Transferencia interna")).toBe(true);
    expect(isInternalTransferCategory("Transporte")).toBe(false);
    expect(isInternalTransferCategory("Pix")).toBe(false);
  });
});
