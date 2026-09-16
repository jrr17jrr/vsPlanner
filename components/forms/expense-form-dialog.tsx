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
import { toDateKey } from "@/lib/format";
import type { Expense, ExpenseType } from "@/types/entities";

const TYPE_LABEL: Record<ExpenseType, string> = {
  fixo: "Gasto fixo mensal",
  normal: "Gasto normal",
  anual: "Gasto anual",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense?: Expense;
  spaceId: string;
  defaultType?: ExpenseType;
}

export function ExpenseFormDialog({ open, onOpenChange, expense, spaceId, defaultType }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <ExpenseForm
          key={expense?.id ?? "new"}
          onOpenChange={onOpenChange}
          expense={expense}
          spaceId={spaceId}
          defaultType={defaultType}
        />
      )}
    </Dialog>
  );
}

function ExpenseForm({ onOpenChange, expense, spaceId, defaultType }: Omit<Props, "open">) {
  const add = useDbStore((s) => s.add);
  const update = useDbStore((s) => s.update);

  const [description, setDescription] = useState(expense?.description ?? "");
  const [amount, setAmount] = useState(expense ? String(expense.amount) : "");
  const [category, setCategory] = useState(expense?.category ?? "Ferramentas");
  const [type, setType] = useState<ExpenseType>(expense?.type ?? defaultType ?? "normal");
  const [date, setDate] = useState(expense?.date ?? toDateKey(new Date()));
  const [nextDueDate, setNextDueDate] = useState(expense?.nextDueDate ?? "");
  const [notes, setNotes] = useState(expense?.notes ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(amount.replace(",", "."));
    if (!description.trim() || !value) {
      toast.error("Preencha descrição e valor.");
      return;
    }
    const payload = {
      description,
      amount: value,
      category,
      type,
      date,
      nextDueDate: type !== "normal" ? nextDueDate || undefined : undefined,
      recurrence: type === "fixo" ? ("mensal" as const) : type === "anual" ? ("anual" as const) : ("nenhuma" as const),
      notes: notes || undefined,
    };
    if (expense) {
      update("expenses", expense.id, payload);
      toast.success("Gasto atualizado.");
    } else {
      add("expenses", { id: generateId("exp"), spaceId, ...payload, createdAt: new Date().toISOString() });
      toast.success("Gasto registrado.");
    }
    onOpenChange(false);
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{expense ? "Editar gasto" : "Novo gasto"}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="exp-desc">Descrição</Label>
          <Input id="exp-desc" value={description} onChange={(e) => setDescription(e.target.value)} autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="exp-amount">Valor (R$)</Label>
            <Input id="exp-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="exp-cat">Categoria</Label>
            <Input id="exp-cat" value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Tipo</Label>
          <Select value={type} onValueChange={(v) => setType(v as ExpenseType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(TYPE_LABEL).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="exp-date">Data</Label>
            <Input id="exp-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          {type !== "normal" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="exp-next">Próximo vencimento</Label>
              <Input id="exp-next" type="date" value={nextDueDate} onChange={(e) => setNextDueDate(e.target.value)} />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="exp-notes">Observações</Label>
          <Textarea id="exp-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit">{expense ? "Salvar alterações" : "Registrar gasto"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
