import { toDateKey } from "@/lib/format";
import type { Task, WorkTask } from "@/types/entities";

export type Classification = "atrasada" | "hoje" | "proxima" | "sem_data";

export function classifyByDate(
  dueDate: string | undefined,
  status: string,
  today: string = toDateKey(new Date())
): Classification {
  if (!dueDate) return "sem_data";
  if (status === "concluida") return dueDate === today ? "hoje" : dueDate < today ? "atrasada" : "proxima";
  if (dueDate < today) return "atrasada";
  if (dueDate === today) return "hoje";
  return "proxima";
}

export function isPendingToday<T extends { dueDate?: string; status: string }>(
  item: T,
  today: string = toDateKey(new Date())
): boolean {
  return item.dueDate === today && item.status !== "concluida";
}

export interface DayCounts {
  done: number;
  total: number;
  pct: number;
}

export function countProgress(items: { status: string }[]): DayCounts {
  const total = items.length;
  const done = items.filter((i) => i.status === "concluida" || (i as { completed?: boolean }).completed).length;
  return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
}

export function periodOfDay(time: string): "manha" | "tarde" | "noite" {
  const [h] = time.split(":").map(Number);
  if (h < 12) return "manha";
  if (h < 18) return "tarde";
  return "noite";
}

export const PERIOD_LABELS: Record<string, string> = {
  manha: "Manhã",
  tarde: "Tarde",
  noite: "Noite",
};

export function tasksForDay(tasks: Task[], userId: string, date: string): Task[] {
  return tasks.filter((t) => t.userId === userId && t.dueDate === date);
}

export function workTasksForDay(workTasks: WorkTask[], userId: string, date: string): WorkTask[] {
  return workTasks.filter((t) => t.userId === userId && t.dueDate === date);
}
