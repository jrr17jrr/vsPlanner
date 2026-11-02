import "server-only";

import { listMyDaySubtasks, listPersonalSubtasks, listTasksByIds } from "@/lib/supabase/repositories/personal.repository";
import { activityOccursOn } from "@/lib/routine-real";
import { weekdayOfKey, type MyDayTasks } from "@/lib/tasks";
import type { Subtask } from "@/lib/task-schedule";
import type { Activity, Task } from "@/types/database.types";

export type MyDaySubtaskData = {
  /** Lista COMPLETA de subtarefas por tarefa (para as três seções e o progresso). */
  subtasksByTask: Record<string, Subtask[]>;
  /** Tarefas vinculadas à rotina de hoje e tarefas-pai de subtarefas de hoje/atrasadas. */
  tasks: Task[];
};

/**
 * Dados de subtarefas do Meu Dia: subtarefas programadas para hoje ou
 * atrasadas + as tarefas da Rotina de hoje + as tarefas que já aparecem
 * nas seções do dia. Uma consulta por etapa (sem N+1); a deduplicação
 * entre seções é feita em `planMyDaySections`.
 */
export async function loadMyDaySubtasks(userId: string, todayKey: string, myDay: MyDayTasks | null, activities: Activity[]): Promise<MyDaySubtaskData> {
  const relevant = await listMyDaySubtasks(userId, todayKey);
  const weekday = weekdayOfKey(todayKey);
  const linkedToday = activities.filter((a) => a.is_active && a.task_id && activityOccursOn(a, todayKey, weekday)).map((a) => a.task_id!);
  const shown = myDay ? [...myDay.today, ...myDay.missed].map((e) => e.task.id).concat([...myDay.deadlines.overdue, ...myDay.deadlines.dueToday].map((t) => t.id)) : [];
  const parentIds = [...new Set([...relevant.map((s) => s.parent_id), ...linkedToday, ...shown])];
  const [all, tasks] = await Promise.all([
    listPersonalSubtasks(parentIds),
    listTasksByIds([...new Set([...relevant.map((s) => s.parent_id), ...linkedToday])]),
  ]);
  const subtasksByTask: Record<string, Subtask[]> = {};
  for (const s of all) (subtasksByTask[s.parent_id] ??= []).push(s);
  return { subtasksByTask, tasks: tasks.filter((t) => !t.archived_at) };
}
