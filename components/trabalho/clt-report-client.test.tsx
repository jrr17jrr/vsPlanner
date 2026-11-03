import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CltReportClient } from "./clt-report-client";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/supabase/clt-report-actions", () => ({ addCltAdAccountMovementAction: vi.fn() }));

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const month = today.slice(0, 7);
const prevMonthDay = new Date(Date.parse(month + "-01T12:00:00Z") - 86_400_000).toISOString().slice(0, 10);
const r = (campaign_id: string, entry_date: string, spent_amount: number, messages: number) => ({ campaign_id, entry_date, spent_amount, generated_revenue: 0, views: 0, impressions: 0, thruplays: 0, messages, sales: 0 });

describe("Relatórios — período padrão (mês atual)", () => {
  const html = renderToStaticMarkup(<CltReportClient
    companies={[{ id: "a", name: "AIV", current_ad_balance: 10 }, { id: "b", name: "Beta", current_ad_balance: 0 }]}
    campaigns={[{ id: "c1", company_id: "a", name: "Msg", starts_on: month + "-01", ends_on: month + "-28", planned_amount: 0 }, { id: "c2", company_id: "b", name: "Outra", starts_on: month + "-01", ends_on: month + "-28", planned_amount: 0 }]}
    results={[r("c1", month + "-01", 120, 12), r("c1", prevMonthDay, 999, 99), r("c2", month + "-01", 40, 0)]}
    movements={[{ company_id: "a", movement_date: month + "-01", kind: "deposito", amount: 300 }]}
    movementError="" comparisons={[]} messaging={[]} followers={[]}
  />);
  const t = text(html);

  it("mostra os quatro tipos de período e a opção de comparar", () => {
    for (const label of ["Mês", "Intervalo de dias", "Intervalo de meses", "Ano", "Comparar com o período anterior"]) expect(t).toContain(label);
  });
  it("prévia só com dados do mês, por empresa, sem misturar", () => {
    expect(t).toContain("Prévia do período");
    expect(t).toMatch(/AIV R\$\s?300,00 R\$\s?0,00 R\$\s?120,00/);
    expect(t).toMatch(/Beta R\$\s?0,00 R\$\s?0,00 R\$\s?40,00/);
    expect(t).not.toContain("999");
  });
  it("sem comparação ligada, não mostra a seção de comparação", () => {
    expect(t).not.toContain("Comparação com o período anterior ");
  });
});
