"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, CreditCard, ListOrdered, Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/shared/status-badge";
import { ValueModeToggle } from "@/components/financeiro/installments/installment-fields";
import { convertOriginToCardAction, replanInstallmentsAction, rescheduleInstallmentsAction } from "@/lib/supabase/installment-actions";
import {
  installmentState,
  installmentSummary,
  planReplan,
  planReschedule,
  type ExistingInstallment,
  type InstallmentValueMode,
  type RescheduleMode,
} from "@/lib/finance/installments";
import { cardLabel, monthKeyOf, shiftMonth, type CreditCard as Card } from "@/lib/finance/credit-card";
import { formatCurrency, formatDate, parseMoneyInput, todayKeySaoPaulo } from "@/lib/format";
import type { FinancialCharge, FinancialPayment } from "@/types/database.types";
import type { FinancialScope } from "@/lib/space-slugs";
import { cn } from "@/lib/utils";

/** Parcelas de uma origem (com quanto já foi pago em cada uma) — base dos diálogos abaixo. */
export function installmentsOf(originId: string, charges: FinancialCharge[], payments: FinancialPayment[]): ExistingInstallment[] {
  const paid = new Map<string, number>();
  for (const p of payments) paid.set(p.charge_id, Math.round(((paid.get(p.charge_id) ?? 0) + Number(p.amount)) * 100) / 100);
  return charges
    .filter((c) => c.origin_id === originId)
    .map((c, i) => ({ id: c.id, number: c.installment_number ?? i + 1, dueDate: c.due_date, amount: Number(c.amount), paid: paid.get(c.id) ?? 0, cancelled: c.status === "cancelado" }))
    .sort((a, b) => a.number - b.number || Number(a.cancelled) - Number(b.cancelled));
}

const STATE_LABEL = { paga: "Paga", parcial: "Parcial", pendente: "Pendente", cancelada: "Cancelada" } as const;
const STATE_BADGE = { paga: "pago", parcial: "parcial", pendente: "pendente", cancelada: "cancelado" } as const;

/** "Alterar vencimento": somente esta parcela ou esta e as próximas, com prévia antes de salvar. */
export function RescheduleInstallmentDialog({
  scope,
  charge,
  installments,
  onOpenChange,
}: {
  scope: FinancialScope;
  charge: FinancialCharge;
  installments: ExistingInstallment[];
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [date, setDate] = useState(charge.due_date);
  const [mode, setMode] = useState<RescheduleMode>("seguintes");
  const [pending, setPending] = useState(false);
  const isInstallment = !!charge.installment_number;
  const effectiveMode: RescheduleMode = isInstallment ? mode : "somente";
  const plan = useMemo(() => planReschedule(installments, charge.id, date, effectiveMode), [installments, charge.id, date, effectiveMode]);

  async function submit() {
    if (plan.error) return toast.error(plan.error);
    setPending(true);
    const r = await rescheduleInstallmentsAction(scope, charge.id, date, effectiveMode);
    setPending(false);
    if (r.error) return toast.error(r.error);
    toast.success(r.success ?? "Vencimento alterado.");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Alterar vencimento</DialogTitle>
          <DialogDescription>{charge.description} · hoje vence em {formatDate(charge.due_date)}. Só muda a data: valores, pagamentos e saldos ficam iguais.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="resched-date">Novo vencimento</Label>
            <Input id="resched-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={pending} />
          </div>
          {isInstallment && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Aplicar a">
              {([
                ["somente", "Somente esta parcela", "Altera só a parcela selecionada."],
                ["seguintes", "Esta parcela e as próximas", "Reorganiza os vencimentos seguintes a partir da nova data."],
              ] as const).map(([value, label, hint]) => (
                <button key={value} type="button" role="radio" aria-checked={mode === value} onClick={() => setMode(value)} disabled={pending}
                  className={cn("rounded-lg border p-3 text-left text-sm transition-colors", mode === value ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50")}>
                  <span className="font-medium text-foreground">{label}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
                </button>
              ))}
            </div>
          )}
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
            <p className="mb-1.5 font-medium text-foreground">Prévia</p>
            {plan.error ? <p className="text-destructive">{plan.error}</p>
              : plan.changes.length === 0 ? <p className="text-muted-foreground">Nenhum vencimento muda.</p>
              : <ul className="flex flex-col gap-1">{plan.changes.map((c) => (
                  <li key={c.id} className="flex justify-between gap-2 tabular-nums"><span>Parcela {c.number}</span><span className="text-muted-foreground line-through">{formatDate(c.from)}</span><span className="font-medium text-foreground">{formatDate(c.to)}</span></li>
                ))}</ul>}
            {installments.some((i) => installmentState(i) === "paga") && <p className="mt-2 text-muted-foreground">Parcelas já pagas não mudam.</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancelar</Button>
          <Button onClick={submit} disabled={pending || !!plan.error || plan.changes.length === 0}>{pending ? "Salvando…" : "Salvar vencimento"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Painel do parcelamento: totais, parcelas, histórico de pagamentos e a
 * edição completa (quantidade, valor total/por parcela, vencimentos) com
 * prévia. Também converte as parcelas pendentes em compra no cartão.
 */
export function InstallmentPlanDialog({
  scope,
  originId,
  charges,
  payments,
  cards = [],
  canEdit,
  onReschedule,
  onOpenChange,
}: {
  scope: FinancialScope;
  originId: string;
  charges: FinancialCharge[];
  payments: FinancialPayment[];
  cards?: Card[];
  canEdit: boolean;
  onReschedule: (charge: FinancialCharge) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const today = todayKeySaoPaulo();
  const own = useMemo(() => charges.filter((c) => c.origin_id === originId), [charges, originId]);
  const items = useMemo(() => installmentsOf(originId, charges, payments), [originId, charges, payments]);
  const active = items.filter((i) => !i.cancelled);
  const summary = installmentSummary(items, today);
  const chargeById = new Map(own.map((c) => [c.id, c]));
  const title = (own[0]?.description ?? "Parcelamento").replace(/\s*\(\d+\/\d+\)\s*$/, "");
  const history = payments.filter((p) => chargeById.has(p.charge_id)).sort((a, b) => b.payment_date.localeCompare(a.payment_date));

  const [editing, setEditing] = useState(false);
  const firstMovable = active.find((i) => installmentState(i) !== "paga");
  const [count, setCount] = useState(String(active.length || 1));
  const [mode, setMode] = useState<InstallmentValueMode>("total");
  const [amount, setAmount] = useState(summary.total.toFixed(2).replace(".", ","));
  const [firstDue, setFirstDue] = useState(firstMovable?.dueDate ?? today);
  const [pending, setPending] = useState(false);
  const [converting, setConverting] = useState(false);
  const activeCards = cards.filter((c) => c.status === "ativo");
  const [cardId, setCardId] = useState(activeCards[0]?.id ?? "");
  const [cardMonth, setCardMonth] = useState(shiftMonth(monthKeyOf(today), 1).slice(0, 7));

  const replan = useMemo(
    () => (editing ? planReplan(items, { count: parseInt(count, 10) || 0, mode, amount: parseMoneyInput(amount), firstPendingDue: firstDue }) : null),
    [editing, items, count, mode, amount, firstDue]
  );
  const changed = replan && !replan.error ? replan.rows.filter((r) => r.action !== "mantida") : [];

  async function save() {
    if (!replan || replan.error) return toast.error(replan?.error ?? "Revise os dados.");
    setPending(true);
    const r = await replanInstallmentsAction(scope, originId, { count: parseInt(count, 10), mode, amount: parseMoneyInput(amount), firstPendingDue: firstDue });
    setPending(false);
    if (r.error) return toast.error(r.error);
    toast.success(r.success ?? "Parcelamento atualizado.");
    setEditing(false);
    router.refresh();
  }

  async function convert() {
    if (!cardId) return toast.error("Escolha o cartão.");
    setPending(true);
    const r = await convertOriginToCardAction(originId, cardId, `${cardMonth}-01`);
    setPending(false);
    if (r.error) return toast.error(r.error);
    toast.success(r.success);
    onOpenChange(false);
    router.refresh();
  }

  const isOrigin = own[0]?.installment_number != null;
  const pendingUnpaid = active.filter((i) => i.paid === 0);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ListOrdered className="h-5 w-5" aria-hidden /> {title}</DialogTitle>
          <DialogDescription>Painel do parcelamento — editar aqui nunca apaga parcelas pagas, não altera pagamentos e não mexe em saldos.</DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {([
              ["Valor contratado", formatCurrency(summary.total)],
              ["Total pago", formatCurrency(summary.paid)],
              ["Saldo restante", formatCurrency(summary.remaining)],
              ["Parcelas pagas", `${summary.paidCount} de ${summary.count}`],
              ["Pendentes", String(summary.pendingCount)],
              ["Próximo vencimento", summary.nextDue ? formatDate(summary.nextDue) : "—"],
              ["Último vencimento", summary.lastDue ? formatDate(summary.lastDue) : "—"],
              ["Atrasadas", String(summary.overdueCount)],
            ] as const).map(([label, value]) => (
              <div key={label} className="rounded-lg border border-border bg-card p-2">
                <dt className="text-[11px] text-muted-foreground">{label}</dt>
                <dd className="text-sm font-semibold tabular-nums text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden><div className="h-full bg-success" style={{ width: `${summary.total > 0 ? Math.min(100, (summary.paid / summary.total) * 100) : 0}%` }} /></div>

          {canEdit && isOrigin && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={editing ? "default" : "outline"} onClick={() => setEditing((v) => !v)}><Pencil className="h-4 w-4" /> Editar parcelamento completo</Button>
              {activeCards.length > 0 && pendingUnpaid.length > 0 && (
                <Button size="sm" variant={converting ? "default" : "outline"} onClick={() => setConverting((v) => !v)}><CreditCard className="h-4 w-4" /> Converter em compra no cartão</Button>
              )}
            </div>
          )}

          {editing && (
            <div className="flex flex-col gap-3 rounded-lg border border-primary/40 p-3">
              <ValueModeToggle mode={mode} onChange={(m) => { setMode(m); setAmount(m === "total" ? summary.total.toFixed(2).replace(".", ",") : String(firstMovable?.amount ?? "").replace(".", ",")); }} disabled={pending} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="replan-count">Quantidade de parcelas</Label>
                  <Input id="replan-count" type="number" inputMode="numeric" min={1} max={120} value={count} onChange={(e) => setCount(e.target.value)} disabled={pending} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="replan-amount">{mode === "total" ? "Novo valor total" : "Valor de cada parcela pendente"}</Label>
                  <Input id="replan-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={pending} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="replan-due">Vencimento da próxima parcela</Label>
                  <Input id="replan-due" type="date" value={firstDue} onChange={(e) => setFirstDue(e.target.value)} disabled={pending} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {summary.paidCount > 0 || active.some((i) => i.paid > 0)
                  ? "Parcelas com pagamento mantêm o valor (e as quitadas, a data). O restante é redistribuído nas pendentes, com centavos exatos."
                  : "Nenhuma parcela paga: todas podem ser reorganizadas."}
              </p>
              {replan?.error ? <p className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">{replan.error}</p> : replan && (
                <div className="rounded-lg border border-border bg-muted/30 p-2 text-xs">
                  <p className="mb-1 font-medium text-foreground">Prévia: {replan.rows.filter((r) => r.action !== "removida").length} parcelas · total {formatCurrency(replan.total)}{changed.length === 0 ? " · nada muda" : ` · ${changed.length} alteração(ões)`}</p>
                  <ol className="max-h-56 divide-y divide-border overflow-y-auto">
                    {replan.rows.map((r) => (
                      <li key={`${r.number}-${r.action}`} className={cn("grid grid-cols-[3.5rem_1fr_1fr_auto] items-center gap-2 py-1 tabular-nums", r.action === "removida" && "text-muted-foreground line-through")}>
                        <span>{r.number}</span>
                        <span>{r.fromDue && r.fromDue !== r.toDue ? <><span className="text-muted-foreground line-through">{formatDate(r.fromDue)}</span> → </> : null}{formatDate(r.toDue)}</span>
                        <span>{r.fromAmount !== undefined && r.fromAmount !== r.toAmount && r.action !== "removida" ? <><span className="text-muted-foreground line-through">{formatCurrency(r.fromAmount)}</span> → </> : null}{formatCurrency(r.action === "removida" ? r.fromAmount ?? 0 : r.toAmount)}</span>
                        <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", r.action === "nova" && "bg-success/15 text-success", r.action === "removida" && "bg-destructive/10 text-destructive", r.action === "alterada" && "bg-warning/15 text-warning", r.action === "reativada" && "bg-primary/10 text-primary", r.action === "mantida" && "bg-muted text-muted-foreground")}>
                          {r.action === "removida" ? "remover" : r.action}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={pending}>Cancelar</Button>
                <Button size="sm" onClick={save} disabled={pending || !replan || !!replan.error || changed.length === 0}>{pending ? "Salvando…" : "Salvar parcelamento"}</Button>
              </div>
            </div>
          )}

          {converting && (
            <div className="flex flex-col gap-3 rounded-lg border border-primary/40 p-3">
              <p className="text-sm text-foreground">As {pendingUnpaid.length} parcela(s) sem pagamento ({formatCurrency(pendingUnpaid.reduce((s, i) => s + i.amount, 0))}) saem de A pagar e entram nas faturas do cartão — nada é duplicado. Parcelas com pagamento continuam como estão.</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label>Cartão</Label>
                  <Select value={cardId} onValueChange={setCardId}><SelectTrigger aria-label="Cartão"><SelectValue placeholder="Escolha o cartão" /></SelectTrigger>
                    <SelectContent>{activeCards.map((c) => <SelectItem key={c.id} value={c.id}>{cardLabel(c)}</SelectItem>)}</SelectContent></Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="convert-month">Primeira fatura</Label>
                  <Input id="convert-month" type="month" value={cardMonth} onChange={(e) => setCardMonth(e.target.value)} />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setConverting(false)} disabled={pending}>Cancelar</Button>
                <Button size="sm" onClick={convert} disabled={pending}>Confirmar conversão</Button>
              </div>
            </div>
          )}

          <div>
            <p className="mb-2 text-sm font-medium text-foreground">Todas as parcelas</p>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {items.map((i) => {
                const state = installmentState(i);
                const charge = chargeById.get(i.id)!;
                return (
                  <li key={i.id} className={cn("flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm", i.cancelled && "opacity-60")}>
                    <span className="min-w-16 font-medium tabular-nums">{i.number}/{charge.installment_total ?? items.length}</span>
                    <span className={cn("tabular-nums", state !== "paga" && !i.cancelled && i.dueDate < today && "text-destructive")}>{formatDate(i.dueDate)}</span>
                    <span className="tabular-nums">{formatCurrency(i.amount)}{state === "parcial" && <span className="text-xs text-warning"> · pago {formatCurrency(i.paid)}</span>}</span>
                    <span className="flex items-center gap-1">
                      <StatusBadge status={STATE_BADGE[state]} label={STATE_LABEL[state]} />
                      {canEdit && !i.cancelled && state !== "paga" && (
                        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Alterar vencimento da parcela ${i.number}`} onClick={() => onReschedule(charge)}>
                          <CalendarClock className="h-4 w-4" />
                        </Button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-foreground">Histórico de pagamentos</p>
            {history.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum pagamento registrado.</p> : (
              <ul className="divide-y divide-border rounded-lg border border-border text-sm">
                {history.map((p) => (
                  <li key={p.id} className="flex justify-between gap-2 px-3 py-2">
                    <span>{formatDate(p.payment_date)} · parcela {chargeById.get(p.charge_id)?.installment_number ?? "—"}{p.notes ? ` · ${p.notes}` : ""}</span>
                    <span className="font-medium tabular-nums">{formatCurrency(Number(p.amount))}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
