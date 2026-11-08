import { describe, expect, it } from "vitest";
import {
  buildInstallmentPlan,
  firstDueShortcut,
  followCompetency,
  installmentDescription,
  installmentSummary,
  planReplan,
  planReschedule,
  type ExistingInstallment,
} from "./installments";

const sum = (xs: number[]) => Math.round(xs.reduce((s, x) => s + x, 0) * 100) / 100;
const debt = (amounts: number[], dues: string[], paid: number[] = []): ExistingInstallment[] =>
  amounts.map((amount, i) => ({ id: `c${i + 1}`, number: i + 1, dueDate: dues[i], amount, paid: paid[i] ?? 0, cancelled: false }));

describe("1–5. cadastro de parcelamento", () => {
  it("1. valor total: 976,00 em 3x soma exatamente 976,00", () => {
    const plan = buildInstallmentPlan({ mode: "total", amount: 976, count: 3, firstDue: "2026-12-10" })!;
    expect(plan.installments.map((i) => i.amount)).toEqual([325.33, 325.33, 325.34]);
    expect(plan.total).toBe(976);
  });

  it("2. valor por parcela: 325,33 × 3 = 975,99 (sem ajustar silenciosamente)", () => {
    const plan = buildInstallmentPlan({ mode: "parcela", amount: 325.33, count: 3, firstDue: "2026-12-10" })!;
    expect(plan.installments.map((i) => i.amount)).toEqual([325.33, 325.33, 325.33]);
    expect(plan.total).toBe(975.99);
    expect(plan.uniform).toBe(true);
  });

  it("3. centavos: 100,00 em 3x e 0,10 em 3x nunca perdem centavo", () => {
    expect(buildInstallmentPlan({ mode: "total", amount: 100, count: 3, firstDue: "2026-12-10" })!.installments.map((i) => i.amount)).toEqual([33.33, 33.33, 33.34]);
    const tiny = buildInstallmentPlan({ mode: "total", amount: 1000.01, count: 7, firstDue: "2026-12-10" })!;
    expect(sum(tiny.installments.map((i) => i.amount))).toBe(1000.01);
  });

  it("desconto/acréscimo incidem no total e aparecem no resumo", () => {
    const plan = buildInstallmentPlan({ mode: "total", amount: 1000, count: 4, firstDue: "2026-12-10", discount: 100, addition: 20 })!;
    expect(plan.total).toBe(920);
    expect(plan).toMatchObject({ gross: 1000, discount: 100, addition: 20 });
  });

  it("4. cadastro em 08/11 com 1º vencimento no próximo mês: 10/12, 10/01, 10/02", () => {
    const first = firstDueShortcut("2026-11-08", 10, "proximo_mes");
    expect(first).toBe("2026-12-10");
    const plan = buildInstallmentPlan({ mode: "total", amount: 900, count: 3, firstDue: first })!;
    expect(plan.installments.map((i) => [i.dueDate, i.amount])).toEqual([["2026-12-10", 300], ["2027-01-10", 300], ["2027-02-10", 300]]);
    expect(plan.firstDue).toBe("2026-12-10");
    expect(plan.lastDue).toBe("2027-02-10");
    expect(plan.installments.every((i) => i.dueDate >= first)).toBe(true);
    expect(firstDueShortcut("2026-11-08", 10, "este_mes")).toBe("2026-11-10");
  });

  it("5. qualquer data futura + meses curtos e bissexto: 31/01 → 29/02/2028 → 31/03", () => {
    const plan = buildInstallmentPlan({ mode: "total", amount: 300, count: 4, firstDue: "2028-01-31" })!;
    expect(plan.installments.map((i) => i.dueDate)).toEqual(["2028-01-31", "2028-02-29", "2028-03-31", "2028-04-30"]);
    expect(buildInstallmentPlan({ mode: "total", amount: 300, count: 2, firstDue: "2027-01-31" })!.installments[1].dueDate).toBe("2027-02-28");
    expect(firstDueShortcut("2027-01-15", 31, "proximo_mes")).toBe("2027-02-28");
  });

  it("valida quantidade e valor", () => {
    expect(buildInstallmentPlan({ mode: "total", amount: 0, count: 3, firstDue: "2026-12-10" })).toBeNull();
    expect(buildInstallmentPlan({ mode: "total", amount: 10, count: 1, firstDue: "2026-12-10" })).toBeNull();
    expect(buildInstallmentPlan({ mode: "total", amount: 0.02, count: 3, firstDue: "2026-12-10" })).toBeNull();
  });
});

describe("6–8. alterar vencimentos depois do cadastro", () => {
  const dues = ["2026-11-10", "2026-12-10", "2027-01-10", "2027-02-10"];

  it("6. somente esta parcela", () => {
    const r = planReschedule(debt([100, 100, 100, 100], dues), "c1", "2026-12-05", "somente");
    expect(r.changes).toEqual([{ id: "c1", number: 1, from: "2026-11-10", to: "2026-12-05" }]);
    expect(r.error).toBeUndefined();
  });

  it("7. esta e as próximas: 1/4 → 15/12 reorganiza 15/01, 15/02, 15/03", () => {
    const r = planReschedule(debt([100, 100, 100, 100], dues), "c1", "2026-12-15", "seguintes");
    expect(r.changes.map((c) => c.to)).toEqual(["2026-12-15", "2027-01-15", "2027-02-15", "2027-03-15"]);
  });

  it("antecipar também funciona e somente esta não pode colidir com outra parcela", () => {
    expect(planReschedule(debt([100, 100, 100, 100], dues), "c3", "2026-12-20", "seguintes").changes.map((c) => c.to)).toEqual(["2026-12-20", "2027-01-20"]);
    expect(planReschedule(debt([100, 100, 100, 100], dues), "c1", "2026-12-10", "somente").error).toMatch(/mesmo vencimento/);
  });

  it("10. parcelas quitadas nunca mudam de data; parcial pode mudar", () => {
    const items = debt([100, 100, 100, 100], dues, [100, 0, 100, 40]);
    expect(planReschedule(items, "c1", "2026-12-15", "somente").error).toMatch(/quitada/);
    const r = planReschedule(items, "c2", "2027-01-05", "seguintes");
    expect(r.changes.map((c) => c.id)).toEqual(["c2", "c4"]);
    expect(r.changes.map((c) => c.to)).toEqual(["2027-01-05", "2027-03-05"]);
  });

  it("8. primeiro vencimento: sem pagamentos reorganiza tudo", () => {
    const r = planReschedule(debt([100, 100, 100], dues), "c1", "2027-01-31", "seguintes");
    expect(r.changes.map((c) => c.to)).toEqual(["2027-01-31", "2027-02-28", "2027-03-31"]);
  });

  it("competência automática acompanha o vencimento", () => {
    expect(followCompetency("2026-11-10", "2026-11-01", "2026-12-15")).toBe("2026-12-01");
    expect(followCompetency("2026-11-10", "2026-10-01", "2026-12-15")).toBe("2026-10-01");
  });
});

describe("9–11. edição completa do parcelamento", () => {
  const dues14 = Array.from({ length: 14 }, (_, i) => `${2026 + Math.floor((10 + i) / 12)}-${String(((10 + i) % 12) + 1).padStart(2, "0")}-05`);

  it("9. 14 → 12 parcelas: remove só futuras sem pagamento, mantém o total", () => {
    const items = debt(Array(14).fill(100), dues14, [100, 100]);
    const r = planReplan(items, { count: 12, mode: "total", amount: 1400, firstPendingDue: dues14[2] });
    expect(r.error).toBeUndefined();
    expect(r.rows.filter((x) => x.action === "removida").map((x) => x.number)).toEqual([13, 14]);
    expect(r.rows.filter((x) => x.action !== "removida")).toHaveLength(12);
    expect(r.total).toBe(1400);
    expect(r.rows.slice(2, 12).every((x) => x.toAmount === 120)).toBe(true);
  });

  it("10. parcelas pagas preservam valor e data; nunca reduz abaixo da última paga", () => {
    const items = debt(Array(4).fill(250), ["2026-11-05", "2026-12-05", "2027-01-05", "2027-02-05"], [250, 0, 250]);
    const r = planReplan(items, { count: 4, mode: "parcela", amount: 300, firstPendingDue: "2027-01-20" });
    expect(r.rows[0]).toMatchObject({ action: "mantida", toAmount: 250, toDue: "2026-11-05" });
    expect(r.rows[2]).toMatchObject({ action: "mantida", toAmount: 250, toDue: "2026-01-05".replace("2026", "2027") });
    expect(r.rows[1]).toMatchObject({ toAmount: 300, toDue: "2027-01-20" });
    expect(planReplan(items, { count: 2, mode: "total", amount: 600, firstPendingDue: "2027-01-20" }).error).toMatch(/parcela 3 já tem pagamento/);
  });

  it("11. aumentar quantidade cria novas parcelas futuras; valor por parcela recalcula o total", () => {
    const items = debt([300, 300, 300], ["2026-12-10", "2027-01-10", "2027-02-10"], [300]);
    const r = planReplan(items, { count: 5, mode: "parcela", amount: 200, firstPendingDue: "2027-01-10" });
    expect(r.rows.map((x) => x.action)).toEqual(["mantida", "alterada", "alterada", "nova", "nova"]);
    expect(r.rows.map((x) => x.toDue)).toEqual(["2026-12-10", "2027-01-10", "2027-02-10", "2027-03-10", "2027-04-10"]);
    expect(r.total).toBe(1100);
  });

  it("novo total menor que o já pago é recusado; parcela cancelada volta como reativada", () => {
    const items = debt([300, 300, 300], ["2026-12-10", "2027-01-10", "2027-02-10"], [300]);
    expect(planReplan(items, { count: 3, mode: "total", amount: 200, firstPendingDue: "2027-01-10" }).error).toMatch(/maior que o valor/);
    const withCancelled = [...items.slice(0, 2), { ...items[2], cancelled: true }];
    expect(planReplan(withCancelled, { count: 3, mode: "total", amount: 900, firstPendingDue: "2027-01-10" }).rows[2].action).toBe("reativada");
  });

  it("8. painel: total, pago, restante, próximos e último vencimento", () => {
    const items = debt([300, 300, 300], ["2026-11-10", "2026-12-10", "2027-01-10"], [300, 100]);
    expect(installmentSummary(items, "2026-11-20")).toMatchObject({
      total: 900, paid: 400, remaining: 500, paidCount: 1, pendingCount: 2, nextDue: "2026-12-10", lastDue: "2027-01-10", overdueCount: 0,
    });
  });

  it("descrição acompanha a nova quantidade", () => {
    expect(installmentDescription("Empréstimo Nubank (3/14)", 3, 12)).toBe("Empréstimo Nubank (3/12)");
  });
});
