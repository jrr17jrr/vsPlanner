import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Criar tarefa CLT/MKT com subtarefas: tudo ou nada. Banco simulado registra
 * cada operação; `failSubtasks` faz o insert em task_subtasks falhar.
 */
type Op = { table: string; op: string; payload?: unknown; filters: Array<[string, unknown]> };
const state = { ops: [] as Op[], failSubtasks: false, nextId: 0 };

function builder(table: string) {
  const op: Op = { table, op: "select", filters: [] };
  const b = {
    select: () => b,
    insert: (payload: unknown) => { op.op = "insert"; op.payload = payload; return b; },
    update: (payload: unknown) => { op.op = "update"; op.payload = payload; return b; },
    delete: () => { op.op = "delete"; return b; },
    eq: (c: string, v: unknown) => { op.filters.push([c, v]); return b; },
    in: (c: string, v: unknown) => { op.filters.push([c, v]); return b; },
    then: (resolve: (v: unknown) => void) => {
      state.ops.push(op);
      if (table === "task_subtasks" && op.op === "insert" && state.failSubtasks) return resolve({ data: null, error: { message: "falha simulada" } });
      if (table === "clt_tasks" && op.op === "insert") {
        const rows = Array.isArray(op.payload) ? op.payload : [op.payload];
        return resolve({ data: rows.map(() => ({ id: `task-${++state.nextId}` })), error: null });
      }
      if (table === "clt_companies") return resolve({ data: [{ id: "c1", module: "clt" }, { id: "c2", module: "clt" }], error: null });
      return resolve({ data: [], error: null });
    },
  };
  return b;
}

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) }, from: builder }),
}));
const { saveCltTaskAction, saveCltTasksBatchAction } = await import("./clt-actions");

const base = { title: "Campanha", kind: "dia" as const, dueDate: "2026-11-10", priority: "normal" as const, recurrence: "none" as const, weekdays: [] };
const sub = (title: string, extra: Record<string, unknown> = {}) => ({ title, description: "", dueDate: "", scheduledDate: "2026-11-10", scheduledTime: null, deadlineTime: null, priority: "normal" as const, reminderOffsets: [], ...extra });

describe("criar tarefa com subtarefas (CLT/MKT)", () => {
  beforeEach(() => { state.ops = []; state.failSubtasks = false; state.nextId = 0; });

  it("grava a tarefa e TODAS as subtarefas num insert só, vinculadas à tarefa", async () => {
    const r = await saveCltTaskAction({ ...base, companyId: "c1", subtasks: [sub("Roteiro"), sub("Gravar")] });
    expect(r).toEqual({ success: "Tarefa cadastrada com 2 subtarefa(s)." });
    const inserts = state.ops.filter((o) => o.table === "task_subtasks" && o.op === "insert");
    expect(inserts).toHaveLength(1);
    expect((inserts[0].payload as Array<Record<string, unknown>>).map((x) => [x.title, x.parent_id, x.parent_type, x.position])).toEqual([["Roteiro", "task-1", "clt", 0], ["Gravar", "task-1", "clt", 1]]);
  });

  it("subtarefa inválida: nada é criado (nem a tarefa)", async () => {
    const r = await saveCltTaskAction({ ...base, subtasks: [sub("Ok"), sub("Ruim", { dueDate: "2026-11-01" })] });
    expect(r.error).toBe("Subtarefa 2: O prazo final não pode ser antes do dia de execução.");
    expect(state.ops.some((o) => o.op === "insert")).toBe(false);
  });

  it("falha ao gravar subtarefas desfaz a tarefa recém-criada", async () => {
    state.failSubtasks = true;
    const r = await saveCltTaskAction({ ...base, subtasks: [sub("Roteiro")] });
    expect(r.error).toMatch(/^Nada foi salvo/);
    const undo = state.ops.find((o) => o.table === "clt_tasks" && o.op === "delete");
    expect(undo?.filters).toEqual([["id", ["task-1"]], ["user_id", "u1"]]);
  });

  it("várias empresas: cada tarefa recebe sua cópia; falha desfaz todas", async () => {
    const ok = await saveCltTasksBatchAction({ ...base, companyIds: ["c1", "c2"], subtasks: [sub("Roteiro")] });
    expect(ok.success).toMatch(/cada uma com 1 subtarefa/);
    const rows = state.ops.find((o) => o.table === "task_subtasks" && o.op === "insert")!.payload as Array<Record<string, unknown>>;
    expect(rows.map((x) => x.parent_id)).toEqual(["task-1", "task-2"]);

    state.ops = []; state.failSubtasks = true;
    const bad = await saveCltTasksBatchAction({ ...base, companyIds: ["c1", "c2"], subtasks: [sub("Roteiro")] });
    expect(bad.error).toMatch(/^Nada foi salvo/);
    expect(state.ops.find((o) => o.table === "clt_tasks" && o.op === "delete")?.filters[0]).toEqual(["id", ["task-3", "task-4"]]);
  });

  it("editar tarefa não cria nem apaga subtarefas", async () => {
    const r = await saveCltTaskAction({ ...base, id: "existente", subtasks: [sub("Ignorada")] });
    expect(r.success).toBe("Tarefa atualizada.");
    expect(state.ops.some((o) => o.table === "task_subtasks")).toBe(false);
    expect(state.ops.some((o) => o.op === "delete")).toBe(false);
  });
});
