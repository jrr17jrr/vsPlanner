"use client";

import { useMemo, useState } from "react";
import { Plus, ListChecks } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useDbStore } from "@/store/db-store";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { TaskItem } from "@/components/shared/task-item";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { TaskFormDialog } from "@/components/forms/task-form-dialog";
import type { Task, TaskStatus } from "@/types/entities";

export default function TarefasPage() {
  const { profile, personalSpace, canAccessVisionario, mySpaces } = useAuth();
  const tasks = useDbStore((s) => s.tasks);
  const clients = useDbStore((s) => s.clients);
  const profiles = useDbStore((s) => s.profiles);
  const spaceMembers = useDbStore((s) => s.spaceMembers);
  const update = useDbStore((s) => s.update);
  const remove = useDbStore((s) => s.remove);

  const [statusFilter, setStatusFilter] = useState<"todas" | TaskStatus>("todas");
  const [spaceFilter, setSpaceFilter] = useState<string>("todos");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Task | undefined>();
  const [deleting, setDeleting] = useState<Task | undefined>();

  const visionarioSpace = mySpaces.find((s) => s.slug === "visionario-dev");

  const visibleSpaceIds = useMemo(() => {
    const ids = mySpaces.map((s) => s.id);
    return new Set(ids);
  }, [mySpaces]);

  const myTasks = useMemo(
    () => tasks.filter((t) => visibleSpaceIds.has(t.spaceId)),
    [tasks, visibleSpaceIds]
  );

  const filtered = myTasks.filter((t) => {
    if (statusFilter !== "todas" && t.status !== statusFilter) return false;
    if (spaceFilter !== "todos" && t.spaceId !== spaceFilter) return false;
    return true;
  });

  function toggle(task: Task) {
    const done = task.status === "concluida";
    update("tasks", task.id, {
      status: done ? "pendente" : "concluida",
      completedAt: done ? undefined : new Date().toISOString(),
    });
  }

  const responsibleOptions = visionarioSpace
    ? spaceMembers
        .filter((m) => m.spaceId === visionarioSpace.id)
        .map((m) => profiles.find((p) => p.id === m.userId))
        .filter((p): p is NonNullable<typeof p> => !!p)
        .map((p) => ({ id: p.id, name: p.name }))
    : undefined;

  const clientOptions = canAccessVisionario
    ? clients.map((c) => ({ id: c.id, name: c.name }))
    : undefined;

  if (!profile || !personalSpace) return null;

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

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <TabsList>
            <TabsTrigger value="todas">Todas</TabsTrigger>
            <TabsTrigger value="pendente">Pendentes</TabsTrigger>
            <TabsTrigger value="em_andamento">Em andamento</TabsTrigger>
            <TabsTrigger value="concluida">Concluídas</TabsTrigger>
          </TabsList>
        </Tabs>

        {mySpaces.length > 1 && (
          <Select value={spaceFilter} onValueChange={setSpaceFilter}>
            <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os espaços</SelectItem>
              {mySpaces.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

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
          {filtered
            .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))
            .map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                onToggle={() => toggle(task)}
                onEdit={() => { setEditing(task); setFormOpen(true); }}
                onDelete={() => setDeleting(task)}
              />
            ))}
        </div>
      )}

      <TaskFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        task={editing}
        spaceId={editing?.spaceId ?? personalSpace.id}
        userId={profile.id}
        responsibleOptions={responsibleOptions}
        clientOptions={clientOptions}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        title="Excluir tarefa?"
        description={`"${deleting?.title}" será removida permanentemente.`}
        onConfirm={() => deleting && remove("tasks", deleting.id)}
      />
    </div>
  );
}
