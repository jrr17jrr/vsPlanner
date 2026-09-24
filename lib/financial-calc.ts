import type {
  ClientService,
  FinancialAccount,
  FinancialCharge,
  FinancialKind,
  FinancialOrigin,
  FinancialPayment,
} from "@/types/database.types";
import { toDateKey, todayKeySaoPaulo } from "@/lib/format";
import { daysBetweenKeys, monthlyFactor, nextOccurrence, parseDateKey } from "@/lib/recurrence";

/**
 * Único lugar onde o Financeiro é CALCULADO. Dashboard, gráficos, contas a
 * receber/pagar e previsão de caixa chamam estas funções — nenhum
 * componente reimplementa a conta por conta própria (senão card e gráfico
 * podem divergir). Tudo aqui é derivado de `FinancialCharge` +
 * `FinancialPayment` — pendente/parcial/pago NUNCA é um campo lido direto,
 * é sempre "soma dos pagamentos vs. valor da cobrança".
 */

export type ChargePaymentStatus = "cancelado" | "pendente" | "parcial" | "pago";

const roundCents = (value: number) => Math.round(value * 100) / 100;

export function paidAmountFor(chargeId: string, payments: FinancialPayment[]): number {
  return roundCents(payments.filter((p) => p.charge_id === chargeId).reduce((sum, p) => sum + Number(p.amount), 0));
}

export function chargeStatus(charge: FinancialCharge, payments: FinancialPayment[]): ChargePaymentStatus {
  if (charge.status === "cancelado") return "cancelado";
  const paid = paidAmountFor(charge.id, payments);
  if (paid <= 0) return "pendente";
  if (paid >= roundCents(Number(charge.amount))) return "pago";
  return "parcial";
}

export function remainingAmount(charge: FinancialCharge, payments: FinancialPayment[]): number {
  return Math.max(0, roundCents(Number(charge.amount) - paidAmountFor(charge.id, payments)));
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

/** Contrato recorrente que conta como receita recorrente AGORA (pausado/encerrado não conta). */
export function isActiveRecurringContract(contract: ClientService): boolean {
  return contract.billing_type === "recorrente" && contract.status === "ativo" && !!contract.frequency;
}

/** Valor mensal equivalente de um contrato (R$1.200/ano → R$100/mês). Único/parcelado = 0. */
export function contractMonthlyValue(contract: ClientService): number {
  if (!isActiveRecurringContract(contract)) return 0;
  return contract.price * monthlyFactor(contract.frequency!);
}

/**
 * Receita Recorrente Mensal (MRR) — "quanto entra por mês hoje", nunca
 * "quanto já entrou" (isso é caixa, ver `monthCashSummary`).
 *
 * Fonte principal: os CONTRATOS (`client_services`) recorrentes ativos —
 * é o preço contratado atual, pausado/encerrado fica de fora
 * automaticamente. Origens de entrada recorrentes SEM contrato (ex.:
 * salário no Pessoal, parceria fixa no TikTok) também entram, pelo valor
 * da cobrança mais recente. Uma origem ligada a um contrato presente em
 * `contracts` nunca é somada duas vezes.
 */
export function calculateMRR(origins: FinancialOrigin[], charges: FinancialCharge[], contracts: ClientService[] = []) {
  let mrr = 0;
  let recurringCount = 0;

  const contractIds = new Set(contracts.map((c) => c.id));
  for (const contract of contracts) {
    if (!isActiveRecurringContract(contract)) continue;
    mrr += contractMonthlyValue(contract);
    recurringCount += 1;
  }

  const recurringActive = origins.filter(
    (o) =>
      o.kind === "entrada" &&
      o.origin_type === "recorrente" &&
      o.is_active &&
      !(o.client_service_id && contractIds.has(o.client_service_id))
  );

  for (const origin of recurringActive) {
    const originCharges = charges
      .filter((c) => c.origin_id === origin.id && c.status !== "cancelado")
      .sort((a, b) => b.due_date.localeCompare(a.due_date));
    const latest = originCharges[0];
    if (!latest) continue;
    const factor = origin.recurrence_frequency ? monthlyFactor(origin.recurrence_frequency, origin.recurrence_interval) : 1;
    mrr += latest.amount * factor;
    recurringCount += 1;
  }
  return { mrr: Math.round(mrr * 100) / 100, recurringCount };
}

/** Total ainda em aberto (restante, não o valor cheio) de todas as cobranças ativas de um tipo. */
export function pendingTotal(charges: FinancialCharge[], payments: FinancialPayment[], kind: FinancialKind): number {
  return charges
    .filter((c) => c.kind === kind && c.status !== "cancelado")
    .reduce((sum, c) => sum + remainingAmount(c, payments), 0);
}

/**
 * Em aberto do MÊS (yyyy-MM): só vencimentos daquele mês — nunca soma
 * competências futuras (recorrências já geradas para o mês seguinte não
 * entram). O atrasado de meses anteriores vem separado em `overdueBefore`.
 */
export function pendingInMonth(charges: FinancialCharge[], payments: FinancialPayment[], kind: FinancialKind, monthKey: string) {
  const open = charges.filter((c) => c.kind === kind && c.status !== "cancelado");
  const monthStart = `${monthKey}-01`;
  const inMonth = open.filter((c) => c.due_date.startsWith(monthKey));
  const before = open.filter((c) => c.due_date < monthStart);
  return {
    month: roundCents(inMonth.reduce((s, c) => s + remainingAmount(c, payments), 0)),
    overdueBefore: roundCents(before.reduce((s, c) => s + remainingAmount(c, payments), 0)),
  };
}

/** Próximas cobranças em aberto (inclui atrasadas no topo), já com restante calculado. */
export function upcomingOpenCharges(
  charges: FinancialCharge[],
  payments: FinancialPayment[],
  kind: FinancialKind,
  limit = 5,
  today: string = todayKeySaoPaulo()
): ReceivablePayable[] {
  return listChargesForKind(charges, payments, kind, today)
    .filter((r) => r.status !== "pago")
    .slice(0, limit);
}

/**
 * Resumo financeiro de um cliente — as MESMAS cobranças/pagamentos do
 * Financeiro, só filtradas por `client_id` (nada duplicado).
 */
export function clientFinancialSummary(
  contracts: ClientService[],
  charges: FinancialCharge[],
  payments: FinancialPayment[]
) {
  const active = charges.filter((c) => c.status !== "cancelado" && c.kind === "entrada");
  const chargeIds = new Set(active.map((c) => c.id));
  const clientPayments = payments.filter((p) => chargeIds.has(p.charge_id));
  const pending = active.filter((c) => chargeStatus(c, payments) !== "pago");
  return {
    mrr: contracts.reduce((s, c) => s + contractMonthlyValue(c), 0),
    aReceber: pending.reduce((s, c) => s + remainingAmount(c, payments), 0),
    totalRecebido: clientPayments.reduce((s, p) => s + p.amount, 0),
    pendingCount: pending.length,
    payments: [...clientPayments].sort((a, b) => b.payment_date.localeCompare(a.payment_date)),
  };
}

export type ClientBillingStatus = "atrasado" | "pendente" | "pago" | "sem_cobranca";

export type ClientBillingSnapshot = {
  status: ClientBillingStatus;
  /** Cobrança que define a situação (a atrasada mais antiga, a próxima a vencer ou a última paga). */
  charge: FinancialCharge | null;
  /** Em aberto da cobrança em foco (0 quando paga). */
  remaining: number;
  daysLate: number;
  daysUntilDue: number;
  overdueCount: number;
  overdueTotal: number;
};

/** Janela em que uma cobrança em aberto já conta como "pendente" (vencendo em breve). */
export const PENDING_WINDOW_DAYS = 10;

/**
 * Situação financeira de UM cliente, derivada só das cobranças de
 * entrada reais dele (mesma fonte do Financeiro):
 *  - atrasado: existe cobrança em aberto com vencimento passado;
 *  - pendente: próxima cobrança em aberto vence em até 10 dias;
 *  - pago: a última cobrança já vencida/recente foi quitada (em dia);
 *  - sem_cobranca: nenhuma cobrança registrada.
 */
export function clientBillingSnapshot(
  clientId: string,
  charges: FinancialCharge[],
  payments: FinancialPayment[],
  today: string = todayKeySaoPaulo()
): ClientBillingSnapshot {
  const mine = charges.filter((c) => c.client_id === clientId && c.kind === "entrada" && c.status !== "cancelado");
  const open = mine.filter((c) => chargeStatus(c, payments) !== "pago").sort((a, b) => a.due_date.localeCompare(b.due_date));
  const overdue = open.filter((c) => c.due_date < today);
  const base = {
    overdueCount: overdue.length,
    overdueTotal: roundCents(overdue.reduce((s, c) => s + remainingAmount(c, payments), 0)),
  };

  if (overdue.length > 0) {
    const charge = overdue[0];
    return {
      ...base,
      status: "atrasado",
      charge,
      remaining: remainingAmount(charge, payments),
      daysLate: daysBetweenKeys(charge.due_date, today),
      daysUntilDue: 0,
    };
  }

  const upcoming = open[0] ?? null;
  const pendingSnapshot = (charge: FinancialCharge): ClientBillingSnapshot => ({
    ...base,
    status: "pendente",
    charge,
    remaining: remainingAmount(charge, payments),
    daysLate: 0,
    daysUntilDue: daysBetweenKeys(today, charge.due_date),
  });

  if (upcoming && daysBetweenKeys(today, upcoming.due_date) <= PENDING_WINDOW_DAYS) return pendingSnapshot(upcoming);

  const lastPaid = mine
    .filter((c) => chargeStatus(c, payments) === "pago")
    .sort((a, b) => b.due_date.localeCompare(a.due_date))[0];
  if (lastPaid) return { ...base, status: "pago", charge: lastPaid, remaining: 0, daysLate: 0, daysUntilDue: 0 };
  if (upcoming) return pendingSnapshot(upcoming);
  return { ...base, status: "sem_cobranca", charge: null, remaining: 0, daysLate: 0, daysUntilDue: 0 };
}

/** Receita recorrente agrupada por serviço do catálogo (contratos recorrentes ativos). */
export function recurringRevenueByService(contracts: ClientService[]) {
  const byService = new Map<string, { serviceId: string; count: number; monthly: number }>();
  for (const c of contracts) {
    const monthly = contractMonthlyValue(c);
    if (monthly <= 0) continue;
    const row = byService.get(c.service_id) ?? { serviceId: c.service_id, count: 0, monthly: 0 };
    row.count += 1;
    row.monthly = roundCents(row.monthly + monthly);
    byService.set(c.service_id, row);
  }
  const rows = [...byService.values()].sort((a, b) => b.monthly - a.monthly);
  return { rows, total: roundCents(rows.reduce((s, r) => s + r.monthly, 0)) };
}

/**
 * Próxima renovação de um domínio integrado ao financeiro: a cobrança em
 * aberto mais antiga da origem; se todas já foram pagas, a próxima
 * ocorrência depois da última. Sem integração, vale `fallback`.
 */
export function nextRenewalFromCharges(
  originCharges: FinancialCharge[],
  payments: FinancialPayment[],
  periodMonths: number,
  fallback: string | null
): string | null {
  const active = originCharges.filter((c) => c.status !== "cancelado").sort((a, b) => a.due_date.localeCompare(b.due_date));
  if (active.length === 0) return fallback;
  const open = active.find((c) => chargeStatus(c, payments) !== "pago");
  if (open) return open.due_date;
  const last = active[active.length - 1];
  return nextOccurrence(last.due_date, "a_cada_x_meses", periodMonths, parseDateKey(active[0].due_date).d);
}
