import Link from "next/link";
import { TrendingUp, TrendingDown, DollarSign, ArrowRight, HandCoins, Receipt } from "lucide-react";
import { requireScopedModulePermission } from "@/lib/supabase/dal";
import { listFinancialAccounts, listFinancialCharges, listFinancialPayments } from "@/lib/supabase/repositories/financial.repository";
import { prepareFinancialSpace } from "@/lib/supabase/financial-page-data";
import { financialMonthOverview, historicalSeries } from "@/lib/financial-calc";
import { PageHeader } from "@/components/shared/page-header";
import { MoneyCard } from "@/components/shared/money-card";
import { EmptyState } from "@/components/shared/empty-state";
import { RevenueChart } from "@/components/visionario/financeiro/revenue-chart";
import { formatCurrency, formatDate } from "@/lib/format";
import { monthKeysForPeriod, monthKeyLabel } from "@/lib/periods";

/**
 * Dashboard do TikTok — 100% real, reaproveitando o Financeiro (migration
 * 007) via `scope: "tiktok"`. Nenhum dado do Visionário Dev ou Pessoal
 * entra aqui — tudo filtrado pelo `space_id` do TikTok.
 */
export default async function TiktokOverviewPage() {
  const { profile, space } = await requireScopedModulePermission("tiktok", "financeiro", "view");

  await prepareFinancialSpace(space, profile.id);
  const [charges, payments, accounts] = await Promise.all([
    listFinancialCharges(space.id),
    listFinancialPayments(space.id),
    listFinancialAccounts(space.id),
  ]);
  // Mesmo cálculo da Home geral e do Financeiro do TikTok.
  const overview = financialMonthOverview(accounts, charges, payments);

  const monthKeys = monthKeysForPeriod("6m");
  const series = historicalSeries(charges, monthKeys);
  const chartData = series.map((s) => ({ month: monthKeyLabel(s.month), Ganhos: s.receita, Gastos: s.despesa, Lucro: s.lucro }));


  const recentPayments = [...payments].sort((a, b) => b.payment_date.localeCompare(a.payment_date)).slice(0, 6);
  const chargeById = new Map(charges.map((c) => [c.id, c]));

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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MoneyCard label="Entrou no mês" amount={overview.recebido} icon={DollarSign} tone="success" hint="Pela data real" />
        <MoneyCard label="Saiu no mês" amount={overview.pago} icon={TrendingDown} tone="destructive" hint="Pela data real" />
        <MoneyCard
          label="Resultado do mês"
          amount={overview.resultado}
          icon={TrendingUp}
          tone={overview.resultado > 0 ? "success" : overview.resultado < 0 ? "destructive" : "default"}
          hint="Entrou − saiu"
        />
        <MoneyCard label="A receber" amount={overview.aReceber.total} icon={HandCoins} tone="warning" />
        <MoneyCard label="A pagar" amount={overview.aPagar.total} icon={Receipt} tone="warning" />
      </div>

      <RevenueChart data={chartData} />

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Pagamentos recentes</h2>
        {recentPayments.length === 0 ? (
          <EmptyState title="Nenhuma movimentação encontrada" />
        ) : (
          <div className="flex flex-col gap-2">
            {recentPayments.map((p) => {
              const charge = chargeById.get(p.charge_id);
              return (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{charge?.description ?? "Movimentação"}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(p.payment_date)}</p>
                  </div>
                  <span className={`text-sm font-medium ${charge?.kind === "entrada" ? "text-success" : "text-destructive"}`}>
                    {charge?.kind === "entrada" ? "+" : "-"}{formatCurrency(p.amount)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
