"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CheckCircle2, ChevronDown, Pencil, PlayCircle, Repeat, StopCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AsyncConfirmDialog } from "@/components/shared/async-confirm-dialog";
import { MarkPaymentDialog } from "@/components/visionario/financeiro/mark-payment-dialog";
import { chargeStatus, remainingAmount } from "@/lib/financial-calc";
import { FREQUENCY_LABEL } from "@/lib/finance-labels";
import { resumeRecurrenceAction, stopRecurrenceAction, updateRecurrenceAction } from "@/lib/supabase/financial-actions";
import { formatCurrency, formatDate, formatMonthYear, parseMoneyInput, todayKeySaoPaulo } from "@/lib/format";
import { nextOccurrence, parseDateKey } from "@/lib/recurrence";
import { cn } from "@/lib/utils";
import type {
  FinancialAccount,
  FinancialCategory,
  FinancialCharge,
  FinancialKind,
  FinancialOrigin,
  FinancialPayment,
  FinancialRecurrenceFrequency,
} from "@/types/database.types";
import type { FinancialScope } from "@/lib/space-slugs";

type RecurrenceRow = {
  origin: FinancialOrigin;
  amount: number;
  dueDay: number | null;
  scheduleLabel: string;
  overdue: FinancialCharge[];
  nextOpen: FinancialCharge | null;
  nextDue: string | null;
  lastPaid: FinancialCharge | null;
};

function scheduleLabel(origin: FinancialOrigin, dueDay: number | null): string {
  const freq = origin.recurrence_frequency ?? "mensal";
  if (freq === "semanal") return "Semanal";
  if (freq === "a_cada_x_meses" || freq === "customizado") {
    return `A cada ${origin.recurrence_interval ?? 1} meses${dueDay ? ` • dia ${dueDay}` : ""}`;
  }
  return `${FREQUENCY_LABEL[freq]}${dueDay ? ` • Todo dia ${dueDay}` : ""}`;
}

/**
 * Recorrências (assinaturas/despesas fixas e receitas fixas) de um tipo.
 * A RECORRÊNCIA é a `financial_origin`; cada vencimento é uma cobrança
 * própria (competência) — "Marcar pago" age sempre sobre UMA competência:
 * a atrasada mais antiga ou, sem atraso, a próxima em aberto.
 */
export function RecurrencesPanel({
  scope,
  kind,
  origins,
  charges,
  payments,
  accounts,
  categories,
  permissions,
}: {
  scope: FinancialScope;
  kind: FinancialKind;
  origins: FinancialOrigin[];
  charges: FinancialCharge[];
  payments: FinancialPayment[];
  accounts: FinancialAccount[];
  categories: FinancialCategory[];
  permissions: { canEdit: boolean };
}) {
  const [showCancelled, setShowCancelled] = useState(false);
  const [paying, setPaying] = useState<FinancialCharge | null>(null);
  const [editing, setEditing] = useState<RecurrenceRow | null>(null);
  const [confirm, setConfirm] = useState<{ type: "stop" | "resume"; row: RecurrenceRow } | null>(null);
  const today = todayKeySaoPaulo();

  const rows = useMemo(() => {
    const byOrigin = new Map<string, FinancialCharge[]>();
    for (const c of charges) {
      const list = byOrigin.get(c.origin_id) ?? [];
      list.push(c);
      byOrigin.set(c.origin_id, list);
    }
    return origins
      .filter((o) => o.kind === kind && o.origin_type === "recorrente")
      .map((origin): RecurrenceRow => {
        const all = (byOrigin.get(origin.id) ?? []).sort((a, b) => a.due_date.localeCompare(b.due_date));
        const active = all.filter((c) => c.status !== "cancelado");
        const open = active.filter((c) => chargeStatus(c, payments) !== "pago");
        const paid = active.filter((c) => chargeStatus(c, payments) === "pago");
        const dueDay = origin.recurrence_frequency === "semanal" ? null : origin.recurrence_day ?? (all[0] ? parseDateKey(all[0].due_date).d : null);
        const nextOpen = open.find((c) => c.due_date >= today) ?? null;
        const last = all[all.length - 1];
        // Próxima competência ainda não gerada (fora do horizonte) — só calculada, nunca gravada.
        const computedNext =
          !nextOpen && origin.is_active && last
            ? (() => {
                let next = last.due_date;
                for (let g = 0; g < 2000 && next < today; g++) {
                  next = nextOccurrence(next, origin.recurrence_frequency ?? "mensal", origin.recurrence_interval, dueDay ?? undefined);
                }
                return next === last.due_date && chargeStatus(last, payments) === "pago"
                  ? nextOccurrence(next, origin.recurrence_frequency ?? "mensal", origin.recurrence_interval, dueDay ?? undefined)
                  : next;
              })()
            : null;
        return {
          origin,
          amount: Number(origin.recurrence_amount ?? last?.original_amount ?? 0),
          dueDay,
          scheduleLabel: scheduleLabel(origin, dueDay),
          overdue: open.filter((c) => c.due_date < today),
          nextOpen,
          nextDue: nextOpen?.due_date ?? computedNext,
          lastPaid: paid[paid.length - 1] ?? null,
        };
      })
      .sort((a, b) => Number(b.origin.is_active) - Number(a.origin.is_active) || (a.nextDue ?? "9999").localeCompare(b.nextDue ?? "9999"));
  }, [origins, charges, payments, kind, today]);

  const activeRows = rows.filter((r) => r.origin.is_active);
  const cancelledRows = rows.filter((r) => !r.origin.is_active);
  if (rows.length === 0) return null;

  const monthlyTotal = activeRows
    .filter((r) => (r.origin.recurrence_frequency ?? "mensal") === "mensal")
    .reduce((s, r) => s + r.amount, 0);
  const isEntrada = kind === "entrada";
  const visible = showCancelled ? rows : activeRows;

  return (
    <section aria-labelledby={`rec-${kind}`} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`rec-${kind}`} className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Repeat className="h-3.5 w-3.5" aria-hidden /> Recorrências {isEntrada ? "a receber" : "a pagar"} · {activeRows.length} ativa(s)
        </h2>
        {monthlyTotal > 0 && (
          <p className="text-xs text-muted-foreground">
            Mensais: <span className="font-medium text-foreground">{formatCurrency(monthlyTotal)}/mês</span>
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((row) => {
          const { origin } = row;
          const payTarget = row.overdue[0] ?? row.nextOpen;
          const contract = !!origin.client_service_id;
          return (
            <Card key={origin.id} className={cn("flex flex-col gap-2 p-3", !origin.is_active && "border-dashed opacity-70")}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{origin.description}</p>
                  <p className="text-xs text-muted-foreground">{row.scheduleLabel}</p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{formatCurrency(row.amount)}</span>
              </div>

              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                {row.overdue.length > 0 && (
                  <>
                    <dt className="text-destructive">Atrasado</dt>
                    <dd className="text-right text-destructive">
                      Venceu {formatDate(row.overdue[0].due_date)}
                      {row.overdue.length > 1 && ` (+${row.overdue.length - 1})`}
                    </dd>
                  </>
                )}
                {row.lastPaid && (
                  <>
                    <dt className="text-muted-foreground">Último {isEntrada ? "recebido" : "pago"}</dt>
                    <dd className="text-right text-success">
                      {formatMonthYear(row.lastPaid.competency_date ?? row.lastPaid.due_date)}
                    </dd>
                  </>
                )}
                {origin.is_active && row.nextDue && (
                  <>
                    <dt className="text-muted-foreground">Próximo vencimento</dt>
                    <dd className="text-right text-foreground">{formatDate(row.nextDue)}</dd>
                  </>
                )}
                <dt className="text-muted-foreground">Recorrência</dt>
                <dd className={cn("text-right font-medium", origin.is_active ? "text-primary" : "text-muted-foreground")}>
                  {origin.is_active ? "Ativa" : "Cancelada"}
                  {origin.is_active && origin.recurrence_end_type === "em_data" && origin.recurrence_end_date &&
                    ` · até ${formatDate(origin.recurrence_end_date)}`}
                </dd>
              </dl>

              {permissions.canEdit && (
                <div className="mt-1 flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
                  {payTarget && (
                    <Button size="sm" variant="outline" className="h-8" onClick={() => setPaying(payTarget)}>
                      <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden />
                      Marcar {isEntrada ? "recebido" : "pago"}
                      <span className="text-xs text-muted-foreground">· {formatMonthYear(payTarget.competency_date ?? payTarget.due_date).split(" ")[0]}</span>
                    </Button>
                  )}
                  {contract ? (
                    origin.client_id && (
                      <Link href={`/visionario/clientes/${origin.client_id}`} className="ml-auto text-xs text-primary hover:underline">
                        Gerenciar no cliente
                      </Link>
                    )
                  ) : (
                    <div className="ml-auto flex items-center gap-1">
                      {origin.is_active && (
                        <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditing(row)}>
                          <Pencil className="h-3.5 w-3.5" aria-hidden /> Editar
                        </Button>
                      )}
                      {origin.is_active ? (
                        <Button size="sm" variant="ghost" className="h-8 text-destructive hover:text-destructive" onClick={() => setConfirm({ type: "stop", row })}>
                          <StopCircle className="h-3.5 w-3.5" aria-hidden /> Cancelar
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" className="h-8" onClick={() => setConfirm({ type: "resume", row })}>
                          <PlayCircle className="h-3.5 w-3.5" aria-hidden /> Reativar
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {cancelledRows.length > 0 && (
        <button
          type="button"
          onClick={() => setShowCancelled((v) => !v)}
          className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          aria-expanded={showCancelled}
        >
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showCancelled && "rotate-180")} aria-hidden />
          {showCancelled ? "Ocultar canceladas" : `Mostrar canceladas (${cancelledRows.length})`}
        </button>
      )}

      {paying && (
        <MarkPaymentDialog
          scope={scope}
          charge={paying}
          remaining={remainingAmount(paying, payments)}
          accounts={accounts}
          onOpenChange={(open) => !open && setPaying(null)}
        />
      )}
      {editing && (
        <RecurrenceEditDialog scope={scope} row={editing} categories={categories.filter((c) => c.kind === kind)} onClose={() => setEditing(null)} />
      )}
      {confirm && (
        <AsyncConfirmDialog
          open
          onOpenChange={(open) => !open && setConfirm(null)}
          title={confirm.type === "stop" ? `Cancelar a recorrência "${confirm.row.origin.description}"?` : `Reativar "${confirm.row.origin.description}"?`}
          description={
            confirm.type === "stop"
              ? "Para de gerar novos vencimentos e remove os futuros ainda não pagos. Pagamentos e competências anteriores (inclusive atrasadas) continuam no histórico."
              : "Volta a gerar vencimentos a partir da próxima competência. Os meses em que ficou cancelada não são cobrados."
          }
          confirmLabel={confirm.type === "stop" ? "Cancelar recorrência" : "Reativar"}
          destructive={confirm.type === "stop"}
          onConfirm={() =>
            confirm.type === "stop" ? stopRecurrenceAction(scope, confirm.row.origin.id) : resumeRecurrenceAction(scope, confirm.row.origin.id)
          }
        />
      )}
    </section>
  );
}

const NONE = "__nenhuma__";

function RecurrenceEditDialog({
  scope,
  row,
  categories,
  onClose,
}: {
  scope: FinancialScope;
  row: RecurrenceRow;
  categories: FinancialCategory[];
  onClose: () => void;
}) {
  const { origin } = row;
  const [description, setDescription] = useState(origin.description);
  const [amount, setAmount] = useState(row.amount.toFixed(2).replace(".", ","));
  const [frequency, setFrequency] = useState<FinancialRecurrenceFrequency>(origin.recurrence_frequency ?? "mensal");
  const [interval, setIntervalValue] = useState(String(origin.recurrence_interval ?? 2));
  const [dueDay, setDueDay] = useState(String(row.dueDay ?? 10));
  const [categoryId, setCategoryId] = useState(origin.category_id ?? "");
  const [notes, setNotes] = useState(origin.notes ?? "");
  const [hasEnd, setHasEnd] = useState(origin.recurrence_end_type === "em_data" && !!origin.recurrence_end_date);
  const [endDate, setEndDate] = useState(origin.recurrence_end_date ?? "");
  const [pending, setPending] = useState(false);

  const selectableCategories = categories.filter((c) => c.is_active || c.id === origin.category_id);
  const needsInterval = frequency === "a_cada_x_meses" || frequency === "customizado";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = parseMoneyInput(amount);
    if (!description.trim()) return toast.error("Informe a descrição.");
    if (!Number.isFinite(value) || value <= 0) return toast.error("Informe um valor válido.");
    if (frequency !== "semanal" && !(Number(dueDay) >= 1 && Number(dueDay) <= 31)) return toast.error("Dia precisa ser entre 1 e 31.");
    if (hasEnd && !endDate) return toast.error("Informe a data de término ou desmarque a opção.");

    setPending(true);
    const result = await updateRecurrenceAction(scope, origin.id, {
      description,
      amount: value,
      frequency,
      interval: needsInterval ? Math.max(1, parseInt(interval, 10) || 1) : null,
      dueDay: frequency === "semanal" ? null : Number(dueDay),
      categoryId: categoryId || null,
      notes: notes || null,
      endDate: hasEnd ? endDate : null,
    });
    setPending(false);
    if (result.error) return toast.error(result.error);
    toast.success(result.success ?? "Recorrência atualizada.");
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar recorrência</DialogTitle>
          <DialogDescription>
            Vale para as próximas competências. Pagamentos já registrados e vencimentos passados não mudam.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex max-h-[75vh] flex-col gap-3 overflow-y-auto pr-1">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rec-desc">Descrição</Label>
            <Input id="rec-desc" value={description} onChange={(e) => setDescription(e.target.value)} disabled={pending} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rec-amount">Valor</Label>
              <Input id="rec-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={pending} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Repete</Label>
              <Select value={frequency} onValueChange={(v) => setFrequency(v as FinancialRecurrenceFrequency)} disabled={pending}>
                <SelectTrigger aria-label="Repete"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(FREQUENCY_LABEL) as FinancialRecurrenceFrequency[]).map((f) => (
                    <SelectItem key={f} value={f}>{f === "mensal" ? "Mensalmente" : FREQUENCY_LABEL[f]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {frequency !== "semanal" && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rec-day">Vence todo dia</Label>
                <Input id="rec-day" type="number" min={1} max={31} value={dueDay} onChange={(e) => setDueDay(e.target.value)} disabled={pending} />
              </div>
            )}
            {needsInterval && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rec-interval">A cada (meses)</Label>
                <Input id="rec-interval" type="number" min={1} value={interval} onChange={(e) => setIntervalValue(e.target.value)} disabled={pending} />
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Categoria</Label>
            <Select value={categoryId || NONE} onValueChange={(v) => setCategoryId(v === NONE ? "" : v)} disabled={pending}>
              <SelectTrigger aria-label="Categoria"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Sem categoria</SelectItem>
                {selectableCategories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <Switch checked={hasEnd} onCheckedChange={setHasEnd} disabled={pending} aria-label="Definir data de término" />
              {hasEnd ? "Termina em" : "Sem data de término"}
            </label>
            {hasEnd && <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} disabled={pending} aria-label="Data de término" />}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rec-notes">Observações</Label>
            <Textarea id="rec-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={pending} />
          </div>
          {frequency !== origin.recurrence_frequency && (
            <p className="text-xs text-warning">
              Mudar a frequência substitui os vencimentos futuros em aberto pela nova série.
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>Cancelar</Button>
            <Button type="submit" disabled={pending}>{pending ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
