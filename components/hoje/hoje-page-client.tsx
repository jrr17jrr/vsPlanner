"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowRight, Sun, ListChecks, Repeat, Briefcase, CalendarClock, Plus } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionError } from "@/components/shared/section-error";
import { ChecklistItem, PriorityBadge } from "@/components/shared/checklist-item";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TodayMeetingItem } from "@/components/visionario/reunioes/today-meeting-item";
import { DayTaskItem } from "@/components/tarefas/day-task-item";
import { LinkedRoutineItem } from "@/components/rotina/linked-routine-item";
import { Subtasks } from "@/components/shared/subtasks";
import { planMyDaySections } from "@/lib/my-day-plan";
import { taskDeadline } from "@/lib/tasks";
import type { MyDaySubtaskData } from "@/lib/supabase/my-day-subtasks";
import { useRouter } from "next/navigation";
import { useTaskToggle } from "@/components/tarefas/use-task-toggle";
import { useTaskDialogs } from "@/components/tarefas/use-task-dialogs";
import { updateWorkItemStatusAction } from "@/lib/supabase/work-items-actions";
import { toggleActivityCompletionAction, togglePersonalWorkTaskStatusAction } from "@/lib/supabase/personal-actions";
import { getRealOccurrencesForDay } from "@/lib/routine-real";
import { isRecurrenceEnded, type MyDayTasks } from "@/lib/tasks";
import type { SectionError as SectionErrorData } from "@/lib/supabase/section-result";
import { formatDate, formatDateLong, nowTimeSaoPaulo, parseLocalDate, weekdayLabel } from "@/lib/format";
import type { Activity, ActivityCompletion, Meeting, PersonalWorkTask, Task, WorkItem } from "@/types/database.types";

export function HojePageClient({
  todayKey,
  myDay: loadedMyDay,
  meetings,
  meetingParticipantNames,
  workItems,
  workItemAssigneeNames,
  activities,
  completions: initialCompletions,
  workTasks: initialWorkTasks,
  subtaskData,
  errors,
}: {
  /** "Hoje" calculado no servidor (America/Sao_Paulo) — nunca recalculado no navegador, pra nunca divergir do que foi buscado. */
  todayKey: string;
  /** Tarefas do dia/pendentes/prazos — mesma fonte (`loadMyDayTasks`) do Dashboard. `null` = falhou (ver `errors.tarefas`). */
  myDay: MyDayTasks | null;
  meetings: Meeting[];
  meetingParticipantNames: Record<string, string[]>;
  workItems: WorkItem[];
  workItemAssigneeNames: Record<string, string[]>;
  activities: Activity[];
  completions: ActivityCompletion[];
  workTasks: PersonalWorkTask[];
  /** Subtarefas de hoje/atrasadas e tarefas vinculadas à Rotina (registros originais). */
  subtaskData: MyDaySubtaskData;
  /** Seções que falharam ao carregar — o erro real é exibido no lugar do conteúdo. */
  errors: Partial<Record<"tarefas" | "compromissos" | "trabalhos" | "rotina" | "clt" | "subtarefas", SectionErrorData>>;
}) {
  const [items, setItems] = useState(workItems);
  const [completions, setCompletions] = useState(initialCompletions);
  const [workTasks, setWorkTasks] = useState(initialWorkTasks);
  const taskToggle = useTaskToggle();
  const taskDialogs = useTaskDialogs(todayKey);
  const myDay: MyDayTasks = loadedMyDay ?? { todayKey, today: [], missed: [], deadlines: { overdue: [], dueToday: [] } };
  const router = useRouter();
  const refresh = () => router.refresh();
  const plan = planMyDaySections({ myDay, activities, tasks: subtaskData.tasks, subtasksByTask: subtaskData.subtasksByTask, todayKey, nowTime: nowTimeSaoPaulo() });
  const linkedTaskById = new Map(subtaskData.tasks.map((t) => [t.id, t]));
  const subtasksOf = (taskId: string) => subtaskData.subtasksByTask[taskId];

  const today = parseLocalDate(todayKey);
  const sortedMeetings = [...meetings].sort((a, b) => a.start_time.localeCompare(b.start_time));
  const doneCount = items.filter((w) => w.status === "concluido").length;
  const todayOcc = getRealOccurrencesForDay(activities, completions, today);
  const deadlineTasks = plan.deadlines;
  const tasksDone = plan.today.filter((e) => taskToggle.isEntryDone(e)).length;

  async function toggleWorkItemDone(workItem: WorkItem) {
    const nextStatus = workItem.status === "concluido" ? "pendente" : "concluido";
    setItems((prev) => prev.map((w) => (w.id === workItem.id ? { ...w, status: nextStatus } : w)));
    const result = await updateWorkItemStatusAction(workItem.id, nextStatus);
    if (result.error) {
      toast.error(result.error);
      setItems((prev) => prev.map((w) => (w.id === workItem.id ? { ...w, status: workItem.status } : w)));
    }
  }

  async function toggleActivity(activityId: string) {
    const wasCompleted = completions.some((c) => c.activity_id === activityId && c.occurrence_date === todayKey);
    setCompletions((prev) =>
      wasCompleted
        ? prev.filter((c) => !(c.activity_id === activityId && c.occurrence_date === todayKey))
        : [...prev, { id: `optimistic-${activityId}`, activity_id: activityId, user_id: "", occurrence_date: todayKey, completed_at: new Date().toISOString() }]
    );
    const result = await toggleActivityCompletionAction(activityId, todayKey, !wasCompleted);
    if (result.error) toast.error(result.error);
  }

  async function toggleWorkTask(task: PersonalWorkTask) {
    const next = task.status === "concluida" ? "pendente" : "concluida";
    setWorkTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: next } : t)));
    const result = await togglePersonalWorkTaskStatusAction(task.id, next);
    if (result.error) {
      toast.error(result.error);
      setWorkTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: task.status } : t)));
    }
  }

  function taskMenu(task: Task) {
    if (task.archived_at) return {};
    return {
      onEdit: () => taskDialogs.openEdit(task),
      onEndRecurrence: task.recurrence === "weekly" && !isRecurrenceEnded(task, todayKey) ? () => taskDialogs.askEnd(task) : undefined,
      onDelete: () => taskDialogs.askDelete(task),
    };
  }

  const nothingPlanned =
    Object.values(errors).every((e) => !e) &&
    sortedMeetings.length === 0 &&
    items.length === 0 &&
    todayOcc.length === 0 &&
    plan.today.length === 0 &&
    plan.missed.length === 0 &&
    plan.subtaskParents.length === 0 &&
    deadlineTasks.length === 0 &&
    workTasks.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Meu Dia — ${weekdayLabel(today.getDay())}`}
        description={formatDateLong(today)}
        actions={
          <Button size="sm" onClick={() => taskDialogs.openCreate("dia")}>
            <Plus className="h-4 w-4" /> Tarefa
          </Button>
        }
      />

      <Section title="Rotina" href="/rotina" linkLabel="Ver tudo">
        {errors.rotina ? (
          <SectionError title="Não foi possível carregar a Rotina" error={errors.rotina} />
        ) : todayOcc.length === 0 ? (
          <EmptyState icon={Repeat} title="Nenhuma atividade de rotina programada para hoje" />
        ) : (
          todayOcc.map((occ) => {
            const linked = occ.activity.task_id ? linkedTaskById.get(occ.activity.task_id) : undefined;
            if (linked) {
              return (
                <LinkedRoutineItem
                  key={occ.activity.id}
                  activity={occ.activity}
                  task={linked}
                  subtasks={subtasksOf(linked.id) ?? []}
                  date={todayKey}
                  todayKey={todayKey}
                  sessionDone={occ.completed}
                  onToggleSession={() => toggleActivity(occ.activity.id)}
                />
              );
            }
            return (
            <ChecklistItem
              key={occ.activity.id}
              title={occ.activity.title}
              done={occ.completed}
              time={occ.activity.start_time.slice(0, 5)}
              onToggle={() => toggleActivity(occ.activity.id)}
              badges={occ.activity.category ? <span className="text-[11px] text-muted-foreground">{occ.activity.category}</span> : undefined}
            />
            );
          })
        )}
      </Section>

      <Section
        title="Tarefas de hoje"
        hint={plan.today.length > 0 ? `${tasksDone} de ${plan.today.length} feitas` : undefined}
        href="/tarefas"
        linkLabel="Ver todas"
      >
        {errors.tarefas ? (
          <SectionError title="Não foi possível carregar as tarefas" error={errors.tarefas} />
        ) : plan.today.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title="Nenhuma tarefa para hoje"
            action={
              <Button size="sm" variant="outline" onClick={() => taskDialogs.openCreate("dia")}>
                <Plus className="h-4 w-4" /> Nova tarefa do dia
              </Button>
            }
          />
        ) : (
          plan.today.map((entry) => (
            <DayTaskItem
              key={entry.key}
              entry={entry}
              subtasks={subtasksOf(entry.task.id)}
              done={taskToggle.isEntryDone(entry)}
              onToggle={() => taskToggle.toggleEntry(entry)}
              {...taskMenu(entry.task)}
            />
          ))
        )}
      </Section>

      {errors.subtarefas && <SectionError title="Não foi possível carregar as subtarefas" error={errors.subtarefas} />}

      {plan.subtaskParents.length > 0 && (
        <Section title="Subtarefas de hoje e atrasadas" href="/tarefas" linkLabel="Ver tarefas">
          {plan.subtaskParents.map((task) => (
            <div key={task.id} className="rounded-lg border border-border bg-card px-3 py-2.5">
              <p className="break-words text-sm font-medium text-foreground">{task.title}</p>
              <Subtasks parentType="pessoal" parentId={task.id} initialItems={subtasksOf(task.id) ?? []} initialOpen onChanged={refresh} />
            </div>
          ))}
        </Section>
      )}

      {plan.missed.length > 0 && (
        <Section title="Ficou pendente" hint="últimos 7 dias">
          {plan.missed.map((entry) => (
            <DayTaskItem
              key={entry.key}
              entry={entry}
              subtasks={subtasksOf(entry.task.id)}
              done={taskToggle.isEntryDone(entry)}
              onToggle={() => taskToggle.toggleEntry(entry)}
            />
          ))}
        </Section>
      )}

      {deadlineTasks.length > 0 && (
        <Section title="Prazos" href="/tarefas" linkLabel="Ver todos">
          {deadlineTasks.map((task) => {
            const deadline = taskDeadline(task);
            const overdue = !!deadline && deadline < todayKey;
            return (
              <ChecklistItem
                key={task.id}
                title={task.title}
                description={task.description}
                done={taskToggle.isTaskDone(task)}
                onToggle={() => taskToggle.toggleTask(task)}
                onEdit={() => taskDialogs.openEdit(task)}
                className={overdue ? "border-destructive/40" : undefined}
                badges={
                  <>
                    <Badge variant={overdue ? "destructive" : "warning"} className="border-0">
                      {overdue ? `Atrasada · prazo ${formatDate(deadline!)}` : "Prazo hoje"}
                    </Badge>
                    {task.priority === "importante" && <Badge variant="destructive" className="border-0">Importante</Badge>}
                  </>
                }
              />
            );
          })}
        </Section>
      )}

      <Section title="Compromissos" href="/visionario/reunioes" linkLabel="Ver todos">
        {errors.compromissos ? (
          <SectionError title="Não foi possível carregar os compromissos" error={errors.compromissos} />
        ) : sortedMeetings.length === 0 ? (
          <EmptyState icon={CalendarClock} title="Nenhum compromisso hoje" />
        ) : (
          sortedMeetings.map((m) => <TodayMeetingItem key={m.id} meeting={m} participantNames={meetingParticipantNames[m.id] ?? []} />)
        )}
      </Section>

      <Section
        title="Trabalhos (Visionário Dev)"
        hint={items.length > 0 ? `${doneCount} de ${items.length} concluídos` : undefined}
        href="/visionario/trabalhos"
        linkLabel="Ver tudo"
      >
        {errors.trabalhos ? (
          <SectionError title="Não foi possível carregar os trabalhos" error={errors.trabalhos} />
        ) : items.length === 0 ? (
          <EmptyState icon={Briefcase} title="Nenhum trabalho pendente para hoje" />
        ) : (
          items.map((w) => (
            <ChecklistItem
              key={w.id}
              title={w.title}
              description={w.description}
              done={w.status === "concluido"}
              onToggle={() => toggleWorkItemDone(w)}
              badges={
                <>
                  <PriorityBadge priority={w.priority} />
                  {(workItemAssigneeNames[w.id]?.length ?? 0) > 1 && (
                    <span className="text-[11px] text-muted-foreground">{workItemAssigneeNames[w.id].join(", ")}</span>
                  )}
                </>
              }
            />
          ))
        )}
      </Section>

      <Section title="Trabalho / CLT" href="/trabalho" linkLabel="Ver tudo">
        {errors.clt ? (
          <SectionError title="Não foi possível carregar as tarefas de trabalho" error={errors.clt} />
        ) : workTasks.length === 0 ? (
          <EmptyState icon={Briefcase} title="Nenhuma tarefa de trabalho para hoje" />
        ) : (
          workTasks.map((t) => (
            <ChecklistItem
              key={t.id}
              title={t.title}
              description={t.description}
              done={t.status === "concluida"}
              time={t.scheduled_time?.slice(0, 5)}
              onToggle={() => toggleWorkTask(t)}
              badges={<PriorityBadge priority={t.priority} />}
            />
          ))
        )}
      </Section>

      {nothingPlanned && (
        <EmptyState
          icon={Sun}
          title="Nada planejado para hoje"
          description="Rotina, tarefas, compromissos e trabalhos aparecem aqui automaticamente."
        />
      )}

      {taskDialogs.dialogs}
    </div>
  );
}

function Section({
  title,
  hint,
  href,
  linkLabel,
  children,
}: {
  title: string;
  hint?: string;
  href?: string;
  linkLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
          {hint && <span className="truncate text-xs text-muted-foreground">{hint}</span>}
        </div>
        {href && (
          <Link href={href} className="flex shrink-0 items-center gap-1 text-xs text-primary hover:underline">
            {linkLabel} <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}
