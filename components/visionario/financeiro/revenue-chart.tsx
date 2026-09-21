"use client";

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { ChartCard } from "@/components/shared/chart-card";
import { formatCurrency } from "@/lib/format";
import { CHART_COLORS } from "@/lib/chart-colors";

/** Gráfico recharts precisa de client boundary — nunca renderizado direto num Server Component. */
export function RevenueChart({
  data,
}: {
  data: Array<{ month: string; Ganhos: number; Gastos: number; Lucro: number }>;
}) {
  return (
    <ChartCard title="Ganhos, gastos e lucro" description="Últimos 6 meses">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data}>
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
  );
}
