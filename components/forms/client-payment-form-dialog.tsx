"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDbStore } from "@/store/db-store";
import { generateId } from "@/lib/ids";
import { toCompetencia, toDateKey } from "@/lib/format";
import type { ClientPayment, PaymentStatus } from "@/types/entities";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  spaceId: string;
  payment?: ClientPayment;
  defaultAmount?: number;
}

export function ClientPaymentFormDialog({ open, onOpenChange, clientId, spaceId, payment, defaultAmount }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <ClientPaymentForm
          key={payment?.id ?? "new"}
          onOpenChange={onOpenChange}
          clientId={clientId}
          spaceId={spaceId}
          payment={payment}
          defaultAmount={defaultAmount}
        />
      )}
    </Dialog>
  );
}

function ClientPaymentForm({
  onOpenChange,
  clientId,
  spaceId,
  payment,
  defaultAmount,
}: Omit<Props, "open">) {
  const add = useDbStore((s) => s.add);
  const update = useDbStore((s) => s.update);

  const [amount, setAmount] = useState(payment ? String(payment.amount) : defaultAmount ? String(defaultAmount) : "");
  const [competencia, setCompetencia] = useState(payment?.competencia ?? toCompetencia(new Date()));
  const [dueDate, setDueDate] = useState(payment?.dueDate ?? toDateKey(new Date()));
  const [status, setStatus] = useState<PaymentStatus>(payment?.status ?? "pendente");
  const [paidDate, setPaidDate] = useState(payment?.paidDate ?? "");
  const [paymentMethod, setPaymentMethod] = useState(payment?.paymentMethod ?? "Pix");
  const [notes, setNotes] = useState(payment?.notes ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(amount.replace(",", "."));
    if (!value || !competencia || !dueDate) {
      toast.error("Preencha valor, competência e vencimento.");
      return;
    }
    const payload = {
      amount: value,
      competencia,
      dueDate,
      status,
      paidDate: status === "pago" ? paidDate || toDateKey(new Date()) : undefined,
      paymentMethod: status === "pago" ? paymentMethod : undefined,
      notes: notes || undefined,
    };
    if (payment) {
      update("clientPayments", payment.id, payload);
      toast.success("Pagamento atualizado.");
    } else {
      add("clientPayments", {
        id: generateId("pay"),
        clientId,
        spaceId,
        ...payload,
        createdAt: new Date().toISOString(),
      });
      toast.success("Pagamento registrado.");
    }
    onOpenChange(false);
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{payment ? "Editar pagamento" : "Novo pagamento"}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pay-amount">Valor (R$)</Label>
            <Input id="pay-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pay-comp">Competência</Label>
            <Input id="pay-comp" type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pay-due">Vencimento</Label>
            <Input id="pay-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as PaymentStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="pago">Pago</SelectItem>
                <SelectItem value="atrasado">Atrasado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {status === "pago" && (
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pay-paid">Data do pagamento</Label>
              <Input id="pay-paid" type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Forma de pagamento</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Pix">Pix</SelectItem>
                  <SelectItem value="Cartão">Cartão</SelectItem>
                  <SelectItem value="Boleto">Boleto</SelectItem>
                  <SelectItem value="Transferência">Transferência</SelectItem>
                  <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pay-notes">Observações</Label>
          <Textarea id="pay-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit">{payment ? "Salvar" : "Registrar"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
