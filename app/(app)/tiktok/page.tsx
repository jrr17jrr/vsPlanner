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
import { formatCurrency, formatDate, todayKeySaoPaulo } from "@/lib/format";
import { buildProjectView, PROJECTS, type ProjectEntry } from "@/lib/tiktok-projects";
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
  const { data: projectEntries, error: projectsError } = await supabase.from("tiktok_project_entries").select("id,project,kind,amount,entry_date,description").eq("space_id",space.id);
  // Perfis (projetos) separados do financeiro geral: saldo, mês atual e última movimentação — só lançamentos reais.
  const thisMonth = todayKeySaoPaulo().slice(0, 7);
  const projectRows = (projectEntries ?? []) as ProjectEntry[];
  const projects = (["sofia", "maria"] as const).map((key) => {
    const all = buildProjectView(projectRows, { project: key, type: "todos", month: "todos", query: "" });
    const month = buildProjectView(projectRows, { project: key, type: "todos", month: thisMonth, query: "" });
    return { key, info: PROJECTS[key], all: all.totals, month: month.totals, lastDate: all.lastDate };
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
        description="Perfis e financeiro da conta de criador, separados do dinheiro pessoal."
        actions={
          <div className="flex flex-wrap gap-3">
            <Link href="/tiktok/projetos" className="flex items-center gap-1 text-xs text-primary hover:underline">Perfis <ArrowRight className="h-3 w-3" /></Link>
            <Link href="/tiktok/financeiro" className="flex items-center gap-1 text-xs text-primary hover:underline">Financeiro completo <ArrowRight className="h-3 w-3" /></Link>
          </div>
        }
      />

      <section className="space-y-3" aria-label="Perfis do TikTok">
        <div><h2 className="text-base font-semibold">Perfis</h2><p className="text-xs text-muted-foreground">Cada perfil tem lançamentos próprios, separados do financeiro geral abaixo.</p></div>
        {projectsError ? (
          <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">Os perfis ainda precisam ser ativados no banco de dados. Execute a migration 20261020_tiktok_projects.sql no Supabase.</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {projects.map((p) => (
              <Link key={p.key} href={`/tiktok/projetos?projeto=${p.key}`} className="group rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/60 hover:bg-accent/30 sm:p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><h3 className="font-semibold">{p.info.name}</h3><p className="text-xs text-muted-foreground">{p.info.subtitle}</p></div>
                  <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-primary transition-transform group-hover:translate-x-1" />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">Saldo acumulado</p>
                <p className={`text-2xl font-semibold tabular-nums ${p.all.balance < 0 ? "text-destructive" : ""}`}>{formatCurrency(p.all.balance)}</p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div><p className="text-muted-foreground">Receitas</p><p className="font-semibold text-success tabular-nums">{formatCurrency(p.all.income)}</p></div>
                  <div><p className="text-muted-foreground">Despesas</p><p className="font-semibold text-destructive tabular-nums">{formatCurrency(p.all.expenses)}</p></div>
                  <div><p className="text-muted-foreground">Este mês</p><p className="font-semibold tabular-nums">{formatCurrency(p.month.balance)}</p></div>
                </div>
                <p className="mt-3 text-[11px] text-muted-foreground">{p.all.count ? `${p.all.count} movimentação(ões) · última em ${formatDate(p.lastDate!)}` : "Nenhuma movimentação registrada"}</p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3" aria-label="Financeiro geral do TikTok">
        <div><h2 className="text-base font-semibold">Financeiro geral · este mês</h2><p className="text-xs text-muted-foreground">Recebimentos e pagamentos do Financeiro do TikTok, pela data real.</p></div>
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
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Pagamentos recentes</h2>
        {recentPayments.length === 0 ? (
          <EmptyState title="Nenhuma movimentação encontrada" />
        ) : (
          <div className="flex flex-col gap-2">
            {recentPayments.map((p) => {
              const charge = chargeById.get(p.charge_id);
              return (
                <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium text-foreground">{charge?.description ?? "Movimentação"}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(p.payment_date)}</p>
                  </div>
                  <span className={`shrink-0 text-sm font-medium tabular-nums ${charge?.kind === "entrada" ? "text-success" : "text-destructive"}`}>
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
