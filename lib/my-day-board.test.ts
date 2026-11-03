import { describe, expect, it } from "vitest";
import { buildMyDayBoard, classifySchedule, spDateKey, type BoardInput, type BoardItem } from "./my-day-board";
import type { Subtask } from "./task-schedule";
import type { Activity, CltTask, Task, TaskOccurrence } from "@/types/database.types";

const TODAY = "2026-11-02"; // segunda

function task(over: Partial<Task>): Task {
  return {
    id: "t", space_id: "s", user_id: "u", title: "Tarefa", description: null, kind: "dia", due_date: null, scheduled_time: null,
    location: null, priority: "normal", status: "pendente", category: null, notes: null, recurrence: "none", weekdays: [],
    recurrence_start: null, recurrence_until: null, archived_at: null, completed_at: null, created_at: "", updated_at: "", ...over,
  };
}
function sub(over: Partial<Subtask>): Subtask {
  return { id: "s", parent_type: "pessoal", parent_id: "t", user_id: "u", title: "Sub", due_date: null, is_done: false, position: 0, parent_subtask_id: null, ...over };
}
function clt(over: Partial<CltTask>): CltTask {
  return { id: "c", user_id: "u", company_id: "sgiv", title: "CLT", description: null, kind: "dia", due_date: null, scheduled_time: null, priority: "normal", status: "pendente", notes: null, recurrence: "none", weekdays: [], recurrence_start: null, recurrence_until: null, archived_at: null, completed_at: null, created_at: "", updated_at: "", ...over };
}
const board = (over: Partial<BoardInput>) => buildMyDayBoard({ todayKey: TODAY, tasks: [], occurrences: [], subtasks: [], activities: [], ...over });
const titles = (items: BoardItem[]) => items.map((i) => i.title);
const statusOf = (b: ReturnType<typeof board>, title: string) =>
  (["hoje", "atrasadas", "proximas", "concluidas"] as const).flatMap((s) => b[s]).filter((i) => i.title === title).map((i) => i.status);

describe("classificação (regras do pedido)", () => {
  const c = (e: string | null, d: string | null, done = false, completedOn: string | null = null) => classifySchedule({ executionDate: e, deadlineDate: d, done, completedOn }, TODAY);
  it("hoje: execução hoje; sem execução, prazo hoje", () => {
    expect(c(TODAY, "2026-11-05")).toBe("hoje");
    expect(c(null, TODAY)).toBe("hoje");
  });
  it("Exemplo A — prazo vencido (execução 28/10, prazo 29/10)", () => expect(c("2026-10-28", "2026-10-29")).toBe("prazo_vencido"));
  it("Exemplo B — execução atrasada (execução 30/10, prazo 05/11)", () => expect(c("2026-10-30", "2026-11-05")).toBe("execucao_atrasada"));
  it("ambas vencidas → só prazo vencido", () => expect(c("2026-10-20", "2026-10-25")).toBe("prazo_vencido"));
  it("execução hoje mas prazo já vencido → prazo vencido continua", () => expect(c(TODAY, "2026-11-01")).toBe("prazo_vencido"));
  it("próximas: até 7 dias; além disso não aparece", () => {
    expect(c("2026-11-04", "2026-11-07")).toBe("proxima");
    expect(c(null, "2026-11-09")).toBe("proxima");
    expect(c("2026-11-10", null)).toBeNull();
  });
  it("sem nenhuma data não é classificada (nem como atrasada)", () => expect(c(null, null)).toBeNull());
  it("concluída hoje → Concluídas; concluída antes → some; concluída nunca é atrasada", () => {
    expect(c("2026-10-01", "2026-10-02", true, TODAY)).toBe("concluida");
    expect(c("2026-10-01", "2026-10-02", true, "2026-11-01")).toBeNull();
  });
});

describe("virada do dia e fuso (America/Sao_Paulo)", () => {
  it("23:30 em São Paulo ainda é o mesmo dia (02:30 UTC do dia seguinte)", () => {
    expect(spDateKey("2026-11-03T02:30:00Z")).toBe("2026-11-02");
    expect(spDateKey("2026-11-03T03:00:00Z")).toBe("2026-11-03");
  });
  it("concluída às 23:30 de ontem (SP) não conta como concluída hoje", () => {
    const b = board({ tasks: [task({ id: "x", title: "Ontem à noite", due_date: "2026-11-01", status: "concluida", completed_at: "2026-11-02T02:30:00Z" })] });
    expect(b.concluidas).toHaveLength(0);
  });
  it("a mesma tarefa muda de seção quando o dia vira", () => {
    const t = task({ id: "x", title: "Amanhã", due_date: "2026-11-03" });
    expect(statusOf(buildMyDayBoard({ todayKey: TODAY, tasks: [t], occurrences: [], subtasks: [], activities: [] }), "Amanhã")).toEqual(["proxima"]);
    expect(statusOf(buildMyDayBoard({ todayKey: "2026-11-03", tasks: [t], occurrences: [], subtasks: [], activities: [] }), "Amanhã")).toEqual(["hoje"]);
    expect(statusOf(buildMyDayBoard({ todayKey: "2026-11-04", tasks: [t], occurrences: [], subtasks: [], activities: [] }), "Amanhã")).toEqual(["execucao_atrasada"]);
  });
});

describe("quatro seções com os exemplos do pedido", () => {
  const b = board({
    tasks: [
      task({ id: "1", title: "Analisar campanha da SGIV", due_date: TODAY, deadline_date: "2026-11-05" }),
      task({ id: "2", title: "Criar públicos da Visionário Dev", due_date: "2026-10-28", deadline_date: "2026-10-29" }),
      task({ id: "3", title: "Preparar vídeo da SGIV", due_date: "2026-10-30", deadline_date: "2026-11-05" }),
      task({ id: "4", title: "Publicar anúncio da Visionário Dev", due_date: "2026-11-04", deadline_date: "2026-11-07" }),
      task({ id: "5", title: "Criar campanha de engajamento", due_date: "2026-11-01", status: "concluida", completed_at: "2026-11-02T13:00:00Z" }),
      task({ id: "6", title: "Sem data", kind: "prazo", due_date: null }),
      task({ id: "7", title: "Prazo-only vencido", kind: "prazo", due_date: "2026-10-31" }),
    ],
  });
  it("Hoje", () => expect(titles(b.hoje)).toEqual(["Analisar campanha da SGIV"]));
  it("Atrasadas: prazo vencido primeiro, execução atrasada depois, cada um com seu alerta", () => {
    expect(b.atrasadas.map((i) => [i.title, i.status])).toEqual([
      ["Criar públicos da Visionário Dev", "prazo_vencido"],
      ["Prazo-only vencido", "prazo_vencido"],
      ["Preparar vídeo da SGIV", "execucao_atrasada"],
    ]);
  });
  it("Próximas", () => expect(titles(b.proximas)).toEqual(["Publicar anúncio da Visionário Dev"]));
  it("Concluídas", () => expect(b.concluidas.map((i) => [i.title, i.completedOn])).toEqual([["Criar campanha de engajamento", TODAY]]));
  it("tarefa sem data não aparece em lugar nenhum do Meu Dia", () => expect(statusOf(b, "Sem data")).toEqual([]));
  it("prazo-only sem execução não ganha execução inventada", () => {
    const i = b.atrasadas.find((x) => x.title === "Prazo-only vencido")!;
    expect(i.executionDate).toBeNull();
    expect(i.deadlineDate).toBe("2026-10-31");
  });
});

describe("subtarefas", () => {
  const parent = task({ id: "p", title: "Lançamento", due_date: TODAY, deadline_date: "2026-11-10" });
  const b = board({
    tasks: [parent, task({ id: "q", title: "Outra", due_date: "2026-11-20" })],
    subtasks: [
      sub({ id: "a", parent_id: "p", title: "Hoje sub", scheduled_date: TODAY }),
      sub({ id: "b", parent_id: "p", title: "Atrasada sub", due_date: "2026-10-30" }),
      sub({ id: "c", parent_id: "p", title: "Feita sub", is_done: true, completed_at: "2026-11-02T15:00:00Z", due_date: "2026-10-30" }),
      sub({ id: "d", parent_id: "q", title: "Sub de tarefa futura", scheduled_date: "2026-11-03" }),
      sub({ id: "e", parent_id: "p", title: "Sem data sub" }),
    ],
  });
  it("cada subtarefa na sua seção, logo abaixo da tarefa principal quando estão juntas", () => {
    expect(titles(b.hoje)).toEqual(["Lançamento", "Hoje sub"]);
    expect(b.atrasadas.map((i) => [i.title, i.status])).toEqual([["Atrasada sub", "prazo_vencido"]]);
    expect(titles(b.proximas)).toEqual(["Sub de tarefa futura"]);
    expect(titles(b.concluidas)).toEqual(["Feita sub"]);
  });
  it("subtarefa concluída não aparece como atrasada; sem data não aparece", () => {
    expect(statusOf(b, "Feita sub")).toEqual(["concluida"]);
    expect(statusOf(b, "Sem data sub")).toEqual([]);
  });
  it("mantém o vínculo com a tarefa principal", () => {
    const i = b.atrasadas[0];
    expect(i.source === "subtask" && i.parent.title).toBe("Lançamento");
  });
  it("tarefa principal concluída: subtarefas pendentes saem do Meu Dia", () => {
    const b2 = board({ tasks: [task({ id: "p", title: "Feita", status: "concluida", completed_at: "2026-10-01T12:00:00Z", due_date: "2026-10-01" })], subtasks: [sub({ parent_id: "p", title: "Órfã", due_date: "2026-10-02" })] });
    expect(statusOf(b2, "Órfã")).toEqual([]);
  });
});

describe("sem duplicações", () => {
  it("tarefa concluída não fica em Atrasadas", () => {
    const b = board({ tasks: [task({ title: "X", due_date: "2026-10-01", deadline_date: "2026-10-02", status: "concluida", completed_at: "2026-11-02T12:00:00Z" })] });
    expect(b.atrasadas).toHaveLength(0);
    expect(b.concluidas).toHaveLength(1);
  });
  it("recorrente: hoje + dias pendentes = um item só (com aviso dos outros dias)", () => {
    const daily = task({ id: "r", title: "Diária", recurrence: "weekly", weekdays: [0, 1, 2, 3, 4, 5, 6], recurrence_start: "2026-10-20" });
    const b = board({ tasks: [daily] });
    expect(statusOf(b, "Diária")).toEqual(["hoje"]);
    const item = b.hoje[0];
    expect(item.note).toMatch(/Também ficou pendente em 01\/11, 31\/10, 30\/10…/);
  });
  it("recorrente sem ocorrência hoje: dia pendente mais recente em Atrasadas, uma vez", () => {
    const weekly = task({ id: "r", title: "Semanal", recurrence: "weekly", weekdays: [5], recurrence_start: "2026-10-01" }); // sexta
    const b = board({ tasks: [weekly] });
    expect(statusOf(b, "Semanal")).toEqual(["execucao_atrasada"]);
    expect(b.atrasadas[0].executionDate).toBe("2026-10-30");
  });
  it("recorrente feita hoje vai para Concluídas", () => {
    const daily = task({ id: "r", title: "Diária", recurrence: "weekly", weekdays: [1], recurrence_start: "2026-11-02" });
    const occ: TaskOccurrence = { id: "o", task_id: "r", user_id: "u", occurrence_date: TODAY, status: "concluida", title: null, scheduled_time: null, location: null, priority: null, completed_at: "2026-11-02T12:00:00Z", created_at: "", updated_at: "" } as unknown as TaskOccurrence;
    expect(statusOf(board({ tasks: [daily], occurrences: [occ] }), "Diária")).toEqual(["concluida"]);
  });
  it("tarefa vinculada à Rotina de hoje sai das seções (aparece só na Rotina)", () => {
    const t = task({ id: "lk", title: "Vinculada", due_date: TODAY });
    const a = { id: "a", space_id: "s", user_id: "u", title: "Vinculada", category: null, weekdays: [1], start_time: "18:00", end_time: null, is_active: true, sort_order: 0, notes: null, created_at: "", updated_at: "", task_id: "lk" } as Activity;
    const b = board({ tasks: [t], activities: [a], subtasks: [sub({ parent_id: "lk", title: "Sub vinculada", scheduled_date: TODAY })] });
    expect(statusOf(b, "Vinculada")).toEqual([]);
    expect(statusOf(b, "Sub vinculada")).toEqual([]);
    expect(b.linkedTaskIds).toEqual(["lk"]);
  });
});

describe("reprogramação", () => {
  it("reprogramar a execução não muda o prazo: prazo vencido continua vencido", () => {
    const before = task({ title: "Y", due_date: "2026-10-28", deadline_date: "2026-10-30" });
    const after = { ...before, due_date: "2026-11-04" };
    expect(statusOf(board({ tasks: [before] }), "Y")).toEqual(["prazo_vencido"]);
    expect(statusOf(board({ tasks: [after] }), "Y")).toEqual(["prazo_vencido"]);
  });
  it("execução atrasada reprogramada para amanhã vira Próxima", () => {
    const after = task({ title: "Z", due_date: "2026-11-03", deadline_date: "2026-11-05" });
    expect(statusOf(board({ tasks: [after] }), "Z")).toEqual(["proxima"]);
  });
});

describe("CLT / MKT e outros", () => {
  it("tarefas do CLT/MKT entram com a etiqueta da área", () => {
    const b = board({
      cltTasks: [
        { task: clt({ id: "c1", title: "Relatório CLT", due_date: TODAY }), module: "clt", companyName: "SGIV" },
        { task: clt({ id: "c2", title: "Prazo MKT", kind: "prazo", due_date: "2026-10-30" }), module: "mkt", companyName: null },
        { task: clt({ id: "c3", title: "Repetição CLT", recurrence: "weekly", weekdays: [1] }), module: "clt", companyName: "SGIV" },
      ],
    });
    expect(b.hoje.map((i) => [i.title, i.areaLabel])).toEqual([["Relatório CLT", "CLT · SGIV"], ["Repetição CLT", "CLT · SGIV"]]);
    expect(b.atrasadas.map((i) => [i.title, i.status, i.areaLabel])).toEqual([["Prazo MKT", "prazo_vencido", "MKT"]]);
  });
});
