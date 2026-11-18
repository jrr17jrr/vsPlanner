import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { isRecurringSubtask, missedSubtaskDates, nextSubtaskOccurrence, subtaskOccursOn, subtaskRecurrenceLabel } from "./subtask-recurrence";
import { subtaskRecurrenceValues } from "./supabase/subtask-rows";
import { subtaskDraftToInput, validateSubtaskDraft, EMPTY_SUBTASK_DRAFT } from "./subtask-draft";
import { buildMyDayBoard } from "./my-day-board";
import type { Subtask } from "./task-schedule";
import type { Task } from "@/types/database.types";

const monthly = (over: Partial<Subtask> = {}): Subtask => ({ id: "m", parent_type: "pessoal", parent_id: "t", user_id: "u", title: "Pagar boleto", due_date: null, is_done: false, position: 0, parent_subtask_id: null, recurrence: "monthly", weekdays: [], month_day: 10, recurrence_start: "2026-10-01", ...over });

describe("recorrência mensal das subtarefas", () => {
  it("acontece no dia do mês; em meses curtos, no último dia", () => {
    expect(isRecurringSubtask(monthly())).toBe(true);
    expect(subtaskOccursOn(monthly(), "2026-11-10")).toBe(true);
    expect(subtaskOccursOn(monthly(), "2026-11-11")).toBe(false);
    const day31 = monthly({ month_day: 31 });
    expect(subtaskOccursOn(day31, "2026-11-30")).toBe(true);
    expect(subtaskOccursOn(day31, "2026-12-31")).toBe(true);
    expect(subtaskOccursOn(day31, "2026-12-30")).toBe(false);
    expect(subtaskOccursOn(monthly({ month_day: 30 }), "2027-02-28")).toBe(true);
  });
  it("próxima execução até ~2 meses à frente; nada antes do início", () => {
    expect(nextSubtaskOccurrence(monthly(), "2026-11-11")).toBe("2026-12-10");
    expect(subtaskOccursOn(monthly({ recurrence_start: "2026-11-15" }), "2026-11-10")).toBe(false);
  });
  it("pendência atrasada só do dia que passou (janela de 7 dias)", () => {
    expect(missedSubtaskDates(monthly(), "2026-11-12")).toEqual(["2026-11-10"]);
    expect(missedSubtaskDates(monthly({ occurrences: [{ subtask_id: "m", occurrence_date: "2026-11-10", status: "concluida", completed_at: "2026-11-10T12:00:00Z" }] }), "2026-11-12")).toEqual([]);
  });
  it("rótulos: mensal, diária e semanal", () => {
    const fmt = (d: number[]) => d.join(",");
    expect(subtaskRecurrenceLabel(monthly(), fmt)).toBe("todo dia 10 do mês");
    expect(subtaskRecurrenceLabel({ recurrence: "weekly", weekdays: [0, 1, 2, 3, 4, 5, 6] }, fmt)).toBe("todos os dias");
    expect(subtaskRecurrenceLabel({ recurrence: "weekly", weekdays: [1, 3] }, fmt)).toBe("1,3");
  });
  it("servidor: valida o dia do mês e só envia month_day na mensal", () => {
    expect(subtaskRecurrenceValues({ recurrence: "monthly", monthDay: 32 }, "2026-11-17").error).toMatch(/dia do mês/);
    expect(subtaskRecurrenceValues({ recurrence: "monthly", monthDay: 10 }, "2026-11-17").values).toMatchObject({ recurrence: "monthly", month_day: 10, weekdays: [], recurrence_start: "2026-11-17" });
    expect("month_day" in subtaskRecurrenceValues({ recurrence: "weekly", weekdays: [1] }, "2026-11-17").values).toBe(false);
    expect(subtaskRecurrenceValues({ recurrence: "monthly", monthDay: 5, isChecklistItem: true }, "2026-11-17").error).toMatch(/checklist/);
  });
  it("formulário: rascunho mensal vira entrada com monthDay", () => {
    const d = { ...EMPTY_SUBTASK_DRAFT, title: "Pagar boleto", recurrence: "monthly" as const, monthDay: "" };
    expect(validateSubtaskDraft(d)).toMatch(/dia do mês/);
    expect(subtaskDraftToInput({ ...d, monthDay: "10", scheduledTime: "09:00" })).toMatchObject({ recurrence: "monthly", monthDay: 10, weekdays: [], scheduledTime: "09:00", dueDate: "", scheduledDate: null });
  });
  it("Meu Dia: subtarefa mensal aparece no dia, independente da tarefa principal", () => {
    const task = { id: "t", title: "Contas", kind: "organizadora", status: "pendente", recurrence: "none", weekdays: [], due_date: null, archived_at: null, priority: "normal" } as unknown as Task;
    const b = buildMyDayBoard({ todayKey: "2026-11-10", tasks: [task], occurrences: [], subtasks: [monthly({ parent_id: "t" })], activities: [] });
    expect(b.hoje.map((i) => i.title)).toEqual(["Pagar boleto"]);
  });
});
