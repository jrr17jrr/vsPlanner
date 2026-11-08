"use client";
import { Subtasks, type ExpandSignal } from "@/components/shared/subtasks";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, ListChecks, Repeat, MapPin, MoreVertical, Pencil, Trash2, CircleStop, CalendarDays, Flag, History, FolderTree } from "lucide-react";
import { TaskCard } from "@/components/tarefas/task-card";
import { EmptySection, TaskList, TaskSection, type SectionTone } from "@/components/shared/task-section";
import { ExpandableDescription } from "@/components/shared/expandable-description";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { DayTaskItem, hasSubtaskHighlights } from "@/components/tarefas/day-task-item";
import { ExecutionHistoryDialog } from "@/components/tarefas/execution-history-dialog";
import { useTaskToggle } from "@/components/tarefas/use-task-toggle";
import { useTaskDialogs } from "@/components/tarefas/use-task-dialogs";
import { moveTaskDeadlineAction } from "@/lib/supabase/personal-actions";
import { taskSchedule, type Subtask } from "@/lib/task-schedule";
import {
  buildDayTaskRows,
  formatWeekdays,
  getDayTaskEntries,
  isOrganizerTask,
  getMissedDayTaskEntries,
  getUpcomingDayTaskEntries,
  groupDeadlineTasks,
  isRecurrenceEnded,
  isRecurringTask,
  TASKS_PAGE_LOOKBACK_DAYS,
  type DayTaskRow,
} from "@/lib/tasks";
import { formatDate, formatDateShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Task, TaskOccurrence } from "@/types/database.types";
import { QuickCreateListener } from "@/components/shared/quick-create-listener";

type Tab = "dia" | "prazo" | "concluidas";
const byPriority = <T extends {priority:string}>(a:T,b:T) => Number(b.priority === "importante") - Number(a.priority === "importante");

export function TarefasPageClient({
  tasks,
  occurrences,
  todayKey,
  subtasksByTask = {},
}: {
  tasks: Task[];
  occurrences: TaskOccurrence[];
  /** Subtarefas originais por tarefa (carregadas no servidor). */
  subtasksByTask?: Record<string, Subtask[]>;
  /** "Hoje" calculado no servidor (America/Sao_Paulo). */
  todayKey: string;
}) {
  const [tab, setTab] = useState<Tab>("dia");
  const [expandSignal, setExpandSignal] = useState<ExpandSignal | undefined>(undefined);
  const [historyTask, setHistoryTask] = useState<Task | null>(null);
  const expandAll = (open: boolean) => setExpandSignal((s) => ({ open, version: (s?.version ?? 0) + 1 }));
  const toggle = useTaskToggle();
  const dialogs = useTaskDialogs(todayKey);
  const router = useRouter();
  const refresh = () => router.refresh();

  const todayEntries = getDayTaskEntries(tasks, occurrences, todayKey, todayKey).sort((a,b)=>byPriority(a.task,b.task));
  const missed = getMissedDayTaskEntries(tasks, occurrences, todayKey, TASKS_PAGE_LOOKBACK_DAYS).sort((a,b)=>byPriority(a.task,b.task));
  const upcoming = getUpcomingDayTaskEntries(tasks, todayKey).sort((a,b)=>byPriority(a.task,b.task));
  // UMA linha por tarefa: recorrente com vários dias pendentes vira um card só (agrupamento visual).
  const rows = buildDayTaskRows(todayEntries, missed);
  const organizers = tasks.filter((t) => isOrganizerTask(t) && !t.archived_at).sort(byPriority);
  const recurring = tasks.filter(isRecurringTask).sort(byPriority);
  const activeRecurring = recurring.filter((t) => !isRecurrenceEnded(t, todayKey));
  const endedRecurring = recurring.filter((t) => isRecurrenceEnded(t, todayKey));
  const deadlines = groupDeadlineTasks(tasks, todayKey);
  deadlines.overdue.sort(byPriority);
  deadlines.dueToday.sort(byPriority);
  deadlines.upcoming.sort(byPriority);
  deadlines.noDate.sort(byPriority);
  const completed = tasks
    .filter((t) => !isRecurringTask(t) && t.status === "concluida")
    .sort((a, b) => (b.completed_at ?? b.updated_at).localeCompare(a.completed_at ?? a.updated_at));

  const pendingDeadlineCount = deadlines.overdue.length + deadlines.dueToday.length + deadlines.upcoming.length + deadlines.noDate.length;
  const dayTabEmpty = todayEntries.length === 0 && missed.length === 0 && upcoming.length === 0 && recurring.length === 0 && organizers.length === 0;

  function renderRow(row: DayTaskRow) {
    const entry = row.primary;
    const recurringTask = entry.recurring;
    return (
      <DayTaskItem
        key={row.key}
        entry={entry}
        subtasks={subtasksByTask[entry.task.id] ?? []}
        done={toggle.isEntryDone(entry)}
        onToggle={() => toggle.toggleEntry(entry)}
        pending={row.pending}
        isPendingDone={toggle.isEntryDone}
        onTogglePending={(e) => toggle.toggleEntry(e)}
        onHistory={recurringTask ? () => setHistoryTask(entry.task) : undefined}
        onEdit={!entry.task.archived_at ? () => dialogs.openEdit(entry.task) : undefined}
        onEndRecurrence={recurringTask && !isRecurrenceEnded(entry.task, todayKey) ? () => dialogs.askEnd(entry.task) : undefined}
        onDelete={!entry.task.archived_at ? () => dialogs.askDelete(entry.task) : undefined}
        expandSignal={expandSignal}
      />
    );
  }

  /** Organizadora: sem checkbox, sem data, nunca "atrasada" — só o card com as subtarefas (cada uma com a própria programação). */
  function renderOrganizer(task: Task) {
    const subtasks = subtasksByTask[task.id] ?? [];
    return (
      <TaskCard
        key={task.id}
        title={task.title}
        done={false}
        important={task.priority === "importante"}
        onEdit={() => dialogs.openEdit(task)}
        onDelete={() => dialogs.askDelete(task)}
        meta={<span className="inline-flex items-center gap-1"><FolderTree className="h-3 w-3" />Organizadora · sem dia fixo</span>}
      >
        <ExpandableDescription text={task.description} className="mt-1" />
        <Subtasks embedded parentType="pessoal" parentId={task.id} initialItems={subtasks} initialOpen={hasSubtaskHighlights(subtasks, todayKey)} onChanged={refresh} expandSignal={expandSignal} />
      </TaskCard>
    );
  }

  /** Tarefa com prazo: UM card (cabeçalho + subtarefas dentro). */
  function renderDeadline(task: Task, overdue = false, dueToday = false) {
    const schedule = taskSchedule(task);
    const done = toggle.isTaskDone(task);
    const subtasks = subtasksByTask[task.id] ?? [];
    return (
      <TaskCard
        key={task.id}
        title={task.title}
        done={done}
        time={schedule.executionTime ?? schedule.deadlineTime ?? undefined}
        accent={overdue && !done ? "danger" : dueToday && !done ? "primary" : "default"}
        important={task.priority === "importante"}
        onToggle={() => toggle.toggleTask(task)}
        onEdit={() => dialogs.openEdit(task)}
        onDelete={() => dialogs.askDelete(task)}
        onMove={(d) => moveTaskDeadlineAction(task.id, d).then((r) => r.error && toast.error(r.error))}
        moveLabel="Alterar prazo"
        meta={
          <>
            {overdue && <Badge variant="destructive" className="h-5 border-0 px-1.5 text-[10px]">Prazo vencido</Badge>}
            {schedule.deadlineDate && <span className={cn("inline-flex items-center gap-1", overdue && "font-medium text-destructive")}><Flag className="h-3 w-3" />Prazo {formatDate(schedule.deadlineDate)}{schedule.deadlineTime && ` · ${schedule.deadlineTime}`}</span>}
            {schedule.executionDate && <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" />Fazer {formatDate(schedule.executionDate)}{schedule.executionTime && ` · ${schedule.executionTime}`}</span>}
            {task.category && <span>{task.category}</span>}
          </>
        }
      >
        <ExpandableDescription text={task.description} className="mt-1" />
        <Subtasks embedded parentType="pessoal" parentId={task.id} initialItems={subtasks} onChanged={refresh} expandSignal={expandSignal} />
      </TaskCard>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <QuickCreateListener kinds={["tarefa"]} onOpen={() => { setTab("dia"); dialogs.openCreate("dia"); }} />
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
        {tab !== "concluidas" && (
          <div className="mt-3 flex flex-wrap justify-end gap-1.5">
            <Button type="button" variant="ghost" size="sm" className="h-9 text-xs" onClick={() => expandAll(true)}>Expandir todas</Button>
            <Button type="button" variant="ghost" size="sm" className="h-9 text-xs" onClick={() => expandAll(false)}>Recolher todas</Button>
          </div>
        )}

        <TabsContent value="dia" className="mt-5 flex flex-col gap-8">
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
              {rows.overdue.length > 0 && (
                <Section title="Atrasadas" tone="danger" count={rows.overdue.length}>
                  {rows.overdue.map(renderRow)}
                </Section>
              )}

              <Section title="Hoje" tone="primary" count={rows.today.length}>
                {rows.today.length === 0 ? (
                  <EmptySection>Nada marcado para hoje.</EmptySection>
                ) : (
                  rows.today.map(renderRow)
                )}
              </Section>

              {upcoming.length > 0 && (
                <Section title="Próximos dias" count={upcoming.length}>
                  {upcoming.map((e) => (
                    <div key={e.key} className="flex flex-col gap-1.5">
                      <span className="px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{formatDate(e.date)}</span>
                      {renderRow({ key: e.key, task: e.task, primary: e, pending: [] })}
                    </div>
                  ))}
                </Section>
              )}

              {organizers.length > 0 && (
                <Section title="Organizadoras" count={organizers.length}>
                  {organizers.map(renderOrganizer)}
                </Section>
              )}

              {recurring.length > 0 && (
                <Section title="Repetições" count={recurring.length}>
                  {activeRecurring.map((t) => (
                    <RecurringRow
                      key={t.id}
                      task={t}
                      onEdit={() => dialogs.openEdit(t)}
                      onEnd={() => dialogs.askEnd(t)}
                      onDelete={() => dialogs.askDelete(t)}
                      onHistory={() => setHistoryTask(t)}
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

        <TabsContent value="prazo" className="mt-5 flex flex-col gap-8">
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
              {deadlines.overdue.length > 0 && <Section title="Atrasadas" tone="danger" count={deadlines.overdue.length}>{deadlines.overdue.map((t) => renderDeadline(t, true))}</Section>}
              {deadlines.dueToday.length > 0 && <Section title="Vence hoje" tone="primary" count={deadlines.dueToday.length}>{deadlines.dueToday.map((t) => renderDeadline(t, false, true))}</Section>}
              {deadlines.upcoming.length > 0 && <Section title="Próximas" count={deadlines.upcoming.length}>{deadlines.upcoming.map((t) => renderDeadline(t))}</Section>}
              {deadlines.noDate.length > 0 && <Section title="Sem prazo" count={deadlines.noDate.length}>{deadlines.noDate.map((t) => renderDeadline(t))}</Section>}
            </>
          )}
        </TabsContent>

        <TabsContent value="concluidas" className="mt-5 flex flex-col gap-8">
          {completed.length === 0 ? (
            <EmptyState icon={ListChecks} title="Nenhuma tarefa concluída ainda" description="Dias concluídos de tarefas recorrentes ficam no Histórico." />
          ) : (
            <Section title="Concluídas" tone="success" count={completed.length}>
              {completed.map((task) => (
                <TaskCard
                  key={task.id}
                  title={task.title}
                  done={toggle.isTaskDone(task)}
                  time={task.scheduled_time?.slice(0, 5)}
                  accent="success"
                  onToggle={() => toggle.toggleTask(task)}
                  onDelete={() => dialogs.askDelete(task)}
                  meta={
                    <>
                      <span>{task.kind === "dia" ? "Do dia" : "Com prazo"}</span>
                      {task.due_date && <span>{formatDate(task.due_date)}</span>}
                    </>
                  }
                >
                  <ExpandableDescription text={task.description} className="mt-1" />
                </TaskCard>
              ))}
            </Section>
          )}
        </TabsContent>
      </Tabs>

      {dialogs.dialogs}
      <ExecutionHistoryDialog task={historyTask} occurrences={occurrences} todayKey={todayKey} onOpenChange={(o) => !o && setHistoryTask(null)} />
    </div>
  );
}

function Section({ title, count, tone, children }: { title: string; count?: number; tone?: SectionTone; children: React.ReactNode }) {
  return (
    <TaskSection title={title} count={count} tone={tone}>
      <TaskList>{children}</TaskList>
    </TaskSection>
  );
}

/** Definição de uma tarefa recorrente (não um dia específico). */
function RecurringRow({
  task,
  ended,
  onEdit,
  onEnd,
  onDelete,
  onHistory,
}: {
  task: Task;
  ended?: boolean;
  onEdit?: () => void;
  onEnd?: () => void;
  onDelete: () => void;
  onHistory?: () => void;
}) {
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border border-border/70 bg-card px-3 py-2.5 shadow-sm shadow-black/10", ended && "opacity-60")}>
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
          {onHistory && (
            <DropdownMenuItem onClick={onHistory}>
              <History className="h-4 w-4" /> Histórico de execuções
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
