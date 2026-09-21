"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowRight, Sun, ListChecks, Repeat, Briefcase, CalendarClock } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ChecklistItem, PriorityBadge } from "@/components/shared/checklist-item";
import { TodayMeetingItem } from "@/components/visionario/reunioes/today-meeting-item";
import { updateWorkItemStatusAction } from "@/lib/supabase/work-items-actions";
import {
  toggleActivityCompletionAction,
  toggleTaskStatusAction,
  togglePersonalWorkTaskStatusAction,
} from "@/lib/supabase/personal-actions";
import { getRealOccurrencesForDay } from "@/lib/routine-real";
import { formatDateLong, parseLocalDate } from "@/lib/format";
import type { Activity, ActivityCompletion, Meeting, PersonalWorkTask, Task, WorkItem } from "@/types/database.types";

export function HojePageClient({
  todayKey,
  meetings,
  meetingParticipantNames,
  workItems,
  workItemAssigneeNames,
  activities,
  completions: initialCompletions,
  tasks: initialTasks,
  workTasks: initialWorkTasks,
}: {
  /** "Hoje" calculado no servidor (America/Sao_Paulo) — nunca recalculado no navegador, pra nunca divergir do que foi buscado. */
  todayKey: string;
  meetings: Meeting[];
  meetingParticipantNames: Record<string, string[]>;
  workItems: WorkItem[];
  workItemAssigneeNames: Record<string, string[]>;
  activities: Activity[];
  completions: ActivityCompletion[];
  tasks: Task[];
  workTasks: PersonalWorkTask[];
}) {
  const [items, setItems] = useState(workItems);
  const [completions, setCompletions] = useState(initialCompletions);
  const [tasks, setTasks] = useState(initialTasks);
  const [workTasks, setWorkTasks] = useState(initialWorkTasks);

  const today = parseLocalDate(todayKey);
  const sortedMeetings = [...meetings].sort((a, b) => a.start_time.localeCompare(b.start_time));
  const doneCount = items.filter((w) => w.status === "concluido").length;
  const todayOcc = getRealOccurrencesForDay(activities, completions, today);

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

  async function toggleTask(task: Task) {
    const next = task.status === "concluida" ? "pendente" : "concluida";
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: next } : t)));
    const result = await toggleTaskStatusAction(task.id, next);
    if (result.error) {
      toast.error(result.error);
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: task.status } : t)));
    }
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

  const nothingPlanned =
    sortedMeetings.length === 0 && items.length === 0 && todayOcc.length === 0 && tasks.length === 0 && workTasks.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Hoje" description={formatDateLong(today)} />

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Reuniões</h2>
          <Link href="/visionario/reunioes" className="flex items-center gap-1 text-xs text-primary hover:underline">
            Ver todas <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {sortedMeetings.length === 0 ? (
          <EmptyState icon={CalendarClock} title="Nenhuma reunião hoje" />
        ) : (
          <div className="flex flex-col gap-2">
            {sortedMeetings.map((m) => (
              <TodayMeetingItem key={m.id} meeting={m} participantNames={meetingParticipantNames[m.id] ?? []} />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">Trabalhos (Visionário Dev)</h2>
            {items.length > 0 && <span className="text-xs text-muted-foreground">{doneCount} de {items.length} concluídos</span>}
          </div>
          <Link href="/visionario/trabalhos" className="flex items-center gap-1 text-xs text-primary hover:underline">
            Ver tudo <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {items.length === 0 ? (
          <EmptyState icon={Briefcase} title="Nenhum trabalho pendente para hoje" />
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((w) => (
              <ChecklistItem
                key={w.id}
                title={w.title}
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
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Rotina</h2>
          <Link href="/rotina" className="flex items-center gap-1 text-xs text-primary hover:underline">
            Ver tudo <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {todayOcc.length === 0 ? (
          <EmptyState icon={Repeat} title="Nenhuma atividade de rotina programada para hoje" />
        ) : (
          <div className="flex flex-col gap-2">
            {todayOcc.map((occ) => (
              <ChecklistItem
                key={occ.activity.id}
                title={occ.activity.title}
                done={occ.completed}
                time={occ.activity.start_time.slice(0, 5)}
                onToggle={() => toggleActivity(occ.activity.id)}
                badges={occ.activity.category ? <span className="text-[11px] text-muted-foreground">{occ.activity.category}</span> : undefined}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Tarefas</h2>
          <Link href="/tarefas" className="flex items-center gap-1 text-xs text-primary hover:underline">
            Ver todas <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {tasks.length === 0 ? (
          <EmptyState icon={ListChecks} title="Nenhuma tarefa para hoje" />
        ) : (
          <div className="flex flex-col gap-2">
            {tasks.map((t) => (
              <ChecklistItem
                key={t.id}
                title={t.title}
                done={t.status === "concluida"}
                time={t.scheduled_time?.slice(0, 5)}
                onToggle={() => toggleTask(t)}
                badges={<PriorityBadge priority={t.priority} />}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Trabalho / CLT</h2>
          <Link href="/trabalho" className="flex items-center gap-1 text-xs text-primary hover:underline">
            Ver tudo <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {workTasks.length === 0 ? (
          <EmptyState icon={Briefcase} title="Nenhuma tarefa de trabalho para hoje" />
        ) : (
          <div className="flex flex-col gap-2">
            {workTasks.map((t) => (
              <ChecklistItem
                key={t.id}
                title={t.title}
                done={t.status === "concluida"}
                time={t.scheduled_time?.slice(0, 5)}
                onToggle={() => toggleWorkTask(t)}
                badges={<PriorityBadge priority={t.priority} />}
              />
            ))}
          </div>
        )}
      </section>

      {nothingPlanned && (
        <EmptyState
          icon={Sun}
          title="Nada planejado para hoje"
          description="Reuniões, trabalhos, rotina e tarefas aparecem aqui automaticamente."
        />
      )}
    </div>
  );
}
