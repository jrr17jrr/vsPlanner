import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

/**
 * Migration 20261109100000 (informações cadastradas) sobre as migrations
 * REAIS num Postgres embutido: aditiva, idempotente, não toca nos dados
 * existentes nem nas métricas, e valida idade/raio.
 */
const root = join(__dirname, "../..");
const migration = (name: string) => readFileSync(join(root, "supabase/migrations", name), "utf8");
const U1 = "11111111-1111-1111-1111-111111111111";
const NEW = "20261109100000_clt_registered_info.sql";

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
  for (const m of ["025_clt_traffic_management.sql", "20261021_campaign_created_in_meta.sql", "20261030110000_clt_smart_import.sql", "20261104110000_clt_ad_result_updates.sql"]) await db.exec(migration(m));
  await db.exec(`insert into auth.users values ('${U1}'); insert into public.profiles values ('${U1}', 'Dono');`);
  const company = (await db.query<{ id: string }>(`insert into clt_companies (user_id, name) values ('${U1}', 'SGIV') returning id`)).rows[0].id;
  const campaign = (await db.query<{ id: string }>(`insert into clt_campaigns (user_id, company_id, name, objective, starts_on, ends_on, meta_campaign_id, manager_url, description) values ('${U1}', '${company}', 'Campanha antiga', 'mensagens', '2026-10-01', '2026-10-31', '120210000000000001', 'https://adsmanager.facebook.com/x', 'Obs antiga') returning id`)).rows[0].id;
  const set = (await db.query<{ id: string }>(`insert into clt_ad_sets (user_id, campaign_id, name, location, placements, meta_adset_id) values ('${U1}', '${campaign}', 'Conjunto antigo', 'Cabo Frio', 'Feed', '120210000000000002') returning id`)).rows[0].id;
  const ad = (await db.query<{ id: string }>(`insert into clt_ad_creatives (user_id, ad_set_id, name, format, asset_url, meta_ad_id, post_id) values ('${U1}', '${set}', 'Anúncio antigo', 'video', 'https://instagram.com/p/A', '120210000000000003', '123_456') returning id`)).rows[0].id;
  await db.query(`insert into clt_ad_period_metrics (user_id, company_id, campaign_id, ad_set_id, creative_id, period_start, period_end, spend, conversations) values ($1, $2, $3, $4, $5, '2026-10-01', '2026-10-31', 150, 12)`, [U1, company, campaign, set, ad]);
  await db.exec(migration(NEW));
  await db.exec(migration(NEW)); // idempotente
  return { db, campaign, set, ad };
}

describe("migration 20261109100000 — informações cadastradas", () => {
  it("é aditiva: dados antigos intactos, colunas novas vazias (Não informado)", async () => {
    const { db, campaign, set, ad } = await setup();
    const c = (await db.query(`select name, meta_campaign_id, manager_url, description, bid_strategy, buying_type, details from clt_campaigns where id = $1`, [campaign])).rows[0];
    expect(c).toEqual({ name: "Campanha antiga", meta_campaign_id: "120210000000000001", manager_url: "https://adsmanager.facebook.com/x", description: "Obs antiga", bid_strategy: null, buying_type: null, details: {} });
    const s = (await db.query(`select location, placements, meta_adset_id, age_min, languages, conversion_location, details from clt_ad_sets where id = $1`, [set])).rows[0];
    expect(s).toEqual({ location: "Cabo Frio", placements: "Feed", meta_adset_id: "120210000000000002", age_min: null, languages: null, conversion_location: null, details: {} });
    const a = (await db.query(`select format, asset_url, meta_ad_id, post_id, primary_text, call_to_action, destination, details from clt_ad_creatives where id = $1`, [ad])).rows[0];
    expect(a).toEqual({ format: "video", asset_url: "https://instagram.com/p/A", meta_ad_id: "120210000000000003", post_id: "123_456", primary_text: null, call_to_action: null, destination: null, details: {} });
  });

  it("salvar informações não mexe nas métricas; ID longo fica exato (texto)", async () => {
    const { db, set, ad } = await setup();
    await db.query(`update clt_ad_creatives set primary_text = 'Olá', call_to_action = 'Enviar mensagem', destination = 'WhatsApp', meta_ad_id = '120212345678901234567', details = details || '{"utm":"x"}'::jsonb where id = $1`, [ad]);
    await db.query(`update clt_ad_sets set age_min = 25, age_max = 65, radius_km = 12.5, languages = 'Português' where id = $1`, [set]);
    const a = (await db.query(`select meta_ad_id, primary_text, details from clt_ad_creatives where id = $1`, [ad])).rows[0];
    expect(a).toEqual({ meta_ad_id: "120212345678901234567", primary_text: "Olá", details: { utm: "x" } });
    const m = (await db.query(`select spend::float8 as spend, conversations from clt_ad_period_metrics where creative_id = $1`, [ad])).rows;
    expect(m).toEqual([{ spend: 150, conversations: 12 }]);
  });

  it("recusa idade fora de 13–100, máxima menor que a mínima e raio negativo", async () => {
    const { db, set } = await setup();
    await expect(db.query(`update clt_ad_sets set age_min = 8 where id = $1`, [set])).rejects.toThrow();
    await expect(db.query(`update clt_ad_sets set age_min = 40, age_max = 30 where id = $1`, [set])).rejects.toThrow();
    await expect(db.query(`update clt_ad_sets set radius_km = -1 where id = $1`, [set])).rejects.toThrow();
  });
});
