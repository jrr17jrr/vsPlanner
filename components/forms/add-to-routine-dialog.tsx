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
import { toDateKey } from "@/lib/format";
import type { WorkItem } from "@/types/entities";

export function AddToRoutineDialog({
  open,
  onOpenChange,
  workItem,
  spaceId,
  userId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workItem?: WorkItem;
  spaceId: string;
  userId: string;
}) {
  const add = useDbStore((s) => s.add);
  const [date, setDate] = useState(toDateKey(new Date()));
  const [startTime, setStartTime] = useState("18:00");
  const [endTime, setEndTime] = useState("19:00");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!workItem) return;
    add("activities", {
      id: generateId("act"),
      spaceId,
      userId,
      title: workItem.title,
      description: workItem.description,
      category: "Visionário Dev",
      priority: workItem.priority,
      date,
      startTime,
      endTime: endTime || undefined,
      recurrence: "nenhuma",
      responsibleId: userId,
      status: "pendente",
      completedDates: [],
      workItemId: workItem.id,
      createdAt: new Date().toISOString(),
    });
    toast.success("Trabalho adicionado à sua rotina.");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar à minha rotina</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            &quot;{workItem?.title}&quot; será adicionado como uma atividade na sua rotina pessoal.
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="atr-date">Data</Label>
              <Input id="atr-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="atr-start">Início</Label>
              <Input id="atr-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="atr-end">Fim</Label>
              <Input id="atr-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit">Adicionar à rotina</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
