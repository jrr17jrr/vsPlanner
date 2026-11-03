"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, ChevronLeft, ChevronRight, CalendarClock } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/shared/empty-state";
import { ChecklistItem } from "@/components/shared/checklist-item";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ActivityFormDialog } from "@/components/rotina/activity-form-dialog";
import { LinkedRoutineItem } from "@/components/rotina/linked-routine-item";
import type { Subtask } from "@/lib/task-schedule";
import { toggleActivityCompletionAction, deleteActivityAction } from "@/lib/supabase/personal-actions";
import { getRealOccurrences, getRealOccurrencesForDay, type RealActivityOccurrence } from "@/lib/routine-real";
import { toDateKey, weekdayLabel, formatDateShort } from "@/lib/format";
import type { Activity, ActivityCompletion, Task } from "@/types/database.types";
import { QuickCreateListener } from "@/components/shared/quick-create-listener";

export function RotinaPageClient({
  activities,
  completions: initialCompletions,
  tasks,
  subtasks,
  todayKey,
}: {
  activities: Activity[];
  completions: ActivityCompletion[];
  /** Tarefas pessoais não arquivadas (para vincular e para exibir as vinculadas). */
  tasks: Task[];
  /** Subtarefas originais das tarefas vinculadas. */
  subtasks: Subtask[];
  todayKey: string;
}) {
  const [completions, setCompletions] = useState(initialCompletions);
  const [tab, setTab] = useState("hoje");
  const [weekOffset, setWeekOffset] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Activity | undefined>();
  const [defaultWeekday, setDefaultWeekday] = useState<number | undefined>();
  const [defaultDate, setDefaultDate] = useState<string | undefined>();

  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const subtasksByTask = useMemo(() => {
    const map = new Map<string, Subtask[]>();
    for (const s of subtasks) map.set(s.parent_id, [...(map.get(s.parent_id) ?? []), s]);
    return map;
  }, [subtasks]);
  const linkedIds = new Set(activities.map((a) => a.task_id).filter(Boolean));
  // Vinculáveis: pendentes ou recorrentes (as já vinculadas continuam na lista para a edição mostrar o nome).
  const linkableTasks = tasks.filter((t) => t.recurrence === "weekly" || t.status !== "concluida" || linkedIds.has(t.id));
  const [deleting, setDeleting] = useState<Activity | undefined>();

  const today = new Date();
  const todayOcc = getRealOccurrencesForDay(activities, completions, today);

  const monday = useMemo(() => {
    const d = new Date();
    const day = d.getDay();
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1) + weekOffset * 7);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [weekOffset]);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  }), [monday]);

  const weekOcc = useMemo(() => getRealOccurrences(activities, completions, weekDays[0], weekDays[6]), [activities, completions, weekDays]);

  function openCreate(weekday?: number, date?: string) {
    setEditing(undefined);
    setDefaultWeekday(weekday);
    setDefaultDate(date);
    setFormOpen(true);
  }

  function openEdit(activity: Activity) {
    setEditing(activity);
    setDefaultWeekday(undefined);
    setFormOpen(true);
  }

  async function toggle(occ: RealActivityOccurrence) {
    const wasCompleted = occ.completed;
    setCompletions((prev) =>
      wasCompleted
        ? prev.filter((c) => !(c.activity_id === occ.activity.id && c.occurrence_date === occ.date))
        : [...prev, { id: `optimistic-${occ.activity.id}-${occ.date}`, activity_id: occ.activity.id, user_id: "", occurrence_date: occ.date, completed_at: new Date().toISOString() }]
    );
    const result = await toggleActivityCompletionAction(occ.activity.id, occ.date, !wasCompleted);
    if (result.error) {
      toast.error(result.error);
      setCompletions((prev) =>
        wasCompleted
          ? [...prev, { id: `revert-${occ.activity.id}-${occ.date}`, activity_id: occ.activity.id, user_id: "", occurrence_date: occ.date, completed_at: new Date().toISOString() }]
          : prev.filter((c) => !(c.activity_id === occ.activity.id && c.occurrence_date === occ.date))
      );
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    const result = await deleteActivityAction(deleting.id);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setDeleting(undefined);
  }

  function renderOcc(occ: RealActivityOccurrence) {
    const linkedTask = occ.activity.task_id ? taskById.get(occ.activity.task_id) : undefined;
    if (linkedTask) {
      return (
        <LinkedRoutineItem
          key={`${occ.activity.id}-${occ.date}`}
          activity={occ.activity}
          task={linkedTask}
          subtasks={subtasksByTask.get(linkedTask.id) ?? []}
          date={occ.date}
          todayKey={todayKey}
          sessionDone={occ.completed}
          onToggleSession={() => toggle(occ)}
          onEdit={() => openEdit(occ.activity)}
          onDelete={() => setDeleting(occ.activity)}
        />
      );
    }
    return (
      <ChecklistItem
        key={`${occ.activity.id}-${occ.date}`}
        title={occ.activity.title}
        done={occ.completed}
        time={occ.activity.start_time.slice(0, 5)}
        onToggle={() => toggle(occ)}
        onEdit={() => openEdit(occ.activity)}
        onDelete={() => setDeleting(occ.activity)}
        badges={occ.activity.category ? <span className="text-[11px] text-muted-foreground">{occ.activity.category}</span> : undefined}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Minha Rotina"
        description="Organize seus horários, hábitos e compromissos do dia a dia."
        actions={
          <Button size="sm" onClick={() => openCreate()}>
            <Plus className="h-4 w-4" /> Nova atividade
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="hoje">Hoje</TabsTrigger>
          <TabsTrigger value="semana">Semana</TabsTrigger>
        </TabsList>

        <TabsContent value="hoje">
          <div className="mb-3 flex items-center gap-3">
            <Progress
              value={todayOcc.length ? (todayOcc.filter((o) => o.completed).length / todayOcc.length) * 100 : 0}
              className="max-w-xs"
            />
            <span className="shrink-0 text-xs text-muted-foreground">
              {todayOcc.filter((o) => o.completed).length}/{todayOcc.length} concluídas
            </span>
          </div>
          {todayOcc.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="Nenhuma atividade para hoje"
              description="Adicione sua primeira atividade do dia."
              action={
                <Button size="sm" onClick={() => openCreate(today.getDay(), todayKey)}>
                  <Plus className="h-4 w-4" /> Nova atividade
                </Button>
              }
            />
          ) : (
            <div className="flex flex-col gap-2">{todayOcc.map(renderOcc)}</div>
          )}
        </TabsContent>

        <TabsContent value="semana">
          <div className="mb-3 flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={() => setWeekOffset((w) => w - 1)}>
              <ChevronLeft className="h-4 w-4" /> Semana anterior
            </Button>
            <p className="text-sm font-medium text-foreground">
              {formatDateShort(weekDays[0])} – {formatDateShort(weekDays[6])}
              {weekOffset === 0 && <span className="ml-1.5 text-xs text-primary">(atual)</span>}
            </p>
            <Button variant="outline" size="sm" onClick={() => setWeekOffset((w) => w + 1)}>
              Próxima semana <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex flex-col gap-4">
            {weekDays.map((d) => {
              const dateKey = toDateKey(d);
              const occ = weekOcc.filter((o) => o.date === dateKey);
              const isToday = dateKey === toDateKey(today);
              const dayPct = occ.length ? Math.round((occ.filter((o) => o.completed).length / occ.length) * 100) : null;
              return (
                <div key={dateKey}>
                  <div className="mb-1.5 flex items-center gap-2">
                    <p className={`text-sm font-semibold ${isToday ? "text-primary" : "text-foreground"}`}>{weekdayLabel(d.getDay())}</p>
                    <span className="text-xs text-muted-foreground">{formatDateShort(d)}</span>
                    {dayPct !== null && <span className="text-xs font-medium text-primary">{dayPct}%</span>}
                    <button onClick={() => openCreate(d.getDay(), dateKey)} className="ml-auto min-h-9 px-1 text-xs text-primary hover:underline">
                      + adicionar
                    </button>
                  </div>
                  {occ.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground">Sem atividades.</p>
                  ) : (
                    <div className="flex flex-col gap-2">{occ.map(renderOcc)}</div>
                  )}
                </div>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      <QuickCreateListener kinds={["atividade"]} onOpen={() => openCreate()} />
      <ActivityFormDialog open={formOpen} onOpenChange={setFormOpen} activity={editing} defaultWeekday={defaultWeekday} defaultDate={defaultDate} tasks={linkableTasks} />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        title={deleting?.task_id ? "Tirar tarefa da rotina?" : "Excluir atividade?"}
        description={
          deleting?.task_id
            ? `"${taskById.get(deleting.task_id)?.title ?? deleting.title}" sai da rotina. A tarefa original e as subtarefas continuam na página Tarefas.`
            : `"${deleting?.title}" será removida da sua rotina, incluindo todas as ocorrências recorrentes.`
        }
        onConfirm={handleDelete}
      />
    </div>
  );
}
