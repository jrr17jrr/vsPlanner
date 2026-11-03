import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CltReportClient } from "./clt-report-client";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/supabase/clt-report-actions", () => ({ addCltAdAccountMovementAction: vi.fn(), saveCltReportPreferencesAction: vi.fn() }));

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const month = today.slice(0, 7);
const prevMonthDay = new Date(Date.parse(month + "-01T12:00:00Z") - 86_400_000).toISOString().slice(0, 10);
const r = (campaign_id: string, entry_date: string, spent_amount: number, messages: number) => ({ campaign_id, entry_date, spent_amount, generated_revenue: 0, views: 0, impressions: 0, thruplays: 0, messages, sales: 0 });
const render = (preferences?: Record<string, string[]>) => text(renderToStaticMarkup(<CltReportClient
  companies={[{ id: "a", name: "AIV", current_ad_balance: 10 }, { id: "b", name: "Beta", current_ad_balance: 0 }]}
  campaigns={[{ id: "c1", company_id: "a", name: "Msg", starts_on: month + "-01", ends_on: month + "-28", planned_amount: 0 }, { id: "c2", company_id: "b", name: "Outra", starts_on: month + "-01", ends_on: month + "-28", planned_amount: 0 }]}
  results={[{ ...r("c1", month + "-01", 120, 12), impressions: 6000, link_clicks: 40, reactions: 25, ratio: { cpcSpend: 120, cpcClicks: 40, cpmSpend: 120, cpmImpressions: 6000, ctrClicks: 40, ctrImpressions: 6000 } }, r("c1", prevMonthDay, 999, 99), r("c2", month + "-01", 40, 0)]}
  movements={[{ company_id: "a", movement_date: month + "-01", kind: "deposito", amount: 300 }]}
  movementError="" comparisons={[]} messaging={[]} followers={[]} preferences={preferences}
/>));
/** Trecho da prévia de UMA empresa. */
const card = (t: string, name: string, next?: string) => { const s = t.indexOf(`${name} Personalizar (`); return t.slice(s, next ? t.indexOf(`${next} Personalizar (`) : t.indexOf("Resultado após anúncios = ")); };

describe("Relatórios — período padrão (mês atual)", () => {
  const t = render();

  it("mostra os quatro tipos de período, a opção de comparar e o Personalizar relatório", () => {
    for (const label of ["Mês", "Intervalo de dias", "Intervalo de meses", "Ano", "Comparar com o período anterior", "Personalizar relatório"]) expect(t).toContain(label);
  });
  it("prévia só com dados do mês, por empresa, sem misturar (seleção padrão)", () => {
    expect(t).toContain("Prévia do período");
    const aiv = card(t, "AIV", "Beta"), beta = card(t, "Beta");
    expect(aiv).toMatch(/Investimento R\$\s?120,00/);
    expect(aiv).toContain("Conversas 12");
    expect(beta).toMatch(/Investimento R\$\s?40,00/);
    expect(t).not.toContain("999");
    // Fora da seleção padrão: não aparece.
    expect(aiv).not.toContain("Depósitos");
    expect(aiv).not.toContain("CPC");
  });
  it("sem comparação ligada, não mostra valores do período anterior", () => {
    expect(t).not.toContain("Anterior:");
  });
});

describe("Relatórios — seleção salva por empresa", () => {
  const t = render({ a: ["gasto", "deposito", "cpc", "ctr", "cpm", "reactions", "newFollowers"] });
  const aiv = card(t, "AIV", "Beta"), beta = card(t, "Beta");
  it("a empresa mostra só as métricas escolhidas, com CPC/CTR/CPM calculados", () => {
    expect(aiv).toMatch(/Depósitos R\$\s?300,00/);
    expect(aiv).toMatch(/CPC \(custo por clique\) R\$\s?3,00/);
    expect(aiv).toContain("CTR (taxa de cliques) 0,67%");
    expect(aiv).toMatch(/CPM \(custo por mil impressões\) R\$\s?20,00/);
    expect(aiv).toContain("Reações à publicação 25");
    expect(aiv).toContain("Novos seguidores (anúncios) 0");
    expect(aiv).not.toContain("Conversas");
    expect(aiv).toContain("Personalizar (7 item(ns))");
  });
  it("as outras empresas seguem com a própria seleção (padrão)", () => {
    expect(beta).toContain("Conversas 0");
    expect(beta).not.toContain("Depósitos");
  });
});
