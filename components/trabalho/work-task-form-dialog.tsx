"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  createPersonalWorkTaskAction,
  updatePersonalWorkTaskAction,
  type PersonalWorkTaskFormInput,
} from "@/lib/supabase/personal-actions";
import { toDateKey } from "@/lib/format";
import type { PersonalWorkTask, PersonalWorkTaskPriority } from "@/types/database.types";

const PRIORITY_LABEL: Record<PersonalWorkTaskPriority, string> = {
  baixa: "Baixa",
  normal: "Normal",
  alta: "Alta",
  urgente: "Urgente",
};

export function WorkTaskFormDialog({
  open,
  onOpenChange,
  task,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: PersonalWorkTask;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <WorkTaskForm key={task?.id ?? "new"} onOpenChange={onOpenChange} task={task} />}
    </Dialog>
  );
}

function WorkTaskForm({ onOpenChange, task }: { onOpenChange: (open: boolean) => void; task?: PersonalWorkTask }) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [dueDate, setDueDate] = useState(task?.due_date ?? "");
  const [scheduledTime, setScheduledTime] = useState(task?.scheduled_time?.slice(0, 5) ?? "");
  const [priority, setPriority] = useState<PersonalWorkTaskPriority>(task?.priority ?? "normal");
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return toast.error("Dê um título para a tarefa.");

    const input: PersonalWorkTaskFormInput = {
      title,
      description: description || undefined,
      dueDate: dueDate || undefined,
      scheduledTime: scheduledTime || undefined,
      priority,
      notes: notes || undefined,
    };

    setPending(true);
    const result = task ? await updatePersonalWorkTaskAction(task.id, input) : await createPersonalWorkTaskAction(input);
    setPending(false);

    if (result.error) return toast.error(result.error);
    toast.success(result.success ?? "Tarefa salva.");
    onOpenChange(false);
  }

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{task ? "Editar tarefa" : "Nova tarefa"}</DialogTitle>
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

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Prazo</Label>
            <div className="flex gap-2">
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={pending} />
              <Button type="button" variant="outline" size="sm" onClick={() => setDueDate(toDateKey(new Date()))} disabled={pending}>
                Hoje
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Horário</Label>
            <Input type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} disabled={pending} />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Prioridade</Label>
          <Select value={priority} onValueChange={(v) => setPriority(v as PersonalWorkTaskPriority)} disabled={pending}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(PRIORITY_LABEL) as PersonalWorkTaskPriority[]).map((p) => (
                <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
