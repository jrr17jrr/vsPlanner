import Link from "next/link";
import { ArrowRight, Users, Briefcase, CalendarClock, Wallet, TrendingUp, TrendingDown, HandCoins, Repeat, AlertTriangle } from "lucide-react";
import { requireModulePermission } from "@/lib/supabase/dal";
import { hasModulePermission } from "@/lib/supabase/repositories/permissions.repository";
import { listClients, listServices } from "@/lib/supabase/repositories/clients.repository";
import { listMeetings } from "@/lib/supabase/repositories/meetings.repository";
import { listWorkItems, listAllWorkItemAssignees } from "@/lib/supabase/repositories/work-items.repository";
import { listVendors, listCommissions } from "@/lib/supabase/repositories/vendors.repository";
import { listClientSites } from "@/lib/supabase/repositories/sites.repository";
import {
  listFinancialCharges,
  listFinancialPayments,
  listFinancialAccounts,
  listFinancialOrigins,
} from "@/lib/supabase/repositories/financial.repository";
import { totalBalance, cashFlowForecast, calculateMRR, monthSummary, listChargesForKind } from "@/lib/financial-calc";
import { VISIONARIO_DEV_SLUG } from "@/lib/space-slugs";
import { PageHeader } from "@/components/shared/page-header";
import { MoneyCard } from "@/components/shared/money-card";
import { MetricCard } from "@/components/shared/metric-card";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDate, todayKeySaoPaulo, currentMonthKeySaoPaulo } from "@/lib/format";

/**
 * Visão Geral — 100% real. Cada bloco só é buscado se o usuário tiver a
 * permissão do MÓDULO correspondente (`clientes.view`, `trabalhos.view`,
 * `reunioes.view`, `financeiro.view`); sem a permissão de Financeiro, os
 * dados financeiros nem chegam a ser consultados aqui — não é um "esconder
 * na UI depois de buscar", é simplesmente nunca buscado.
 */
export default async function VisionarioOverviewPage() {
  const { space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "visao_geral", "view");

  const [canViewClientes, canViewServicos, canViewReunioes, canViewTrabalhos, canViewFinanceiro, canViewVendedores, canViewSites] =
    await Promise.all([
      hasModulePermission(space.id, "clientes", "view"),
      hasModulePermission(space.id, "servicos", "view"),
      hasModulePermission(space.id, "reunioes", "view"),
      hasModulePermission(space.id, "trabalhos", "view"),
      hasModulePermission(space.id, "financeiro", "view"),
      hasModulePermission(space.id, "vendedores", "view"),
      hasModulePermission(space.id, "sites", "view"),
    ]);

  const [clients, services, meetings, workItems, assignees, vendors, commissions, sites] = await Promise.all([
    canViewClientes ? listClients(space.id) : Promise.resolve([]),
    canViewServicos ? listServices(space.id) : Promise.resolve([]),
    canViewReunioes ? listMeetings(space.id) : Promise.resolve([]),
    canViewTrabalhos ? listWorkItems(space.id) : Promise.resolve([]),
    canViewTrabalhos ? listAllWorkItemAssignees(space.id) : Promise.resolve([]),
    canViewVendedores ? listVendors(space.id) : Promise.resolve([]),
    canViewVendedores ? listCommissions(space.id) : Promise.resolve([]),
    canViewSites ? listClientSites(space.id) : Promise.resolve([]),
  ]);

  const financial = canViewFinanceiro
    ? await (async () => {
        const [charges, payments, accounts, origins] = await Promise.all([
          listFinancialCharges(space.id),
          listFinancialPayments(space.id),
          listFinancialAccounts(space.id),
          listFinancialOrigins(space.id),
        ]);
        const forecast = cashFlowForecast(accounts, charges, payments, 30);
        const { mrr } = calculateMRR(origins, charges);
        const month = monthSummary(charges, currentMonthKeySaoPaulo());
        const atrasado = listChargesForKind(charges, payments, "entrada")
          .filter((r) => r.bucket === "atrasadas")
          .reduce((s, r) => s + r.remaining, 0);
        return {
          saldo: totalBalance(accounts, payments, new Map(charges.map((c) => [c.id, c.kind]))),
          receita: month.receita,
          despesa: month.despesa,
          lucro: month.lucro,
          aReceber: forecast.aReceber,
          atrasado,
          mrr,
        };
      })()
    : null;

  const activeClients = clients.filter((c) => c.status === "ativo");
  const activeServices = services.filter((s) => s.status === "ativo");

  const todayKey = todayKeySaoPaulo();
  const upcomingMeetings = meetings
    .filter((m) => (m.status === "agendada" || m.status === "em_andamento") && m.meeting_date >= todayKey)
    .sort((a, b) => (a.meeting_date + a.start_time).localeCompare(b.meeting_date + b.start_time))
    .slice(0, 5);
  const todayMeetingsCount = meetings.filter((m) => m.meeting_date === todayKey && m.status !== "cancelada").length;

  const pendingWork = workItems.filter((w) => w.status !== "concluido");
  const assigneesByWorkItem = new Map<string, number>();
  for (const a of assignees) assigneesByWorkItem.set(a.work_item_id, (assigneesByWorkItem.get(a.work_item_id) ?? 0) + 1);
  const overdueWork = pendingWork.filter((w) => w.due_date && w.due_date < todayKey);
  const upcomingWork = pendingWork
    .filter((w) => w.due_date)
    .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))
    .slice(0, 5);

  const activeVendors = vendors.filter((v) => v.status === "ativo");
  const pendingCommissions = commissions.filter((c) => c.status === "pendente").reduce((s, c) => s + c.amount, 0);
  const in30Days = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const expiringSites = sites.filter((s) => s.due_date && s.due_date >= todayKey && s.due_date <= in30Days).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Visionário Dev" description="Visão geral do negócio." />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {canViewClientes && <MetricCard label="Clientes ativos" value={activeClients.length} icon={Users} />}
        {canViewServicos && <MetricCard label="Serviços ativos" value={activeServices.length} icon={Briefcase} />}
        {canViewReunioes && <MetricCard label="Reuniões hoje" value={todayMeetingsCount} icon={CalendarClock} />}
        {canViewTrabalhos && (
          <MetricCard
            label="Trabalhos pendentes"
            value={pendingWork.length}
            icon={Briefcase}
            tone={overdueWork.length > 0 ? "destructive" : "default"}
          />
        )}
        {canViewFinanceiro && financial && (
          <>
            <MoneyCard label="Receita (mês)" amount={financial.receita} icon={TrendingUp} tone="success" />
            <MoneyCard label="Despesas (mês)" amount={financial.despesa} icon={TrendingDown} tone="destructive" />
            <MoneyCard label="Lucro (mês)" amount={financial.lucro} tone={financial.lucro >= 0 ? "success" : "destructive"} />
            <MoneyCard label="Saldo atual" amount={financial.saldo} icon={Wallet} />
            <MoneyCard label="A receber (30d)" amount={financial.aReceber} icon={HandCoins} tone="warning" />
            <MoneyCard label="Atrasado" amount={financial.atrasado} icon={AlertTriangle} tone="destructive" />
            <MoneyCard label="MRR" amount={financial.mrr} icon={Repeat} />
          </>
        )}
      </div>

      {!canViewClientes && !canViewServicos && !canViewReunioes && !canViewTrabalhos && !canViewFinanceiro && (
        <EmptyState title="Sem permissão para consultar módulos operacionais" />
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {canViewReunioes && (
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">Próximas reuniões</p>
              <Link href="/visionario/reunioes" className="flex items-center gap-1 text-xs text-primary hover:underline">
                Ver todas <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="mt-3 flex flex-col gap-2">
              {upcomingMeetings.length === 0 ? (
                <p className="py-2 text-xs text-muted-foreground">Nenhuma reunião agendada.</p>
              ) : (
                upcomingMeetings.map((m) => (
                  <Link key={m.id} href={`/visionario/reunioes/${m.id}`} className="flex items-center justify-between text-sm hover:text-primary">
                    <span className="truncate">{m.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDate(m.meeting_date)} {m.start_time.slice(0, 5)}
                    </span>
                  </Link>
                ))
              )}
            </div>
          </Card>
        )}

        {canViewTrabalhos && (
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
                    <div className="flex shrink-0 items-center gap-2">
                      {w.due_date && w.due_date < todayKey && <StatusBadge status="atrasado" />}
                      <span className="text-xs text-muted-foreground">{w.due_date && formatDate(w.due_date)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        )}

        {canViewClientes && (
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">Clientes ativos</p>
              <Link href="/visionario/clientes" className="flex items-center gap-1 text-xs text-primary hover:underline">
                Ver clientes <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="mt-3 flex flex-col gap-2">
              {activeClients.length === 0 ? (
                <p className="py-2 text-xs text-muted-foreground">Nenhum cliente ativo cadastrado.</p>
              ) : (
                activeClients.slice(0, 5).map((c) => (
                  <Link key={c.id} href={`/visionario/clientes/${c.id}`} className="flex items-center justify-between text-sm hover:text-primary">
                    <span className="truncate">{c.name}</span>
                    {c.company && <span className="shrink-0 text-xs text-muted-foreground">{c.company}</span>}
                  </Link>
                ))
              )}
            </div>
          </Card>
        )}

        {canViewFinanceiro && (
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">Financeiro</p>
              <Link href="/visionario/financeiro" className="flex items-center gap-1 text-xs text-primary hover:underline">
                Ver financeiro <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <p className="mt-3 py-2 text-xs text-muted-foreground">
              Dashboard completo (contas a receber/pagar, previsão de caixa, comparativo mensal) em
              /visionario/financeiro.
            </p>
          </Card>
        )}

        {canViewVendedores && (
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">Vendedores</p>
              <Link href="/visionario/vendedores" className="flex items-center gap-1 text-xs text-primary hover:underline">
                Ver vendedores <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="mt-3 flex flex-col gap-1 text-sm">
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Vendedores ativos</span><span className="font-medium text-foreground">{activeVendors.length}</span></div>
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Comissões pendentes</span><span className="font-medium text-warning">{pendingCommissions > 0 ? pendingCommissions.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "R$ 0,00"}</span></div>
            </div>
          </Card>
        )}

        {canViewSites && (
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">Sites & Domínios</p>
              <Link href="/visionario/sites" className="flex items-center gap-1 text-xs text-primary hover:underline">
                Ver sites <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="mt-3 flex flex-col gap-1 text-sm">
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Total cadastrado</span><span className="font-medium text-foreground">{sites.length}</span></div>
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Vencendo em 30 dias</span><span className="font-medium text-warning">{expiringSites}</span></div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
