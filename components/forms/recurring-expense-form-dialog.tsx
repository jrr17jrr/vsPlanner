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
import { Switch } from "@/components/ui/switch";
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
import type { RecurringExpense } from "@/types/entities";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: RecurringExpense;
  spaceId: string;
}

export function RecurringExpenseFormDialog({ open, onOpenChange, item, spaceId }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <RecurringExpenseForm key={item?.id ?? "new"} onOpenChange={onOpenChange} item={item} spaceId={spaceId} />
      )}
    </Dialog>
  );
}

function RecurringExpenseForm({ onOpenChange, item, spaceId }: Omit<Props, "open">) {
  const add = useDbStore((s) => s.add);
  const update = useDbStore((s) => s.update);

  const [name, setName] = useState(item?.name ?? "");
  const [amount, setAmount] = useState(item ? String(item.amount) : "");
  const [periodicity, setPeriodicity] = useState<"mensal" | "anual">(item?.periodicity ?? "mensal");
  const [nextDueDate, setNextDueDate] = useState(item?.nextDueDate ?? toDateKey(new Date()));
  const [category, setCategory] = useState(item?.category ?? "Assinaturas");
  const [active, setActive] = useState(item?.active ?? true);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(amount.replace(",", "."));
    if (!name.trim() || !value) {
      toast.error("Preencha nome e valor.");
      return;
    }
    const payload = { name, amount: value, periodicity, nextDueDate, category, active };
    if (item) {
      update("recurringExpenses", item.id, payload);
      toast.success("Gasto recorrente atualizado.");
    } else {
      add("recurringExpenses", { id: generateId("rec"), spaceId, ...payload });
      toast.success("Gasto recorrente criado.");
    }
    onOpenChange(false);
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{item ? "Editar gasto recorrente" : "Novo gasto recorrente"}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rec-name">Nome</Label>
          <Input id="rec-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rec-amount">Valor (R$)</Label>
            <Input id="rec-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Periodicidade</Label>
            <Select value={periodicity} onValueChange={(v) => setPeriodicity(v as "mensal" | "anual")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mensal">Mensal</SelectItem>
                <SelectItem value="anual">Anual</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rec-due">Próximo vencimento</Label>
            <Input id="rec-due" type="date" value={nextDueDate} onChange={(e) => setNextDueDate(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rec-cat">Categoria</Label>
            <Input id="rec-cat" value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>
        </div>
        <div className="flex items-center justify-between rounded-md border border-input px-3 py-2">
          <Label htmlFor="rec-active" className="cursor-pointer">Ativo</Label>
          <Switch id="rec-active" checked={active} onCheckedChange={setActive} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit">{item ? "Salvar alterações" : "Criar"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
