import type { FinancialAccount, FinancialCharge, FinancialOrigin, FinancialPayment } from "@/types/database.types";
import { toDateKey, todayKeySaoPaulo } from "@/lib/format";

/**
 * Único lugar onde o Financeiro é CALCULADO. Dashboard, gráficos, contas a
 * receber/pagar e previsão de caixa chamam estas funções — nenhum
 * componente reimplementa a conta por conta própria (senão card e gráfico
 * podem divergir). Tudo aqui é derivado de `FinancialCharge` +
 * `FinancialPayment` — pendente/parcial/pago NUNCA é um campo lido direto,
 * é sempre "soma dos pagamentos vs. valor da cobrança".
 */

export type ChargePaymentStatus = "cancelado" | "pendente" | "parcial" | "pago";

export function paidAmountFor(chargeId: string, payments: FinancialPayment[]): number {
  return payments.filter((p) => p.charge_id === chargeId).reduce((sum, p) => sum + p.amount, 0);
}

export function chargeStatus(charge: FinancialCharge, payments: FinancialPayment[]): ChargePaymentStatus {
  if (charge.status === "cancelado") return "cancelado";
  const paid = paidAmountFor(charge.id, payments);
  if (paid <= 0) return "pendente";
  if (paid >= charge.amount) return "pago";
  return "parcial";
}

export function remainingAmount(charge: FinancialCharge, payments: FinancialPayment[]): number {
  return Math.max(0, charge.amount - paidAmountFor(charge.id, payments));
}

/**
 * Saldo de uma conta: NUNCA um número guardado — sempre initial_balance +
 * pagamentos daquela conta com payment_date >= initial_balance_date
 * (entrada soma, saída subtrai). Isso é o que impede o saldo inicial de
 * aparecer como receita em qualquer relatório.
 */
export function accountBalance(
  account: FinancialAccount,
  payments: FinancialPayment[],
  chargeKindById: Map<string, "entrada" | "saida">
): number {
  return payments
    .filter((p) => p.account_id === account.id && p.payment_date >= account.initial_balance_date)
    .reduce((balance, p) => {
      const kind = chargeKindById.get(p.charge_id);
      if (kind === "entrada") return balance + p.amount;
      if (kind === "saida") return balance - p.amount;
      return balance;
    }, account.initial_balance);
}

export function totalBalance(
  accounts: FinancialAccount[],
  payments: FinancialPayment[],
  chargeKindById: Map<string, "entrada" | "saida">
): number {
  return accounts.reduce((sum, a) => sum + accountBalance(a, payments, chargeKindById), 0);
}

function buildChargeKindMap(charges: FinancialCharge[]): Map<string, "entrada" | "saida"> {
  return new Map(charges.map((c) => [c.id, c.kind]));
}

export type ReceivablePayable = {
  charge: FinancialCharge;
  status: ChargePaymentStatus;
  paid: number;
  remaining: number;
  bucket: "vence_hoje" | "proximas" | "atrasadas" | "recebida_paga";
};

/**
 * Lista de cobranças (entrada OU saída) já classificada em baldes —
 * mesma função alimenta "Contas a receber" e "Contas a pagar", só muda o
 * `kind` filtrado.
 */
export function listChargesForKind(
  charges: FinancialCharge[],
  payments: FinancialPayment[],
  kind: "entrada" | "saida",
  today: string = todayKeySaoPaulo()
): ReceivablePayable[] {
  return charges
    .filter((c) => c.kind === kind && c.status !== "cancelado")
    .map((charge) => {
      const status = chargeStatus(charge, payments);
      const paid = paidAmountFor(charge.id, payments);
      const remaining = remainingAmount(charge, payments);
      let bucket: ReceivablePayable["bucket"];
      if (status === "pago") bucket = "recebida_paga";
      else if (charge.due_date < today) bucket = "atrasadas";
      else if (charge.due_date === today) bucket = "vence_hoje";
      else bucket = "proximas";
      return { charge, status, paid, remaining, bucket };
    })
    .sort((a, b) => a.charge.due_date.localeCompare(b.charge.due_date));
}

/**
 * Previsão de caixa: saldo atual + a receber (30 dias, não recebido) - a
 * pagar (30 dias, não pago). Cada cobrança conta uma vez só (pelo
 * `remaining`, não pelo valor total) — sem double counting entre
 * parcelas/recorrências já geradas.
 */
export function cashFlowForecast(
  accounts: FinancialAccount[],
  charges: FinancialCharge[],
  payments: FinancialPayment[],
  horizonDays = 30,
  today: string = todayKeySaoPaulo()
) {
  const chargeKindById = buildChargeKindMap(charges);
  const saldoAtual = totalBalance(accounts, payments, chargeKindById);

  const [y, m, d] = today.split("-").map(Number);
  const horizon = new Date(y, m - 1, d);
  horizon.setDate(horizon.getDate() + horizonDays);
  const horizonKey = toDateKey(horizon);

  const pendingInWindow = (kind: "entrada" | "saida") =>
    charges
      .filter((c) => c.kind === kind && c.status !== "cancelado" && c.due_date <= horizonKey)
      .reduce((sum, c) => sum + remainingAmount(c, payments), 0);

  const aReceber = pendingInWindow("entrada");
  const aPagar = pendingInWindow("saida");

  return {
    saldoAtual,
    aReceber,
    aPagar,
    saldoProjetado: saldoAtual + aReceber - aPagar,
    horizonDays,
  };
}

function monthKeyOfDate(dateStr: string): string {
  return dateStr.slice(0, 7);
}

function chargeMonthKey(charge: FinancialCharge): string {
  return monthKeyOfDate(charge.competency_date ?? charge.due_date);
}

/** Receita/despesa/lucro por COMPETÊNCIA (não por caixa) — é o que dá "mensalidade de Setembro paga em Outubro" contando em Setembro. */
export function monthSummary(charges: FinancialCharge[], monthKey: string) {
  const active = charges.filter((c) => c.status !== "cancelado" && chargeMonthKey(c) === monthKey);
  const receita = active.filter((c) => c.kind === "entrada").reduce((s, c) => s + c.amount, 0);
  const despesa = active.filter((c) => c.kind === "saida").reduce((s, c) => s + c.amount, 0);
  return { receita, despesa, lucro: receita - despesa };
}

/** Recebido/pago em CAIXA no mês — por payment_date, não por competência. */
export function monthCashSummary(charges: FinancialCharge[], payments: FinancialPayment[], monthKey: string) {
  const chargeKindById = buildChargeKindMap(charges);
  const inMonth = payments.filter((p) => monthKeyOfDate(p.payment_date) === monthKey);
  const recebido = inMonth
    .filter((p) => chargeKindById.get(p.charge_id) === "entrada")
    .reduce((s, p) => s + p.amount, 0);
  const pago = inMonth.filter((p) => chargeKindById.get(p.charge_id) === "saida").reduce((s, p) => s + p.amount, 0);
  return { recebido, pago };
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function monthlyComparison(charges: FinancialCharge[], currentMonthKey: string, previousMonthKey: string) {
  const current = monthSummary(charges, currentMonthKey);
  const previous = monthSummary(charges, previousMonthKey);
  return {
    current,
    previous,
    pctReceita: pctChange(current.receita, previous.receita),
    pctDespesa: pctChange(current.despesa, previous.despesa),
    pctLucro: pctChange(current.lucro, previous.lucro),
  };
}

export function historicalSeries(charges: FinancialCharge[], monthKeys: string[]) {
  return monthKeys.map((key) => ({ month: key, ...monthSummary(charges, key) }));
}

const FREQUENCY_MONTHLY_FACTOR: Record<string, (interval: number | null) => number> = {
  semanal: () => 52 / 12,
  mensal: () => 1,
  a_cada_x_meses: (interval) => 1 / Math.max(1, interval ?? 1),
  trimestral: () => 1 / 3,
  semestral: () => 1 / 6,
  anual: () => 1 / 12,
  customizado: (interval) => 1 / Math.max(1, interval ?? 1),
};

/**
 * MRR: soma normalizada pra mensal de todas as origens ENTRADA/recorrente
 * ativas, usando o valor da cobrança gerada mais recente de cada origem
 * (o "preço atual") — deliberadamente diferente do histórico já cobrado.
 * MRR responde "quanto eu faturaria por mês hoje", não "quanto eu já
 * faturei" — por isso nunca usa `financial_charges` antigas de origens já
 * reajustadas.
 */
export function calculateMRR(origins: FinancialOrigin[], charges: FinancialCharge[]) {
  const recurringActive = origins.filter(
    (o) => o.kind === "entrada" && o.origin_type === "recorrente" && o.is_active
  );

  let mrr = 0;
  let recurringCount = 0;
  for (const origin of recurringActive) {
    const originCharges = charges
      .filter((c) => c.origin_id === origin.id && c.status !== "cancelado")
      .sort((a, b) => b.due_date.localeCompare(a.due_date));
    const latest = originCharges[0];
    if (!latest) continue;
    const factor = origin.recurrence_frequency
      ? FREQUENCY_MONTHLY_FACTOR[origin.recurrence_frequency]?.(origin.recurrence_interval) ?? 1
      : 1;
    mrr += latest.amount * factor;
    recurringCount += 1;
  }
  return { mrr, recurringCount };
}
