"use client";

import { useRouter } from "next/navigation";
import { Flag, MapPin, Repeat } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Subtasks } from "@/components/shared/subtasks";
import { ExpandableDescription } from "@/components/shared/expandable-description";
import { TaskCard } from "@/components/tarefas/task-card";
import { formatDateShort, todayKeySaoPaulo, weekdayLabel } from "@/lib/format";
import { formatWeekdays, weekdayOfKey, type DayTaskEntry } from "@/lib/tasks";
import { groupSubtasks, type Subtask } from "@/lib/task-schedule";
import { cn } from "@/lib/utils";

function hasHighlights(subtasks: Subtask[]) {
  const g = groupSubtasks(subtasks, { todayKey: todayKeySaoPaulo() });
  return g.today.some((e) => !e.subtask.is_done) || g.overdue.length > 0;
}

/**
 * Uma tarefa do dia (ou um dia de uma recorrente) — card ÚNICO com a tarefa
 * e as subtarefas dentro. Campos vazios (horário, local) não aparecem.
 */
export function DayTaskItem({
  entry,
  subtasks,
  done,
  onToggle,
  onEdit,
  onDelete,
  onEndRecurrence,
}: {
  entry: DayTaskEntry;
  /** Subtarefas já carregadas no servidor — abre direto se houver algo para hoje/atrasado. */
  subtasks?: Subtask[];
  done: boolean;
  onToggle: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onEndRecurrence?: () => void;
}) {
  const router = useRouter();
  const overdue = entry.overdue && !done;
  const deadlineOverdue = entry.deadlineOverdue && !done;
  const day = (key: string) => `${weekdayLabel(weekdayOfKey(key)).slice(0, 3)} ${formatDateShort(key)}`;

  return (
    <TaskCard
      title={entry.title}
      done={done}
      onToggle={onToggle}
      time={entry.time ?? undefined}
      accent={deadlineOverdue ? "danger" : overdue ? "warning" : done ? "success" : "default"}
      important={entry.important}
      onEdit={onEdit}
      onDelete={onDelete}
      onEndRecurrence={onEndRecurrence}
      meta={
        <>
          {overdue && <Badge variant="warning" className="border-0">Execução pendente · {day(entry.date)}</Badge>}
          {entry.deadlineDate && (deadlineOverdue ? (
            <Badge variant="destructive" className="border-0">Prazo vencido · {formatDateShort(entry.deadlineDate)}</Badge>
          ) : (
            <span className={cn("inline-flex items-center gap-1", done && "line-through")}>
              <Flag className="h-3 w-3" /> Prazo {day(entry.deadlineDate)}{entry.deadlineTime && ` · ${entry.deadlineTime}`}
            </span>
          ))}
          {entry.recurring && (
            <span className="inline-flex items-center gap-1"><Repeat className="h-3 w-3" /> {overdue ? "Recorrente" : formatWeekdays(entry.task.weekdays)}</span>
          )}
          {entry.location && (
            <span className="inline-flex min-w-0 items-center gap-1"><MapPin className="h-3 w-3 shrink-0" /><span className="break-words">{entry.location}</span></span>
          )}
        </>
      }
    >
      <ExpandableDescription text={entry.task.description} className="mt-1" />
      {entry.notes && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{entry.notes}</p>}
      <Subtasks
        embedded
        parentType="pessoal"
        parentId={entry.task.id}
        initialItems={subtasks}
        initialOpen={!!subtasks && hasHighlights(subtasks)}
        onChanged={() => router.refresh()}
      />
    </TaskCard>
  );
}
