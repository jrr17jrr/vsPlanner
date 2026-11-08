"use client";

import { CheckCircle2, Circle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDateShort, weekdayLabel } from "@/lib/format";
import { taskExecutionHistory, weekdayOfKey } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import type { Task, TaskOccurrence } from "@/types/database.types";

/**
 * Histórico de execuções de UMA recorrente (janela carregada na página):
 * cada dia com o próprio estado. Só leitura — concluir/reabrir fica no
 * card (um dia por vez). O histórico completo continua em /historico.
 */
export function ExecutionHistoryDialog({ task, occurrences, todayKey, onOpenChange }: {
  task: Task | null;
  occurrences: TaskOccurrence[];
  todayKey: string;
  onOpenChange: (open: boolean) => void;
}) {
  const history = task ? taskExecutionHistory(task, occurrences, todayKey) : [];
  const done = history.filter((h) => h.done).length;
  return (
    <Dialog open={!!task} onOpenChange={onOpenChange}>
      {task && (
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="break-words">Histórico · {task.title}</DialogTitle>
            <p className="text-xs text-muted-foreground">{done} de {history.length} execuções concluídas nos últimos 30 dias.</p>
          </DialogHeader>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma execução registrada ainda.</p>
          ) : (
            <ul className="max-h-[60vh] divide-y divide-border/60 overflow-y-auto overscroll-contain text-sm">
              {history.map((h) => (
                <li key={h.date} className="flex min-h-10 items-center gap-2 py-1.5">
                  {h.done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" /> : <Circle className={cn("h-4 w-4 shrink-0", h.date < todayKey ? "text-warning" : "text-muted-foreground")} />}
                  <span className="w-24 shrink-0 tabular-nums">{weekdayLabel(weekdayOfKey(h.date)).slice(0, 3)} {formatDateShort(h.date)}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{h.title !== task.title ? h.title : ""}</span>
                  <span className={cn("shrink-0 text-xs", h.done ? "text-emerald-500" : h.date < todayKey ? "text-warning" : "text-muted-foreground")}>
                    {h.done ? "Concluída" : h.date < todayKey ? "Pendente" : "Hoje"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      )}
    </Dialog>
  );
}
