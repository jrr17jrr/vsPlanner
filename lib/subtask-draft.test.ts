import { describe, expect, it, vi } from "vitest";
import { EMPTY_SUBTASK_DRAFT, inheritedSubtaskDraft, isBlankSubtaskDraft, prepareSubtaskDrafts, subtaskDraftToInput, validateSubtaskDraft } from "./subtask-draft";

vi.mock("server-only", () => ({}));
const { buildNewSubtaskRows, subtaskScheduleValues } = await import("@/lib/supabase/subtask-rows");

const draft = (over: Partial<typeof EMPTY_SUBTASK_DRAFT>) => ({ ...EMPTY_SUBTASK_DRAFT, ...over });

describe("rascunho de subtarefa", () => {
  it("herda a data da tarefa principal (dia → execução; prazo → prazo final; recorrente → nada)", () => {
    expect(inheritedSubtaskDraft({ kind: "dia", date: "2026-11-10", recurring: false })).toMatchObject({ scheduledDate: "2026-11-10", dueDate: "" });
    expect(inheritedSubtaskDraft({ kind: "prazo", date: "2026-11-20", recurring: false })).toMatchObject({ scheduledDate: "", dueDate: "2026-11-20" });
    expect(inheritedSubtaskDraft({ kind: "dia", date: "", recurring: true })).toMatchObject({ scheduledDate: "", dueDate: "" });
  });

  it("valida título e prazo antes da execução", () => {
    expect(validateSubtaskDraft(draft({}))).toMatch(/título/);
    expect(validateSubtaskDraft(draft({ title: "x".repeat(301) }))).toMatch(/300/);
    expect(validateSubtaskDraft(draft({ title: "A", scheduledDate: "2026-11-10", dueDate: "2026-11-09" }))).toMatch(/prazo final/);
    expect(validateSubtaskDraft(draft({ title: "A", scheduledDate: "2026-11-10", dueDate: "2026-11-10" }))).toBeNull();
  });

  it("normaliza: horário só com data, horário limite só com prazo, lembretes só com execução", () => {
    expect(subtaskDraftToInput(draft({ title: " Gravar ", scheduledTime: "10:00", deadlineTime: "18:00", reminders: [15] }))).toEqual({
      title: "Gravar", description: "", dueDate: "", scheduledDate: null, scheduledTime: null, deadlineTime: null, priority: "normal", reminderOffsets: [],
      recurrence: "none", weekdays: [], recurrenceStart: null, recurrenceUntil: null,
    });
    expect(subtaskDraftToInput(draft({ title: "A", scheduledDate: "2026-11-10", scheduledTime: "10:00", dueDate: "2026-11-12", deadlineTime: "18:00", reminders: [0, 60], priority: "importante" }), false)).toEqual({
      title: "A", description: undefined, dueDate: "2026-11-12", scheduledDate: "2026-11-10", scheduledTime: "10:00", deadlineTime: "18:00", priority: "importante", reminderOffsets: [0, 60],
      recurrence: "none", weekdays: [], recurrenceStart: null, recurrenceUntil: null,
    });
  });

  it("ignora rascunhos vazios (mesmo com data herdada) e aponta qual subtarefa está errada", () => {
    expect(isBlankSubtaskDraft(draft({ scheduledDate: "2026-11-10" }))).toBe(true);
    const ok = prepareSubtaskDrafts([draft({ title: "Roteiro" }), draft({ scheduledDate: "2026-11-10" }), draft({ title: "Gravar" })]);
    expect("inputs" in ok && ok.inputs.map((i) => i.title)).toEqual(["Roteiro", "Gravar"]);
    expect(prepareSubtaskDrafts([draft({ title: "Ok" }), draft({ description: "sem título" })])).toEqual({ error: "Subtarefa 2: Informe o título da subtarefa." });
  });
});

describe("linhas de task_subtasks (servidor)", () => {
  const parent = { parentType: "clt" as const, parentId: "t1", userId: "u1" };

  it("monta todas as linhas na ordem, com agenda e descrição", () => {
    const r = buildNewSubtaskRows(parent, [
      { title: "Roteiro", description: "  ideia  ", scheduledDate: "2026-11-10", scheduledTime: "09:00", dueDate: "2026-11-12", deadlineTime: null, priority: "importante", reminderOffsets: [60, 0, 60] },
      { title: "Gravar", description: "", scheduledDate: null, scheduledTime: null, dueDate: "", deadlineTime: null, priority: "normal", reminderOffsets: [] },
    ]);
    if ("error" in r) throw new Error(r.error);
    expect(r.rows[0]).toMatchObject({ parent_type: "clt", parent_id: "t1", user_id: "u1", title: "Roteiro", position: 0, description: "ideia", scheduled_date: "2026-11-10", scheduled_time: "09:00", due_date: "2026-11-12", priority: "importante", reminder_offsets: [0, 60] });
    expect(r.rows[1]).toMatchObject({ title: "Gravar", position: 1, due_date: null, scheduled_date: null });
    expect(r.rows[1]).not.toHaveProperty("description");
  });

  it("recusa o lote inteiro se uma subtarefa for inválida (nada é gravado)", () => {
    expect(buildNewSubtaskRows(parent, [{ title: "Ok" }, { title: "Ruim", scheduledDate: "2026-11-10", dueDate: "2026-11-01" }])).toEqual({ error: "Subtarefa 2: O prazo final não pode ser antes do dia de execução." });
    expect(buildNewSubtaskRows(parent, [{ title: "   " }])).toEqual({ error: "Informe um título de até 300 caracteres." });
    expect(subtaskScheduleValues({ scheduledTime: "25h" }).error).toBe("Horário inválido.");
    expect(subtaskScheduleValues({ dueDate: "10/11/2026" }).error).toBe("Data inválida.");
  });
});
