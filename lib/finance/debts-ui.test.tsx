import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { FinancialCharge, FinancialPayment } from "@/types/database.types";

/** Painel de Dívidas (SSR, sem navegador). Toque real no celular = verificação manual. */
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined, push: () => undefined }) }));
const noop = async () => ({});
vi.mock("@/lib/supabase/debt-actions", () => new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : noop) }));
vi.mock("@/lib/supabase/financial-actions", () => new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : noop) }));
vi.mock("@/lib/supabase/financial-personal-link-actions", () => new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : noop) }));

const { DebtsPanel } = await import("@/components/financeiro/debts/debts-panel");

const perms = { canCreate: true, canEdit: true, canDelete: true };
const charge = (over: Partial<FinancialCharge> = {}): FinancialCharge => {
  const base = {
    id: "d1", space_id: "s", origin_id: "o", kind: "saida" as const, description: "Dívida — Ex-sócio G", client_id: null, client_service_id: null,
    reference_type_id: null, category_id: null, supplier_name: "G", installment_number: null, installment_total: null,
    original_amount: 1000, discount_amount: 0, addition_amount: 0, due_date: "2026-10-20", competency_date: null,
    status: "ativo" as const, notes: null, created_by: "u", updated_by: null, created_at: "", updated_at: "", ...over,
  };
  return { ...base, amount: base.original_amount - base.discount_amount + base.addition_amount };
};
const pay = (id: string, amount: number, date: string, charge_id = "d1"): FinancialPayment => ({
  id, space_id: "s", charge_id, amount, payment_date: date, payment_method: "pix", account_id: null, notes: null, created_by: "u", created_at: "", updated_at: "",
});
const render = (charges: FinancialCharge[], payments: FinancialPayment[]) =>
  renderToStaticMarkup(<DebtsPanel scope="visionario" charges={charges} payments={payments} accounts={[]} permissions={perms} />).replace(/ /g, " ");

describe("painel de Dívidas", () => {
  it("registro real com desconto do 'Quitar': mostra 1.000 / 525 / 475 / 52,5% e pede restauração", () => {
    const html = render([charge({ discount_amount: 475 })], [pay("a", 172, "2026-10-20"), pay("b", 353, "2026-11-10")]);
    expect(html).toContain(">R$ 1.000,00<");
    expect(html).toContain(">R$ 525,00<");
    expect(html).toContain(">R$ 475,00<");
    expect(html).toContain(">52,5%<");
    expect(html).toContain("Restaurar valor original");
    expect(html).toContain('aria-valuenow="52.5"');
    expect(html).toContain(">Pendente<");
    expect(html).not.toContain("Cadastrar Ex-sócio G"); // já cadastrada
  });

  it("separa pendentes e quitadas (padrão: pendentes)", () => {
    const html = render(
      [charge(), charge({ id: "d2", description: "Dívida — Empréstimo Ana", original_amount: 200 })],
      [pay("a", 172, "2026-10-20"), pay("c", 200, "2026-11-01", "d2")]
    );
    expect(html).toContain("Pendentes (1)");
    expect(html).toContain("Quitadas (1)");
    expect(html).toContain("Ex-sócio G");
    expect(html).not.toContain("Empréstimo Ana"); // quitada fica no filtro "Quitadas"
    expect(html).toContain(">17,2%<");
  });

  it("sem dívidas: oferece cadastrar (e a do ex-sócio no Visionário Dev)", () => {
    const html = render([], []);
    expect(html).toContain("Nenhuma dívida cadastrada.");
    expect(html).toContain("Nova dívida");
    expect(html).toContain("Cadastrar Ex-sócio G");
  });
});
