import { describe, expect, it } from "vitest";
import { localDateTimeParts, selectDueReminders, type ReminderTable, type ReminderTask } from "./reminders";

// 2026-10-30 (sexta-feira) 14:05 em São Paulo = 17:05 UTC.
const NOW = new Date("2026-10-30T17:05:30Z");
const task = (over: Partial<ReminderTask> & { table?: ReminderTable } = {}) => ({
  id: "t1", user_id: "u1", title: "Ligar cliente", due_date: "2026-10-30", scheduled_time: "14:00:00",
  status: "pendente", archived_at: null, recurrence: "none", weekdays: [], recurrence_start: null, recurrence_until: null,
  table: "tasks" as ReminderTable, ...over,
});

describe("localDateTimeParts", () => {
  it("usa o fuso de São Paulo, não UTC", () => {
    expect(localDateTimeParts(NOW)).toEqual({ date: "2026-10-30", time: "14:05" });
    // 01:30 UTC do dia 31 ainda é dia 30 em São Paulo.
    expect(localDateTimeParts(new Date("2026-10-31T01:30:00Z")).date).toBe("2026-10-30");
  });
});

describe("selectDueReminders", () => {
  it("notifica tarefa única pendente dentro da janela", () => {
    const due = selectDueReminders({ now: NOW, tasks: [task()] });
    expect(due).toHaveLength(1);
    expect(due[0].eventKey).toBe("task-reminder:tasks:t1:2026-10-30:14:00");
  });

  it("não notifica tarefa concluída (status real do banco é 'concluida')", () => {
    expect(selectDueReminders({ now: NOW, tasks: [task({ status: "concluida" })] })).toHaveLength(0);
  });

  it("não notifica tarefa arquivada", () => {
    expect(selectDueReminders({ now: NOW, tasks: [task({ archived_at: "2026-10-29T10:00:00Z" })] })).toHaveLength(0);
  });

  it("não notifica horários futuros nem antigos demais", () => {
    expect(selectDueReminders({ now: NOW, tasks: [task({ scheduled_time: "14:06" })] })).toHaveLength(0);
    expect(selectDueReminders({ now: NOW, tasks: [task({ scheduled_time: "13:49" })] })).toHaveLength(0);
    expect(selectDueReminders({ now: NOW, tasks: [task({ scheduled_time: "13:50" })] })).toHaveLength(1);
  });

  it("ignora outro dia", () => {
    expect(selectDueReminders({ now: NOW, tasks: [task({ due_date: "2026-10-31" })] })).toHaveLength(0);
  });

  it("notifica recorrente semanal no dia certo e respeita a ocorrência concluída", () => {
    const weekly = task({ id: "w1", recurrence: "weekly", due_date: null, weekdays: [5], recurrence_start: "2026-10-01", table: "clt_tasks" });
    const due = selectDueReminders({ now: NOW, tasks: [weekly] });
    expect(due).toHaveLength(1);
    expect(due[0].url).toBe("/trabalho");
    const done = selectDueReminders({ now: NOW, tasks: [weekly], occurrences: [{ table: "clt_tasks", task_id: "w1", occurrence_date: "2026-10-30", status: "concluida" }] });
    expect(done).toHaveLength(0);
    expect(selectDueReminders({ now: NOW, tasks: [{ ...weekly, weekdays: [1] }] })).toHaveLength(0);
    expect(selectDueReminders({ now: NOW, tasks: [{ ...weekly, recurrence_until: "2026-10-29" }] })).toHaveLength(0);
  });

  it("respeita as preferências de notificação", () => {
    const prefs = new Map([["u1", { tasks: false, clt: true }]]);
    expect(selectDueReminders({ now: NOW, tasks: [task()], preferences: prefs })).toHaveLength(0);
    expect(selectDueReminders({ now: NOW, tasks: [task({ table: "clt_tasks" })], preferences: prefs })).toHaveLength(1);
  });

  it("mantém cada lembrete com o dono da tarefa", () => {
    const due = selectDueReminders({ now: NOW, tasks: [task(), task({ id: "t2", user_id: "u2" })] });
    expect(due.map(d => d.userId)).toEqual(["u1", "u2"]);
  });
});
