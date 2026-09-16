"use client";

import { useMemo, useState } from "react";
import { Plus, Wallet, TrendingUp, TrendingDown, Pencil, Trash2 } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  PieChart, Pie, Cell,
} from "recharts";
import { useAuth } from "@/hooks/use-auth";
import { useDbStore } from "@/store/db-store";
import { PageHeader } from "@/components/shared/page-header";
import { MoneyCard } from "@/components/shared/money-card";
import { ChartCard } from "@/components/shared/chart-card";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { TransactionFormDialog } from "@/components/forms/transaction-form-dialog";
import { ResponsiveTable } from "@/components/shared/responsive-table";
import { personalFinanceSummary, sum } from "@/lib/selectors";
import { monthKeysForPeriod, monthKeyLabel, PERIOD_LABELS, type PeriodPreset } from "@/lib/periods";
import { formatCurrency, formatDate } from "@/lib/format";
import { CHART_COLORS } from "@/lib/chart-colors";
import type { Transaction } from "@/types/entities";

export default function TiktokFinanceiroPage() {
  const { mySpaces } = useAuth();
  const transactions = useDbStore((s) => s.transactions);
  const financialAccounts = useDbStore((s) => s.financialAccounts);
  const remove = useDbStore((s) => s.remove);

  const [period, setPeriod] = useState<PeriodPreset>("6m");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | undefined>();
  const [deleting, setDeleting] = useState<Transaction | undefined>();

  const tiktokSpace = mySpaces.find((s) => s.slug === "tiktok");
  const monthKeys = useMemo(() => monthKeysForPeriod(period), [period]);

  if (!tiktokSpace) return null;

  const account = financialAccounts.find((a) => a.spaceId === tiktokSpace.id);
  const spaceTxns = transactions.filter((t) => t.spaceId === tiktokSpace.id);
  const periodTxns = spaceTxns.filter((t) => monthKeys.includes(t.date.slice(0, 7)));

  const summary = personalFinanceSummary({ transactions }, tiktokSpace.id);
  const ganhosPeriodo = sum(periodTxns.filter((t) => t.type === "entrada").map((t) => t.amount));
  const gastosPeriodo = sum(periodTxns.filter((t) => t.type === "saida").map((t) => t.amount));

  const barData = monthKeys.map((key) => ({
    month: monthKeyLabel(key),
    Ganhos: sum(spaceTxns.filter((t) => t.type === "entrada" && t.date.slice(0, 7) === key).map((t) => t.amount)),
    Gastos: sum(spaceTxns.filter((t) => t.type === "saida" && t.date.slice(0, 7) === key).map((t) => t.amount)),
  }));

  const categoryMap = new Map<string, number>();
  periodTxns.filter((t) => t.type === "saida").forEach((t) => categoryMap.set(t.category, (categoryMap.get(t.category) ?? 0) + t.amount));
  const donutData = Array.from(categoryMap.entries()).map(([name, value]) => ({ name, value }));

  const recentTxns = [...periodTxns].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Financeiro — TikTok"
        description="Ganhos e gastos da conta de criador."
        actions={
          <Button size="sm" onClick={() => { setEditing(undefined); setFormOpen(true); }}>
            <Plus className="h-4 w-4" /> Nova transação
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MoneyCard label="Saldo atual" amount={summary.saldo} icon={Wallet} />
        <MoneyCard label="Ganhos" amount={ganhosPeriodo} icon={TrendingUp} tone="success" />
        <MoneyCard label="Gastos" amount={gastosPeriodo} icon={TrendingDown} tone="destructive" />
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
        <ChartCard title="Ganhos x Gastos" description={PERIOD_LABELS[period]}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barData}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
              <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} formatter={(v) => formatCurrency(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Ganhos" fill={CHART_COLORS[1]} radius={[4, 4, 0, 0]} />
              <Bar dataKey="Gastos" fill={CHART_COLORS[4]} radius={[4, 4, 0, 0]} />
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
                  {donutData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} formatter={(v) => formatCurrency(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

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
                key: "amount", header: "Valor",
                render: (t) => (
                  <span className={t.type === "entrada" ? "text-success" : "text-destructive"}>
                    {t.type === "entrada" ? "+" : "-"}{formatCurrency(t.amount)}
                  </span>
                ),
              },
              {
                key: "actions", header: "", className: "text-right",
                render: (t) => (
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(t); setFormOpen(true); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleting(t)}>
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
          open={formOpen}
          onOpenChange={setFormOpen}
          transaction={editing}
          spaceId={tiktokSpace.id}
          accountId={account.id}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        title="Excluir transação?"
        onConfirm={() => deleting && remove("transactions", deleting.id)}
      />
    </div>
  );
}
