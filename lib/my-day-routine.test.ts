import { describe, expect, it } from "vitest";
import { buildMyDayBoard } from "./my-day-board";
import { activityOccursOn, getRealOccurrences } from "./routine-real";
import { groupSubtasks, type Subtask } from "./task-schedule";
import type { Activity, ActivityCompletion, Task } from "@/types/database.types";

const MON = "2026-11-02";

function task(over: Partial<Task>): Task {
  return {
    id: "t", space_id: "s", user_id: "u", title: "Tarefa", description: null, kind: "dia", due_date: null, scheduled_time: null,
    location: null, priority: "normal", status: "pendente", category: null, notes: null, recurrence: "none", weekdays: [],
    recurrence_start: null, recurrence_until: null, archived_at: null, completed_at: null, created_at: "", updated_at: "", ...over,
  };
}
function activity(over: Partial<Activity>): Activity {
  return { id: "a", space_id: "s", user_id: "u", title: "Atividade", category: null, weekdays: [1], start_time: "18:00:00", end_time: null, is_active: true, sort_order: 0, notes: null, created_at: "", updated_at: "", ...over };
}
function sub(over: Partial<Subtask>): Subtask {
  return { id: "s", parent_type: "pessoal", parent_id: "t", user_id: "u", title: "Sub", due_date: null, is_done: false, position: 0, parent_subtask_id: null, ...over };
}

describe("Rotina — repetição semanal x somente uma vez", () => {
  const weekly = activity({ id: "w", weekdays: [1] });
  const once = activity({ id: "o", weekdays: [], specific_date: MON });
  it("semanal aparece todas as segundas; única só naquela segunda", () => {
    const occ = getRealOccurrences([weekly, once], [], new Date(2026, 10, 2), new Date(2026, 10, 16));
    expect(occ.filter((o) => o.activity.id === "w").map((o) => o.date)).toEqual(["2026-11-02", "2026-11-09", "2026-11-16"]);
    expect(occ.filter((o) => o.activity.id === "o").map((o) => o.date)).toEqual([MON]);
  });
  it("ocorrência única ignora weekdays", () => {
    expect(activityOccursOn({ weekdays: [3], specific_date: MON }, MON, 1)).toBe(true);
    expect(activityOccursOn({ weekdays: [1], specific_date: MON }, "2026-11-09", 1)).toBe(false);
  });
  it("concluir a sessão de um dia não conclui os outros", () => {
    const done: ActivityCompletion[] = [{ id: "c", activity_id: "w", user_id: "u", occurrence_date: MON, completed_at: "" }];
    const occ = getRealOccurrences([weekly], done, new Date(2026, 10, 2), new Date(2026, 10, 9));
    expect(occ.map((o) => o.completed)).toEqual([true, false]);
  });
});

describe("Meu Dia — vínculo com a Rotina (quatro seções)", () => {
  const vs = task({ id: "vs", title: "VS Planner", due_date: MON, deadline_date: "2026-11-05" });
  const other = task({ id: "other", title: "Outra", due_date: MON });
  const parentOnly = task({ id: "p", title: "Estudar JavaScript", kind: "prazo", due_date: "2026-11-20" });
  const subs = [sub({ id: "s1", parent_id: "vs", scheduled_date: MON, title: "s1" }), sub({ id: "s2", parent_id: "p", scheduled_date: MON, title: "s2" }), sub({ id: "s3", parent_id: "p", due_date: "2026-10-30", title: "s3" })];
  const run = (activities: Activity[]) => buildMyDayBoard({ todayKey: MON, tasks: [vs, other, parentOnly], occurrences: [], subtasks: subs, activities });

  it("tarefa vinculada à rotina de hoje sai de Hoje (fica no card da Rotina)", () => {
    const b = run([activity({ task_id: "vs" })]);
    expect(b.linkedTaskIds).toEqual(["vs"]);
    expect(b.hoje.map((i) => i.title)).toEqual(["Outra", "s2"]);
  });
  it("sem vínculo hoje (rotina em outro dia), continua em Hoje", () => {
    const b = run([activity({ task_id: "vs", weekdays: [3] })]);
    expect(b.hoje.map((i) => i.title)).toEqual(["Outra", "s2", "VS Planner", "s1"]);
  });
  it("subtarefas de tarefa que não está no dia aparecem sozinhas, com o vínculo", () => {
    const b = run([]);
    expect(b.atrasadas.map((i) => [i.title, i.status])).toEqual([["s3", "prazo_vencido"]]);
    const g = groupSubtasks(subs.filter((x) => x.parent_id === "p"), { todayKey: MON });
    expect(g.today.map((e) => e.subtask.id)).toEqual(["s2"]);
    expect(g.overdue.map((e) => e.subtask.id)).toEqual(["s3"]);
  });
  it("vínculo inativo não esconde a tarefa", () => {
    expect(run([activity({ task_id: "vs", is_active: false })]).linkedTaskIds).toEqual([]);
  });
});
