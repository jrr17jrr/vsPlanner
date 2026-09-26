"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Ban, HandCoins, Pencil, MoreVertical, Plus, Repeat, StopCircle } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
}: {
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
}) {
  const [bucket, setBucket] = useState<Bucket>("em_aberto");
  const [markingCharge, setMarkingCharge] = useState<ReceivablePayable | null>(null);
  const [editingCharge, setEditingCharge] = useState<ReceivablePayable | null>(null);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);

  const today = todayKeySaoPaulo();
  const isEntrada = kind === "entrada";
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const originById = useMemo(() => new Map(origins.map((o) => [o.id, o])), [origins]);
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const monthKey = today.slice(0, 7);
  const rows = useMemo(() => listChargesForKind(charges, payments, kind, today), [charges, payments, kind, today]);
  const filtered = useMemo(() => {
    if (bucket === "todas") return rows;
    // "Em aberto" = A pagar/A receber do mês (mesma regra do resumo); competências futuras ficam em "Próximas".
    if (bucket === "em_aberto") return rows.filter((r) => r.bucket !== "recebida_paga" && isDueUpToMonth(r.charge, monthKey));
    if (bucket === "este_mes") return rows.filter((r) => r.charge.due_date.startsWith(monthKey));
    return rows.filter((r) => r.bucket === bucket);
  }, [rows, bucket, monthKey]);

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
            {isEntrada ? "A receber" : "A pagar"} até o fim do mês: <span className="font-semibold text-foreground">{formatCurrency(totals.open)}</span>
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
        origins={origins}
        charges={charges}
        payments={payments}
        accounts={accounts}
        categories={categories}
        permissions={{ canEdit: permissions.canEdit }}
      />

      <Tabs value={bucket} onValueChange={(v) => setBucket(v as Bucket)}>
        <TabsList className="flex-wrap">
          {(Object.keys(bucketLabels) as Bucket[]).map((b) => (
            <TabsTrigger key={b} value={b}>
              {bucketLabels[b]}
            </TabsTrigger>
          ))}
        </TabsList>
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
            const hasMenu = permissions.canEdit || (permissions.canDelete && open && row.paid === 0) || canStop;
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
                    {info && (
                      <span className="inline-flex items-center gap-0.5">
                        · {origin?.origin_type === "recorrente" && <Repeat className="h-3 w-3" aria-hidden />}
                        {info}
                      </span>
                    )}
                  </p>
                  {row.status === "parcial" && (
                    <p className="text-xs text-warning">
                      {isEntrada ? "Recebido" : "Pago"} {formatCurrency(row.paid)} de {formatCurrency(Number(charge.amount))}
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
                        {permissions.canEdit && (
                          <DropdownMenuItem onClick={() => setEditingCharge(row)}>
                            <Pencil className="h-4 w-4" /> Editar cobrança
                          </DropdownMenuItem>
                        )}
                        {canStop && origin && (
                          <DropdownMenuItem onClick={() => setConfirm({ type: "stop", origin })}>
                            <StopCircle className="h-4 w-4" /> Encerrar recorrência
                          </DropdownMenuItem>
                        )}
                        {permissions.canDelete && open && row.paid === 0 && (
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

      {markingCharge && (
        <MarkPaymentDialog
          scope={scope}
          charge={markingCharge.charge}
          remaining={markingCharge.remaining}
          accounts={accounts}
          onOpenChange={(open) => !open && setMarkingCharge(null)}
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
