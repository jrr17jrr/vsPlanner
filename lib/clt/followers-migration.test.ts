import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Migration dos seguidores do Instagram num Postgres embutido (RLS real). */
const sql = readFileSync(join(__dirname, "../../supabase/migrations/20261103110000_clt_instagram_followers.sql"), "utf8");
const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const COMPANY_A = "00000000-0000-0000-0000-0000000000a1";
const COMPANY_B = "00000000-0000-0000-0000-0000000000b1";

async function setup() {
  const db = new PGlite();
  await db.exec(`
    create schema if not exists auth;
    create table auth.users (id uuid primary key);
    create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
    create role authenticated;
    grant usage on schema auth to authenticated;
    insert into auth.users values ('${A}'), ('${B}');
    create table public.clt_companies (id uuid primary key, user_id uuid not null references auth.users(id), name text not null);
    insert into public.clt_companies values ('${COMPANY_A}', '${A}', 'Empresa A'), ('${COMPANY_B}', '${B}', 'Empresa B');
    grant select on public.clt_companies to authenticated;
  `);
  return db;
}
const as = (db: PGlite, uid: string) => db.exec(`set role authenticated; select set_config('app.uid', '${uid}', false);`);

describe("migration 20261103110000 — seguidores do Instagram", () => {
  it("é idempotente e grava data/hora automaticamente", async () => {
    const db = await setup();
    await db.exec(sql);
    await db.exec(sql);
    await as(db, A);
    await db.query(`insert into public.clt_instagram_followers (user_id, company_id, followers) values ('${A}', '${COMPANY_A}', 233)`);
    const row = (await db.query<{ followers: number; has_time: boolean }>("select followers, recorded_at is not null as has_time from public.clt_instagram_followers")).rows[0];
    expect(row).toEqual({ followers: 233, has_time: true });
    await expect(db.query(`insert into public.clt_instagram_followers (user_id, company_id, followers) values ('${A}', '${COMPANY_A}', -1)`)).rejects.toThrow();
    await db.close();
  });

  it("RLS: só o dono da empresa registra, vê e corrige; sem exclusão", async () => {
    const db = await setup();
    await db.exec(sql);
    await as(db, A);
    await db.query(`insert into public.clt_instagram_followers (user_id, company_id, followers) values ('${A}', '${COMPANY_A}', 233)`);
    // A não registra na empresa de B (nem fingindo ser B).
    await expect(db.query(`insert into public.clt_instagram_followers (user_id, company_id, followers) values ('${A}', '${COMPANY_B}', 1)`)).rejects.toThrow();
    await expect(db.query(`insert into public.clt_instagram_followers (user_id, company_id, followers) values ('${B}', '${COMPANY_B}', 1)`)).rejects.toThrow();
    // Correção do próprio registro.
    await db.query("update public.clt_instagram_followers set followers = 234");
    expect((await db.query<{ followers: number }>("select followers from public.clt_instagram_followers")).rows).toEqual([{ followers: 234 }]);
    // Não move o registro para a empresa de outra pessoa.
    await expect(db.query(`update public.clt_instagram_followers set company_id = '${COMPANY_B}'`)).rejects.toThrow();
    // Exclusão não é permitida (histórico preservado).
    await expect(db.query("delete from public.clt_instagram_followers")).rejects.toThrow();
    // B não vê os registros de A.
    await as(db, B);
    expect((await db.query("select * from public.clt_instagram_followers")).rows).toHaveLength(0);
    expect((await db.query("update public.clt_instagram_followers set followers = 0 returning id")).rows).toHaveLength(0);
    await db.close();
  });
});
