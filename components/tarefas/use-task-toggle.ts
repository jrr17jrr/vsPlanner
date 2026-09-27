"use client";

import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { toggleTaskOccurrenceAction, toggleTaskStatusAction } from "@/lib/supabase/personal-actions";
import type { DayTaskEntry } from "@/lib/tasks";
import type { Task } from "@/types/database.types";

/**
 * Conclusão otimista compartilhada por Meu Dia e Tarefas. Recorrente →
 * conclui SÓ aquele dia (`toggleTaskOccurrenceAction`); não recorrente →
 * status da própria tarefa. O valor otimista some quando a action termina
 * e os dados do servidor (revalidados) chegam.
 */
export function useTaskToggle() {
  const [, startTransition] = useTransition();
  const [overrides, setOverride] = useOptimistic<Record<string, boolean>, { key: string; done: boolean }>(
    {},
    (state, { key, done }) => ({ ...state, [key]: done })
  );

  function run(key: string, next: boolean, action: () => Promise<{ error?: string }>) {
    startTransition(async () => {
      setOverride({ key, done: next });
      const result = await action();
      if (result.error) toast.error(result.error);
    });
  }

  return {
    isEntryDone: (entry: DayTaskEntry) => overrides[entry.key] ?? entry.done,
    isTaskDone: (task: Task) => overrides[task.id] ?? task.status === "concluida",
    toggleEntry(entry: DayTaskEntry) {
      const next = !(overrides[entry.key] ?? entry.done);
      run(entry.key, next, () =>
        entry.recurring
          ? toggleTaskOccurrenceAction(entry.task.id, entry.date, next)
          : toggleTaskStatusAction(entry.task.id, next ? "concluida" : "pendente")
      );
    },
    toggleTask(task: Task) {
      const next = !(overrides[task.id] ?? task.status === "concluida");
      run(task.id, next, () => toggleTaskStatusAction(task.id, next ? "concluida" : "pendente"));
    },
  };
}
