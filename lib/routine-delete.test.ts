import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { groupSelectedByActivity, planRoutineDeletion, skipAvailable, SKIP_NEEDS_MIGRATION } from "./routine-delete";
import { activityOccursOn, getRealOccurrences } from "./routine-real";
import { buildMyDayBoard } from "./my-day-board";
import type { Activity, Task } from "@/types/database.types";

const activity = (over: Partial<Activity>): Activity => ({ id: "a", space_id: "s", user_id: "u", title: "Atividade", category: null, weekdays: [1, 3], start_time: "18:00:00", end_time: null, is_active: true, sort_order: 0, notes: null, created_at: "", updated_at: "", skipped_dates: [], ...over });

describe("Excluir selecionadas — plano", () => {
  const academia = activity({ id: "academia", title: "Academia", weekdays: [1, 3, 5] });
  const consulta = activity({ id: "consulta", title: "Consulta", weekdays: [], specific_date: "2026-11-04" });
  const leitura = activity({ id: "leitura", title: "Leitura", skipped_dates: ["2026-11-09"] });

  it("somente neste dia: só acrescenta o dia; atividade e outros dias continuam", () => {
    const plan = planRoutineDeletion([academia, leitura], [
      { activityId: "academia", scope: "dias", dates: ["2026-11-04"] },
      { activityId: "leitura", scope: "dias", dates: ["2026-11-02", "2026-11-09"] },
    ]);
    expect(plan).toEqual({ deleteIds: [], skips: [{ activityId: "academia", skipped_dates: ["2026-11-04"] }, { activityId: "leitura", skipped_dates: ["2026-11-02", "2026-11-09"] }] });
  });

  it("atividade inteira: exclui; atividade de um dia só é sempre excluída inteira", () => {
    expect(planRoutineDeletion([academia, consulta], [
      { activityId: "academia", scope: "toda", dates: ["2026-11-04"] },
      { activityId: "consulta", scope: "dias", dates: ["2026-11-04"] },
    ])).toEqual({ deleteIds: ["academia", "consulta"], skips: [] });
  });

  it("não mexe no que não foi selecionado e recusa atividade de outra pessoa", () => {
    const plan = planRoutineDeletion([academia, consulta, leitura], [{ activityId: "academia", scope: "dias", dates: ["2026-11-06"] }]);
    expect(plan).toEqual({ deleteIds: [], skips: [{ activityId: "academia", skipped_dates: ["2026-11-06"] }] });
    expect(planRoutineDeletion([academia], [{ activityId: "de-outro", scope: "toda", dates: [] }])).toEqual({ error: "Atividade não encontrada. Atualize a página e tente de novo." });
    expect(planRoutineDeletion([academia], [])).toEqual({ error: "Nenhuma atividade selecionada." });
    expect(planRoutineDeletion([academia], [{ activityId: "academia", scope: "dias", dates: ["amanhã"] }])).toEqual({ error: "Selecione o dia a excluir." });
  });

  it("sem a migration: 'somente neste dia' é recusado sem excluir nada; 'inteira' funciona", () => {
    const legacy = activity({ id: "academia", skipped_dates: undefined });
    expect(skipAvailable([legacy])).toBe(false);
    expect(skipAvailable([academia])).toBe(true);
    expect(planRoutineDeletion([legacy], [{ activityId: "academia", scope: "dias", dates: ["2026-11-04"] }])).toEqual({ error: SKIP_NEEDS_MIGRATION });
    expect(planRoutineDeletion([legacy], [{ activityId: "academia", scope: "toda", dates: [] }])).toEqual({ deleteIds: ["academia"], skips: [] });
  });

  it("agrupa a seleção por atividade (dias diferentes juntos, sem repetir)", () => {
    expect(groupSelectedByActivity([
      { activity: academia, date: "2026-11-06" }, { activity: consulta, date: "2026-11-04" }, { activity: academia, date: "2026-11-02" }, { activity: academia, date: "2026-11-06" },
    ]).map((g) => [g.activity.id, g.dates])).toEqual([["academia", ["2026-11-02", "2026-11-06"]], ["consulta", ["2026-11-04"]]]);
  });
});

describe("dia excluído some de todos os lugares; os outros continuam", () => {
  const a = activity({ id: "academia", weekdays: [1], skipped_dates: ["2026-11-09"] });
  it("Rotina/Histórico (ocorrências) e lembretes (activityOccursOn)", () => {
    expect(getRealOccurrences([a], [], new Date(2026, 10, 2), new Date(2026, 10, 16)).map((o) => o.date)).toEqual(["2026-11-02", "2026-11-16"]);
    expect(activityOccursOn(a, "2026-11-09", 1)).toBe(false);
    expect(activityOccursOn(a, "2026-11-16", 1)).toBe(true);
  });
  it("Meu Dia: tarefa vinculada volta para as seções no dia excluído da rotina", () => {
    const t: Task = { id: "t", space_id: "s", user_id: "u", title: "VS Planner", description: null, kind: "dia", due_date: "2026-11-09", scheduled_time: null, location: null, priority: "normal", status: "pendente", category: null, notes: null, recurrence: "none", weekdays: [], recurrence_start: null, recurrence_until: null, archived_at: null, completed_at: null, created_at: "", updated_at: "" };
    const b = (skipped: string[]) => buildMyDayBoard({ todayKey: "2026-11-09", tasks: [t], occurrences: [], subtasks: [], activities: [{ ...a, task_id: "t", skipped_dates: skipped }] });
    expect(b([]).linkedTaskIds).toEqual(["t"]);
    expect(b(["2026-11-09"]).linkedTaskIds).toEqual([]);
    expect(b(["2026-11-09"]).hoje.map((i) => i.title)).toEqual(["VS Planner"]);
  });
});

describe("migration 20261107100000 (Postgres embutido)", () => {
  const sql = readFileSync(join(__dirname, "../supabase/migrations/20261107100000_activity_skipped_dates.sql"), "utf8");
  const A = "00000000-0000-0000-0000-00000000000a";
  const B = "00000000-0000-0000-0000-00000000000b";
  async function setup() {
    const db = new PGlite();
    await db.exec(`
      create schema if not exists auth;
      create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
      create role authenticated;
      create table public.activities (id uuid primary key default gen_random_uuid(), user_id uuid not null, title text not null, weekdays smallint[] not null default '{}', start_time time not null, specific_date date);
      create table public.activity_completions (id uuid primary key default gen_random_uuid(), activity_id uuid not null references public.activities (id) on delete cascade, user_id uuid not null, occurrence_date date not null, unique (activity_id, occurrence_date));
      alter table public.activities enable row level security;
      create policy activities_all on public.activities for all using (user_id = auth.uid()) with check (user_id = auth.uid());
      grant all on all tables in schema public to authenticated;
      grant usage on schema auth to authenticated;
      insert into public.activities (id, user_id, title, weekdays, start_time) values
        ('00000000-0000-0000-0000-0000000000a1', '${A}', 'Academia', '{1,3}', '18:00'),
        ('00000000-0000-0000-0000-0000000000b1', '${B}', 'Do B', '{1}', '07:00');
      insert into public.activity_completions (activity_id, user_id, occurrence_date) values ('00000000-0000-0000-0000-0000000000a1', '${A}', '2026-11-02');
    `);
    return db;
  }

  it("aditiva e idempotente: dados e histórico preservados, lista vazia por padrão", async () => {
    const db = await setup();
    await db.exec(sql);
    await db.exec(sql);
    const rows = (await db.query<{ title: string; weekdays: number[]; skipped_dates: string[] }>("select title, weekdays, skipped_dates::text[] as skipped_dates from activities order by title")).rows;
    expect(rows).toEqual([{ title: "Academia", weekdays: [1, 3], skipped_dates: [] }, { title: "Do B", weekdays: [1], skipped_dates: [] }]);
    expect((await db.query("select * from activity_completions")).rows).toHaveLength(1);
    await db.close();
  });

  it("RLS: dono marca o dia; outra pessoa não altera; histórico do dia continua", async () => {
    const db = await setup();
    await db.exec(sql);
    await db.exec(`set role authenticated; select set_config('app.uid', '${A}', false);`);
    await db.query("update activities set skipped_dates = '{2026-11-04}' where id = '00000000-0000-0000-0000-0000000000a1'");
    const other = await db.query("update activities set skipped_dates = '{2026-11-02}' where id = '00000000-0000-0000-0000-0000000000b1'");
    expect(other.affectedRows).toBe(0);
    await db.exec("reset role;");
    const rows = (await db.query<{ title: string; skipped_dates: string[] }>("select title, skipped_dates::text[] as skipped_dates from activities order by title")).rows;
    expect(rows).toEqual([{ title: "Academia", skipped_dates: ["2026-11-04"] }, { title: "Do B", skipped_dates: [] }]);
    expect((await db.query("select * from activity_completions")).rows).toHaveLength(1);
    await db.close();
  });
});
