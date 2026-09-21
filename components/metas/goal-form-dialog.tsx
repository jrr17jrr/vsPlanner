"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createGoalAction, updateGoalAction, type GoalFormInput } from "@/lib/supabase/personal-actions";
import type { Goal } from "@/types/database.types";

export function GoalFormDialog({
  open,
  onOpenChange,
  goal,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal?: Goal;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <GoalForm key={goal?.id ?? "new"} onOpenChange={onOpenChange} goal={goal} />}
    </Dialog>
  );
}

function GoalForm({ onOpenChange, goal }: { onOpenChange: (open: boolean) => void; goal?: Goal }) {
  const [title, setTitle] = useState(goal?.title ?? "");
  const [description, setDescription] = useState(goal?.description ?? "");
  const [category, setCategory] = useState(goal?.category ?? "");
  const [targetValue, setTargetValue] = useState(goal?.target_value ? String(goal.target_value) : "");
  const [currentValue, setCurrentValue] = useState(goal ? String(goal.current_value) : "0");
  const [targetDate, setTargetDate] = useState(goal?.target_date ?? "");
  const [notes, setNotes] = useState(goal?.notes ?? "");
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return toast.error("Dê um título para a meta.");

    const input: GoalFormInput = {
      title,
      description: description || undefined,
      category: category || undefined,
      targetValue: targetValue ? parseFloat(targetValue.replace(",", ".")) : undefined,
      currentValue: currentValue ? parseFloat(currentValue.replace(",", ".")) : undefined,
      targetDate: targetDate || undefined,
      notes: notes || undefined,
    };

    setPending(true);
    const result = goal ? await updateGoalAction(goal.id, input) : await createGoalAction(input);
    setPending(false);

    if (result.error) return toast.error(result.error);
    toast.success(result.success ?? "Meta salva.");
    onOpenChange(false);
  }

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{goal ? "Editar meta" : "Nova meta"}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex max-h-[75vh] flex-col gap-4 overflow-y-auto pr-1">
        <div className="flex flex-col gap-1.5">
          <Label>Título *</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={pending} autoFocus />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Descrição</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} disabled={pending} rows={2} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Categoria</Label>
          <Input value={category} onChange={(e) => setCategory(e.target.value)} disabled={pending} placeholder="Opcional" />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Valor alvo</Label>
            <Input inputMode="decimal" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} disabled={pending} placeholder="Opcional" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Valor atual</Label>
            <Input inputMode="decimal" value={currentValue} onChange={(e) => setCurrentValue(e.target.value)} disabled={pending} />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Prazo</Label>
          <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} disabled={pending} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Observações</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={pending} rows={2} />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancelar</Button>
          <Button type="submit" disabled={pending}>{pending ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
