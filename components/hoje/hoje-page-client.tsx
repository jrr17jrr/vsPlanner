"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowRight, Sun, Repeat, CalendarClock, Plus } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionError } from "@/components/shared/section-error";
import { ChecklistItem } from "@/components/shared/checklist-item";
import { Button } from "@/components/ui/button";
import { TodayMeetingItem } from "@/components/visionario/reunioes/today-meeting-item";
import { LinkedRoutineItem } from "@/components/rotina/linked-routine-item";
import { MyDayBoardView } from "@/components/hoje/my-day-board";
import { useTaskDialogs } from "@/components/tarefas/use-task-dialogs";
import { toggleActivityCompletionAction } from "@/lib/supabase/personal-actions";
import { getRealOccurrencesForDay } from "@/lib/routine-real";
import type { MyDayBoardData } from "@/lib/supabase/my-day-board-data";
import type { SectionError as SectionErrorData } from "@/lib/supabase/section-result";
import { formatDateLong, parseLocalDate, weekdayLabel } from "@/lib/format";
import type { Activity, ActivityCompletion, Meeting } from "@/types/database.types";

/**
 * Meu Dia: Rotina e Compromissos (agenda) em blocos compactos no topo e as
 * tarefas/subtarefas de TODAS as áreas em quatro seções — Hoje, Atrasadas,
 * Próximas e Concluídas (lib/my-day-board.ts). Cada item aparece uma vez.
 */
export function HojePageClient({
  todayKey,
  data,
  meetings,
  meetingParticipantNames,
  activities,
  completions: initialCompletions,
  errors,
}: {
  /** "Hoje" calculado no servidor (America/Sao_Paulo) — nunca recalculado no navegador. */
  todayKey: string;
  /** `null` = as tarefas não carregaram (ver `errors.tarefas`). */
  data: MyDayBoardData | null;
  meetings: Meeting[];
  meetingParticipantNames: Record<string, string[]>;
  activities: Activity[];
  completions: ActivityCompletion[];
  errors: Partial<Record<"tarefas" | "compromissos" | "trabalhos" | "rotina" | "clt", SectionErrorData>>;
}) {
  const [completions, setCompletions] = useState(initialCompletions);
  const taskDialogs = useTaskDialogs(todayKey);
  const today = parseLocalDate(todayKey);
  const sortedMeetings = [...meetings].sort((a, b) => a.start_time.localeCompare(b.start_time));
  const todayOcc = getRealOccurrencesForDay(activities, completions, today);
  const linkedTaskById = new Map((data?.linkedTasks ?? []).map((t) => [t.id, t]));
  const board = data?.board;
  const counts = board ? { hoje: board.hoje.length, atrasadas: board.atrasadas.length } : null;

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

  const nothing =
    !!board && Object.values(errors).every((e) => !e) && sortedMeetings.length === 0 && todayOcc.length === 0 &&
    board.hoje.length + board.atrasadas.length + board.proximas.length + board.concluidas.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Meu Dia — ${weekdayLabel(today.getDay())}`}
        description={counts ? `${formatDateLong(today)} · ${counts.hoje} para hoje${counts.atrasadas ? ` · ${counts.atrasadas} atrasada${counts.atrasadas > 1 ? "s" : ""}` : ""}` : formatDateLong(today)}
        actions={
          <Button size="sm" className="h-10 sm:h-9" onClick={() => taskDialogs.openCreate("dia")}>
            <Plus className="h-4 w-4" /> Tarefa
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Block title="Rotina" href="/rotina">
          {errors.rotina ? (
            <SectionError title="Não foi possível carregar a Rotina" error={errors.rotina} />
          ) : todayOcc.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-3 text-sm text-muted-foreground"><Repeat className="mr-1.5 inline h-4 w-4" />Nenhuma atividade hoje.</p>
          ) : (
            todayOcc.map((occ) => {
              const linked = occ.activity.task_id ? linkedTaskById.get(occ.activity.task_id) : undefined;
              if (linked) {
                return (
                  <LinkedRoutineItem
                    key={occ.activity.id}
                    activity={occ.activity}
                    task={linked}
                    subtasks={data?.subtasksByTask[linked.id] ?? []}
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
        </Block>

        <Block title="Compromissos" href="/visionario/reunioes">
          {errors.compromissos ? (
            <SectionError title="Não foi possível carregar os compromissos" error={errors.compromissos} />
          ) : sortedMeetings.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-3 text-sm text-muted-foreground"><CalendarClock className="mr-1.5 inline h-4 w-4" />Nenhum compromisso hoje.</p>
          ) : (
            sortedMeetings.map((m) => <TodayMeetingItem key={m.id} meeting={m} participantNames={meetingParticipantNames[m.id] ?? []} />)
          )}
        </Block>
      </div>

      {errors.tarefas && <SectionError title="Não foi possível carregar as tarefas" error={errors.tarefas} />}
      {errors.trabalhos && <SectionError title="Não foi possível carregar os trabalhos da Visionário Dev" error={errors.trabalhos} />}
      {errors.clt && <SectionError title="Não foi possível carregar as tarefas de trabalho" error={errors.clt} />}

      {nothing ? (
        <EmptyState
          icon={Sun}
          title="Nada planejado"
          description="Tarefas, subtarefas, rotina e compromissos de todas as áreas aparecem aqui automaticamente."
          action={<Button size="sm" variant="outline" onClick={() => taskDialogs.openCreate("dia")}><Plus className="h-4 w-4" /> Nova tarefa</Button>}
        />
      ) : (
        board && data && <MyDayBoardView board={board} todayKey={todayKey} subtasksByTask={data.subtasksByTask} onEditTask={(t) => taskDialogs.openEdit(t)} />
      )}

      {taskDialogs.dialogs}
    </div>
  );
}

function Block({ title, href, children }: { title: string; href: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
        <Link href={href} className="flex min-h-9 shrink-0 items-center gap-1 px-1 text-xs text-primary hover:underline">
          Ver tudo <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}
