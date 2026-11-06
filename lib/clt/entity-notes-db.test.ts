import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

/** Migration 20261110110000 (histórico de anotações) sobre as migrations reais do CLT. */
const root = join(__dirname, "../..");
const migration = (name: string) => readFileSync(join(root, "supabase/migrations", name), "utf8");
const U1 = "11111111-1111-1111-1111-111111111111";
const NEW = "20261110110000_clt_entity_notes.sql";

async function setup() {
  const db = new PGlite();
  await db.exec(`
    create role authenticated nologin; create role anon nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public to authenticated, anon;
    create table public.profiles (id uuid primary key references auth.users(id), name text not null);
    create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
  `);
  await db.exec(migration("014_clt_traffic_management.sql").split("-- Dados iniciais")[0]);
  await db.exec(migration("025_clt_traffic_management.sql"));
  await db.exec(`insert into auth.users values ('${U1}'); insert into public.profiles values ('${U1}', 'Dono');`);
  const id = async (sql: string) => (await db.query<{ id: string }>(sql)).rows[0].id;
  const company = await id(`insert into clt_companies (user_id, name) values ('${U1}', 'SGIV') returning id`);
  const campaign = await id(`insert into clt_campaigns (user_id, company_id, name, objective, starts_on, ends_on, notes) values ('${U1}', '${company}', 'C1', 'mensagens', '2026-10-01', '2026-10-31', 'Obs antiga') returning id`);
  const other = await id(`insert into clt_campaigns (user_id, company_id, name, objective, starts_on, ends_on) values ('${U1}', '${company}', 'C2', 'mensagens', '2026-10-01', '2026-10-31') returning id`);
  const set = await id(`insert into clt_ad_sets (user_id, campaign_id, name) values ('${U1}', '${campaign}', 'S1') returning id`);
  const ad = await id(`insert into clt_ad_creatives (user_id, ad_set_id, name) values ('${U1}', '${set}', 'A1') returning id`);
  await db.exec(migration(NEW));
  await db.exec(migration(NEW)); // idempotente
  return { db, campaign, other, set, ad };
}

describe("migration 20261110110000 — anotações", () => {
  it("acumula anotações com data/hora nos três níveis, sem tocar no campo antigo", async () => {
    const { db, campaign, set, ad } = await setup();
    await db.query(`insert into clt_entity_notes (user_id, level, campaign_id, body) values ($1, 'campaign', $2, 'Pausei esta campanha para testar outro público')`, [U1, campaign]);
    await db.query(`insert into clt_entity_notes (user_id, level, campaign_id, body) values ($1, 'campaign', $2, 'Reativei')`, [U1, campaign]);
    await db.query(`insert into clt_entity_notes (user_id, level, campaign_id, ad_set_id, body) values ($1, 'ad_set', $2, $3, 'Público novo')`, [U1, campaign, set]);
    await db.query(`insert into clt_entity_notes (user_id, level, campaign_id, ad_set_id, creative_id, body) values ($1, 'ad', $2, $3, $4, 'Troquei o criativo')`, [U1, campaign, set, ad]);
    const rows = (await db.query<{ level: string; n: number }>(`select level, count(*)::int as n from clt_entity_notes group by level order by level`)).rows;
    expect(rows).toEqual([{ level: "ad", n: 1 }, { level: "ad_set", n: 1 }, { level: "campaign", n: 2 }]);
    expect((await db.query(`select notes from clt_campaigns where id = $1`, [campaign])).rows[0]).toEqual({ notes: "Obs antiga" });
    const withTime = (await db.query<{ ok: boolean }>(`select bool_and(created_at is not null) as ok from clt_entity_notes`)).rows[0];
    expect(withTime.ok).toBe(true);
  });

  it("recusa texto vazio e alvo incoerente (conjunto de outra campanha)", async () => {
    const { db, campaign, other, set } = await setup();
    await expect(db.query(`insert into clt_entity_notes (user_id, level, campaign_id, body) values ($1, 'campaign', $2, '   ')`, [U1, campaign])).rejects.toThrow();
    await expect(db.query(`insert into clt_entity_notes (user_id, level, campaign_id, ad_set_id, body) values ($1, 'ad_set', $2, $3, 'x')`, [U1, other, set])).rejects.toThrow(/não pertence/);
    await expect(db.query(`insert into clt_entity_notes (user_id, level, campaign_id, body) values ($1, 'ad', $2, 'x')`, [U1, campaign])).rejects.toThrow();
  });

  it("não há policy de update/delete (histórico imutável pela API)", async () => {
    const { db } = await setup();
    const policies = (await db.query<{ cmd: string }>(`select cmd from pg_policies where tablename = 'clt_entity_notes' order by cmd`)).rows.map((r) => r.cmd);
    expect(policies).toEqual(["INSERT", "SELECT"]);
  });
});
