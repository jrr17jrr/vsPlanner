import { addMonthsKey, competencyOf, parseDateKey, splitInstallments } from "@/lib/recurrence";

/**
 * Parcelamentos do Financeiro — puro (sem I/O), usado pelo formulário
 * (prévia), pelo servidor (validação) e pelos testes. Datas sempre em
 * chaves `yyyy-MM-dd` (sem fuso); valores sempre em centavos exatos.
 *
 * Regras:
 *  - "Valor total": o total informado é distribuído em N parcelas e a
 *    soma é EXATAMENTE o total (a última parcela absorve os centavos).
 *  - "Valor de cada parcela": cada parcela tem exatamente o valor
 *    informado e o total é calculado (325,33 × 3 = 975,99) — nada é
 *    "arredondado" silenciosamente para outro total.
 *  - Vencimentos mensais a partir do 1º vencimento, mantendo o dia
 *    (31 → 28/29 em fevereiro → 31 em março).
 */

export type InstallmentValueMode = "total" | "parcela";

export const MAX_INSTALLMENTS = 120;

export const cents = (value: number) => Math.round(value * 100) / 100;

export type PlannedInstallment = { number: number; total: number; dueDate: string; amount: number };

export type InstallmentPlan = {
  installments: PlannedInstallment[];
  /** Soma das parcelas (já com desconto/acréscimo). */
  total: number;
  /** Total antes de desconto/acréscimo. */
  gross: number;
  discount: number;
  addition: number;
  firstDue: string;
  lastDue: string;
  /** true quando todas as parcelas têm o mesmo valor. */
  uniform: boolean;
};

export type InstallmentPlanInput = {
  mode: InstallmentValueMode;
  /** Total da dívida (mode=total) ou valor de cada parcela (mode=parcela). */
  amount: number;
  count: number;
  firstDue: string;
  discount?: number;
  addition?: number;
};

/** Vencimento da parcela `index` (0 = primeira), mantendo o dia do 1º vencimento. */
export function installmentDueDate(firstDue: string, index: number): string {
  return addMonthsKey(firstDue, index, parseDateKey(firstDue).d);
}

export function installmentDueDates(firstDue: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => installmentDueDate(firstDue, i));
}

/** Valores das parcelas conforme o modo. Desconto/acréscimo incidem sobre o total. */
export function installmentAmounts(input: Pick<InstallmentPlanInput, "mode" | "amount" | "count" | "discount" | "addition">): number[] {
  const count = Math.trunc(input.count);
  if (!(count >= 1) || !(input.amount > 0)) return [];
  const discount = cents(input.discount ?? 0);
  const addition = cents(input.addition ?? 0);
  if (input.mode === "parcela") {
    const per = cents(input.amount);
    if (discount === 0 && addition === 0) return Array.from({ length: count }, () => per);
    return splitInstallments(cents(per * count - discount + addition), count);
  }
  return splitInstallments(cents(input.amount - discount + addition), count);
}

export function validateInstallmentInput(input: InstallmentPlanInput): string | null {
  if (!Number.isFinite(input.amount) || input.amount <= 0) return input.mode === "parcela" ? "Informe o valor de cada parcela." : "Informe o valor total da dívida.";
  if (!Number.isInteger(input.count) || input.count < 2 || input.count > MAX_INSTALLMENTS) return `Parcelamento precisa ter de 2 a ${MAX_INSTALLMENTS} parcelas.`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.firstDue)) return "Escolha o primeiro vencimento.";
  if ((input.discount ?? 0) < 0 || (input.addition ?? 0) < 0) return "Desconto/acréscimo não podem ser negativos.";
  const amounts = installmentAmounts(input);
  if (amounts.some((a) => a <= 0)) return "Cada parcela precisa ter valor maior que zero.";
  return null;
}

export function buildInstallmentPlan(input: InstallmentPlanInput): InstallmentPlan | null {
  if (validateInstallmentInput(input)) return null;
  const amounts = installmentAmounts(input);
  const dates = installmentDueDates(input.firstDue, input.count);
  const installments = amounts.map((amount, i) => ({ number: i + 1, total: input.count, dueDate: dates[i], amount }));
  const gross = input.mode === "parcela" ? cents(input.amount * input.count) : cents(input.amount);
  return {
    installments,
    total: cents(amounts.reduce((s, a) => s + a, 0)),
    gross,
    discount: cents(input.discount ?? 0),
    addition: cents(input.addition ?? 0),
    firstDue: dates[0],
    lastDue: dates[dates.length - 1],
    uniform: amounts.every((a) => a === amounts[0]),
  };
}

/** Atalhos do 1º vencimento: mesmo dia do mês escolhido, neste mês ou no próximo. */
export function firstDueShortcut(today: string, day: number, which: "este_mes" | "proximo_mes"): string {
  const base = `${today.slice(0, 7)}-01`;
  return addMonthsKey(base, which === "este_mes" ? 0 : 1, Math.max(1, Math.min(31, Math.trunc(day) || 1)));
}

// -----------------------------------------------------------------------------
// Edição de parcelamento já cadastrado
// -----------------------------------------------------------------------------

/** Parcela existente como a edição enxerga: valor, vencimento e quanto já foi pago. */
export type ExistingInstallment = {
  id: string;
  number: number;
  dueDate: string;
  amount: number;
  paid: number;
  cancelled: boolean;
};

export type InstallmentState = "paga" | "parcial" | "pendente" | "cancelada";

export function installmentState(i: Pick<ExistingInstallment, "amount" | "paid" | "cancelled">): InstallmentState {
  if (i.cancelled) return "cancelada";
  if (i.paid <= 0) return "pendente";
  return cents(i.paid) >= cents(i.amount) ? "paga" : "parcial";
}

/** Parcela com pagamento (parcial ou total) tem o valor travado; a quitada também tem a data travada. */
const amountLocked = (i: ExistingInstallment) => !i.cancelled && i.paid > 0;
const dateLocked = (i: ExistingInstallment) => installmentState(i) === "paga";

export type RescheduleMode = "somente" | "seguintes";

export type ScheduleChange = { id: string; number: number; from: string; to: string };

/**
 * "Alterar vencimento": somente esta parcela, ou esta e as próximas
 * (reorganiza mensalmente a partir da nova data, mantendo o dia). Parcelas
 * quitadas e canceladas nunca mudam. Antecipar e adiar funcionam igual.
 */
export function planReschedule(
  installments: ExistingInstallment[],
  targetId: string,
  newDate: string,
  mode: RescheduleMode
): { changes: ScheduleChange[]; error?: string } {
  const target = installments.find((i) => i.id === targetId);
  if (!target) return { changes: [], error: "Parcela não encontrada." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) return { changes: [], error: "Escolha a nova data." };
  if (target.cancelled) return { changes: [], error: "Esta parcela foi cancelada." };
  if (dateLocked(target)) return { changes: [], error: "Esta parcela já está quitada — o vencimento dela não muda." };

  const moving = mode === "somente"
    ? [target]
    : installments.filter((i) => !i.cancelled && !dateLocked(i) && i.number >= target.number).sort((a, b) => a.number - b.number);
  const anchor = parseDateKey(newDate).d;
  const changes = moving
    .map((i) => ({ id: i.id, number: i.number, from: i.dueDate, to: addMonthsKey(newDate, i.number - target.number, anchor) }))
    .filter((c) => c.from !== c.to);

  const finalDates = new Map(installments.filter((i) => !i.cancelled).map((i) => [i.id, i.dueDate]));
  for (const c of changes) finalDates.set(c.id, c.to);
  const seen = new Set<string>();
  for (const date of finalDates.values()) {
    if (seen.has(date)) return { changes, error: "Duas parcelas ficariam com o mesmo vencimento. Escolha outra data ou altere \"esta e as próximas\"." };
    seen.add(date);
  }
  return { changes };
}

export type ReplanInput = {
  count: number;
  mode: InstallmentValueMode;
  /** Novo valor total do parcelamento (mode=total) ou de cada parcela pendente (mode=parcela). */
  amount: number;
  /** Vencimento da primeira parcela que ainda pode mudar de data. */
  firstPendingDue: string;
};

export type ReplanRow = {
  number: number;
  id?: string;
  state: InstallmentState | "nova";
  action: "mantida" | "alterada" | "nova" | "removida" | "reativada";
  fromDue?: string;
  toDue: string;
  fromAmount?: number;
  toAmount: number;
  paid: number;
};

export type ReplanResult = {
  rows: ReplanRow[];
  total: number;
  paidTotal: number;
  error?: string;
};

/**
 * "Editar parcelamento completo": nova quantidade, novo valor (total ou por
 * parcela) e novos vencimentos — sem excluir e recriar a dívida.
 *  - Parcelas com pagamento mantêm valor (e a quitada, a data).
 *  - O valor que falta (novo total − parcelas travadas) é redistribuído nas
 *    parcelas pendentes, com centavos exatos.
 *  - Reduzir a quantidade só remove parcelas futuras SEM pagamento; nunca
 *    abaixo da quantidade de parcelas com pagamento.
 *  - Parcela removida é CANCELADA (não apagada) e reativada se voltar.
 */
export function planReplan(installments: ExistingInstallment[], input: ReplanInput): ReplanResult {
  const count = Math.trunc(input.count);
  const fail = (error: string): ReplanResult => ({ rows: [], total: 0, paidTotal: 0, error });
  if (!(count >= 1) || count > MAX_INSTALLMENTS) return fail(`A quantidade precisa ser de 1 a ${MAX_INSTALLMENTS} parcelas.`);
  if (!Number.isFinite(input.amount) || input.amount <= 0) return fail("Informe um valor válido.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.firstPendingDue)) return fail("Escolha o vencimento da próxima parcela.");

  const byNumber = new Map<number, ExistingInstallment>();
  for (const i of [...installments].sort((a, b) => Number(a.cancelled) - Number(b.cancelled))) if (!byNumber.has(i.number)) byNumber.set(i.number, i);
  const locked = installments.filter(amountLocked);
  const maxLocked = locked.reduce((m, i) => Math.max(m, i.number), 0);
  if (count < maxLocked) {
    return fail(`A parcela ${maxLocked} já tem pagamento — o parcelamento não pode ter menos de ${maxLocked} parcelas. Para reduzir além disso, desfaça o pagamento primeiro.`);
  }

  const lockedNumbers = new Set(locked.filter((i) => i.number <= count).map((i) => i.number));
  const pendingNumbers = Array.from({ length: count }, (_, k) => k + 1).filter((n) => !lockedNumbers.has(n));
  const paidTotal = cents(locked.reduce((s, i) => s + i.amount, 0));

  let pendingAmounts: number[];
  if (input.mode === "parcela") {
    pendingAmounts = pendingNumbers.map(() => cents(input.amount));
  } else {
    const remaining = cents(input.amount - paidTotal);
    if (pendingNumbers.length === 0) {
      if (Math.abs(remaining) >= 0.01) return fail("Todas as parcelas já têm pagamento — o total não pode mudar.");
      pendingAmounts = [];
    } else {
      if (remaining <= 0) return fail(`O novo total precisa ser maior que o valor das parcelas já pagas (${paidTotal.toFixed(2).replace(".", ",")}).`);
      pendingAmounts = splitInstallments(remaining, pendingNumbers.length);
    }
  }
  if (pendingAmounts.some((a) => a <= 0)) return fail("Cada parcela precisa ter valor maior que zero.");

  // Base dos novos vencimentos: a primeira parcela que ainda pode mudar de data (não quitada).
  const firstPendingNumber = Array.from({ length: count }, (_, k) => k + 1).find((n) => {
    const e = byNumber.get(n);
    return !(e && lockedNumbers.has(n) && dateLocked(e));
  }) ?? 1;
  const anchor = parseDateKey(input.firstPendingDue).d;
  const rows: ReplanRow[] = [];
  for (let n = 1; n <= count; n++) {
    const existing = byNumber.get(n);
    if (lockedNumbers.has(n) && existing) {
      const keepDate = dateLocked(existing);
      const toDue = keepDate ? existing.dueDate : addMonthsKey(input.firstPendingDue, n - firstPendingNumber, anchor);
      rows.push({
        number: n, id: existing.id, state: installmentState(existing), action: toDue === existing.dueDate ? "mantida" : "alterada",
        fromDue: existing.dueDate, toDue, fromAmount: existing.amount, toAmount: existing.amount, paid: existing.paid,
      });
      continue;
    }
    const amount = pendingAmounts[pendingNumbers.indexOf(n)];
    const toDue = addMonthsKey(input.firstPendingDue, n - firstPendingNumber, anchor);
    if (!existing) {
      rows.push({ number: n, state: "nova", action: "nova", toDue, toAmount: amount, paid: 0 });
    } else {
      const same = !existing.cancelled && existing.dueDate === toDue && cents(existing.amount) === amount;
      rows.push({
        number: n, id: existing.id, state: installmentState(existing), action: existing.cancelled ? "reativada" : same ? "mantida" : "alterada",
        fromDue: existing.dueDate, toDue, fromAmount: existing.amount, toAmount: amount, paid: existing.paid,
      });
    }
  }
  for (const i of installments) {
    if (i.number > count && !i.cancelled) {
      rows.push({ number: i.number, id: i.id, state: installmentState(i), action: "removida", fromDue: i.dueDate, toDue: i.dueDate, fromAmount: i.amount, toAmount: 0, paid: i.paid });
    }
  }

  const active = rows.filter((r) => r.action !== "removida");
  const dates = new Set<string>();
  for (const r of active) {
    if (dates.has(r.toDue)) return fail("Duas parcelas ficariam com o mesmo vencimento. Ajuste o vencimento da próxima parcela.");
    dates.add(r.toDue);
  }
  return { rows, total: cents(active.reduce((s, r) => s + r.toAmount, 0)), paidTotal };
}

/** Painel do parcelamento: totais, contagens e próximos vencimentos. */
export function installmentSummary(installments: ExistingInstallment[], today: string) {
  const active = installments.filter((i) => !i.cancelled).sort((a, b) => a.number - b.number);
  const total = cents(active.reduce((s, i) => s + i.amount, 0));
  const paid = cents(active.reduce((s, i) => s + Math.min(i.paid, i.amount), 0));
  const paidCount = active.filter((i) => installmentState(i) === "paga").length;
  const open = active.filter((i) => installmentState(i) !== "paga").sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return {
    total,
    paid,
    remaining: cents(total - paid),
    paidCount,
    pendingCount: active.length - paidCount,
    count: active.length,
    nextDue: open[0]?.dueDate ?? null,
    lastDue: active.length ? [...active].sort((a, b) => b.dueDate.localeCompare(a.dueDate))[0].dueDate : null,
    overdueCount: open.filter((i) => i.dueDate < today).length,
  };
}

/** Competência que acompanha o vencimento: se era a automática (mês do vencimento), segue a nova data. */
export function followCompetency(oldDue: string, oldCompetency: string | null, newDue: string): string | null {
  if (!oldCompetency || oldCompetency === competencyOf(oldDue)) return competencyOf(newDue);
  return oldCompetency;
}

/** Descrição "Empréstimo (3/14)" → "Empréstimo (3/12)". */
export function installmentDescription(description: string, number: number, total: number): string {
  const base = description.replace(/\s*\(\d+\/\d+\)\s*$/, "").trim();
  return `${base} (${number}/${total})`;
}
