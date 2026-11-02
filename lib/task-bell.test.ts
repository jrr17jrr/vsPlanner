import { describe, expect, it } from "vitest";
import { buildTaskBellItems } from "./task-bell";
import type { Subtask } from "./task-schedule";
import type { Task } from "@/types/database.types";

const t = (over: Partial<Task>): Task => ({
  id: "t1", space_id: "s", user_id: "u", title: "VS Planner", description: null, kind: "dia", due_date: null, scheduled_time: null, location: null,
  priority: "normal", status: "pendente", category: null, notes: null, recurrence: "none", weekdays: [], recurrence_start: null, recurrence_until: null,
  archived_at: null, completed_at: null, created_at: "", updated_at: "", ...over,
});
const s = (over: Partial<Subtask>): Subtask => ({ id: "s1", parent_type: "pessoal", parent_id: "t1", user_id: "u", title: "Atualizar banco", due_date: null, is_done: false, position: 0, parent_subtask_id: null, ...over });

describe("sino — tarefas e subtarefas", () => {
  const base = { todayKey: "2026-11-06", nowTime: "10:00" };
  it("subtarefa com prazo vencido aparece como atrasada com o nome da tarefa", () => {
    const items = buildTaskBellItems({ ...base, tasks: [t({})], subtasks: [s({ due_date: "2026-11-05" })] });
    expect(items).toEqual([expect.objectContaining({ title: "Atrasada", message: "VS Planner — Atualizar banco • prazo 05/11", urgent: true })]);
  });
  it("concluída ou de tarefa concluída não aparece", () => {
    expect(buildTaskBellItems({ ...base, tasks: [t({})], subtasks: [s({ due_date: "2026-11-05", is_done: true })] })).toHaveLength(0);
    expect(buildTaskBellItems({ ...base, tasks: [t({ status: "concluida" })], subtasks: [s({ due_date: "2026-11-05" })] })).toHaveLength(0);
  });
  it("um item por registro, priorizando o prazo", () => {
    const items = buildTaskBellItems({ ...base, tasks: [t({ due_date: "2026-11-06", scheduled_time: "09:00", deadline_date: "2026-11-06" })], subtasks: [] });
    expect(items.map((i) => i.title)).toEqual(["Último dia"]);
  });
  it("execução de hoje só depois do horário", () => {
    expect(buildTaskBellItems({ ...base, tasks: [t({ due_date: "2026-11-06", scheduled_time: "11:00" })], subtasks: [] })).toHaveLength(0);
    expect(buildTaskBellItems({ ...base, tasks: [t({ due_date: "2026-11-06", scheduled_time: "09:30" })], subtasks: [] })[0].title).toBe("Lembrete de tarefa");
  });
});
