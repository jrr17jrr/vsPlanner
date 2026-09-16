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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDbStore } from "@/store/db-store";
import { generateId } from "@/lib/ids";
import type { Priority, WorkItem, WorkStatus } from "@/types/entities";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workItem?: WorkItem;
  spaceId: string;
  clients: { id: string; name: string }[];
  services: { id: string; name: string }[];
  members: { id: string; name: string }[];
}

export function WorkItemFormDialog({ open, onOpenChange, workItem, spaceId, clients, services, members }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <WorkItemForm
          key={workItem?.id ?? "new"}
          onOpenChange={onOpenChange}
          workItem={workItem}
          spaceId={spaceId}
          clients={clients}
          services={services}
          members={members}
        />
      )}
    </Dialog>
  );
}

function WorkItemForm({ onOpenChange, workItem, spaceId, clients, services, members }: Omit<Props, "open">) {
  const add = useDbStore((s) => s.add);
  const update = useDbStore((s) => s.update);

  const [title, setTitle] = useState(workItem?.title ?? "");
  const [description, setDescription] = useState(workItem?.description ?? "");
  const [clientId, setClientId] = useState(workItem?.clientId ?? "none");
  const [serviceId, setServiceId] = useState(workItem?.serviceId ?? "none");
  const [responsibleIds, setResponsibleIds] = useState<string[]>(
    workItem?.responsibleIds ?? (members[0] ? [members[0].id] : [])
  );
  const [dueDate, setDueDate] = useState(workItem?.dueDate ?? "");
  const [priority, setPriority] = useState<Priority>(workItem?.priority ?? "media");
  const [status, setStatus] = useState<WorkStatus>(workItem?.status ?? "pendente");
  const [notes, setNotes] = useState(workItem?.notes ?? "");

  function toggleResponsible(id: string) {
    setResponsibleIds((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Dê um título para o trabalho.");
      return;
    }
    const payload = {
      title,
      description: description || undefined,
      clientId: clientId === "none" ? undefined : clientId,
      serviceId: serviceId === "none" ? undefined : serviceId,
      responsibleIds,
      dueDate: dueDate || undefined,
      priority,
      status,
      notes: notes || undefined,
    };
    if (workItem) {
      update("workItems", workItem.id, payload);
      toast.success("Trabalho atualizado.");
    } else {
      add("workItems", { id: generateId("work"), spaceId, ...payload, createdAt: new Date().toISOString() });
      toast.success("Trabalho criado.");
    }
    onOpenChange(false);
  }

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{workItem ? "Editar trabalho" : "Novo trabalho"}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="work-title">Título</Label>
          <Input id="work-title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="work-desc">Descrição</Label>
          <Textarea id="work-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Cliente (opcional)</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Serviço (opcional)</Label>
            <Select value={serviceId} onValueChange={setServiceId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                {services.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Responsáveis</Label>
          <div className="flex flex-wrap gap-2">
            {members.map((m) => (
              <label key={m.id} className="flex items-center gap-1.5 rounded-md border border-input px-2 py-1 text-xs">
                <Checkbox checked={responsibleIds.includes(m.id)} onCheckedChange={() => toggleResponsible(m.id)} />
                {m.name}
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="work-due">Prazo</Label>
            <Input id="work-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
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
          <div className="flex flex-col gap-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as WorkStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="em_andamento">Em andamento</SelectItem>
                <SelectItem value="aguardando_cliente">Aguardando cliente</SelectItem>
                <SelectItem value="concluido">Concluído</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="work-notes">Observações</Label>
          <Textarea id="work-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit">{workItem ? "Salvar alterações" : "Criar trabalho"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
