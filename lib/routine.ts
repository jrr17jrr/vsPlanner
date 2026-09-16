import { activityOccursOn } from "@/lib/dates";
import { toDateKey } from "@/lib/format";
import type { Activity } from "@/types/entities";

export interface ActivityOccurrence {
  activity: Activity;
  date: string;
  completed: boolean;
}

export function getOccurrences(
  activities: Activity[],
  start: Date,
  end: Date
): ActivityOccurrence[] {
  const out: ActivityOccurrence[] = [];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setHours(0, 0, 0, 0);

  while (cursor <= last) {
    const dateKey = toDateKey(cursor);
    for (const activity of activities) {
      if (activityOccursOn(activity, cursor)) {
        out.push({
          activity,
          date: dateKey,
          completed: activity.completedDates.includes(dateKey),
        });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return out.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.activity.startTime.localeCompare(b.activity.startTime);
  });
}

export function getOccurrencesForDay(activities: Activity[], date: Date): ActivityOccurrence[] {
  return getOccurrences(activities, date, date);
}

export function toggleCompletion(activity: Activity, dateKey: string): string[] {
  if (activity.completedDates.includes(dateKey)) {
    return activity.completedDates.filter((d) => d !== dateKey);
  }
  return [...activity.completedDates, dateKey];
}
