"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, Check, Flag, Repeat, Square } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExpandableDescription } from "@/components/shared/expandable-description";
import { Subtasks } from "@/components/shared/subtasks";
import { toggleTaskStatusAction } from "@/lib/supabase/personal-actions";
import { scheduleState, taskSchedule, type Subtask } from "@/lib/task-schedule";
import { formatWeekdays, isRecurringTask } from "@/lib/tasks";
import { formatDate, nowTimeSaoPaulo } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Task } from "@/types/database.types";

/**
 * Tarefa completa aberta DENTRO da tela (Rotina / Meu Dia), sem navegar:
 * nome, descrição, datas, prioridade, status e as subtarefas organizadas
 * em Para fazer hoje → Atrasadas → Todas. Sempre o registro original —
 * qualquer conclusão aqui vale para Tarefas, Meu Dia e Rotina.
 */
export function LinkedTaskPanel({
  task,
  subtasks,
  dateKey,
  todayKey,
}: {
  task: Task;
  subtasks: Subtask[];
  /** Dia sendo visualizado (Rotina pode estar em outro dia da semana). */
  dateKey: string;
  todayKey: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const recurring = isRecurringTask(task);
  const schedule = taskSchedule(task);
  const done = !recurring && task.status === "concluida";
  const state = scheduleState(schedule, done, { todayKey, nowTime: nowTimeSaoPaulo() });

  function toggleTask() {
    start(async () => {
      const result = await toggleTaskStatusAction(task.id, done ? "pendente" : "concluida");
      if (result.error) toast.error(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="mt-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className={cn("break-words font-semibold text-foreground", done && "line-through")}>{task.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            {done ? <Badge variant="secondary" className="border-0">Concluída</Badge> : <Badge variant="outline">Pendente</Badge>}
            {task.priority === "importante" && <Badge variant="destructive" className="border-0">Importante</Badge>}
            {recurring && <span className="flex items-center gap-1"><Repeat className="h-3 w-3" />{formatWeekdays(task.weekdays)}</span>}
            {schedule.executionDate && (
              <span className={cn("flex items-center gap-1", state.executionOverdue && "font-medium text-warning")}>
                <CalendarClock className="h-3 w-3" />Execução {formatDate(schedule.executionDate)}{schedule.executionTime && ` · ${schedule.executionTime}`}
              </span>
            )}
            {schedule.deadlineDate && (
              <span className={cn("flex items-center gap-1", state.deadlineOverdue && "font-medium text-destructive")}>
                <Flag className="h-3 w-3" />Prazo {formatDate(schedule.deadlineDate)}{schedule.deadlineTime && ` · ${schedule.deadlineTime}`}
                {state.deadlineOverdue && " (vencido)"}
              </span>
            )}
          </div>
        </div>
        {!recurring && (
          <Button type="button" size="sm" variant={done ? "secondary" : "outline"} className="h-9 shrink-0 gap-1.5" disabled={pending} onClick={toggleTask}>
            {done ? <Check className="h-4 w-4 text-success" /> : <Square className="h-4 w-4" />}
            {done ? "Tarefa concluída" : "Concluir tarefa"}
          </Button>
        )}
      </div>
      <ExpandableDescription text={task.description} className="mt-1" />
      <Subtasks parentType="pessoal" parentId={task.id} initialItems={subtasks} initialOpen dateKey={dateKey} onChanged={() => router.refresh()} />
    </div>
  );
}
