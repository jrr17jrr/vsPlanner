import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Fluxo completo da rota do cron, com banco em memória e Web Push simulado:
 * cron → rota → lembretes (estado atual) → trava em push_delivery_log →
 * Web Push só para os aparelhos do dono → registro em push_cron_runs.
 * Horários fixados em UTC; São Paulo = UTC−3.
 */
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const rpcCalls: Array<[string, unknown]> = [];
let vaultToken = "";

const UNIQUE: Record<string, string[]> = { push_delivery_log: ["user_id", "event_key"] };
function query(table: string) {
  const filters: Array<(r: Row) => boolean> = [];
  let op: "select" | "insert" | "update" | "delete" = "select";
  let payload: Row | Row[] | null = null;
  let single = false, returning = false, limit = Infinity;
  const rows = () => (tables[table] ??= []);
  const run = () => {
    if (op === "insert") {
      const list = Array.isArray(payload) ? payload : [payload!];
      for (const r of list) {
        const keys = UNIQUE[table];
        if (keys && rows().some((x) => keys.every((k) => x[k] === r[k]))) return { data: null, error: { code: "23505", message: "duplicate" } };
      }
      const now = new Date().toISOString();
      const inserted = list.map((r) => ({ id: `${table}-${rows().length + 1}`, created_at: now, updated_at: now, ...r }));
      rows().push(...inserted);
      return { data: returning ? inserted : null, error: null };
    }
    const matched = rows().filter((r) => filters.every((f) => f(r)));
    if (op === "update") { matched.forEach((r) => Object.assign(r, payload)); return { data: returning ? matched : null, error: null }; }
    if (op === "delete") { tables[table] = rows().filter((r) => !matched.includes(r)); return { data: null, error: null }; }
    const out = matched.slice(0, limit);
    return { data: single ? out[0] ?? null : out, error: null };
  };
  const b = {
    select: () => { if (op !== "select") returning = true; return b; },
    insert: (p: Row | Row[]) => { op = "insert"; payload = p; return b; },
    update: (p: Row) => { op = "update"; payload = p; return b; },
    delete: () => { op = "delete"; return b; },
    eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return b; },
    neq: (c: string, v: unknown) => { filters.push((r) => r[c] !== v); return b; },
    is: (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return b; },
    in: (c: string, v: unknown[]) => { filters.push((r) => v.includes(r[c])); return b; },
    gte: (c: string, v: string) => { filters.push((r) => r[c] != null && String(r[c]) >= v); return b; },
    lte: (c: string, v: string) => { filters.push((r) => r[c] != null && String(r[c]) <= v); return b; },
    lt: (c: string, v: string) => { filters.push((r) => r[c] != null && String(r[c]) < v); return b; },
    not: (c: string, o: string, v: unknown) => { filters.push((r) => (o === "is" ? (r[c] ?? null) !== v : JSON.stringify(r[c] ?? []) !== JSON.stringify([]))); return b; },
    // Filtro de datas do banco: as regras de data são do motor (testado à parte); aqui passa tudo.
    or: () => b,
    order: () => b,
    limit: (n: number) => { limit = n; return b; },
    maybeSingle: () => { single = true; return b; },
    then: (resolve: (v: unknown) => void) => resolve(run()),
  };
  return b;
}
const fakeDb = {
  from: (t: string) => query(t),
  rpc: async (name: string, args: unknown) => {
    rpcCalls.push([name, args]);
    if (name === "vsplanner_cron_check_token") return { data: (args as { p_token: string }).p_token === vaultToken, error: null };
    if (name === "vsplanner_configure_cron") return { data: { url: "ok", secret: "ok", job: "ok" }, error: null };
    return { data: null, error: { code: "PGRST202", message: "not found" } };
  },
};
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdminClient: () => fakeDb }));
const sendNotification = vi.fn();
vi.mock("web-push", () => ({ default: { setVapidDetails: vi.fn(), sendNotification: (...a: unknown[]) => sendNotification(...a) } }));
let sessionUser: string | null = "user-a";
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: async () => ({ data: { user: sessionUser ? { id: sessionUser } : null } }) } }) }));
const { GET } = await import("./route");
const { GET: STATUS } = await import("../../push/status/route");
const { resetEnsureCache } = await import("@/lib/push/cron-config");

const A = "user-a", B = "user-b";
const SECRET = "segredo-do-cron-1234567890";
const call = (opts: { query?: string; token?: string; headers?: Record<string, string> } = {}) =>
  GET(new Request(`https://app.exemplo.com/api/cron/task-reminders${opts.query ?? ""}`, { headers: { authorization: `Bearer ${opts.token ?? SECRET}`, "x-vsplanner-source": "supabase-cron", ...opts.headers } }));
/** Relógio em horário de São Paulo (UTC−3). */
const at = (spLocal: string) => vi.setSystemTime(new Date(`${spLocal}:00-03:00`));
const task = (over: Row): Row => ({ id: "t1", user_id: A, title: "Beber água", kind: "dia", due_date: "2026-11-04", scheduled_time: "10:23:00", status: "pendente", archived_at: null, recurrence: "none", weekdays: [], recurrence_start: null, recurrence_until: null, reminder_offsets: [], ...over });
const sub = (user: string, endpoint: string) => ({ user_id: user, endpoint, subscription: { endpoint, keys: { p256dh: "k", auth: "a" } }, created_at: "2026-11-01T12:00:00Z" });
const sentTo = () => sendNotification.mock.calls.map((c) => ({ endpoint: (c[0] as { endpoint: string }).endpoint, ...JSON.parse(c[1] as string) }));
const log = () => tables.push_delivery_log ?? [];

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  rpcCalls.length = 0; vaultToken = "";
  sendNotification.mockReset(); sendNotification.mockResolvedValue({ statusCode: 201 });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.stubEnv("CRON_SECRET", SECRET); vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "pub"); vi.stubEnv("VAPID_PRIVATE_KEY", "priv"); vi.stubEnv("VERCEL_ENV", "");
  resetEnsureCache();
  tables.profiles = [{ id: A, notification_preferences: null }, { id: B, notification_preferences: null }];
  tables.push_subscriptions = [sub(A, "https://web.push.apple.com/a-iphone"), sub(B, "https://fcm.googleapis.com/b-android")];
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("rota do cron: autenticação e diagnóstico", () => {
  it("sem token correto → 401 e nada é enviado", async () => {
    tables.tasks = [task({})]; at("2026-11-04T10:23");
    expect((await call({ token: "token-errado-123456789" })).status).toBe(401);
    expect((await GET(new Request("https://app.exemplo.com/api/cron/task-reminders"))).status).toBe(401);
    expect(sendNotification).not.toHaveBeenCalled();
  });
  it("aceita o segredo do Vault (sem CRON_SECRET na Vercel), conferido no banco", async () => {
    vi.stubEnv("CRON_SECRET", ""); vaultToken = "segredo-gerado-pelo-banco-xyz";
    tables.tasks = [task({})]; at("2026-11-04T10:23");
    expect((await call({ token: vaultToken })).status).toBe(200);
    expect(rpcCalls.some(([n]) => n === "vsplanner_cron_check_token")).toBe(true);
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });
  it("?dry=1 mostra o que sairia sem enviar nem travar", async () => {
    tables.tasks = [task({})]; at("2026-11-04T10:23");
    const body = await (await call({ query: "?dry=1" })).json();
    expect(body).toMatchObject({ dryRun: true, due: 1 });
    expect(body.reminders[0].body).toBe("Beber água está programado para hoje às 10:23.");
    expect(sendNotification).not.toHaveBeenCalled();
    expect(log()).toHaveLength(0);
  });
  it("registra a execução (origem, horário, contagens) em push_cron_runs", async () => {
    tables.tasks = [task({})]; at("2026-11-04T10:23");
    await call();
    expect(tables.push_cron_runs).toHaveLength(1);
    expect(tables.push_cron_runs[0]).toMatchObject({ source: "supabase-cron", local_time: "2026-11-04 10:23", due: 1, sent: 1, failed: 0, no_subscription: 0 });
  });
});

describe("lembretes de tarefas e subtarefas chegam como push", () => {
  it("no horário exato (o caso 'Beber água' 10:23) — e só para o dono", async () => {
    tables.tasks = [task({})]; at("2026-11-04T10:23");
    const res = await (await call()).json();
    expect(res).toMatchObject({ due: 1, sent: 1, accepted: 1 });
    expect(sentTo()).toEqual([{ endpoint: "https://web.push.apple.com/a-iphone", title: "VS Planner • Lembrete", body: "Beber água está programado para hoje às 10:23.", url: "/hoje", tag: "task-reminder:tasks:t1:2026-11-04:10:23" }]);
    expect(log()[0]).toMatchObject({ user_id: A, status: "sent", sent_count: 1 });
  });
  it("fuso: 10:23 em São Paulo é 13:23 UTC; às 10:23 UTC (07:23 SP) não sai", async () => {
    tables.tasks = [task({})];
    vi.setSystemTime(new Date("2026-11-04T10:23:00Z"));
    expect((await (await call()).json()).due).toBe(0);
    vi.setSystemTime(new Date("2026-11-04T13:23:00Z"));
    expect((await (await call()).json()).due).toBe(1);
  });
  it("cron atrasado recupera até 15 min; lembrete antigo não é enviado", async () => {
    tables.tasks = [task({})];
    at("2026-11-04T10:35"); expect((await (await call()).json()).sent).toBe(1);
    sendNotification.mockClear(); tables.push_delivery_log = [];
    at("2026-11-04T10:39"); expect((await (await call()).json()).due).toBe(0);
  });
  it("antecipado: 15 min antes", async () => {
    tables.tasks = [task({ scheduled_time: "10:40:00", reminder_offsets: [15] })]; at("2026-11-04T10:25");
    await call();
    expect(sentTo().map((p) => p.body)).toEqual(["Em 15 min: Beber água às 10:40."]);
  });
  it("subtarefa com horário: mensagem com tarefa — subtarefa", async () => {
    tables.tasks = [task({ id: "p1", title: "Saúde", scheduled_time: null })];
    tables.task_subtasks = [{ id: "s1", parent_type: "pessoal", parent_id: "p1", user_id: A, title: "Água", is_done: false, scheduled_date: "2026-11-04", scheduled_time: "09:19:00", due_date: null, deadline_time: null, priority: "normal", reminder_offsets: [] }];
    at("2026-11-04T09:19");
    await call();
    expect(sentTo().map((p) => p.body)).toEqual(["Saúde — Água está programado para hoje às 09:19."]);
  });
  it("prazo final: aviso de véspera no horário do resumo", async () => {
    tables.tasks = [task({ kind: "prazo", due_date: "2026-11-05", scheduled_time: null })]; at("2026-11-04T09:00");
    await call();
    expect(sentTo().map((p) => p.title)).toEqual(["VS Planner • Prazo amanhã"]);
  });
  it("mudança de horário: vale o novo; o antigo não sai", async () => {
    tables.tasks = [task({ scheduled_time: "11:00:00" })]; at("2026-11-04T10:23");
    expect((await (await call()).json()).due).toBe(0);
    at("2026-11-04T11:00");
    expect((await (await call()).json()).sent).toBe(1);
  });
  it("concluída ou excluída: nada é enviado", async () => {
    tables.tasks = [task({ status: "concluida" })]; at("2026-11-04T10:23");
    expect((await (await call()).json()).due).toBe(0);
    tables.tasks = [];
    expect((await (await call()).json()).due).toBe(0);
    expect(sendNotification).not.toHaveBeenCalled();
  });
  it("isolamento: cada lembrete vai só para os aparelhos do seu dono", async () => {
    tables.tasks = [task({}), task({ id: "t2", user_id: B, title: "Tarefa do B" })]; at("2026-11-04T10:23");
    await call();
    const byEndpoint = Object.fromEntries(sentTo().map((p) => [p.endpoint, p.body]));
    expect(byEndpoint).toEqual({ "https://web.push.apple.com/a-iphone": "Beber água está programado para hoje às 10:23.", "https://fcm.googleapis.com/b-android": "Tarefa do B está programado para hoje às 10:23." });
  });
  it("preferências desligadas: não envia", async () => {
    tables.profiles[0].notification_preferences = { enabled: false };
    tables.tasks = [task({})]; at("2026-11-04T10:23");
    expect((await (await call()).json()).due).toBe(0);
  });
});

describe("confiabilidade da entrega", () => {
  it("execução repetida do cron (mesmo minuto e minutos seguintes) não duplica", async () => {
    tables.tasks = [task({})]; at("2026-11-04T10:23");
    await call(); await call();
    at("2026-11-04T10:24"); const third = await (await call()).json();
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(third).toMatchObject({ due: 1, skipped: 1, sent: 0 });
  });
  it("erro temporário (503): registra a falha e tenta de novo na próxima execução", async () => {
    tables.tasks = [task({})]; at("2026-11-04T10:23");
    sendNotification.mockRejectedValueOnce(Object.assign(new Error("Received unexpected response code"), { statusCode: 503, body: "Service Unavailable" }));
    const first = await (await call()).json();
    expect(first).toMatchObject({ failed: 1, sent: 0 });
    expect(log()[0]).toMatchObject({ status: "failed", attempts: 1 });
    expect(String(log()[0].last_error)).toMatch(/^503 · serviço de push indisponível/);
    at("2026-11-04T10:24");
    const second = await (await call()).json();
    expect(second).toMatchObject({ sent: 1, retried: 1 });
    expect(log()[0]).toMatchObject({ status: "sent", attempts: 2 });
  });
  it("para de tentar depois de 3 falhas", async () => {
    tables.tasks = [task({})];
    sendNotification.mockRejectedValue(Object.assign(new Error("x"), { statusCode: 500 }));
    for (const m of ["23", "24", "25", "26"]) { at(`2026-11-04T10:${m}`); await call(); }
    expect(sendNotification).toHaveBeenCalledTimes(3);
    expect(log()[0]).toMatchObject({ status: "failed", attempts: 3 });
  });
  it("inscrição inválida (410): remove a inscrição, registra o motivo; aparelho válido recebe", async () => {
    tables.push_subscriptions.push(sub(A, "https://web.push.apple.com/a-ipad-antigo"));
    sendNotification.mockImplementation(async (s: { endpoint: string }) => { if (s.endpoint.endsWith("antigo")) throw Object.assign(new Error("Gone"), { statusCode: 410 }); return { statusCode: 201 }; });
    tables.tasks = [task({})]; at("2026-11-04T10:23");
    const res = await (await call()).json();
    expect(res).toMatchObject({ sent: 1, accepted: 1, expiredSubscriptions: 1 });
    expect(tables.push_subscriptions.map((s) => s.endpoint)).toEqual(["https://web.push.apple.com/a-iphone", "https://fcm.googleapis.com/b-android"]);
    expect(String(log()[0].last_error)).toMatch(/410 · inscrição expirada/);
    expect(String(log()[0].last_error)).not.toContain("push.apple.com");
  });
  it("sem aparelho inscrito: fica registrado como 'no_subscription'", async () => {
    tables.push_subscriptions = [];
    tables.tasks = [task({})]; at("2026-11-04T10:23");
    expect((await (await call()).json()).noSubscription).toBe(1);
    expect(log()[0]).toMatchObject({ status: "no_subscription" });
  });
  it("envio interrompido ('enviando' há mais de 5 min) é retomado uma vez", async () => {
    tables.tasks = [task({})]; at("2026-11-04T10:30");
    tables.push_delivery_log = [{ user_id: A, event_key: "task-reminder:tasks:t1:2026-11-04:10:23", status: "sending", attempts: 1, updated_at: "2026-11-04T13:23:30Z" }];
    const res = await (await call()).json();
    expect(res).toMatchObject({ retried: 1, sent: 1 });
    // 'enviando' recente (outro processo agora): não mexe.
    tables.push_delivery_log = [{ user_id: A, event_key: "task-reminder:tasks:t1:2026-11-04:10:23", status: "sending", attempts: 1, updated_at: new Date().toISOString() }];
    sendNotification.mockClear();
    expect((await (await call()).json()).skipped).toBe(1);
    expect(sendNotification).not.toHaveBeenCalled();
  });
});

describe("diagnóstico do usuário (/api/push/status)", () => {
  const status = async () => (await STATUS(new Request("https://app.exemplo.com/api/push/status"))).json();
  it("exige login", async () => {
    sessionUser = null;
    expect((await STATUS(new Request("https://app.exemplo.com/api/push/status"))).status).toBe(401);
    sessionUser = A;
  });
  it("mostra próximos lembretes, aparelhos e envios SÓ do usuário, sem endpoints", async () => {
    tables.tasks = [task({}), task({ id: "t2", user_id: B, title: "Segredo do B" })];
    tables.push_delivery_log = [{ user_id: A, event_key: "k-a", status: "sent", attempts: 1, sent_count: 1, created_at: "2026-11-03T10:00:00Z" }, { user_id: B, event_key: "k-b", status: "failed", attempts: 1, sent_count: 0, created_at: "2026-11-03T10:00:00Z" }];
    at("2026-11-04T10:00");
    const s = await status();
    expect(s.upcoming).toEqual([{ at: "2026-11-04T10:23", title: "VS Planner • Lembrete", body: "Beber água está programado para hoje às 10:23." }]);
    expect(s.devices).toEqual([{ service: "Apple (iPhone/iPad/Mac)", createdAt: expect.any(String) }]);
    expect(s.deliveries.map((d: Row) => d.event_key)).toEqual(["k-a"]);
    const json = JSON.stringify(s);
    expect(json).not.toContain("Segredo do B");
    expect(json).not.toContain("a-iphone");
    expect(sendNotification).not.toHaveBeenCalled();
  });
  it("inclui lembretes do Trabalho/CLT (no horário) do dia", async () => {
    tables.clt_tasks = [{ id: "c1", user_id: A, title: "Conferir campanha", due_date: "2026-11-04", scheduled_time: "15:00:00", status: "pendente", archived_at: null, recurrence: "none", module: "clt" }];
    at("2026-11-04T10:00");
    expect((await status()).upcoming).toEqual([{ at: "2026-11-04T15:00", title: "VS Planner • Lembrete de tarefa", body: "15:00 · Conferir campanha" }]);
  });
});

describe("autoconfiguração do agendador", () => {
  it("em produção, cada chamada garante URL/segredo no Vault (no máximo a cada 10 min)", async () => {
    vi.stubEnv("VERCEL_ENV", "production"); vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "vsplanner.exemplo.com");
    at("2026-11-04T10:23");
    await call(); await call();
    const configure = rpcCalls.filter(([n]) => n === "vsplanner_configure_cron");
    expect(configure).toEqual([["vsplanner_configure_cron", { p_url: "https://vsplanner.exemplo.com", p_secret: SECRET }]]);
  });
  it("preview/local nunca reconfiguram", async () => {
    vi.stubEnv("VERCEL_ENV", "preview"); vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "vsplanner.exemplo.com");
    at("2026-11-04T10:23"); await call();
    expect(rpcCalls.some(([n]) => n === "vsplanner_configure_cron")).toBe(false);
  });
});
