"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, ListChecks } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { ChecklistItem, PriorityBadge } from "@/components/shared/checklist-item";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { TaskFormDialog } from "@/components/tarefas/task-form-dialog";
import { toggleTaskStatusAction, moveTaskDateAction, deleteTaskAction } from "@/lib/supabase/personal-actions";
import { formatDate } from "@/lib/format";
import type { Task, TaskStatus } from "@/types/database.types";

export function TarefasPageClient({ tasks }: { tasks: Task[] }) {
  const [statusFilter, setStatusFilter] = useState<"todas" | TaskStatus>("todas");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Task | undefined>();
  const [deleting, setDeleting] = useState<Task | undefined>();

  const filtered = tasks
    .filter((t) => statusFilter === "todas" || t.status === statusFilter)
    .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));

  async function toggle(task: Task) {
    const next: TaskStatus = task.status === "concluida" ? "pendente" : "concluida";
    const result = await toggleTaskStatusAction(task.id, next);
    if (result.error) toast.error(result.error);
  }

  async function handleDelete() {
    if (!deleting) return;
    const result = await deleteTaskAction(deleting.id);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setDeleting(undefined);
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Tarefas"
        description="Itens pontuais, sem horário fixo — diferente da sua rotina."
        actions={
          <Button size="sm" onClick={() => { setEditing(undefined); setFormOpen(true); }}>
            <Plus className="h-4 w-4" /> Nova tarefa
          </Button>
        }
      />

      <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
        <TabsList>
          <TabsTrigger value="todas">Todas</TabsTrigger>
          <TabsTrigger value="pendente">Pendentes</TabsTrigger>
          <TabsTrigger value="concluida">Concluídas</TabsTrigger>
        </TabsList>
      </Tabs>

      {filtered.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="Nenhuma tarefa encontrada"
          description="Crie uma tarefa para começar a organizar seus pendentes."
          action={
            <Button size="sm" onClick={() => { setEditing(undefined); setFormOpen(true); }}>
              <Plus className="h-4 w-4" /> Nova tarefa
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((task) => (
            <ChecklistItem
              key={task.id}
              title={task.title}
              done={task.status === "concluida"}
              time={task.scheduled_time?.slice(0, 5)}
              onToggle={() => toggle(task)}
              onEdit={() => { setEditing(task); setFormOpen(true); }}
              onDelete={() => setDeleting(task)}
              onMove={(d) => moveTaskDateAction(task.id, d).then((r) => r.error && toast.error(r.error))}
              badges={
                <>
                  <PriorityBadge priority={task.priority} />
                  {task.category && <span className="text-[11px] text-muted-foreground">{task.category}</span>}
                  {task.due_date && <span className="text-[11px] text-muted-foreground">prazo {formatDate(task.due_date)}</span>}
                </>
              }
            />
          ))}
        </div>
      )}

      <TaskFormDialog open={formOpen} onOpenChange={setFormOpen} task={editing} />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        title="Excluir tarefa?"
        description={`"${deleting?.title}" será removida permanentemente.`}
        onConfirm={handleDelete}
      />
    </div>
  );
}
