import { toDateKey } from "@/lib/format";

/** Returns yyyy-MM-dd for "today + offsetDays" (offset can be negative). */
export function relativeDay(offsetDays: number, base: Date = new Date()): string {
  const d = new Date(base);
  d.setDate(d.getDate() + offsetDays);
  return toDateKey(d);
}

export function relativeMonthDay(
  monthOffset: number,
  day: number,
  base: Date = new Date()
): string {
  const d = new Date(base.getFullYear(), base.getMonth() + monthOffset, day);
  return toDateKey(d);
}

export function competenciaOffset(monthOffset: number, base: Date = new Date()): string {
  const d = new Date(base.getFullYear(), base.getMonth() + monthOffset, 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function startOfWeekMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 sunday .. 6 saturday
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, amount: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + amount);
  return d;
}

export function isSameDayKey(dateKey: string, date: Date): boolean {
  return dateKey === toDateKey(date);
}

/** Checks whether an activity (with recurrence rules) occurs on the given date. */
export function activityOccursOn(
  activity: { date: string; recurrence: string; recurrenceDays?: number[] },
  date: Date
): boolean {
  const dateKey = toDateKey(date);
  const startKey = activity.date;
  if (dateKey < startKey) return false;

  switch (activity.recurrence) {
    case "diaria":
      return true;
    case "segunda_sexta":
      return date.getDay() >= 1 && date.getDay() <= 5;
    case "semanal": {
      const start = new Date(startKey);
      return start.getDay() === date.getDay();
    }
    case "dias_especificos":
      return (activity.recurrenceDays ?? []).includes(date.getDay());
    case "nenhuma":
    default:
      return dateKey === startKey;
  }
}
