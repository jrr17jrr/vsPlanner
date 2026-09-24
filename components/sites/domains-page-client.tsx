"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AtSign, Ban, CheckCircle2, Globe, Loader2, MoreVertical, Pencil, Plus, Receipt, Repeat, Trash2, Wallet, CalendarClock } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard } from "@/components/shared/metric-card";
import { MoneyCard } from "@/components/shared/money-card";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { AsyncConfirmDialog } from "@/components/shared/async-confirm-dialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DomainFormDialog, DOMAIN_STATUS_LABEL } from "@/components/sites/domain-form-dialog";
import { MarkPaymentDialog } from "@/components/visionario/financeiro/mark-payment-dialog";
import { deleteDomainAction, setDomainWillRenewAction } from "@/lib/supabase/domains-actions";
import { chargeStatus, remainingAmount } from "@/lib/financial-calc";
import {
  domainTotalSpent,
  effectiveRenewalDate,
  groupChargesByOrigin,
  isPlannedRenewal,
  periodLabel,
  plannedRenewalsTotal,
} from "@/lib/domains";
import { addDaysKey } from "@/lib/recurrence";
import { formatCurrency, formatDate, todayKeySaoPaulo } from "@/lib/format";
import type { Client, ClientSite, Domain, DomainStatus, FinancialAccount, FinancialCharge, FinancialPayment } from "@/types/database.types";

type Permissions = {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canViewFinance: boolean;
  canCreateFinance: boolean;
  canEditFinance: boolean;
};

export function DomainsPageClient({
  domains,
  sites,
  clients,
  charges,
  payments,
  accounts,
  permissions,
}: {
  domains: Domain[];
  sites: ClientSite[];
  clients: Client[];
  charges: FinancialCharge[];
  payments: FinancialPayment[];
  accounts: FinancialAccount[];
  permissions: Permissions;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Domain | undefined>();
  const [deleting, setDeleting] = useState<Domain | null>(null);
  const [paying, setPaying] = useState<FinancialCharge | null>(null);
  const [statusFilter, setStatusFilter] = useState<"todos" | DomainStatus>("todos");
  const [renewFilter, setRenewFilter] = useState<"todos" | "sim" | "nao">("todos");
  const [query, setQuery] = useState("");
  // Atualização otimista do "Renovar": o card e os totais mudam na hora; se
  // o Supabase recusar, volta ao valor anterior. Depois do sucesso a Server
  // Action revalida a rota e os dados do servidor passam a bater com isto.
  const [renewOverride, setRenewOverride] = useState<Record<string, boolean>>({});
  const [savingRenew, setSavingRenew] = useState<Record<string, boolean>>({});

  const today = todayKeySaoPaulo();
  const in30 = addDaysKey(today, 30);
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const siteById = useMemo(() => new Map(sites.map((s) => [s.id, s])), [sites]);
  const chargesByOrigin = useMemo(() => groupChargesByOrigin(charges), [charges]);

  const effectiveDomains = useMemo(
    () => domains.map((d) => (d.id in renewOverride ? { ...d, will_renew: renewOverride[d.id] } : d)),
    [domains, renewOverride]
  );

  async function toggleRenew(domain: Domain, next: boolean) {
    const previous = domain.will_renew !== false;
    setRenewOverride((o) => ({ ...o, [domain.id]: next }));
    setSavingRenew((s) => ({ ...s, [domain.id]: true }));
    try {
      const result = await setDomainWillRenewAction(domain.id, next);
      if (result.error) {
        setRenewOverride((o) => ({ ...o, [domain.id]: previous }));
        toast.error(result.error);
        return;
      }
      toast.success(result.success ?? "Salvo.");
      if (result.warning) toast.warning(result.warning);
    } catch {
      setRenewOverride((o) => ({ ...o, [domain.id]: previous }));
      toast.error("Não foi possível salvar. Verifique a conexão e tente de novo.");
    } finally {
      setSavingRenew((s) => ({ ...s, [domain.id]: false }));
    }
  }

  const rows = useMemo(
    () =>
      effectiveDomains.map((d) => {
        const originCharges = d.financial_origin_id ? chargesByOrigin.get(d.financial_origin_id) ?? [] : [];
        const openCharge = originCharges
          .filter((c) => c.status !== "cancelado" && chargeStatus(c, payments) !== "pago")
          .sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
        return {
          domain: d,
          renewal: effectiveRenewalDate(d, chargesByOrigin, payments),
          spent: domainTotalSpent(d, chargesByOrigin, payments),
          openCharge,
        };
      }),
    [effectiveDomains, chargesByOrigin, payments]
  );

  const byRenewal = (a: { renewal: string | null }, b: { renewal: string | null }) =>
    (a.renewal ?? "").localeCompare(b.renewal ?? "");
  const activeRows = rows.filter((r) => r.domain.status === "ativo");
  // Renovação prevista = ativo + "vou renovar" (nunca pelo status sozinho).
  const plannedRows = rows.filter((r) => isPlannedRenewal(r.domain));
  const notRenewingRows = activeRows.filter((r) => r.domain.will_renew === false);
  const plannedTotal = plannedRenewalsTotal(effectiveDomains);
  const plannedWithoutPrice = plannedRows.filter((r) => r.domain.renewal_price === null).length;
  const totalSpent = rows.reduce((s, r) => s + r.spent, 0);
  const expiring = plannedRows.filter((r) => r.renewal && r.renewal <= in30).sort(byRenewal);
  const nextRenewal =
    plannedRows.filter((r) => r.renewal && r.renewal >= today).sort(byRenewal)[0] ??
    activeRows.filter((r) => r.renewal && r.renewal >= today).sort(byRenewal)[0];

  const filtered = rows
    .filter((r) => statusFilter === "todos" || r.domain.status === statusFilter)
    .filter((r) => renewFilter === "todos" || (renewFilter === "sim") === (r.domain.will_renew !== false))
    .filter((r) => !query.trim() || r.domain.domain.includes(query.trim().toLowerCase()))
    .sort((a, b) => (a.renewal ?? "9999").localeCompare(b.renewal ?? "9999"));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Domínios"
        description="Domínios que você comprou ou administra."
        actions={
          permissions.canCreate ? (
            <Button size="sm" onClick={() => { setEditing(undefined); setFormOpen(true); }}>
              <Plus className="h-4 w-4" /> Novo domínio
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Domínios" value={domains.length} icon={Globe} />
        <MoneyCard
          label="Renovações previstas"
          amount={plannedTotal}
          icon={Repeat}
          className="border-primary/40"
          hint={
            plannedWithoutPrice > 0
              ? `Só os que vou renovar · ${plannedWithoutPrice} sem valor cadastrado`
              : "Somente domínios que pretendo renovar"
          }
        />
        <Card className="p-4">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">Não renovar</p>
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
              <Ban className="h-3.5 w-3.5 text-primary" aria-hidden />
            </div>
          </div>
          <p className="mt-2 text-xl font-semibold tabular-nums text-foreground">{notRenewingRows.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">Serão abandonados no vencimento</p>
        </Card>
        <MetricCard label="Vencendo em 30 dias" value={expiring.length} icon={CalendarClock} tone={expiring.length > 0 ? "warning" : "default"} />
        <MetricCard
          label="Próximo vencimento"
          value={nextRenewal ? `${formatDate(nextRenewal.renewal!)}` : "—"}
          icon={AtSign}
        />
        <MoneyCard
          label="Total gasto"
          amount={totalSpent}
          icon={Wallet}
          hint={permissions.canViewFinance ? "Compras + renovações pagas" : "Valores de compra cadastrados"}
        />
      </div>

      {expiring.length > 0 && (
        <section aria-labelledby="domains-expiring">
          <h2 id="domains-expiring" className="mb-2 text-sm font-medium text-muted-foreground">Próximos vencimentos</h2>
          <ul className="flex flex-col gap-2">
            {expiring.map(({ domain, renewal, openCharge }) => (
              <li key={domain.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{domain.domain}</p>
                  <p className={`text-xs ${renewal! < today ? "text-destructive" : "text-muted-foreground"}`}>
                    {renewal! < today ? "Venceu em" : "Vence em"} {formatDate(renewal!)}
                    {domain.renewal_price ? ` · ${formatCurrency(Number(domain.renewal_price))}` : ""}
                  </p>
                </div>
                {openCharge && permissions.canEditFinance ? (
                  <Button size="sm" variant="outline" onClick={() => setPaying(openCharge)}>
                    <CheckCircle2 className="h-3.5 w-3.5" /> Marcar como pago
                  </Button>
                ) : (
                  <StatusBadge status={renewal! < today ? "atrasado" : "vencendo"} />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          placeholder="Buscar domínio…"
          aria-label="Buscar domínio"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="sm:max-w-xs"
        />
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-full sm:w-48" aria-label="Status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todo status</SelectItem>
            {(Object.keys(DOMAIN_STATUS_LABEL) as DomainStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{DOMAIN_STATUS_LABEL[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={renewFilter} onValueChange={(v) => setRenewFilter(v as typeof renewFilter)}>
          <SelectTrigger className="w-full sm:w-48" aria-label="Renovação"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos (renovação)</SelectItem>
            <SelectItem value="sim">Vou renovar</SelectItem>
            <SelectItem value="nao">Não vou renovar</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Globe}
          title={domains.length === 0 ? "Nenhum domínio cadastrado" : "Nenhum domínio encontrado"}
          description={domains.length === 0 && permissions.canCreate ? "Cadastre os domínios que você possui para acompanhar custos e renovações." : undefined}
          action={
            domains.length === 0 && permissions.canCreate ? (
              <Button size="sm" onClick={() => { setEditing(undefined); setFormOpen(true); }}>
                <Plus className="h-4 w-4" /> Novo domínio
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(({ domain, renewal, spent, openCharge }) => {
            const client = domain.client_id ? clientById.get(domain.client_id) : undefined;
            const site = domain.site_id ? siteById.get(domain.site_id) : undefined;
            const overdue = domain.status === "ativo" && !!renewal && renewal < today;
            const hasMenu = permissions.canEdit || permissions.canDelete;
            const willRenew = domain.will_renew !== false;
            const saving = !!savingRenew[domain.id];
            return (
              <Card
                key={domain.id}
                className={cn("flex flex-col gap-3 p-4 transition-opacity", !willRenew && "border-dashed opacity-75")}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <a
                      href={`https://${domain.domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-sm font-semibold text-foreground hover:text-primary"
                    >
                      {domain.domain}
                    </a>
                    <p className="truncate text-xs text-muted-foreground">
                      {domain.registrar || "Registrador não informado"} · {periodLabel(domain.period_months)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <StatusBadge status={overdue ? "atrasado" : domain.status} />
                    {hasMenu && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Ações de ${domain.domain}`}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {permissions.canEdit && (
                            <DropdownMenuItem onClick={() => { setEditing(domain); setFormOpen(true); }}>
                              <Pencil className="h-4 w-4" /> Editar
                            </DropdownMenuItem>
                          )}
                          {openCharge && permissions.canEditFinance && (
                            <DropdownMenuItem onClick={() => setPaying(openCharge)}>
                              <CheckCircle2 className="h-4 w-4" /> Marcar renovação como paga
                            </DropdownMenuItem>
                          )}
                          {permissions.canDelete && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => setDeleting(domain)} className="text-destructive focus:text-destructive">
                                <Trash2 className="h-4 w-4" /> Excluir
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>

                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <dt className="text-muted-foreground">Renovação</dt>
                  <dd className={`text-right ${overdue ? "text-destructive" : "text-foreground"}`}>{renewal ? formatDate(renewal) : "—"}</dd>
                  <dt className="text-muted-foreground">Compra</dt>
                  <dd className="text-right text-foreground">
                    {domain.purchase_date ? formatDate(domain.purchase_date) : "—"}
                    {domain.purchase_price !== null && ` · ${formatCurrency(Number(domain.purchase_price))}`}
                  </dd>
                  <dt className="text-muted-foreground">Valor da renovação</dt>
                  <dd className={cn("text-right", willRenew ? "text-foreground" : "text-muted-foreground line-through")}>
                    {domain.renewal_price !== null ? formatCurrency(Number(domain.renewal_price)) : "—"}
                  </dd>
                  <dt className="self-center text-muted-foreground">Renovar</dt>
                  <dd className="flex items-center justify-end gap-2">
                    {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" aria-label="Salvando" />}
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                        willRenew ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
                      )}
                    >
                      {willRenew ? "Sim" : "Não"}
                    </span>
                    {permissions.canEdit && (
                      <Switch
                        checked={willRenew}
                        disabled={saving}
                        onCheckedChange={(checked) => toggleRenew(domain, checked)}
                        aria-label={`Renovar ${domain.domain} no próximo vencimento`}
                      />
                    )}
                  </dd>
                  {!willRenew && (
                    <dd className="col-span-2 text-right text-destructive/90">Não renovar no vencimento</dd>
                  )}
                  <dt className="text-muted-foreground">Total gasto</dt>
                  <dd className="text-right font-medium text-foreground">{formatCurrency(spent)}</dd>
                </dl>

                <div className="flex flex-wrap items-center gap-1.5">
                  {domain.financial_origin_id && willRenew && (
                    <Badge variant="default" className="gap-1">
                      <Receipt className="h-3 w-3" /> Renovação em A pagar
                    </Badge>
                  )}
                  {openCharge && permissions.canViewFinance && (
                    <Badge variant="warning">Em aberto: {formatCurrency(remainingAmount(openCharge, payments))}</Badge>
                  )}
                  {client && (
                    <Link href={`/visionario/clientes/${client.id}`} className="text-xs text-primary hover:underline">
                      {client.name}
                    </Link>
                  )}
                  {site && <span className="text-xs text-muted-foreground">· {site.project_name}</span>}
                </div>
                {domain.notes && <p className="line-clamp-2 text-xs text-muted-foreground">{domain.notes}</p>}
              </Card>
            );
          })}
        </div>
      )}

      {(permissions.canCreate || permissions.canEdit) && (
        <DomainFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          domain={editing}
          clients={clients}
          sites={sites}
          canUseFinance={permissions.canCreateFinance && permissions.canEditFinance}
        />
      )}

      {deleting && (
        <AsyncConfirmDialog
          open
          onOpenChange={(open) => !open && setDeleting(null)}
          title={`Excluir ${deleting.domain}?`}
          description={
            deleting.financial_origin_id
              ? "A renovação em A pagar para de ser gerada. Se já houver renovação paga, o histórico financeiro é mantido."
              : "O domínio é removido. Não pode ser desfeito."
          }
          confirmLabel="Excluir"
          onConfirm={() => deleteDomainAction(deleting.id)}
        />
      )}

      {paying && (
        <MarkPaymentDialog
          scope="visionario"
          charge={paying}
          remaining={remainingAmount(paying, payments)}
          accounts={accounts}
          onOpenChange={(open) => !open && setPaying(null)}
        />
      )}
    </div>
  );
}
