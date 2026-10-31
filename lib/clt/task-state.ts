import type { CltTask } from "@/types/database.types";

/**
 * Estado das tarefas CLT no dia de hoje (horário de Brasília). Tarefas
 * semanais são concluídas por ocorrência; as demais pelo `status`.
 * Usado pela aba Tarefas e pela prévia da Visão Geral (mesma regra).
 */
export type TaskOccurrence = { task_id: string; occurrence_date: string; status: string; completed_at: string | null };

export const todaySaoPaulo = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

export function isActiveOn(t: CltTask, day: string): boolean {
  if (t.recurrence !== "weekly") return true;
  const wd = new Date(day + "T12:00:00").getDay();
  return t.weekdays.includes(wd) && (!t.recurrence_start || t.recurrence_start <= day) && (!t.recurrence_until || t.recurrence_until >= day);
}

export function isDoneOn(t: CltTask, occurrences: TaskOccurrence[], day: string): boolean {
  return t.recurrence === "weekly"
    ? occurrences.some(o => o.task_id === t.id && o.occurrence_date === day && o.status === "concluida")
    : t.status === "concluida";
}

export const VIDEO_TASK_TITLES = ["Produção de Vídeos | Mensal", "Criar Vídeos | Meta Ads"];
