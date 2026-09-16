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
import type { Task, Priority, TaskStatus } from "@/types/entities";

const CATEGORY_OPTIONS = [
  "Pessoal",
  "Visionário Dev",
  "TikTok",
  "Estudos",
  "Faculdade",
  "Outros",
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: Task;
  spaceId: string;
  userId: string;
  responsibleOptions?: { id: string; name: string }[];
  clientOptions?: { id: string; name: string }[];
}

export function TaskFormDialog({
  open,
  onOpenChange,
  task,
  spaceId,
  userId,
  responsibleOptions,
  clientOptions,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <TaskForm
          key={task?.id ?? "new"}
          onOpenChange={onOpenChange}
          task={task}
          spaceId={spaceId}
          userId={userId}
          responsibleOptions={responsibleOptions}
          clientOptions={clientOptions}
        />
      )}
    </Dialog>
  );
}

function TaskForm({
  onOpenChange,
  task,
  spaceId,
  userId,
  responsibleOptions,
  clientOptions,
}: Omit<Props, "open">) {
  const add = useDbStore((s) => s.add);
  const update = useDbStore((s) => s.update);

  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [category, setCategory] = useState(task?.category ?? "Pessoal");
  const [priority, setPriority] = useState<Priority>(task?.priority ?? "media");
  const [dueDate, setDueDate] = useState(task?.dueDate ?? "");
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? "pendente");
  const [responsibleId, setResponsibleId] = useState(task?.responsibleId ?? userId);
  const [clientId, setClientId] = useState<string>(task?.clientId ?? "none");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Dê um título para a tarefa.");
      return;
    }

    const payload = {
      title,
      description: description || undefined,
      category,
      priority,
      dueDate: dueDate || undefined,
      status,
      responsibleId,
      clientId: clientId === "none" ? undefined : clientId,
    };

    if (task) {
      update("tasks", task.id, {
        ...payload,
        completedAt:
          status === "concluida" ? task.completedAt ?? new Date().toISOString() : undefined,
      });
      toast.success("Tarefa atualizada.");
    } else {
      add("tasks", {
        id: generateId("task"),
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
        <DialogTitle>{task ? "Editar tarefa" : "Nova tarefa"}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="task-title">Título</Label>
          <Input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="task-desc">Descrição</Label>
          <Textarea id="task-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Categoria</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Prioridade</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="baixa">Baixa</SelectItem>
                <SelectItem value="media">Média</SelectItem>
                <SelectItem value="alta">Alta</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="task-due">Prazo</Label>
            <Input id="task-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
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

        {responsibleOptions && responsibleOptions.length > 1 && (
          <div className="flex flex-col gap-1.5">
            <Label>Responsável</Label>
            <Select value={responsibleId} onValueChange={setResponsibleId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {responsibleOptions.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {clientOptions && (
          <div className="flex flex-col gap-1.5">
            <Label>Cliente relacionado (opcional)</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                {clientOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit">{task ? "Salvar alterações" : "Criar tarefa"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
