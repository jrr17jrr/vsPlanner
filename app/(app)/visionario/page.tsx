import Link from "next/link";
import {
  ArrowRight,
  Users,
  Briefcase,
  CalendarClock,
  Wallet,
  TrendingUp,
  TrendingDown,
  HandCoins,
  Repeat,
  Receipt,
  DollarSign,
  Globe,
  Link2,
} from "lucide-react";
import { requireModulePermission } from "@/lib/supabase/dal";
import { hasModulePermission } from "@/lib/supabase/repositories/permissions.repository";
import { listAllClientServices, listClients, listServices } from "@/lib/supabase/repositories/clients.repository";
import { listMeetings } from "@/lib/supabase/repositories/meetings.repository";
import { listWorkItems } from "@/lib/supabase/repositories/work-items.repository";
import { listVendors, listCommissions } from "@/lib/supabase/repositories/vendors.repository";
import { listClientSites } from "@/lib/supabase/repositories/sites.repository";
import { listDomains } from "@/lib/supabase/repositories/domains.repository";
import {
  listFinancialCharges,
  listFinancialPayments,
  listFinancialAccounts,
  listFinancialOrigins,
} from "@/lib/supabase/repositories/financial.repository";
import { prepareFinancialSpace } from "@/lib/supabase/financial-page-data";
import {
  totalBalance,
  calculateMRR,
  monthCashSummary,
  pendingTotal,
  upcomingOpenCharges,
  listChargesForKind,
} from "@/lib/financial-calc";
import { VISIONARIO_DEV_SLUG } from "@/lib/space-slugs";
import { PageHeader } from "@/components/shared/page-header";
import { MoneyCard } from "@/components/shared/money-card";
import { MetricCard } from "@/components/shared/metric-card";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { UpcomingCard } from "@/components/visionario/financeiro/financeiro-page-client";
import { addDaysKey } from "@/lib/recurrence";
import { formatCurrency, formatDate, formatDateShort, todayKeySaoPaulo, currentMonthKeySaoPaulo } from "@/lib/format";

/**
 * Visão Geral do Visionário Dev — dashboard da empresa, 100% derivado de
 * dados reais. Cada bloco só é buscado se o usuário tiver a permissão do
 * MÓDULO correspondente; sem `financeiro.view`, nenhum dado financeiro é
 * sequer consultado.
 *
 * Competência x caixa: "Receita recorrente mensal" é o contratado
 * (serviços recorrentes ATIVOS); "Recebido/Pago no mês" é só o dinheiro
 * que de fato entrou/saiu, pela data REAL do pagamento.
 */
export default async function VisionarioOverviewPage() {
  const { profile, space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "visao_geral", "view");

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

  if (canViewFinanceiro) await prepareFinancialSpace(space, profile.id);

  const [clients, services, contracts, meetings, workItems, vendors, commissions, sites, domains] = await Promise.all([
    canViewClientes ? listClients(space.id) : Promise.resolve([]),
    canViewServicos ? listServices(space.id) : Promise.resolve([]),
    canViewServicos ? listAllClientServices(space.id) : Promise.resolve([]),
    canViewReunioes ? listMeetings(space.id) : Promise.resolve([]),
    canViewTrabalhos ? listWorkItems(space.id) : Promise.resolve([]),
    canViewVendedores ? listVendors(space.id) : Promise.resolve([]),
    canViewVendedores ? listCommissions(space.id) : Promise.resolve([]),
    canViewSites ? listClientSites(space.id) : Promise.resolve([]),
    canViewSites ? listDomains(space.id).catch(() => []) : Promise.resolve([]),
  ]);

  const todayKey = todayKeySaoPaulo();

  const financial = canViewFinanceiro
    ? await (async () => {
        const [charges, payments, accounts, origins] = await Promise.all([
          listFinancialCharges(space.id),
          listFinancialPayments(space.id),
          listFinancialAccounts(space.id),
          listFinancialOrigins(space.id),
        ]);
        const cash = monthCashSummary(charges, payments, currentMonthKeySaoPaulo());
        const overdue = listChargesForKind(charges, payments, "entrada", todayKey)
          .filter((r) => r.bucket === "atrasadas")
          .reduce((s, r) => s + r.remaining, 0);
        return {
          saldo: totalBalance(accounts, payments, new Map(charges.map((c) => [c.id, c.kind]))),
          mrr: calculateMRR(origins, charges, contracts).mrr,
          aReceber: pendingTotal(charges, payments, "entrada"),
          aPagar: pendingTotal(charges, payments, "saida"),
          recebido: cash.recebido,
          pago: cash.pago,
          resultado: cash.recebido - cash.pago,
          overdue,
          nextIn: upcomingOpenCharges(charges, payments, "entrada", 6, todayKey),
          nextOut: upcomingOpenCharges(charges, payments, "saida", 6, todayKey),
        };
      })()
    : null;

  // Sem permissão de Financeiro, a receita recorrente ainda pode ser vista
  // por quem vê Serviços — vem dos contratos, não do caixa.
  const mrrFromContracts = calculateMRR([], [], contracts).mrr;

  const activeClients = clients.filter((c) => c.status === "ativo");
  const activeServices = services.filter((s) => s.status === "ativo");

  const scheduled = meetings
    .filter((m) => m.status === "agendada" && m.meeting_date >= todayKey)
    .sort((a, b) => (a.meeting_date + a.start_time).localeCompare(b.meeting_date + b.start_time));
  const nextMeeting = scheduled[0];
  const todayMeetingsCount = scheduled.filter((m) => m.meeting_date === todayKey).length;

  const pendingWork = workItems.filter((w) => w.status !== "concluido");
  const overdueWork = pendingWork.filter((w) => w.due_date && w.due_date < todayKey);
  const upcomingWork = pendingWork
    .filter((w) => w.due_date)
    .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))
    .slice(0, 5);

  const activeVendors = vendors.filter((v) => v.status === "ativo");
  const pendingCommissions = commissions.filter((c) => c.status === "pendente").reduce((s, c) => s + Number(c.amount), 0);
  const in30Days = addDaysKey(todayKey, 30);
  const expiringDomains = domains.filter(
    (d) => d.status === "ativo" && d.renewal_date && d.renewal_date <= in30Days
  ).length;

  const nothingVisible = !canViewClientes && !canViewServicos && !canViewReunioes && !canViewTrabalhos && !canViewFinanceiro;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Visionário Dev" description="Visão geral da empresa — dados reais do mês atual." />

      {financial && (
        <section aria-labelledby="overview-finance" className="flex flex-col gap-3">
          <h2 id="overview-finance" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Financeiro
          </h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MoneyCard label="Receita recorrente mensal" amount={financial.mrr} icon={Repeat} hint="Serviços recorrentes ativos" />
            <MoneyCard
              label="A receber"
              amount={financial.aReceber}
              icon={HandCoins}
              tone="warning"
              hint={financial.overdue > 0 ? `${formatCurrency(financial.overdue)} atrasado` : "Cobranças pendentes"}
            />
            <MoneyCard label="Recebido no mês" amount={financial.recebido} icon={TrendingUp} tone="success" hint="Dinheiro que de fato entrou" />
            <MoneyCard label="A pagar" amount={financial.aPagar} icon={Receipt} tone="warning" hint="Despesas pendentes" />
            <MoneyCard label="Pago no mês" amount={financial.pago} icon={TrendingDown} tone="destructive" hint="Dinheiro que de fato saiu" />
            <MoneyCard
              label="Resultado do mês"
              amount={financial.resultado}
              icon={DollarSign}
              tone={financial.resultado >= 0 ? "success" : "destructive"}
              hint="Recebido − pago"
            />
            <MoneyCard label="Saldo em contas" amount={financial.saldo} icon={Wallet} />
            {canViewClientes && <MetricCard label="Clientes ativos" value={activeClients.length} icon={Users} />}
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <UpcomingCard title="Próximos recebimentos" kind="entrada" rows={financial.nextIn} today={todayKey} href="/visionario/financeiro" />
            <UpcomingCard title="Próximos pagamentos" kind="saida" rows={financial.nextOut} today={todayKey} href="/visionario/financeiro" />
          </div>
        </section>
      )}

      <section aria-labelledby="overview-ops" className="flex flex-col gap-3">
        <h2 id="overview-ops" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Operação
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {!financial && canViewServicos && (
            <MoneyCard label="Receita recorrente mensal" amount={mrrFromContracts} icon={Repeat} hint="Serviços recorrentes ativos" />
          )}
          {!financial && canViewClientes && <MetricCard label="Clientes ativos" value={activeClients.length} icon={Users} />}
          {canViewServicos && <MetricCard label="Serviços no catálogo" value={activeServices.length} icon={Briefcase} />}
          {canViewServicos && (
            <MetricCard label="Contratos ativos" value={contracts.filter((c) => c.status === "ativo").length} icon={Link2} />
          )}
          {canViewReunioes && (
            <MetricCard
              label="Próxima reunião"
              value={nextMeeting ? `${formatDateShort(nextMeeting.meeting_date)} · ${nextMeeting.start_time.slice(0, 5)}` : "Nenhuma"}
              icon={CalendarClock}
            />
          )}
          {canViewReunioes && <MetricCard label="Reuniões hoje" value={todayMeetingsCount} icon={CalendarClock} />}
          {canViewTrabalhos && (
            <MetricCard
              label="Trabalhos pendentes"
              value={pendingWork.length}
              icon={Briefcase}
              tone={overdueWork.length > 0 ? "destructive" : "default"}
            />
          )}
          {canViewSites && (
            <MetricCard label="Domínios vencendo (30d)" value={expiringDomains} icon={Globe} tone={expiringDomains > 0 ? "warning" : "default"} />
          )}
        </div>
      </section>

      {nothingVisible && <EmptyState title="Sem permissão para consultar módulos operacionais" />}

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
              {scheduled.length === 0 ? (
                <p className="py-2 text-xs text-muted-foreground">Nenhuma reunião agendada.</p>
              ) : (
                scheduled.slice(0, 5).map((m) => (
                  <Link key={m.id} href={`/visionario/reunioes/${m.id}`} className="flex items-center justify-between gap-2 text-sm hover:text-primary">
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
                  <div key={w.id} className="flex items-center justify-between gap-2 text-sm">
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
                  <Link key={c.id} href={`/visionario/clientes/${c.id}`} className="flex items-center justify-between gap-2 text-sm hover:text-primary">
                    <span className="truncate">{c.name}</span>
                    {c.company && <span className="shrink-0 text-xs text-muted-foreground">{c.company}</span>}
                  </Link>
                ))
              )}
            </div>
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
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Vendedores ativos</span>
                <span className="font-medium text-foreground">{activeVendors.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Comissões pendentes</span>
                <span className="font-medium text-warning">{formatCurrency(pendingCommissions)}</span>
              </div>
            </div>
          </Card>
        )}

        {canViewSites && (
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">Sites e domínios</p>
              <div className="flex items-center gap-3">
                <Link href="/visionario/sites" className="flex items-center gap-1 text-xs text-primary hover:underline">
                  Sites <ArrowRight className="h-3 w-3" />
                </Link>
                <Link href="/visionario/dominios" className="flex items-center gap-1 text-xs text-primary hover:underline">
                  Domínios <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
            <div className="mt-3 flex flex-col gap-1 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Sites cadastrados</span>
                <span className="font-medium text-foreground">{sites.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Domínios</span>
                <span className="font-medium text-foreground">{domains.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Domínios vencendo em 30 dias</span>
                <span className="font-medium text-warning">{expiringDomains}</span>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
