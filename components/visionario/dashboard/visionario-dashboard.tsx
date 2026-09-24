"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleCheck,
  DollarSign,
  Globe,
  HandCoins,
  Plus,
  Receipt,
  Repeat,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { MoneyCard } from "@/components/shared/money-card";
import { MetricCard } from "@/components/shared/metric-card";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClientFormDialog } from "@/components/visionario/clientes/client-form-dialog";
import { WorkItemFormDialog } from "@/components/visionario/trabalhos/work-item-form-dialog";
import { MeetingFormDialog } from "@/components/visionario/reunioes/meeting-form-dialog";
import { NovaMovimentacaoDialog } from "@/components/visionario/financeiro/nova-movimentacao-dialog";
import { MarkPaymentDialog } from "@/components/visionario/financeiro/mark-payment-dialog";
import { formatCurrency, formatDate, formatDateShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ClientBillingStatus } from "@/lib/financial-calc";
import type {
  Client,
  ClientService,
  FinancialAccount,
  FinancialCategory,
  FinancialCharge,
  FinancialReferenceType,
  MeetingStatus,
  Service,
  SpaceMemberProfile,
  WorkItemStatus,
} from "@/types/database.types";

// -----------------------------------------------------------------------------
// Tipos dos dados (calculados no servidor em app/(app)/visionario/page.tsx)
// -----------------------------------------------------------------------------

export type Tone = "danger" | "alert" | "warning" | "info";

export type AttentionItem = { id: string; tone: Tone; label: string; href: string };

export type ReceivableRow = {
  charge: FinancialCharge;
  remaining: number;
  title: string;
  subtitle: string | null;
  clientId: string | null;
  /** Dias até o vencimento (negativo = dias de atraso). */
  days: number;
};

export type WorkRow = {
  id: string;
  title: string;
  status: WorkItemStatus;
  dueDate: string | null;
  clientName: string | null;
  tone: "danger" | "warning" | "info" | "neutral";
};

export type DashboardData = {
  today: string;
  finance: {
    mrr: number;
    aReceber: number;
    aPagar: number;
    recebido: number;
    pago: number;
    resultado: number;
    saldo: number;
    overdueIn: number;
  } | null;
  activeClientsCount: number | null;
  attention: AttentionItem[];
  attentionScopeVisible: boolean;
  receivables: {
    overdue: ReceivableRow[];
    upcoming: ReceivableRow[];
    upcomingTotalCount: number;
    receivedThisMonth: { total: number; count: number };
  } | null;
  agenda: {
    today: { id: string; title: string; time: string; status: MeetingStatus }[];
    next: { id: string; title: string; date: string; time: string } | null;
    overdue: number;
  } | null;
  work: {
    overdue: number;
    inProgress: number;
    waiting: number;
    doneThisMonth: number;
    pending: number;
    rows: WorkRow[];
  } | null;
  clients: {
    active: number;
    hasFinance: boolean;
    emDia: number;
    pendente: number;
    atrasado: number;
    rows: { id: string; name: string; status: ClientBillingStatus | null; daysLate: number }[];
  } | null;
  recurring: { total: number; rows: { name: string; count: number; monthly: number }[] } | null;
  sites: {
    activeSites: number;
    domains: number;
    expiring30: number;
    hostings: number;
    nextDomain: { name: string; date: string } | null;
  } | null;
  vendors: {
    active: number;
    salesCount: number;
    salesTotal: number;
    commissionsGenerated: number;
    commissionsPending: number;
  } | null;
};

type FormsData = {
  members: SpaceMemberProfile[];
  clients: Client[];
  services: Service[];
  clientServices: ClientService[];
  categories: FinancialCategory[];
  referenceTypes: FinancialReferenceType[];
  accounts: FinancialAccount[];
};

type Permissions = {
  canCreateCliente: boolean;
  canCreateTrabalho: boolean;
  canCreateReuniao: boolean;
  canCreateFinanceiro: boolean;
  canEditFinanceiro: boolean;
};

type QuickAction = "cliente" | "recebimento" | "trabalho" | "reuniao" | "despesa";

// Cyan (primary) = informação/andamento; verde = ok/pago; amarelo = atenção; vermelho = atraso.
const TONE_DOT: Record<Tone | "success" | "neutral", string> = {
  danger: "bg-destructive",
  alert: "bg-orange-400",
  warning: "bg-warning",
  info: "bg-primary",
  success: "bg-success",
  neutral: "bg-muted-foreground/50",
};

// -----------------------------------------------------------------------------

export function VisionarioDashboard({
  data,
  forms,
  permissions,
  currentUserId,
}: {
  data: DashboardData;
  forms: FormsData;
  permissions: Permissions;
  currentUserId: string;
}) {
  const [quick, setQuick] = useState<QuickAction | null>(null);
  const [paying, setPaying] = useState<ReceivableRow | null>(null);
  const close = (open: boolean) => !open && setQuick(null);

  const quickActions: { key: QuickAction; label: string; allowed: boolean }[] = [
    { key: "cliente", label: "Cliente", allowed: permissions.canCreateCliente },
    { key: "recebimento", label: "Recebimento", allowed: permissions.canCreateFinanceiro },
    { key: "trabalho", label: "Trabalho", allowed: permissions.canCreateTrabalho },
    { key: "reuniao", label: "Reunião", allowed: permissions.canCreateReuniao },
    { key: "despesa", label: "Despesa", allowed: permissions.canCreateFinanceiro },
  ];
  const visibleActions = quickActions.filter((a) => a.allowed);

  const { finance } = data;
  const hasMiddleRow = data.receivables || data.agenda;
  const hasWorkRow = data.work || data.clients;
  const hasBottomRow = data.recurring || data.sites || data.vendors;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <PageHeader title="Visionário Dev" description="Central de comando — tudo que importa hoje, com dados reais." />
        {visibleActions.length > 0 && (
          <nav aria-label="Atalhos rápidos" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap">
            {visibleActions.map((a) => (
              <Button key={a.key} size="sm" variant="outline" className="shrink-0" onClick={() => setQuick(a.key)}>
                <Plus className="h-3.5 w-3.5 text-primary" /> {a.label}
              </Button>
            ))}
          </nav>
        )}
      </div>

      {(finance || data.activeClientsCount !== null) && (
        <section aria-labelledby="dash-fin" className="flex flex-col gap-3">
          <SectionTitle id="dash-fin">Financeiro</SectionTitle>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {finance && (
              <>
                <MoneyCard label="Receita recorrente mensal" amount={finance.mrr} icon={Repeat} hint="Serviços recorrentes ativos" />
                <MoneyCard
                  label="A receber"
                  amount={finance.aReceber}
                  icon={HandCoins}
                  tone="warning"
                  hint={finance.overdueIn > 0 ? `${formatCurrency(finance.overdueIn)} atrasado` : "Cobranças pendentes"}
                />
                <MoneyCard label="Recebido no mês" amount={finance.recebido} icon={TrendingUp} tone="success" hint="Dinheiro que de fato entrou" />
                <MoneyCard label="A pagar" amount={finance.aPagar} icon={Receipt} tone="warning" hint="Despesas pendentes" />
                <MoneyCard label="Pago no mês" amount={finance.pago} icon={TrendingDown} tone="destructive" hint="Dinheiro que de fato saiu" />
                <MoneyCard
                  label="Resultado do mês"
                  amount={finance.resultado}
                  icon={DollarSign}
                  tone={finance.resultado >= 0 ? "success" : "destructive"}
                  hint="Recebido − pago"
                />
                <MoneyCard label="Saldo em contas" amount={finance.saldo} icon={Wallet} />
              </>
            )}
            {data.activeClientsCount !== null && <MetricCard label="Clientes ativos" value={data.activeClientsCount} icon={Users} />}
          </div>
        </section>
      )}

      {data.attentionScopeVisible && <AttentionSection items={data.attention} />}

      {hasMiddleRow && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {data.receivables && (
            <ReceivablesPanel
              className={data.agenda ? "lg:col-span-2" : "lg:col-span-3"}
              receivables={data.receivables}
              canPay={permissions.canEditFinanceiro}
              onPay={setPaying}
            />
          )}
          {data.agenda && <AgendaPanel agenda={data.agenda} className={data.receivables ? "" : "lg:col-span-3"} />}
        </div>
      )}

      {hasWorkRow && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {data.work && <WorkPanel work={data.work} today={data.today} />}
          {data.clients && <ClientsPanel clients={data.clients} />}
        </div>
      )}

      {hasBottomRow && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.recurring && <RecurringPanel recurring={data.recurring} />}
          {data.sites && <SitesPanel sites={data.sites} />}
          {data.vendors && <VendorsPanel vendors={data.vendors} />}
        </div>
      )}

      {/* Atalhos: reaproveitam os MESMOS formulários das páginas de cada módulo. */}
      {permissions.canCreateCliente && (
        <ClientFormDialog open={quick === "cliente"} onOpenChange={close} members={forms.members} />
      )}
      {permissions.canCreateTrabalho && (
        <WorkItemFormDialog
          open={quick === "trabalho"}
          onOpenChange={close}
          members={forms.members}
          clients={forms.clients}
          services={forms.services}
        />
      )}
      {permissions.canCreateReuniao && (
        <MeetingFormDialog
          open={quick === "reuniao"}
          onOpenChange={close}
          members={forms.members}
          clients={forms.clients}
          currentUserId={currentUserId}
        />
      )}
      {permissions.canCreateFinanceiro && (quick === "recebimento" || quick === "despesa") && (
        <NovaMovimentacaoDialog
          key={quick}
          scope="visionario"
          open
          onOpenChange={close}
          clients={forms.clients}
          clientServices={forms.clientServices}
          services={forms.services}
          categories={forms.categories}
          referenceTypes={forms.referenceTypes}
          accounts={forms.accounts}
          initialKind={quick === "recebimento" ? "entrada" : "saida"}
          defaultSettled={quick === "recebimento"}
        />
      )}
      {paying && (
        <MarkPaymentDialog
          scope="visionario"
          charge={paying.charge}
          remaining={paying.remaining}
          accounts={forms.accounts}
          onOpenChange={(open) => !open && setPaying(null)}
        />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Blocos
// -----------------------------------------------------------------------------

function SectionTitle({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h2>
  );
}

function Panel({
  title,
  icon: Icon,
  href,
  linkLabel = "Ver todos",
  className,
  children,
  footer,
}: {
  title: string;
  icon?: LucideIcon;
  href?: string;
  linkLabel?: string;
  className?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <Card className={cn("flex flex-col gap-3 p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {Icon && <Icon className="h-4 w-4 text-primary" aria-hidden />}
          {title}
        </h2>
        {href && (
          <Link href={href} className="flex shrink-0 items-center gap-1 text-xs text-primary hover:underline">
            {linkLabel} <ArrowRight className="h-3 w-3" aria-hidden />
          </Link>
        )}
      </div>
      {children}
      {footer}
    </Card>
  );
}

function Dot({ tone }: { tone: keyof typeof TONE_DOT }) {
  return <span className={cn("inline-block h-2 w-2 shrink-0 rounded-full", TONE_DOT[tone])} aria-hidden />;
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: keyof typeof TONE_DOT }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="flex items-center gap-2 text-muted-foreground">
        {tone && <Dot tone={tone} />}
        {label}
      </span>
      <span className="font-medium tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function AttentionSection({ items }: { items: AttentionItem[] }) {
  return (
    <section aria-labelledby="dash-attention" className="flex flex-col gap-3">
      <SectionTitle id="dash-attention">Atenção necessária</SectionTitle>
      {items.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          <CircleCheck className="h-4 w-4 text-success" aria-hidden /> Está tudo em dia.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={item.href}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex items-center gap-2 text-foreground">
                  <Dot tone={item.tone} />
                  {item.label}
                </span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ReceivablesPanel({
  receivables,
  canPay,
  onPay,
  className,
}: {
  receivables: NonNullable<DashboardData["receivables"]>;
  canPay: boolean;
  onPay: (row: ReceivableRow) => void;
  className?: string;
}) {
  const { overdue, upcoming, upcomingTotalCount, receivedThisMonth } = receivables;
  const overdueShown = overdue.slice(0, 5);
  return (
    <Panel
      title="Cobranças"
      icon={HandCoins}
      href="/visionario/financeiro?aba=a_receber"
      linkLabel="Ver todas"
      className={className}
      footer={
        <p className="flex items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
          <Dot tone="success" /> Recebido no mês:
          <span className="font-medium text-success">{formatCurrency(receivedThisMonth.total)}</span>
          <span>
            ({receivedThisMonth.count} {receivedThisMonth.count === 1 ? "pagamento" : "pagamentos"})
          </span>
        </p>
      }
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-destructive">
            Atrasados {overdue.length > 0 && `· ${overdue.length}`}
          </p>
          {overdueShown.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma cobrança atrasada.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {overdueShown.map((row) => (
                <ReceivableItem key={row.charge.id} row={row} canPay={canPay} onPay={onPay} />
              ))}
            </ul>
          )}
          {overdue.length > overdueShown.length && (
            <p className="text-xs text-muted-foreground">+{overdue.length - overdueShown.length} atrasada(s) no Financeiro.</p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-warning">
            Próximos recebimentos {upcomingTotalCount > 0 && `· ${upcomingTotalCount}`}
          </p>
          {upcoming.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum recebimento pendente.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {upcoming.map((row) => (
                <ReceivableItem key={row.charge.id} row={row} canPay={canPay} onPay={onPay} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </Panel>
  );
}

function ReceivableItem({ row, canPay, onPay }: { row: ReceivableRow; canPay: boolean; onPay: (row: ReceivableRow) => void }) {
  const late = row.days < 0;
  const dueLabel = late
    ? `Venceu ${formatDate(row.charge.due_date)} · ${-row.days} ${-row.days === 1 ? "dia" : "dias"} de atraso`
    : row.days === 0
      ? "Vence hoje"
      : `Vence ${formatDate(row.charge.due_date)}${row.days <= 7 ? ` · em ${row.days} ${row.days === 1 ? "dia" : "dias"}` : ""}`;
  return (
    <li className="flex items-start justify-between gap-2 rounded-md border border-border/70 bg-background/40 p-2.5">
      <div className="flex min-w-0 gap-2">
        <span className="mt-1.5">
          <Dot tone={late ? "danger" : "warning"} />
        </span>
        <div className="min-w-0">
          {row.clientId ? (
            <Link href={`/visionario/clientes/${row.clientId}`} className="block truncate text-sm font-medium text-foreground hover:text-primary">
              {row.title}
            </Link>
          ) : (
            <p className="truncate text-sm font-medium text-foreground">{row.title}</p>
          )}
          {row.subtitle && <p className="truncate text-xs text-muted-foreground">{row.subtitle}</p>}
          <p className={cn("text-xs", late ? "text-destructive" : "text-muted-foreground")}>{dueLabel}</p>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="text-sm font-semibold tabular-nums text-foreground">{formatCurrency(row.remaining)}</span>
        {canPay && (
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => onPay(row)}>
            <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden /> Marcar pago
          </Button>
        )}
      </div>
    </li>
  );
}

function AgendaPanel({ agenda, className }: { agenda: NonNullable<DashboardData["agenda"]>; className?: string }) {
  return (
    <Panel title="Agenda" icon={CalendarClock} href="/visionario/reunioes" linkLabel="Ver agenda" className={className}>
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Hoje</p>
        {agenda.today.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma reunião hoje.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {agenda.today.slice(0, 4).map((m) => (
              <li key={m.id}>
                <Link href={`/visionario/reunioes/${m.id}`} className="flex items-center gap-3 rounded-md px-1 py-1 text-sm hover:bg-secondary">
                  <span className="w-11 shrink-0 font-semibold tabular-nums text-primary">{m.time}</span>
                  <span className="truncate text-foreground">{m.title}</span>
                </Link>
              </li>
            ))}
            {agenda.today.length > 4 && <li className="text-xs text-muted-foreground">+{agenda.today.length - 4} reunião(ões) hoje</li>}
          </ul>
        )}
      </div>
      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Próxima</p>
        {agenda.next ? (
          <Link href={`/visionario/reunioes/${agenda.next.id}`} className="flex items-center gap-3 rounded-md px-1 py-1 text-sm hover:bg-secondary">
            <span className="w-11 shrink-0 text-xs font-semibold tabular-nums text-primary">{formatDateShort(agenda.next.date)}</span>
            <span className="min-w-0">
              <span className="block truncate text-foreground">{agenda.next.title}</span>
              <span className="text-xs text-muted-foreground">{agenda.next.time}</span>
            </span>
          </Link>
        ) : (
          <p className="text-xs text-muted-foreground">Nenhuma reunião agendada nos próximos dias.</p>
        )}
      </div>
      {agenda.overdue > 0 && (
        <p className="flex items-center gap-2 text-xs text-warning">
          <Dot tone="warning" /> {agenda.overdue} reunião(ões) passada(s) sem conclusão
        </p>
      )}
    </Panel>
  );
}

const WORK_STATUS_LABEL: Record<WorkItemStatus, string> = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  aguardando_cliente: "Aguardando cliente",
  concluido: "Concluído",
};

function WorkPanel({ work, today }: { work: NonNullable<DashboardData["work"]>; today: string }) {
  return (
    <Panel title="Trabalhos" icon={CheckCircle2} href="/visionario/trabalhos" linkLabel="Ver trabalhos">
      <div className="grid grid-cols-3 gap-2 text-center">
        <MiniStat value={work.overdue} label={work.overdue === 1 ? "atrasado" : "atrasados"} tone={work.overdue > 0 ? "danger" : "neutral"} />
        <MiniStat value={work.inProgress} label="em andamento" tone="info" />
        <MiniStat value={work.doneThisMonth} label="concluídos no mês" tone="success" />
      </div>
      {work.rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum trabalho pendente.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {work.rows.map((w) => (
            <li key={w.id} className="flex items-center justify-between gap-2 rounded-md px-1 py-1 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <Dot tone={w.tone === "neutral" ? "neutral" : w.tone} />
                <span className="min-w-0">
                  <span className="block truncate text-foreground">{w.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {WORK_STATUS_LABEL[w.status]}
                    {w.clientName && ` · ${w.clientName}`}
                  </span>
                </span>
              </span>
              <span
                className={cn(
                  "shrink-0 text-xs tabular-nums",
                  w.tone === "danger" ? "text-destructive" : w.tone === "warning" ? "text-warning" : "text-muted-foreground"
                )}
              >
                {w.dueDate ? (w.dueDate === today ? "hoje" : formatDateShort(w.dueDate)) : "sem prazo"}
              </span>
            </li>
          ))}
        </ul>
      )}
      {work.waiting > 0 && <p className="text-xs text-muted-foreground">{work.waiting} aguardando cliente</p>}
    </Panel>
  );
}

function MiniStat({ value, label, tone }: { value: number; label: string; tone: keyof typeof TONE_DOT }) {
  const color =
    tone === "danger" ? "text-destructive" : tone === "success" ? "text-success" : tone === "info" ? "text-primary" : "text-foreground";
  return (
    <div className="rounded-md border border-border/70 bg-background/40 px-2 py-2">
      <p className={cn("text-lg font-semibold tabular-nums", color)}>{value}</p>
      <p className="text-[11px] leading-tight text-muted-foreground">{label}</p>
    </div>
  );
}

const CLIENT_STATUS: Record<ClientBillingStatus, { label: string; tone: keyof typeof TONE_DOT }> = {
  atrasado: { label: "Atrasado", tone: "danger" },
  pendente: { label: "Pendente", tone: "warning" },
  pago: { label: "Em dia", tone: "success" },
  sem_cobranca: { label: "Sem cobrança", tone: "neutral" },
};

function ClientsPanel({ clients }: { clients: NonNullable<DashboardData["clients"]> }) {
  return (
    <Panel title="Clientes" icon={Users} href="/visionario/clientes" linkLabel="Ver clientes">
      <div className="flex flex-col gap-1.5">
        <Stat label="Ativos" value={clients.active} tone="info" />
        {clients.hasFinance && (
          <>
            <Stat label="Em dia" value={clients.emDia} tone="success" />
            <Stat label="Pendentes" value={clients.pendente} tone="warning" />
            <Stat label="Atrasados" value={clients.atrasado} tone="danger" />
          </>
        )}
      </div>
      {clients.rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum cliente ativo cadastrado.</p>
      ) : (
        <ul className="flex flex-col gap-1 border-t border-border pt-3">
          {clients.rows.map((c) => {
            const meta = c.status ? CLIENT_STATUS[c.status] : null;
            return (
              <li key={c.id}>
                <Link href={`/visionario/clientes/${c.id}`} className="flex items-center justify-between gap-2 rounded-md px-1 py-1 text-sm hover:bg-secondary">
                  <span className="truncate text-foreground">{c.name}</span>
                  {meta && (
                    <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                      <Dot tone={meta.tone} />
                      {meta.label}
                      {c.status === "atrasado" && c.daysLate > 0 && ` · ${c.daysLate}d`}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function RecurringPanel({ recurring }: { recurring: NonNullable<DashboardData["recurring"]> }) {
  return (
    <Panel title="Serviços recorrentes" icon={Repeat} href="/visionario/servicos" linkLabel="Ver serviços">
      {recurring.rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum serviço recorrente ativo nos clientes.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {recurring.rows.map((r) => (
            <li key={r.name} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 text-sm">
              <span className="truncate text-foreground">{r.name}</span>
              <span className="text-xs tabular-nums text-muted-foreground">{r.count}</span>
              <span className="text-right font-medium tabular-nums text-foreground">{formatCurrency(r.monthly)}/mês</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
        <span className="text-muted-foreground">Total recorrente</span>
        <span className="font-semibold tabular-nums text-primary">{formatCurrency(recurring.total)}/mês</span>
      </div>
    </Panel>
  );
}

function SitesPanel({ sites }: { sites: NonNullable<DashboardData["sites"]> }) {
  return (
    <Panel title="Sites e domínios" icon={Globe}>
      <div className="flex flex-col gap-1.5">
        <Stat label="Sites ativos" value={sites.activeSites} />
        <Stat label="Domínios" value={sites.domains} />
        <Stat label="Vencendo em 30 dias" value={sites.expiring30} tone={sites.expiring30 > 0 ? "alert" : undefined} />
        <Stat label="Hospedagens" value={sites.hostings} />
      </div>
      <div className="border-t border-border pt-3 text-sm">
        <p className="text-xs text-muted-foreground">Próximo vencimento</p>
        {sites.nextDomain ? (
          <p className="flex items-center justify-between gap-2">
            <span className="truncate text-foreground">{sites.nextDomain.name}</span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatDate(sites.nextDomain.date)}</span>
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Nenhum domínio com renovação cadastrada.</p>
        )}
      </div>
      <div className="flex gap-2">
        <Button asChild size="sm" variant="outline" className="flex-1">
          <Link href="/visionario/sites">Ver sites</Link>
        </Button>
        <Button asChild size="sm" variant="outline" className="flex-1">
          <Link href="/visionario/dominios">Ver domínios</Link>
        </Button>
      </div>
    </Panel>
  );
}

function VendorsPanel({ vendors }: { vendors: NonNullable<DashboardData["vendors"]> }) {
  return (
    <Panel title="Vendedores" icon={Users} href="/visionario/vendedores" linkLabel="Ver vendedores">
      <div className="flex flex-col gap-1.5">
        <Stat label="Vendedores ativos" value={vendors.active} />
        <Stat
          label="Vendas no mês"
          value={
            <>
              {vendors.salesCount} <span className="text-xs font-normal text-muted-foreground">· {formatCurrency(vendors.salesTotal)}</span>
            </>
          }
        />
        <Stat label="Comissões geradas no mês" value={formatCurrency(vendors.commissionsGenerated)} />
        <Stat
          label="Comissões pendentes"
          value={<span className={vendors.commissionsPending > 0 ? "text-warning" : undefined}>{formatCurrency(vendors.commissionsPending)}</span>}
        />
      </div>
    </Panel>
  );
}
