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
import { useDbStore } from "@/store/db-store";
import { generateId } from "@/lib/ids";
import type { FinancialGoal } from "@/types/entities";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal?: FinancialGoal;
  spaceId: string;
}

export function GoalFormDialog({ open, onOpenChange, goal, spaceId }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <GoalForm key={goal?.id ?? "new"} onOpenChange={onOpenChange} goal={goal} spaceId={spaceId} />}
    </Dialog>
  );
}

function GoalForm({ onOpenChange, goal, spaceId }: Omit<Props, "open">) {
  const add = useDbStore((s) => s.add);
  const update = useDbStore((s) => s.update);

  const [title, setTitle] = useState(goal?.title ?? "");
  const [targetAmount, setTargetAmount] = useState(goal ? String(goal.targetAmount) : "");
  const [currentAmount, setCurrentAmount] = useState(goal ? String(goal.currentAmount) : "0");
  const [deadline, setDeadline] = useState(goal?.deadline ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const target = Number(targetAmount.replace(",", "."));
    const current = Number(currentAmount.replace(",", ".")) || 0;
    if (!title.trim() || !target) {
      toast.error("Preencha o nome e o valor alvo da meta.");
      return;
    }
    const payload = {
      title,
      targetAmount: target,
      currentAmount: current,
      deadline: deadline || undefined,
      status: current >= target ? ("concluida" as const) : ("em_andamento" as const),
    };
    if (goal) {
      update("financialGoals", goal.id, payload);
      toast.success("Meta atualizada.");
    } else {
      add("financialGoals", {
        id: generateId("goal"),
        spaceId,
        ...payload,
        createdAt: new Date().toISOString(),
      });
      toast.success("Meta criada.");
    }
    onOpenChange(false);
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{goal ? "Editar meta" : "Nova meta"}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="goal-title">Nome da meta</Label>
          <Input id="goal-title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="goal-current">Valor atual (R$)</Label>
            <Input id="goal-current" inputMode="decimal" value={currentAmount} onChange={(e) => setCurrentAmount(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="goal-target">Valor alvo (R$)</Label>
            <Input id="goal-target" inputMode="decimal" value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="goal-deadline">Prazo (opcional)</Label>
          <Input id="goal-deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit">{goal ? "Salvar alterações" : "Criar meta"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
