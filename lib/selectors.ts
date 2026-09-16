import type { Database } from "@/mock/seed";
import type { Client, Transaction } from "@/types/entities";
import { toCompetencia } from "@/lib/format";

/**
 * Camada de cálculo financeiro. Todo card, gráfico e lista do app deve ler
 * números daqui — nunca recalcular localmente — para que os valores nunca
 * divirjam entre dashboard, gráficos e listagens (ver requisito de fonte
 * única de dados).
 */

export function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

export function monthKeyOf(dateIso: string): string {
  return dateIso.slice(0, 7);
}

export function currentMonthKey(): string {
  return toCompetencia(new Date());
}

export function filterTransactions(
  transactions: Transaction[],
  opts: { spaceId?: string; monthKey?: string; type?: Transaction["type"] }
): Transaction[] {
  return transactions.filter((t) => {
    if (opts.spaceId && t.spaceId !== opts.spaceId) return false;
    if (opts.monthKey && monthKeyOf(t.date) !== opts.monthKey) return false;
    if (opts.type && t.type !== opts.type) return false;
    return true;
  });
}

export interface PersonalFinanceSummary {
  saldo: number;
  entradasMes: number;
  saidasMes: number;
}

export function personalFinanceSummary(
  db: Pick<Database, "transactions">,
  spaceId: string,
  monthKey: string = currentMonthKey()
): PersonalFinanceSummary {
  const all = db.transactions.filter((t) => t.spaceId === spaceId);
  const mes = all.filter((t) => monthKeyOf(t.date) === monthKey);
  const saldo =
    sum(all.filter((t) => t.type === "entrada").map((t) => t.amount)) -
    sum(all.filter((t) => t.type === "saida").map((t) => t.amount));
  return {
    saldo,
    entradasMes: sum(mes.filter((t) => t.type === "entrada").map((t) => t.amount)),
    saidasMes: sum(mes.filter((t) => t.type === "saida").map((t) => t.amount)),
  };
}

export function clientMonthlyValue(
  db: Pick<Database, "clientServices">,
  client: Client
): number {
  if (client.pricingMode === "pacote") return client.packagePrice ?? 0;
  return sum(
    db.clientServices.filter((cs) => cs.clientId === client.id).map((cs) => cs.price)
  );
}

export function clientRecurringValue(
  db: Pick<Database, "clientServices" | "services">,
  client: Client
): number {
  if (client.pricingMode === "pacote") return client.packagePrice ?? 0;
  const links = db.clientServices.filter((cs) => cs.clientId === client.id);
  return sum(
    links
      .filter((cs) => {
        const svc = db.services.find((s) => s.id === cs.serviceId);
        return svc?.billingType === "mensal";
      })
      .map((cs) => cs.price)
  );
}

export function visionarioMRR(
  db: Pick<Database, "clients" | "clientServices" | "services">
): { mrr: number; recurringClients: number } {
  const ativos = db.clients.filter((c) => c.status === "ativo");
  let mrr = 0;
  let recurringClients = 0;
  for (const client of ativos) {
    const value = clientRecurringValue(db, client);
    if (value > 0) {
      mrr += value;
      recurringClients += 1;
    }
  }
  return { mrr, recurringClients };
}

export function clientLastPaymentStatus(
  db: Pick<Database, "clientPayments">,
  clientId: string
): "pago" | "pendente" | "atrasado" | null {
  const payments = db.clientPayments
    .filter((p) => p.clientId === clientId)
    .sort((a, b) => (a.competencia < b.competencia ? 1 : -1));
  return payments[0]?.status ?? null;
}

export interface VisionarioFinanceSummary {
  faturamento: number; // total cobrado no mês (todos os pagamentos daquela competência)
  recebido: number;
  aReceber: number;
  despesas: number;
  comissoes: number;
  comissoesPagas: number;
  comissoesPendentes: number;
  lucro: number;
}

export function visionarioFinanceSummary(
  db: Pick<
    Database,
    "clientPayments" | "expenses" | "sales" | "commissions"
  >,
  spaceId: string,
  monthKey: string = currentMonthKey()
): VisionarioFinanceSummary {
  const payments = db.clientPayments.filter(
    (p) => p.spaceId === spaceId && p.competencia === monthKey
  );
  const faturamento = sum(payments.map((p) => p.amount));
  const recebido = sum(payments.filter((p) => p.status === "pago").map((p) => p.amount));
  const aReceber = faturamento - recebido;

  const despesas = sum(
    db.expenses
      .filter((e) => e.spaceId === spaceId && monthKeyOf(e.date) === monthKey)
      .map((e) => e.amount)
  );

  const salesInMonth = db.sales.filter(
    (s) => s.spaceId === spaceId && monthKeyOf(s.date) === monthKey
  );
  const saleIds = new Set(salesInMonth.map((s) => s.id));
  const commissionsInMonth = db.commissions.filter(
    (c) => c.spaceId === spaceId && saleIds.has(c.saleId)
  );
  const comissoes = sum(commissionsInMonth.map((c) => c.amount));
  const comissoesPagas = sum(
    commissionsInMonth.filter((c) => c.status === "pago").map((c) => c.amount)
  );
  const comissoesPendentes = comissoes - comissoesPagas;

  const lucro = recebido - despesas - comissoes;

  return {
    faturamento,
    recebido,
    aReceber,
    despesas,
    comissoes,
    comissoesPagas,
    comissoesPendentes,
    lucro,
  };
}

export interface VendorStats {
  vendasNoMes: number;
  valorVendidoMes: number;
  comissaoGeradaMes: number;
  comissaoPagaTotal: number;
  comissaoPendenteTotal: number;
  valorVendidoTotal: number;
}

export function vendorStats(
  db: Pick<Database, "sales" | "commissions">,
  vendorId: string,
  monthKey: string = currentMonthKey()
): VendorStats {
  const allSales = db.sales.filter((s) => s.vendorId === vendorId);
  const salesInMonth = allSales.filter((s) => monthKeyOf(s.date) === monthKey);
  const commissions = db.commissions.filter((c) => c.vendorId === vendorId);
  const commissionsInMonth = commissions.filter((c) =>
    salesInMonth.some((s) => s.id === c.saleId)
  );

  return {
    vendasNoMes: salesInMonth.length,
    valorVendidoMes: sum(salesInMonth.map((s) => s.amount)),
    comissaoGeradaMes: sum(commissionsInMonth.map((c) => c.amount)),
    comissaoPagaTotal: sum(
      commissions.filter((c) => c.status === "pago").map((c) => c.amount)
    ),
    comissaoPendenteTotal: sum(
      commissions.filter((c) => c.status === "pendente").map((c) => c.amount)
    ),
    valorVendidoTotal: sum(allSales.map((s) => s.amount)),
  };
}

export function daysUntil(dateIso: string | undefined): number | null {
  if (!dateIso) return null;
  const [y, m, d] = dateIso.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function isOverdue(dateIso: string | undefined): boolean {
  const days = daysUntil(dateIso);
  return days !== null && days < 0;
}
