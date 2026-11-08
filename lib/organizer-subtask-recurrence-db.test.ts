import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

/**
 * Migration 20261112100000 (tarefa organizadora + recorrência das
 * subtarefas) com as migrations REAIS de subtarefas, num Postgres embutido
 * e com RLS. Garante: aditiva/idempotente, registros antigos intactos,
 * execução única por (subtarefa, dia) e isolamento entre usuários.
 */
const migration = (name: string) => readFileSync(join(__dirname, "../supabase/migrations", name), "utf8");
const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const TASK_A = "00000000-0000-0000-0000-0000000000a1";
const TASK_B = "00000000-0000-0000-0000-0000000000b1";

async function setup() {
  const db = new PGlite();
  await db.exec(`
    create schema if not exists auth;
    create table auth.users (id uuid primary key);
    create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
    create role authenticated;
    grant usage on schema auth to authenticated;
    grant usage on schema public to authenticated;
    alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
    create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
    insert into auth.users values ('${A}'), ('${B}');
    -- tasks como em produção (migration 013): kind restrito a prazo/dia.
    create table public.tasks (
      id uuid primary key default gen_random_uuid(), user_id uuid not null, title text not null,
      kind text not null default 'prazo', due_date date, status text not null default 'pendente',
      recurrence text not null default 'none', weekdays smallint[] not null default '{}', recurrence_start date, recurrence_until date
    );
    alter table public.tasks add constraint tasks_kind_check check (kind in ('prazo', 'dia'));
    alter table public.tasks add constraint tasks_recurrence_shape_check check (recurrence = 'none' or (kind = 'dia' and cardinality(weekdays) > 0 and recurrence_start is not null));
    alter table public.tasks add constraint tasks_day_date_check check (kind <> 'dia' or recurrence <> 'none' or due_date is not null);
    create table public.task_occurrences (id uuid primary key default gen_random_uuid(), task_id uuid not null references public.tasks(id) on delete cascade, occurrence_date date not null, status text not null, unique (task_id, occurrence_date));
    create table public.clt_tasks (id uuid primary key default gen_random_uuid(), user_id uuid not null);
    create table public.work_items (id uuid primary key default gen_random_uuid(), created_by uuid not null);
    create table public.activities (id uuid primary key default gen_random_uuid(), user_id uuid not null, title text not null, weekdays smallint[] not null default '{}', start_time time not null);
    insert into public.tasks (id, user_id, title, kind, recurrence, weekdays, recurrence_start) values
      ('${TASK_A}', '${A}', 'VS Planner', 'dia', 'weekly', '{1,2,3}', '2026-10-26'),
      ('${TASK_B}', '${B}', 'Tarefa do B', 'prazo', 'none', '{}', null);
    insert into public.task_occurrences (task_id, occurrence_date, status) values ('${TASK_A}', '2026-10-27', 'concluida'), ('${TASK_A}', '2026-10-28', 'pendente');
  `);
  for (const m of ["20261023090000_task_subtasks.sql", "100_nested_subtasks.sql", "20261031100000_task_subtask_description.sql", "20261102100000_task_schedule_routine_links.sql"]) await db.exec(migration(m));
  await db.exec(`grant all on all tables in schema public to authenticated;`);
  const etapa = (await db.query<{ id: string }>(`insert into task_subtasks (parent_type, parent_id, user_id, title, is_done) values ('pessoal', '${TASK_A}', '${A}', 'Atualizações pendentes', false) returning id`)).rows[0].id;
  await db.query(`insert into task_subtasks (parent_type, parent_id, user_id, title, is_done, parent_subtask_id) values ('pessoal', '${TASK_A}', '${A}', 'Item antigo', true, $1)`, [etapa]);
  return { db, etapa };
}

const SQL = migration("20261112100000_organizer_tasks_subtask_recurrence.sql");
const asUser = async <T,>(db: PGlite, uid: string, fn: () => Promise<T>) => {
  await db.exec(`set role authenticated; select set_config('app.uid', '${uid}', false);`);
  try { return await fn(); } finally { await db.exec("reset role;"); }
};

describe("migration 20261112100000 (Postgres embutido)", () => {
  it("é aditiva e idempotente: tarefas, execuções, subtarefas e checklists antigos ficam intactos (itens = Normal, sem recorrência)", async () => {
    const { db } = await setup();
    await db.exec(SQL);
    await db.exec(SQL);
    expect((await db.query("select title, kind, recurrence from tasks order by title")).rows).toEqual([
      { title: "Tarefa do B", kind: "prazo", recurrence: "none" },
      { title: "VS Planner", kind: "dia", recurrence: "weekly" },
    ]);
    expect((await db.query("select occurrence_date::text d, status from task_occurrences order by 1")).rows).toEqual([{ d: "2026-10-27", status: "concluida" }, { d: "2026-10-28", status: "pendente" }]);
    expect((await db.query("select title, is_done, priority, recurrence, weekdays, archived_at from task_subtasks order by title")).rows).toEqual([
      { title: "Atualizações pendentes", is_done: false, priority: "normal", recurrence: "none", weekdays: [], archived_at: null },
      { title: "Item antigo", is_done: true, priority: "normal", recurrence: "none", weekdays: [], archived_at: null },
    ]);
    await db.close();
  });

  it("recorrente vira organizadora sem perder as execuções gravadas; kind inválido continua recusado", async () => {
    const { db } = await setup();
    await expect(db.query(`update tasks set kind = 'organizadora', recurrence = 'none', weekdays = '{}', recurrence_start = null where id = '${TASK_A}'`)).rejects.toThrow();
    await db.exec(SQL);
    await db.query(`update tasks set kind = 'organizadora', recurrence = 'none', weekdays = '{}', recurrence_start = null where id = '${TASK_A}'`);
    expect((await db.query<{ n: number }>(`select count(*)::int n from task_occurrences where task_id = '${TASK_A}'`)).rows[0].n).toBe(2);
    await db.query(`insert into tasks (user_id, title, kind) values ('${A}', 'Nova organizadora', 'organizadora')`);
    await expect(db.query(`insert into tasks (user_id, title, kind) values ('${A}', 'x', 'outra')`)).rejects.toThrow();
    await db.close();
  });

  it("subtarefa recorrente exige dias + início; item de checklist não pode repetir", async () => {
    const { db, etapa } = await setup();
    await db.exec(SQL);
    await expect(db.query(`insert into task_subtasks (parent_type, parent_id, user_id, title, recurrence) values ('pessoal', '${TASK_A}', '${A}', 'x', 'weekly')`)).rejects.toThrow();
    await expect(db.query(`insert into task_subtasks (parent_type, parent_id, user_id, title, recurrence, weekdays, recurrence_start, parent_subtask_id) values ('pessoal', '${TASK_A}', '${A}', 'x', 'weekly', '{1}', '2026-11-02', $1)`, [etapa])).rejects.toThrow();
    await expect(db.query(`insert into task_subtasks (parent_type, parent_id, user_id, title, recurrence, weekdays, recurrence_start) values ('pessoal', '${TASK_A}', '${A}', 'x', 'weekly', '{9}', '2026-11-02')`)).rejects.toThrow();
    await db.query(`insert into task_subtasks (parent_type, parent_id, user_id, title, recurrence, weekdays, recurrence_start) values ('pessoal', '${TASK_A}', '${A}', 'Verificar', 'weekly', '{1,2,3}', '2026-11-02')`);
    await db.close();
  });

  it("uma execução por (subtarefa, dia): duplicar falha e o upsert do app só troca o status; desmarcar mantém a linha", async () => {
    const { db } = await setup();
    await db.exec(SQL);
    const id = (await db.query<{ id: string }>(`insert into task_subtasks (parent_type, parent_id, user_id, title, recurrence, weekdays, recurrence_start) values ('pessoal', '${TASK_A}', '${A}', 'Verificar', 'weekly', '{1,2,3}', '2026-11-02') returning id`)).rows[0].id;
    await asUser(db, A, async () => {
      const upsert = (date: string, status: string) => db.query(
        `insert into task_subtask_occurrences (subtask_id, user_id, occurrence_date, status) values ($1, $2, $3, $4)
         on conflict (subtask_id, occurrence_date) do update set status = excluded.status`, [id, A, date, status]);
      await upsert("2026-11-02", "concluida");
      await upsert("2026-11-02", "concluida"); // clique duplo / duas abas
      await upsert("2026-11-03", "concluida");
      await upsert("2026-11-03", "pendente"); // desmarcar terça
      await expect(db.query(`insert into task_subtask_occurrences (subtask_id, user_id, occurrence_date, status) values ($1, $2, '2026-11-02', 'concluida')`, [id, A])).rejects.toThrow();
    });
    expect((await db.query("select occurrence_date::text d, status from task_subtask_occurrences order by 1")).rows).toEqual([{ d: "2026-11-02", status: "concluida" }, { d: "2026-11-03", status: "pendente" }]);
    await db.close();
  });

  it("RLS: outro usuário não lê nem grava execução da subtarefa de A (nem com o próprio user_id)", async () => {
    const { db } = await setup();
    await db.exec(SQL);
    const id = (await db.query<{ id: string }>(`insert into task_subtasks (parent_type, parent_id, user_id, title, recurrence, weekdays, recurrence_start) values ('pessoal', '${TASK_A}', '${A}', 'Verificar', 'weekly', '{1}', '2026-11-02') returning id`)).rows[0].id;
    await db.query(`insert into task_subtask_occurrences (subtask_id, user_id, occurrence_date, status) values ($1, '${A}', '2026-11-02', 'concluida')`, [id]);
    await asUser(db, B, async () => {
      expect((await db.query("select * from task_subtask_occurrences")).rows).toEqual([]);
      await expect(db.query(`insert into task_subtask_occurrences (subtask_id, user_id, occurrence_date, status) values ($1, '${B}', '2026-11-09', 'concluida')`, [id])).rejects.toThrow();
      await expect(db.query(`insert into task_subtask_occurrences (subtask_id, user_id, occurrence_date, status) values ($1, '${A}', '2026-11-09', 'concluida')`, [id])).rejects.toThrow();
      const upd = await db.query(`update task_subtask_occurrences set status = 'pendente'`);
      expect(upd.affectedRows).toBe(0);
    });
    await asUser(db, A, async () => {
      expect((await db.query("select status from task_subtask_occurrences")).rows).toEqual([{ status: "concluida" }]);
    });
    await db.close();
  });
});
