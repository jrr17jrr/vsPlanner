import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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
  // Os dois projetos têm lançamentos próprios, sem alterar o financeiro legado.
  const supabase = await createSupabaseServerClient();
  const { data: projectEntries, error: projectsError } = await supabase.from("tiktok_project_entries").select("project,kind,amount,entry_date").eq("space_id",space.id);
  const projects = (["sofia","maria"] as const).map((key) => {
    const rows = (projectEntries ?? []).filter((entry) => entry.project === key);
    const income = rows.filter((entry) => entry.kind === "entrada").reduce((sum, entry) => sum + Number(entry.amount), 0);
    const expenses = rows.filter((entry) => entry.kind === "saida").reduce((sum, entry) => sum + Number(entry.amount), 0);
    return { key, income, expenses, balance: income - expenses };
  });
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

      <section className="space-y-3">
        <div><h2 className="text-base font-semibold">Meus projetos TikTok</h2><p className="text-xs text-muted-foreground">Valores acumulados de cada projeto, registrados separadamente do financeiro geral abaixo.</p></div>
        {projectsError ? (
          <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">Os projetos ainda precisam ser ativados no banco de dados. Execute a migration 20261020_tiktok_projects.sql no Supabase.</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {projects.map((project) => (
              <Link key={project.key} href={`/tiktok/projetos?projeto=${project.key}`} className="group rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/60 hover:bg-accent/30">
                <div className="flex items-center justify-between gap-2"><div><h3 className="font-semibold">{project.key === "sofia" ? "Sofia IA" : "TikTok Real — Maria"}</h3><p className="text-xs text-muted-foreground">{project.key === "sofia" ? "Conta de inteligência artificial" : "Projeto em parceria com sua irmã"}</p></div><ArrowRight className="h-4 w-4 text-primary transition-transform group-hover:translate-x-1" /></div>
                <div className="mt-4 grid grid-cols-3 gap-2"><div><p className="text-xs text-muted-foreground">Receitas</p><p className="text-sm font-semibold text-success">{formatCurrency(project.income)}</p></div><div><p className="text-xs text-muted-foreground">Despesas</p><p className="text-sm font-semibold text-destructive">{formatCurrency(project.expenses)}</p></div><div><p className="text-xs text-muted-foreground">Saldo</p><p className="text-sm font-semibold">{formatCurrency(project.balance)}</p></div></div>
                <p className="mt-4 text-xs font-medium text-primary">Abrir projeto →</p>
              </Link>
            ))}
          </div>
        )}
      </section>
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
