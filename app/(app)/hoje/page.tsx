"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, ArrowRight, Sun, Briefcase, ListChecks, CalendarPlus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useDbStore } from "@/store/db-store";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/shared/empty-state";
import { RoutineItem } from "@/components/shared/routine-item";
import { ChecklistItem, PriorityBadge } from "@/components/shared/checklist-item";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ActivityFormDialog } from "@/components/forms/activity-form-dialog";
import { QuickTaskDialog } from "@/components/forms/quick-task-dialog";
import { TaskFormDialog } from "@/components/forms/task-form-dialog";
import { WorkTaskFormDialog } from "@/components/forms/work-task-form-dialog";
import { getOccurrencesForDay } from "@/lib/routine";
import { periodOfDay, PERIOD_LABELS } from "@/lib/day-planner";
import { toDateKey, formatDateLong } from "@/lib/format";
import type { Activity, Task, WorkTask } from "@/types/entities";

export default function HojePage() {
  const { profile, personalSpace } = useAuth();
  const activities = useDbStore((s) => s.activities);
  const tasks = useDbStore((s) => s.tasks);
  const workTasks = useDbStore((s) => s.workTasks);
  const update = useDbStore((s) => s.update);
  const remove = useDbStore((s) => s.remove);

  const [activityFormOpen, setActivityFormOpen] = useState(false);
  const [quickTaskOpen, setQuickTaskOpen] = useState(false);
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | undefined>();
  const [workTaskFormOpen, setWorkTaskFormOpen] = useState(false);
  const [editingWorkTask, setEditingWorkTask] = useState<WorkTask | undefined>();
  const [deletingActivity, setDeletingActivity] = useState<Activity | undefined>();
  const [deletingTask, setDeletingTask] = useState<Task | undefined>();
  const [deletingWorkTask, setDeletingWorkTask] = useState<WorkTask | undefined>();

  const today = new Date();
  const todayKey = toDateKey(today);
  const nowHHMM = `${String(today.getHours()).padStart(2, "0")}:${String(today.getMinutes()).padStart(2, "0")}`;

  const occ = getOccurrencesForDay(activities.filter((a) => a.userId === profile?.id), today);

  const todayTasks = tasks.filter((t) => t.userId === profile?.id && t.dueDate === todayKey);
  const timedTasks = todayTasks.filter((t) => t.scheduledTime);
  const checklistTasks = todayTasks.filter((t) => !t.scheduledTime);

  const todayWorkTasks = workTasks.filter((t) => t.userId === profile?.id && t.dueDate === todayKey);

  if (!profile || !personalSpace) return null;

  // Progresso geral do dia (rotina + tarefas + trabalho)
  const totalItems = occ.length + todayTasks.length + todayWorkTasks.length;
  const doneItems =
    occ.filter((o) => o.completed).length +
    todayTasks.filter((t) => t.status === "concluida").length +
    todayWorkTasks.filter((t) => t.status === "concluida").length;
  const pct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;

  const agora = occ.find((o) => {
    if (!o.activity.endTime) return false;
    return o.activity.startTime <= nowHHMM && nowHHMM <= o.activity.endTime && !o.completed;
  });
  const proximo = occ.find((o) => !o.completed && o.activity.startTime > nowHHMM) ?? occ.find((o) => !o.completed);

  // Linha do tempo: ocorrências de rotina + tarefas pessoais com horário
  type TimelineEntry =
    | { kind: "activity"; time: string; occ: (typeof occ)[number] }
    | { kind: "task"; time: string; task: Task };
  const timeline: TimelineEntry[] = [
    ...occ.map((o) => ({ kind: "activity" as const, time: o.activity.startTime, occ: o })),
    ...timedTasks.map((t) => ({ kind: "task" as const, time: t.scheduledTime!, task: t })),
  ].sort((a, b) => a.time.localeCompare(b.time));

  const periods: Array<"manha" | "tarde" | "noite"> = ["manha", "tarde", "noite"];
  const grouped = periods.map((p) => ({
    period: p,
    items: timeline.filter((entry) => periodOfDay(entry.time) === p),
  }));

  function toggleActivity(activity: Activity, dateKey: string) {
    const has = activity.completedDates.includes(dateKey);
    update("activities", activity.id, {
      completedDates: has
        ? activity.completedDates.filter((d) => d !== dateKey)
        : [...activity.completedDates, dateKey],
    });
  }

  function toggleTask(task: Task) {
    const done = task.status === "concluida";
    update("tasks", task.id, {
      status: done ? "pendente" : "concluida",
      completedAt: done ? undefined : new Date().toISOString(),
    });
  }

  function toggleWorkTask(task: WorkTask) {
    const done = task.status === "concluida";
    update("workTasks", task.id, {
      status: done ? "pendente" : "concluida",
      completedAt: done ? undefined : new Date().toISOString(),
    });
  }

  const workDone = todayWorkTasks.filter((t) => t.status === "concluida").length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Hoje" description={formatDateLong(today)} />

      {/* Progresso do dia */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">Seu dia</p>
          <span className="text-sm font-semibold text-primary">{pct}%</span>
        </div>
        <Progress value={pct} className="mt-2" />
        <p className="mt-1.5 text-xs text-muted-foreground">
          {doneItems} de {totalItems} concluídas
        </p>
      </Card>

      {/* Agora / Próximo */}
      {(agora || proximo) && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {agora && (
            <Card className="border-primary/40 bg-primary/5 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-primary">Agora</p>
              <p className="mt-1 truncate text-sm font-semibold text-foreground">{agora.activity.title}</p>
              <p className="text-xs text-muted-foreground">
                {agora.activity.startTime}
                {agora.activity.endTime && ` — ${agora.activity.endTime}`}
              </p>
            </Card>
          )}
          {proximo && (
            <Card className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Próximo</p>
              <p className="mt-1 truncate text-sm font-semibold text-foreground">{proximo.activity.title}</p>
              <p className="text-xs text-muted-foreground">{proximo.activity.startTime}</p>
            </Card>
          )}
        </div>
      )}

      {/* Ações rápidas */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setQuickTaskOpen(true)}>
          <Plus className="h-4 w-4" /> Tarefa rápida
        </Button>
        <Button size="sm" variant="outline" onClick={() => setActivityFormOpen(true)}>
          <CalendarPlus className="h-4 w-4" /> Adicionar ao meu dia
        </Button>
      </div>

      {/* Linha do tempo por período */}
      {grouped.map(({ period, items }) =>
        items.length === 0 ? null : (
          <section key={period}>
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">{PERIOD_LABELS[period]}</h2>
            <div className="flex flex-col gap-2">
              {items.map((entry) =>
                entry.kind === "activity" ? (
                  <RoutineItem
                    key={`${entry.occ.activity.id}-${entry.occ.date}`}
                    activity={entry.occ.activity}
                    completed={entry.occ.completed}
                    onToggle={() => toggleActivity(entry.occ.activity, entry.occ.date)}
                    onEdit={() => setActivityFormOpen(true)}
                    onDelete={() => setDeletingActivity(entry.occ.activity)}
                  />
                ) : (
                  <ChecklistItem
                    key={entry.task.id}
                    title={entry.task.title}
                    done={entry.task.status === "concluida"}
                    time={entry.task.scheduledTime}
                    onToggle={() => toggleTask(entry.task)}
                    onEdit={() => { setEditingTask(entry.task); setTaskFormOpen(true); }}
                    onDelete={() => setDeletingTask(entry.task)}
                    onMove={(d) => update("tasks", entry.task.id, { dueDate: d })}
                    badges={<span className="text-[11px] text-muted-foreground">{entry.task.category}</span>}
                  />
                )
              )}
            </div>
          </section>
        )
      )}

      {/* Trabalho / CLT do dia */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">Trabalho / CLT</h2>
            {todayWorkTasks.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {workDone} de {todayWorkTasks.length} concluídas
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => { setEditingWorkTask(undefined); setWorkTaskFormOpen(true); }}>
              <Plus className="h-4 w-4" /> Nova
            </Button>
            <Link href="/trabalho" className="flex items-center gap-1 text-xs text-primary hover:underline">
              Ver tudo <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
        {todayWorkTasks.length === 0 ? (
          <EmptyState icon={Briefcase} title="Nenhuma tarefa de trabalho para hoje" />
        ) : (
          <div className="flex flex-col gap-2">
            {todayWorkTasks.map((t) => (
              <ChecklistItem
                key={t.id}
                title={t.title}
                done={t.status === "concluida"}
                time={t.scheduledTime}
                onToggle={() => toggleWorkTask(t)}
                onEdit={() => { setEditingWorkTask(t); setWorkTaskFormOpen(true); }}
                onDelete={() => setDeletingWorkTask(t)}
                onMove={(d) => update("workTasks", t.id, { dueDate: d })}
                badges={<PriorityBadge priority={t.priority} />}
              />
            ))}
          </div>
        )}
      </section>

      {/* Tarefas pessoais sem horário */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Tarefas</h2>
          <Link href="/tarefas" className="flex items-center gap-1 text-xs text-primary hover:underline">
            Ver todas <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {checklistTasks.length === 0 ? (
          <EmptyState icon={ListChecks} title="Nenhuma tarefa avulsa para hoje" />
        ) : (
          <div className="flex flex-col gap-2">
            {checklistTasks.map((t) => (
              <ChecklistItem
                key={t.id}
                title={t.title}
                done={t.status === "concluida"}
                onToggle={() => toggleTask(t)}
                onEdit={() => { setEditingTask(t); setTaskFormOpen(true); }}
                onDelete={() => setDeletingTask(t)}
                onMove={(d) => update("tasks", t.id, { dueDate: d })}
                badges={<span className="text-[11px] text-muted-foreground">{t.category}</span>}
              />
            ))}
          </div>
        )}
      </section>

      {totalItems === 0 && (
        <EmptyState
          icon={Sun}
          title="Nada planejado para hoje"
          description="Adicione uma tarefa rápida ou algo à sua rotina para começar."
        />
      )}

      <ActivityFormDialog
        open={activityFormOpen}
        onOpenChange={setActivityFormOpen}
        spaceId={personalSpace.id}
        userId={profile.id}
        defaultDate={todayKey}
      />
      <QuickTaskDialog
        open={quickTaskOpen}
        onOpenChange={setQuickTaskOpen}
        spaceId={personalSpace.id}
        userId={profile.id}
        defaultDate={todayKey}
      />
      <TaskFormDialog
        open={taskFormOpen}
        onOpenChange={setTaskFormOpen}
        task={editingTask}
        spaceId={personalSpace.id}
        userId={profile.id}
      />
      <WorkTaskFormDialog
        open={workTaskFormOpen}
        onOpenChange={setWorkTaskFormOpen}
        workTask={editingWorkTask}
        spaceId={personalSpace.id}
        userId={profile.id}
        defaultDate={todayKey}
      />
      <ConfirmDialog
        open={!!deletingActivity}
        onOpenChange={(open) => !open && setDeletingActivity(undefined)}
        title="Excluir atividade?"
        onConfirm={() => deletingActivity && remove("activities", deletingActivity.id)}
      />
      <ConfirmDialog
        open={!!deletingTask}
        onOpenChange={(open) => !open && setDeletingTask(undefined)}
        title="Excluir tarefa?"
        onConfirm={() => deletingTask && remove("tasks", deletingTask.id)}
      />
      <ConfirmDialog
        open={!!deletingWorkTask}
        onOpenChange={(open) => !open && setDeletingWorkTask(undefined)}
        title="Excluir tarefa?"
        onConfirm={() => deletingWorkTask && remove("workTasks", deletingWorkTask.id)}
      />
    </div>
  );
}
