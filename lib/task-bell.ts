import { scheduleState, subtaskSchedule, taskSchedule, type Subtask } from "@/lib/task-schedule";
import type { Task } from "@/types/database.types";

export type TaskBellItem = { id: string; title: string; message: string; href: string; urgent: boolean; createdAt: string };

const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/**
 * Itens do sino para tarefas e subtarefas pessoais — mesma regra de
 * execução x prazo das telas e do push. Um item por registro (o mais
 * importante: prazo vencido > último dia > execução de hoje já no horário),
 * com id estável, então nada se repete se a tarefa estiver em várias telas.
 */
export function buildTaskBellItems(input: { tasks: Task[]; subtasks: Subtask[]; todayKey: string; nowTime: string }): TaskBellItem[] {
  const { todayKey, nowTime } = input;
  const items: TaskBellItem[] = [];
  const titleById = new Map(input.tasks.map((t) => [t.id, t]));

  function push(id: string, label: string, schedule: ReturnType<typeof taskSchedule>, done: boolean, href: string) {
    const state = scheduleState(schedule, done, { todayKey, nowTime });
    if (state.deadlineOverdue) {
      items.push({ id, title: "Atrasada", message: `${label} • prazo ${ddmm(schedule.deadlineDate!)}`, href, urgent: true, createdAt: `${schedule.deadlineDate}T${schedule.deadlineTime ?? "23:59"}` });
    } else if (state.deadlineToday) {
      items.push({ id, title: "Último dia", message: `${label}${schedule.deadlineTime ? ` • até ${schedule.deadlineTime}` : ""}`, href, urgent: true, createdAt: `${todayKey}T00:00` });
    } else if (state.scheduledOn && schedule.executionTime && schedule.executionTime <= nowTime) {
      items.push({ id, title: "Lembrete de tarefa", message: `${label} • ${schedule.executionTime}`, href: "/hoje", urgent: true, createdAt: `${todayKey}T${schedule.executionTime}` });
    }
  }

  for (const task of input.tasks) {
    if (task.archived_at || task.recurrence === "weekly") continue;
    push(`task-${task.id}-${todayKey}`, task.title, taskSchedule(task), task.status === "concluida", "/tarefas");
  }
  for (const sub of input.subtasks) {
    const parent = titleById.get(sub.parent_id);
    if (!parent || parent.archived_at || (parent.recurrence !== "weekly" && parent.status === "concluida")) continue;
    push(`subtask-${sub.id}-${todayKey}`, `${parent.title} — ${sub.title}`, subtaskSchedule(sub), sub.is_done, "/tarefas");
  }
  return items;
}
