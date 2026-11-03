import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Migration 20261104100000 num Postgres embutido. `vault`, `cron` e `net`
 * são simulados (PGlite não tem as extensões); `create extension` é removido.
 */
const sql = readFileSync(join(__dirname, "../../supabase/migrations/20261104100000_push_cron_selfheal.sql"), "utf8").replace(/^create extension .*$/gm, "");

async function setup() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema vault; create schema net; create schema cron;
    create table vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, secret text);
    create view vault.decrypted_secrets as select id, name, secret as decrypted_secret from vault.secrets;
    create function vault.create_secret(new_secret text, new_name text) returns uuid language sql as $$ insert into vault.secrets (name, secret) values (new_name, new_secret) returning id $$;
    create function vault.update_secret(secret_id uuid, new_secret text) returns void language sql as $$ update vault.secrets set secret = new_secret where id = secret_id $$;
    create table net.calls (id bigserial primary key, url text, headers jsonb);
    create function net.http_get(url text, headers jsonb, timeout_milliseconds int) returns bigint language sql as $$ insert into net.calls (url, headers) values (url, headers) returning id $$;
    create table net._http_response (id bigserial, status_code int, created timestamptz default now(), timed_out bool, error_msg text, content text);
    create table cron.job (jobid bigserial primary key, jobname text unique, schedule text, command text, active bool default true);
    create table cron.job_run_details (jobid bigint, status text, start_time timestamptz, return_message text);
    create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as $$
      insert into cron.job (jobname, schedule, command) values (job_name, schedule, command)
      on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning jobid $$;
    create function cron.unschedule(job_name text) returns bool language sql as $$ delete from cron.job where jobname = job_name returning true $$;
  `);
  await db.exec(sql);
  return db;
}
const one = async <T,>(db: PGlite, q: string) => (await db.query<T>(q)).rows[0];

describe("migration 20261104100000 — agendamento que se configura sozinho", () => {
  it("é idempotente e deixa um único job por minuto", async () => {
    const db = await setup();
    await db.exec(sql);
    expect((await db.query("select jobname, schedule from cron.job")).rows).toEqual([{ jobname: "vsplanner-task-reminders", schedule: "* * * * *" }]);
  });

  it("configure grava URL e segredo, reativa o job e não devolve valores", async () => {
    const db = await setup();
    await db.exec("update cron.job set active = false");
    const r = await one<{ r: Record<string, string> }>(db, "select public.vsplanner_configure_cron('https://app.exemplo.com/', 'segredo-com-32-caracteres-000000') as r");
    expect(r.r).toEqual({ url: "criado", secret: "criado", job: "agendado" });
    expect(JSON.stringify(r.r)).not.toContain("segredo");
    expect((await db.query("select name, secret from vault.secrets order by name")).rows).toEqual([
      { name: "vsplanner_app_url", secret: "https://app.exemplo.com" },
      { name: "vsplanner_cron_secret", secret: "segredo-com-32-caracteres-000000" },
    ]);
    expect(await one(db, "select active from cron.job")).toEqual({ active: true });
    // Segunda vez: nada muda.
    expect((await one<{ r: unknown }>(db, "select public.vsplanner_configure_cron('https://app.exemplo.com', 'segredo-com-32-caracteres-000000') as r")).r).toEqual({ url: "ok", secret: "ok", job: "ok" });
    // Domínio novo / segredo novo atualizam (sem duplicar).
    expect((await one<{ r: unknown }>(db, "select public.vsplanner_configure_cron('https://novo.exemplo.com', 'outro-segredo-1234567890') as r")).r).toEqual({ url: "atualizado", secret: "atualizado", job: "ok" });
    expect((await db.query("select * from vault.secrets")).rows).toHaveLength(2);
  });

  it("sem CRON_SECRET gera um segredo; recusa URL insegura", async () => {
    const db = await setup();
    expect((await one<{ r: { secret: string } }>(db, "select public.vsplanner_configure_cron('https://app.exemplo.com', null) as r")).r.secret).toBe("gerado");
    expect((await one<{ n: number }>(db, "select length(secret) as n from vault.secrets where name = 'vsplanner_cron_secret'")).n).toBe(64);
    await expect(db.query("select public.vsplanner_configure_cron('http://app.exemplo.com', null)")).rejects.toThrow(/URL inválida/);
    await expect(db.query("select public.vsplanner_configure_cron('https://app.exemplo.com/caminho', null)")).rejects.toThrow(/URL inválida/);
  });

  it("disparo usa o Vault e marca a origem; check_token confere sem expor o segredo", async () => {
    const db = await setup();
    expect(await one(db, "select public.vsplanner_dispatch_task_reminders() as id")).toEqual({ id: null });
    await db.query("select public.vsplanner_configure_cron('https://app.exemplo.com', 'segredo-com-32-caracteres-000000')");
    await db.query("select public.vsplanner_dispatch_task_reminders()");
    expect(await one(db, "select url, headers from net.calls")).toEqual({ url: "https://app.exemplo.com/api/cron/task-reminders", headers: { Authorization: "Bearer segredo-com-32-caracteres-000000", "x-vsplanner-source": "supabase-cron" } });
    expect(await one(db, "select public.vsplanner_cron_check_token('segredo-com-32-caracteres-000000') as ok")).toEqual({ ok: true });
    expect(await one(db, "select public.vsplanner_cron_check_token('errado-errado-errado') as ok")).toEqual({ ok: false });
    expect(await one(db, "select public.vsplanner_cron_check_token('') as ok")).toEqual({ ok: false });
  });

  it("status mostra saúde sem segredos", async () => {
    const db = await setup();
    await db.query("select public.vsplanner_configure_cron('https://app.exemplo.com', 'segredo-com-32-caracteres-000000')");
    await db.exec("insert into cron.job_run_details values ((select jobid from cron.job), 'succeeded', now(), '1 row'); insert into net._http_response (status_code, timed_out) values (200, false);");
    const s = (await one<{ s: Record<string, unknown> }>(db, "select public.vsplanner_cron_status() as s")).s;
    expect(s).toMatchObject({ job: { active: true, schedule: "* * * * *" }, url_configured: true, secret_configured: true, app_host: "app.exemplo.com" });
    expect((s.last_runs as unknown[]).length).toBe(1);
    expect((s.last_http as Array<{ status_code: number }>)[0].status_code).toBe(200);
    expect(JSON.stringify(s)).not.toContain("segredo");
  });

  it("nada disso é acessível por anon/authenticated; push_cron_runs fechada", async () => {
    const db = await setup();
    for (const role of ["anon", "authenticated"]) {
      for (const fn of ["vsplanner_configure_cron(text,text)", "vsplanner_cron_check_token(text)", "vsplanner_cron_status()", "vsplanner_dispatch_task_reminders()"]) {
        expect((await one<{ ok: boolean }>(db, `select has_function_privilege('${role}', 'public.${fn}', 'execute') as ok`)).ok).toBe(false);
      }
      expect((await one<{ ok: boolean }>(db, `select has_table_privilege('${role}', 'public.push_cron_runs', 'select') as ok`)).ok).toBe(false);
    }
    expect((await one<{ ok: boolean }>(db, "select has_function_privilege('service_role', 'public.vsplanner_configure_cron(text,text)', 'execute') as ok")).ok).toBe(true);
  });
});
