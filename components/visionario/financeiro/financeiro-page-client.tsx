"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Wallet,
  TrendingUp,
  TrendingDown,
  HandCoins,
  AlertTriangle,
  Repeat,
  DollarSign,
  Receipt,
  CalendarClock,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, LineChart, Line,
} from "recharts";
import { PageHeader } from "@/components/shared/page-header";
import { MoneyCard } from "@/components/shared/money-card";
import { ChartCard } from "@/components/shared/chart-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NovaMovimentacaoDialog } from "@/components/visionario/financeiro/nova-movimentacao-dialog";
import { ChargesList } from "@/components/visionario/financeiro/charges-list";
import { MovementsList } from "@/components/visionario/financeiro/movements-list";
import { FinancialConfigManager } from "@/components/visionario/financeiro/financial-config-manager";
import {
  accountBalance,
  totalBalance,
  calculateMRR,
  monthlyComparison,
  historicalSeries,
  listChargesForKind,
  monthCashSummary,
  pendingInMonth,
  upcomingOpenCharges,
  type ReceivablePayable,
} from "@/lib/financial-calc";
import { chargeBadgeStatus } from "@/lib/finance-labels";
import { formatCurrency, formatDate, currentMonthKeySaoPaulo, todayKeySaoPaulo } from "@/lib/format";
import { monthKeysForPeriod, monthKeyLabel, PERIOD_LABELS, type PeriodPreset } from "@/lib/periods";
import { CHART_COLORS } from "@/lib/chart-colors";
import type {
  Client,
  ClientService,
  FinancialAccount,
  FinancialCategory,
  FinancialCharge,
  FinancialKind,
  FinancialOrigin,
  FinancialPayment,
  FinancialReferenceType,
  Service,
} from "@/types/database.types";
import type { FinancialScope } from "@/lib/space-slugs";
import type { FinanceTab } from "@/lib/finance-tabs";

type Tab = FinanceTab;

function previousMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const SCOPE_TITLE: Record<FinancialScope, string> = {
  visionario: "Visionário Dev",
  pessoal: "Pessoal",
  tiktok: "TikTok",
};

function pctLabel(pct: number | null): string {
  if (pct === null) return "—";
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(0)}%`;
}

type DialogPreset = { kind?: FinancialKind; pending: boolean } | null;

/**
 * Financeiro — MESMO componente para Pessoal, TikTok e Visionário Dev
 * (dados já vêm filtrados pelo space do `scope`). Caixa (recebido/pago,
 * pela data real do pagamento) e competência (o que foi cobrado/devido)
 * nunca se misturam: cards de caixa usam `monthCashSummary`; gráficos e
 * comparativo usam competência.
 */
export function FinanceiroPageClient({
  scope,
  charges,
  payments,
  accounts,
  categories,
  referenceTypes,
  origins,
  clients,
  clientServices,
  services,
  permissions,
  initialTab = "visao",
}: {
  initialTab?: Tab;
  scope: FinancialScope;
  charges: FinancialCharge[];
  payments: FinancialPayment[];
  accounts: FinancialAccount[];
  categories: FinancialCategory[];
  referenceTypes: FinancialReferenceType[];
  origins: FinancialOrigin[];
  clients: Client[];
  clientServices: ClientService[];
  services: Service[];
  permissions: { canCreate: boolean; canEdit: boolean; canDelete: boolean };
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [period, setPeriod] = useState<PeriodPreset>("6m");
  const [dialog, setDialog] = useState<DialogPreset>(null);

  const today = todayKeySaoPaulo();
  const chargeKindById = useMemo(() => new Map(charges.map((c) => [c.id, c.kind])), [charges]);
  const accountBalances = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of accounts) map.set(a.id, accountBalance(a, payments, chargeKindById));
    return map;
  }, [accounts, payments, chargeKindById]);

  const saldoTotal = useMemo(() => totalBalance(accounts, payments, chargeKindById), [accounts, payments, chargeKindById]);
  const { mrr, recurringCount } = useMemo(() => calculateMRR(origins, charges, clientServices), [origins, charges, clientServices]);

  const curMonth = currentMonthKeySaoPaulo();
  const prevMonth = previousMonthKey(curMonth);
  const comparison = useMemo(() => monthlyComparison(charges, curMonth, prevMonth), [charges, curMonth, prevMonth]);
  const cash = useMemo(() => monthCashSummary(charges, payments, curMonth), [charges, payments, curMonth]);

  const monthKeys = useMemo(() => monthKeysForPeriod(period), [period]);
  const series = useMemo(() => historicalSeries(charges, monthKeys), [charges, monthKeys]);
  const chartData = series.map((s) => ({ month: monthKeyLabel(s.month), Receita: s.receita, Despesas: s.despesa, Lucro: s.lucro }));

  // Só vencimentos do mês atual (nunca soma competências futuras); atrasado anterior à parte.
  const receberMes = useMemo(() => pendingInMonth(charges, payments, "entrada", curMonth), [charges, payments, curMonth]);
  const pagarMes = useMemo(() => pendingInMonth(charges, payments, "saida", curMonth), [charges, payments, curMonth]);
  const atrasadoReceber = useMemo(
    () => listChargesForKind(charges, payments, "entrada", today).filter((r) => r.bucket === "atrasadas").reduce((s, r) => s + r.remaining, 0),
    [charges, payments, today]
  );
  const atrasadoPagar = useMemo(
    () => listChargesForKind(charges, payments, "saida", today).filter((r) => r.bucket === "atrasadas").reduce((s, r) => s + r.remaining, 0),
    [charges, payments, today]
  );
  const nextIn = useMemo(() => upcomingOpenCharges(charges, payments, "entrada", 5, today), [charges, payments, today]);
  const nextOut = useMemo(() => upcomingOpenCharges(charges, payments, "saida", 5, today), [charges, payments, today]);
  const resultado = cash.recebido - cash.pago;

  const listProps = {
    scope,
    charges,
    payments,
    accounts,
    clients,
    categories,
    referenceTypes,
    origins,
    permissions,
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Financeiro — ${SCOPE_TITLE[scope]}`}
        description="Caixa real, contas a receber e a pagar deste espaço."
        actions={
          permissions.canCreate ? (
            <Button size="sm" onClick={() => setDialog({ pending: false })}>
              <Plus className="h-4 w-4" /> Nova movimentação
            </Button>
          ) : undefined
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="visao">Visão geral</TabsTrigger>
          <TabsTrigger value="movimentacoes">Movimentações</TabsTrigger>
          <TabsTrigger value="a_receber">A receber</TabsTrigger>
          <TabsTrigger value="a_pagar">A pagar</TabsTrigger>
          <TabsTrigger value="config">Contas e categorias</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "visao" && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MoneyCard label="Saldo atual" amount={saldoTotal} icon={Wallet} hint={`${accounts.filter((a) => a.is_active).length} conta(s) ativa(s)`} />
            <MoneyCard label="Recebido no mês" amount={cash.recebido} icon={TrendingUp} tone="success" hint="Pela data real do recebimento" />
            <MoneyCard label="Pago no mês" amount={cash.pago} icon={TrendingDown} tone="destructive" hint="Pela data real do pagamento" />
            <MoneyCard label="Resultado do mês" amount={resultado} icon={DollarSign} tone={resultado >= 0 ? "success" : "destructive"} hint="Recebido − pago" />
            <MoneyCard label="A receber no mês" amount={receberMes.month} icon={HandCoins} tone="warning" hint={receberMes.overdueBefore > 0 ? `+ ${formatCurrency(receberMes.overdueBefore)} atrasado de meses anteriores` : "Vencimentos deste mês"} />
            <MoneyCard label="A pagar no mês" amount={pagarMes.month} icon={Receipt} tone="warning" hint={pagarMes.overdueBefore > 0 ? `+ ${formatCurrency(pagarMes.overdueBefore)} atrasado de meses anteriores` : atrasadoPagar > 0 ? `${formatCurrency(atrasadoPagar)} atrasado` : "Vencimentos deste mês"} />
            <MoneyCard label="Receita recorrente mensal" amount={mrr} icon={Repeat} hint={`${recurringCount} recorrência(s) ativa(s)`} />
            <MoneyCard
              label="Atrasado a receber"
              amount={atrasadoReceber}
              icon={AlertTriangle}
              tone={atrasadoReceber > 0 ? "destructive" : "default"}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <UpcomingCard title="Próximos recebimentos" kind="entrada" rows={nextIn} today={today} onSeeAll={() => setTab("a_receber")} />
            <UpcomingCard title="Próximos pagamentos" kind="saida" rows={nextOut} today={today} onSeeAll={() => setTab("a_pagar")} />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <ComparisonTile label="Receita (competência)" value={comparison.current.receita} pct={comparison.pctReceita} goodWhenUp />
            <ComparisonTile label="Despesas (competência)" value={comparison.current.despesa} pct={comparison.pctDespesa} goodWhenUp={false} />
            <ComparisonTile label="Lucro (competência)" value={comparison.current.lucro} pct={comparison.pctLucro} goodWhenUp />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Gráficos por competência (o que foi cobrado/devido em cada mês), não por caixa.
            </p>
            <Select value={period} onValueChange={(v) => setPeriod(v as PeriodPreset)}>
              <SelectTrigger className="w-full sm:w-48" aria-label="Período"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PERIOD_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard title="Receita x Despesas" description={PERIOD_LABELS[period]}>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="month" tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
                  <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} formatter={(v) => formatCurrency(Number(v))} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Receita" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Despesas" fill={CHART_COLORS[4]} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Lucro" description={PERIOD_LABELS[period]}>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="month" tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
                  <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} formatter={(v) => formatCurrency(Number(v))} />
                  <Line type="monotone" dataKey="Lucro" stroke={CHART_COLORS[1]} strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </>
      )}

      {tab === "movimentacoes" && (
        <MovementsList scope={scope} charges={charges} payments={payments} accounts={accounts} clients={clients} canEdit={permissions.canEdit} />
      )}
      {tab === "a_receber" && (
        <ChargesList {...listProps} kind="entrada" onCreate={() => setDialog({ kind: "entrada", pending: true })} />
      )}
      {tab === "a_pagar" && (
        <ChargesList {...listProps} kind="saida" onCreate={() => setDialog({ kind: "saida", pending: true })} />
      )}
      {tab === "config" && (
        <FinancialConfigManager
          scope={scope}
          accounts={accounts}
          categories={categories}
          referenceTypes={referenceTypes}
          accountBalances={accountBalances}
          permissions={permissions}
        />
      )}

      {permissions.canCreate && dialog && (
        <NovaMovimentacaoDialog
          key={`${dialog.kind ?? "escolha"}-${dialog.pending}`}
          scope={scope}
          open
          onOpenChange={(open) => !open && setDialog(null)}
          clients={clients}
          clientServices={clientServices}
          services={services}
          categories={categories}
          referenceTypes={referenceTypes}
          accounts={accounts}
          initialKind={dialog.kind}
          defaultSettled={!dialog.pending}
        />
      )}
    </div>
  );
}

function ComparisonTile({ label, value, pct, goodWhenUp }: { label: string; value: number; pct: number | null; goodWhenUp: boolean }) {
  const good = pct !== null && (goodWhenUp ? pct >= 0 : pct <= 0);
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label} — mês atual x anterior</p>
      <p className="mt-1 text-sm font-medium text-foreground">
        {formatCurrency(value)} <span className={good ? "text-success" : "text-destructive"}>{pctLabel(pct)}</span>
      </p>
    </div>
  );
}

export function UpcomingCard({
  title,
  kind,
  rows,
  today,
  onSeeAll,
  href,
}: {
  title: string;
  kind: FinancialKind;
  rows: ReceivablePayable[];
  today: string;
  onSeeAll?: () => void;
  href?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          <CalendarClock className="h-4 w-4 text-muted-foreground" aria-hidden /> {title}
        </p>
        {onSeeAll && (
          <button type="button" onClick={onSeeAll} className="text-xs text-primary hover:underline">
            Ver todos
          </button>
        )}
        {href && !onSeeAll && (
          <Link href={href} className="text-xs text-primary hover:underline">
            Ver todos
          </Link>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 py-2 text-xs text-muted-foreground">
          {kind === "entrada" ? "Nenhum recebimento pendente." : "Nenhum pagamento pendente."}
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.charge.id} className="flex items-center justify-between gap-2 text-sm">
              <div className="min-w-0">
                <p className="truncate text-foreground">{r.charge.description}</p>
                <p className={`text-xs ${r.charge.due_date < today ? "text-destructive" : "text-muted-foreground"}`}>
                  {formatDate(r.charge.due_date)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <StatusBadge status={chargeBadgeStatus(kind, r.status, r.charge.due_date < today)} />
                <span className="font-medium tabular-nums">{formatCurrency(r.remaining)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
