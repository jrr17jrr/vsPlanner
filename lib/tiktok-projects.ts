/**
 * TikTok — Projetos (Sofia IA / TikTok Real — Maria). Regra PURA da tela
 * (lib/tiktok-projects.test.ts): saldo de cada perfil, indicadores conforme
 * os filtros e histórico agrupado por mês. Só usa os lançamentos reais de
 * `tiktok_project_entries` — nenhuma métrica é calculada além de somas.
 */

export type ProjectKey = "sofia" | "maria";
export type ProjectEntry = { id: string; project: string; kind: string; description: string; amount: number | string; entry_date: string };
export type TypeFilter = "todos" | "entrada" | "saida";

export const PROJECTS: Record<ProjectKey, { name: string; short: string; subtitle: string }> = {
  sofia: { name: "Sofia IA", short: "Sofia IA", subtitle: "Conta de inteligência artificial · projeto individual" },
  maria: { name: "TikTok Real — Maria", short: "Maria", subtitle: "Projeto em parceria com sua irmã" },
};

const money = (v: number | string) => Math.round(Number(v) * 100) / 100;
const sum = (rows: ProjectEntry[], kind: "entrada" | "saida") => Math.round(rows.filter((e) => e.kind === kind).reduce((a, e) => a + money(e.amount), 0) * 100) / 100;
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function buildProjectView(entries: ProjectEntry[], f: { project: ProjectKey; type: TypeFilter; month: string; query: string }) {
  const balances = Object.fromEntries((Object.keys(PROJECTS) as ProjectKey[]).map((k) => {
    const own = entries.filter((e) => e.project === k);
    return [k, Math.round((sum(own, "entrada") - sum(own, "saida")) * 100) / 100];
  })) as Record<ProjectKey, number>;
  const own = entries.filter((e) => e.project === f.project);
  const months = [...new Set(own.map((e) => e.entry_date.slice(0, 7)))].sort().reverse();
  const q = norm(f.query.trim());
  const rows = own
    .filter((e) => f.type === "todos" || e.kind === f.type)
    .filter((e) => f.month === "todos" || e.entry_date.startsWith(f.month))
    .filter((e) => !q || norm(e.description).includes(q))
    .sort((a, b) => b.entry_date.localeCompare(a.entry_date) || a.description.localeCompare(b.description, "pt-BR"));
  const groups: Array<{ month: string; income: number; expenses: number; entries: ProjectEntry[] }> = [];
  for (const e of rows) {
    const m = e.entry_date.slice(0, 7);
    let g = groups.find((x) => x.month === m);
    if (!g) { g = { month: m, income: 0, expenses: 0, entries: [] }; groups.push(g); }
    g.entries.push(e);
  }
  for (const g of groups) { g.income = sum(g.entries, "entrada"); g.expenses = sum(g.entries, "saida"); }
  const income = sum(rows, "entrada"), expenses = sum(rows, "saida");
  return {
    balances,
    months,
    groups,
    filtered: f.type !== "todos" || f.month !== "todos" || !!q,
    lastDate: own.map((e) => e.entry_date).sort().at(-1) ?? null,
    totals: { income, expenses, balance: Math.round((income - expenses) * 100) / 100, count: rows.length },
  };
}
