"use client";

import { useMemo } from "react";
import Link from "next/link";
import { TrendingUp, TrendingDown, DollarSign, ArrowRight } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { useAuth } from "@/hooks/use-auth";
import { useDbStore } from "@/store/db-store";
import { PageHeader } from "@/components/shared/page-header";
import { MoneyCard } from "@/components/shared/money-card";
import { ChartCard } from "@/components/shared/chart-card";
import { formatCurrency, formatDate } from "@/lib/format";
import { personalFinanceSummary, sum, monthKeyOf } from "@/lib/selectors";
import { monthKeysForPeriod, monthKeyLabel } from "@/lib/periods";
import { CHART_COLORS } from "@/lib/chart-colors";

export default function TiktokOverviewPage() {
  const { mySpaces } = useAuth();
  const transactions = useDbStore((s) => s.transactions);

  const tiktokSpace = mySpaces.find((s) => s.slug === "tiktok");
  const monthKeys = useMemo(() => monthKeysForPeriod("6m"), []);

  if (!tiktokSpace) return null;

  const summary = personalFinanceSummary({ transactions }, tiktokSpace.id);
  const lucro = summary.entradasMes - summary.saidasMes;

  const spaceTxns = transactions.filter((t) => t.spaceId === tiktokSpace.id);
  const chartData = monthKeys.map((key) => {
    const ganhos = sum(spaceTxns.filter((t) => t.type === "entrada" && monthKeyOf(t.date) === key).map((t) => t.amount));
    const gastos = sum(spaceTxns.filter((t) => t.type === "saida" && monthKeyOf(t.date) === key).map((t) => t.amount));
    return { month: monthKeyLabel(key), Ganhos: ganhos, Gastos: gastos, Lucro: ganhos - gastos };
  });

  const recent = [...spaceTxns].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 6);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="TikTok"
        description="Ganhos e gastos da sua conta de criador, separados do dinheiro pessoal."
        actions={
          <Link href="/tiktok/financeiro" className="flex items-center gap-1 text-xs text-primary hover:underline">
            Ver financeiro completo <ArrowRight className="h-3 w-3" />
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MoneyCard label="Ganhos do mês" amount={summary.entradasMes} icon={DollarSign} tone="success" />
        <MoneyCard label="Gastos do mês" amount={summary.saidasMes} icon={TrendingDown} tone="destructive" />
        <MoneyCard label="Lucro do mês" amount={lucro} icon={TrendingUp} tone={lucro >= 0 ? "success" : "destructive"} />
      </div>

      <ChartCard title="Ganhos, gastos e lucro" description="Últimos 6 meses">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="month" tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
            <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} formatter={(v) => formatCurrency(Number(v))} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="Ganhos" fill={CHART_COLORS[1]} radius={[4, 4, 0, 0]} />
            <Bar dataKey="Gastos" fill={CHART_COLORS[4]} radius={[4, 4, 0, 0]} />
            <Bar dataKey="Lucro" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Transações recentes</h2>
        <div className="flex flex-col gap-2">
          {recent.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
              <div>
                <p className="text-sm font-medium text-foreground">{t.description}</p>
                <p className="text-xs text-muted-foreground">{formatDate(t.date)} · {t.category}</p>
              </div>
              <span className={`text-sm font-medium ${t.type === "entrada" ? "text-success" : "text-destructive"}`}>
                {t.type === "entrada" ? "+" : "-"}{formatCurrency(t.amount)}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
