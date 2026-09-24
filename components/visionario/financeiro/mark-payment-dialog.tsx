"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { registerPaymentAction } from "@/lib/supabase/financial-actions";
import { PAYMENT_METHOD_LABEL } from "@/lib/finance-labels";
import { formatCurrency, formatDate, parseMoneyInput as parseMoney, todayKeySaoPaulo } from "@/lib/format";
import type { FinancialAccount, FinancialCharge, FinancialPaymentMethod } from "@/types/database.types";
import type { FinancialScope } from "@/lib/space-slugs";

/**
 * "Marcar como recebido/pago": registra o movimento REAL de caixa (valor,
 * data, forma e conta que de fato recebeu/pagou). O valor pode ser
 * diferente do cobrado — com "Quitar" ligado a diferença vira
 * desconto/acréscimo na própria cobrança e ela sai de A receber/A pagar;
 * desligado, é um pagamento parcial e o restante continua em aberto.
 */
export function MarkPaymentDialog({
  scope,
  charge,
  remaining,
  accounts,
  onOpenChange,
  onSaved,
}: {
  scope: FinancialScope;
  charge: FinancialCharge;
  remaining: number;
  accounts: FinancialAccount[];
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  const activeAccounts = accounts.filter((a) => a.is_active);
  const [amount, setAmount] = useState(remaining.toFixed(2).replace(".", ","));
  const [paymentDate, setPaymentDate] = useState(todayKeySaoPaulo());
  const [paymentMethod, setPaymentMethod] = useState<FinancialPaymentMethod>("pix");
  const [accountId, setAccountId] = useState(activeAccounts[0]?.id ?? "");
  const [settle, setSettle] = useState(true);
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);

  const isEntrada = charge.kind === "entrada";
  const verb = isEntrada ? "recebido" : "pago";
  const value = parseMoney(amount);
  const validValue = Number.isFinite(value) && value > 0;
  const diff = validValue ? Math.round((value - remaining) * 100) / 100 : 0;
  const selectedAccount = activeAccounts.find((a) => a.id === accountId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validValue) return toast.error("Informe um valor válido.");
    if (!accountId) return toast.error("Escolha a conta financeira.");
    if (!paymentDate) return toast.error("Informe a data real.");

    setPending(true);
    const result = await registerPaymentAction(scope, charge.id, {
      amount: value,
      paymentDate,
      paymentMethod,
      accountId,
      settle,
      notes: notes || undefined,
    });
    setPending(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(result.success ?? "Pagamento registrado.");
    onOpenChange(false);
    onSaved?.();
  }

  return (
    <Dialog open onOpenChange={(open) => !pending && onOpenChange(open)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Marcar como {verb}</DialogTitle>
          <DialogDescription>
            {charge.description} · vencimento {formatDate(charge.due_date)} · em aberto {formatCurrency(remaining)}
          </DialogDescription>
        </DialogHeader>

        {activeAccounts.length === 0 ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Nenhuma conta financeira ativa neste espaço. Cadastre (ou reative) uma conta em{" "}
              <span className="font-medium text-foreground">Contas e categorias</span> para registrar o que foi {verb}.
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pay-amount">Valor efetivamente {verb}</Label>
                <Input id="pay-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={pending} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pay-date">Data real</Label>
                <Input id="pay-date" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} disabled={pending} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>Forma de pagamento</Label>
                <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as FinancialPaymentMethod)} disabled={pending}>
                  <SelectTrigger aria-label="Forma de pagamento"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PAYMENT_METHOD_LABEL) as FinancialPaymentMethod[]).map((m) => (
                      <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Conta que {isEntrada ? "recebeu" : "pagou"}</Label>
                <Select value={accountId} onValueChange={setAccountId} disabled={pending}>
                  <SelectTrigger aria-label="Conta financeira"><SelectValue placeholder="Escolha a conta" /></SelectTrigger>
                  <SelectContent>
                    {activeAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {selectedAccount && paymentDate && paymentDate < selectedAccount.initial_balance_date && (
              <p className="text-xs text-warning">
                A data é anterior ao saldo inicial desta conta ({formatDate(selectedAccount.initial_balance_date)}) — o
                saldo da conta não será alterado por este lançamento (considera-se já incluído no saldo inicial).
              </p>
            )}

            {validValue && diff !== 0 && (
              <div className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
                <div className="text-sm">
                  <p className="font-medium text-foreground">Quitar esta cobrança</p>
                  <p className="text-xs text-muted-foreground">
                    {settle
                      ? diff < 0
                        ? `A diferença de ${formatCurrency(-diff)} vira desconto e a cobrança fica ${verb}.`
                        : `A diferença de ${formatCurrency(diff)} vira acréscimo (juros/extra) e a cobrança fica ${verb}.`
                      : diff < 0
                        ? `Pagamento parcial — continuam em aberto ${formatCurrency(-diff)}.`
                        : "Desligado, o valor não pode passar do que está em aberto."}
                  </p>
                </div>
                <Switch checked={settle} onCheckedChange={setSettle} disabled={pending} aria-label="Quitar esta cobrança" />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pay-notes">Observação</Label>
              <Input id="pay-notes" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={pending} placeholder="Opcional" />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancelar</Button>
              <Button type="submit" disabled={pending}>{pending ? "Salvando…" : `Confirmar ${verb}`}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
