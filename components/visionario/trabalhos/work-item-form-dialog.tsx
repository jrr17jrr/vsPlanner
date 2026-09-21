"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  createWorkItemAction,
  updateWorkItemAction,
  type WorkItemFormInput,
} from "@/lib/supabase/work-items-actions";
import type { Client, Service, SpaceMemberProfile, WorkItem, WorkItemPriority } from "@/types/database.types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workItem?: WorkItem;
  currentAssigneeIds?: string[];
  members: SpaceMemberProfile[];
  clients: Client[];
  services: Service[];
  onSaved?: (workItemId: string) => void;
}

const PRIORITY_LABEL: Record<WorkItemPriority, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
};

export function WorkItemFormDialog({
  open,
  onOpenChange,
  workItem,
  currentAssigneeIds,
  members,
  clients,
  services,
  onSaved,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <WorkItemForm
          key={workItem?.id ?? "new"}
          onOpenChange={onOpenChange}
          workItem={workItem}
          currentAssigneeIds={currentAssigneeIds ?? []}
          members={members}
          clients={clients}
          services={services}
          onSaved={onSaved}
        />
      )}
    </Dialog>
  );
}

function WorkItemForm({
  onOpenChange,
  workItem,
  currentAssigneeIds,
  members,
  clients,
  services,
  onSaved,
}: Omit<Props, "open" | "currentAssigneeIds"> & { currentAssigneeIds: string[] }) {
  const [title, setTitle] = useState(workItem?.title ?? "");
  const [description, setDescription] = useState(workItem?.description ?? "");
  const [clientId, setClientId] = useState(workItem?.client_id ?? "");
  const [serviceId, setServiceId] = useState(workItem?.service_id ?? "");
  const [dueDate, setDueDate] = useState(workItem?.due_date ?? "");
  const [priority, setPriority] = useState<WorkItemPriority>(workItem?.priority ?? "media");
  const [notes, setNotes] = useState(workItem?.notes ?? "");
  const [assigneeIds, setAssigneeIds] = useState<string[]>(currentAssigneeIds);
  const [pending, startTransition] = useTransition();

  function toggleAssignee(id: string) {
    setAssigneeIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Dê um título para o trabalho.");
      return;
    }

    const input: WorkItemFormInput = {
      title,
      description: description || undefined,
      clientId: clientId || undefined,
      serviceId: serviceId || undefined,
      dueDate: dueDate || undefined,
      priority,
      notes: notes || undefined,
      assigneeIds,
    };

    startTransition(async () => {
      const result = workItem
        ? await updateWorkItemAction(workItem.id, input)
        : await createWorkItemAction(input);

      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(result.success ?? (workItem ? "Trabalho atualizado." : "Trabalho criado."));
      onOpenChange(false);
      if (result.workItemId) onSaved?.(result.workItemId);
    });
  }

  return (
    <DialogContent className="sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>{workItem ? "Editar trabalho" : "Novo trabalho"}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex max-h-[75vh] flex-col gap-4 overflow-y-auto pr-1">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="work-item-title">Título *</Label>
          <Input
            id="work-item-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={pending}
            autoFocus
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="work-item-desc">Descrição</Label>
          <Textarea
            id="work-item-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={pending}
            rows={2}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Cliente</Label>
            <Select value={clientId || "nenhum"} onValueChange={(v) => setClientId(v === "nenhum" ? "" : v)} disabled={pending}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nenhum">Sem cliente</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Serviço</Label>
            <Select value={serviceId || "nenhum"} onValueChange={(v) => setServiceId(v === "nenhum" ? "" : v)} disabled={pending}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nenhum">Sem serviço</SelectItem>
                {services.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="work-item-due">Prazo</Label>
            <Input
              id="work-item-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              disabled={pending}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Prioridade</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as WorkItemPriority)} disabled={pending}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PRIORITY_LABEL) as WorkItemPriority[]).map((p) => (
                  <SelectItem key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Responsáveis</Label>
          <div className="flex flex-wrap gap-2">
            {members.map((m) => (
              <label
                key={m.id}
                className="flex items-center gap-1.5 rounded-md border border-input px-2 py-1 text-xs"
              >
                <Checkbox
                  checked={assigneeIds.includes(m.id)}
                  onCheckedChange={() => toggleAssignee(m.id)}
                  disabled={pending}
                />
                {m.name}
              </label>
            ))}
          </div>
          {assigneeIds.length === 0 && (
            <p className="text-xs text-muted-foreground">Sem responsável — pode atribuir depois.</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="work-item-notes">Observações</Label>
          <Textarea
            id="work-item-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={pending}
            rows={2}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Salvando…" : workItem ? "Salvar alterações" : "Criar trabalho"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
