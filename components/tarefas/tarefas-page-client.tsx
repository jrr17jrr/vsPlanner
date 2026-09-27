"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, ListChecks, Repeat, MapPin, MoreVertical, Pencil, Trash2, CircleStop, CalendarDays } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { ChecklistItem } from "@/components/shared/checklist-item";
import { DayTaskItem } from "@/components/tarefas/day-task-item";
import { useTaskToggle } from "@/components/tarefas/use-task-toggle";
import { useTaskDialogs } from "@/components/tarefas/use-task-dialogs";
import { moveTaskDateAction } from "@/lib/supabase/personal-actions";
import {
  formatWeekdays,
  getDayTaskEntries,
  getMissedDayTaskEntries,
  getUpcomingDayTaskEntries,
  groupDeadlineTasks,
  isRecurrenceEnded,
  isRecurringTask,
  TASKS_PAGE_LOOKBACK_DAYS,
  type DayTaskEntry,
} from "@/lib/tasks";
import { formatDate, formatDateShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Task, TaskOccurrence } from "@/types/database.types";

type Tab = "dia" | "prazo" | "concluidas";

export function TarefasPageClient({
  tasks,
  occurrences,
  todayKey,
}: {
  tasks: Task[];
  occurrences: TaskOccurrence[];
  /** "Hoje" calculado no servidor (America/Sao_Paulo). */
  todayKey: string;
}) {
  const [tab, setTab] = useState<Tab>("dia");
  const toggle = useTaskToggle();
  const dialogs = useTaskDialogs(todayKey);

  const todayEntries = getDayTaskEntries(tasks, occurrences, todayKey, todayKey);
  const missed = getMissedDayTaskEntries(tasks, occurrences, todayKey, TASKS_PAGE_LOOKBACK_DAYS);
  const upcoming = getUpcomingDayTaskEntries(tasks, todayKey);
  const recurring = tasks.filter(isRecurringTask);
  const activeRecurring = recurring.filter((t) => !isRecurrenceEnded(t, todayKey));
  const endedRecurring = recurring.filter((t) => isRecurrenceEnded(t, todayKey));
  const deadlines = groupDeadlineTasks(tasks, todayKey);
  const completed = tasks
    .filter((t) => !isRecurringTask(t) && t.status === "concluida")
    .sort((a, b) => (b.completed_at ?? b.updated_at).localeCompare(a.completed_at ?? a.updated_at));

  const pendingDeadlineCount = deadlines.overdue.length + deadlines.dueToday.length + deadlines.upcoming.length + deadlines.noDate.length;
  const dayTabEmpty = todayEntries.length === 0 && missed.length === 0 && upcoming.length === 0 && recurring.length === 0;

  function renderEntry(entry: DayTaskEntry, withActions = true) {
    const recurringTask = entry.recurring;
    return (
      <DayTaskItem
        key={entry.key}
        entry={entry}
        done={toggle.isEntryDone(entry)}
        onToggle={() => toggle.toggleEntry(entry)}
        onEdit={withActions && !entry.task.archived_at ? () => dialogs.openEdit(entry.task) : undefined}
        onEndRecurrence={withActions && recurringTask && !isRecurrenceEnded(entry.task, todayKey) ? () => dialogs.askEnd(entry.task) : undefined}
        onDelete={withActions && !entry.task.archived_at ? () => dialogs.askDelete(entry.task) : undefined}
      />
    );
  }

  function renderDeadline(task: Task, overdue = false) {
    return (
      <ChecklistItem
        key={task.id}
        title={task.title}
        done={toggle.isTaskDone(task)}
        time={task.scheduled_time?.slice(0, 5)}
        onToggle={() => toggle.toggleTask(task)}
        onEdit={() => dialogs.openEdit(task)}
        onDelete={() => dialogs.askDelete(task)}
        onMove={(d) => moveTaskDateAction(task.id, d).then((r) => r.error && toast.error(r.error))}
        className={cn(overdue && "border-destructive/40")}
        badges={
          <>
            {overdue && <Badge variant="destructive" className="border-0">Atrasada</Badge>}
            {task.priority === "importante" && <Badge variant="destructive" className="border-0">Importante</Badge>}
            {task.due_date && <span className="text-[11px] text-muted-foreground">prazo {formatDate(task.due_date)}</span>}
            {task.category && <span className="text-[11px] text-muted-foreground">{task.category}</span>}
          </>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Tarefas"
        description="Tarefas do dia (inclusive as que se repetem) e tarefas com prazo."
        actions={
          <Button size="sm" onClick={() => dialogs.openCreate(tab === "prazo" ? "prazo" : "dia")}>
            <Plus className="h-4 w-4" /> Nova tarefa
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="dia" className="flex-1 sm:flex-none">Do dia</TabsTrigger>
          <TabsTrigger value="prazo" className="flex-1 sm:flex-none">
            Com prazo{pendingDeadlineCount > 0 && <span className="ml-1 text-muted-foreground">({pendingDeadlineCount})</span>}
          </TabsTrigger>
          <TabsTrigger value="concluidas" className="flex-1 sm:flex-none">Concluídas</TabsTrigger>
        </TabsList>

        <TabsContent value="dia" className="mt-4 flex flex-col gap-6">
          {dayTabEmpty ? (
            <EmptyState
              icon={CalendarDays}
              title="Nenhuma tarefa do dia"
              description="Crie algo para fazer num dia específico — ou que se repete em alguns dias da semana."
              action={
                <Button size="sm" onClick={() => dialogs.openCreate("dia")}>
                  <Plus className="h-4 w-4" /> Nova tarefa do dia
                </Button>
              }
            />
          ) : (
            <>
              {missed.length > 0 && (
                <Section title="Ficou pendente" hint={`${missed.length}`}>
                  {missed.map((e) => renderEntry(e, false))}
                </Section>
              )}

              <Section title="Hoje">
                {todayEntries.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">Nada marcado para hoje.</p>
                ) : (
                  todayEntries.map((e) => renderEntry(e))
                )}
              </Section>

              {upcoming.length > 0 && (
                <Section title="Próximos dias">
                  {upcoming.map((e) => (
                    <div key={e.key} className="flex flex-col gap-1">
                      <span className="px-1 text-[11px] font-medium text-muted-foreground">{formatDate(e.date)}</span>
                      {renderEntry(e)}
                    </div>
                  ))}
                </Section>
              )}

              {recurring.length > 0 && (
                <Section title="Repetições">
                  {activeRecurring.map((t) => (
                    <RecurringRow
                      key={t.id}
                      task={t}
                      onEdit={() => dialogs.openEdit(t)}
                      onEnd={() => dialogs.askEnd(t)}
                      onDelete={() => dialogs.askDelete(t)}
                    />
                  ))}
                  {endedRecurring.map((t) => (
                    <RecurringRow key={t.id} task={t} ended onDelete={() => dialogs.askDelete(t)} />
                  ))}
                </Section>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="prazo" className="mt-4 flex flex-col gap-6">
          {pendingDeadlineCount === 0 ? (
            <EmptyState
              icon={ListChecks}
              title="Nenhuma tarefa com prazo pendente"
              description="Use para coisas que precisam estar prontas até uma data."
              action={
                <Button size="sm" onClick={() => dialogs.openCreate("prazo")}>
                  <Plus className="h-4 w-4" /> Nova tarefa com prazo
                </Button>
              }
            />
          ) : (
            <>
              {deadlines.overdue.length > 0 && <Section title="Atrasadas">{deadlines.overdue.map((t) => renderDeadline(t, true))}</Section>}
              {deadlines.dueToday.length > 0 && <Section title="Vence hoje">{deadlines.dueToday.map((t) => renderDeadline(t))}</Section>}
              {deadlines.upcoming.length > 0 && <Section title="Próximas">{deadlines.upcoming.map((t) => renderDeadline(t))}</Section>}
              {deadlines.noDate.length > 0 && <Section title="Sem prazo">{deadlines.noDate.map((t) => renderDeadline(t))}</Section>}
            </>
          )}
        </TabsContent>

        <TabsContent value="concluidas" className="mt-4 flex flex-col gap-2">
          {completed.length === 0 ? (
            <EmptyState icon={ListChecks} title="Nenhuma tarefa concluída ainda" description="Dias concluídos de tarefas recorrentes ficam no Histórico." />
          ) : (
            completed.map((task) => (
              <ChecklistItem
                key={task.id}
                title={task.title}
                done={toggle.isTaskDone(task)}
                time={task.scheduled_time?.slice(0, 5)}
                onToggle={() => toggle.toggleTask(task)}
                onDelete={() => dialogs.askDelete(task)}
                badges={
                  <>
                    <span className="text-[11px] text-muted-foreground">{task.kind === "dia" ? "Do dia" : "Com prazo"}</span>
                    {task.due_date && <span className="text-[11px] text-muted-foreground">{formatDate(task.due_date)}</span>}
                  </>
                }
              />
            ))
          )}
        </TabsContent>
      </Tabs>

      {dialogs.dialogs}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
        {hint && <span className="text-xs text-muted-foreground">({hint})</span>}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

/** Definição de uma tarefa recorrente (não um dia específico). */
function RecurringRow({
  task,
  ended,
  onEdit,
  onEnd,
  onDelete,
}: {
  task: Task;
  ended?: boolean;
  onEdit?: () => void;
  onEnd?: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={cn("flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2.5", ended && "opacity-60")}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground">
        <Repeat className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-medium text-foreground">{task.title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {formatWeekdays(task.weekdays)}
          {task.scheduled_time && ` · ${task.scheduled_time.slice(0, 5)}`}
        </p>
        {task.location && (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" /> {task.location}
          </p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {task.priority === "importante" && <Badge variant="destructive" className="border-0">Importante</Badge>}
          {ended && task.recurrence_until && (
            <Badge variant="secondary" className="border-0">Encerrada em {formatDateShort(task.recurrence_until)}</Badge>
          )}
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label="Mais ações">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {onEdit && (
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="h-4 w-4" /> Editar
            </DropdownMenuItem>
          )}
          {onEnd && (
            <DropdownMenuItem onClick={onEnd}>
              <CircleStop className="h-4 w-4" /> Encerrar repetição
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
            <Trash2 className="h-4 w-4" /> Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
