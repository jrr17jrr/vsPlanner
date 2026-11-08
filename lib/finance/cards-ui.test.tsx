import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CardsData, CreditCard } from "./credit-card";
import type { FinancialCharge, FinancialPayment } from "@/types/database.types";

/**
 * Telas (SSR, sem navegador) do Financeiro Pessoal: prévia do parcelamento,
 * painel de cartões (próprio e de terceiro), assinaturas, relatório e a
 * fatura em A pagar. Toque real no celular fica como verificação manual.
 */
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined, push: () => undefined }) }));
const noop = async () => ({});
vi.mock("@/lib/supabase/credit-card-actions", () => new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : noop) }));
vi.mock("@/lib/supabase/installment-actions", () => new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : noop) }));
vi.mock("@/lib/supabase/financial-actions", () => new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : noop) }));
vi.mock("@/lib/supabase/financial-personal-link-actions", () => new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : noop) }));

const { InstallmentPreview, ValueModeToggle, FirstDueField } = await import("@/components/financeiro/installments/installment-fields");
const { CardsPanel } = await import("@/components/financeiro/cards/cards-panel");
const { ChargesList } = await import("@/components/visionario/financeiro/charges-list");
const { buildInstallmentPlan } = await import("./installments");
const { invoiceCycleDates, currentInvoiceMonth } = await import("./credit-card");
const { todayKeySaoPaulo } = await import("@/lib/format");

const TODAY = todayKeySaoPaulo();
const perms = { canCreate: true, canEdit: true, canDelete: true };
const card = (over: Partial<CreditCard>): CreditCard => ({
  id: "nu", space_id: "s", name: "Meu Nubank", bank: "Nubank", holder_name: null, ownership: "proprio", nickname: null, last4: "1234",
  credit_limit: 5000, closing_day: 20, due_day: 27, color: "#8b5cf6", status: "ativo", created_by: "u", created_at: "", updated_at: "", ...over,
});
const month = currentInvoiceMonth(card({}), TODAY);
const dates = invoiceCycleDates(month, 20, 27);
const charge = (over: Partial<FinancialCharge>): FinancialCharge => ({
  id: "ch", space_id: "s", origin_id: "o", kind: "saida", description: "Fatura Meu Nubank", client_id: null, client_service_id: null, reference_type_id: null,
  category_id: null, supplier_name: null, installment_number: null, installment_total: null, original_amount: 850, discount_amount: 0, addition_amount: 0, amount: 850,
  due_date: dates.dueDate, competency_date: month, status: "ativo", notes: null, created_by: "u", updated_by: null, created_at: "", updated_at: "", ...over,
});
const data: CardsData = {
  available: true,
  cards: [card({}), card({ id: "cun", name: "Cartão do cunhado", ownership: "terceiro", holder_name: "Cunhado", last4: null, closing_day: 5, due_day: 12 })],
  invoices: [{ id: "inv", space_id: "s", card_id: "nu", reference_month: month, closing_date: dates.closingDate, due_date: dates.dueDate, charge_id: "ch", created_at: "", updated_at: "" }],
  purchases: [{ id: "ps5", space_id: "s", card_id: "nu", description: "PS5", category_id: null, purchase_date: TODAY, purchase_type: "parcelada", total_amount: 3500, installment_count: 10, first_invoice_month: month, subscription_id: null, subscription_date: null, status: "ativa", notes: null, converted_from_origin_id: null, created_by: "u", created_at: "", updated_at: "" }],
  items: [{ id: "it1", space_id: "s", purchase_id: "ps5", invoice_id: "inv", item_type: "parcela", installment_number: 1, installment_total: 10, amount: 350, description: null, status: "ativo", created_by: "u", created_at: `${TODAY}T12:00:00Z` }],
  subscriptions: [{ id: "net", space_id: "s", card_id: "nu", description: "Netflix", category_id: null, amount: 39.9, billing_day: 15, start_date: "2026-01-15", end_date: null, status: "ativa", generated_through: null, notes: null, created_by: "u", created_at: "", updated_at: "" }],
  events: [],
};
const payments: FinancialPayment[] = [{ id: "pay", space_id: "s", charge_id: "ch", amount: 200, payment_date: TODAY, payment_method: "pix", account_id: "acc", notes: null, created_by: "u", created_at: "", updated_at: "" }];

describe("1–5. cadastro de parcelamento: escolha do valor, primeiro vencimento e prévia", () => {
  it("mostra as duas formas de informar o valor e os atalhos de vencimento", () => {
    const html = renderToStaticMarkup(<><ValueModeToggle mode="total" onChange={() => {}} /><FirstDueField value="2026-12-10" onChange={() => {}} today="2026-11-08" /></>);
    expect(html).toContain("Como deseja informar o valor?");
    expect(html).toContain("Valor total da dívida");
    expect(html).toContain("Valor de cada parcela");
    expect(html).toContain("Primeiro vencimento");
    expect(html).toContain("Este mês");
    expect(html).toContain("Próximo mês");
  });
  it("prévia: total, quantidade, valor individual, 1º e último vencimento e cada parcela", () => {
    const plan = buildInstallmentPlan({ mode: "total", amount: 900, count: 3, firstDue: "2026-12-10" });
    const html = renderToStaticMarkup(<InstallmentPreview plan={plan} />);
    expect(html).toMatch(/R\$\s900,00/);
    expect(html).toContain("3x");
    expect(html).toContain("10/12/2026");
    expect(html).toContain("10/02/2027");
    expect((html.match(/Parcela \d\/3/g) ?? []).length).toBe(3);
  });
});

describe("12–24, 31. painel de cartões", () => {
  const html = renderToStaticMarkup(<CardsPanel data={data} charges={[charge({ card_invoice_id: "inv" })]} payments={payments} accounts={[]} categories={[]} permissions={perms} />);
  it("lista cartões próprio e de terceiro em faixa rolável (mobile) e mostra a fatura atual", () => {
    expect(html).toContain("Meu Nubank •••• 1234");
    expect(html).toContain("Cartão do cunhado");
    expect(html).toContain("Terceiro · Cunhado");
    expect(html).toContain("overflow-x-auto");
    expect(html).toContain("Fatura atual");
    expect(html).toContain("Limite disponível");
  });
  it("fatura: compra, parcela 1/10, total, pago, restante e botão Pagar fatura", () => {
    expect(html).toContain("PS5");
    expect(html).toContain("Parcela 1/10");
    expect(html).toContain("Total da fatura");
    expect(html).toMatch(/R\$\s650,00/);
    expect(html).toContain("Pagar fatura");
    expect(html).toContain("Paga parcialmente");
    expect(html).toContain("Desfazer");
  });
  it("migração pendente: avisa sem quebrar o Financeiro", () => {
    const pending = renderToStaticMarkup(<CardsPanel data={{ ...data, available: false }} charges={[]} payments={[]} accounts={[]} categories={[]} permissions={perms} />);
    expect(pending).toContain("20261113100000_installments_credit_cards.sql");
  });
});

describe("19. integração com A pagar", () => {
  it("fatura do cartão aparece como conta a pagar, marcada e sem edição manual de valor", () => {
    const html = renderToStaticMarkup(
      <ChargesList scope="pessoal" kind="saida" charges={[charge({ card_invoice_id: "inv" })]} payments={payments} accounts={[]} clients={[]} categories={[]} referenceTypes={[]} origins={[]} permissions={perms} selectedMonth={month.slice(0, 7)} cards={data.cards} />
    );
    expect(html).toContain("Fatura Meu Nubank");
    expect(html).toContain("fatura de cartão");
  });
});
