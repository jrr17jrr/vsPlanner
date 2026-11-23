import type { FinancialCharge, FinancialPayment } from "@/types/database.types";

/**
 * Dívidas (controle separado das despesas mensais, com pagamentos parciais).
 *
 * Uma dívida é uma cobrança de SAÍDA cuja descrição começa com
 * `DEBT_PREFIX` ("Dívida — <nome>") — o mesmo formato da dívida histórica
 * "Dívida — Ex-sócio G", então nenhuma migration é necessária. Ela fica fora
 * de "A pagar"/"Atrasado" (ver `isOpenEndedDebt` em lib/financial-calc.ts),
 * mas os pagamentos continuam sendo saída de caixa normal.
 *
 * REGRA DOS NÚMEROS (única, usada no painel, no dashboard e nos testes):
 *  - Total     = valor ORIGINAL cadastrado (`original_amount`) — nunca a soma
 *                dos pagamentos e nunca reduzido por um "quitar com desconto";
 *  - Pago      = soma dos pagamentos registrados;
 *  - Restante  = Total − Pago (mínimo 0);
 *  - Progresso = Pago ÷ Total × 100 (máximo 100);
 *  - Quitada   = somente quando Restante = 0.
 */
export const DEBT_PREFIX = "Dívida — ";

const cents = (v: number) => Math.round(v * 100) / 100;

export function isDebtCharge(charge: Pick<FinancialCharge, "kind" | "description">): boolean {
  return charge.kind === "saida" && charge.description.trim().startsWith(DEBT_PREFIX);
}

/** "Dívida — Ex-sócio G" → "Ex-sócio G". */
export function debtName(description: string): string {
  const d = description.trim();
  return d.startsWith(DEBT_PREFIX) ? d.slice(DEBT_PREFIX.length).trim() : d;
}

export function debtDescription(name: string): string {
  return `${DEBT_PREFIX}${name.trim()}`;
}

export type DebtSummary = {
  total: number;
  paid: number;
  remaining: number;
  /** 0..100, com uma casa decimal (52,5%). */
  percent: number;
  status: "pendente" | "quitada";
  /** Pagamentos da dívida, mais recentes primeiro. */
  payments: FinancialPayment[];
  /**
   * Desconto/acréscimo gravado na cobrança (ex.: um pagamento parcial
   * registrado com "Quitar" ligado). Não entra no Total, mas precisa ser
   * corrigido para que novos pagamentos sejam aceitos pelo banco.
   */
  adjustment: number;
};

export function debtSummary(
  charge: Pick<FinancialCharge, "id" | "original_amount" | "discount_amount" | "addition_amount">,
  allPayments: FinancialPayment[]
): DebtSummary {
  const payments = allPayments
    .filter((p) => p.charge_id === charge.id)
    .sort((a, b) => b.payment_date.localeCompare(a.payment_date) || b.created_at.localeCompare(a.created_at));
  const total = cents(Number(charge.original_amount));
  const paid = cents(payments.reduce((s, p) => s + Number(p.amount), 0));
  const remaining = Math.max(0, cents(total - paid));
  const percent = total > 0 ? Math.min(100, Math.round((paid / total) * 1000) / 10) : 0;
  return {
    total,
    paid,
    remaining,
    percent,
    status: total > 0 && remaining === 0 ? "quitada" : "pendente",
    payments,
    adjustment: cents(Number(charge.discount_amount ?? 0) + Number(charge.addition_amount ?? 0)),
  };
}

/** "52,5%" / "100%". */
export function formatPercent(percent: number): string {
  return `${percent.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

/**
 * Valida o valor de um pagamento (novo ou editado). `otherPaid` = soma dos
 * DEMAIS pagamentos da dívida. Pagamento acima do saldo é recusado — nunca
 * vira acréscimo nem saldo negativo.
 */
export function validateDebtPayment(total: number, otherPaid: number, amount: number): string | null {
  if (!Number.isFinite(amount) || amount <= 0) return "Informe um valor maior que zero.";
  const remaining = cents(total - otherPaid);
  if (remaining <= 0) return "Esta dívida já está quitada.";
  if (cents(amount) > remaining) {
    return `O valor passa do saldo restante (${remaining.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}).`;
  }
  return null;
}

/** Novo valor original: obrigatório, positivo e nunca abaixo do que já foi pago. */
export function validateDebtTotal(total: number, paid: number): string | null {
  if (!Number.isFinite(total) || total <= 0) return "Informe o valor original da dívida.";
  if (cents(total) < cents(paid)) {
    return `O valor original não pode ser menor que o total já pago (${paid.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}).`;
  }
  return null;
}
