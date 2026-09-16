"use client";

import { useMemo, useState } from "react";
import { Plus, Wallet, TrendingUp, TrendingDown, CalendarClock, Pencil, Trash2 } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";
import { useAuth } from "@/hooks/use-auth";
import { useDbStore } from "@/store/db-store";
import { PageHeader } from "@/components/shared/page-header";
import { MoneyCard } from "@/components/shared/money-card";
import { ChartCard } from "@/components/shared/chart-card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { TransactionFormDialog } from "@/components/forms/transaction-form-dialog";
import { RecurringExpenseFormDialog } from "@/components/forms/recurring-expense-form-dialog";
import { ResponsiveTable } from "@/components/shared/responsive-table";
import { personalFinanceSummary, sum, daysUntil } from "@/lib/selectors";
import { monthKeysForPeriod, monthKeyLabel, PERIOD_LABELS, type PeriodPreset } from "@/lib/periods";
import { formatCurrency, formatDate } from "@/lib/format";
import { CHART_COLORS } from "@/lib/chart-colors";
import type { Transaction, RecurringExpense } from "@/types/entities";

export default function FinanceiroPage() {
  const { profile, personalSpace } = useAuth();
  const transactions = useDbStore((s) => s.transactions);
  const recurringExpenses = useDbStore((s) => s.recurringExpenses);
  const financialAccounts = useDbStore((s) => s.financialAccounts);
  const remove = useDbStore((s) => s.remove);

  const [period, setPeriod] = useState<PeriodPreset>("6m");
  const [txnFormOpen, setTxnFormOpen] = useState(false);
  const [editingTxn, setEditingTxn] = useState<Transaction | undefined>();
  const [deletingTxn, setDeletingTxn] = useState<Transaction | undefined>();
  const [recFormOpen, setRecFormOpen] = useState(false);
  const [editingRec, setEditingRec] = useState<RecurringExpense | undefined>();
  const [deletingRec, setDeletingRec] = useState<RecurringExpense | undefined>();

  const monthKeys = useMemo(() => monthKeysForPeriod(period), [period]);

  if (!profile || !personalSpace) return null;

  const account = financialAccounts.find((a) => a.spaceId === personalSpace.id);
  const spaceTxns = transactions.filter((t) => t.spaceId === personalSpace.id);
  const periodTxns = spaceTxns.filter((t) => monthKeys.includes(t.date.slice(0, 7)));

  const summary = personalFinanceSummary({ transactions }, personalSpace.id);
  const entradasPeriodo = sum(periodTxns.filter((t) => t.type === "entrada").map((t) => t.amount));
  const saidasPeriodo = sum(periodTxns.filter((t) => t.type === "saida").map((t) => t.amount));

  const bills = recurringExpenses
    .filter((e) => e.spaceId === personalSpace.id)
    .map((e) => ({ ...e, days: daysUntil(e.nextDueDate) }));
  const pendentesTotal = sum(bills.filter((b) => b.active).map((b) => b.amount));

  const barData = monthKeys.map((key) => ({
    month: monthKeyLabel(key),
    Entradas: sum(spaceTxns.filter((t) => t.type === "entrada" && t.date.slice(0, 7) === key).map((t) => t.amount)),
    Saídas: sum(spaceTxns.filter((t) => t.type === "saida" && t.date.slice(0, 7) === key).map((t) => t.amount)),
  }));

  const categoryMap = new Map<string, number>();
  periodTxns
    .filter((t) => t.type === "saida")
    .forEach((t) => categoryMap.set(t.category, (categoryMap.get(t.category) ?? 0) + t.amount));
  const donutData = Array.from(categoryMap.entries()).map(([name, value]) => ({ name, value }));

  const lineData = monthKeys.reduce<{ month: string; Saldo: number }[]>((acc, key) => {
    const net = sum(spaceTxns.filter((t) => t.date.slice(0, 7) === key && t.type === "entrada").map((t) => t.amount))
      - sum(spaceTxns.filter((t) => t.date.slice(0, 7) === key && t.type === "saida").map((t) => t.amount));
    const previous = acc.length > 0 ? acc[acc.length - 1].Saldo : 0;
    acc.push({ month: monthKeyLabel(key), Saldo: previous + net });
    return acc;
  }, []);

  const sourceMap = new Map<string, number>();
  periodTxns
    .filter((t) => t.type === "entrada")
    .forEach((t) => sourceMap.set(t.source ?? "Outros", (sourceMap.get(t.source ?? "Outros") ?? 0) + t.amount));
  const sourceData = Array.from(sourceMap.entries()).map(([name, value]) => ({ name, value }));

  const recentTxns = [...periodTxns].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Meu Dinheiro"
        description="Visão consolidada das suas finanças pessoais."
        actions={
          <Button size="sm" onClick={() => { setEditingTxn(undefined); setTxnFormOpen(true); }}>
            <Plus className="h-4 w-4" /> Nova transação
          </Button>
        }
      />

      <div className="flex items-center justify-between gap-2">
        <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
          <MoneyCard label="Saldo atual" amount={summary.saldo} icon={Wallet} />
          <MoneyCard label="Entradas" amount={entradasPeriodo} icon={TrendingUp} tone="success" />
          <MoneyCard label="Saídas" amount={saidasPeriodo} icon={TrendingDown} tone="destructive" />
          <MoneyCard label="Contas pendentes" amount={pendentesTotal} icon={CalendarClock} tone="warning" />
        </div>
      </div>

      <div className="flex justify-end">
        <Select value={period} onValueChange={(v) => setPeriod(v as PeriodPreset)}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(PERIOD_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Entradas x Saídas" description={PERIOD_LABELS[period]}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barData} barGap={4}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
              <Tooltip
                contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                formatter={(v) => formatCurrency(Number(v))}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Entradas" fill={CHART_COLORS[1]} radius={[4, 4, 0, 0]} />
              <Bar dataKey="Saídas" fill={CHART_COLORS[4]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Gastos por categoria" description={PERIOD_LABELS[period]}>
          {donutData.length === 0 ? (
            <EmptyState title="Sem gastos no período" className="border-0 py-12" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                  {donutData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                  formatter={(v) => formatCurrency(Number(v))}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Evolução do saldo" description="Resultado acumulado no período">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={lineData}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
              <Tooltip
                contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                formatter={(v) => formatCurrency(Number(v))}
              />
              <Line type="monotone" dataKey="Saldo" stroke={CHART_COLORS[0]} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Fontes de renda" description={PERIOD_LABELS[period]}>
          {sourceData.length === 0 ? (
            <EmptyState title="Sem entradas no período" className="border-0 py-12" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={sourceData} layout="vertical">
                <CartesianGrid horizontal={false} stroke="var(--border)" />
                <XAxis type="number" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} axisLine={false} tickLine={false} width={100} />
                <Tooltip
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                  formatter={(v) => formatCurrency(Number(v))}
                />
                <Bar dataKey="value" fill={CHART_COLORS[1]} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Gastos recorrentes */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Gastos recorrentes</h2>
          <Button size="sm" variant="outline" onClick={() => { setEditingRec(undefined); setRecFormOpen(true); }}>
            <Plus className="h-4 w-4" /> Novo gasto recorrente
          </Button>
        </div>
        {bills.length === 0 ? (
          <EmptyState title="Nenhum gasto recorrente cadastrado" />
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {bills.map((b) => (
              <div key={b.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{b.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(b.amount)} · {b.periodicity} · vence {formatDate(b.nextDueDate)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingRec(b); setRecFormOpen(true); }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeletingRec(b)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Transações */}
      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Transações</h2>
        {recentTxns.length === 0 ? (
          <EmptyState title="Nenhuma transação neste período" />
        ) : (
          <ResponsiveTable
            data={recentTxns}
            columns={[
              { key: "date", header: "Data", render: (t) => formatDate(t.date) },
              { key: "desc", header: "Descrição", render: (t) => t.description },
              { key: "cat", header: "Categoria", render: (t) => t.category },
              {
                key: "amount",
                header: "Valor",
                render: (t) => (
                  <span className={t.type === "entrada" ? "text-success" : "text-destructive"}>
                    {t.type === "entrada" ? "+" : "-"}
                    {formatCurrency(t.amount)}
                  </span>
                ),
              },
              {
                key: "actions",
                header: "",
                className: "text-right",
                render: (t) => (
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingTxn(t); setTxnFormOpen(true); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeletingTxn(t)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ),
              },
            ]}
            renderMobileCard={(t) => (
              <div className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{t.description}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(t.date)} · {t.category}</p>
                </div>
                <span className={`shrink-0 text-sm font-medium ${t.type === "entrada" ? "text-success" : "text-destructive"}`}>
                  {t.type === "entrada" ? "+" : "-"}{formatCurrency(t.amount)}
                </span>
              </div>
            )}
          />
        )}
      </section>

      {account && (
        <TransactionFormDialog
          open={txnFormOpen}
          onOpenChange={setTxnFormOpen}
          transaction={editingTxn}
          spaceId={personalSpace.id}
          accountId={account.id}
        />
      )}
      <RecurringExpenseFormDialog
        open={recFormOpen}
        onOpenChange={setRecFormOpen}
        item={editingRec}
        spaceId={personalSpace.id}
      />
      <ConfirmDialog
        open={!!deletingTxn}
        onOpenChange={(open) => !open && setDeletingTxn(undefined)}
        title="Excluir transação?"
        onConfirm={() => deletingTxn && remove("transactions", deletingTxn.id)}
      />
      <ConfirmDialog
        open={!!deletingRec}
        onOpenChange={(open) => !open && setDeletingRec(undefined)}
        title="Excluir gasto recorrente?"
        onConfirm={() => deletingRec && remove("recurringExpenses", deletingRec.id)}
      />
    </div>
  );
}
