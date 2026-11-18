import { describe, expect, it } from "vitest";
import { parseTaskText, validateDrafts, sanitizeDraft } from "./tasks";
import { defaultFields, planSummary, planTaskUpdate, type ExistingTask } from "./task-update";

const TODAY = "2026-11-17";
const TEXT = `Título: Fazer posts da Semear
Prioridade: Importante
Descrição: Posts de novembro.
Prazo final: 20/11/2026

Subtarefas:
- Editar post | fazer: 17/11/2026 | prioridade: importante
  - Revisar legenda | importante
  - Exportar vídeo
    - Conferir áudio
- Publicar | prazo: 20/11/2026`;

const target: ExistingTask = { id: "t1", title: "Fazer posts da Semear", companyId: null, recurring: false, values: { description: null, priority: "normal", notes: null, deadlineDate: "2026-11-20" } };
const existingSubs = [
  { id: "s1", title: "Editar post", parent_subtask_id: null },
  { id: "c1", title: "Exportar vídeo", parent_subtask_id: "s1" },
];

describe("leitura: subtarefas com 'fazer no dia', prioridade e níveis", () => {
  const [d] = parseTaskText(TEXT, "tarefas", TODAY);
  it("subtarefa com execução e prioridade próprias; checklist com prioridade", () => {
    expect(d.subtasks[0]).toMatchObject({ title: "Editar post", scheduledDate: "2026-11-17", priority: "importante" });
    expect(d.subtasks[0].children.map((c) => [c.title, c.priority ?? "normal"])).toEqual([["Revisar legenda", "importante"], ["Exportar vídeo", "normal"], ["Conferir áudio", "normal"]]);
  });
  it("3º nível: vira item do checklist COM aviso (nada é descartado em silêncio)", () => {
    expect(d.problems.some((p) => p.includes("Conferir áudio") && p.includes("3º nível"))).toBe(true);
  });
});

describe("Atualizar tarefa existente", () => {
  const [d] = parseTaskText(TEXT, "tarefas", TODAY);
  it("acrescenta só o que é novo: subtarefas e itens de checklist, sem duplicar", () => {
    const p = planTaskUpdate(d, target, existingSubs, undefined);
    expect(p.newSubtasks.map((s) => s.title)).toEqual(["Publicar"]);
    expect(p.newChecklist).toEqual([{ subtaskId: "s1", subtaskTitle: "Editar post", items: [expect.objectContaining({ title: "Revisar legenda" }), expect.objectContaining({ title: "Conferir áudio" })] }]);
    expect(p.existingSubtasks).toEqual(["Editar post"]);
    expect(p.existingChecklist).toEqual(["Editar post › Exportar vídeo"]);
  });
  it("campos: preencher vazio vem marcado; substituir valor exige marcar", () => {
    const p = planTaskUpdate(d, target, existingSubs, undefined);
    expect(p.fieldChanges.map((c) => [c.field, c.overwrite])).toEqual([["description", false], ["priority", true]]);
    expect(defaultFields(p.fieldChanges)).toEqual(["description"]);
    expect(p.chosenChanges.map((c) => c.field)).toEqual(["description"]);
    // Prazo igual ao atual não aparece como mudança.
    expect(p.fieldChanges.some((c) => c.field === "deadlineDate")).toBe(false);
    expect(planTaskUpdate(d, target, existingSubs, ["description", "priority"]).chosenChanges.map((c) => c.after)).toEqual(["Posts de novembro.", "importante"]);
    expect(planTaskUpdate(d, target, existingSubs, []).chosenChanges).toEqual([]);
  });
  it("nada novo → vazio (ignorada, nada gravado)", () => {
    const [same] = parseTaskText("Título: Fazer posts da Semear\nSubtarefas:\n- Editar post", "tarefas", TODAY);
    const p = planTaskUpdate(same, target, existingSubs, []);
    expect(p.empty).toBe(true);
    expect(planSummary(p)).toBe("Nada a acrescentar");
  });
  it("validação: modo atualizar não é duplicado, exige tarefa existente da mesma área/empresa", () => {
    const ctx = { area: "pessoal" as const, type: "tarefas" as const, companies: [], existing: [{ id: "t1", title: "Fazer posts da Semear", companyId: null, kind: "tarefa" as const }] };
    const [asNew] = validateDrafts([d], ctx);
    expect(asNew).toMatchObject({ duplicate: true, matches: ["t1"] });
    const [asUpdate] = validateDrafts([{ ...d, mode: "update", targetId: "t1" }], ctx);
    expect(asUpdate).toMatchObject({ duplicate: false, valid: true });
    const [wrong] = validateDrafts([{ ...d, mode: "update", targetId: "outra" }], ctx);
    expect(wrong.valid).toBe(false);
  });
  it("o servidor reconstrói o rascunho com modo, alvo, campos e prioridade das subtarefas", () => {
    const back = sanitizeDraft(JSON.parse(JSON.stringify({ ...d, mode: "update", targetId: "t1", updateFields: ["priority"] })));
    expect(back).toMatchObject({ mode: "update", targetId: "t1", updateFields: ["priority"] });
    expect(back.subtasks[0]).toMatchObject({ scheduledDate: "2026-11-17", priority: "importante" });
    expect(back.recognized).toContain("Prioridade");
  });
});
