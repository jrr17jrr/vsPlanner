import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Migration do agendamento (pg_cron + pg_net + Vault) num Postgres embutido.
 * PGlite não tem essas extensões: os esquemas `cron`, `net` e `vault` são
 * simulados e as linhas `create extension` são removidas.
 */
const sql = readFileSync(join(__dirname, "../../supabase/migrations/20261103100000_task_reminders_cron.sql"), "utf8")
  .replace(/^create extension .*$/gm, "");

async function setup() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema vault; create schema net; create schema cron;
    create table vault.decrypted_secrets (name text primary key, decrypted_secret text);
    create table net.calls (id bigserial primary key, url text, headers jsonb, timeout int);
    create function net.http_get(url text, headers jsonb, timeout_milliseconds int) returns bigint language sql as $$
      insert into net.calls (url, headers, timeout) values (url, headers, timeout_milliseconds) returning id $$;
    create table cron.job (jobname text primary key, schedule text, command text);
    create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as $$
      insert into cron.job values (job_name, schedule, command)
      on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning 1::bigint $$;
  `);
  return db;
}

describe("migration 20261103100000 — agendamento dos lembretes", () => {
  it("registra um único job por minuto, idempotente", async () => {
    const db = await setup();
    await db.exec(sql);
    await db.exec(sql);
    const jobs = await db.query<{ jobname: string; schedule: string; command: string }>("select * from cron.job");
    expect(jobs.rows).toEqual([{ jobname: "vsplanner-task-reminders", schedule: "* * * * *", command: "select public.vsplanner_dispatch_task_reminders()" }]);
  });

  it("sem segredos no Vault não chama nada (nem quebra)", async () => {
    const db = await setup();
    await db.exec(sql);
    const res = await db.query<{ id: number | null }>("select public.vsplanner_dispatch_task_reminders() as id");
    expect(res.rows[0].id).toBeNull();
    expect((await db.query("select * from net.calls")).rows).toHaveLength(0);
  });

  it("com segredos chama a rota com Bearer e sem barra duplicada", async () => {
    const db = await setup();
    await db.exec(sql);
    await db.exec(`insert into vault.decrypted_secrets values ('vsplanner_app_url', 'https://app.exemplo.com/'), ('vsplanner_cron_secret', 's3cr3t')`);
    await db.query("select public.vsplanner_dispatch_task_reminders()");
    const calls = await db.query<{ url: string; headers: Record<string, string>; timeout: number }>("select url, headers, timeout from net.calls");
    expect(calls.rows).toEqual([{ url: "https://app.exemplo.com/api/cron/task-reminders", headers: { Authorization: "Bearer s3cr3t" }, timeout: 25000 }]);
  });

  it("a função não fica executável por anon/authenticated", async () => {
    const db = await setup();
    await db.exec(sql);
    const res = await db.query<{ anon: boolean; auth: boolean }>(`
      select has_function_privilege('anon', 'public.vsplanner_dispatch_task_reminders()', 'execute') as anon,
             has_function_privilege('authenticated', 'public.vsplanner_dispatch_task_reminders()', 'execute') as auth`);
    expect(res.rows[0]).toEqual({ anon: false, auth: false });
  });
});
