"use client";

import { useMemo, useState } from "react";
import { Plus, Wallet, TrendingUp, TrendingDown, HandCoins, AlertTriangle, Repeat, DollarSign } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, LineChart, Line,
} from "recharts";
import { PageHeader } from "@/components/shared/page-header";
import { MoneyCard } from "@/components/shared/money-card";
import { ChartCard } from "@/components/shared/chart-card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NovaMovimentacaoDialog } from "@/components/visionario/financeiro/nova-movimentacao-dialog";
import { ChargesList } from "@/components/visionario/financeiro/charges-list";
import { FinancialConfigManager } from "@/components/visionario/financeiro/financial-config-manager";
import {
  accountBalance,
  totalBalance,
  cashFlowForecast,
  calculateMRR,
  monthlyComparison,
  historicalSeries,
  listChargesForKind,
  monthCashSummary,
} from "@/lib/financial-calc";
import { formatCurrency, currentMonthKeySaoPaulo } from "@/lib/format";
import { monthKeysForPeriod, monthKeyLabel, PERIOD_LABELS, type PeriodPreset } from "@/lib/periods";
import { CHART_COLORS } from "@/lib/chart-colors";
import type {
  Client,
  ClientService,
  FinancialAccount,
  FinancialCategory,
  FinancialCharge,
  FinancialOrigin,
  FinancialPayment,
  FinancialReferenceType,
  Service,
} from "@/types/database.types";
import type { FinancialScope } from "@/lib/space-slugs";

type Tab = "dashboard" | "a_receber" | "a_pagar" | "config";

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
}: {
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
  const [tab, setTab] = useState<Tab>("dashboard");
  const [period, setPeriod] = useState<PeriodPreset>("6m");
  const [movementOpen, setMovementOpen] = useState(false);

  const chargeKindById = useMemo(() => new Map(charges.map((c) => [c.id, c.kind])), [charges]);
  const accountBalances = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of accounts) map.set(a.id, accountBalance(a, payments, chargeKindById));
    return map;
  }, [accounts, payments, chargeKindById]);

  const saldoTotal = useMemo(() => totalBalance(accounts, payments, chargeKindById), [accounts, payments, chargeKindById]);
  const forecast = useMemo(() => cashFlowForecast(accounts, charges, payments, 30), [accounts, charges, payments]);
  const { mrr, recurringCount } = useMemo(() => calculateMRR(origins, charges), [origins, charges]);

  const curMonth = currentMonthKeySaoPaulo();
  const prevMonth = previousMonthKey(curMonth);
  const comparison = useMemo(() => monthlyComparison(charges, curMonth, prevMonth), [charges, curMonth, prevMonth]);

  const monthKeys = useMemo(() => monthKeysForPeriod(period), [period]);
  const series = useMemo(() => historicalSeries(charges, monthKeys), [charges, monthKeys]);
  const chartData = series.map((s) => ({ month: monthKeyLabel(s.month), Receita: s.receita, Despesas: s.despesa, Lucro: s.lucro }));

  // "Recebido" precisa ser CAIXA (o que de fato entrou), não competência —
  // senão uma cobrança 100% pendente apareceria como "recebida" só por
  // vencer neste mês. Despesas/Lucro continuam por competência (mesma
  // convenção da Visão Geral e do Dashboard raiz).
  const recebidoMes = useMemo(() => monthCashSummary(charges, payments, curMonth).recebido, [charges, payments, curMonth]);
  const despesasMes = comparison.current.despesa;
  const lucroMes = comparison.current.lucro;

  const atrasado = useMemo(
    () =>
      listChargesForKind(charges, payments, "entrada")
        .filter((r) => r.bucket === "atrasadas")
        .reduce((s, r) => s + r.remaining, 0),
    [charges, payments]
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Financeiro — ${SCOPE_TITLE[scope]}`}
        description="Entradas, saídas, contas a receber/pagar e previsão de caixa reais."
        actions={
          permissions.canCreate ? (
            <Button size="sm" onClick={() => setMovementOpen(true)}>
              <Plus className="h-4 w-4" /> Nova movimentação
            </Button>
          ) : undefined
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="a_receber">A receber</TabsTrigger>
          <TabsTrigger value="a_pagar">A pagar</TabsTrigger>
          <TabsTrigger value="config">Contas e categorias</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "dashboard" && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MoneyCard label="Saldo atual" amount={saldoTotal} icon={Wallet} />
            <MoneyCard label="Recebido (mês)" amount={recebidoMes} icon={TrendingUp} tone="success" />
            <MoneyCard label="A receber (30d)" amount={forecast.aReceber} icon={HandCoins} tone="warning" />
            <MoneyCard label="Atrasado" amount={atrasado} icon={AlertTriangle} tone="destructive" />
            <MoneyCard label="Despesas (mês)" amount={despesasMes} icon={TrendingDown} tone="destructive" />
            <MoneyCard label="Lucro (mês)" amount={lucroMes} icon={DollarSign} tone={lucroMes >= 0 ? "success" : "destructive"} />
            <MoneyCard label="MRR" amount={mrr} icon={Repeat} hint={`${recurringCount} recorrência(s) ativa(s)`} />
            <MoneyCard label="Saldo projetado (30d)" amount={forecast.saldoProjetado} icon={Wallet} />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">Receita — mês atual x anterior</p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {formatCurrency(comparison.current.receita)} <span className={comparison.pctReceita !== null && comparison.pctReceita >= 0 ? "text-success" : "text-destructive"}>{pctLabel(comparison.pctReceita)}</span>
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">Despesas — mês atual x anterior</p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {formatCurrency(comparison.current.despesa)} <span className={comparison.pctDespesa !== null && comparison.pctDespesa <= 0 ? "text-success" : "text-destructive"}>{pctLabel(comparison.pctDespesa)}</span>
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">Lucro — mês atual x anterior</p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {formatCurrency(comparison.current.lucro)} <span className={comparison.pctLucro !== null && comparison.pctLucro >= 0 ? "text-success" : "text-destructive"}>{pctLabel(comparison.pctLucro)}</span>
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            <Select value={period} onValueChange={(v) => setPeriod(v as PeriodPreset)}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
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

      {tab === "a_receber" && (
        <ChargesList scope={scope} kind="entrada" charges={charges} payments={payments} accounts={accounts} clients={clients} categories={categories} referenceTypes={referenceTypes} />
      )}
      {tab === "a_pagar" && (
        <ChargesList scope={scope} kind="saida" charges={charges} payments={payments} accounts={accounts} clients={clients} categories={categories} referenceTypes={referenceTypes} />
      )}
      {tab === "config" && (
        <FinancialConfigManager
          scope={scope}
          accounts={accounts}
          categories={categories}
          referenceTypes={referenceTypes}
          accountBalances={accountBalances}
        />
      )}

      {permissions.canCreate && (
        <NovaMovimentacaoDialog
          scope={scope}
          open={movementOpen}
          onOpenChange={setMovementOpen}
          clients={clients}
          clientServices={clientServices}
          services={services}
          categories={categories}
          referenceTypes={referenceTypes}
          accounts={accounts.filter((a) => a.is_active)}
        />
      )}
    </div>
  );
}
