import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import {
  groupSubtasks,
  isMissingColumnError,
  normalizeReminderOffsets,
  scheduleState,
  stripScheduleColumns,
  subtaskSchedule,
  taskSchedule,
  TASK_SCHEDULE_COLUMNS,
  type Subtask,
} from "./task-schedule";
import { buildMyDayTasks, groupDeadlineTasks } from "./tasks";
import type { Task } from "@/types/database.types";

// Semana de referência: seg 2026-11-02 … dom 2026-11-08.
const MON = "2026-11-02", TUE = "2026-11-03", WED = "2026-11-04", THU = "2026-11-05", FRI = "2026-11-06";

function task(over: Partial<Task> = {}): Task {
  return {
    id: over.id ?? "t1", space_id: "s", user_id: "u", title: "VS Planner", description: null, kind: "dia", due_date: null,
    scheduled_time: null, location: null, priority: "normal", status: "pendente", category: null, notes: null,
    recurrence: "none", weekdays: [], recurrence_start: null, recurrence_until: null, archived_at: null, completed_at: null,
    created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", ...over,
  };
}

function sub(over: Partial<Subtask> = {}): Subtask {
  return { id: over.id ?? "s1", parent_type: "pessoal", parent_id: "t1", user_id: "u", title: "Atualizar banco de dados", due_date: null, is_done: false, position: 0, parent_subtask_id: null, ...over };
}

describe("execução x prazo final — tarefas", () => {
  it("tarefa com execução e prazo diferentes mantém as duas datas", () => {
    expect(taskSchedule(task({ due_date: TUE, scheduled_time: "18:00:00", deadline_date: THU, deadline_time: "17:00:00" }))).toEqual({
      executionDate: TUE, executionTime: "18:00", deadlineDate: THU, deadlineTime: "17:00",
    });
  });
  it("registro antigo 'com prazo': due_date é o prazo e o horário antigo é o horário limite", () => {
    expect(taskSchedule(task({ kind: "prazo", due_date: FRI, scheduled_time: "09:00:00" }))).toEqual({
      executionDate: null, executionTime: null, deadlineDate: FRI, deadlineTime: "09:00",
    });
  });
  it("registro antigo 'do dia' (sem colunas novas) continua igual: só execução", () => {
    const t = task({ due_date: MON });
    delete t.deadline_date;
    expect(taskSchedule(t)).toMatchObject({ executionDate: MON, deadlineDate: null });
  });
  it("nenhuma data é permitido", () => {
    expect(taskSchedule(task({ kind: "prazo", due_date: null }))).toEqual({ executionDate: null, executionTime: null, deadlineDate: null, deadlineTime: null });
  });
});

describe("exemplo do pedido: Atualizar banco de dados — fazer terça 18h, prazo quinta", () => {
  const s = sub({ scheduled_date: TUE, scheduled_time: "18:00", due_date: THU });
  const at = (todayKey: string, done = false) => scheduleState(subtaskSchedule(s), done, { todayKey, nowTime: "12:00" });

  it("aparece na terça (programada) e não está atrasada", () => {
    expect(at(TUE)).toMatchObject({ scheduledOn: true, executionOverdue: false, deadlineOverdue: false });
  });
  it("quarta sem concluir: execução programada ficou pendente, prazo ainda não venceu", () => {
    expect(at(WED)).toMatchObject({ scheduledOn: false, executionOverdue: true, deadlineOverdue: false, deadlineTomorrow: true });
  });
  it("quinta: último dia do prazo", () => {
    expect(at(THU)).toMatchObject({ deadlineToday: true, deadlineOverdue: false });
  });
  it("sexta sem concluir: atrasada em relação ao prazo final", () => {
    expect(at(FRI)).toMatchObject({ executionOverdue: true, deadlineOverdue: true });
  });
  it("concluída na terça deixa de estar pendente/atrasada", () => {
    expect(at(FRI, true)).toMatchObject({ executionOverdue: false, deadlineOverdue: false });
  });
  it("horário limite no dia do prazo: vence depois da hora", () => {
    const withTime = subtaskSchedule(sub({ due_date: THU, deadline_time: "10:00" }));
    expect(scheduleState(withTime, false, { todayKey: THU, nowTime: "09:59" }).deadlineOverdue).toBe(false);
    expect(scheduleState(withTime, false, { todayKey: THU, nowTime: "10:01" }).deadlineOverdue).toBe(true);
  });
  it("reagendar a execução não muda o prazo", () => {
    const moved = subtaskSchedule({ ...s, scheduled_date: WED });
    expect(moved.deadlineDate).toBe(THU);
  });
});

describe("seções de subtarefas (Para fazer hoje → Atrasadas → Todas)", () => {
  const items = [
    sub({ id: "a", title: "Atualizar banco de dados", scheduled_date: MON, due_date: THU, position: 0 }),
    sub({ id: "b", title: "Testar notificações", scheduled_date: MON, due_date: MON, scheduled_time: "09:00", position: 1 }),
    sub({ id: "c", title: "Corrigir menu mobile", due_date: "2026-10-31", position: 2 }),
    sub({ id: "d", title: "Revisar relatórios", scheduled_date: "2026-11-01", position: 3 }),
    sub({ id: "e", title: "Outro dia", scheduled_date: FRI, position: 4 }),
    sub({ id: "f", title: "Feita", is_done: true, due_date: "2026-10-20", position: 5 }),
    sub({ id: "g", title: "Item de checklist", parent_subtask_id: "a", scheduled_date: MON, position: 6 }),
  ];
  const g = groupSubtasks(items, { todayKey: MON, nowTime: "08:00" });

  it("hoje: só as programadas para o dia, com horário primeiro", () => {
    expect(g.today.map((e) => e.subtask.id)).toEqual(["b", "a", "g"]);
    expect(g.today.find((e) => e.subtask.id === "g")?.parentTitle).toBe("Atualizar banco de dados");
  });
  it("atrasadas: diferencia prazo vencido de execução vencida e não inclui concluídas", () => {
    expect(g.overdue.map((e) => e.subtask.id)).toEqual(["c", "d"]);
    expect(g.overdue[0].state).toMatchObject({ deadlineOverdue: true });
    expect(g.overdue[1].state).toMatchObject({ executionOverdue: true, deadlineOverdue: false });
  });
  it("nenhuma subtarefa aparece em duas seções de destaque", () => {
    const ids = [...g.today, ...g.overdue].map((e) => e.subtask.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("todas: lista completa (pendentes, outros dias, atrasadas e concluídas)", () => {
    expect(g.all).toHaveLength(items.length);
    expect(g.done).toBe(1);
    expect(g.progress).toBe(Math.round((1 / 7) * 100));
  });
  it("Rotina olhando outro dia: 'para fazer' segue o dia escolhido, atraso segue o hoje real", () => {
    const fri = groupSubtasks(items, { todayKey: MON, dateKey: FRI });
    expect(fri.today.map((e) => e.subtask.id)).toEqual(["e"]);
    expect(fri.overdue.map((e) => e.subtask.id)).toEqual(["c", "d"]);
  });
  it("concluir atualiza o progresso imediatamente", () => {
    const after = groupSubtasks(items.map((s) => (s.id === "b" ? { ...s, is_done: true } : s)), { todayKey: MON });
    expect(after.done).toBe(2);
    expect(after.today.map((e) => e.subtask.id)).toEqual(["a", "g", "b"]); // pendentes antes das feitas
  });
});

describe("Meu Dia / Com prazo com prazo final independente", () => {
  const both = task({ id: "both", due_date: MON, deadline_date: THU });
  const lateDeadline = task({ id: "late", due_date: "2026-10-30", deadline_date: "2026-11-01" });
  const legacy = task({ id: "legacy", kind: "prazo", due_date: "2026-10-31" });

  it("tarefa do dia com prazo entra em 'Com prazo' pelo prazo, não pela execução", () => {
    const groups = groupDeadlineTasks([both, legacy], MON);
    expect(groups.upcoming.map((t) => t.id)).toEqual(["both"]);
    expect(groups.overdue.map((t) => t.id)).toEqual(["legacy"]);
  });
  it("Meu Dia não duplica: tarefa em 'ficou pendente' sai da seção de prazos e leva o selo de prazo vencido", () => {
    const myDay = buildMyDayTasks([both, lateDeadline, legacy], [], MON);
    expect(myDay.today.map((e) => e.task.id)).toEqual(["both"]);
    expect(myDay.missed.map((e) => e.task.id)).toEqual(["late"]);
    expect(myDay.missed[0]).toMatchObject({ overdue: true, deadlineOverdue: true, deadlineDate: "2026-11-01" });
    expect(myDay.deadlines.overdue.map((t) => t.id)).toEqual(["legacy"]);
  });
  it("recorrente semanal continua por ocorrência e não ganha prazo", () => {
    const weekly = task({ id: "w", recurrence: "weekly", weekdays: [1], recurrence_start: "2026-10-01", deadline_date: THU });
    const myDay = buildMyDayTasks([weekly], [], MON);
    expect(myDay.today).toHaveLength(1);
    expect(taskSchedule(weekly).executionDate).toBeNull();
  });
});

describe("compatibilidade antes da migration", () => {
  it("reconhece coluna ausente", () => {
    expect(isMissingColumnError({ code: "PGRST204", message: "Could not find the 'deadline_date' column of 'tasks' in the schema cache" })).toBe(true);
    expect(isMissingColumnError({ code: "42703", message: "column tasks.deadline_date does not exist" })).toBe(true);
    expect(isMissingColumnError({ code: "23505", message: "duplicate" })).toBe(false);
  });
  it("remove só colunas novas e avisa apenas se havia valor", () => {
    expect(stripScheduleColumns({ title: "x", deadline_date: null, reminder_offsets: [] }, TASK_SCHEDULE_COLUMNS)).toEqual({ values: { title: "x" }, lost: false });
    expect(stripScheduleColumns({ title: "x", deadline_date: THU }, TASK_SCHEDULE_COLUMNS).lost).toBe(true);
  });
  it("lembretes: só valores permitidos, sem repetição, ordenados", () => {
    expect(normalizeReminderOffsets([60, 15, 15, 7, "30", 1440])).toEqual([15, 30, 60, 1440]);
    expect(normalizeReminderOffsets(null)).toEqual([]);
  });
});

describe("migration 20261102100000 (Postgres embutido)", () => {
  const sql = readFileSync(join(__dirname, "../supabase/migrations/20261102100000_task_schedule_routine_links.sql"), "utf8");

  async function setup() {
    const db = new PGlite();
    await db.exec(`
      create schema if not exists auth;
      create table auth.users (id uuid primary key);
      create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
      create role authenticated;
      create table public.tasks (id uuid primary key default gen_random_uuid(), user_id uuid not null, title text not null, kind text not null default 'prazo', due_date date, status text not null default 'pendente');
      create table public.task_subtasks (id uuid primary key default gen_random_uuid(), user_id uuid not null, title text not null, due_date date, is_done boolean not null default false);
      create table public.activities (id uuid primary key default gen_random_uuid(), user_id uuid not null, title text not null, weekdays smallint[] not null default '{}', start_time time not null);
      alter table public.activities enable row level security;
      create policy activities_all on public.activities for all using (user_id = auth.uid()) with check (user_id = auth.uid());
      grant all on all tables in schema public to authenticated;
      grant usage on schema auth to authenticated;
      insert into public.tasks (id, user_id, title, kind, due_date) values
        ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'Antiga com prazo', 'prazo', '2026-10-31'),
        ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'Tarefa do B', 'dia', '2026-11-02');
      insert into public.task_subtasks (user_id, title, due_date, is_done) values ('00000000-0000-0000-0000-00000000000a', 'Antiga', '2026-10-30', true);
      -- Linha antiga fora da nova regra (sem dias): a constraint not valid não a rejeita.
      insert into public.activities (user_id, title, weekdays, start_time) values ('00000000-0000-0000-0000-00000000000a', 'Legada sem dias', '{}', '07:00');
    `);
    return db;
  }

  it("é aditiva, idempotente e preserva os registros antigos", async () => {
    const db = await setup();
    await db.exec(sql);
    await db.exec(sql);
    const tasks = (await db.query<{ title: string; kind: string; due_date: string; deadline_date: string | null; reminder_offsets: number[] }>("select title, kind, due_date::text, deadline_date, reminder_offsets from tasks order by title")).rows;
    expect(tasks[0]).toEqual({ title: "Antiga com prazo", kind: "prazo", due_date: "2026-10-31", deadline_date: null, reminder_offsets: [] });
    const subs = (await db.query<{ title: string; is_done: boolean; priority: string; scheduled_date: string | null }>("select title, is_done, priority, scheduled_date from task_subtasks")).rows;
    expect(subs).toEqual([{ title: "Antiga", is_done: true, priority: "normal", scheduled_date: null }]);
    expect((await db.query("select * from activities")).rows).toHaveLength(1);
    await db.close();
  });

  it("valida prioridade, lembretes e agenda da rotina em linhas novas", async () => {
    const db = await setup();
    await db.exec(sql);
    await expect(db.query("insert into task_subtasks (user_id, title, priority) values ('00000000-0000-0000-0000-00000000000a', 'x', 'urgente')")).rejects.toThrow();
    await expect(db.query("insert into tasks (user_id, title, reminder_offsets) values ('00000000-0000-0000-0000-00000000000a', 'x', '{45}')")).rejects.toThrow();
    await db.query("insert into tasks (user_id, title, reminder_offsets) values ('00000000-0000-0000-0000-00000000000a', 'ok', '{0,15,1440}')");
    await expect(db.query("insert into activities (user_id, title, start_time) values ('00000000-0000-0000-0000-00000000000a', 'sem agenda', '18:00')")).rejects.toThrow();
    await db.query("insert into activities (user_id, title, start_time, specific_date) values ('00000000-0000-0000-0000-00000000000a', 'única', '18:00', '2026-11-02')");
    await db.close();
  });

  it("RLS: usuário não vincula tarefa de outra pessoa à própria rotina; excluir a tarefa remove só o vínculo da rotina", async () => {
    const db = await setup();
    await db.exec(sql);
    await db.exec("set role authenticated; select set_config('app.uid', '00000000-0000-0000-0000-00000000000a', false);");
    await db.query("insert into activities (user_id, title, start_time, weekdays, task_id) values ('00000000-0000-0000-0000-00000000000a', 'VS Planner', '18:00', '{1}', '00000000-0000-0000-0000-0000000000a1')");
    await expect(
      db.query("insert into activities (user_id, title, start_time, weekdays, task_id) values ('00000000-0000-0000-0000-00000000000a', 'Roubada', '18:00', '{1}', '00000000-0000-0000-0000-0000000000b1')")
    ).rejects.toThrow();
    await db.exec("reset role;");
    await db.query("delete from tasks where id = '00000000-0000-0000-0000-0000000000a1'");
    const left = (await db.query<{ title: string }>("select title from activities order by title")).rows.map((r) => r.title);
    expect(left).toEqual(["Legada sem dias"]);
    await db.close();
  });
});
