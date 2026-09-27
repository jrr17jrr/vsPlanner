"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { TaskFormDialog } from "@/components/tarefas/task-form-dialog";
import { deleteTaskAction, endTaskRecurrenceAction } from "@/lib/supabase/personal-actions";
import { isRecurringTask } from "@/lib/tasks";
import type { Task, TaskKind } from "@/types/database.types";

/**
 * Criar/editar/excluir/encerrar repetição — mesmos diálogos no Meu Dia e
 * em Tarefas, sem duplicar estado nem textos de confirmação.
 */
export function useTaskDialogs(todayKey: string) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Task | undefined>();
  const [defaultKind, setDefaultKind] = useState<TaskKind>("dia");
  const [deleting, setDeleting] = useState<Task | undefined>();
  const [ending, setEnding] = useState<Task | undefined>();

  async function runAction(action: () => Promise<{ error?: string; success?: string }>) {
    const result = await action();
    if (result.error) toast.error(result.error);
    else if (result.success) toast.success(result.success);
  }

  const dialogs = (
    <>
      <TaskFormDialog open={formOpen} onOpenChange={setFormOpen} task={editing} todayKey={todayKey} defaultKind={defaultKind} />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        title="Excluir tarefa?"
        description={
          deleting && isRecurringTask(deleting)
            ? `"${deleting.title}" deixa de aparecer nos próximos dias. Os dias anteriores continuam no histórico.`
            : `"${deleting?.title}" será removida permanentemente.`
        }
        onConfirm={() => deleting && runAction(() => deleteTaskAction(deleting.id))}
      />

      <ConfirmDialog
        open={!!ending}
        onOpenChange={(open) => !open && setEnding(undefined)}
        title="Encerrar repetição?"
        description={`"${ending?.title}" para de aparecer a partir de hoje. O que já foi feito continua no histórico.`}
        confirmLabel="Encerrar"
        onConfirm={() => ending && runAction(() => endTaskRecurrenceAction(ending.id))}
      />
    </>
  );

  return {
    dialogs,
    openCreate(kind: TaskKind = "dia") {
      setEditing(undefined);
      setDefaultKind(kind);
      setFormOpen(true);
    },
    openEdit(task: Task) {
      setEditing(task);
      setFormOpen(true);
    },
    askDelete: setDeleting,
    askEnd: setEnding,
  };
}
