"use client";

import Link from "next/link";
import {
  DollarSign, TrendingUp, TrendingDown, HandCoins, Wallet, Repeat, Users, Briefcase, ArrowRight,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useDbStore } from "@/store/db-store";
import { PageHeader } from "@/components/shared/page-header";
import { MoneyCard } from "@/components/shared/money-card";
import { MetricCard } from "@/components/shared/metric-card";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { visionarioFinanceSummary, visionarioMRR, daysUntil } from "@/lib/selectors";
import { formatCurrency, formatDate } from "@/lib/format";

export default function VisionarioOverviewPage() {
  const { mySpaces } = useAuth();
  const db = useDbStore((s) => s);

  const visionarioSpace = mySpaces.find((s) => s.slug === "visionario-dev");
  if (!visionarioSpace) return null;

  const summary = visionarioFinanceSummary(db, visionarioSpace.id);
  const { mrr } = visionarioMRR(db);
  const activeClients = db.clients.filter((c) => c.spaceId === visionarioSpace.id && c.status === "ativo");
  const pendingWork = db.workItems.filter((w) => w.spaceId === visionarioSpace.id && w.status !== "concluido");

  const upcomingPayments = db.clientPayments
    .filter((p) => p.spaceId === visionarioSpace.id && p.status !== "pago")
    .map((p) => ({ ...p, days: daysUntil(p.dueDate) }))
    .sort((a, b) => (a.days ?? 0) - (b.days ?? 0))
    .slice(0, 5);

  const upcomingWork = db.workItems
    .filter((w) => w.spaceId === visionarioSpace.id && w.status !== "concluido" && w.dueDate)
    .map((w) => ({ ...w, days: daysUntil(w.dueDate) }))
    .sort((a, b) => (a.days ?? 0) - (b.days ?? 0))
    .slice(0, 5);

  const expiringDomains = db.clientSites
    .filter((s) => activeClients.some((c) => c.id === s.clientId))
    .map((s) => ({ ...s, days: daysUntil(s.domainRenewalDate) }))
    .filter((s) => s.days !== null && s.days <= 45)
    .sort((a, b) => (a.days ?? 0) - (b.days ?? 0))
    .slice(0, 5);

  const upcomingExpenses = db.expenses
    .filter((e) => e.spaceId === visionarioSpace.id && e.nextDueDate)
    .map((e) => ({ ...e, days: daysUntil(e.nextDueDate) }))
    .filter((e) => e.days !== null && e.days <= 30)
    .sort((a, b) => (a.days ?? 0) - (b.days ?? 0))
    .slice(0, 5);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Visionário Dev" description="Visão geral do negócio." />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <MoneyCard label="Faturamento" amount={summary.faturamento} icon={DollarSign} />
        <MoneyCard label="Recebido" amount={summary.recebido} icon={TrendingUp} tone="success" />
        <MoneyCard label="A receber" amount={summary.aReceber} icon={Wallet} tone="warning" />
        <MoneyCard label="Despesas" amount={summary.despesas} icon={TrendingDown} tone="destructive" />
        <MoneyCard label="Comissões" amount={summary.comissoes} icon={HandCoins} />
        <MoneyCard label="Lucro" amount={summary.lucro} tone={summary.lucro >= 0 ? "success" : "destructive"} />
        <MoneyCard label="Receita recorrente" amount={mrr} icon={Repeat} />
        <MetricCard label="Clientes ativos" value={activeClients.length} icon={Users} />
      </div>

      <MetricCard label="Trabalhos pendentes" value={pendingWork.length} icon={Briefcase} className="max-w-xs" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">Próximos pagamentos</p>
            <Link href="/visionario/clientes" className="flex items-center gap-1 text-xs text-primary hover:underline">
              Ver clientes <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {upcomingPayments.length === 0 ? (
              <p className="py-2 text-xs text-muted-foreground">Nenhum pagamento pendente.</p>
            ) : (
              upcomingPayments.map((p) => {
                const client = db.clients.find((c) => c.id === p.clientId);
                return (
                  <Link key={p.id} href={`/visionario/clientes/${p.clientId}`} className="flex items-center justify-between text-sm hover:text-primary">
                    <span className="truncate">{client?.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{formatCurrency(p.amount)}</span>
                      <StatusBadge status={p.status} />
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">Trabalhos próximos do prazo</p>
            <Link href="/visionario/trabalhos" className="flex items-center gap-1 text-xs text-primary hover:underline">
              Ver trabalhos <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {upcomingWork.length === 0 ? (
              <p className="py-2 text-xs text-muted-foreground">Nenhum prazo próximo.</p>
            ) : (
              upcomingWork.map((w) => (
                <div key={w.id} className="flex items-center justify-between text-sm">
                  <span className="truncate">{w.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{w.dueDate && formatDate(w.dueDate)}</span>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">Domínios vencendo</p>
            <Link href="/visionario/sites" className="flex items-center gap-1 text-xs text-primary hover:underline">
              Ver sites <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {expiringDomains.length === 0 ? (
              <p className="py-2 text-xs text-muted-foreground">Nenhum domínio vencendo em breve.</p>
            ) : (
              expiringDomains.map((s) => (
                <div key={s.id} className="flex items-center justify-between text-sm">
                  <span className="truncate">{s.domain}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{s.domainRenewalDate && formatDate(s.domainRenewalDate)}</span>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">Gastos próximos</p>
            <Link href="/visionario/financeiro" className="flex items-center gap-1 text-xs text-primary hover:underline">
              Ver financeiro <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {upcomingExpenses.length === 0 ? (
              <p className="py-2 text-xs text-muted-foreground">Nenhum gasto vencendo em breve.</p>
            ) : (
              upcomingExpenses.map((e) => (
                <div key={e.id} className="flex items-center justify-between text-sm">
                  <span className="truncate">{e.description}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatCurrency(e.amount)}</span>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
