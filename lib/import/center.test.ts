import { describe, expect, it } from "vitest";
import { availableAreas, parseImportSelection, TYPES_BY_AREA } from "./center";
import { sanitizeDraft, validateDrafts } from "./tasks";

describe("Central de Importação — áreas e tipos", () => {
  it("só áreas autorizadas", () => {
    expect(availableAreas({ clt: false, mkt: false })).toEqual(["pessoal"]);
    expect(availableAreas({ clt: true, mkt: true })).toEqual(["pessoal", "clt", "mkt"]);
    expect(availableAreas({ clt: false, mkt: true })).toEqual(["pessoal", "mkt"]);
  });
  it("tipos compatíveis com cada área (nada de financeiro)", () => {
    expect(TYPES_BY_AREA.pessoal).toEqual(["tarefas", "rotinas"]);
    expect(TYPES_BY_AREA.clt).toEqual(["tarefas", "campanhas", "publicos", "resultados"]);
    expect(Object.values(TYPES_BY_AREA).flat().some((t) => /receita|despesa|financ/.test(t))).toBe(false);
  });
  it("links antigos levam à área certa; área sem permissão é ignorada", () => {
    expect(parseImportSelection({ area: "clt", tipo: "campanhas" }, { clt: true, mkt: true })).toEqual({ area: "clt", type: "campanhas" });
    expect(parseImportSelection({ area: "mkt", tipo: "campanhas" }, { clt: true, mkt: false })).toEqual({ area: null, type: null });
    expect(parseImportSelection({ area: "pessoal", tipo: "campanhas" }, { clt: true, mkt: true })).toEqual({ area: "pessoal", type: null });
    expect(parseImportSelection({}, { clt: true, mkt: true })).toEqual({ area: null, type: null });
  });
});

describe("servidor não confia no navegador", () => {
  it("sanitizeDraft descarta formatos inválidos e a validação acusa", () => {
    const d = sanitizeDraft({ kind: "hack", title: "  X  ", executionDate: "05/11/2026", deadlineDate: "2026-02-30", time: "25:00", weekdays: [1, 9, "2"], priority: "urgente", subtasks: [{ title: "" }, { title: "ok", children: [{ title: "c" }] }], dailyBudget: -5 });
    expect(d).toMatchObject({ kind: "tarefa", title: "X", executionDate: undefined, deadlineDate: undefined, time: undefined, weekdays: [1], priority: "normal", dailyBudget: undefined });
    expect(d.subtasks).toEqual([{ title: "ok", dueDate: undefined, description: undefined, children: [{ title: "c", dueDate: undefined, description: undefined }] }]);
  });
  it("área de origem adulterada continua bloqueada", () => {
    const d = sanitizeDraft({ kind: "tarefa", title: "Y", sourceArea: "pessoal" });
    expect(validateDrafts([d], { area: "clt", type: "tarefas", companies: [], existing: [] })[0].valid).toBe(false);
  });
});
