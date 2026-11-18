import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { buildNewSubtaskRows } from "./supabase/subtask-rows";
import { prepareSubtaskDrafts, EMPTY_SUBTASK_DRAFT } from "./subtask-draft";

/**
 * Criar tarefa com subtarefas + checklist (Pessoal e CLT, mesmo editor) e a
 * recorrência mensal (migration 20261117100000) sobre as migrations REAIS,
 * num Postgres embutido com o gatilho de aninhamento.
 */
const migration = (name: string) => readFileSync(join(__dirname, "../supabase/migrations", name), "utf8");
const A = "00000000-0000-0000-0000-00000000000a";
const TASK = "00000000-0000-0000-0000-0000000000a1";

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
    insert into auth.users values ('${A}');
    create table public.tasks (id uuid primary key default gen_random_uuid(), user_id uuid not null, title text not null, kind text not null default 'prazo', due_date date, status text not null default 'pendente', recurrence text not null default 'none', weekdays smallint[] not null default '{}', recurrence_start date, recurrence_until date);
    create table public.task_occurrences (id uuid primary key default gen_random_uuid(), task_id uuid not null references public.tasks(id) on delete cascade, occurrence_date date not null, status text not null, unique (task_id, occurrence_date));
    create table public.clt_tasks (id uuid primary key default gen_random_uuid(), user_id uuid not null);
    create table public.work_items (id uuid primary key default gen_random_uuid(), created_by uuid not null);
    create table public.activities (id uuid primary key default gen_random_uuid(), user_id uuid not null, title text not null, weekdays smallint[] not null default '{}', start_time time not null);
    insert into public.tasks (id, user_id, title) values ('${TASK}', '${A}', 'Fazer posts da Semear');
  `);
  for (const m of ["20261023090000_task_subtasks.sql", "100_nested_subtasks.sql", "20261031100000_task_subtask_description.sql", "20261102100000_task_schedule_routine_links.sql", "20261112100000_organizer_tasks_subtask_recurrence.sql"]) await db.exec(migration(m));
  // Registro existente ANTES da migration mensal.
  await db.exec(`insert into task_subtasks (parent_type, parent_id, user_id, title, recurrence, weekdays, recurrence_start) values ('pessoal', '${TASK}', '${A}', 'Semanal antiga', 'weekly', '{1,3}', '2026-11-01')`);
  await db.exec(migration("20261117100000_subtask_monthly_recurrence.sql"));
  await db.exec(migration("20261117100000_subtask_monthly_recurrence.sql")); // idempotente
  return db;
}

/** Mesmo comportamento do insert em lote do app (`defaultToNull: false`): coluna ausente na linha = DEFAULT do banco. UM comando. */
async function insertBatch(db: PGlite, rows: Record<string, unknown>[]) {
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const params: unknown[] = [];
  const values = rows.map((r) => `(${cols.map((c) => {
    if (!(c in r)) return "default";
    const v = r[c];
    params.push(Array.isArray(v) ? `{${v.join(",")}}` : v);
    return `$${params.length}`;
  }).join(", ")})`);
  await db.query(`insert into task_subtasks (${cols.join(", ")}) values ${values.join(", ")}`, params);
}

describe("criar tarefa com subtarefas e checklist (um insert, tudo ou nada)", () => {
  it("subtarefas + itens do checklist (prioridade própria) + repetição mensal e diária no MESMO lote", async () => {
    const db = await setup();
    const prepared = prepareSubtaskDrafts([
      { ...EMPTY_SUBTASK_DRAFT, title: "Editar post", scheduledDate: "2026-11-17", priority: "importante", checklist: [{ title: "Revisar legenda", priority: "importante" }, { title: "Exportar vídeo", priority: "normal" }, { title: "  ", priority: "normal" }] },
      { ...EMPTY_SUBTASK_DRAFT, title: "Pagar impulsionamento", recurrence: "monthly", monthDay: "10" },
      { ...EMPTY_SUBTASK_DRAFT, title: "Responder comentários", recurrence: "weekly", weekdays: [0, 1, 2, 3, 4, 5, 6] },
    ]);
    if ("error" in prepared) throw new Error(prepared.error);
    const built = buildNewSubtaskRows({ parentType: "pessoal", parentId: TASK, userId: A }, prepared.inputs);
    if ("error" in built) throw new Error(built.error);
    await insertBatch(db, built.rows);
    const rows = (await db.query<{ title: string; priority: string; recurrence: string; month_day: number | null; weekdays: number[]; scheduled_date: string | null; parent: string | null }>(
      `select s.title, s.priority, s.recurrence, s.month_day, s.weekdays, s.scheduled_date::text, p.title parent from task_subtasks s left join task_subtasks p on p.id = s.parent_subtask_id where s.title <> 'Semanal antiga' order by s.parent_subtask_id nulls first, s.position`)).rows;
    expect(rows).toEqual([
      { title: "Editar post", priority: "importante", recurrence: "none", month_day: null, weekdays: [], scheduled_date: "2026-11-17", parent: null },
      { title: "Pagar impulsionamento", priority: "normal", recurrence: "monthly", month_day: 10, weekdays: [], scheduled_date: null, parent: null },
      { title: "Responder comentários", priority: "normal", recurrence: "weekly", month_day: null, weekdays: [0, 1, 2, 3, 4, 5, 6], scheduled_date: null, parent: null },
      { title: "Revisar legenda", priority: "importante", recurrence: "none", month_day: null, weekdays: [], scheduled_date: null, parent: "Editar post" },
      { title: "Exportar vídeo", priority: "normal", recurrence: "none", month_day: null, weekdays: [], scheduled_date: null, parent: "Editar post" },
    ]);
    await db.close();
  });

  it("tudo ou nada: um item inválido derruba o lote inteiro", async () => {
    const db = await setup();
    const built = buildNewSubtaskRows({ parentType: "pessoal", parentId: TASK, userId: A }, [{ title: "Ok", checklist: [{ title: "Item" }] }]);
    if ("error" in built) throw new Error(built.error);
    const broken = [...built.rows, { parent_type: "pessoal", parent_id: TASK, user_id: A, title: "", position: 9 }];
    await expect(insertBatch(db, broken)).rejects.toThrow();
    expect((await db.query("select count(*)::int n from task_subtasks where title <> 'Semanal antiga'")).rows).toEqual([{ n: 0 }]);
    await db.close();
  });
});

describe("migration 20261117100000 — recorrência mensal", () => {
  it("é aditiva: a semanal existente continua válida e intacta", async () => {
    const db = await setup();
    expect((await db.query("select title, recurrence, weekdays, month_day from task_subtasks")).rows).toEqual([{ title: "Semanal antiga", recurrence: "weekly", weekdays: [1, 3], month_day: null }]);
    await db.close();
  });
  it("mensal exige dia 1..31 e não vale para itens de checklist", async () => {
    const db = await setup();
    const ins = (extra: string) => db.query(`insert into task_subtasks (parent_type, parent_id, user_id, title, recurrence, recurrence_start${extra ? ", " + extra.split("=")[0] : ""}) values ('pessoal', '${TASK}', '${A}', 'M', 'monthly', '2026-11-17'${extra ? ", " + extra.split("=")[1] : ""})`);
    await expect(ins("")).rejects.toThrow();
    await expect(ins("month_day=32")).rejects.toThrow();
    await ins("month_day=31");
    await expect(db.query(`update task_subtasks set recurrence = 'yearly' where title = 'M'`)).rejects.toThrow();
    await db.close();
  });
});
