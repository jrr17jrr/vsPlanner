import { describe, expect, it } from "vitest";
import { activeGroupId, flattenNav, isNavActive, navPathLabel, NAV_GROUPS, searchNav, submenuContains, visibleGlobalItems, visibleNavGroups, type NavAccess } from "./nav";
import { areaFromPath, quickCreateOptions, suggestDestination } from "./quick-create";

const full: NavAccess = {
  canAccessVisionario: true,
  canAccessTiktok: true,
  canAccessClt: true,
  visionarioModulePermissions: { visao_geral: true, clientes: true, servicos: true, trabalhos: true, reunioes: true, vendedores: true, financeiro: true, sites: true },
  tiktokModulePermissions: { financeiro: true },
  isSuperAdmin: true,
};
const pessoal: NavAccess = { canAccessVisionario: false, canAccessTiktok: false, canAccessClt: false, visionarioModulePermissions: {}, tiktokModulePermissions: {}, isSuperAdmin: false };
const semFinanceiro: NavAccess = { ...full, isSuperAdmin: false, visionarioModulePermissions: { ...full.visionarioModulePermissions, financeiro: false }, tiktokModulePermissions: {} };

describe("estrutura do menu", () => {
  it("grupos na ordem pedida, sem Planejamento/Importar", () => {
    expect(NAV_GROUPS.map((g) => g.label)).toEqual(["Minha Vida", "Financeiro Pessoal", "Visionário Dev", "Trabalho / CLT", "TikTok"]);
    expect(NAV_GROUPS[0].items.map((i) => i.label)).toEqual(["Meu Dia", "Minha Rotina", "Tarefas", "Histórico"]);
    const all = NAV_GROUPS.flatMap((g) => g.items.flatMap((i) => [i, ...(i.children ?? [])]));
    expect(all.some((i) => /planejamento|importar/i.test(i.href))).toBe(false);
    expect(NAV_GROUPS.find((g) => g.id === "clt")!.items.map((i) => i.label)).toEqual(["Visão Geral", "Empresas", "Campanhas", "Análises", "Tarefas", "Rotina", "Relatórios"]);
    expect(NAV_GROUPS.find((g) => g.id === "tiktok")!.items.map((i) => i.label)).toEqual(["Visão Geral", "Sofia IA / Maria", "Financeiro"]);
  });
  it("itens globais: Central de Importação, Configurações e Painel Dev só para admin", () => {
    expect(visibleGlobalItems(full).map((i) => i.label)).toEqual(["Central de Importação", "Configurações", "Painel Dev"]);
    expect(visibleGlobalItems(pessoal).map((i) => i.label)).toEqual(["Central de Importação", "Configurações"]);
  });
});

describe("permissões", () => {
  it("sem acesso: só Minha Vida e Financeiro Pessoal", () => {
    expect(visibleNavGroups(pessoal).map((g) => g.id)).toEqual(["minha-vida", "financeiro-pessoal"]);
  });
  it("sem o módulo financeiro: some o Financeiro da Visionário e o TikTok inteiro", () => {
    const groups = visibleNavGroups(semFinanceiro);
    expect(groups.find((g) => g.id === "visionario")!.items.some((i) => i.label === "Financeiro")).toBe(false);
    expect(groups.some((g) => g.id === "tiktok")).toBe(false);
  });
  it("CLT depende do acesso ao CLT (antes a busca não checava)", () => {
    expect(visibleNavGroups({ ...full, canAccessClt: false }).some((g) => g.id === "clt")).toBe(false);
    expect(flattenNav({ ...full, canAccessClt: false }).some((e) => e.href.startsWith("/trabalho"))).toBe(false);
  });
});

describe("página ativa e grupo aberto", () => {
  const groups = visibleNavGroups(full);
  it("abre o grupo certo", () => {
    expect(activeGroupId("/hoje", groups)).toBe("minha-vida");
    expect(activeGroupId("/visionario", groups)).toBe("visionario");
    expect(activeGroupId("/visionario/mkt/campanhas", groups)).toBe("visionario");
    expect(activeGroupId("/trabalho/empresas/abc", groups)).toBe("clt");
    expect(activeGroupId("/financeiro", groups)).toBe("financeiro-pessoal");
    expect(activeGroupId("/tiktok/projetos", groups)).toBe("tiktok");
    expect(activeGroupId("/configuracoes", groups)).toBeNull();
  });
  it("Visão Geral é exata; subpáginas destacam o item certo", () => {
    expect(isNavActive("/visionario/clientes", { href: "/visionario", exact: true })).toBe(false);
    expect(isNavActive("/visionario/clientes/1", { href: "/visionario/clientes" })).toBe(true);
    expect(isNavActive("/", { href: "/" })).toBe(true);
    expect(isNavActive("/hoje", { href: "/" })).toBe(false);
  });
  it("submenu MKT abre dentro das páginas do MKT", () => {
    const mkt = groups.find((g) => g.id === "visionario")!.items.find((i) => i.label === "MKT")!;
    expect(submenuContains("/visionario/mkt/tarefas", mkt)).toBe(true);
    expect(submenuContains("/visionario/clientes", mkt)).toBe(false);
  });
});

describe("busca no menu", () => {
  const entries = flattenNav(full);
  it("'Campanhas' mostra CLT e MKT com o caminho completo", () => {
    const r = searchNav(entries, "Campanhas").map(navPathLabel);
    expect(r).toEqual(expect.arrayContaining(["Trabalho / CLT → Campanhas", "Visionário Dev → MKT → Campanhas"]));
    expect(r).toHaveLength(2);
  });
  it("sem acento e sem caixa; também pelo caminho", () => {
    expect(searchNav(entries, "reunioes").map((e) => e.href)).toEqual(["/visionario/reunioes"]);
    expect(searchNav(entries, "mkt tarefas").map((e) => e.href)).toEqual(["/visionario/mkt/tarefas"]);
    expect(searchNav(entries, "importa").map((e) => e.href)).toEqual(["/importar"]);
  });
  it("não mostra páginas sem permissão; vazio sem resultado", () => {
    const limited = flattenNav(semFinanceiro);
    // Só sobra o Financeiro Pessoal (pelo caminho); nada da Visionário/TikTok.
    expect(searchNav(limited, "Financeiro").map((e) => e.href)).toEqual(["/financeiro", "/metas"]);
    expect(searchNav(entries, "Financeiro").map((e) => e.href).slice(0, 2).sort()).toEqual(["/tiktok/financeiro", "/visionario/financeiro"]);
    expect(searchNav(flattenNav(pessoal), "Painel")).toEqual([]);
    expect(searchNav(entries, "xyzxyz")).toEqual([]);
    expect(searchNav(entries, "   ")).toEqual([]);
  });
});

describe("+ Novo", () => {
  it("8 opções com acesso total; só as pessoais sem acesso", () => {
    expect(quickCreateOptions(full).map((o) => o.label)).toEqual(["Nova tarefa", "Nova atividade da rotina", "Nova campanha", "Novo cliente", "Nova receita", "Nova despesa", "Nova reunião", "Novo serviço"]);
    const p = quickCreateOptions(pessoal);
    expect(p.map((o) => o.kind)).toEqual(["tarefa", "atividade", "receita", "despesa"]);
    expect(p.every((o) => o.destinations.every((d) => d.area === "pessoal"))).toBe(true);
  });
  it("financeiros separados e por permissão", () => {
    const receita = quickCreateOptions(semFinanceiro).find((o) => o.kind === "receita")!;
    expect(receita.destinations.map((d) => d.href)).toEqual(["/financeiro?novo=receita"]);
  });
  it("sugere a área atual e permite trocar", () => {
    const tarefa = quickCreateOptions(full).find((o) => o.kind === "tarefa")!;
    expect(suggestDestination(tarefa, "/trabalho/campanhas").href).toBe("/trabalho/tarefas?novo=tarefa");
    expect(suggestDestination(tarefa, "/visionario/mkt/empresas").href).toBe("/visionario/mkt/tarefas?novo=tarefa");
    expect(suggestDestination(tarefa, "/visionario/clientes").href).toBe("/visionario/trabalhos?novo=tarefa");
    expect(suggestDestination(tarefa, "/hoje").area).toBe("pessoal");
    const campanha = quickCreateOptions(full).find((o) => o.kind === "campanha")!;
    expect(suggestDestination(campanha, "/visionario/clientes").area).toBe("mkt");
    expect(suggestDestination(campanha, "/hoje").area).toBe("clt");
    expect(areaFromPath("/tiktok/financeiro")).toBe("tiktok");
  });
});
