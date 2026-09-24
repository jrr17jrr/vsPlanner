import { requireModulePermission } from "@/lib/supabase/dal";
import { hasModulePermission } from "@/lib/supabase/repositories/permissions.repository";
import { listAllClientServices, listClients, listServices } from "@/lib/supabase/repositories/clients.repository";
import { listMeetings, listSpaceMemberProfiles } from "@/lib/supabase/repositories/meetings.repository";
import { listWorkItems } from "@/lib/supabase/repositories/work-items.repository";
import { listVendors, listCommissions, listSales } from "@/lib/supabase/repositories/vendors.repository";
import { listClientSites } from "@/lib/supabase/repositories/sites.repository";
import { listDomains } from "@/lib/supabase/repositories/domains.repository";
import {
  listFinancialCharges,
  listFinancialPayments,
  listFinancialAccounts,
  listFinancialOrigins,
  listFinancialCategories,
  listFinancialReferenceTypes,
} from "@/lib/supabase/repositories/financial.repository";
import { prepareFinancialSpace } from "@/lib/supabase/financial-page-data";
import {
  totalBalance,
  calculateMRR,
  monthCashSummary,
  pendingTotal,
  listChargesForKind,
  clientBillingSnapshot,
  recurringRevenueByService,
} from "@/lib/financial-calc";
import { effectiveRenewalDate, groupChargesByOrigin } from "@/lib/domains";
import { addDaysKey, daysBetweenKeys } from "@/lib/recurrence";
import { VISIONARIO_DEV_SLUG } from "@/lib/space-slugs";
import { todayKeySaoPaulo, currentMonthKeySaoPaulo, dateKeyInSaoPaulo } from "@/lib/format";
import {
  VisionarioDashboard,
  type AttentionItem,
  type DashboardData,
  type ReceivableRow,
  type WorkRow,
} from "@/components/visionario/dashboard/visionario-dashboard";
import type { Domain } from "@/types/database.types";

/** Quantos dias à frente contam como "prazo próximo" para trabalhos e contas a pagar. */
const SOON_DAYS = 3;

/**
 * Visão Geral do Visionário Dev — central de comando. 100% derivada de
 * dados reais; cada bloco só é consultado se o usuário tiver permissão de
 * `view` no MÓDULO correspondente (sem `financeiro.view`, nenhum dado
 * financeiro é buscado). Todos os cálculos financeiros usam
 * `lib/financial-calc.ts` — os mesmos do Financeiro e da ficha do cliente.
 */
export default async function VisionarioOverviewPage() {
  const { profile, space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "visao_geral", "view");

  const [
    canViewClientes,
    canCreateClientes,
    canViewServicos,
    canViewReunioes,
    canCreateReunioes,
    canViewTrabalhos,
    canCreateTrabalhos,
    canViewFinanceiro,
    canCreateFinanceiro,
    canEditFinanceiro,
    canViewVendedores,
    canViewSites,
  ] = await Promise.all([
    hasModulePermission(space.id, "clientes", "view"),
    hasModulePermission(space.id, "clientes", "create"),
    hasModulePermission(space.id, "servicos", "view"),
    hasModulePermission(space.id, "reunioes", "view"),
    hasModulePermission(space.id, "reunioes", "create"),
    hasModulePermission(space.id, "trabalhos", "view"),
    hasModulePermission(space.id, "trabalhos", "create"),
    hasModulePermission(space.id, "financeiro", "view"),
    hasModulePermission(space.id, "financeiro", "create"),
    hasModulePermission(space.id, "financeiro", "edit"),
    hasModulePermission(space.id, "vendedores", "view"),
    hasModulePermission(space.id, "sites", "view"),
  ]);

  if (canViewFinanceiro) await prepareFinancialSpace(space, profile.id);

  const needsMembers = canCreateClientes || canCreateReunioes || canCreateTrabalhos;
  const [
    clients,
    services,
    contracts,
    meetings,
    workItems,
    vendors,
    commissions,
    sales,
    sites,
    domains,
    members,
    charges,
    payments,
    accounts,
    origins,
    categories,
    referenceTypes,
  ] = await Promise.all([
    canViewClientes ? listClients(space.id) : Promise.resolve([]),
    canViewServicos ? listServices(space.id) : Promise.resolve([]),
    canViewServicos ? listAllClientServices(space.id) : Promise.resolve([]),
    canViewReunioes ? listMeetings(space.id) : Promise.resolve([]),
    canViewTrabalhos ? listWorkItems(space.id) : Promise.resolve([]),
    canViewVendedores ? listVendors(space.id) : Promise.resolve([]),
    canViewVendedores ? listCommissions(space.id) : Promise.resolve([]),
    canViewVendedores ? listSales(space.id) : Promise.resolve([]),
    canViewSites ? listClientSites(space.id) : Promise.resolve([]),
    // Tabela da migration 009 — se ainda não existir, o card simplesmente mostra 0.
    canViewSites ? listDomains(space.id).catch((): Domain[] => []) : Promise.resolve([] as Domain[]),
    needsMembers ? listSpaceMemberProfiles(space.id) : Promise.resolve([]),
    canViewFinanceiro ? listFinancialCharges(space.id) : Promise.resolve([]),
    canViewFinanceiro ? listFinancialPayments(space.id) : Promise.resolve([]),
    canViewFinanceiro ? listFinancialAccounts(space.id) : Promise.resolve([]),
    canViewFinanceiro ? listFinancialOrigins(space.id) : Promise.resolve([]),
    canCreateFinanceiro ? listFinancialCategories(space.id) : Promise.resolve([]),
    canCreateFinanceiro ? listFinancialReferenceTypes(space.id) : Promise.resolve([]),
  ]);

  const today = todayKeySaoPaulo();
  const monthKey = currentMonthKeySaoPaulo();
  const soon = addDaysKey(today, SOON_DAYS);
  const in30 = addDaysKey(today, 30);

  const clientById = new Map(clients.map((c) => [c.id, c]));
  const serviceById = new Map(services.map((s) => [s.id, s]));
  const contractById = new Map(contracts.map((c) => [c.id, c]));
  const activeClients = clients.filter((c) => c.status === "ativo");

  // ---------------------------------------------------------------- Financeiro
  let finance: DashboardData["finance"] = null;
  let receivables: DashboardData["receivables"] = null;
  const attention: AttentionItem[] = [];

  if (canViewFinanceiro) {
    const cash = monthCashSummary(charges, payments, monthKey);
    const incoming = listChargesForKind(charges, payments, "entrada", today);
    const outgoing = listChargesForKind(charges, payments, "saida", today);

    finance = {
      mrr: calculateMRR(origins, charges, contracts).mrr,
      aReceber: pendingTotal(charges, payments, "entrada"),
      aPagar: pendingTotal(charges, payments, "saida"),
      recebido: cash.recebido,
      pago: cash.pago,
      resultado: cash.recebido - cash.pago,
      saldo: totalBalance(accounts, payments, new Map(charges.map((c) => [c.id, c.kind]))),
      overdueIn: incoming.filter((r) => r.bucket === "atrasadas").reduce((s, r) => s + r.remaining, 0),
    };

    const toRow = (r: (typeof incoming)[number]): ReceivableRow => {
      const contract = r.charge.client_service_id ? contractById.get(r.charge.client_service_id) : undefined;
      const serviceName = contract ? serviceById.get(contract.service_id)?.name : undefined;
      const client = r.charge.client_id ? clientById.get(r.charge.client_id) : undefined;
      return {
        charge: r.charge,
        remaining: r.remaining,
        title: client?.name ?? r.charge.description,
        subtitle: client ? serviceName ?? r.charge.description : r.charge.installment_number ? `Parcela ${r.charge.installment_number}/${r.charge.installment_total}` : null,
        clientId: client?.id ?? null,
        days: daysBetweenKeys(today, r.charge.due_date),
      };
    };

    const overdueIn = incoming.filter((r) => r.bucket === "atrasadas");
    const upcomingIn = incoming.filter((r) => r.bucket === "vence_hoje" || r.bucket === "proximas");
    const kindByCharge = new Map(charges.map((c) => [c.id, c.kind]));
    const paymentsThisMonth = payments.filter((p) => p.payment_date.startsWith(monthKey) && kindByCharge.get(p.charge_id) === "entrada");
    receivables = {
      overdue: overdueIn.map(toRow),
      upcoming: upcomingIn.slice(0, 5).map(toRow),
      upcomingTotalCount: upcomingIn.length,
      receivedThisMonth: { total: cash.recebido, count: paymentsThisMonth.length },
    };

    if (overdueIn.length > 0) {
      attention.push({
        id: "cobrancas-atrasadas",
        tone: "danger",
        label: `${overdueIn.length} ${overdueIn.length === 1 ? "cobrança atrasada" : "cobranças atrasadas"}`,
        href: "/visionario/financeiro?aba=a_receber",
      });
    }
    const overdueOut = outgoing.filter((r) => r.bucket === "atrasadas").length;
    if (overdueOut > 0) {
      attention.push({
        id: "pagar-atrasadas",
        tone: "danger",
        label: `${overdueOut} ${overdueOut === 1 ? "conta a pagar atrasada" : "contas a pagar atrasadas"}`,
        href: "/visionario/financeiro?aba=a_pagar",
      });
    }
    const dueSoonOut = outgoing.filter((r) => r.status !== "pago" && r.charge.due_date >= today && r.charge.due_date <= soon).length;
    if (dueSoonOut > 0) {
      attention.push({
        id: "pagar-em-breve",
        tone: "warning",
        label: `${dueSoonOut} ${dueSoonOut === 1 ? "conta a pagar vence" : "contas a pagar vencem"} em até ${SOON_DAYS} dias`,
        href: "/visionario/financeiro?aba=a_pagar",
      });
    }
  }

  // ---------------------------------------------------------------- Trabalhos
  const pendingWork = workItems.filter((w) => w.status !== "concluido");
  const overdueWork = pendingWork.filter((w) => w.due_date && w.due_date < today);
  const soonWork = pendingWork.filter((w) => w.due_date && w.due_date >= today && w.due_date <= soon);
  const work: DashboardData["work"] = canViewTrabalhos
    ? {
        overdue: overdueWork.length,
        inProgress: workItems.filter((w) => w.status === "em_andamento").length,
        waiting: workItems.filter((w) => w.status === "aguardando_cliente").length,
        // Sem coluna de data de conclusão: usa a última atualização de um trabalho já concluído.
        doneThisMonth: workItems.filter((w) => w.status === "concluido" && dateKeyInSaoPaulo(w.updated_at).startsWith(monthKey)).length,
        pending: pendingWork.length,
        rows: [...pendingWork]
          .sort((a, b) => (a.due_date ?? "9999-12-31").localeCompare(b.due_date ?? "9999-12-31"))
          .slice(0, 5)
          .map(
            (w): WorkRow => ({
              id: w.id,
              title: w.title,
              status: w.status,
              dueDate: w.due_date,
              clientName: w.client_id ? clientById.get(w.client_id)?.name ?? null : null,
              tone: w.due_date && w.due_date < today ? "danger" : w.due_date && w.due_date <= soon ? "warning" : w.status === "em_andamento" ? "info" : "neutral",
            })
          ),
      }
    : null;
  if (overdueWork.length > 0) {
    attention.push({
      id: "trabalhos-atrasados",
      tone: "danger",
      label: `${overdueWork.length} ${overdueWork.length === 1 ? "trabalho atrasado" : "trabalhos atrasados"}`,
      href: "/visionario/trabalhos",
    });
  }
  if (soonWork.length > 0) {
    attention.push({
      id: "trabalhos-prazo",
      tone: "warning",
      label: `${soonWork.length} ${soonWork.length === 1 ? "trabalho próximo do prazo" : "trabalhos próximos do prazo"}`,
      href: "/visionario/trabalhos",
    });
  }

  // ---------------------------------------------------------------- Agenda
  const byStart = (a: { meeting_date: string; start_time: string }, b: { meeting_date: string; start_time: string }) =>
    (a.meeting_date + a.start_time).localeCompare(b.meeting_date + b.start_time);
  const scheduled = meetings.filter((m) => m.status === "agendada").sort(byStart);
  const todayMeetings = meetings
    .filter((m) => m.meeting_date === today && (m.status === "agendada" || m.status === "em_andamento"))
    .sort(byStart);
  const nextMeeting = scheduled.find((m) => m.meeting_date > today) ?? null;
  const overdueMeetings = meetings.filter((m) => (m.status === "agendada" || m.status === "em_andamento") && m.meeting_date < today);
  const agenda: DashboardData["agenda"] = canViewReunioes
    ? {
        today: todayMeetings.map((m) => ({ id: m.id, title: m.title, time: m.start_time.slice(0, 5), status: m.status })),
        next: nextMeeting ? { id: nextMeeting.id, title: nextMeeting.title, date: nextMeeting.meeting_date, time: nextMeeting.start_time.slice(0, 5) } : null,
        overdue: overdueMeetings.length,
      }
    : null;
  if (overdueMeetings.length > 0) {
    attention.push({
      id: "reunioes-pendentes",
      tone: "warning",
      label: `${overdueMeetings.length} ${overdueMeetings.length === 1 ? "reunião passada sem conclusão" : "reuniões passadas sem conclusão"}`,
      href: "/visionario/reunioes",
    });
  }
  if (todayMeetings.length > 0) {
    attention.push({
      id: "reunioes-hoje",
      tone: "info",
      label: `${todayMeetings.length} ${todayMeetings.length === 1 ? "reunião hoje" : "reuniões hoje"}`,
      href: "/visionario/reunioes",
    });
  }

  // ---------------------------------------------------------------- Clientes
  let clientsSummary: DashboardData["clients"] = null;
  if (canViewClientes) {
    const snapshots = activeClients.map((c) => ({
      client: c,
      snapshot: canViewFinanceiro ? clientBillingSnapshot(c.id, charges, payments, today) : null,
    }));
    const rank = { atrasado: 0, pendente: 1, pago: 2, sem_cobranca: 3 } as const;
    clientsSummary = {
      active: activeClients.length,
      hasFinance: canViewFinanceiro,
      emDia: snapshots.filter((s) => s.snapshot && (s.snapshot.status === "pago" || s.snapshot.status === "sem_cobranca")).length,
      pendente: snapshots.filter((s) => s.snapshot?.status === "pendente").length,
      atrasado: snapshots.filter((s) => s.snapshot?.status === "atrasado").length,
      rows: snapshots
        .sort((a, b) => (a.snapshot ? rank[a.snapshot.status] : 9) - (b.snapshot ? rank[b.snapshot.status] : 9) || a.client.name.localeCompare(b.client.name))
        .slice(0, 6)
        .map((s) => ({
          id: s.client.id,
          name: s.client.name,
          status: s.snapshot?.status ?? null,
          daysLate: s.snapshot?.daysLate ?? 0,
        })),
    };
  }

  // ---------------------------------------------------------------- Serviços recorrentes
  const recurring: DashboardData["recurring"] = canViewServicos
    ? (() => {
        const { rows, total } = recurringRevenueByService(contracts);
        return {
          total,
          rows: rows.map((r) => ({ name: serviceById.get(r.serviceId)?.name ?? "Serviço", count: r.count, monthly: r.monthly })),
        };
      })()
    : null;

  // ---------------------------------------------------------------- Sites e domínios
  let sitesSummary: DashboardData["sites"] = null;
  if (canViewSites) {
    const chargesByOrigin = groupChargesByOrigin(charges);
    const activeDomains = domains
      .filter((d) => d.status === "ativo")
      .map((d) => ({ domain: d, renewal: effectiveRenewalDate(d, chargesByOrigin, payments) }))
      .filter((x): x is { domain: Domain; renewal: string } => !!x.renewal)
      .sort((a, b) => a.renewal.localeCompare(b.renewal));
    const expiring = activeDomains.filter((x) => x.renewal <= in30);
    const activeSites = sites.filter((s) => s.status === "ativo");
    const next = activeDomains.find((x) => x.renewal >= today) ?? activeDomains[0] ?? null;
    sitesSummary = {
      activeSites: activeSites.length,
      domains: domains.length,
      expiring30: expiring.length,
      hostings: activeSites.filter((s) => !!s.hosting_provider?.trim()).length,
      nextDomain: next ? { name: next.domain.domain, date: next.renewal } : null,
    };
    if (expiring.length > 0) {
      const expired = expiring.filter((x) => x.renewal < today).length;
      attention.push({
        id: "dominios",
        tone: expired > 0 ? "danger" : "alert",
        label:
          expired > 0
            ? `${expired} ${expired === 1 ? "domínio vencido" : "domínios vencidos"}`
            : `${expiring.length} ${expiring.length === 1 ? "domínio vence" : "domínios vencem"} em 30 dias`,
        href: "/visionario/dominios",
      });
    }
  }

  // ---------------------------------------------------------------- Vendedores
  let vendorsSummary: DashboardData["vendors"] = null;
  if (canViewVendedores) {
    const salesThisMonth = sales.filter((s) => s.status !== "cancelada" && s.sale_date.startsWith(monthKey));
    const saleIdsThisMonth = new Set(salesThisMonth.map((s) => s.id));
    vendorsSummary = {
      active: vendors.filter((v) => v.status === "ativo").length,
      salesCount: salesThisMonth.length,
      salesTotal: salesThisMonth.reduce((s, x) => s + Number(x.amount), 0),
      commissionsGenerated: commissions.filter((c) => saleIdsThisMonth.has(c.sale_id)).reduce((s, c) => s + Number(c.amount), 0),
      commissionsPending: commissions.filter((c) => c.status === "pendente").reduce((s, c) => s + Number(c.amount), 0),
    };
  }

  const rankTone = { danger: 0, alert: 1, warning: 2, info: 3 } as const;
  attention.sort((a, b) => rankTone[a.tone] - rankTone[b.tone]);

  const data: DashboardData = {
    today,
    finance,
    activeClientsCount: canViewClientes ? activeClients.length : null,
    attention,
    attentionScopeVisible: canViewFinanceiro || canViewTrabalhos || canViewReunioes || canViewSites,
    receivables,
    agenda,
    work,
    clients: clientsSummary,
    recurring,
    sites: sitesSummary,
    vendors: vendorsSummary,
  };

  return (
    <VisionarioDashboard
      data={data}
      currentUserId={profile.id}
      forms={{
        members,
        clients,
        services,
        clientServices: contracts,
        categories,
        referenceTypes,
        accounts,
      }}
      permissions={{
        canCreateCliente: canCreateClientes,
        canCreateTrabalho: canCreateTrabalhos,
        canCreateReuniao: canCreateReunioes,
        canCreateFinanceiro,
        canEditFinanceiro,
      }}
    />
  );
}
