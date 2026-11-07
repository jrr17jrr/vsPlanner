"use client";

import { Link2, Undo2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PAYMENT_METHOD_LABEL } from "@/lib/finance-labels";
import { formatCurrency, formatDate } from "@/lib/format";
import type { FinancialCharge, FinancialPayment, FinancialPaymentReversal, FinancialPersonalLink } from "@/types/database.types";

/** Valor original, desconto, acréscimo, final, pago e restante de uma cobrança. */
export function ChargeAmountsSummary({ charge, paid }: { charge: FinancialCharge; paid: number }) {
  const original = Number(charge.original_amount);
  const discount = Number(charge.discount_amount);
  const addition = Number(charge.addition_amount);
  const final = Number(charge.amount);
  const remaining = Math.max(0, Math.round((final - paid) * 100) / 100);
  const rows: [string, number, string?][] = [
    ["Valor original", original],
    ...(discount > 0 ? ([["Desconto", -discount, "text-success"]] as [string, number, string][]) : []),
    ...(addition > 0 ? ([["Acréscimo", addition, "text-destructive"]] as [string, number, string][]) : []),
    ...(discount > 0 || addition > 0 ? ([["Valor final", final]] as [string, number][]) : []),
    ["Valor pago", paid],
    ["Saldo restante", remaining, remaining > 0 ? "text-warning" : "text-success"],
  ];
  return (
    <dl className="grid grid-cols-2 gap-2 rounded-lg border p-3 text-sm sm:grid-cols-3">
      {rows.map(([label, value, cls]) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className={`font-semibold tabular-nums ${cls ?? ""}`}>{value < 0 ? `− ${formatCurrency(-value)}` : formatCurrency(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Histórico de uma cobrança: valores, pagamentos ativos (com "Desfazer") e
 * pagamentos desfeitos (com ou sem devolução, data e motivo).
 */
export function PaymentHistoryDialog({
  charge,
  payments,
  reversals,
  accountName,
  linkByPayment,
  personalLinkByPayment,
  canEdit,
  onUndo,
  onOpenChange,
}: {
  charge: FinancialCharge;
  payments: FinancialPayment[];
  reversals: FinancialPaymentReversal[];
  accountName: (id: string | null) => string | null;
  linkByPayment: Map<string, FinancialPersonalLink>;
  personalLinkByPayment: Map<string, FinancialPersonalLink>;
  canEdit: boolean;
  onUndo: (payment: FinancialPayment) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const paid = payments.reduce((s, p) => s + Number(p.amount), 0);
  const sorted = [...payments].sort((a, b) => b.payment_date.localeCompare(a.payment_date) || b.created_at.localeCompare(a.created_at));

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Histórico de pagamentos</DialogTitle>
          <DialogDescription>{charge.description} · vencimento {formatDate(charge.due_date)}</DialogDescription>
        </DialogHeader>

        <ChargeAmountsSummary charge={charge} paid={paid} />

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Pagamentos</h3>
          {sorted.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum pagamento ativo.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {sorted.map((p) => {
                const link = linkByPayment.get(p.id);
                const plink = personalLinkByPayment.get(p.id);
                const d = Number(p.settle_discount ?? 0);
                const a = Number(p.settle_addition ?? 0);
                return (
                  <li key={p.id} className="flex flex-col gap-2 rounded-lg border p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium tabular-nums">{formatCurrency(Number(p.amount))} · {formatDate(p.payment_date)}</p>
                      <p className="text-xs text-muted-foreground">
                        {PAYMENT_METHOD_LABEL[p.payment_method]} · {link ? `${link.account_name} (Financeiro Pessoal)` : accountName(p.account_id) ?? "Sem conta"}
                        {d > 0 && ` · quitou com desconto de ${formatCurrency(d)}`}
                        {a > 0 && ` · quitou com acréscimo de ${formatCurrency(a)}`}
                      </p>
                      {(link || plink) && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-primary">
                          <Link2 className="h-3 w-3 shrink-0" /> {link ? "Pago com conta pessoal" : `Pagou “${plink!.description}” da Visionário Dev`}
                        </p>
                      )}
                    </div>
                    {canEdit && (
                      <Button type="button" size="sm" variant="outline" className="gap-1 self-end sm:self-auto" onClick={() => onUndo(p)}>
                        <Undo2 className="h-3.5 w-3.5" /> Desfazer
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Pagamentos desfeitos</h3>
          {reversals.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum pagamento desfeito.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {reversals.map((r) => (
                <li key={r.id} className="rounded-lg bg-muted/40 p-3 text-xs">
                  <p className="text-sm font-medium tabular-nums">
                    {formatCurrency(Number(r.amount))} pago em {formatDate(r.payment_date)}
                    <span className={`ml-2 rounded px-1.5 py-0.5 text-[11px] ${r.mode === "devolvido" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>
                      {r.mode === "devolvido" ? "Devolvido à conta" : "Sem devolução"}
                    </span>
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Desfeito em {formatDate(r.created_at.slice(0, 10))}
                    {r.account_name && (r.mode === "devolvido" ? ` · valor devolvido a ${r.account_name}` : ` · saldo de ${r.account_name} mantido`)}
                    {Number(r.discount_reverted) > 0 && ` · desconto de ${formatCurrency(Number(r.discount_reverted))} revertido`}
                    {Number(r.addition_reverted) > 0 && ` · acréscimo de ${formatCurrency(Number(r.addition_reverted))} revertido`}
                  </p>
                  {r.note && <p className="mt-1 text-muted-foreground">Motivo: {r.note}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
