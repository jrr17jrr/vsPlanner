"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Ban, HandCoins, Pencil } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { ConfirmActionButton } from "@/components/shared/confirm-action-button";
import { MarkPaymentDialog } from "@/components/visionario/financeiro/mark-payment-dialog";
import { EditChargeDialog } from "@/components/visionario/financeiro/edit-charge-dialog";
import { listChargesForKind, type ReceivablePayable } from "@/lib/financial-calc";
import { cancelChargeAction } from "@/lib/supabase/financial-actions";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Client, FinancialAccount, FinancialCategory, FinancialCharge, FinancialKind, FinancialPayment, FinancialReferenceType } from "@/types/database.types";
import type { FinancialScope } from "@/lib/space-slugs";

type Bucket = "todas" | "vence_hoje" | "proximas" | "atrasadas" | "recebida_paga";

const BUCKET_LABEL: Record<Bucket, string> = {
  todas: "Todas",
  vence_hoje: "Vence hoje",
  proximas: "Próximas",
  atrasadas: "Atrasadas",
  recebida_paga: "Recebidas/pagas",
};

const STATUS_LABEL_BY_KIND: Record<FinancialKind, { pendente: string; parcial: string; pago: string }> = {
  entrada: { pendente: "pendente", parcial: "parcial", pago: "recebido" },
  saida: { pendente: "pendente", parcial: "parcial", pago: "pago" },
};

export function ChargesList({
  scope,
  kind,
  charges,
  payments,
  accounts,
  clients,
  categories,
  referenceTypes,
}: {
  scope: FinancialScope;
  kind: FinancialKind;
  charges: FinancialCharge[];
  payments: FinancialPayment[];
  accounts: FinancialAccount[];
  clients: Client[];
  categories: FinancialCategory[];
  referenceTypes: FinancialReferenceType[];
}) {
  const [bucket, setBucket] = useState<Bucket>("todas");
  const [markingCharge, setMarkingCharge] = useState<ReceivablePayable | null>(null);
  const [editingCharge, setEditingCharge] = useState<ReceivablePayable | null>(null);

  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const rows = useMemo(() => listChargesForKind(charges, payments, kind), [charges, payments, kind]);
  const filtered = bucket === "todas" ? rows : rows.filter((r) => r.bucket === bucket);

  const actionLabel = kind === "entrada" ? "Marcar como recebido" : "Marcar como pago";

  async function handleCancel(chargeId: string) {
    const result = await cancelChargeAction(scope, chargeId);
    if (result.error) toast.error(result.error);
  }

  return (
    <div className="flex flex-col gap-3">
      <Tabs value={bucket} onValueChange={(v) => setBucket(v as Bucket)}>
        <TabsList className="flex-wrap">
          {(Object.keys(BUCKET_LABEL) as Bucket[]).map((b) => (
            <TabsTrigger key={b} value={b}>{BUCKET_LABEL[b]}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {filtered.length === 0 ? (
        <EmptyState icon={HandCoins} title="Nenhum registro encontrado" />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((row) => {
            const client = row.charge.client_id ? clientById.get(row.charge.client_id) : undefined;
            const statusLabel = STATUS_LABEL_BY_KIND[kind][row.status as "pendente" | "parcial" | "pago"] ?? row.status;
            return (
              <div
                key={row.charge.id}
                className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{row.charge.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {client && `${client.name} · `}
                    Vencimento {formatDate(row.charge.due_date)}
                    {row.status === "parcial" && ` · recebido ${formatCurrency(row.paid)} de ${formatCurrency(row.charge.amount)}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge status={row.status === "cancelado" ? "cancelada" : statusLabel === "recebido" ? "pago" : statusLabel} />
                  <span className="text-sm font-medium">{formatCurrency(row.remaining)}</span>
                  {row.status !== "cancelado" && (
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingCharge(row)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {row.status !== "pago" && row.status !== "cancelado" && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setMarkingCharge(row)}>
                        <CheckCircle2 className="h-3.5 w-3.5" /> {actionLabel}
                      </Button>
                      <ConfirmActionButton
                        label={<Ban className="h-3.5 w-3.5" />}
                        title="Cancelar esta cobrança?"
                        description="Ela sai de contas a receber/pagar e não entra em nenhum relatório. Não pode ser desfeito."
                        confirmLabel="Cancelar"
                        size="icon"
                        onConfirm={() => handleCancel(row.charge.id)}
                      />
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
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
          accounts={accounts.filter((a) => a.is_active)}
          onOpenChange={(open) => !open && setMarkingCharge(null)}
        />
      )}
    </div>
  );
}
