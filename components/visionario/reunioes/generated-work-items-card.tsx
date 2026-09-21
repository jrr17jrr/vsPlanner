"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, ListTodo } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { createWorkItemFromMeetingAction } from "@/lib/supabase/work-items-actions";
import { formatDate } from "@/lib/format";
import type { SpaceMemberProfile, WorkItem, WorkItemPriority } from "@/types/database.types";

const PRIORITY_LABEL: Record<WorkItemPriority, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
};

/**
 * "Atividades geradas" na tela da reunião — cada linha aqui é um
 * `work_items` real com `source_meeting_id = meeting.id`. Uma atividade
 * atribuída a duas pessoas continua sendo UMA linha só, com dois nomes
 * (não duplica); ela também aparece em `/visionario/trabalhos` e no Hoje
 * de cada responsável — é a mesma linha lida de três lugares diferentes.
 */
export function GeneratedWorkItemsCard({
  meetingId,
  workItems,
  members,
  assigneeNamesByWorkItem,
  canCreate,
}: {
  meetingId: string;
  workItems: WorkItem[];
  members: SpaceMemberProfile[];
  assigneeNamesByWorkItem: Record<string, string[]>;
  canCreate: boolean;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Atividades geradas
        </p>
        {canCreate && (
          <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Nova atividade
          </Button>
        )}
      </div>

      {workItems.length === 0 ? (
        <EmptyState icon={ListTodo} title="Nenhuma atividade vinculada." className="border-0 py-6" />
      ) : (
        <div className="flex flex-col gap-2">
          {workItems.map((w) => (
            <div
              key={w.id}
              className="flex flex-col gap-1 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{w.title}</p>
                <p className="text-xs text-muted-foreground">
                  {w.due_date ? `Prazo: ${formatDate(w.due_date)}` : "Sem prazo"}
                  {(assigneeNamesByWorkItem[w.id]?.length ?? 0) > 0 &&
                    ` · ${assigneeNamesByWorkItem[w.id].join(", ")}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <StatusBadge status={w.priority} />
                <StatusBadge status={w.status} />
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        {dialogOpen && (
          <NewGeneratedWorkItemForm
            meetingId={meetingId}
            members={members}
            onOpenChange={setDialogOpen}
          />
        )}
      </Dialog>
    </Card>
  );
}

function NewGeneratedWorkItemForm({
  meetingId,
  members,
  onOpenChange,
}: {
  meetingId: string;
  members: SpaceMemberProfile[];
  onOpenChange: (open: boolean) => void;
}) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<WorkItemPriority>("media");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  function toggleAssignee(id: string) {
    setAssigneeIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Dê um título para a atividade.");
      return;
    }

    startTransition(async () => {
      const result = await createWorkItemFromMeetingAction(meetingId, {
        title,
        dueDate: dueDate || undefined,
        priority,
        assigneeIds,
      });

      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(result.success ?? "Trabalho criado a partir da reunião.");
      onOpenChange(false);
    });
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Nova atividade a partir desta reunião</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="generated-title">Título *</Label>
          <Input
            id="generated-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={pending}
            autoFocus
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="generated-due">Prazo</Label>
            <Input
              id="generated-due"
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
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Criando…" : "Criar atividade"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
