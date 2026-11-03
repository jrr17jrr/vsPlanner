import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CompaniesClient } from "./companies-client";
import { CltModuleProvider } from "./module-context";
import { NAV_GROUPS } from "@/lib/nav";
import type { CltCompany } from "@/types/database.types";

vi.mock("@/lib/supabase/clt-actions", () => ({ saveCltCompanyAction: vi.fn(), adjustCltCompanyBalancesAction: vi.fn() }));

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const company = (id: string, name: string, extra: Partial<CltCompany> = {}): CltCompany => ({
  id, user_id: "u", responsible_id: null, name, email: null, instagram: null, responsible_phone: null, company_phone: null, website: null, notes: null,
  current_ad_balance: 0, is_active: true, created_at: "", updated_at: "", ...extra,
});

describe("Empresas do MKT", () => {
  const companies = [
    company("s", "Semear Comunicação", { module: "mkt", company_kind: "cliente", client_name: "Ponciane" }),
    company("v", "Visionário Dev", { module: "mkt", company_kind: "propria" }),
    company("d", "3D House", { module: "mkt", company_kind: "propria" }),
  ];
  const html = renderToStaticMarkup(<CltModuleProvider module="mkt"><CompaniesClient companies={companies} responsibles={[]} campaigns={[]} results={[]} /></CltModuleProvider>);
  const t = text(html);
  it("mostra Minhas empresas antes de Empresas dos clientes", () => {
    expect(t.indexOf("Minhas empresas")).toBeGreaterThan(-1);
    expect(t.indexOf("Minhas empresas")).toBeLessThan(t.indexOf("Empresas dos clientes"));
    expect(t.indexOf("Visionário Dev")).toBeLessThan(t.indexOf("Empresas dos clientes"));
    expect(t.indexOf("3D House")).toBeLessThan(t.indexOf("Empresas dos clientes"));
    expect(t.indexOf("Semear Comunicação")).toBeGreaterThan(t.indexOf("Empresas dos clientes"));
  });
  it("cliente aparece no lugar do responsável; empresa própria sem cliente inventado", () => {
    expect(t).toContain("Semear Comunicação Ponciane");
    expect(t).toContain("Visionário Dev Empresa própria");
  });
  it("cards completos e links do MKT", () => {
    for (const label of ["Ativas: 0", "Finalizadas: 0", "Mensagens", "Visualizações", "Impressões", "ThruPlays", "Vendas", "Faturamento bruto", "Gasto em anúncios", "Resultado após anúncios", "Saldo atual", "Ver detalhes", "Editar empresa", "Movimentar saldo", "Nova empresa"]) expect(t).toContain(label);
    expect(html).toContain('href="/visionario/mkt/empresas/s"');
    expect(html).not.toContain('href="/trabalho/');
  });
});

describe("Empresas do CLT (sem mudança visual)", () => {
  it("grade única, responsável e links /trabalho", () => {
    const html = renderToStaticMarkup(<CompaniesClient companies={[company("a", "AIV", { responsible_id: "r" })]} responsibles={[{ id: "r", user_id: "u", name: "Ruben Jr", created_at: "" }]} campaigns={[]} results={[]} />);
    const t = text(html);
    expect(t).toContain("AIV Ruben Jr");
    expect(t).not.toContain("Minhas empresas");
    expect(html).toContain('href="/trabalho/empresas/a"');
  });
});

describe("Seguidores do Instagram nos cards", () => {
  // Registro do último dia do mês passado e outro agora → comparação de "Este mês" (filtro padrão).
  const monthStart = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7) + "-01";
  const lastDayPrev = new Date(Date.parse(monthStart + "T12:00:00Z") - 86_400_000).toISOString().slice(0, 10);
  const followers = [
    { id: "f1", company_id: "a", followers: 233, recorded_at: lastDayPrev + "T15:00:00Z" },
    { id: "f2", company_id: "a", followers: 250, recorded_at: new Date().toISOString() },
    { id: "f3", company_id: "b", followers: 80, recorded_at: new Date().toISOString() },
  ];
  const html = renderToStaticMarkup(<CompaniesClient companies={[company("a", "AIV"), company("b", "Beta"), company("c", "Gama")]} responsibles={[]} campaigns={[]} results={[]} followers={followers} />);
  const cards = text(html).split("Editar empresa");

  it("mostra atual, variação e percentual em verde (+17, +7,30%)", () => {
    expect(cards[0]).toContain("Seguidores do Instagram 250 +17 seguidores (+7,30%) · este mês");
    expect(html).toMatch(/text-success[^"]*"[^>]*>.*\+17 seguidores/);
  });
  it("um registro só: sem comparação; sem registros: não informado — sem misturar empresas", () => {
    expect(cards[1]).toContain("Seguidores do Instagram 80 Sem comparação disponível");
    expect(cards[2]).toContain("Seguidores do Instagram Não informado");
    expect(cards[1]).not.toContain("250");
  });
});

describe("menu", () => {
  it("MKT fica logo abaixo de Clientes na Visionário Dev, com as 7 páginas (Planejamento e Importar foram para a Central de Importação)", () => {
    const g = NAV_GROUPS.find(x => x.label === "Visionário Dev")!;
    const labels = g.items.map(i => i.label);
    expect(labels.indexOf("MKT")).toBe(labels.indexOf("Clientes") + 1);
    expect(labels).toEqual(["Visão Geral", "Clientes", "MKT", "Serviços", "Trabalhos", "Reuniões", "Vendedores", "Financeiro", "Sites", "Domínios"]);
    expect(g.items.find(i => i.label === "MKT")!.children!.map(c => c.label)).toEqual(["Visão Geral", "Empresas", "Campanhas", "Análises", "Tarefas", "Rotina", "Relatórios"]);
  });
});
