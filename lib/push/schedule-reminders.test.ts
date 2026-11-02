import { describe, expect, it } from "vitest";
import { planReminders, selectScheduledReminders, shiftLocal, type ReminderActivityRow, type ReminderSubtaskRow, type ReminderTaskRow, type ScheduleReminderInput } from "./schedule-reminders";
import { DEFAULT_NOTIFICATION_PREFS, resolveNotificationPrefs, validateNotificationPrefs, type NotificationPrefs } from "@/lib/notification-prefs";

// São Paulo = UTC-3. Terça 2026-11-03.
const at = (local: string) => new Date(`${local}:30-03:00`);
const TUE = "2026-11-03", WED = "2026-11-04", THU = "2026-11-05";

const task = (over: Partial<ReminderTaskRow> = {}): ReminderTaskRow => ({
  id: "t1", user_id: "u1", title: "VS Planner", kind: "dia", due_date: TUE, scheduled_time: "18:00:00", status: "pendente",
  archived_at: null, recurrence: "none", weekdays: [], recurrence_start: null, recurrence_until: null, ...over,
});
const sub = (over: Partial<ReminderSubtaskRow> = {}): ReminderSubtaskRow => ({
  id: "s1", parent_type: "pessoal", parent_id: "t1", user_id: "u1", title: "Atualizar banco de dados", due_date: THU, is_done: false,
  position: 0, parent_subtask_id: null, scheduled_date: TUE, scheduled_time: "18:00", parentTitle: "VS Planner", parentClosed: false, ...over,
});
const prefsOf = (p: Partial<NotificationPrefs> = {}) => () => ({ ...DEFAULT_NOTIFICATION_PREFS, ...p });
const run = (now: string, input: Partial<ScheduleReminderInput>) => selectScheduledReminders({ now: at(now), prefs: prefsOf(), ...input });

describe("execução programada", () => {
  it("subtarefa no horário: mensagem com tarefa — subtarefa e horário", () => {
    const r = run(`${TUE}T18:00`, { subtasks: [sub()] });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ type: "execution", body: "VS Planner — Atualizar banco de dados está programado para hoje às 18:00.", url: "/hoje" });
  });
  it("antecedência: 15 min, 30 min, 1 hora e 1 dia antes", () => {
    const s = sub({ reminder_offsets: [15, 30, 60, 1440] });
    expect(run(`${TUE}T17:45`, { subtasks: [s] })[0].body).toBe("Em 15 min: VS Planner — Atualizar banco de dados às 18:00.");
    expect(run(`${TUE}T17:30`, { subtasks: [s] })[0].body).toContain("Em 30 min");
    expect(run(`${TUE}T17:00`, { subtasks: [s] })[0].body).toContain("Em 1 hora");
    expect(run(`2026-11-02T18:00`, { subtasks: [s] })[0].body).toBe("Amanhã às 18:00: VS Planner — Atualizar banco de dados.");
    // Só os escolhidos: sem "no horário" quando não marcado.
    expect(run(`${TUE}T18:00`, { subtasks: [s] }).some((r) => r.body.includes("programado para hoje"))).toBe(false);
  });
  it("tarefa com horário e sem lembrete escolhido usa a antecedência padrão (no horário) com a chave antiga", () => {
    const r = run(`${TUE}T18:05`, { tasks: [task()] });
    expect(r[0].eventKey).toBe("task-reminder:tasks:t1:2026-11-03:18:00");
  });
  it("sem horário: aviso do dia às 08:00 só se a pessoa escolheu lembrete", () => {
    expect(run(`${TUE}T08:00`, { tasks: [task({ scheduled_time: null })] })).toHaveLength(0);
    expect(run(`${TUE}T08:00`, { tasks: [task({ scheduled_time: null, reminder_offsets: [0] })] })[0].body).toBe("VS Planner está programado para hoje.");
  });
  it("fora da janela (cedo demais ou antigo demais) não sai", () => {
    expect(run(`${TUE}T17:59`, { subtasks: [sub()] })).toHaveLength(0);
    expect(run(`${TUE}T18:16`, { subtasks: [sub()] })).toHaveLength(0);
  });
  it("janela que atravessa a meia-noite ainda entrega o aviso das 23:55", () => {
    expect(run(`${WED}T00:05`, { subtasks: [sub({ scheduled_time: "23:55" })] })).toHaveLength(1);
  });
});

describe("prazo e atraso", () => {
  const onlyDeadline = sub({ scheduled_date: null, scheduled_time: null });
  it("véspera: 'termina amanhã' no horário do resumo", () => {
    expect(run(`${WED}T09:00`, { subtasks: [onlyDeadline] })[0]).toMatchObject({ type: "deadline_soon", body: "O prazo de VS Planner — Atualizar banco de dados termina amanhã." });
  });
  it("no dia: 'Último dia'", () => {
    expect(run(`${THU}T09:00`, { subtasks: [onlyDeadline] })[0].body).toBe("Último dia para concluir VS Planner — Atualizar banco de dados.");
  });
  it("horário limite antes do resumo: avisa 1h antes do limite", () => {
    const early = sub({ scheduled_date: null, deadline_time: "08:30" });
    expect(run(`${THU}T07:30`, { subtasks: [early] })[0].body).toContain("(até 08:30)");
  });
  it("atrasada: dia seguinte, +3 e +7 — nunca todo dia", () => {
    const days = ["2026-11-06", "2026-11-08", "2026-11-12"];
    for (const d of days) expect(run(`${d}T09:00`, { subtasks: [onlyDeadline] })[0]).toMatchObject({ type: "overdue", body: "VS Planner — Atualizar banco de dados está atrasada (prazo era 05/11)." });
    expect(run(`2026-11-07T09:00`, { subtasks: [onlyDeadline] })).toHaveLength(0);
  });
  it("tarefa principal com prazo legado ('com prazo') também recebe prazo/atraso", () => {
    const legacy = task({ kind: "prazo", due_date: THU, scheduled_time: null });
    expect(run(`${THU}T09:00`, { tasks: [legacy] })[0].type).toBe("deadline_today");
  });
});

describe("conclusão, reagendamento e duplicidade", () => {
  it("concluída: nenhum lembrete futuro nem alerta de atraso", () => {
    expect(planReminders({ subtasks: [sub({ is_done: true })], prefs: prefsOf() }, TUE)).toHaveLength(0);
    expect(planReminders({ tasks: [task({ status: "concluida", deadline_date: THU })], prefs: prefsOf() }, TUE)).toHaveLength(0);
    expect(planReminders({ subtasks: [sub({ parentClosed: true })], prefs: prefsOf() }, TUE)).toHaveLength(0);
  });
  it("reagendar muda a chave (o aviso antigo nunca mais bate) e não mexe no prazo", () => {
    const before = planReminders({ subtasks: [sub()], prefs: prefsOf() }, TUE).find((p) => p.type === "execution")!;
    const after = planReminders({ subtasks: [sub({ scheduled_date: WED, scheduled_time: "19:00" })], prefs: prefsOf() }, TUE).find((p) => p.type === "execution")!;
    expect(after.eventKey).not.toBe(before.eventKey);
    expect(after.fireAt).toBe(`${WED}T19:00`);
    const deadlines = (p: ReturnType<typeof planReminders>) => p.filter((x) => x.type !== "execution").map((x) => x.eventKey);
    expect(deadlines(planReminders({ subtasks: [sub({ scheduled_date: WED })], prefs: prefsOf() }, TUE))).toEqual(deadlines(planReminders({ subtasks: [sub()], prefs: prefsOf() }, TUE)));
  });
  it("tarefa na Rotina + execução no mesmo horário = um aviso só", () => {
    const linked: ReminderActivityRow = {
      id: "a1", space_id: "s", user_id: "u1", title: "VS Planner", category: null, weekdays: [2], start_time: "18:00:00", end_time: null,
      is_active: true, sort_order: 0, notes: null, created_at: "", updated_at: "", task_id: "t1", reminder_offsets: [0], linkedTask: { title: "VS Planner", closed: false },
    };
    const r = run(`${TUE}T18:00`, { tasks: [task()], activities: [linked] });
    expect(r).toHaveLength(1);
    expect(r[0].type).toBe("execution");
    // Sessão do dia já marcada na rotina → sem aviso da rotina.
    expect(run(`${TUE}T18:00`, { activities: [linked], completions: [{ activity_id: "a1", occurrence_date: TUE }] })).toHaveLength(0);
    // Tarefa vinculada concluída → rotina não avisa.
    expect(run(`${TUE}T18:00`, { activities: [{ ...linked, linkedTask: { title: "VS Planner", closed: true } }] })).toHaveLength(0);
  });
  it("recorrente semanal: ocorrência concluída não avisa; outro dia avisa", () => {
    const weekly = task({ recurrence: "weekly", due_date: null, weekdays: [2, 3], recurrence_start: "2026-10-01" });
    expect(run(`${TUE}T18:00`, { tasks: [weekly] })).toHaveLength(1);
    expect(run(`${TUE}T18:00`, { tasks: [weekly], occurrences: [{ task_id: "t1", occurrence_date: TUE, status: "concluida" }] })).toHaveLength(0);
  });
  it("cada aviso vai só para o dono", () => {
    const r = run(`${TUE}T18:00`, { subtasks: [sub(), sub({ id: "s2", user_id: "u2" })] });
    expect(r.map((x) => x.userId).sort()).toEqual(["u1", "u2"]);
  });
});

describe("preferências", () => {
  it("interruptor geral, categoria e tipos desligam o que devem", () => {
    const off = (p: Partial<NotificationPrefs>) => selectScheduledReminders({ now: at(`${TUE}T18:00`), subtasks: [sub()], prefs: prefsOf(p) });
    expect(off({ enabled: false })).toHaveLength(0);
    expect(off({ tasks: false })).toHaveLength(0);
    expect(off({ execution: false })).toHaveLength(0);
    const onlyDeadline = sub({ scheduled_date: null });
    expect(selectScheduledReminders({ now: at(`${THU}T09:00`), subtasks: [onlyDeadline], prefs: prefsOf({ deadline: false }) })).toHaveLength(0);
    expect(selectScheduledReminders({ now: at(`2026-11-06T09:00`), subtasks: [onlyDeadline], prefs: prefsOf({ overdue: false }) })).toHaveLength(0);
  });
  it("horário do resumo personalizado", () => {
    const onlyDeadline = sub({ scheduled_date: null });
    expect(selectScheduledReminders({ now: at(`${THU}T20:00`), subtasks: [onlyDeadline], prefs: prefsOf({ digestTime: "20:00" }) })).toHaveLength(1);
  });
  it("preferências antigas são preservadas e as novas vêm ligadas", () => {
    const p = resolveNotificationPrefs({ tasks: true, routine: false, meetings: true, finance: true, clt: false });
    expect(p).toMatchObject({ routine: false, clt: false, enabled: true, execution: true, deadline: true, overdue: true, digestTime: "09:00", defaultOffsets: [0] });
    expect(validateNotificationPrefs({ tasks: "sim" })).toHaveProperty("error");
    expect(validateNotificationPrefs({ digestTime: "25:00" })).toHaveProperty("error");
  });
  it("shiftLocal atravessa dias", () => {
    expect(shiftLocal(TUE, "00:10", -15)).toEqual({ date: "2026-11-02", time: "23:55" });
    expect(shiftLocal(TUE, "18:00", -1440)).toEqual({ date: "2026-11-02", time: "18:00" });
  });
});
