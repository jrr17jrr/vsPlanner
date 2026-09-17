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
import type { WorkTask, WorkTaskPriority, TaskStatus } from "@/types/entities";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workTask?: WorkTask;
  spaceId: string;
  userId: string;
  defaultDate?: string;
}

export function WorkTaskFormDialog({ open, onOpenChange, workTask, spaceId, userId, defaultDate }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <WorkTaskForm
          key={workTask?.id ?? "new"}
          onOpenChange={onOpenChange}
          workTask={workTask}
          spaceId={spaceId}
          userId={userId}
          defaultDate={defaultDate}
        />
      )}
    </Dialog>
  );
}

function WorkTaskForm({ onOpenChange, workTask, spaceId, userId, defaultDate }: Omit<Props, "open">) {
  const add = useDbStore((s) => s.add);
  const update = useDbStore((s) => s.update);

  const [title, setTitle] = useState(workTask?.title ?? "");
  const [description, setDescription] = useState(workTask?.description ?? "");
  const [dueDate, setDueDate] = useState(workTask?.dueDate ?? defaultDate ?? toDateKey(new Date()));
  const [scheduledTime, setScheduledTime] = useState(workTask?.scheduledTime ?? "");
  const [priority, setPriority] = useState<WorkTaskPriority>(workTask?.priority ?? "normal");
  const [status, setStatus] = useState<TaskStatus>(workTask?.status ?? "pendente");
  const [notes, setNotes] = useState(workTask?.notes ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Dê um título para a tarefa.");
      return;
    }
    const payload = {
      title,
      description: description || undefined,
      dueDate: dueDate || undefined,
      scheduledTime: scheduledTime || undefined,
      priority,
      status,
      notes: notes || undefined,
    };
    if (workTask) {
      update("workTasks", workTask.id, {
        ...payload,
        completedAt: status === "concluida" ? workTask.completedAt ?? new Date().toISOString() : undefined,
      });
      toast.success("Tarefa atualizada.");
    } else {
      add("workTasks", {
        id: generateId("wtask"),
        spaceId,
        userId,
        ...payload,
        createdAt: new Date().toISOString(),
      });
      toast.success("Tarefa criada.");
    }
    onOpenChange(false);
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{workTask ? "Editar tarefa" : "Nova tarefa do trabalho"}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wt-title">Título</Label>
          <Input id="wt-title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wt-desc">Descrição</Label>
          <Textarea id="wt-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wt-date">Data</Label>
            <Input id="wt-date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wt-time">Horário (opcional)</Label>
            <Input id="wt-time" type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="em_andamento">Em andamento</SelectItem>
                <SelectItem value="concluida">Concluído</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Prioridade</Label>
          <Select value={priority} onValueChange={(v) => setPriority(v as WorkTaskPriority)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="baixa">Baixa</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="alta">Alta</SelectItem>
              <SelectItem value="urgente">Urgente</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wt-notes">Observação</Label>
          <Textarea id="wt-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit">{workTask ? "Salvar alterações" : "Criar tarefa"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
