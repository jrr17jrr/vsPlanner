"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Ban, CalendarClock, CreditCard, HandCoins, History, ListOrdered, Lock, Pencil, MoreVertical, Plus, Repeat, StopCircle, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Tabs, ScrollableTabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { AsyncConfirmDialog } from "@/components/shared/async-confirm-dialog";
import { MarkPaymentDialog } from "@/components/visionario/financeiro/mark-payment-dialog";
import { EditChargeDialog } from "@/components/visionario/financeiro/edit-charge-dialog";
import { RecurrencesPanel } from "@/components/visionario/financeiro/recurrences-panel";
import { UndoPaymentDialog } from "@/components/visionario/financeiro/undo-payment-dialog";
import { PaymentHistoryDialog } from "@/components/visionario/financeiro/payment-history-dialog";
import { InstallmentPlanDialog, RescheduleInstallmentDialog, installmentsOf } from "@/components/financeiro/installments/installment-dialogs";
import type { CreditCard as Card } from "@/lib/finance/credit-card";
import { activeLinksIndex } from "@/lib/finance/personal-link";
import { isDueUpToMonth, listChargesForKind, pendingUpToMonth, type ReceivablePayable } from "@/lib/financial-calc";
import { cancelChargeAction, stopRecurrenceAction } from "@/lib/supabase/financial-actions";
import { FREQUENCY_LABEL, chargeBadgeStatus } from "@/lib/finance-labels";
import { formatCurrency, formatDate, todayKeySaoPaulo } from "@/lib/format";
import type {
  Client,
  FinancialAccount,
  FinancialCategory,
  FinancialCharge,
  FinancialKind,
  FinancialOrigin,
  FinancialPayment,
  FinancialPaymentReversal,
  FinancialPersonalLink,
  FinancialReferenceType,
} from "@/types/database.types";
import type { FinancialScope } from "@/lib/space-slugs";

type Bucket = "em_aberto" | "este_mes" | "atrasadas" | "vence_hoje" | "proximas" | "recebida_paga" | "todas";

type PendingConfirm = { type: "cancel"; row: ReceivablePayable } | { type: "stop"; origin: FinancialOrigin };

/**
 * A receber (kind = entrada) e A pagar (kind = saida) — mesma lista,
 * mesmo cálculo (`listChargesForKind`), só muda o tipo. Cada linha é UMA
 * cobrança (uma parcela, uma competência) com status próprio.
 */
export function ChargesList({
  scope,
  kind,
  charges,
  payments,
  accounts,
  clients,
  categories,
  referenceTypes,
  origins,
  permissions,
  onCreate,
  selectedMonth,
  personalLinks = [],
  reversals = [],
  cards = [],
  onOpenCards,
}: {
  /** Cartões do Pessoal (converter parcelamento em compra no cartão). */
  cards?: Card[];
  /** Abre a aba Cartões (cobranças que são faturas de cartão). */
  onOpenCards?: () => void;
  personalLinks?: FinancialPersonalLink[];
  reversals?: FinancialPaymentReversal[];
  scope: FinancialScope;
  kind: FinancialKind;
  charges: FinancialCharge[];
  payments: FinancialPayment[];
  accounts: FinancialAccount[];
  clients: Client[];
  categories: FinancialCategory[];
  referenceTypes: FinancialReferenceType[];
  origins: FinancialOrigin[];
  permissions: { canCreate: boolean; canEdit: boolean; canDelete: boolean };
  onCreate?: () => void;
  selectedMonth: string;
}) {
  const [bucket, setBucket] = useState<Bucket>("em_aberto");
  const [markingCharge, setMarkingCharge] = useState<ReceivablePayable | null>(null);
  const [editingCharge, setEditingCharge] = useState<ReceivablePayable | null>(null);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const [historyCharge, setHistoryCharge] = useState<FinancialCharge | null>(null);
  const [undoing, setUndoing] = useState<FinancialPayment | null>(null);
  const [planOrigin, setPlanOrigin] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState<FinancialCharge | null>(null);
  const router = useRouter();
  const links = useMemo(() => activeLinksIndex(personalLinks), [personalLinks]);
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const chargeById = useMemo(() => new Map(charges.map((c) => [c.id, c])), [charges]);
  const paymentsByCharge = useMemo(() => {
    const m = new Map<string, FinancialPayment[]>();
    for (const p of payments) m.set(p.charge_id, [...(m.get(p.charge_id) ?? []), p]);
    return m;
  }, [payments]);
  const reversalsByCharge = useMemo(() => {
    const m = new Map<string, FinancialPaymentReversal[]>();
    for (const r of reversals) if (r.charge_id) m.set(r.charge_id, [...(m.get(r.charge_id) ?? []), r]);
    return m;
  }, [reversals]);
  /** Saídas "Sem devolução · …" (lançamento travado de um pagamento desfeito sem devolução). */
  const lockedChargeIds = useMemo(() => new Set(reversals.filter((r) => r.mode === "sem_devolucao" && r.adjustment_charge_id).map((r) => r.adjustment_charge_id!)), [reversals]);

  function startUndo(charge: FinancialCharge) {
    const list = paymentsByCharge.get(charge.id) ?? [];
    if (list.length === 1) setUndoing(list[0]);
    else setHistoryCharge(charge);
  }

  const today = todayKeySaoPaulo();
  const isEntrada = kind === "entrada";
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const originById = useMemo(() => new Map(origins.map((o) => [o.id, o])), [origins]);
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const monthKey = selectedMonth;
  const rows = useMemo(() => listChargesForKind(charges, payments, kind, today), [charges, payments, kind, today]);
  const filtered = useMemo(() => {
    if (bucket === "todas") return rows;
    // "Em aberto" = A pagar/A receber do mês (mesma regra do resumo); competências futuras ficam em "Próximas".
    if (bucket === "em_aberto") return rows.filter((r) => r.bucket !== "recebida_paga" && isDueUpToMonth(r.charge, monthKey));
    if (bucket === "este_mes") {
      // Mostra cobranças que vencem neste mês E as quitadas neste mês,
      // mesmo quando o vencimento pertence a outra competência.
      // Uma cobrança aparece apenas uma vez, inclusive se tiver vários pagamentos.
      const paidChargeIds = new Set(
        payments.filter((p) => p.payment_date.startsWith(monthKey)).map((p) => p.charge_id)
      );
      return rows.filter((r) => r.charge.due_date.startsWith(monthKey) || paidChargeIds.has(r.charge.id));
    }
    return rows.filter((r) => r.bucket === bucket);
  }, [rows, payments, bucket, monthKey]);

  // Mesmo cálculo da Home/dashboards (`pendingUpToMonth`): nunca soma competências de meses futuros.
  const totals = useMemo(() => {
    const summary = pendingUpToMonth(charges, payments, kind, monthKey, today);
    return {
      open: summary.total,
      overdue: summary.overdue,
      count: rows.filter((r) => r.bucket !== "recebida_paga" && isDueUpToMonth(r.charge, monthKey)).length,
    };
  }, [charges, payments, kind, monthKey, today, rows]);

  const bucketLabels: Record<Bucket, string> = {
    em_aberto: "Em aberto",
    este_mes: "Este mês",
    atrasadas: "Atrasadas",
    vence_hoje: "Vence hoje",
    proximas: "Próximas",
    recebida_paga: isEntrada ? "Recebidas" : "Pagas",
    todas: "Todas",
  };
  const actionLabel = isEntrada ? "Marcar como recebido" : "Marcar como pago";

  function originInfo(charge: FinancialCharge): string | null {
    if (charge.installment_number && charge.installment_total) return `Parcela ${charge.installment_number}/${charge.installment_total}`;
    const origin = originById.get(charge.origin_id);
    if (origin?.origin_type === "recorrente") {
      const freq = origin.recurrence_frequency ? FREQUENCY_LABEL[origin.recurrence_frequency] : "Recorrente";
      return `${freq}${origin.is_active ? "" : " (encerrada)"}`;
    }
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm">
          <p className="text-muted-foreground">
            {isEntrada ? "A receber" : "A pagar"} até o fim de {new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(Number(monthKey.slice(0,4)),Number(monthKey.slice(5,7))-1,1))}: <span className="font-semibold text-foreground">{formatCurrency(totals.open)}</span>
            <span className="text-xs"> · {totals.count} cobrança(s)</span>
          </p>
          {totals.overdue > 0 && (
            <p className="text-xs text-destructive">Atrasado: {formatCurrency(totals.overdue)}</p>
          )}
        </div>
        {permissions.canCreate && onCreate && (
          <Button size="sm" onClick={onCreate}>
            <Plus className="h-4 w-4" /> {isEntrada ? "Nova conta a receber" : "Nova conta a pagar"}
          </Button>
        )}
      </div>

      <RecurrencesPanel
        scope={scope}
        kind={kind}
        selectedMonth={selectedMonth}
        origins={origins}
        charges={charges}
        payments={payments}
        accounts={accounts}
        categories={categories}
        permissions={{ canEdit: permissions.canEdit }}
      />
      <div className="border-t border-border pt-3"><p className="text-sm font-semibold">Contas e cobranças de {new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(Number(monthKey.slice(0,4)),Number(monthKey.slice(5,7))-1,1))}</p><p className="text-xs text-muted-foreground">As recorrências acima são compromissos contínuos. A lista abaixo mostra cobranças individuais conforme o filtro escolhido.</p></div>

      <Tabs value={bucket} onValueChange={(v) => setBucket(v as Bucket)}>
        <ScrollableTabsList aria-label="Filtro de cobranças">
          {(Object.keys(bucketLabels) as Bucket[]).map((b) => (
            <TabsTrigger key={b} value={b}>
              {bucketLabels[b]}
            </TabsTrigger>
          ))}
        </ScrollableTabsList>
      </Tabs>

      {filtered.length === 0 ? (
        <EmptyState
          icon={HandCoins}
          title={bucket === "em_aberto" ? (isEntrada ? "Nada a receber" : "Nada a pagar") : "Nenhum registro encontrado"}
          description={
            bucket === "em_aberto" && permissions.canCreate
              ? isEntrada
                ? "Cobranças de serviços de clientes e contas a receber lançadas aparecem aqui."
                : "Cadastre despesas únicas, parceladas ou recorrentes que você precisa pagar."
              : undefined
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((row) => {
            const charge = row.charge;
            const client = charge.client_id ? clientById.get(charge.client_id) : undefined;
            const category = charge.category_id ? categoryById.get(charge.category_id) : undefined;
            const origin = originById.get(charge.origin_id);
            const info = originInfo(charge);
            const open = row.status !== "pago" && row.status !== "cancelado";
            const canStop = permissions.canEdit && origin?.origin_type === "recorrente" && origin.is_active && !origin.client_service_id;
            const chargePayments = paymentsByCharge.get(charge.id) ?? [];
            const hasHistory = chargePayments.length > 0 || (reversalsByCharge.get(charge.id)?.length ?? 0) > 0;
            const locked = lockedChargeIds.has(charge.id);
            const canUndo = permissions.canEdit && chargePayments.length > 0 && !locked;
            const isCardInvoice = !!charge.card_invoice_id;
            const isInstallment = !!charge.installment_number && origin?.origin_type === "parcelado";
            const canReschedule = permissions.canEdit && open && !isCardInvoice && !locked;
            const hasMenu = permissions.canEdit || (permissions.canDelete && open && row.paid === 0) || canStop || hasHistory || isInstallment;
            return (
              <li
                key={charge.id}
                className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{charge.description}</p>
                  <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                    <span className={row.bucket === "atrasadas" ? "text-destructive" : undefined}>Vence {formatDate(charge.due_date)}</span>
                    {client && <span>· {client.name}</span>}
                    {!client && charge.supplier_name && <span>· {charge.supplier_name}</span>}
                    {category && <span>· {category.name}</span>}
                    {locked && <span className="inline-flex items-center gap-0.5 text-warning">· <Lock className="h-3 w-3" aria-hidden /> pagamento desfeito sem devolução</span>}
                    {isCardInvoice && <span className="inline-flex items-center gap-0.5">· <CreditCard className="h-3 w-3" aria-hidden /> fatura de cartão</span>}
                    {info && (
                      <span className="inline-flex items-center gap-0.5">
                        · {origin?.origin_type === "recorrente" && <Repeat className="h-3 w-3" aria-hidden />}
                        {info}
                      </span>
                    )}
                  </p>
                  {row.status === "parcial" && (
                    <p className="text-xs text-warning">
                      {isEntrada ? "Recebido" : "Pago"} {formatCurrency(row.paid)} de {formatCurrency(Number(charge.amount))} · restam {formatCurrency(row.remaining)}
                    </p>
                  )}
                  {row.status === "pago" && (Number(charge.discount_amount) > 0 || Number(charge.addition_amount) > 0) && (
                    <p className="text-xs text-muted-foreground">
                      Original {formatCurrency(Number(charge.original_amount))}
                      {Number(charge.discount_amount) > 0 && ` · desconto ${formatCurrency(Number(charge.discount_amount))}`}
                      {Number(charge.addition_amount) > 0 && ` · acréscimo ${formatCurrency(Number(charge.addition_amount))}`}
                      {` · ${isEntrada ? "recebido" : "pago"} ${formatCurrency(row.paid)}`}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center justify-between gap-2 sm:justify-end">
                  <StatusBadge status={chargeBadgeStatus(kind, row.status, row.bucket === "atrasadas")} />
                  <span className="text-sm font-semibold tabular-nums">
                    {formatCurrency(open ? row.remaining : Number(charge.amount))}
                  </span>
                  {open && permissions.canEdit && (
                    <Button size="sm" variant="outline" onClick={() => setMarkingCharge(row)}>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">{actionLabel}</span>
                      <span className="sm:hidden">{isEntrada ? "Recebido" : "Pago"}</span>
                    </Button>
                  )}
                  {hasMenu && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Mais ações">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {permissions.canEdit && !isCardInvoice && (
                          <DropdownMenuItem onClick={() => setEditingCharge(row)}>
                            <Pencil className="h-4 w-4" /> Editar cobrança
                          </DropdownMenuItem>
                        )}
                        {isCardInvoice && onOpenCards && (
                          <DropdownMenuItem onClick={onOpenCards}>
                            <CreditCard className="h-4 w-4" /> Ver no cartão
                          </DropdownMenuItem>
                        )}
                        {canReschedule && (
                          <DropdownMenuItem onClick={() => setRescheduling(charge)}>
                            <CalendarClock className="h-4 w-4" /> Alterar vencimento
                          </DropdownMenuItem>
                        )}
                        {isInstallment && (
                          <DropdownMenuItem onClick={() => setPlanOrigin(charge.origin_id)}>
                            <ListOrdered className="h-4 w-4" /> Ver parcelamento
                          </DropdownMenuItem>
                        )}
                        {canUndo && (
                          <DropdownMenuItem onClick={() => startUndo(charge)}>
                            <Undo2 className="h-4 w-4" /> Desfazer {isEntrada ? "recebimento" : "pagamento"}
                          </DropdownMenuItem>
                        )}
                        {hasHistory && (
                          <DropdownMenuItem onClick={() => setHistoryCharge(charge)}>
                            <History className="h-4 w-4" /> Histórico de pagamentos
                          </DropdownMenuItem>
                        )}
                        {canStop && origin && (
                          <DropdownMenuItem onClick={() => setConfirm({ type: "stop", origin })}>
                            <StopCircle className="h-4 w-4" /> Encerrar recorrência
                          </DropdownMenuItem>
                        )}
                        {permissions.canDelete && open && row.paid === 0 && !isCardInvoice && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setConfirm({ type: "cancel", row })}
                              className="text-destructive focus:text-destructive"
                            >
                              <Ban className="h-4 w-4" /> Cancelar cobrança
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editingCharge && (
        <EditChargeDialog
          scope={scope}
          charge={editingCharge.charge}
          categories={categories}
          referenceTypes={referenceTypes}
          hasPayment={editingCharge.paid > 0}
          onOpenChange={(open) => !open && setEditingCharge(null)}
        />
      )}

      {planOrigin && (
        <InstallmentPlanDialog
          scope={scope}
          originId={planOrigin}
          charges={charges}
          payments={payments}
          cards={scope === "pessoal" ? cards : []}
          canEdit={permissions.canEdit}
          onReschedule={(c) => setRescheduling(c)}
          onOpenChange={(o) => !o && setPlanOrigin(null)}
        />
      )}

      {rescheduling && (
        <RescheduleInstallmentDialog
          scope={scope}
          charge={chargeById.get(rescheduling.id) ?? rescheduling}
          installments={installmentsOf(rescheduling.origin_id, charges, payments)}
          onOpenChange={(o) => !o && setRescheduling(null)}
        />
      )}

      {markingCharge && (
        <MarkPaymentDialog
          scope={scope}
          charge={markingCharge.charge}
          remaining={markingCharge.remaining}
          accounts={accounts}
          onOpenChange={(open) => !open && setMarkingCharge(null)}
        />
      )}

      {historyCharge && (
        <PaymentHistoryDialog
          charge={chargeById.get(historyCharge.id) ?? historyCharge}
          payments={paymentsByCharge.get(historyCharge.id) ?? []}
          reversals={reversalsByCharge.get(historyCharge.id) ?? []}
          accountName={(id) => (id ? accountById.get(id)?.name ?? null : null)}
          linkByPayment={links.byBusinessPayment}
          personalLinkByPayment={links.byPersonalPayment}
          canEdit={permissions.canEdit && !lockedChargeIds.has(historyCharge.id)}
          onUndo={(p) => {
            setHistoryCharge(null);
            setUndoing(p);
          }}
          onOpenChange={(o) => !o && setHistoryCharge(null)}
        />
      )}

      {undoing && (
        <UndoPaymentDialog
          scope={scope}
          payment={undoing}
          charge={chargeById.get(undoing.charge_id)}
          accountName={undoing.account_id ? accountById.get(undoing.account_id)?.name ?? null : null}
          businessLink={links.byBusinessPayment.get(undoing.id)}
          personalLink={links.byPersonalPayment.get(undoing.id)}
          locked={lockedChargeIds.has(undoing.charge_id)}
          onOpenChange={(o) => !o && setUndoing(null)}
          onSaved={() => router.refresh()}
        />
      )}

      {confirm && (
        <AsyncConfirmDialog
          open
          onOpenChange={(open) => !open && setConfirm(null)}
          title={confirm.type === "cancel" ? "Cancelar esta cobrança?" : "Encerrar esta recorrência?"}
          description={
            confirm.type === "cancel"
              ? "Ela sai de A receber/A pagar e de todos os relatórios. As demais parcelas/competências não são afetadas."
              : "Nenhuma nova competência será gerada e as futuras ainda não pagas são canceladas. Pagamentos e competências atrasadas continuam registrados."
          }
          confirmLabel={confirm.type === "cancel" ? "Cancelar cobrança" : "Encerrar recorrência"}
          onConfirm={() =>
            confirm.type === "cancel"
              ? cancelChargeAction(scope, confirm.row.charge.id)
              : stopRecurrenceAction(scope, confirm.origin.id)
          }
        />
      )}
    </div>
  );
}
