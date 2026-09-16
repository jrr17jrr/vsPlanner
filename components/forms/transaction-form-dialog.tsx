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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDbStore } from "@/store/db-store";
import { generateId } from "@/lib/ids";
import { toDateKey } from "@/lib/format";
import type { Transaction, TransactionType } from "@/types/entities";

const EXPENSE_CATEGORIES = [
  "Moradia", "Alimentação", "Transporte", "Educação", "Saúde",
  "Assinaturas", "Lazer", "Compras", "Outros",
];
const INCOME_SOURCES = ["Salário", "Visionário Dev", "TikTok", "Freelance", "Outros"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction?: Transaction;
  spaceId: string;
  accountId: string;
}

export function TransactionFormDialog({ open, onOpenChange, transaction, spaceId, accountId }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <TransactionForm
          key={transaction?.id ?? "new"}
          onOpenChange={onOpenChange}
          transaction={transaction}
          spaceId={spaceId}
          accountId={accountId}
        />
      )}
    </Dialog>
  );
}

function TransactionForm({ onOpenChange, transaction, spaceId, accountId }: Omit<Props, "open">) {
  const add = useDbStore((s) => s.add);
  const update = useDbStore((s) => s.update);

  const [type, setType] = useState<TransactionType>(transaction?.type ?? "saida");
  const [description, setDescription] = useState(transaction?.description ?? "");
  const [amount, setAmount] = useState(transaction ? String(transaction.amount) : "");
  const [category, setCategory] = useState(transaction?.category ?? EXPENSE_CATEGORIES[0]);
  const [source, setSource] = useState(transaction?.source ?? INCOME_SOURCES[0]);
  const [date, setDate] = useState(transaction?.date ?? toDateKey(new Date()));
  const [recurrent, setRecurrent] = useState(transaction?.recurrent ?? false);
  const [notes, setNotes] = useState(transaction?.notes ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(amount.replace(",", "."));
    if (!description.trim() || !value || value <= 0) {
      toast.error("Preencha descrição e um valor válido.");
      return;
    }

    const payload = {
      type,
      description,
      amount: value,
      category: type === "entrada" ? source : category,
      date,
      recurrent,
      notes: notes || undefined,
      source: type === "entrada" ? source : undefined,
    };

    if (transaction) {
      update("transactions", transaction.id, payload);
      toast.success("Transação atualizada.");
    } else {
      add("transactions", {
        id: generateId("txn"),
        spaceId,
        accountId,
        ...payload,
        createdAt: new Date().toISOString(),
      });
      toast.success(type === "entrada" ? "Entrada registrada." : "Gasto registrado.");
    }
    onOpenChange(false);
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{transaction ? "Editar transação" : "Nova transação"}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Tabs value={type} onValueChange={(v) => setType(v as TransactionType)}>
          <TabsList className="w-full">
            <TabsTrigger value="entrada" className="flex-1">Entrada</TabsTrigger>
            <TabsTrigger value="saida" className="flex-1">Saída</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="txn-desc">Descrição</Label>
          <Input id="txn-desc" value={description} onChange={(e) => setDescription(e.target.value)} autoFocus />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="txn-amount">Valor (R$)</Label>
            <Input
              id="txn-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0,00"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="txn-date">Data</Label>
            <Input id="txn-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>{type === "entrada" ? "Fonte de renda" : "Categoria"}</Label>
          {type === "entrada" ? (
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {INCOME_SOURCES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="flex items-center justify-between rounded-md border border-input px-3 py-2">
          <Label htmlFor="txn-recurrent" className="cursor-pointer">Transação recorrente</Label>
          <Switch id="txn-recurrent" checked={recurrent} onCheckedChange={setRecurrent} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="txn-notes">Observações</Label>
          <Textarea id="txn-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit">{transaction ? "Salvar alterações" : "Adicionar"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
