import { activityOccursOn } from "@/lib/routine-real";
import { groupSubtasks, type Subtask } from "@/lib/task-schedule";
import { weekdayOfKey, type DayTaskEntry, type MyDayTasks } from "@/lib/tasks";
import type { Activity, Task } from "@/types/database.types";

export type MyDayPlan = {
  /** Tarefas vinculadas à Rotina de hoje (o card da rotina abre a tarefa completa). */
  linkedTaskIds: Set<string>;
  today: DayTaskEntry[];
  missed: DayTaskEntry[];
  deadlines: Task[];
  /** Tarefas que NÃO aparecem em outra seção, mas têm subtarefas para hoje ou atrasadas. */
  subtaskParents: Task[];
};

/**
 * Regra única de "cada coisa aparece uma vez" no Meu Dia:
 *   1. Tarefa vinculada à Rotina de hoje → só no card da Rotina.
 *   2. Senão, tarefa do dia/pendente/prazo → na sua seção (com as
 *      subtarefas dentro dela).
 *   3. Subtarefas de hoje/atrasadas de tarefas que não estão em nenhuma
 *      seção acima → seção "Subtarefas", agrupadas pela tarefa-pai.
 */
export function planMyDaySections(input: {
  myDay: MyDayTasks;
  activities: Activity[];
  tasks: Task[];
  subtasksByTask: Record<string, Subtask[]>;
  todayKey: string;
  nowTime?: string;
}): MyDayPlan {
  const { myDay, todayKey } = input;
  const weekday = weekdayOfKey(todayKey);
  const taskIds = new Set(input.tasks.map((t) => t.id));
  const linkedTaskIds = new Set(
    input.activities
      .filter((a) => a.is_active && a.task_id && activityOccursOn(a, todayKey, weekday) && taskIds.has(a.task_id))
      .map((a) => a.task_id!)
  );
  const notLinked = (id: string) => !linkedTaskIds.has(id);
  const today = myDay.today.filter((e) => notLinked(e.task.id));
  const missed = myDay.missed.filter((e) => notLinked(e.task.id));
  const deadlines = [...myDay.deadlines.overdue, ...myDay.deadlines.dueToday].filter((t) => notLinked(t.id));
  const shown = new Set([...linkedTaskIds, ...today.map((e) => e.task.id), ...missed.map((e) => e.task.id), ...deadlines.map((t) => t.id)]);
  const subtaskParents = input.tasks.filter((t) => {
    if (shown.has(t.id)) return false;
    const g = groupSubtasks(input.subtasksByTask[t.id] ?? [], { todayKey, nowTime: input.nowTime });
    return g.today.length > 0 || g.overdue.length > 0;
  });
  return { linkedTaskIds, today, missed, deadlines, subtaskParents };
}
