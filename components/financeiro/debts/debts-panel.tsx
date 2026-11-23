"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AsyncConfirmDialog } from "@/components/shared/async-confirm-dialog";
import { MarkPaymentDialog } from "@/components/visionario/financeiro/mark-payment-dialog";
import { createDebtAction, deleteDebtPaymentAction, updateDebtAction, updateDebtPaymentAction } from "@/lib/supabase/debt-actions";
import { initializeFormerPartnerDebtAction } from "@/lib/supabase/financial-actions";
import { debtName, debtSummary, formatPercent, isDebtCharge, validateDebtPayment, validateDebtTotal } from "@/lib/finance/debts";
import { FORMER_PARTNER_DEBT_DESCRIPTION } from "@/lib/financial-calc";
import { PAYMENT_METHOD_LABEL } from "@/lib/finance-labels";
import { formatCurrency, formatDate, parseMoneyInput, todayKeySaoPaulo } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { FinancialAccount, FinancialCharge, FinancialPayment, FinancialPaymentMethod } from "@/types/database.types";
import type { FinancialScope } from "@/lib/space-slugs";

type Filter = "pendentes" | "quitadas" | "todas";
type Dialogs =
  | { type: "create" }
  | { type: "edit"; charge: FinancialCharge }
  | { type: "restore"; charge: FinancialCharge }
  | { type: "pay"; charge: FinancialCharge; remaining: number }
  | { type: "editPayment"; charge: FinancialCharge; payment: FinancialPayment; otherPaid: number }
  | { type: "deletePayment"; charge: FinancialCharge; payment: FinancialPayment }
  | null;

const moneyInput = (v: number) => v.toFixed(2).replace(".", ",");

/**
 * Dívidas — controle separado das despesas mensais (regra dos números em
 * lib/finance/debts.ts). Mesmo componente nos três financeiros.
 */
export function DebtsPanel({
  scope,
  charges,
  payments,
  accounts,
  permissions,
}: {
  scope: FinancialScope;
  charges: FinancialCharge[];
  payments: FinancialPayment[];
  accounts: FinancialAccount[];
  permissions: { canCreate: boolean; canEdit: boolean; canDelete: boolean };
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("pendentes");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [busy, startBusy] = useTransition();

  const debts = charges
    .filter((c) => isDebtCharge(c) && c.status !== "cancelado")
    .map((charge) => ({ charge, summary: debtSummary(charge, payments) }))
    .sort((a, b) => Number(a.summary.status === "quitada") - Number(b.summary.status === "quitada") || a.charge.due_date.localeCompare(b.charge.due_date));
  const counts = { pendentes: debts.filter((d) => d.summary.status === "pendente").length, quitadas: debts.filter((d) => d.summary.status === "quitada").length };
  const visible = debts.filter((d) => filter === "todas" || (filter === "pendentes" ? d.summary.status === "pendente" : d.summary.status === "quitada"));
  const hasFormerPartner = charges.some((c) => c.description.trim() === FORMER_PARTNER_DEBT_DESCRIPTION && c.kind === "saida");
  const refresh = () => router.refresh();

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-base font-semibold">Dívidas</p>
          <p className="text-xs text-muted-foreground">Controle separado das despesas mensais, com pagamentos parciais.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {scope === "visionario" && !hasFormerPartner && permissions.canCreate && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() =>
                startBusy(async () => {
                  const r = await initializeFormerPartnerDebtAction();
                  if (r.error) toast.error(r.error);
                  else { toast.success(r.success); refresh(); }
                })
              }
            >
              Cadastrar Ex-sócio G
            </Button>
          )}
          {permissions.canCreate && (
            <Button size="sm" onClick={() => setDialog({ type: "create" })}>
              <Plus className="h-4 w-4" /> Nova dívida
            </Button>
          )}
        </div>
      </div>

      {debts.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Filtrar dívidas">
          {([
            ["pendentes", `Pendentes (${counts.pendentes})`],
            ["quitadas", `Quitadas (${counts.quitadas})`],
            ["todas", `Todas (${debts.length})`],
          ] as [Filter, string][]).map(([value, label]) => (
            <Button key={value} type="button" size="sm" variant={filter === value ? "default" : "outline"} aria-pressed={filter === value} onClick={() => setFilter(value)}>
              {label}
            </Button>
          ))}
        </div>
      )}

      {debts.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Nenhuma dívida cadastrada.</p>
      ) : visible.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Nenhuma dívida {filter === "quitadas" ? "quitada" : "pendente"}.</p>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {visible.map(({ charge, summary }) => {
            const expanded = open[charge.id] ?? false;
            const quitada = summary.status === "quitada";
            return (
              <div key={charge.id} className="rounded-lg border border-border p-3 sm:p-4" data-testid="debt-card">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{debtName(charge.description)}</p>
                    <p className="text-xs text-muted-foreground">
                      Desde {formatDate(charge.due_date)}
                      {charge.supplier_name ? ` · credor: ${charge.supplier_name}` : ""}
                    </p>
                  </div>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", quitada ? "bg-success/15 text-success" : "bg-warning/15 text-warning")}>
                    {quitada ? "Quitada" : "Pendente"}
                  </span>
                </div>

                {summary.adjustment > 0 && (
                  <div className="mt-3 flex flex-col gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs sm:flex-row sm:items-center sm:justify-between">
                    <p className="flex gap-2">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                      <span>
                        Um pagamento parcial foi registrado com “Quitar” ligado e gravou {formatCurrency(Number(charge.discount_amount))} de desconto
                        {Number(charge.addition_amount) > 0 ? ` e ${formatCurrency(Number(charge.addition_amount))} de acréscimo` : ""}. Os valores abaixo já usam o valor original; restaure para registrar novos pagamentos.
                      </span>
                    </p>
                    {permissions.canEdit && (
                      <Button size="sm" variant="outline" className="shrink-0" onClick={() => setDialog({ type: "restore", charge })}>
                        Restaurar valor original
                      </Button>
                    )}
                  </div>
                )}

                <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {([
                    ["Total", formatCurrency(summary.total), ""],
                    ["Pago", formatCurrency(summary.paid), "text-success"],
                    ["Restante", formatCurrency(summary.remaining), ""],
                    ["Progresso", formatPercent(summary.percent), ""],
                  ] as const).map(([label, value, tone]) => (
                    <div key={label}>
                      <dt className="text-xs text-muted-foreground">{label}</dt>
                      <dd className={cn("font-semibold tabular-nums", tone)} data-testid={`debt-${label.toLowerCase()}`}>{value}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={summary.percent} aria-label={`Progresso de ${debtName(charge.description)}`}>
                  <div className="h-full bg-emerald-500 transition-all" style={{ width: `${summary.percent}%` }} />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {!quitada && permissions.canEdit && (
                    <Button size="sm" disabled={summary.adjustment > 0} title={summary.adjustment > 0 ? "Restaure o valor original primeiro" : undefined} onClick={() => setDialog({ type: "pay", charge, remaining: summary.remaining })}>
                      Registrar pagamento
                    </Button>
                  )}
                  {permissions.canEdit && (
                    <Button size="sm" variant="outline" onClick={() => setDialog({ type: "edit", charge })}>
                      <Pencil className="h-3.5 w-3.5" /> Editar dívida
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" aria-expanded={expanded} onClick={() => setOpen((o) => ({ ...o, [charge.id]: !expanded }))}>
                    {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />} Histórico ({summary.payments.length})
                  </Button>
                </div>

                {expanded && (
                  summary.payments.length === 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground">Nenhum pagamento registrado.</p>
                  ) : (
                    <ul className="mt-2 divide-y divide-border">
                      {summary.payments.map((p) => (
                        <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                          <div className="min-w-0">
                            <p className="font-medium tabular-nums">{formatCurrency(Number(p.amount))} <span className="font-normal text-muted-foreground">· {formatDate(p.payment_date)} · {PAYMENT_METHOD_LABEL[p.payment_method] ?? p.payment_method}</span></p>
                            {p.notes && <p className="whitespace-pre-line break-words text-xs text-muted-foreground">{p.notes}</p>}
                          </div>
                          {permissions.canEdit && (
                            <div className="flex shrink-0 gap-1">
                              <Button size="icon" variant="ghost" aria-label="Editar pagamento" onClick={() => setDialog({ type: "editPayment", charge, payment: p, otherPaid: Math.round((summary.paid - Number(p.amount)) * 100) / 100 })}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button size="icon" variant="ghost" aria-label="Excluir pagamento" onClick={() => setDialog({ type: "deletePayment", charge, payment: p })}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}

      {dialog?.type === "create" && <DebtFormDialog scope={scope} onClose={() => setDialog(null)} onSaved={refresh} />}
      {dialog?.type === "edit" && (
        <DebtFormDialog scope={scope} charge={dialog.charge} paid={debtSummary(dialog.charge, payments).paid} onClose={() => setDialog(null)} onSaved={refresh} />
      )}
      {dialog?.type === "restore" && (
        <AsyncConfirmDialog
          open
          destructive={false}
          onOpenChange={(o) => !o && setDialog(null)}
          title={`Restaurar o valor original de ${debtName(dialog.charge.description)}?`}
          description={`O total volta a ser ${formatCurrency(Number(dialog.charge.original_amount))} e o desconto/acréscimo gravado é removido. Os pagamentos registrados continuam exatamente como estão.`}
          confirmLabel="Restaurar"
          onConfirm={async () => {
            const r = await updateDebtAction(scope, dialog.charge.id, { name: debtName(dialog.charge.description), originalAmount: Number(dialog.charge.original_amount) });
            if (!r.error) refresh();
            return r;
          }}
        />
      )}
      {dialog?.type === "pay" && (
        <MarkPaymentDialog scope={scope} charge={dialog.charge} remaining={dialog.remaining} accounts={accounts} onOpenChange={(o) => !o && setDialog(null)} onSaved={() => { setDialog(null); refresh(); }} />
      )}
      {dialog?.type === "editPayment" && (
        <PaymentEditDialog scope={scope} charge={dialog.charge} payment={dialog.payment} otherPaid={dialog.otherPaid} onClose={() => setDialog(null)} onSaved={refresh} />
      )}
      {dialog?.type === "deletePayment" && (
        <AsyncConfirmDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          title="Excluir este pagamento?"
          description={`${formatCurrency(Number(dialog.payment.amount))} de ${formatDate(dialog.payment.payment_date)} sai da dívida ${debtName(dialog.charge.description)} e o saldo restante aumenta. Se o pagamento saiu de uma conta, o valor volta para ela. O registro fica no histórico do banco.`}
          confirmLabel="Excluir pagamento"
          onConfirm={async () => {
            const r = await deleteDebtPaymentAction(scope, dialog.charge.id, dialog.payment.id);
            if (!r.error) refresh();
            return r;
          }}
        />
      )}
    </Card>
  );
}

function DebtFormDialog({
  scope,
  charge,
  paid = 0,
  onClose,
  onSaved,
}: {
  scope: FinancialScope;
  charge?: FinancialCharge;
  paid?: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = !!charge;
  const [name, setName] = useState(charge ? debtName(charge.description) : "");
  const [amount, setAmount] = useState(charge ? moneyInput(Number(charge.original_amount)) : "");
  const [startDate, setStartDate] = useState(todayKeySaoPaulo());
  const [creditor, setCreditor] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = parseMoneyInput(amount);
    if (!name.trim()) return toast.error("Informe o nome da dívida.");
    const err = validateDebtTotal(value, paid);
    if (err) return toast.error(err);
    startTransition(async () => {
      const r = editing
        ? await updateDebtAction(scope, charge.id, { name, originalAmount: value })
        : await createDebtAction(scope, { name, originalAmount: value, startDate, creditor, notes });
      if (r.error) return void toast.error(r.error);
      toast.success(r.success);
      onClose();
      onSaved();
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !pending && !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar dívida" : "Nova dívida"}</DialogTitle>
          <DialogDescription>
            {editing ? `Já pago: ${formatCurrency(paid)}. O valor original não pode ficar abaixo disso.` : "A dívida fica fora de “A pagar”; cada pagamento parcial é registrado nela."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="debt-name">Nome</Label>
            <Input id="debt-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Ex-sócio G" disabled={pending} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="debt-amount">Valor original</Label>
            <Input id="debt-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1.000,00" disabled={pending} />
          </div>
          {!editing && (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="debt-date">Data da dívida</Label>
                  <Input id="debt-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={pending} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="debt-creditor">Credor (opcional)</Label>
                  <Input id="debt-creditor" value={creditor} onChange={(e) => setCreditor(e.target.value)} disabled={pending} />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="debt-notes">Observações (opcional)</Label>
                <Input id="debt-notes" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={pending} />
              </div>
            </>
          )}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>Cancelar</Button>
            <Button type="submit" disabled={pending}>{pending ? "Salvando…" : editing ? "Salvar" : "Cadastrar dívida"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PaymentEditDialog({
  scope,
  charge,
  payment,
  otherPaid,
  onClose,
  onSaved,
}: {
  scope: FinancialScope;
  charge: FinancialCharge;
  payment: FinancialPayment;
  otherPaid: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(moneyInput(Number(payment.amount)));
  const [date, setDate] = useState(payment.payment_date);
  const [method, setMethod] = useState<FinancialPaymentMethod>(payment.payment_method);
  const [notes, setNotes] = useState(payment.notes ?? "");
  const [pending, startTransition] = useTransition();
  const total = Number(charge.original_amount);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = parseMoneyInput(amount);
    const err = validateDebtPayment(total, otherPaid, value);
    if (err) return toast.error(err);
    startTransition(async () => {
      const r = await updateDebtPaymentAction(scope, charge.id, payment.id, { amount: value, paymentDate: date, paymentMethod: method, notes });
      if (r.error) return void toast.error(r.error);
      toast.success(r.success);
      onClose();
      onSaved();
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !pending && !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar pagamento</DialogTitle>
          <DialogDescription>
            {debtName(charge.description)} · máximo {formatCurrency(Math.max(0, Math.round((total - otherPaid) * 100) / 100))} (saldo sem este pagamento).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="debt-pay-amount">Valor</Label>
              <Input id="debt-pay-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={pending} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="debt-pay-date">Data do pagamento</Label>
              <Input id="debt-pay-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={pending} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Forma de pagamento</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as FinancialPaymentMethod)} disabled={pending}>
              <SelectTrigger aria-label="Forma de pagamento"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(PAYMENT_METHOD_LABEL) as FinancialPaymentMethod[]).map((m) => (
                  <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="debt-pay-notes">Observação</Label>
            <Input id="debt-pay-notes" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={pending} placeholder="Opcional" />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>Cancelar</Button>
            <Button type="submit" disabled={pending}>{pending ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
