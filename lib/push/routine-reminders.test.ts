import { describe, expect, it } from "vitest";
import { planReminders, selectScheduledReminders, type ReminderActivityRow, type ScheduleReminderInput } from "./schedule-reminders";
import { DEFAULT_NOTIFICATION_PREFS, type NotificationPrefs } from "@/lib/notification-prefs";

/**
 * Lembretes da Minha Rotina — casos reais. São Paulo = UTC−3.
 * Semana de 2026-11-02 (segunda) a 2026-11-08 (domingo).
 */
const DAYS = { seg: "2026-11-02", ter: "2026-11-03", qua: "2026-11-04", qui: "2026-11-05", sex: "2026-11-06", sab: "2026-11-07", dom: "2026-11-08" };
const at = (local: string) => new Date(`${local}:20-03:00`);
const prefsOf = (p: Partial<NotificationPrefs> = {}) => () => ({ ...DEFAULT_NOTIFICATION_PREFS, ...p });

const activity = (over: Partial<ReminderActivityRow> = {}): ReminderActivityRow => ({
  id: "alura", space_id: "s", user_id: "u1", title: "Estudos de programação — Alura", category: null, weekdays: [1, 2, 3, 4, 5],
  start_time: "06:00:00", end_time: null, is_active: true, sort_order: 0, notes: null, created_at: "2026-10-01T10:00:00Z",
  updated_at: "2026-10-01T10:00:00Z", task_id: null, specific_date: null, skipped_dates: [], reminder_offsets: [0], linkedTask: null, ...over,
});
const barbearia = (over: Partial<ReminderActivityRow> = {}) =>
  activity({ id: "barbearia", title: "SaaS Barbearia", weekdays: [1, 3, 5], start_time: "18:30:00", reminder_offsets: [0, 15], ...over });

const run = (now: string, input: Partial<ScheduleReminderInput>) => selectScheduledReminders({ now: at(now), prefs: prefsOf(), ...input });

/** Simula o cron rodando a cada minuto num intervalo e devolve o que sairia (com deduplicação persistente). */
function simulate(fromLocal: string, toLocal: string, input: Partial<ScheduleReminderInput>) {
  const delivered = new Map<string, { at: string; body: string; title: string }>();
  for (let t = at(fromLocal).getTime(); t <= at(toLocal).getTime(); t += 60_000) {
    for (const r of selectScheduledReminders({ now: new Date(t), prefs: prefsOf(), ...input })) {
      const key = `${r.userId}|${r.eventKey}`;
      if (delivered.has(key)) continue; // push_delivery_log (unique user_id + event_key)
      const local = new Date(t - 3 * 3600_000).toISOString().slice(0, 16);
      delivered.set(key, { at: local, body: r.body, title: r.title });
    }
  }
  return [...delivered.values()];
}

describe("exemplo real: Estudos de programação — Alura (seg–sex 06:00, no horário)", () => {
  it("às 06:00 de segunda a sexta, uma notificação por dia; sábado e domingo nada", () => {
    const sent = simulate(`${DAYS.seg}T00:00`, `${DAYS.dom}T23:59`, { activities: [activity()] });
    expect(sent.map((s) => s.at)).toEqual([
      `${DAYS.seg}T06:00`, `${DAYS.ter}T06:00`, `${DAYS.qua}T06:00`, `${DAYS.qui}T06:00`, `${DAYS.sex}T06:00`,
    ]);
    expect(sent[0]).toEqual({ at: `${DAYS.seg}T06:00`, title: "VS Planner • Minha Rotina", body: "Hora de começar Estudos de programação — Alura." });
  });
  it("fuso: 06:00 em São Paulo = 09:00 UTC (não 06:00 UTC)", () => {
    expect(selectScheduledReminders({ now: new Date(`${DAYS.seg}T06:00:30Z`), activities: [activity()], prefs: prefsOf() })).toHaveLength(0);
    expect(selectScheduledReminders({ now: new Date(`${DAYS.seg}T09:00:30Z`), activities: [activity()], prefs: prefsOf() })).toHaveLength(1);
  });
});

describe("exemplo real: SaaS Barbearia (seg/qua/sex 18:30, no horário + 15 min antes)", () => {
  it("duas notificações independentes por dia: 18:15 e 18:30", () => {
    const sent = simulate(`${DAYS.seg}T00:00`, `${DAYS.dom}T23:59`, { activities: [barbearia()] });
    expect(sent).toEqual([
      { at: `${DAYS.seg}T18:15`, title: "VS Planner • Minha Rotina", body: "SaaS Barbearia começa em 15 minutos (às 18:30)." },
      { at: `${DAYS.seg}T18:30`, title: "VS Planner • Minha Rotina", body: "Hora de começar SaaS Barbearia." },
      { at: `${DAYS.qua}T18:15`, title: "VS Planner • Minha Rotina", body: "SaaS Barbearia começa em 15 minutos (às 18:30)." },
      { at: `${DAYS.qua}T18:30`, title: "VS Planner • Minha Rotina", body: "Hora de começar SaaS Barbearia." },
      { at: `${DAYS.sex}T18:15`, title: "VS Planner • Minha Rotina", body: "SaaS Barbearia começa em 15 minutos (às 18:30)." },
      { at: `${DAYS.sex}T18:30`, title: "VS Planner • Minha Rotina", body: "Hora de começar SaaS Barbearia." },
    ]);
  });
  it("chaves diferentes por antecedência (uma não bloqueia a outra) e iguais em execuções repetidas", () => {
    const keys = planReminders({ activities: [barbearia()], prefs: prefsOf() }, DAYS.seg).map((p) => p.eventKey);
    expect(keys).toEqual([
      `exec:routine:barbearia:${DAYS.seg}:18:30:0`,
      `exec:routine:barbearia:${DAYS.seg}:18:30:15`,
    ]);
    expect(run(`${DAYS.seg}T18:30`, { activities: [barbearia()] })[0].eventKey).toBe(run(`${DAYS.seg}T18:31`, { activities: [barbearia()] })[0].eventKey);
  });
});

describe("antecedências", () => {
  const all = barbearia({ weekdays: [3], reminder_offsets: [0, 15, 30, 60, 1440] });
  it("no horário, 15 min, 30 min, 1 hora e 1 dia antes", () => {
    const sent = simulate(`${DAYS.ter}T00:00`, `${DAYS.qua}T23:59`, { activities: [all] });
    expect(sent.map((s) => [s.at, s.body])).toEqual([
      [`${DAYS.ter}T18:30`, "Amanhã às 18:30: SaaS Barbearia."],
      [`${DAYS.qua}T17:30`, "SaaS Barbearia começa em 1 hora (às 18:30)."],
      [`${DAYS.qua}T18:00`, "SaaS Barbearia começa em 30 minutos (às 18:30)."],
      [`${DAYS.qua}T18:15`, "SaaS Barbearia começa em 15 minutos (às 18:30)."],
      [`${DAYS.qua}T18:30`, "Hora de começar SaaS Barbearia."],
    ]);
  });
  it("1 dia antes atravessa a semana (domingo avisa a segunda)", () => {
    const sent = simulate(`${DAYS.dom}T00:00`, `${DAYS.dom}T23:59`, { activities: [activity({ reminder_offsets: [1440] })] });
    expect(sent).toEqual([{ at: `${DAYS.dom}T06:00`, title: "VS Planner • Minha Rotina", body: "Amanhã às 06:00: Estudos de programação — Alura." }]);
  });
  it("sem nenhuma antecedência marcada, a atividade não notifica", () => {
    expect(simulate(`${DAYS.seg}T00:00`, `${DAYS.seg}T23:59`, { activities: [activity({ reminder_offsets: [] })] })).toEqual([]);
  });
  it("cron atrasado: recupera o 'no horário' até 15 min; o antecipado não sai depois do início", () => {
    // Cron parado de 18:10 a 18:34 — volta às 18:35.
    const r = run(`${DAYS.seg}T18:35`, { activities: [barbearia()] });
    expect(r.map((x) => x.body)).toEqual(["Hora de começar SaaS Barbearia."]);
    // Cron volta às 18:20: o de 15 min ainda faz sentido.
    expect(run(`${DAYS.seg}T18:20`, { activities: [barbearia()] }).map((x) => x.body)).toEqual(["SaaS Barbearia começa em 15 minutos (às 18:30)."]);
  });
});

describe("data única, exclusão de um dia, conclusão e desativação", () => {
  it("data única: só naquele dia", () => {
    const once = activity({ weekdays: [], specific_date: DAYS.qui, start_time: "14:00:00" });
    const sent = simulate(`${DAYS.seg}T00:00`, `${DAYS.dom}T23:59`, { activities: [once] });
    expect(sent.map((s) => s.at)).toEqual([`${DAYS.qui}T14:00`]);
  });
  it("'Excluir somente neste dia': aquele dia não notifica; os outros sim", () => {
    const sent = simulate(`${DAYS.seg}T00:00`, `${DAYS.sex}T23:59`, { activities: [activity({ skipped_dates: [DAYS.qua] })] });
    expect(sent.map((s) => s.at.slice(0, 10))).toEqual([DAYS.seg, DAYS.ter, DAYS.qui, DAYS.sex]);
  });
  it("'1 dia antes' também respeita o dia excluído", () => {
    expect(run(`${DAYS.ter}T06:00`, { activities: [activity({ reminder_offsets: [1440], skipped_dates: [DAYS.qua] })] })).toHaveLength(0);
  });
  it("ocorrência concluída: nenhum aviso restante daquele dia; os outros dias continuam", () => {
    const completions = [{ activity_id: "barbearia", occurrence_date: DAYS.seg }];
    const sent = simulate(`${DAYS.seg}T18:16`, `${DAYS.qua}T23:59`, { activities: [barbearia()], completions });
    expect(sent.map((s) => s.at)).toEqual([`${DAYS.qua}T18:15`, `${DAYS.qua}T18:30`]);
  });
  it("desativada ou excluída: nada", () => {
    expect(simulate(`${DAYS.seg}T00:00`, `${DAYS.seg}T23:59`, { activities: [activity({ is_active: false })] })).toEqual([]);
    expect(simulate(`${DAYS.seg}T00:00`, `${DAYS.seg}T23:59`, { activities: [] })).toEqual([]);
  });
  it("preferência 'Rotina' desligada: nada", () => {
    expect(selectScheduledReminders({ now: at(`${DAYS.seg}T06:00`), activities: [activity()], prefs: prefsOf({ routine: false }) })).toHaveLength(0);
  });
  it("tarefa recorrente vinculada concluída no dia: a rotina não avisa naquele dia", () => {
    const linked = activity({ task_id: "t1", linkedTask: { title: "VS Planner", closed: false } });
    const occurrences = [{ task_id: "t1", occurrence_date: DAYS.seg, status: "concluida" }];
    expect(run(`${DAYS.seg}T06:00`, { activities: [linked], occurrences })).toHaveLength(0);
    expect(run(`${DAYS.ter}T06:00`, { activities: [linked], occurrences })).toHaveLength(1);
  });
});

describe("edição do horário", () => {
  it("mudar de 18:30 para 19:00 gera os avisos novos; os antigos não saem", () => {
    const edited = barbearia({ start_time: "19:00:00", updated_at: `${DAYS.seg}T15:00:00Z` }); // editado 12:00 SP
    const sent = simulate(`${DAYS.seg}T12:01`, `${DAYS.seg}T23:59`, { activities: [edited] });
    expect(sent.map((s) => s.at)).toEqual([`${DAYS.seg}T18:45`, `${DAYS.seg}T19:00`]);
  });
  it("editado depois do horário do aviso: não manda aviso atrasado logo após salvar", () => {
    // Às 18:40 a pessoa cria a atividade das 18:30 (no horário) — nada sai hoje.
    const late = barbearia({ reminder_offsets: [0], updated_at: `${DAYS.seg}T21:40:00Z`, created_at: `${DAYS.seg}T21:40:00Z` });
    expect(run(`${DAYS.seg}T18:41`, { activities: [late] })).toHaveLength(0);
    // Nos próximos dias, normal.
    expect(run(`${DAYS.qua}T18:30`, { activities: [late] })).toHaveLength(1);
  });
});

describe("deduplicação", () => {
  it("atividade vinculada à tarefa no mesmo horário da tarefa = um aviso só", () => {
    const linked = barbearia({ weekdays: [1], reminder_offsets: [0], task_id: "t1", linkedTask: { title: "SaaS Barbearia", closed: false } });
    const task = { id: "t1", user_id: "u1", title: "SaaS Barbearia", kind: "dia" as const, due_date: DAYS.seg, scheduled_time: "18:30:00", status: "pendente" as const, archived_at: null, recurrence: "none" as const, weekdays: [], recurrence_start: null, recurrence_until: null };
    expect(run(`${DAYS.seg}T18:30`, { activities: [linked], tasks: [task] })).toHaveLength(1);
  });
  it("cada usuário recebe só os seus", () => {
    const r = run(`${DAYS.seg}T06:00`, { activities: [activity(), activity({ id: "b", user_id: "u2" })] });
    expect(r.map((x) => x.userId).sort()).toEqual(["u1", "u2"]);
  });
});
