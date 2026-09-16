"use client";

import { useMemo, useState } from "react";
import { Plus, DollarSign, TrendingUp, TrendingDown, HandCoins, Wallet, Repeat, Pencil, Trash2 } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  PieChart, Pie, Cell, LineChart, Line,
} from "recharts";
import { useAuth } from "@/hooks/use-auth";
import { useDbStore } from "@/store/db-store";
import { PageHeader } from "@/components/shared/page-header";
import { MoneyCard } from "@/components/shared/money-card";
import { ChartCard } from "@/components/shared/chart-card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ExpenseFormDialog } from "@/components/forms/expense-form-dialog";
import { visionarioFinanceSummary, visionarioMRR, sum, monthKeyOf } from "@/lib/selectors";
import { monthKeysForPeriod, monthKeyLabel, PERIOD_LABELS, type PeriodPreset } from "@/lib/periods";
import { formatCurrency, formatDate } from "@/lib/format";
import { CHART_COLORS } from "@/lib/chart-colors";
import type { Expense, ExpenseType } from "@/types/entities";

const TYPE_LABEL: Record<ExpenseType, string> = {
  fixo: "Gastos fixos mensais",
  normal: "Gastos normais",
  anual: "Gastos anuais",
};

export default function VisionarioFinanceiroPage() {
  const { mySpaces } = useAuth();
  const db = useDbStore((s) => s);
  const remove = useDbStore((s) => s.remove);

  const [period, setPeriod] = useState<PeriodPreset>("6m");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | undefined>();
  const [defaultType, setDefaultType] = useState<ExpenseType>("normal");
  const [deleting, setDeleting] = useState<Expense | undefined>();

  const visionarioSpace = mySpaces.find((s) => s.slug === "visionario-dev");
  const monthKeys = useMemo(() => monthKeysForPeriod(period), [period]);

  if (!visionarioSpace) return null;

  const summary = visionarioFinanceSummary(db, visionarioSpace.id);
  const { mrr, recurringClients } = visionarioMRR(db);

  const myExpenses = db.expenses.filter((e) => e.spaceId === visionarioSpace.id);
  const grouped: Record<ExpenseType, Expense[]> = {
    fixo: myExpenses.filter((e) => e.type === "fixo"),
    normal: myExpenses.filter((e) => e.type === "normal"),
    anual: myExpenses.filter((e) => e.type === "anual"),
  };

  const barData = monthKeys.map((key) => {
    const payments = db.clientPayments.filter((p) => p.spaceId === visionarioSpace.id && p.competencia === key);
    const despesas = sum(myExpenses.filter((e) => monthKeyOf(e.date) === key).map((e) => e.amount));
    return {
      month: monthKeyLabel(key),
      Faturamento: sum(payments.map((p) => p.amount)),
      Despesas: despesas,
    };
  });

  const profitData = monthKeys.reduce<{ month: string; Lucro: number }[]>((acc, key) => {
    const s = visionarioFinanceSummary(db, visionarioSpace.id, key);
    const previous = acc.length > 0 ? acc[acc.length - 1].Lucro : 0;
    acc.push({ month: monthKeyLabel(key), Lucro: previous + s.lucro });
    return acc;
  }, []);

  const categoryMap = new Map<string, number>();
  myExpenses
    .filter((e) => monthKeys.includes(monthKeyOf(e.date)))
    .forEach((e) => categoryMap.set(e.category, (categoryMap.get(e.category) ?? 0) + e.amount));
  const donutData = Array.from(categoryMap.entries()).map(([name, value]) => ({ name, value }));

  const serviceRevenueMap = new Map<string, number>();
  db.clients
    .filter((c) => c.spaceId === visionarioSpace.id && c.status === "ativo")
    .forEach((client) => {
      db.clientServices
        .filter((cs) => cs.clientId === client.id)
        .forEach((cs) => {
          const svc = db.services.find((s) => s.id === cs.serviceId);
          const name = svc?.name ?? "Outro";
          serviceRevenueMap.set(name, (serviceRevenueMap.get(name) ?? 0) + cs.price);
        });
    });
  const serviceRevenueData = Array.from(serviceRevenueMap.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const recebidoVsReceber = [
    { name: "Recebido", value: summary.recebido },
    { name: "A receber", value: summary.aReceber },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Financeiro — Visionário Dev"
        description="Faturamento, despesas, comissões e lucro da empresa."
        actions={
          <Button size="sm" onClick={() => { setEditing(undefined); setDefaultType("normal"); setFormOpen(true); }}>
            <Plus className="h-4 w-4" /> Novo gasto
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MoneyCard label="Faturamento (mês)" amount={summary.faturamento} icon={DollarSign} />
        <MoneyCard label="Recebido" amount={summary.recebido} icon={TrendingUp} tone="success" />
        <MoneyCard label="A receber" amount={summary.aReceber} icon={Wallet} tone="warning" />
        <MoneyCard label="Despesas" amount={summary.despesas} icon={TrendingDown} tone="destructive" />
        <MoneyCard label="Comissões" amount={summary.comissoes} icon={HandCoins} />
        <MoneyCard label="Lucro (mês)" amount={summary.lucro} tone={summary.lucro >= 0 ? "success" : "destructive"} />
        <MoneyCard label="Receita recorrente (MRR)" amount={mrr} icon={Repeat} hint={`${recurringClients} clientes recorrentes`} />
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
        <ChartCard title="Faturamento x Despesas" description={PERIOD_LABELS[period]}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barData}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
              <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} formatter={(v) => formatCurrency(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Faturamento" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
              <Bar dataKey="Despesas" fill={CHART_COLORS[4]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Evolução do lucro" description="Acumulado no período">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={profitData}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
              <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} formatter={(v) => formatCurrency(Number(v))} />
              <Line type="monotone" dataKey="Lucro" stroke={CHART_COLORS[1]} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
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

        <ChartCard title="Recebido x A receber" description="Mês atual">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={recebidoVsReceber} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                <Cell fill={CHART_COLORS[1]} />
                <Cell fill={CHART_COLORS[2]} />
              </Pie>
              <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} formatter={(v) => formatCurrency(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Receita por serviço" description="Clientes ativos" className="lg:col-span-2">
          {serviceRevenueData.length === 0 ? (
            <EmptyState title="Sem receita cadastrada" className="border-0 py-12" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={serviceRevenueData} layout="vertical">
                <CartesianGrid horizontal={false} stroke="var(--border)" />
                <XAxis type="number" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} axisLine={false} tickLine={false} width={140} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} formatter={(v) => formatCurrency(Number(v))} />
                <Bar dataKey="value" fill={CHART_COLORS[3]} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Gastos</h2>
        <Tabs defaultValue="fixo">
          <TabsList>
            <TabsTrigger value="fixo">Fixos</TabsTrigger>
            <TabsTrigger value="normal">Normais</TabsTrigger>
            <TabsTrigger value="anual">Anuais</TabsTrigger>
          </TabsList>
          {(["fixo", "normal", "anual"] as ExpenseType[]).map((type) => (
            <TabsContent key={type} value={type}>
              <div className="mb-2 flex justify-end">
                <Button size="sm" variant="outline" onClick={() => { setEditing(undefined); setDefaultType(type); setFormOpen(true); }}>
                  <Plus className="h-4 w-4" /> Adicionar
                </Button>
              </div>
              {grouped[type].length === 0 ? (
                <EmptyState title={`Nenhum ${TYPE_LABEL[type].toLowerCase()}`} />
              ) : (
                <div className="flex flex-col gap-2">
                  {grouped[type].map((e) => (
                    <div key={e.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{e.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {e.category}
                          {e.nextDueDate && ` · próximo vencimento ${formatDate(e.nextDueDate)}`}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-sm font-medium">{formatCurrency(e.amount)}</span>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(e); setFormOpen(true); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleting(e)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </section>

      <ExpenseFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        expense={editing}
        spaceId={visionarioSpace.id}
        defaultType={defaultType}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        title="Excluir gasto?"
        onConfirm={() => deleting && remove("expenses", deleting.id)}
      />
    </div>
  );
}
