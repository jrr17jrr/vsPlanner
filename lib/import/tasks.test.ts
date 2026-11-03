import { describe, expect, it } from "vitest";
import {
  parseLooseDate,
  parseTaskImport,
  parseTaskText,
  parseWeekdays,
  ROUTINE_JSON_EXAMPLE,
  ROUTINE_TEXT_EXAMPLE,
  taskJsonExample,
  taskTextExample,
  validateDrafts,
  type ValidationContext,
} from "./tasks";

const TODAY = "2026-11-02";
const companies = [{ id: "sgiv", name: "SGIV" }, { id: "ig", name: "IG Predial" }];
const ctx = (over: Partial<ValidationContext> = {}): ValidationContext => ({ area: "clt", type: "tarefas", companies, existing: [], ...over });

const USER_EXAMPLE = `Empresa: SGIV

Título: Criar públicos personalizados

Prioridade: Importante

Data de execução: 05/11/2026

Prazo final: 08/11/2026

Subtarefas:
- Criar público de engajados 365D
- Criar público semelhante 1%
- Conferir tamanho do público
- Preparar campanha`;

describe("texto — exemplo do pedido", () => {
  const [d] = parseTaskText(USER_EXAMPLE, "tarefas", TODAY);
  it("reconhece todos os campos", () => {
    expect(d).toMatchObject({ kind: "tarefa", title: "Criar públicos personalizados", companyName: "SGIV", priority: "importante", executionDate: "2026-11-05", deadlineDate: "2026-11-08" });
    expect(d.subtasks.map((s) => s.title)).toEqual(["Criar público de engajados 365D", "Criar público semelhante 1%", "Conferir tamanho do público", "Preparar campanha"]);
    expect(d.recognized).toEqual(expect.arrayContaining(["Empresa", "Título", "Prioridade", "Execução", "Prazo final", "Subtarefas"]));
    expect(d.problems).toEqual([]);
  });
  it("valida com a empresa do CLT", () => {
    const [v] = validateDrafts([d], ctx());
    expect(v.valid).toBe(true);
    expect(v.companyId).toBe("sgiv");
    expect(v.issues.some((i) => /prazo final vai nas observações/.test(i.message))).toBe(true);
  });
});

describe("texto — vários blocos, checklist, repetição", () => {
  const drafts = parseTaskText(taskTextExample("clt"), "tarefas", TODAY);
  it("separa por --- e herda a empresa", () => {
    expect(drafts).toHaveLength(2);
    expect(drafts[1]).toMatchObject({ title: "Revisar relatório semanal", companyName: "SGIV", weekdays: [1, 3, 5], time: "09:00" });
  });
  it("subtarefa com prazo e checklist recuado", () => {
    const s = drafts[0].subtasks[1];
    expect(s).toMatchObject({ title: "Criar público semelhante 1%", dueDate: "2026-11-07" });
    expect(s.children.map((c) => c.title)).toEqual(["Conferir país e idade"]);
  });
  it("novo Título abre outro registro mesmo sem ---", () => {
    expect(parseTaskText("Título: A\nTítulo: B", "tarefas", TODAY).map((d) => d.title)).toEqual(["A", "B"]);
  });
  it("linha desconhecida e data inválida viram aviso, nada é inventado", () => {
    const [d] = parseTaskText("Título: X\nCor: azul\nPrazo final: 31/02/2026", "tarefas", TODAY);
    expect(d.deadlineDate).toBeUndefined();
    expect(d.problems).toHaveLength(2);
  });
});

describe("rotinas", () => {
  it("texto: semanal e data única", () => {
    const r = parseTaskImport(ROUTINE_TEXT_EXAMPLE, "rotinas", TODAY);
    expect(r.ok && r.drafts.map((d) => [d.kind, d.title, d.weekdays, d.time, d.endTime, d.executionDate])).toEqual([
      ["rotina", "Academia", [1, 3, 5], "06:30", "07:30", undefined],
      ["rotina", "Consulta médica", [], "15:00", undefined, "2026-11-12"],
    ]);
    const v = validateDrafts(r.ok ? r.drafts : [], ctx({ area: "pessoal", type: "rotinas" }));
    expect(v.every((x) => x.valid)).toBe(true);
  });
  it("JSON de exemplo é válido", () => {
    const r = parseTaskImport(ROUTINE_JSON_EXAMPLE, "rotinas", TODAY);
    expect(r.ok && validateDrafts(r.drafts, ctx({ area: "pessoal", type: "rotinas" })).every((x) => x.valid)).toBe(true);
  });
  it("rotina sem horário ou sem dias é erro; rotina fora do Pessoal é erro", () => {
    const [a] = validateDrafts(parseTaskText("Atividade: Ler", "rotinas", TODAY), ctx({ area: "pessoal", type: "rotinas" }));
    expect(a.issues.filter((i) => i.level === "error").map((i) => i.message)).toEqual(["Rotina precisa do horário de início.", "Rotina precisa dos dias da semana ou de uma data."]);
    const [b] = validateDrafts(parseTaskText("Atividade: Ler\nDias: seg\nInício: 07:00", "rotinas", TODAY), ctx({ area: "clt", type: "rotinas" }));
    expect(b.valid).toBe(false);
  });
});

describe("JSON", () => {
  it("exemplos de tarefas válidos (Pessoal sem empresa, CLT com empresa)", () => {
    for (const area of ["pessoal", "clt", "mkt"] as const) {
      const r = parseTaskImport(taskJsonExample(area), "tarefas", TODAY);
      expect(r.ok).toBe(true);
      const v = validateDrafts(r.ok ? r.drafts : [], ctx({ area }));
      expect(v.every((x) => x.valid)).toBe(true);
    }
  });
  it("formato antigo do Planejamento (items) continua aceito, inclusive campanha planejada", () => {
    const content = JSON.stringify({ items: [
      { area: "clt", title: "Campanha Black Friday", companyName: "IG Predial", plannedDate: "2026-11-20", endsOn: "2026-11-30", dailyBudget: 20, objective: "Mensagens" },
      { area: "clt", title: "Briefing", companyName: "IG Predial", plannedDate: "2026-11-10", subtasks: ["Ligar", { title: "Enviar", dueDate: "2026-11-11", subtasks: ["Revisar"] }], priority: "importante" },
      { area: "pessoal", title: "Pessoal no CLT" },
    ] });
    const r = parseTaskImport(content, "tarefas", TODAY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.drafts.map((d) => d.kind)).toEqual(["campanha", "tarefa", "tarefa"]);
    expect(r.drafts[1].subtasks[1]).toMatchObject({ title: "Enviar", dueDate: "2026-11-11", children: [{ title: "Revisar" }] });
    const v = validateDrafts(r.drafts, ctx());
    expect(v.map((x) => x.valid)).toEqual([true, true, false]);
    expect(v[2].issues[0].message).toMatch(/área "pessoal"/);
  });
  it("JSON de campanhas na área de tarefas é encaminhado", () => {
    const r = parseTaskImport(JSON.stringify({ campanhas: [{ nome: "x" }] }), "tarefas", TODAY);
    expect(!r.ok && r.error).toMatch(/Campanhas/);
  });
  it("JSON inválido e lista vazia", () => {
    expect(parseTaskImport("{oops", "tarefas", TODAY).ok).toBe(false);
    expect(parseTaskImport("[]", "tarefas", TODAY).ok).toBe(false);
  });
});

describe("separação e segurança", () => {
  it("empresa de outro módulo não é aceita (CLT x MKT)", () => {
    const [d] = parseTaskText("Empresa: Semear\nTítulo: X", "tarefas", TODAY);
    const [v] = validateDrafts([d], ctx({ area: "mkt", companies: [{ id: "v", name: "Visionário" }] }));
    expect(v.valid).toBe(false);
    expect(v.issues[0].message).toMatch(/não encontrada em Visionário Dev \/ MKT/);
  });
  it("Pessoal não aceita empresa nem campanha", () => {
    const [v] = validateDrafts(parseTaskText("Empresa: SGIV\nTítulo: X", "tarefas", TODAY), ctx({ area: "pessoal", companies: [] }));
    expect(v.valid).toBe(false);
  });
  it("prazo antes da execução é erro", () => {
    const [v] = validateDrafts(parseTaskText("Título: X\nData de execução: 10/11/2026\nPrazo final: 09/11/2026", "tarefas", TODAY), ctx({ area: "pessoal" }));
    expect(v.issues.map((i) => i.message)).toContain("Prazo final antes da data de execução.");
  });
});

describe("duplicações", () => {
  it("no banco (mesmo título e empresa) e no próprio arquivo", () => {
    const drafts = parseTaskText("Empresa: SGIV\nTítulo: Relatório\n---\nEmpresa: SGIV\nTítulo: relatório\n---\nEmpresa: IG Predial\nTítulo: Relatório\n---\nEmpresa: SGIV\nTítulo: Novo", "tarefas", TODAY);
    const v = validateDrafts(drafts, ctx({ existing: [{ title: "RELATÓRIO", companyId: "ig", kind: "tarefa" }] }));
    expect(v.map((x) => x.duplicate)).toEqual([false, true, true, false]);
    expect(v.every((x) => x.valid)).toBe(true);
  });
});

describe("valores", () => {
  it("datas e dias da semana", () => {
    expect(parseLooseDate("05/11", TODAY)).toBe("2026-11-05");
    expect(parseLooseDate("2026-11-05", TODAY)).toBe("2026-11-05");
    expect(parseLooseDate("31/02/2026", TODAY)).toBeUndefined();
    expect(parseWeekdays("seg, qua e sex")).toEqual([1, 3, 5]);
    expect(parseWeekdays("Terça, Quinta")).toEqual([2, 4]);
    expect(parseWeekdays("dias úteis")).toEqual([1, 2, 3, 4, 5]);
    expect(parseWeekdays(["sáb", 0])).toEqual([0, 6]);
    expect(parseWeekdays("feriado")).toBeUndefined();
  });
});
