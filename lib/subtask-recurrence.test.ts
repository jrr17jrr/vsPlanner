import { describe, expect, it, vi } from "vitest";
import { buildMyDayBoard, expandAllState, groupSection, type BoardInput } from "./my-day-board";
import { groupSubtasks, type Subtask, type SubtaskOccurrence } from "./task-schedule";
import { missedSubtaskDates, resolveSubtaskForDay, resolveSubtasksForDay, subtaskHistory, subtaskOccursOn } from "./subtask-recurrence";
import { checklistProgress, filterChecklist } from "./checklist-priority";
import {
  buildDayTaskRows, getDayTaskEntries, getMissedDayTaskEntries, groupDeadlineTasks, isOrganizerTask,
  mergeLinkedRoutineCompletions, taskExecutionHistory,
} from "./tasks";
import { expandRecurringSubtaskReminders } from "./push/recurring-subtask-reminders";
import { prepareSubtaskDrafts, subtaskDraftToInput, validateSubtaskDraft, EMPTY_SUBTASK_DRAFT } from "./subtask-draft";
import type { Task, TaskOccurrence } from "@/types/database.types";

vi.mock("server-only", () => ({}));
const { subtaskRecurrenceValues, buildNewSubtaskRows } = await import("@/lib/supabase/subtask-rows");

/** Semana de referência: seg 02/11/2026 … dom 08/11/2026. */
const MON = "2026-11-02", TUE = "2026-11-03", WED = "2026-11-04", THU = "2026-11-05", FRI = "2026-11-06";

function task(over: Partial<Task>): Task {
  return {
    id: "vs", space_id: "sp", user_id: "u", title: "VS Planner", description: null, kind: "organizadora", due_date: null, scheduled_time: null,
    location: null, priority: "normal", status: "pendente", category: null, notes: null, recurrence: "none", weekdays: [],
    recurrence_start: null, recurrence_until: null, archived_at: null, completed_at: null, created_at: "", updated_at: "", ...over,
  };
}
function sub(over: Partial<Subtask>): Subtask {
  return { id: "s", parent_type: "pessoal", parent_id: "vs", user_id: "u", title: "Sub", due_date: null, is_done: false, position: 0, parent_subtask_id: null, ...over };
}
const occ = (subtask_id: string, occurrence_date: string, status: "concluida" | "pendente" = "concluida"): SubtaskOccurrence => ({ subtask_id, occurrence_date, status, completed_at: status === "concluida" ? `${occurrence_date}T15:00:00Z` : null });

/** Rotina: seg/ter/qua, sem checklist. */
const routine = (over: Partial<Subtask> = {}) => sub({ id: "rotina", title: "Verificar e atualizar o VS Planner", recurrence: "weekly", weekdays: [1, 2, 3], recurrence_start: MON, ...over });
/** Melhorias: sem recorrência, com checklist. */
const improvements = sub({ id: "melhorias", title: "Atualizações pendentes do VS Planner", position: 1 });
const item = (id: string, title: string, over: Partial<Subtask> = {}) => sub({ id, title, parent_subtask_id: "melhorias", ...over });
const CHECKLIST = [
  item("c1", "Corrigir exibição dos checklists no Meu Dia", { priority: "importante", position: 0 }),
  item("c2", "Corrigir duplicações de tarefas recorrentes", { position: 1 }),
  item("c3", "Adicionar opção Expandir todas", { position: 2 }),
  item("c4", "Adicionar prioridade individual aos itens do checklist", { priority: "importante", position: 3 }),
];
const board = (todayKey: string, over: Partial<BoardInput>) => buildMyDayBoard({ todayKey, tasks: [], occurrences: [], subtasks: [], activities: [], ...over });
const allItems = (b: ReturnType<typeof board>) => [...b.hoje, ...b.atrasadas, ...b.proximas, ...b.concluidas];

describe("1. tarefa principal organizadora (sem dia fixo, sem recorrência)", () => {
  const vs = task({});
  it("não gera execução, não é 'do dia', não entra em 'Com prazo' e nunca fica atrasada", () => {
    expect(isOrganizerTask(vs)).toBe(true);
    expect(getDayTaskEntries([vs], [], MON, MON)).toEqual([]);
    expect(getMissedDayTaskEntries([vs], [], FRI, 30)).toEqual([]);
    const g = groupDeadlineTasks([vs], FRI);
    expect([...g.overdue, ...g.dueToday, ...g.upcoming, ...g.noDate]).toEqual([]);
    expect(allItems(board(FRI, { tasks: [vs] }))).toEqual([]);
  });
  it("rascunho de subtarefa em organizadora não herda data", () => {
    expect(validateSubtaskDraft({ ...EMPTY_SUBTASK_DRAFT, title: "x" })).toBeNull();
  });
});

describe("2. conversão de recorrente em organizadora preserva o histórico", () => {
  const before = task({ kind: "dia", recurrence: "weekly", weekdays: [1, 2, 3], recurrence_start: "2026-10-26" });
  const occurrences: TaskOccurrence[] = [
    { id: "o1", task_id: "vs", space_id: "sp", user_id: "u", occurrence_date: "2026-10-27", status: "concluida", completed_at: "x", title: "VS Planner", scheduled_time: null, location: null, priority: "normal", created_at: "", updated_at: "" },
    { id: "o2", task_id: "vs", space_id: "sp", user_id: "u", occurrence_date: "2026-10-28", status: "pendente", completed_at: null, title: "VS Planner (antigo)", scheduled_time: null, location: null, priority: "normal", created_at: "", updated_at: "" },
  ];
  it("depois da conversão os dias gravados (concluídos e pendentes) continuam no histórico e nada novo é gerado", () => {
    const after = task({});
    const history = taskExecutionHistory(after, occurrences, FRI);
    expect(history.map((h) => [h.date, h.done, h.title])).toEqual([["2026-10-28", false, "VS Planner (antigo)"], ["2026-10-27", true, "VS Planner"]]);
    expect(taskExecutionHistory(before, occurrences, FRI).length).toBeGreaterThan(history.length); // antes gerava dias
    expect(getMissedDayTaskEntries([after], occurrences, FRI, 30)).toEqual([]); // organizadora não fica atrasada
  });
});

describe("3–5. subtarefa recorrente com programação própria e conclusão por dia", () => {
  it("dentro de organizadora: aparece seg/ter/qua no Meu Dia identificando o VS Planner; quinta não", () => {
    const vs = task({});
    for (const d of [MON, TUE, WED]) {
      const b = board(d, { tasks: [vs], subtasks: [routine()] });
      expect(b.hoje.map((i) => i.title)).toEqual(["Verificar e atualizar o VS Planner"]);
      const row = groupSection(b.hoje)[0];
      expect(row.kind === "group" && row.parent.title).toBe("VS Planner");
    }
    // Quinta: sem obrigação do dia (segunda a quarta foram concluídas).
    const allDone = routine({ occurrences: [occ("rotina", MON), occ("rotina", TUE), occ("rotina", WED)] });
    const thu = board(THU, { tasks: [vs], subtasks: [allDone] });
    expect(thu.hoje).toEqual([]);
    expect(thu.atrasadas).toEqual([]);
  });

  it("recorrência diferente da tarefa principal: tarefa só na segunda, subtarefa só na terça", () => {
    const parent = task({ kind: "dia", recurrence: "weekly", weekdays: [1], recurrence_start: MON });
    const s = routine({ weekdays: [2] });
    const mon = board(MON, { tasks: [parent], subtasks: [s] });
    expect(mon.hoje.map((i) => i.source)).toEqual(["task"]);
    const tue = board(TUE, { tasks: [parent], subtasks: [s], occurrences: [{ id: "x", task_id: "vs", space_id: "sp", user_id: "u", occurrence_date: MON, status: "concluida", completed_at: "", title: "VS Planner", scheduled_time: null, location: null, priority: "normal", created_at: "", updated_at: "" }] });
    expect(tue.hoje.map((i) => i.source)).toEqual(["subtask"]);
    expect(subtaskOccursOn(s, MON)).toBe(false);
  });

  it("concluir segunda NÃO conclui terça; terça aparece de novo como pendente", () => {
    const s = routine({ occurrences: [occ("rotina", MON)] });
    expect(resolveSubtaskForDay(s, MON).is_done).toBe(true);
    expect(resolveSubtaskForDay(s, TUE).is_done).toBe(false);
    const tue = board(TUE, { tasks: [task({})], subtasks: [s] });
    expect(tue.hoje[0]).toMatchObject({ status: "hoje", source: "subtask", occurrenceDate: TUE });
    expect(tue.atrasadas).toEqual([]);
  });

  it("execução realmente pendente de dia anterior aparece UMA vez (com a data), sem duplicar", () => {
    const s = routine(); // segunda e terça sem conclusão
    const wed = board(WED, { tasks: [task({})], subtasks: [s] });
    expect(allItems(wed)).toHaveLength(1);
    expect(wed.hoje[0].note).toBe("Também ficou pendente em 03/11, 02/11");
    const thu = board(THU, { tasks: [task({})], subtasks: [s] });
    expect(thu.atrasadas).toHaveLength(1);
    expect(thu.atrasadas[0]).toMatchObject({ status: "execucao_atrasada", occurrenceDate: WED, note: "3 dias pendentes na semana" });
    expect(missedSubtaskDates(s, THU)).toEqual([WED, TUE, MON]);
  });

  it("próxima execução fica em Próximas sem checkbox de outro dia (occurrenceDate null)", () => {
    const s = routine({ weekdays: [5], occurrences: [] });
    const b = board(MON, { tasks: [task({})], subtasks: [s] });
    expect(b.proximas[0]).toMatchObject({ executionDate: FRI, occurrenceDate: null });
  });

  it("progresso do dia: recorrente sem execução no dia não conta", () => {
    const g = groupSubtasks(resolveSubtasksForDay([routine(), improvements], THU), { todayKey: THU });
    expect(g.total).toBe(1);
    expect(groupSubtasks(resolveSubtasksForDay([routine(), improvements], MON), { todayKey: MON }).total).toBe(2);
  });
});

describe("6–7. histórico preservado e nova subtarefa não reabre nada", () => {
  it("histórico por data: concluída na segunda, pendente na terça, hoje a fazer", () => {
    const s = routine({ occurrences: [occ("rotina", MON)] });
    expect(subtaskHistory(s, WED).map((h) => [h.date, h.done])).toEqual([[WED, false], [TUE, false], [MON, true]]);
  });
  it("editar sem mudar os dias mantém o início; mudar os dias recomeça de hoje (passado não é reescrito)", () => {
    const existing = { recurrence: "weekly", weekdays: [1, 2, 3], recurrence_start: MON, recurrence_until: null };
    expect(subtaskRecurrenceValues({ recurrence: "weekly", weekdays: [3, 1, 2] }, THU, existing).values.recurrence_start).toBe(MON);
    expect(subtaskRecurrenceValues({ recurrence: "weekly", weekdays: [1, 2, 3, 4] }, THU, existing).values.recurrence_start).toBe(THU);
    expect(subtaskRecurrenceValues({ recurrence: "weekly", weekdays: [1], recurrenceStart: "2026-10-01" }, THU).values.recurrence_start).toBe(THU);
  });
  it("subtarefa nova criada hoje não gera pendências de dias anteriores", () => {
    const created = routine({ recurrence_start: THU, weekdays: [1, 2, 3, 4] });
    expect(missedSubtaskDates(created, THU)).toEqual([]);
    expect(subtaskHistory(created, THU).map((h) => h.date)).toEqual([THU]);
  });
  it("execução da tarefa principal concluída continua concluída depois de adicionar subtarefas (estado não depende delas)", () => {
    const parent = task({ kind: "dia", recurrence: "weekly", weekdays: [1, 2, 3], recurrence_start: MON });
    const done: TaskOccurrence = { id: "d", task_id: "vs", space_id: "sp", user_id: "u", occurrence_date: MON, status: "concluida", completed_at: "", title: "VS Planner", scheduled_time: null, location: null, priority: "normal", created_at: "", updated_at: "" };
    const missed = getMissedDayTaskEntries([parent], [done], WED, 30);
    expect(missed.map((e) => e.date)).toEqual([TUE]); // segunda segue concluída
    const b = board(WED, { tasks: [parent], occurrences: [done], subtasks: [improvements, ...CHECKLIST, routine({ recurrence_start: WED })] });
    expect(allItems(b).filter((i) => i.source === "task" && i.status === "concluida")).toHaveLength(0);
    expect(b.hoje.find((i) => i.source === "task")?.note).toBe("Também ficou pendente em 03/11");
  });
});

describe("8. checklist de melhorias independente da rotina diária", () => {
  it("marcar um item na segunda e concluir a rotina não mexe nos outros itens; terça a rotina volta e os itens continuam pendentes", () => {
    const checklist = CHECKLIST.map((c) => (c.id === "c2" ? { ...c, is_done: true } : c));
    const s = routine({ occurrences: [occ("rotina", MON)] });
    const subs = [s, improvements, ...checklist];
    const mon = groupSubtasks(resolveSubtasksForDay(subs, MON), { todayKey: MON });
    expect(mon.all.find((e) => e.subtask.id === "rotina")!.subtask.is_done).toBe(true);
    const tue = resolveSubtasksForDay(subs, TUE);
    expect(tue.find((x) => x.id === "rotina")!.is_done).toBe(false);
    expect(tue.filter((x) => x.parent_subtask_id && !x.is_done).map((x) => x.id)).toEqual(["c1", "c3", "c4"]);
    expect(checklistProgress(tue.filter((x) => x.parent_subtask_id)).label).toBe("1/4 concluídos");
  });
  it("sem melhorias pendentes, a rotina ainda pode ser concluída (não depende do checklist de outra subtarefa)", () => {
    const allDone = CHECKLIST.map((c) => ({ ...c, is_done: true }));
    const subs = [routine({ occurrences: [occ("rotina", TUE)] }), improvements, ...allDone];
    expect(resolveSubtasksForDay(subs, TUE).find((x) => x.id === "rotina")!.is_done).toBe(true);
  });
});

describe("9. prioridade individual nos itens do checklist", () => {
  it("itens antigos sem prioridade valem como Normal; filtro e 'importantes primeiro' mantêm a ordem manual", () => {
    const legacy = [item("a", "Antigo", { priority: undefined, position: 0 }), ...CHECKLIST];
    expect(filterChecklist(legacy, { priority: "importante", importantFirst: false }).map((i) => i.id)).toEqual(["c1", "c4"]);
    expect(filterChecklist(legacy, { priority: "normal", importantFirst: false }).map((i) => i.id)).toEqual(["a", "c2", "c3"]);
    expect(filterChecklist(legacy, { priority: "todos", importantFirst: true }).map((i) => i.id)).toEqual(["c1", "c4", "a", "c2", "c3"]);
    expect(filterChecklist(legacy, { priority: "todos", importantFirst: false }).map((i) => i.id)).toEqual(["a", "c1", "c2", "c3", "c4"]);
  });
  it("prioridade do item não altera a subtarefa nem a tarefa principal", () => {
    const b = board(MON, { tasks: [task({})], subtasks: [routine({ priority: "normal" }), improvements, ...CHECKLIST] });
    expect(b.hoje[0].important).toBe(false);
  });
});

describe("13–15. agrupamento visual e Expandir/Recolher todas", () => {
  const parent = task({ kind: "dia", recurrence: "weekly", weekdays: [3, 4, 5], recurrence_start: WED });
  it("VS Planner com execuções de 04, 05 e 06/11 pendentes vira UM card (cada dia com a própria data)", () => {
    const today = getDayTaskEntries([parent], [], "2026-11-07", "2026-11-07");
    const missed = getMissedDayTaskEntries([parent], [], "2026-11-07", 30);
    expect(missed).toHaveLength(3);
    const rows = buildDayTaskRows(today, missed);
    expect(rows.today).toEqual([]);
    expect(rows.overdue).toHaveLength(1);
    expect(rows.overdue[0].primary.date).toBe(FRI);
    expect(rows.overdue[0].pending.map((e) => e.date)).toEqual([THU, WED]);
    expect(new Set([rows.overdue[0].primary.key, ...rows.overdue[0].pending.map((e) => e.key)]).size).toBe(3);
  });
  it("com execução hoje, as pendências anteriores ficam dentro do card de hoje (sem segunda cópia)", () => {
    const today = getDayTaskEntries([parent], [], FRI, FRI);
    const rows = buildDayTaskRows(today, getMissedDayTaskEntries([parent], [], FRI, 30));
    expect(rows.today).toHaveLength(1);
    expect(rows.today[0].pending.map((e) => e.date)).toEqual([THU, WED]);
    expect(rows.overdue).toEqual([]);
  });
  it("Expandir todas abre linhas e grupos; Recolher todas fecha", () => {
    const b = board(MON, { tasks: [task({})], subtasks: [routine(), improvements] });
    const open = expandAllState(b, true);
    expect(Object.values(open.rows).every(Boolean)).toBe(true);
    expect(Object.values(open.collapsedGroups)).toEqual([false]);
    const closed = expandAllState(b, false);
    expect(Object.values(closed.rows).some(Boolean)).toBe(false);
    expect(Object.values(closed.collapsedGroups)).toEqual([true]);
  });
});

describe("6. CAUSA das duplicações: Rotina vinculada concluía só a sessão", () => {
  const parent = task({ kind: "dia", recurrence: "weekly", weekdays: [3, 4, 5], recurrence_start: WED });
  const activities = [{ id: "act", task_id: "vs" }];
  const completions = [WED, THU, FRI].map((d) => ({ activity_id: "act", occurrence_date: d, completed_at: `${d}T21:00:00Z` }));
  it("sessões feitas na Rotina contam como execução: os dias 04, 05 e 06 deixam de aparecer como atrasados", () => {
    const merged = mergeLinkedRoutineCompletions([parent], [], activities, completions);
    expect(getMissedDayTaskEntries([parent], merged, "2026-11-07", 30)).toEqual([]);
    expect(getMissedDayTaskEntries([parent], [], "2026-11-07", 30)).toHaveLength(3); // sem a correção
  });
  it("não inventa execução em dia fora da recorrência nem mexe em tarefa não recorrente", () => {
    const merged = mergeLinkedRoutineCompletions([parent], [], activities, [{ activity_id: "act", occurrence_date: MON }]);
    expect(merged).toEqual([]);
    const single = task({ id: "x", kind: "dia", due_date: MON });
    expect(mergeLinkedRoutineCompletions([single], [], [{ id: "a2", task_id: "x" }], [{ activity_id: "a2", occurrence_date: MON }])).toEqual([]);
  });
});

describe("19. prevenção de execuções duplicadas / lembretes", () => {
  it("lembretes: uma linha por dia com execução pendente; dia concluído não avisa", () => {
    const s = routine({ scheduled_time: "18:00", reminder_offsets: [15] });
    const rows = expandRecurringSubtaskReminders([s], [occ("rotina", MON)], [MON, TUE]);
    expect(rows.map((r) => r.scheduled_date)).toEqual([TUE]);
    expect(expandRecurringSubtaskReminders([routine({ archived_at: "x" })], [], [MON])).toEqual([]);
  });
});

describe("rascunho e linhas com repetição", () => {
  it("valida dias, normaliza para repetição sem data fixa nem prazo e grava recurrence_start = hoje", () => {
    expect(validateSubtaskDraft({ ...EMPTY_SUBTASK_DRAFT, title: "Rotina", recurrence: "weekly" })).toMatch(/dia da semana/);
    const input = subtaskDraftToInput({ ...EMPTY_SUBTASK_DRAFT, title: "Rotina", recurrence: "weekly", weekdays: [3, 1, 2], scheduledDate: "2026-11-10", dueDate: "2026-11-12", scheduledTime: "18:00", reminders: [15] });
    expect(input).toMatchObject({ recurrence: "weekly", weekdays: [1, 2, 3], scheduledDate: null, dueDate: "", scheduledTime: "18:00", reminderOffsets: [15] });
    const prepared = prepareSubtaskDrafts([{ ...EMPTY_SUBTASK_DRAFT, title: "Rotina", recurrence: "weekly", weekdays: [1] }]);
    expect("inputs" in prepared && prepared.inputs).toHaveLength(1);
    const built = buildNewSubtaskRows({ parentType: "pessoal", parentId: "vs", userId: "u" }, [{ title: "Rotina", recurrence: "weekly", weekdays: [1, 2, 3] }]);
    if ("error" in built) throw new Error(built.error);
    expect(built.rows[0]).toMatchObject({ recurrence: "weekly", weekdays: [1, 2, 3], scheduled_date: null, due_date: null });
    expect(typeof built.rows[0].recurrence_start).toBe("string");
  });
  it("item de checklist não pode repetir; término antes do início é recusado", () => {
    expect(subtaskRecurrenceValues({ recurrence: "weekly", weekdays: [1], isChecklistItem: true }, MON).error).toMatch(/checklist/);
    expect(subtaskRecurrenceValues({ recurrence: "weekly", weekdays: [1], recurrenceStart: WED, recurrenceUntil: TUE }, MON).error).toMatch(/término/);
    expect(subtaskRecurrenceValues({ recurrence: "none" }, MON).values).toEqual({ recurrence: "none", weekdays: [], recurrence_start: null, recurrence_until: null });
  });
});

describe("16. compatibilidade com subtarefas antigas", () => {
  it("subtarefa sem campos de recorrência (antes da migration) funciona como sempre", () => {
    const old = sub({ id: "old", scheduled_date: MON, is_done: true });
    expect(resolveSubtaskForDay(old, MON)).toBe(old);
    expect(board(MON, { tasks: [task({ kind: "dia", due_date: MON })], subtasks: [old] }).concluidas).toHaveLength(0); // concluída sem completed_at hoje
    expect(groupSubtasks([old], { todayKey: MON })).toMatchObject({ done: 1, total: 1 });
  });
});
