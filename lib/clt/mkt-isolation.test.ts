import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * Isolamento CLT × MKT com as migrations REAIS num Postgres embutido (PGlite),
 * como o papel `authenticated` com RLS. Nenhum banco de produção é tocado.
 */
const root = join(__dirname, "../..");
const migration = (name: string) => readFileSync(join(root, "supabase/migrations", name), "utf8");
const seed = readFileSync(join(root, "supabase/seeds/20261031_mkt_empresas_iniciais.sql"), "utf8");
const OWNER = "f672e7b6-7a05-41be-8e7a-36a5f1a21acc"; // dono do CLT (migration 014)
const OTHER = "22222222-2222-2222-2222-222222222222";
let db: PGlite;

async function asUser<T>(uid: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try { return await fn(); } finally { await db.exec("reset role;"); }
}
const rows = async <T,>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
    grant usage on schema public to authenticated;
    alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
    create table public.profiles (id uuid primary key references auth.users(id), name text not null);
    create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
    create table public.spaces (id uuid primary key default gen_random_uuid(), slug text not null);
    create table public.clients (id uuid primary key default gen_random_uuid(), space_id uuid not null references public.spaces(id), name text not null);
  `);
  await db.exec(migration("014_clt_traffic_management.sql").split("-- Dados iniciais")[0]);
  await db.exec(migration("015_clt_task_recurrence.sql"));
  await db.exec(migration("025_clt_traffic_management.sql"));
  await db.exec(migration("20261021_campaign_created_in_meta.sql"));
  await db.exec(migration("20261021_planning_items.sql"));
  await db.exec(migration("20261030110000_clt_smart_import.sql"));
  await db.exec(migration("20261031110000_clt_ad_set_result_type.sql"));

  // Estado "produção" antes do MKT: empresas, campanha, tarefas e saldo do CLT.
  await db.exec(`insert into auth.users values ('${OWNER}'), ('${OTHER}'); insert into public.profiles values ('${OWNER}', 'Dono'), ('${OTHER}', 'Outro');`);
  await db.exec(`
    insert into clt_companies (user_id, name, current_ad_balance) values ('${OWNER}', 'SGIV', 150), ('${OWNER}', 'AIV', 80), ('${OWNER}', 'IG Predial', 0);
    insert into clt_campaigns (user_id, company_id, name, starts_on, ends_on, spent_amount, messages) select '${OWNER}', id, 'Campanha SGIV', '2026-10-01', '2026-10-31', 120, 12 from clt_companies where name = 'SGIV';
    insert into clt_tasks (user_id, company_id, title) select '${OWNER}', id, 'Tarefa AIV' from clt_companies where name = 'AIV';
    insert into clt_tasks (user_id, title) values ('${OWNER}', 'Tarefa CLT geral');
  `);
  const sp = (await rows<{ id: string }>(`insert into public.spaces (slug) values ('visionario-dev') returning id`))[0].id;
  await db.exec(`insert into public.clients (space_id, name) values ('${sp}', 'Ponciane Souza'), ('${sp}', 'Outro Cliente');`);

  await db.exec(migration("20261031120000_mkt_module.sql"));
  await db.exec(migration("20261031120000_mkt_module.sql")); // idempotente
}, 60_000);

describe("migration do MKT preserva o CLT", () => {
  it("empresas e tarefas existentes ficam no CLT, com os mesmos saldos", async () => {
    expect(await rows(`select name, module, current_ad_balance::text as saldo from clt_companies order by name`)).toEqual([
      { name: "AIV", module: "clt", saldo: "80.00" }, { name: "IG Predial", module: "clt", saldo: "0.00" }, { name: "SGIV", module: "clt", saldo: "150.00" },
    ]);
    expect(await rows(`select title, module from clt_tasks order by title`)).toEqual([{ title: "Tarefa AIV", module: "clt" }, { title: "Tarefa CLT geral", module: "clt" }]);
    expect(await rows(`select spent_amount::text as gasto, messages from clt_campaigns`)).toEqual([{ gasto: "120.00", messages: 12 }]);
  });
});

describe("cadastro inicial do MKT (seed)", () => {
  it("cria as 3 empresas uma única vez, zeradas, e vincula Ponciane ao cliente existente", async () => {
    await db.exec(seed);
    await db.exec(seed); // idempotente
    const mkt = await rows<{ name: string; company_kind: string; client_name: string | null; linked: boolean; saldo: string }>(
      `select c.name, c.company_kind, c.client_name, (c.client_id is not null and cl.name = 'Ponciane Souza') as linked, c.current_ad_balance::text as saldo
       from clt_companies c left join clients cl on cl.id = c.client_id where c.module = 'mkt' order by c.name`);
    expect(mkt).toEqual([
      { name: "3D House", company_kind: "propria", client_name: null, linked: false, saldo: "0.00" },
      { name: "Semear Comunicação", company_kind: "cliente", client_name: "Ponciane", linked: true, saldo: "0.00" },
      { name: "Visionário Dev", company_kind: "propria", client_name: null, linked: false, saldo: "0.00" },
    ]);
    expect((await rows<{ n: number }>(`select count(*)::int n from clt_campaigns c join clt_companies co on co.id = c.company_id where co.module = 'mkt'`))[0].n).toBe(0);
    expect((await rows<{ n: number }>(`select count(*)::int n from clients`))[0].n).toBe(2); // nenhum cliente criado/alterado
    expect((await rows<{ n: number }>(`select count(*)::int n from clt_companies where module = 'clt'`))[0].n).toBe(3);
  });
});

describe("isolamento no banco", () => {
  const mktId = async (name = "Visionário Dev") => (await rows<{ id: string }>(`select id from clt_companies where module = 'mkt' and name = $1`, [name]))[0].id;
  const cltId = async (name = "AIV") => (await rows<{ id: string }>(`select id from clt_companies where module = 'clt' and name = $1`, [name]))[0].id;

  it("tarefa com empresa sempre fica no módulo da empresa (mesmo se gravada com outro)", async () => {
    const mkt = await mktId();
    const t = await asUser(OWNER, () => db.query<{ module: string }>(`insert into clt_tasks (user_id, company_id, title, module) values ($1, $2, 'Post', 'clt') returning module`, [OWNER, mkt]));
    expect(t.rows[0].module).toBe("mkt");
    const general = await asUser(OWNER, () => db.query<{ module: string }>(`insert into clt_tasks (user_id, title, module) values ($1, 'MKT geral', 'mkt') returning module`, [OWNER]));
    expect(general.rows[0].module).toBe("mkt");
  });

  it("o módulo de uma empresa não pode ser alterado", async () => {
    const id = await cltId();
    await expect(asUser(OWNER, () => db.query(`update clt_companies set module = 'mkt' where id = $1`, [id]))).rejects.toThrow(/módulo/);
  });

  it("mesmo nome pode existir no CLT e no MKT, mas não duplicado no mesmo módulo", async () => {
    await asUser(OWNER, () => db.query(`insert into clt_companies (user_id, name, module, company_kind) values ($1, 'SGIV', 'mkt', 'propria')`, [OWNER]));
    await expect(asUser(OWNER, () => db.query(`insert into clt_companies (user_id, name, module, company_kind) values ($1, 'SGIV', 'mkt', 'propria')`, [OWNER]))).rejects.toThrow();
    await db.exec(`delete from clt_companies where module = 'mkt' and name = 'SGIV'`);
  });

  it("consultas por módulo (as mesmas das telas) não misturam CLT e MKT", async () => {
    const mkt = await mktId("3D House");
    await asUser(OWNER, () => db.query(`insert into clt_campaigns (user_id, company_id, name, starts_on, ends_on, spent_amount, messages) values ($1, $2, 'Campanha 3D', '2026-10-01', '2026-10-31', 50, 5)`, [OWNER, mkt]));
    const scoped = async (module: string) => asUser(OWNER, async () => {
      const ids = (await db.query<{ id: string }>(`select id from clt_companies where user_id = $1 and module = $2`, [OWNER, module])).rows.map(r => r.id);
      return {
        campaigns: (await db.query<{ name: string }>(`select name from clt_campaigns where company_id = any($1::uuid[]) order by name`, [ids])).rows.map(r => r.name),
        tasks: (await db.query<{ title: string }>(`select title from clt_tasks where module = $1 order by title`, [module])).rows.map(r => r.title),
      };
    });
    expect(await scoped("clt")).toEqual({ campaigns: ["Campanha SGIV"], tasks: ["Tarefa AIV", "Tarefa CLT geral"] });
    expect(await scoped("mkt")).toEqual({ campaigns: ["Campanha 3D"], tasks: ["MKT geral", "Post"] });
  });

  it("outro usuário não vê nem altera empresas do MKT (RLS)", async () => {
    const seen = await asUser(OTHER, () => db.query(`select id from clt_companies where module = 'mkt'`));
    expect(seen.rows).toHaveLength(0);
    const mkt = await mktId();
    const upd = await asUser(OTHER, () => db.query(`update clt_companies set current_ad_balance = 999 where id = $1`, [mkt]));
    expect(upd.affectedRows ?? 0).toBe(0);
  });
});

describe("getModuleScope (código das telas)", () => {
  type Row = { id: string; user_id: string; name: string; module?: string; is_active: boolean };
  /** Cliente falso com a mesma cadeia usada por getModuleScope (from/select/eq/order). */
  function fakeClient(data: Row[], hasModuleColumn: boolean) {
    return {
      from: () => {
        const filters: [string, string][] = [];
        const q = {
          select: () => q,
          eq: (col: string, v: string) => { filters.push([col, v]); return q; },
          order: async () => {
            if (!hasModuleColumn && filters.some(([c]) => c === "module")) return { data: null, error: { code: "42703", message: "column clt_companies.module does not exist" } };
            return { data: data.filter(r => filters.every(([c, v]) => (r as Record<string, unknown>)[c] === v)), error: null };
          },
        };
        return q;
      },
    };
  }
  const data: Row[] = [
    { id: "1", user_id: "u", name: "SGIV", module: "clt", is_active: true },
    { id: "2", user_id: "u", name: "3D House", module: "mkt", is_active: true },
  ];
  it("com a migration: cada módulo só vê as suas empresas", async () => {
    const { getModuleScope } = await import("@/lib/supabase/clt-scope");
    expect((await getModuleScope(fakeClient(data, true), "u", "clt")).companyIds).toEqual(["1"]);
    expect((await getModuleScope(fakeClient(data, true), "u", "mkt")).companyIds).toEqual(["2"]);
  });
  it("sem a migration: CLT segue como antes (todas) e MKT fica vazio e marcado como pendente", async () => {
    const { getModuleScope } = await import("@/lib/supabase/clt-scope");
    const legacy = data.map(r => { const c = { ...r }; delete c.module; return c; });
    expect(await getModuleScope(fakeClient(legacy, false), "u", "clt")).toMatchObject({ ready: false, companyIds: ["1", "2"] });
    expect(await getModuleScope(fakeClient(legacy, false), "u", "mkt")).toMatchObject({ ready: false, companyIds: [] });
  });
});
