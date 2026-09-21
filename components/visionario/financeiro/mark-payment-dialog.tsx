"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { registerPaymentAction } from "@/lib/supabase/financial-actions";
import { toDateKey, formatCurrency } from "@/lib/format";
import type { FinancialAccount, FinancialCharge, FinancialKind, FinancialPaymentMethod } from "@/types/database.types";
import type { FinancialScope } from "@/lib/space-slugs";

const PAYMENT_METHOD_LABEL: Record<FinancialPaymentMethod, string> = {
  pix: "PIX",
  dinheiro: "Dinheiro",
  debito: "Débito",
  credito: "Crédito",
  boleto: "Boleto",
  transferencia: "Transferência",
  outro: "Outro",
};

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
  const [amount, setAmount] = useState(String(remaining));
  const [paymentDate, setPaymentDate] = useState(toDateKey(new Date()));
  const [paymentMethod, setPaymentMethod] = useState<FinancialPaymentMethod>("pix");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [pending, setPending] = useState(false);

  const isEntrada: FinancialKind = charge.kind;
  const verb = isEntrada === "entrada" ? "recebido" : "pago";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = parseFloat(amount.replace(",", "."));
    if (!value || value <= 0) return toast.error("Informe um valor válido.");
    if (!accountId) return toast.error("Escolha a conta.");

    setPending(true);
    const result = await registerPaymentAction(scope, charge.id, { amount: value, paymentDate, paymentMethod, accountId });
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
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Marcar como {verb}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            {charge.description} · restante {formatCurrency(remaining)}
          </p>

          <div className="flex flex-col gap-1.5">
            <Label>Valor {verb}</Label>
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={pending} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Data real</Label>
            <div className="flex gap-2">
              <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} disabled={pending} />
              <Button type="button" variant="outline" size="sm" onClick={() => setPaymentDate(toDateKey(new Date()))} disabled={pending}>
                Usar hoje
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>Forma de pagamento</Label>
              <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as FinancialPaymentMethod)} disabled={pending}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(PAYMENT_METHOD_LABEL) as FinancialPaymentMethod[]).map((m) => (
                    <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Conta</Label>
              <Select value={accountId} onValueChange={setAccountId} disabled={pending || accounts.length === 0}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {partialHint(parseFloat(amount.replace(",", ".")) || 0, remaining)}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancelar</Button>
            <Button type="submit" disabled={pending}>{pending ? "Salvando…" : "Confirmar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function partialHint(amount: number, remaining: number) {
  if (amount > 0 && amount < remaining) {
    return (
      <p className="text-xs text-warning">
        Pagamento parcial — restará {formatCurrency(remaining - amount)}.
      </p>
    );
  }
  return null;
}
