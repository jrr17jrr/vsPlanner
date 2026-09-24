"use client";

import { useMemo, useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, Undo2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { AsyncConfirmDialog } from "@/components/shared/async-confirm-dialog";
import { deletePaymentAction } from "@/lib/supabase/financial-actions";
import { PAYMENT_METHOD_LABEL } from "@/lib/finance-labels";
import { formatCurrency, formatDate, formatMonthYear, currentMonthKeySaoPaulo } from "@/lib/format";
import type { Client, FinancialAccount, FinancialCharge, FinancialKind, FinancialPayment } from "@/types/database.types";
import type { FinancialScope } from "@/lib/space-slugs";

/**
 * Movimentações = CAIXA real: cada linha é um `financial_payment` (o
 * dinheiro que de fato entrou/saiu, na data real, na conta escolhida).
 * Cobranças pendentes nunca aparecem aqui — ficam em A receber/A pagar.
 */
export function MovementsList({
  scope,
  charges,
  payments,
  accounts,
  clients,
  canEdit,
}: {
  scope: FinancialScope;
  charges: FinancialCharge[];
  payments: FinancialPayment[];
  accounts: FinancialAccount[];
  clients: Client[];
  canEdit: boolean;
}) {
  const [month, setMonth] = useState(currentMonthKeySaoPaulo());
  const [kindFilter, setKindFilter] = useState<"todos" | FinancialKind>("todos");
  const [accountFilter, setAccountFilter] = useState("todas");
  const [undoing, setUndoing] = useState<FinancialPayment | null>(null);

  const chargeById = useMemo(() => new Map(charges.map((c) => [c.id, c])), [charges]);
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const months = useMemo(() => {
    const set = new Set(payments.map((p) => p.payment_date.slice(0, 7)));
    set.add(currentMonthKeySaoPaulo());
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [payments]);

  const rows = useMemo(
    () =>
      payments
        .filter((p) => month === "todos" || p.payment_date.startsWith(month))
        .filter((p) => kindFilter === "todos" || chargeById.get(p.charge_id)?.kind === kindFilter)
        .filter((p) => accountFilter === "todas" || p.account_id === accountFilter)
        .sort((a, b) => b.payment_date.localeCompare(a.payment_date) || b.created_at.localeCompare(a.created_at)),
    [payments, month, kindFilter, accountFilter, chargeById]
  );

  const totals = rows.reduce(
    (acc, p) => {
      const kind = chargeById.get(p.charge_id)?.kind;
      if (kind === "entrada") acc.in += Number(p.amount);
      if (kind === "saida") acc.out += Number(p.amount);
      return acc;
    },
    { in: 0, out: 0 }
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger aria-label="Mês"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os meses</SelectItem>
            {months.map((m) => (
              <SelectItem key={m} value={m}>{formatMonthYear(`${m}-01`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={kindFilter} onValueChange={(v) => setKindFilter(v as typeof kindFilter)}>
          <SelectTrigger aria-label="Tipo"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Entradas e saídas</SelectItem>
            <SelectItem value="entrada">Só entradas</SelectItem>
            <SelectItem value="saida">Só saídas</SelectItem>
          </SelectContent>
        </Select>
        <Select value={accountFilter} onValueChange={setAccountFilter}>
          <SelectTrigger aria-label="Conta"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as contas</SelectItem>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <span className="text-muted-foreground">Entradas: <span className="font-semibold text-success">{formatCurrency(totals.in)}</span></span>
        <span className="text-muted-foreground">Saídas: <span className="font-semibold text-destructive">{formatCurrency(totals.out)}</span></span>
        <span className="text-muted-foreground">
          Resultado:{" "}
          <span className={`font-semibold ${totals.in - totals.out >= 0 ? "text-success" : "text-destructive"}`}>
            {formatCurrency(totals.in - totals.out)}
          </span>
        </span>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={Wallet} title="Nenhuma movimentação no período" description="Recebimentos e pagamentos registrados aparecem aqui, pela data real." />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((p) => {
            const charge = chargeById.get(p.charge_id);
            const isIn = charge?.kind === "entrada";
            const client = charge?.client_id ? clientById.get(charge.client_id) : undefined;
            return (
              <li key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
                <div className="flex min-w-0 items-center gap-2">
                  {isIn ? (
                    <ArrowUpCircle className="h-4 w-4 shrink-0 text-success" aria-label="Entrada" />
                  ) : (
                    <ArrowDownCircle className="h-4 w-4 shrink-0 text-destructive" aria-label="Saída" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{charge?.description ?? "Movimentação"}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(p.payment_date)} · {PAYMENT_METHOD_LABEL[p.payment_method]} · {accountById.get(p.account_id)?.name ?? "Conta"}
                      {client && ` · ${client.name}`}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <span className={`text-sm font-semibold tabular-nums ${isIn ? "text-success" : "text-destructive"}`}>
                    {isIn ? "+" : "−"}
                    {formatCurrency(Number(p.amount))}
                  </span>
                  {canEdit && (
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setUndoing(p)} aria-label="Desfazer pagamento">
                      <Undo2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {undoing && (
        <AsyncConfirmDialog
          open
          onOpenChange={(open) => !open && setUndoing(null)}
          title="Desfazer este pagamento?"
          description="O lançamento de caixa é removido, o saldo da conta volta ao que era e a cobrança volta a ficar em aberto. Use se registrou por engano."
          confirmLabel="Desfazer"
          onConfirm={() => deletePaymentAction(scope, undoing.id)}
        />
      )}
    </div>
  );
}
