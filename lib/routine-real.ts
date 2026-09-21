import type { Activity, ActivityCompletion } from "@/types/database.types";
import { toDateKey } from "@/lib/format";

export type RealActivityOccurrence = {
  activity: Activity;
  date: string;
  completed: boolean;
};

/**
 * Expande a rotina real (migration 008) num intervalo de datas.
 * `weekdays` é a lista explícita de dias (0=domingo..6=sábado) — sem
 * "tipos de recorrência" separados, cobre diária (0-6), dias úteis
 * (1-5) ou qualquer combinação específica com a mesma estrutura.
 * "Concluída" nunca vem da própria atividade — vem de
 * `ActivityCompletion` por (activity_id, date), então marcar hoje nunca
 * afeta outra ocorrência.
 */
export function getRealOccurrences(
  activities: Activity[],
  completions: ActivityCompletion[],
  start: Date,
  end: Date
): RealActivityOccurrence[] {
  const completedSet = new Set(completions.map((c) => `${c.activity_id}__${c.occurrence_date}`));
  const out: RealActivityOccurrence[] = [];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setHours(0, 0, 0, 0);

  while (cursor <= last) {
    const dateKey = toDateKey(cursor);
    const weekday = cursor.getDay();
    for (const activity of activities) {
      if (!activity.is_active) continue;
      if (!activity.weekdays.includes(weekday)) continue;
      out.push({ activity, date: dateKey, completed: completedSet.has(`${activity.id}__${dateKey}`) });
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return out.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.activity.start_time.localeCompare(b.activity.start_time);
  });
}

export function getRealOccurrencesForDay(
  activities: Activity[],
  completions: ActivityCompletion[],
  date: Date
): RealActivityOccurrence[] {
  return getRealOccurrences(activities, completions, date, date);
}
