import { describe, expect, it } from "vitest";
import { buildProjectView, type ProjectEntry } from "./tiktok-projects";

const e = (id: string, project: string, kind: string, amount: number, entry_date: string, description = id): ProjectEntry => ({ id, project, kind, amount, entry_date, description });
const ENTRIES = [
  e("a", "sofia", "entrada", 300, "2026-11-10", "Comissão TikTok Shop"),
  e("b", "sofia", "saida", 50.5, "2026-11-02", "Assinatura IA"),
  e("c", "sofia", "entrada", 100, "2026-10-20", "Comissão outubro"),
  e("d", "maria", "entrada", 80, "2026-11-05", "Publi"),
];
const base = { project: "sofia" as const, type: "todos" as const, month: "todos", query: "" };

describe("TikTok — Projetos (perfis separados, só dados registrados)", () => {
  it("saldo por perfil nunca mistura Sofia e Maria", () => {
    expect(buildProjectView(ENTRIES, base).balances).toEqual({ sofia: 349.5, maria: 80 });
  });
  it("histórico agrupado por mês (mais recente primeiro) com subtotais", () => {
    const v = buildProjectView(ENTRIES, base);
    expect(v.groups.map((g) => [g.month, g.income, g.expenses, g.entries.map((x) => x.id)])).toEqual([["2026-11", 300, 50.5, ["a", "b"]], ["2026-10", 100, 0, ["c"]]]);
    expect(v.months).toEqual(["2026-11", "2026-10"]);
    expect(v.totals).toEqual({ income: 400, expenses: 50.5, balance: 349.5, count: 3 });
    expect(v.lastDate).toBe("2026-11-10");
    expect(v.filtered).toBe(false);
  });
  it("filtros: tipo, mês e busca (sem acento) mudam indicadores e lista", () => {
    expect(buildProjectView(ENTRIES, { ...base, type: "saida" }).totals).toEqual({ income: 0, expenses: 50.5, balance: -50.5, count: 1 });
    expect(buildProjectView(ENTRIES, { ...base, month: "2026-10" }).totals.count).toBe(1);
    const q = buildProjectView(ENTRIES, { ...base, query: "comissao" });
    expect(q.groups.flatMap((g) => g.entries.map((x) => x.id))).toEqual(["a", "c"]);
    expect(q.filtered).toBe(true);
  });
  it("perfil sem lançamentos: tudo zero, sem inventar dados", () => {
    expect(buildProjectView([], base)).toMatchObject({ groups: [], months: [], lastDate: null, totals: { income: 0, expenses: 0, balance: 0, count: 0 } });
  });
});
