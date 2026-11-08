"use client";

import { useRouter } from "next/navigation";
import { Flag, History, MapPin, Repeat } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Subtasks, type ExpandSignal } from "@/components/shared/subtasks";
import { ExpandableDescription } from "@/components/shared/expandable-description";
import { TaskCard } from "@/components/tarefas/task-card";
import { formatDateShort, todayKeySaoPaulo, weekdayLabel } from "@/lib/format";
import { formatWeekdays, weekdayOfKey, type DayTaskEntry } from "@/lib/tasks";
import { groupSubtasks, type Subtask } from "@/lib/task-schedule";
import { missedSubtaskDates, resolveSubtasksForDay } from "@/lib/subtask-recurrence";
import { cn } from "@/lib/utils";

export function hasSubtaskHighlights(subtasks: Subtask[], todayKey = todayKeySaoPaulo()) {
  const g = groupSubtasks(resolveSubtasksForDay(subtasks, todayKey), { todayKey });
  return g.today.some((e) => !e.subtask.is_done) || g.overdue.length > 0 || subtasks.some((s) => missedSubtaskDates(s, todayKey).length > 0);
}

const day = (key: string) => `${weekdayLabel(weekdayOfKey(key)).slice(0, 3)} ${formatDateShort(key)}`;

/**
 * Uma tarefa do dia (ou uma recorrente) — card ÚNICO com a tarefa e as
 * subtarefas dentro. Recorrente com outras execuções pendentes: elas
 * aparecem DENTRO do mesmo card, cada uma com a própria data e o próprio
 * checkbox (o agrupamento é só visual; concluir um dia nunca conclui outro).
 * Campos vazios (horário, local) não aparecem.
 */
export function DayTaskItem({
  entry,
  subtasks,
  done,
  onToggle,
  onEdit,
  onDelete,
  onEndRecurrence,
  pending = [],
  isPendingDone,
  onTogglePending,
  onHistory,
  expandSignal,
}: {
  entry: DayTaskEntry;
  /** Subtarefas já carregadas no servidor — abre direto se houver algo para hoje/atrasado. */
  subtasks?: Subtask[];
  done: boolean;
  onToggle: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onEndRecurrence?: () => void;
  /** Outras execuções pendentes da mesma recorrente (dias anteriores). */
  pending?: DayTaskEntry[];
  isPendingDone?: (e: DayTaskEntry) => boolean;
  onTogglePending?: (e: DayTaskEntry) => void;
  /** Abre o histórico de execuções (recorrentes). */
  onHistory?: () => void;
  expandSignal?: ExpandSignal;
}) {
  const router = useRouter();
  const overdue = entry.overdue && !done;
  const deadlineOverdue = entry.deadlineOverdue && !done;
  const openPending = pending.filter((e) => !(isPendingDone?.(e) ?? e.done));

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
      onHistory={onHistory}
      meta={
        <>
          {overdue && <Badge variant="warning" className="border-0">Execução pendente · {day(entry.date)}</Badge>}
          {openPending.length > 0 && <Badge variant="warning" className="border-0">+{openPending.length} dia{openPending.length > 1 ? "s" : ""} pendente{openPending.length > 1 ? "s" : ""}</Badge>}
          {entry.deadlineDate && (deadlineOverdue ? (
            <Badge variant="destructive" className="border-0">Prazo vencido · {formatDateShort(entry.deadlineDate)}</Badge>
          ) : (
            <span className={cn("inline-flex items-center gap-1", done && "line-through")}>
              <Flag className="h-3 w-3" /> Prazo {day(entry.deadlineDate)}{entry.deadlineTime && ` · ${entry.deadlineTime}`}
            </span>
          ))}
          {entry.recurring && (
            <span className="inline-flex items-center gap-1"><Repeat className="h-3 w-3" /> {formatWeekdays(entry.task.weekdays)}</span>
          )}
          {entry.location && (
            <span className="inline-flex min-w-0 items-center gap-1"><MapPin className="h-3 w-3 shrink-0" /><span className="break-words">{entry.location}</span></span>
          )}
        </>
      }
    >
      {pending.length > 0 && (
        <div className="mt-2 rounded-md border border-amber-400/40 bg-amber-400/5 p-2" aria-label="Execuções pendentes de dias anteriores">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-warning">Execuções anteriores pendentes</p>
          <ul className="flex flex-wrap gap-1.5">
            {pending.map((e) => {
              const isDone = isPendingDone?.(e) ?? e.done;
              return (
                <li key={e.key}>
                  <label className={cn("inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-card px-2 text-xs", isDone && "opacity-60")}>
                    <input type="checkbox" className="h-4 w-4 accent-primary" checked={isDone} onChange={() => onTogglePending?.(e)} aria-label={`${isDone ? "Reabrir" : "Concluir"} ${e.title} de ${day(e.date)}`} />
                    <span className={cn(isDone && "line-through")}>{day(e.date)}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <ExpandableDescription text={entry.task.description} className="mt-1" />
      {entry.notes && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{entry.notes}</p>}
      <Subtasks
        embedded
        parentType="pessoal"
        parentId={entry.task.id}
        initialItems={subtasks}
        initialOpen={!!subtasks && hasSubtaskHighlights(subtasks)}
        onChanged={() => router.refresh()}
        expandSignal={expandSignal}
      />
      {onHistory && (
        <button type="button" onClick={onHistory} className="mt-1 inline-flex min-h-9 items-center gap-1 text-xs text-primary hover:underline">
          <History className="h-3.5 w-3.5" /> Ver histórico de execuções
        </button>
      )}
    </TaskCard>
  );
}
