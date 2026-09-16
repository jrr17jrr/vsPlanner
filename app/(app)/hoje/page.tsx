"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, ArrowRight, Sun } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useDbStore } from "@/store/db-store";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/shared/empty-state";
import { RoutineItem } from "@/components/shared/routine-item";
import { TaskItem } from "@/components/shared/task-item";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ActivityFormDialog } from "@/components/forms/activity-form-dialog";
import { TaskFormDialog } from "@/components/forms/task-form-dialog";
import { getOccurrencesForDay } from "@/lib/routine";
import { toDateKey, formatDateLong } from "@/lib/format";
import type { Activity, Task } from "@/types/entities";

export default function HojePage() {
  const { profile, personalSpace } = useAuth();
  const activities = useDbStore((s) => s.activities);
  const tasks = useDbStore((s) => s.tasks);
  const update = useDbStore((s) => s.update);
  const remove = useDbStore((s) => s.remove);

  const [activityFormOpen, setActivityFormOpen] = useState(false);
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [deletingActivity, setDeletingActivity] = useState<Activity | undefined>();
  const [deletingTask, setDeletingTask] = useState<Task | undefined>();

  if (!profile || !personalSpace) return null;

  const today = new Date();
  const todayKey = toDateKey(today);
  const occ = getOccurrencesForDay(
    activities.filter((a) => a.userId === profile.id),
    today
  );
  const pct = occ.length ? Math.round((occ.filter((o) => o.completed).length / occ.length) * 100) : 0;

  const todayTasks = tasks.filter(
    (t) =>
      t.responsibleId === profile.id &&
      t.status !== "concluida" &&
      t.dueDate &&
      t.dueDate <= todayKey
  );

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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Hoje" description={formatDateLong(today)} />

      <Card className="p-4">
        <div className="flex items-center gap-3">
          <Progress value={pct} className="max-w-xs" />
          <span className="shrink-0 text-xs text-muted-foreground">
            {occ.filter((o) => o.completed).length}/{occ.length} atividades · {pct}%
          </span>
        </div>
      </Card>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Rotina de hoje</h2>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setActivityFormOpen(true)}>
              <Plus className="h-4 w-4" /> Adicionar
            </Button>
            <Link href="/rotina" className="flex items-center gap-1 text-xs text-primary hover:underline">
              Ver rotina completa <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
        {occ.length === 0 ? (
          <EmptyState icon={Sun} title="Nada agendado para hoje" />
        ) : (
          <div className="flex flex-col gap-2">
            {occ.map((o) => (
              <RoutineItem
                key={`${o.activity.id}-${o.date}`}
                activity={o.activity}
                completed={o.completed}
                onToggle={() => toggleActivity(o.activity, o.date)}
                onEdit={() => setActivityFormOpen(true)}
                onDelete={() => setDeletingActivity(o.activity)}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Tarefas para hoje</h2>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setTaskFormOpen(true)}>
              <Plus className="h-4 w-4" /> Nova tarefa
            </Button>
            <Link href="/tarefas" className="flex items-center gap-1 text-xs text-primary hover:underline">
              Ver todas <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
        {todayTasks.length === 0 ? (
          <EmptyState icon={Sun} title="Nenhuma tarefa vencendo hoje" />
        ) : (
          <div className="flex flex-col gap-2">
            {todayTasks.map((t) => (
              <TaskItem
                key={t.id}
                task={t}
                onToggle={() => toggleTask(t)}
                onEdit={() => setTaskFormOpen(true)}
                onDelete={() => setDeletingTask(t)}
              />
            ))}
          </div>
        )}
      </section>

      <ActivityFormDialog
        open={activityFormOpen}
        onOpenChange={setActivityFormOpen}
        spaceId={personalSpace.id}
        userId={profile.id}
        defaultDate={todayKey}
      />
      <TaskFormDialog
        open={taskFormOpen}
        onOpenChange={setTaskFormOpen}
        spaceId={personalSpace.id}
        userId={profile.id}
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
    </div>
  );
}
