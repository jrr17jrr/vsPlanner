"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, ListChecks, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LinkedTaskPanel } from "@/components/tarefas/linked-task-panel";
import { groupSubtasks, type Subtask } from "@/lib/task-schedule";
import { cn } from "@/lib/utils";
import type { Activity, Task } from "@/types/database.types";

/**
 * Atividade da Rotina vinculada a uma tarefa. O checkbox marca só a
 * SESSÃO daquele dia (activity_completions) — concluir a tarefa inteira
 * fica no painel, para a tarefa não sumir das próximas semanas. Clicar no
 * nome expande a tarefa completa aqui mesmo.
 */
export function LinkedRoutineItem({
  activity,
  task,
  subtasks,
  date,
  todayKey,
  sessionDone,
  onToggleSession,
  onEdit,
  onDelete,
  defaultOpen = false,
}: {
  activity: Activity;
  task: Task;
  subtasks: Subtask[];
  date: string;
  todayKey: string;
  sessionDone: boolean;
  onToggleSession: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const sections = groupSubtasks(subtasks, { todayKey, dateKey: date });
  const pendingToday = sections.today.filter((e) => !e.subtask.is_done).length;
  const taskDone = task.recurrence !== "weekly" && task.status === "concluida";

  return (
    <div className={cn("rounded-lg border bg-card px-3 py-2.5", sections.overdue.length > 0 && !taskDone ? "border-destructive/30" : "border-border")}>
      <div className="flex min-h-10 items-center gap-3">
        <Checkbox checked={sessionDone} onCheckedChange={onToggleSession} className="shrink-0" aria-label={`Marcar a sessão de ${task.title} como feita neste dia`} />
        <span className="w-12 shrink-0 text-xs font-medium tabular-nums text-muted-foreground">{activity.start_time.slice(0, 5)}</span>
        <button type="button" className="flex min-w-0 flex-1 items-center gap-1.5 text-left" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? <ChevronDown className="h-4 w-4 shrink-0 text-primary" /> : <ChevronRight className="h-4 w-4 shrink-0 text-primary" />}
          <span className="min-w-0">
            <span className={cn("block truncate text-sm font-medium text-foreground", (sessionDone || taskDone) && "line-through opacity-70")}>{task.title}</span>
            <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              <Badge variant="secondary" className="h-5 border-0 px-1.5 text-[10px]"><ListChecks className="mr-0.5 h-3 w-3" />Tarefa</Badge>
              {sections.total > 0 && <span>{sections.done}/{sections.total} subtarefas · {sections.progress}%</span>}
              {pendingToday > 0 && <span className="font-medium text-primary">{pendingToday} para o dia</span>}
              {sections.overdue.length > 0 && <span className="font-medium text-destructive">{sections.overdue.length} atrasada{sections.overdue.length > 1 ? "s" : ""}</span>}
              {taskDone && <span>tarefa concluída</span>}
              {activity.specific_date && <span>· só neste dia</span>}
            </span>
          </span>
        </button>
        {(onEdit || onDelete) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label="Mais ações">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onEdit && <DropdownMenuItem onClick={onEdit}><Pencil className="h-4 w-4" /> Editar horário/dias</DropdownMenuItem>}
              {onDelete && <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive"><Trash2 className="h-4 w-4" /> Tirar da rotina</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {open && <LinkedTaskPanel task={task} subtasks={subtasks} dateKey={date} todayKey={todayKey} />}
    </div>
  );
}
